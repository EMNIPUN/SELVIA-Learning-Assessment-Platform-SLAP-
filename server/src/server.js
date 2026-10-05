import env from './config/env.js'
import app from './app.js'
import { checkDatabaseConnection } from './database/postgres/prisma.js'
import { closeNeo4jDriver, isNeo4jConfigured, verifyNeo4jConnection } from './database/neo4j/driver.js'

const SHUTDOWN_TIMEOUT_MS = 10_000

if (!env.jwtSecret || (env.isProduction && env.jwtSecret === 'change-this-in-production')) {
  console.error('JWT_SECRET is missing or still set to the example value. Configure it in server/.env.')
  process.exit(1)
}

async function connectDatabase() {
  try {
    await checkDatabaseConnection()
    console.log('Database connected successfully')
  } catch (err) {
    console.error('Database connection failed:', err.message)
  }
}

// Neo4j is optional at startup: the API keeps serving and /api/v1/health reports its status.
async function connectNeo4j() {
  if (!isNeo4jConfigured()) {
    console.warn('Neo4j is not configured (set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD in server/.env)')
    return
  }

  try {
    const { address, agent, database } = await verifyNeo4jConnection()
    console.log(`Neo4j connected successfully (${agent} at ${address}, database "${database}")`)
  } catch (err) {
    console.error('Neo4j connection failed:', err.message)
  }
}

const server = app.listen(env.port, () => {
  console.log(`SELVIA API running in ${env.nodeEnv} mode on http://localhost:${env.port}`)
  connectDatabase()
  connectNeo4j()
})

server.on('error', (err) => {
  console.error('Failed to start server:', err.message)
  process.exit(1)
})

let shuttingDown = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received, shutting down`)

  // Open client connections can keep server.close() pending; do not wait forever.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref()

  await new Promise((resolve) => server.close(resolve))
  try {
    await closeNeo4jDriver()
  } catch (err) {
    console.error('Failed to close the Neo4j driver:', err.message)
  }
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
