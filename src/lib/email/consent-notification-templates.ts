import { getBranding } from '@/lib/branding/service'

export interface ConsentExpiryEmailData {
  bankName: string
  daysUntilExpiry: number
  renewalUrl: string
  /** The company the bank connection belongs to. Shown so the recipient knows
   * which of their companies the email concerns; never used as the sender. */
  companyName: string
  isExpired: boolean
}

/**
 * Consent expiry notification emails.
 *
 * Tone and layout are deliberately calm: a PSD2 consent running out is
 * routine, not an incident. No red, no urgency chrome; the email is signed
 * by the app (never the recipient's own company), states plainly why the
 * recipient got it, and shows the destination URL in plain text next to the
 * button so it does not pattern-match phishing.
 */

const SERIF = `Georgia, 'Times New Roman', serif`
const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

function dagar(n: number): string {
  return `${n} ${n === 1 ? 'dag' : 'dager'}`
}

/**
 * Generate HTML email for consent expiry notification
 */
export function generateConsentExpiryEmailHtml(data: ConsentExpiryEmailData): string {
  const { bankName, daysUntilExpiry, renewalUrl, companyName, isExpired } = data
  const { appName, supportEmail } = getBranding()

  const title = isExpired
    ? 'Bankkoblingen må fornyes'
    : `Bankkoblingen utløper om ${dagar(daysUntilExpiry)}`

  const intro = isExpired
    ? `Banksamtykket for <strong>${bankName}</strong> har utløpt, og den automatiske hentingen av nye transaksjoner er satt på pause.`
    : `Banksamtykket for <strong>${bankName}</strong> utløper om ${dagar(daysUntilExpiry)}.`

  const explanation =
    'Dette er forventet: av sikkerhetsgrunner gjelder et banksamtykke (PSD2) bare i en begrenset tid, og deretter må det godkjennes på nytt hos banken.'

  const consequence = isExpired
    ? 'Ingenting er borte. Transaksjoner som allerede er hentet, og bokføringen din, påvirkes ikke, og når koblingen er fornyet, hentes mellomliggende transaksjoner inn igjen.'
    : 'Forny gjerne i forkant, så fortsetter transaksjonene å hentes uten avbrudd. Bokføringen din påvirkes ikke.'

  return `
<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${SANS}; line-height: 1.6; color: #374151; background-color: #f5f4f1;">
  <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border: 1px solid #e7e5e0; border-radius: 12px; padding: 40px;">

      <div style="font-family: ${SERIF}; font-size: 19px; color: #111111; margin-bottom: 28px;">
        ${appName}
      </div>

      <h1 style="margin: 0 0 16px 0; font-family: ${SERIF}; font-size: 23px; font-weight: 400; color: #111111; line-height: 1.3;">
        ${title}
      </h1>

      <p style="margin: 0 0 14px 0; font-size: 15px;">${intro}</p>
      <p style="margin: 0 0 14px 0; font-size: 15px;">${explanation}</p>
      <p style="margin: 0 0 28px 0; font-size: 15px;">${consequence}</p>

      <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #ececea; color: #9ca3af; width: 90px;">Bank</td>
          <td style="padding: 8px 0; border-top: 1px solid #ececea; color: #111111;">${bankName}</td>
        </tr>
        ${companyName ? `
        <tr>
          <td style="padding: 8px 0; border-top: 1px solid #ececea; border-bottom: 1px solid #ececea; color: #9ca3af;">Foretak</td>
          <td style="padding: 8px 0; border-top: 1px solid #ececea; border-bottom: 1px solid #ececea; color: #111111;">${companyName}</td>
        </tr>
        ` : ''}
      </table>

      <div style="margin-bottom: 12px;">
        <a href="${renewalUrl}" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 12px 26px; border-radius: 99px; text-decoration: none; font-weight: 500; font-size: 14px;">
          Forny bankkoblingen
        </a>
      </div>

      <p style="margin: 0 0 32px 0; font-size: 13px; color: #9ca3af;">
        Knappen fører til ${renewalUrl}.<br>
        Du kan også logge inn som vanlig og gå til Innstillinger og deretter Bank.
      </p>

      <div style="padding-top: 20px; border-top: 1px solid #ececea;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #374151;">
          Med vennlig hilsen,<br>
          <strong>${appName}</strong>
        </p>
        <p style="margin: 0; font-size: 12.5px; color: #9ca3af;">
          Du får denne e-posten fordi det finnes en bankkobling i ${appName}${companyName ? ` for ${companyName}` : ''}.
          Har du spørsmål? Send e-post til <a href="mailto:${supportEmail}" style="color: #6b7280;">${supportEmail}</a>.
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`
}

/**
 * Generate plain text email for consent expiry notification
 */
export function generateConsentExpiryEmailText(data: ConsentExpiryEmailData): string {
  const { bankName, daysUntilExpiry, renewalUrl, companyName, isExpired } = data
  const { appName, supportEmail } = getBranding()

  let text = ''

  if (isExpired) {
    text += `Bankkoblingen må fornyes\n\n`
    text += `Banksamtykket for ${bankName} har utløpt, og den automatiske hentingen av nye transaksjoner er satt på pause.\n\n`
  } else {
    text += `Bankkoblingen utløper om ${dagar(daysUntilExpiry)}\n\n`
    text += `Banksamtykket for ${bankName} utløper om ${dagar(daysUntilExpiry)}.\n\n`
  }

  text += `Dette er forventet: av sikkerhetsgrunner gjelder et banksamtykke (PSD2) bare i en begrenset tid, og deretter må det godkjennes på nytt hos banken.\n\n`

  if (isExpired) {
    text += `Ingenting er borte. Transaksjoner som allerede er hentet, og bokføringen din, påvirkes ikke, og når koblingen er fornyet, hentes mellomliggende transaksjoner inn igjen.\n\n`
  } else {
    text += `Forny gjerne i forkant, så fortsetter transaksjonene å hentes uten avbrudd. Bokføringen din påvirkes ikke.\n\n`
  }

  text += `Bank: ${bankName}\n`
  if (companyName) text += `Foretak: ${companyName}\n`
  text += `\nForny bankkoblingen: ${renewalUrl}\n`
  text += `Du kan også logge inn som vanlig og gå til Innstillinger og deretter Bank.\n\n`
  text += `Med vennlig hilsen,\n`
  text += `${appName}\n\n`
  text += `Du får denne e-posten fordi det finnes en bankkobling i ${appName}${companyName ? ` for ${companyName}` : ''}. Har du spørsmål? Send e-post til ${supportEmail}.\n`

  return text
}

/**
 * Generate email subject for consent expiry notification
 */
export function generateConsentExpiryEmailSubject(data: ConsentExpiryEmailData): string {
  const suffix = data.companyName ? ` - ${data.companyName}` : ''
  if (data.isExpired) {
    return `Forny bankkoblingen til ${data.bankName}${suffix}`
  }
  return `Bankkoblingen til ${data.bankName} utløper om ${dagar(data.daysUntilExpiry)}${suffix}`
}
