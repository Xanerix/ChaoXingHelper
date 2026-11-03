<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import HudWindow from '@/gui/HudWindow.vue'
import { isEnglish } from '@/gui/state'
import { LOG_COLOR, LOG_LABEL } from '@/gui/log-style'
import { settings } from '@/settings'
import { useLogStore } from '@/stores/log'

const logStore = useLogStore()
const body = ref<HTMLElement>()
const fallback = () => ({ x: 16, y: Math.max(300, innerHeight - 380) })

// 有新日志就滚到底。盯 seq 不盯长度：到上限后一边裁一边加，长度不再变
watch(
  () => logStore.seq,
  async () => {
    await nextTick()
    if (body.value) body.value.scrollTop = body.value.scrollHeight
  },
  { immediate: true },
)
</script>

<template>
  <HudWindow
    id="Console"
    :title="isEnglish ? 'Console' : '日志窗口'"
    :fallback="fallback"
    :width="settings.hud.consoleWidth"
    @close="settings.hud.console = false"
  >
    <div ref="body" class="win-body">
      <div v-for="(item, index) in logStore.logList" :key="index" class="log-line">
        <time>{{ item.time }}</time>
        <b :style="{ color: LOG_COLOR[item.type] }">[{{ LOG_LABEL[item.type] }}]</b>
        <!-- 日志里可能带题库返回的充值链接，所以按 HTML 渲染 -->
        <span v-html="item.message" />
      </div>
    </div>
  </HudWindow>
</template>
