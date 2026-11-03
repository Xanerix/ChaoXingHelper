import { reactive, toRaw, watch } from 'vue'
import { GM_addValueChangeListener, GM_getValue, GM_setValue } from '$'

/** 输入框每敲一个字都会触发，攒一下再写 */
const WRITE_DELAY = 300

interface Options<T> {
  /** 存档 -> 状态，必须能吃下任何垃圾值（空存档、旧格式、手改坏的） */
  decode: (raw: unknown) => T
  /** 状态 -> 存档，默认原样存 */
  encode?: (state: T) => unknown
  /** 别的标签页 / frame 写了这个键时是否跟着更新 */
  sync: boolean
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * 逐层写进已有对象，不替换嵌套对象本身：
 * 别处拿着 `settings.course` 这种引用时，换成新对象会让它们改的是一个已经脱钩的旧对象
 */
const assignDeep = (target: Record<string, unknown>, source: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key]
    if (isRecord(value) && isRecord(current)) assignDeep(current, value)
    else target[key] = value
  }
}

/**
 * 一个 GM 键对应一个响应式对象，改了自动防抖写盘。
 * 脚本在每个 frame、每个标签页各有一份实例，不同步的话谁最后写盘谁就把别人的改动整份盖掉。
 */
export const persisted = <T extends object>(key: string, { decode, encode = (state) => state, sync }: Options<T>) => {
  const state = reactive(decode(GM_getValue<unknown>(key))) as T
  // 最近一次写出或收到的内容。和它一样就不写：既省掉无效写盘，也挡住收到同步后再写回去的来回
  let last = JSON.stringify(encode(toRaw(state)))
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(
    state,
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const value = encode(toRaw(state))
        const serialized = JSON.stringify(value)
        if (serialized === last) return
        last = serialized
        GM_setValue(key, value)
      }, WRITE_DELAY)
    },
    { deep: true },
  )

  if (sync) {
    GM_addValueChangeListener(key, (_name, _oldValue, newValue) => {
      const value = decode(newValue)
      const serialized = JSON.stringify(encode(value))
      if (serialized === last) return
      last = serialized
      assignDeep(state as Record<string, unknown>, value as Record<string, unknown>)
    })
  }

  return state
}
