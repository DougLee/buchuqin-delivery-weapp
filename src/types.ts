export type StaffRole =
  | "building-manager"
  | "intern-building-manager"
  | "fulltime-rider"
  | "parttime-rider";
/**
 * 楼长系角色判断（IKEAGE）：实习楼长（intern-building-manager，招募审批
 * 通过自动创建）与正式楼长完全同权——任务/交接/请假/收入/轮询等所有
 * 楼长分支统一走本函数，新增角色只改这里。
 */
export function isManagerRole(role: StaffRole): boolean {
  return role === "building-manager" || role === "intern-building-manager";
}
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
  /** 归属校区（IKAJT4 去硬编码）：顶部「校区 · 仓名」接口下发 */
  campusName?: string;
  campusWarehouseName?: string;
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
  /** IKA57O：配送单号已下线，展示改用订单号 */
  packageNo?: string;
  orderNo: string;
  status: string;
  statusText: string;
  building: string;
  floor: number;
  room: string;
  itemCount: number;
  weight: number;
  /** 收件人联系（IK9AWW）：展示脱敏、拨号用真实号 */
  recipientName: string;
  recipientPhone: string;
  mode: string;
  modeText: string;
  /** IKI7LZ：下单时间（北京时间 MM-DD HH:mm）——替代 deadline 的歧义时段文案 */
  orderedAt: string;
  deadline: string;
  warehouse: string;
  /** 任务佣金（单位:分） */
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
  /** 统计卡数值；income 键为金额（单位:分），其余为单量/百分比 */
  stats: Record<string, number>;
  announcement: string;
  tasks: Task[];
}
/** 订阅消息额度（IKDQP9）：GET /fulfillment/notify/quota
 *  lowWater=quota<5（低水位）；failedToday=当天有推送因额度耗尽失败；
 *  gzhBound=已关注服务号（IKI3ZP，关注后派单走服务号模板不受额度限制） */
export interface NotifyQuotaInfo {
  quota: number;
  lowWater: boolean;
  failedToday: boolean;
  gzhBound?: boolean;
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
  /** 收入（单位:分） */
  income: number;
  onTimeRate: number;
  proofRate: number | null;
  exceptionRate: number;
}
export interface CommissionRecord {
  id: string;
  orderNo: string;
  building: string;
  /** 提成金额（单位:分） */
  amount: number;
  createdAt: string;
  status: string;
  /** 无规则命中的兜底提成标记（IK8W5L 口径） */
  fallback?: boolean;
  remark?: string | null;
}
export interface CommissionBill {
  month: string;
  /** 社群底薪（单位:分） */
  baseSalary: number;
  /** 配送提成（单位:分） */
  deliveryIncome: number;
  /** 跨期调整（单位:分，可为负） */
  adjustment: number;
  /** 应结金额（单位:分） */
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
  /** 调配奖励，源自 DispatchInvitation.reward（单位:分） */
  reward?: number;
  /** 自己调配指定的代班楼长姓名（IKA57Y） */
  substituteName?: string | null;
}
