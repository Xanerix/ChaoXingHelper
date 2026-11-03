<script setup lang="ts">
import { ref } from 'vue'
import { useDrag } from '@/gui/drag'
import { useLayer } from '@/gui/state'
import type { Point } from '@/settings'

/** 答题面板、日志窗口共用的可拖动窗口壳 */
/** width 缺省用 CSS 里的 300px */
const props = defineProps<{ id: string; title: string; fallback: () => Point; width?: number }>()
const emit = defineEmits<{ close: [] }>()

const win = ref<HTMLElement>()
const layerKey = `win-${props.id}`
const { zIndex, raise } = useLayer(layerKey)
const { dragging, position, onPointerDown } = useDrag(layerKey, win, props.fallback)
</script>

<template>
  <section ref="win" class="win" :class="{ dragging }" :style="{ ...position, zIndex, width: width ? `${width}px` : undefined }" @pointerdown.capture="raise">
    <div class="p-head" @pointerdown="onPointerDown">
      <span class="p-title">{{ title }}</span>
      <button type="button" class="p-fold" aria-label="关闭窗口" @click="emit('close')">×</button>
    </div>
    <slot />
  </section>
</template>
