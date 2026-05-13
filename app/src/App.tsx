import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import PlayerPage from './pages/PlayerPage';
import { SERVER_CONFIG } from '@/config/server.config';

function App() {
  // 定期检测后端服务器是否重启
  useEffect(() => {
    const checkServerSession = async () => {
      try {
        const res = await fetch(`${SERVER_CONFIG.BASE_URL}/api/server-session`);
        if (!res.ok) return;
        const data = await res.json();
        const lastSession = localStorage.getItem('last_server_session');
        if (lastSession && lastSession !== data.sessionId) {
          // 服务器已重启，设置标志并刷新页面（不清空localStorage，缓存文件保留）
          localStorage.setItem('server_restarted', 'true');
          localStorage.setItem('last_server_session', data.sessionId);
          window.location.reload();
        } else if (!lastSession) {
          localStorage.setItem('last_server_session', data.sessionId);
        }
      } catch {
        // 服务器未启动，忽略
      }
    };

    checkServerSession();
    const interval = setInterval(checkServerSession, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/player" element={<PlayerPage />} />
    </Routes>
  );
}

export default App;
