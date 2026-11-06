import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import { nightPreviewLoginPlugin } from "./scripts/night-preview-login.mjs";
import { nightPreviewPayPlugin } from "./scripts/night-preview-pay.mjs";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || "https://admin-test.buchuqin.com";
if (!["localhost", "127.0.0.1", "admin-test.buchuqin.com"].includes(new URL(apiProxyTarget).hostname)) throw new Error('本地开发只允许本机或测试API，禁止生产连接');
const localPreview = ["http://localhost:3150", "http://127.0.0.1:3150"].includes(apiProxyTarget);

// https://vitejs.dev/config/
export default defineConfig({
  define: { 'import.meta.env.VITE_NIGHT_LOCAL_PREVIEW': JSON.stringify(localPreview ? 'true' : 'false') },
  plugins: [uni(), nightPreviewLoginPlugin({ apiTarget: apiProxyTarget }), nightPreviewPayPlugin({ apiTarget: apiProxyTarget }), {
    name: 'local-night-preview-isolation', apply: 'serve', configureServer(server) {
      if (localPreview) server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: ws://localhost:* ws://127.0.0.1:* http://localhost:3150 http://127.0.0.1:3150; img-src 'self' data: blob: http://localhost:3150 http://127.0.0.1:3150; frame-src 'none'");
        next();
      });
    },
  }],
  server: {
    host: "0.0.0.0",
    port: Number(process.env.VITE_DEV_PORT) || 5188,
    strictPort: true,
    // IKRSIY H5 联调（道哥 2026-10-31）：H5 平台 API 走相对路径 /api/v1，
    // 由本地代理转发到测试环境——绕开 localhost 直连的 CORS 拦截；
    // 小程序构建不受影响（请求走完整 URL，不经过 dev server）。
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
