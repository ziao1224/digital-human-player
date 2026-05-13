/**
 * SadTalker 预生成管理 Hook
 * 
 * 特性：
 * 1. 演讲前批量生成所有页面的数字人视频
 * 2. 实时显示生成进度
 * 3. 缓存已生成的视频
 * 4. 支持中断和恢复
 */

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { VolcanoSpeechService } from '@/services/volcano-speech.service';

interface PreloadTask {
  slideIndex: number;
  script: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  videoUrl?: string;
  error?: string;
}

interface UsePreloadAvatarOptions {
  volcanoService: VolcanoSpeechService | null;
  avatarPhotoFile: File | null;
  speechScripts: string[];
}

export function usePreloadAvatar(options: UsePreloadAvatarOptions) {
  const { volcanoService, avatarPhotoFile, speechScripts } = options;
  
  const [tasks, setTasks] = useState<PreloadTask[]>([]);
  const [isPreloading, setIsPreloading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const abortRef = useRef(false);
  
  /**
   * 生成单页数字人视频
   */
  const generateSlideVideo = useCallback(async (slideIndex: number, script: string): Promise<string | null> => {
    if (!volcanoService || !avatarPhotoFile) {
      toast.error('语音服务或照片未准备好');
      return null;
    }
    
    try {
      // 1. 合成语音
      const audioBlob = await volcanoService.synthesize(script);
      
      // 2. 调用 SadTalker 服务生成视频
      const formData = new FormData();
      formData.append('image', avatarPhotoFile, 'avatar.png');
      formData.append('audio', audioBlob, 'speech.wav');
      formData.append('expression_scale', '1.0');
      formData.append('head_motion', 'full');
      
      const response = await fetch('http://localhost:8000/generate', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const videoBlob = await response.blob();
      const videoUrl = URL.createObjectURL(videoBlob);
      
      return videoUrl;
      
    } catch (error) {
      console.error(`[Preload] Slide ${slideIndex} failed:`, error);
      return null;
    }
  }, [volcanoService, avatarPhotoFile]);
  
  /**
   * 开始预生成所有页面
   */
  const startPreload = useCallback(async () => {
    if (!avatarPhotoFile || speechScripts.length === 0) {
      toast.error('请上传照片并生成演讲稿');
      return;
    }
    
    // 检查 SadTalker 服务
    try {
      const health = await fetch('http://localhost:8000/health');
      const healthData = await health.json();
      if (!healthData.sadtalker_installed) {
        toast.error('SadTalker 服务未安装');
        return;
      }
      if (!healthData.models_ready) {
        toast.error('SadTalker 模型未下载完成，请等待模型下载');
        return;
      }
    } catch {
      toast.error('SadTalker 服务未启动');
      return;
    }
    
    setIsPreloading(true);
    abortRef.current = false;
    
    // 初始化任务列表
    const initialTasks: PreloadTask[] = speechScripts.map((script, index) => ({
      slideIndex: index,
      script,
      status: 'pending',
    }));
    setTasks(initialTasks);
    
    // 逐个生成
    for (let i = 0; i < speechScripts.length; i++) {
      if (abortRef.current) {
        break;
      }
      
      setCurrentIndex(i);
      
      // 更新状态为生成中
      setTasks(prev => prev.map(t => 
        t.slideIndex === i ? { ...t, status: 'generating' } : t
      ));
      
      const videoUrl = await generateSlideVideo(i, speechScripts[i]);
      
      // 更新状态
      setTasks(prev => prev.map(t => 
        t.slideIndex === i ? { 
          ...t, 
          status: videoUrl ? 'completed' : 'error',
          videoUrl: videoUrl || undefined,
          error: videoUrl ? undefined : 'Generation failed'
        } : t
      ));
    }
    
    setIsPreloading(false);
    setCurrentIndex(-1);
    
    const completed = tasks.filter(t => t.status === 'completed').length;
    toast.success(`预生成完成！${completed}/${speechScripts.length} 页成功`);
    
  }, [speechScripts, avatarPhotoFile, generateSlideVideo, tasks]);
  
  /**
   * 停止预生成
   */
  const stopPreload = useCallback(() => {
    abortRef.current = true;
    setIsPreloading(false);
    toast.info('已停止预生成');
  }, []);
  
  /**
   * 获取指定页面的预生成视频
   */
  const getPreloadedVideo = useCallback((slideIndex: number): string | null => {
    const task = tasks.find(t => t.slideIndex === slideIndex);
    return task?.videoUrl || null;
  }, [tasks]);
  
  /**
   * 清理所有预生成视频
   */
  const clearPreloaded = useCallback(() => {
    tasks.forEach(t => {
      if (t.videoUrl) {
        URL.revokeObjectURL(t.videoUrl);
      }
    });
    setTasks([]);
    toast.info('已清理预生成视频');
  }, [tasks]);
  
  return {
    tasks,
    isPreloading,
    currentIndex,
    progress: tasks.length > 0 
      ? tasks.filter(t => t.status === 'completed' || t.status === 'error').length / tasks.length 
      : 0,
    startPreload,
    stopPreload,
    getPreloadedVideo,
    clearPreloaded,
    completedCount: tasks.filter(t => t.status === 'completed').length,
    totalCount: tasks.length,
  };
}
