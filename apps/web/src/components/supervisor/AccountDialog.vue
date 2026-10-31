<script setup lang="ts">
import type { CreateUserRequest, SectorInfo, User, UserRole } from '@towerwhisper/shared';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/** Creates an account, or sets a new password for one. */
const props = defineProps<{
  mode: 'create' | 'password';
  user: User | null;
  sectors: SectorInfo[];
  busy: boolean;
}>();
const emit = defineEmits<{
  create: [body: CreateUserRequest];
  password: [password: string];
  cancel: [];
}>();

const MIN_PASSWORD = 6;

const name = ref('');
const email = ref('');
const password = ref('');
const role = ref<UserRole>('atc');
const sectorId = ref<string>(props.sectors[0]?.id ?? '');
const form = ref<HTMLFormElement | null>(null);

const valid = computed(() => {
  if (password.value.length < MIN_PASSWORD) return false;
  if (props.mode === 'password') return true;
  return name.value.trim() !== '' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
});

function submit(): void {
  if (!valid.value || props.busy) return;
  if (props.mode === 'password') {
    emit('password', password.value);
    return;
  }
  emit('create', {
    name: name.value.trim(),
    email: email.value.trim(),
    password: password.value,
    role: role.value,
    sectorId: role.value === 'atc' ? sectorId.value || null : null,
  });
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('cancel');
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  form.value?.querySelector('input')?.focus();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="backdrop" @click.self="emit('cancel')">
    <form
      ref="form"
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-title"
      @submit.prevent="submit"
    >
      <h2 id="account-title">
        {{ mode === 'create' ? 'New account' : `New password for ${user?.name}` }}
      </h2>

      <template v-if="mode === 'create'">
        <label class="field">
          <span class="label">Full name</span>
          <input v-model="name" type="text" autocomplete="off" placeholder="Ioana Marinescu" />
        </label>
        <label class="field">
          <span class="label">Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="off"
            placeholder="ioana@towerwhisper.app"
          />
        </label>
        <div class="field">
          <span class="label">Role</span>
          <div class="segmented" role="radiogroup" aria-label="Role">
            <button
              type="button"
              role="radio"
              :aria-checked="role === 'atc'"
              :class="{ on: role === 'atc' }"
              @click="role = 'atc'"
            >
              ATC
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="role === 'supervisor'"
              :class="{ on: role === 'supervisor' }"
              @click="role = 'supervisor'"
            >
              Supervisor
            </button>
          </div>
        </div>
        <label v-if="role === 'atc'" class="field">
          <span class="label">Sector worked</span>
          <select v-model="sectorId">
            <option v-for="s in sectors" :key="s.id" :value="s.id">
              {{ s.name }} · {{ s.airportIcao }}
            </option>
          </select>
          <span class="help">Signing in opens this sector's live position.</span>
        </label>
        <p v-else class="help">
          Supervisors see every sector, the statistics, the replays and the accounts.
        </p>
      </template>

      <label class="field">
        <span class="label">{{ mode === 'create' ? 'Password' : 'New password' }}</span>
        <input v-model="password" type="password" autocomplete="new-password" />
        <span class="help">At least {{ MIN_PASSWORD }} characters.</span>
      </label>

      <div class="actions">
        <button type="button" class="ghost" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary" :disabled="!valid || busy">
          {{ busy ? 'Saving…' : mode === 'create' ? 'Create account' : 'Set password' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-overlay);
}

.dialog {
  width: 480px;
  padding: 28px 32px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--color-panel);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-dialog);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}

h2 {
  margin: 0 0 var(--space-1);
  font-size: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

input,
select {
  height: 42px;
  padding: 0 var(--space-3);
  font-size: 15px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

input:focus-visible,
select:focus-visible {
  outline: none;
  border-color: var(--color-atc);
  box-shadow: 0 0 0 3px var(--color-atc-bg);
}

.help {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-faint);
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

.segmented button {
  height: 34px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
}

.segmented button.on {
  color: var(--color-text);
  background: var(--color-border-strong);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.ghost,
.primary {
  height: 40px;
  padding: 0 var(--space-5);
  font-size: 14px;
  font-weight: 700;
  border-radius: var(--radius);
}

.ghost {
  background: transparent;
  border: var(--border-width) solid var(--color-border-control);
}

.primary {
  color: var(--color-radar-bg);
  background: var(--color-atc);
  border: none;
}

.primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
