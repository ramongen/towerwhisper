<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/useAuthStore';
import { useSectorStore } from '../stores/useSectorStore';
import { setUiScale, UI_SCALE_CHOICES, uiScaleChoice } from '../utils/uiScale';

const auth = useAuthStore();
const { user } = storeToRefs(auth);
const sectors = useSectorStore();
const router = useRouter();
const open = ref(false);
const root = ref<HTMLElement | null>(null);

const initials = computed(() =>
  (user.value?.name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase(),
);

const roleLine = computed(() => {
  if (!user.value) return '';
  if (user.value.role === 'supervisor') return 'SUPERVISOR · ALL SECTORS';
  const sector = sectors.byId(user.value.sectorId) ?? sectors.current;
  return `ATC · ${sector?.shortName ?? 'NO SECTOR'}`;
});

function signOut(): void {
  auth.logout();
  void router.push({ name: 'login' });
}

function onDocumentClick(event: MouseEvent): void {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  void sectors.loadAll().catch(() => undefined);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div v-if="user" ref="root" class="user-menu">
    <button
      type="button"
      class="trigger"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <span class="avatar mono" aria-hidden="true">{{ initials }}</span>
      <span class="who">
        <span class="name">{{ user.name }}</span>
        <span class="role mono">{{ roleLine }}</span>
      </span>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div v-if="open" class="menu" role="menu">
      <div class="menu-head">
        <span class="name">{{ user.name }}</span>
        <span class="email mono">{{ user.email }}</span>
      </div>
      <div class="scale" role="group" aria-labelledby="ui-scale-label">
        <span id="ui-scale-label" class="scale-label">DISPLAY SCALE</span>
        <div class="scale-options">
          <button
            v-for="c in UI_SCALE_CHOICES"
            :key="c.label"
            type="button"
            class="mono scale-option"
            :aria-pressed="uiScaleChoice === c.value"
            @click="setUiScale(c.value)"
          >
            {{ c.label }}
          </button>
        </div>
        <span class="scale-hint">Auto fits the 1920 × 1080 layout; lower = bigger radar</span>
      </div>
      <button type="button" role="menuitem" class="item" @click="signOut">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path
            d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        Sign out
      </button>
    </div>
  </div>
</template>

<style scoped>
.user-menu {
  position: relative;
}

.trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 4px 4px;
  color: var(--color-text-muted);
  background: transparent;
  border: var(--border-width) solid transparent;
  border-radius: var(--radius);
}

.trigger:hover,
.trigger[aria-expanded='true'] {
  border-color: var(--color-border-strong);
  background: var(--color-panel-raised);
}

.avatar {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-atc);
  background: var(--color-atc-bg);
  border-radius: 50%;
}

.who {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.25;
}

.name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.role {
  font-size: 11px;
  letter-spacing: 0.06em;
}

.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 240px;
  padding: var(--space-2);
  background: var(--color-panel-raised);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-card);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
}

.menu-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3) var(--space-3);
  border-bottom: var(--border-width) solid var(--color-border);
  margin-bottom: var(--space-1);
}

.email {
  font-size: 12px;
  color: var(--color-text-muted);
}

.scale {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3) var(--space-3);
  border-bottom: var(--border-width) solid var(--color-border);
  margin-bottom: var(--space-1);
}

.scale-label {
  font-size: var(--font-size-caption);
  font-weight: 700;
  letter-spacing: var(--letter-label);
  color: var(--color-text-muted);
}

.scale-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-1);
}

.scale-option {
  padding: 6px 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius-sm);
}

.scale-option:hover {
  border-color: var(--color-text-muted);
}

.scale-option[aria-pressed='true'] {
  color: var(--color-atc);
  background: var(--color-atc-bg);
  border-color: var(--color-atc);
}

.scale-hint {
  font-size: var(--font-size-caption);
  color: var(--color-text-faint);
}

.item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 14px;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
}

.item:hover {
  background: var(--color-control);
}
</style>
