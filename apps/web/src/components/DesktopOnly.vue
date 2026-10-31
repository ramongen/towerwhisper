<script setup lang="ts">
import { MIN_SCREEN } from '../utils/screen';
</script>

<template>
  <main class="desktop-only" role="alert" aria-labelledby="desktop-only-title">
    <div class="card">
      <span class="brand">TOWERWHISPER</span>
      <svg
        class="icon"
        width="72"
        height="72"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="2.5" y="3.5" width="19" height="13" rx="1.5" />
        <path d="M8 20.5h8M12 16.5v4" />
        <circle cx="12" cy="10" r="3.2" />
        <path d="M12 10l2.2-2.2" />
      </svg>
      <h1 id="desktop-only-title">Open TowerWhisper on a computer</h1>
      <p>
        The controller console and the supervisor dashboard need a laptop or desktop screen, at
        least {{ MIN_SCREEN.width }} × {{ MIN_SCREEN.height }} px. On a desktop browser, make the
        window larger.
      </p>
      <p class="hint mono">THE DEMO CONTROL PANEL (/demo) WORKS ON PHONES</p>
    </div>
  </main>
</template>

<style scoped>
.desktop-only {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6) var(--space-4);
  background:
    radial-gradient(circle at 50% 35%, rgba(63, 208, 232, 0.08), transparent 60%), var(--color-bg);
  overflow-y: auto;
}

.card {
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  text-align: center;
}

.brand {
  font-size: var(--font-size-label);
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--color-text-muted);
}

.icon {
  color: var(--color-atc);
}

h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

p {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.hint {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  border: var(--border-width) solid var(--color-border-strong);
  border-radius: var(--radius);
}
</style>
