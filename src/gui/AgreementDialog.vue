<script setup lang="ts">
import { keyName } from '@/gui/state'
import { AGREEMENT_VERSION, consent, settings } from '@/settings'
</script>

<template>
  <div class="gui-dim" />
  <section class="win agreement" role="dialog" aria-modal="true" aria-labelledby="cxh-agreement-title">
    <div class="p-head">
      <span id="cxh-agreement-title" class="p-title">用户协议</span>
    </div>
    <div class="win-body agreement-body">
      <p>1、本脚本仅供学习研究使用，请在24小时内删除；使用时须遵守法律法规及学术诚信要求，由此产生的一切后果由用户自行承担，开发者不承担任何责任。</p>
      <p>2、如使用中有任何疑问，建议立即停止使用并删除脚本；本声明最终解释权归脚本开发者所有。</p>
      <p class="agreement-hint">
        同意后脚本开始运行。按 {{ keyName(settings.gui.key) }} 打开设置界面，悬停在功能上会在左下角显示说明。
      </p>
      <button type="button" class="set-btn" @click="consent.acceptedVersion = AGREEMENT_VERSION">我已阅读并同意</button>
    </div>
  </section>
</template>
