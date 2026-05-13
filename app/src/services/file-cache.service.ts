/**
 * 统一缓存服务
 * IndexedDB 存储元数据 + 媒体文件
 */

import type { Slide } from '@/types';

const DB_NAME = 'DigitalHumanCache';
const DB_VERSION = 2;
const MEDIA_STORE = 'pptMediaCache';
const META_STORE = 'pptMetaCache';

interface CachedMedia {
  id: string;
  pptHash: string;
  slideIndex: number;
  audioBlob: Blob;
  videoBlob: Blob;
  timestamp: number;
}

interface CachedMeta {
  pptHash: string;
  slides: Slide[];
  speechScripts: string[];
  voiceKnowledge: string;
  timestamp: number;
}

class FileCacheService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        // If this is a version error, try deleting and recreating
        const e = request.error;
        if (e?.name === 'VersionError') {
          const deleteReq = indexedDB.deleteDatabase(DB_NAME);
          deleteReq.onsuccess = () => {
            // Retry open after delete
            const retry = indexedDB.open(DB_NAME, DB_VERSION);
            retry.onupgradeneeded = (event) => {
              const db = (event.target as IDBOpenDBRequest).result;
              if (!db.objectStoreNames.contains(MEDIA_STORE)) {
                const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
                store.createIndex('pptHash', 'pptHash', { unique: false });
              }
              if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE, { keyPath: 'pptHash' });
              }
            };
            retry.onsuccess = () => { this.db = retry.result; resolve(); };
            retry.onerror = () => reject(retry.error);
          };
          deleteReq.onerror = () => reject(deleteReq.error);
        } else {
          reject(request.error);
        }
      };

      request.onblocked = () => {
        reject(new Error('Database blocked — close other tabs and reload'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
          store.createIndex('pptHash', 'pptHash', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'pptHash' });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch {
        // init failed, will retry below
      }
      this.initPromise = null;
    }

    if (!this.db) {
      // Retry: re-initialize the DB
      this.initPromise = this.initDB();
      await this.initPromise;
      this.initPromise = null;
    }

    if (!this.db) throw new Error('IndexedDB not available');
    return this.db;
  }

  private mediaKey(pptHash: string, slideIndex: number): string {
    return `${pptHash}_${slideIndex}`;
  }

  // ========== 元数据存储 ==========

  async saveMeta(pptHash: string, slides: Slide[], scripts: string[], voiceKnowledge?: string): Promise<void> {
    const db = await this.ensureDB();
    const existing = await this.loadMeta(pptHash).catch(() => null);
    const data: CachedMeta = {
      pptHash,
      slides,
      speechScripts: scripts,
      voiceKnowledge: voiceKnowledge ?? existing?.voiceKnowledge ?? '',
      timestamp: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction([META_STORE], 'readwrite');
      tx.objectStore(META_STORE).put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadMeta(pptHash: string): Promise<CachedMeta | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([META_STORE], 'readonly');
      const req = tx.objectStore(META_STORE).get(pptHash);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async loadLatestMeta(): Promise<CachedMeta | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([META_STORE], 'readonly');
      const req = tx.objectStore(META_STORE).getAll();
      req.onsuccess = () => {
        const all: CachedMeta[] = req.result || [];
        if (all.length === 0) return resolve(null);
        all.sort((a, b) => b.timestamp - a.timestamp);
        resolve(all[0]);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async updateVoiceKnowledge(pptHash: string, text: string): Promise<boolean> {
    const meta = await this.loadMeta(pptHash);
    if (!meta) return false;
    meta.voiceKnowledge = text;
    meta.timestamp = Date.now();
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([META_STORE], 'readwrite');
      tx.objectStore(META_STORE).put(meta);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteMeta(pptHash: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const tx = db.transaction([META_STORE], 'readwrite');
      tx.objectStore(META_STORE).delete(pptHash);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  // ========== 媒体文件存储 ==========

  async saveMedia(pptHash: string, slideIndex: number, audioBlob: Blob, videoBlob: Blob): Promise<void> {
    const db = await this.ensureDB();
    const data = {
      id: this.mediaKey(pptHash, slideIndex),
      pptHash,
      slideIndex,
      audioBlob,
      videoBlob,
      timestamp: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction([MEDIA_STORE], 'readwrite');
      tx.objectStore(MEDIA_STORE).put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadMedia(pptHash: string, slideIndex: number): Promise<{ audioBlob: Blob; videoBlob: Blob; videoUrl: string } | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([MEDIA_STORE], 'readonly');
      const req = tx.objectStore(MEDIA_STORE).get(this.mediaKey(pptHash, slideIndex));
      req.onsuccess = () => {
        const data: CachedMedia | undefined = req.result;
        if (!data) return resolve(null);
        resolve({
          audioBlob: data.audioBlob,
          videoBlob: data.videoBlob,
          videoUrl: URL.createObjectURL(data.videoBlob),
        });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getCachedSlideCount(pptHash: string): Promise<number> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([MEDIA_STORE], 'readonly');
      const req = tx.objectStore(MEDIA_STORE).index('pptHash').count(pptHash);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async clearSlideCache(pptHash: string, slideIndex: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const tx = db.transaction([MEDIA_STORE], 'readwrite');
      tx.objectStore(MEDIA_STORE).delete(this.mediaKey(pptHash, slideIndex));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  async clearPPTMediaOnly(pptHash: string): Promise<number> {
    const db = await this.ensureDB();
    return new Promise((resolve) => {
      const tx = db.transaction([MEDIA_STORE], 'readwrite');
      const index = tx.objectStore(MEDIA_STORE).index('pptHash');
      const req = index.getAllKeys(pptHash);
      req.onsuccess = () => {
        const keys = req.result as string[];
        keys.forEach(k => tx.objectStore(MEDIA_STORE).delete(k));
        tx.oncomplete = () => resolve(keys.length);
        tx.onerror = () => resolve(0);
      };
      req.onerror = () => resolve(0);
    });
  }

  async clearPPTCache(pptHash: string): Promise<void> {
    const db = await this.ensureDB();
    await this.deleteMeta(pptHash);
    return new Promise((resolve) => {
      const tx = db.transaction([MEDIA_STORE], 'readwrite');
      const index = tx.objectStore(MEDIA_STORE).index('pptHash');
      const req = index.getAllKeys(pptHash);
      req.onsuccess = () => {
        for (const key of req.result as string[]) {
          tx.objectStore(MEDIA_STORE).delete(key);
        }
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => resolve();
    });
  }
}

export const cacheService = new FileCacheService();
