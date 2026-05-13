/**
 * 火山引擎端到端实时语音大模型服务
 * 通过本地 WebSocket 代理连接
 * 
 * 代理返回的消息格式:
 * - JSON: { type: 'event', eventId: number, data: object }
 * - 音频: ArrayBuffer (PCM s16le)
 * - 连接状态: { type: 'connected'|'disconnected'|'error', ... }
 */

import { toast } from 'sonner';
import { SERVER_CONFIG } from '@/config/server.config';
import { REALTIME_SYSTEM_ROLE, SPEAKING_STYLE, BOT_NAME } from '@/config/persona.config';

const REALTIME_WS_URL = `${SERVER_CONFIG.BASE_URL.replace('http', 'ws')}/api/realtime`;

// 服务端事件ID映射 (根据火山引擎文档)
const SERVER_EVENTS = {
  SessionStarted: 150,
  SessionFinished: 152,
  SessionFailed: 153,
  UsageResponse: 154,
  ConfigUpdated: 251,
  TTSSentenceStart: 350,
  TTSSentenceEnd: 351,
  TTSResponse: 352,
  TTSEnded: 359,
  ASRInfo: 450,
  ASRResponse: 451,
  ASREnded: 459,
  ChatResponse: 550,
  ChatTextQueryConfirmed: 553,
  ChatEnded: 559,
  DialogCommonError: 599,
} as const;

export interface RealtimeConfig {
  appId: string;
  accessKey: string;
  model?: string;
  speaker?: string;
  botName?: string;
  systemRole?: string;
  speakingStyle?: string;
}

export interface RealtimeCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: 'idle' | 'listening' | 'thinking' | 'speaking') => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onResponse?: (text: string) => void;
}

export class VolcanoRealtimeService {
  private ws: WebSocket | null = null;
  private config: RealtimeConfig;
  private callbacks: RealtimeCallbacks;
  private isConnected: boolean = false;
  private isSessionActive: boolean = false;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  
  private audioQueue: AudioBuffer[] = [];
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private status: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle';

  constructor(config: RealtimeConfig, callbacks: RealtimeCallbacks = {}) {
    this.config = {
      model: '1.2.1.1',
      speaker: import.meta.env.VITE_VOLCANO_REALTIME_SPEAKER || 'zh_female_vv_jupiter_bigtts',
      botName: BOT_NAME,
      systemRole: REALTIME_SYSTEM_ROLE,
      speakingStyle: SPEAKING_STYLE,
      ...config,
    };
    this.callbacks = callbacks;
  }

  private setStatus(status: 'idle' | 'listening' | 'thinking' | 'speaking') {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  async connect(): Promise<boolean> {
    if (this.isConnected) return true;

    const url = `${REALTIME_WS_URL}?appId=${encodeURIComponent(this.config.appId)}&accessKey=${encodeURIComponent(this.config.accessKey)}`;
    
    return new Promise((resolve) => {
      let resolved = false;
      
      const doResolve = (value: boolean) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        const timeout = setTimeout(() => {
          console.error('[Realtime] 连接超时');
          doResolve(false);
        }, 15000);

        this.ws.onopen = () => {
        };

        this.ws.onmessage = (event) => {
          // 如果是JSON消息，检查是否是connected事件
          if (typeof event.data === 'string') {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'connected' && !this.isConnected) {
                clearTimeout(timeout);
                this.isConnected = true;
                this.callbacks.onConnect?.();
                doResolve(true);
              }
            } catch {}
          }
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[Realtime] WebSocket错误:', error);
          this.callbacks.onError?.('连接错误');
          doResolve(false);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.isSessionActive = false;
          this.setStatus('idle');
          this.callbacks.onDisconnect?.();
          doResolve(false);
        };

      } catch (error) {
        console.error('[Realtime] 连接失败:', error);
        doResolve(false);
      }
    });
  }

  private handleMessage(data: ArrayBuffer | string): void {
    try {
      if (typeof data === 'string') {
        const message = JSON.parse(data);
        this.handleJSONMessage(message);
      } else {
        // 二进制数据 = 音频
        this.handleAudioData(data);
      }
    } catch (error) {
      console.error('[Realtime] 解析消息失败:', error);
    }
  }

  private handleJSONMessage(message: any): void {

    switch (message.type) {
      case 'connected':
        if (!this.isConnected) {
          this.isConnected = true;
          this.callbacks.onConnect?.();
        }
        break;

      case 'disconnected':
        break;

      case 'error':
        console.error('[Realtime] 错误:', message.message);
        this.callbacks.onError?.(message.message);
        break;

      case 'event':
        this.handleVolcanoEvent(message.eventId, message.data);
        break;

      default:
    }
  }

  private handleVolcanoEvent(eventId: number, data: any): void {
    switch (eventId) {
      case SERVER_EVENTS.SessionStarted:
        this.isSessionActive = true;
        break;

      case SERVER_EVENTS.SessionFailed:
        console.error('[Realtime] 会话失败:', data.error);
        this.callbacks.onError?.(data.error || '会话启动失败');
        break;

      case SERVER_EVENTS.ASRInfo:
        // 用户开始说话，打断AI播报
        this.stopPlaying();
        this.setStatus('listening');
        break;

      case SERVER_EVENTS.ASRResponse: {
        const text = data.results?.[0]?.text || '';
        const isInterim = data.results?.[0]?.is_interim ?? false;
        this.callbacks.onTranscript?.(text, !isInterim);
        if (!isInterim && text.trim()) {
          this.setStatus('thinking');
        }
        break;
      }

      case SERVER_EVENTS.ASREnded:
        break;

      case SERVER_EVENTS.TTSSentenceStart:
        this.setStatus('speaking');
        break;

      case SERVER_EVENTS.TTSSentenceEnd:
        break;

      case SERVER_EVENTS.TTSEnded:
        this.setStatus('idle');
        break;

      case SERVER_EVENTS.ChatResponse: {
        const text = data.content || '';
        if (text.trim()) {
          this.callbacks.onResponse?.(text);
        }
        break;
      }

      case SERVER_EVENTS.ChatEnded:
        break;

      case SERVER_EVENTS.DialogCommonError:
        console.error('[Realtime] 对话错误:', data.status_code, data.message);
        this.callbacks.onError?.(data.message || '对话错误');
        break;

      default:
    }
  }

  private handleAudioData(data: ArrayBuffer): void {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext({ sampleRate: 24000 });
      }

      const audioBuffer = this.pcmToAudioBuffer(data, 24000, 1);
      this.audioQueue.push(audioBuffer);
      
      if (!this.isPlaying) {
        this.playNextAudio();
      }
    } catch (error) {
      console.error('[Realtime] 处理音频失败:', error);
    }
  }

  private pcmToAudioBuffer(pcmData: ArrayBuffer, sampleRate: number, channels: number): AudioBuffer {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate });
    }

    const int16Array = new Int16Array(pcmData);
    const frameCount = int16Array.length / channels;
    const audioBuffer = this.audioContext.createBuffer(channels, frameCount, sampleRate);

    for (let ch = 0; ch < channels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        const sample = int16Array[i * channels + ch];
        channelData[i] = sample / 32768.0;
      }
    }

    return audioBuffer;
  }

  private async playNextAudio(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;

    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      source.onended = () => {
        this.currentSource = null;
        this.playNextAudio();
      };

      source.start();
      this.currentSource = source;
    } catch (error) {
      console.error('[Realtime] 播放音频失败:', error);
      this.playNextAudio();
    }
  }

  async startSession(): Promise<boolean> {
    if (!this.isConnected) {
      const connected = await this.connect();
      if (!connected) {
        toast.error('连接失败，请检查网络');
        return false;
      }
    }

    const startPayload = {
      event: 'start_session',
      dialog: {
        bot_name: this.config.botName || BOT_NAME,
        system_role: this.config.systemRole || REALTIME_SYSTEM_ROLE,
        speaking_style: this.config.speakingStyle || '你说话温柔自然，像朋友一样亲切，语速适中，带有一些语气词让对话更生动。',
        extra: {
          model: this.config.model || '1.2.1.1',
          input_mod: 'keep_alive',
        },
      },
      asr: {
        audio_info: {
          format: 'pcm',
          sample_rate: 16000,
          channel: 1,
        },
      },
      tts: {
        speaker: this.config.speaker || 'zh_female_vv_jupiter_bigtts',
        audio_config: {
          format: 'pcm_s16le',
          sample_rate: 24000,
          channel: 1,
        },
      },
    };

    this.sendJSON(startPayload);
    
    return true;
  }

  async startRecording(): Promise<boolean> {
    if (!this.isConnected) {
      console.warn('[Realtime] 未连接，无法录音');
      return false;
    }
    
    if (!this.isSessionActive) {
      const success = await this.startSession();
      if (!success) {
        console.warn('[Realtime] 会话启动失败，无法录音');
        return false;
      }
    }
    
    // 如果已经在录音，先停止
    if (this.scriptProcessor) {
      this.stopRecording();
    }
    
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      this.scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = this.float32ToInt16(inputData);
        this.sendAudio(pcmData.buffer as ArrayBuffer);
      };

      this.setStatus('listening');
      return true;
      
    } catch (error) {
      console.error('[Realtime] 录音失败:', error);
      toast.error('无法访问麦克风，请检查权限');
      this.setStatus('idle');
      return false;
    }
  }

  stopRecording(): void {
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private sendJSON(data: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private sendAudio(pcmData: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcmData);
    }
  }

  sendText(text: string): void {
    const payload = {
      event: 'chat_text',
      text: text,
    };
    this.sendJSON(payload);
    this.setStatus('thinking');
  }

  private float32ToInt16(floatArray: Float32Array): Int16Array {
    const int16Array = new Int16Array(floatArray.length);
    for (let i = 0; i < floatArray.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArray[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  stopPlaying(): void {
    if (this.currentSource) {
      try { this.currentSource.stop(); } catch (e) {}
      this.currentSource = null;
    }
    this.audioQueue = [];
    this.isPlaying = false;
  }

  finishSession(): void {
    this.sendJSON({ event: 'finish_session' });
    this.isSessionActive = false;
    this.stopRecording();
    this.stopPlaying();
  }

  disconnect(): void {
    this.stopRecording();
    this.stopPlaying();
    
    if (this.isSessionActive) {
      this.sendJSON({ event: 'finish_session' });
      this.isSessionActive = false;
    }
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendJSON({ event: 'finish_connection' });
      }
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.setStatus('idle');
  }

  getStatus(): 'idle' | 'listening' | 'thinking' | 'speaking' {
    return this.status;
  }

  isRecording(): boolean {
    return this.scriptProcessor !== null;
  }
}

export function createVolcanoRealtimeService(
  options?: RealtimeCallbacks & Partial<Omit<RealtimeConfig, 'appId' | 'accessKey'>>
): VolcanoRealtimeService | null {
  const appId = import.meta.env.VITE_VOLCANO_APP_ID;
  const accessKey = import.meta.env.VITE_VOLCANO_ACCESS_KEY;

  if (!appId || !accessKey) {
    console.warn('⚠️ 火山引擎Realtime API未配置');
    return null;
  }

  const {
    onConnect, onDisconnect, onError, onStatusChange, onTranscript, onResponse,
    ...configOverrides
  } = options || {};

  const callbacks: RealtimeCallbacks = {
    onConnect, onDisconnect, onError, onStatusChange, onTranscript, onResponse,
  };

  return new VolcanoRealtimeService(
    { appId, accessKey, ...configOverrides },
    callbacks
  );
}
