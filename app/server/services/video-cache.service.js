/**
 * 视频文件缓存服务（扫描模式增强版）
 * 将生成的数字人视频保存到文件系统，永久存储
 * 
 * 支持扫描目录重建元数据，不依赖 cache-metadata.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '..', 'video-cache');
const METADATA_FILE = path.join(CACHE_DIR, 'cache-metadata.json');

class VideoCacheService {
  constructor() {
    this.ensureCacheDir();
    this.metadata = this.loadMetadata();
  }

  ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      console.log('[VideoCache] Created:', CACHE_DIR);
    }
  }

  /**
   * 加载元数据
   * 如果 cache-metadata.json 不存在或损坏，自动扫描目录重建
   */
  loadMetadata() {
    try {
      if (fs.existsSync(METADATA_FILE)) {
        const meta = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
        // 简单校验：如果元数据为空但目录有内容，重新扫描
        const metaCount = Object.keys(meta).length;
        const dirHasContent = this.scanForVideoFiles();
        if (metaCount === 0 && dirHasContent) {
          console.log('[VideoCache] 元数据为空但目录有内容，开始扫描重建...');
          return this.scanCacheDir();
        }
        return meta;
      }
    } catch (e) {
      console.error('[VideoCache] 元数据文件损坏，开始扫描重建...');
    }
    // 没有元数据文件或损坏，扫描目录
    return this.scanCacheDir();
  }

  /**
   * 快速检查目录下是否有视频文件
   */
  scanForVideoFiles() {
    try {
      if (!fs.existsSync(CACHE_DIR)) return false;
      const entries = fs.readdirSync(CACHE_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subDir = path.join(CACHE_DIR, entry.name);
          const files = fs.readdirSync(subDir, { recursive: true });
          if (files.some(f => f.endsWith('.mp4'))) return true;
        }
      }
    } catch {}
    return false;
  }

  /**
   * 扫描缓存目录，重建元数据
   * 纯文件扫描模式：不依赖 cache-metadata.json，直接遍历目录识别视频文件
   */
  scanCacheDir() {
    console.log('[VideoCache] 🔍 开始扫描缓存目录:', CACHE_DIR);
    const metadata = {};
    
    if (!fs.existsSync(CACHE_DIR)) {
      return metadata;
    }

    let scannedCount = 0;

    // 遍历第一层目录（hash前2位）
    const level1Dirs = fs.readdirSync(CACHE_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name.length === 2);

    for (const l1 of level1Dirs) {
      const l1Path = path.join(CACHE_DIR, l1.name);
      
      // 遍历第二层目录（hash第3-4位）
      const level2Dirs = fs.readdirSync(l1Path, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const l2 of level2Dirs) {
        const l2Path = path.join(l1Path, l2.name);
        
        // 遍历视频文件
        const files = fs.readdirSync(l2Path).filter(f => f.endsWith('.mp4'));
        
        for (const file of files) {
          // 文件名格式: {pptHash}_{slideIndex}.mp4
          const match = file.match(/^([a-f0-9]+)_(\d+)\.mp4$/);
          if (!match) continue;
          
          const pptHash = match[1];
          const slideIndex = parseInt(match[2]);
          const filePath = path.join(l2Path, file);
          const key = `${pptHash}_${slideIndex}`;
          
          try {
            const stats = fs.statSync(filePath);
            metadata[key] = {
              pptHash,
              slideIndex,
              filePath,
              createdAt: stats.birthtime?.toISOString() || stats.ctime.toISOString(),
              size: stats.size,
              scanned: true
            };
            scannedCount++;
          } catch (e) {
            console.error(`[VideoCache] 扫描文件失败: ${filePath}`, e);
          }
        }
      }
    }

    // 保存重建的元数据
    try {
      fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
      console.log(`[VideoCache] ✅ 扫描完成: 识别 ${scannedCount} 个视频文件`);
    } catch (e) {
      console.error('[VideoCache] 保存元数据失败:', e);
    }

    return metadata;
  }

  /**
   * 手动触发重建元数据
   */
  rebuildMetadata() {
    console.log('[VideoCache] 🔄 手动重建元数据...');
    this.metadata = this.scanCacheDir();
    return this.getCacheStats();
  }

  saveMetadata() {
    try {
      fs.writeFileSync(METADATA_FILE, JSON.stringify(this.metadata, null, 2));
    } catch (e) {
      console.error('[VideoCache] Save failed:', e);
    }
  }

  computeHash(slides) {
    const content = slides.map(s => `${s.title || ''}:${s.content || ''}`).join('|');
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 16);
  }

  getCachePath(pptHash, slideIndex) {
    const dir = path.join(CACHE_DIR, pptHash.substring(0, 2), pptHash.substring(2, 4));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${pptHash}_${slideIndex}.mp4`);
  }

  hasCache(pptHash, slideIndex) {
    const filePath = this.getCachePath(pptHash, slideIndex);
    const key = `${pptHash}_${slideIndex}`;
    
    if (fs.existsSync(filePath)) {
      const meta = this.metadata[key];
      return {
        exists: true,
        filePath,
        url: `/api/cache/video/${pptHash}/${slideIndex}`,
        createdAt: meta?.createdAt,
        size: meta?.size
      };
    }
    return { exists: false };
  }

  getPPTCacheStatus(pptHash, slideCount) {
    const cached = [];
    const missing = [];
    
    for (let i = 0; i < slideCount; i++) {
      const result = this.hasCache(pptHash, i);
      if (result.exists) {
        cached.push({ slideIndex: i, ...result });
      } else {
        missing.push(i);
      }
    }
    
    return {
      total: slideCount,
      cached: cached.length,
      missing: missing.length,
      cachedSlides: cached,
      missingSlides: missing,
      isComplete: cached.length === slideCount
    };
  }

  saveVideo(pptHash, slideIndex, videoBuffer) {
    return new Promise((resolve, reject) => {
      const filePath = this.getCachePath(pptHash, slideIndex);
      const key = `${pptHash}_${slideIndex}`;
      
      fs.writeFile(filePath, videoBuffer, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        const stats = fs.statSync(filePath);
        this.metadata[key] = {
          pptHash,
          slideIndex,
          filePath,
          createdAt: new Date().toISOString(),
          size: stats.size
        };
        this.saveMetadata();
        
        console.log(`[VideoCache] Saved: ${pptHash} slide ${slideIndex + 1} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
        resolve({
          filePath,
          url: `/api/cache/video/${pptHash}/${slideIndex}`,
          size: stats.size
        });
      });
    });
  }

  getVideoStream(pptHash, slideIndex) {
    const filePath = this.getCachePath(pptHash, slideIndex);
    return fs.existsSync(filePath) ? fs.createReadStream(filePath) : null;
  }

  getCacheStats() {
    const entries = Object.entries(this.metadata);
    let totalSize = 0;
    entries.forEach(([_, meta]) => totalSize += meta.size || 0);
    
    return {
      totalVideos: entries.length,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      uniquePPTs: new Set(entries.map(([k, _]) => k.split('_')[0])).size
    };
  }

  clearPPTCache(pptHash) {
    const keys = Object.keys(this.metadata).filter(k => k.startsWith(pptHash));
    keys.forEach(key => {
      const meta = this.metadata[key];
      if (meta?.filePath && fs.existsSync(meta.filePath)) {
        try { fs.unlinkSync(meta.filePath); } catch (e) {}
      }
      delete this.metadata[key];
    });
    this.saveMetadata();
    return keys.length;
  }

  clearSlideCache(pptHash, slideIndex) {
    const key = `${pptHash}_${slideIndex}`;
    const meta = this.metadata[key];
    if (meta?.filePath && fs.existsSync(meta.filePath)) {
      try { 
        fs.unlinkSync(meta.filePath); 
        console.log(`[VideoCache] 已删除视频文件: ${meta.filePath}`);
      } catch (e) {
        console.error(`[VideoCache] 删除视频文件失败:`, e);
      }
    }
    if (this.metadata[key]) {
      delete this.metadata[key];
      this.saveMetadata();
      console.log(`[VideoCache] 已清除缓存元数据: ${key}`);
      return true;
    }
    return false;
  }
}

module.exports = new VideoCacheService();
