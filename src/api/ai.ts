import { GM_xmlhttpRequest } from '$'
import type { SearchResult } from '@/api/tiku'
import type { Settings } from '@/settings'
import type { Question } from '@/types'

/** 大模型作答比查库慢得多，推理模型尤其 */
const TIMEOUT = 60_000

/** 超星题型编号 -> 给模型看的题型名，和 base-handler 的 QUESTION_TYPE 反向对应 */
const TYPE_NAME: Record<string, string> = {
  '0': '单选题',
  '1': '多选题',
  '2': '填空题',
  '3': '判断题',
  '4': '简答题',
  '5': '名词解释',
  '6': '论述题',
  '7': '计算题',
}

const isChoice = (question: Question) => question.type === '0' || question.type === '1'

/**
 * 选择题让模型回字母再映射回选项正文：回填按正文精确匹配，
 * 让模型原样复述正文（含 <img src>）太容易差一个字符
 */
const requirementOf = (question: Question) => {
  switch (question.type) {
    case '0':
      return '数组里只放一个正确选项的字母，如 ["B"]'
    case '1':
      return '数组里放所有正确选项的字母，如 ["A","C"]'
    case '2':
      return '按空的顺序每个空放一个元素，只写填入的内容'
    case '3':
      return '数组里只放 "正确" 或 "错误"'
    default:
      return '数组里放一个元素，为完整的作答文本'
  }
}

const buildPrompt = (question: Question) => {
  const lines = [`题型：${TYPE_NAME[question.type] ?? '未知题型'}`, `题目：${question.title}`]
  if (question.optionsText.length) {
    lines.push('选项：', ...question.optionsText.map((text, i) => `${String.fromCharCode(65 + i)}. ${text}`))
  }
  lines.push(`作答要求：${requirementOf(question)}`)
  return lines.join('\n')
}

// 题库沿用教材的老口径（比如急救顺序），模型按最新规范纠正反而丢分，所以明说以教材为准
const SYSTEM_PROMPT =
  '你在帮学生完成中国高校的课程作业和考试（超星学习通）。按国内教材和题库常见的标准答案作答；' +
  '教材表述和最新规范、常识有出入时，以教材口径为准。' +
  '只输出一个 JSON 对象 {"answer": [字符串数组]}，不要输出任何解释或多余文字。'

type ContentBlock = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

/** removeHtml() 统一整理出来的图片标签格式 */
const IMG_TAG = /<img src="(.*?)"\/>/g
const IMAGE_TIMEOUT = 15_000

/**
 * 图片先拉下来转成 data URL 再发：超星图床可能校验 Referer/Cookie，
 * 交给模型服务端去下载不一定下得到。拉不到就退回原链接碰碰运气
 */
const toDataUrl = (url: string) =>
  new Promise<string>((resolve) => {
    GM_xmlhttpRequest({
      url,
      method: 'GET',
      responseType: 'blob',
      timeout: IMAGE_TIMEOUT,
      onload: (response) => {
        if (response.status < 200 || response.status >= 300) {
          resolve(url)
          return
        }
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => resolve(url)
        reader.readAsDataURL(response.response as Blob)
      },
      onerror: () => resolve(url),
      ontimeout: () => resolve(url),
    })
  })

/** 识图开着时把题干和选项里的 <img> 换成 [图N]，图片按编号跟在文字后面 */
const buildContent = async (question: Question, vision: boolean): Promise<string | ContentBlock[]> => {
  const text = buildPrompt(question)
  if (!vision) return text

  const urls: string[] = []
  const replaced = text.replace(IMG_TAG, (_, src: string) => {
    // 作业装在 iframe 里，相对路径得按题目所在文档解析
    urls.push(new URL(src, question.element.ownerDocument.baseURI).href)
    return `[图${urls.length}]`
  })
  if (!urls.length) return text

  const images = await Promise.all(urls.map(toDataUrl))
  return [
    { type: 'text', text: replaced },
    ...images.flatMap((url, i): ContentBlock[] => [
      { type: 'text', text: `[图${i + 1}]` },
      { type: 'image_url', image_url: { url } },
    ]),
  ]
}

/** 字母 -> 选项正文，模型要是直接回了正文也认 */
const mapChoice = (question: Question, values: string[]) =>
  values
    .map((value) => {
      // 只认大写：英文选项正文以小写单字母开头（"a dog"）时别被误当成字母
      const letter = /^([A-Z])(?![A-Za-z])/.exec(value.trim())?.[1]
      return letter ? question.optionsText[letter.charCodeAt(0) - 65] : value
    })
    .filter((value): value is string => Boolean(value))

const parseContent = (question: Question, content: string): string[] => {
  // 推理模型可能把思考过程夹在 <think> 里，里面也可能出现花括号
  const json = /\{[\s\S]*\}/.exec(content.replace(/<think>[\s\S]*?<\/think>/g, ''))?.[0]
  if (!json) return []
  const answer = (JSON.parse(json) as { answer?: unknown }).answer
  if (!Array.isArray(answer)) return []
  const values = answer.map((value) => String(value))
  return isChoice(question) ? mapChoice(question, values) : values
}

const MODELS_TIMEOUT = 15_000

export type ModelListResult = { ok: true; models: string[] } | { ok: false; message: string }

/**
 * 接口配置由调用方传：答题流程传快照，面板的拉模型列表 / 测试按钮传输入框里的当前值
 */
type AiSettings = Settings['ai']

/** GET /models，只取 id；不少兼容网关没实现这个接口，失败了用户照样能手填 */
export const fetchModels = ({ baseUrl, apiKey }: AiSettings): Promise<ModelListResult> => {
  if (!baseUrl || !apiKey) {
    return Promise.resolve({ ok: false, message: '先填地址和 Key 才能拉模型列表' })
  }

  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      url: `${baseUrl.replace(/\/+$/, '')}/models`,
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: MODELS_TIMEOUT,
      onload: (response) => {
        try {
          const res = JSON.parse(response.responseText) as {
            data?: { id?: string }[]
            error?: { message?: string }
          }
          if (response.status < 200 || response.status >= 300) {
            resolve({ ok: false, message: `模型列表拉取失败：${res.error?.message || response.status}` })
            return
          }
          const models = (res.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id))
          resolve(models.length ? { ok: true, models: models.sort() } : { ok: false, message: '接口没返回任何模型' })
        } catch {
          resolve({ ok: false, message: `模型列表解析出错（HTTP ${response.status}）` })
        }
      },
      onerror: () => resolve({ ok: false, message: '模型列表请求出错' }),
      ontimeout: () => resolve({ ok: false, message: '模型列表请求超时' }),
    })
  })
}

export const askAi = async (question: Question, { baseUrl, apiKey, model, vision }: AiSettings): Promise<SearchResult> => {
  if (!baseUrl || !apiKey || !model) {
    return { ok: false, message: 'AI 接口的 Base URL、Key、模型没填全' }
  }
  const content = await buildContent(question, vision)

  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      url: `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      // 不传 temperature / response_format：部分推理模型和兼容网关会直接拒掉
      data: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          // 图片只能放 user 消息，放 system 会 400
          { role: 'user', content },
        ],
      }),
      timeout: TIMEOUT,
      onload: (response) => {
        try {
          const res = JSON.parse(response.responseText) as {
            choices?: { message?: { content?: string } }[]
            error?: { message?: string }
          }
          if (response.status < 200 || response.status >= 300) {
            resolve({ ok: false, message: `AI 请求失败：${res.error?.message || response.status}` })
            return
          }
          const answer = parseContent(question, res.choices?.[0]?.message?.content ?? '')
          resolve(
            answer.length
              ? { ok: true, answer, remaining: null, source: 'ai', aiGenerated: true }
              : { ok: false, message: 'AI 没给出可用的答案' },
          )
        } catch {
          resolve({ ok: false, message: `AI 响应解析出错（HTTP ${response.status}）` })
        }
      },
      onerror: () => resolve({ ok: false, message: 'AI 请求出错' }),
      ontimeout: () => resolve({ ok: false, message: 'AI 请求超时' }),
    })
  })
}
