// 后端服务配置

export const SERVER_CONFIG = {
  // PPT 转换服务 (Express)
  BASE_URL: import.meta.env.VITE_SERVER_URL || 'http://localhost:3001',

  // 数字人视频生成服务 (Python/Flask SadTalker)
  AVATAR_SERVICE_URL: import.meta.env.VITE_AVATAR_SERVICE_URL || 'http://localhost:8008',

  // 请求超时时间（毫秒）
  TIMEOUT: 60000,
};

// 是否启用 PDF 预览功能（需要后端支持）
export const isPDFPreviewEnabled = (): boolean => {
  return Boolean(import.meta.env.VITE_SERVER_URL);
};
