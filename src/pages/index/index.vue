<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { APP_NAME as appName } from "../../config/app";
import { isManagerRole } from "../../types";
import { onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import { api } from "../../api";
import { isRetryable } from "../../api/request";
import { useSessionStore, isBindRequired } from "../../stores/session";
import { fenToYuan } from "../../utils/money";
import { quickAction, type QuickAction } from "../../utils/task-actions";
import {
  fetchQuota,
  grantTimes,
  isGuideShown,
  markGuideShown,
} from "../../utils/notifyQuota";
import type {
  Dashboard,
  Shift,
  StaffRole,
  Task,
} from "../../types";

const session = useSessionStore();
const data = ref<Dashboard>();
const shift = ref<Shift>();
/** 加载失败标记（IK8W5V）：失败时展示重试入口，避免页面永久空白 */
const error = ref(false);
/** 访客态（IKC4IN 审核整改）：未绑定员工时先浏览功能引导，登录由用户自主点击 */
const guest = ref(false);
/** 首屏加载中（IK9VF8）：驱动骨架屏，对齐 tasks/income 标准 */
const loading = ref(false);
/** 状态切换按钮防重（IK8W5U）——IKA57R：切换入口已移「我的」页，此标记随迁 */
const hour = new Date().getHours();
const greeting = computed(() =>
  hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好",
);
const shiftState = computed(() => {
  if (!shift.value) return { text: "排班加载中", working: false };
  if (shift.value.status === "working")
    return { text: "当班中", working: true };
  if (shift.value.status === "completed")
    return { text: "今日已签退", working: false };
  return { text: "今日未签到", working: false };
});

async function load() {
  error.value = false;
  loading.value = true;
  try {
    await session.ensure();
    const [d, s] = await Promise.all([
      api.dashboard(session.role).then((d) => {
        return d;
      }),
      api.shiftsCurrent(),
    ]);
    data.value = d;
    shift.value = s;
    // IKDQP9：登录态下查订阅额度（低水位条）；骑手首次「接单中」→ 上岗引导半屏
    void refreshNotifyBar();
    // 道哥 2026-09-09：授权引导全员放开——楼长（含实习）也收到楼下推送，
    // 登录且上岗同样弹一次授权框（IKEAGE 撤销此前对楼长系的排除）
    if (d.profile.status === "online" && !isGuideShown())
      guideVisible.value = true;
  } catch (e) {
    // IKC4IN：未绑定员工（游客）→ 功能引导态，不强制登录；
    // ADR-0005(IKA00R)：网络/服务故障进整页错误态，业务拒绝由 request 层 toast
    if (isBindRequired(e)) guest.value = true;
    else if (isRetryable(e)) error.value = true;
  } finally {
    loading.value = false;
  }
}
// IK9U4F：签到/签退入口已隐藏（决策记录不做地理围栏签到），保留当班状态读取
// IKA57R：状态切换入口移至「我的」页（原位置被状态栏/胶囊遮挡），首页仅展示
/* ---------- IKKTTP 楼长作战地图 ---------- */
const isManager = computed(() =>
  isManagerRole(data.value?.profile.role ?? "fulltime-rider"),
);
/** 平均用时（IK8W5V 去演示化）：后端无 averageMinutes 字段时显示"—"，不再硬编码 12 */
const avgMinutes = computed<number | null>(() => {
  const v = data.value?.stats.averageMinutes;
  return typeof v === "number" ? v : null;
});
/** 准时率（IK9VF8）：同 averageMinutes 的 null 防御，缺字段显示"—"不带空百分比 */
const onTimeRate = computed(() => {
  const v = data.value?.stats.onTimeRate;
  return typeof v === "number" ? `${v}%` : "—";
});
const open = (id: string) =>
  uni.navigateTo({ url: `/pages/task/detail?id=${id}` });
/** 下拉刷新（IKBW0F）：首页此前无刷新入口 */
onPullDownRefresh(async () => {
  await load();
  uni.stopPullDownRefresh();
});
/** 访客登录入口（IKC4IN）：用户自主点击后进登录页 */
const goLogin = () => uni.navigateTo({ url: "/pages/login/index" });
/** 列表行快捷操作（IKBW0H）：标准下一步行内一键完成，需拍照/弹窗的跳详情 */
const acting = ref<string | null>(null);
const qaOf = (task: Task): QuickAction | null => quickAction(task);
async function runAction(task: Task) {
  const qa = quickAction(task);
  if (!qa || acting.value) return;
  if (qa.kind === "detail") {
    uni.navigateTo({ url: `/pages/task/detail?id=${task.id}` });
    return;
  }
  acting.value = task.id;
  try {
    await api.action(session.role, task.id, qa.key, {});
    uni.showToast({ title: "操作成功", icon: "success" });
  } finally {
    acting.value = null;
    // 成功/失败都静默重拉纠偏（被抢冲突、状态已变时行内按钮随之消失）；
    // 失败提示由 request 层统一 toast
    load().catch(() => {});
  }
}
/** 顶部校区行（IKAJT4 去硬编码）：归属校区 · 仓名随 profile 接口下发 */
const campusLine = computed(() => {
  const p = data.value?.profile;
  return [p?.campusName, p?.campusWarehouseName].filter(Boolean).join(" · ");
});
/* ---------- IKDQP9 订阅消息通知交互层 ---------- */
/** 低水位提示条（IKDQP9）：当天已有推送因额度耗尽失败且余额 <3 条才渲染 */
const notifyLow = ref(false);
/* 道哥 2026-09-07：低水位条同样只对骑手两角色（推送受众）生效 */
const isRiderRole = () =>
  session.role === "fulltime-rider" || session.role === "parttime-rider";
async function refreshNotifyBar() {
  try {
    const q = await fetchQuota();
    notifyLow.value = isRiderRole() && q.failedToday && q.quota < 3;
  } catch {
    notifyLow.value = false; // 额度接口异常不拦工作台，条不渲染
  }
}
const toppingUp = ref(false);
async function topUpTen() {
  if (toppingUp.value) return;
  toppingUp.value = true;
  // 弹窗体验（道哥 2026-09-07 反馈）：未勾「总是保持」每次授权必弹窗——
  // 一次只攒 3 条（三窗封顶），勾过的用户无窗；条可连点继续补
  const ok = await grantTimes(3);
  toppingUp.value = false;
  if (ok > 0) {
    notifyLow.value = false; // 成功后条消失，下次 onShow 按条件重估
    uni.showToast({ title: `已补充 ${ok} 条`, icon: "none" });
  }
}
/** 上岗引导半屏（IKDQP9）：骑手首次切「接单中」回工作台弹一次（storage 标记） */
const guideVisible = ref(false);
const guideOpening = ref(false);
async function openGuideNotify() {
  if (guideOpening.value) return;
  guideOpening.value = true;
  markGuideShown();
  const ok = await grantTimes(3); // 引导一次攒 3 条
  guideOpening.value = false;
  guideVisible.value = false;
  uni.showToast({
    title:
      ok > 0
        ? `已开启，攒了 ${ok} 条提醒额度`
        : "未开启成功，可稍后在「我的」页补充",
    icon: "none",
  });
}
/** 「暂不」/点遮罩：同样写只弹一次标记，不再骚扰 */
function dismissGuide() {
  markGuideShown();
  guideVisible.value = false;
}
onShow(load);
const isLogged = computed(() => !!uni.getStorageSync("staffToken"));
// #ifdef H5
/** H5 测试登录（仅测试环境 H5 产物存在，小程序无此代码）：30 天长效
 *  测试 token 写死于此——泄漏面=测试环境履约端，生产不可见 */
const H5_TEST_ACCOUNTS = {
  rider: { token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InN0YWZmLXJpZGVyLWhidXQtdGVzdCIsInJvbGUiOiJmdWxsdGltZS1yaWRlciIsImlhdCI6MTc5MzQyNTc4NCwiZXhwIjoxNzk2MDE3Nzg0fQ.tiyw1euxVLWGuKnV5rikmvutijtnoiAd4obR3L_ogx0", label: "骑手·王99（湖工大）" },
  manager: { token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImNtdWV3MTNmazA4dGptdjAxb3h4czRidWwiLCJyb2xlIjoiaW50ZXJuLWJ1aWxkaW5nLW1hbmFnZXIiLCJpYXQiOjE3OTM0MjU3ODQsImV4cCI6MTc5NjAxNzc4NH0.Rv2C5Z_n1xfeD2w9yMmFK9I9_EuhxVGrrWOkwY7GKm8", label: "楼长·TS001（北区18栋）" },
};
function h5TestLogin(key: "rider" | "manager") {
  const acc = H5_TEST_ACCOUNTS[key];
  uni.setStorageSync("staffToken", acc.token);
  uni.setStorageSync("staffTokenRole", key === "rider" ? "fulltime-rider" : "intern-building-manager");
  uni.setStorageSync("staffRole", key === "rider" ? "fulltime-rider" : "intern-building-manager");
  uni.reLaunch({ url: "/pages/index/index" });
}
// #endif
</script>

<template>
  <view class="page home">
    <view class="nav">
      <view class="identity">
        <view class="logo"><view class="logo__route"></view></view>
        <view
          ><text class="brand">{{ appName }}</text
          ><!-- IKAJT4：校区信息接口下发，多校区不再硬编码湖工大 -->
          <text v-if="campusLine" class="campus">{{ campusLine }}</text></view
        >
      </view>
    </view>

    <!-- IKDQP9 低水位提示条：当天有推送失败且余额 <3 条才出现，点击连攒 10 条 -->
    <view v-if="notifyLow" class="notify-low" role="button" @tap="topUpTen"
      ><view class="notify-low__mark"></view
      ><text class="notify-low__text">通知额度不足，新单可能漏提醒</text
      ><text class="notify-low__act">{{
        toppingUp ? "补充中…" : "点此补充"
      }}</text></view
    >

    <!-- IK9U4F：签到/签退功能先隐藏（决策记录：不做地理围栏签到），
         当班状态由下方 hero 徽章继续展示 -->

    <view v-if="error" class="retry card" role="button" @tap="load"
      ><text class="retry__title">加载失败</text
      ><text class="retry__sub">网络异常或服务暂不可用，点击重试</text></view
    >

    <!-- 首屏骨架（IK9VF8）：hero + 统计 + 任务卡占位 -->
    <view v-else-if="loading" class="home-skeleton"
      ><view class="home-skeleton__hero" /><view
        class="home-skeleton__stats" /><view class="home-skeleton__task" /><view
        class="home-skeleton__task"
    /></view>

    <!-- H5 测试登录空态（仅 H5 产物存在）：未登录时一键注入测试账号，
         免真机微信登录流程；小程序无此代码 -->
    <!-- #ifdef H5 -->
    <template v-else-if="!isLogged">
      <view class="card h5-login">
        <text class="h5-login__title">H5 联调登录</text>
        <text class="h5-login__desc">选择测试账号（token 30 天有效，仅测试环境）</text>
        <button class="h5-login__btn" @tap="h5TestLogin('rider')">骑手 · 王99（湖工大）</button>
        <button class="h5-login__btn h5-login__btn--mgr" @tap="h5TestLogin('manager')">楼长 · TS001（北区18栋）</button>
      </view>
    </template>
    <!-- #endif -->
    <!-- 访客引导态（IKC4IN 审核整改）：先浏览平台介绍，登录由用户自主点击 -->
    <template v-else-if="guest">
      <view class="card guest__hero">
        <text class="guest__brand">{{ appName }}</text>
        <text class="guest__title">校园寝售 · 配送工作台</text>
        <text class="guest__desc"
          >零食饮料寝室直达的校园电商平台。本端为履约工作人员（配送员/楼长）专用工作台，员工工号绑定后即可上岗接单。</text
        >
      </view>
      <view class="card guest__feats"
        ><text class="guest__head">平台功能一览</text>
        <view class="guest__feat"
          ><text class="guest__no">01</text
          ><view
            ><text class="guest__ft">工作台 · 任务看板</text
            ><text class="guest__fd"
              >待处理任务按时效排序，行内一键接单、开始配送、确认送达</text
            ></view
          ></view
        >
        <view class="guest__feat"
          ><text class="guest__no">02</text
          ><view
            ><text class="guest__ft">两段接力配送</text
            ><text class="guest__fd"
              >配送员仓到楼、楼长楼到寝，拍照交接全程留痕</text
            ></view
          ></view
        >
        <view class="guest__feat"
          ><text class="guest__no">03</text
          ><view
            ><text class="guest__ft">收入与绩效</text
            ><text class="guest__fd"
              >每单佣金、准时率与月度结算，清晰可查</text
            ></view
          ></view
        ></view
      >
      <button class="guest__login" @tap="goLogin">员工登录</button>
      <text class="guest__tip"
        >仅限合作品牌在职员工使用 ·
        登录为微信静默授权，首次使用填写工号与姓名绑定</text
      >
    </template>

    <template v-else-if="data">
      <view class="hero">
        <view class="hero__glow"></view>
        <view class="hero__top"
          ><view
            ><text class="eyebrow">TODAY · 今日履约</text
            ><text class="hello"
              >{{ greeting }}，{{ data.profile.name }}</text
            ></view
          ><!-- IK8W5V：当班徽章接 shifts/current 真实状态 -->
          <view class="shift" :class="{ 'shift--off': !shiftState.working }">{{
            shiftState.working ? "当班" : "未当班"
          }}</view></view
        >
        <view class="hero__metric"
          ><text class="metric__number">{{ data.stats.pending }}</text
          ><view><text class="metric__unit">单待处理</text></view></view
        >
        <!-- IK8W5V：路线进度点为纯视觉装饰，不映射真实履约阶段 -->
        <view class="route"
          ><view class="route__point route__point--done"></view
          ><view class="route__line"></view
          ><view class="route__point route__point--active"></view
          ><view class="route__line"></view><view class="route__point"></view
        ></view>
        <view class="route-label"
          ><text>校园仓</text><text>配送中</text><text>寝室楼</text></view
        >
      </view>

      <!-- IKKTTP 金额四联：今日/本月 × 销售额/收入（楼长推广激励看板） -->
      <!-- 金额区（IKQCGO 角色化）：销售额仅楼长可见，配送员只看收入。
           2026-10-30 样式优化：骑手两格自适应占满（原固定 4 列右半空），
           零值灰化、有收入品牌绿（道哥 /ui-ux-pro-max） -->
      <view class="stats card" :class="{ 'stats--rider': !isManager }">
        <!-- IKRSIZ #108：校区可关销售额展示（后端置 null=不渲染该格） -->
        <view v-if="isManager && data.stats.todayGmv != null"
          ><text
            class="stats__value"
            :class="{ 'stats__value--zero': !data.stats.todayGmv }"
            >¥{{ fenToYuan(data.stats.todayGmv) }}</text
          ><text class="stats__label">今日销售额</text></view
        >
        <view
          ><text
            class="stats__value"
            :class="{ 'stats__value--zero': !data.stats.todayIncome }"
            >¥{{ fenToYuan(data.stats.todayIncome) }}</text
          ><text class="stats__label">今日收入</text></view
        >
        <view v-if="isManager && data.stats.monthGmv != null"
          ><text
            class="stats__value"
            :class="{ 'stats__value--zero': !data.stats.monthGmv }"
            >¥{{ fenToYuan(data.stats.monthGmv) }}</text
          ><text class="stats__label">本月销售额</text></view
        >
        <view
          ><text
            class="stats__value"
            :class="{ 'stats__value--zero': !data.stats.income }"
            >¥{{ fenToYuan(data.stats.income) }}</text
          ><text class="stats__label">本月收入</text></view
        >
      </view>


      <view class="section-title"
        ><view
          ><text class="section-kicker">NEXT TASKS</text
          ><text class="section-title__main">优先任务</text></view
        ><text
          class="section-title__sub"
          @tap="uni.switchTab({ url: '/pages/tasks/index' })"
          ><!-- IK9VQ2：chevron 形状即 >，改 chip 胶囊暗示可点 -->
          <text class="link-chip">全部任务</text></text
        ></view
      >
      <!-- IKQCGO 遗留修复（道哥 2026-10-30）：删作战地图后楼长分支无替代内容，
           v-if="!isManager" 让楼长优先任务整块空白（连空态都不渲染）——楼长
           同样渲染（dashboard.tasks 对楼长正常下发，行内按钮按角色走） -->
      <template>
        <view
          v-for="(task, index) in data.tasks"
          :key="task.id"
          class="task card"
          role="button"
          @tap="open(task.id)"
        >
          <view
            class="task__accent"
            :class="{ 'task__accent--orange': index === 0 }"
          ></view>
          <view class="task__head"
            ><!-- IKA57O：配送单号已下线，统一显订单号 -->
            <text class="package">{{ task.orderNo }}</text
            ><text class="status">{{ task.statusText }}</text></view
          >
          <view class="task__destination"
            ><view class="floor"
              ><text>{{ task.floor }}</text
              ><text>F</text></view
            ><view
              ><text class="building"
                >{{ task.building }}<text
                  class="gender-tag"
                  :class="`gender-tag--${task.buildingGender || 'mixed'}`"
                >{{ { male: '男生', female: '女生' }[task.buildingGender] || '混合' }}</text> · {{ task.room }}</text
              ><!-- 2026-09-07 道哥：时效固定文案与 meta「模式」格重复（同派生自
               deliveryMode），删除；destination 行只留楼栋 · 寝室 --></view
            ></view
          >
          <view class="task__meta"
            ><text>{{ task.itemCount }} 件 · {{ task.weight }}kg</text
            ><text>{{ task.modeText }}</text
            ><text class="commission"
              >+¥{{ fenToYuan(task.commission) }}</text
            ></view
          >
          <view class="task__action"
            ><!-- IK9VQ2：整卡可点，行尾箭头改 chip -->
            <!-- IKBW0H：标准下一步直接行内完成，无则保持查看入口 -->
            <button
              v-if="qaOf(task)"
              class="quick-btn"
              :disabled="acting === task.id"
              @tap.stop="runAction(task)"
            >
              {{ acting === task.id ? "处理中…" : qaOf(task)?.label }}
            </button>
            <text v-else class="link-chip">查看路线与操作</text></view
          >
        </view>
        <!-- 优先任务空态（IK9VF8）：无待处理时引导去任务看板，不留空白 -->
        <view
          v-if="!data.tasks.length"
          class="empty card"
          role="button"
          @tap="uni.switchTab({ url: '/pages/tasks/index' })"
          >暂无待处理任务，去任务看板看看</view
        >
      </template>
    </template>

    <!-- IKDQP9 上岗引导半屏：骑手首次切「接单中」弹一次（storage 标记）。
         三轮视觉（道哥 2026-09-07）：回退 0fec881 认可的骨架（左对齐+授权
         示意卡），内容精简——示意卡只留头部与复选框教学行，去「取消/允许」
         按钮与长文案；CSS 铃铛图形废弃（真机渲染崩） -->
    <view v-if="guideVisible" class="notify-guide">
      <view class="notify-guide__mask" @tap="dismissGuide"></view>
      <view class="notify-guide__panel">
        <text class="notify-guide__title">新单微信秒通知</text>
        <text class="notify-guide__desc"
          >不用盯着小程序，出了单微信直接提醒你</text
        >
        <view class="notify-guide__actions">
          <button class="notify-guide__btn" @tap="dismissGuide">暂不</button>
          <button
            class="notify-guide__btn notify-guide__btn--primary"
            :disabled="guideOpening"
            @tap="openGuideNotify"
          >
            {{ guideOpening ? "开启中…" : "开启通知" }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
/* H5 联调登录卡（仅 H5 产物） */
.h5-login {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 40rpx;
  margin-top: 30vh;
}
.h5-login__title {
  font-size: 34rpx;
  font-weight: 900;
  color: #10251c;
}
.h5-login__desc {
  font-size: 22rpx;
  color: #617168;
}
.h5-login__btn {
  margin: 0;
  min-height: 84rpx;
  border-radius: 28rpx;
  background: #073f2d;
  color: #fff;
  font-size: 28rpx;
  font-weight: 800;
  line-height: 84rpx;
}
.h5-login__btn--mgr {
  background: #e5f8eb;
  color: #073f2d;
}

@import "../../styles/theme.scss";
.home {
  /* IKA57R：微信 env(safe-area-inset-top) 在 page 级常取 0，用平台注入的
     --status-bar-height 才躲得开状态栏 */
  padding-top: calc(24rpx + var(--status-bar-height, 0px));
  background:
    radial-gradient(
      circle at 92% 8%,
      rgba(185, 242, 39, 0.18),
      transparent 28%
    ),
    $paper;
}
.nav,
.identity,
.hero__top,
.hero__metric,
.task__head,
.task__meta,
.task__action {
  display: flex;
  align-items: center;
}
.nav {
  justify-content: space-between;
}
.identity {
  gap: 16rpx;
}
.logo {
  width: 68rpx;
  height: 68rpx;
  border-radius: 20rpx;
  background: $primary-dark;
  display: grid;
  place-items: center;
  transform: rotate(-4deg);
}
.logo__route {
  width: 28rpx;
  height: 28rpx;
  border: 6rpx solid $lime;
  border-left-color: transparent;
  border-radius: 50%;
  position: relative;
}
.logo__route:after {
  content: "";
  position: absolute;
  width: 8rpx;
  height: 8rpx;
  background: $lime;
  border-radius: 50%;
  right: -8rpx;
  top: -3rpx;
}
.brand,
.campus {
  display: block;
}
.brand {
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: -1rpx;
}
.campus {
  font-size: 20rpx;
  color: $muted;
  margin-top: 2rpx;
}
.hero {
  position: relative;
  overflow: hidden;
  padding: 34rpx;
  border-radius: 36rpx;
  background: linear-gradient(
    145deg,
    $primary-deep,
    $primary-dark 72%,
    #126c43
  );
  color: #fff;
  box-shadow: 0 18rpx 44rpx rgba(3, 45, 34, 0.22);
}
.hero__glow {
  position: absolute;
  width: 280rpx;
  height: 280rpx;
  border-radius: 50%;
  right: -100rpx;
  top: -140rpx;
  background: rgba(185, 242, 39, 0.15);
}
.hero__top {
  position: relative;
  justify-content: space-between;
}
.eyebrow,
.hello {
  display: block;
}
.eyebrow {
  color: $lime;
  font-size: 19rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
}
.hello {
  font-size: 31rpx;
  font-weight: 800;
  margin-top: 7rpx;
}
.shift {
  border: 2rpx solid rgba(255, 255, 255, 0.28);
  border-radius: 999rpx;
  padding: 8rpx 18rpx;
  font-size: 20rpx;
}
.shift--off {
  opacity: 0.72;
}
.retry {
  text-align: center;
  padding: 90rpx 30rpx;
}
.retry__title,
.retry__sub {
  display: block;
}
.retry__title {
  font-weight: 900;
  color: $primary-dark;
}
.retry__sub {
  font-size: 21rpx;
  color: $muted;
  margin-top: 8rpx;
}
.hero__metric {
  gap: 18rpx;
  margin: 34rpx 0;
}
.metric__number {
  font-size: 82rpx;
  line-height: 1;
  font-weight: 900;
  color: $lime;
}
.metric__unit,
.metric__hint {
  display: block;
}
.metric__unit {
  font-size: 28rpx;
  font-weight: 800;
}
.metric__hint {
  font-size: 19rpx;
  opacity: 0.68;
  margin-top: 5rpx;
}
.route {
  display: grid;
  grid-template-columns: auto 1fr auto 1fr auto;
  align-items: center;
}
.route__point {
  width: 15rpx;
  height: 15rpx;
  border: 4rpx solid rgba(255, 255, 255, 0.45);
  border-radius: 50%;
}
.route__point--done {
  background: $lime;
  border-color: $lime;
}
.route__point--active {
  width: 22rpx;
  height: 22rpx;
  background: $accent;
  border-color: #fff;
  box-shadow: 0 0 0 8rpx rgba(255, 138, 52, 0.18);
}
.route__line {
  height: 2rpx;
  background: rgba(255, 255, 255, 0.28);
}
.route-label {
  display: flex;
  justify-content: space-between;
  margin-top: 10rpx;
  font-size: 18rpx;
  opacity: 0.65;
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 28rpx 10rpx;
  text-align: center;
}
/* 骑手两格自适应占满（原固定 4 列，销售额隐藏后右半空白） */
.stats--rider {
  grid-template-columns: repeat(2, 1fr);
}
.stats > view + view {
  border-left: 2rpx solid $line;
}
.stats__value,
.stats__label {
  display: block;
}
.stats__value {
  font-size: 34rpx;
  font-weight: 900;
  color: var(--brand, #159c55);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5rpx;
}
/* 零值弱化：灰化不抢眼，有收入才亮品牌绿 */
.stats__value--zero {
  color: #b9c2bc;
}
.stats__label {
  font-size: 20rpx;
  color: $muted;
  margin-top: 6rpx;
  letter-spacing: 1rpx;
}
.small {
  font-size: 17rpx;
  margin-left: 2rpx;
}
.section-kicker {
  display: block;
  color: $primary;
  font-size: 18rpx;
  font-weight: 900;
  letter-spacing: 2rpx;
}
.section-title__main {
  display: block;
}
.task {
  position: relative;
  overflow: hidden;
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.task:active {
  background: $soft;
}
.task__accent {
  position: absolute;
  left: 0;
  top: 26rpx;
  width: 7rpx;
  height: 70rpx;
  border-radius: 0 8rpx 8rpx 0;
  background: $primary;
}
.task__accent--orange {
  background: $accent;
}
.task__head {
  justify-content: space-between;
}
.package {
  font-size: 22rpx;
  color: $muted;
  font-weight: 700;
}
.task__destination {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin: 24rpx 0;
}
.floor {
  width: 76rpx;
  height: 76rpx;
  border-radius: 20rpx;
  background: $primary-dark;
  color: #fff;
  display: flex;
  align-items: baseline;
  justify-content: center;
}
.floor text:first-child {
  font-size: 36rpx;
  font-weight: 900;
}
.floor text:last-child {
  font-size: 17rpx;
}
.building {
  display: block;
  font-size: 34rpx;
  font-weight: 900;
}
/* IKRMQF：楼栋性别徽标——男寝蓝/女寝粉，mixed 不显示 */
.gender-tag {
  display: inline-block;
  margin-left: 8rpx;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
  font-size: 20rpx;
  font-weight: 700;
  vertical-align: middle;
}
.gender-tag--male {
  background: #e8f1fd;
  color: #2563eb;
}
.gender-tag--female {
  background: #fdeef3;
  color: #db2777;
}
.gender-tag--mixed {
  background: #eef1ef;
  color: #667069;
}
.task__meta {
  gap: 14rpx;
  color: $muted;
  font-size: 20rpx;
}
.commission {
  margin-left: auto;
  color: $primary-dark;
  font-size: 25rpx;
  font-weight: 900;
}
.task__action {
  justify-content: flex-end;
  border-top: 2rpx dashed $line;
  margin-top: 22rpx;
  padding-top: 18rpx;
  color: $primary-dark;
  font-size: 22rpx;
  font-weight: 800;
}
/* IKBW0H：行内快捷操作按钮，与任务页 grab-btn 同款视觉 */
.quick-btn {
  min-height: 62rpx;
  margin: 0;
  padding: 0 36rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: $lime;
  font-size: 24rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
}
.quick-btn[disabled] {
  opacity: 0.6;
}
/* 访客引导态（IKC4IN）：品牌介绍 + 功能一览 + 自主登录入口 */
.guest__hero,
.guest__feats {
  padding: 34rpx;
  margin-bottom: 20rpx;
}
.guest__brand {
  display: block;
  font-size: 20rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
  color: $primary;
}
.guest__title {
  display: block;
  font-size: 40rpx;
  font-weight: 900;
  color: $ink;
  margin-top: 10rpx;
}
.guest__desc,
.guest__fd {
  display: block;
  font-size: 22rpx;
  line-height: 1.7;
  color: $muted;
}
.guest__desc {
  margin-top: 12rpx;
}
.guest__head {
  display: block;
  font-size: 26rpx;
  font-weight: 900;
  color: $ink;
  margin-bottom: 18rpx;
}
.guest__feat {
  display: flex;
  gap: 18rpx;
  align-items: flex-start;
  padding: 14rpx 0;
}
.guest__no {
  font-size: 26rpx;
  font-weight: 900;
  color: $primary;
  opacity: 0.55;
}
.guest__ft {
  display: block;
  font-size: 25rpx;
  font-weight: 800;
  color: $ink;
}
.guest__fd {
  margin-top: 4rpx;
}
.guest__login {
  min-height: 88rpx;
  margin: 6rpx 0 16rpx;
  border-radius: 999rpx;
  background: $primary-dark;
  color: $lime;
  font-size: 28rpx;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}
.guest__tip {
  display: block;
  text-align: center;
  font-size: 19rpx;
  color: $muted;
  padding-bottom: 30rpx;
}
/* 首屏骨架（IK9VF8）：shimmer 与 tasks/income 同款 */
.home-skeleton__hero,
.home-skeleton__stats,
.home-skeleton__task {
  border-radius: 36rpx;
  background: linear-gradient(90deg, #edf2ed, #fff, #edf2ed);
  animation: home-pulse 1.2s infinite;
}
.home-skeleton__hero {
  height: 320rpx;
}
.home-skeleton__stats {
  height: 130rpx;
  margin-top: 22rpx;
}
.home-skeleton__task {
  height: 240rpx;
  margin-top: 20rpx;
}
@keyframes home-pulse {
  50% {
    opacity: 0.55;
  }
}
/* ---------- IKDQP9 订阅消息通知交互层 ---------- */
/* 低水位提示条：橙系警示，整条可点（触控 ≥88rpx），200ms 滑入 */
.notify-low {
  display: flex;
  align-items: center;
  gap: 14rpx;
  min-height: 88rpx;
  margin: 20rpx 0 0;
  padding: 14rpx 24rpx;
  border-radius: 22rpx;
  background: $warning;
  animation: notify-drop 0.2s ease-out;
}
.notify-low__mark {
  flex: 0 0 34rpx;
  width: 34rpx;
  height: 34rpx;
  position: relative;
}
/* 铃铛图形（CSS 绘制）：弧形铃身 + 底部铃锤 */
.notify-low__mark:before {
  content: "";
  position: absolute;
  left: 7rpx;
  right: 7rpx;
  top: 5rpx;
  height: 17rpx;
  border: 4rpx solid $accent;
  border-bottom: none;
  border-radius: 12rpx 12rpx 3rpx 3rpx;
}
.notify-low__mark:after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 3rpx;
  width: 9rpx;
  height: 9rpx;
  margin-left: -4.5rpx;
  border-radius: 50%;
  background: $accent;
}
.notify-low__text {
  flex: 1;
  font-size: 22rpx;
  color: #7a4a12;
  font-weight: 700;
}
.notify-low__act {
  padding: 12rpx 24rpx;
  border-radius: 999rpx;
  background: $accent;
  color: #fff;
  font-size: 22rpx;
  font-weight: 800;
}
.notify-low:active .notify-low__act {
  opacity: 0.85;
}
@keyframes notify-drop {
  from {
    transform: translateY(-14rpx);
    opacity: 0;
  }
}
/* 上岗引导半屏：mask + 底部圆角面板（同 input-dialog 层级口径），240ms 上滑 */
.notify-guide {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.notify-guide__mask {
  position: absolute;
  inset: 0;
  background: rgba(10, 30, 18, 0.55);
  animation: notify-fade 0.2s;
}
.notify-guide__panel {
  position: relative;
  margin-top: auto;
  background: #fff;
  border-radius: 36rpx 36rpx 0 0;
  padding: 48rpx 40rpx calc(36rpx + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  animation: guide-panel-up 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes guide-panel-up {
  from {
    transform: translateY(24%);
    opacity: 0.6;
  }
}
.notify-guide__title {
  font-size: 36rpx;
  font-weight: 900;
  color: $ink;
}
.notify-guide__desc {
  margin-top: 10rpx;
  font-size: 25rpx;
  color: #667069;
}
/* 授权示意卡（0fec881 骨架恢复）：头部 icon+app 名 + 复选框行 */
.wx-demo {
  margin-top: 28rpx;
  border: 2rpx solid rgba(32, 74, 45, 0.1);
  border-radius: 20rpx;
  padding: 22rpx 24rpx;
  background: #fafcf9;
  display: flex;
  flex-direction: column;
}
.wx-demo__head {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.wx-demo__icon {
  width: 44rpx;
  height: 44rpx;
  border-radius: 12rpx;
  background: linear-gradient(150deg, #25b95a, #07883b);
  position: relative;
}
.wx-demo__icon::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 46%;
  width: 14rpx;
  height: 14rpx;
  margin: -10rpx 0 0 -7rpx;
  border: solid #fff;
  border-width: 0 4rpx 4rpx 0;
  transform: rotate(45deg);
}
.wx-demo__app {
  font-size: 24rpx;
  font-weight: 700;
  color: $ink;
}
/* 铃铛图标（emoji-free CSS）：圆铃体 + 高光弧 + 呼吸提醒 */

.notify-guide__title {
  font-size: 38rpx;
  font-weight: 900;
  color: $ink;
}
.notify-guide__desc {
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #667069;
}
/* 微信授权弹窗示意卡：模拟系统「订阅消息」授权卡片（简单图形示意） */
/* 头像图形：lime 圆环缺一口（与首页 logo 同语义） */
.wx-demo__check {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 34rpx;
  padding: 16rpx 26rpx;
  border-radius: 16rpx;
  background: #f2fbf4;
  border: 2rpx solid rgba(7, 136, 59, 0.28);
}
/* 复选框：绿底对勾（示意「已勾选」目标状态） */
.wx-demo__box {
  width: 30rpx;
  height: 30rpx;
  border-radius: 8rpx;
  background: $primary;
  position: relative;
  flex: none;
}
.wx-demo__box::after {
  content: "";
  position: absolute;
  left: 8rpx;
  top: 5rpx;
  width: 12rpx;
  height: 20rpx;
  border: solid #fff;
  border-width: 0 4rpx 4rpx 0;
  transform: rotate(45deg);
}
.wx-demo__check-text {
  font-size: 22rpx;
  color: $ink;
  font-weight: 700;
}
/* 「关键」角标：视线锚点 */
.wx-demo__check-flag {
  margin-left: auto;
  padding: 2rpx 12rpx;
  border-radius: 999rpx;
  background: #e25c05;
  color: #fff;
  font-size: 18rpx;
  font-weight: 800;
}
.notify-guide__step {
  margin-top: 18rpx;
  font-size: 23rpx;
  color: #b96f33;
}
.notify-guide__actions {
  display: flex;
  gap: 18rpx;
  width: 100%;
  margin-top: 34rpx;
}
.notify-guide__btn {
  flex: 1;
  min-height: 96rpx;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: $paper;
  color: $ink;
  font-size: 30rpx;
  font-weight: 700;
}
.notify-guide__btn--primary {
  background: $primary-dark;
  color: $lime;
  font-weight: 900;
}
.notify-guide__btn--primary[disabled] {
  opacity: 0.6;
}
@keyframes notify-fade {
  from {
    opacity: 0;
  }
}
@keyframes notify-up {
  from {
    transform: translateY(30%);
    opacity: 0.4;
  }
}
</style>
