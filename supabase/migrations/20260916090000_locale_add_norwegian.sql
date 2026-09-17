-- Widen the per-user UI language constraint to admit Norwegian ('no').
--
-- The earlier migration (20260521120000_add_user_locale.sql) pinned the
-- column to ('sv', 'en') so an orphan 'de'/'fr' could never reach the app.
-- The Norwegian adaptation adds messages/no.json and the 'no' locale, so the
-- constraint has to grow with it. Nothing else on user_preferences changes:
-- existing rows keep their value and the default stays 'sv'.

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_locale_check;

ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_locale_check CHECK (locale IN ('sv', 'en', 'no'));

NOTIFY pgrst, 'reload schema';
