import { useCxChapterLogic } from '@/platforms/cx/chapter'
import { useCxExamLogic } from '@/platforms/cx/exam'
import { useCxWorkLogic } from '@/platforms/cx/work'
import { trackAnswerSnapshot } from '@/settings'
import { useLogStore } from '@/stores/log'

/** label 显示在水印上 */
const routes: { keyword: string; label: string; run: () => void }[] = [
  { keyword: '/mycourse/studentstudy', label: '章节', run: useCxChapterLogic },
  { keyword: '/mooc2/work/dowork', label: '作业', run: () => void useCxWorkLogic() },
  // 别放宽成 /exam-ans/exam，会连考试须知页 examnotes、查看页 look 一起匹配
  { keyword: '/exam-ans/exam/test/reVersionTestStartNew', label: '考试', run: () => void useCxExamLogic() },
  { keyword: '/exam-ans/mooc2/exam/preview', label: '整卷预览', run: () => void useCxExamLogic(true) },
  {
    keyword: 'mycourse/stu?courseid',
    label: '课程',
    run: () => useLogStore().addLog('该页面无任务，请进入章节或答题页面使用', 'danger'),
  },
]

/** @returns 这个页面上脚本能做的事的名字，没有就是 null（决定界面显不显示） */
export const platformTask = (url: string) => routes.find((item) => url.includes(item.keyword))?.label ?? null

export const runPlatformLogic = (url: string) => {
  const route = routes.find((item) => url.includes(item.keyword))
  if (!route) return false
  trackAnswerSnapshot()
  route.run()
  return true
}
