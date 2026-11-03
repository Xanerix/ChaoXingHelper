/** 单位：秒 */
export const sleep = (second: number) => new Promise<void>((resolve) => setTimeout(resolve, second * 1000))

const pad = (n: number) => (n < 10 ? `0${n}` : String(n))

export const getDateTime = () => {
  const now = new Date()
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/**
 * 递归收集所有可访问的嵌套 iframe，按文档顺序展开。
 * 跨域 iframe 拿不到 contentDocument，直接跳过。
 */
export const collectNestedIframes = (element: Element): HTMLIFrameElement[] => {
  const result: HTMLIFrameElement[] = []
  for (const iframe of Array.from(element.querySelectorAll('iframe'))) {
    const iframeDocument = iframe.contentDocument
    if (!iframeDocument) continue
    result.push(iframe, ...collectNestedIframes(iframeDocument.documentElement))
  }
  return result
}
