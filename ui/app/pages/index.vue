<script setup lang="ts">
// The one page: the lab index (prompt 02). Reads /api/labs, polls gently,
// and turns two buttons per lab into make up / make down on the host.
import { RefreshCw, Plug, Unplug, Search } from '@lucide/vue'
import { ago, callApi, needsAttention, seconds, type Lab, type LabsAnswer, type Operation } from '~/composables/labs'

const route = useRoute()
const router = useRouter()
const data = ref<LabsAnswer | null>(null)
const offline = ref(false)
const fetchedAt = ref<number | null>(null)
const refreshing = ref(false)
const notice = ref('')
const announce = ref('')
const stopping = ref<Lab | null>(null)
const hideOp = ref<number | null>(null)
const now = ref(Date.now())

const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const FILTERS = [['all', 'All labs'], ['running', 'Running'], ['stopped', 'Stopped'], ['attention', 'Needs a look'], ['busy', 'Starting or stopping']] as const
type Filter = (typeof FILTERS)[number][0]
const isFilter = (v: unknown): v is Filter => FILTERS.some(([k]) => k === v)
const filter = ref<Filter>(isFilter(route.query.status) ? route.query.status : 'all')
watch([q, filter], () => {
  router.replace({ query: { ...(q.value ? { q: q.value } : {}), ...(filter.value !== 'all' ? { status: filter.value } : {}) } })
})

// Offline: the last answer stays on screen, but every lab is marked stale.
const labs = computed(() => (data.value?.labs ?? []).map((l) => (offline.value ? { ...l, stale: true } : l)))
const op = computed<Operation | null>(() => data.value?.operation ?? null)
const opRunning = computed(() => op.value?.state === 'running')
const counts = computed(() => ({
  running: labs.value.filter((l) => l.status === 'running' && !l.stale).length,
  stopped: labs.value.filter((l) => l.status === 'stopped' && !l.stale).length,
  attention: labs.value.filter(needsAttention).length,
}))
const shown = computed(() => {
  const term = q.value.trim().toLowerCase()
  return labs.value.filter((l) => {
    if (term && !`${l.name} ${l.id} ${l.prefix}`.toLowerCase().includes(term)) return false
    if (filter.value === 'running') return l.status === 'running'
    if (filter.value === 'stopped') return l.status === 'stopped'
    if (filter.value === 'attention') return needsAttention(l)
    if (filter.value === 'busy') return ['starting', 'stopping'].includes(l.status)
    return true
  })
})

let lastOpState = ''
function noteOperation(o: Operation | null) {
  if (!o) return
  const key = `${o.id}:${o.state}`
  if (key === lastOpState) return
  const first = lastOpState === ''
  lastOpState = key
  if (first && o.state !== 'running') return
  const verb = o.action === 'up' ? 'Start' : 'Stop'
  announce.value = o.state === 'running' ? `${verb} of ${o.lab} began.`
    : o.state === 'succeeded' ? `${verb} of ${o.lab} finished.`
    : `${verb} of ${o.lab} ${o.state === 'timed-out' ? 'timed out' : `failed with exit code ${o.exitCode ?? 'none'}`}.`
}

async function load(path: 'labs' | 'refresh' = 'labs') {
  try {
    const { status, body } = await callApi<LabsAnswer>(path, path === 'refresh' ? 'POST' : 'GET')
    if (status !== 200) { offline.value = status === 503; if (status !== 503) notice.value = body.message ?? 'The controller refused the request.'; return }
    data.value = body
    offline.value = false
    fetchedAt.value = Date.now()
    noteOperation(body.operation)
  } catch {
    offline.value = true
  }
}

async function refresh() {
  refreshing.value = true
  await load('refresh')
  refreshing.value = false
}

async function act(lab: Lab | string, action: 'up' | 'down') {
  const id = typeof lab === 'string' ? lab : lab.id
  notice.value = ''
  hideOp.value = null
  const { status, body } = await callApi<{ operation: Operation }>(`labs/${encodeURIComponent(id)}/${action}`, 'POST')
  if (status === 409) notice.value = `${body.operation?.lab ?? 'Another lab'} is still ${body.operation?.action === 'down' ? 'stopping' : 'starting'}; try again when it ends.`
  else if (status === 404) notice.value = `${id} is no longer an eligible lab. Refresh to see why.`
  else if (status === 503) offline.value = true
  else if (status !== 202) notice.value = body.message ?? 'The request was refused.'
  await load()
}

function confirmStop(lab: Lab) {
  stopping.value = null
  act(lab, 'down')
}

let timer: ReturnType<typeof setTimeout> | undefined
let tick: ReturnType<typeof setInterval> | undefined
function schedule() {
  clearTimeout(timer)
  const every = opRunning.value ? 2000 : (data.value?.refreshS ?? 15) * 1000
  timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') await load()
    schedule()
  }, every)
}
watch(opRunning, (r, was) => { if (was && !r) refresh(); schedule() })
function onVisible() { if (document.visibilityState === 'visible') { load(); schedule() } }

onMounted(async () => {
  await load()
  schedule()
  tick = setInterval(() => { now.value = Date.now() }, 1000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => { clearTimeout(timer); clearInterval(tick); document.removeEventListener('visibilitychange', onVisible) })
</script>

<template>
  <div class="page">
    <a class="skip-link" href="#labs">Skip to the labs</a>
    <header class="topbar">
      <div class="brand">
        <img src="/favicon.svg" alt="" width="26" height="26">
        <span class="brand__name">Lab Index</span>
      </div>
      <div class="topbar__right">
        <span class="conn" :class="offline ? 'conn--down' : data ? 'conn--up' : 'conn--wait'" data-testid="controller">
          <component :is="offline ? Unplug : Plug" :size="14" aria-hidden="true" />
          {{ offline ? 'Controller offline' : data ? 'Controller connected' : 'Connecting' }}
        </span>
        <span class="topbar__seen">Updated {{ ago(fetchedAt, now) }}</span>
        <button type="button" class="secondary-button" :disabled="refreshing" @click="refresh">
          <RefreshCw :size="14" aria-hidden="true" :class="{ spin: refreshing }" /> Refresh
        </button>
      </div>
    </header>

    <main class="main">
      <section class="vg-hero hero" aria-labelledby="hero-title">
        <div class="hero__text">
          <h1 id="hero-title" class="hero__title">The labs next door</h1>
          <p class="hero__sub">
            {{ labs.length }} Podman labs in <code>HashiCorp/Vault</code>, each started and stopped by its own
            <code>make up</code> and <code>make down</code>.
          </p>
          <p v-if="op && opRunning" class="hero__op" data-testid="hero-op">
            <span class="vg-live-dot" aria-hidden="true" />
            {{ op.action === 'up' ? 'Starting' : 'Stopping' }} {{ op.lab }}, {{ seconds(now - op.startedAt) }}
          </p>
        </div>
        <dl class="hero__counts">
          <div class="vg-tile hero__tile"><dt class="vg-tile__label">Running</dt><dd class="vg-tile__value" data-testid="count-running">{{ counts.running }}</dd></div>
          <div class="vg-tile vg-tile--muted hero__tile"><dt class="vg-tile__label">Stopped</dt><dd class="vg-tile__value" data-testid="count-stopped">{{ counts.stopped }}</dd></div>
          <div class="vg-tile vg-tile--gold hero__tile"><dt class="vg-tile__label">Need a look</dt><dd class="vg-tile__value vg-tile__value--gold" data-testid="count-attention">{{ counts.attention }}</dd></div>
        </dl>
      </section>

      <p class="sr-only" aria-live="polite" data-testid="announce">{{ announce }}</p>
      <p v-if="notice" class="inline-notice error" role="alert">{{ notice }}</p>

      <section v-if="offline" class="vg-glass state-panel" data-testid="offline">
        <h2>The controller is not answering</h2>
        <p>
          The dashboard runs in Podman; the controller runs on your Mac and is what calls <code>make</code>.
          Start both with <code>make up RUNTIME=podman</code> in <code>vault_lab_index</code>.
          <template v-if="data">The labs below are the last answer and are marked stale.</template>
        </p>
      </section>

      <OperationPanel v-if="op && hideOp !== op.id" :operation="op" :now="now" @retry="(o) => act(o.lab, o.action)" @dismiss="hideOp = op.id" />

      <section id="labs" class="labs" aria-labelledby="labs-title" tabindex="-1">
        <div class="labs__head">
          <h2 id="labs-title" class="labs__title">Labs</h2>
          <div class="filter-bar labs__filters">
            <label class="search">
              <span class="sr-only">Search labs by name or prefix</span>
              <Search :size="14" aria-hidden="true" class="search__icon" />
              <input v-model="q" type="search" placeholder="Search by name or prefix" data-testid="search">
            </label>
            <label>
              <span class="sr-only">Show</span>
              <select v-model="filter" data-testid="filter">
                <option v-for="[k, label] in FILTERS" :key="k" :value="k">{{ label }}</option>
              </select>
            </label>
            <span data-testid="shown">{{ shown.length }} of {{ labs.length }}</span>
          </div>
        </div>

        <div v-if="data && !labs.length" class="vg-glass state-panel" data-testid="empty">
          <h3>No labs to control yet</h3>
          <p>
            A lab shows up here when its folder sits next to this one, its Makefile has both an <code>up</code> and a
            <code>down</code> target, it runs on Podman, and its <code>AGENTS.md</code> or <code>.claude/CLAUDE.md</code>
            records its resource prefix (or <code>config/prefixes.json</code> does).
          </p>
        </div>
        <p v-else-if="data && !shown.length" class="state-line">No lab matches this search and filter.</p>
        <div v-else-if="!data && !offline" class="state-line">Asking the controller…</div>

        <div class="grid">
          <LabCard v-for="lab in shown" :key="lab.id" :lab="lab" :operation="op" :offline="offline" :now="now"
                   @start="(l) => act(l, 'up')" @stop="(l) => (stopping = l)" />
        </div>

        <details v-if="data?.excluded.length" class="vg-glass excluded" data-testid="excluded">
          <summary>{{ data.excluded.length }} folders are not controlled here, and why</summary>
          <ul>
            <li v-for="e in data.excluded" :key="e.id"><code>{{ e.id }}</code><span>{{ e.reason }}</span></li>
          </ul>
        </details>
      </section>
    </main>

    <StopDialog :lab="stopping" @confirm="confirmStop" @cancel="stopping = null" />
  </div>
</template>
