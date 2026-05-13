/**
 * RTC 级联语音对话路由 (StartVoiceChat / StopVoiceChat)
 * 用于 /voice-chat-rtc 页面的后端代理
 */

const { sendVolcengineRequest } = require('./volcengine-sign');
const { generateRTCToken } = require('./rtc-token');

// 环境变量
const RTC_APP_ID = process.env.VOLCANO_RTC_APP_ID;
const RTC_APP_KEY = process.env.VOLCANO_RTC_APP_KEY;
const VOLCANO_AK = process.env.VOLCANO_AK;
const VOLCANO_SK = process.env.VOLCANO_SK;
const COZE_BOT_ID = process.env.COZE_BOT_ID;
const COZE_TOKEN = process.env.COZE_TOKEN;

function getEnvStatus() {
  return {
    hasAppId: !!RTC_APP_ID,
    hasAppKey: !!RTC_APP_KEY,
    hasAK: !!VOLCANO_AK,
    hasSK: !!VOLCANO_SK,
    hasCozeBotId: !!COZE_BOT_ID,
    hasCozeToken: !!COZE_TOKEN,
  };
}

/**
 * 注册 RTC 语音对话路由到 Express app
 */
function registerRTCVoiceChatRoutes(app) {
  /**
   * GET /api/rtc-token
   * 生成 RTC 进房 Token
   */
  app.get('/api/rtc-token', (req, res) => {
    const { roomId, userId } = req.query;

    if (!RTC_APP_ID || !RTC_APP_KEY) {
      return res.status(500).json({
        error: '缺少 RTC 应用配置',
        message: '请在环境变量中设置 VOLCANO_RTC_APP_ID 和 VOLCANO_RTC_APP_KEY',
        envStatus: getEnvStatus(),
      });
    }

    if (!roomId || !userId) {
      return res.status(400).json({ error: '缺少 roomId 或 userId 参数' });
    }

    try {
      const token = generateRTCToken(RTC_APP_ID, RTC_APP_KEY, roomId, userId, 24 * 3600);
      res.json({
        success: true,
        token,
        appId: RTC_APP_ID,
        roomId,
        userId,
        expireAt: Math.floor(Date.now() / 1000) + 24 * 3600,
      });
    } catch (error) {
      console.error('[RTC Token] 生成失败:', error);
      res.status(500).json({ error: 'Token 生成失败', message: error.message });
    }
  });

  /**
   * POST /api/start-voice-chat
   * 启动 AI 语音对话（调用火山引擎 StartVoiceChat OpenAPI）
   */
  app.post('/api/start-voice-chat', async (req, res) => {
    const {
      roomId,
      userId,
      agentUserId = 'ai_agent',
      taskId,
      welcomeMessage = '你好，我是你的AI助手，有什么可以帮你的吗？',
      modelName = 'doubao-seed-1-6-251015',
      speaker = 'zh_female_vv_jupiter_bigtts',
    } = req.body;

    if (!VOLCANO_AK || !VOLCANO_SK) {
      return res.status(500).json({
        error: '缺少火山引擎 AK/SK',
        message: '请在环境变量中设置 VOLCANO_AK 和 VOLCANO_SK',
        envStatus: getEnvStatus(),
      });
    }

    if (!roomId || !userId) {
      return res.status(400).json({ error: '缺少 roomId 或 userId 参数' });
    }

    const taskIdValue = taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 构建 StartVoiceChat 请求体
    const payload = {
      AppId: RTC_APP_ID,
      RoomId: roomId,
      TaskId: taskIdValue,
      TargetUserId: [userId],
      WelcomeMessage: welcomeMessage,
      AgentConfig: {
        UserId: agentUserId,
      },
      ASRConfig: {
        Provider: 'volcano',
      },
      LLMConfig: {
        Mode: 'ArkV3',
        // 使用火山引擎方舟模型（默认）
        // 如需使用 CozeBot，需要满足条件并在 LLMConfig 中配置
        // 条件：①已开通 Function Calling；② OutputMode != 0
        // 当前默认使用 ArkV3 模式，如需 CozeBot 请手动修改 payload
      },
      TTSConfig: {
        Provider: 'volcano',
        VolcanoTTSParameters: JSON.stringify({
          req_params: {
            speaker,
            audio_params: { speech_rate: 0 },
          },
        }),
      },
      // 可选：字幕配置
      SubtitleConfig: {
        Interval: 500,
      },
    };

    // 如果配置了 Coze，尝试使用 CozeBot（需要后端确认 Function Calling 已开通）
    if (COZE_BOT_ID && COZE_TOKEN) {
      // 注意：CozeBot 模式需要 OutputMode != 0 且 Function Calling 已开通
      // 这里仅作为示例注释，实际使用前请确认条件满足
      // payload.LLMConfig = {
      //   Mode: 'CozeBot',
      //   AccountId: 'your_account_id',
      //   BotId: COZE_BOT_ID,
      //   APIKey: COZE_TOKEN,
      // };
    }

    try {
      const result = await sendVolcengineRequest(
        'POST',
        'StartVoiceChat',
        '2024-06-01',
        {},
        payload,
        VOLCANO_AK,
        VOLCANO_SK
      );

      console.log('[StartVoiceChat] 响应:', result.status, JSON.stringify(result.data));

      if (result.data.ResponseMetadata && result.data.ResponseMetadata.Error) {
        return res.status(400).json({
          error: 'StartVoiceChat 调用失败',
          volcengineError: result.data.ResponseMetadata.Error,
          requestId: result.data.ResponseMetadata.RequestId,
        });
      }

      res.json({
        success: true,
        taskId: taskIdValue,
        roomId,
        userId,
        agentUserId,
        volcengineResponse: result.data,
      });
    } catch (error) {
      console.error('[StartVoiceChat] 错误:', error);
      res.status(500).json({
        error: '启动 AI 对话失败',
        message: error.message,
      });
    }
  });

  /**
   * POST /api/stop-voice-chat
   * 停止 AI 语音对话
   */
  app.post('/api/stop-voice-chat', async (req, res) => {
    const { appId, roomId, taskId } = req.body;

    if (!VOLCANO_AK || !VOLCANO_SK) {
      return res.status(500).json({
        error: '缺少火山引擎 AK/SK',
        envStatus: getEnvStatus(),
      });
    }

    if (!appId || !roomId || !taskId) {
      return res.status(400).json({ error: '缺少 appId、roomId 或 taskId 参数' });
    }

    const payload = {
      AppId: appId,
      RoomId: roomId,
      TaskId: taskId,
    };

    try {
      const result = await sendVolcengineRequest(
        'POST',
        'StopVoiceChat',
        '2024-06-01',
        {},
        payload,
        VOLCANO_AK,
        VOLCANO_SK
      );

      console.log('[StopVoiceChat] 响应:', result.status, JSON.stringify(result.data));

      if (result.data.ResponseMetadata && result.data.ResponseMetadata.Error) {
        return res.status(400).json({
          error: 'StopVoiceChat 调用失败',
          volcengineError: result.data.ResponseMetadata.Error,
        });
      }

      res.json({
        success: true,
        volcengineResponse: result.data,
      });
    } catch (error) {
      console.error('[StopVoiceChat] 错误:', error);
      res.status(500).json({
        error: '停止 AI 对话失败',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/rtc-config
   * 获取 RTC 配置状态（用于前端检查环境是否就绪）
   */
  app.get('/api/rtc-config', (req, res) => {
    res.json({
      envStatus: getEnvStatus(),
      appId: RTC_APP_ID || null,
      // 不返回敏感信息（appKey、ak、sk、token）
    });
  });
}

module.exports = { registerRTCVoiceChatRoutes };
