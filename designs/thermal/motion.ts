import { Easing, FadeIn, FadeInRight, FadeOut, FadeOutLeft, LinearTransition } from 'react-native-reanimated';

/**
 * Thermal V2 motion tokens — every UI transition (press, sheets, screen
 * steps, reveals, layout changes) uses these so the app moves one way.
 *
 * Intentionally NOT tokenised: the Power heat camera (pixel-core, scale,
 * YOU marker) and ambient loops (background breath, heat burst drift,
 * flame flicker, shimmer). Those keep their own hand-tuned timings.
 */
export const DURATION = {
  /** Finger down on a button */
  press: 90,
  /** One pixel cell lighting up in a bar or scale */
  cell: 120,
  /** Anything leaving: fade-outs, sheet close, press release */
  exit: 200,
  /** Default enter: sheet open, step change, layout, tab indicator */
  base: 260,
  /** Content reveal: staggered fades, card fills, brackets closing in */
  reveal: 320,
  /** Hero moments: rank-up pepper drop, burst, stamp settle */
  emphasis: 480,
} as const;

export const EASE = {
  enter: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.quad),
  press: Easing.out(Easing.quad),
} as const;

export const TIMING = {
  press: { duration: DURATION.press, easing: EASE.press },
  release: { duration: DURATION.exit, easing: EASE.press },
  cell: { duration: DURATION.cell, easing: EASE.press },
  enter: { duration: DURATION.base, easing: EASE.enter },
  exit: { duration: DURATION.exit, easing: EASE.exit },
  reveal: { duration: DURATION.reveal, easing: EASE.enter },
  emphasis: { duration: DURATION.emphasis, easing: EASE.enter },
} as const;

/** Staggered reveal: first item waits `lead`, each next one `step` more */
export const STAGGER = { lead: 300, step: 140 } as const;

/** How long transient feedback (e.g. "COPIED") stays on screen */
export const FEEDBACK_HOLD_MS = 1600;

/*
 * Layout animation builders are mutable, so each call returns a fresh one.
 */

export function fadeIn() {
  return FadeIn.duration(DURATION.base);
}

export function fadeOut() {
  return FadeOut.duration(DURATION.exit);
}

/** Forward step in a multi-step flow (onboarding, create proposal) */
export function stepIn() {
  return FadeInRight.duration(DURATION.base);
}

export function stepOut() {
  return FadeOutLeft.duration(DURATION.exit);
}

export function layoutTransition() {
  return LinearTransition.duration(DURATION.base);
}

/** Fade in the `index`-th item of a staggered hero sequence */
export function revealAt(index: number) {
  return FadeIn.duration(DURATION.reveal).delay(STAGGER.lead + index * STAGGER.step);
}
