import {
  calculateCirculatingSupply,
  sumBalances,
} from '@/hooks/use-pepper-token-metrics';
import { formatPepperAmount } from '@/lib/pepper-metrics';
import type { PepperAddressBalance } from '@/services/chiliz-api';

/**
 * Lightweight, framework-agnostic tests for Pepper metrics helpers.
 *
 * These can be wired into a full test runner (Jest/Vitest) later.
 */
export function runPepperMetricsTests(): void {
  const balances: Array<PepperAddressBalance> = [
    { address: '0x1', balance: BigInt(1_000) },
    { address: '0x2', balance: BigInt(2_000) },
  ];

  const sum = sumBalances(balances);

  if (sum !== BigInt(3_000)) {
    throw new Error('sumBalances did not produce the expected result');
  }

  const circulating = calculateCirculatingSupply(
    BigInt(10_000),
    BigInt(1_000),
    BigInt(2_000),
    BigInt(3_000),
    BigInt(500), // Retired holders (old staking contract, old treasury)
  );

  if (circulating !== BigInt(3_500)) {
    throw new Error('calculateCirculatingSupply produced an unexpected value');
  }

  const formatted = formatPepperAmount(BigInt('1234560000000000000000'), 18, 4);

  if (!formatted.startsWith('1,234.56')) {
    throw new Error(
      `formatPepperAmount formatting mismatch, received "${formatted}"`,
    );
  }
}


