<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { activeField } from '@/gui/state'
import { schema, settings } from '@/settings'

/** 键盘方向键调完之后框再留这么久 */
const LINGER_MS = 800

const recentlyChanged = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(
  () => settings.gui.safeArea,
  () => {
    recentlyChanged.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (recentlyChanged.value = false), LINGER_MS)
  },
)
onUnmounted(() => clearTimeout(timer))

/** 按住「屏幕安全区」滑条时一直显示，松手或键盘调完后再留一会 */
const visible = computed(() => recentlyChanged.value || activeField.value === schema.gui.fields.safeArea)
</script>

<template>
  <div v-if="visible" class="safe-frame" />
</template>
