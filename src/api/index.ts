import { request } from "./request";
import type {
  CommissionBill,
  CommissionRecord,
  Dashboard,
  LeaveItem,
  Performance,
  Shift,
  StaffProfile,
  StaffRole,
  StaffStatus,
  Task,
} from "../types";
/** 后端列表统一分页信封（IK8W5 分页包裹），api 层解包成页面所需的裸形状 */
interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
export const api = {
  login: (identity: StaffRole) =>
    request<{ token: string }>("/auth/test-login", {
      method: "POST",
      data: { identity },
    }),
  profile: (_r: StaffRole) => request<StaffProfile>("/fulfillment/profile"),
  dashboard: (_r: StaffRole) => request<Dashboard>("/fulfillment/dashboard"),
  tasks: async (_r: StaffRole, s = "all") =>
    (await request<PageResult<Task>>(`/fulfillment/tasks?status=${s}`)).items,
  task: (_r: StaffRole, id: string) =>
    request<Task>(`/fulfillment/tasks/${id}`),
  action: (
    _r: StaffRole,
    id: string,
    a: string,
    data: Record<string, unknown> = {},
  ) =>
    request<Task>(`/fulfillment/tasks/${id}/actions/${a}`, {
      method: "POST",
      data,
    }),
  performance: (_r: StaffRole) =>
    request<Performance>("/fulfillment/performance"),
  leave: () => request<LeaveItem[]>("/fulfillment/leave-dispatch"),
  createLeave: (data: Record<string, unknown>) =>
    request<LeaveItem>("/fulfillment/leave-requests", { method: "POST", data }),
  acceptDispatch: (id: string) =>
    request<LeaveItem>(`/fulfillment/dispatch-invitations/${id}/accept`, {
      method: "POST",
    }),
  /** 后端把 records 改为 items 并加分页信封（汇总字段平铺不变），这里映射回 CommissionBill */
  commissions: async (_r: StaffRole) => {
    const { items, ...summary } = await request<
      Omit<CommissionBill, "records"> & PageResult<CommissionRecord>
    >("/fulfillment/commissions");
    return { ...summary, records: items };
  },
  // —— 以下为 IK8W5U 接入的后端已有能力 ——
  /** 当班卡：GET /fulfillment/shifts/current */
  shiftsCurrent: () => request<Shift>("/fulfillment/shifts/current"),
  checkIn: () =>
    request<Shift>("/fulfillment/shifts/check-in", { method: "POST" }),
  checkOut: () =>
    request<Shift>("/fulfillment/shifts/check-out", { method: "POST" }),
  /** 上下线切换：PATCH /fulfillment/profile/status
   * TODO(真机验证): @dcloudio/types 未收录 PATCH；H5 正常，微信端 wx.request
   * 对 PATCH 的支持未在官方文档列出，需真机回归（异常时需后端补 POST 通道） */
  updateStatus: (status: StaffStatus) =>
    request<StaffProfile>("/fulfillment/profile/status", {
      method: "PATCH" as UniApp.RequestOptions["method"],
      data: { status },
    }),
  /** 抢单池（仅骑手角色，楼长 403）：GET /fulfillment/tasks/available */
  availableTasks: () => request<Task[]>("/fulfillment/tasks/available"),
  /** 抢单：POST /fulfillment/tasks/:id/grab，与 accept 同互斥 */
  grab: (id: string) =>
    request<Task>(`/fulfillment/tasks/${id}/grab`, {
      method: "POST",
      data: {},
    }),
  /** 拒绝调配邀请 */
  rejectDispatch: (id: string) =>
    request<LeaveItem>(`/fulfillment/dispatch-invitations/${id}/reject`, {
      method: "POST",
      data: {},
    }),
  /** 撤销待审核请假 */
  cancelLeave: (id: string) =>
    request<LeaveItem>(`/fulfillment/leave-requests/${id}/cancel`, {
      method: "POST",
    }),
};
