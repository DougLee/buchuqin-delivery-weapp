import { request } from "./request";
import type { Dashboard, StaffProfile, StaffRole, Task } from "../types";
export const api = {
  login: (identity: StaffRole) =>
    request<{ token: string }>("/auth/test-login", {
      method: "POST",
      data: { identity },
    }),
  profile: (_r: StaffRole) => request<StaffProfile>("/fulfillment/profile"),
  dashboard: (_r: StaffRole) => request<Dashboard>("/fulfillment/dashboard"),
  tasks: (_r: StaffRole, s = "all") =>
    request<Task[]>(`/fulfillment/tasks?status=${s}`),
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
  leave: () => request<any[]>("/fulfillment/leave-dispatch"),
  createLeave: (data: Record<string, unknown>) =>
    request<any>("/fulfillment/leave-requests", { method: "POST", data }),
  acceptDispatch: (id: string) =>
    request<any>(`/fulfillment/dispatch-invitations/${id}/accept`, {
      method: "POST",
    }),
  commissions: (_r: StaffRole) => request<any>("/fulfillment/commissions"),
};
