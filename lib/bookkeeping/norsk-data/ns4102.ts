/**
 * NS 4102 — Norsk standard kontoplan, aksjeselskaper.
 *
 * STATUS — read this before using the chart
 *
 * Classes 1–7 below are transcribed from the standard's own numbering and account
 * names. **Class 8 is absent, deliberately.** The finance accounts were not obtained
 * from a source reliable enough to post against, and a chart is exactly the artifact
 * where a plausible wrong number is worse than a missing one: it looks correct, it
 * passes every type check, and then it survives into vouchers and annual reports for
 * years.
 *
 * The consequence is real, not cosmetic. A company seeded from this chart can post
 * its balance sheet and its operating result, but it cannot post interest, currency
 * results or tax. Until class 8 lands there is no usable Norwegian chart, which is
 * why `NS4102_IS_COMPLETE` is false and no seeding path may settle for less.
 *
 * SHAPE
 *
 * BAS spells out every field for each of ~1,276 accounts. That is faithful to BAS,
 * whose accounts genuinely vary. NS 4102 is not: the class determines the account
 * type and the normal balance, and groups are contiguous ranges. Repeating
 * `account_type: 'asset'` four hundred times would add nothing and would create a new
 * failure mode — a row whose declared type contradicts the class rule the standard
 * applies. So the rules live once below and the table carries number and name, which
 * is what the standard itself specifies.
 *
 * `sru_code` and `k2_excluded` are absent on purpose. SRU is a Swedish reporting code
 * and K2 is a Swedish framework; the Norwegian equivalents belong in their own
 * modules, not onto this row.
 *
 * There is no 9xxx block, and BAS stops at 8999 for the same reason: result totals
 * are computed by the report rather than posted, and a posting account that must
 * always equal a computed total is an invitation for the two to disagree.
 */

export interface NorwegianAccountReference {
  account_number: string
  account_name: string
  account_class: number
  account_group: string
  /** Derived from CLASS_RULES plus the class-2 split, never declared per row. */
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  /** Derived from the class rule. */
  normal_balance: 'debit' | 'credit'
  description: string
  /** SRU is Swedish; the Norwegian reporting mapping is a separate module. */
  sru_code: null
  /** K2 is Swedish; regnskapsloven has no per-account equivalent. */
  k2_excluded: false
}

/**
 * What the first digit means. 1000–2999 are balance accounts, 3000–8999 result
 * accounts. Classes 6 and 7 are both operating costs and differ only in grouping, so
 * they share a rule.
 */
const CLASS_RULES = {
  1: { type: 'asset', balance: 'debit', heading: 'EIENDELER' },
  2: { type: 'liability', balance: 'credit', heading: 'EGENKAPITAL OG GJELD' },
  3: { type: 'revenue', balance: 'credit', heading: 'SALGS- OG DRIFTSINNTEKT' },
  4: { type: 'expense', balance: 'debit', heading: 'VAREKOSTNAD' },
  5: { type: 'expense', balance: 'debit', heading: 'LØNNSKOSTNAD' },
  6: { type: 'expense', balance: 'debit', heading: 'ANNEN DRIFTSKOSTNAD, AV- OG NEDSKRIVNING' },
  7: { type: 'expense', balance: 'debit', heading: 'ANNEN DRIFTSKOSTNAD' },
  8: { type: 'expense', balance: 'debit', heading: 'FINANSINNTEKTER OG -KOSTNADER' },
} as const satisfies Record<number, { type: string; balance: string; heading: string }>

/**
 * Class 2 is the one genuinely mixed class: 20xx is equity and 21xx is provisions that
 * present with equity; the rest is debt. Deciding that here is what keeps every row
 * from carrying a type its own numbering already answers.
 */
function accountTypeOf(digits: string): NorwegianAccountReference['account_type'] {
  if (digits[0] === '2') {
    const group = digits.slice(0, 2)
    return group === '20' || group === '21' ? 'equity' : 'liability'
  }
  return CLASS_RULES[Number(digits[0]) as keyof typeof CLASS_RULES]
    .type as NorwegianAccountReference['account_type']
}

/** Group headings, used for descriptions and for the account browser. */
const GROUP_HEADINGS: Record<string, string> = {
  '10': 'Immaterielle eiendeler',
  '11': 'Tomter, bygninger og annen fast eiendom',
  '12': 'Transportmidler, inventar og maskiner',
  '13': 'Finansielle anleggsmidler',
  '14': 'Varelager og forskudd til leverandører',
  '15': 'Kortsiktige fordringer',
  '16': 'Merverdiavgift og krav på offentlige tilskudd',
  '17': 'Forskuddsbetalt kostnad og påløpt inntekt',
  '18': 'Kortsiktige finansinvesteringer',
  '19': 'Bankinnskudd, kontanter og lignende',
  '20': 'Egenkapital',
  '21': 'Avsetning for forpliktelser',
  '22': 'Annen langsiktig gjeld',
  '23': 'Kortsiktig gjeld til kredittinstitusjoner',
  '24': 'Leverandørgjeld',
  '25': 'Betalbar skatt',
  '26': 'Skattetrekk og andre trekk',
  '27': 'Skyldige offentlige avgifter',
  '28': 'Utbytte',
  '29': 'Annen kortsiktig gjeld',
  '30': 'Salgsinntekt, avgiftspliktig',
  '31': 'Salgsinntekt, avgiftsfri',
  '32': 'Salgsinntekt utenfor avgiftsområdet',
  '33': 'Offentlig avgift vedrørende omsetning',
  '34': 'Offentlig tilskudd eller refusjon',
  '35': 'Uoppgjort inntekt',
  '36': 'Leieinntekt',
  '37': 'Provisjonsinntekt',
  '38': 'Gevinst ved avgang av anleggsmidler',
  '39': 'Annen driftsrelatert inntekt',
  '40': 'Forbruk av råvarer og halvfabrikata',
  '41': 'Forbruk av varer under tilvirkning',
  '42': 'Forbruk av ferdig tilvirkede varer',
  '43': 'Forbruk av innkjøpte varer for videresalg',
  '45': 'Fremmedytelse og underentreprise',
  '49': 'Annen periodisering',
  '50': 'Lønn til ansatte',
  '51': 'Feriepenger',
  '52': 'Fordel i arbeidsforhold',
  '53': 'Annen oppgavepliktig godtgjørelse',
  '54': 'Arbeidsgiveravgift og pensjonskostnad',
  '55': 'Annen kostnadsgodtgjørelse',
  '56': 'Arbeidsgodtgjørelse til eiere',
  '57': 'Offentlig tilskudd vedrørende arbeidskraft',
  '58': 'Offentlig refusjon vedrørende arbeidskraft',
  '59': 'Annen personalkostnad',
  '60': 'Av- og nedskrivning',
  '61': 'Frakt og transport vedrørende salg',
  '62': 'Energi, brensel og vann',
  '63': 'Kostnad lokaler',
  '64': 'Leie av maskiner og inventar',
  '65': 'Verktøy, inventar og driftsmateriale',
  '66': 'Reparasjon og vedlikehold',
  '67': 'Eksterne tjenester',
  '68': 'Kontorkostnad, tryksaker og kurs',
  '69': 'Telefon og porto',
  '70': 'Kostnad transportmidler',
  '71': 'Reise, diett og bilgodtgjørelse',
  '72': 'Provisjonskostnad',
  '73': 'Salg, reklame og representasjon',
  '74': 'Kontingent og gave',
  '75': 'Forsikring, garanti og service',
  '76': 'Lisens- og patentkostnad',
  '77': 'Annen driftskostnad',
  '78': 'Tap',
}

/**
 * The chart: one `number name` line per account. Everything else is derived.
 *
 * Names keep the standard's own wording so this reads like the chart any Norwegian
 * auditor or bank will compare it against.
 */
const CHART_TEXT = `
1000 Forskning og utvikling
1020 Konsesjoner
1030 Patenter
1040 Lisenser
1050 Varemerker
1060 Andre rettigheter
1070 Utsatt skattfordel
1080 Goodwill
1100 Bygninger
1120 Bygningsmessige anlegg
1130 Anlegg under utførelse
1140 Jord- og skogbrukseiendommer
1150 Tomter og andre grunnarealer
1160 Boliger inklusive tomter
1200 Maskiner og anlegg
1210 Maskiner og anlegg under utførelse
1220 Skip, rigger, fly
1230 Biler
1240 Andre transportmidler
1250 Inventar
1260 Bygninger med annen avskrivningstid
1270 Verktøy mv.
1280 Kontormaskiner
1300 Investeringer i datterselskaper
1310 Investeringer annet foretak i samme konsern
1320 Lån til foretak samme konsern
1330 Investeringer i tilknyttede selskap
1340 Lån til tilknyttede selskap
1350 Investeringer i aksjer og eiendeler
1360 Obligasjoner
1370 Fordringer på eiere og styremedlemmer
1380 Fordringer på ansatte
1390 Andre fordringer
1400 Råvarer og innkjøpte halvfabrikater
1420 Varer under utvikling
1440 Ferdige egentilvirkede varer
1460 Innkjøpte varer for videresalg
1480 Forskuddsbetaling til leverandører
1500 Kundefordringer
1530 Opptjent ikke fakturert inntekt
1550 Kundefordringer på selskap samme konsern
1560 Andre fordringer på selskap samme konsern
1580 Avsetning tap på fordringer
1600 Utgående merverdiavgift
1601 Utgående merverdiavgift høy sats
1602 Utgående merverdiavgift kjøp tjen. fra utlandet
1603 Utgående merverdiavgift middels sats
1604 Utgående merverdiavgift lav sats
1610 Inngående merverdiavgift
1611 Inngående merverdiavgift høy sats
1612 Inngående merverdiavgift kjøp tjen. fra utlandet
1613 Inngående merverdiavgift middels sats
1614 Inngående merverdiavgift lav sats
1620 Investeringsavgift
1630 Grunnlag investeringsavgift
1640 Oppgjørskonto merverdiavgift
1670 Krav på offentlige tilskudd
1700 Forskuddsbetalte leier
1710 Forskuddsbetalte renter
1750 Påløpte leier
1760 Påløpte renter
1780 Krav på innbetaling av selskapskapital
1790 Interimskonto
1800 Aksjer og andeler i foretak samme konsern
1810 Markedsbaserte aksjer
1820 Andre aksjer
1830 Markedsbaserte obligasjoner
1840 Andre obligasjoner
1850 Markedsbaserte obligasjoner
1860 Andre sertifikater
1870 Andre markedsbaserte finansielle instrumenter
1880 Andre finansielle instrumenter
1900 Kontanter
1910 Kasse
1920 Bankinnskudd
1950 Bankinnskudd for skattetrekk

2000 Aksjekapital
2010 Egne aksjer
2020 Overkursfond
2040 Fond for vurderingsforskjeller
2050 Annen egenkapital
2080 Udekket tap
2100 Pensjonsforpliktelser
2120 Utsatt skatt
2160 Uopptjent inntekt
2180 Andre avsetninger for forpliktelser
2200 Konvertible lån
2210 Obligasjonslån
2220 Gjeld til kredittinstitusjoner
2240 Pantelån
2260 Gjeld til selskap i samme konsern
2270 Andre valutalån
2280 Stille interessentinnskudd og ansvarlig lånekapital
2300 Konvertible lån
2320 Serieforsedlelån
2340 Andre valutalån
2360 Byggelån
2380 Kassekreditt
2400 Leverandørgjeld
2460 Leverandørgjeld til selskap i samme konsern
2500 Betalbar skatt, ikke utlignet
2510 Betalbar skatt, utlignet
2530 Refusjon skatt etter skatteloven § 31 femte ledd
2540 Forhåndsskatt
2600 Forskuddstrekk
2610 Påleggstrekk
2620 Bidragstrekk
2630 Trygdetrekk
2640 Forsikringstrekk
2650 Trukket fagforeningskontingent
2700 Utgående merverdiavgift
2701 Utgående merverdiavgift høy sats
2702 Utgående merverdiavgift kjøp tjen. fra utlandet
2703 Utgående merverdiavgift middels sats
2704 Utgående merverdiavgift lav sats
2710 Inngående merverdiavgift
2711 Inngående merverdiavgift høy sats
2712 Inngående merverdiavgift kjøp tjen. fra utlandet
2713 Inngående merverdiavgift middels sats
2714 Inngående merverdiavgift lav sats
2720 Investeringsavgift
2730 Grunnlag investeringsavgift
2740 Oppgjørskonto merverdiavgift
2770 Skyldig arbeidsgiveravgift
2780 Påløpt arbeidsgiveravgift
2800 Avsatt utbytte
2900 Forskudd fra kunder
2910 Gjeld til ansatte og eiere
2920 Gjeld til selskap i samme konsern
2930 Lønn
2940 Feriepenger
2950 Påløpte renter
2960 Påløpt kostnad og forskuddsbetalt inntekt
2970 Uopptjent inntekt
2980 Avsetninger og forpliktelser

3000 Salgsinntekt handelsvarer avgiftspliktig høy sats
3010 Salgsinntekt egentilvirkede varer avgiftspliktig høy sats
3020 Salgsinntekt tjenester avgiftspliktig høy sats
3030 Salgsinntekt handelsvarer avgiftspliktig middels sats
3040 Salgsinntekt egentilvirkede varer avgiftspliktig middels sats
3050 Salgsinntekt tjenester avgiftspliktig lav sats
3060 Uttak av varer avgiftspliktig høy sats
3063 Uttak av varer avgiftspliktig middels sats
3070 Uttak av tjenester avgiftspliktig høy sats
3074 Uttak av tjenester avgiftspliktig lav sats
3080 Rabatter og annen salgsinntektsreduksjon avgiftspliktig
3090 Refunderbare utlegg for kjøpers regning avgiftspliktig
3100 Salgsinntekt handelsvarer avgiftsfri
3110 Salgsinntekt egentilvirkede varer avgiftsfri
3120 Salgsinntekt tjenester avgiftsfri
3160 Uttak av varer avgiftsfritt
3180 Rabatter og annen salgsinntektsreduksjon avgiftsfri
3190 Refunderbare utlegg for kjøpers regning avgiftsfri
3200 Salgsinntekt handelsvarer utenfor avgiftsområdet
3210 Salgsinntekt egentilvirkede varer utenfor avgiftsområdet
3220 Salgsinntekt tjenester utenfor avgiftsområdet
3260 Uttak av varer utenfor avgiftsområdet
3280 Rabatter og annen salgsinntektsreduksjon
3300 Spesiell offentlig avgift på tilvirkkede og solgte varer avgiftspliktig
3301 Spesiell offentlig avgift på tilvirkkede og solgte varer avgiftsfritt
3302 Avgift på visse varer avgiftspliktig
3303 Avgift på visse varer avgiftsfritt
3400 Spesielt offentlig tilskudd for tilvirkkede og solgte varer
3440 Spesielt offentlig tilskudd for tjenester
3500 Garanti
3510 Service
3600 Leieinntekt fast eiendom
3610 Leieinntekt andre varige driftsmidler
3620 Annen leieinntekt
3700 Provisjonsinntekt
3800 Gevinst ved avgang av anleggsmidler
3900 Annen driftsrelatert inntekt avgiftspliktig
3910 Utgående porto avgiftspliktig
3920 Utgående gebyrer avgiftspliktig
3950 Annen driftsrelatert inntekt avgiftsfritt
3960 Utgående porto avgiftsfritt
3970 Utgående gebyrer avgiftsfritt

4000 Innkjøp av råvarer og halvfabrikata høy sats
4030 Innkjøp av råvarer og halvfabrikata middels sats
4060 Frakt, toll og spedisjon
4070 Innkjøpsprisreduksjon
4090 Beholdningsendring
4100 Innkjøp varer under tilvirkning høy sats
4130 Innkjøp varer under tilvirkning middels sats
4160 Frakt, toll og spedisjon
4170 Innkjøpsprisreduksjon
4190 Beholdningsendring
4200 Innkjøp ferdig egentilvirkede varer høy sats
4230 Innkjøp ferdig egentilvirkede varer middels sats
4260 Frakt, toll og spedisjon
4270 Innkjøpsprisreduksjon avgiftspliktig
4290 Beholdningsendring
4300 Innkjøp varer for videresalg høy sats
4330 Innkjøp varer for videresalg middels sats
4360 Frakt, toll og spedisjon
4370 Innkjøpsprisreduksjon
4390 Beholdningsendring
4500 Fremmedytelser og underentreprise
4590 Beholdningsendring
4900 Annen periodisering
4990 Beholdningsendring

5000 Lønn til ansatte
5090 Periodiseringskonto lønn
5180 Feriepenger beregnet
5182 Arbeidsgiveravgift påløpte feriepenger
5200 Fri bil
5210 Fri telefon
5220 Fri avis
5230 Fri losji og bolig
5240 Rentefordel
5280 Annen fordel i arbeidsforhold
5290 Motkonto for gruppe 52
5300 Tantieme
5330 Godtgjørelse til styre- og bedriftsforsamling
5400 Arbeidsgiveravgift
5420 Innberetningspliktig pensjonskostnad
5500 Annen kostnadsgodtgjørelse
5600 Arbeidsgodtgjørelse til eiere i AS og DA
5700 Lærlingtilskudd
5800 Refusjon av sykepenger
5820 Refusjon av arbeidsgiveravgift
5900 Gaver til ansatte
5910 Kantinekostnader
5920 Yrkesskadeforsikring
5930 Andre forsikringer

6000 Avskrivning på bygninger og annen fast eiendom
6010 Avskrivning på transportmidler, maskiner og inventar
6020 Avskrivning på immaterielle eiendeler
6050 Nedskrivning av varige driftsmidler
6100 Frakt, transportkostnad og forsikring
6110 Toll og spedisjonskostnad
6200 Elektrisitet
6210 Gass
6220 Fyringsolje
6230 Kull, koks
6240 Ved
6250 Bensin, dieselolje
6260 Vann
6300 Leie lokaler
6320 Renovasjon, vann, avløp
6340 Lys, varme
6360 Renhold
6400 Leie maskiner
6410 Leie inventar
6420 Leie datasystemer
6430 Leie andre kontormaskiner
6440 Leie transportmidler
6500 Motordrevet verktøy
6510 Håndverktøy
6520 Hjelpeverktøy
6530 Spesialverktøy
6540 Inventar
6550 Driftsmateriale
6560 Rekvisita
6570 Arbeidsklær og verneutstyr
6600 Reparasjon og vedlikehold bygninger
6620 Reparasjon og vedlikehold utstyr
6700 Revisjons- og regnskapshonorarer
6720 Honorarer for økonomisk og juridisk bistand
6800 Kontorrekvisita
6820 Trykksaker
6840 Aviser og tidsskrifter, bøker
6860 Møte, kurs, oppdatering
6900 Telefon
6940 Porto

7000 Drivstoff
7020 Vedlikehold
7040 Forsikringer
7100 Bilgodtgjørelse, oppgavepliktig
7130 Reisekostnad, oppgavepliktig
7140 Reisekostnad, ikke oppgavepliktig
7150 Diettkostnader, oppgavepliktig
7160 Diettkostnader, ikke oppgavepliktig
7200 Provisjonskostnader, oppgavepliktig
7210 Provisjonskostnader, ikke oppgavepliktig
7300 Salgskostnad
7320 Reklamekostnad
7350 Representasjon, fradragsberettiget
7360 Representasjon, ikke fradragsberettiget
7400 Kontingenter, fradragsberettiget
7410 Kontingenter, ikke fradragsberettiget
7420 Gaver, fradragsberettiget
7430 Gaver, ikke fradragsberettiget
7500 Forsikringspremie
7550 Garantikostnad
7560 Servicekostnad
7600 Lisensavgifter og royalties
7610 Patentkostnad ved egen patent
7620 Kostnader ved varemerker
7630 Kontroll-, prøve- og stempelavgifter
7700 Styre- og bedriftsforsamlingsmøter
7710 Generalforsamling
7730 Kostnader ved egne aksjer
7740 Øreavrundning merverdiavgift — oppgjør
7745 Øreavrundning avgiftspliktig
7746 Øreavrundning avgiftsfritt
7750 Eiendoms- og festeavgifter
7770 Bank- og kortgebyrer
7780 Renter og gebyrer inkasso
7800 Tap ved avgang av driftsmidler
7820 Innkommet på tidligere nedskrevne fordringer
7830 Tap på fordringer
7860 Tap på kontrakter

// Class 8 is intentionally absent — see the header. A company seeded from this chart
// cannot post interest, currency results or tax, so it is not a usable chart yet.
`

/**
 * Parses `number name` lines into typed rows.
 *
 * Parsing is deliberate: the table above is what a human compares against the
 * standard, and deriving everything else removes the kind of row where the declared
 * type quietly disagrees with the class. A malformed line throws rather than being
 * skipped, because a skipped line is a missing account that looks present.
 */
function parseChart(text: string): NorwegianAccountReference[] {
  const rows: NorwegianAccountReference[] = []
  const byNumber = new Map<string, string>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue
    const match = /^(\d{4})\s+(.+)$/.exec(trimmed)
    if (!match) throw new Error(`Unparsable NS 4102 row: ${JSON.stringify(trimmed)}`)
    const [, number, name] = match
    const prior = byNumber.get(number)
    if (prior) {
      throw new Error(
        `Duplicate NS 4102 account number ${number}: "${prior}" and "${name}". ` +
          'One number denoting two accounts silently merges two different things.',
      )
    }
    byNumber.set(number, name)
    const group = number.slice(0, 2)
    const cls = Number(number[0])
    rows.push({
      account_number: number,
      account_name: name,
      account_class: cls,
      account_group: group,
      account_type: accountTypeOf(number),
      normal_balance: CLASS_RULES[cls as keyof typeof CLASS_RULES]
        .balance as NorwegianAccountReference['normal_balance'],
      description: GROUP_HEADINGS[group] ? `${GROUP_HEADINGS[group]}: ${name}` : name,
      sru_code: null,
      k2_excluded: false,
    })
  }
  return rows
}

export const NS4102_REFERENCE: NorwegianAccountReference[] = parseChart(CHART_TEXT)

export const NS4102_GROUPS: readonly string[] = Object.keys(GROUP_HEADINGS)

export function ns4102AccountName(accountNumber: string): string | null {
  return NS4102_REFERENCE.find((a) => a.account_number === accountNumber)?.account_name ?? null
}

/**
 * Whether the chart can serve a company completely. False while class 8 is missing:
 * interest, currency results and tax would have nowhere to go. A partially sourced
 * chart is not a usable chart, and this flag is what stops a seeding path from
 * discovering that at a deadline instead of in review.
 */
export const NS4102_IS_COMPLETE = false
