/**
 * Norwegian IBAN and account-number handling.
 *
 * ## Why this is separate from `connection-iban.ts`
 *
 * That module picks which IBAN to suggest for a company's SEK invoice payment
 * account, and validates against a generic shape only: `^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$`.
 * That shape accepts `DE00000000000000000000` as readily as a real Norwegian
 * account, and rejects nothing but length. It is correct for its job — suggesting
 * one among already-connected accounts — and wrong as validation, which is why it
 * never claimed to be validation.
 *
 * A Norwegian company needs the other job: to say whether an entered IBAN can be
 * Norwegian at all, and to get the 11-digit account number out of it.
 *
 * ## What is sourced here, and what is not
 *
 * Everything below is ISO 13616 (IBAN) plus the published Norwegian IBAN structure.
 * ISO 13616 is a public international standard and the check-digit rule is
 * arithmetic, not licensed text. This module deliberately does NOT touch
 * account-number *checksum* rules or the Norwegian bank-identifier tables: those
 * are not derivable from IBAN, and a control-digit rule that is slightly wrong
 * rejects real accounts and accepts fakes, silently, in both directions.
 *
 * The one Norwegian-specific assertion made here is that the BBAN is the plain
 * 11-digit account number with a non-zero leading digit. That is what makes the
 * IBAN reversible to an account number, which the rest of the product needs.
 */

/** ISO 13616's own requirement: the rearranged value mod 97 must be 1. */
export function isIbanChecksumValid(value: string): boolean {
  const iban = value.replace(/[\s-]/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false

  // Move the four leading characters to the end, then map A=10 … Z=35.
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const char of rearranged) {
    const digits = char >= 'A' ? String(char.charCodeAt(0) - 55) : char
    for (const d of digits) {
      remainder = (remainder * 10 + Number(d)) % 97
    }
  }
  return remainder === 1
}

/**
 * Norwegian IBAN: `NO` + two check digits + the 11-digit account number, 15
 * characters in total. The account number cannot start with 0, so a leading zero
 * is treated as not Norwegian rather than silently accepted.
 */
export function isNorwegianIban(value: string | null | undefined): boolean {
  if (!value) return false
  const iban = value.replace(/[\s-]/g, '').toUpperCase()
  if (!/^NO\d{2}[1-9]\d{10}$/.test(iban)) return false
  return isIbanChecksumValid(iban)
}

/** The 11-digit account number inside a Norwegian IBAN, or null. */
export function norwegianAccountNumberFromIban(value: string): string | null {
  const iban = value.replace(/[\s-]/g, '').toUpperCase()
  if (!isNorwegianIban(iban)) return null
  return iban.slice(4)
}

/**
 * Build the IBAN for an 11-digit Norwegian account number.
 *
 * ISO 13616 generates the check digits as `98 - mod97(BBAN + "NO00")`. This is the
 * same arithmetic the validator uses, so generation and validation cannot disagree
 * the way two hand-written rules would.
 */
export function norwegianIbanFromAccountNumber(value: string): string | null {
  const account = value.replace(/[\s.]/g, '')
  if (!/^[1-9]\d{10}$/.test(account)) return null

  const candidate = account + 'NO00'
  let remainder = 0
  for (const char of candidate) {
    const digits = char >= 'A' ? String(char.charCodeAt(0) - 55) : char
    for (const d of digits) {
      remainder = (remainder * 10 + Number(d)) % 97
    }
  }
  const check = 98 - remainder
  if (check < 2 || check > 96) return null
  return `NO${String(check).padStart(2, '0')}${account}`
}

/**
 * Canonical form of a Norwegian account number: the 11 digits, nothing else.
 *
 * Note what this function does NOT do: print it. Norwegian banks write account
 * numbers with a separator, but the grouping is a presentation convention I have
 * no source for, and a wrong grouping is the kind of error that looks like
 * formatting until a payment file is rejected. Separators are stripped on the way
 * in, and the display grouping must come from a bank's own specification rather
 * than from a guess made here.
 */
export function normalizeNorwegianAccountNumber(value: string): string | null {
  const account = value.replace(/[\s.-]/g, '')
  if (!/^[1-9]\d{10}$/.test(account)) return null
  return account
}
