import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, ChevronLeft, ChevronRight, Play, Pause, FileUp, Mic, Sparkles, Maximize, Minimize, RefreshCw, Download, Edit3, Check, X, Video, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Slide } from '@/types';
import { BOT_NAME } from '@/config/persona.config';
import { cn } from '@/lib/utils';
import { SERVER_CONFIG } from '@/config/server.config';

interface PPTImage {
  page: number;
  url: string;
  slideId: number;
}

interface PPTUploaderWithImagesProps {
  slides: Slide[];
  images: PPTImage[];
  currentSlide: number;
  isSpeaking: boolean;
  isParsing?: boolean;
  speechScripts: string[];
  isGeneratingScripts: boolean;
  isGeneratingVideos?: boolean;
  autoPlay: boolean;
  batchProgress?: number;
  generatingSlideIndex?: number;
  onUpload: (file: File) => void;
  onSlideChange: (index: number) => void;
  onGenerateScripts: (force?: boolean) => void;
  onGenerateVideos?: () => void;
  onGenerateSlideVideo?: (index: number) => Promise<boolean>;
  onExportScripts?: () => void;
  onStartAutoPlay: () => void;
  onStop: () => void;
  onScriptEdit?: (index: number, script: string) => void;
  onPlaySlideVideo?: (index: number) => void;
  hasVideo?: (index: number) => boolean;
}

export function PPTUploaderWithImages({
  slides,
  images,
  currentSlide,
  isSpeaking: _isSpeaking,
  isParsing = false,
  speechScripts,
  isGeneratingScripts,
  isGeneratingVideos = false,
  autoPlay,
  batchProgress = 0,
  onUpload,
  onSlideChange,
  onGenerateScripts,
  onGenerateVideos,
  onGenerateSlideVideo,
  onExportScripts,
  generatingSlideIndex = -1,
  onStartAutoPlay,
  onStop,
  onScriptEdit,
  onPlaySlideVideo,
  hasVideo,
}: PPTUploaderWithImagesProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [showScript, setShowScript] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editingScript, setEditingScript] = useState(false);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasImages = images.length > 0;
  const currentSlideData = slides[currentSlide] || null;
  const currentScript = speechScripts[currentSlide] || '';
  const currentImage = images.find(img => img.slideId === currentSlide + 1);
  
  // 全屏切换
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('全屏失败:', err);
    }
  }, []);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

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
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.ppt') || file.name.endsWith('.pptx'))) {
      onUpload(file);
    }
  }, [onUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  }, [onUpload]);

  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      onSlideChange(currentSlide - 1);
      setEditingScript(false);
    }
  };

  const handleNextSlide = () => {
    if (currentSlide < slides.length - 1) {
      onSlideChange(currentSlide + 1);
      setEditingScript(false);
    }
  };

  // 点击缩略图切换
  const handleSlideClick = (index: number) => {
    onSlideChange(index);
    setEditingScript(false);
  };

  // 开始编辑演讲稿
  const handleStartEdit = () => {
    setEditValue(currentScript);
    setEditingScript(true);
  };

  // 保存编辑
  const handleSaveEdit = () => {
    if (onScriptEdit) {
      onScriptEdit(currentSlide, editValue.trim());
    }
    setEditingScript(false);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingScript(false);
    setEditValue('');
  };

  // 计算已生成演讲稿的页面数
  const generatedCount = speechScripts.filter(Boolean).length;

  if (slides.length === 0) {
    return (
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center transition-colors",
          isDragging ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".ppt,.pptx"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
          <Upload className="w-8 h-8 text-blue-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">上传 PPT 文件</h3>
        <p className="text-sm text-gray-500 mb-4">拖拽文件到此处，或点击选择</p>
        <Button
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing}
          className="gap-2"
        >
          {isParsing ? (
            <><FileUp className="w-4 h-4 animate-spin" />解析中...</>
          ) : (
            <><FileUp className="w-4 h-4" />选择文件</>
          )}
        </Button>
        <p className="text-xs text-gray-400 mt-4">仅支持 .pptx 格式的 PowerPoint 文件</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn(
      "relative",
      isFullscreen && "bg-black flex flex-col items-center justify-center p-0"
    )}>
      <Card className={cn(
        "w-full transition-all duration-300",
        isFullscreen && "w-full h-screen max-w-none border-0 shadow-none bg-black"
      )}>
        <CardContent className={cn(
          "p-6",
          isFullscreen && "p-4 h-full flex flex-col"
        )}>
          {/* 顶部控制栏 */}
          {!isFullscreen && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center space-x-2">
                  <Switch id="showscript" checked={showScript} onCheckedChange={setShowScript} />
                  <Label htmlFor="showscript" className="text-sm cursor-pointer">显示演讲稿</Label>
                </div>
                
                {/* 批量生成进度 */}
                {batchProgress > 0 && batchProgress < 100 && (
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${batchProgress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{Math.round(batchProgress)}%</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* 停止讲解按钮 */}
                {autoPlay && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={onStop}
                    className="gap-2 animate-pulse"
                  >
                    <Pause className="w-4 h-4" />
                    停止讲解
                  </Button>
                )}

                {/* 上传新PPT */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isParsing}
                  className="gap-2"
                >
                  <Upload className="w-4 h-4" />
                  上传新PPT
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".ppt,.pptx"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* 生成按钮组 */}
                <div className="flex items-center gap-2">
                  {/* 步骤1: 生成演讲稿 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onGenerateScripts(false)}
                    disabled={isGeneratingScripts || isGeneratingVideos || slides.length === 0}
                    className="gap-2"
                  >
                    {isGeneratingScripts ? (
                      <><Sparkles className="w-4 h-4 animate-spin" />生成中...</>
                    ) : (
                      <><Mic className="w-4 h-4" />
                        {generatedCount > 0 ? `重新生成演讲稿` : '1. 生成演讲稿'}
                      </>
                    )}
                  </Button>
                  
                  {/* 步骤2: 生成视频（确认演讲稿后） */}
                  {generatedCount > 0 && onGenerateVideos && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={onGenerateVideos}
                      disabled={isGeneratingScripts || isGeneratingVideos}
                      className="gap-2 bg-blue-600 hover:bg-blue-700"
                    >
                      {isGeneratingVideos ? (
                        <><Video className="w-4 h-4 animate-spin" />生成视频中...</>
                      ) : (
                        <><Video className="w-4 h-4" />2. 生成视频</>
                      )}
                    </Button>
                  )}
                  
                  {/* 强制重新生成（清空缓存） */}
                  {generatedCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onGenerateScripts(true)}
                      disabled={isGeneratingScripts || isGeneratingVideos}
                      className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      title="清空缓存，重新生成演讲稿和视频"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                  
                  {/* 导出演讲稿 */}
                  {generatedCount > 0 && onExportScripts && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onExportScripts}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      title="导出演讲稿为文本文件"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  title="全屏"
                >
                  <Maximize className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* 全屏模式下的顶部栏 */}
          {isFullscreen && (
            <div className="flex items-center justify-between mb-2 text-white">
              <span className="text-sm opacity-70">{currentSlide + 1} / {slides.length}</span>
              <div className="flex items-center gap-2">
                {autoPlay && (
                  <span className="text-sm bg-purple-600 px-2 py-0.5 rounded animate-pulse">自动讲解中</span>
                )}
                <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white hover:bg-white/20">
                  <Minimize className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}

          {/* 引导提示 - 未生成演讲稿时显示 */}
          {!isFullscreen && generatedCount === 0 && (
            <div className="mb-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">开始制作数字人演讲</p>
                <p className="text-xs text-amber-700">步骤：1. 点击"生成演讲稿" → 2. 确认/修改演讲稿 → 3. 点击"生成视频"</p>
              </div>
            </div>
          )}

          {/* 演讲稿已生成但未生成视频的提示 */}
          {!isFullscreen && generatedCount > 0 && !isGeneratingVideos && batchProgress === 0 && (
            <div className="mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Edit3 className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">演讲稿已生成</p>
                <p className="text-xs text-blue-700">请查看并修改演讲稿，确认无误后点击"生成视频"按钮</p>
              </div>
            </div>
          )}

          {/* 图片预览区域 */}
          <div className={cn(
            "bg-gray-100 rounded-xl overflow-hidden relative flex items-center justify-center",
            isFullscreen ? "flex-1" : "h-[400px]"
          )}>
            {hasImages && currentImage ? (
              <img
                src={`${SERVER_CONFIG.BASE_URL}${currentImage.url}`}
                alt={`幻灯片 ${currentSlide + 1}`}
                className={cn(
                  "object-contain",
                  isFullscreen ? "max-w-full max-h-full" : "w-full h-full"
                )}
                onError={(e) => console.error('图片加载失败:', e)}
              />
            ) : currentSlideData ? (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 w-full h-full flex flex-col justify-center p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-200/20 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-200/20 rounded-full translate-y-1/2 -translate-x-1/2" />
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold text-gray-900 mb-6">{currentSlideData.title || '无标题'}</h3>
                  <div className="text-gray-700 whitespace-pre-line leading-relaxed">{currentSlideData.content || '无内容'}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p>幻灯片数据加载中...</p>
              </div>
            )}

            {/* 导航按钮 */}
            <button
              onClick={handlePrevSlide}
              disabled={currentSlide === 0}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-6 h-6 text-gray-700" />
            </button>
            <button
              onClick={handleNextSlide}
              disabled={currentSlide === slides.length - 1}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow-lg flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-6 h-6 text-gray-700" />
            </button>

            {/* 演讲稿悬浮层 - 可编辑 */}
            {showScript && currentScript && !editingScript && (
              <div className={cn(
                "absolute bottom-4 left-4 right-4 bg-black/80 text-white p-4 rounded-lg backdrop-blur-sm max-h-40 overflow-y-auto",
                isFullscreen && "bottom-20"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <FileText className="w-3 h-3" />
                    <span>{BOT_NAME}的演讲稿</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 播放当前页视频按钮 */}
                    {onPlaySlideVideo && hasVideo?.(currentSlide) && (
                      <button
                        onClick={() => onPlaySlideVideo(currentSlide)}
                        className="text-xs text-green-300 hover:text-green-200 flex items-center gap-1"
                      >
                        <PlayCircle className="w-3 h-3" />
                        播放
                      </button>
                    )}
                    {/* 生成该页视频按钮 */}
                    {onGenerateSlideVideo && !hasVideo?.(currentSlide) && currentScript && generatingSlideIndex !== currentSlide && (
                      <button
                        onClick={() => onGenerateSlideVideo(currentSlide)}
                        className="text-xs text-amber-300 hover:text-amber-200 flex items-center gap-1"
                      >
                        <Video className="w-3 h-3" />
                        生成视频
                      </button>
                    )}
                    {generatingSlideIndex === currentSlide && (
                      <span className="text-xs text-amber-300 flex items-center gap-1 animate-pulse">
                        <Video className="w-3 h-3 animate-spin" />
                        生成中...
                      </span>
                    )}
                    <button
                      onClick={handleStartEdit}
                      className="text-xs text-blue-300 hover:text-blue-200 flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      编辑
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{currentScript}</p>
              </div>
            )}

            {/* 演讲稿编辑模式 */}
            {showScript && editingScript && (
              <div className={cn(
                "absolute bottom-4 left-4 right-4 bg-white rounded-lg shadow-lg p-4",
                isFullscreen && "bottom-20"
              )}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">编辑演讲稿</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleSaveEdit}
                      className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-green-50"
                    >
                      <Check className="w-3 h-3" />
                      保存
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100"
                    >
                      <X className="w-3 h-3" />
                      取消
                    </button>
                  </div>
                </div>
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="min-h-[80px] text-sm"
                  placeholder="输入演讲稿内容..."
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* 底部控制栏 */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-500">
              {currentSlide + 1} / {slides.length} 页
              {generatedCount > 0 && (
                <span className="ml-2 text-blue-600">({generatedCount} 页已生成)</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevSlide}
                disabled={currentSlide === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextSlide}
                disabled={currentSlide === slides.length - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              
              {generatedCount > 0 && !autoPlay && (
                <Button
                  size="sm"
                  onClick={onStartAutoPlay}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                  disabled={generatedCount === 0}
                >
                  <Play className="w-4 h-4" />
                  开始讲解
                </Button>
              )}
            </div>
          </div>

          {/* 幻灯片缩略图导航 */}
          {!isFullscreen && slides.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <p className="text-xs text-gray-500 mb-3">点击缩略图切换页面</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {slides.map((_, index) => {
                  const image = images.find(img => img.slideId === index + 1);
                  const hasScript = !!speechScripts[index];
                  const hasVid = hasVideo?.(index);
                  const isGenerating = generatingSlideIndex === index;
                  return (
                    <button
                      key={index}
                      onClick={() => handleSlideClick(index)}
                      className={cn(
                        "flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all relative",
                        currentSlide === index
                          ? "border-blue-500 ring-2 ring-blue-200"
                          : "border-gray-200 hover:border-gray-300",
                        hasScript && !hasVid && !isGenerating && "ring-1 ring-amber-200",
                        hasVid && "ring-1 ring-green-200"
                      )}
                    >
                      {image ? (
                        <img
                          src={`${SERVER_CONFIG.BASE_URL}${image.url}`}
                          alt={`第 ${index + 1} 页`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                          <span className="text-xs text-gray-500">{index + 1}</span>
                        </div>
                      )}
                      {/* 状态角标 */}
                      {hasVid && (
                        <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border border-white" title="已有视频" />
                      )}
                      {isGenerating && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Video className="w-4 h-4 text-white animate-spin" />
                        </div>
                      )}
                      {hasScript && !hasVid && !isGenerating && (
                        <div className="absolute top-0.5 right-0.5 w-3 h-3 bg-amber-400 rounded-full border border-white" title="有演讲稿，未生成视频" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
