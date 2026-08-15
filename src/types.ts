export type StaffRole =
  "building-manager" | "fulltime-rider" | "parttime-rider";
export interface StaffProfile {
  id: string;
  name: string;
  role: StaffRole;
  roleText: string;
  staffNo: string;
  building: string;
  online: boolean;
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
