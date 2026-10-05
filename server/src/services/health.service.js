import env from '../config/env.js'
import { checkNeo4jConnection, isNeo4jConfigured } from '../database/neo4j/driver.js'

export const SERVICE_STATUS = Object.freeze({
  UP: 'up',
  DOWN: 'down',
  NOT_CONFIGURED: 'not_configured',
})

export async function getNeo4jStatus() {
  if (!isNeo4jConfigured()) {
    return { status: SERVICE_STATUS.NOT_CONFIGURED }
  }

  const startedAt = performance.now()
  try {
    await checkNeo4jConnection()
    return {
      status: SERVICE_STATUS.UP,
      database: env.neo4j.database,
      latencyMs: Math.round(performance.now() - startedAt),
    }
  } catch (err) {
    return {
      status: SERVICE_STATUS.DOWN,
      database: env.neo4j.database,
      ...(err.code && err.code !== 'N/A' ? { code: err.code } : {}),
      // Driver messages can include server addresses, so they are only shown outside production.
      ...(env.isProduction ? {} : { error: err.message }),
    }
  }
}
