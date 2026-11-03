<script setup lang="ts">
import { computed, ref } from 'vue'
import { EASE_IN, EASE_OUT, slideHooks } from '@/gui/animate'
import { useDrag } from '@/gui/drag'
import ModuleItem from '@/gui/ModuleItem.vue'
import { CATEGORIES, MODULES } from '@/gui/modules'
import { colorAt, guiOpen, isEnglish, reducedMotion, useLayer } from '@/gui/state'
import { settings, ui } from '@/settings'

const props = defineProps<{ index: number }>()

const category = CATEGORIES[props.index]
const modules = MODULES.filter((module) => module.cat === category.id)
const layerKey = `cat-${category.id}`

const panel = ref<HTMLElement>()
const { zIndex, raise } = useLayer(layerKey)
const { dragging, position, onPointerDown } = useDrag(layerKey, panel, () => ({
  x: 16 + props.index * (settings.gui.panelWidth + 12),
  y: 58,
}))

const collapsed = computed(() => ui.collapsed.includes(category.id))
const toggleCollapsed = () => {
  ui.collapsed = collapsed.value ? ui.collapsed.filter((id) => id !== category.id) : [...ui.collapsed, category.id]
}

/** 跟随模式下标题栏也取流动色，否则用主色 */
const headStyle = computed(() => {
  const color = settings.gui.follow && guiOpen.value ? colorAt(props.index * 3) : settings.arraylist.accent
  return settings.gui.style === 'header'
    ? { background: `color-mix(in srgb, ${color} 80%, #000)` }
    : { borderTopColor: color }
})

/* 打开：面板从左到右依次落下；关闭：从右到左依次收起 */
const onEnter = (el: Element, done: () => void) => {
  if (reducedMotion) return done()
  el.animate([{ opacity: 0, transform: 'translateY(-12px) scale(.96)' }, { opacity: 1, transform: 'none' }], {
    duration: 240,
    delay: props.index * 45,
    easing: EASE_OUT,
    fill: 'backwards',
  }).onfinish = done
}
const onLeave = (el: Element, done: () => void) => {
  if (reducedMotion) return done()
  const animation = el.animate(
    [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.96)' }],
    { duration: 150, delay: (CATEGORIES.length - 1 - props.index) * 30, easing: EASE_IN, fill: 'forwards' },
  )
  // 先让 Vue 藏起来再撤掉 forwards 的终态，不然下次打开时透明度还停在 0
  animation.onfinish = () => {
    done()
    animation.cancel()
  }
}
const cancel = (el: Element) => el.getAnimations().forEach((animation) => animation.cancel())
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave" @enter-cancelled="cancel" @leave-cancelled="cancel">
    <section
      v-show="guiOpen"
      ref="panel"
      class="panel"
      :class="{ dragging }"
      :style="{ ...position, zIndex }"
      @pointerdown.capture="raise"
    >
      <div class="p-head" :style="headStyle" @pointerdown="onPointerDown" @contextmenu.prevent="toggleCollapsed">
        <span class="p-title">{{ isEnglish ? category.en : category.zh }}</span>
        <button type="button" class="p-fold" aria-label="折叠面板" @click="toggleCollapsed">
          {{ collapsed ? '+' : '−' }}
        </button>
      </div>
      <Transition :css="false" v-bind="slideHooks">
        <div v-show="!collapsed" class="p-body">
          <ModuleItem
            v-for="(module, i) in modules"
            :key="module.id"
            :module="module"
            :color-base="index * 3 + i + 1"
          />
        </div>
      </Transition>
    </section>
  </Transition>
</template>
