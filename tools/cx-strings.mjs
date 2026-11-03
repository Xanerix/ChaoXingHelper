/**
 * 解出 javascript-obfuscator 混淆文件的字符串表：下标 -> 字符串。
 * 全程只做文本解析，**不执行源文件里的任何代码**（docs/cx-dump/README.md 里那个 vm 沙箱方案会执行）。
 *
 *   node tools/cx-strings.mjs <混淆的 js> [输出 txt]          整表，不给输出路径就打到 stdout
 *   node tools/cx-strings.mjs <混淆的 js> --lookup 0x38d 0x194  只查几个下标
 *
 * 输出的下标就是源码里 `_0xabc(0x38d)` 括号里那个数，可以直接对照，不用再算偏移——
 * 前提是该处调用的是解码器本身或它的直接别名（`var _0xabc=_0x3245`），本工具认的就是这种形状。
 *
 * 只支持「明文数组 + 减偏移 + 按校验和旋转」这一种变体，即超星 2026-10 版 videojs-ext.min.js 的形状。
 * 混淆器开了 base64 / rc4 字符串编码的话，解码器里会有 atob / charCodeAt，这里会直接报错退出。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [, , srcPath, ...rest] = process.argv
if (!srcPath) {
  console.error('usage: node tools/cx-strings.mjs <src.js> [out.txt | --lookup 0x.. 0x..]')
  process.exit(1)
}
const src = readFileSync(srcPath, 'utf8')

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

// function _0x3245(_0xa,_0xb){_0xa=_0xa-0x17d;var _0xc=_0x1cfc();...
const decoderMatch = src.match(
  /function (_0x[0-9a-f]+)\((_0x[0-9a-f]+),_0x[0-9a-f]+\)\{\2=\2-(0x[0-9a-f]+);var _0x[0-9a-f]+=(_0x[0-9a-f]+)\(\);/,
)
if (!decoderMatch) fail('没找到解码器 function _0x..(a,b){a=a-0x..;var c=_0x..();')
const [, decoderName, , offsetHex, arrayFnName] = decoderMatch
const offset = Number(offsetHex)

const decoderEnd = decoderMatch.index + decoderMatch[0].length
const decoderBody = src.slice(decoderEnd, src.indexOf('return', decoderEnd))
if (/atob|charCodeAt|fromCharCode/.test(decoderBody)) {
  fail('解码器带 base64/rc4 编码，本工具不支持')
}

/** 从 `[` 后面开始读 JS 字符串字面量，直到 `]` */
const parseStringArray = (from) => {
  const out = []
  let i = from
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }
  for (;;) {
    while (/[\s,]/.test(src[i])) i++
    if (src[i] === ']') return out
    const quote = src[i]
    if (quote !== "'" && quote !== '"') fail(`字符串数组里出现了非字面量：${src.slice(i, i + 40)}`)
    i++
    let value = ''
    while (src[i] !== quote) {
      if (src[i] !== '\\') {
        value += src[i++]
        continue
      }
      const next = src[i + 1]
      if (next === 'x') {
        value += String.fromCharCode(parseInt(src.slice(i + 2, i + 4), 16))
        i += 4
      } else if (next === 'u') {
        value += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16))
        i += 6
      } else if (next === '\n') {
        i += 2
      } else {
        value += simple[next] ?? next
        i += 2
      }
    }
    out.push(value)
    i++
  }
}

const arrayHead = new RegExp(`function ${arrayFnName}\\(\\)\\{var _0x[0-9a-f]+=\\[`)
const arrayMatch = src.match(arrayHead)
if (!arrayMatch) fail(`没找到字符串数组 function ${arrayFnName}(){var _0x..=[`)
const table = parseStringArray(arrayMatch.index + arrayMatch[0].length)

// 旋转 IIFE：(function(a,b){...while(!![]){try{var x=<校验表达式>;if(x===b)break;...}}}(_0x1cfc,0xf2f8e))
const rotateCall = src.match(new RegExp(`\\(${arrayFnName},(0x[0-9a-f]+)\\)`))
if (!rotateCall) fail(`没找到旋转调用 (${arrayFnName},0x..)`)
const target = Number(rotateCall[1])
const loopHead = /while\(!!\[\]\)\{try\{var _0x[0-9a-f]+=/g
let exprStart = -1
for (const m of src.slice(0, rotateCall.index).matchAll(loopHead)) exprStart = m.index + m[0].length
if (exprStart < 0) fail('没找到旋转循环里的校验表达式')
const expr = src.slice(exprStart, src.indexOf(';', exprStart))

/**
 * 校验表达式只由 `parseInt(别名(0x..))`、数字字面量、+ - * / 和括号组成，
 * 自己解析求值，不交给 eval。出现别的东西就报错，说明混淆器换了形状。
 */
const tokenize = (text) => {
  const tokens = []
  const re = /\s*(?:parseInt\(_0x[0-9a-f]+\((0x[0-9a-f]+)\)\)|(0x[0-9a-f]+|\d+(?:\.\d+)?)|([-+*/()]))/y
  // sticky 正则匹配失败时 lastIndex 会归零，所以位置自己记
  let at = 0
  while (at < text.length) {
    re.lastIndex = at
    const m = re.exec(text)
    if (!m) fail(`校验表达式里有不认识的东西：${text.slice(at, at + 40)}`)
    if (m[1]) tokens.push({ kind: 'str', index: Number(m[1]) })
    else if (m[2]) tokens.push({ kind: 'num', value: Number(m[2]) })
    else tokens.push({ kind: 'op', value: m[3] })
    at = re.lastIndex
  }
  return tokens
}

const evaluate = (tokens, lookup) => {
  let pos = 0
  const peek = () => tokens[pos]
  const primary = () => {
    const token = tokens[pos++]
    if (token.kind === 'num') return token.value
    if (token.kind === 'str') return parseInt(lookup(token.index))
    if (token.value === '-') return -primary()
    if (token.value === '+') return +primary()
    if (token.value === '(') {
      const value = additive()
      pos++ // )
      return value
    }
    fail(`校验表达式解析失败，位置 ${pos}`)
  }
  const multiplicative = () => {
    let value = primary()
    while (peek()?.value === '*' || peek()?.value === '/') {
      const op = tokens[pos++].value
      const right = primary()
      value = op === '*' ? value * right : value / right
    }
    return value
  }
  const additive = () => {
    let value = multiplicative()
    while (peek()?.value === '+' || peek()?.value === '-') {
      const op = tokens[pos++].value
      const right = multiplicative()
      value = op === '+' ? value + right : value - right
    }
    return value
  }
  return additive()
}

const tokens = tokenize(expr)
let rotated = false
for (let i = 0; i < table.length; i++) {
  if (evaluate(tokens, (index) => table[index - offset] ?? '') === target) {
    rotated = true
    break
  }
  table.push(table.shift())
}
if (!rotated) fail('转了一整圈也没对上校验和，表达式或数组解析有误')

const line = (i) => `0x${(i + offset).toString(16)}\t${JSON.stringify(table[i])}`

if (rest[0] === '--lookup') {
  for (const hex of rest.slice(1)) {
    const i = Number(hex) - offset
    console.log(i >= 0 && i < table.length ? line(i) : `${hex}\t(越界)`)
  }
} else {
  const text = `${table.map((_, i) => line(i)).join('\n')}\n`
  if (rest[0]) {
    writeFileSync(rest[0], text, 'utf8')
    console.error(`${decoderName}: ${table.length} 条，偏移 ${offsetHex} -> ${rest[0]}`)
  } else {
    process.stdout.write(text)
  }
}
