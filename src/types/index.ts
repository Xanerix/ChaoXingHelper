export type LogType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

export interface LogItem {
  message: string
  time: string
  type: LogType
}

/** 从页面解析出来的一道题 */
export interface Question {
  element: Element
  /** 超星 questionType 映射后的数字串 */
  type: string
  title: string
  /** 选项正文，不带 A./B、 标号 */
  optionsText: string[]
  /** 选项正文 -> 可点击的选项元素 */
  options: Record<string, HTMLElement>
  answer: string[]
}
