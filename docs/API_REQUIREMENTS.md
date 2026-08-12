# 不出寝食社履约端小程序 API 清单

> 适用项目：`buchuqinshishe-fulfillmentweapp`  
> 角色：仓库拣货员、一级配送员、楼长（二级配送）、兼职配送员  
> 范围：履约端 MVP（当班 → 领任务 → 取货 → 一级配送 → 楼下交接 → 配送到寝 → 凭证 → 收入/调配）

## 1. 通用约定

- Base URL：`/api/fulfillment`；登录接口仍位于 `/api/auth`。
- 使用 Bearer Token；正式环境的 `staffId`、`campusId`、`role`、权限范围均从 Token 获取。
- 当前前端使用 `?role=` 切换 Mock 角色，仅用于演示；生产接口必须删除该参数并启用角色守卫。
- 每个履约任务、包裹、库存动作必须包含 `campusId` 并记录操作人和操作时间。
- 状态变更接口必须校验合法前置状态、权限并支持幂等。
- 金额使用“分”，时间使用 ISO 8601，列表统一分页。
- 统一响应：`{ code, message, data, timestamp }`。
- 图片/交接码/扫码结果不能只保存在客户端临时路径。

## 2. 登录、身份与班次

| 状态 | 方法 | 路径 | 用途 | 主要请求 | 主要响应 |
|---|---|---|---|---|---|
| 已接入（Mock） | POST | `/auth/mock-login` | 模拟员工登录 | `code` | `token` |
| 待补充 | POST | `/auth/wechat-login` | 员工微信登录 | `code` | Token、员工、角色、权限 |
| 已接入 | GET | `/fulfillment/profile` | 当前员工资料 | 当前 Mock 有 `role` | 工号、角色、楼栋、在线状态 |
| 待补充 | PATCH | `/fulfillment/profile/status` | 上线、暂停接单、下线 | `status` | 最新状态 |
| 待补充 | GET | `/fulfillment/shifts/current` | 当前班次 | — | 班次、服务区域、开始/结束时间 |
| 待补充 | POST | `/fulfillment/shifts/check-in` | 上班签到 | `location?` | 签到记录 |
| 待补充 | POST | `/fulfillment/shifts/check-out` | 下班签退 | — | 签退及班次汇总 |

## 3. 工作台

| 状态 | 方法 | 路径 | 用途 | 查询参数 | 主要响应 |
|---|---|---|---|---|---|
| 已接入 | GET | `/fulfillment/dashboard` | 工作台聚合 | 当前 Mock 有 `role` | 员工、公告、待处理数、完成数、收入、准时率、优先任务 |
| 待补充 | GET | `/fulfillment/announcements` | 公告列表 | `page`, `pageSize` | 公告分页 |
| 待补充 | GET | `/fulfillment/metrics/today` | 今日实时指标 | — | 完成量、超时数、平均用时、收入 |

工作台聚合接口只返回首屏所需的 3–5 条优先任务；完整任务从任务列表分页获取。

## 4. 任务查询与调度

| 状态 | 方法 | 路径 | 用途 | 查询/请求参数 | 主要响应 |
|---|---|---|---|---|---|
| 已接入 | GET | `/fulfillment/tasks` | 任务列表 | `status`, `type?`, `page`, `pageSize`, `sort?` | 任务分页 |
| 已接入 | GET | `/fulfillment/tasks/:id` | 任务详情 | — | 包裹、商品、路线、时效、收入、时间线、可执行动作 |
| 待补充 | GET | `/fulfillment/tasks/available` | 可抢/可接任务池 | `buildingId?`, `page`, `pageSize` | 可接任务分页 |
| 待补充 | POST | `/fulfillment/tasks/:id/accept` | 接单/领取任务 | `version` | 已分配任务 |
| 待补充 | POST | `/fulfillment/tasks/:id/reject` | 拒绝派单 | `reasonCode`, `reason?` | 处理结果 |
| 待补充 | POST | `/fulfillment/tasks/:id/transfer` | 申请转单 | `reasonCode`, `reason?` | 转单申请 |
| 待补充 | POST | `/fulfillment/tasks/:id/report-exception` | 上报异常 | `type`, `description`, `images[]`, `location?` | 异常记录 |

列表项至少包含：任务类型、优先级、当前状态、楼栋/寝室、件数/重量、取货点、截止时间、预计收入、是否超时。服务端应返回 `availableActions[]`，前端不要自行猜测可操作按钮。

## 5. 仓储拣货与出库

即使仓库端暂未单独开发，完整履约闭环仍需要以下 API：

| 状态 | 方法 | 路径 | 用途 | 主要请求 | 主要响应 |
|---|---|---|---|---|---|
| 待补充 | GET | `/fulfillment/picking-tasks` | 拣货任务列表 | `status`, `page`, `pageSize` | 拣货任务分页 |
| 待补充 | GET | `/fulfillment/picking-tasks/:id` | 拣货单详情 | — | 库位、商品、应拣数量 |
| 待补充 | POST | `/fulfillment/picking-tasks/:id/start` | 开始拣货 | — | 拣货任务 |
| 待补充 | POST | `/fulfillment/picking-tasks/:id/items/:itemId/scan` | 扫码确认商品 | `barcode`, `quantity` | 当前拣货进度 |
| 待补充 | POST | `/fulfillment/picking-tasks/:id/complete` | 完成拣货并打包 | `packageCount`, `weight` | 包裹、交接码 |
| 待补充 | POST | `/fulfillment/packages/:id/outbound` | 扫码出库 | `scanCode` | 出库记录、一级配送任务 |

## 6. 一级配送

| 状态 | 方法 | 路径 | 用途 | 主要请求 | 主要响应 |
|---|---|---|---|---|---|
| 当前通用 action | POST | `/fulfillment/tasks/:id/accept` | 一级配送接单 | `version` | 任务 |
| 当前通用 action | POST | `/fulfillment/tasks/:id/pickup` | 仓库扫码取货 | `packageCode`, `location?` | 取货结果、任务 |
| 待补充 | POST | `/fulfillment/tasks/:id/depart` | 从仓库出发 | `location?` | 任务 |
| 当前通用 action | POST | `/fulfillment/tasks/:id/arrive` | 到达寝室楼下 | `location?` | 任务、交接信息 |
| 待补充 | POST | `/fulfillment/tasks/:id/handover` | 与楼长扫码交接 | `handoverCode`, `packageIds[]`, `images?` | 交接记录、二级任务 |

交接必须由双方或交接码确认，记录包裹清单、时间、操作人；不能仅靠单方点击推进。

## 7. 楼长/二级配送

| 状态 | 方法 | 路径 | 用途 | 主要请求 | 主要响应 |
|---|---|---|---|---|---|
| 当前通用 action | POST | `/fulfillment/tasks/:id/receive` | 楼下接货 | `handoverCode?`, `packageIds?` | 任务 |
| 待补充 | POST | `/fulfillment/tasks/:id/start-delivery` | 开始楼内配送 | — | 任务 |
| 当前通用 action | POST | `/fulfillment/tasks/:id/delivered` | 送达寝室 | `images[]`, `location`, `receiver?` | 送达任务、凭证 |
| 当前通用 action | POST | `/fulfillment/tasks/:id/absent` | 用户不在寝室 | `images?`, `contactResult?`, `remark?` | 异常/二次配送安排 |
| 待补充 | POST | `/fulfillment/tasks/:id/reschedule` | 安排二次配送 | `deliverySlot`, `remark?` | 新配送安排 |

送达必须校验至少一张凭证、有效定位、任务状态和操作者权限；服务端写入用户订单履约轨迹并触发消息。

## 8. 通用动作接口迁移说明

当前已接入：

`POST /fulfillment/tasks/:id/actions/:action`

支持 Mock 动作：`accept`、`pickup`、`arrive`、`receive`、`delivered`、`absent`、`transfer`。

建议正式化时拆成上文明确命名的接口。若仍保留通用 Action API，至少要求：

- 使用枚举 DTO，不接受任意字符串。
- 针对每个动作定义独立 payload 校验。
- 返回 `availableActions[]` 和更新后的任务版本号。
- 使用 `Idempotency-Key` 或任务 `version` 防止重复点击。
- 记录状态变更审计日志。

## 9. 文件、扫码、路线与联系

| 状态 | 方法 | 路径 | 用途 | 主要请求 | 主要响应 |
|---|---|---|---|---|---|
| 待补充 | POST | `/files/images` | 上传送达/异常凭证 | 图片文件 | `fileId`, `url` |
| 待补充 | POST | `/fulfillment/scans/resolve` | 解析包裹/交接码 | `code` | 资源类型、任务、包裹 |
| 待补充 | GET | `/fulfillment/tasks/:id/route` | 获取取送路线信息 | — | 节点、坐标、建议顺序 |
| 待补充 | POST | `/fulfillment/tasks/:id/contact` | 获取隐私号/记录联系 | `channel` | 脱敏号码或通话凭据 |

## 10. 收入、绩效与结算

| 状态 | 方法 | 路径 | 用途 | 查询参数 | 主要响应 |
|---|---|---|---|---|---|
| 已接入 | GET | `/fulfillment/commissions` | 收入概览和明细 | `month?`, 当前 Mock 有 `role` | 底薪、提成、调整、应结、明细 |
| 待补充 | GET | `/fulfillment/commissions/records` | 提成明细分页 | `month`, `page`, `pageSize` | 明细分页 |
| 待补充 | GET | `/fulfillment/performance` | 绩效指标 | `period=today|week|month` | 完成量、准时率、凭证率、异常率 |
| 待补充 | GET | `/fulfillment/settlements` | 结算单列表 | `status?`, `page`, `pageSize` | 月结单分页 |
| 待补充 | GET | `/fulfillment/settlements/:id` | 结算单详情 | — | 收支项、状态、结算时间 |

## 11. 请假、排班与跨楼调配

| 状态 | 方法 | 路径 | 用途 | 主要请求 | 主要响应 |
|---|---|---|---|---|---|
| 已接入（聚合） | GET | `/fulfillment/leave-dispatch` | 请假记录和调配邀请 | — | 两类记录 |
| 待补充 | POST | `/fulfillment/leave-requests` | 提交请假 | `startAt`, `endAt`, `reason` | 请假单 |
| 待补充 | GET | `/fulfillment/leave-requests` | 请假记录 | `status?`, `page`, `pageSize` | 请假分页 |
| 待补充 | POST | `/fulfillment/leave-requests/:id/cancel` | 撤销待审请假 | — | 请假单 |
| 待补充 | GET | `/fulfillment/dispatch-invitations` | 跨楼调配邀请 | `status?` | 邀请列表 |
| 待补充 | POST | `/fulfillment/dispatch-invitations/:id/accept` | 接受调配 | — | 调配结果、班次 |
| 待补充 | POST | `/fulfillment/dispatch-invitations/:id/reject` | 拒绝调配 | `reason?` | 邀请结果 |

## 12. 消息与实时更新

| 状态 | 方法 | 路径 | 用途 | 主要响应 |
|---|---|---|---|---|
| 待补充 | GET | `/fulfillment/notifications` | 任务、调配、异常消息 | 消息分页 |
| 待补充 | POST | `/fulfillment/notifications/:id/read` | 消息已读 | 消息 |
| 待补充 | GET | `/fulfillment/notifications/unread-count` | 未读数 | 分类计数 |
| 待补充 | WS/SSE | `/fulfillment/events` | 新任务、撤单、超时预警、调度变更 | 事件流 |

## 13. 建议状态机

### 包裹

`locked → picking → packed → outbound → first-mile → handover → last-mile → delivered`

异常分支：`picking-exception`、`handover-exception`、`recipient-absent`、`damaged`、`cancelled`。

### 履约任务

`available → assigned → accepted → in-progress → arrived → handed-over/delivered → completed`

任何推进都必须同时校验：当前状态、员工角色、服务校园、任务归属、任务版本。

## 14. MVP 实现优先级

1. Token 身份/角色守卫，移除生产环境 `role` 查询参数。
2. 任务分页、任务详情、`availableActions[]` 与合法状态机。
3. 拣货、出库、一级配送、扫码交接、二级配送的完整接口。
4. 凭证图片上传、定位与用户不在异常处理。
5. 请假申请和调配接受/拒绝接口，替换当前静态 Toast。
6. 收入明细分页、结算单和绩效接口。
7. 新任务/撤单/超时预警实时推送。

