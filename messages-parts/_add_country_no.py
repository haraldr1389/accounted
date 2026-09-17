#!/usr/bin/env python3
"""Add Norwegian (`nameNo`) to EU and non-EU country tables, and widen
getCountryName to accept the 'no' locale."""
import re
from pathlib import Path

REPO = Path('/Users/harald/projects/accounted')

NO = {
    'AT': 'Østerrike', 'BE': 'Belgia', 'BG': 'Bulgaria', 'CY': 'Kypros',
    'CZ': 'Tsjekkia', 'DE': 'Tyskland', 'DK': 'Danmark', 'EE': 'Estland',
    'ES': 'Spania', 'FI': 'Finland', 'FR': 'Frankrike', 'GR': 'Hellas',
    'HR': 'Kroatia', 'HU': 'Ungarn', 'IE': 'Irland', 'IT': 'Italia',
    'LT': 'Litauen', 'LU': 'Luxembourg', 'LV': 'Latvia', 'MT': 'Malta',
    'NL': 'Nederland', 'PL': 'Polen', 'PT': 'Portugal', 'RO': 'Romania',
    'SE': 'Sverige', 'SI': 'Slovenia', 'SK': 'Slovakia',
    'NO': 'Norge', 'GB': 'Storbritannia', 'CH': 'Sveits', 'IS': 'Island',
    'LI': 'Liechtenstein', 'US': 'USA', 'CA': 'Canada', 'MX': 'Mexico',
    'BR': 'Brasil', 'AU': 'Australia', 'NZ': 'New Zealand', 'JP': 'Japan',
    'CN': 'Kina', 'HK': 'Hongkong', 'KR': 'Sør-Korea', 'IN': 'India',
    'SG': 'Singapore', 'TH': 'Thailand', 'AE': 'De forente arabiske emirater',
    'IL': 'Israel', 'TR': 'Tyrkia', 'UA': 'Ukraina', 'RS': 'Serbia',
    'ZA': 'Sør-Afrika', 'CO': 'Colombia', 'CW': 'Curaçao',
    'KN': 'Saint Kitts og Nevis',
}

# ---- eu-countries.ts ----
eu = REPO/'lib'/'vat'/'eu-countries.ts'
t = eu.read_text(encoding='utf-8')

t = t.replace(
    """export interface EUCountry {
  code: string       // ISO 3166-1 alpha-2
  name: string       // Swedish name
  nameEn: string     // English name""",
    """export interface EUCountry {
  code: string       // ISO 3166-1 alpha-2
  name: string       // Swedish name
  nameEn: string     // English name
  nameNo: string     // Norwegian (bokmål) name""",
)

def add_no_eu(m):
    code = m.group(1)
    if code not in NO:
        raise SystemExit(f'missing Norwegian name for {code}')
    return m.group(0).rstrip()[:-2] + f", nameNo: '{NO[code]}' }},"

pat_eu = re.compile(r"\{ code: '([A-Z]{2})', name: '[^']*', nameEn: '[^']*', vatPrefix: '[^']*', currency: '[^']*' \},")
t, n_eu = pat_eu.subn(add_no_eu, t)
eu.write_text(t, encoding='utf-8')
print(f'eu-countries.ts: {n_eu} entries got nameNo')

# ---- country-codes.ts ----
cc = REPO/'lib'/'vat'/'country-codes.ts'
t = cc.read_text(encoding='utf-8')

t = t.replace(
    """export interface CountryOption {
  /** ISO 3166-1 alpha-2 */
  code: string
  /** Swedish name */
  name: string
  /** English name */
  nameEn: string
}""",
    """export interface CountryOption {
  /** ISO 3166-1 alpha-2 */
  code: string
  /** Swedish name */
  name: string
  /** English name */
  nameEn: string
  /** Norwegian (bokmål) name */
  nameNo: string
}""",
)

# map EU countries through with nameNo
t = t.replace(
    "  ...EU_COUNTRIES.map(({ code, name, nameEn }) => ({ code, name, nameEn })),",
    "  ...EU_COUNTRIES.map(({ code, name, nameEn, nameNo }) => ({ code, name, nameEn, nameNo })),",
)

def add_no_non_eu(m):
    code = m.group(1)
    if code not in NO:
        raise SystemExit(f'missing Norwegian name for {code}')
    return m.group(0).rstrip()[:-1] + f", nameNo: '{NO[code]}' }},"

pat_ne = re.compile(r"\{ code: '([A-Z]{2})', name: '[^']*', nameEn: '[^']*' \},")
t, n_ne = pat_ne.subn(add_no_non_eu, t)
print(f'country-codes.ts NON_EU: {n_ne} entries got nameNo')

# widen getCountryName
t = t.replace(
    """export function getCountryName(code: string | null | undefined, locale: 'sv' | 'en' = 'sv'): string {
  if (!code) return ''
  const normalized = normalizeCountryCode(code)
  const option = normalized ? OPTION_BY_CODE.get(normalized) : undefined
  if (!option) return normalized ?? code
  return locale === 'en' ? option.nameEn : option.name
}""",
    """export function getCountryName(
  code: string | null | undefined,
  locale: 'sv' | 'en' | 'no' = 'sv',
): string {
  if (!code) return ''
  const normalized = normalizeCountryCode(code)
  const option = normalized ? OPTION_BY_CODE.get(normalized) : undefined
  if (!option) return normalized ?? code
  if (locale === 'en') return option.nameEn
  if (locale === 'no') return option.nameNo
  return option.name
}""",
)
cc.write_text(t, encoding='utf-8')
print('country-codes.ts: getCountryName widened to no')
