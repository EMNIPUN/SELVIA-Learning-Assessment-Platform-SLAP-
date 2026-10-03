import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const envFilePath = fileURLToPath(new URL('../../.env', import.meta.url))

if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 5000,
}

env.isProduction = env.nodeEnv === 'production'

export default env
