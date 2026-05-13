// 数字人系统类型定义

export interface Slide {
  id: number;
  title: string;
  content: string;
  notes?: string;
  speechScript?: string; // AI 生成的演讲稿
  imageUrl?: string; // 幻灯片图片 URL
}

export interface PPTFile {
  id: string;
  name: string;
  slides: Slide[];
  uploadTime: Date;
}

export interface KnowledgeItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface DigitalHumanState {
  isSpeaking: boolean;
  currentSlide: number;
  isListening: boolean;
  emotion: 'neutral' | 'happy' | 'thinking' | 'speaking';
  isMuted: boolean;
}

export interface SpeechConfig {
  voiceId: string;
  speed: number;
  pitch: number;
}
