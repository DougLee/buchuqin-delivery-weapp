import { api } from "../api";
import type { WechatPayParams } from "../types";

/** 夜宵店共享工具（IKSW1F 楼长端）：押金支付流程 / 状态文案映射 */

/* ==================== 押金缴纳（ND 支付单 → JSAPI 拉起 → 轮询到账） ==================== */

function requestPayment(params: WechatPayParams): Promise<void> {
  return new Promise((resolve, reject) =>
    uni.requestPayment({
      provider: "wxpay",
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType as "RSA",
      paySign: params.paySign,
      success: () => resolve(),
      fail: reject,
    }),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 到账确认轮询：收银台成功后回调可能未即时落账，查单兜底最多 5 次 × 2s */
const PAID_POLL_TIMES = 5;
const PAID_POLL_INTERVAL = 2000;

/**
 * 押金支付统一流程（复刻用户端 startPayFlow 口径）：
 * 1. POST deposit/pay 生成 ND 支付单（后端按 500 元档递增自动算差额）
 * 2. uni.requestPayment 拉起微信收银台
 * 3. GET deposit/pay-status 轮询确认到账（回调故障时服务端主动查微信单落账）
 * 返回 paid=已到账（余额已更新）/ unpaid=未完成支付 / checking=确认中
 * （轮询超时回调未落，页面挂「确认到账」入口继续补查，不留死路）。
 */
export async function startDepositPay(): Promise<
  "paid" | "unpaid" | "checking"
> {
  const intent = await api.nightDepositPay();
  let launched = false;
  try {
    await requestPayment(intent.payParams);
    launched = true;
  } catch {
    launched = false;
  }
  if (launched) {
    for (let i = 0; i < PAID_POLL_TIMES; i++) {
      const s = await api.nightDepositPayStatus(intent.outTradeNo);
      if (s.status === "paid") return "paid";
      if (i < PAID_POLL_TIMES - 1) await sleep(PAID_POLL_INTERVAL);
    }
    return "checking";
  }
  // 收银台取消/失败也查一次：防「实际已扣款但收银台报错」边角
  const s = await api.nightDepositPayStatus(intent.outTradeNo);
  return s.status === "paid" ? "paid" : "unpaid";
}

/** 判断业务拒绝是否为「押金额度不足」（备货被拦截 → 引导补缴押金） */
export function isDepositGapError(message: string): boolean {
  return /押金额度不足/.test(message || "");
}

/* ==================== 状态文案映射（后端下发 statusText，缺省时兜底） ==================== */

/** 夜宵店营业态文案（工作台/首页入口共用） */
export function nightStoreStatusText(status: string): string {
  if (status === "open") return "营业中";
  if (status === "paused") return "暂停营业";
  if (status === "suspended") return "已停业";
  return "已打烊";
}

/** 夜宵店营业态徽章色（info 营业/ warn 暂停 / danger 停业 / muted 打烊） */
export function nightStoreStatusTone(status: string): string {
  if (status === "open") return "open";
  if (status === "paused") return "paused";
  if (status === "suspended") return "suspended";
  return "closed";
}

/** 佣金流水状态文案 */
export function nightCommissionStatusText(status: string): string {
  if (status === "estimated") return "预计";
  if (status === "pending") return "待结算";
  if (status === "settled") return "已结算";
  return status;
}

/** 佣金流水类型文案 */
export function nightCommissionTypeText(type: string): string {
  return type === "deliveryFee" ? "配送费收入" : "商品佣金";
}

/** 押金流水文案与方向（amount 恒正，方向由类型决定） */
export function nightDepositTxnView(type: string): {
  label: string;
  negative: boolean;
} {
  if (type === "deduct") return { label: "押金扣除", negative: true };
  if (type === "refund") return { label: "押金退还", negative: true };
  return { label: "押金缴纳", negative: false };
}
