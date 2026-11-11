<script setup lang="ts">
// One light per container the lab's prefix matches: green while it runs,
// amber when it runs unhealthy. The sentence carries the meaning.
const props = defineProps<{ running: number; other: number; unhealthy: number }>()
const MAX = 18
const healthy = computed(() => Math.min(props.running - props.unhealthy, MAX))
const sick = computed(() => Math.min(props.unhealthy, MAX - healthy.value))
const dark = computed(() => Math.min(props.other, MAX - healthy.value - sick.value))
const hidden = computed(() => props.running + props.other - healthy.value - sick.value - dark.value)
const sentence = computed(() => {
  if (props.running + props.other === 0) return 'No containers'
  return [
    props.running && `${props.running} running`,
    props.unhealthy && `${props.unhealthy} unhealthy`,
    props.other && `${props.other} stopped`,
  ].filter(Boolean).join(', ')
})
</script>

<template>
  <div class="rack">
    <span v-if="running + other" class="rack__lights" aria-hidden="true">
      <i v-for="n in healthy" :key="`r${n}`" class="rack__light rack__light--on" />
      <i v-for="n in sick" :key="`u${n}`" class="rack__light rack__light--sick" />
      <i v-for="n in dark" :key="`o${n}`" class="rack__light" />
      <b v-if="hidden" class="rack__more">+{{ hidden }}</b>
    </span>
    <span class="rack__text" data-testid="counts">{{ sentence }}</span>
  </div>
</template>
