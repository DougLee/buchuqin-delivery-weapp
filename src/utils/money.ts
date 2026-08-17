/**
 * 金额分制适配：后端全部金额字段为整数分（单位:分）。
 * 展示统一经 fenToYuan 换算，禁止裸除 100（浮点误差）。
 */
export function fenToYuan(fen: number): string {
  if (!Number.isFinite(fen)) return "0.00";
  // 纯整数运算：截断小数、符号单独处理，避免 (fen / 100) 的浮点精度问题
  const n = Math.trunc(fen);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const yuan = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}${yuan}.${cents}`;
}
