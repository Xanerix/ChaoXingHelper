import { BaseQuestionHandler } from '@/platforms/base-handler'
import type { Question } from '@/types'
import type { CxTaskWindow } from '@/types/page'

/** zj=章节作业 zy=新版作业 ks=考试 */
export type CxPageType = 'zj' | 'zy' | 'ks'

export const TRUE_PATTERN = /(^|,)(正确|是|对|√|T|ri|right|true)(,|$)/
export const FALSE_PATTERN = /(^|,)(错误|否|错|×|F|wr|wrong|false)(,|$)/

export class CxQuestionHandler extends BaseQuestionHandler {
  constructor(private readonly type: CxPageType, iframe?: HTMLIFrameElement) {
    super()
    if (iframe?.contentDocument && iframe.contentWindow) {
      this.pageDocument = iframe.contentDocument
      this.pageWindow = iframe.contentWindow
    }
  }

  /** @returns 正确率百分比，没解析到题目时为 0 */
  async init() {
    this.questions = []
    this.parseHtml()

    if (!this.questions.length) {
      this.logStore.addLog('未解析到题目，请进入正确页面', 'danger')
      return 0
    }

    this.logStore.addLog(`成功解析到${this.questions.length}个题目`, 'primary')
    await this.answerQuestions()
    return (this.correctNum / this.questions.length) * 100
  }

  protected parseHtml() {
    const selector = this.type === 'zj' ? '.TiMu' : '.questionLi'
    this.addQuestions(this.pageDocument.querySelectorAll(selector))
  }

  private addQuestions(questionElements: NodeListOf<Element>) {
    for (const questionElement of Array.from(questionElements)) {
      let title = ''
      let typeText = ''
      let options: Record<string, HTMLElement> = {}
      let optionsText: string[] = []

      if (this.type === 'zy' || this.type === 'ks') {
        const titleHtml = questionElement.querySelector('h3')?.innerHTML || ''
        // 题型标签和题干挤在同一个 h3 里，用标签的 outerHTML 把题干切出来
        const typeHtml = questionElement.querySelector('.colorShallow')?.outerHTML || ''
        typeText =
          this.type === 'zy'
            ? questionElement.getAttribute('typename') || ''
            : this.removeHtml(typeHtml).slice(1, 4)
        title = this.removeHtml(titleHtml.split(typeHtml)[1] || '')
        ;[options, optionsText] = this.extractOptions(
          questionElement.querySelectorAll('.answerBg'),
          '.answer_p',
        )
      } else {
        title = this.removeHtml(questionElement.querySelector('.fontLabel')?.innerHTML)
        typeText = this.removeHtml(questionElement.querySelector('.newZy_TItle')?.innerHTML)
        ;[options, optionsText] = this.extractOptions(
          questionElement.querySelectorAll('[class*="before-after"]'),
          '.fl.after',
        )
      }

      this.questions.push({
        element: questionElement,
        type: this.questionTypeOf(typeText),
        title: this.clean(title),
        optionsText,
        options,
        answer: [],
      })
    }
  }

  protected fillQuestion(question: Question) {
    switch (question.type) {
      case '0':
      case '1':
        this.fillChoice(question)
        break
      case '2':
        this.fillBlanks(question)
        break
      case '3':
        this.fillTrueOrFalse(question)
        break
      case '4':
      case '6':
        this.fillEssay(question)
        break
      default:
        break
    }
  }

  /** 按答案把选中状态对齐：该选的没选就点，多选里多选的再点一次取消 */
  private fillChoice(question: Question) {
    const byKey = new Map(Object.entries(question.options).map(([text, element]) => [this.matchKey(text), element]))
    const targets = new Set(
      question.answer
        .map((answer) => byKey.get(this.matchKey(this.removeHtml(answer))))
        .filter((element) => element !== undefined),
    )
    // 一个都没对上就不动，别把页面上已有的选择清掉
    if (!targets.size) {
      this.logStore.addLog(
        `「${question.title.slice(0, 20)}」的答案没对上任何选项，未回填。答案：${question.answer.join(' | ')}；选项：${question.optionsText.join(' | ')}`,
        'warning',
      )
      return
    }
    // 多选的答案没全对上时只补选不取消，免得按一份残缺答案删掉对的选项
    const canUncheck = question.type === '1' && targets.size === question.answer.length

    for (const optionElement of Object.values(question.options)) {
      const wanted = targets.has(optionElement)
      if (this.isChecked(optionElement) === wanted) continue
      // 单选点别的选项会顶掉原来的，不用单独取消
      if (!wanted && !canUncheck) continue
      optionElement.click()
    }
  }

  /** 选项比对用的键：题库和页面的全角 / 半角标点不一致（「，」对「,」），NFKC 统一成半角再去掉空白 */
  private matchKey(text: string) {
    return text.normalize('NFKC').replace(/\s+/g, '')
  }

  private isChecked(optionElement: HTMLElement) {
    // 考试页已选中的选项里会带这两个 class 之一
    if (this.type === 'ks') return !!optionElement.querySelector('.check_answer, .check_answer_dx')
    return optionElement.getAttribute('aria-checked') === 'true'
  }

  private fillBlanks(question: Question) {
    const textareas = question.element.querySelectorAll('textarea')
    if (!textareas.length) return
    textareas.forEach((textarea, index) => {
      const editor = this.getEditor(textarea.name)
      if (!editor) {
        this.logStore.addLog(`「${question.title.slice(0, 20)}」第${index + 1}个空找不到编辑器，这空没填`, 'danger')
        return
      }
      editor.setContent(question.answer[index] ?? '')
    })
  }

  private fillTrueOrFalse(question: Question) {
    let value: 'true' | 'false' = 'true'
    if (TRUE_PATTERN.test(question.answer[0])) value = 'true'
    else if (FALSE_PATTERN.test(question.answer[0])) value = 'false'
    const label = value === 'true' ? '对' : '错'

    for (const optionElement of Object.values(question.options)) {
      if (this.type === 'ks') {
        const target = optionElement.querySelector<HTMLElement>(`span[data='${value}']`)
        if (target?.querySelector('.check_answer')) return
        target?.click()
      } else if (optionElement.getAttribute('aria-label')?.includes(`${label}选择`)) {
        if (optionElement.getAttribute('aria-checked') === 'true') return
        optionElement.click()
      }
    }
  }

  private fillEssay(question: Question) {
    const textarea = question.element.querySelector('textarea')
    if (!textarea) return
    const editor = this.getEditor(textarea.name)
    if (!editor) {
      this.logStore.addLog(`「${question.title.slice(0, 20)}」找不到编辑器，这题没填`, 'danger')
      return
    }
    editor.setContent(question.answer[0] ?? '')
  }

  /**
   * 超星的富文本框是 UEditor，直接改 textarea.value 不生效。
   * name 对不上实例时 UEditor 内部会抛（读 null 的 style）而不是返回 undefined，
   * 所以调用点的 `?.` 拦不住——必须在这儿吃掉，否则异常会一路掀翻 answerQuestions 的主循环。
   */
  private getEditor(name: string) {
    try {
      return (this.pageWindow as unknown as CxTaskWindow).UE?.getEditor(name)
    } catch (error) {
      console.warn(error)
      return undefined
    }
  }
}
