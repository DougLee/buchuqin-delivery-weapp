import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [uni()],
  server: {
    host: "0.0.0.0",
    port: 5188,
    strictPort: true,
    // IKRSIY H5 联调（道哥 2026-10-31）：H5 平台 API 走相对路径 /api/v1，
    // 由本地代理转发到测试环境——绕开 localhost 直连的 CORS 拦截；
    // 小程序构建不受影响（请求走完整 URL，不经过 dev server）。
    proxy: {
      "/api": {
        target: "https://admin-test.buchuqin.com",
        changeOrigin: true,
      },
    },
  },
});
