/**
 * Minimal logger that never prints personal data.
 *
 * - `debug` output only exists in development builds (`__DEV__`), and is stripped from production bundles.
 * - Arguments are passed through `redact`, which drops string values that look like personal data
 *   and replaces objects with a shape summary. Call sites should still avoid passing values at all.
 */

const PREFIX = '[One-Fill]';
const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;

export const logger = {
  debug(message: string, ...details: unknown[]): void {
    if (isDev) console.debug(PREFIX, message, ...details.map(redact));
  },
  warn(message: string, ...details: unknown[]): void {
    console.warn(PREFIX, message, ...details.map(redact));
  },
  error(message: string, error?: unknown): void {
    console.error(PREFIX, message, describeError(error));
  },
};

/** Reduces an arbitrary value to something safe to log. */
export function redact(value: unknown): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.length > 40 || /[@\d]/.test(value) ? `<string:${value.length}>` : value;
  if (Array.isArray(value)) return `<array:${value.length}>`;
  if (value instanceof Error) return describeError(value);
  if (typeof value === 'object') return `<object:${Object.keys(value as object).length} keys>`;
  return `<${typeof value}>`;
}

/** Error messages from our own code never embed values, so name + message is safe to print. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  return error === undefined ? '' : '<non-error thrown>';
}
