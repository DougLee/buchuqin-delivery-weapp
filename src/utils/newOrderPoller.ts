import { api } from "../api";
import { useSessionStore } from "../stores/session";

/**
 * 新单轮询（IKDNVW 方案A，2026-09-07 道哥）：前台期间每 30s 拉一次
 * 「待处理量」，数量增加时震动并广播任务页重拉（角标已移除，2026-09-08 道哥）。
 * - 骑手（rider）：抢单池条数（availableTasks，仅配送员角色可调）
 * - 楼长（building-manager）：有包裹到楼待接货（waiting-handover）
 * onHide 停表省流量；请求失败/未登录静默跳过（网络差不打扰）。
 * 与后续 E 离线推送（liveActivity 状态卡片，等类目审核）互补：
 * A 管前台即时感，E 管离线触达。
 */
const INTERVAL_MS = 30_000;
let timer: ReturnType<typeof setInterval> | undefined;
let lastCount = -1;

async function poll() {
  // 未登录静默跳过（游客态/登录页阶段不打接口）
  if (!uni.getStorageSync("staffToken")) return;
  const { role } = useSessionStore();
  try {
    let count = 0;
    if (role === "building-manager") {
      const page = await api.tasksPage("waiting-handover", 1, 1);
      count = page.total ?? 0;
    } else {
      // 抢单池仅配送员角色（后端口径），楼长以外的其他角色与骑手同路
      const list = await api.availableTasks();
      count = Array.isArray(list) ? list.length : 0;
    }
    // 数量增加才震动（回前台首拍 lastCount 已重置，不误震）
    if (lastCount >= 0 && count > lastCount) {
      uni.vibrateShort({ fail: () => {} });
      // 新单到达广播：任务页监听后静默重拉，卡片状态不再滞后
      uni.$emit("ikdnvw:new-orders");
    }
    lastCount = count;
  } catch {
    /* 静默：401/网络差下轮重试 */
  }
}

/** 回前台/启动时开启（幂等）：立即首拍 + 周期轮询。 */
export function startPolling() {
  if (timer) return;
  lastCount = -1;
  void poll();
  timer = setInterval(() => void poll(), INTERVAL_MS);
}

/** 切后台/退出时停表。 */
export function stopPolling() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
