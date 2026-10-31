/**
 * The console needs a laptop or desktop screen; the demo panel is the only page made for
 * phones. Below this size the app shows the "desktop only" screen instead.
 */
export const MIN_SCREEN = { width: 1100, height: 600 };

export const SMALL_SCREEN_QUERY = `(max-width: ${MIN_SCREEN.width - 1}px), (max-height: ${MIN_SCREEN.height - 1}px)`;

export function isSmallScreen(): boolean {
  return window.matchMedia(SMALL_SCREEN_QUERY).matches;
}

/** The demo panel (/demo) works on any screen. */
export function isPhonePage(pathname: string): boolean {
  return pathname === '/demo' || pathname.startsWith('/demo/');
}
