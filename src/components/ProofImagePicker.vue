<script setup lang="ts">
import { defineComponent, h, ref } from 'vue';
import { uploadImage } from '../api/upload';
const props = withDefaults(defineProps<{ modelValue: string[]; max?: number; disabled?: boolean; label?: string }>(), { max: 3, disabled: false, label: '拍照 / 上传' });
const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void; (e: 'busy', value: boolean): void }>();
const busy = ref(false);
async function upload(paths: string[]) {
  if (busy.value || props.disabled) return;
  busy.value = true; emit('busy', true);
  try {
    for (const path of paths.slice(0, Math.max(0, props.max - props.modelValue.length))) {
      const url = await uploadImage(path);
      emit('update:modelValue', [...props.modelValue, url]);
    }
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '图片上传失败，请重试', icon: 'none' }); }
  finally { busy.value = false; emit('busy', false); }
}
function choose() {
  if (busy.value || props.disabled || props.modelValue.length >= props.max) return;
  // #ifndef H5
  uni.chooseImage({ count: props.max - props.modelValue.length, sizeType: ['compressed'], success: result => upload(Array.isArray(result.tempFilePaths) ? result.tempFilePaths : [result.tempFilePaths]) });
  // #endif
}
// #ifdef H5
// A native input receives the actual selection event. Programmatic file-picker
// clicks can be cancelled by desktop browsers before uni.chooseImage resolves.
const NativeImageInput = defineComponent({
  props: { disabled: Boolean },
  setup: p => () => h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', multiple: true, disabled: p.disabled, 'aria-label': props.label, style: 'position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;', onChange: async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, Math.max(0, props.max - props.modelValue.length));
    const paths = files.map(file => URL.createObjectURL(file));
    try { await upload(paths); } finally { paths.forEach(url => URL.revokeObjectURL(url)); input.value = ''; }
  } }),
});
// #endif
</script>
<template>
  <view class="proof-picker" :class="{ 'proof-picker--disabled': disabled || busy }" role="button" @tap="choose">
    <text>{{ busy ? '上传中…' : label }}</text>
    <!-- #ifdef H5 -->
    <NativeImageInput :disabled="disabled || busy || modelValue.length >= max" />
    <!-- #endif -->
  </view>
</template>
<style scoped>
.proof-picker { position: relative; display: flex; align-items: center; justify-content: center; min-height: 44px; min-width: 44px; box-sizing: border-box; padding: 18rpx 24rpx; border: 1px dashed rgba(255,226,160,.35); border-radius: 20rpx; color: #f3dc9d; background: rgba(217,231,174,.055); font-size: 26rpx; line-height: 1.4; text-align: center; }
.proof-picker--disabled { opacity: .55; }
</style>
