<script setup lang="ts">
// Stopping asks first and says what make down keeps (prompt 02).
import type { Lab } from '~/composables/labs'

const props = defineProps<{ lab: Lab | null }>()
const emit = defineEmits<{ confirm: [Lab]; cancel: [] }>()
const dialog = ref<HTMLDialogElement | null>(null)

watch(() => props.lab, async (lab) => {
  await nextTick()
  if (lab && !dialog.value?.open) dialog.value?.showModal()
  if (!lab && dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog ref="dialog" class="stop vg-glass" aria-labelledby="stop-title" aria-describedby="stop-desc" @close="emit('cancel')">
    <template v-if="lab">
      <h2 id="stop-title" class="stop__title">Stop {{ lab.name }}?</h2>
      <p id="stop-desc" class="stop__desc">
        This runs <code>make down</code> in <code>{{ lab.id }}</code>. The lab's own Makefile stops its
        <code>{{ lab.prefix }}</code> containers and keeps their volumes and data. Start it again later to pick up where it was.
      </p>
      <form method="dialog" class="stop__actions">
        <button type="submit" class="secondary-button" autofocus>Keep it running</button>
        <button type="button" class="primary-button" data-testid="confirm-stop" @click="emit('confirm', lab)">Stop lab</button>
      </form>
    </template>
  </dialog>
</template>
