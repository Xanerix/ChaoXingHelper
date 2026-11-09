import { fetchModels } from '@/api/ai'
import { guiOpen, isEnglish } from '@/gui/state'
import { schema, settings, type Settings } from '@/settings'
import { useLogStore } from '@/stores/log'
import { debuggerHits } from '@/utils/cx-antidebug'
import type { ChoiceField, Field } from '@/settings/fields'

export type CategoryId = 'answer' | 'course' | 'work' | 'client'

export const CATEGORIES: { id: CategoryId; zh: string; en: string }[] = [
  { id: 'answer', zh: '答题', en: 'Answer' },
  { id: 'course', zh: '刷课', en: 'Course' },
  { id: 'work', zh: '作业', en: 'Work' },
  { id: 'client', zh: '客户端', en: 'Client' },
]

/** 模块展开后的一项设置。widget 缺省时按 field.kind 选控件 */
export interface SettingRef {
  field: Field
  values: Record<string, unknown>
  name: string
  widget?: 'color' | 'key'
  /** 文本框聚焦时拉的候选项 */
  suggest?: () => Promise<string[]>
}

export interface ModuleDef {
  id: string
  cat: CategoryId
  zh: string
  en: string
  /** 悬停时左下角说明浮层的正文 */
  desc: string
  enabled: { get: () => boolean; set: (value: boolean) => void }
  /** 不进功能列表 */
  hidden?: boolean
  /** 功能列表里跟在名字后面的灰字 */
  suffix?: () => string
  settings: SettingRef[]
}

type Group = keyof Settings

const setting = <G extends Group>(
  group: G,
  name: keyof Settings[G] & string,
  extra: Pick<SettingRef, 'widget' | 'suggest'> = {},
): SettingRef => ({
  field: (schema[group].fields as Record<string, Field>)[name],
  values: settings[group] as Record<string, unknown>,
  name,
  ...extra,
})

const toggle = <G extends Group>(group: G, name: keyof Settings[G] & string) => {
  const values = settings[group] as Record<string, unknown>
  return {
    get: () => values[name] as boolean,
    set: (value: boolean) => {
      values[name] = value
    },
  }
}

/** 自动答题开着时锁住答题来源，免得一份作业前后用了两套来源 */
const sourceToggle = <G extends 'answer' | 'ai'>(group: G, name: keyof Settings[G] & string) => {
  const inner = toggle(group, name)
  return {
    get: inner.get,
    set: (value: boolean) => {
      if (settings.answer.enabled) {
        useLogStore().addLog('自动答题开启时不能切换答题来源，先关掉「自动答题」', 'warning')
        return
      }
      inner.set(value)
    },
  }
}

export const optionLabel = (field: ChoiceField, value: unknown) =>
  (field.options.find((option) => option.value === value) ?? field.options[0]).label

const L = (zh: string, en: string) => (isEnglish.value ? en : zh)

/** 按「地址|Key」缓存，两者没变就不重复请求；失败也缓存成空列表，接口不支持时手填模型名 */
let modelCache: { key: string; models: string[] } | null = null
const suggestModels = async () => {
  const key = `${settings.ai.baseUrl}|${settings.ai.apiKey}`
  if (modelCache?.key !== key) {
    const result = await fetchModels(settings.ai)
    modelCache = { key, models: result.ok ? result.models : [] }
  }
  return modelCache.models
}

export const MODULES: ModuleDef[] = [
  {
    id: 'AutoAnswer',
    cat: 'answer',
    zh: '自动答题',
    en: 'AutoAnswer',
    desc: '解析页面题目，按开启的来源逐题搜答案并回填。关掉的题型直接跳过，不查也不扣费，但会拉低正确率。中途关掉会停在下一题前，再打开接着答。开着时不能切换题库海 / 自建AI，其他答题设置改完关掉再打开生效',
    enabled: toggle('answer', 'enabled'),
    suffix: () => {
      const tiku = settings.answer.tiku
      const ai = settings.ai.enabled
      return tiku && ai ? L('题库+AI', 'Tiku+AI') : tiku ? L('题库', 'Tiku') : ai ? 'AI' : L('无来源', 'NoSource')
    },
    settings: [
      setting('answer', 'interval'),
      setting('answer', 'typeSingle'),
      setting('answer', 'typeMulti'),
      setting('answer', 'typeBlank'),
      setting('answer', 'typeJudge'),
      setting('answer', 'typeShort'),
      setting('answer', 'typeNoun'),
      setting('answer', 'typeEssay'),
      setting('answer', 'typeCalc'),
      setting('answer', 'typeOther'),
    ],
  },
  {
    id: 'TikuHai',
    cat: 'answer',
    zh: '题库海',
    en: 'TikuHai',
    desc: '脚本没有自己的题库，接的是第三方题库海，按次计费需自备卡密。先确认能搜到题再购买，搜不到、扣费、充值等问题与脚本无关',
    enabled: sourceToggle('answer', 'tiku'),
    // 填好了就不必占一格灰字，只在缺密钥时提醒
    suffix: () => (settings.answer.tikuToken ? '' : L('缺密钥', 'NoKey')),
    settings: [setting('answer', 'tikuToken'), setting('answer', 'acceptTikuAi'), setting('answer', 'countTikuAi')],
  },
  {
    id: 'OpenAI',
    cat: 'answer',
    zh: '自建AI',
    en: 'CustomAI',
    desc: '自备的 OpenAI 兼容接口，按接口方计费。和题库海同时开启时，只在题库未命中时调用',
    enabled: sourceToggle('ai', 'enabled'),
    suffix: () => settings.ai.model || L('未选模型', 'NoModel'),
    settings: [
      setting('ai', 'baseUrl'),
      setting('ai', 'apiKey'),
      setting('ai', 'model', { suggest: suggestModels }),
      setting('ai', 'vision'),
      setting('ai', 'countAnswer'),
    ],
  },
  {
    id: 'AutoPlay',
    cat: 'course',
    zh: '自动刷课',
    en: 'AutoPlay',
    desc: '自动完成章节里的视频、音频、文档、电子书任务点。关闭后章节页只做作业',
    enabled: toggle('course', 'autoPlay'),
    settings: [setting('course', 'resumeDelay')],
  },
  {
    id: 'AutoNext',
    cat: 'course',
    zh: '自动下一章',
    en: 'AutoNext',
    desc: '当前章节的任务点完成后跳到下一章节',
    enabled: toggle('course', 'autoNextChapter'),
    settings: [setting('course', 'nextDelay')],
  },
  {
    id: 'AntiLeave',
    cat: 'course',
    zh: '阻止离开检测',
    en: 'AntiLeave',
    desc: '拦截超星的离开页面检测。关闭后，每次离开导致的暂停都会被记录并上报',
    enabled: toggle('course', 'blockLeaveDetect'),
    settings: [],
  },
  {
    id: 'AntiDebugger',
    cat: 'course',
    zh: '拦截反调试',
    en: 'AntiDebugger',
    desc: '抹掉超星动态生成的 debugger 语句。不开 F12 时页面看不出区别，一开 F12（或者外部调试器接上）就会被反复断住直到整个标签页卡死，这个开关治的是它。后缀是已经抹掉的条数。所有页面生效',
    enabled: toggle('course', 'blockDebugger'),
    suffix: () => (debuggerHits.value ? String(debuggerHits.value) : ''),
    settings: [],
  },
  {
    id: 'HideAiRobot',
    cat: 'course',
    zh: '屏蔽AI助教',
    en: 'HideAiRobot',
    desc: '隐藏页面右下角的 AI 助教浮窗，所有页面生效',
    enabled: toggle('course', 'hideAiRobot'),
    settings: [],
  },
  {
    id: 'HideWatermark',
    cat: 'course',
    zh: '屏蔽水印',
    en: 'HideWatermark',
    desc: '隐藏超星铺在页面上的水印，所有页面生效',
    enabled: toggle('course', 'hideWatermark'),
    settings: [],
  },
  {
    id: 'AutoSubmit',
    cat: 'work',
    zh: '自动提交',
    en: 'AutoSubmit',
    desc: '章节作业和新版作业正确率达到阈值时自动提交，否则只暂存。AI 答案默认不计入正确率',
    enabled: toggle('submit', 'autoSubmitWork'),
    suffix: () => `${settings.submit.threshold}%`,
    settings: [setting('submit', 'threshold')],
  },
  {
    id: 'ExamNext',
    cat: 'work',
    zh: '考试自动下一题',
    en: 'ExamNext',
    desc: '考试页面答完一题自动切到下一题，每切一题整页刷新一次。进「整卷预览」可以一页答完，不用切题',
    enabled: toggle('exam', 'autoNext'),
    settings: [setting('exam', 'nextDelay')],
  },
  {
    id: 'ExamPreview',
    cat: 'work',
    zh: '考试整卷预览',
    en: 'ExamPreview',
    desc: '进入考试单题页面后自动切到「整卷预览」，所有题在一页里答完，不用逐题刷新',
    enabled: toggle('exam', 'autoPreview'),
    settings: [],
  },
  {
    id: 'ExamSubmit',
    cat: 'work',
    zh: '考试自动交卷',
    en: 'ExamSubmit',
    desc: '整卷预览页全部答完且正确率达到阈值时自动交卷，交了不能撤回。AI 答案默认不计入正确率',
    enabled: toggle('exam', 'autoSubmit'),
    suffix: () => `${settings.exam.submitThreshold}%`,
    settings: [setting('exam', 'submitThreshold')],
  },
  {
    id: 'ClickGUI',
    cat: 'client',
    zh: '点击界面',
    en: 'ClickGUI',
    desc: '就是这个界面，按快捷键开关。请不要和其他刷课脚本同时使用，出了问题换 Chrome、Firefox 试试',
    enabled: {
      get: () => guiOpen.value,
      set: (value) => {
        guiOpen.value = value
      },
    },
    hidden: true,
    settings: [
      setting('gui', 'key', { widget: 'key' }),
      setting('gui', 'lang'),
      setting('gui', 'style'),
      setting('gui', 'highlight'),
      setting('gui', 'follow'),
      setting('gui', 'panelWidth'),
      setting('gui', 'rowHeight'),
      setting('gui', 'fontSize'),
      setting('gui', 'radius'),
      setting('gui', 'opacity'),
      setting('gui', 'glass'),
      setting('gui', 'dim'),
      setting('gui', 'blur'),
      setting('gui', 'safeArea'),
    ],
  },
  {
    id: 'ArrayList',
    cat: 'client',
    zh: '功能列表',
    en: 'ArrayList',
    desc: '在屏幕角落列出已开启的功能。GUI 打开时可以拖动，拖过屏幕中线改为左对齐',
    enabled: toggle('arraylist', 'enabled'),
    hidden: true,
    settings: [
      setting('arraylist', 'color'),
      setting('arraylist', 'accent', { widget: 'color' }),
      setting('arraylist', 'accent2', { widget: 'color' }),
      setting('arraylist', 'speed'),
      setting('arraylist', 'side'),
      setting('arraylist', 'suffix'),
      setting('arraylist', 'opacity'),
      setting('arraylist', 'glow'),
      setting('arraylist', 'lowercase'),
    ],
  },
  {
    id: 'HUD',
    cat: 'client',
    zh: '水印',
    en: 'Watermark',
    desc: '显示页面类型、答题进度、正确率和时间。GUI 打开时可以拖动',
    enabled: toggle('hud', 'watermark'),
    suffix: () => optionLabel(schema.hud.fields.watermarkStyle, settings.hud.watermarkStyle),
    settings: [setting('hud', 'watermarkStyle')],
  },
  {
    id: 'Notifications',
    cat: 'client',
    zh: '通知',
    en: 'Notifications',
    desc: '把运行日志弹成右下角通知',
    enabled: toggle('hud', 'notify'),
    suffix: () => optionLabel(schema.hud.fields.notifyLevel, settings.hud.notifyLevel),
    settings: [setting('hud', 'notifyLevel')],
  },
  {
    id: 'Console',
    cat: 'client',
    zh: '日志窗口',
    en: 'Console',
    desc: '完整的运行日志，刷新页面后清空',
    enabled: toggle('hud', 'console'),
    settings: [setting('hud', 'consoleWidth')],
  },
  {
    id: 'QuestionHUD',
    cat: 'client',
    zh: '答题面板',
    en: 'QuestionHUD',
    desc: '逐题显示答案和来源，以及有几题计入了正确率。没搜到答案的题会显示原因',
    enabled: toggle('hud', 'questionHud'),
    settings: [],
  },
]

export const moduleName = (module: Pick<ModuleDef, 'zh' | 'en'>) => (isEnglish.value ? module.en : module.zh)
