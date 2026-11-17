import { api } from "../api";
import { useSessionStore } from "../stores/session";
import { isManagerRole } from "../types";
import { syncWorkspaceMode } from "./nightMode";

/**
 * 新单轮询（IKDNVW 方案A，2026-09-07 道哥）：前台期间每 30s 拉一次
 * 「待处理量」，数量增加时震动并广播任务页重拉（角标已移除，2026-09-08 道哥）。
 * - 骑手（rider）：抢单池条数（availableTasks，仅配送员角色可调）
 * - 楼长（building-manager / intern-building-manager）：有包裹到楼待接货（waiting-handover）
 * onHide 停表省流量；请求失败/未登录静默跳过（网络差不打扰）。
 * 与后续 E 离线推送（liveActivity 状态卡片，等类目审核）互补：
 * A 管前台即时感，E 管离线触达。
 */
const INTERVAL_MS = 30_000;
let timer: ReturnType<typeof setInterval> | undefined;
let lastCount = -1;
let lastNightCount = -1;
let generation = 0;
let lastToken = '';
type PollRun = { generation: number; token: string };
let dayRun: PollRun | undefined;
let nightRun: PollRun | undefined;

function isCurrent(run: PollRun, active: PollRun | undefined) {
  return run === active && run.generation === generation && run.token === uni.getStorageSync('staffToken');
}

async function pollDay(run: PollRun, manager: boolean) {
  try {
    let count: number;
    if (manager) count = (await api.tasksPage("waiting-handover", 1, 1)).total ?? 0;
    else {
      const list = await api.availableTasks();
      count = Array.isArray(list) ? list.length : 0;
    }
    if (!isCurrent(run, dayRun)) return;
    if (lastCount >= 0 && count > lastCount) {
      uni.vibrateShort({ fail: () => {} });
      uni.$emit("ikdnvw:new-orders");
    }
    lastCount = count;
  } catch {
    /* 白天失败只等待白天下轮重试，不阻塞夜宵。 */
  } finally { if (dayRun === run) dayRun = undefined; }
}

async function pollNight(run: PollRun) {
  try {
    const context = await api.businessContext();
    if (!isCurrent(run, nightRun)) return;
    syncWorkspaceMode(context);
    if (context.hasNightStore && (context.nightEnabled || context.hasNightHistory)) {
      const night = await api.nightOrders('pending-accept', 1, 1);
      if (!isCurrent(run, nightRun)) return;
      if (lastNightCount >= 0 && night.total > lastNightCount) {
        uni.vibrateShort({ fail: () => {} });
        uni.showToast({ title: `夜宵店有 ${night.total} 单待接单`, icon: 'none' });
        uni.$emit('night:new-orders');
      }
      lastNightCount = night.total;
    } else lastNightCount = -1;
  } catch {
    /* 夜宵失败不改变工作台或白天提醒，下轮独立重试。 */
  } finally { if (nightRun === run) nightRun = undefined; }
}

function poll(current: number) {
  if (current !== generation) return;
  const token = uni.getStorageSync("staffToken") as string;
  if (!token) return;
  if (token !== lastToken) {
    lastCount = -1; lastNightCount = -1; lastToken = token;
    dayRun = undefined; nightRun = undefined;
  }
  const manager = isManagerRole(useSessionStore().role);
  // Separate in-flight guards let either channel progress while the other waits.
  if (!dayRun) { dayRun = { generation: current, token }; void pollDay(dayRun, manager); }
  if (manager && !nightRun) { nightRun = { generation: current, token }; void pollNight(nightRun); }
}

/** 回前台/启动时开启（幂等）：立即首拍 + 周期轮询。 */
export function startPolling() {
  if (timer) return;
  const current = ++generation;
  dayRun = undefined; nightRun = undefined;
  lastCount = -1;
  lastNightCount = -1;
  void poll(current);
  timer = setInterval(() => void poll(current), INTERVAL_MS);
}

/** 切后台/退出时停表。 */
export function stopPolling() {
  generation++;
  dayRun = undefined; nightRun = undefined;
  lastToken = '';
  if (timer) clearInterval(timer);
  timer = undefined;
}
