import { getBranding } from '@/lib/branding/service'

export interface InviteEmailData {
  companyName: string
  inviterEmail: string
  inviteUrl: string
  /**
   * Brand override (WL-13): the app name of the brand of the company the
   * invite concerns. Absent = platform default from getBranding(), which
   * keeps unbranded companies byte-identical to before.
   */
  appName?: string
}

export function generateInviteEmailSubject(data: InviteEmailData): string {
  const appName = data.appName ?? getBranding().appName
  return `Du er invitert til ${data.companyName} på ${appName.toLowerCase()}`
}

export function generateInviteEmailHtml(data: InviteEmailData): string {
  const { companyName, inviterEmail, inviteUrl } = data
  const appName = data.appName ?? getBranding().appName

  return `
<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitasjon til ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5;">
  <div style="max-width: 520px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 12px; padding: 40px 32px; border: 1px solid #e5e5e5;">
      <!-- Header -->
      <div style="margin-bottom: 28px;">
        <p style="margin: 0 0 4px 0; font-size: 13px; color: #888; letter-spacing: 0.05em;">${appName.toUpperCase()}</p>
        <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: #111;">
          Du har blitt invitert
        </h1>
        <p style="margin: 0; color: #666; font-size: 15px;">
          <strong>${inviterEmail}</strong> har invitert deg til <strong>${companyName}</strong> på ${appName.toLowerCase()}.
        </p>
      </div>

      <!-- CTA -->
      <div style="margin: 28px 0;">
        <a href="${inviteUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500;">
          Godta invitasjonen
        </a>
      </div>

      <!-- Info -->
      <p style="margin: 0; color: #999; font-size: 13px;">
        Lenken er gyldig i 7 dager. Hvis du ikke forventet denne invitasjonen, kan du se bort fra denne meldingen.
      </p>
    </div>
  </div>
</body>
</html>`
}

export function generateInviteEmailText(data: InviteEmailData): string {
  const appName = data.appName ?? getBranding().appName
  return `Du er invitert til ${data.companyName} på ${appName.toLowerCase()} av ${data.inviterEmail}.

Godta invitasjonen: ${data.inviteUrl}

Lenken er gyldig i 7 dager.`
}

// =============================================================================
// Team invite email templates
// =============================================================================

export interface TeamInviteEmailData {
  inviterEmail: string
  inviteUrl: string
  /**
   * Brand override (WL-13): the app name of the byrå team's brand. Absent =
   * platform default from getBranding(), which keeps brandless teams
   * byte-identical to before.
   */
  appName?: string
}

export function generateTeamInviteEmailSubject(data?: Pick<TeamInviteEmailData, 'appName'>): string {
  // Branded byrå: the invite is to THE BYRÅ, by name and in its own casing
  // ("Du har blitt invitert til Willem"), no platform wording. Brandless
  // teams keep the platform phrasing byte-identical.
  if (data?.appName) {
    return `Du har blitt invitert til ${data.appName}`
  }
  return `Du er invitert til et team på ${getBranding().appName.toLowerCase()}`
}

export function generateTeamInviteEmailHtml(data: TeamInviteEmailData): string {
  const { inviterEmail, inviteUrl } = data
  const appName = data.appName ?? getBranding().appName
  // Branded byrå: headline and body name the byrå itself; brandless teams
  // keep the generic team wording.
  const headline = data.appName
    ? `Du har blitt invitert til ${data.appName}`
    : 'Du har blitt invitert til et team'
  const bodyLine = data.appName
    ? `<strong>${inviterEmail}</strong> har invitert deg til <strong>${data.appName}</strong>. Du får tilgang til alle foretakene i teamet.`
    : `<strong>${inviterEmail}</strong> har invitert deg som konsulent. Du får tilgang til alle foretakene i teamet.`

  return `
<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitasjon til team</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5;">
  <div style="max-width: 520px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: #ffffff; border-radius: 12px; padding: 40px 32px; border: 1px solid #e5e5e5;">
      <!-- Header -->
      <div style="margin-bottom: 28px;">
        <p style="margin: 0 0 4px 0; font-size: 13px; color: #888; letter-spacing: 0.05em;">${appName.toUpperCase()}</p>
        <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 600; color: #111;">
          ${headline}
        </h1>
        <p style="margin: 0; color: #666; font-size: 15px;">
          ${bodyLine}
        </p>
      </div>

      <!-- CTA -->
      <div style="margin: 28px 0;">
        <a href="${inviteUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 500;">
          Godta invitasjonen
        </a>
      </div>

      <!-- Info -->
      <p style="margin: 0; color: #999; font-size: 13px;">
        Lenken er gyldig i 7 dager. Hvis du ikke forventet denne invitasjonen, kan du se bort fra denne meldingen.
      </p>
    </div>
  </div>
</body>
</html>`
}

export function generateTeamInviteEmailText(data: TeamInviteEmailData): string {
  if (data.appName) {
    return `Du har blitt invitert til ${data.appName} av ${data.inviterEmail}. Du får tilgang til alle foretakene i teamet.

Godta invitasjonen: ${data.inviteUrl}

Lenken er gyldig i 7 dager.`
  }
  return `Du er invitert som konsulent til et team på ${getBranding().appName.toLowerCase()} av ${data.inviterEmail}. Du får tilgang til alle foretakene i teamet.

Godta invitasjonen: ${data.inviteUrl}

Lenken er gyldig i 7 dager.`
}
