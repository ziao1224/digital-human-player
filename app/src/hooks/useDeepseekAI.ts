import { useState, useCallback } from 'react';
import { SCRIPT_WRITER_PROMPT, TEXT_CHAT_SYSTEM_PROMPT } from '@/config/persona.config';

interface UseDeepseekAIOptions {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}


export function useDeepseekAI(options: UseDeepseekAIOptions) {
  const { apiKey, baseURL = 'https://api.deepseek.com/v1', model = 'deepseek-chat' } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 发送聊天请求（简化版，直接传入上下文）
   */
  const chat = useCallback(async (
    question: string,
    context: string
  ): Promise<string | null> => {
    if (!apiKey) {
      setError('未配置 API Key');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const systemPrompt = `${TEXT_CHAT_SYSTEM_PROMPT}

${context ? `【PPT演讲内容 - 回答必须基于以下内容】\n${context}\n\n` : '【PPT演讲内容】\n暂无PPT内容\n\n'}

【回答规则】
1. 必须基于上述【PPT演讲内容】回答，不要编造
2. 回答控制在150字以内，简洁明了
3. 保持客观中立，不代入个人观点
4. 表达自然流畅，像聊天一样
5. 如果PPT内容中确实没有相关信息，可以合理根据你自己的理解来回答`;

      const messages: ChatCompletionMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: question,
        },
      ];

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 500,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '抱歉，我没有理解您的问题。';
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '请求失败';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, baseURL, model]);

  /**
   * 生成单页演讲稿
   */
  const generateSpeechScript = useCallback(async (
    slideTitle: string,
    slideContent: string,
    slideNotes: string,
    pageNumber: number,
    totalPages: number,
    customSystemPrompt?: string
  ): Promise<string | null> => {
    if (!apiKey) {
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userPrompt = `请为以下PPT页面生成演讲稿：

【页面信息】
页码：第 ${pageNumber} 页，共 ${totalPages} 页
标题：${slideTitle}
内容：${slideContent}
${slideNotes ? `备注：${slideNotes}` : ''}

${pageNumber === 1 ? '这是第一页，请用热情的欢迎语开场。' : ''}
${pageNumber === totalPages ? '这是最后一页，请用自然的结束语收尾。' : ''}

请直接输出演讲稿内容，不要加任何说明。`;

      const messages: ChatCompletionMessage[] = [
        {
          role: 'system',
          content: customSystemPrompt || SCRIPT_WRITER_PROMPT,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ];

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.8,
          max_tokens: 800,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const script = data.choices?.[0]?.message?.content?.trim();
      
      if (script) {
        // 移除可能的引号和多余的标注
        return script.replace(/^["']|["']$/g, '').replace(/\[.*?\]/g, '').trim();
      }
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '请求失败';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, baseURL, model]);

  /**
   * 批量生成演讲稿
   */
  const generateAllSpeechScripts = useCallback(async (
    slides: Array<{ title: string; content: string; notes?: string }>,
    customSystemPrompt?: string
  ): Promise<(string | null)[]> => {
    const scripts: (string | null)[] = [];
    
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const script = await generateSpeechScript(
        slide.title,
        slide.content,
        slide.notes || '',
        i + 1,
        slides.length,
        customSystemPrompt
      );
      scripts.push(script);
      
      // 添加小延迟避免请求过快
      if (i < slides.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return scripts;
  }, [generateSpeechScript]);

  /**
   * 流式聊天（用于实时显示）
   */
  const chatStream = useCallback(async (
    question: string,
    context: string,
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    if (!apiKey) {
      setError('未配置 API Key');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const systemPrompt = `${TEXT_CHAT_SYSTEM_PROMPT}

${context ? `【参考资料】\n${context}\n\n` : ''}

【回答规则】
1. 基于提供的参考资料回答问题
2. 如果资料中没有答案，基于你的知识合理回答
3. 保持专业、友好、简洁的口吻，像朋友聊天一样
4. 回答控制在200字以内，适合语音播报`;

      const messages: ChatCompletionMessage[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: question,
        },
      ];

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 500,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;
          
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '请求失败';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, baseURL, model]);

  return {
    chat,
    generateSpeechScript,
    generateAllSpeechScripts,
    chatStream,
    isLoading,
    error,
  };
}
