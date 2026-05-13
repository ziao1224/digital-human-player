import { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX, Settings, MessageCircle, Monitor, SkipBack, SkipForward, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AvatarVideoPlayer } from '@/sections/AvatarVideoPlayer';
import { RealtimeVoicePanel } from '@/sections/RealtimeVoicePanel';
import { cacheService } from '@/services/file-cache.service';
import { BOT_NAME } from '@/config/persona.config';
import { SERVER_CONFIG } from '@/config/server.config';
import type { Slide } from '@/types';
import { Link } from 'react-router-dom';

interface PPTImage {
  page: number;
  url: string;
  slideId: number;
}

export default function PlayerPage() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [speechScripts, setSpeechScripts] = useState<string[]>([]);
  const [voiceKnowledge, setVoiceKnowledge] = useState<string>('');
  const [images, setImages] = useState<PPTImage[]>([]);
  const [pptHash, setPptHash] = useState<string>('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [avatarVideoUrl, setAvatarVideoUrl] = useState<string | null>(null);
  const [videoCache, setVideoCache] = useState<Map<number, { videoUrl: string; audioBlob: Blob }>>(new Map());
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [fabPosition, setFabPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('voice_fab_position');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: 0, y: 0 };
  });
  const isAutoPlayingRef = useRef(false);
  const videoEndedResolveRef = useRef<(() => void) | null>(null);
  const fabDragRef = useRef({ isDragging: false, hasMoved: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!fabDragRef.current.isDragging) return;
      const dx = e.clientX - fabDragRef.current.startX;
      const dy = e.clientY - fabDragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fabDragRef.current.hasMoved = true;
      setFabPosition({ x: fabDragRef.current.initialX + dx, y: fabDragRef.current.initialY + dy });
    };
    const handleMouseUp = () => {
      if (!fabDragRef.current.isDragging) return;
      fabDragRef.current.isDragging = false;
      if (!fabDragRef.current.hasMoved) setShowVoiceChat(prev => !prev);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('voice_fab_position', JSON.stringify(fabPosition));
  }, [fabPosition]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const meta = await cacheService.loadLatestMeta();
        if (meta) {
          setSlides(meta.slides);
          setSpeechScripts(meta.speechScripts);
          setVoiceKnowledge(meta.voiceKnowledge);
          setPptHash(meta.pptHash);
        } else {
          try {
            const listRes = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/list`);
            if (listRes.ok) {
              const list = await listRes.json();
              if (list.length > 0) {
                const latest = list[list.length - 1];
                setPptHash(latest.hash);
                if (latest.hasScripts) {
                  const scriptsRes = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${latest.hash}/scripts`);
                  if (scriptsRes.ok) {
                    const data = await scriptsRes.json();
                    if (data.slides) setSlides(data.slides);
                    if (data.scripts) setSpeechScripts(data.scripts);
                    if (data.voiceKnowledge) setVoiceKnowledge(data.voiceKnowledge);
                    if (data.images) { setImages(data.images); localStorage.setItem('ppt_images', JSON.stringify(data.images)); }
                  }
                }
              }
            }
          } catch {}
        }
        const imgStored = localStorage.getItem('ppt_images');
        if (imgStored) setImages(JSON.parse(imgStored));
      } catch (e) {
        console.error('[Player] 加载PPT数据失败:', e);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!pptHash || slides.length === 0) return;

    const loadVideos = async () => {
      setIsLoadingVideos(true);
      const loaded = new Map<number, { videoUrl: string; audioBlob: Blob }>();
      let loadedCount = 0;

      try {
        const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/ppt-cache/${pptHash}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.videos) {
            for (const video of data.videos) {
              const idx = video.slideIndex ?? parseInt(video.url?.match(/(\d+)$/)?.[1] || '0');
              loaded.set(idx, {
                videoUrl: SERVER_CONFIG.BASE_URL + video.url,
                audioBlob: new Blob(),
              });
              loadedCount++;
            }
          }
        }
      } catch {}

      for (let i = 0; i < slides.length; i++) {
        if (loaded.has(i)) continue;
        try {
          const cached = await cacheService.loadMedia(pptHash, i);
          if (cached) { loaded.set(i, { videoUrl: cached.videoUrl, audioBlob: cached.audioBlob }); loadedCount++; }
        } catch {}
      }

      setVideoCache(loaded);
      setIsLoadingVideos(false);
      if (loadedCount > 0 && loaded.has(0)) {
        const firstMedia = loaded.get(0)!;
        setCurrentSlide(0);
        setAvatarVideoUrl(firstMedia.videoUrl);
      } else if (slides.length > 0) {
        toast.info('尚未生成视频，请前往后台生成');
      }
    };

    loadVideos();
  }, [pptHash, slides.length]);

  const hasSlideVideo = useCallback((index: number) => videoCache.has(index), [videoCache]);
  const getSlideMedia = useCallback((index: number) => videoCache.get(index) || null, [videoCache]);

  const playSlideVideo = useCallback((index: number) => {
    const media = getSlideMedia(index);
    if (media) {
      setCurrentSlide(index);
      setAvatarVideoUrl(media.videoUrl);
    }
  }, [getSlideMedia]);

  const startAutoPlay = useCallback(async () => {
    if (slides.length === 0) { toast.error('没有可播放的PPT'); return; }
    if (videoCache.size === 0) { toast.error('没有可播放的视频，请前往后台生成'); return; }
    isAutoPlayingRef.current = true;
    setAutoPlay(true);

    const firstMissing = slides.findIndex((_, i) => !videoCache.has(i));
    const startFrom = firstMissing === -1 ? currentSlide : 0;

    for (let i = startFrom; i < slides.length && isAutoPlayingRef.current; i++) {
      setCurrentSlide(i);
      const media = getSlideMedia(i);
      if (media) {
        setAvatarVideoUrl(media.videoUrl);
        await new Promise<void>((resolve) => { videoEndedResolveRef.current = () => { videoEndedResolveRef.current = null; resolve(); }; });
      }
      if (isAutoPlayingRef.current && i < slides.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    if (isAutoPlayingRef.current) toast.success('讲解完成');
    isAutoPlayingRef.current = false;
    setAutoPlay(false);
  }, [slides, currentSlide, videoCache, getSlideMedia]);

  const stopAutoPlay = useCallback(() => {
    isAutoPlayingRef.current = false;
    setAutoPlay(false);
    videoEndedResolveRef.current?.();
  }, []);

  const handleVideoEnded = useCallback(() => { videoEndedResolveRef.current?.(); }, []);

  const toggleMute = useCallback(() => setIsMuted(prev => !prev), []);

  const handlePrevSlide = useCallback(() => {
    if (currentSlide > 0) {
      const idx = currentSlide - 1;
      setCurrentSlide(idx);
      if (autoPlay) playSlideVideo(idx);
    }
  }, [currentSlide, autoPlay, playSlideVideo]);

  const handleNextSlide = useCallback(() => {
    if (currentSlide < slides.length - 1) {
      const idx = currentSlide + 1;
      setCurrentSlide(idx);
      if (autoPlay) playSlideVideo(idx);
    }
  }, [currentSlide, slides.length, autoPlay, playSlideVideo]);

  const currentSlideData = slides[currentSlide] || null;
  const currentImage = images.find(img => img.slideId === currentSlide + 1);
  const totalVideoCount = videoCache.size;

  return (
    <div className="min-h-screen bg-neutral-950 text-white overflow-hidden">
      {/* 极简顶栏 */}
      <header className="fixed top-0 left-0 right-0 z-50 h-10 flex items-center justify-between px-4 bg-black/40 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Monitor className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-medium text-white/50 tracking-wide">演示播放</span>
          {slides.length > 0 && (
            <span className="text-[10px] text-white/20">|</span>
          )}
          {slides.length > 0 && (
            <span className="text-[10px] text-white/30 truncate max-w-[200px]">{slides[0]?.title || '未命名演示'}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoadingVideos && (
            <span className="text-[10px] text-white/30 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />加载视频中
            </span>
          )}
          <span className="text-[10px] text-white/20">
            {totalVideoCount > 0 ? `${totalVideoCount}/${slides.length} 页已缓存` : ''}
          </span>
          <Link to="/admin" className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors" title="后台管理">
            <Settings className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* 主体 */}
      <main className="pt-10 h-screen">
        {slides.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30">
            <div className="w-24 h-24 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
              <Monitor className="w-10 h-10" />
            </div>
            <p className="text-xl font-medium text-white/40 mb-2">暂无演示内容</p>
            <p className="text-sm text-white/20 mb-8">请先前往后台管理页面上传PPT并生成视频</p>
            <Link to="/admin">
              <Button className="gap-2" size="sm">前往后台管理</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
            {/* === 左侧：数字人视频 === */}
            <div className="lg:col-span-3 h-full flex flex-col bg-neutral-900/50 border-r border-white/[0.04]">
              {/* 视频区 */}
              <div className="flex-1 relative">
                {avatarVideoUrl ? (
                  <AvatarVideoPlayer
                    videoUrl={avatarVideoUrl}
                    isGenerating={false}
                    autoPlay={autoPlay}
                    isMuted={isMuted}
                    onToggleMute={toggleMute}
                    onEnded={handleVideoEnded}
                    hideControls={true}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-white/[0.06] flex items-center justify-center mb-4">
                      <span className="text-3xl">👩‍💼</span>
                    </div>
                    <p className="text-sm text-white/50 font-medium">你好，我是{BOT_NAME}</p>
                    <p className="text-[10px] text-white/20 mt-1">
                      {isLoadingVideos ? '正在加载视频...' : totalVideoCount === 0 ? '视频尚未生成' : '点击下方播放'}
                    </p>
                  </div>
                )}
              </div>

              {/* 控制栏 */}
              <div className="h-14 bg-neutral-900/80 backdrop-blur-sm border-t border-white/[0.04] flex items-center justify-center gap-3 px-3 shrink-0">
                <button onClick={handlePrevSlide} disabled={currentSlide === 0}
                  className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-10 transition-colors">
                  <SkipBack className="w-4 h-4" />
                </button>

                {!autoPlay ? (
                  <button onClick={startAutoPlay} disabled={totalVideoCount === 0 || isLoadingVideos}
                    className="flex items-center gap-2 px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-20 disabled:cursor-not-allowed text-sm font-medium transition-colors">
                    <Play className="w-4 h-4" />
                    开始讲解
                  </button>
                ) : (
                  <button onClick={stopAutoPlay}
                    className="flex items-center gap-2 px-5 py-2 rounded-full bg-red-600/80 hover:bg-red-500 text-sm font-medium transition-colors">
                    <Pause className="w-4 h-4" />
                    停止
                  </button>
                )}

                <button onClick={handleNextSlide} disabled={currentSlide === slides.length - 1}
                  className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] disabled:opacity-10 transition-colors">
                  <SkipForward className="w-4 h-4" />
                </button>

                <div className="w-px h-5 bg-white/[0.06]" />

                <button onClick={toggleMute}
                  className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-colors">
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                <span className="text-[11px] text-white/20 tabular-nums">
                  {currentSlide + 1}<span className="text-white/10">/</span>{slides.length}
                </span>
              </div>
            </div>

            {/* === 右侧：PPT 内容 === */}
            <div className="lg:col-span-9 h-full relative bg-neutral-950 overflow-hidden">
              {currentImage ? (
                <div className="relative w-full h-full flex items-center justify-center bg-neutral-900/30">
                  <img
                    src={`${SERVER_CONFIG.BASE_URL}${currentImage.url}`}
                    alt={`幻灯片 ${currentSlide + 1}`}
                    className="max-w-full max-h-full object-contain"
                  />
                  {/* 左右导航 */}
                  <button onClick={handlePrevSlide} disabled={currentSlide === 0}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm text-white/60 hover:text-white flex items-center justify-center disabled:opacity-0 transition-all">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={handleNextSlide} disabled={currentSlide === slides.length - 1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-sm text-white/60 hover:text-white flex items-center justify-center disabled:opacity-0 transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </button>

                </div>
              ) : currentSlideData ? (
                <div className="relative w-full h-full flex flex-col justify-center p-16 lg:p-24 overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/[0.02] rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-500/[0.02] rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />
                  <div className="relative z-10">
                    <p className="text-[11px] text-white/20 mb-4 tracking-widest uppercase">Slide {currentSlide + 1}</p>
                    <h2 className="text-3xl lg:text-4xl font-bold text-white mb-8 tracking-tight">{currentSlideData.title}</h2>
                    <div className="text-white/60 text-lg leading-relaxed whitespace-pre-line max-w-2xl">{currentSlideData.content}</div>
                  </div>
                  {/* 导航 */}
                  <button onClick={handlePrevSlide} disabled={currentSlide === 0}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white flex items-center justify-center disabled:opacity-0 transition-all">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={handleNextSlide} disabled={currentSlide === slides.length - 1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white flex items-center justify-center disabled:opacity-0 transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-white/20">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  <span>加载中...</span>
                </div>
              )}

              {/* 底部页面导航条 */}
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-4 py-2.5 border border-white/[0.04]">
                {slides.map((_, index) => {
                  const hasVid = hasSlideVideo(index);
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        setCurrentSlide(index);
                        if (hasVid) playSlideVideo(index);
                      }}
                      className={`rounded-full transition-all duration-200 ${
                        currentSlide === index
                          ? 'bg-white w-5 h-2'
                          : hasVid
                            ? 'bg-white/40 w-2 h-2 hover:bg-white/60'
                            : 'bg-white/10 w-2 h-2'
                      }`}
                      title={`第 ${index + 1} 页${hasVid ? '' : '（无视频）'}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 语音问答悬浮球 */}
      <div
        className="fixed bottom-6 right-6 z-[90] select-none"
        style={{ transform: `translate(${fabPosition.x}px, ${fabPosition.y}px)` }}
      >
        <RealtimeVoicePanel
          isOpen={showVoiceChat}
          onClose={() => setShowVoiceChat(false)}
          className="absolute bottom-[72px] right-0"
          slides={slides}
          speechScripts={speechScripts}
          voiceKnowledge={voiceKnowledge}
          currentSlideIndex={currentSlide}
        />

        <div
          onMouseDown={(e) => {
            e.preventDefault();
            fabDragRef.current = {
              isDragging: true, hasMoved: false,
              startX: e.clientX, startY: e.clientY,
              initialX: fabPosition.x, initialY: fabPosition.y,
            };
          }}
          className={`w-[72px] h-[72px] rounded-2xl shadow-2xl flex items-center justify-center cursor-pointer transition-all duration-300 ${
            showVoiceChat
              ? 'bg-white/[0.08] text-white/80 backdrop-blur-md border border-white/[0.06]'
              : 'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-blue-500/25'
          }`}
          title={showVoiceChat ? '关闭语音问答' : '语音问答'}
        >
          {showVoiceChat ? <X className="w-7 h-7" /> : <MessageCircle className="w-7 h-7" />}
        </div>
      </div>
    </div>
  );
}
