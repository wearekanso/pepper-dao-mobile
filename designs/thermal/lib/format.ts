const COMPACT_UNITS: Array<{ value: number; suffix: string }> = [
  { value: 1e15, suffix: 'Q' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'B' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'K' },
];

/**
 * 9_745_680_309_696_632 → "9.75Q", 143_200_000_000_000 → "143.2T"
 */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '–';

  const unit = COMPACT_UNITS.find((item) => Math.abs(value) >= item.value);
  if (!unit) {
    return Math.round(value).toLocaleString('en-US');
  }

  const scaled = value / unit.value;
  const digits = Math.abs(scaled) < 10 ? 2 : Math.abs(scaled) < 1000 ? 1 : 0;
  // Drop trailing zeros: "1T", "2.5M" (Figma), not "1.00T", "2.50M"
  return `${Number(scaled.toFixed(digits))}${unit.suffix}`;
}

/** Full number below a million ("12,000", "230.5"), compact above ("12.4M") — Figma's balance style */
export function formatAmount(value: number): string {
  if (Math.abs(value) >= 1_000_000) return formatCompact(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Converts a raw token amount to a JS number (precision loss is fine for display) */
export function tokenToNumber(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);

  const keep = Math.min(decimals, 4);
  const divisor = BigInt(10) ** BigInt(decimals - keep);
  return Number(raw / divisor) / 10 ** keep;
}

export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function shortenAddress(address: string | null | undefined): string {
  if (!address) return '';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** "MULTISIG-94514215…8158" → "MULTISIG-9451...8158" */
export function shortenKey(key: string, max: number = 16): string {
  if (key.length <= max) return key;
  return `${key.slice(0, max - 7)}...${key.slice(-4)}`;
}

/**
 * Proposal dates arrive either as unix-seconds strings (subgraph) or ISO
 * timestamps (Supabase cache). Returns epoch ms, or NaN.
 */
export function parseDateMs(value: string | null | undefined): number {
  if (!value) return NaN;
  if (/^\d+$/.test(value)) return parseInt(value, 10) * 1000;
  return Date.parse(value);
}

/** Proposal date → "2D 14H" / "5H 12M" / "3M" until it */
export function formatCountdown(endDate: string, now: number = Date.now()): string {
  const end = parseDateMs(endDate);
  if (!Number.isFinite(end)) return '–';
  const diff = Math.max(0, end - now);

  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);

  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  return `${minutes}M`;
}

/** Proposal date → "316D AGO" */
export function formatAgo(date: string | null | undefined, now: number = Date.now()): string {
  const time = parseDateMs(date);
  if (!Number.isFinite(time)) return '';

  const diff = Math.max(0, now - time);
  const days = Math.floor(diff / DAY_MS);
  if (days > 0) return `${days}D AGO`;

  const hours = Math.floor(diff / HOUR_MS);
  if (hours > 0) return `${hours}H AGO`;

  const minutes = Math.floor(diff / MINUTE_MS);
  return minutes > 0 ? `${minutes}M AGO` : 'JUST NOW';
}

/** ISO date → "04 OCT" */
export function formatDayMonth(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  // Figma writes "4 OCT", not "04 OCT"
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Proposal date → "2 SEP 2025" */
export function formatShortDate(value: string | null | undefined): string {
  const time = parseDateMs(value);
  if (!Number.isFinite(time)) return '';

  const date = new Date(time);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
