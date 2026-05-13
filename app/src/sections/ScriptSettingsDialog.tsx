import { useState, useEffect } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SCRIPT_WRITER_PROMPT } from '@/config/persona.config';
import { toast } from 'sonner';

interface ScriptSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  customPrompt: string;
  onPromptChange: (prompt: string) => void;
}

export function ScriptSettingsDialog({
  open,
  onClose,
  customPrompt,
  onPromptChange,
}: ScriptSettingsDialogProps) {
  const [localPrompt, setLocalPrompt] = useState(customPrompt || SCRIPT_WRITER_PROMPT);

  useEffect(() => {
    if (open) {
      setLocalPrompt(customPrompt || SCRIPT_WRITER_PROMPT);
    }
  }, [open, customPrompt]);

  const handleSave = () => {
    onPromptChange(localPrompt.trim());
    toast.success('演讲稿生成设置已保存');
    onClose();
  };

  const handleReset = () => {
    setLocalPrompt(SCRIPT_WRITER_PROMPT);
    toast.info('已恢复默认提示词');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            演讲稿生成设置
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 自定义提示词 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="custom-prompt" className="text-sm font-medium">
                自定义演讲稿生成提示词
              </Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 gap-1 text-gray-500"
              >
                <RotateCcw className="w-3 h-3" />
                恢复默认
              </Button>
            </div>
            <Textarea
              id="custom-prompt"
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              placeholder="输入自定义提示词..."
              className="min-h-[300px] font-mono text-sm"
            />
            <p className="text-xs text-gray-500">
              提示：在提示词中使用【页面信息】【标题】【内容】等占位符会被实际内容替换
            </p>
          </div>

          {/* 提示词技巧 */}
          <div className="bg-blue-50 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-medium text-blue-900">提示词编写技巧</h4>
            <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
              <li>指定数字人的性格和说话风格（如"亲切友好"、"专业严谨"）</li>
              <li>控制演讲稿长度（如"100字左右"、"30秒时长"）</li>
              <li>要求使用口语化表达（如"像朋友聊天一样自然"）</li>
              <li>指定开场和结尾的风格（如"热情欢迎"、"简洁收尾"）</li>
              <li>可以要求包含特定的过渡词或句式</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Sparkles className="w-4 h-4" />
            保存设置
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
