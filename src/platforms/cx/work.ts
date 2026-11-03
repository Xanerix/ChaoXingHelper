import { CxQuestionHandler } from '@/platforms/cx/handler'
import { useLogStore } from '@/stores/log'

/** 新版作业页：只答题，提交交给用户自己点。自动答题关着时停在第一题前等开启 */
export const useCxWorkLogic = async () => {
  const logStore = useLogStore()
  logStore.addLog('进入新版作业页面', 'primary')
  logStore.addLog('正在解析题目, 请等待5s', 'warning')
  await new CxQuestionHandler('zy').init()
}
