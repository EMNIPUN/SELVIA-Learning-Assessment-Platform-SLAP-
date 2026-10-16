import { MCP_ERROR_CODES } from './tutorFacingContracts.js'

// Contract C envelopes for MCP tool results. Auth failures stay at the OAuth middleware; these helpers are for
// successful tool payloads and safe tool-level errors only.

const SAFE_MESSAGES = Object.freeze({
  VALIDATION_ERROR: 'The supplied filters are invalid.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is temporarily unavailable.',
})

function assertKnownCode(code) {
  if (!MCP_ERROR_CODES.includes(code)) {
    throw new Error(`Unknown MCP error code: ${code}`)
  }
}

/** Convert Date values to ISO-8601 strings for JSON / structuredContent stability. */
export function serializeRecordDates(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return record
  }

  const out = { ...record }
  for (const [key, value] of Object.entries(out)) {
    if (value instanceof Date) {
      out[key] = value.toISOString()
    }
  }
  return out
}

export function successEnvelope(records) {
  return {
    ok: true,
    data: {
      records: Array.isArray(records) ? records.map(serializeRecordDates) : [],
    },
  }
}

export function errorEnvelope(code, message) {
  assertKnownCode(code)
  const safeMessage =
    typeof message === 'string' && message.trim().length > 0 ? message.trim() : SAFE_MESSAGES[code]
  return {
    ok: false,
    error: {
      code,
      message: safeMessage,
    },
  }
}

export function toolSuccess(records) {
  const envelope = successEnvelope(records)
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
    structuredContent: envelope,
  }
}

export function toolError(code, message = SAFE_MESSAGES[code]) {
  const envelope = errorEnvelope(code, message)
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(envelope) }],
    structuredContent: envelope,
  }
}

export function safeToolErrorFromException(err) {
  if (err && typeof err === 'object' && err.statusCode === 400) {
    return toolError('VALIDATION_ERROR', SAFE_MESSAGES.VALIDATION_ERROR)
  }

  // Log only a stable label — never tokens, SQL, or exception payloads that may hold personal data.
  console.error('MCP tool execution failed')
  return toolError('INTERNAL_ERROR', SAFE_MESSAGES.INTERNAL_ERROR)
}

export { SAFE_MESSAGES }
