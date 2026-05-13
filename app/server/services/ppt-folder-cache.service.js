/**
 * PPT 文件夹缓存服务（扫描模式增强版）
 * 每个PPT有独立文件夹，存储PPT/演讲稿/音频/视频
 * 
 * 支持两种模式：
 * 1. 索引模式：通过 index.json 快速查找
 * 2. 扫描模式：index.json 丢失时，自动扫描目录重建索引
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_ROOT = path.join(__dirname, '..', 'video-cache');
const INDEX_FILE = path.join(CACHE_ROOT, 'index.json');

class PPTFolderCacheService {
  constructor() {
    this.ensureDir(CACHE_ROOT);
    this.index = this.loadIndex();
  }

  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 加载索引文件
   * 如果 index.json 不存在或损坏，自动扫描目录重建
   */
  loadIndex() {
    try {
      if (fs.existsSync(INDEX_FILE)) {
        const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
        // index.json 存在则信任，但每个条目启动时现场核实视频 + 演讲稿
        let rebuilt = false;
        for (const [hash, meta] of Object.entries(index.ppts || {})) {
          const status = this.getPPTStatus(hash);
          if (!status.exists) {
            delete index.ppts[hash];
            rebuilt = true;
          } else {
            // 用实际磁盘状态更新 meta
            meta.totalSlides = status.videoCount;
            meta.title = status.meta?.title || meta.title || 'Untitled';
            meta.hasScripts = status.hasScripts;
            meta.videoCount = status.videoCount;
            meta.oldFormat = status.oldFormat;
          }
        }
        if (rebuilt) {
          console.log('[PPTCache] 已清理无效条目，保存索引');
          this.saveIndex();
        }
        return index;
      }
    } catch (e) {
      console.error('[PPTCache] 索引文件损坏，开始扫描重建...');
    }
    return this.scanCacheDir();
  }

  /**
   * 统计缓存目录下的PPT文件夹数量
   */
  countPPTDirs() {
    try {
      if (!fs.existsSync(CACHE_ROOT)) return 0;
      return fs.readdirSync(CACHE_ROOT, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'ab' && d.name.length === 16) // 排除旧版短目录，匹配16位hash
        .length;
    } catch {
      return 0;
    }
  }

  /**
   * 扫描缓存目录，重建索引
   * 纯文件扫描模式：不依赖 index.json，直接遍历目录识别缓存
   */
  scanCacheDir() {
    console.log('[PPTCache] 🔍 开始扫描缓存目录:', CACHE_ROOT);
    const index = { ppts: {} };
    const seenHashes = new Set();

    if (!fs.existsSync(CACHE_ROOT)) return index;

    const entries = fs.readdirSync(CACHE_ROOT, { withFileTypes: true });
    let scannedCount = 0;
    let videoCount = 0;

    // 第一遍：扫描新格式 (16位hash目录 / {hash}/video/{n}.mp4)
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.length !== 16) continue;
      const pptHash = entry.name;
      const pptDir = path.join(CACHE_ROOT, pptHash);
      const videoDir = path.join(pptDir, 'video');
      if (!fs.existsSync(videoDir)) continue;

      const files = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4'));
      if (files.length === 0) continue;

      const info = this.buildPPTInfo(pptHash, pptDir, files);
      if (info) {
        index.ppts[pptHash] = info;
        seenHashes.add(pptHash);
        scannedCount++;
        videoCount += files.length;
      }
    }

    // 第二遍：扫描旧格式 (2位hash前辍目录 / {xx}/{yy}/{hash}_{n}.mp4)
    for (const l1 of entries) {
      if (!l1.isDirectory() || l1.name.length !== 2) continue;
      const l1Path = path.join(CACHE_ROOT, l1.name);
      const l2Entries = fs.readdirSync(l1Path, { withFileTypes: true }).filter(d => d.isDirectory());
      for (const l2 of l2Entries) {
        const l2Path = path.join(l1Path, l2.name);
        const files = fs.readdirSync(l2Path).filter(f => f.endsWith('.mp4'));

        // 按 pptHash 分组旧格式文件: {hash}_{index}.mp4
        const byHash = {};
        for (const f of files) {
          const match = f.match(/^([-a-f0-9]+)_(\d+)\.mp4$/);
          if (!match) continue;
          const hash = match[1];
          if (!byHash[hash]) byHash[hash] = [];
          byHash[hash].push(parseInt(match[2]));
        }

        for (const [hash, indices] of Object.entries(byHash)) {
          if (seenHashes.has(hash)) continue;
          // 检查是否已迁移到新格式目录
          const newDir = path.join(CACHE_ROOT, hash);
          if (fs.existsSync(newDir)) continue;

          // 用旧格式的文件列表创建新格式目录和 index
          const sorted = indices.sort((a, b) => a - b);
          const info = {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            slides: [],
            totalSlides: sorted.length,
            title: 'PPT缓存(' + hash.slice(0, 8) + ')',
            scanned: true,
            oldFormat: true,
          };
          index.ppts[hash] = info;
          seenHashes.add(hash);
          scannedCount++;
          videoCount += sorted.length;
          console.log(`[PPTCache]   发现旧格式缓存: ${hash} (${sorted.length} 页)`);
        }
      }
    }

    try {
      fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
      console.log(`[PPTCache] ✅ 扫描完成: 识别 ${scannedCount} 个PPT, ${videoCount} 个视频`);
    } catch (e) {
      console.error('[PPTCache] 保存索引失败:', e);
    }

    return index;
  }

  buildPPTInfo(pptHash, pptDir, videoFiles) {
    const videoDir = path.join(pptDir, 'video');
    const scriptsPath = path.join(pptDir, 'scripts.json');
    const indices = videoFiles.map(f => parseInt(f.replace('.mp4', ''))).filter(n => !isNaN(n)).sort((a, b) => a - b);

    let title = 'Untitled';
    let scripts = [];
    try {
      if (fs.existsSync(scriptsPath)) {
        const data = JSON.parse(fs.readFileSync(scriptsPath, 'utf8'));
        scripts = data.scripts || [];
        if (data.slides?.[0]?.title) title = data.slides[0].title;
        else if (scripts?.[0]?.title) title = scripts[0].title;
      }
    } catch {}

    let createdAt = new Date().toISOString();
    try {
      const stats = fs.statSync(pptDir);
      createdAt = stats.birthtime?.toISOString() || stats.ctime.toISOString();
    } catch {}

    return { createdAt, updatedAt: createdAt, slides: scripts, totalSlides: indices.length, title, scanned: true };
  }

  /**
   * 手动触发重建索引
   */
  rebuildIndex() {
    console.log('[PPTCache] 🔄 手动重建索引...');
    this.index = this.scanCacheDir();
    return this.getCacheStats();
  }

  saveIndex() {
    try {
      fs.writeFileSync(INDEX_FILE, JSON.stringify(this.index, null, 2));
    } catch (e) {
      console.error('[PPTCache] Save index failed:', e);
    }
  }

  computeHash(slides) {
    const content = slides.map(s => `${s.title || ''}:${s.content || ''}`).join('|');
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
  }

  getPPTDir(pptHash) {
    return path.join(CACHE_ROOT, pptHash);
  }

  initPPTFolder(pptHash, metadata = {}) {
    const pptDir = this.getPPTDir(pptHash);
    ['ppt', 'audio', 'video'].forEach(subdir => {
      this.ensureDir(path.join(pptDir, subdir));
    });

    if (!this.index.ppts[pptHash]) {
      this.index.ppts[pptHash] = {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        slides: metadata.slides || [],
        totalSlides: metadata.totalSlides || 0,
        title: metadata.title || 'Untitled'
      };
      this.saveIndex();
    }
    return pptDir;
  }

  hasPPT(pptHash) {
    // 先查索引，再查目录（兼容扫描模式）
    if (this.index.ppts[pptHash]) return true;
    return fs.existsSync(this.getPPTDir(pptHash));
  }

  getPPTStatus(pptHash) {
    const meta = this.index.ppts[pptHash];
    if (!meta) return { exists: false };

    const pptDir = this.getPPTDir(pptHash);
    const scriptsPath = path.join(pptDir, 'scripts.json');
    let videos = [];
    let isOldFormat = meta.oldFormat;

    // 新格式: {hash}/video/{n}.mp4
    const videoDir = path.join(pptDir, 'video');
    if (fs.existsSync(videoDir)) {
      videos = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4')).map(f => {
        const idx = parseInt(f.replace('.mp4', ''));
        return { slideIndex: isNaN(idx) ? 0 : idx, url: `/api/ppt-cache/${pptHash}/video/${f.replace('.mp4', '')}` };
      }).sort((a, b) => a.slideIndex - b.slideIndex);
    } else if (isOldFormat || true) {
      // 旧格式: {xx}/{yy}/{hash}_{n}.mp4 或通过 cache-metadata.json 查找
      const l1 = pptHash.slice(0, 2);
      const l2 = pptHash.slice(2, 4);
      const oldDir = path.join(CACHE_ROOT, l1, l2);
      if (fs.existsSync(oldDir)) {
        videos = fs.readdirSync(oldDir)
          .filter(f => f.startsWith(pptHash + '_') && f.endsWith('.mp4'))
          .map(f => {
            const idx = parseInt(f.replace(pptHash + '_', '').replace('.mp4', ''));
            return { slideIndex: isNaN(idx) ? 0 : idx, url: `/api/cache/video/${pptHash}/${f.replace(pptHash + '_', '').replace('.mp4', '')}` };
          })
          .sort((a, b) => a.slideIndex - b.slideIndex);
      }
    }

    return {
      exists: videos.length > 0 || meta.scanned,
      hash: pptHash,
      path: pptDir,
      meta,
      hasScripts: fs.existsSync(scriptsPath),
      videoCount: videos.length,
      videos,
      isComplete: videos.length === meta.totalSlides && meta.totalSlides > 0,
      oldFormat: isOldFormat,
    };
  }

  saveScripts(pptHash, slides, scripts, voiceKnowledge, metadata = {}) {
    const pptDir = this.initPPTFolder(pptHash, metadata);
    const scriptsPath = path.join(pptDir, 'scripts.json');

    fs.writeFileSync(scriptsPath, JSON.stringify({
      slides,
      scripts,
      voiceKnowledge: voiceKnowledge || '',
      images: metadata?.images || [],
      updatedAt: new Date().toISOString()
    }, null, 2));

    this.index.ppts[pptHash].scripts = scripts;
    this.index.ppts[pptHash].updatedAt = new Date().toISOString();
    this.saveIndex();

    console.log(`[PPTCache] Scripts saved: ${pptHash}`);
    return scriptsPath;
  }

  getScripts(pptHash) {
    const scriptsPath = path.join(this.getPPTDir(pptHash), 'scripts.json');
    if (!fs.existsSync(scriptsPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(scriptsPath, 'utf8'));
      // 兼容旧格式（只有 scripts 数组）和新格式（有 slides + scripts）
      return {
        slides: data.slides || null,
        scripts: data.scripts || data,
        voiceKnowledge: data.voiceKnowledge || '',
        images: data.images || null,
        updatedAt: data.updatedAt || null,
      };
    } catch (e) { return null; }
  }

  saveVideo(pptHash, slideIndex, videoBuffer) {
    const pptDir = this.getPPTDir(pptHash);
    const videoDir = path.join(pptDir, 'video');
    this.ensureDir(videoDir);

    const videoPath = path.join(videoDir, `${slideIndex}.mp4`);
    fs.writeFileSync(videoPath, videoBuffer);

    this.index.ppts[pptHash].updatedAt = new Date().toISOString();
    this.saveIndex();

    console.log(`[PPTCache] Video saved: ${pptHash}/${slideIndex}`);
    return {
      path: videoPath,
      url: `/api/ppt-cache/${pptHash}/video/${slideIndex}`
    };
  }

  getVideoStream(pptHash, slideIndex) {
    // 新格式
    const newPath = path.join(this.getPPTDir(pptHash), 'video', `${slideIndex}.mp4`);
    if (fs.existsSync(newPath)) return fs.createReadStream(newPath);
    // 旧格式
    const oldDir = path.join(CACHE_ROOT, pptHash.slice(0, 2), pptHash.slice(2, 4));
    const oldPath = path.join(oldDir, `${pptHash}_${slideIndex}.mp4`);
    if (fs.existsSync(oldPath)) return fs.createReadStream(oldPath);
    return null;
  }

  getAllPPTs() {
    return Object.entries(this.index.ppts).map(([hash, meta]) => {
      const status = this.getPPTStatus(hash);
      return {
        hash,
        title: meta.title || 'Untitled',
        totalSlides: meta.totalSlides || status.videoCount || 0,
        videoCount: status.videoCount,
        hasScripts: status.hasScripts,
        isComplete: status.isComplete,
        oldFormat: meta.oldFormat || false,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      };
    });
  }

  deletePPT(pptHash) {
    const pptDir = this.getPPTDir(pptHash);
    if (fs.existsSync(pptDir)) {
      fs.rmSync(pptDir, { recursive: true });
    }
    delete this.index.ppts[pptHash];
    this.saveIndex();
    console.log(`[PPTCache] Deleted: ${pptHash}`);
    return true;
  }

  clearVideos(pptHash) {
    const pptDir = this.getPPTDir(pptHash);
    const videoDir = path.join(pptDir, 'video');
    let deleted = 0;
    if (fs.existsSync(videoDir)) {
      const files = fs.readdirSync(videoDir).filter(f => f.endsWith('.mp4'));
      files.forEach(f => {
        try { fs.unlinkSync(path.join(videoDir, f)); deleted++; } catch {}
      });
    }
    const oldDir = path.join(CACHE_ROOT, pptHash.slice(0, 2), pptHash.slice(2, 4));
    if (fs.existsSync(oldDir)) {
      fs.readdirSync(oldDir).filter(f => f.startsWith(pptHash + '_') && f.endsWith('.mp4'))
        .forEach(f => { try { fs.unlinkSync(path.join(oldDir, f)); deleted++; } catch {} });
    }
    return deleted;
  }

  clearScripts(pptHash) {
    const scriptsPath = path.join(this.getPPTDir(pptHash), 'scripts.json');
    if (fs.existsSync(scriptsPath)) {
      fs.unlinkSync(scriptsPath);
      console.log(`[PPTCache] Cleared scripts: ${pptHash}`);
      return true;
    }
    return false;
  }

  getCacheStats() {
    const ppts = Object.keys(this.index.ppts).length;
    let totalSize = 0;
    
    Object.keys(this.index.ppts).forEach(hash => {
      const dir = this.getPPTDir(hash);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir, { recursive: true });
        files.forEach(f => {
          const fp = path.join(dir, f);
          if (fs.statSync(fp).isFile()) {
            totalSize += fs.statSync(fp).size;
          }
        });
      }
    });

    return {
      totalPPTs: ppts,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  }
}

module.exports = new PPTFolderCacheService();
