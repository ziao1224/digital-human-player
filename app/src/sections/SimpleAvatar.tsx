/**
 * 简化版数字人 - Canvas 动画
 * 无需 AI 模型，根据音频音量驱动嘴巴开合
 */

import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SimpleAvatarProps {
  isSpeaking: boolean;
  isMuted?: boolean;
  onToggleMute?: () => void;
  audioStream?: MediaStream | null; // 用于实时分析音频
}

export function SimpleAvatar({ 
  isSpeaking, 
  isMuted = false, 
  onToggleMute,
  audioStream 
}: SimpleAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const [blinkState, setBlinkState] = useState(0);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // 初始化音频分析
  useEffect(() => {
    if (audioStream && isSpeaking && !isMuted) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioContext.createMediaStreamSource(audioStream);
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      return () => {
        audioContext.close();
      };
    }
  }, [audioStream, isSpeaking, isMuted]);

  // 绘制数字人
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;

      // 清空画布
      ctx.fillStyle = '#f0f9ff';
      ctx.fillRect(0, 0, width, height);

      // 绘制背景圆圈
      ctx.beginPath();
      ctx.arc(centerX, centerY - 20, 120, 0, Math.PI * 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.fill();

      // 绘制头部
      ctx.beginPath();
      ctx.arc(centerX, centerY - 30, 80, 0, Math.PI * 2);
      ctx.fillStyle = '#fde68a'; // 肤色
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 绘制头发
      ctx.beginPath();
      ctx.arc(centerX, centerY - 50, 80, Math.PI, 0);
      ctx.fillStyle = '#451a03';
      ctx.fill();

      // 眼睛（考虑眨眼）
      const eyeY = centerY - 50;
      const eyeOffset = 30;
      
      // 左眼
      ctx.beginPath();
      if (blinkState > 0.5) {
        // 闭眼 - 画线
        ctx.moveTo(centerX - eyeOffset - 15, eyeY);
        ctx.lineTo(centerX - eyeOffset + 15, eyeY);
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        // 睁眼
        ctx.arc(centerX - eyeOffset, eyeY, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 眼珠
        ctx.beginPath();
        ctx.arc(centerX - eyeOffset + 3, eyeY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#1e3a8a';
        ctx.fill();
        
        // 高光
        ctx.beginPath();
        ctx.arc(centerX - eyeOffset + 5, eyeY - 2, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      // 右眼
      ctx.beginPath();
      if (blinkState > 0.5) {
        ctx.moveTo(centerX + eyeOffset - 15, eyeY);
        ctx.lineTo(centerX + eyeOffset + 15, eyeY);
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.arc(centerX + eyeOffset, eyeY, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath();
        ctx.arc(centerX + eyeOffset + 3, eyeY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#1e3a8a';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(centerX + eyeOffset + 5, eyeY - 2, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }

      // 眉毛
      ctx.beginPath();
      ctx.moveTo(centerX - eyeOffset - 15, eyeY - 25);
      ctx.quadraticCurveTo(centerX - eyeOffset, eyeY - 35, centerX - eyeOffset + 15, eyeY - 25);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX + eyeOffset - 15, eyeY - 25);
      ctx.quadraticCurveTo(centerX + eyeOffset, eyeY - 35, centerX + eyeOffset + 15, eyeY - 25);
      ctx.stroke();

      // 鼻子
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 30);
      ctx.lineTo(centerX - 5, centerY - 10);
      ctx.lineTo(centerX + 5, centerY - 10);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 嘴巴（根据音量开合）
      const mouthY = centerY + 10;
      const mouthWidth = 40;
      const mouthHeight = 5 + mouthOpenness * 20; // 0-25 的开合度

      // 嘴唇
      ctx.beginPath();
      ctx.ellipse(centerX, mouthY, mouthWidth / 2, mouthHeight, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f472b6'; // 粉色嘴唇
      ctx.fill();
      ctx.strokeStyle = '#db2777';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 口腔内部（当张开时）
      if (mouthHeight > 8) {
        ctx.beginPath();
        ctx.ellipse(centerX, mouthY, mouthWidth / 2 - 5, mouthHeight - 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#7f1d1d'; // 深红色口腔
        ctx.fill();
        
        // 舌头
        ctx.beginPath();
        ctx.ellipse(centerX, mouthY + 3, 10, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#fca5a5';
        ctx.fill();
      }

      // 绘制身体/衣服
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + 110, 70, 40, 0, Math.PI, 0);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 领带
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY + 70);
      ctx.lineTo(centerX + 10, centerY + 70);
      ctx.lineTo(centerX, centerY + 110);
      ctx.closePath();
      ctx.fillStyle = '#dc2626';
      ctx.fill();
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [mouthOpenness, blinkState]);

  // 分析音频音量
  useEffect(() => {
    if (!isSpeaking || isMuted || !analyserRef.current) {
      setMouthOpenness(0);
      return;
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // 计算平均音量
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;
      
      // 归一化到 0-1
      const normalized = Math.min(average / 128, 1);
      setMouthOpenness(normalized);
      
      requestAnimationFrame(updateVolume);
    };

    updateVolume();
  }, [isSpeaking, isMuted]);

  // 随机眨眼
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      setBlinkState(1);
      setTimeout(() => setBlinkState(0), 150);
    }, 3000 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, []);

  // 如果没有音频流，使用模拟动画
  useEffect(() => {
    if (!audioStream && isSpeaking && !isMuted) {
      const interval = setInterval(() => {
        setMouthOpenness(Math.random() * 0.6 + 0.2);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [audioStream, isSpeaking, isMuted]);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={256}
        height={320}
        className="rounded-2xl shadow-lg bg-gradient-to-b from-blue-50 to-blue-100"
      />
      
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

      {isSpeaking && !isMuted && (
        <div className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          讲解中
        </div>
      )}
    </div>
  );
}
