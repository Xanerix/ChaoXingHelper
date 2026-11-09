import { unsafeWindow } from '$'
import { CxQuestionHandler } from '@/platforms/cx/handler'
import { settings } from '@/settings'
import { useLogStore } from '@/stores/log'
import { sleep } from '@/utils/common'

/** 点「提交」后等确认框弹出的上限，秒 */
const CONFIRM_POP_TIMEOUT = 5
/** 可点的元素：超星的按钮多是 <a>，也有带 onclick 的 div/span */
const CLICKABLE = 'a, button, input[type="button"], input[type="submit"], [onclick]'

/** 新版作业页：答完按「提交」分组的开关和阈值决定提交还是暂存。自动答题关着时停在第一题前等开启 */
export const useCxWorkLogic = async () => {
  const logStore = useLogStore()
  logStore.addLog('进入新版作业页面', 'primary')
  logStore.addLog('正在解析题目, 请等待5s', 'warning')
  const correctRate = await new CxQuestionHandler('zy').init()
  await submitWork(correctRate)
}

/** 页面上第一个看得见、文字正好是 texts 之一的可点元素。脚本界面在 closed shadow root 里，查不到 */
const findButton = (texts: string[], exclude?: Element) =>
  Array.from(document.querySelectorAll<HTMLElement>(CLICKABLE)).find((element) => {
    if (element === exclude || !element.getClientRects().length) return false
    const text = element instanceof HTMLInputElement ? element.value : element.textContent
    return texts.includes((text ?? '').replace(/\s+/g, ''))
  })

/** 不提交时点暂存，免得关页面丢了答案 */
const saveWork = () => {
  const logStore = useLogStore()
  const saveButton = findButton(['暂时保存', '暂存', '保存'])
  if (!saveButton) {
    logStore.addLog('没找到「暂时保存」按钮，请手动保存', 'danger')
    return
  }
  saveButton.click()
  logStore.addLog('已暂存，请核对后手动提交', 'primary')
}

const submitWork = async (correctRate: number) => {
  const logStore = useLogStore()
  const { autoSubmitWork, threshold } = settings.submit

  if (!autoSubmitWork) {
    logStore.addLog('未开启自动提交，暂存', 'primary')
    saveWork()
    return
  }
  if (correctRate < threshold) {
    logStore.addLog(`正确率 ${Math.round(correctRate)}% 未达到 ${threshold}%，暂存`, 'danger')
    saveWork()
    return
  }

  const submitButton = findButton(['提交'])
  if (!submitButton) {
    logStore.addLog('没找到「提交」按钮，请手动提交', 'danger')
    return
  }

  // 确认框可能是页面自己画的，也可能是原生 confirm；原生的会卡住整页，临时替成直接确认
  const nativeConfirm = unsafeWindow.confirm
  let nativeConfirmed = false
  unsafeWindow.confirm = () => (nativeConfirmed = true)
  try {
    logStore.addLog(`正确率 ${Math.round(correctRate)}% 达到 ${threshold}%，提交`, 'success')
    submitButton.click()

    let confirmButton: HTMLElement | undefined
    for (let waited = 0; waited < CONFIRM_POP_TIMEOUT && !confirmButton && !nativeConfirmed; waited += 0.5) {
      await sleep(0.5)
      confirmButton = findButton(['确定', '确认', '确认提交', '提交'], submitButton)
    }

    if (nativeConfirmed) {
      logStore.addLog('已提交', 'success')
    } else if (confirmButton) {
      confirmButton.click()
      logStore.addLog('已提交', 'success')
    } else {
      logStore.addLog('没等到提交确认框，请检查是否已提交', 'danger')
    }
  } finally {
    unsafeWindow.confirm = nativeConfirm
  }
}
