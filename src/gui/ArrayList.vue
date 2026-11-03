<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { isNarrow } from '@/gui/drag'
import { MODULES, moduleName } from '@/gui/modules'
import { clampToSafeArea, colorAt, guiOpen, onFrame, reducedMotion, safeArea, useLayer } from '@/gui/state'
import { settings, ui } from '@/settings'

const ROW_HEIGHT = 20

const box = ref<HTMLElement>()
const dragging = ref(false)
const { zIndex, raise } = useLayer('al')

/** 该显示的行：名字 + 按后缀样式包装过的灰字 */
const visible = computed(() => {
  if (!settings.arraylist.enabled) return []
  const style = settings.arraylist.suffix
  return MODULES.filter((module) => !module.hidden && module.enabled.get()).map((module) => {
    const raw = module.suffix?.() ?? ''
    const suffix = !raw || style === 'hide' ? '' : style === 'bracket' ? `[${raw}]` : style === 'dash' ? `- ${raw}` : raw
    const name = moduleName(module)
    return { id: module.id, name: settings.arraylist.lowercase ? name.toLowerCase() : name, suffix }
  })
})

/**
 * 行的进出、排序滑动都是逐帧插值，交给 Vue 的话每帧要 diff 一遍，
 * 所以行元素自己管：Vue 只负责外层容器。
 */
interface Row {
  el: HTMLElement
  name: HTMLElement
  suffix: HTMLElement
  bar: HTMLElement
  /** 0 = 完全滑出，1 = 完全滑入 */
  slide: number
  target: number
  y: number | null
  /** 行宽缓存，字体晚到、文字变化时由 ResizeObserver 置空重量 */
  width: number | null
  text: string
}
const rows = new Map<string, Row>()
const rowOf = new WeakMap<Element, Row>()
const resize = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const row = rowOf.get(entry.target)
    if (row) row.width = null
  }
})

const sync = () => {
  const container = box.value
  if (!container) return
  const shown = new Set<string>()
  for (const item of visible.value) {
    shown.add(item.id)
    let row = rows.get(item.id)
    if (!row) {
      const el = document.createElement('div')
      el.className = 'al-row'
      const name = document.createElement('span')
      const suffix = document.createElement('span')
      suffix.className = 'al-suf'
      const bar = document.createElement('i')
      bar.className = 'al-bar'
      el.append(name, suffix, bar)
      container.append(el)
      row = { el, name, suffix, bar, slide: reducedMotion ? 1 : 0, target: 1, y: null, width: null, text: '' }
      rows.set(item.id, row)
      rowOf.set(el, row)
      resize.observe(el)
    }
    row.target = 1
    const text = `${item.name}|${item.suffix}`
    if (text !== row.text) {
      row.text = text
      row.name.textContent = item.name
      row.suffix.textContent = item.suffix
      row.suffix.hidden = !item.suffix
      row.width = null
    }
  }
  for (const [id, row] of rows) if (!shown.has(id)) row.target = 0
}

const draw = () => {
  const container = box.value
  if (!container) return
  const anchor = ui.arraylist
  const entries = [...rows.entries()]
  for (const [, row] of entries) if (row.width === null) row.width = row.el.offsetWidth
  entries.sort(([idA, a], [idB, b]) => b.width! - a.width! || idA.localeCompare(idB))
  const maxWidth = entries.reduce((max, [, row]) => (row.target ? Math.max(max, row.width!) : max), 0)
  const count = entries.filter(([, row]) => row.target).length
  const height = count * ROW_HEIGHT
  // 锚点量的是到安全区边的距离；行宽变了、安全区缩了都可能越界，每帧再夹一次
  const area = safeArea.value
  const { x, y } = clampToSafeArea(
    anchor.align === 'left' ? area.left + anchor.dx : area.right - anchor.dx - maxWidth,
    area.top + anchor.y,
    maxWidth,
    height,
  )
  container.style.width = `${maxWidth}px`
  container.style.height = `${height}px`
  container.style.left = `${x}px`
  container.style.top = `${y}px`
  const direction = anchor.align === 'left' ? -1 : 1
  let index = 0
  for (const [id, row] of entries) {
    const y = index * ROW_HEIGHT
    row.y = row.y === null || reducedMotion ? y : row.y + (y - row.y) * 0.22
    row.slide = reducedMotion ? row.target : row.slide + (row.target - row.slide) * 0.16
    if (row.target === 0 && row.slide < 0.02) {
      resize.unobserve(row.el)
      row.el.remove()
      rows.delete(id)
      continue
    }
    const color = colorAt(index)
    row.el.style.transform = `translate(${direction * (1 - row.slide) * (row.width! + 16)}px, ${row.y}px)`
    row.el.style.textShadow = settings.arraylist.glow ? `0 0 8px ${color}` : ''
    row.name.style.color = color
    row.bar.style.background = color
    index += row.target ? 1 : row.slide
  }
}

let stopFrame: (() => void) | undefined
onMounted(() => {
  watch(visible, sync, { immediate: true, deep: true })
  stopFrame = onFrame(draw)
})
onUnmounted(() => {
  stopFrame?.()
  resize.disconnect()
})

/** 拖动：按中线决定贴安全区左边还是右边，离安全区边 10px 内吸附 */
const onPointerDown = (event: PointerEvent) => {
  const container = box.value
  if (!container || event.button !== 0 || !guiOpen.value || isNarrow()) return
  const rect = container.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top
  container.setPointerCapture(event.pointerId)
  dragging.value = true
  const move = (moveEvent: PointerEvent) => {
    const area = safeArea.value
    const width = container.offsetWidth
    const clamped = clampToSafeArea(
      moveEvent.clientX - offsetX,
      moveEvent.clientY - offsetY,
      width,
      Math.max(container.offsetHeight, ROW_HEIGHT),
    )
    let y = clamped.y - area.top
    if (y < 10) y = 0
    const align = clamped.x + width / 2 > (area.left + area.right) / 2 ? 'right' : 'left'
    let dx = align === 'right' ? area.right - clamped.x - width : clamped.x - area.left
    if (dx < 10) dx = 0
    ui.arraylist = { align, dx: Math.round(dx), y: Math.round(y) }
  }
  const up = () => {
    container.removeEventListener('pointermove', move)
    container.removeEventListener('pointerup', up)
    container.removeEventListener('pointercancel', up)
    dragging.value = false
  }
  container.addEventListener('pointermove', move)
  container.addEventListener('pointerup', up)
  container.addEventListener('pointercancel', up)
}
</script>

<template>
  <div
    ref="box"
    class="arraylist"
    :class="[
      `side-${settings.arraylist.side}`,
      { 'align-left': ui.arraylist.align === 'left', editable: guiOpen, dragging },
    ]"
    :style="{ zIndex }"
    @pointerdown.capture="raise"
    @pointerdown="onPointerDown"
  />
</template>
