import { askAi } from '@/api/ai'
import { searchAnswer, type SearchResult } from '@/api/tiku'
import { answerSnapshot } from '@/settings'
import type { Question } from '@/types'

/** 按开启的答题来源分派到题库海 / 自建 AI；两个都开时 AI 只在题库未命中时兜底 */
export const findAnswer = async (question: Question): Promise<SearchResult> => {
  const { answer, ai: aiSettings } = answerSnapshot()
  if (!answer.tiku && !aiSettings.enabled) return { ok: false, message: '没有开启答题来源' }
  if (!answer.tiku) return askAi(question, aiSettings)

  const tiku = await searchAnswer(question)
  if (tiku.ok || !aiSettings.enabled) return tiku

  const ai = await askAi(question, aiSettings)
  // 两边都失败时题库那条原因也得留着，额度耗尽的充值链接就在里面
  return ai.ok ? ai : { ok: false, message: `${tiku.message}；${ai.message}` }
}
