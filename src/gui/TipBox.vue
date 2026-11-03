<script setup lang="ts">
import { computed, watch } from 'vue'
import { colorAt, guiOpen, tip } from '@/gui/state'

// GUI 收起时说明跟着收
watch(guiOpen, (open) => {
  if (!open) tip.owner = null
})

const line = computed(() => `linear-gradient(90deg, ${colorAt(0)}, ${colorAt(4)}, ${colorAt(8)})`)
</script>

<template>
  <div v-if="tip.owner" class="tip" role="tooltip">
    <i class="tip-line" :style="{ background: line }" />
    <b class="tip-title" :style="{ color: colorAt(0) }">{{ tip.title }}</b>
    <span class="tip-text">{{ tip.text }}</span>
  </div>
</template>
