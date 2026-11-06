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
 * 返回 outcome=paid（已到账，余额已更新）/ unpaid（未完成支付）/ checking
 * （确认中）；outTradeNo 供页面把未确认单号持久化（页面离开再回来仍可
 * 「确认到账」补查，不留死路）。
 */
export async function startDepositPay(targetTier?: number, onIntent?: (tradeNo: string) => void): Promise<{
  outcome: "paid" | "unpaid" | "checking";
  outTradeNo: string;
}> {
  const intent = await api.nightDepositPay(targetTier);
  onIntent?.(intent.outTradeNo);
  let launched = false;
  try {
    // #ifdef H5
    if (import.meta.env.DEV && import.meta.env.VITE_NIGHT_LOCAL_PREVIEW === 'true' && intent.payParams.appId === 'LOCAL_PREVIEW_ONLY') {
      const choice = await uni.showModal({ title: '本机模拟缴纳押金', content: '仅验证测试数据的押金流程，不会真实扣款。确认模拟缴纳？', confirmText: '模拟缴纳', cancelText: '取消' });
      if (!choice.confirm) return { outcome: 'unpaid', outTradeNo: intent.outTradeNo };
      const response = await fetch('/__night-preview/deposit-pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ depositOrderId: intent.depositOrderId }) });
      if (!response.ok) throw new Error('本机模拟缴纳失败');
    } else
    // #endif
    await requestPayment(intent.payParams);
    launched = true;
  } catch {
    launched = false;
  }
  if (launched) {
    for (let i = 0; i < PAID_POLL_TIMES; i++) {
      const s = await api.nightDepositPayStatus(intent.outTradeNo);
      if (s.status === "paid")
        return { outcome: "paid", outTradeNo: intent.outTradeNo };
      if (i < PAID_POLL_TIMES - 1) await sleep(PAID_POLL_INTERVAL);
    }
    return { outcome: "checking", outTradeNo: intent.outTradeNo };
  }
  // 收银台取消/失败也查一次：防「实际已扣款但收银台报错」边角
  const s = await api.nightDepositPayStatus(intent.outTradeNo);
  return {
    outcome: s.status === "paid" ? "paid" : "unpaid",
    outTradeNo: intent.outTradeNo,
  };
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

/**
 * 备货单状态文案（schema 默认 completed=下单即入库）：后端追加状态时在此
 * 映射，未知的原样返回。
 */
export function nightStockOrderStatusText(status: string): string {
  if (status === "completed") return "已入库";
  if (status === "cancelled") return "已取消";
  return status;
}
