import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadInternalTutorMintAuth } from './internalTutorMintAuth.js'

const envFilePath = fileURLToPath(new URL('../../.env', import.meta.url))

if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const DEFAULT_MCP_TUTOR_ISSUER = 'selvia-platform'
const MIN_MCP_TUTOR_SECRET_LENGTH = 32

// MCP tutor auth is optional: the learning platform still starts when these are unset or invalid.
// Secrets are never logged. Equality with JWT_SECRET, or a short secret, disables MCP auth only.
function loadMcpTutorAuth(jwtSecret) {
  const secret = process.env.MCP_TUTOR_TOKEN_SECRET
  const audience = process.env.MCP_RESOURCE_URL
  const issuer = process.env.MCP_TUTOR_TOKEN_ISSUER || DEFAULT_MCP_TUTOR_ISSUER

  if (!secret || !audience) {
    return { configured: false, secret: undefined, audience: undefined, issuer }
  }

  if (jwtSecret && secret === jwtSecret) {
    console.warn('MCP_TUTOR_TOKEN_SECRET must differ from JWT_SECRET; MCP tutor auth remains unavailable')
    return { configured: false, secret: undefined, audience: undefined, issuer }
  }

  if (secret.length < MIN_MCP_TUTOR_SECRET_LENGTH) {
    console.warn('MCP_TUTOR_TOKEN_SECRET is too short; MCP tutor auth remains unavailable')
    return { configured: false, secret: undefined, audience: undefined, issuer }
  }

  return { configured: true, secret, audience, issuer }
}

const jwtSecret = process.env.JWT_SECRET
const mcpTutor = loadMcpTutorAuth(jwtSecret)

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  neo4j: {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE || 'neo4j',
  },
  mcp: {
    tutor: mcpTutor,
  },
  // Shared only with J26 Core API. Never a fallback for JWT or MCP tutor secrets.
  internalTutorMint: loadInternalTutorMintAuth({
    token: process.env.INTERNAL_TUTOR_MINT_TOKEN,
    jwtSecret,
    mcpTutorSecret: process.env.MCP_TUTOR_TOKEN_SECRET,
  }),
}

env.isProduction = env.nodeEnv === 'production'

export default env

