import { unsafeWindow } from '$'
import { ref, watchEffect } from 'vue'
import { settings } from '@/settings'

/**
 * 抹掉过的动态函数条数，给功能列表的后缀用——这是补丁有没有生效的唯一可见凭据。
 * 顶层实例这个数是全页合计（自己的 + 各 iframe 报上来的），iframe 实例的没人看。
 */
export const debuggerHits = ref(0)

const CHANNEL = 'cx-helper:debugger-hits'

/**
 * 反调试基本都在作业 / 视频那几个 iframe 里，而界面只挂在有任务的顶层文档上，
 * 两边是各挂一份的独立实例，不汇总的话顶层的计数永远是 0。
 * 抹一条发一条会把消息队列淹了（混淆器一秒能触发几十次），所以攒 500ms 报一次增量，
 * 丢了也无所谓——这只是个统计数。
 */
let pending = 0
let timer: ReturnType<typeof setTimeout> | undefined
const report = () => {
  pending += 1
  if (timer !== undefined) return
  timer = setTimeout(() => {
    timer = undefined
    window.top?.postMessage({ channel: CHANNEL, count: pending }, '*')
    pending = 0
  }, 500)
}

const collect = () => {
  window.addEventListener('message', (event) => {
    const data = event.data as { channel?: string; count?: number } | null
    if (data?.channel !== CHANNEL || typeof data.count !== 'number') return
    debuggerHits.value += data.count
  })
}

const DEBUGGER = /\bdebugger\b/g

const raw = unsafeWindow.Function

/** 实测作业页发来的函数体清一色是光秃秃一句 `debugger` */
const ONLY_DEBUGGER = /^[\s;]*(?:debugger[\s;]*)+$/

/** 顶替纯 debugger 函数用的空壳，编译一次反复用 */
const noop = raw()

const hit = () => {
  debuggerHits.value += 1
  if (window.top !== window) report()
}

/**
 * `Function(...形参, 函数体)`，只有最后一个参数是函数体。
 *
 * 函数体整个就是 `debugger` 的（作业页每秒能来几千次）直接换成同一个空壳，**碰都不碰原生构造器**：
 * 编译一次就多一个 `VMxxxx` 脚本，光是 DevTools 接收这些脚本通知就够把面板拖死，
 * 抹成 `void 0` 再编译等于断点没了、洪水照旧。
 *
 * 保护逻辑和正经代码拌在一起的那种才走净化路线——整段丢掉会把页面带崩，
 * `void 0` 是表达式语句，顶得上原来那条语句的位置。
 *
 * 返回函数表示顶替掉编译结果，返回 `undefined` 表示 `args` 已就地净化、照常交给原生构造器。
 */
const defuse = (args: unknown[]) => {
  const last = args.length - 1
  const body = args[last]
  if (typeof body !== 'string') return undefined
  if (ONLY_DEBUGGER.test(body)) {
    hit()
    return noop
  }
  const clean = body.replace(DEBUGGER, 'void 0')
  if (clean === body) return undefined
  hit()
  args[last] = clean
  return undefined
}

const patched = new Proxy(raw, {
  apply: (target, thisArg, args) => defuse(args) ?? Reflect.apply(target, thisArg, args),
  construct: (target, args) => defuse(args) ?? Reflect.construct(target, args),
})

/**
 * 超星页面靠 `Function('debugger')()` 反复触发断点（DevTools 里那一长串 VMxxxx 就是它编译出来的）。
 * 调试器没 attach 时 `debugger` 是空操作，所以平时无感；F12 一开就被反复断住，
 * 混淆器还会拿断点前后的耗时判断有没有被调试，判定成立就加码狂造函数，整个标签页直接卡死。
 * 拿 Proxy 换掉动态编译入口，函数体交给原生构造器之前先把 `debugger` 抹掉。
 *
 * 混淆器取构造器走的是 `(function(){}).constructor('debugger')` 而不是 `window.Function`，
 * 所以 `Function.prototype.constructor` 必须跟着一起换，只换 window 上那个拦不住。
 *
 * 只管动态编译这一条路——静态写死在页面 bundle 里的 `debugger` 拦不了，那种得靠 DevTools 的
 * 「Deactivate breakpoints」（Ctrl+F8）。
 *
 * **改完必须 `npm run build` 装正式脚本验证**：dev 脚本是 deferred 的，执行时页面 bundle 早跑完了，
 * 补丁打上去的时候反调试已经在转，dev 下测不出真实效果。
 */
export const silenceDebugger = () => {
  if (window.top === window) collect()
  watchEffect(() => {
    const target = settings.course.blockDebugger ? patched : raw
    try {
      unsafeWindow.Function = target as FunctionConstructor
      // constructor 原本就是 writable + configurable，照原样写回去，关掉开关时还原得回来
      Object.defineProperty(raw.prototype, 'constructor', { value: target, writable: true, configurable: true })
    } catch (error) {
      // 页面把 Function 锁死过就放弃，别把整个入口带崩
      console.warn(error)
    }
  })
}
