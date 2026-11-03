import { GM_xmlhttpRequest } from '$'
import { answerSnapshot } from '@/settings'
import { getScriptInfo } from '@/utils/script-info'
import type { Question } from '@/types'

/**
 * 题库海 · 开放搜题 API
 * 文档 https://search.tikuhai.com/docs
 *
 * search.tikuhai.com 是自助卡密渠道：只需 X-Consumer-Token（卡密或个人 API Key），
 * 不需要 X-Channel-Key（那是 www.tikuhai.com 的渠道账号模式）。
 */
const EXACT_SEARCH_URL = 'https://search.tikuhai.com/api/open/v1/search/exact'
const TIMEOUT = 10_000

type AnswerKind =
  | 'single'
  | 'multi'
  | 'boolean'
  | 'fill'
  | 'match'
  | 'order'
  | 'text'
  | 'none'
  | 'missing'

interface ApiAnswer {
  kind: AnswerKind
  /** 按 kind 语义：判断题为 [true]/[false]，其余为文本 */
  values: (string | boolean)[]
}

interface ApiItem {
  item_type: string
  stem: string
  answer: ApiAnswer | null
  explanation: string | null
}

interface ApiEnvelope {
  success: boolean
  data: {
    answer_status?: 'complete' | 'missing'
    items?: ApiItem[]
    ai_generated?: boolean
    disclaimer?: string
  } | null
  error: { code: string; message: string; details: { purchase_url?: string } | null } | null
  meta: {
    hit?: boolean
    billing_result?: 'charged' | 'free' | 'dedup' | 'member' | 'unlimited' | 'exhausted'
    credit_remaining?: number
    purchase_url?: string
  } | null
}

export type SearchResult =
  | {
      ok: true
      answer: string[]
      remaining: number | null
      /** tiku=题库海（含其 AI 兜底） ai=用户自建的 OpenAI 兼容接口 */
      source: 'tiku' | 'ai'
      aiGenerated: boolean
    }
  | { ok: false; message: string }

/** 把结构化答案摊平成脚本内部用的字符串数组 */
const toAnswerTexts = (answer: ApiAnswer | null): string[] => {
  if (!answer || !Array.isArray(answer.values)) return []
  if (answer.kind === 'boolean') {
    // 填题时按「正确/错误」正则匹配，这里统一转成中文
    return answer.values.map((value) => (value ? '正确' : '错误'))
  }
  return answer.values.map((value) => String(value))
}

const parse = (res: ApiEnvelope): SearchResult => {
  if (!res.success) {
    return { ok: false, message: res.error?.message || '搜索失败' }
  }

  const meta = res.meta ?? {}
  if (!res.data || meta.hit === false) {
    return { ok: false, message: '题库未收录该题' }
  }
  // answer_status 是区分「这题没答案」与「你没额度」的唯一判据，不要靠 values 空不空推断
  if (res.data.answer_status === 'missing') {
    return { ok: false, message: '题目已收录，答案待补录' }
  }
  if (meta.billing_result === 'exhausted') {
    const url = meta.purchase_url
    return {
      ok: false,
      message: url
        ? `剩余次数已耗尽，<a href="${url}" target="_blank">点此充值</a>`
        : '剩余次数已耗尽，请充值后重试',
    }
  }

  // 普通题只有一个 item；复合题取第一个真正带答案的
  const answer = (res.data.items ?? []).map((item) => toAnswerTexts(item.answer)).find((v) => v.length)
  if (!answer) {
    return { ok: false, message: '未取到答案' }
  }

  // 渠道开了 AI 兜底时，题库没收录的题会由 AI 现场作答，同样 hit=true 同样扣费，
  // 但准确性没有保证，得让用户看得出来
  return {
    ok: true,
    answer,
    remaining: meta.credit_remaining ?? null,
    source: 'tiku',
    aiGenerated: res.data.ai_generated === true,
  }
}

export const searchAnswer = (question: Question): Promise<SearchResult> => {
  const { answer, ai } = answerSnapshot()
  const scriptInfo = getScriptInfo()

  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      // ?s=&v= 是官方支持的埋点，便于平台按脚本/版本统计调用
      url: `${EXACT_SEARCH_URL}?s=${scriptInfo.author}&v=${scriptInfo.version}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Consumer-Token': answer.tikuToken,
      },
      data: JSON.stringify({
        // 归一化在服务端做，题干原样送上去（含完整的 <img src="...">）
        stem: question.title,
        options: question.optionsText,
        type: question.type,
        // 不接受 AI 答案就让服务端别兜底：未命中直接 hit=false 不计费。不带则照旧兜底。
        // 用户自带 AI 兜底时也关掉，免得题库海的 AI 先扣一次费把自建 AI 截胡
        ...(answer.acceptTikuAi && !ai.enabled
          ? {}
          : { ai_fallback: 0 }),
      }),
      timeout: TIMEOUT,
      onload: (response) => {
        try {
          resolve(parse(JSON.parse(response.responseText) as ApiEnvelope))
        } catch {
          resolve({ ok: false, message: '解析出错' })
        }
      },
      onerror: () => resolve({ ok: false, message: '请求出错' }),
      ontimeout: () => resolve({ ok: false, message: '请求超时' }),
    })
  })
}
