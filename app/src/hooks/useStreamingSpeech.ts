/**
 * 流式语音管理 Hook
 * 固定照片版本 - 全自动生成
 */

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { VolcanoSpeechService } from '@/services/volcano-speech.service';

interface SpeechCache {
  [slideIndex: number]: {
    audioBlob: Blob;
    videoUrl: string | null;
    timestamp: number;
  };
}

interface UseStreamingSpeechOptions {
  volcanoService: VolcanoSpeechService | null;
  speechScripts: string[];
  enabled?: boolean;  // 是否启用数字人生成
}

export function useStreamingSpeech(options: UseStreamingSpeechOptions) {
  const { volcanoService, speechScripts, enabled = true } = options;
  
  const [cache, setCache] = useState<SpeechCache>({});
  const cacheRef = useRef<SpeechCache>({});
  const [isPreloading, setIsPreloading] = useState(false);
  const generatingIndices = useRef<Set<number>>(new Set());
  
  const updateCache = useCallback((index: number, data: { audioBlob: Blob; videoUrl: string | null }) => {
    cacheRef.current[index] = { ...data, timestamp: Date.now() };
    setCache({ ...cacheRef.current });
  }, []);
  
  /**
   * 生成语音和数字人视频
   * 使用服务端固定照片
   */
  const generateSpeech = useCallback(async (slideIndex: number) => {
    if (!volcanoService) {
      toast.error('语音服务未初始化');
      return null;
    }
    
    const script = speechScripts[slideIndex];
    if (!script) {
      console.warn(`第 ${slideIndex + 1} 页没有演讲稿`);
      return null;
    }
    
    if (generatingIndices.current.has(slideIndex)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return generateSpeech(slideIndex);
    }
    
    generatingIndices.current.add(slideIndex);
    
    try {
      // 1. 合成语音
      const audioBlob = await volcanoService.synthesize(script);
      
      // 2. 生成数字人视频（使用服务端固定照片）
      let videoUrl: string | null = null;
      // 始终尝试获取数字人视频
      try {
        const { avatarService } = await import('@/services/avatar.service');
        // 正常模式：每次都生成新的数字人视频
        // 如果要启用快速模式（复用已有视频），把第二个参数改为 true
        videoUrl = await avatarService.generateVideo({ audio: audioBlob }, false);
        if (videoUrl) {
        }
      } catch (err) {
        console.warn('[StreamingSpeech] 数字人视频生成失败，仅使用音频:', err);
      }
      
      updateCache(slideIndex, { audioBlob, videoUrl });
      
      return { audioBlob, videoUrl };
    } catch (err) {
      console.error(`[StreamingSpeech] 第 ${slideIndex + 1} 页生成失败:`, err);
      toast.error(`第 ${slideIndex + 1} 页语音生成失败`);
      return null;
    } finally {
      generatingIndices.current.delete(slideIndex);
    }
  }, [volcanoService, speechScripts, enabled, updateCache]);
  
  /**
   * 获取语音（优先从缓存）
   */
  const getSpeech = useCallback(async (slideIndex: number) => {
    // 检查缓存
    if (cacheRef.current[slideIndex]) {
      const cached = cacheRef.current[slideIndex];
      return { 
        audioBlob: cached.audioBlob, 
        videoUrl: cached.videoUrl 
      };
    }
    
    // 生成新的
    return generateSpeech(slideIndex);
  }, [generateSpeech]);
  
  /**
   * 预加载下一页
   */
  const preloadNext = useCallback(async (currentIndex: number) => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= speechScripts.length) return;
    if (cacheRef.current[nextIndex]) return;  // 已缓存
    
    setIsPreloading(true);
    try {
      await generateSpeech(nextIndex);
    } finally {
      setIsPreloading(false);
    }
  }, [speechScripts.length, generateSpeech]);
  
  /**
   * 清理缓存
   */
  const clearCache = useCallback(() => {
    // 释放视频 URL
    Object.values(cacheRef.current).forEach(item => {
      if (item.videoUrl) {
        URL.revokeObjectURL(item.videoUrl);
      }
    });
    cacheRef.current = {};
    setCache({});
  }, []);
  
  return {
    cachedIndices: Object.keys(cache).map(Number).sort((a, b) => a - b),
    isPreloading,
    getSpeech,
    preloadNext,
    clearCache,
  };
}
