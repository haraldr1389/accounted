/**
 * EU member states reference data.
 *
 * Used by core VAT logic and export extensions for:
 * - Filtering EU vs non-EU customers
 * - VIES VAT number validation (country prefix)
 * - Intrastat partner country lookup
 * - EC Sales List country grouping
 */

export interface EUCountry {
  code: string       // ISO 3166-1 alpha-2
  name: string       // Swedish name
  nameEn: string     // English name
  nameNo: string     // Norwegian (bokmål) name
  vatPrefix: string  // VIES VAT number prefix
  currency: string   // Primary currency
}

/**
 * All 27 EU member states (as of 2025).
 * Sweden (SE) is included but should be filtered out for intra-community checks.
 */
export const EU_COUNTRIES: EUCountry[] = [
  { code: 'AT', name: 'Österrike', nameEn: 'Austria', vatPrefix: 'AT', currency: 'EUR', nameNo: 'Østerrike' },
  { code: 'BE', name: 'Belgien', nameEn: 'Belgium', vatPrefix: 'BE', currency: 'EUR', nameNo: 'Belgia' },
  { code: 'BG', name: 'Bulgarien', nameEn: 'Bulgaria', vatPrefix: 'BG', currency: 'BGN', nameNo: 'Bulgaria' },
  { code: 'HR', name: 'Kroatien', nameEn: 'Croatia', vatPrefix: 'HR', currency: 'EUR', nameNo: 'Kroatia' },
  { code: 'CY', name: 'Cypern', nameEn: 'Cyprus', vatPrefix: 'CY', currency: 'EUR', nameNo: 'Kypros' },
  { code: 'CZ', name: 'Tjeckien', nameEn: 'Czech Republic', vatPrefix: 'CZ', currency: 'CZK', nameNo: 'Tsjekkia' },
  { code: 'DK', name: 'Danmark', nameEn: 'Denmark', vatPrefix: 'DK', currency: 'DKK', nameNo: 'Danmark' },
  { code: 'EE', name: 'Estland', nameEn: 'Estonia', vatPrefix: 'EE', currency: 'EUR', nameNo: 'Estland' },
  { code: 'FI', name: 'Finland', nameEn: 'Finland', vatPrefix: 'FI', currency: 'EUR', nameNo: 'Finland' },
  { code: 'FR', name: 'Frankrike', nameEn: 'France', vatPrefix: 'FR', currency: 'EUR', nameNo: 'Frankrike' },
  { code: 'DE', name: 'Tyskland', nameEn: 'Germany', vatPrefix: 'DE', currency: 'EUR', nameNo: 'Tyskland' },
  { code: 'GR', name: 'Grekland', nameEn: 'Greece', vatPrefix: 'EL', currency: 'EUR', nameNo: 'Hellas' },
  { code: 'HU', name: 'Ungern', nameEn: 'Hungary', vatPrefix: 'HU', currency: 'HUF', nameNo: 'Ungarn' },
  { code: 'IE', name: 'Irland', nameEn: 'Ireland', vatPrefix: 'IE', currency: 'EUR', nameNo: 'Irland' },
  { code: 'IT', name: 'Italien', nameEn: 'Italy', vatPrefix: 'IT', currency: 'EUR', nameNo: 'Italia' },
  { code: 'LV', name: 'Lettland', nameEn: 'Latvia', vatPrefix: 'LV', currency: 'EUR', nameNo: 'Latvia' },
  { code: 'LT', name: 'Litauen', nameEn: 'Lithuania', vatPrefix: 'LT', currency: 'EUR', nameNo: 'Litauen' },
  { code: 'LU', name: 'Luxemburg', nameEn: 'Luxembourg', vatPrefix: 'LU', currency: 'EUR', nameNo: 'Luxembourg' },
  { code: 'MT', name: 'Malta', nameEn: 'Malta', vatPrefix: 'MT', currency: 'EUR', nameNo: 'Malta' },
  { code: 'NL', name: 'Nederländerna', nameEn: 'Netherlands', vatPrefix: 'NL', currency: 'EUR', nameNo: 'Nederland' },
  { code: 'PL', name: 'Polen', nameEn: 'Poland', vatPrefix: 'PL', currency: 'PLN', nameNo: 'Polen' },
  { code: 'PT', name: 'Portugal', nameEn: 'Portugal', vatPrefix: 'PT', currency: 'EUR', nameNo: 'Portugal' },
  { code: 'RO', name: 'Rumänien', nameEn: 'Romania', vatPrefix: 'RO', currency: 'RON', nameNo: 'Romania' },
  { code: 'SK', name: 'Slovakien', nameEn: 'Slovakia', vatPrefix: 'SK', currency: 'EUR', nameNo: 'Slovakia' },
  { code: 'SI', name: 'Slovenien', nameEn: 'Slovenia', vatPrefix: 'SI', currency: 'EUR', nameNo: 'Slovenia' },
  { code: 'ES', name: 'Spanien', nameEn: 'Spain', vatPrefix: 'ES', currency: 'EUR', nameNo: 'Spania' },
  { code: 'SE', name: 'Sverige', nameEn: 'Sweden', vatPrefix: 'SE', currency: 'SEK', nameNo: 'Sverige' },
]

const EU_COUNTRY_CODES = new Set(EU_COUNTRIES.map((c) => c.code))

/**
 * True when the ISO 3166-1 alpha-2 code is an EU member state. Case
 * insensitive. Sweden (SE) counts as a member: callers that need "another
 * EU country" must test SE separately first.
 */
export function isEuMemberCountry(code: string): boolean {
  return EU_COUNTRY_CODES.has(code.toUpperCase())
}
