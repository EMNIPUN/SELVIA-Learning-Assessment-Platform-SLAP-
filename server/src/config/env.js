import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envFilePath = fileURLToPath(new URL('../../.env', import.meta.url))

if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  neo4j: {
    uri: process.env.NEO4J_URI,
    username: process.env.NEO4J_USERNAME,
    password: process.env.NEO4J_PASSWORD,
    database: process.env.NEO4J_DATABASE || 'neo4j',
  },
}

env.isProduction = env.nodeEnv === 'production'

export default env
