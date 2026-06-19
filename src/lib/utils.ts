import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency with Portuguese locale (dot for thousands, comma for decimals)
 * Example: 5000 -> €5.000,00 | 4900 -> €4.900,00
 */
export function formatCurrency(value: number, showSymbol = true): string {
  const formatted = formatWithDotSeparator(Math.abs(value), 2);
  const sign = value < 0 ? '-' : '';
  return showSymbol ? `${sign}€${formatted}` : `${sign}${formatted}`;
}

/**
 * Format number with Portuguese locale (dot for thousands)
 * Example: 5000 -> 5.000
 */
export function formatNumber(value: number, decimals = 0): string {
  return formatWithDotSeparator(value, decimals);
}

/**
 * Internal helper: always uses dot as thousands separator and comma as decimal
 */
function formatWithDotSeparator(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  // Add dots every 3 digits from the right
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decPart !== undefined ? `${withDots},${decPart}` : withDots;
}
