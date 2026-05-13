/**
 * SadTalker 数字人服务客户端
 * 固定照片版本 - 全自动生成
 * 支持文件系统缓存
 */

import { SERVER_CONFIG } from '@/config/server.config';

const AVATAR_SERVICE_URL = SERVER_CONFIG.AVATAR_SERVICE_URL;
const BACKEND_URL = SERVER_CONFIG.BASE_URL;

export interface AvatarGenerateOptions {
  image?: File | Blob;  // 可选，不传则使用服务端固定照片
  audio: Blob;
  onProgress?: (progress: number) => void;
  // 新增：缓存参数
  pptHash?: string;
  slideIndex?: number;
}

export interface AvatarServiceStatus {
  status: 'ok' | 'error';
  sadtalker: boolean;
  version?: string;
  checkpoint?: string | null;
  default_avatar?: boolean;
  message?: string;
}

export class AvatarService {
  private baseUrl: string;

  constructor(baseUrl: string = AVATAR_SERVICE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 检查服务状态
   */
  async checkHealth(): Promise<AvatarServiceStatus | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      });
      
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * 检查后端文件缓存
   */
  async checkFileCache(pptHash: string, slideIndex: number): Promise<{ exists: boolean; url?: string }> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/cache/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pptHash, slideCount: slideIndex + 1 }),
      });
      
      if (!response.ok) return { exists: false };
      
      const data = await response.json();
      const slide = data.cachedSlides?.find((s: any) => s.slideIndex === slideIndex);
      
      if (slide) {
        return { exists: true, url: BACKEND_URL + slide.url };
      }
      return { exists: false };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * 清除后端单页缓存
   */
  async clearSlideCache(pptHash: string, slideIndex: number): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/cache/clear-slide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pptHash, slideIndex }),
      });
      
      if (!response.ok) {
        console.error('[Avatar] 清除后端缓存失败:', response.status);
        return false;
      }
      
      const data = await response.json();
      return data.deleted;
    } catch (error) {
      console.error('[Avatar] 清除后端缓存失败:', error);
      return false;
    }
  }

  /**
   * 生成数字人视频
   * 不传 image 则使用服务端固定照片
   * @param reuseExisting 如果为 true，优先使用已生成的视频（测试模式）
   */
  async generateVideo(options: AvatarGenerateOptions, reuseExisting: boolean = false): Promise<string | null> {
    const { image, audio, pptHash, slideIndex } = options;
    
    // 优先检查文件缓存
    if (pptHash && slideIndex !== undefined) {
      const cache = await this.checkFileCache(pptHash, slideIndex);
      if (cache.exists && cache.url) {
        return cache.url;
      }
    }
    
    try {
      const formData = new FormData();
      
      // 如果传了有效图片就使用，否则服务端会用固定照片
      if (image && image instanceof File) {
        formData.append('image', image, 'avatar.png');
      }
      // 不传 image 字段，服务端会自动使用默认照片
      
      const audioType = audio.type || 'audio/webm';
      const audioExt = audioType.includes('ogg') ? 'ogg' : (audioType.includes('webm') ? 'webm' : 'wav');
      formData.append('audio', audio, `speech.${audioExt}`);
      
      // 快速测试模式
      if (reuseExisting) {
        formData.append('reuse', 'true');
      }
      
      // 添加缓存参数
      if (pptHash) {
        formData.append('pptHash', pptHash);
        formData.append('slideIndex', String(slideIndex));
      }

      if (reuseExisting) {
      } else {
      }
      
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(reuseExisting ? 120000 : 600000), // 快速模式2分钟，正常模式10分钟
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('服务器错误:', errorText);
        throw new Error(`生成失败: ${response.status}`);
      }

      // 获取视频 Blob
      const videoBlob = await response.blob();
      const videoUrl = URL.createObjectURL(videoBlob);
      
      return videoUrl;
      
    } catch (error) {
      console.error('❌ 生成数字人视频失败:', error);
      return null;
    }
  }

  /**
   * 批量预生成数字人视频
   */
  async batchGenerate(
    audios: Blob[],
    indices: number[]
  ): Promise<{ success: boolean; total: number; successful: number; results: any[] } | null> {
    try {
      const formData = new FormData();
      
      // 不传图片，使用服务端固定照片
      
      audios.forEach((audio, i) => {
        const audioType = audio.type || 'audio/webm';
        const audioExt = audioType.includes('ogg') ? 'ogg' : (audioType.includes('webm') ? 'webm' : 'wav');
        formData.append('audios', audio, `speech_${indices[i]}.${audioExt}`);
        formData.append('indices', String(indices[i]));
      });

      
      const response = await fetch(`${this.baseUrl}/batch_generate`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('服务器错误:', errorText);
        throw new Error(`预生成失败: ${response.status}`);
      }

      const result = await response.json();
      return result;
      
    } catch (error) {
      console.error('❌ 批量预生成失败:', error);
      return null;
    }
  }
}

// 单例实例
export const avatarService = new AvatarService();

// 全局暴露方便调试
if (typeof window !== 'undefined') {
  (window as any).avatarService = avatarService;
}
