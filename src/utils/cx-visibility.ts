/** 装过的 window，别叠监听器 */
const guarded = new WeakSet<Window>()

const guard = (targetWindow: Window) => {
  if (guarded.has(targetWindow)) return
  guarded.add(targetWindow)

  try {
    targetWindow.addEventListener(
      'mouseout',
      (event) => {
        // 鼠标真的离开文档时 relatedTarget 才是 null，只掐这一种，别误伤控件条的 hover
        if (!event.relatedTarget) event.stopImmediatePropagation()
      },
      true,
    )
  } catch (error) {
    // 链上撞见跨域 window 就跳过，别把整条链带崩
    console.warn(error)
  }
}

/** 喂过活动信号的文档。按文档记而不是按 window：iframe 换页后 window 引用不变，文档是新的 */
const fed = new WeakSet<Document>()

/**
 * 播放器每次 `timeupdate` 之前先补一个 `mousemove`，让空闲计时永远到不了阈值。
 *
 * 超星的检查就挂在 videojs 的 `timeupdate` 上（`player.on('timeupdate', () => plugin.updateTime(...))`），
 * 这里挂 document 捕获阶段，早于 videojs 挂在 `<video>` 上的监听，同一次 `timeupdate` 里先清零、后检查。
 * 不用定时器是因为后台标签页隐藏 5 分钟后，串联定时器会被 Chrome 压到一分钟一次，
 * 阈值低于 60 秒就拦不住；`timeupdate` 由媒体管线驱动，不吃这个限流。
 *
 * 超星的监听器只记一个时间戳，不看 `isTrusted`，合成事件就够。派发在 documentElement 上，
 * 传不到播放器元素，不会把 videojs 的控件条唤出来。
 */
const feedActivity = (targetDocument: Document) => {
  if (fed.has(targetDocument)) return
  fed.add(targetDocument)

  targetDocument.addEventListener(
    'timeupdate',
    () => targetDocument.documentElement.dispatchEvent(new MouseEvent('mousemove', { bubbles: true })),
    true,
  )
}

/**
 * 让超星以为你一直盯着视频。离开检测有两条，都只在本地调 videojs 的 pause：
 *
 * 1. **鼠标离开**：ExtJS 收到 mouseout（`relatedTarget` 为 null）后暂停，栈是 `all-classes.js 的 k`
 *    → eval 出来的匿名 handler → `videojs-ext.min.js` → `video.min.js`。走不走那句 pause，
 *    由任务点的 `property.switchwindow`（喂给播放器的 `enableSwitchWindow`）决定。
 * 2. **鼠标空闲**（2026-10 版播放器新增）：播放中 `idleTimeoutSeconds` 秒内没有 `mousemove`
 *    也没有播放器事件，就暂停并在章节页弹 `popupUrl`。配置不在 `AttachmentSetting` 里，是播放器加载时
 *    另外请求 `AttachmentSetting.requestConfigUrl` 拿到的 `mouseMovementConfig`。见 `feedActivity`。
 *
 * `visibilitychange` / `document.hidden` 不参与，别再往回加：超星整条播放链上没有一处读它们
 * （`video/index.js`、`videojs-ext.min.js`、`all-classes.js` 的字符串表全部零命中），
 * 运行时把 `hidden` 改成 true 再派发 `visibilitychange`，也钓不出任何 pause 调用。
 *
 * **mouseout 必须整条 frame 链都装**：实测 handler 挂在 video iframe 的父窗口上，
 * 只装在播放器那一层完全没用——事件在父窗口就被处理掉了，压根传不下来。
 * 空闲检测则只需喂播放器这一层：它在每层 document 上都挂了同一个刷新函数，刷新任意一层都算数。
 *
 * 监听器挂 window 捕获阶段，这是传播的最早一站，同阶段里只输给注册得比我们还早的。
 */
export const keepWatching = (targetDocument: Document) => {
  feedActivity(targetDocument)

  let current: Window | null = targetDocument.defaultView
  while (current) {
    guard(current)
    if (current === current.parent) break
    current = current.parent
  }
}
