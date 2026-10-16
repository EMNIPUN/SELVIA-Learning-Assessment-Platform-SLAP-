// Loads INTERNAL_TUTOR_MINT_TOKEN for the internal tutor-access-token mint endpoint.
// Does not read process.env itself: callers pass values so unit tests stay offline.
// Never logs secret values. Equality with JWT_SECRET or MCP_TUTOR_TOKEN_SECRET disables minting.

export const MIN_INTERNAL_TUTOR_MINT_TOKEN_LENGTH = 32

/**
 * @param {{ token?: string, jwtSecret?: string, mcpTutorSecret?: string }} input
 * @returns {{ configured: boolean, token: string | undefined }}
 */
export function loadInternalTutorMintAuth({ token, jwtSecret, mcpTutorSecret } = {}) {
  if (typeof token !== 'string' || token.length === 0) {
    return { configured: false, token: undefined }
  }

  if (token.length < MIN_INTERNAL_TUTOR_MINT_TOKEN_LENGTH) {
    console.warn(
      'INTERNAL_TUTOR_MINT_TOKEN is too short; internal tutor token minting remains unavailable',
    )
    return { configured: false, token: undefined }
  }

  if (typeof jwtSecret === 'string' && jwtSecret.length > 0 && token === jwtSecret) {
    console.warn(
      'INTERNAL_TUTOR_MINT_TOKEN must differ from JWT_SECRET; internal tutor token minting remains unavailable',
    )
    return { configured: false, token: undefined }
  }

  if (
    typeof mcpTutorSecret === 'string' &&
    mcpTutorSecret.length > 0 &&
    token === mcpTutorSecret
  ) {
    console.warn(
      'INTERNAL_TUTOR_MINT_TOKEN must differ from MCP_TUTOR_TOKEN_SECRET; internal tutor token minting remains unavailable',
    )
    return { configured: false, token: undefined }
  }

  return { configured: true, token }
}
