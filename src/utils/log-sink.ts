import type { LogItem } from '@/types'

/**
 * dev 专用：把面板日志同时投给本地收集器（npm run log），落盘后可以在终端里看整轮跑的记录。
 * import.meta.env.DEV 在正式构建里是 false，整段连同 import 一起被 tree-shake，不会进用户脚本。
 */
const COLLECTOR_URL = 'http://127.0.0.1:17650/log'

/** extra 是只落盘、不进面板的附加字段，比如答题详情 */
export const sendLog = (item: LogItem, extra?: Record<string, unknown>) => {
  if (!import.meta.env.DEV) return

  // 用原生 fetch 而不是 GM_xmlhttpRequest：上报不占 GM 的请求队列，堵不到题库搜索。
  // 127.0.0.1 被浏览器视为安全来源，https 页面直连回环不算混合内容。
  // 不设 Content-Type，让它保持 text/plain 这种 CORS 简单请求，省掉 preflight；
  // 收集器只管把 body 原样追加，不在乎类型。keepalive 保证跳章节卸载页面时最后几条还发得出去。
  fetch(COLLECTOR_URL, {
    method: 'POST',
    body: JSON.stringify({ ...item, page: location.href, ...extra }),
    keepalive: true,
  }).catch(() => {
    // 收集器没开就当无事发生
  })
}
