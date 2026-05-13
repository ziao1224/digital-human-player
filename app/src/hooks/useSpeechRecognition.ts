import { useState, useCallback, useRef, useEffect } from 'react';

interface UseSpeechRecognitionOptions {
  onResult?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  language?: string;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { onResult, onError, language = 'zh-CN' } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const resultCallbackRef = useRef(onResult);
  resultCallbackRef.current = onResult;

  useEffect(() => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    setIsSupported(true);
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript;
      const isFinal = last.isFinal;
      setTranscript(text);
      resultCallbackRef.current?.(text, isFinal);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      onError?.(event.error);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
  }, [language]);

  const startListening = useCallback(async () => {
    if (!recognitionRef.current) {
      onError?.('SpeechRecognition not supported');
      return;
    }
    try {
      await recognitionRef.current.start();
      setIsListening(true);
    } catch (err) {
      // May already be started
    }
  }, [onError]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, transcript, isSupported, startListening, stopListening };
}
