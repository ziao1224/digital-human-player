import { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { KnowledgeItem } from '@/types';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  knowledgeBase: KnowledgeItem[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
}

export function ChatPanel({
  messages,
  knowledgeBase,
  onSendMessage,
  isLoading = false,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickQuestion = (question: string) => {
    onSendMessage(question);
  };

  // 推荐问题
  const suggestedQuestions = [
    '这个系统有什么功能？',
    '如何上传PPT？',
    '数字人可以做什么？',
  ];

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <CardTitle className="text-lg">智能问答</CardTitle>
            <p className="text-sm text-gray-500">向AI数字讲解员提问，获取基于PPT的专业解答</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* 消息列表 */}
        <ScrollArea className="flex-1 -mx-2 px-2" ref={scrollRef}>
          <div className="space-y-4 pb-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-2">开始与数字人对话</p>
                <p className="text-sm text-gray-400">
                  可以询问PPT相关内容或知识库中的问题
                </p>
                
                {/* 推荐问题 */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestedQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuickQuestion(q)}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-600 rounded-full text-sm transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      message.role === 'user'
                        ? 'bg-blue-500'
                        : 'bg-green-500'
                    )}
                  >
                    {message.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col max-w-[80%]">
                    {message.role === 'assistant' && (
                      <span className="text-xs text-gray-400 mb-1 ml-1">AI数字讲解员</span>
                    )}
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-2.5',
                        message.role === 'user'
                          ? 'bg-blue-500 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-900 rounded-bl-md'
                      )}
                    >
                      <p className="text-sm leading-relaxed">{message.content}</p>
                      <p
                        className={cn(
                          'text-xs mt-1',
                          message.role === 'user'
                            ? 'text-blue-200'
                            : 'text-gray-400'
                        )}
                      >
                        {message.timestamp.toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* 输入框 */}
        <div className="pt-4 border-t mt-4">
          <div className="flex gap-2">
            <Input
              placeholder="输入问题..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
            />
            <Button onClick={handleSend} size="icon" disabled={isLoading}>
              {isLoading ? (
                <Sparkles className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          
          {/* 快捷提示 */}
          {messages.length > 0 && knowledgeBase.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-gray-400">试试问：</span>
              {knowledgeBase.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleQuickQuestion(item.question)}
                  className="text-xs text-blue-500 hover:text-blue-600 hover:underline"
                >
                  {item.question.length > 15
                    ? item.question.slice(0, 15) + '...'
                    : item.question}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
