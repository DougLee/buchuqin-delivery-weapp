import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWeappBrandToManifest,
  getWeappBrand,
  weappEnvironment,
  weappOutputDir,
} from "./weapp-brands.mjs";

const customEnv = {
  DELIVERY_WEAPP_XIAOMAN_APP_ID: "wx0123456789abcdef",
  DELIVERY_WEAPP_XIAOMAN_NAME: "小满履约端",
};

test("built-in and organization delivery mini programs use independent app ids", () => {
  assert.equal(getWeappBrand("buchuqin").appId, "wxdc6ded350d633443");
  assert.equal(getWeappBrand("xiaoman", customEnv).appId, "wx0123456789abcdef");
});

test("custom organization brand must provide valid metadata", () => {
  assert.throws(() => getWeappBrand("xiaoman", {}), /请配置/);
  assert.throws(
    () => getWeappBrand("xiaoman", { ...customEnv, DELIVERY_WEAPP_XIAOMAN_APP_ID: "bad" }),
    /格式错误/,
  );
});

test("manifest, api and output are isolated by brand", () => {
  const source = `{"name":"不出寝履约端","mp-weixin":{"appid":"wxdc6ded350d633443"}}`;
  const manifest = applyWeappBrandToManifest(source, "xiaoman", customEnv);
  const env = weappEnvironment("dev", "xiaoman", customEnv);
  assert.match(manifest, /小满履约端/);
  assert.match(manifest, /wx0123456789abcdef/);
  assert.equal(env.VITE_WECHAT_APP_ID, "wx0123456789abcdef");
  assert.equal(env.VITE_API_BASE_URL, "https://admin-test.buchuqin.com/api/v1");
  assert.equal(weappOutputDir("/workspace", "build", "xiaoman"), "/workspace/dist/build/mp-weixin-xiaoman");
});
