<script setup lang="ts">
import { Play, Square, RotateCcw, ExternalLink, FileText } from '@lucide/vue'
import { ago, type Lab, type Operation } from '~/composables/labs'

const props = defineProps<{ lab: Lab; operation: Operation | null; offline: boolean; now: number }>()
defineEmits<{ start: [Lab]; stop: [Lab] }>()

const busy = computed(() => props.operation?.state === 'running')
const failedLast = computed(() => props.lab.lastOperation && ['failed', 'timed-out'].includes(props.lab.lastOperation.state) ? props.lab.lastOperation : null)
const canStart = computed(() => ['stopped', 'unknown', 'failed'].includes(props.lab.status))
const canStop = computed(() => ['running', 'partial', 'unknown', 'failed'].includes(props.lab.status))
const why = computed(() => {
  if (props.offline) return 'The controller is offline.'
  if (busy.value && props.operation) {
    const verb = props.operation.action === 'up' ? 'starting' : 'stopping'
    return props.operation.lab === props.lab.id ? `This lab is ${verb}.` : `Wait: ${props.operation.lab} is ${verb}.`
  }
  return ''
})
const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')
const headingId = computed(() => `lab-${props.lab.id}`)
</script>

<template>
  <article class="lab vg-glass" :aria-labelledby="headingId" :data-lab="lab.id">
    <header class="lab__head">
      <div class="lab__names">
        <h3 :id="headingId" class="lab__title">{{ lab.name }}</h3>
        <p class="lab__meta">
          <code class="lab__prefix" :title="lab.prefixSource === 'portal' ? 'prefix from config/prefixes.json' : 'prefix from the lab\'s own notes'">{{ lab.prefix }}</code>
          <span v-if="lab.name !== lab.id" class="lab__dir">{{ lab.id }}</span>
          <span v-if="lab.prefixSource === 'portal'" class="lab__dir">prefix set by the portal</span>
        </p>
      </div>
      <StatusPill :status="lab.status" :stale="lab.stale" />
    </header>

    <p v-if="lab.description" class="lab__desc">{{ lab.description }}</p>

    <RackLights :running="lab.counts.running" :other="lab.counts.other" :unhealthy="lab.counts.unhealthy" />
    <p class="lab__seen">Checked {{ ago(lab.observedAt, now) }}</p>

    <p v-if="failedLast" class="lab__failure" role="note">
      make {{ failedLast.action }} {{ failedLast.state === 'timed-out' ? 'timed out' : `failed with exit code ${failedLast.exitCode ?? 'none'}` }}.
    </p>

    <ul v-if="lab.urls.length || lab.readme" class="lab__links">
      <li v-for="u in lab.urls" :key="u">
        <a :href="u" target="_blank" rel="noopener noreferrer"><ExternalLink :size="12" aria-hidden="true" />{{ host(u) }}<span class="sr-only"> (opens in a new tab)</span></a>
      </li>
      <li v-if="lab.readme">
        <a :href="`vscode://file${encodeURI(lab.readme)}`"><FileText :size="12" aria-hidden="true" />README<span class="sr-only"> for {{ lab.name }}, in VS Code</span></a>
      </li>
    </ul>

    <footer class="lab__actions">
      <button v-if="canStart" type="button" class="primary-button" :disabled="busy || offline" data-testid="start" @click="$emit('start', lab)">
        <component :is="failedLast?.action === 'up' ? RotateCcw : Play" :size="14" aria-hidden="true" />
        {{ failedLast?.action === 'up' ? 'Retry start' : 'Start lab' }}<span class="sr-only"> {{ lab.name }}</span>
      </button>
      <button v-if="canStop" type="button" class="secondary-button" :disabled="busy || offline" data-testid="stop" @click="$emit('stop', lab)">
        <component :is="failedLast?.action === 'down' ? RotateCcw : Square" :size="14" aria-hidden="true" />
        {{ failedLast?.action === 'down' ? 'Retry stop' : 'Stop lab' }}<span class="sr-only"> {{ lab.name }}</span>
      </button>
      <p v-if="why" class="lab__why">{{ why }}</p>
    </footer>
  </article>
</template>
