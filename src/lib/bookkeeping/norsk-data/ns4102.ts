/**
 * NS 4102 — Norsk standard kontoplan, both Norwegian legal forms.
 *
 * SOURCE AND EDITION — read this before using the chart
 *
 * Classes 1 through 7 and the class 8 finance block below are transcribed from a
 * published komprimert NS 4102 listing (jithomassen.no, the aksjeselskaper page of
 * 2017 and the enkeltpersonforetak page of 2019). That listing carries the numbering
 * of NS 4102:**2005, which Standard Norge withdrew in November 2023 when it published
 * NS 4102:2023. The current edition is five digits, adds roughly 254 accounts, moves
 * production costs into the 40000-series, replaces oppgavepliktig with
 * innberetningspliktig, and in appendix A maps every single account onto
 * regnskapslovens oppstillingsplan. None of that is reproduced here because none of
 * it is available from a free source, and a chart is exactly the artifact where a
 * plausible wrong number is worse than a missing one.
 *
 * So there is now a usable chart, and the edition is what is still open. It is right
 * for a service business that books no production costs. `NS4102_EDITION` states that
 * where a reader or a report generator will actually look. Upgrading it is a data
 * change and not a semantics change: the class rules, the derivations and the
 * AS/ENK split below all survive a new table of numbers.
 *
 * Two names in the source are doubtful and are NOT silently corrected, they are
 * listed in {@link NS4102_UNRESOLVED_NAMES} so the next person finds them in the
 * code rather than in a bank rejection.
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
 * Class 8 is the other genuinely mixed class, and it is the one the class rule gets
 * wrong on its own: 80xx and 84xx are finance income and extraordinary income, while
 * 81xx, 83xx, 85xx and 86xx are costs. Reading the class alone would book revenue as
 * an expense, which is exactly the failure this module exists to make impossible.
 */
const FINANCE_GROUP_TYPES: Record<string, 'revenue' | 'expense'> = {
  '80': 'revenue',
  '81': 'expense',
  '83': 'expense',
  '84': 'revenue',
  '85': 'expense',
  '86': 'expense',
}

/**
 * Accounts whose normal balance is not the one their class implies. The standard does
 * not state these; double entry does. Deriving them from the class is what would put
 * an owner's drawing on the wrong side of a voucher and leave a balance-sheet
 * allowance on the wrong side of the balance.
 *
 * `2061` through `2078` exist only in the ENK chart. `2062` is the one that looks
 * wrong next to its neighbours: an owner's deposit raises equity, so it is credited
 * even though every account around it is drawn.
 */
const CONTRA_ACCOUNT_BALANCES: Record<string, 'debit' | 'credit'> = {
  '1580': 'credit', // Avsetning tap på fordringer
  '2010': 'debit', // Egne aksjer
  '2080': 'debit', // Udekket tap
  '2061': 'debit',
  '2062': 'credit',
  '2063': 'debit',
  '2064': 'debit',
  '2065': 'debit',
  '2066': 'credit', // Motkonto egen bolig i næringsbygg
  '2067': 'debit',
  '2068': 'debit',
  '2069': 'debit',
  '2071': 'debit',
  '2072': 'debit',
  '2075': 'debit',
  '2077': 'debit',
  '2078': 'debit',
}

function normalBalanceOf(accountNumber: string): 'debit' | 'credit' {
  const override = CONTRA_ACCOUNT_BALANCES[accountNumber]
  if (override) return override
  if (accountNumber[0] === '8') {
    return FINANCE_GROUP_TYPES[accountNumber.slice(0, 2)] === 'revenue' ? 'credit' : 'debit'
  }
  return CLASS_RULES[
    Number(accountNumber[0]) as keyof typeof CLASS_RULES
  ].balance as 'debit' | 'credit'
}

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
  if (digits[0] === '8') {
    return FINANCE_GROUP_TYPES[digits.slice(0, 2)] ?? 'expense'
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
  '79': 'Periodiseringskonto',
  '80': 'Finansinntekt',
  '81': 'Finanskostnad',
  '83': 'Skattekostnad på ordinært resultat',
  '84': 'Ekstraordinær inntekt',
  '85': 'Ekstraordinær kostnad',
  '86': 'Skattekostnad på ekstraordinært resultat',
  '88': 'Årsresultat',
  '89': 'Overføringer og disponeringer',
}

/**
 * The chart: one `number name` line per account. Everything else is derived.
 *
 * Names keep the standard's own wording so this reads like the chart any Norwegian
 * auditor or bank will compare it against.
 */
const CHART_TEXT_AS = `
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

// Class 8 below is the finance block: interest, currency results, tax and the year.
// It carries the numbering and names of the source listing, nothing else.

7900 Beholdningsendring anlegg under utførelse
7910 Ukurante varer
8000 Inntekt på investering i datterselskap
8010 Inntekt på investering i annet foretak i samme konsern
8020 Inntekt på investering i tilknyttet selskap
8030 Renteinntekt på foretak i samme konsern
8040 Renteinntekter, skattefrie
8050 Annen renteinntekt
8060 Valutagevinst (agio)
8070 Annen finansinntekt
8080 Verdiøkning finansielle omløpsmidler
8100 Verdireduksjon finansielle omløpsmidler
8110 Nedskrivning finansielle omløpsmidler
8120 Nedskrivning finansielle anleggsmidler
8130 Rentekostnad foretak i samme konsern
8140 Rentekostnad, ikke fradragsberettiget
8150 Annen rentekostnad
8160 Valutatap (disagio)
8170 Annen finanskostnad
8300 Betalbar skatt
8320 Utsatt skatt
8400 Ekstraordinær inntekt
8500 Ekstraordinær kostnad
8600 Betalbar skatt, ekstraordinært resultat
8620 Utsatt skatt, ekstraordinært resultat
8800 Årsresultat
8900 Overføringsfond vurderingsforskjeller
8910 Overføringsfond felleseid kapital samme foretak
8920 Avsatt utbytte/renter grunnfondsbevis
8930 Konsernbidrag
8940 Aksjonærbidrag
8950 Fondsemisjon
8960 Overføring annen egenkapital
8990 Udekket tap
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
      normal_balance: normalBalanceOf(number),
      description: GROUP_HEADINGS[group] ? `${GROUP_HEADINGS[group]}: ${name}` : name,
      sru_code: null,
      k2_excluded: false,
    })
  }
  return rows
}

/**
 * The chart is transcribed from NS 4102:**2005 (see the header). NS 4102:2023 has
 * been published and replaces it, and it is not available from a free source. This
 * is not a warning about the data being wrong; it is the data being one edition old
 * and saying so.
 */
export const NS4102_EDITION = 'NS 4102:2005 (komprimert)' as const

/**
 * Names the source of itself and the code cannot settle. They are seeded as written
 * because a number has to exist, but they are not trusted.
 *
 * `2320` and `1850` read like the source's own typos (sertifikatlån and
 * *markedsbaserte obligasjoner med kort løpetid* are what the modern charts say),
 * `5600` says ANS where an AS-only chart would name AS and DA, and `7740` carries an
 * em dash that no Norwegian account name should need.
 */
export const NS4102_UNRESOLVED_NAMES: readonly { account_number: string; note: string }[] = [
  { account_number: '2320', note: 'Setifikatlån er trolig sertifikatlån' },
  { account_number: '1850', note: 'Samme navn som 1830, trolig kort løpetid' },
  { account_number: '5600', note: 'ANS i en AS-kontoplan, AS og DA er moderne' },
  { account_number: '7740', note: 'Kilden har en tankestrek i navnet' },
]

/**
 * Accounts that close the year or move equity around. Listed because the standard
 * lists them; not seeded because this engine closes a year by closing the period, and
 * an account that must always equal a computed total is an invitation for the two to
 * disagree. Where the gap is real: a Norwegian company that receives a group
 * contribution or an owner's share premium has no account here, and that is an equity
 * transaction the product cannot yet book. Naming it is the honest option; adding the
 * number would hide the feature gap behind a working-looking posting.
 */
export const NS4102_NON_POSTABLE_ACCOUNTS = [
  '8800',
  '8900',
  '8910',
  '8920',
  '8930',
  '8940',
  '8950',
  '8960',
  '8990',
] as const satisfies readonly string[]

/**
 * What separates the two legal forms. The source states it plainly: the difference is
 * equity and private drawings, and the group accounts are dropped for a sole
 * proprietor. Expressing that as a removal, an addition and one rename keeps 300
 * accounts in one place, which is the only reason the shared ones cannot drift.
 */
const ENK_EXCLUDED_ACCOUNTS = new Set([
  '1300',
  '1310',
  '1320',
  '1330',
  '1340',
  '1800',
  '1910',
  '2000',
  '2010',
  '2020',
  '2040',
  '5300',
  '5330',
  '7700',
  '7710',
  '7730',
  '8000',
  '8010',
  '8020',
  '8030',
])

/** An ENK chart's own accounts: drawings, private expenses and sole-proprietor tax. */
const CHART_TEXT_ENK_ONLY = `
2061 Uttak kontanter
2062 Innskudd kontanter
2063 Uttak av anleggsmidler/driftsmidler
2064 Uttak varer og tjenester
2065 Egen bolig i næringsbygg
2066 Motkonto egen bolig i næringsbygg
2067 Lys og varme privat
2068 Private kostnader til elektronisk kommunikasjon
2069 Diverse andre privatutgifter
2071 Forskuddsskatt
2072 Tilleggsforskudd/restskatt
2075 Privat bruk av næringsbil
2077 Premie til egen syke- og ulykkesforsikring
2078 Premie til tilleggstrygd for sykepenger
2099 Udisponert resultat
5390 Annen oppgavepliktig godtgjørelse
5950 Egen pensjonsordning
7080 Bruk av privat bil i næring
`

/** The one account number both forms share with different names. */
const ENK_ACCOUNT_NAMES: Record<string, string> = {
  '1900': 'Kasse/kontanter',
}

export type NorwegianLegalForm = 'as' | 'enk'

const aksjeselskapRows = parseChart(CHART_TEXT_AS).filter(
  (row) => !NS4102_NON_POSTABLE_ACCOUNTS.includes(row.account_number as (typeof NS4102_NON_POSTABLE_ACCOUNTS)[number]),
)

const enkRows: NorwegianAccountReference[] = [
  ...aksjeselskapRows
    .filter((row) => !ENK_EXCLUDED_ACCOUNTS.has(row.account_number))
    .map((row) => {
      const renamed = ENK_ACCOUNT_NAMES[row.account_number]
      return renamed ? { ...row, account_name: renamed } : row
    }),
  ...parseChart(CHART_TEXT_ENK_ONLY),
].sort((a, b) => a.account_number.localeCompare(b.account_number))

/** The chart an aksjeselskap gets. */
export const NS4102_AKSJESELSKAP: NorwegianAccountReference[] = aksjeselskapRows

/** The chart an enkeltpersonforetak gets. */
export const NS4102_ENKTELTPERSONFORETAK: NorwegianAccountReference[] = enkRows

/** Back-compatible alias: aksjeselskap is the form this chart was first written for. */
export const NS4102_REFERENCE: NorwegianAccountReference[] = NS4102_AKSJESELSKAP

export function ns4102ChartFor(form: NorwegianLegalForm): NorwegianAccountReference[] {
  return form === 'enk' ? NS4102_ENKTELTPERSONFORETAK : NS4102_AKSJESELSKAP
}

export const NS4102_GROUPS: readonly string[] = Object.keys(GROUP_HEADINGS)

export function ns4102AccountName(accountNumber: string): string | null {
  return (
    NS4102_AKSJESELSKAP.find((a) => a.account_number === accountNumber)?.account_name ??
    NS4102_ENKTELTPERSONFORETAK.find((a) => a.account_number === accountNumber)?.account_name ??
    null
  )
}

/**
 * Whether a company can be seeded from this chart and then left alone. It is true
 * now: class 8 exists, so interest, currency results and tax have somewhere to go.
 * What it does *not* claim is that the numbering is current, and `NS4102_EDITION`
 * is where that is said.
 */
export const NS4102_IS_COMPLETE = true
