import { bool, choice, group, num, text, type ValuesOf } from '@/settings/fields'

/** ArrayList 主色 / 副色可选的色板 */
const SWATCHES = [
  { value: '#9D7BFF', label: '紫' },
  { value: '#FF5C8A', label: '粉' },
  { value: '#4FD1E8', label: '青' },
  { value: '#6EE7A0', label: '绿' },
  { value: '#FFB547', label: '橙' },
  { value: '#F4F4F8', label: '白' },
] as const

/**
 * 所有用户设置的唯一定义。存盘按 `分组.键` 定位，label 只是显示用，随便改。
 * 改键名或者删改分组会让老存档里的这一项回到默认值（没有迁移），加项不受影响。
 * 哪一项挂在 ClickGUI 的哪个模块下见 `src/gui/modules.ts`。
 */
export const schema = {
  answer: group('答题', {
    enabled: bool(true, { label: '自动答题' }),
    tiku: bool(true, { label: '题库海' }),
    // 下限 3 秒是真实页面上跑过的值，再快会不会触发风控没验过
    interval: num(3, {
      label: '答题间隔',
      min: 3,
      max: 60,
      unit: 's',
      tip: '每道题搜答案之前等待的时间。低于 3 秒会不会触发风控没验证过',
    }),
    // 关掉的题型直接跳过，不查也不扣费；跳过的题不计入正确率，会把正确率压下去
    typeSingle: bool(true, { label: '单选题' }),
    typeMulti: bool(true, { label: '多选题' }),
    typeBlank: bool(true, { label: '填空题' }),
    typeJudge: bool(true, { label: '判断题' }),
    typeShort: bool(true, { label: '简答题' }),
    typeNoun: bool(true, { label: '名词解释' }),
    typeEssay: bool(true, { label: '论述题' }),
    typeCalc: bool(true, { label: '计算题' }),
    typeOther: bool(true, { label: '其他题型', tip: '题型前缀不在已知列表里的题' }),
    tikuToken: text('', { label: '密钥', placeholder: '题库海的卡密或 API Key', secret: true }),
    acceptTikuAi: bool(true, { label: '接受题库海的 AI 答案', tip: '题库海自己用 AI 兜底生成的答案，不是自建 AI' }),
    // 默认值别改成开：AI 答错的题会把正确率抬过自动提交门槛，见 README「AI 兜底会扣费」
    countTikuAi: bool(false, {
      label: 'AI 答案计入正确率',
      tip: '题库海兜底生成的答案算答对，开启后它答错的题也可能触发自动提交',
    }),
  }),
  ai: group('自建 AI', {
    enabled: bool(false, { label: '自建AI' }),
    /** 写到 /chat/completions 前面为止，请求时再拼上；DeepSeek 不带 /v1 */
    baseUrl: text('https://api.deepseek.com', {
      label: '地址',
      placeholder: 'OpenAI 兼容接口，写到 /chat/completions 前面为止',
    }),
    apiKey: text('', { label: 'Key', placeholder: 'AI 接口的 API Key', secret: true }),
    model: text('', { label: '模型', placeholder: '模型名，聚焦时拉取候选' }),
    /** 题目里的图片以 image_url 块发给模型，模型不支持识图时开着会 400 */
    vision: bool(false, { label: '发送题目图片', tip: '模型不支持识图时请求会报错' }),
    // 同上，默认别改成开
    countAnswer: bool(false, {
      label: 'AI 答案计入正确率',
      tip: '自建 AI 生成的答案算答对，开启后它答错的题也可能触发自动提交',
    }),
  }),
  submit: group('提交', {
    autoSubmitWork: bool(true, { label: '自动提交' }),
    threshold: num(85, { label: '正确率达到', min: 0, max: 100, unit: '%' }),
  }),
  course: group('刷课', {
    autoPlay: bool(true, { label: '自动刷课' }),
    resumeDelay: num(3, {
      label: '续播等待',
      min: 3,
      max: 60,
      unit: 's',
      tip: '视频被暂停或者弹题提交后，等多久再继续播放',
    }),
    autoNextChapter: bool(true, { label: '自动下一章' }),
    nextDelay: num(3, { label: '跳转等待', min: 3, max: 60, unit: 's', tip: '本章完成后，等多久再点「下一章节」' }),
    blockLeaveDetect: bool(true, { label: '阻止离开检测' }),
    blockDebugger: bool(true, { label: '拦截反调试' }),
    hideAiRobot: bool(true, { label: '屏蔽AI助教' }),
    hideWatermark: bool(true, { label: '屏蔽水印' }),
  }),
  exam: group('考试', {
    autoNext: bool(true, { label: '考试自动下一题' }),
    nextDelay: num(3, { label: '切题等待', min: 3, max: 60, unit: 's', tip: '答完一题后，等多久再切到下一题' }),
    autoPreview: bool(true, { label: '考试自动进入整卷预览' }),
    autoSubmit: bool(false, { label: '考试自动交卷' }),
    submitThreshold: num(100, {
      label: '正确率达到',
      min: 0,
      max: 100,
      unit: '%',
      tip: '交卷不能撤回。AI 答案默认不计入正确率，没搜到答案的题也不算',
    }),
  }),
  gui: group('点击界面', {
    /** KeyboardEvent.code */
    key: text('ShiftLeft', { label: '快捷键' }),
    lang: choice(
      [
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'English' },
      ],
      'zh',
      { label: '模块名' },
    ),
    style: choice(
      [
        { value: 'header', label: '色块标题' },
        { value: 'line', label: '细线描边' },
      ],
      'line',
      { label: '标题栏' },
    ),
    highlight: choice(
      [
        { value: 'fill', label: '色块' },
        { value: 'text', label: '仅文字' },
        { value: 'bar', label: '侧条' },
      ],
      'text',
      { label: '开启高亮' },
    ),
    follow: bool(false, { label: '模块颜色跟随列表' }),
    panelWidth: num(184, { label: '面板宽度', min: 150, max: 240, step: 2, unit: 'px' }),
    rowHeight: num(23, { label: '行高', min: 18, max: 32, unit: 'px' }),
    fontSize: num(13, { label: '字号', min: 11, max: 16, unit: 'px' }),
    radius: num(8, { label: '圆角', min: 0, max: 14, unit: 'px' }),
    opacity: num(50, { label: '面板不透明度', min: 30, max: 100, unit: '%' }),
    glass: bool(true, { label: '面板毛玻璃', tip: '模糊面板背后的内容，不透明度调低才看得出来' }),
    dim: bool(true, { label: '打开时压暗页面' }),
    blur: bool(false, { label: '打开时模糊整个页面' }),
    /** 占页面宽高的百分比，居中。面板、窗口、水印、功能列表、说明、通知都只能待在这个范围里 */
    safeArea: num(95, {
      label: '屏幕安全区',
      min: 50,
      max: 100,
      unit: '%',
      tip: '所有界面元素只能在这个范围内移动，调节时用绿色虚线框标出',
    }),
  }),
  arraylist: group('功能列表', {
    enabled: bool(true, { label: '功能列表' }),
    color: choice(
      [
        { value: 'astolfo', label: 'Astolfo' },
        { value: 'rainbow', label: '彩虹' },
        { value: 'fade', label: '呼吸' },
        { value: 'dual', label: '双色渐变' },
        { value: 'static', label: '纯色' },
      ],
      'astolfo',
      { label: '颜色' },
    ),
    accent: choice(SWATCHES, '#9D7BFF', { label: '主色' }),
    accent2: choice(SWATCHES, '#4FD1E8', { label: '副色（双色渐变）' }),
    speed: num(2, { label: '流动速度', min: 1, max: 10 }),
    side: choice(
      [
        { value: 'right', label: '右侧条' },
        { value: 'left', label: '左侧条' },
        { value: 'none', label: '无' },
      ],
      'none',
      { label: '侧条' },
    ),
    suffix: choice(
      [
        { value: 'grey', label: '灰色' },
        { value: 'bracket', label: '方括号' },
        { value: 'dash', label: '短横' },
        { value: 'hide', label: '隐藏' },
      ],
      'grey',
      { label: '后缀' },
    ),
    opacity: num(40, { label: '背景不透明度', min: 0, max: 100, unit: '%' }),
    glow: bool(true, { label: '辉光' }),
    lowercase: bool(false, { label: '小写', tip: '只对英文模块名有效' }),
  }),
  hud: group('HUD', {
    watermark: bool(true, { label: '水印' }),
    watermarkStyle: choice(
      [
        { value: 'box', label: '方框' },
        { value: 'text', label: '大字' },
      ],
      'box',
      { label: '样式' },
    ),
    notify: bool(true, { label: '通知' }),
    notifyLevel: choice(
      [
        { value: 'all', label: '全部' },
        { value: 'warn', label: '仅警告和错误' },
      ],
      'all',
      { label: '弹出' },
    ),
    console: bool(false, { label: '日志窗口' }),
    consoleWidth: num(310, { label: '窗口宽度', min: 240, max: 600, step: 2, unit: 'px' }),
    questionHud: bool(true, { label: '答题面板' }),
  }),
}

export type Settings = ValuesOf<typeof schema>
