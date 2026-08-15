import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "../api";
import type { StaffRole } from "../types";
export const useSessionStore = defineStore("staff-session", () => {
  const role = ref<StaffRole>(
    (uni.getStorageSync("staffRole") as StaffRole) || "building-manager",
  );
  async function login(v: StaffRole) {
    const r = await api.login(v);
    uni.setStorageSync("staffToken", r.token);
    uni.setStorageSync("staffTokenRole", v);
  }
  async function ensure() {
    if (
      !uni.getStorageSync("staffToken") ||
      uni.getStorageSync("staffTokenRole") !== role.value
    )
      await login(role.value);
  }
  async function setRole(v: StaffRole) {
    role.value = v;
    uni.setStorageSync("staffRole", v);
    await login(v);
  }
  return { role, ensure, setRole };
});
