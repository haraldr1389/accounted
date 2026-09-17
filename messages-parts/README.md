# Norsk oversettelse — arbeidsbenk

Verktøyet som produserte `messages/no.json` og `message_no` i
`lib/errors/structured-errors.ts` for denne forken. Skriptene er beholdt slik at
katalogen kan utvides når upstream legger til nye strenger.

Intermediatfilene (`*.source.json`, `*.target.json`, `leafchunks/`, `fix/`,
`errors/`) er regenererbare arbeidsdata og er ignorert av git (se `.gitignore`).

## Hvorfor bitvis oversettelse

Hele `messages/sv.json` er ~620 KB. Forsøk på å oversette den i store biter
(47–103 KB per agent) feilet konsekvent: agentene traff token-/kontekstgrensen
før de rakk å skrive ferdig. Løsningen er å flate ut katalogen til
dott-stier og dele den i små enheter (≤ 10 KB), oversette hver enhet for seg,
og så bygge den nøstede strukturen tilbake i samme rekkefølge som `sv.json`.

## Rekkefølge

1. **Flat ut og del** — `messages/sv.json` gjøres om til
   `leafchunks/lNNN.source.json` (dott-sti → tekstverdi), maks ~10 KB per fil.
2. **Oversett** — én agent per fil skriver `lNNN.target.json` med samme
   nøkkelsett. Nøkler og plassholdere (`{name}`, `{count}`, ICU-pluraler) skal
   være bit-identiske.
3. **Verifiser** — `_audit.py`, `_audit2.py`, `_audit3.py` leter etter verdier
   som fortsatt er svenske eller nynorske.
4. **Reparer** — `_extract_problems.py` plukker ut alle blader som fortsatt
   inneholder enten en svensk form eller en nynorsk-only form, deler dem i
   bunter i `fix/`, og en runde agenter retter dem til bokmål.
5. **Flett** — `_merge_fixes.py` legger rettelsene tilbake i `messages/no.json`.
6. **Sett sammen** — `_assemble.py` bygger den nøstede strukturen fra alle
   `lNNN.target.json` og skriver `messages/no.json`.
7. **Kvalitetssikring** — `_qa.py` sjekker JSON-gyldighet, nøkkelparitet mot
   `sv.json`, plassholderparitet, ICU-plural-paritet og rester av svensk/nynorsk.

## Feilregisteret

`_extract_errors.py` parser `lib/errors/structured-errors.ts` og plukker ut
`(kode, message_sv)`-par. `/` i regexen må ikke matche inne i
`thrown_message_sv:` — den fellen gir falske «u-parsede» treff.
`_prep_error_batches.py` deler dem i bunter à 20, `_insert_message_no.py` setter
`message_no` inn etter hver `message_sv`.

Merk: én oppføring brukte dobbeltanførselstegn
(`BOLAGSVERKET_INVALID_ENVIRONMENT`) og ble derfor ikke plukket opp av parseren;
den er rettet manuelt.

## Kvalitetsfeller som ble fanget

- **Nynorsk-kontaminering.** Flere agenter skrev nynorsk i stedet for bokmål
  (f.eks. «Utgjekk automatisk etter 30 dagar utan tiltak. Ingenting vart
  bokført.»). 1330 blader måtte rettes. Sjekk alltid med `_audit3.py` etter en
  oversettelsesrunde.
- **Uoversatte seksjoner.** `l028` returnerte «OK», men hadde i praksis kopiert
  den svenske kilden for hele `import.*`-delen (113 av 136 nøkler uendret).
  Nøkkelsett-paritet er derfor ikke nok — verdiene må også sammenlignes mot
  kilden.
- **Diakritikk i landnavn.** `foldName()` fjerner ikke aksenter, så norske
  skrivemåter må legges inn som egne oppslag (`nameNo`), ikke som aliaser.
- **SQL-tvillingen.** `public.normalize_country_code(text)` i migrasjon
  `20260903173000` bærer sin egen kopi av landnavn-tabellen, og
  `country-codes-sql-parity.test.ts` krever eksakt mengdelikhet. Den må
  regenereres hver gang navn legges til på TS-siden.

## Gjentakelse ved upstream-oppdatering

Etter en merge fra `erp-mafia/accounted`:

1. Kjør `_assemble.py` på nytt for å se hvilke blader som mangler oversettelse.
2. Del bare de manglende bladene i nye bunter og oversett dem.
3. Kjør `_qa.py` og `npm test` før commit.
