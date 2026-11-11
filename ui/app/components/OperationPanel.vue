<script setup lang="ts">
// The running or last operation: what make printed (redacted by the
// controller, D12), how long it took, and how it ended.
import { CircleCheck, CircleX, LoaderCircle, RotateCcw } from '@lucide/vue'
import { seconds, type Operation } from '~/composables/labs'

const props = defineProps<{ operation: Operation; now: number }>()
const emit = defineEmits<{ retry: [Operation]; dismiss: [] }>()
const log = ref<HTMLElement | null>(null)
const follow = ref(true)

const running = computed(() => props.operation.state === 'running')
const elapsed = computed(() => (running.value ? props.now - props.operation.startedAt : props.operation.durationMs))
const title = computed(() => {
  const o = props.operation
  const verb = o.action === 'up' ? 'Start' : 'Stop'
  if (o.state === 'running') return `${verb} of ${o.lab} is running`
  if (o.state === 'succeeded') return `${verb} of ${o.lab} finished`
  if (o.state === 'timed-out') return `${verb} of ${o.lab} timed out`
  return `${verb} of ${o.lab} failed (exit code ${o.exitCode ?? 'none'})`
})

function onScroll() {
  const el = log.value
  if (el) follow.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}
watch(() => props.operation.lines?.length, async () => {
  await nextTick()
  if (follow.value && log.value) log.value.scrollTop = log.value.scrollHeight
})
</script>

<template>
  <section class="op vg-glass" aria-labelledby="op-title" data-testid="operation">
    <header class="op__head">
      <component :is="running ? LoaderCircle : operation.state === 'succeeded' ? CircleCheck : CircleX" :size="18" aria-hidden="true" :class="['op__icon', `op__icon--${operation.state}`, { spin: running }]" />
      <h2 id="op-title" class="op__title">{{ title }}</h2>
      <span class="op__time">{{ seconds(elapsed) }}</span>
    </header>
    <p class="op__cmd"><code>make -C {{ operation.lab }} {{ operation.action }} RUNTIME=podman</code></p>
    <pre ref="log" class="op__log" tabindex="0" aria-label="Output of make, secrets redacted" @scroll="onScroll">{{ (operation.lines ?? []).join('\n') || (running ? 'Waiting for output…' : 'make printed nothing.') }}</pre>
    <footer v-if="!running" class="op__actions">
      <button v-if="operation.state !== 'succeeded'" type="button" class="primary-button" @click="emit('retry', operation)">
        <RotateCcw :size="14" aria-hidden="true" /> Retry {{ operation.action === 'up' ? 'start' : 'stop' }}
      </button>
      <button type="button" class="secondary-button" @click="emit('dismiss')">Hide output</button>
    </footer>
  </section>
</template>
