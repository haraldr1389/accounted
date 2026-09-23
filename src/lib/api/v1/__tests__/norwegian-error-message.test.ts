/**
 * The fork adds a third language, so the v1 envelope must expose it.
 *
 * rewriteEnvelope() rebuilds the legacy envelope into the v1 shape field by
 * field, and it originally dropped message_no: `message` (Swedish) and
 * `message_en` came through, Norwegian did not. That was invisible from the app
 * because the UI resolves the locale from `code` via getErrorMessage, but an
 * agent or script reading only the JSON got Swedish.
 */
import { describe, expect, it } from 'vitest'
import { v1ErrorResponse, v1ErrorResponseFromCode, type V1ErrorBody } from '../errors'
import type { Logger } from '@/lib/logger'

function stubLogger(): Logger {
  const logger: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    child: () => logger,
  }
  return logger
}

async function bodyOf(res: { json: () => Promise<unknown> }): Promise<V1ErrorBody> {
  return (await res.json()) as V1ErrorBody
}

describe('v1 error envelope carries message_no', () => {
  it('exposes all three languages for a known code', async () => {
    const res = await v1ErrorResponseFromCode('UNAUTHORIZED', stubLogger(), {
      requestId: 'req_test',
    })
    const body = await bodyOf(res)

    expect(res.status).toBe(401)
    expect(body.error.message).toBe('Din session har gått ut. Logga in igen.')
    expect(body.error.message_en).toBe('Authentication required.')
    expect(body.error.message_no).toBe('Økten din er utløpt. Logg inn på nytt.')
    expect(body.error.request_id).toBe('req_test')
    expect(body.error.docs_url).toContain('/docs/api/errors/UNAUTHORIZED')
  })

  it('carries message_no on the thrown-error path too', async () => {
    const err = Object.assign(new Error('engine text'), { code: 'NOT_FOUND' })
    const res = await v1ErrorResponse(err, stubLogger(), { requestId: 'req_thrown' })
    const body = await bodyOf(res)

    expect(body.error.message_no).toBeTruthy()
    expect(body.error.message_no).not.toBe('engine text')
    expect(body.error.message_no).not.toBe(body.error.message)
  })

  it('leaves the Swedish source string untouched for existing consumers', async () => {
    const res = await v1ErrorResponseFromCode('RATE_LIMITED', stubLogger(), {
      requestId: 'req_rl',
      retryAfterSeconds: 30,
    })
    const body = await bodyOf(res)

    expect(body.error.message).toBe('För många förfrågningar. Vänta en stund och försök igen.')
    expect(body.error.message_no).toBe('For mange forespørsler. Vent litt og prøv igjen.')
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('keeps message_no Norwegian and free of Swedish markers', async () => {
    for (const code of ['UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR']) {
      const res = await v1ErrorResponseFromCode(code, stubLogger(), { requestId: 'req_x' })
      const body = await bodyOf(res)
      const no = body.error.message_no
      expect(no, `${code} has no message_no`).toBeTruthy()
      expect(/\b(och|att|är|för|från|till|kunde inte|försök)\b/.test(no!)).toBe(false)
      expect(/\b(ikkje|frå|vart|utan|dei|ein|eit|berre)\b/.test(no!)).toBe(false)
    }
  })

  it('still forwards details and recovery_hint unchanged', async () => {
    const res = await v1ErrorResponseFromCode('INVOICE_CREDIT_PERIOD_LOCKED', stubLogger(), {
      requestId: 'req_details',
      details: { period_id: 'p-1' },
      validAlternatives: { next_open_period: '/v1/periods' },
    })
    const body = await bodyOf(res)

    expect(body.error.details).toEqual({ period_id: 'p-1' })
    expect(body.error.valid_alternatives).toEqual({ next_open_period: '/v1/periods' })
    expect(body.error.message_no).toBeTruthy()
  })
})
