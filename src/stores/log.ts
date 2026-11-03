import { reactive } from 'vue'
import { getDateTime } from '@/utils/common'
import { sendLog } from '@/utils/log-sink'
import type { LogItem, LogType } from '@/types'

/** 面板全量渲染 DOM，一轮章节能刷出几百条，留个上限把最早的丢掉 */
const MAX_LOGS = 500

const store = reactive({
  logList: [] as LogItem[],
  /**
   * 累计写入条数，只增不减。裁剪之后 logList.length 不再单调，
   * 想取「新增了哪几条」只能靠它，别拿长度差值算。
   */
  seq: 0,
  addLog(message: string, type: LogType = 'primary') {
    const item: LogItem = { message, time: getDateTime(), type }
    this.logList.push(item)
    if (this.logList.length > MAX_LOGS) this.logList.splice(0, this.logList.length - MAX_LOGS)
    this.seq += 1
    sendLog(item)
  },
})

export const useLogStore = () => store
