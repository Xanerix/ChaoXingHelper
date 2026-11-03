<script setup lang="ts">
import { computed, ref } from 'vue'
import { optionLabel, type SettingRef } from '@/gui/modules'
import { activeField, clamp, keyBinding, keyName, tipListeners } from '@/gui/state'
import type { NumField } from '@/settings/fields'

const props = defineProps<{ setting: SettingRef }>()

const field = computed(() => props.setting.field)
const value = computed({
  get: () => props.setting.values[props.setting.name],
  set: (next) => {
    props.setting.values[props.setting.name] = next
  },
})

const tipOn = computed(() => (props.setting.field.tip ? tipListeners(() => field.value.label, field.value.tip!) : {}))

/* 多选一：左键下一个，右键上一个 */
const stepChoice = (direction: number) => {
  if (field.value.kind !== 'choice') return
  const options = field.value.options
  const index = options.findIndex((option) => option.value === value.value)
  value.value = options[(index + direction + options.length) % options.length].value
}

/* 滑条 */
const track = ref<HTMLElement>()
const setNumber = (raw: number) => {
  const { min, max, step } = field.value as NumField
  const next = clamp(Math.round(raw / step) * step, min, max)
  if (next !== value.value) value.value = next
}
const fromPointer = (event: PointerEvent) => {
  const { min, max } = field.value as NumField
  const rect = track.value!.getBoundingClientRect()
  setNumber(min + clamp((event.clientX - rect.left) / rect.width, 0, 1) * (max - min))
}
const onTrackDown = (event: PointerEvent) => {
  track.value!.setPointerCapture(event.pointerId)
  activeField.value = field.value
  fromPointer(event)
  track.value!.onpointermove = fromPointer
}
// 松手、被取消都会丢掉 capture，统一在这里收尾
const onTrackRelease = () => {
  track.value!.onpointermove = null
  if (activeField.value === field.value) activeField.value = null
}
const onTrackKey = (event: KeyboardEvent) => {
  const { step } = field.value as NumField
  const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[event.key]
  if (delta === undefined) return
  event.preventDefault()
  setNumber((value.value as number) + delta)
}
const fillWidth = computed(() => {
  const { min, max } = field.value as NumField
  return `${(((value.value as number) - min) / (max - min)) * 100}%`
})

/* 快捷键 */
const waitingKey = ref(false)
const bindKey = () => {
  waitingKey.value = true
  keyBinding.value = (code) => {
    value.value = code
    waitingKey.value = false
  }
}

/* 文本框候选 */
const suggestions = ref<string[]>([])
const listId = `cxh-suggest-${props.setting.name}`
const loadSuggestions = async () => {
  if (props.setting.suggest) suggestions.value = await props.setting.suggest()
}
</script>

<template>
  <div class="set" v-on="tipOn">
    <button
      v-if="field.kind === 'bool'"
      type="button"
      role="switch"
      class="set-bool"
      :class="{ on: value }"
      :aria-checked="Boolean(value)"
      @click="value = !value"
    >
      <i class="box" />
      <span class="set-label">{{ field.label }}</span>
    </button>

    <template v-else-if="field.kind === 'choice' && setting.widget === 'color'">
      <span class="set-label">{{ field.label }}</span>
      <div class="swatches">
        <button
          v-for="option in field.options"
          :key="option.value"
          type="button"
          :style="{ background: option.value }"
          :aria-label="option.label"
          :aria-pressed="value === option.value"
          @click="value = option.value"
        />
      </div>
    </template>

    <button
      v-else-if="field.kind === 'choice'"
      type="button"
      class="set-mode"
      @click="stepChoice(1)"
      @contextmenu.prevent="stepChoice(-1)"
    >
      <span class="set-label">{{ field.label }}</span>
      <span class="set-val">{{ optionLabel(field, value) }}</span>
    </button>

    <template v-else-if="field.kind === 'num'">
      <div class="set-num-head">
        <span class="set-label">{{ field.label }}</span>
        <span class="set-val">{{ value }}{{ field.unit }}</span>
      </div>
      <div
        ref="track"
        class="track"
        tabindex="0"
        role="slider"
        :aria-label="field.label"
        :aria-valuemin="field.min"
        :aria-valuemax="field.max"
        :aria-valuenow="Number(value)"
        @pointerdown="onTrackDown"
        @lostpointercapture="onTrackRelease"
        @keydown="onTrackKey"
      >
        <i :style="{ width: fillWidth }" />
      </div>
    </template>

    <button v-else-if="setting.widget === 'key'" type="button" class="set-key" @click="bindKey">
      <span class="set-label">{{ field.label }}</span>
      <span class="set-val">[{{ waitingKey ? '按任意键' : keyName(String(value)) }}]</span>
    </button>

    <label v-else class="set-text">
      <span class="set-label">{{ field.label }}</span>
      <!-- 不用 type="password"：浏览器一见密码框就把它和上面的地址框当成登录表单拉起自动填充 -->
      <input
        :value="value"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :class="{ secret: field.secret }"
        :placeholder="field.placeholder"
        :list="setting.suggest ? listId : undefined"
        @input="value = ($event.target as HTMLInputElement).value.trim()"
        @focus="loadSuggestions"
        @keydown.stop
      />
      <datalist v-if="setting.suggest" :id="listId">
        <option v-for="item in suggestions" :key="item" :value="item" />
      </datalist>
    </label>
  </div>
</template>
