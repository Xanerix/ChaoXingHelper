import { reducedMotion } from '@/gui/state'

export const EASE_OUT = 'cubic-bezier(.2,.8,.3,1)'
export const EASE_IN = 'cubic-bezier(.5,0,.8,.4)'

/**
 * 给 `<Transition :css="false">` 用的收放动画：高度、内外边距、透明度一起过渡。
 * 中途反向时 Vue 会先调 cancelled 钩子，这里把没跑完的动画取消掉。
 */
const slide = (el: Element, open: boolean, done: () => void) => {
  const box = el as HTMLElement
  box.getAnimations().forEach((animation) => animation.cancel())
  if (reducedMotion) return done()
  const style = getComputedStyle(box)
  const full = {
    height: `${box.offsetHeight}px`,
    opacity: 1,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    marginTop: style.marginTop,
    marginBottom: style.marginBottom,
  }
  const zero = { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' }
  box.style.overflow = 'hidden'
  const animation = box.animate(open ? [zero, full] : [full, zero], {
    duration: open ? 220 : 160,
    easing: open ? EASE_OUT : EASE_IN,
  })
  animation.onfinish = () => {
    box.style.overflow = ''
    done()
  }
  animation.oncancel = () => {
    box.style.overflow = ''
  }
}

const cancel = (el: Element) => el.getAnimations().forEach((animation) => animation.cancel())

export const slideHooks = {
  onEnter: (el: Element, done: () => void) => slide(el, true, done),
  onLeave: (el: Element, done: () => void) => slide(el, false, done),
  onEnterCancelled: cancel,
  onLeaveCancelled: cancel,
}

/** 模块开启时一道亮光从左扫到右，关闭时灰色从右扫回左 */
export const sweep = (row: HTMLElement, on: boolean) => {
  if (reducedMotion) return
  const light = document.createElement('span')
  light.className = 'sweep'
  const color = on ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'rgba(255,255,255,.14)'
  light.style.background = `linear-gradient(90deg, transparent, ${color}, transparent)`
  row.append(light)
  const from = on ? -100 : 100
  light.animate([{ transform: `translateX(${from}%)` }, { transform: `translateX(${-from}%)` }], {
    duration: 380,
    easing: 'ease-out',
  }).onfinish = () => light.remove()
  row.animate([{ transform: 'scale(.97)' }, { transform: 'none' }], { duration: 180, easing: EASE_OUT })
}
