import { getNeo4jStatus, SERVICE_STATUS } from '../services/health.service.js'

// The API itself is up whenever this responds, so the status stays 200 and dependencies are reported alongside.
export async function getHealth(req, res) {
  const neo4j = await getNeo4jStatus()

  res.status(200).json({
    success: true,
    message: 'SELVIA Learning Platform API is running',
    timestamp: new Date().toISOString(),
    services: { neo4j },
  })
}

export async function getNeo4jHealth(req, res) {
  const neo4j = await getNeo4jStatus()
  const isUp = neo4j.status === SERVICE_STATUS.UP

  res.status(isUp ? 200 : 503).json({
    success: isUp,
    message: isUp ? 'Neo4j is reachable' : 'Neo4j is unavailable',
    timestamp: new Date().toISOString(),
    data: { neo4j },
  })
}
