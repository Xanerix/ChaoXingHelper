import { computed, ref, type Ref } from 'vue'
import { clampToSafeArea } from '@/gui/state'
import { type Point, ui } from '@/settings'

/** 窄屏下面板改成纵向排列，不再能拖 */
export const isNarrow = () => matchMedia('(max-width: 760px)').matches

/** 面板、窗口的标题栏高度。纵向只要求标题栏留在安全区里，展开后很长的面板底下可以超出去 */
const HEADER_HEIGHT = 26

/**
 * 按住 handle 拖动 target，位置存进 ui.positions[key]，限制在屏幕安全区里。
 * 用 pointer capture，鼠标飘进页面 iframe 也不会丢事件。
 */
export const useDrag = (key: string, target: Ref<HTMLElement | null | undefined>, fallback: () => Point) => {
  const dragging = ref(false)

  // 存下来的位置可能是在更大的屏幕上、或者更大的安全区里拖的，渲染时再拉回来
  const position = computed(() => {
    const { x, y } = ui.positions[key] ?? fallback()
    const box = target.value
    const clamped = clampToSafeArea(
      x,
      y,
      box?.offsetWidth ?? 0,
      Math.min(box?.offsetHeight ?? HEADER_HEIGHT, HEADER_HEIGHT),
    )
    return { left: `${clamped.x}px`, top: `${clamped.y}px` }
  })

  const onPointerDown = (event: PointerEvent) => {
    const box = target.value
    if (!box || event.button !== 0 || (event.target as Element).closest('button') || isNarrow()) return
    const handle = event.currentTarget as HTMLElement
    const rect = box.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    handle.setPointerCapture(event.pointerId)
    dragging.value = true

    const move = (moveEvent: PointerEvent) => {
      const { x, y } = clampToSafeArea(
        moveEvent.clientX - offsetX,
        moveEvent.clientY - offsetY,
        rect.width,
        Math.min(rect.height, HEADER_HEIGHT),
      )
      ui.positions[key] = { x: Math.round(x), y: Math.round(y) }
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      dragging.value = false
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  return { dragging, position, onPointerDown }
}
