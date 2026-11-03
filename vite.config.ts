import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import monkey from 'vite-plugin-monkey'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    vue(),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'ChaoXing Helper',
        namespace: 'cx-helper',
        author: 'XC',
        description:
          '超星学习通辅助工具，支持自动答题、自动刷课等功能。仅供学习交流使用，请勿用于商业用途。',
        license: 'MIT',
        icon: 'https://vitejs.dev/logo.svg',
        match: [
          '*://*.chaoxing.com/*',
        ],
        // * 给用户自填的 AI 接口地址用，未列出的域名首次请求时 Tampermonkey 会弹窗让用户授权
        connect: ['search.tikuhai.com', 'api.deepseek.com', '*'],
        'run-at': 'document-start',
        // GreasyFork 要求声明：题库按次计费，需要用户自备卡密
        // 插件的 antifeature 类型不含 payment，走 $extra 原样输出
        $extra: [['antifeature', ['payment', '题库按次计费，需自备卡密']]],
      },
      build: {
        fileName: 'course-helper.user.js',
      },
    }),
  ],
})
