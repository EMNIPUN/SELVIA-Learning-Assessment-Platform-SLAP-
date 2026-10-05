import neo4j from 'neo4j-driver'
import env from '../../config/env.js'

const HEALTH_QUERY_TIMEOUT_MS = 10_000

// One driver per process: it owns the connection pool and is safe to share across requests.
let driver = null

export function isNeo4jConfigured() {
  const { uri, username, password } = env.neo4j
  return Boolean(uri && username && password)
}

export function getNeo4jDriver() {
  if (!isNeo4jConfigured()) {
    throw new Error('Neo4j is not configured. Set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD in server/.env.')
  }

  if (!driver) {
    const { uri, username, password } = env.neo4j
    // Without these limits a request waits indefinitely when Neo4j is unreachable.
    driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      connectionTimeout: 15_000,
      connectionAcquisitionTimeout: 20_000,
    })
  }
  return driver
}

// Every graph query goes through here so it targets the configured database.
export function runCypher(cypher, params = {}, { readOnly = false } = {}) {
  return getNeo4jDriver().executeQuery(cypher, params, {
    database: env.neo4j.database,
    routing: readOnly ? neo4j.routing.READ : neo4j.routing.WRITE,
  })
}

// Opens a connection to the configured database and returns the server's address and version.
export async function verifyNeo4jConnection() {
  const info = await getNeo4jDriver().getServerInfo({ database: env.neo4j.database })
  return { address: info.address, agent: info.agent, database: env.neo4j.database }
}

function withTimeout(promise, ms, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// executeQuery keeps retrying connection failures (up to 30 s) and does not honour an AbortSignal while
// doing so, so the health check enforces its own limit instead of hanging the request.
export async function checkNeo4jConnection() {
  const query = getNeo4jDriver().executeQuery('RETURN 1 AS ok', {}, {
    database: env.neo4j.database,
    routing: neo4j.routing.READ,
  })
  const result = await withTimeout(query, HEALTH_QUERY_TIMEOUT_MS, `Neo4j did not respond within ${HEALTH_QUERY_TIMEOUT_MS} ms`)

  if (result.records[0]?.get('ok')?.toNumber() !== 1) {
    throw new Error('Neo4j health query returned an unexpected result')
  }
}

export async function closeNeo4jDriver() {
  if (!driver) return
  const closing = driver
  driver = null
  await closing.close()
}
