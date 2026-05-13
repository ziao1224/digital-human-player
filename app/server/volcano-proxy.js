/**
 * 火山引擎语音合成代理服务
 * 解决浏览器 CORS 跨域问题
 */

const express = require('express');
const fetch = require('node-fetch');

const router = express.Router();

/**
 * 将 PCM 数据转换为 WAV 格式
 * @param {Buffer} pcmData - PCM 原始数据
 * @param {number} sampleRate - 采样率 (如 24000)
 * @param {number} channels - 声道数 (1 或 2)
 * @param {number} bitsPerSample - 位深度 (16)
 * @returns {Buffer} WAV 格式数据
 */
function pcmToWav(pcmData, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const dataSize = pcmData.length;
  
  // WAV 文件头 (44 字节)
  const header = Buffer.alloc(44);
  
  // RIFF 标识
  header.write('RIFF', 0);
  // 文件大小 (数据大小 + 44 - 8)
  header.writeUInt32LE(dataSize + 36, 4);
  // WAVE 标识
  header.write('WAVE', 8);
  // fmt 子块
  header.write('fmt ', 12);
  // fmt 子块大小 (16)
  header.writeUInt32LE(16, 16);
  // 音频格式 (1 = PCM)
  header.writeUInt16LE(1, 20);
  // 声道数
  header.writeUInt16LE(channels, 22);
  // 采样率
  header.writeUInt32LE(sampleRate, 24);
  // 字节率
  header.writeUInt32LE(byteRate, 28);
  // 块对齐
  header.writeUInt16LE(blockAlign, 32);
  // 位深度
  header.writeUInt16LE(bitsPerSample, 34);
  // data 子块
  header.write('data', 36);
  // 数据大小
  header.writeUInt32LE(dataSize, 40);
  
  // 合并头和数据
  return Buffer.concat([header, pcmData]);
}

// 火山引擎 API 地址（使用 HTTP Chunked 接口）
const VOLCANO_API_URL = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';

/**
 * POST /tts - 语音合成代理
 * 完整路径: /api/volcano/tts
 */
router.post('/tts', async (req, res) => {
  try {
    const { appId, accessKey, speaker, text, speed, contextTexts, sectionId } = req.body;

    if (!appId || !accessKey || !text) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 构建 additions
    const additions = {
      speed_ratio: speed || 1.1,
      disable_markdown_filter: true,
      enable_language_detector: true,
    };

    if (contextTexts && contextTexts.length > 0) {
      additions.context_texts = contextTexts;
    }

    if (sectionId) {
      additions.section_id = sectionId;
    }

    // 构建请求体
    // 注意：火山API默认返回 pcm 格式，必须显式指定 mp3
    const payload = {
      req_params: {
        text: text,
        speaker: speaker || 'zh_female_vv_uranus_bigtts',
        additions: JSON.stringify(additions),
        audio_params: {
          format: 'mp3',  // 显式指定 mp3，否则默认是 pcm
          sample_rate: 24000,
        },
      },
    };

    const requestBody = JSON.stringify(payload);
    console.log('🎤 代理请求火山语音:', {
      speaker: payload.req_params.speaker,
      textLength: text.length,
      bodyLength: requestBody.length,
      bodyPreview: requestBody.substring(0, 200) + '...',
    });

    // 发送请求到火山引擎
    const response = await fetch(VOLCANO_API_URL, {
      method: 'POST',
      headers: {
        'X-Api-App-Id': appId,
        'X-Api-Access-Key': accessKey,
        'X-Api-Resource-Id': 'seed-tts-2.0',
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    // 获取响应文本
    const responseText = await response.text();
    
    console.log('📥 火山API响应长度:', responseText.length);
    console.log('📥 火山API响应前200字符:', responseText.substring(0, 200));
    
    let audioData;
    let audioFormat = 'mp3'; // 默认期望的格式
    
    // 火山API返回的是 JSON 流式响应
    // 格式: 多行 JSON，每行包含 {"code":0,"data":"base64..."}
    if (responseText.trim().startsWith('{')) {
      try {
        // 火山API返回多个 data 字段，是分块传输的音频
        // 需要合并所有非空的 data 块
        console.log('📥 解析流式响应，合并音频块...');
        
        const dataKey = '"data":"';
        let pos = 0;
        const chunks = [];
        
        while ((pos = responseText.indexOf(dataKey, pos)) !== -1) {
          const valueStart = pos + dataKey.length;
          
          // 找到这个 data 值的结束位置
          let valueEnd = -1;
          for (let i = valueStart; i < responseText.length; i++) {
            if (responseText[i] === '"' && responseText[i-1] !== '\\') {
              valueEnd = i;
              break;
            }
          }
          
          if (valueEnd !== -1) {
            const chunk = responseText.substring(valueStart, valueEnd);
            // 只保留非空的 base64 数据
            if (chunk && chunk !== 'null' && chunk.length > 100) {
              chunks.push(chunk);
              console.log('📥 找到音频块:', chunk.length, 'chars');
            }
          }
          
          pos = valueStart;
        }
        
        console.log('📥 总共找到', chunks.length, '个音频块');
        
        if (chunks.length === 0) {
          console.error('❌ 未找到任何音频数据块');
        } else {
          // 合并所有块
          const fullBase64 = chunks.join('');
          console.log('📥 合并后的 base64 总长度:', fullBase64.length);
          
          // 解码
          audioData = Buffer.from(fullBase64, 'base64');
          console.log('✅ 解码后音频数据:', audioData.length, 'bytes');
          
          // 检测音频格式
          if (audioData.length > 0) {
            const header = audioData.slice(0, 10);
            const headerHex = header.toString('hex');
            const headerAscii = header.toString('ascii');
            
            console.log('📥 音频头 (hex):', headerHex.substring(0, 20));
            console.log('📥 音频头 (ascii):', headerAscii.substring(0, 10));
            
            // 检查格式
            if (headerAscii.startsWith('ID3') || (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0)) {
              audioFormat = 'mp3';
              console.log('✅ 检测到 MP3 格式');
            } else if (headerHex.startsWith('4f676753')) { // 'OggS'
              audioFormat = 'ogg';
              console.log('✅ 检测到 OGG 格式');
            } else {
              audioFormat = 'pcm';
              console.log('⚠️ 检测到 PCM 格式');
              audioData = pcmToWav(audioData, 24000, 1, 16);
            }
          }
        }
      } catch (e) {
        console.error('❌ 提取 base64 失败:', e.message);
        console.error(e.stack);
      }
    }
    
    // 如果还是没有音频数据，尝试整个响应作为二进制
    if (!audioData) {
      console.log('📥 尝试将响应作为二进制处理');
      audioData = Buffer.from(responseText, 'binary');
    }

    if (!audioData || audioData.length === 0) {
      return res.status(500).json({ error: '音频数据为空' });
    }

    // 根据格式设置正确的 Content-Type
    let contentType = 'audio/mpeg'; // 默认 mp3
    if (audioFormat === 'ogg') {
      contentType = 'audio/ogg';
    } else if (audioFormat === 'pcm' || audioFormat === 'wav') {
      contentType = 'audio/wav';
    }
    
    console.log('📤 返回音频格式:', audioFormat, 'Content-Type:', contentType, '大小:', audioData.length);
    
    // 返回音频
    res.setHeader('Content-Type', contentType);
    res.send(audioData);

  } catch (error) {
    console.error('代理错误:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
