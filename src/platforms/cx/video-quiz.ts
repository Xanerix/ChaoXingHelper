import { BaseQuestionHandler } from '@/platforms/base-handler'
import { FALSE_PATTERN, TRUE_PATTERN } from '@/platforms/cx/handler'
import { settings } from '@/settings'
import { useLogStore } from '@/stores/log'
import { sleep } from '@/utils/common'
import type { Question } from '@/types'

/**
 * 选项正文前面平台自加的标号。renderTpl 里写死是 `{name}、{description}`，
 * name 实测是 A/B/C…，但没有保证，所以数字也认。
 * 必须剥干净：判断题的 TRUE_PATTERN / FALSE_PATTERN 锚在 `(^|,)`，
 * 标号留着（`A、对`）连判断题都匹配不上。
 */
const OPTION_LABEL = /^[A-Za-z0-9]\s*[、.．]\s*/

/**
 * 这两种父页面下超星的 checkResult 第一行就 fireEvent('continue') 返回，压根不发提交请求。
 * 另一种白答的情况是 isPortal——afterRender 里把整条按钮栏 remove 掉，3 秒后自动放行。
 * 两种都只会白烧题库额度，所以答题前先问一句。
 */
const SKIP_SUBMIT_PAGE = /nodedetailcontroller\/visitnodedetail|\/micro-node-detail/

/**
 * 视频播到指定时间点会暂停并盖一层互动答题（`.ans-videoquiz`），
 * DOM 和作业/考试页完全不是一套，所以单开一个子类而不是往 CxQuestionHandler 里塞第四种分支。
 */
class CxVideoQuizHandler extends BaseQuestionHandler {
  constructor(private readonly quizElement: HTMLElement) {
    super()
  }

  async init() {
    this.questions = []
    this.parseHtml()

    if (!this.questions.length) {
      this.logStore.addLog('弹题没解析到题目，跳过', 'danger')
      return
    }

    this.logStore.addLog(`弹题解析到${this.questions.length}个题目`, 'primary')
    await this.answerQuestions()
  }

  protected parseHtml() {
    // 题型标在整块弹题上，不在单题上
    const typeText = this.removeHtml(this.quizElement.querySelector('.tkTopic_title')?.innerHTML)

    // renderTpl 里 .tkItem 没有 <tpl for> 包着，一次弹题就是一道题，这个循环恒跑一轮

    for (const item of Array.from(this.quizElement.querySelectorAll('.tkItem'))) {
      const title = this.removeHtml(item.querySelector('.tkItem_title')?.innerHTML)
      const [options, optionsText] = this.extractQuizOptions(item)
      this.questions.push({
        element: item,
        type: this.questionTypeOf(typeText),
        title: this.clean(title),
        optionsText,
        options,
        answer: [],
      })
    }
  }

  /** 选项正文和 radio 挤在同一个 label 里，没有独立的正文节点，只能整段清完再剥标号 */
  private extractQuizOptions(item: Element): [Record<string, HTMLElement>, string[]] {
    const options: Record<string, HTMLElement> = {}
    const optionsText: string[] = []
    for (const optionElement of Array.from(item.querySelectorAll<HTMLElement>('.ans-videoquiz-opt'))) {
      const text = this.removeHtml(optionElement.querySelector('label')?.innerHTML).replace(OPTION_LABEL, '')
      options[text] = optionElement
      optionsText.push(text)
    }
    return [options, optionsText]
  }

  protected fillQuestion(question: Question) {
    if (question.type === '3') {
      this.checkTrueOrFalse(question)
      return
    }
    for (const answer of question.answer) {
      const text = this.removeHtml(answer)
      const optionElement = question.options[text]
      // 选项键是剥掉标号后的正文，对不上多半是标号没剥干净——别静默放过，否则日志会显示成功
      if (!optionElement) {
        this.logStore.addLog(`弹题选项「${text}」在页面上没找到，这题没填`, 'danger')
        continue
      }
      this.check(optionElement)
    }
  }

  private checkTrueOrFalse(question: Question) {
    const pattern = FALSE_PATTERN.test(question.answer[0]) ? FALSE_PATTERN : TRUE_PATTERN
    for (const [text, optionElement] of Object.entries(question.options)) {
      if (!pattern.test(text)) continue
      this.check(optionElement)
      return
    }
    this.logStore.addLog(`弹题判断题匹配不到「${question.answer[0]}」对应的选项，这题没填`, 'danger')
  }

  private check(optionElement: HTMLElement) {
    const input = optionElement.querySelector<HTMLInputElement>('input')
    // 多选是 checkbox，重复点等于取消
    if (!input || input.checked) return
    input.click()
  }
}

/**
 * 找当前正显示着的弹题，没弹或者已经收起来就返回 null。
 * 光看高度不够：容器是常驻 DOM 的，空壳也可能占着位置，
 * 必须连选项一起认——误判的代价是去点「继续学习」，那会把正常播着的视频搞停。
 */
export const findVideoQuiz = (mediaDocument: Document) =>
  Array.from(mediaDocument.querySelectorAll<HTMLElement>('.ans-videoquiz')).find(
    (element) => element.getBoundingClientRect().height > 0 && element.querySelector('.ans-videoquiz-opt'),
  ) ?? null

/** 提交按钮被 isPortal 删掉、或者这个父页面点了也不提交，答题就是纯浪费额度 */
const canSubmit = (quizElement: HTMLElement) => {
  if (!quizElement.querySelector('#videoquiz-submit')) return false
  try {
    return !SKIP_SUBMIT_PAGE.test(quizElement.ownerDocument.defaultView?.parent?.location.href ?? '')
  } catch {
    // 跨域读不到父页 URL 就当能提交，别为了一个读不到的 URL 放弃答题
    return true
  }
}

export const answerVideoQuiz = async (quizElement: HTMLElement) => {
  const logStore = useLogStore()

  if (!settings.answer.enabled) {
    logStore.addLog('视频里弹出互动答题，自动答题已关闭，直接继续', 'primary')
    quizElement.querySelector<HTMLElement>('#videoquiz-continue')?.click()
    return
  }

  if (!canSubmit(quizElement)) {
    logStore.addLog('这个页面的弹题提交不生效，跳过答题直接继续', 'warning')
    quizElement.querySelector<HTMLElement>('#videoquiz-continue')?.click()
    return
  }

  logStore.addLog('视频里弹出互动答题，正在处理', 'warning')
  await new CxVideoQuizHandler(quizElement).init()

  quizElement.querySelector<HTMLElement>('#videoquiz-submit')?.click()
  await sleep(settings.course.resumeDelay)
  // 答对答错都得点这个，不然视频一直停在弹题上。
  // 答错且 errorMustBack=1 时超星会把它 display:none，但对隐藏元素 click() 照样触发 Ext 的
  // handler，顺带绕过了强制回看——这是有意的，别"修"成先判可见性。
  quizElement.querySelector<HTMLElement>('#videoquiz-continue')?.click()

  logStore.addLog('互动答题已处理，继续播放', 'success')
}
