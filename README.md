# 超星小助手 ChaoXing Helper

超星学习通的油猴脚本。

## 目录

```
src/
  main.ts                入口：挂载到 closed shadow root
  App.vue                根组件：协议、启动业务逻辑、快捷键
  api/tiku.ts            题库海搜题接口（换题库只动这个文件）
  platforms/
    base-handler.ts      解析/回填的公共部分 + 逐题搜答案的主循环
    index.ts             URL -> 平台逻辑的路由表
    cx/                  超星：章节、作业、考试
  settings/              用户设置：schema、GM 存储持久化、跨标签页同步
  stores/                响应式单例：日志、题目
  gui/                   ClickGUI / ArrayList / 水印 / 通知 / 窗口，手写控件，不用 UI 库
  utils/
    cx-font.ts           超星 font-cxsecret 字体混淆还原
    common.ts            sleep / 时间 / 递归收集 iframe
  styles/gui.css         界面样式，以字符串注入 shadow root
```

## 题库

用的是题库海的自助卡密渠道：`POST https://search.tikuhai.com/api/open/v1/search/exact`，
鉴权只需要一个请求头 `X-Consumer-Token`（卡密或个人 API Key）

## 自建 AI 与中转站兼容

在「自建 AI」中填写 OpenAI 兼容接口的地址、Key 和模型。地址写到 `/chat/completions` 前面，例如 `https://example.com/v1`；脚本会自动拼接请求路径。

部分中转站会校验客户端标识。如果出现「仅支持编程客户端」等提示，可在「User-Agent」输入框中选择候选值或手动填写服务商支持的值。内置 OpenCode、Claude Code、Codex、Cline、Roo Code、Cursor、Trae 和 GitHub Copilot 的客户端标识参考值。

- 自定义 User-Agent 已由用户在所用中转站实测通过，但不保证所有候选值、站点或浏览器环境都适用。
- 留空保持默认请求头；只修改 User-Agent，不附加其他客户端专用请求头，也不切换 API 协议。
- 设置同时用于模型列表和答题请求，不影响题目图片下载或题库请求。
- 修改后重新聚焦模型输入框会重新拉取候选模型；答题流程需关闭「自动答题」后再开启，使新设置生效。
- 请遵守服务商的使用规则；若仍被拒绝，需向服务商确认支持的接入方式。

## 构建

```bash
npm install
npm run build      # 先类型检查再打包 -> dist/course-helper.user.js
npm run typecheck
```

产物只有一个文件，直接拖进 Tampermonkey 即可。

## 开发模式

```bash
npm run dev
```

开启一个 vite dev server（`:5173`），Windows/Mac 下会自动打开浏览器跳到安装页；
也可以手动访问 <http://localhost:5173/>，它会重定向到
`http://localhost:5173/__vite-plugin-monkey.install.user.js`。

dev 脚本本身不含业务代码，只往页面注入一行：

```html
<script type="module" src="http://127.0.0.1:5173/__vite-plugin-monkey.entry.js"></script>
<!-- 内容就两行： import "/@vite/client"; import "/src/main.ts"; -->
```

代码从 dev server 实时拉，热更新，不用重新安装。

- dev 脚本名字带 `server:` 前缀，和正式脚本在 Tampermonkey 列表里并存，**记得同时只启用一个**，否则页面上会冒出两个面板；
- 它一次性 `@grant` 了全部 GM API，所以代码里新用一个 `GM_xxx` 不需要重装；
- 改了 `vite.config.ts` 里的 UserScript 头（`@match`/`@resource`/`@connect` 等）**要重装一次**dev 脚本，插件检测到头部变化会自动再弹一次安装页。
