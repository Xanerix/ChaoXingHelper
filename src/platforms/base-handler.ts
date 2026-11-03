import { unsafeWindow } from '$'
import { findAnswer } from '@/api/answer'
import { answerSnapshot, nextAnswerEnable, settings, type Settings } from '@/settings'
import { useLogStore } from '@/stores/log'
import { type AnswerSource, useQuestionStore } from '@/stores/question'
import { getDateTime, sleep } from '@/utils/common'
import { sendLog } from '@/utils/log-sink'
import type { Question } from '@/types'

/** 中文题型 -> 超星内部题型编号 */
const QUESTION_TYPE: Record<string, string> = {
  单选题: '0',
  A1型题: '0',
  多选题: '1',
  X型题: '1',
  填空题: '2',
  判断题: '3',
  简答题: '4',
  名词解释: '5',
  论述题: '6',
  计算题: '7',
}

/** 超星题型编号 -> 「答题」分组里管这种题型答不答的开关，编号不认识时按 typeOther */
const TYPE_SWITCH: Record<string, Extract<keyof Settings['answer'], `type${string}`>> = {
  '0': 'typeSingle',
  '1': 'typeMulti',
  '2': 'typeBlank',
  '3': 'typeJudge',
  '4': 'typeShort',
  '5': 'typeNoun',
  '6': 'typeEssay',
  '7': 'typeCalc',
}

export abstract class BaseQuestionHandler {
  protected pageDocument: Document = document
  protected pageWindow: Window = unsafeWindow
  protected questions: Question[] = []
  protected correctNum = 0

  protected readonly logStore = useLogStore()
  protected readonly questionStore = useQuestionStore()

  /** 从页面解析出题目，填进 this.questions */
  protected abstract parseHtml(): void

  /** 把答案回填到页面上 */
  protected abstract fillQuestion(question: Question): void

  protected questionTypeOf(typeText: string) {
    return QUESTION_TYPE[typeText.replace('【', '').replace('】', '')] ?? '999'
  }

  /**
   * 清掉除 img/sub/sup/br 之外的标签并压缩空白。
   * img 保留完整 src（题库按完整 src 参与匹配，剥掉参数必然未命中）。
   */
  protected removeHtml(html: string | null | undefined) {
    if (html == null) return ''
    return html
      .replace(/<((?!img|sub|sup|br)[^>]+)>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<img.*?src="(.*?)".*?>/g, '<img src="$1"/>')
      .trim()
  }

  /** 去掉题干上平台自加的【题型】前缀和（x.x分）后缀 */
  protected clean(text: string) {
    return text.replace(/^【.*?】\s*/, '').replace(/\s*（\d+\.\d+分）$/, '')
  }

  /** 选项正文 -> 选项元素，同时收一份纯文本数组送给题库 */
  protected extractOptions(
    optionElements: ArrayLike<Element>,
    optionSelector: string,
  ): [Record<string, HTMLElement>, string[]] {
    const optionsObject: Record<string, HTMLElement> = {}
    const optionTexts: string[] = []
    for (const optionElement of Array.from(optionElements)) {
      const text = this.removeHtml(optionElement.querySelector(optionSelector)?.innerHTML)
      optionsObject[text] = optionElement as HTMLElement
      optionTexts.push(text)
    }
    return [optionsObject, optionTexts]
  }

  /** 逐题搜答案并回填 */
  /** 自动答题关着、或者没开答题来源时停在这一题前面，打开后从这一题接着答，已答的不重复查（查题扣费） */
  private async waitRunnable(index: number) {
    const hasSource = () => answerSnapshot().answer.tiku || answerSnapshot().ai.enabled
    let paused = false
    while (!settings.answer.enabled || !hasSource()) {
      paused = true
      this.logStore.addLog(
        settings.answer.enabled
          ? '没有开启答题来源，先关掉「自动答题」，打开「题库海」或「自建AI」后再开启'
          : `自动答题已关闭，打开后从第${index + 1}道题开始答`,
        'warning',
      )
      await nextAnswerEnable()
    }
    if (paused) this.logStore.addLog(`自动答题已开启，从第${index + 1}道题继续`, 'success')
  }

  protected async answerQuestions(afterEach?: (question: Question, index: number) => Promise<void> | void) {
    this.questionStore.begin(this.questions.length)

    for (const [index, question] of this.questions.entries()) {
      // 关掉的题型在等待和搜题之前就跳掉，不占间隔也不扣费；跳过的题不计入正确率
      if (!answerSnapshot().answer[TYPE_SWITCH[question.type] ?? 'typeOther']) {
        this.logStore.addLog(`第${index + 1}道题的题型已在设置里关掉，跳过`, 'warning')
        question.answer = ['按设置跳过']
        this.questionStore.addQuestion(question, 'miss', false)
        continue
      }
      await sleep(answerSnapshot().answer.interval)
      await this.waitRunnable(index)
      // 暂停期间可能重拍过快照，每题重新取
      const { acceptTikuAi, countTikuAi } = answerSnapshot().answer
      const { countAnswer: countCustomAi } = answerSnapshot().ai
      const result = await findAnswer(question)
      let source: AnswerSource = 'miss'
      let counted = false

      if (result.ok) {
        // 「接受AI生成答案」管的是题库海的 AI 兜底，用户自己配的 AI 不受它约束
        if (result.source === 'tiku' && result.aiGenerated && !acceptTikuAi) {
          // 关了开关时请求已带 ai_fallback=0，正常走不到这里；留着防服务端没认参数
          this.logStore.addLog(`第${index + 1}道题是 AI 生成的答案，已按设置丢弃`, 'warning')
          question.answer = ['AI 生成，已按设置丢弃']
        } else {
          source = result.source === 'ai' ? 'ai' : result.aiGenerated ? 'tikuAi' : 'tiku'
          question.answer = result.answer
          // 回填里任何一处抛出都不许掀翻这个循环：后面的题都已经查过、费也扣了。
          // 更要紧的是没填上的题绝不能计入正确率，否则会把自动提交的门槛顶过去
          let filled = true
          try {
            this.fillQuestion(question)
          } catch (error) {
            filled = false
            this.logStore.addLog(`第${index + 1}道题回填出错，这题没填且不计入正确率`, 'danger')
            console.error(error)
          }
          // 两个来源各有各的开关：题库海兜底看 answer.countTikuAi，自建 AI 看 ai.countAnswer
          const countAi = source === 'ai' ? countCustomAi : countTikuAi
          const countNote = countAi ? '已计入正确率' : '不计入正确率'
          if (result.source === 'ai') {
            this.logStore.addLog(`第${index + 1}道题答案由自建 AI 生成，${countNote}，请自行核对`, 'warning')
          } else if (result.aiGenerated) {
            this.logStore.addLog(`第${index + 1}道题题库没收录，答案由 AI 生成，${countNote}，请自行核对`, 'warning')
          } else {
            this.logStore.addLog(`第${index + 1}道题搜索成功`, 'success')
          }
          // AI 的答案默认不算数，别让它把正确率抬高到自动提交的门槛；用户明确勾选才计入
          if (filled && (source === 'tiku' || countAi)) {
            this.correctNum += 1
            counted = true
          }
        }
        if (result.remaining !== null) {
          this.logStore.addLog(`剩余次数:${result.remaining}`, 'primary')
        }
      } else {
        this.logStore.addLog(`第${index + 1}道题搜索失败，原因见答题面板`, 'danger')
        question.answer = [result.message]
      }

      this.questionStore.addQuestion(question, source, counted)
      // 面板放不下整题，详情只落盘；调用处也守卫，正式构建里连参数一起删掉
      if (import.meta.env.DEV) {
        sendLog(
          { message: `第${index + 1}道题详情`, time: getDateTime(), type: 'primary' },
          {
            detail: {
              index: index + 1,
              type: question.type,
              title: question.title,
              options: question.optionsText,
              answer: question.answer,
              source,
              counted,
            },
          },
        )
      }
      await afterEach?.(question, index)
    }
  }
}
