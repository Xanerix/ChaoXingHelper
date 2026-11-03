import { computed, reactive, ref, shallowRef } from 'vue'
import { settings, ui } from '@/settings'
import type { Field } from '@/settings/fields'

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

/** ClickGUI 是否打开。不存盘，每次进页面都是关着的 */
export const guiOpen = ref(false)

export const isEnglish = computed(() => settings.gui.lang === 'en')

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/* ---------- 屏幕安全区 ---------- */

/**
 * fixed 定位能用的区域大小。不能用 innerWidth：它把页面滚动条也算进去了，
 * 按它算的右边界会落到滚动条底下，贴右的元素整体往右多出一条滚动条宽。
 */
const viewport = reactive({ width: innerWidth, height: innerHeight })

/**
 * 量一个 `position: fixed; inset: 0` 的探针元素，它的大小就是 fixed 元素的坐标范围：
 * 不含滚动条，怪异模式页面也对，滚动条随内容出现/消失时不触发 resize 也能跟上
 */
export const trackViewport = (probe: HTMLElement) => {
  const observer = new ResizeObserver(() => {
    viewport.width = probe.clientWidth
    viewport.height = probe.clientHeight
  })
  observer.observe(probe)
  return () => observer.disconnect()
}

/** 页面中间占 gui.safeArea% 的矩形，所有界面元素只能待在里面 */
export const safeArea = computed(() => {
  const margin = (1 - settings.gui.safeArea / 100) / 2
  const x = Math.round(viewport.width * margin)
  const y = Math.round(viewport.height * margin)
  return { x, y, left: x, top: y, right: viewport.width - x, bottom: viewport.height - y }
})

/**
 * 把一个 width × height 的盒子左上角限制在安全区里。
 * 盒子比安全区还大时贴左上，不让 max 小于 min 把它推出去
 */
export const clampToSafeArea = (x: number, y: number, width: number, height: number) => {
  const { left, top, right, bottom } = safeArea.value
  return {
    x: clamp(x, left, Math.max(left, right - width)),
    y: clamp(y, top, Math.max(top, bottom - height)),
  }
}

/** 正在按住拖动的滑条对应的字段，屏幕安全区靠它决定要不要画框 */
export const activeField = shallowRef<Field | null>(null)

/* ---------- 每帧 ---------- */

/** requestAnimationFrame 的时间戳。读它的组件每帧重渲染，只在真要动的时候读 */
export const now = ref(0)
const frameCallbacks = new Set<(time: number) => void>()

export const onFrame = (callback: (time: number) => void) => {
  frameCallbacks.add(callback)
  return () => frameCallbacks.delete(callback)
}

let frameStarted = false
export const startFrameLoop = () => {
  if (frameStarted) return
  frameStarted = true
  const loop = (time: number) => {
    now.value = time
    for (const callback of frameCallbacks) callback(time)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

/* ---------- 颜色 ---------- */

const hexRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgb = (channels: number[]) => `rgb(${channels.map((x) => Math.round(clamp(x, 0, 255))).join(' ')})`

/** 功能列表第 index 行此刻的颜色，水印、说明浮层、跟随模式的面板也借它取色 */
export const colorAt = (index: number, time = now.value) => {
  const { color, accent, accent2, speed } = settings.arraylist
  const t = reducedMotion ? 0 : (time / 1000) * speed * 0.3
  const offset = index * 0.16
  switch (color) {
    case 'rainbow':
      return `hsl(${((((t - offset) * 70) % 360) + 360) % 360} 85% 66%)`
    case 'astolfo': {
      const phase = ((((t - offset) * 0.9) % 2) + 2) % 2
      const tri = phase < 1 ? phase : 2 - phase
      return `hsl(${185 + tri * 150} 72% 72%)`
    }
    case 'fade': {
      const k = (Math.sin((t - offset) * 2.4) + 1) / 2
      return rgb(hexRgb(accent).map((x) => x * (0.45 + 0.55 * k)))
    }
    case 'dual': {
      const k = (Math.sin((t - offset) * 2) + 1) / 2
      const to = hexRgb(accent2)
      return rgb(hexRgb(accent).map((x, i) => x + (to[i] - x) * k))
    }
    default:
      return accent
  }
}

/* ---------- 层叠 ---------- */

/** 没点过的元素按这个顺序垫底 */
const DEFAULT_Z_ORDER = [
  'cat-answer',
  'cat-course',
  'cat-work',
  'cat-client',
  'win-QuestionHUD',
  'win-Console',
  'wm',
  'al',
]

const zOrder = computed(() => [...DEFAULT_Z_ORDER.filter((key) => !ui.zOrder.includes(key)), ...ui.zOrder])

/** 面板、窗口、水印、功能列表共用一套层叠顺序，按下鼠标的那个到最上层 */
export const useLayer = (key: string) => ({
  zIndex: computed(() => 100 + zOrder.value.indexOf(key)),
  raise: () => {
    const order = zOrder.value
    if (order[order.length - 1] === key) return
    ui.zOrder = [...order.filter((item) => item !== key), key]
  },
})

/* ---------- 左下角说明 ---------- */

export const tip = reactive({ owner: null as EventTarget | null, title: '', text: '' })

/** 绑到 v-on 上：悬停或键盘聚焦时显示，离开收起 */
export const tipListeners = (title: () => string, text: string) => {
  const show = (event: Event) => {
    // 设置项嵌在模块行里，内层的说明优先
    event.stopPropagation()
    tip.owner = event.currentTarget
    tip.title = title()
    tip.text = text
  }
  const hide = (event: Event) => {
    if (tip.owner === event.currentTarget) tip.owner = null
  }
  return { pointerover: show, pointerleave: hide, focusin: show, focusout: hide }
}

/* ---------- 快捷键 ---------- */

/** 正在等用户按键绑定快捷键时的回调 */
export const keyBinding = ref<((code: string) => void) | null>(null)

/** KeyboardEvent.code -> 显示名：ShiftRight -> RSHIFT，KeyG -> G */
export const keyName = (code: string) => {
  const modifier = code.match(/^(Shift|Control|Alt|Meta)(Left|Right)$/)
  if (modifier) return modifier[2][0] + modifier[1].replace('Control', 'Ctrl').toUpperCase()
  return code.replace(/^Key|^Digit/, '').toUpperCase()
}
