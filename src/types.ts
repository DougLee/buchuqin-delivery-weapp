export type StaffRole =
  "building-manager" | "fulltime-rider" | "parttime-rider";
/** 后端 Staff.status 三态（IK8W5U）：profile.online 由它派生 */
export type StaffStatus = "online" | "paused" | "offline";
export interface StaffProfile {
  id: string;
  name: string;
  role: StaffRole;
  roleText: string;
  staffNo: string;
  building: string;
  online: boolean;
  status: StaffStatus;
}
/** 当班卡（IK8W5U）：GET /fulfillment/shifts/current */
export interface Shift {
  id: string;
  status: "working" | "not-started" | "completed";
  role: StaffRole;
  serviceArea: string;
  startAt: string;
  endAt: string;
  checkedInAt?: string;
  checkedOutAt?: string;
}
export interface Task {
  id: string;
  orderId: string;
  packageNo: string;
  status: string;
  statusText: string;
  building: string;
  floor: number;
  room: string;
  itemCount: number;
  weight: number;
  mode: string;
  modeText: string;
  deadline: string;
  warehouse: string;
  commission: number;
  items: Array<{ name: string; quantity: number; image: string }>;
  timeline: Array<{
    key: string;
    title: string;
    description: string;
    done: boolean;
    time?: string;
  }>;
  availableActions: string[];
}
export interface Dashboard {
  profile: StaffProfile;
  stats: Record<string, number>;
  announcement: string;
  tasks: Task[];
}
export interface ApiResult<T> {
  code: number;
  message: string;
  data: T;
  timestamp: string;
}
export interface Performance {
  period: string;
  pending: number;
  completed: number;
  income: number;
  onTimeRate: number;
  proofRate: number | null;
  exceptionRate: number;
}
export interface CommissionRecord {
  id: string;
  orderNo: string;
  building: string;
  amount: number;
  createdAt: string;
  status: string;
  /** 无规则命中的兜底提成标记（IK8W5L 口径） */
  fallback?: boolean;
  remark?: string | null;
}
export interface CommissionBill {
  month: string;
  baseSalary: number;
  deliveryIncome: number;
  adjustment: number;
  payable: number;
  records: CommissionRecord[];
}
export interface LeaveItem {
  id: string;
  building?: string;
  status: string;
  statusText: string;
  startAt: string;
  endAt: string;
  reason?: string;
  reward?: number;
}
