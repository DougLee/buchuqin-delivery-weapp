import fs from "node:fs";
import { createHmac, randomBytes } from "node:crypto";

const LOCAL_API_TARGETS = new Set(["http://localhost:3150", "http://127.0.0.1:3150"]);
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Only the local Vite server connected to the isolated preview API may issue this session. */
export function nightPreviewLoginPlugin({
  apiTarget,
  sessionPath = "/tmp/night-stock-preview.json",
  secretPath = "/tmp/night-stock-preview-secret",
}) {
  return {
    name: "local-night-preview-login",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__night-preview/start", (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        if (!LOCAL_API_TARGETS.has(apiTarget) || !LOOPBACK_ADDRESSES.has(req.socket.remoteAddress)) {
          res.statusCode = 404;
          res.end("仅本机夜宵独立预览可使用此入口");
          return;
        }
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.setHeader("Allow", "GET");
          res.end("请通过测试账号按钮打开预览");
          return;
        }
        try {
          const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
          const secret = fs.readFileSync(secretPath, "utf8").trim();
          if (session.staffId !== "night-preview-staff" || session.campusId !== "night-preview-campus" || !/^[a-f0-9]{96}$/.test(secret)) {
            throw new Error("invalid preview fixture");
          }
          const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
          const now = Math.floor(Date.now() / 1000);
          const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ id: session.staffId, campusId: session.campusId, role: "building-manager", appKind: "delivery", iat: now, exp: now + 86400 })}`;
          const token = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
          const nonce = randomBytes(18).toString("base64url");
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`);
          res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>正在登录夜宵独立预览</title><body>正在进入夜宵店…<script nonce="${nonce}">
localStorage.setItem("staffToken", ${JSON.stringify(token)});
localStorage.setItem("staffTokenRole", "building-manager");
localStorage.setItem("staffRole", "building-manager");
localStorage.removeItem("staffGuestMode");
location.replace("/h5/delivery/m/#/pages/night/home");
</script></body></html>`);
        } catch {
          res.statusCode = 503;
          res.end("夜宵独立预览尚未就绪，请先启动本地夜宵预览 API（3150端口）。");
        }
      });
    },
  };
}
