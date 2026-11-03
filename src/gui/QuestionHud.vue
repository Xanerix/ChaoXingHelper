<script setup lang="ts">
import { computed } from 'vue'
import HudWindow from '@/gui/HudWindow.vue'
import { isEnglish } from '@/gui/state'
import { settings } from '@/settings'
import { type AnswerSource, useQuestionStore } from '@/stores/question'

const questionStore = useQuestionStore()

/** Question.type 是超星题型编号，见 base-handler 的 QUESTION_TYPE */
const TYPE_LABEL: Record<string, string> = {
  '0': '单选',
  '1': '多选',
  '2': '填空',
  '3': '判断',
  '4': '简答',
  '5': '名词',
  '6': '论述',
  '7': '计算',
}

const SOURCE_LABEL: Record<AnswerSource, string> = { tiku: '题库', tikuAi: '题库AI', ai: 'AI', miss: '未命中' }

const fallback = () => ({ x: Math.max(16, innerWidth - 316), y: 300 })
const counted = computed(() => questionStore.questionList.filter((item) => item.counted).length)
</script>

<template>
  <HudWindow
    id="QuestionHUD"
    :title="isEnglish ? 'QuestionHUD' : '答题面板'"
    :fallback="fallback"
    @close="settings.hud.questionHud = false"
  >
    <div class="win-body">
      <table v-if="questionStore.questionList.length" class="qt">
        <tbody>
          <tr v-for="(item, index) in questionStore.questionList" :key="index" :class="{ miss: item.source === 'miss' }">
            <td>{{ index + 1 }}</td>
            <td>{{ TYPE_LABEL[item.question.type] ?? '其他' }}</td>
            <!-- 答案可能是图片选项，也可能是搜题失败时带充值链接的原因 -->
            <td class="q-ans" v-html="item.question.answer.join('、')" />
            <td>
              <span class="chip" :class="item.source">{{ SOURCE_LABEL[item.source] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="win-empty">该页面还没有答题</div>
    </div>
    <div class="win-foot">
      <span>已答 {{ questionStore.questionList.length }}/{{ questionStore.total }}</span>
      <span>计入正确率 {{ counted }} 题</span>
    </div>
  </HudWindow>
</template>
