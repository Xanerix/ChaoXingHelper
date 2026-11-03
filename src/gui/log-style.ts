import type { LogType } from '@/types'

export const LOG_LABEL: Record<LogType, string> = {
  primary: '信息',
  info: '信息',
  success: '成功',
  warning: '警告',
  danger: '错误',
}

export const LOG_COLOR: Record<LogType, string> = {
  primary: 'var(--info)',
  info: 'var(--ui-dim)',
  success: 'var(--ok)',
  warning: 'var(--warn)',
  danger: 'var(--bad)',
}

export const LOG_ICON: Record<LogType, string> = {
  primary: 'i',
  info: 'i',
  success: '✓',
  warning: '!',
  danger: '×',
}
