<script setup lang="ts">
// Colour, icon and word together (D15): status never rides on colour alone.
import { CircleCheck, CircleStop, LoaderCircle, TriangleAlert, CircleX, CircleHelp, Clock } from '@lucide/vue'
import { STATUS, type Status } from '~/composables/labs'

const props = defineProps<{ status: Status; stale?: boolean }>()
const ICONS = { running: CircleCheck, stopped: CircleStop, starting: LoaderCircle, stopping: LoaderCircle, partial: TriangleAlert, failed: CircleX, unknown: CircleHelp }
const meta = computed(() => STATUS[props.status])
</script>

<template>
  <span class="status-group">
    <span class="lix-pill" :class="`lix-pill--${meta.tone}`" data-testid="status">
      <component :is="ICONS[status]" :size="13" aria-hidden="true" :class="{ spin: meta.tone === 'busy' }" />
      {{ meta.word }}
    </span>
    <span v-if="stale" class="lix-pill lix-pill--warn" data-testid="stale">
      <Clock :size="13" aria-hidden="true" /> Stale
    </span>
  </span>
</template>
