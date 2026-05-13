import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RealisticAvatarProps {
  isSpeaking: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export function RealisticAvatar({ isSpeaking, isMuted = false, onToggleMute }: RealisticAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 口型开度 (0-1)
  const [mouthOpenness, setMouthOpenness] = useState(0);
  // 眼睛睁开程度 (0-1，用于眨眼)
  const [eyeOpenness, setEyeOpenness] = useState(1);
  // 头部轻微偏移
  const [headOffset, setHeadOffset] = useState({ x: 0, y: 0 });
  
  // 音频分析
  useEffect(() => {
    if (!isSpeaking || isMuted) {
      setMouthOpenness(0);
      return;
    }
    
    // 模拟口型变化（如果没有音频输入）
    let startTime = Date.now();
    const simulateMouth = () => {
      if (!isSpeaking || isMuted) {
        setMouthOpenness(0);
        return;
      }
      
      const elapsed = (Date.now() - startTime) / 1000;
      // 模拟自然的说话节奏
      const base = 0.15;
      const variation = 0.4;
      const speed1 = Math.sin(elapsed * 8) * 0.5 + 0.5;
      const speed2 = Math.sin(elapsed * 13) * 0.3 + 0.7;
      const speed3 = Math.sin(elapsed * 5) * 0.2 + 0.8;
      
      const openness = base + variation * speed1 * speed2 * speed3;
      setMouthOpenness(Math.min(1, Math.max(0, openness)));
      
      requestAnimationFrame(simulateMouth);
    };
    
    simulateMouth();
  }, [isSpeaking, isMuted]);
  
  // 眨眼动画
  useEffect(() => {
    const blinkLoop = () => {
      // 随机间隔 2-6 秒眨眼
      const delay = 2000 + Math.random() * 4000;
      
      setTimeout(() => {
        // 闭眼过程 (150ms)
        let start = Date.now();
        const closeEye = () => {
          const elapsed = Date.now() - start;
          if (elapsed < 100) {
            setEyeOpenness(1 - elapsed / 100);
            requestAnimationFrame(closeEye);
          } else {
            // 睁眼过程 (150ms)
            const openStart = Date.now();
            const openEye = () => {
              const openElapsed = Date.now() - openStart;
              if (openElapsed < 100) {
                setEyeOpenness(openElapsed / 100);
                requestAnimationFrame(openEye);
              } else {
                setEyeOpenness(1);
                blinkLoop(); // 继续下一次眨眼
              }
            };
            openEye();
          }
        };
        closeEye();
      }, delay);
    };
    
    blinkLoop();
  }, []);
  
  // 头部微动（呼吸效果）
  useEffect(() => {
    const breathe = () => {
      const time = Date.now() / 1000;
      setHeadOffset({
        x: Math.sin(time * 0.5) * 2,
        y: Math.sin(time * 1.2) * 3 + Math.sin(time * 0.3) * 2
      });
      requestAnimationFrame(breathe);
    };
    breathe();
  }, []);
  
  return (
    <div className="flex flex-col items-center gap-4">
      {/* 头像容器 */}
      <div 
        ref={containerRef}
        className="relative w-64 h-80 rounded-2xl overflow-hidden shadow-lg bg-gradient-to-b from-blue-50 to-blue-100"
        style={{
          transform: `translate(${headOffset.x}px, ${headOffset.y}px)`,
          transition: 'transform 0.1s ease-out'
        }}
      >
        {/* 背景光环 */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: isSpeaking 
              ? 'radial-gradient(circle at center, rgba(59, 130, 246, 0.4) 0%, transparent 70%)'
              : 'radial-gradient(circle at center, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
            animation: isSpeaking ? 'pulse 2s ease-in-out infinite' : 'none'
          }}
        />
        
        {/* 真人照片占位 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-4">
            <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-200 to-blue-300 flex items-center justify-center">
              <span className="text-4xl">👤</span>
            </div>
            <p className="text-sm text-gray-500">放置真人照片到</p>
            <p className="text-xs text-gray-400">/public/avatar/photo.png</p>
          </div>
        </div>
        
        {/* 动态遮罩层 - 模拟口型和眨眼效果 */}
        <canvas
          ref={canvasRef}
          width={256}
          height={320}
          className="absolute inset-0 w-full h-full"
          style={{ 
            mixBlendMode: 'multiply',
            opacity: 0.3 // 半透明叠加
          }}
        />
        
        {/* 口型指示器（当说话时显示） */}
        {isSpeaking && !isMuted && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
            <div 
              className="w-16 bg-gradient-to-t from-pink-400 to-red-400 rounded-full transition-all duration-75"
              style={{ 
                height: `${8 + mouthOpenness * 24}px`,
                opacity: 0.6 + mouthOpenness * 0.4
              }}
            />
          </div>
        )}
        
        {/* 眼睛遮罩（眨眼效果） */}
        <div 
          className="absolute top-20 left-0 right-0 h-8 bg-gradient-to-b from-blue-50/80 to-transparent transition-all duration-75"
          style={{
            transform: `scaleY(${1 - eyeOpenness})`,
            opacity: 1 - eyeOpenness
          }}
        />
        
        {/* 状态指示 */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {isMuted ? (
            <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded">静音</span>
          ) : isSpeaking ? (
            <span className="flex items-center gap-1 text-xs bg-green-500 text-white px-2 py-0.5 rounded">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              讲解中
            </span>
          ) : null}
        </div>
      </div>
      
      {/* 控制按钮 */}
      <div className="flex items-center gap-2">
        <Button
          variant={isMuted ? "destructive" : "outline"}
          size="sm"
          onClick={onToggleMute}
          className="gap-2"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          {isMuted ? '已静音' : '声音开启'}
        </Button>
      </div>
      
      {/* 说明文字 */}
      <p className="text-xs text-gray-400 text-center max-w-xs">
        {isSpeaking 
          ? `口型开度: ${Math.round(mouthOpenness * 100)}%`
          : '准备就绪'}
      </p>
    </div>
  );
}
