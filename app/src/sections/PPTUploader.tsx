import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, ChevronLeft, ChevronRight, Play, Pause, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import type { Slide } from '@/types';
import { cn } from '@/lib/utils';

interface PPTUploaderProps {
  slides: Slide[];
  currentSlide: number;
  isSpeaking: boolean;
  isParsing?: boolean;
  onUpload: (file: File) => void;
  onSlideChange: (index: number) => void;
  onSpeak: (text: string) => void;
  onStop: () => void;
}

export function PPTUploader({
  slides,
  currentSlide,
  isSpeaking,
  isParsing = false,
  onUpload,
  onSlideChange,
  onSpeak,
  onStop,
}: PPTUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.pptx')) {
        onUpload(file);
      } else {
        alert('请上传 .pptx 格式的文件');
      }
    }
  }, [onUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.pptx')) {
        onUpload(file);
      } else {
        alert('请上传 .pptx 格式的文件');
      }
    }
    // 重置 input 以便可以重复选择同一文件
    e.target.value = '';
  }, [onUpload]);

  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      onSlideChange(currentSlide - 1);
      onStop();
    }
  };

  const handleNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      onSlideChange(currentSlide + 1);
      onStop();
    }
  };

  const handleSpeakCurrent = () => {
    const slide = slides[currentSlide];
    if (slide) {
      const text = `${slide.title}。${slide.content.replace(/\n/g, '，')}。${slide.notes || ''}`;
      onSpeak(text);
    }
  };

  // 空状态 - 未上传 PPT
  if (slides.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300',
              isDragging
                ? 'border-blue-500 bg-blue-50 scale-[1.02]'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pptx"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-4">
              {isParsing ? (
                <>
                  <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                  <div>
                    <p className="text-lg text-gray-600">正在解析 PPT 文件...</p>
                    <p className="text-sm text-gray-400 mt-1">请稍候</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      点击或拖拽上传 PPT 文件
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      支持 .pptx 格式（不支持 .ppt，请先另存为 .pptx）
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <FileUp className="w-4 h-4" />
                    <span>文件将在本地解析，不会上传到服务器</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentSlideData = slides[currentSlide];

  return (
    <Card className="w-full">
      <CardContent className="p-6">
        {/* 幻灯片预览 */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 min-h-[320px] flex flex-col justify-center relative overflow-hidden">
          {/* 装饰背景 */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-200/20 rounded-full translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              {currentSlideData?.title}
            </h3>
            <div className="text-gray-700 whitespace-pre-line leading-relaxed">
              {currentSlideData?.content}
            </div>
          </div>

          {/* 幻灯片编号 */}
          <div className="absolute bottom-4 right-4 text-sm text-gray-400">
            {currentSlide + 1} / {slides.length}
          </div>
        </div>

        {/* 控制栏 */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevSlide}
              disabled={currentSlide === 0}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextSlide}
              disabled={currentSlide === slides.length - 1}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
            <span className="text-sm text-gray-500 ml-2">
              幻灯片 {currentSlide + 1} / {slides.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isSpeaking ? 'destructive' : 'default'}
              onClick={isSpeaking ? onStop : handleSpeakCurrent}
              className="gap-2"
            >
              {isSpeaking ? (
                <>
                  <Pause className="w-4 h-4" />
                  停止讲解
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  讲解当前页
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 幻灯片缩略图 */}
        <div className="flex gap-2 mt-6 overflow-x-auto pb-2">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              onClick={() => {
                onSlideChange(index);
                onStop();
              }}
              className={cn(
                'flex-shrink-0 w-24 h-16 rounded-lg border-2 transition-all duration-200 flex items-center justify-center p-2',
                index === currentSlide
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              )}
              title={slide.title}
            >
              <span className="text-xs text-gray-600 truncate w-full text-center">
                {slide.title}
              </span>
            </button>
          ))}
        </div>

        {/* 底部操作 */}
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-400">
            提示：点击"讲解当前页"，数字人将为您语音讲解
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onUpload(new File([], 'empty')); // 触发清空
              // 实际清空由父组件处理
            }}
            className="text-gray-500"
          >
            <FileText className="w-4 h-4 mr-2" />
            重新上传
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
