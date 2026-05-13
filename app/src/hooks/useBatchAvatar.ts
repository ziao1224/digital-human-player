/**
 * 批量数字人视频生成 Hook
 * 为所有PPT页面批量生成数字人视频，支持内存缓存和持久化文件缓存
 */

import { useState, useRef, useCallback, type MutableRefObject, useEffect } from 'react';
import { toast } from 'sonner';
import { avatarService } from '@/services/avatar.service';
import { cacheService } from '@/services/file-cache.service';
import type { VolcanoSpeechService } from '@/services/volcano-speech.service';

interface BatchTask {
  slideIndex: number;
  script: string;
  status: 'pending' | 'generating' | 'completed' | 'error' | 'cached';
  videoUrl?: string;
  audioBlob?: Blob;
  error?: string;
}

interface UseBatchAvatarOptions {
  volcanoServiceRef: MutableRefObject<VolcanoSpeechService | null>;
  speechScripts: string[];
  pptHash?: string;
  enabled?: boolean;
}

export function useBatchAvatar(options: UseBatchAvatarOptions) {
  const { volcanoServiceRef, speechScripts, pptHash, enabled = true } = options;
  
  const [tasks, setTasks] = useState<BatchTask[]>([]);
  const [isBatching, setIsBatching] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(false);
  const [generatingSlideIndex, setGeneratingSlideIndex] = useState<number>(-1);
  const abortRef = useRef(false);
  const cacheRef = useRef<Map<number, { videoUrl: string; audioBlob: Blob }>>(new Map());
  const loadedHashRef = useRef<string>('');
  const backendClearingRef = useRef<Set<string>>(new Set());
  
  // 使用 ref 保存最新的 speechScripts，避免闭包问题
  const scriptsRef = useRef<string[]>(speechScripts);
  useEffect(() => {
    scriptsRef.current = speechScripts;
  }, [speechScripts]);
  
  // 跟踪演讲稿的版本号，用于判断是否需要重新生成
  const scriptVersionRef = useRef<Map<number, number>>(new Map());
  
  // 当 PPT 改变时，从持久化缓存加载
  useEffect(() => {
    const loadFromFileCache = async () => {
      if (!pptHash || pptHash === loadedHashRef.current) return;
      
      setIsLoadingFromCache(true);
      try {
        const cachedCount = await cacheService.getCachedSlideCount(pptHash);
        
        if (cachedCount > 0) {
          toast.success(`发现 ${cachedCount} 个已缓存的页面，正在加载...`);
          
          // 加载所有缓存的媒体
          const loadedTasks: BatchTask[] = [];
          for (let i = 0; i < speechScripts.length; i++) {
            const cached = await cacheService.loadMedia(pptHash, i);
            if (cached) {
              cacheRef.current.set(i, {
                videoUrl: cached.videoUrl,
                audioBlob: cached.audioBlob,
              });
              loadedTasks.push({
                slideIndex: i,
                script: speechScripts[i],
                status: 'cached',
                videoUrl: cached.videoUrl,
                audioBlob: cached.audioBlob,
              });
            } else {
              loadedTasks.push({
                slideIndex: i,
                script: speechScripts[i],
                status: 'pending',
              });
            }
          }
          
          setTasks(loadedTasks);
          const cachedTasks = loadedTasks.filter(t => t.status === 'cached');
          if (cachedTasks.length > 0) {
            setProgress((cachedTasks.length / speechScripts.length) * 100);
            toast.success(`已从缓存加载 ${cachedTasks.length}/${speechScripts.length} 个页面`);
          }
          loadedHashRef.current = pptHash;
        } else {
          // 没有缓存，重置任务
          setTasks(speechScripts.map((script, i) => ({
            slideIndex: i,
            script,
            status: 'pending',
          })));
          setProgress(0);
          loadedHashRef.current = pptHash;
        }
      } catch (error) {
        console.error('[BatchAvatar] Failed to load from cache:', error);
      } finally {
        setIsLoadingFromCache(false);
      }
    };
    
    loadFromFileCache();
  }, [pptHash, speechScripts]);
  
  // 生成单页视频
  const generateSlide = useCallback(async (slideIndex: number): Promise<{ videoUrl: string; audioBlob: Blob } | null> => {
    const volcanoService = volcanoServiceRef.current;
    if (!volcanoService) {
      toast.error('语音服务未初始化');
      return null;
    }
    
    // 获取当前演讲稿
    const script = scriptsRef.current[slideIndex];
    
    if (!script) {
      console.warn(`第 ${slideIndex + 1} 页没有演讲稿`);
      return null;
    }
    
    // 检查是否需要重新生成（版本号 > 0 表示演讲稿已修改）
    const version = scriptVersionRef.current.get(slideIndex) || 0;
    if (version > 0) {
    }
    
    try {
      // 1. 合成语音
      const audioBlob = await volcanoService.synthesize(script);
      
      // 2. 生成数字人视频
      const videoUrl = await avatarService.generateVideo({ 
        audio: audioBlob,
        pptHash: pptHash || undefined,
        slideIndex: slideIndex
      }, false);
      
      if (videoUrl) {
        const result = { videoUrl, audioBlob };
        cacheRef.current.set(slideIndex, result);
        
        // 3. 保存到文件缓存
        if (pptHash) {
          try {
            const videoResponse = await fetch(videoUrl);
            const videoBlob = await videoResponse.blob();
            await cacheService.saveMedia(pptHash, slideIndex, audioBlob, videoBlob);
          } catch (cacheError) {
            console.error('[BatchAvatar] 保存缓存失败:', cacheError);
          }
        }
        
        return result;
      }
      return null;
    } catch (err) {
      console.error(`[BatchAvatar] 第 ${slideIndex + 1} 页生成失败:`, err);
      return null;
    }
  }, [volcanoServiceRef, pptHash]);
  
  // 单页生成（独立调用，更新tasks状态）
  const generateSingleSlide = useCallback(async (slideIndex: number): Promise<boolean> => {
    const volcanoService = volcanoServiceRef.current;
    if (!volcanoService) {
      toast.error('语音服务未初始化');
      return false;
    }

    const script = scriptsRef.current[slideIndex];
    if (!script) {
      toast.error(`第 ${slideIndex + 1} 页没有演讲稿`);
      return false;
    }

    // 检查是否已有缓存且未修改
    const version = scriptVersionRef.current.get(slideIndex) || 0;
    const hasCache = cacheRef.current.has(slideIndex);
    if (version === 0 && hasCache) {
      toast.info(`第 ${slideIndex + 1} 页视频已存在`);
      return true;
    }

    setGeneratingSlideIndex(slideIndex);
    setTasks(prev => prev.map(t =>
      t.slideIndex === slideIndex ? { ...t, status: 'generating' } : t
    ));

    try {
      const result = await generateSlide(slideIndex);

      if (result) {
        setTasks(prev => prev.map(t =>
          t.slideIndex === slideIndex ? {
            ...t,
            status: 'completed',
            videoUrl: result.videoUrl,
            audioBlob: result.audioBlob,
          } : t
        ));
        scriptVersionRef.current.set(slideIndex, 0);
        toast.success(`第 ${slideIndex + 1} 页视频生成完成`);
        return true;
      } else {
        setTasks(prev => prev.map(t =>
          t.slideIndex === slideIndex ? { ...t, status: 'error', error: '生成失败' } : t
        ));
        toast.error(`第 ${slideIndex + 1} 页视频生成失败`);
        return false;
      }
    } catch (err) {
      console.error(`[BatchAvatar] 第 ${slideIndex + 1} 页生成异常:`, err);
      setTasks(prev => prev.map(t =>
        t.slideIndex === slideIndex ? { ...t, status: 'error', error: '生成异常' } : t
      ));
      toast.error(`第 ${slideIndex + 1} 页视频生成异常`);
      return false;
    } finally {
      setGeneratingSlideIndex(-1);
    }
  }, [volcanoServiceRef, generateSlide]);

  // 批量生成所有页面
  const batchGenerate = useCallback(async () => {
    const currentScripts = scriptsRef.current;
    
    if (!enabled || !volcanoServiceRef.current || currentScripts.length === 0) {
      return;
    }
    
    setIsBatching(true);
    abortRef.current = false;
    
    // 初始化任务列表
    const newTasks: BatchTask[] = currentScripts.map((script, i) => {
      // 如果演讲稿版本号 > 0（已修改过）或没有缓存，状态为 pending
      const version = scriptVersionRef.current.get(i) || 0;
      const hasCache = cacheRef.current.has(i);
      const needsRegen = version > 0 || !hasCache;
      
      return {
        slideIndex: i,
        script,
        status: needsRegen ? 'pending' : 'cached',
        videoUrl: needsRegen ? undefined : cacheRef.current.get(i)?.videoUrl,
        audioBlob: needsRegen ? undefined : cacheRef.current.get(i)?.audioBlob,
      };
    });
    
    setTasks(newTasks);
    
    // 计算需要生成的页面数
    const pendingCount = newTasks.filter(t => t.status === 'pending').length;
    
    if (pendingCount === 0) {
      toast.success('所有页面已是最新，无需重新生成！');
      setIsBatching(false);
      setProgress(100);
      return;
    }
    
    
    // 找到第一个需要生成的页面
    const startIndex = newTasks.findIndex(t => t.status === 'pending');
    if (startIndex === -1) {
      toast.success('所有页面已生成！');
      setIsBatching(false);
      setProgress(100);
      return;
    }
    
    // 并行生成：每次最多 3 页同时进行
    const CONCURRENCY = 2;
    const pending: number[] = [];
    for (let i = startIndex; i < currentScripts.length; i++) {
      const version = scriptVersionRef.current.get(i) || 0;
      const hasCache = cacheRef.current.has(i);
      if (version === 0 && hasCache) continue;
      pending.push(i);
    }

    const updateProgress = () => {
      const done = currentScripts.filter((_, i) => {
        const version = scriptVersionRef.current.get(i) || 0;
        return version === 0 && cacheRef.current.has(i);
      }).length;
      setProgress((done / currentScripts.length) * 100);
    };

    const processSlide = async (i: number) => {
      if (abortRef.current) return;
      setTasks(prev => prev.map(t => t.slideIndex === i ? { ...t, status: 'generating' } : t));
      try {
        const result = await generateSlide(i);
        if (result) {
          setTasks(prev => prev.map(t => t.slideIndex === i ? { ...t, status: 'completed', videoUrl: result.videoUrl, audioBlob: result.audioBlob } : t));
          scriptVersionRef.current.set(i, 0);
        } else {
          setTasks(prev => prev.map(t => t.slideIndex === i ? { ...t, status: 'error', error: '生成失败' } : t));
        }
      } catch {
        setTasks(prev => prev.map(t => t.slideIndex === i ? { ...t, status: 'error', error: '生成异常' } : t));
      }
      updateProgress();
    };

    try {
      let idx = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
        while (idx < pending.length && !abortRef.current) {
          const i = pending[idx++];
          await processSlide(i);
        }
      });
      await Promise.all(workers);

      if (!abortRef.current) {
        toast.success('批量生成完成！');
      }
    } finally {
      setIsBatching(false);
      setCurrentIndex(-1);
    }
  }, [enabled, generateSlide, volcanoServiceRef]);
  
  // 获取指定页面的视频和音频
  const getSlideMedia = useCallback((slideIndex: number): { videoUrl: string; audioBlob: Blob } | null => {
    return cacheRef.current.get(slideIndex) || null;
  }, []);
  
  // 停止批量生成
  const stopBatch = useCallback(() => {
    abortRef.current = true;
    setIsBatching(false);
  }, []);
  
  // 清空缓存
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    scriptVersionRef.current.clear();
    setTasks([]);
    setProgress(0);
    loadedHashRef.current = '';
  }, []);

  // 清空文件缓存
  const clearFileCache = useCallback(async () => {
    if (pptHash) {
      await cacheService.clearPPTCache(pptHash);
      toast.success('已清空文件缓存');
    }
  }, [pptHash]);

  // 更新指定页面的演讲稿并标记需要重新生成
  const updateScript = useCallback(async (slideIndex: number, newScript: string) => {
    
    // 更新 ref 中的 script
    scriptsRef.current[slideIndex] = newScript;
    
    // 更新 tasks 中的 script
    setTasks(prev => prev.map(t => 
      t.slideIndex === slideIndex ? { ...t, script: newScript, status: 'pending' } : t
    ));
    
    // 清空该页面的内存缓存
    if (cacheRef.current.has(slideIndex)) {
      cacheRef.current.delete(slideIndex);
    }
    
    // 递增版本号，标记需要重新生成
    const currentVersion = scriptVersionRef.current.get(slideIndex) || 0;
    scriptVersionRef.current.set(slideIndex, currentVersion + 1);
    
    // 清空前端 IndexedDB 缓存
    if (pptHash) {
      await cacheService.clearSlideCache(pptHash, slideIndex);
    }
    
    // 清空后端文件缓存
    if (pptHash) {
      const cacheKey = `${pptHash}_${slideIndex}`;
      backendClearingRef.current.add(cacheKey);
      await avatarService.clearSlideCache(pptHash, slideIndex);
      backendClearingRef.current.delete(cacheKey);
    }
  }, [pptHash]);
  
  return {
    tasks,
    isBatching,
    isLoadingFromCache,
    currentIndex,
    generatingSlideIndex,
    progress,
    batchGenerate,
    generateSingleSlide,
    getSlideMedia,
    stopBatch,
    clearCache,
    clearFileCache,
    updateScript,
  };
}
