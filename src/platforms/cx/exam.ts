import { unsafeWindow } from '$'
import { CxQuestionHandler } from '@/platforms/cx/handler'
import { settings } from '@/settings'
import { useLogStore } from '@/stores/log'
import { sleep } from '@/utils/common'
import type { CxTopWindow } from '@/types/page'

/** 点「交卷」后等确认框弹出的上限，秒 */
const CONFIRM_POP_TIMEOUT = 5

/**
 * 考试页：一次只显示一题，答完自动切下一题（平台切题会整页刷新）。
 * 开了自动整卷预览就不在这里答，直接跳预览页。
 * preview=整卷预览：所有题在同一页，点选项时平台逐题暂存，答完按设置交卷。
 */
export const useCxExamLogic = async (preview = false) => {
  const logStore = useLogStore()

  // 自动答题关着时停在第一题前等开启，见 BaseQuestionHandler.waitRunnable
  logStore.addLog(preview ? '进入整卷预览页面' : '进入新版考试页面', 'primary')

  if (!preview && settings.exam.autoPreview) {
    const previewButton = document.querySelector<HTMLElement>('a.completeBtn[onclick^="topreview"]')
    if (previewButton) {
      logStore.addLog('正在进入整卷预览', 'primary')
      previewButton.click()
      return
    }
    logStore.addLog('没找到「整卷预览」按钮，按单题模式答题', 'warning')
  }

  logStore.addLog('正在解析题目, 请等待5s', 'warning')
  const correctRate = await new CxQuestionHandler('ks').init()

  if (preview) {
    await submitExam(correctRate)
    return
  }

  if (!settings.exam.autoNext) {
    logStore.addLog('考试自动下一题已关闭', 'danger')
    return
  }
  logStore.addLog('考试自动下一题已开启，正在前往下一题', 'success')
  await sleep(settings.exam.nextDelay)
  ;(unsafeWindow as CxTopWindow).getTheNextQuestion?.(1)
}

const submitExam = async (correctRate: number) => {
  const logStore = useLogStore()
  const { autoSubmit, submitThreshold } = settings.exam

  if (!autoSubmit) {
    logStore.addLog('整卷答题结束，请核对后手动交卷', 'success')
    return
  }
  if (correctRate < submitThreshold) {
    logStore.addLog(`正确率 ${Math.round(correctRate)}% 未达到 ${submitThreshold}%，不交卷，请核对后手动交卷`, 'danger')
    return
  }

  const submitButton = document.querySelector<HTMLElement>('a.completeBtn[onclick^="finalSubmit"]')
  if (!submitButton) {
    logStore.addLog('没找到「交卷」按钮，请手动交卷', 'danger')
    return
  }
  submitButton.click()

  let pop: HTMLElement | null = null
  for (let waited = 0; waited < CONFIRM_POP_TIMEOUT && !pop; waited += 0.5) {
    await sleep(0.5)
    const element = document.querySelector<HTMLElement>('#submitConfirmPop')
    if (element && element.style.display !== 'none') pop = element
  }
  if (!pop) {
    logStore.addLog('没等到交卷确认框，请检查是否已交卷', 'danger')
    return
  }

  // 正确率只统计搜到的答案，回填没对上选项的题也算在里面；平台自己的「未做完」检查兜底
  const word = pop.querySelector('.popWord')?.textContent ?? ''
  if (word.includes('未做完')) {
    pop.querySelector<HTMLElement>('.btn_92_cancel')?.click()
    logStore.addLog(`平台提示「${word.trim()}」，不交卷，请检查后手动交卷`, 'danger')
    return
  }

  pop.querySelector<HTMLElement>('.confirm')?.click()
  logStore.addLog('已交卷', 'success')
}
