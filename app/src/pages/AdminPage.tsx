import { useState, useCallback, useEffect, useRef } from 'react';
import { Sparkles, Presentation, Volume2, VolumeX, Settings, MessageCircle, MonitorPlay, Save, BookOpen, FolderOpen, Trash2, RefreshCw, FileText, Video, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AvatarVideoPlayer } from '@/sections/AvatarVideoPlayer';
import { PPTUploaderWithImages } from '@/sections/PPTUploaderWithImages';
import { useDigitalHuman } from '@/hooks/useDigitalHuman';
import { useDeepseekAI } from '@/hooks/useDeepseekAI';
import { useBatchAvatar } from '@/hooks/useBatchAvatar';
import { avatarService } from '@/services/avatar.service';
import { cacheService } from '@/services/file-cache.service';
import { ScriptSettingsDialog } from '@/sections/ScriptSettingsDialog';
import { RealtimeVoicePanel } from '@/sections/RealtimeVoicePanel';
import { SERVER_CONFIG } from '@/config/server.config';
import { BOT_NAME } from '@/config/persona.config';
import type { Slide } from '@/types';

const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = import.meta.env.VITE_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = import.meta.env.VITE_DEEPSEEK_MODEL || 'deepseek-chat';

interface PPTImage {
  page: number;
  url: string;
  slideId: number;
}

export default function AdminPage() {
  const {
    state,
    slides,
    speechScripts,
    isGeneratingScripts,
    volcanoServiceRef,
    setCurrentSlide,
    loadSlides,
    setSpeechScripts,
    setGeneratingScripts,
    toggleMute,
  } = useDigitalHuman();

  const [, setPptFullText] = useState('');
  const [images, setImages] = useState<PPTImage[]>(() => {
    // 如果检测到服务器重启，不恢复数据
    if (localStorage.getItem('server_restarted') === 'true') {
      return [];
    }
    try {
      const stored = localStorage.getItem('ppt_images');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isUploading, setIsUploading] = useState(false);
  
  // 数字人相关状态
  const [avatarVideoUrl, setAvatarVideoUrl] = useState<string | null>(null);
  const [avatarServiceAvailable, setAvatarServiceAvailable] = useState(false);
  const [pptHash, setPptHash] = useState<string>('');
  
  // 自动播放控制
  const [autoPlay, setAutoPlay] = useState(false);
  const isAutoPlayingRef = useRef(false);
  const videoEndedResolveRef = useRef<(() => void) | null>(null);
  
  // 设置对话框
  const [showSettings, setShowSettings] = useState(false);
  
  // 语音问答面板
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  
  // 自定义提示词
  const [customScriptPrompt, setCustomScriptPrompt] = useState<string>('');

  // 语音问答知识库（手动编辑）
  const [voiceKnowledge, setVoiceKnowledge] = useState<string>('');
  const [voiceKnowledgeSaving, setVoiceKnowledgeSaving] = useState(false);
  const [knowledgeEditing, setKnowledgeEditing] = useState(false);
  const knowledgeBackupRef = useRef('');

  // 批量生成
  const {
    tasks: batchTasks,
    isBatching,
    isLoadingFromCache,
    progress: batchProgress,
    batchGenerate,
    generateSingleSlide,
    getSlideMedia,
    clearCache: clearBatchCache,
    clearFileCache,
    updateScript: updateBatchScript,
    generatingSlideIndex,
  } = useBatchAvatar({
    volcanoServiceRef,
    speechScripts,
    pptHash,
    enabled: avatarServiceAvailable,
  });

  const { 
    generateAllSpeechScripts
  } = useDeepseekAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: DEEPSEEK_BASE_URL,
    model: DEEPSEEK_MODEL,
  });

  // 已缓存的PPT列表
  const [cachedPPTs, setCachedPPTs] = useState<any[]>([]);
  const [loadingPPTList, setLoadingPPTList] = useState(false);

  const fetchPPTList = useCallback(async () => {
    setLoadingPPTList(true);
    try {
      const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/list`);
      if (res.ok) setCachedPPTs(await res.json());
    } catch {} finally { setLoadingPPTList(false); }
  }, []);

  const switchToPPT = useCallback(async (hash: string) => {
    try {
      const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${hash}/scripts`);
      if (!res.ok) { toast.error('加载失败'); return; }
      const data = await res.json();
      if (data.slides) {
        loadSlides(data.slides);
        setPptHash(hash);
        cacheService.setActivePPT(hash);
        if (data.scripts) setSpeechScripts(data.scripts);
        if (data.voiceKnowledge) setVoiceKnowledge(data.voiceKnowledge);
        if (data.images) {
          setImages(data.images);
          localStorage.setItem('ppt_images', JSON.stringify(data.images));
        }
        toast.success(`已切换到: ${data.slides[0]?.title || '未命名演示'}`);
      }
    } catch { toast.error('切换失败'); }
  }, [loadSlides, setSpeechScripts]);

  const deletePPT = useCallback(async (hash: string) => {
    if (!confirm(`删除此PPT的全部缓存？\n\n将删除演讲稿和所有视频文件。`)) return;
    try {
      const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${hash}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      toast.success('已删除');
      fetchPPTList();
      if (hash === pptHash) {
        loadSlides([]);
        setSpeechScripts([]);
        setPptHash('');
        setImages([]);
        setVoiceKnowledge('');
      }
    } catch (e) { toast.error('删除失败: ' + (e instanceof Error ? e.message : '')); }
  }, [pptHash, loadSlides, setSpeechScripts, fetchPPTList]);

  const clearVideosOnly = useCallback(async (hash: string) => {
    if (!confirm('清除所有视频缓存（磁盘 + 浏览器）？演讲稿会保留。')) return;
    try {
      // 清除后端磁盘文件
      const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${hash}/clear-videos`, { method: 'POST' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      // 清除 IndexedDB 媒体文件（保留元数据 slides/scripts/voiceKnowledge）
      const indexedCount = await cacheService.clearPPTMediaOnly(hash);
      toast.success(`已清除 ${data.deleted || 0} 个磁盘视频 + ${indexedCount} 个浏览器缓存`);
      fetchPPTList();
    } catch (e) { toast.error('清除失败: ' + (e instanceof Error ? e.message : '')); }
  }, [fetchPPTList]);

  const clearScriptsOnly = useCallback(async (hash: string) => {
    if (!confirm('只清除演讲稿？视频会保留。')) return;
    try {
      const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${hash}/clear-scripts`, { method: 'POST' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      toast.success('演讲稿已清除');
      fetchPPTList();
      if (hash === pptHash) { setSpeechScripts([]); }
    } catch (e) { toast.error('清除失败: ' + (e instanceof Error ? e.message : '')); }
  }, [pptHash, fetchPPTList]);

  const regenerateFromScripts = useCallback(async (hash: string) => {
    try {
      const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${hash}/scripts`);
      if (!res.ok) { toast.error('无演讲稿可用来重新生成'); return; }
      const data = await res.json();
      if (!data.scripts || data.scripts.length === 0) { toast.error('无演讲稿可用来重新生成'); return; }
      // 切换到该PPT并加载演讲稿
      if (data.slides) loadSlides(data.slides);
      setPptHash(hash);
      setSpeechScripts(data.scripts);
      if (data.voiceKnowledge) setVoiceKnowledge(data.voiceKnowledge);
      if (data.images) { setImages(data.images); localStorage.setItem('ppt_images', JSON.stringify(data.images)); }
      toast.success('演讲稿已加载，点击"生成视频"按钮开始');
    } catch { toast.error('加载失败'); }
  }, [loadSlides, setSpeechScripts]);

  useEffect(() => { fetchPPTList(); }, [fetchPPTList]);

  // 检查数字人服务
  useEffect(() => {
    const checkService = async () => {
      const status = await avatarService.checkHealth();
      setAvatarServiceAvailable(!!status);
    };
    checkService();
  }, []);

  // 页面切换后恢复缓存的 PPT 数据
  useEffect(() => {
    const restoreData = async () => {
      const meta = await cacheService.loadLatestMeta();
      if (meta) {
        loadSlides(meta.slides);
        setSpeechScripts(meta.speechScripts);
        setVoiceKnowledge(meta.voiceKnowledge || '');
        setPptHash(meta.pptHash);
        const imgStored = localStorage.getItem('ppt_images');
        if (imgStored) setImages(JSON.parse(imgStored));
      }
    };
    restoreData();
  }, []);

  // 加载默认知识库文件（如果存在且未手动编辑）
  useEffect(() => {
    if (voiceKnowledge.trim()) return; // 已有手动编辑的内容，不覆盖
    fetch('/knowledge/default.md')
      .then(res => res.ok ? res.text() : Promise.reject())
      .then(text => {
        if (text.trim()) {
          setVoiceKnowledge(text.trim());
        }
      })
      .catch(() => {});
  }, []);

  // PPT上传处理 - 带缓存检查
  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${SERVER_CONFIG.BASE_URL}/api/convert`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('PPT解析失败');
      }
      
      const result = await response.json();
      
      if (result.success && result.slides) {
        loadSlides(result.slides);

        const hash = result.contentHash || result.fileId || '';
        setPptHash(hash);
        cacheService.setActivePPT(hash);
        const cachedMeta = await cacheService.loadMeta(hash);

        if (cachedMeta) {
          toast.success('发现已缓存的演讲稿和数字人视频，正在加载...');
          setSpeechScripts(cachedMeta.speechScripts);
          setVoiceKnowledge(cachedMeta.voiceKnowledge || '');
        } else {
          // IndexedDB 无缓存，尝试后端文件夹缓存（跨机器迁移场景）
          const backendScriptsRes = await fetch(
            `${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${hash}/scripts`
          ).catch(() => null);
          if (backendScriptsRes?.ok) {
            const scriptsData = await backendScriptsRes.json();
            const backendScripts = scriptsData.scripts || [];
            if (backendScripts.length > 0) {
              setSpeechScripts(backendScripts);
              await cacheService.saveMeta(hash, result.slides, backendScripts, voiceKnowledge);
              toast.success('已从缓存加载演讲稿和视频（跨机器迁移）');
            } else {
              clearBatchCache();
              setSpeechScripts([]);
              await cacheService.saveMeta(hash, result.slides, [], voiceKnowledge);
              toast.success('PPT 上传成功，请点击"生成演讲稿"');
            }
          } else {
            clearBatchCache();
            setSpeechScripts([]);
            await cacheService.saveMeta(hash, result.slides, [], voiceKnowledge);
            toast.success('PPT 上传成功，请点击"生成演讲稿"');
          }
        }
        
        setImages(result.images || []);
        // 保存图片列表到 localStorage，供播放页面读取
        if (result.images) {
          localStorage.setItem('ppt_images', JSON.stringify(result.images));
        }
        setPptFullText(result.slides.map((s: Slide) => s.content).join('\n'));
        fetchPPTList();
      }
    } catch (error) {
      console.error('上传PPT失败:', error);
      toast.error('PPT上传失败');
    } finally {
      setIsUploading(false);
    }
  }, [loadSlides, setSpeechScripts, clearBatchCache, fetchPPTList]);

  // 生成演讲稿 - 使用 DeepSeek AI（不自动生成视频）
  const handleGenerateScripts = useCallback(async (forceRegenerate = false) => {
    if (slides.length === 0) {
      toast.error('请先上传 PPT');
      return;
    }
    
    if (!DEEPSEEK_API_KEY) {
      toast.error('未配置 DeepSeek API Key', { 
        description: '请在 .env 文件中配置 VITE_DEEPSEEK_API_KEY'
      });
      return;
    }
    
    setGeneratingScripts(true);
    toast.info(`${BOT_NAME}正在准备演讲稿，请稍候...`);
    
    try {
      if (forceRegenerate) {
        if (!confirm('将清空当前PPT的全部缓存（演讲稿+视频），确认重新生成？')) return;
        clearBatchCache();
        if (pptHash) {
          await clearFileCache();
        }
        toast.info('已清空旧缓存，将重新生成演讲稿');
      }
      
      const scripts = await generateAllSpeechScripts(
        slides.map(s => ({
          title: s.title,
          content: s.content,
          notes: s.notes
        })),
        customScriptPrompt || undefined
      );
      
      const validScripts = scripts.map((script, index) => 
        script || `这是第${index + 1}页的演讲内容`
      );
      
      setSpeechScripts(validScripts);
      
      await cacheService.saveMeta(pptHash, slides, validScripts, voiceKnowledge);

      // 同时保存演讲稿+PPT内容到后端文件缓存（用于跨机器迁移）
      fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${pptHash}/scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slides, scripts: validScripts, voiceKnowledge, images }),
      }).catch(() => {});

      toast.success('演讲稿生成完成！请确认修改后，再点击"生成视频"按钮');
      
      // 不再自动调用 batchGenerate()，让用户先确认演讲稿
    } catch (error) {
      console.error('生成演讲稿失败:', error);
      toast.error('生成演讲稿失败', {
        description: error instanceof Error ? error.message : '请检查 API Key 和网络连接'
      });
    } finally {
      setGeneratingScripts(false);
    }
  }, [slides, setSpeechScripts, setGeneratingScripts, generateAllSpeechScripts, clearBatchCache, clearFileCache, pptHash, customScriptPrompt]);

  // 清空当前PPT的文件缓存
  const handleClearFileCache = useCallback(async () => {
    if (!pptHash) return;
    if (!confirm('清空当前PPT的全部缓存（演讲稿+视频）？')) return;
    await clearFileCache();
    clearBatchCache();
    toast.success('已清空当前PPT的缓存');
  }, [pptHash, clearFileCache, clearBatchCache]);

  // 导入演讲稿
  const handleImportScripts = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        // 解析格式：=== 第 N 页 ===\n标题：xxx\n\n演讲稿：\nxxx\n\n
        const pageBlocks = text.split(/=== 第 \d+ 页 ===/).filter(b => b.trim());
        const imported: string[] = [];
        for (const block of pageBlocks) {
          const scriptMatch = block.match(/演讲稿：\s*\n([\s\S]*?)(?=\n\n===|$)/);
          if (scriptMatch) {
            imported.push(scriptMatch[1].trim());
          }
        }
        if (imported.length === 0) {
          toast.error('未识别到演讲稿内容，请检查文件格式');
          return;
        }
        // 对齐到当前slides
        const newScripts = slides.map((_, i) => imported[i] || speechScripts[i] || '');
        setSpeechScripts(newScripts);
        await cacheService.saveMeta(pptHash, slides, newScripts, voiceKnowledge);
        // 同时保存到后端文件缓存
        fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${pptHash}/scripts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slides, scripts: newScripts, voiceKnowledge, images }),
        }).catch(() => {});
        toast.success(`已导入 ${imported.length} 段演讲稿`);
      } catch {
        toast.error('文件读取失败');
      }
    };
    input.click();
  }, [slides, speechScripts, pptHash, voiceKnowledge, setSpeechScripts]);

  // 导出演讲稿为文本文件
  const handleExportScripts = useCallback(() => {
    if (speechScripts.length === 0) {
      toast.error('没有可导出的演讲稿');
      return;
    }
    
    const content = slides.map((slide, index) => {
      const script = speechScripts[index] || '（未生成）';
      return `=== 第 ${index + 1} 页 ===\n标题：${slide.title}\n\n演讲稿：\n${script}\n\n`;
    }).join('\n');
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `演讲稿_${new Date().toLocaleDateString()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('演讲稿已导出');
  }, [slides, speechScripts]);

  // 播放指定页面（自动播放模式）
  const playSlide = useCallback(async (index: number) => {
    if (!isAutoPlayingRef.current) return;
    
    setCurrentSlide(index);
    
    const media = getSlideMedia(index);
    
    if (media) {
      setAvatarVideoUrl(media.videoUrl);

      await new Promise<void>((resolve) => {
        videoEndedResolveRef.current = () => {
          videoEndedResolveRef.current = null;
          resolve();
        };
      });
      
      if (isAutoPlayingRef.current && index < slides.length - 1) {
        await new Promise(r => setTimeout(r, 500));
        await playSlide(index + 1);
      }
    } else {
      toast.error(`第 ${index + 1} 页视频未生成`);
    }
  }, [getSlideMedia, setCurrentSlide, slides.length]);

  // 播放单页视频（点击触发）
  const handlePlaySlideVideo = useCallback((index: number) => {
    const media = getSlideMedia(index);
    if (media) {
      setCurrentSlide(index);
      setAvatarVideoUrl(media.videoUrl);
      toast.success(`正在播放第 ${index + 1} 页`);
    } else {
      toast.error(`第 ${index + 1} 页视频未生成`, {
        description: '请先生成视频'
      });
    }
  }, [getSlideMedia, setCurrentSlide]);

  // 检查某页是否有视频
  const hasSlideVideo = useCallback((index: number): boolean => {
    return !!getSlideMedia(index);
  }, [getSlideMedia]);

  // 开始自动播放
  const startAutoPlay = useCallback(async () => {
    if (batchTasks.length === 0) {
      toast.error('请先生成演讲稿', { description: `点击左侧"生成演讲稿"按钮让${BOT_NAME}开始准备` });
      return;
    }
    if (batchTasks.filter(t => t.status === 'completed' || t.status === 'cached').length === 0) {
      toast.error(`请等待${BOT_NAME}的视频生成完成`, { description: '视频生成中，请稍后再试' });
      return;
    }
    
    isAutoPlayingRef.current = true;
    setAutoPlay(true);
    
    await playSlide(0);
    
    if (isAutoPlayingRef.current) {
      toast.success(`${BOT_NAME}讲解完成！`);
    }
    
    isAutoPlayingRef.current = false;
    setAutoPlay(false);
  }, [batchTasks, playSlide]);

  // 停止自动播放
  const stopAutoPlay = useCallback(() => {
    isAutoPlayingRef.current = false;
    setAutoPlay(false);
    videoEndedResolveRef.current?.();
    setAvatarVideoUrl(null);
  }, []);

  // 处理视频播放结束
  const handleVideoEnded = useCallback(() => {
    videoEndedResolveRef.current?.();
  }, []);

  // 处理演讲稿编辑
  const handleScriptEdit = useCallback(async (index: number, newScript: string) => {
    // 1. 更新演讲稿数组
    const newScripts = [...speechScripts];
    newScripts[index] = newScript;
    setSpeechScripts(newScripts);

    // 2. 保存到本地缓存
    await cacheService.saveMeta(pptHash, slides, newScripts, voiceKnowledge);

    // 3. 更新批量生成任务并清空该页面的视频缓存
    updateBatchScript(index, newScript);

    toast.success(`第 ${index + 1} 页演讲稿已更新，请重新生成视频`);
  }, [speechScripts, slides, setSpeechScripts, updateBatchScript, voiceKnowledge]);

  // 保存语音问答知识库
  const handleSaveVoiceKnowledge = useCallback(async () => {
    if (!pptHash) {
      toast.error('请先上传PPT');
      return;
    }
    setVoiceKnowledgeSaving(true);
    const success = await cacheService.updateVoiceKnowledge(pptHash, voiceKnowledge);
    setVoiceKnowledgeSaving(false);
    if (success) {
      toast.success('语音问答知识库已保存');
    } else {
      toast.error('保存失败，请确认PPT已上传');
    }
  }, [pptHash, voiceKnowledge]);

  // 生成视频 - 用户确认演讲稿后调用
  const handleGenerateVideos = useCallback(async () => {
    if (speechScripts.length === 0) {
      toast.error('请先生成演讲稿');
      return;
    }
    
    if (!avatarServiceAvailable) {
      toast.error('数字人服务未启动', { description: '请确保后端服务已启动' });
      return;
    }
    
    toast.info(`${BOT_NAME}开始生成数字人视频...`);
    await batchGenerate();
  }, [speechScripts.length, avatarServiceAvailable, batchGenerate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* 头部 */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-900">{BOT_NAME} - AI数字人演讲系统</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 生成进度 */}
            {isBatching && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                生成中 {Math.round(batchProgress)}%
              </span>
            )}

            {/* 操作组：导入+设置 */}
            {slides.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleImportScripts} className="gap-1.5 text-xs">
                <Upload className="w-3.5 h-3.5" /> 导入演讲稿
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5 text-xs">
              <Settings className="w-3.5 h-3.5" /> 演讲稿设置
            </Button>

            <div className="w-px h-6 bg-gray-200 mx-1" />

            {/* 入口组：问答+播放 */}
            <Button
              size="sm"
              onClick={() => setShowVoiceChat(!showVoiceChat)}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              语音问答
            </Button>
            <Link to="/player">
              <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                <MonitorPlay className="w-3.5 h-3.5" />
                进入播放
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左侧 - 数字人播放器 */}
          <div className="lg:col-span-4">
            <div className="sticky top-24">
              {/* 数字人视频区域 */}
              <div className="relative rounded-2xl overflow-hidden shadow-lg bg-black aspect-[3/4]">
                {avatarVideoUrl ? (
                  <AvatarVideoPlayer
                    videoUrl={avatarVideoUrl}
                    isGenerating={isBatching}
                    autoPlay={autoPlay}
                    isMuted={state.isMuted}
                    onToggleMute={toggleMute}
                    onEnded={handleVideoEnded}
                    hideControls={true}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-white/60">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 flex items-center justify-center text-4xl">
                        👩‍💼
                      </div>
                      <p className="text-sm">你好，我是{BOT_NAME}</p>
                      <p className="text-xs opacity-60 mt-1">
                        {isBatching ? '正在准备视频...' : '等待为你讲解'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* 播放控制按钮 */}
              <div className="mt-4 flex justify-center gap-3">
                {!autoPlay ? (
                  <Button
                    size="lg"
                    onClick={startAutoPlay}
                    disabled={isBatching || isLoadingFromCache || batchTasks.filter(t => t.status === 'completed' || t.status === 'cached').length === 0}
                    className="gap-2"
                  >
                    <Presentation className="w-4 h-4" />
                    {isBatching ? '准备中...' : '开始讲解'}
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="destructive"
                    onClick={stopAutoPlay}
                    className="gap-2"
                  >
                    <VolumeX className="w-4 h-4" />
                    停止讲解
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  size="lg"
                  onClick={toggleMute}
                  className="gap-2"
                >
                  {state.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {state.isMuted ? '静音' : '声音'}
                </Button>
              </div>
              
              {/* 缓存管理按钮 */}
              {batchTasks.filter(t => t.status === 'cached').length > 0 && (
                <div className="mt-2 text-center">
                  <p className="text-xs text-gray-500">
                    {batchTasks.filter(t => t.status === 'cached').length} 个页面来自缓存
                  </p>
                  <button
                    onClick={handleClearFileCache}
                    className="text-xs text-red-500 hover:text-red-600 mt-1 underline"
                  >
                    清空此PPT缓存
                  </button>
                </div>
              )}

              {/* 引导提示 */}
              {slides.length > 0 && batchTasks.length === 0 && !isLoadingFromCache && (
                <div className="mt-3 text-center">
                  <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg inline-block">
                    💡 请点击右侧"生成演讲稿"按钮让{BOT_NAME}准备讲解内容
                  </p>
                </div>
              )}
              
              {/* 缓存加载中提示 */}
              {isLoadingFromCache && (
                <div className="mt-3 text-center">
                  <p className="text-sm text-purple-600 bg-purple-50 px-4 py-2 rounded-lg inline-block animate-pulse">
                    📂 正在从缓存加载{BOT_NAME}的视频...
                  </p>
                </div>
              )}
              
              {/* 生成中提示 */}
              {isBatching && (
                <div className="mt-3 text-center">
                  <p className="text-sm text-blue-600 bg-blue-50 px-4 py-2 rounded-lg inline-block animate-pulse">
                    ⏳ {BOT_NAME}正在生成视频，请稍候... ({Math.round(batchProgress)}%)
                  </p>
                </div>
              )}
              
              {/* 生成完成提示 */}
              {!isBatching && !isLoadingFromCache && batchTasks.length > 0 && batchTasks.filter(t => t.status === 'completed' || t.status === 'cached').length === batchTasks.length && (
                <div className="mt-3 text-center">
                  <p className="text-sm text-green-600 bg-green-50 px-4 py-2 rounded-lg inline-block">
                    ✅ {BOT_NAME}已准备就绪（{batchTasks.filter(t => t.status === 'cached').length > 0 ? `包含 ${batchTasks.filter(t => t.status === 'cached').length} 个缓存` : '全部生成完成'}），可以点击"开始讲解"了
                  </p>
                </div>
              )}

              {/* 批量生成状态 */}
              {batchTasks.length > 0 && (
                <div className="mt-4 bg-white rounded-xl p-4 shadow-sm border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-700">生成进度</h3>
                    {batchTasks.filter(t => t.status === 'cached').length > 0 && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                        {batchTasks.filter(t => t.status === 'cached').length} 个已缓存
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {batchTasks.map((task) => (
                      <div key={task.slideIndex} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${
                          task.status === 'completed' || task.status === 'cached' ? 'bg-green-500' :
                          task.status === 'generating' ? 'bg-yellow-500 animate-pulse' :
                          task.status === 'error' ? 'bg-red-500' : 'bg-gray-300'
                        }`} />
                        <span className="flex-1">第 {task.slideIndex + 1} 页</span>
                        <span className="text-gray-400">
                          {task.status === 'completed' ? '完成' :
                           task.status === 'cached' ? '已缓存' :
                           task.status === 'generating' ? '生成中...' :
                           task.status === 'error' ? '失败' : '等待'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右侧内容区 */}
          <div className="lg:col-span-8 space-y-6">
            <PPTUploaderWithImages
              slides={slides}
              images={images}
              currentSlide={state.currentSlide}
              isSpeaking={autoPlay}
              isParsing={isUploading}
              speechScripts={speechScripts}
              isGeneratingScripts={isGeneratingScripts}
              isGeneratingVideos={isBatching}
              batchProgress={batchProgress}
              onUpload={handleUpload}
              onSlideChange={setCurrentSlide}
              onGenerateScripts={handleGenerateScripts}
              onGenerateVideos={handleGenerateVideos}
              onGenerateSlideVideo={generateSingleSlide}
              onExportScripts={handleExportScripts}
              onStartAutoPlay={startAutoPlay}
              onStop={stopAutoPlay}
              onScriptEdit={handleScriptEdit}
              onPlaySlideVideo={handlePlaySlideVideo}
              hasVideo={hasSlideVideo}
              generatingSlideIndex={generatingSlideIndex}
              autoPlay={autoPlay}
            />

            {/* 已缓存的PPT列表 */}
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-gray-800">PPT 缓存管理</h3>
                </div>
                <button
                  onClick={fetchPPTList}
                  disabled={loadingPPTList}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingPPTList ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>
              {cachedPPTs.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">暂无缓存的PPT，上传PPT并生成演讲稿后自动出现</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {cachedPPTs.map((ppt: any) => (
                    <div
                      key={ppt.hash}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-colors cursor-pointer ${
                        ppt.hash === pptHash
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-gray-100 hover:bg-gray-50'
                      }`}
                      onClick={() => switchToPPT(ppt.hash)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{ppt.meta?.title || ppt.title || '未命名演示'}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {ppt.meta?.totalSlides || ppt.totalSlides || '?'} 页
                          {ppt.videoCount !== undefined && ` · ${ppt.videoCount} 视频`}
                          {ppt.isComplete && ' · 完整'}
                          <span className="ml-1 text-gray-300">{ppt.hash?.slice(0, 8)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {ppt.hash === pptHash ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">当前</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">切换</span>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); clearVideosOnly(ppt.hash); }}
                          className="p-1 rounded text-gray-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                          title="只清除视频">
                          <Video className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); clearScriptsOnly(ppt.hash); }}
                          className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                          title="只清除演讲稿">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); regenerateFromScripts(ppt.hash); }}
                          className="p-1 rounded text-gray-300 hover:text-green-500 hover:bg-green-50 transition-colors"
                          title="重新基于演讲稿生成视频">
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); deletePPT(ppt.hash); }}
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="删除全部">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 语音问答知识库 - 手动编辑 */}
            {slides.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-800">语音问答知识库（可选）</h3>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 ml-auto">
                    {voiceKnowledge.length} 字
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  PPT 之外的补充知识。点击「编辑」修改，点「保存」生效。留空则仅使用 PPT 内容。
                </p>
                {knowledgeEditing ? (
                  <>
                    <Textarea
                      value={voiceKnowledge}
                      onChange={(e) => setVoiceKnowledge(e.target.value)}
                      className="min-h-[120px] text-sm resize-y"
                    />
                    <div className="flex items-center justify-between mt-3">
                      <button onClick={() => { setVoiceKnowledge(knowledgeBackupRef.current); setKnowledgeEditing(false); }} className="text-xs text-gray-400 hover:text-gray-600">取消编辑</button>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveVoiceKnowledge} disabled={voiceKnowledgeSaving} className="gap-1.5 text-xs">
                          <Save className="w-3.5 h-3.5" />
                          {voiceKnowledgeSaving ? '保存中...' : '保存知识库'}
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-h-[120px] max-h-[200px] overflow-y-auto bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap border">
                      {voiceKnowledge || <span className="text-gray-400">未设置知识库，将仅使用 PPT 内容。编辑 knowledge/default.md 文件可更改默认值。</span>}
                    </div>
                    <div className="flex justify-end mt-3">
                      <Button size="sm" variant="outline" onClick={() => { knowledgeBackupRef.current = voiceKnowledge; setKnowledgeEditing(true); }} className="gap-1.5 text-xs">
                        编辑
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      
      {/* 设置对话框 */}
      <ScriptSettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        customPrompt={customScriptPrompt}
        onPromptChange={setCustomScriptPrompt}
      />
      
      {/* 实时语音问答面板 */}
      <RealtimeVoicePanel
        isOpen={showVoiceChat}
        onClose={() => setShowVoiceChat(false)}
        slides={slides}
        speechScripts={speechScripts}
        voiceKnowledge={voiceKnowledge}
        currentSlideIndex={state.currentSlide}
        deepseekApiKey={DEEPSEEK_API_KEY}
        deepseekBaseURL={DEEPSEEK_BASE_URL}
        deepseekModel={DEEPSEEK_MODEL}
        volcanoTTSRef={volcanoServiceRef}
      />
    </div>
  );
}


