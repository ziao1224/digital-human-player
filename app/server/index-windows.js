/**
 * Windows 专用版本 - PPT 转图片服务
 * 方案：PPTX → PDF → 多张 PNG 图片
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3001;

// 服务器会话ID（每次重启都会变化）
const SERVER_SESSION = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
console.log('[Server] Session ID:', SERVER_SESSION);

// 中间件
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// 火山语音代理（解决 CORS）
const volcanoProxy = require('./volcano-proxy');
app.use('/api/volcano', volcanoProxy);

// RTC 级联语音对话路由 (StartVoiceChat)
const { registerRTCVoiceChatRoutes } = require('./rtc-voice-chat');
registerRTCVoiceChatRoutes(app);

// 端到端实时语音大模型 WebSocket 代理
const { RealtimeProxy } = require('./realtime-proxy');
const realtimeProxy = new RealtimeProxy();

// 确保目录存在
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const IMAGES_DIR = path.join(__dirname, 'images');

[UPLOAD_DIR, IMAGES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// LibreOffice 路径
const LIBREOFFICE_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files\\LibreOffice 7\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice 7\\program\\soffice.exe',
];

function findLibreOffice() {
  for (const p of LIBREOFFICE_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

const sofficePath = findLibreOffice();

// 配置 multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.pptx')) {
      cb(null, true);
    } else {
      cb(new Error('只支持 .pptx 格式的文件'));
    }
  },
  limits: { fileSize: 200 * 1024 * 1024 }
});

/**
 * 从 PPTX 中提取文本
 */
async function extractFromPPTX(pptxPath) {
  const zip = new AdmZip(pptxPath);
  const entries = zip.getEntries();
  
  const slides = [];
  const slideFiles = {};
  const notesFiles = {};
  
  for (const entry of entries) {
    const name = entry.entryName;
    
    const slideMatch = name.match(/ppt\/slides\/slide(\d+)\.xml/);
    if (slideMatch) {
      slideFiles[parseInt(slideMatch[1])] = entry;
      continue;
    }
    
    const notesMatch = name.match(/ppt\/notesSlides\/notesSlide(\d+)\.xml/);
    if (notesMatch) {
      notesFiles[parseInt(notesMatch[1])] = entry;
    }
  }
  
  const slideNumbers = Object.keys(slideFiles).map(Number).sort((a, b) => a - b);
  
  for (const num of slideNumbers) {
    const slideEntry = slideFiles[num];
    const slideXml = slideEntry.getData().toString('utf8');
    
    const textMatches = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const texts = textMatches
      .map(match => match.replace(/<\/?a:t>/g, ''))
      .filter(text => text.trim());
    
    let title = `幻灯片 ${num}`;
    let content = texts.join('\n');
    
    if (texts.length > 0) {
      const titleCandidate = texts.find(t => t.length > 0 && t.length < 50);
      if (titleCandidate) {
        title = titleCandidate;
        content = texts.slice(texts.indexOf(titleCandidate) + 1).join('\n');
      }
    }
    
    let notes = '';
    if (notesFiles[num]) {
      const notesXml = notesFiles[num].getData().toString('utf8');
      const notesMatches = notesXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
      const notesTexts = notesMatches
        .map(match => match.replace(/<\/?a:t>/g, ''))
        .filter(text => text.trim());
      notes = notesTexts.slice(1).join('\n');
    }
    
    slides.push({
      id: num,
      title,
      content,
      notes
    });
  }
  
  return { slides };
}

/**
 * 使用 LibreOffice 将 PPTX 转换为图片
 * 方案：先转 PDF，再使用 pdftoppm 或 ImageMagick 转图片
 */
async function convertPPTXtoImages(pptxPath, outputDir, fileId) {
  if (!sofficePath) {
    throw new Error('未找到 LibreOffice');
  }

  // 先清理可能存在的旧文件
  const existingFiles = fs.readdirSync(outputDir).filter(f => f.startsWith(fileId) && f.endsWith('.png'));
  for (const f of existingFiles) {
    try {
      fs.unlinkSync(path.join(outputDir, f));
    } catch (e) {}
  }

  // 第一步：转换为 PDF
  const pdfDir = path.join(__dirname, 'pdfs');
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    // 先转 PDF
    const args = [
      '--headless',
      '--convert-to', 'pdf',
      '--outdir', pdfDir,
      pptxPath
    ];

    console.log('转换图片:', path.basename(pptxPath));

    const child = spawn(sofficePath, args, {
      windowsHide: true,
      timeout: 300000 // 5分钟超时
    });

    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error('PDF 转换失败'));
        return;
      }

      try {
        const baseName = path.basename(pptxPath, '.pptx');
        const pdfPath = path.join(pdfDir, `${baseName}.pdf`);
        
        if (!fs.existsSync(pdfPath)) {
          reject(new Error('PDF 文件未生成'));
          return;
        }

        console.log('PDF 生成成功，开始转换为图片...');

        // 第二步：将 PDF 转换为图片
        const images = await convertPDFtoImages(pdfPath, outputDir, fileId);
        resolve(images);
        
      } catch (err) {
        reject(err);
      }
    });

    child.on('error', (err) => {
      reject(new Error(`启动 LibreOffice 失败: ${err.message}`));
    });
  });
}

/**
 * 将 PDF 转换为多张图片
 * 使用 pdftoppm (Poppler) 或 ImageMagick
 */
async function convertPDFtoImages(pdfPath, outputDir, fileId) {
  const baseName = path.basename(pdfPath, '.pdf');
  
  // 方案1: 尝试使用 pdftoppm (效果更好)
  try {
    await new Promise((resolve, reject) => {
      // pdftoppm -png -r 150 input.pdf output_prefix
      const outputPrefix = path.join(outputDir, `${fileId}_`);
      const child = spawn('pdftoppm', [
        '-png',
        '-r', '150',
        pdfPath,
        outputPrefix
      ], { windowsHide: true, timeout: 120000 });

      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data.toString(); });
      
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`pdftoppm 失败: ${stderr}`));
          return;
        }
        resolve();
      });
    });

    // 重命名生成的文件
    const files = fs.readdirSync(outputDir);
    const imageFiles = files
      .filter(f => f.startsWith(`${fileId}_`) && f.endsWith('.png'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/_(\d+)\.png$/)?.[1] || '0');
        const numB = parseInt(b.match(/_(\d+)\.png$/)?.[1] || '0');
        return numA - numB;
      });

    if (imageFiles.length === 0) {
      throw new Error('pdftoppm 未生成图片');
    }

    // 重命名为连续编号
    const images = imageFiles.map((f, i) => {
      const oldPath = path.join(outputDir, f);
      const newName = `${fileId}_${i + 1}.png`;
      const newPath = path.join(outputDir, newName);
      
      if (oldPath !== newPath && fs.existsSync(oldPath)) {
        try {
          fs.renameSync(oldPath, newPath);
        } catch (e) {
          console.error('重命名失败:', e);
        }
      }
      
      return {
        page: i + 1,
        url: `/api/images/${newName}`,
        slideId: i + 1
      };
    });

    console.log(`✓ pdftoppm 成功生成 ${images.length} 张图片`);
    return images;
    
  } catch (pdftoppmError) {
    console.log('pdftoppm 不可用，尝试 ImageMagick...');
    
    // 方案2: 使用 ImageMagick
    return new Promise((resolve, reject) => {
      const outputPattern = path.join(outputDir, `${fileId}_%d.png`);
      const child = spawn('convert', [
        '-density', '150',
        '-quality', '90',
        pdfPath,
        outputPattern
      ], { windowsHide: true, timeout: 300000 });

      let stderr = '';
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ImageMagick 失败: ${stderr}`));
          return;
        }

        // 获取生成的图片列表
        const files = fs.readdirSync(outputDir);
        const imageFiles = files
          .filter(f => f.startsWith(`${fileId}_`) && f.endsWith('.png'))
          .sort((a, b) => {
            const numA = parseInt(a.match(/_(\d+)\.png$/)?.[1] || '0');
            const numB = parseInt(b.match(/_(\d+)\.png$/)?.[1] || '0');
            return numA - numB;
          });

        if (imageFiles.length === 0) {
          reject(new Error('未生成任何图片'));
          return;
        }

        const images = imageFiles.map((f, i) => ({
          page: i + 1,
          url: `/api/images/${f}`,
          slideId: i + 1
        }));

        console.log(`✓ ImageMagick 成功生成 ${images.length} 张图片`);
        resolve(images);
      });
    });
  }
}

/**
 * API: 上传 PPT 并转换为图片
 */
app.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' });
    }

    const pptxPath = req.file.path;
    const fileId = path.basename(req.file.filename, '.pptx');

    console.log(`\n处理文件: ${req.file.originalname}`);

    // 1. 提取文本 + 计算内容哈希
    const { slides } = await extractFromPPTX(pptxPath);
    console.log(`✓ 提取到 ${slides.length} 页内容`);

    const contentHash = crypto.createHash('md5')
      .update(slides.map(s => `${s.title || ''}:${s.content || ''}`).join('|'))
      .digest('hex').substring(0, 16);

    // 2. 检查是否已有此PPT的缓存图片
    let images = [];
    const cachedScripts = pptFolderCache.getScripts(contentHash);
    if (cachedScripts?.images && cachedScripts.images.length > 0) {
      // 验证第一张图片文件确实存在，不存在则重新生成
      const firstUrl = cachedScripts.images[0]?.url;
      const firstFile = firstUrl ? path.join(IMAGES_DIR, path.basename(firstUrl)) : '';
      if (firstFile && fs.existsSync(firstFile)) {
        images = cachedScripts.images;
        console.log(`✓ 复用缓存图片: ${images.length} 页 (跳过LibreOffice转换)`);
      } else {
        console.log(`⚠ 缓存图片文件不存在，将重新转换`);
        cachedScripts.images = null; // 标记失效
      }
    }
    if (images.length === 0 && sofficePath) {
      try {
        images = await convertPPTXtoImages(pptxPath, IMAGES_DIR, fileId);
      } catch (imgError) {
        console.error('图片转换失败:', imgError.message);
      }
    }

    // 3. 返回结果
    res.json({
      success: true,
      fileId,
      contentHash,
      originalName: req.file.originalname,
      slideCount: slides.length,
      slides,
      images,
      hasImages: images.length > 0,
      message: images.length > 0
        ? (cachedScripts?.images?.length ? '从缓存加载图片' : `成功转换，生成 ${images.length} 页图片`)
        : '文本提取成功，图片转换失败'
    });
    
  } catch (error) {
    console.error('处理错误:', error);
    res.status(500).json({ 
      error: '处理失败', 
      message: error.message 
    });
  }
});

/**
 * API: 获取图片
 */
app.get('/api/images/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(IMAGES_DIR, filename);
  
  if (!imagePath.startsWith(IMAGES_DIR)) {
    return res.status(403).json({ error: '访问被拒绝' });
  }
  
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: '图片不存在' });
  }
  
  res.setHeader('Content-Type', 'image/png');
  fs.createReadStream(imagePath).pipe(res);
});

/**
 * API: 获取 PPT 内容
 */
app.get('/api/slides/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    const files = fs.readdirSync(UPLOAD_DIR);
    const pptxFile = files.find(f => f.startsWith(fileId) && f.endsWith('.pptx'));
    
    if (!pptxFile) {
      return res.status(404).json({ error: '文件不存在或已过期' });
    }
    
    const pptxPath = path.join(UPLOAD_DIR, pptxFile);
    const { slides } = await extractFromPPTX(pptxPath);
    
    res.json({
      fileId,
      slides,
      fullText: slides.map((s, i) => 
        `【第${i + 1}页】${s.title}\n${s.content}${s.notes ? '\n备注：' + s.notes : ''}`
      ).join('\n\n---\n\n')
    });
    
  } catch (error) {
    res.status(500).json({ error: '获取失败', message: error.message });
  }
});

/**
 * API: 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    libreOffice: sofficePath ? '已安装' : '未安装',
    libreOfficePath: sofficePath
  });
});

/**
 * API: 获取服务器会话ID（用于检测服务器是否重启）
 */
app.get('/api/server-session', (req, res) => {
  res.json({ sessionId: SERVER_SESSION });
});

// ==================== 视频缓存 API ====================
const videoCache = require('./services/video-cache.service');

/**
 * API: 检查视频缓存状态
 */
app.post('/api/cache/check', express.json(), (req, res) => {
  const { pptHash, slideCount } = req.body;
  if (!pptHash || slideCount === undefined) {
    return res.status(400).json({ error: '缺少参数' });
  }
  
  const status = videoCache.getPPTCacheStatus(pptHash, slideCount);
  res.json(status);
});

/**
 * API: 获取缓存的视频文件
 */
app.get('/api/cache/video/:pptHash/:slideIndex', (req, res) => {
  const { pptHash, slideIndex } = req.params;
  const stream = videoCache.getVideoStream(pptHash, parseInt(slideIndex));
  
  if (!stream) {
    return res.status(404).json({ error: '视频不存在' });
  }
  
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  stream.pipe(res);
});

/**
 * API: 保存视频到缓存（供数字人服务调用）
 */
app.post('/api/cache/save', express.raw({ type: 'video/mp4', limit: '100mb' }), async (req, res) => {
  const { pptHash, slideIndex } = req.query;
  if (!pptHash || slideIndex === undefined) {
    return res.status(400).json({ error: '缺少参数' });
  }
  
  try {
    const result = await videoCache.saveVideo(pptHash, parseInt(slideIndex), req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: '保存失败', message: error.message });
  }
});

/**
 * API: 获取缓存统计
 */
app.get('/api/cache/stats', (req, res) => {
  res.json(videoCache.getCacheStats());
});

/**
 * API: 重建缓存元数据（扫描目录）
 */
app.post('/api/cache/rebuild', (req, res) => {
  const stats = videoCache.rebuildMetadata();
  res.json({ success: true, message: '旧版视频缓存元数据已重建', stats });
});

/**
 * API: 清理缓存
 */
app.post('/api/cache/clear', express.json(), (req, res) => {
  const { pptHash } = req.body;
  if (pptHash) {
    const deleted = videoCache.clearPPTCache(pptHash);
    res.json({ success: true, deleted });
  } else {
    const deleted = videoCache.clearAllCache();
    res.json({ success: true, deleted });
  }
});

/**
 * API: 清理单页缓存
 */
app.post('/api/cache/clear-slide', express.json(), (req, res) => {
  const { pptHash, slideIndex } = req.body;
  if (!pptHash || slideIndex === undefined) {
    return res.status(400).json({ error: '缺少 pptHash 或 slideIndex' });
  }
  const deleted = videoCache.clearSlideCache(pptHash, slideIndex);
  res.json({ success: true, deleted });
});

// ==================== PPT 文件夹缓存 API ====================
const pptFolderCache = require('./services/ppt-folder-cache.service');

/**
 * API: 获取所有缓存的PPT列表
 */
app.get('/api/ppt-cache/list', (req, res) => {
  res.json(pptFolderCache.getAllPPTs());
});

/**
 * API: 获取PPT缓存状态
 */
app.get('/api/ppt-cache/:pptHash/status', (req, res) => {
  const status = pptFolderCache.getPPTStatus(req.params.pptHash);
  res.json(status);
});

/**
 * API: 保存演讲稿
 */
app.post('/api/ppt-cache/:pptHash/scripts', express.json(), (req, res) => {
  const { slides, scripts, voiceKnowledge, images, metadata } = req.body;
  const result = pptFolderCache.saveScripts(req.params.pptHash, slides || [], scripts, voiceKnowledge || '', { ...metadata, images });
  res.json({ success: true, path: result });
});

/**
 * API: 获取演讲稿
 */
app.get('/api/ppt-cache/:pptHash/scripts', (req, res) => {
  const scripts = pptFolderCache.getScripts(req.params.pptHash);
  if (!scripts) return res.status(404).json({ error: '演讲稿不存在' });
  res.json(scripts);
});

/**
 * API: 保存视频到PPT文件夹
 */
app.post('/api/ppt-cache/:pptHash/video/:slideIndex', express.raw({ type: 'video/mp4', limit: '100mb' }), async (req, res) => {
  try {
    const result = pptFolderCache.saveVideo(req.params.pptHash, parseInt(req.params.slideIndex), req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: '保存失败', message: error.message });
  }
});

/**
 * API: 获取PPT文件夹中的视频
 */
app.get('/api/ppt-cache/:pptHash/video/:slideIndex', (req, res) => {
  const stream = pptFolderCache.getVideoStream(req.params.pptHash, parseInt(req.params.slideIndex));
  if (!stream) return res.status(404).json({ error: '视频不存在' });
  
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  stream.pipe(res);
});

/**
 * API: 删除PPT缓存
 */
app.delete('/api/ppt-cache/:pptHash', (req, res) => {
  pptFolderCache.deletePPT(req.params.pptHash);
  res.json({ success: true });
});

/**
 * API: 只清除视频（保留演讲稿）
 */
app.post('/api/ppt-cache/:pptHash/clear-videos', (req, res) => {
  const count = pptFolderCache.clearVideos(req.params.pptHash);
  res.json({ success: true, deleted: count });
});

/**
 * API: 只清除演讲稿（保留视频）
 */
app.post('/api/ppt-cache/:pptHash/clear-scripts', (req, res) => {
  pptFolderCache.clearScripts(req.params.pptHash);
  res.json({ success: true });
});

/**
 * API: 重建PPT缓存索引（扫描目录）
 */
app.post('/api/ppt-cache/rebuild', (req, res) => {
  const stats = pptFolderCache.rebuildIndex();
  res.json({ success: true, message: 'PPT缓存索引已重建', stats });
});

/**
 * API: PPT缓存统计
 */
app.get('/api/ppt-cache/stats', (req, res) => {
  res.json(pptFolderCache.getCacheStats());
});

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║     PPT to Image Server (Windows)                  ║
╠════════════════════════════════════════════════════╣
║  端口: ${PORT}                                        ║
║  状态: ${sofficePath ? '✅ LibreOffice 已找到' : '❌ LibreOffice 未安装'}          ║
╚════════════════════════════════════════════════════╝

依赖要求:
  - LibreOffice (必需，用于转换图片)

API 端点:
  POST /api/convert    - 上传 PPT 转换为图片
  GET  /api/images/:name - 获取图片
  GET  /api/slides/:id - 获取 PPT 文本内容
  GET  /api/health     - 健康检查

${!sofficePath ? '\n⚠️  警告: 未找到 LibreOffice，请安装后重启服务\n   下载地址: https://www.libreoffice.org/download/\n' : ''}
  `);

  // WebSocket 实时语音代理
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server, path: '/api/realtime' });
  
  wss.on('connection', (ws, req) => {
    console.log('[RealtimeProxy] WebSocket客户端连接');
    
    // 从URL参数获取配置
    const url = new URL(req.url, `http://${req.headers.host}`);
    const appId = url.searchParams.get('appId');
    const accessKey = url.searchParams.get('accessKey');
    
    if (!appId || !accessKey) {
      ws.send(JSON.stringify({ type: 'error', message: '缺少appId或accessKey' }));
      ws.close();
      return;
    }
    
    realtimeProxy.handleConnection(ws, { appId, accessKey });
  });
  
  console.log('🎤 实时语音代理已启动: ws://localhost:' + PORT + '/api/realtime');
});
