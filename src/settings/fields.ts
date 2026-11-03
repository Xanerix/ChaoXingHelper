interface Meta {
  label: string
  /** 有值时悬停这一项，在左下角说明浮层里显示这段文案 */
  tip?: string
}

interface ChoiceOption<T extends string = string> {
  value: T
  label: string
}

export type BoolField = Meta & { kind: 'bool'; def: boolean }
export type NumField = Meta & { kind: 'num'; def: number; min: number; max: number; step: number; unit?: string }
export type ChoiceField<T extends string = string> = Meta & {
  kind: 'choice'
  def: T
  options: readonly ChoiceOption<T>[]
}
/** secret：输入框遮字显示 */
export type TextField = Meta & { kind: 'text'; def: string; placeholder?: string; secret?: boolean }

export type Field = BoolField | NumField | ChoiceField | TextField

export const bool = (def: boolean, meta: Meta): BoolField => ({ kind: 'bool', def, ...meta })

export const num = (
  def: number,
  meta: Meta & { min: number; max: number; step?: number; unit?: string },
): NumField => ({
  kind: 'num',
  def,
  step: 1,
  ...meta,
})

// const：不加的话选项对象里的 value 会被放宽成 string，拼错枚举值编译期查不出来
export const choice = <const T extends string>(
  options: readonly ChoiceOption<T>[],
  def: NoInfer<T>,
  meta: Meta,
): ChoiceField<T> => ({ kind: 'choice', def, options, ...meta })

export const text = (def: string, meta: Meta & { placeholder?: string; secret?: boolean }): TextField => ({
  kind: 'text',
  def,
  ...meta,
})

export const group = <F extends Record<string, Field>>(label: string, fields: F) => ({ label, fields })

type ValueOf<F> = F extends ChoiceField<infer T>
  ? T
  : F extends BoolField
    ? boolean
    : F extends NumField
      ? number
      : string

/** schema -> 存盘和业务代码用的值类型 */
export type ValuesOf<S extends Record<string, { fields: Record<string, Field> }>> = {
  [G in keyof S]: { [K in keyof S[G]['fields']]: ValueOf<S[G]['fields'][K]> }
}

export const isValid = (field: Field, value: unknown) => {
  switch (field.kind) {
    case 'bool':
      return typeof value === 'boolean'
    case 'num':
      return typeof value === 'number' && Number.isFinite(value) && value >= field.min && value <= field.max
    case 'choice':
      return field.options.some((option) => option.value === value)
    case 'text':
      return typeof value === 'string'
  }
}
