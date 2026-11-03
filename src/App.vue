<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import AgreementDialog from '@/gui/AgreementDialog.vue'
import ArrayList from '@/gui/ArrayList.vue'
import ClickGui from '@/gui/ClickGui.vue'
import ConsoleWindow from '@/gui/ConsoleWindow.vue'
import QuestionHud from '@/gui/QuestionHud.vue'
import SafeAreaFrame from '@/gui/SafeAreaFrame.vue'
import { guiOpen, keyBinding, keyName, safeArea, startFrameLoop, trackViewport } from '@/gui/state'
import TipBox from '@/gui/TipBox.vue'
import Toasts from '@/gui/Toasts.vue'
import Watermark from '@/gui/Watermark.vue'
import { platformTask, runPlatformLogic } from '@/platforms'
import { isAgreementAccepted, settings } from '@/settings'
import { useLogStore } from '@/stores/log'

/** 脚本在每个 frame 里都有一份实例，只有页面上有事可做的那份显示界面 */
const task = platformTask(window.location.href)
const accepted = computed(isAgreementAccepted)
const logStore = useLogStore()

const start = () => {
  // 超星有的页面挂着「体验新版」的入口，先替用户点掉
  document.querySelector<HTMLElement>('li>a.experience:not([onclick])')?.click()
  logStore.addLog(`脚本加载成功，按 ${keyName(settings.gui.key)} 打开设置`, 'primary')
  runPlatformLogic(window.location.href)
}

if (task) {
  if (accepted.value) start()
  // 勾选是运行时发生的，不能只在挂载那一次判断，否则得刷新页面才启动
  else watch(accepted, start, { once: true })
}

/** 快捷键消息：没界面的 frame（视频、作业 iframe）里按下时转给顶层 */
const TOGGLE_MESSAGE = 'cxhelper:toggle-gui'

const isTyping = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))

const onKeydown = (event: KeyboardEvent) => {
  if (keyBinding.value) {
    event.preventDefault()
    const bind = keyBinding.value
    keyBinding.value = null
    bind(event.code)
    return
  }
  if (event.code !== settings.gui.key || event.repeat || isTyping(event.target)) return
  event.preventDefault()
  // 只转给顶层：实际有任务的页面（章节、作业、考试）都是顶层文档
  if (task) guiOpen.value = !guiOpen.value
  else if (window.top !== window) window.top?.postMessage(TOGGLE_MESSAGE, '*')
}

const onMessage = (event: MessageEvent) => {
  if (task && event.data === TOGGLE_MESSAGE) guiOpen.value = !guiOpen.value
}

// 不用捕获阶段：界面在 closed shadow root 里，document 上看到的 target 只是宿主节点，
// 分不出是不是在脚本自己的输入框里打字，只能靠输入框 @keydown.stop 在冒泡时拦住
const viewportProbe = ref<HTMLElement>()
let stopViewport: (() => void) | undefined

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('message', onMessage)
  if (task) startFrameLoop()
  if (viewportProbe.value) stopViewport = trackViewport(viewportProbe.value)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('message', onMessage)
  stopViewport?.()
})

const cssVars = computed(() => ({
  '--accent': settings.arraylist.accent,
  '--r': `${settings.gui.radius}px`,
  '--panel-w': `${settings.gui.panelWidth}px`,
  '--row-h': `${settings.gui.rowHeight}px`,
  '--fs': `${settings.gui.fontSize}px`,
  '--panel-a': settings.gui.opacity / 100,
  '--al-a': settings.arraylist.opacity / 100,
  // 安全区四周留出的边距，说明浮层、通知、安全区框按它定位
  '--safe-x': `${safeArea.value.x}px`,
  '--safe-y': `${safeArea.value.y}px`,
}))
</script>

<template>
  <!-- 脚本界面上的右键全部接管，没有设置项的模块右键什么都不做 -->
  <div
    v-if="task"
    class="hud"
    :style="cssVars"
    :data-panel="settings.gui.style"
    :data-hl="settings.gui.highlight"
    :data-glass="settings.gui.glass"
    @contextmenu.prevent
  >
    <div ref="viewportProbe" class="viewport-probe" />
    <AgreementDialog v-if="!accepted" />
    <template v-else>
      <ClickGui />
      <Watermark v-if="settings.hud.watermark" :page="task" />
      <ArrayList />
      <QuestionHud v-if="settings.hud.questionHud" />
      <ConsoleWindow v-if="settings.hud.console" />
      <Toasts />
      <TipBox />
      <SafeAreaFrame />
    </template>
  </div>
</template>
