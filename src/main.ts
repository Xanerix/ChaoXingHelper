import { createApp } from 'vue'
import App from '@/App.vue'
import guiCss from '@/styles/gui.css?raw'
import { silenceDebugger } from '@/utils/cx-antidebug'
import { hidePageClutter } from '@/utils/cx-hide'

// 页面脚本一跑起来断点就开始反复触发，这行得排在最前面
silenceDebugger()

// 不依赖界面挂载，没任务的页面也要屏蔽
hidePageClutter()

const mount = () => {
  // 关在 closed shadow root 里，免得和宿主页面的样式互相污染
  const host = document.createElement('div')
  // 宿主自成一个层叠上下文并压在页面之上；界面元素都是 fixed 定位，宿主本身不占位
  host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000'
  document.body.append(host)
  const shadow = host.attachShadow({ mode: 'closed' })
  const container = document.createElement('div')
  shadow.appendChild(container)

  const sheet = new CSSStyleSheet()
  sheet.replaceSync(guiCss)
  shadow.adoptedStyleSheets = [sheet]

  createApp(App).mount(container)
}

const timer = setInterval(() => {
  if (document.readyState !== 'complete') return
  clearInterval(timer)
  mount()
}, 100)
