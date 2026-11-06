import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/utils/nightMode.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = (overrides = {}) => ({ staffId: "manager-a", staffRole: "building-manager", canSwitchWorkspace: true, hasNightStore: true, mode: "night", campusName: "测试校区", nightStartAt: "20:00", nightEndAt: "03:00", reason: "", ...overrides });
function fixture() {
  const storage = new Map([["staffToken", "session-a"]]), navigation = [], toasts = [], events = [];
  let current = context(), route = "pages/night/home", failNavigation = false, response;
  const api = { businessContext: async () => response ? response() : current };
  const navigate = method => options => {
    navigation.push({ method, url: options.url });
    if (failNavigation) options.fail?.(new Error("导航失败"));
    else { route = options.url.slice(1); options.success?.(); }
  };
  const uni = {
    getStorageSync: key => storage.get(key) || "", setStorageSync: (key, value) => storage.set(key, value), removeStorageSync: key => storage.delete(key),
    reLaunch: navigate("reLaunch"), switchTab: navigate("switchTab"), hideTabBar() {}, showTabBar() {}, hideHomeButton() {},
    showToast: value => toasts.push(value), $emit: (...args) => events.push(args),
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) { if (name === "../api") return { api }; if (name === "../stores/session") return { useSessionStore: () => ({ ensure: async () => {} }) }; throw new Error(name); }, uni, getCurrentPages: () => [{ route }], Date, Promise });
  return { module: exports, storage, navigation, toasts, events, setContext: value => current = value, setRoute: value => route = value, failNavigation: () => failNavigation = true, setResponse: value => response = value };
}

test("只有服务端核验的正式楼长且已绑定夜宵店时有切换入口", () => {
  const f = fixture(), can = f.module.canSwitchWorkspace;
  assert.equal(can(context()), true);
  for (const role of ["intern-building-manager", "fulltime-rider", "parttime-rider"]) assert.equal(can(context({ staffRole: role })), false);
  for (const patch of [{ hasNightStore: false }, { canSwitchWorkspace: false }, { staffId: undefined }, { staffRole: undefined }, { canSwitchWorkspace: undefined }]) assert.equal(can(context(patch)), false);
  f.storage.delete("staffToken"); assert.equal(can(context()), false);
});
test("夜间手动回白天，轮询、首页、订单和收入守卫保持白天", async () => {
  const f = fixture();
  assert.equal(await f.module.switchWorkspace("day"), true);
  assert.equal(f.navigation[0].method, "switchTab");
  for (const section of ["home", "orders", "income"]) assert.equal(await f.module.dayTabGuard(section), "day");
  f.module.syncWorkspaceMode(context());
  assert.equal(f.module.workspaceOf(context()), "day");
  assert.equal(f.navigation.length, 1);
  assert.equal(f.storage.get("staffWorkspace:manager-a"), "day");
});
test("白天手动进入夜宵准备页，在刷新、夜宵守卫和轮询后保留选择", async () => {
  const f = fixture(), c = context({ mode: "day" }); f.setContext(c);
  assert.equal(await f.module.switchWorkspace("night"), true);
  f.module.nightTabGuard(); await Promise.resolve(); await Promise.resolve();
  f.module.syncWorkspaceMode(c);
  assert.equal(f.module.workspaceOf(await f.module.fetchBizContext()), "night");
  assert.equal(f.navigation.length, 1);
  assert.equal(f.navigation[0].url, "/pages/night/home");
});
test("选择按服务端员工ID隔离，换登录会话不会复用其他账号的网络缓存", async () => {
  const f = fixture(); await f.module.switchWorkspace("day");
  f.storage.set("staffToken", "session-b"); const b = context({ staffId: "manager-b" }); f.setContext(b);
  assert.equal(f.module.workspaceOf(await f.module.fetchBizContext()), "night");
  f.setResponse(() => Promise.reject(new Error("离线")));
  f.storage.set("staffToken", "session-c");
  assert.equal((await f.module.fetchBizContext()).hasNightStore, false);
  assert.equal(f.storage.get("staffWorkspace:manager-a"), "day");
});
test("解绑或降为实习楼长后清理手动选择，不显示入口且不能手动切换", async () => {
  const f = fixture(); await f.module.switchWorkspace("day");
  const revoked = context({ staffRole: "intern-building-manager", canSwitchWorkspace: false }); f.setContext(revoked);
  await f.module.fetchBizContext();
  assert.equal(f.storage.has("staffWorkspace:manager-a"), false);
  assert.equal(await f.module.switchWorkspace("night"), false);
  assert.equal(f.navigation.length, 1);
  assert.match(f.toasts.at(-1).title, /正式楼长/);
});
test("跳转失败回滚选择；再次点击可重试", async () => {
  const f = fixture(); f.failNavigation();
  assert.equal(await f.module.switchWorkspace("day"), false);
  assert.equal(f.storage.has("staffWorkspace:manager-a"), false);
  assert.equal(f.module.workspaceOf(context()), "night");
  assert.equal(await f.module.switchWorkspace("day"), false);
  assert.equal(f.navigation.length, 2);
  f.storage.set("staffWorkspace:manager-a", "day");
  assert.equal(await f.module.switchWorkspace("night"), false);
  assert.equal(f.storage.get("staffWorkspace:manager-a"), "day");
});
test("重复点击只发起一次导航；等待核验期间换账号不会导航", async () => {
  const f = fixture(); let complete; f.setResponse(() => new Promise(resolve => complete = resolve));
  const first = f.module.switchWorkspace("day");
  assert.equal(await f.module.switchWorkspace("day"), false);
  f.storage.set("staffToken", "session-b"); complete(context());
  assert.equal(await first, false); assert.equal(f.navigation.length, 0);
});
test("同会话临时断网保留选择，退出时清理当前账号选择", async () => {
  const f = fixture(); await f.module.switchWorkspace("day");
  f.setResponse(() => Promise.reject(new Error("离线")));
  assert.equal(f.module.workspaceOf(await f.module.fetchBizContext()), "day");
  f.module.clearWorkspaceSelection(); assert.equal(f.storage.has("staffWorkspace:manager-a"), false);
});
test("有手动选择时不抢走二级操作页；无选择时保留原自动时段入口", () => {
  const f = fixture(); f.setRoute("pages/night/inventory"); f.module.syncWorkspaceMode(context({ mode: "day" }));
  assert.equal(f.navigation.length, 0);
  f.setRoute("pages/index/index"); f.module.syncWorkspaceMode(context());
  assert.equal(f.navigation[0].url, "/pages/night/home");
});
