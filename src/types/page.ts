/** 平台页面自己挂在 window 上的东西，脚本要直接调用它们 */

export interface CxTopWindow extends Window {
  /** 电子书翻页 */
  onchangepage?: (page: unknown) => void
  /** 考试页切到下一题 */
  getTheNextQuestion?: (step: number) => void
}

export interface CxTaskWindow extends Window {
  /** 作业页：暂存 */
  noSubmit: () => Promise<void> | void
  /** 作业页：提交 */
  btnBlueSubmit: () => Promise<void> | void
  /** 作业页：提交前的二次确认 */
  submitCheckTimes: () => Promise<void> | void
  /** 电子书：取某个方向的页码 */
  getFrameAttr: (attr: string) => unknown
  /** 富文本框是 UEditor，直接改 textarea.value 不生效 */
  UE?: {
    getEditor: (name: string) => { setContent: (html: string) => void } | undefined
  }
}
