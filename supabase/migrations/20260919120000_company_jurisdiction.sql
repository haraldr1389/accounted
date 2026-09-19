-- Jurisdiction dimension.
--
-- Accounted is built for Swedish accounting law, and the Swedish part is not
-- the engine (the engine's invariants hold regardless of country) but the DATA:
-- which chart of accounts is seeded, which VAT declaration form a period closes
-- into, which annual-report framework applies, which identifier formats are
-- valid. None of those can be selected until the company states which country it
-- is subject to, so this adds that state.
--
-- Default 'se' is the whole design. Every existing row and every existing code
-- path resolves to Sweden, so this migration changes no observable behaviour; it
-- only makes a Norwegian tenant expressible. The TypeScript mirror lives in
-- lib/company/jurisdiction.ts, and adding a third jurisdiction is a compiler
-- error until every byJurisdiction() arm answers for it.
--
-- Why a column rather than a derived value: entity_type is already resolved
-- through an explicit per-company accessor (resolveCompanyEntityType) because
-- guessing it is how a third legal form came to be booked as enskild firma.
-- Jurisdiction is not derivable from anything available — a Norwegian AS can
-- hold a Swedish VAT registration and the reverse is equally possible — so it
-- has to be stated.
--
-- Deliberately NOT touched here: public.seed_chart_of_accounts(p_user_id,
-- p_entity_type). It seeds accounts per company and branches on entity_type,
-- so it is where jurisdiction will have to reach. It is not extended with a
-- defaulted parameter in this migration because a `create or replace` has to
-- carry the function's entire body: restating it from a reading would silently
-- drop whichever insert branch this file failed to reproduce, and that breaks
-- chart seeding for every new company on the very first deploy. The function is
-- replaced together with the Norwegian chart itself, in the migration that can
-- state both charts' contents, where the change can be tested against a real
-- database.

alter table public.companies
  add column if not exists jurisdiction text not null default 'se';

-- Explicit CHECK, not an inline one, so a later widening replaces a named
-- constraint instead of hunting down an anonymous pg_constraint row.
alter table public.companies
  drop constraint if exists companies_jurisdiction_check;

alter table public.companies
  add constraint companies_jurisdiction_check
  check (jurisdiction in ('se', 'no'));

notify pgrst, 'reload schema';
