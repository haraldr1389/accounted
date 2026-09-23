/**
 * Auth mail templates for the Supabase Send Email hook (WL-05, WL-13).
 *
 * Norwegian-only, like the other user-facing mail templates in lib/email/
 * (see .claude/rules/i18n.md): these are transactional mails, not UI chrome,
 * so they deliberately do not go through next-intl.
 *
 * The appName parameter carries the brand of the requesting host (resolved
 * via resolveBrandByHost from the redirect_to origin); the default is the
 * platform name, so unbranded hosts render canonical mail.
 */

import { escapeHtml, sanitizeSubjectLine } from './user-text'

export type AuthEmailActionType =
  | 'signup'
  | 'recovery'
  | 'magiclink'
  | 'invite'
  | 'email_change'
  | 'email_change_current'
  | 'reauthentication'
  | 'bankid_signup'

interface AuthEmailContent {
  subject: string
  heading: string
  body: (appName: string) => string
  cta: string
}

const CONTENT: Record<AuthEmailActionType, AuthEmailContent> = {
  signup: {
    subject: 'Bekreft e-postadressen din',
    heading: 'Bekreft e-postadressen din',
    body: (appName) =>
      `Klikk på knappen nedenfor for å bekrefte e-postadressen din og fullføre registreringen hos ${appName}.`,
    cta: 'Bekreft e-postadressen',
  },
  recovery: {
    subject: 'Tilbakestill passordet ditt',
    heading: 'Tilbakestill passordet ditt',
    body: (appName) =>
      `Vi har mottatt en forespørsel om å tilbakestille passordet til kontoen din hos ${appName}. Klikk på knappen nedenfor for å velge et nytt passord.`,
    cta: 'Tilbakestill passordet',
  },
  magiclink: {
    subject: 'Innloggningslenken din',
    heading: 'Logg inn',
    body: (appName) => `Klikk på knappen nedenfor for å logge inn hos ${appName}.`,
    cta: 'Logg inn',
  },
  invite: {
    subject: 'Du har blitt invitert',
    heading: 'Du har blitt invitert',
    body: (appName) =>
      `Du har blitt invitert til ${appName}. Klikk på knappen nedenfor for å opprette kontoen din.`,
    cta: 'Godta invitasjonen',
  },
  email_change: {
    subject: 'Bekreft den nye e-postadressen din',
    heading: 'Bekreft den nye e-postadressen din',
    body: (appName) =>
      `Klikk på knappen nedenfor for å bekrefte den nye e-postadressen din hos ${appName}. Av sikkerhetsgrunner sendes to e-poster, én til den nye adressen din og én til din nåværende. Endringen fullføres først når du har klikket på lenken i begge.`,
    cta: 'Bekreft ny e-postadresse',
  },
  email_change_current: {
    subject: 'Godkjenn endret e-postadresse',
    heading: 'Godkjenn endret e-postadresse',
    body: (appName) =>
      `Det er bedt om en endring av e-postadressen til kontoen din hos ${appName}. Klikk på knappen nedenfor for å godkjenne endringen fra din nåværende adresse. Av sikkerhetsgrunner sendes to e-poster, én til din nåværende adresse og én til din nye. Endringen fullføres først når du har klikket på lenken i begge.`,
    cta: 'Godkjenn endringen',
  },
  reauthentication: {
    subject: 'Verifiseringskoden din',
    heading: 'Verifiseringskoden din',
    body: (appName) => `Skriv inn koden nedenfor for å bekrefte identiteten din hos ${appName}.`,
    cta: '',
  },
  // Sent by the BankID signup (extensions/general/tic) to the address the
  // person typed, and again when a still-unconfirmed identity tries to log
  // in. Not a Supabase hook type: the link is minted by generateLink and only
  // ever travels by mail. The copy says plainly that the account was opened
  // with BankID and that ignoring the mail leaves it inactive, so a stranger
  // whose address was typed by mistake (or on purpose) is not nudged into
  // activating someone else's BankID login.
  bankid_signup: {
    subject: 'Bekreft e-postadressen din',
    heading: 'Bekreft e-postadressen din',
    body: (appName) =>
      `En konto hos ${appName} er opprettet med BankID og denne e-postadressen. Klikk på knappen nedenfor for å bekrefte at adressen er din og aktivere kontoen. Hvis det ikke var du som opprettet kontoen, kan du se bort fra denne meldingen: kontoen forblir inaktiv og kan ikke brukes til å logge inn.`,
    cta: 'Bekreft e-postadressen',
  },
}

// Availability first: an action type this module does not know (Supabase can
// add new mail classes) still produces a usable mail with the verify link
// rather than dropping the send.
const FALLBACK_CONTENT: AuthEmailContent = {
  subject: 'Bekreft handlingen din',
  heading: 'Bekreft handlingen din',
  body: (appName) => `Klikk på knappen nedenfor for å fortsette hos ${appName}.`,
  cta: 'Fortsett',
}

const IGNORE_NOTE = 'Hvis du ikke ba om dette, kan du se bort fra denne meldingen.'

export interface AuthEmailInput {
  actionType: string
  appName: string
  /** Verify URL on the originating host (token_hash flow). */
  actionUrl?: string
  /** One-time code, for reauthentication mail (no link). */
  otpCode?: string
}

export interface AuthEmail {
  subject: string
  html: string
  text: string
}

function contentFor(actionType: string): AuthEmailContent {
  return (CONTENT as Record<string, AuthEmailContent>)[actionType] ?? FALLBACK_CONTENT
}

export function buildAuthEmail(input: AuthEmailInput): AuthEmail {
  const content = contentFor(input.actionType)
  const appName = input.appName
  const safeAppName = escapeHtml(appName)
  const body = content.body(appName)

  const action = input.otpCode
    ? `
      <div style="margin: 28px 0;">
        <span style="display: inline-block; background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px 28px; font-size: 22px; font-weight: 600; letter-spacing: 0.3em; color: #111;">${escapeHtml(input.otpCode)}</span>
      </div>`
    : input.actionUrl
      ? `
      <div style="margin: 28px 0;">
        <a href="${escapeHtml(input.actionUrl)}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500;">
          ${escapeHtml(content.cta)}
        </a>
      </div>`
      : ''

  const html = `
<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5;">
  <div style="max-width: 520px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 12px; padding: 40px 32px; border: 1px solid #e5e5e5;">
      <!-- Header -->
      <div style="margin-bottom: 28px;">
        <p style="margin: 0 0 4px 0; font-size: 13px; color: #888; letter-spacing: 0.05em;">${safeAppName.toUpperCase()}</p>
        <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: #111;">
          ${escapeHtml(content.heading)}
        </h1>
        <p style="margin: 0; color: #666; font-size: 15px;">
          ${escapeHtml(body)}
        </p>
      </div>
${action}
      <!-- Info -->
      <p style="margin: 0; color: #999; font-size: 13px;">
        ${IGNORE_NOTE}
      </p>
    </div>
  </div>
</body>
</html>`

  let text = `${content.heading}\n\n${body}\n\n`
  if (input.otpCode) {
    text += `Kode: ${input.otpCode}\n\n`
  } else if (input.actionUrl) {
    text += `${content.cta}: ${input.actionUrl}\n\n`
  }
  text += IGNORE_NOTE

  return {
    subject: sanitizeSubjectLine(content.subject),
    html,
    text,
  }
}
