import path from "node:path";

const TEST_API = "https://admin-test.buchuqin.com/api/v1";
const PRODUCTION_API = "https://admin.buchuqin.com/api/v1";
const APP_ID_RE = /^wx[0-9a-f]{16}$/;

export const WEAPP_BRANDS = Object.freeze({
  buchuqin: Object.freeze({
    name: "不出寝履约端",
    appId: "wxdc6ded350d633443",
  }),
});

function envPrefix(key) {
  return `DELIVERY_WEAPP_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

/**
 * 默认品牌固化在仓库；新增组织无需改代码，可通过环境变量注入：
 * DELIVERY_WEAPP_<品牌>_APP_ID / DELIVERY_WEAPP_<品牌>_NAME。
 */
export function getWeappBrand(key = "buchuqin", currentEnv = process.env) {
  const builtIn = WEAPP_BRANDS[key];
  if (builtIn) return builtIn;
  const prefix = envPrefix(key);
  const appId = currentEnv[`${prefix}_APP_ID`]?.trim();
  const name = currentEnv[`${prefix}_NAME`]?.trim();
  if (!appId || !name) {
    throw new Error(
      `未知履约端品牌 ${key}；请配置 ${prefix}_APP_ID 与 ${prefix}_NAME`,
    );
  }
  if (!APP_ID_RE.test(appId)) {
    throw new Error(`${prefix}_APP_ID 格式错误，必须为 wx+16 位十六进制`);
  }
  return Object.freeze({ appId, name });
}

export function weappOutputDir(rootDir, command, brandKey) {
  return path.resolve(
    rootDir,
    "dist",
    command === "dev" ? "dev" : "build",
    `mp-weixin-${brandKey}`,
  );
}

export function weappEnvironment(
  command,
  brandKey,
  currentEnv = process.env,
) {
  const brand = getWeappBrand(brandKey, currentEnv);
  return {
    ...currentEnv,
    VITE_APP_NAME: brand.name,
    VITE_WECHAT_APP_ID: brand.appId,
    VITE_API_BASE_URL:
      currentEnv.VITE_API_BASE_URL ||
      (command === "dev" ? TEST_API : PRODUCTION_API),
  };
}

export function applyWeappBrandToManifest(
  source,
  brandKey,
  currentEnv = process.env,
) {
  const brand = getWeappBrand(brandKey, currentEnv);
  return source
    .replace(/("name"\s*:\s*)"[^"]*"/, `$1"${brand.name}"`)
    .replace(/wxdc6ded350d633443/g, brand.appId);
}
