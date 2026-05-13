import { useEffect, useRef, useState } from 'react';
import type { DigitalHumanState } from '@/types';

interface DigitalHumanAvatarProps {
  state: DigitalHumanState;
}

// 嘴型配置（根据音频强度匹配不同的嘴型）- 预留用于真人图片模式
// const MOUTH_SHAPES = [
//   { name: 'closed', openness: 0, src: '/avatar/mouth-closed.png' },
//   { name: 'slight', openness: 0.3, src: '/avatar/mouth-slight.png' },
//   { name: 'medium', openness: 0.5, src: '/avatar/mouth-medium.png' },
//   { name: 'open', openness: 0.8, src: '/avatar/mouth-open.png' },
//   { name: 'wide', openness: 1.0, src: '/avatar/mouth-wide.png' },
// ];

export function DigitalHumanAvatar({ state }: DigitalHumanAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const [isBlinking, setIsBlinking] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState(0);
  
  // 模拟真人形象配置（可以替换为真实图片）
  const avatarConfig = {
    baseImage: '/avatar/base-face.png', // 基础脸部
    leftEye: '/avatar/left-eye.png',    // 左眼
    rightEye: '/avatar/right-eye.png',  // 右眼
    mouth: '/avatar/mouth.png',         // 嘴巴基础图
    body: '/avatar/body.png',           // 身体
  };

  // 检测当前是否有音频播放并分析音量
  useEffect(() => {
    if (state.isSpeaking) {
      // 尝试获取音频输出进行分析
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        
        // 分析音频数据
        const analyzeAudio = () => {
          if (!analyserRef.current || !state.isSpeaking) return;
          
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          
          // 计算平均音量
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const normalizedVolume = Math.min(average / 128, 1); // 0-1
          
          setMouthOpenness(normalizedVolume);
          
          if (state.isSpeaking) {
            requestAnimationFrame(analyzeAudio);
          }
        };
        
        analyzeAudio();
      } catch (e) {
        // 如果没有音频分析，使用模拟动画
        let startTime = Date.now();
        const simulateMouth = () => {
          if (!state.isSpeaking) {
            setMouthOpenness(0);
            return;
          }
          const elapsed = (Date.now() - startTime) / 1000;
          // 模拟说话时的嘴型变化
          const simulated = 0.3 + Math.sin(elapsed * 10) * 0.3 + Math.sin(elapsed * 23) * 0.2;
          setMouthOpenness(Math.max(0, Math.min(1, simulated)));
          requestAnimationFrame(simulateMouth);
        };
        simulateMouth();
      }
    } else {
      setMouthOpenness(0);
    }
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [state.isSpeaking]);

  // 眨眼动画
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (Math.random() > 0.7) { // 30%概率眨眼
        setIsBlinking(true);
        let start = Date.now();
        const doBlink = () => {
          const elapsed = Date.now() - start;
          if (elapsed < 150) {
            setBlinkPhase(elapsed / 150);
            requestAnimationFrame(doBlink);
          } else if (elapsed < 300) {
            setBlinkPhase(1 - (elapsed - 150) / 150);
            requestAnimationFrame(doBlink);
          } else {
            setIsBlinking(false);
            setBlinkPhase(0);
          }
        };
        doBlink();
      }
    }, 2000 + Math.random() * 3000); // 2-5秒随机眨眼
    
    return () => clearInterval(blinkInterval);
  }, []);

  // 绘制数字人
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 尝试加载真实图片
    const loadImages = async () => {
      const images: { [key: string]: HTMLImageElement } = {};
      const loadPromises = Object.entries(avatarConfig).map(([key, src]) => {
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            images[key] = img;
            resolve();
          };
          img.onerror = () => {
            resolve();
          };
          img.src = src;
        });
      });
      
      await Promise.all(loadPromises);
      return images;
    };

    const imagesPromise = loadImages();

    const animate = async () => {
      timeRef.current += 0.016;
      const time = timeRef.current;

      // 清空画布
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // 根据状态调整动画参数
      const isSpeaking = state.isSpeaking;
      const isThinking = state.emotion === 'thinking';
      
      // 呼吸效果（更自然的浮动）
      const breathOffset = Math.sin(time * 1.5) * 3;
      const speakBob = isSpeaking ? Math.sin(time * 8) * 2 : 0;
      const floatOffset = breathOffset + speakBob;
      
      // 微转头角度
      const headRotate = Math.sin(time * 0.5) * 0.02;

      ctx.save();
      ctx.translate(centerX, centerY + floatOffset);
      ctx.rotate(headRotate);

      // 尝试使用真实图片绘制
      const images = await imagesPromise;
      const hasImages = Object.keys(images).length > 0;

      if (hasImages) {
        // 使用真人图片绘制
        drawRealisticAvatar(ctx, images, {
          mouthOpenness,
          isBlinking,
          blinkPhase,
          isSpeaking,
          isThinking,
          time
        });
      } else {
        // 使用程序生成的拟真人形象
        drawProceduralAvatar(ctx, {
          mouthOpenness,
          isBlinking,
          blinkPhase,
          isSpeaking,
          isThinking,
          time
        });
      }

      ctx.restore();

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state.emotion, mouthOpenness, isBlinking, blinkPhase]);

  // 绘制拟真人形象（程序生成）
  const drawProceduralAvatar = (
    ctx: CanvasRenderingContext2D,
    params: {
      mouthOpenness: number;
      isBlinking: boolean;
      blinkPhase: number;
      isSpeaking: boolean;
      isThinking: boolean;
      time: number;
    }
  ) => {
    const { mouthOpenness, isBlinking, blinkPhase, isSpeaking, isThinking, time } = params;

    // 绘制身体（更自然的比例）
    const bodyGradient = ctx.createLinearGradient(0, 50, 0, 150);
    bodyGradient.addColorStop(0, '#3b82f6');
    bodyGradient.addColorStop(0.5, '#1d4ed8');
    bodyGradient.addColorStop(1, '#1e3a8a');
    
    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.moveTo(-50, 40);
    ctx.quadraticCurveTo(-60, 100, -40, 150);
    ctx.lineTo(40, 150);
    ctx.quadraticCurveTo(60, 100, 50, 40);
    ctx.closePath();
    ctx.fill();
    
    // 衣服领口
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, 50);
    ctx.quadraticCurveTo(0, 80, 30, 50);
    ctx.stroke();

    // 绘制头部（椭圆脸型）
    const faceGradient = ctx.createRadialGradient(0, -20, 0, 0, -20, 60);
    faceGradient.addColorStop(0, '#fde6d3');
    faceGradient.addColorStop(0.7, '#f5d0b0');
    faceGradient.addColorStop(1, '#e5b895');
    
    ctx.fillStyle = faceGradient;
    ctx.beginPath();
    ctx.ellipse(0, -20, 55, 70, 0, 0, Math.PI * 2);
    ctx.fill();

    // 头发
    const hairGradient = ctx.createLinearGradient(0, -90, 0, -30);
    hairGradient.addColorStop(0, '#2d3748');
    hairGradient.addColorStop(1, '#4a5568');
    
    ctx.fillStyle = hairGradient;
    ctx.beginPath();
    ctx.moveTo(-55, -40);
    ctx.quadraticCurveTo(-60, -100, 0, -95);
    ctx.quadraticCurveTo(60, -100, 55, -40);
    ctx.quadraticCurveTo(50, -60, 30, -55);
    ctx.quadraticCurveTo(0, -50, -30, -55);
    ctx.quadraticCurveTo(-50, -60, -55, -40);
    ctx.fill();

    // 绘制眼睛（更真实的形状）
    const eyeY = -35;
    const eyeSize = 12;
    
    // 眼白
    ctx.fillStyle = '#ffffff';
    
    // 左眼
    ctx.beginPath();
    ctx.ellipse(-22, eyeY, eyeSize + 3, eyeSize, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // 右眼
    ctx.beginPath();
    ctx.ellipse(22, eyeY, eyeSize + 3, eyeSize, 0, 0, Math.PI * 2);
    ctx.fill();

    // 瞳孔（跟随微动）
    const pupilOffset = Math.sin(time * 0.5) * 1;
    ctx.fillStyle = '#2d3748';
    
    if (isBlinking) {
      // 闭眼 - 绘制眼线
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-32, eyeY);
      ctx.quadraticCurveTo(-22, eyeY + 3 * blinkPhase, -12, eyeY);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(12, eyeY);
      ctx.quadraticCurveTo(22, eyeY + 3 * blinkPhase, 32, eyeY);
      ctx.stroke();
    } else {
      // 睁眼 - 绘制瞳孔
      ctx.beginPath();
      ctx.arc(-22 + pupilOffset, eyeY, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.beginPath();
      ctx.arc(22 + pupilOffset, eyeY, 6, 0, Math.PI * 2);
      ctx.fill();
      
      // 高光
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-20 + pupilOffset, eyeY - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(24 + pupilOffset, eyeY - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 眉毛
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    
    const browY = -50;
    const browOffset = isSpeaking ? Math.sin(time * 10) * 1 : 0;
    
    ctx.beginPath();
    ctx.moveTo(-35, browY);
    ctx.quadraticCurveTo(-22, browY - 5 + browOffset, -10, browY);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(10, browY);
    ctx.quadraticCurveTo(22, browY - 5 + browOffset, 35, browY);
    ctx.stroke();

    // 鼻子
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.quadraticCurveTo(-3, -10, -2, -5);
    ctx.stroke();

    // 嘴巴（根据口型开度动态调整）
    const mouthY = 5;
    const mouthWidth = 25;
    const mouthHeight = mouthOpenness * 15;
    
    ctx.fillStyle = '#e07878';
    ctx.strokeStyle = '#c45c5c';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    if (mouthOpenness < 0.1) {
      // 闭合嘴
      ctx.moveTo(-mouthWidth/2, mouthY);
      ctx.quadraticCurveTo(0, mouthY + 5, mouthWidth/2, mouthY);
      ctx.stroke();
    } else {
      // 张开嘴
      ctx.ellipse(0, mouthY, mouthWidth/2, mouthHeight, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      
      // 牙齿（张嘴时显示）
      if (mouthOpenness > 0.4) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-mouthWidth/2 + 2, mouthY - mouthHeight/2, mouthWidth - 4, mouthHeight/3);
      }
    }

    // 腮红
    ctx.fillStyle = 'rgba(255, 182, 193, 0.3)';
    ctx.beginPath();
    ctx.ellipse(-35, -5, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(35, -5, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 思考时的思考气泡
    if (isThinking) {
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.5;
      
      const bubbleX = 70;
      const bubbleY = -80;
      ctx.beginPath();
      ctx.arc(bubbleX, bubbleY, 25, 0, Math.PI * 2);
      ctx.stroke();
      
      // 省略号动画
      for (let i = 0; i < 3; i++) {
        const dotOpacity = (Math.sin(time * 3 + i * 1.5) + 1) / 2;
        ctx.fillStyle = `rgba(96, 165, 250, ${0.4 + dotOpacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(bubbleX - 8 + i * 8, bubbleY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 说话时添加声波效果
    if (isSpeaking && mouthOpenness > 0.3) {
      ctx.strokeStyle = `rgba(96, 165, 250, ${0.3 + mouthOpenness * 0.3})`;
      ctx.lineWidth = 1.5;
      
      for (let i = 0; i < 2; i++) {
        const waveRadius = 70 + i * 20 + mouthOpenness * 10;
        ctx.beginPath();
        ctx.arc(0, mouthY, waveRadius, 0.3, 2.8);
        ctx.stroke();
      }
    }
  };

  // 使用真实图片绘制
  const drawRealisticAvatar = (
    ctx: CanvasRenderingContext2D,
    images: { [key: string]: HTMLImageElement },
    params: {
      mouthOpenness: number;
      isBlinking: boolean;
      blinkPhase: number;
      isSpeaking: boolean;
      isThinking: boolean;
      time: number;
    }
  ) => {
    const { mouthOpenness } = params;
    
    // 绘制身体
    if (images.body) {
      ctx.drawImage(images.body, -80, 20, 160, 180);
    }
    
    // 绘制基础脸部
    if (images.baseImage) {
      ctx.drawImage(images.baseImage, -60, -90, 120, 140);
    }
    
    // 绘制左眼
    if (images.leftEye && !params.isBlinking) {
      ctx.drawImage(images.leftEye, -35, -45, 25, 20);
    }
    
    // 绘制右眼
    if (images.rightEye && !params.isBlinking) {
      ctx.drawImage(images.rightEye, 10, -45, 25, 20);
    }
    
    // 根据口型选择嘴部图片
    if (images.mouth) {
      // 如果有对应的嘴型图片就使用，否则使用缩放变形
      const mouthScale = 0.8 + mouthOpenness * 0.4;
      ctx.save();
      ctx.translate(0, 10);
      ctx.scale(1, mouthScale);
      ctx.drawImage(images.mouth, -20, -10, 40, 25);
      ctx.restore();
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="rounded-full"
      />
      <div className="mt-4 text-center">
        <p className="text-lg font-medium text-blue-600">
          {state.emotion === 'speaking' && '正在讲解...'}
          {state.emotion === 'thinking' && '思考中...'}
          {state.emotion === 'neutral' && '准备就绪'}
        </p>
        {state.isSpeaking && (
          <div className="flex items-center justify-center gap-1 mt-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1 h-4 bg-blue-500 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
