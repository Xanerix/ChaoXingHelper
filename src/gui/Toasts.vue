<script setup lang="ts">
import { reactive, watch } from 'vue'
import { LOG_COLOR, LOG_ICON, LOG_LABEL } from '@/gui/log-style'
import { reducedMotion } from '@/gui/state'
import { settings } from '@/settings'
import { useLogStore } from '@/stores/log'
import type { LogItem } from '@/types'

const SHOW_MS = 3600
const MAX_TOASTS = 4

const logStore = useLogStore()
let nextId = 0
const toasts = reactive<(LogItem & { id: number; leaving: boolean })[]>([])

const remove = (id: number) => {
  const index = toasts.findIndex((toast) => toast.id === id)
  if (index >= 0) toasts.splice(index, 1)
}

// immediate：挂载时已有的几条（「脚本加载成功，按 … 打开」）也要弹
watch(
  () => logStore.seq,
  (seq, previous = 0) => {
    const { notify, notifyLevel } = settings.hud
    // 按累计序号取新增。logList 到上限后会从头裁剪，长度差值算不出增量；
    // fresh 为 0 时不能写 slice(-0)，那是整个数组
    const fresh = Math.min(seq - previous, logStore.logList.length)
    for (const item of logStore.logList.slice(logStore.logList.length - fresh)) {
      if (!notify) continue
      if (notifyLevel === 'warn' && item.type !== 'warning' && item.type !== 'danger') continue
      const toast = { ...item, id: nextId++, leaving: false }
      toasts.push(toast)
      setTimeout(() => {
        const current = toasts.find((entry) => entry.id === toast.id)
        if (current) current.leaving = true
        setTimeout(() => remove(toast.id), reducedMotion ? 0 : 240)
      }, SHOW_MS)
    }
    if (toasts.length > MAX_TOASTS) toasts.splice(0, toasts.length - MAX_TOASTS)
  },
  { immediate: true },
)
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div v-for="toast in toasts" :key="toast.id" class="toast" :class="{ out: toast.leaving }">
      <i class="t-ic" :style="{ background: LOG_COLOR[toast.type] }">{{ LOG_ICON[toast.type] }}</i>
      <div class="t-body">
        <b>{{ LOG_LABEL[toast.type] }}</b>
        <span v-html="toast.message" />
      </div>
      <i class="t-bar" :style="{ background: LOG_COLOR[toast.type] }" />
    </div>
  </div>
</template>
