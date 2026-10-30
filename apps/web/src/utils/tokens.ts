/** Reads design tokens (CSS custom properties) for code that cannot use CSS, i.e. the radar canvas. */
export function readTokens<K extends string>(names: Record<K, string>): Record<K, string> {
  const style = getComputedStyle(document.documentElement);
  const out = {} as Record<K, string>;
  for (const key of Object.keys(names) as K[]) {
    out[key] = style.getPropertyValue(names[key]).trim();
  }
  return out;
}
