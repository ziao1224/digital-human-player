import { useState, useCallback, useRef, useEffect } from 'react';
import { createVolcanoSpeechService, VolcanoSpeechService } from '@/services/volcano-speech.service';

import type { DigitalHumanState, Slide, KnowledgeItem, ChatMessage } from '@/types';

export interface UseDigitalHumanReturn {
  state: DigitalHumanState;
  slides: Slide[];
  knowledgeBase: KnowledgeItem[];
  chatHistory: ChatMessage[];
  speechScripts: string[];
  isGeneratingScripts: boolean;
  currentVoice: string;
  availableVoices: { [key: string]: { name: string; desc: string } };
  volcanoServiceRef: React.MutableRefObject<VolcanoSpeechService | null>;
  setSpeaking: (isSpeaking: boolean) => void;
  setListening: (isListening: boolean) => void;
  setCurrentSlide: (index: number) => void;
  loadSlides: (newSlides: Slide[]) => void;
  addKnowledge: (item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => void;
  removeKnowledge: (id: string) => void;
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => ChatMessage;
  setSpeechScripts: (scripts: string[]) => void;
  setGeneratingScripts: (isGenerating: boolean) => void;
  setVoice: (voice: string) => void;
  speak: (text: string, onEnd?: () => void) => Promise<void>;
  stopSpeaking: () => void;
  speakWithAutoNext: (text: string, currentIndex: number, totalSlides: number, onNextSlide: () => void) => Promise<void>;
  toggleMute: () => void;
}

export function useDigitalHuman(): UseDigitalHumanReturn {
  const [state, setState] = useState<DigitalHumanState>({
    isSpeaking: false,
    currentSlide: 0,
    isListening: false,
    emotion: 'neutral',
    isMuted: false,
  });
  
  // 静音切换
  const toggleMute = useCallback(() => {
    setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
  }, [state.isMuted]);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<KnowledgeItem[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [speechScripts, setSpeechScripts] = useState<string[]>([]);
  const [isGeneratingScripts, setGeneratingScripts] = useState(false);
  const [currentVoice, setCurrentVoice] = useState(import.meta.env.VITE_VOLCANO_SPEAKER || 'zh_female_vv_uranus_bigtts');
  
  const volcanoServiceRef = useRef<VolcanoSpeechService | null>(null);

  // 初始化火山语音服务（只在组件挂载时运行一次）
  useEffect(() => {
    const appId = import.meta.env.VITE_VOLCANO_APP_ID;
    const accessKey = import.meta.env.VITE_VOLCANO_ACCESS_KEY;
    
    if (!appId || !accessKey) {
    } else {
    }

    // 创建服务
    const service = createVolcanoSpeechService();
    volcanoServiceRef.current = service;
    
    if (service) {
    }

    // 暴露测试函数到全局
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).testVolcano = async () => {
        if (volcanoServiceRef.current) {
          const result = await volcanoServiceRef.current.testConnection();
          return result;
        } else {
          console.error('❌ 火山语音服务未初始化');
        }
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const availableVoices = VolcanoSpeechService.SPEAKERS;

  const setSpeaking = useCallback((isSpeaking: boolean) => {
    setState(prev => ({ 
      ...prev, 
      isSpeaking,
      emotion: isSpeaking ? 'speaking' : 'neutral'
    }));
  }, []);

  const setListening = useCallback((isListening: boolean) => {
    setState(prev => ({ 
      ...prev, 
      isListening,
      emotion: isListening ? 'thinking' : 'neutral'
    }));
  }, []);

  const setCurrentSlide = useCallback((index: number) => {
    setState(prev => ({ ...prev, currentSlide: index }));
  }, []);

  const loadSlides = useCallback((newSlides: Slide[]) => {
    setSlides(newSlides);
    setState(prev => ({ ...prev, currentSlide: 0 }));
  }, []);

  // 生成唯一 ID
  const generateId = useCallback(() => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const addKnowledge = useCallback((item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => {
    const newItem: KnowledgeItem = {
      ...item,
      id: generateId(),
      createdAt: new Date(),
    };
    setKnowledgeBase(prev => [...prev, newItem]);
  }, [generateId]);

  const removeKnowledge = useCallback((id: string) => {
    setKnowledgeBase(prev => prev.filter(item => item.id !== id));
  }, []);

  const addChatMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: new Date(),
    };
    setChatHistory(prev => [...prev, newMessage]);
    return newMessage;
  }, [generateId]);

  const setSpeechScriptsState = useCallback((scripts: string[]) => {
    setSpeechScripts(scripts);
  }, []);

  const setGeneratingScriptsState = useCallback((isGenerating: boolean) => {
    setGeneratingScripts(isGenerating);
  }, []);

  const setVoice = useCallback((voice: string) => {
    setCurrentVoice(voice);
    if (volcanoServiceRef.current) {
      volcanoServiceRef.current.setVoice(voice);
    }
  }, []);

  /**
   * 语音播报（优先使用火山引擎，降级到浏览器）
   */
  const stopSpeaking = useCallback(() => {
    
    // 停止火山语音
    if (volcanoServiceRef.current) {
      volcanoServiceRef.current.stop();
    }
    
    // 停止浏览器语音
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    setSpeaking(false);
  }, [setSpeaking]);

  const speak = useCallback(async (text: string, onEnd?: () => void): Promise<void> => {
    if (!text) return;
    
    // 如果处于静音状态，直接返回
    if (state.isMuted) {
      onEnd?.();
      return;
    }
    
    // 停止之前的播报
    stopSpeaking();
    
    
    // 优先使用火山语音
    if (volcanoServiceRef.current) {
      try {
        setSpeaking(true);
        await volcanoServiceRef.current.speak(
          text,
          () => {
            setSpeaking(true);
          },
          () => {
            setSpeaking(false);
            onEnd?.();
          }
        );
        return;
      } catch (error) {
        console.error('❌ 火山语音失败，降级到浏览器语音:', error);
      }
    } else {
    }
    
    // 降级到浏览器内置语音
    if ('speechSynthesis' in window) {
      setSpeaking(true);
      
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.1; // 语速稍快
        utterance.pitch = 1.0;
        
        utterance.onend = () => {
          setSpeaking(false);
          onEnd?.();
          resolve();
        };
        
        utterance.onerror = () => {
          setSpeaking(false);
          resolve();
        };
        
        window.speechSynthesis.speak(utterance);
      });
    }
  }, [setSpeaking, state.isMuted, stopSpeaking]);

  /**
   * 语音播报（带自动翻页）
   */
  const speakWithAutoNext = useCallback(async (
    text: string, 
    currentIndex: number, 
    totalSlides: number,
    onNextSlide: () => void
  ): Promise<void> => {
    if (!text) return;
    
    await speak(text, () => {
      // 如果不是最后一页，自动翻页
      if (currentIndex < totalSlides - 1) {
        setTimeout(() => {
          onNextSlide();
        }, 1000);
      }
    });
  }, [speak]);

  // 全局键盘事件 - ESC 键停止语音
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopSpeaking();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stopSpeaking]);

  return {
    state,
    slides,
    knowledgeBase,
    chatHistory,
    speechScripts,
    isGeneratingScripts,
    currentVoice,
    availableVoices,
    volcanoServiceRef,
    setSpeaking,
    setListening,
    setCurrentSlide,
    loadSlides,
    addKnowledge,
    removeKnowledge,
    addChatMessage,
    setSpeechScripts: setSpeechScriptsState,
    setGeneratingScripts: setGeneratingScriptsState,
    setVoice,
    speak,
    stopSpeaking,
    speakWithAutoNext,
    toggleMute,
  };
}
