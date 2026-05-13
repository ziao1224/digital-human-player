import { useState, useCallback, useRef, useEffect } from 'react';
import { Mic, MicOff, Volume2, Loader2, X, Minus, Maximize2, Brain } from 'lucide-react';
import { VolcanoRealtimeService, createVolcanoRealtimeService } from '@/services/volcano-realtime.service';
import { VolcanoSpeechService } from '@/services/volcano-speech.service';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { BOT_NAME, buildAutoKnowledgeRole, buildKnowledgeSystemPrompt } from '@/config/persona.config';
import { toast } from 'sonner';
import type { Slide } from '@/types';

interface RealtimeVoicePanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  slides?: Slide[];
  speechScripts?: string[];
  voiceKnowledge?: string;
  currentSlideIndex?: number;
  deepseekApiKey?: string;
  deepseekBaseURL?: string;
  deepseekModel?: string;
  volcanoTTSRef?: React.MutableRefObject<VolcanoSpeechService | null>;
}

/**
 * 构建基于PPT内容的知识提示词，控制在1200字符以内
 * 优先包含当前页附近的内容，让回答更精准
 */
const MAX_PROMPT_CHARS = 8000;

function buildPPTKnowledgePrompt(
  slides: Slide[],
  speechScripts: string[],
  currentIndex: number
): string {
  const role = buildAutoKnowledgeRole(currentIndex, slides.length);

  let body = '';
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const script = speechScripts[i] || '';
    const slideText = script || slide.content || '';
    const page = `\n【第${i + 1}页】${slide.title || ''}\n${slideText}`;
    if (body.length + page.length > MAX_PROMPT_CHARS - role.length - 100) break;
    body += page;
  }

  return `${role}\n\n=== PPT内容 ===${body}`;
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

export function RealtimeVoicePanel({
  isOpen,
  onClose,
  className = 'fixed bottom-4 right-4',
  slides = [],
  speechScripts = [],
  voiceKnowledge = '',
  currentSlideIndex = 0,
  deepseekApiKey = '',
  deepseekBaseURL = 'https://api.deepseek.com/v1',
  deepseekModel = 'deepseek-chat',
  volcanoTTSRef,
}: RealtimeVoicePanelProps) {
  // 如需恢复实时对话：把 'knowledge' 改成 'realtime'
  const [qaMode] = useState<'realtime' | 'knowledge'>('knowledge');
  void qaMode;
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [_isSupported, setIsSupported] = useState(true);
  void _isSupported;
  const [isRecording, setIsRecording] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const serviceRef = useRef<VolcanoRealtimeService | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const mountedRef = useRef(true);
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ====== 知识问答模式 (DeepSeek + TTS) ======

  const handleKnowledgeQuestion = useCallback(async (question: string) => {
    if (!deepseekApiKey) { toast.error('未配置 DeepSeek API Key'); return; }
    // 如果正在播放，先打断
    volcanoTTSRef?.current?.stop();
    speechSynthesis.cancel();
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setCurrentTranscript('');
    setVoiceStatus('thinking');

    let context = '';
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      const script = speechScripts[i] || '';
      context += `【第${i + 1}页】${s.title}\n${script || s.content}\n\n`;
    }
    // 手动知识库作为额外的补充知识追加在PPT内容后面
    if (voiceKnowledge.trim()) {
      context += `\n【补充知识】\n${voiceKnowledge.trim()}\n`;
    }
    context = context.slice(0, 16000);

    const systemPrompt = buildKnowledgeSystemPrompt(context);

    try {
      const res = await fetch(`${deepseekBaseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekApiKey}` },
        body: JSON.stringify({ model: deepseekModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: question }], temperature: 0.7, max_tokens: 500 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content?.trim();
      if (!answer) throw new Error('空回答');

      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
      setVoiceStatus('speaking');

      if (volcanoTTSRef?.current) {
        await volcanoTTSRef.current.speak(answer, () => setVoiceStatus('speaking'), () => {
          setVoiceStatus('listening');
          sr.startListening(); // 播完自动听下一轮
        });
      } else {
        const u = new SpeechSynthesisUtterance(answer); u.lang = 'zh-CN'; u.rate = 1.1;
        u.onend = () => {
          setVoiceStatus('listening');
          sr.startListening();
        };
        speechSynthesis.speak(u);
      }
      return;
    } catch (err) {
      toast.error('知识问答失败');
      setVoiceStatus('idle');
    }
  }, [deepseekApiKey, deepseekBaseURL, deepseekModel, slides, speechScripts, voiceKnowledge, volcanoTTSRef]);

  // 浏览器语音识别
  const sr = useSpeechRecognition({
    onResult: (text, isFinal) => {
      setCurrentTranscript(text);
      if (isFinal && text.trim()) handleKnowledgeQuestion(text.trim());
    },
  });

  const toggleKnowledgeRecording = useCallback(async () => {
    if (sr.isListening) { sr.stopListening(); setVoiceStatus('idle'); return; }
    if (voiceStatus === 'speaking') { volcanoTTSRef?.current?.stop(); speechSynthesis.cancel(); }

    // 检测麦克风
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some(d => d.kind === 'audioinput');
      if (!hasMic) { toast.error('未检测到麦克风，请接入后重试'); return; }
    } catch {}

    sr.startListening(); setVoiceStatus('listening');
  }, [sr, voiceStatus, volcanoTTSRef]);

  // ====== 实时对话模式 (Volcano Realtime) ======

  const createService = useCallback(() => {
    // 优先使用手动编辑的语音问答知识库
    let systemRole: string | undefined;
    if (voiceKnowledge.trim()) {
      systemRole = voiceKnowledge.trim().slice(0, MAX_PROMPT_CHARS);
    } else if (slides.length > 0) {
      systemRole = buildPPTKnowledgePrompt(slides, speechScripts, currentSlideIndex);
    }

    return createVolcanoRealtimeService({
      systemRole,
      onConnect: () => {
        if (!mountedRef.current) return;
        setConnectionState('connected');
        toast.success('已连接，请开始说话');
      },
      onDisconnect: () => {
        if (!mountedRef.current) return;
        setConnectionState('idle');
        setIsRecording(false);
        setVoiceStatus('idle');
      },
      onError: (error) => {
        if (!mountedRef.current) return;
        if (connectionState === 'connecting') {
          toast.error('语音服务连接失败: ' + error);
        }
        setConnectionState('error');
        setIsRecording(false);
        setVoiceStatus('idle');
      },
      onStatusChange: (status) => {
        if (!mountedRef.current) return;
        setVoiceStatus(status);
        if (status === 'idle') {
          setIsRecording(false);
        }
      },
      onTranscript: (text, isFinal) => {
        if (!mountedRef.current) return;
        setCurrentTranscript(text);
        if (isFinal && text.trim()) {
          setMessages(prev => [...prev, { role: 'user', text }]);
          setCurrentTranscript('');
        }
      },
      onResponse: (text) => {
        if (!mountedRef.current) return;
        if (text.trim()) {
          setMessages(prev => [...prev, { role: 'assistant', text }]);
        }
      },
    });
  }, [connectionState, slides, speechScripts, voiceKnowledge, currentSlideIndex]);

  const initConnection = useCallback(async () => {
    if (!mountedRef.current) return;
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    setConnectionState('connecting');
    const service = createService();
    if (!service) {
      setIsSupported(false);
      setConnectionState('error');
      toast.error('火山引擎Realtime API未配置');
      return;
    }
    serviceRef.current = service;
    try {
      const success = await service.startSession();
      if (success && mountedRef.current) {
        // 自动开始录音：延迟 800ms 确保 SessionStarted 事件已收到
        setTimeout(async () => {
          if (serviceRef.current && mountedRef.current) {
            const ok = await serviceRef.current.startRecording();
            if (ok && mountedRef.current) {
              setIsRecording(true);
            }
          }
        }, 800);
      } else if (!success && mountedRef.current) {
        setConnectionState('error');
      }
    } catch (error) {
      if (mountedRef.current) {
        setConnectionState('error');
      }
    }
  }, [createService]);

  useEffect(() => {
    if (!isOpen) {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
        serviceRef.current = null;
      }
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    // 知识问答模式不需要 Volcano Realtime 连接
    if (qaMode === 'knowledge') return;
    initRef.current = true;
    initConnection();
  }, [isOpen, initConnection, qaMode]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (serviceRef.current) {
        serviceRef.current.disconnect();
        serviceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 拖拽逻辑
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({ x: dragRef.current.initialX + dx, y: dragRef.current.initialY + dy });
    };
    const handleMouseUp = () => {
      dragRef.current.isDragging = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!serviceRef.current) {
      // initConnection 会自动开始录音，无需额外操作
      await initConnection();
      return;
    }
    if (voiceStatus === 'speaking') {
      serviceRef.current.stopPlaying();
    }
    try {
      await serviceRef.current.startRecording();
      setIsRecording(true);
    } catch (error) {
      toast.error('无法访问麦克风，请检查权限');
      setIsRecording(false);
    }
  }, [initConnection, voiceStatus]);

  const stopRecording = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.stopRecording();
    }
    setIsRecording(false);
  }, []);

  const _toggleRecording = useCallback(() => {
    if (isRecording) { stopRecording(); } else { startRecording(); }
  }, [isRecording, startRecording, stopRecording]);
  void _toggleRecording;

  const _reconnect = useCallback(() => {
    setMessages([]);
    setCurrentTranscript('');
    initConnection();
  }, [initConnection]);
  void _reconnect;

  const handleClose = useCallback(() => {
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
    }
    initRef.current = false;
    setConnectionState('idle');
    setVoiceStatus('idle');
    setIsRecording(false);
    setIsMinimized(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const _isConnected = connectionState === 'connected';
  void _isConnected;
  const _isConnecting = connectionState === 'connecting';
  void _isConnecting;
  const _isError = connectionState === 'error';
  void _isError;

  const handleButtonClick = () => {
    toggleKnowledgeRecording();
  };

  // 状态指示器
  const statusIndicator = () => {
    if (voiceStatus === 'listening') return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
          <Mic className="w-6 h-6 text-blue-400" />
        </div>
        <span className="text-xs font-medium text-blue-400">正在听你说话...</span>
        {currentTranscript && (
          <p className="text-sm text-white/60 italic max-w-[260px] text-center leading-relaxed">
            "{currentTranscript}"
          </p>
        )}
      </div>
    );
    if (voiceStatus === 'thinking') return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
        <span className="text-xs text-purple-400">正在思考...</span>
      </div>
    );
    if (voiceStatus === 'speaking') return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
          <Volume2 className="w-6 h-6 text-green-400 animate-pulse" />
        </div>
        <span className="text-xs text-green-400">回答中</span>
      </div>
    );
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center">
          <Brain className="w-6 h-6 text-purple-400/60" />
        </div>
        <span className="text-xs text-white/30">
          {messages.length === 0 ? '基于全部PPT内容，点击下方按钮开始提问' : '点击按钮继续提问'}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      className={`${className} z-[100] select-none`}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div className="bg-neutral-900/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden w-[360px]">
        {/* 标题栏 */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] cursor-move"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2.5">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-white/80">知识问答</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors">
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
            </button>
            <button onClick={handleClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div className="p-4 space-y-4">
            {/* 状态指示器 */}
            <div className="py-3">{statusIndicator()}</div>

            {/* 对话历史 */}
            {messages.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-white/[0.06] text-white/85 rounded-bl-md'
                    }`}>
                      <p className="text-[11px] opacity-50 mb-1">{msg.role === 'user' ? '你' : BOT_NAME}</p>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* 操作区 */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleButtonClick}
                disabled={voiceStatus === 'thinking'}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  voiceStatus === 'listening'
                    ? 'bg-red-500/90 hover:bg-red-500 text-white'
                    : voiceStatus === 'thinking'
                    ? 'bg-white/[0.04] text-white/30 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {sr.isListening ? (
                  <><MicOff className="w-4 h-4" />停止录音</>
                ) : voiceStatus === 'thinking' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />思考中</>
                ) : voiceStatus === 'speaking' ? (
                  <><Volume2 className="w-4 h-4" />打断</>
                ) : (
                  <><Mic className="w-4 h-4" />{messages.length === 0 ? '开始提问' : '继续提问'}</>
                )}
              </button>
              {messages.length > 0 && (
                <button onClick={() => setMessages([])}
                  className="px-3 py-2.5 rounded-xl text-xs text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors shrink-0">
                  清空
                </button>
              )}
            </div>

            {!sr.isSupported && (
              <p className="text-[11px] text-red-400/80 text-center bg-red-500/10 py-1.5 rounded-lg">
                浏览器不支持语音识别，请使用 Chrome 或 Edge
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
