/**
 * 火山引擎端到端实时语音大模型 WebSocket 代理
 * 
 * 协议格式（根据官方文档示例）：
 * [4字节header][4字节event ID(大端序)][optional: 4字节session id size + session id][4字节payload size(大端序)][payload]
 * 
 * 连接流程：
 * 1. WebSocket握手成功
 * 2. 发送 StartConnection(event=1) 
 * 3. 收到 ConnectionStarted(event=50)
 * 4. 发送 StartSession(event=100)
 * 5. 收到 SessionStarted(event=150)
 * 6. 开始正常交互
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const VOLCANO_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue';

// 客户端事件ID
const CLIENT_EVENTS = {
  StartConnection: 1,
  FinishConnection: 2,
  StartSession: 100,
  FinishSession: 102,
  TaskRequest: 200,
  UpdateConfig: 201,
  SayHello: 300,
  EndASR: 400,
  ChatTTSText: 500,
  ChatTextQuery: 501,
  ChatRAGText: 502,
};

// 服务端事件ID
const SERVER_EVENTS = {
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  ConnectionFinished: 52,
  SessionStarted: 150,
  SessionFinished: 152,
  SessionFailed: 153,
  TTSResponse: 352,
  ASRInfo: 450,
  ASRResponse: 451,
  ASREnded: 459,
  ChatResponse: 550,
  TTSEnded: 359,
};

// 需要session id的事件（客户端发送）
const SESSION_EVENTS = [100, 102, 201, 300, 500, 501, 502];

class RealtimeProxy {
  constructor() {
    this.clients = new Map();
  }

  /**
   * 打印Buffer的hex，用于调试
   */
  hexDump(buf, maxLen = 200) {
    const slice = buf.slice(0, Math.min(buf.length, maxLen));
    const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
    return hex + (buf.length > maxLen ? ' ...' : '');
  }

  /**
   * 解析火山引擎消息
   */
  parseVolcanoMessage(buffer) {
    if (buffer.length < 12) return null;

    const header = buffer.slice(0, 4);
    const msgType = (header[1] >> 4) & 0x0F;
    const flags = header[1] & 0x0F;

    // flags bit2: 是否有event ID (0b0100 = 4)
    const hasEventId = (flags & 0b0100) !== 0;
    let eventId = 0;
    let offset = 8;

    if (hasEventId) {
      eventId = buffer.readUInt32BE(4);
    } else {
      // 没有event ID，字节4-7是其他字段（如错误帧的code）
      const codeOrOther = buffer.readUInt32BE(4);
      console.log(`[RealtimeProxy] ← 注意: 无event ID，字节4-7=${codeOrOther}`);
    }

    // 根据flags判断是否有sequence字段
    const sequenceFlag = flags & 0b11;
    if (sequenceFlag !== 0) {
      offset += 4;
    }

    console.log(`[RealtimeProxy] ← 解析: eventId=${eventId}, msgType=0b${msgType.toString(2).padStart(4, '0')}, flags=0b${flags.toString(2).padStart(4, '0')}, total=${buffer.length}`);

    // 服务端返回的消息(msgType >= 0b1000)都有session id
    // 客户端发送的Session级别事件也有session id
    const isServerResponse = msgType >= 0b1000;
    if (isServerResponse || SESSION_EVENTS.includes(eventId)) {
      if (buffer.length < offset + 4) return null;
      const sessionIdSize = buffer.readUInt32BE(offset);
      offset += 4;
      if (buffer.length < offset + sessionIdSize) return null;
      offset += sessionIdSize;
    }

    if (buffer.length < offset + 4) return null;
    const payloadSize = buffer.readUInt32BE(offset);
    offset += 4;

    console.log(`[RealtimeProxy] ← payloadSize=${payloadSize}, header+meta=${offset}, need=${offset + payloadSize}`);

    if (buffer.length < offset + payloadSize) {
      console.log(`[RealtimeProxy] ← 数据不完整: 需要${offset + payloadSize}, 只有${buffer.length}`);
      return null;
    }

    const payload = buffer.slice(offset, offset + payloadSize);
    const remaining = buffer.slice(offset + payloadSize);

    try {
      const text = payload.toString('utf8');
      const json = JSON.parse(text);
      return { type: 'json', eventId, data: json, remaining };
    } catch {
      return { type: 'audio', eventId, data: payload, remaining };
    }
  }

  /**
   * 构建火山引擎消息
   */
  buildMessage(eventId, payloadJson, sessionId = null) {
    const payload = JSON.stringify(payloadJson);
    const payloadBuffer = Buffer.from(payload, 'utf8');
    const payloadSize = payloadBuffer.length;

    const header = Buffer.alloc(4);
    header.writeUInt8(0x11, 0); // Version 0001 + Header Size 0001

    const isAudio = (eventId === CLIENT_EVENTS.TaskRequest);
    const msgType = isAudio ? 0b0010 : 0b0001;
    const flags = 0b0100; // 携带event ID
    header.writeUInt8((msgType << 4) | flags, 1);

    const serialization = isAudio ? 0b0000 : 0b0001;
    const compression = 0b0000;
    header.writeUInt8((serialization << 4) | compression, 2);
    header.writeUInt8(0x00, 3);

    const eventIdBuffer = Buffer.alloc(4);
    eventIdBuffer.writeUInt32BE(eventId, 0);

    if (sessionId && SESSION_EVENTS.includes(eventId)) {
      const sessionIdBuffer = Buffer.from(sessionId, 'utf8');
      const sessionIdSize = sessionIdBuffer.length;
      const sessionIdSizeBuffer = Buffer.alloc(4);
      sessionIdSizeBuffer.writeUInt32BE(sessionIdSize, 0);

      const payloadSizeBuffer = Buffer.alloc(4);
      payloadSizeBuffer.writeUInt32BE(payloadSize, 0);

      return Buffer.concat([header, eventIdBuffer, sessionIdSizeBuffer, sessionIdBuffer, payloadSizeBuffer, payloadBuffer]);
    } else {
      const payloadSizeBuffer = Buffer.alloc(4);
      payloadSizeBuffer.writeUInt32BE(payloadSize, 0);
      return Buffer.concat([header, eventIdBuffer, payloadSizeBuffer, payloadBuffer]);
    }
  }

  handleConnection(clientWs, config) {
    const connectId = uuidv4();
    console.log(`\n[RealtimeProxy] ========== 新连接: ${connectId} ==========`);

    const clientInfo = {
      volcanoWs: null,
      connectId,
      config,
      sessionId: null,
      state: 'idle', // idle -> connecting -> ready -> sessionActive
      pendingMessages: [],
    };

    this.clients.set(clientWs, clientInfo);

    const volcanoWs = new WebSocket(VOLCANO_WS_URL, {
      headers: {
        'X-Api-App-ID': config.appId,
        'X-Api-Access-Key': config.accessKey,
        'X-Api-Resource-Id': 'volc.speech.dialog',
        'X-Api-App-Key': 'PlgvMymc7f3tQnJ6',
        'X-Api-Connect-Id': connectId,
      },
      perMessageDeflate: false,
    });

    clientInfo.volcanoWs = volcanoWs;

    volcanoWs.on('open', () => {
      console.log(`[RealtimeProxy] 火山引擎WebSocket连接成功，发送StartConnection...`);
      
      // 步骤1: 发送 StartConnection
      const startConn = this.buildMessage(CLIENT_EVENTS.StartConnection, {});
      console.log(`[RealtimeProxy] → StartConnection hex: ${this.hexDump(startConn)}`);
      volcanoWs.send(startConn);
      clientInfo.state = 'connecting';
    });

    let buffer = Buffer.alloc(0);

    volcanoWs.on('message', (data) => {
      if (clientWs.readyState !== WebSocket.OPEN) return;

      console.log(`\n[RealtimeProxy] ← 火山引擎: ${data.length} bytes`);
      console.log(`[RealtimeProxy] ← hex: ${this.hexDump(data)}`);

      buffer = Buffer.concat([buffer, data]);

      while (buffer.length >= 12) {
        const result = this.parseVolcanoMessage(buffer);
        if (!result) break;

        buffer = result.remaining;

        if (result.type === 'json') {
          console.log(`[RealtimeProxy] ← JSON(event=${result.eventId}):`, JSON.stringify(result.data, null, 2));
          
          // 处理连接状态
          if (result.eventId === SERVER_EVENTS.ConnectionStarted) {
            console.log(`[RealtimeProxy] ✅ 收到ConnectionStarted，连接就绪`);
            clientInfo.state = 'ready';
            clientWs.send(JSON.stringify({ type: 'connected', connectId }));
            
            // 发送缓冲的消息
            for (const msg of clientInfo.pendingMessages) {
              console.log(`[RealtimeProxy] → 发送缓冲消息`);
              volcanoWs.send(msg);
            }
            clientInfo.pendingMessages = [];
            continue;
          }
          
          if (result.eventId === SERVER_EVENTS.ConnectionFailed) {
            console.error(`[RealtimeProxy] ❌ 连接失败:`, result.data);
            clientWs.send(JSON.stringify({ type: 'error', message: result.data.error || '连接失败' }));
            return;
          }

          if (result.eventId === SERVER_EVENTS.SessionStarted) {
            clientInfo.state = 'sessionActive';
          }

          clientWs.send(JSON.stringify({ type: 'event', eventId: result.eventId, data: result.data }));
        } else {
          console.log(`[RealtimeProxy] ← 音频(event=${result.eventId}): ${result.data.length} bytes`);
          clientWs.send(result.data);
        }
      }
    });

    volcanoWs.on('error', (error) => {
      console.error(`[RealtimeProxy] 火山引擎错误:`, error.message);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: error.message }));
      }
    });

    volcanoWs.on('close', (code, reason) => {
      console.log(`[RealtimeProxy] 火山引擎断开: code=${code}, reason=${reason}`);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'disconnected', code, reason: reason?.toString() }));
        clientWs.close();
      }
      this.clients.delete(clientWs);
    });

    // 客户端消息处理
    clientWs.on('message', (data) => {
      if (volcanoWs.readyState !== WebSocket.OPEN) return;

      // 尝试解析为JSON
      let json = null;
      let isBinary = false;
      
      if (typeof data === 'string') {
        try { json = JSON.parse(data); } catch { isBinary = true; }
      } else if (Buffer.isBuffer(data)) {
        const text = data.toString('utf8');
        if (text.trim().startsWith('{')) {
          try { json = JSON.parse(text); } catch { isBinary = true; }
        } else {
          isBinary = true;
        }
      } else {
        isBinary = true;
      }

      if (json) {
        console.log(`\n[RealtimeProxy] → 收到前端JSON:`, JSON.stringify(json).substring(0, 300));
        
        let eventId = 0;
        const eventName = json.event;
        delete json.event;

        if (eventName === 'start_session') {
          eventId = CLIENT_EVENTS.StartSession;
          clientInfo.sessionId = uuidv4();
        } else if (eventName === 'finish_session') {
          eventId = CLIENT_EVENTS.FinishSession;
        } else if (eventName === 'chat_text') {
          eventId = CLIENT_EVENTS.ChatTextQuery;
        } else if (eventName === 'chat_audio') {
          eventId = CLIENT_EVENTS.TaskRequest;
        } else if (eventName === 'finish_connection') {
          eventId = CLIENT_EVENTS.FinishConnection;
        }

        const message = this.buildMessage(eventId, json, clientInfo.sessionId);
        console.log(`[RealtimeProxy] → 发送: event=${eventId}(${eventName}), sessionId=${clientInfo.sessionId || 'none'}, total=${message.length}`);
        console.log(`[RealtimeProxy] → hex: ${this.hexDump(message, 100)}`);

        // 如果连接还未就绪，缓冲消息
        if (clientInfo.state !== 'ready' && clientInfo.state !== 'sessionActive') {
          console.log(`[RealtimeProxy] ⏳ 连接未就绪，缓冲消息`);
          clientInfo.pendingMessages.push(message);
        } else {
          volcanoWs.send(message);
        }
      } else if (isBinary) {
        // 二进制音频数据
        const payloadBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        const audioHeader = Buffer.alloc(4);
        audioHeader.writeUInt8(0x11, 0);
        audioHeader.writeUInt8((0b0010 << 4) | 0b0100, 1);
        audioHeader.writeUInt8((0b0000 << 4) | 0b0000, 2);
        audioHeader.writeUInt8(0x00, 3);

        const eventIdBuffer = Buffer.alloc(4);
        eventIdBuffer.writeUInt32BE(CLIENT_EVENTS.TaskRequest, 0);

        // 音频数据也携带sessionId（在同一个session中发送）
        const sessionIdBuffer = Buffer.from(clientInfo.sessionId || '', 'utf8');
        const sessionIdSizeBuffer = Buffer.alloc(4);
        sessionIdSizeBuffer.writeUInt32BE(sessionIdBuffer.length, 0);

        const payloadSizeBuffer = Buffer.alloc(4);
        payloadSizeBuffer.writeUInt32BE(payloadBuffer.length, 0);

        const audioMessage = Buffer.concat([audioHeader, eventIdBuffer, sessionIdSizeBuffer, sessionIdBuffer, payloadSizeBuffer, payloadBuffer]);
        
        console.log(`[RealtimeProxy] → 音频数据: ${payloadBuffer.length} bytes, sessionId=${clientInfo.sessionId}, total=${audioMessage.length}`);
        console.log(`[RealtimeProxy] → audio hex: ${this.hexDump(audioMessage, 50)}`);
        
        if (clientInfo.state !== 'ready' && clientInfo.state !== 'sessionActive') {
          clientInfo.pendingMessages.push(audioMessage);
        } else {
          volcanoWs.send(audioMessage);
        }
      }
    });

    clientWs.on('close', () => {
      console.log(`[RealtimeProxy] 客户端断开`);
      if (volcanoWs.readyState === WebSocket.OPEN) {
        volcanoWs.close();
      }
      this.clients.delete(clientWs);
    });

    clientWs.on('error', (error) => {
      console.error(`[RealtimeProxy] 客户端错误:`, error.message);
    });
  }
}

module.exports = { RealtimeProxy };
