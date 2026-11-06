import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createHmac, randomBytes } from "node:crypto";
import { nightPreviewLoginPlugin } from "./night-preview-login.mjs";

function invoke(options, remoteAddress = "127.0.0.1", method = "GET") {
  let handle;
  const plugin = nightPreviewLoginPlugin(options);
  assert.equal(plugin.apply, "serve");
  plugin.configureServer({ middlewares: { use(route, handler) { assert.equal(route, "/__night-preview/start"); handle = handler; } } });
  const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
  handle({ method, socket: { remoteAddress } }, response);
  return response;
}

test("点击时签发新会话，旧令牌过期也能登录独立预览；不下发管理员材料", () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "night-login-test-"));
  try {
    const secret = randomBytes(48).toString("hex");
    const sessionPath = path.join(folder, "session.json"), secretPath = path.join(folder, "secret");
    fs.writeFileSync(sessionPath, JSON.stringify({ staffId: "night-preview-staff", campusId: "night-preview-campus", staffToken: "expired-session", adminPassword: "must-not-be-served" }));
    fs.writeFileSync(secretPath, secret);
    const r = invoke({ apiTarget: "http://localhost:3150", sessionPath, secretPath });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers["Cache-Control"], "no-store");
    assert.ok(!r.body.includes("must-not-be-served"));
    const storage = new Map();
    const location = { replace(url) { this.url = url; } };
    vm.runInNewContext(r.body.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1], { localStorage: { setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, location });
    const token = storage.get("staffToken");
    const [header, body, signature] = token.split(".");
    assert.equal(signature, createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url"));
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    assert.equal(claims.id, "night-preview-staff");
    assert.equal(claims.campusId, "night-preview-campus");
    assert.ok(claims.exp > Date.now() / 1000 + 86000);
    assert.equal(storage.get("staffTokenRole"), "building-manager");
    assert.equal(location.url, "/h5/delivery/m/#/pages/night/home");
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

test("共享测试/生产 API 或非本机请求不能取得独立测试会话", () => {
  for (const apiTarget of ["https://admin-test.buchuqin.com", "https://admin.buchuqin.com"]) assert.equal(invoke({ apiTarget }).statusCode, 404);
  assert.equal(invoke({ apiTarget: "http://localhost:3150" }, "192.0.2.1").statusCode, 404);
  assert.equal(invoke({ apiTarget: "http://localhost:3150" }, "127.0.0.1", "POST").statusCode, 405);
});

test("本地预览未启动时给明确提示，不退回微信登录", () => {
  const r = invoke({ apiTarget: "http://localhost:3150", sessionPath: "/tmp/night-preview-session-does-not-exist" });
  assert.equal(r.statusCode, 503);
  assert.match(r.body, /启动本地夜宵预览 API/);
});
