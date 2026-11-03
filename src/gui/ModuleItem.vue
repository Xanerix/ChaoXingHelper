<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AiTest from '@/gui/AiTest.vue'
import { slideHooks, sweep } from '@/gui/animate'
import { moduleName, type ModuleDef } from '@/gui/modules'
import SettingControl from '@/gui/SettingControl.vue'
import { colorAt, guiOpen, tipListeners } from '@/gui/state'
import { settings, ui } from '@/settings'

/** colorBase：跟随模式下这一行在色带上的位置 */
const props = defineProps<{ module: ModuleDef; colorBase: number }>()

const row = ref<HTMLElement>()
const on = computed(() => props.module.enabled.get())
const expanded = computed(() => ui.expanded.includes(props.module.id))
const hasSettings = props.module.settings.length > 0

// 别的标签页同步过来的开关变化也扫一下，和自己点的一样。
// 只在 GUI 前后都开着时扫：ClickGUI 这一行的开关就是 guiOpen，否则每次开关界面都会扫一遍
watch([on, guiOpen], ([value, open], [prev, wasOpen]) => {
  if (value !== prev && open && wasOpen && row.value) sweep(row.value, value)
})

const toggleExpanded = () => {
  if (!hasSettings) return
  const id = props.module.id
  ui.expanded = expanded.value ? ui.expanded.filter((item) => item !== id) : [...ui.expanded, id]
}

/** 跟随模式：开启的模块取功能列表的流动色；只在 GUI 打开时读 now，关着不每帧重渲染 */
const followColor = computed(() => (settings.gui.follow && on.value && guiOpen.value ? colorAt(props.colorBase) : ''))
const rowStyle = computed(() =>
  followColor.value && settings.gui.highlight === 'fill'
    ? { background: `color-mix(in srgb, ${followColor.value} 15%, transparent)` }
    : {},
)

const tipOn = tipListeners(() => moduleName(props.module), props.module.desc)
</script>

<template>
  <div class="mod" :class="{ on, open: expanded }">
    <div ref="row" class="mod-row" :style="rowStyle" v-on="tipOn" @contextmenu.prevent="toggleExpanded">
      <button
        type="button"
        class="mod-toggle"
        :aria-pressed="on"
        :style="{ color: followColor || undefined }"
        @click="module.enabled.set(!on)"
      >
        {{ moduleName(module) }}
      </button>
      <button
        v-if="hasSettings"
        type="button"
        class="mod-more"
        aria-label="展开设置"
        :aria-expanded="expanded"
        @click="toggleExpanded"
      >
        ›
      </button>
    </div>
    <Transition :css="false" v-bind="slideHooks">
      <div v-if="hasSettings" v-show="expanded" class="mod-set">
        <SettingControl v-for="item in module.settings" :key="item.name" :setting="item" />
        <AiTest v-if="module.id === 'OpenAI'" />
      </div>
    </Transition>
  </div>
</template>
