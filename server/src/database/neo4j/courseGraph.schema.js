import { GRAPH_LABELS } from '../../constants/courseGraph.js'
import { runCypher } from './driver.js'

// A uniqueness constraint also creates the index that MERGE uses to find nodes by id.
export const COURSE_GRAPH_CONSTRAINTS = Object.freeze(
  Object.values(GRAPH_LABELS).map((label) => ({ name: `${label.toLowerCase()}_id_unique`, label, property: 'id' })),
)

// Idempotent: existing constraints are left untouched.
export async function applyCourseGraphSchema() {
  for (const { name, label, property } of COURSE_GRAPH_CONSTRAINTS) {
    await runCypher(`CREATE CONSTRAINT ${name} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${property} IS UNIQUE`)
  }
}

export async function listCourseGraphConstraints() {
  const { records } = await runCypher(
    `SHOW CONSTRAINTS YIELD name, type, labelsOrTypes, properties
     WHERE name IN $names
     RETURN name, type, labelsOrTypes, properties
     ORDER BY name`,
    { names: COURSE_GRAPH_CONSTRAINTS.map((constraint) => constraint.name) },
    { readOnly: true },
  )
  return records.map((record) => record.toObject())
}
