import { watchEffect } from 'vue'
import { settings } from '@/settings'

/**
 * 用样式盖掉而不是删节点，页面晚插入、重建也照样生效；开关关掉时撤掉样式。
 * 挂在 documentElement 上，document-start 时 head 还不存在。
 */
const hideWhen = (selector: string, enabled: () => boolean) => {
  const style = document.createElement('style')
  style.textContent = `${selector}{display:none!important}`
  watchEffect(() => {
    if (enabled()) document.documentElement.append(style)
    else style.remove()
  })
}

export const hidePageClutter = () => {
  // cx-robot SDK 挂在 body 末尾的 fixed 浮层，id 随机，class 固定
  hideWhen('.cx-robot-wrapper', () => settings.course.hideAiRobot)
  // 水印节点 id 是 mask_div 加后缀
  hideWhen('[id^="mask_div"]', () => settings.course.hideWatermark)
}
