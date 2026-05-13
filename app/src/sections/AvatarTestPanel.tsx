import { useState, useRef, useCallback } from 'react';
import { Play, Upload, CheckCircle, XCircle, Loader2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { avatarService } from '@/services/avatar.service';
import { toast } from 'sonner';

export function AvatarTestPanel() {
  const [serviceStatus, setServiceStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);

  const addLog = (message: string) => {
    setTestLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  // 检查服务状态
  const checkService = useCallback(async () => {
    setServiceStatus('checking');
    addLog('正在检查服务状态...');
    
    const status = await avatarService.checkHealth();
    
    if (status) {
      setServiceStatus('online');
      addLog(`✅ 服务在线`);
      addLog(`   SadTalker: ${status.sadtalker ? '已就绪' : '未就绪'}`);
      addLog(`   模型: ${status.checkpoint || '未加载'}`);
    } else {
      setServiceStatus('offline');
      addLog('❌ 服务离线，请确保已启动: python app.py');
    }
  }, []);

  // 使用预录测试音频（效果更好）
  const runQuickTest = async () => {
    if (!selectedPhoto) {
      toast.error('请先上传照片');
      return;
    }

    setIsGenerating(true);
    setGeneratedVideo(null);
    addLog('开始生成测试视频...');

    try {
      // 使用预录测试音频（有变化的正弦波，效果更好）
      addLog('加载测试音频...');
      const audioResponse = await fetch('/test_speech.wav');
      const audioBlob = await audioResponse.blob();
      addLog(`音频加载完成 (${audioBlob.size} bytes)`);

      // 生成视频
      const videoUrl = await avatarService.generateVideo({
        image: selectedPhoto,
        audio: audioBlob,
      });

      if (videoUrl) {
        setGeneratedVideo(videoUrl);
        addLog('✅ 视频生成成功！');
        toast.success('测试视频生成成功');
      } else {
        addLog('❌ 视频生成失败');
        toast.error('生成失败');
      }
    } catch (error) {
      addLog(`❌ 错误: ${error}`);
      toast.error('测试失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhoto(file);
      addLog(`✅ 已选择照片: ${file.name}`);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="w-5 h-5" />
          Wav2Lip 数字人测试
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* 服务状态 */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {serviceStatus === 'checking' && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
            {serviceStatus === 'online' && <CheckCircle className="w-5 h-5 text-green-500" />}
            {serviceStatus === 'offline' && <XCircle className="w-5 h-5 text-red-500" />}
            
            <div>
              <p className="font-medium">
                {serviceStatus === 'checking' && '检查服务状态...'}
                {serviceStatus === 'online' && '服务在线'}
                {serviceStatus === 'offline' && '服务离线'}
              </p>
              <p className="text-sm text-gray-500">http://localhost:8000</p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={checkService}>
            刷新状态
          </Button>
        </div>

        {/* 上传照片 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">1. 上传真人照片</label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              选择照片
            </Button>
            {selectedPhoto && (
              <span className="text-sm text-green-600">
                ✅ {selectedPhoto.name}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            提示：如果没有照片，系统会显示默认头像
          </p>
        </div>

        {/* 运行测试 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">2. 运行测试</label>
          <Button
            onClick={runQuickTest}
            disabled={isGenerating || serviceStatus !== 'online'}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> 生成中...</>
            ) : (
              <><Play className="w-4 h-4" /> 生成测试视频</>
            )}
          </Button>
          <p className="text-xs text-gray-500">
            将生成 3 秒的测试视频，包含口型同步效果
          </p>
        </div>

        {/* 测试结果 */}
        {generatedVideo && (
          <div className="space-y-2">
            <label className="text-sm font-medium">3. 测试结果</label>
            <div className="rounded-lg overflow-hidden bg-black">
              <video
                src={generatedVideo}
                controls
                autoPlay
                loop
                muted
                playsInline
                className="w-full max-h-64"
                onError={(e) => console.error('[Video] Error:', e)}
                onLoadedData={() => console.log('[Video] Loaded successfully')}
              />
            </div>
            <div className="flex gap-2">
              <a 
                href={generatedVideo} 
                download="avatar_test.mp4"
                className="text-xs text-blue-600 hover:underline"
              >
                📥 下载视频
              </a>
            </div>
            <p className="text-xs text-gray-500">
              💡 Wav2Lip 只同步口型，头部保持静止。观察嘴巴是否随音频开合。<br/>
              📝 测试音频是正弦波，口型变化较轻微。真实语音效果更明显。
            </p>
          </div>
        )}

        {/* 日志输出 */}
        {testLog.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium">测试日志</label>
            <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono h-32 overflow-y-auto">
              {testLog.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* 帮助信息 */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>💡 如果服务离线，请运行: cd avatar-server && python app.py</p>
          <p>💡 首次生成可能需要 10-30 秒（取决于电脑性能）</p>
          <p>💡 有 NVIDIA GPU 会快 3-5 倍</p>
        </div>
      </CardContent>
    </Card>
  );
}
