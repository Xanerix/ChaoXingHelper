import { markRaw, reactive } from 'vue'
import type { Question } from '@/types'

/** tikuAi：题库海没收录、由题库海的 AI 兜底生成；miss：没拿到答案或按设置丢弃 */
export type AnswerSource = 'tiku' | 'tikuAi' | 'ai' | 'miss'

export interface AnsweredQuestion {
  question: Question
  source: AnswerSource
  /** 是否计入了正确率 */
  counted: boolean
}

const store = reactive({
  questionList: [] as AnsweredQuestion[],
  /** 当前这份作业/考试解析出的题数 */
  total: 0,
  /** 章节页里一份作业接一份作业地做，答题面板只显示当前这份 */
  begin(total: number) {
    this.questionList = []
    this.total = total
  },
  addQuestion(question: Question, source: AnswerSource, counted: boolean) {
    // question 上挂着真实 DOM 节点，别让 vue 把它做成响应式代理
    this.questionList.push({ question: markRaw(question), source, counted })
  },
})

export const useQuestionStore = () => store
