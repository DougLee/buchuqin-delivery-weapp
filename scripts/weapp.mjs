import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  applyWeappBrandToManifest,
  getWeappBrand,
  weappEnvironment,
  weappOutputDir,
} from "./weapp-brands.mjs";

const command = process.argv[2];
const brandKey = process.argv[3] || process.env.DELIVERY_WEAPP_BRAND || "buchuqin";
// 编译平台（IKRSJ3 道哥 2026-10-31）：mp-weixin（默认，兼容旧命令）/ h5——
// H5 复用同一套品牌注入管线，仅输出目录与 uni -p 不同
const platform = process.argv[4] || "mp-weixin";
if (!["dev", "build"].includes(command)) {
  throw new Error(`构建类型必须是 dev 或 build，当前为：${command || "(空)"}`);
}
if (!["mp-weixin", "h5"].includes(platform)) {
  throw new Error(`未知编译平台: ${platform}；可选值：mp-weixin, h5`);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brand = getWeappBrand(brandKey);
const outputDir = weappOutputDir(rootDir, command, brandKey, platform);
const sourceDir = path.join(rootDir, "src");
const brandInputDir = path.join(rootDir, ".cache", "weapp-input", brandKey);
const projectConfigPath = path.join(outputDir, "project.config.json");

function prepareBrandInput() {
  fs.rmSync(brandInputDir, { recursive: true, force: true });
  fs.mkdirSync(brandInputDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(brandInputDir, entry.name);
    if (entry.name === "manifest.json") {
      fs.writeFileSync(
        destination,
        applyWeappBrandToManifest(fs.readFileSync(source, "utf8"), brandKey),
      );
    } else if (entry.isDirectory()) {
      fs.symlinkSync(source, destination, process.platform === "win32" ? "junction" : undefined);
    } else if (process.platform === "win32") {
      try { fs.linkSync(source, destination); } catch { fs.copyFileSync(source, destination); }
    } else {
      fs.symlinkSync(source, destination);
    }
  }
}
prepareBrandInput();

// H5 平台不走品牌副本（.cache 只有 src 内容，H5 还需要根目录 index.html
// 等入口文件——用副本构建产物为空壳，道哥 2026-10-31 实测）；品牌差异经
// VITE_APP_NAME env 注入，mp-weixin 维持副本注入。
const environment = {
  ...weappEnvironment(command, brandKey, process.env, platform),
  ...(platform === "h5" ? {} : { UNI_INPUT_DIR: brandInputDir }),
  UNI_OUTPUT_DIR: outputDir,
};

function patchProjectConfig() {
  try {
    if (!fs.existsSync(projectConfigPath)) return false;
    const config = JSON.parse(fs.readFileSync(projectConfigPath, "utf8"));
    config.appid = brand.appId;
    config.projectname = brand.name;
    fs.writeFileSync(projectConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === "ENOENT") return false;
    console.error(`[微信小程序] 更新 project.config.json 失败：${error.message}`);
    return false;
  }
}

console.log(`\n[履约端${platform === "h5" ? "H5" : "微信小程序"}] ${brand.name} (${brand.appId})`);
console.log(`[API] ${environment.VITE_API_BASE_URL}`);
console.log(`[输出目录] ${outputDir}\n`);

// dev 热更新断链修复（道哥 2026-10-31 实测：挂着的 dev 吃不到源码改动）：
// uni watch 的是 .cache 品牌副本，而副本只在启动时拷贝一次——src 后续修改
// 永远进不了编译。这里监听 src 变化防抖重建副本，触发 uni 自动重编译。
if (command === "dev") {
  let syncTimer = null;
  try {
    fs.watch(sourceDir, { recursive: true }, () => {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        try {
          prepareBrandInput();
          console.log("[品牌输入] src 变化已同步，重编译中…");
        } catch (error) {
          console.error(`[品牌输入] 同步失败：${error.message}`);
        }
      }, 300);
    });
  } catch (error) {
    console.error(`[品牌输入] src 监听不可用（改源码后需重启 dev）：${error.message}`);
  }
}

const uniBin = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "uni.cmd" : "uni");
const args = [command === "dev" ? "dev" : "build", "-p", platform];
const child = spawn(uniBin, args, { cwd: rootDir, env: environment, stdio: "inherit" });
// 仅微信小程序平台校准 project.config.json（H5 无此文件）
const timer =
  platform === "mp-weixin" ? setInterval(patchProjectConfig, 300) : null;
child.on("exit", (code, signal) => {
  if (timer) clearInterval(timer);
  const patched = platform === "mp-weixin" ? patchProjectConfig() : true;
  process.exitCode = signal || code !== 0 || !patched ? code || 1 : 0;
});
child.on("error", (error) => {
  if (timer) clearInterval(timer);
  console.error(`[${platform === "h5" ? "H5" : "微信小程序"}] 无法启动 uni 编译器：${error.message}`);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
