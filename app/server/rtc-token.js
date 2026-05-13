/**
 * 火山引擎 RTC Token 生成工具
 * Token 格式: Version + AppId + Base64(Message + Signature)
 * 参考：https://www.volcengine.com/docs/6348/70121
 * 
 * 注：此实现基于文档推断。如进房失败，请在 RTC 控制台生成临时 Token 使用。
 */

const crypto = require('crypto');

const VERSION = '001';

// Privilege 枚举值（基于火山引擎/声网常见实践）
const Privileges = {
  PrivPublishStream: 1,
  PrivSubscribeStream: 2,
};

function writeUInt16LE(buf, offset, value) {
  buf.writeUInt16LE(value >>> 0, offset);
  return offset + 2;
}

function writeUInt32LE(buf, offset, value) {
  buf.writeUInt32LE(value >>> 0, offset);
  return offset + 4;
}

function writeString(buf, offset, str) {
  const bytes = Buffer.from(str || '', 'utf8');
  offset = writeUInt16LE(buf, offset, bytes.length);
  if (bytes.length > 0) {
    bytes.copy(buf, offset);
  }
  return offset + bytes.length;
}

function getPrivilegeId(name) {
  return Privileges[name] || 0;
}

class AccessToken {
  /**
   * @param {string} appId - RTC 应用 ID（24位）
   * @param {string} appKey - RTC 应用 AppKey
   * @param {string} roomId - 房间 ID
   * @param {string} userId - 用户 ID
   */
  constructor(appId, appKey, roomId, userId) {
    this.appId = appId;
    this.appKey = appKey;
    this.roomId = roomId || '';
    this.userId = userId || '';
    this._expireTime = 0;
    this._privileges = new Map();
  }

  /**
   * 添加权限
   * @param {string} privilege - 权限名，如 'PrivPublishStream'
   * @param {number} expireAt - Unix 时间戳（秒），0 表示使用 Token 整体过期时间
   */
  addPrivilege(privilege, expireAt) {
    this._privileges.set(getPrivilegeId(privilege), expireAt);
  }

  /**
   * 设置 Token 整体过期时间
   * @param {number} expireAt - Unix 时间戳（秒）
   */
  expireTime(expireAt) {
    this._expireTime = expireAt;
  }

  /**
   * 序列化为 Token 字符串
   * @returns {string}
   */
  serialize() {
    // 计算 Message 大小
    const roomBytes = Buffer.byteLength(this.roomId, 'utf8');
    const userBytes = Buffer.byteLength(this.userId, 'utf8');
    const privilegeCount = this._privileges.size;

    // Message = [roomId] + [userId] + [expireTime: uint32] + [privilegeCount: uint16] + [privileges...]
    // privilege = [key: uint16] + [expireTime: uint32]
    const msgSize = (2 + roomBytes) + (2 + userBytes) + 4 + 2 + privilegeCount * 6;
    const msg = Buffer.alloc(msgSize);

    let offset = 0;
    offset = writeString(msg, offset, this.roomId);
    offset = writeString(msg, offset, this.userId);
    offset = writeUInt32LE(msg, offset, this._expireTime);
    offset = writeUInt16LE(msg, offset, privilegeCount);

    // 按 privilege key 排序写入（保持确定性）
    const sortedPrivileges = Array.from(this._privileges.entries()).sort((a, b) => a[0] - b[0]);
    for (const [key, expireAt] of sortedPrivileges) {
      offset = writeUInt16LE(msg, offset, key);
      offset = writeUInt32LE(msg, offset, expireAt);
    }

    // Signature = HMAC-SHA256(AppKey, Message)
    const signature = crypto.createHmac('sha256', this.appKey).update(msg).digest();

    // Token = Version + AppId + Base64(Message + Signature)
    const combined = Buffer.concat([msg, signature]);
    return VERSION + this.appId + combined.toString('base64');
  }
}

/**
 * 快速生成 RTC 进房 Token
 * @param {string} appId
 * @param {string} appKey
 * @param {string} roomId
 * @param {string} userId
 * @param {number} expireSeconds - Token 有效期（秒），默认 24 小时
 */
function generateRTCToken(appId, appKey, roomId, userId, expireSeconds = 24 * 3600) {
  const token = new AccessToken(appId, appKey, roomId, userId);
  const expireAt = Math.floor(Date.now() / 1000) + expireSeconds;
  token.expireTime(expireAt);
  token.addPrivilege('PrivPublishStream', expireAt);
  token.addPrivilege('PrivSubscribeStream', expireAt);
  return token.serialize();
}

module.exports = {
  AccessToken,
  generateRTCToken,
  Privileges,
};
