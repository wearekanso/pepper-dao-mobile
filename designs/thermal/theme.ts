import { StyleSheet } from 'react-native';

import { FONTS } from '@/lib/fonts';

/**
 * Thermal Pixel design tokens (Figma: "App v1 — Thermal Pixel")
 */
export const THERMAL_COLORS = {
  void: '#07020F',
  panel: 'rgba(7,2,15,0.82)',
  chip: 'rgba(7,2,15,0.75)',
  cream: '#FFF5D6',
  gold: '#FFD60A',
  goldSoft: '#FFE98A',
  amber: '#FFA305',
  orange: '#FF7A00',
  ember: '#FF5414',
  red: '#FF2D2D',
  crimson: '#D9204F',
  magenta: '#B5179E',
  plum: '#7A14A4',
  violet: '#5B12A8',
  indigo: '#2A0C7A',
  navy: '#0B1E5B',
  blue: '#3A6BFF',
  slate: '#5B5670',
  mist: '#9A94B0',
  white: '#FFFFFF',
  border: 'rgba(255,255,255,0.35)',
  borderSoft: 'rgba(255,255,255,0.25)',
  divider: 'rgba(255,255,255,0.12)',
  ghost: 'rgba(255,255,255,0.12)',
  /** V2: pepper green, only for positive status */
  pepperGreen: '#3FD15A',
} as const;

/** V2 white text levels on the void background */
export const INK = {
  strong: 'rgba(255,255,255,0.9)',
  body: 'rgba(255,255,255,0.85)',
  muted: 'rgba(255,255,255,0.6)',
  faint: 'rgba(255,255,255,0.4)',
} as const;

/**
 * V2 status colors (app-wide). Stroke + text of the same color; never a
 * filled chip — except UPCOMING, which the design shows as a violet block.
 * Vote colors (VOTE_COLORS) are separate and never mixed with these.
 */
export const STATUS_COLORS = {
  /** APPROVED, MET, DONE, ELIGIBLE, PASSED, EXECUTED, finished step */
  positive: { stroke: THERMAL_COLORS.pepperGreen, text: THERMAL_COLORS.pepperGreen },
  /** WAITING, NOT YET */
  waiting: { stroke: 'rgba(255,255,255,0.25)', text: INK.faint },
  /** REJECTED, NOT RECORDED */
  negative: { stroke: THERMAL_COLORS.red, text: THERMAL_COLORS.red },
  /** LIVE NOW: white box with a red dot */
  live: { stroke: THERMAL_COLORS.white, text: THERMAL_COLORS.white, dot: THERMAL_COLORS.red },
  /** UPCOMING */
  upcoming: { stroke: THERMAL_COLORS.violet, text: THERMAL_COLORS.white, fill: THERMAL_COLORS.violet },
} as const;

/** V2 fixed sizes (Figma "Düzen kuralları") */
export const SIZE = {
  /** Chips and small buttons share one height */
  chip: 27,
  /** Full-size buttons */
  button: 44,
  /** Square back / close button in the top nav bar */
  navButton: 36,
  /** Tab screen title block (title + wallet chip) */
  tabHeader: 66,
  /** Card and chip stroke */
  stroke: 2,
  /** Hard black card shadow offset */
  shadow: 4,
  /** Pixel art sensor grid cell */
  pixelCell: 10,
} as const;

/** Cold → hot ramp used by scales, bars and the pixelated core */
export const HEAT_RAMP: Array<string> = [
  THERMAL_COLORS.navy,
  THERMAL_COLORS.indigo,
  THERMAL_COLORS.violet,
  THERMAL_COLORS.magenta,
  THERMAL_COLORS.red,
  THERMAL_COLORS.orange,
  THERMAL_COLORS.gold,
  THERMAL_COLORS.cream,
];

export const VOTE_COLORS = {
  YES: THERMAL_COLORS.cream,
  NO: THERMAL_COLORS.blue,
  ABSTAIN: THERMAL_COLORS.slate,
} as const;

export const NAV_HEIGHT = 104;

/**
 * Spacing system (Figma v1.1 consistency pass)
 */
export const SPACE = {
  /** Page side margin */
  margin: 16,
  /** Vertical rhythm between blocks on a screen */
  section: 16,
  /** Inner padding of panels */
  panel: 14,
  /** List rows: vertical / horizontal */
  rowY: 12,
  rowX: 14,
  /** Vertical padding of full-size buttons */
  button: 14,
  /** V2: section label → its content */
  label: 10,
} as const;

export const TYPE = StyleSheet.create({
  display72: { fontFamily: FONTS.display, fontSize: 72, lineHeight: 70, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  display58: { fontFamily: FONTS.display, fontSize: 58, lineHeight: 56, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  display40: { fontFamily: FONTS.display, fontSize: 40, lineHeight: 40, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  display32: { fontFamily: FONTS.display, fontSize: 32, lineHeight: 31, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  display24: { fontFamily: FONTS.display, fontSize: 24, lineHeight: 24, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  meta26: { fontFamily: FONTS.display, fontSize: 26, lineHeight: 29, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  meta20: { fontFamily: FONTS.display, fontSize: 20, lineHeight: 22, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  meta18: { fontFamily: FONTS.display, fontSize: 18, lineHeight: 20, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  meta16: { fontFamily: FONTS.display, fontSize: 16, lineHeight: 18, letterSpacing: 0.5, color: THERMAL_COLORS.white },
  label15: { fontFamily: FONTS.label, fontSize: 15, letterSpacing: 1, color: THERMAL_COLORS.white },
  /** V2: buttons, nav and sheet titles */
  label14: { fontFamily: FONTS.label, fontSize: 14, letterSpacing: 1, color: THERMAL_COLORS.white },
  label12: { fontFamily: FONTS.label, fontSize: 12, letterSpacing: 1, color: THERMAL_COLORS.white },
  label10: { fontFamily: FONTS.label, fontSize: 10, letterSpacing: 1, color: THERMAL_COLORS.white },
  body14: { fontFamily: FONTS.body, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.85)' },
  body13: { fontFamily: FONTS.body, fontSize: 13, lineHeight: 19.5, color: 'rgba(255,255,255,0.6)' },
  bodyMedium14: { fontFamily: FONTS.bodyMedium, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.85)' },
});

/** Hard pixel drop shadow (iOS). Android falls back to the offset block in <Panel>. */
export function hardShadow(color: string = '#000000', offset: number = 4) {
  return {
    shadowColor: color,
    shadowOffset: { width: offset, height: offset },
    shadowOpacity: 1,
    shadowRadius: 0,
  };
}
