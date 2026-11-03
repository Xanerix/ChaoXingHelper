import { Font } from '@fredli74/typr'
import md5 from 'blueimp-md5'
import fontTable from '@/assets/cx-font-table.json'

/**
 * 超星的题目文本混淆：页面内联一份自定义字体（font-cxsecret），
 * 把常用汉字的码位打乱，视觉正常但 DOM 里全是乱码。
 *
 * 解法是把字体里每个字形的轮廓取 md5，去对照表查它本来是哪个字。
 * 对照表源自 forestpolice.org/ttf/2.0/table.json（wyn665817，MIT），已打包进脚本。
 * 表里混着 author/version 等几个元数据键，不会和 8 位 hex 的 hash 撞上。
 */
const table = fontTable as unknown as Record<string, number>

const CJK_START = 0x4e00
const CJK_END = 0x9fa6

const base64ToUint8Array = (base64: string) => {
  const data = window.atob(base64)
  const buffer = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) buffer[i] = data.charCodeAt(i)
  return buffer
}

const findSecretFontData = (iframeDocument: Document) => {
  const style = Array.from(iframeDocument.querySelectorAll('style')).find((item) =>
    item.textContent?.includes('font-cxsecret'),
  )
  return style?.textContent?.match(/base64,([\w\W]+?)'/)?.[1]
}

export const decryptCxFont = (iframeDocument: Document) => {
  const fontData = findSecretFontData(iframeDocument)
  if (!fontData) return

  const font = new Font(base64ToUint8Array(fontData).buffer)

  const charMap = new Map<string, string>()
  for (let code = CJK_START; code < CJK_END; code++) {
    const glyph = font.codeToGlyph(code)
    if (!glyph) continue
    const hash = md5(JSON.stringify(font.glyphToPath(glyph))).slice(24)
    const real = table[hash]
    if (real === undefined) continue
    charMap.set(String.fromCharCode(code), String.fromCharCode(real))
  }
  if (!charMap.size) return

  // 一遍过，避免「A->B 再 B->C」这种连环替换
  const pattern = new RegExp(`[${[...charMap.keys()].join('')}]`, 'g')
  for (const element of Array.from(iframeDocument.querySelectorAll('.font-cxsecret'))) {
    element.innerHTML = element.innerHTML.replace(pattern, (char) => charMap.get(char) ?? char)
    element.classList.remove('font-cxsecret')
  }
}
