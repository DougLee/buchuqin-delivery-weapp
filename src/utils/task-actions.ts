import type { Task } from "../types";

/** 列表行快捷操作（IKBW0H）：把当前状态「正常的下一步」直接放到列表行，
 *  高频作业不用再进详情滑到底部；异常动作（transfer/absent/refused）不放行内，
 *  需拍照/弹窗收集凭证的（handover/delivered）给入口按钮但跳详情完成。 */
export interface QuickAction {
  key: string;
  label: string;
  /** tap=行内一键完成；detail=跳详情页（拍照/弹窗流程在详情） */
  kind: "tap" | "detail";
}

/** 行内一键动作：均为无参简单推进（availableActions 由后端按状态机逐单下发） */
const INLINE_ACTIONS: Record<string, string> = {
  accept: "接单",
  depart: "开始配送",
  arrive: "到达楼下",
  receive: "确认接货",
};
/** 需进详情页的 标准下一步（拍照交接/送达确认弹窗） */
const DETAIL_ACTIONS: Record<string, string> = {
  handover: "拍照交接",
  delivered: "去送达",
};

/** 取该任务的标准下一步；无（已交接/异常分支等）返回 null */
export function quickAction(task: Task): QuickAction | null {
  for (const [key, label] of Object.entries(INLINE_ACTIONS))
    if (task.availableActions.includes(key)) return { key, label, kind: "tap" };
  for (const [key, label] of Object.entries(DETAIL_ACTIONS))
    if (task.availableActions.includes(key))
      return { key, label, kind: "detail" };
  return null;
}

/** 时效固定文案（IKBW0H，与后台订单列表口径一致）：只显示两种固定值。
 *  deadline（estimatedArrival）是展示文案不可机读，按 deliveryMode 映射。 */
export function slaText(task: Task): string {
  return task.mode === "instant" ? "立即配送" : "2小时送达";
}
