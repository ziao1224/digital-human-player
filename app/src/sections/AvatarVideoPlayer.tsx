import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AvatarVideoPlayerProps {
  videoUrl: string | null;
  isGenerating?: boolean;
  autoPlay?: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  onEnded?: () => void;
  hideControls?: boolean; // 隐藏播放控制，营造真实数字人效果
}

export function AvatarVideoPlayer({
  videoUrl,
  isGenerating = false,
  autoPlay = false,
  isMuted = false,
  onToggleMute,
  onEnded,
  hideControls = false,
}: AvatarVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);

  // 视频 URL 改变时重新加载
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) {
      queueMicrotask(() => {
        setIsLoaded(false);
        setIsPlaying(false);
      });
      return;
    }

    queueMicrotask(() => setIsLoaded(false));
    video.src = videoUrl;
    video.load();
  }, [videoUrl]);

  // 自动播放控制：autoPlay=true 时播放，autoPlay=false 时暂停
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isLoaded) return;

    if (autoPlay) {
      video.play().then(() => {
        queueMicrotask(() => setIsPlaying(true));
      }).catch(() => {
        queueMicrotask(() => setIsPlaying(false));
      });
    } else {
      video.pause();
      queueMicrotask(() => setIsPlaying(false));
    }
  }, [isLoaded, autoPlay]);

  // 静音控制
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = isMuted;
    }
  }, [isMuted]);

  // 静音指示器显示/隐藏
  useEffect(() => {
    if (isMuted && isPlaying) {
      queueMicrotask(() => setShowMuteIndicator(true));
      const timer = setTimeout(() => setShowMuteIndicator(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isMuted, isPlaying]);

  const handleLoadedData = () => {
    setIsLoaded(true);
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    onEnded?.();
  };

  const handleVideoError = () => {
    console.error('❌ Video error');
    setIsLoaded(false);
  };

  // 生成中状态
  if (isGenerating) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/80 text-sm">生成数字人中...</p>
        </div>
      </div>
    );
  }

  // 无视频状态
  if (!videoUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center text-white/60">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 flex items-center justify-center text-4xl">
            👤
          </div>
          <p className="text-sm">数字人准备就绪</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* 视频元素 - 全屏填充 */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted={isMuted}
        autoPlay={autoPlay}
        onLoadedData={handleLoadedData}
        onEnded={handleVideoEnded}
        onError={handleVideoError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
      
      {/* 加载中遮罩 - 简洁版 */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
      
      {/* 静音指示器 - 短暂显示后消失 */}
      {hideControls && showMuteIndicator && (
        <div className="absolute top-4 right-4 bg-black/50 rounded-full p-2 text-white/80">
          <VolumeX className="w-5 h-5" />
        </div>
      )}
      
      {/* 右上角静音按钮 - 仅隐藏控制模式下显示 */}
      {hideControls && (
        <button
          onClick={onToggleMute}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/70 hover:text-white transition-all opacity-0 hover:opacity-100"
          title={isMuted ? '取消静音' : '静音'}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      )}
      
      {/* 非隐藏控制模式 - 显示完整控制 */}
      {!hideControls && (
        <>
          {/* 播放控制遮罩 */}
          {!isPlaying && isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <Button
                variant="ghost"
                size="icon"
                className="w-16 h-16 rounded-full bg-white/90 hover:bg-white text-blue-600"
                onClick={() => videoRef.current?.play()}
              >
                <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </Button>
            </div>
          )}
          
          {/* 控制按钮 */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleMute}
              className="bg-white/90 hover:bg-white"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
