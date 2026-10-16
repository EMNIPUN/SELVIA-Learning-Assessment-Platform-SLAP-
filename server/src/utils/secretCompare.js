import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string equality for secrets. Unequal lengths return false without
 * throwing and without short-circuiting on the first differing byte of equal-length inputs.
 * Does not log either argument.
 *
 * @param {string} provided
 * @param {string} expected
 * @returns {boolean}
 */
export function secretsEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false
  }

  const left = Buffer.from(provided, 'utf8')
  const right = Buffer.from(expected, 'utf8')

  if (left.length !== right.length) {
    // Keep a timingSafeEqual call so length mismatches do not skip the crypto path entirely.
    timingSafeEqual(left, left)
    return false
  }

  return timingSafeEqual(left, right)
}
