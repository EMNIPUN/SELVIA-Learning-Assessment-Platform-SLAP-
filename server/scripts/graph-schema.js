// Applies the Course Knowledge Graph constraints to Neo4j: npm run graph:schema
import { applyCourseGraphSchema, listCourseGraphConstraints } from '../src/database/neo4j/courseGraph.schema.js'
import { closeNeo4jDriver } from '../src/database/neo4j/driver.js'

try {
  await applyCourseGraphSchema()
  const constraints = await listCourseGraphConstraints()
  console.log('Course Knowledge Graph constraints:')
  for (const { name, type, labelsOrTypes, properties } of constraints) {
    console.log(`  ${name}: ${type} on ${labelsOrTypes.join(', ')}(${properties.join(', ')})`)
  }
} catch (err) {
  console.error('Failed to apply the Course Knowledge Graph schema:', err.message)
  process.exitCode = 1
} finally {
  await closeNeo4jDriver()
}
