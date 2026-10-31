<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { homeFor } from '../router';
import { useAuthStore } from '../stores/useAuthStore';

/** The two accounts created on the first run (also in the README). */
const DEMO_ACCOUNTS = [
  { email: 'atc@towerwhisper.app', role: 'ATC', detail: 'Craiova Approach' },
  { email: 'supervisor@towerwhisper.app', role: 'SUPERVISOR', detail: 'All sectors' },
];
const DEMO_PASSWORD = 'passpass';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  error.value = null;
  try {
    const user = await auth.login(email.value.trim(), password.value);
    const next = typeof route.query.next === 'string' ? route.query.next : null;
    await router.replace(next ?? homeFor(user.role));
  } catch (e) {
    const message = (e as Error).message;
    error.value = message === 'Failed to fetch' ? 'The server is not reachable' : message;
  } finally {
    busy.value = false;
  }
}

function useAccount(account: string): void {
  email.value = account;
  password.value = DEMO_PASSWORD;
  void submit();
}
</script>

<template>
  <main class="login">
    <div class="scope" aria-hidden="true">
      <span v-for="r in 4" :key="r" class="ring" :style="{ '--r': r }" />
      <span class="sweep" />
    </div>

    <section class="card" aria-labelledby="login-title">
      <header class="head">
        <span class="brand">TOWERWHISPER</span>
        <h1 id="login-title">Sign in to your position</h1>
        <p class="lead">
          AI co-pilot for approach control: readback checks, conformance and comms watch.
        </p>
      </header>

      <form class="form" novalidate @submit.prevent="submit">
        <label class="field">
          <span class="label">Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            required
            autofocus
            placeholder="name@towerwhisper.app"
          />
        </label>
        <label class="field">
          <span class="label">Password</span>
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>

        <p v-if="error" class="error" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3l10 18H2z" fill="currentColor" />
            <path
              d="M12 10v5M12 18v.5"
              stroke="var(--color-panel)"
              stroke-width="2.2"
              stroke-linecap="round"
            />
          </svg>
          {{ error }}
        </p>

        <button type="submit" class="submit" :disabled="busy || !email || !password">
          <svg
            v-if="busy"
            class="spinner"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M12 3a9 9 0 1 1-9 9" />
          </svg>
          {{ busy ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>

      <div class="demo">
        <span class="demo-title">DEMO ACCOUNTS · PASSWORD {{ DEMO_PASSWORD }}</span>
        <button
          v-for="a in DEMO_ACCOUNTS"
          :key="a.email"
          type="button"
          class="account"
          :disabled="busy"
          @click="useAccount(a.email)"
        >
          <span class="role mono">{{ a.role }}</span>
          <span class="email mono">{{ a.email }}</span>
          <span class="detail">{{ a.detail }}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.login {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-radar-bg);
}

/* A quiet radar scope behind the card. */
.scope {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.ring {
  position: absolute;
  width: calc(var(--r) * 260px);
  height: calc(var(--r) * 260px);
  border: var(--border-width) solid var(--radar-ring);
  border-radius: 50%;
}

.sweep {
  position: absolute;
  width: 1040px;
  height: 1040px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, rgba(63, 208, 232, 0.1), transparent 14%);
  animation: spin 12s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .sweep {
    animation: none;
  }
}

.card {
  position: relative;
  width: 440px;
  padding: 36px 40px 32px;
  display: flex;
  flex-direction: column;
  gap: 28px;
  background: var(--color-panel-overlay);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius-dialog);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
}

.head {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.brand {
  font-size: var(--font-size-label);
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--color-atc);
}

h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.lead {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.label {
  font-size: var(--font-size-label);
  font-weight: 600;
  color: var(--color-text-secondary);
}

input {
  height: 44px;
  padding: 0 var(--space-3);
  font-size: 15px;
  background: var(--color-control);
  border: var(--border-width) solid var(--color-border-control);
  border-radius: var(--radius);
}

input::placeholder {
  color: var(--color-text-faint);
}

input:focus-visible {
  outline: none;
  border-color: var(--color-atc);
  box-shadow: 0 0 0 3px var(--color-atc-bg);
}

.error {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 10px var(--space-3);
  font-size: 14px;
  color: var(--color-warning-text);
  background: var(--color-warning-bg);
  border: var(--border-width) solid var(--color-warning);
  border-radius: var(--radius);
}

.submit {
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-radar-bg);
  background: var(--color-atc);
  border: none;
  border-radius: var(--radius);
}

.submit:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.demo {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-top: var(--space-5);
  border-top: var(--border-width) solid var(--color-border);
}

.demo-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: var(--letter-label);
  color: var(--color-text-faint);
}

.account {
  display: grid;
  grid-template-columns: 96px 1fr auto;
  grid-template-rows: auto auto;
  column-gap: var(--space-3);
  align-items: center;
  padding: 10px var(--space-3);
  text-align: left;
  background: transparent;
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
  color: var(--color-text-muted);
}

.account:hover:not(:disabled) {
  border-color: var(--color-atc);
  color: var(--color-text);
}

.role {
  grid-row: span 2;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--color-atc);
}

.email {
  font-size: 13px;
  color: var(--color-text);
}

.detail {
  grid-column: 2;
  font-size: 12px;
}

.account svg {
  grid-column: 3;
  grid-row: 1 / span 2;
}
</style>
