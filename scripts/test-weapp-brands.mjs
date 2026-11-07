import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWeappBrandToManifest,
  getWeappBrand,
  weappEnvironment,
  weappOutputDir,
} from "./weapp-brands.mjs";

const customEnv = {
  DELIVERY_WEAPP_EXAMPLE_APP_ID: "wx0123456789abcdef",
  DELIVERY_WEAPP_EXAMPLE_NAME: "示例履约端",
};

test("built-in and organization delivery mini programs use independent app ids", () => {
  assert.equal(getWeappBrand("buchuqin").appId, "wxdc6ded350d633443");
  assert.equal(getWeappBrand("xiaoman").appId, "wxf2e90f96bcc32dd1");
  assert.equal(getWeappBrand("daxiong").appId, "wxdb7c1a5b802ae816");
  assert.equal(new Set(['buchuqin', 'xiaoman', 'daxiong'].map(key => getWeappBrand(key).appId)).size, 3);
  assert.equal(getWeappBrand("example", customEnv).appId, "wx0123456789abcdef");
});

test("custom organization brand must provide valid metadata", () => {
  assert.throws(() => getWeappBrand("example", {}), /请配置/);
  assert.throws(
    () => getWeappBrand("example", { ...customEnv, DELIVERY_WEAPP_EXAMPLE_APP_ID: "bad" }),
    /格式错误/,
  );
});

test("manifest, api and output are isolated by brand", () => {
  const source = `{"name":"不出寝履约端","mp-weixin":{"appid":"wxdc6ded350d633443"}}`;
  const manifest = applyWeappBrandToManifest(source, "example", customEnv);
  const env = weappEnvironment("dev", "example", customEnv);
  assert.match(manifest, /示例履约端/);
  assert.match(manifest, /wx0123456789abcdef/);
  assert.equal(env.VITE_WECHAT_APP_ID, "wx0123456789abcdef");
  assert.equal(env.VITE_API_BASE_URL, "https://admin-test.buchuqin.com/api/v1");
  assert.equal(weappOutputDir("/workspace", "build", "example"), "/workspace/dist/build/mp-weixin-example");
});
