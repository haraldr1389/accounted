import { describe, expect, it } from 'vitest'
import {
  normalizeNorwegianAccountNumber,
  isIbanChecksumValid,
  isNorwegianIban,
  norwegianAccountNumberFromIban,
  norwegianIbanFromAccountNumber,
} from '@/lib/identification/iban-no'

describe('ISO 13616 checksum', () => {
  // This is the part that proves conformance to the published standard rather than
  // internal consistency: a real, foreign, check-digit-valid IBAN run through our
  // own arithmetic. If the mod-97 implementation is wrong anywhere, this fails.
  it('accepts a known-valid IBAN from another country', () => {
    expect(isIbanChecksumValid('GB82WEST12345698765432')).toBe(true)
  })

  it('rejects a broken check digit, including a single transposed digit', () => {
    expect(isIbanChecksumValid('GB82WEST12345698765433')).toBe(false)
    expect(isIbanChecksumValid('GB83WEST12345698765432')).toBe(false)
  })

  it('tolerates spaces and hyphens, which is how users type them', () => {
    expect(isIbanChecksumValid('GB82 WEST 1234 5698 7654 32')).toBe(true)
    expect(isIbanChecksumValid('gb82west12345698765432')).toBe(true)
  })

  it('rejects malformed input before doing arithmetic', () => {
    expect(isIbanChecksumValid('')).toBe(false)
    expect(isIbanChecksumValid('NO938601')).toBe(false)
    expect(isIbanChecksumValid('123456789012345678901234')).toBe(false)
  })
})

describe('Norwegian IBAN structure', () => {
  it('is exactly NO + 2 check digits + an 11-digit account number', () => {
    // Built by our own generator, so this proves structure and round-tripping —
    // NOT that we match a specific Norwegian bank's real check digits.
    const account = '12345678901'
    const iban = norwegianIbanFromAccountNumber(account)
    expect(iban).toMatch(/^NO\d{2}12345678901$/)
    expect(iban).toHaveLength(15)
    expect(isNorwegianIban(iban)).toBe(true)
  })

  it('round-trips an account number through the IBAN', () => {
    const account = '93860101100'
    const iban = norwegianIbanFromAccountNumber(account)
    expect(iban).not.toBeNull()
    expect(norwegianAccountNumberFromIban(iban!)).toBe(account)
  })

  it('does not call a German or Swedish IBAN Norwegian', () => {
    // Structural rejection happens before any arithmetic, which is the point:
    // a Norwegian field must not accept an account that belongs elsewhere.
    expect(isNorwegianIban('DE89370400440532013000')).toBe(false)
    expect(isNorwegianIban('SE4550000000058398257466')).toBe(false)
  })

  it('rejects an account number with a leading zero', () => {
    // Norwegian account numbers begin with the bank identifier, never 0. A zero
    // here is a mistyped or padded value, not a Norwegian account.
    expect(norwegianIbanFromAccountNumber('02345678901')).toBeNull()
    expect(isNorwegianIban('NO9302345678901')).toBe(false)
  })

  it('rejects a Norwegian-shaped IBAN whose check digits are wrong', () => {
    // Right shape, arithmetic says no. This is the case a length-only regex lets
    // through, and the reason `connection-iban.ts` is not validation.
    expect(isNorwegianIban('NO0012345678901')).toBe(false)
  })

  it('rejects the wrong length in both directions', () => {
    expect(isNorwegianIban('NO93860101100')).toBe(false)
    expect(isNorwegianIban('NO938601011001000')).toBe(false)
  })
})

describe('Norwegian account number normalisation', () => {
  it('returns the 11 digits and strips every separator the user can type', () => {
    expect(normalizeNorwegianAccountNumber('12345678901')).toBe('12345678901')
    expect(normalizeNorwegianAccountNumber('1234.567.8901')).toBe('12345678901')
    expect(normalizeNorwegianAccountNumber('1234 567 8901')).toBe('12345678901')
    expect(normalizeNorwegianAccountNumber('1234-567-8901')).toBe('12345678901')
  })

  it('does not attempt a display grouping', () => {
    // Deliberate. The printed grouping is a bank convention with no source here,
    // and this assertion exists so nobody reintroduces one as a guess.
    const result = normalizeNorwegianAccountNumber('1234.567.8901')!
    expect(result).not.toMatch(/[.\- ]/)
  })

  it('returns null rather than accepting something that is not an account number', () => {
    expect(normalizeNorwegianAccountNumber('1234567890')).toBeNull()
    expect(normalizeNorwegianAccountNumber('123456789012')).toBeNull()
    expect(normalizeNorwegianAccountNumber('abcdefghijk')).toBeNull()
    expect(normalizeNorwegianAccountNumber('02345678901')).toBeNull()
  })
})
