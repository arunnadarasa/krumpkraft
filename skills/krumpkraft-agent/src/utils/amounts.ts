/**
 * USDC.k uses 6 decimals on-chain. 1 USDC.k = 1e6 raw units.
 * Use this to parse human-readable amounts (e.g. "0.0001") into raw bigint for contracts/relayer.
 */
const USDC_DECIMALS = 6;

/**
 * Parse a USDC.k amount from decimal string or number into raw (6-decimal) bigint.
 * Enables micropayments like 0.0001 USDC.k (= 100 raw units).
 */
export function parseUsdcAmount(value: string | number): bigint {
  if (value === '' || value === undefined || value === null) return 0n;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (Number.isNaN(n) || n < 0) return 0n;
  const raw = Math.round(n * 10 ** USDC_DECIMALS);
  return BigInt(raw);
}

/** JAB (EVVM principal token) uses 18 decimals on-chain. */
const JAB_DECIMALS = 18;

/**
 * Parse a JAB amount from decimal string or number into raw (18-decimal) bigint.
 */
export function parseJabAmount(value: string | number): bigint {
  if (value === '' || value === undefined || value === null) return 0n;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  if (Number.isNaN(n) || n < 0) return 0n;
  const raw = Math.round(n * 10 ** JAB_DECIMALS);
  return BigInt(raw);
}
