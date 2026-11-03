<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDrag } from '@/gui/drag'
import { colorAt, guiOpen, now, safeArea, useLayer } from '@/gui/state'
import { settings } from '@/settings'
import { useQuestionStore } from '@/stores/question'
import { getDateTime } from '@/utils/common'

/** 页面类型：章节 / 作业 / 考试 */
defineProps<{ page: string }>()

const questionStore = useQuestionStore()
const box = ref<HTMLElement>()
const { zIndex, raise } = useLayer('wm')
// 没拖过时贴安全区左上角，不留边距
const { dragging, position, onPointerDown } = useDrag('wm', box, () => ({ x: safeArea.value.left, y: safeArea.value.top }))

const progress = computed(() => `${questionStore.questionList.length}/${questionStore.total}`)
const rate = computed(() => {
  const answered = questionStore.questionList.length
  if (!answered) return '--'
  const counted = questionStore.questionList.filter((item) => item.counted).length
  return `${Math.round((counted / answered) * 100)}%`
})
const clock = computed(() => {
  // 只借 now 做每帧触发；秒数没变时 computed 值不变，不会带着重渲染
  void now.value
  return getDateTime()
})
const line = computed(() => `linear-gradient(90deg, ${colorAt(0)}, ${colorAt(4)}, ${colorAt(8)})`)
</script>

<template>
  <div
    ref="box"
    class="wm"
    :class="[settings.hud.watermarkStyle, { editable: guiOpen, dragging }]"
    :style="{ ...position, zIndex }"
    @pointerdown.capture="raise"
    @pointerdown="guiOpen && onPointerDown($event)"
  >
    <i class="wm-line" :style="{ background: line }" />
    <b class="wm-brand"><span :style="{ color: colorAt(0) }">CX</span>Helper</b>
    <span class="wm-sep">|</span>
    <span>{{ page }}</span>
    <span class="wm-sep">|</span>
    <span class="wm-num">{{ progress }}</span>
    <span class="wm-sep">|</span>
    <span class="wm-num">正确率 {{ rate }}</span>
    <span class="wm-sep">|</span>
    <span class="wm-num">{{ clock }}</span>
  </div>
</template>
