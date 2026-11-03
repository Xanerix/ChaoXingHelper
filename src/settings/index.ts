import { toRaw, watch } from 'vue'
import { isValid } from '@/settings/fields'
import { isRecord, persisted } from '@/settings/persist'
import { schema, type Settings } from '@/settings/schema'

export { schema, type Settings }

/**
 * 没有迁移代码，以后要写迁移时靠它判断存档是哪一版。
 * 2：改成 ClickGUI 模块开关（runMode / answer.mode / general.interval 拆掉，老值回默认）
 */
const SCHEMA_VERSION = 2

/** 存档铺到默认值上逐项清洗：缺的补默认值，坏的丢掉退回默认值，schema 里没有的不带出来 */
const decodeSettings = (raw: unknown): Settings => {
  const stored = isRecord(raw) && isRecord(raw.values) ? raw.values : {}
  const result: Record<string, Record<string, unknown>> = {}
  for (const [groupKey, { fields }] of Object.entries(schema)) {
    const storedGroup = stored[groupKey]
    const values = isRecord(storedGroup) ? storedGroup : {}
    result[groupKey] = {}
    for (const [key, field] of Object.entries(fields)) {
      const value = values[key]
      if (value !== undefined && !isValid(field, value)) {
        console.warn(`[设置] ${groupKey}.${key} 的存档值无效，已用默认值`, value)
      }
      result[groupKey][key] = value !== undefined && isValid(field, value) ? value : field.def
    }
  }
  return result as Settings
}

export const settings = persisted('settings', {
  decode: decodeSettings,
  encode: (values) => ({ schemaVersion: SCHEMA_VERSION, values }),
  sync: true,
})

export type AnswerSnapshot = Pick<Settings, 'answer' | 'ai'>

let snapshot: AnswerSnapshot | null = null

const takeAnswerSnapshot = () => {
  snapshot = structuredClone({ answer: toRaw(settings.answer), ai: toRaw(settings.ai) })
}

/**
 * 答题接口类设置在流程开始时定格，之后「自动答题」每次从关到开再重拍一次。
 * 自动答题开着时 GUI 锁住两个来源开关，免得一份作业前半程查题库、后半程问 AI。
 * 「自动答题」开关本身不看快照，读 settings.answer.enabled 当前值。
 */
export const trackAnswerSnapshot = () => {
  takeAnswerSnapshot()
  // sync：赶在等待开启的答题流程被唤醒之前拍好
  watch(
    () => settings.answer.enabled,
    (enabled) => enabled && takeAnswerSnapshot(),
    { flush: 'sync' },
  )
}

/** 等「自动答题」下一次被打开（当前开着就要先关再开） */
export const nextAnswerEnable = () =>
  new Promise<void>((resolve) => {
    const stop = watch(
      () => settings.answer.enabled,
      (enabled) => {
        if (!enabled) return
        stop()
        resolve()
      },
    )
  })

export const answerSnapshot = () => {
  if (!snapshot) throw new Error('答题设置快照还没拍，流程开始前先调 trackAnswerSnapshot()')
  return snapshot
}

export interface Point {
  x: number
  y: number
}

/** 功能列表贴屏幕安全区的哪条边、离那条边多远（y 从安全区顶边量），窗口缩放、安全区调整后仍贴边 */
export interface EdgeAnchor {
  align: 'left' | 'right'
  dx: number
  y: number
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isPoint = (value: unknown): value is Point => isRecord(value) && isNumber(value.x) && isNumber(value.y)
const stringList = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

/** 面板和 HUD 的位置、层叠顺序、展开/折叠状态：各标签页各管各的，不同步 */
export const ui = persisted('ui', {
  decode: (raw) => {
    const stored = isRecord(raw) ? raw : {}
    const positions: Record<string, Point> = {}
    if (isRecord(stored.positions)) {
      for (const [key, value] of Object.entries(stored.positions)) if (isPoint(value)) positions[key] = value
    }
    const anchor = stored.arraylist
    const arraylist: EdgeAnchor =
      isRecord(anchor) && (anchor.align === 'left' || anchor.align === 'right') && isNumber(anchor.dx) && isNumber(anchor.y)
        ? { align: anchor.align, dx: anchor.dx, y: anchor.y }
        : { align: 'right', dx: 0, y: 0 }
    return {
      positions,
      arraylist,
      /** 越靠后越在上面 */
      zOrder: stringList(stored.zOrder),
      /** 展开了设置的模块 id */
      expanded: stringList(stored.expanded),
      /** 折叠起来的分类 id */
      collapsed: stringList(stored.collapsed),
    }
  },
  sync: false,
})

/** 协议内容改了就加一，所有人都得重新勾选 */
export const AGREEMENT_VERSION = 1

export const consent = persisted('consent', {
  decode: (raw) => ({
    acceptedVersion: isRecord(raw) && typeof raw.acceptedVersion === 'number' ? raw.acceptedVersion : null,
  }),
  sync: true,
})

export const isAgreementAccepted = () => consent.acceptedVersion === AGREEMENT_VERSION
