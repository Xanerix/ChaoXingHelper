<script setup lang="ts">
import { ref } from 'vue'
import { askAi } from '@/api/ai'
import { settings } from '@/settings'

const testing = ref(false)
const result = ref<{ color: string; text: string } | null>(null)

/** 拿一道答案确定的单选题走一遍完整链路：请求、JSON 解析、字母映射回选项都覆盖到 */
const test = async () => {
  testing.value = true
  result.value = { color: 'var(--ui-dim)', text: '测试中…' }
  // 测的是输入框里的当前值，不是答题流程手里的快照
  const answer = await askAi(
    { element: document.body, type: '0', title: '1 + 1 = ?', optionsText: ['1', '2', '3', '4'], options: {}, answer: [] },
    settings.ai,
  )
  testing.value = false
  if (!answer.ok) {
    result.value = { color: 'var(--bad)', text: answer.message }
  } else if (answer.answer.join() === '2') {
    result.value = { color: 'var(--ok)', text: '连通正常，答案解析正确' }
  } else {
    result.value = { color: 'var(--warn)', text: `连通了，但答案是「${answer.answer.join()}」，这个模型不太可靠` }
  }
}
</script>

<template>
  <div class="set">
    <button type="button" class="set-btn" :disabled="testing" @click="test">测试连接</button>
    <div v-if="result" class="set-out" :style="{ color: result.color }">{{ result.text }}</div>
  </div>
</template>
