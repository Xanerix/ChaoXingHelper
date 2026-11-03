<script setup lang="ts">
import { computed } from 'vue'
import CategoryPanel from '@/gui/CategoryPanel.vue'
import { CATEGORIES } from '@/gui/modules'
import { guiOpen, reducedMotion } from '@/gui/state'
import { settings } from '@/settings'

const showDim = computed(() => guiOpen.value && (settings.gui.dim || settings.gui.blur))

const fade = (el: Element, done: () => void, keyframes: Keyframe[]) => {
  if (reducedMotion) return done()
  const animation = el.animate(keyframes, { duration: 210, fill: 'forwards' })
  animation.onfinish = () => {
    done()
    animation.cancel()
  }
}
const cancel = (el: Element) => el.getAnimations().forEach((animation) => animation.cancel())
</script>

<template>
  <Transition
    :css="false"
    @enter="(el, done) => fade(el, done, [{ opacity: 0 }, { opacity: 1 }])"
    @leave="(el, done) => fade(el, done, [{ opacity: 1 }, { opacity: 0 }])"
    @enter-cancelled="cancel"
    @leave-cancelled="cancel"
  >
    <div
      v-show="showDim"
      class="gui-dim"
      :class="{ blur: settings.gui.blur }"
      :style="{ background: settings.gui.dim ? undefined : 'transparent' }"
    />
  </Transition>
  <div class="gui" :class="{ open: guiOpen }">
    <CategoryPanel v-for="(category, index) in CATEGORIES" :key="category.id" :index="index" />
  </div>
</template>
