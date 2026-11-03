import { unsafeWindow } from '$'
import { CxQuestionHandler } from '@/platforms/cx/handler'
import { answerVideoQuiz, findVideoQuiz } from '@/platforms/cx/video-quiz'
import { settings } from '@/settings'
import { useLogStore } from '@/stores/log'
import { collectNestedIframes, sleep } from '@/utils/common'
import { decryptCxFont } from '@/utils/cx-font'
import { keepWatching } from '@/utils/cx-visibility'
import type { CxTaskWindow, CxTopWindow } from '@/types/page'

const DOC_TYPES = ['ppt', 'doc', 'pptx', 'docx', 'pdf']
/** 点了提交到点确认之间等超星弹出确认框，秒。原先是答题间隔的一半，按默认 3 秒取值 */
const SUBMIT_CONFIRM_DELAY = 1.5
/** 人脸采集弹窗还挂着时的重查间隔，秒 */
const FACE_POLL_DELAY = 3
/** 等媒体元素出现的轮询间隔，毫秒 */
const MEDIA_POLL_INTERVAL = 2500
/**
 * 轮询上限，到了就放过这个任务点。
 * 必须有这个上限：卡在这儿不只是这一个任务点不动，`watchIframe` 的循环是串行的，
 * 后面的任务点和翻章节会跟着一起冻住，而且一条日志都不会出。
 * 现成的引爆点是视频 iframe 里那个 `#mindmap`——src 同样带 `video`，文档里却没有 `<video>`，
 * 眼下只靠 `.ans-job-icon` 那道判断挡着。
 */
const MEDIA_POLL_LIMIT = 24

/**
 * 章节学习页：把页面里每个任务点（视频/音频/文档/电子书/作业）按顺序做完，
 * 再跳下一章节。任务点都活在层层嵌套的 iframe 里。
 */
export const useCxChapterLogic = () => {
  const logStore = useLogStore()

  const init = () => {
    const currentUrl = window.location.href
    // 旧版页面结构不一样，强制切到新版
    if (!currentUrl.includes('&mooc2=1')) {
      window.location.href = `${currentUrl}&mooc2=1`
    }
    logStore.addLog('检测到用户进入到章节学习页面', 'primary')
    logStore.addLog('正在解析任务点，请稍等5-10秒（如果长时间没有反应，请刷新页面）', 'warning')
  }

  const waitIframeLoad = (iframe: HTMLIFrameElement) =>
    new Promise<void>((resolve) => {
      const intervalId = setInterval(() => {
        if (iframe.contentDocument?.readyState === 'complete') {
          clearInterval(intervalId)
          resolve()
        }
      }, 500)
    })

  const processMedia = (mediaType: 'video' | 'audio', iframeDocument: Document) =>
    new Promise<void>((resolve) => {
      logStore.addLog(`发现一个${mediaType}，正在解析`, 'warning')
      logStore.addLog(`正在尝试播放${mediaType}，请稍等5s`, 'primary')

      // 先断掉超星的离开检测，下面那个 pause 监听只当兜底
      if (settings.course.blockLeaveDetect) keepWatching(iframeDocument)

      let tries = 0
      const intervalId = setInterval(async () => {
        const mediaElement = iframeDocument.documentElement.querySelector(mediaType)
        if (!mediaElement) {
          if (++tries < MEDIA_POLL_LIMIT) return
          clearInterval(intervalId)
          const waited = (MEDIA_POLL_INTERVAL * MEDIA_POLL_LIMIT) / 1000
          logStore.addLog(`等了${waited}秒没等到${mediaType}，跳过这个任务点`, 'danger')
          resolve()
          return
        }
        clearInterval(intervalId)

        mediaElement.pause()
        // 用音量 0 代替静音：Chrome 会在标签页隐藏的那一刻暂停静音的媒体（实测没有任何 JS 调用 pause），
        // 不静音、音量 0 的则照常放。但不静音就要过自动播放策略，页面没拿到用户激活时 play() 会被拒，
        // 那就退回静音——每次切后台会被停一下，靠下面的 pause 监听续上
        mediaElement.volume = 0
        mediaElement.muted = false
        try {
          await mediaElement.play()
        } catch {
          logStore.addLog('浏览器不允许有声自动播放，改为静音播放，切到后台时会被短暂暂停', 'warning')
          mediaElement.muted = true
          await mediaElement.play()
        }
        logStore.addLog('播放成功', 'success')

        // 被暂停就重新播：静音退路下切后台的浏览器暂停、超星的离开检测漏网、互动答题都走这里
        let handlingQuiz = false
        const resume = async () => {
          await sleep(settings.course.resumeDelay)
          // 互动答题也是靠暂停视频来拦人，闷头 play() 只会把题目推过去。
          // 但答题不管出什么岔子都不许挡住下面那行 play()，续播是刷课的保底行为。
          const quiz = handlingQuiz ? null : findVideoQuiz(iframeDocument)
          if (quiz) {
            handlingQuiz = true
            try {
              await answerVideoQuiz(quiz)
            } catch (error) {
              logStore.addLog('弹题处理失败，直接继续播放', 'danger')
              console.error(error)
            } finally {
              handlingQuiz = false
            }
          }
          await mediaElement.play()
        }
        mediaElement.addEventListener('pause', resume)
        mediaElement.addEventListener('ended', () => {
          logStore.addLog(`${mediaType}已播放完成`, 'success')
          mediaElement.removeEventListener('pause', resume)
          resolve()
        })
      }, MEDIA_POLL_INTERVAL)
    })

  const processWork = async (
    iframe: HTMLIFrameElement,
    iframeDocument: Document,
    iframeWindow: CxTaskWindow,
  ) => {
    logStore.addLog('发现一个作业，正在解析', 'warning')

    const text = iframeDocument.documentElement.innerText
    if (text.includes('已完成') || text.includes('待批阅')) {
      logStore.addLog('作业已经完成，跳过', 'success')
      return
    }

    decryptCxFont(iframeDocument)
    logStore.addLog('题目列表获取成功', 'primary')
    const correctRate = await new CxQuestionHandler('zj', iframe).init()

    // 提交后超星会弹窗，挡住后续流程
    iframeWindow.alert = () => {}

    const { autoSubmitWork, threshold } = settings.submit

    if (!autoSubmitWork) {
      logStore.addLog('未开启自动提交，暂存', 'primary')
      await iframeWindow.noSubmit()
    } else {
      logStore.addLog('自动提交已开启，尝试提交', 'primary')
      if (correctRate < threshold) {
        logStore.addLog(`正确率小于${threshold}%，暂存`, 'danger')
        await iframeWindow.noSubmit()
      } else {
        logStore.addLog(`正确率大于${threshold}%，提交`, 'success')
        await iframeWindow.btnBlueSubmit()
        await sleep(SUBMIT_CONFIRM_DELAY)
        await iframeWindow.submitCheckTimes()
        logStore.addLog('提交成功', 'success')
      }
    }
    logStore.addLog('作业已完成', 'success')
  }

  const processPpt = async (iframeWindow: CxTaskWindow) => {
    const panView = iframeWindow.document.querySelector<HTMLIFrameElement>('#panView')
    const pptWindow = panView?.contentWindow
    if (!pptWindow) return
    logStore.addLog('发现一个PPT，正在解析', 'warning')
    pptWindow.scrollTo({ top: pptWindow.document.body.scrollHeight, behavior: 'smooth' })
    logStore.addLog('阅读完成', 'success')
  }

  const processBook = async (iframeWindow: CxTaskWindow) => {
    logStore.addLog('发现一个电子书，正在解析', 'warning')
    // 直接跳到最后一页，超星就认为读完了
    ;(unsafeWindow.top as CxTopWindow | null)?.onchangepage?.(iframeWindow.getFrameAttr('end'))
    logStore.addLog('阅读完成', 'success')
  }

  const processIframe = async (iframe: HTMLIFrameElement) => {
    const iframeSrc = iframe.src
    if (iframeSrc.includes('javascript:')) return
    // 跨域的先挡在这儿，`waitIframeLoad` 读不到 readyState 会一直轮询下去
    if (!iframe.contentDocument) return

    await waitIframeLoad(iframe)

    // 引用只能在 await 之后取：等待期间 iframe 要是换过文档，
    // 之前那份 contentDocument 指的就是已经被丢掉的空文档了
    const iframeDocument = iframe.contentDocument
    const iframeWindow = iframe.contentWindow as CxTaskWindow | null
    if (!iframeDocument || !iframeWindow) return

    if (iframe.parentElement?.className.includes('ans-job-finished')) {
      logStore.addLog('发现一个已完成任务点', 'success')
      return
    }

    if (iframeSrc.includes('api/work')) {
      // 轮到时关着就跳过，之后再打开也不回头做，免得卡住后面的任务点
      if (!settings.answer.enabled) {
        logStore.addLog('自动答题已关闭，跳过本次作业', 'primary')
        return
      }
      return processWork(iframe, iframeDocument, iframeWindow)
    }

    // 没有任务点图标说明这个 iframe 不计入进度，不用管
    if (!iframe.parentElement?.querySelector('.ans-job-icon')) return

    if (!settings.course.autoPlay) {
      logStore.addLog('自动刷课已关闭，跳过非作业任务点', 'primary')
      return
    }

    if (iframeSrc.includes('video')) return processMedia('video', iframeDocument)
    if (iframeSrc.includes('audio')) return processMedia('audio', iframeDocument)
    if (DOC_TYPES.some((type) => iframeSrc.includes(`modules/${type}`))) return processPpt(iframeWindow)
    if (iframeSrc.includes('modules/innerbook')) return processBook(iframeWindow)
  }

  /**
   * 页面上三个「下一节」都走 `PCount.next(count, chapterId, courseId, clazzid, knowledgestr, checkType)`，
   * 差别只在最后那个 `checkType`：
   *
   * - 可见的 `#prevNextFocusNext` 传 `true`，还有任务点没做完时它只 `showCheckDiv(true)` 弹确认框就 return，不翻页；
   * - 确认框里那个 `a.nextChapter`（平时 `display: none`）不传，绕过 `checkJob()` 直接翻。
   *
   * 所以这里是**拿可见的那个当探针、点隐藏的那个去翻页**，别为了「统一」改成同一个元素——
   * 点可见的会卡在确认弹窗上。对隐藏元素 `click()` 触发的是 inline onclick，照样生效。
   *
   * 还有一处管不着：`PCount.next` 第一行是 `if (checkUnsave()) return`，
   * 有没保存的作答时它什么都不做，外面看不出来，所以下面那条日志只能说「正前往」。
   */
  const goNextChapter = async () => {
    if (!settings.course.autoNextChapter) {
      logStore.addLog('自动下一章已关闭', 'danger')
      return
    }
    const nextBtn = document.querySelector<HTMLElement>('#prevNextFocusNext')
    if (!nextBtn || nextBtn.style.display === 'none') {
      logStore.addLog('已经到达最后一章节，无法跳转', 'danger')
      return
    }
    await sleep(settings.course.nextDelay)
    logStore.addLog('正前往下一章节', 'success')
    document.querySelector<HTMLElement>('.jb_btn.jb_btn_92.fr.fs14.nextChapter')?.click()
  }

  // 换章节会重新触发扫描，只有最后一次扫描有资格翻页
  let currentWatchTaskId = 0
  const watchIframe = async (documentElement: HTMLElement) => {
    const taskId = ++currentWatchTaskId
    for (const iframe of collectNestedIframes(documentElement)) {
      await processIframe(iframe)
    }
    if (taskId !== currentWatchTaskId) return
    logStore.addLog('本页任务点已全部完成', 'success')
    await goNextChapter()
  }

  /**
   * 没采过人脸的课程，章节页只渲染一层扫码弹窗，任务点 iframe 一个都不加载。
   * `.maskDiv` 是全站通用的弹层壳子（一页上躺着七八个隐藏的），
   * 认弹窗里那组 `fc*` 隐藏域才唯一；壳子平时也在 DOM 里，所以还得看高度。
   */
  const isFacePopVisible = () => {
    const mask = document.querySelector('#fccourseId')?.closest<HTMLElement>('.maskDiv')
    return !!mask && mask.getBoundingClientRect().height > 0
  }

  /**
   * 挡着就停在这儿等用户去学习通里采。撤掉弹窗的是超星前端自己，
   * 撤完才开始渲染任务点——与其猜它渲染到哪一步，不如直接刷新，
   * 刷新后就是一张正常章节页，走原来的流程。
   * 点关闭按钮走的是 `goback()`，页面连同这个循环一起跳走，不用管。
   */
  const waitFaceCollect = async () => {
    if (!isFacePopVisible()) return false
    logStore.addLog('页面要求先采集人脸信息，自动流程已暂停', 'danger')
    logStore.addLog('请用学习通APP扫描页面上的二维码，采集完成后会自动继续', 'warning')
    while (isFacePopVisible()) await sleep(FACE_POLL_DELAY)
    logStore.addLog('人脸采集已完成，正在刷新页面', 'success')
    window.location.reload()
    return true
  }

  const processIframeTask = async () => {
    // 弹窗挡着的时候页面上没有任何任务点，这一轮扫下去只会误报「本页任务点已全部完成」
    if (await waitFaceCollect()) return

    const documentElement = document.documentElement
    const iframe = documentElement.querySelector('iframe')
    if (!iframe) {
      console.warn('No iframe found.')
      return
    }
    void watchIframe(documentElement)
    iframe.addEventListener('load', () => void watchIframe(documentElement))
  }

  // 章节切换是前端路由，没有 load 事件，只能轮询 URL
  const setupUrlWatcher = () => {
    let currentUrl = window.location.href
    setInterval(() => {
      if (currentUrl === window.location.href) return
      currentUrl = window.location.href
      void processIframeTask()
    }, 2000)
  }

  init()
  void processIframeTask()
  setupUrlWatcher()
}
