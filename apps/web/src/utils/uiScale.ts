import { ref } from 'vue';

/**
 * Display scale of the whole console (CSS `zoom` on #app). The layout is drawn in pixels for
 * 1920 x 1080; on a laptop with Windows scaling (a 1536 x 864 window at 125 %) "auto" shrinks
 * it until that layout fits, and the smaller steps give more room to the radar, the way a
 * 2K monitor would. Chosen per browser; the projector stays at 100 % when the window is
 * 1920 x 1080 or larger.
 */
export const DESIGN_SIZE = { width: 1920, height: 1080 };

export type UiScaleChoice = 'auto' | 1 | 0.9 | 0.8 | 0.7 | 0.6;

export const UI_SCALE_CHOICES: { value: UiScaleChoice; label: string }[] = [
  { value: 'auto', label: 'AUTO' },
  { value: 1, label: '100%' },
  { value: 0.9, label: '90%' },
  { value: 0.8, label: '80%' },
  { value: 0.7, label: '70%' },
  { value: 0.6, label: '60%' },
];

const STORAGE_KEY = 'towerwhisper.uiScale';

export const uiScaleChoice = ref<UiScaleChoice>(loadChoice());

function loadChoice(): UiScaleChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const found = UI_SCALE_CHOICES.find((c) => String(c.value) === saved);
    return found?.value ?? 'auto';
  } catch {
    return 'auto';
  }
}

/** Auto: the largest scale (at most 100 %) at which the 1920 x 1080 layout fits the window. */
function autoScale(): number {
  return Math.min(
    1,
    window.innerWidth / DESIGN_SIZE.width,
    window.innerHeight / DESIGN_SIZE.height,
  );
}

function apply(): void {
  const choice = uiScaleChoice.value;
  const scale = choice === 'auto' ? autoScale() : choice;
  document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
}

export function setUiScale(choice: UiScaleChoice): void {
  uiScaleChoice.value = choice;
  try {
    localStorage.setItem(STORAGE_KEY, String(choice));
  } catch {
    // Private window: the choice lasts until reload.
  }
  apply();
}

/** Applies the saved scale and follows window resizes (for "auto"). Call once at startup. */
export function initUiScale(): void {
  apply();
  window.addEventListener('resize', apply);
}

/**
 * The zoom an element is drawn at. Mouse coordinates and getBoundingClientRect() are in screen
 * pixels, layout sizes (clientWidth, canvas drawing) in the element's own: divide by this.
 */
export function cssZoom(el: Element | null | undefined): number {
  return (el as { currentCSSZoom?: number } | null)?.currentCSSZoom ?? 1;
}
