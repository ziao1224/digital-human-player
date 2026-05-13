/**
 * 火山引擎语音合成服务 - Doubao-Seed-TTS 2.0
 * 通过后端代理解决 CORS 问题
 * 文档：https://www.volcengine.com/docs/6561/1329505
 */

import { SERVER_CONFIG } from '@/config/server.config';

export interface VolcanoSpeechConfig {
  appId: string;
  accessKey: string;
  speaker?: string;
  speedRatio?: number;
  contextTexts?: string[];
  sectionId?: string;
}

export class VolcanoSpeechService {
  private appId: string;
  private accessKey: string;
  private speaker: string;
  private speedRatio: number;
  private contextTexts?: string[];
  private sectionId?: string;
  
  // 后端代理地址
  private proxyUrl: string;
  
  // 当前播放的音频
  private currentAudio: HTMLAudioElement | null = null;
  
  // 推荐语音列表（2.0版本）
  static readonly SPEAKERS = {
    'zh_female_vv_saturn_bigtts': { name: '星悦（女声）', desc: '2.0活泼女声，青春灵动，推荐' },
    'zh_female_vv_uranus_bigtts': { name: '星念（女声）', desc: '2.0超自然女声，最自然' },
    'zh_female_xiaomo_mars_bigtts': { name: '小沫', desc: '自然女声' },
    'zh_male_vv_mars_bigtts': { name: '星朗（男声）', desc: '2.0超自然男声，沉稳成熟' },
    'zh_male_xiaochen_mars_bigtts': { name: '小辰（男声）', desc: '自然男声，成熟稳重' },
  };

  constructor(config: VolcanoSpeechConfig) {
    this.appId = config.appId;
    this.accessKey = config.accessKey;
    this.speaker = config.speaker || import.meta.env.VITE_VOLCANO_SPEAKER || 'zh_female_vv_uranus_bigtts';
    this.speedRatio = config.speedRatio || 1.1;
    this.contextTexts = config.contextTexts;
    this.sectionId = config.sectionId;
    
    // 使用后端代理
    this.proxyUrl = `${SERVER_CONFIG.BASE_URL}/api/volcano/tts`;
  }

  /**
   * 合成语音并播放
   */
  async speak(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
    if (!text || text.trim().length === 0) return;
    
    try {
      onStart?.();
      const audioBlob = await this.synthesize(text);
      await this.playAudio(audioBlob, onEnd);
    } catch (error) {
      console.error('火山语音合成失败:', error);
      throw error;
    }
  }

  /**
   * 合成语音（通过后端代理）
   */
  async synthesize(text: string): Promise<Blob> {
    // 构建请求体（发送到后端代理）
    const payload = {
      appId: this.appId,
      accessKey: this.accessKey,
      speaker: this.speaker,
      text: text,
      speed: this.speedRatio,
      contextTexts: this.contextTexts,
      sectionId: this.sectionId,
    };

    // 发送请求到后端代理
    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });


    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 代理错误:', errorText);
      throw new Error(`语音合成失败: ${errorText}`);
    }

    // 返回音频 Blob
    const audioBuffer = await response.arrayBuffer();
    
    if (audioBuffer.byteLength === 0) {
      throw new Error('音频数据为空');
    }

    // 从响应头获取 MIME 类型
    const contentType = response.headers.get('content-type') || 'audio/mpeg';

    // 检查音频大小（正常应该 > 10KB）
    if (audioBuffer.byteLength < 10000) {
      console.warn('⚠️ 音频数据异常小:', audioBuffer.byteLength, 'bytes，可能提取不完整');
    }

    // 使用响应头中的 MIME 类型创建 Blob
    const audioBlob = new Blob([audioBuffer], { type: contentType });
    return audioBlob;
  }

  /**
   * 播放音频
   */
  private playAudio(blob: Blob, onEnd?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      this.currentAudio = audio;
      
      audio.oncanplay = () => {
      };
      
      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        onEnd?.();
        resolve();
      };
      
      audio.onplay = () => {
      };
      
      audio.onerror = (e) => {
        console.error('❌ 音频播放错误:', e);
        console.error('❌ Audio error code:', audio.error?.code);
        console.error('❌ Audio error message:', audio.error?.message);
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        reject(new Error('音频播放失败'));
      };
      
      audio.play().catch(err => {
        console.error('❌ 播放失败:', err);
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        reject(err);
      });
    });
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
  }

  /**
   * 设置语音指令
   */
  setContextTexts(texts: string[]) {
    this.contextTexts = texts;
  }

  /**
   * 设置会话ID
   */
  setSectionId(id: string) {
    this.sectionId = id;
  }

  /**
   * 切换语音类型
   */
  setVoice(speaker: string) {
    this.speaker = speaker;
  }

  /**
   * 设置语速
   */
  setSpeed(speed: number) {
    this.speedRatio = speed;
  }

  /**
   * 测试 API 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const blob = await this.synthesize('你好，这是测试');
      return {
        success: true,
        message: `API 2.0 测试成功，收到 ${blob.size} bytes 音频`,
      };
    } catch (error) {
      return {
        success: false,
        message: `API 测试失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }
}

/**
 * 创建火山语音服务实例
 */
export function createVolcanoSpeechService(): VolcanoSpeechService | null {
  const appId = import.meta.env.VITE_VOLCANO_APP_ID;
  const accessKey = import.meta.env.VITE_VOLCANO_ACCESS_KEY;
  
  if (!appId || !accessKey) {
    return null;
  }

  if (appId === 'your_app_id_here' || accessKey === 'your_access_key_here') {
    return null;
  }
  
  const speaker = import.meta.env.VITE_VOLCANO_SPEAKER || 'zh_female_vv_uranus_bigtts';
  const speed = parseFloat(import.meta.env.VITE_VOLCANO_SPEED || '1.1');

  return new VolcanoSpeechService({
    appId,
    accessKey,
    speaker,
    speedRatio: speed,
  });
}
