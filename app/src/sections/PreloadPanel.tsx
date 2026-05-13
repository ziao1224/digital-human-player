/**
 * SadTalker 预生成控制面板
 * 
 * 功能：
 * 1. 显示预生成进度
 * 2. 开始/停止预生成
 * 3. 显示每页的生成状态
 * 4. 预览生成的视频
 */

import { useState } from 'react';
import { Play, Pause, Loader2, CheckCircle, XCircle, Video, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface PreloadTask {
  slideIndex: number;
  script: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  videoUrl?: string;
  error?: string;
}

interface PreloadPanelProps {
  tasks: PreloadTask[];
  isPreloading: boolean;
  currentIndex: number;
  progress: number;
  completedCount: number;
  totalCount: number;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onPreview?: (slideIndex: number) => void;
}

export function PreloadPanel({
  tasks,
  isPreloading,
  currentIndex,
  progress,
  completedCount,
  totalCount,
  onStart,
  onStop,
  onClear,
  onPreview,
}: PreloadPanelProps) {
  const [expandedSlide, setExpandedSlide] = useState<number | null>(null);

  const getStatusIcon = (status: PreloadTask['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStatusText = (status: PreloadTask['status']) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'error':
        return '失败';
      case 'generating':
        return '生成中...';
      default:
        return '等待中';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            数字人视频预生成
          </div>
          {tasks.length > 0 && (
            <span className="text-sm font-normal text-gray-500">
              {completedCount}/{totalCount} 完成
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 控制按钮 */}
        <div className="flex gap-2">
          {!isPreloading ? (
            <Button
              onClick={onStart}
              disabled={totalCount === 0}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <Play className="w-4 h-4" />
              开始预生成
            </Button>
          ) : (
            <Button
              onClick={onStop}
              variant="destructive"
              className="gap-2"
            >
              <Pause className="w-4 h-4" />
              停止
            </Button>
          )}

          {tasks.length > 0 && !isPreloading && (
            <Button
              variant="outline"
              onClick={onClear}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              清理
            </Button>
          )}
        </div>

        {/* 进度条 */}
        {isPreloading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>生成进度</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
            <Progress value={progress * 100} className="h-2" />
            <p className="text-xs text-gray-500">
              正在生成第 {currentIndex + 1} 页，预计每页需要 10-30 秒...
            </p>
          </div>
        )}

        {/* 状态提示 */}
        {totalCount === 0 && (
          <p className="text-sm text-gray-500">
            请先上传 PPT 并生成演讲稿，然后点击"开始预生成"
          </p>
        )}

        {/* 每页状态列表 */}
        {tasks.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {tasks.map((task) => (
              <div
                key={task.slideIndex}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
                  task.status === 'completed' && 'bg-green-50 border-green-200',
                  task.status === 'error' && 'bg-red-50 border-red-200',
                  task.status === 'generating' && 'bg-blue-50 border-blue-200',
                  task.status === 'pending' && 'bg-gray-50 border-gray-200',
                  expandedSlide === task.slideIndex && 'ring-2 ring-purple-500'
                )}
                onClick={() => {
                  if (task.videoUrl) {
                    onPreview?.(task.slideIndex);
                  }
                  setExpandedSlide(
                    expandedSlide === task.slideIndex ? null : task.slideIndex
                  );
                }}
              >
                {getStatusIcon(task.status)}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">第 {task.slideIndex + 1} 页</p>
                  <p className="text-xs text-gray-500 truncate">
                    {task.script.substring(0, 30)}...
                  </p>
                </div>

                <span
                  className={cn(
                    'text-xs px-2 py-1 rounded',
                    task.status === 'completed' && 'bg-green-100 text-green-700',
                    task.status === 'error' && 'bg-red-100 text-red-700',
                    task.status === 'generating' && 'bg-blue-100 text-blue-700',
                    task.status === 'pending' && 'bg-gray-100 text-gray-600'
                  )}
                >
                  {getStatusText(task.status)}
                </span>

                {task.videoUrl && (
                  <Video className="w-4 h-4 text-purple-500" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* 提示信息 */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>💡 预生成会在演讲前批量生成所有页面的数字人视频</p>
          <p>⏱️ 每页预计需要 10-30 秒，总时间取决于演讲稿页数</p>
          <p>✅ 预生成后演讲时无需等待，视频可流畅播放</p>
        </div>
      </CardContent>
    </Card>
  );
}
