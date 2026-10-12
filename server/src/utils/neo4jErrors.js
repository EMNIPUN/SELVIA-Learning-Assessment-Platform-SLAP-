import neo4j from 'neo4j-driver'
import { ApiError } from './ApiError.js'

const UNAVAILABLE_CODES = new Set([neo4j.error.SERVICE_UNAVAILABLE, neo4j.error.SESSION_EXPIRED])

// Connection acquisition timeouts carry no error code, and a missing configuration is a plain Error.
const UNAVAILABLE_MESSAGE = /connection acquisition timed out|neo4j is not configured/i

// Maps "Neo4j cannot be reached" failures to 503; every other error is returned unchanged.
export function translateNeo4jError(err) {
  if (err instanceof ApiError) return err
  if (UNAVAILABLE_CODES.has(err.code) || neo4j.isRetryableError(err) || UNAVAILABLE_MESSAGE.test(err.message ?? '')) {
    return ApiError.serviceUnavailable('The knowledge graph database is unavailable. Try again later.')
  }
  return err
}
