/**
 * 火山引擎 API 2.0 测试工具
 */

export async function testVolcanoAPI(appId: string, accessKey: string): Promise<{ success: boolean; message: string }> {

  const testText = '你好，我是数字讲解员，很高兴为您服务';
  const resourceId = 'seed-tts-2.0';

  const payload = {
    req_params: {
      text: testText,
      speaker: 'zh_female_vv_uranus_bigtts',
      additions: JSON.stringify({
        speed_ratio: 1.1,
        disable_markdown_filter: true,
        enable_language_detector: true,
      }),
      audio_params: {
        format: 'mp3',
        sample_rate: 24000,
      },
    },
  };

  try {
    
    const response = await fetch('https://openspeech.bytedance.com/api/v3/tts/bidirection', {
      method: 'POST',
      headers: {
        'X-Api-App-Id': appId,
        'X-Api-Access-Key': accessKey,
        'X-Api-Resource-Id': resourceId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });


    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP 错误:', errorText);
      return {
        success: false,
        message: `HTTP ${response.status}: ${errorText}`,
      };
    }

    // 检查是否有音频数据
    const blob = await response.blob();

    if (blob.size > 0) {
      return { 
        success: true, 
        message: `火山引擎 2.0 API 测试成功！收到 ${blob.size} bytes 音频数据` 
      };
    } else {
      return { 
        success: false, 
        message: '音频数据为空' 
      };
    }

  } catch (error) {
    console.error('❌ 请求失败:', error);
    return {
      success: false,
      message: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 检查配置
 */
export function checkVolcanoConfig(): { 
  hasConfig: boolean;
  tips: string[];
} {
  const appId = import.meta.env.VITE_VOLCANO_APP_ID;
  const accessKey = import.meta.env.VITE_VOLCANO_ACCESS_KEY;
  const speaker = import.meta.env.VITE_VOLCANO_SPEAKER || 'zh_female_vv_saturn_bigtts';

  const tips: string[] = [];

  if (!appId) {
    tips.push('❌ 未配置 VITE_VOLCANO_APP_ID');
  } else if (appId === 'your_app_id_here') {
    tips.push('❌ VITE_VOLCANO_APP_ID 是默认值');
  } else {
    tips.push(`✅ VITE_VOLCANO_APP_ID 已配置`);
  }

  if (!accessKey) {
    tips.push('❌ 未配置 VITE_VOLCANO_ACCESS_KEY');
  } else if (accessKey === 'your_access_key_here') {
    tips.push('❌ VITE_VOLCANO_ACCESS_KEY 是默认值');
  } else {
    tips.push(`✅ VITE_VOLCANO_ACCESS_KEY 已配置`);
  }

  tips.push(`🎤 当前语音: ${speaker}`);

  const hasConfig = !!appId && !!accessKey && 
    appId !== 'your_app_id_here' && 
    accessKey !== 'your_access_key_here';

  if (!hasConfig) {
    tips.push('');
    tips.push('💡 配置步骤：');
    tips.push('1. 访问 https://console.volcengine.com/speech/app');
    tips.push('2. 创建应用');
    tips.push('3. 开通"语音合成大模型 2.0"服务');
    tips.push('4. 获取 App ID 和 Access Key');
    tips.push('');
    tips.push('📁 在项目根目录创建 .env 文件：');
    tips.push('VITE_VOLCANO_APP_ID=你的_app_id');
    tips.push('VITE_VOLCANO_ACCESS_KEY=你的_access_key');
  }

  return { hasConfig, tips };
}

// 在控制台运行测试
if (typeof window !== 'undefined') {
  (window as any).testVolcano = async () => {
    const config = checkVolcanoConfig();
    config.tips.forEach(tip => console.log(tip));

    if (config.hasConfig) {
      const appId = import.meta.env.VITE_VOLCANO_APP_ID;
      const accessKey = import.meta.env.VITE_VOLCANO_ACCESS_KEY;
      const result = await testVolcanoAPI(appId, accessKey);
      return result;
    } else {
      console.error('❌ 配置不完整，无法测试');
      return { success: false, message: '配置不完整' };
    }
  };
}
