import { useState } from 'react';
import { Plus, Trash2, BookOpen, Search, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { KnowledgeItem } from '@/types';
import { cn } from '@/lib/utils';

interface KnowledgeBaseProps {
  items: KnowledgeItem[];
  onAdd: (item: Omit<KnowledgeItem, 'id' | 'createdAt'>) => void;
  onRemove: (id: string) => void;
}

const PRESET_CATEGORIES = ['产品介绍', '技术问题', '使用教程', '常见问题', '其他'];

export function KnowledgeBase({ items, onAdd, onRemove }: KnowledgeBaseProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(PRESET_CATEGORIES[0]);
  const [searchQuery, setSearchQuery] = useState('');

  const handleAdd = () => {
    if (newQuestion.trim() && newAnswer.trim()) {
      onAdd({
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        category: selectedCategory,
      });
      setNewQuestion('');
      setNewAnswer('');
      setIsDialogOpen(false);
    }
  };

  const filteredItems = items.filter(
    item =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 按分类分组
  const groupedItems = filteredItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, KnowledgeItem[]>);

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-lg">知识库管理</CardTitle>
              <p className="text-sm text-gray-500">添加常见问题，让数字人更好地回答</p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                添加知识
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>添加新知识</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">分类</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-sm transition-all',
                          selectedCategory === cat
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">问题</label>
                  <Input
                    placeholder="输入问题..."
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">答案</label>
                  <Textarea
                    placeholder="输入答案..."
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value)}
                    rows={4}
                  />
                </div>
                <Button onClick={handleAdd} className="w-full">
                  添加
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {/* 搜索栏 */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="搜索知识库..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* 知识列表 */}
        <div className="space-y-4 max-h-[400px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>知识库为空</p>
              <p className="text-sm">点击右上角添加知识</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>没有找到匹配的内容</p>
            </div>
          ) : (
            Object.entries(groupedItems).map(([category, categoryItems]) => (
              <div key={category} className="space-y-2">
                <Badge variant="secondary" className="mb-2">
                  {category}
                </Badge>
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-gray-50 rounded-lg p-4 group hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 mb-1">
                          Q: {item.question}
                        </p>
                        <p className="text-sm text-gray-600">
                          A: {item.answer}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemove(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* 统计 */}
        {items.length > 0 && (
          <div className="mt-4 pt-4 border-t text-sm text-gray-500 flex justify-between">
            <span>共 {items.length} 条知识</span>
            <span>{Object.keys(groupedItems).length} 个分类</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
