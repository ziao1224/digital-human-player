/**
 * 火山引擎 OpenAPI 签名工具
 * 基于火山引擎签名算法（类 AWS Signature V4）
 * 参考：https://www.volcengine.com/docs/6348/1899868
 */

const crypto = require('crypto');

const HOST = 'rtc.volcengineapi.com';
const REGION = 'cn-north-1';
const SERVICE = 'rtc';
const ALGORITHM = 'HMAC-SHA256';

function hmacSha256(key, content) {
  return crypto.createHmac('sha256', key).update(content).digest();
}

function sha256Hex(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function urlEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+');
}

function buildCanonicalQueryString(params) {
  const keys = Object.keys(params).sort();
  const parts = [];
  for (const key of keys) {
    const val = params[key];
    if (Array.isArray(val)) {
      for (const v of val.sort()) {
        parts.push(`${urlEncode(key)}=${urlEncode(String(v))}`);
      }
    } else if (val !== undefined && val !== null) {
      parts.push(`${urlEncode(key)}=${urlEncode(String(val))}`);
    }
  }
  return parts.join('&');
}

function buildCanonicalHeaders(headers) {
  const keys = Object.keys(headers).sort();
  return keys.map(k => `${k.toLowerCase()}:${headers[k].trim()}\n`).join('');
}

function getSignedHeaders(headers) {
  return Object.keys(headers)
    .sort()
    .map(k => k.toLowerCase())
    .join(';');
}

function getSignatureKey(secretKey, dateStamp, regionName, serviceName) {
  const kDate = hmacSha256('VOLC' + secretKey, dateStamp);
  const kRegion = hmacSha256(kDate, regionName);
  const kService = hmacSha256(kRegion, serviceName);
  const kSigning = hmacSha256(kService, 'request');
  return kSigning;
}

/**
 * 对火山引擎 OpenAPI 请求进行签名
 * @param {string} method - HTTP 方法
 * @param {string} action - API Action 名称
 * @param {string} version - API 版本
 * @param {Object} queryParams - URL 查询参数
 * @param {Object} body - 请求体（JSON 对象）
 * @param {string} ak - Access Key
 * @param {string} sk - Secret Key
 * @returns {Object} { url, headers }
 */
function signRequest(method, action, version, queryParams, body, ak, sk) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[\-:]/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const bodyStr = body ? JSON.stringify(body) : '';
  const bodyHash = sha256Hex(bodyStr);

  // 构建查询参数
  const params = {
    Action: action,
    Version: version,
    ...queryParams,
  };
  const canonicalQueryString = buildCanonicalQueryString(params);

  // 请求头
  const headers = {
    'Host': HOST,
    'X-Content-Sha256': bodyHash,
    'X-Date': amzDate,
    'Content-Type': 'application/json',
  };

  const canonicalHeaders = buildCanonicalHeaders(headers);
  const signedHeaders = getSignedHeaders(headers);

  // Canonical Request
  const canonicalRequest = [
    method.toUpperCase(),
    '/',
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  // String to Sign
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // 签名
  const signingKey = getSignatureKey(sk, dateStamp, REGION, SERVICE);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  // Authorization 头
  const authorization = `${ALGORITHM} Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  headers['Authorization'] = authorization;

  const url = `https://${HOST}/?${canonicalQueryString}`;

  return { url, headers, bodyStr };
}

/**
 * 发送火山引擎 OpenAPI 请求
 */
async function sendVolcengineRequest(method, action, version, queryParams, body, ak, sk) {
  const { url, headers, bodyStr } = signRequest(method, action, version, queryParams, body, ak, sk);

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: bodyStr || undefined,
  });

  const data = await response.json();
  return { status: response.status, data };
}

module.exports = {
  signRequest,
  sendVolcengineRequest,
};
