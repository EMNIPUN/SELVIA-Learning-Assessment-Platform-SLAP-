import jwt from 'jsonwebtoken'
import { ROLES } from '../../constants/roles.js'
import { ApiError } from '../../utils/ApiError.js'

// Tutor-token crypto and authorization for future MCP requests. This module does not load server/.env,
// open a database, or mount an HTTP route: callers inject configuration and user/student lookups.

const ALGORITHM = 'HS256'

export const TUTOR_TOKEN_ISSUER = 'selvia-platform'
export const TUTOR_TOKEN_MAX_LIFETIME_SECONDS = 15 * 60

export const TUTOR_READ_SCOPES = Object.freeze([
  'tutor:evidence.read',
  'tutor:activity.read',
  'tutor:course.read',
])

const ALLOWED_SCOPES = new Set(TUTOR_READ_SCOPES)

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function invalidToken() {
  return ApiError.unauthorized('Invalid token')
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw ApiError.unauthorized(`Invalid ${label}`)
  }
}

function parseScopes(scopeClaim) {
  const parts =
    typeof scopeClaim === 'string'
      ? scopeClaim.trim().split(/\s+/).filter(Boolean)
      : Array.isArray(scopeClaim)
        ? scopeClaim.filter((value) => typeof value === 'string' && value.length > 0)
        : null

  if (!parts || parts.length === 0) {
    throw invalidToken()
  }

  for (const scope of parts) {
    if (!ALLOWED_SCOPES.has(scope)) {
      throw invalidToken()
    }
  }

  return Object.freeze([...new Set(parts)])
}

// Builds an immutable config object. Callers supply values from environment or tests; nothing is read here.
export function createTutorTokenConfig({ secret, audience, issuer = TUTOR_TOKEN_ISSUER }) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('Tutor token secret must be a string of at least 32 characters')
  }
  if (typeof audience !== 'string' || audience.length === 0) {
    throw new Error('Tutor token audience is required')
  }
  if (typeof issuer !== 'string' || issuer.length === 0) {
    throw new Error('Tutor token issuer is required')
  }

  return Object.freeze({
    secret,
    audience,
    issuer,
    maxLifetimeSeconds: TUTOR_TOKEN_MAX_LIFETIME_SECONDS,
  })
}

// Signs a short-lived tutor token. Not exposed over HTTP in this step; used by unit tests and a future minting path.
export function signTutorToken({ userId, studentId, scopes }, config, { expiresInSeconds = TUTOR_TOKEN_MAX_LIFETIME_SECONDS } = {}) {
  assertUuid(userId, 'subject')
  assertUuid(studentId, 'student id')
  const scopeList = parseScopes(scopes)

  if (
    typeof expiresInSeconds !== 'number' ||
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > TUTOR_TOKEN_MAX_LIFETIME_SECONDS
  ) {
    throw new Error(`Tutor token lifetime must be between 1 and ${TUTOR_TOKEN_MAX_LIFETIME_SECONDS} seconds`)
  }

  return jwt.sign({ student_id: studentId, scope: scopeList.join(' ') }, config.secret, {
    algorithm: ALGORITHM,
    subject: userId,
    issuer: config.issuer,
    audience: config.audience,
    expiresIn: expiresInSeconds,
  })
}

// Cryptographic verification only. Does not load users or students.
export function verifyTutorToken(token, config) {
  if (typeof token !== 'string' || token.length === 0) {
    throw invalidToken()
  }

  let payload
  try {
    payload = jwt.verify(token, config.secret, {
      algorithms: [ALGORITHM],
      issuer: config.issuer,
      audience: config.audience,
    })
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token')
  }

  if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    throw invalidToken()
  }
  if (payload.exp - payload.iat > TUTOR_TOKEN_MAX_LIFETIME_SECONDS) {
    throw invalidToken()
  }

  assertUuid(payload.sub, 'subject')
  assertUuid(payload.student_id, 'student id')
  const scopes = parseScopes(payload.scope)

  return Object.freeze({
    userId: payload.sub,
    studentId: payload.student_id,
    scopes,
    expiresAt: payload.exp,
  })
}

// Verifies the tutor token, then re-checks the live user and student profile through injected dependencies.
export async function authorizeTutorToken(token, config, { getAuthenticatedUser, findStudentByUserId }) {
  const claims = verifyTutorToken(token, config)
  const user = await getAuthenticatedUser(claims.userId)

  if (user.role !== ROLES.STUDENT) {
    throw ApiError.forbidden('A student account is required')
  }

  const student = await findStudentByUserId(user.id)
  if (!student) {
    throw ApiError.forbidden('A student profile is required')
  }
  if (student.id !== claims.studentId) {
    throw invalidToken()
  }

  return Object.freeze({
    userId: user.id,
    studentId: student.id,
    scopes: claims.scopes,
    expiresAt: claims.expiresAt,
  })
}
