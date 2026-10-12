import { CONCEPT_RELATIONSHIPS, GRAPH_LABELS, HIERARCHY } from '../constants/courseGraph.js'
import { runCypher, runWriteTransaction } from '../database/neo4j/driver.js'

// Labels and relationship types cannot be query parameters, so they are interpolated only from the
// constants in courseGraph.js. All values are passed as parameters.

const NODE_LABELS = Object.values(GRAPH_LABELS)
const HIERARCHY_TYPES = Object.values(HIERARCHY).map(({ relationship }) => relationship).join('|')
const HIERARCHY_DEPTH = Object.keys(HIERARCHY).length

// `SET node = $properties` replaces every property so the node matches PostgreSQL exactly; it never
// touches the node's relationships, so knowledge relationships are preserved.
const UPSERT_COURSE = `MERGE (node:${GRAPH_LABELS.COURSE} {id: $properties.id}) SET node = $properties`

// Upserts children and links each to its parent, removing any link from a previous parent. A row whose
// parent is not in the graph writes nothing and returns no record.
function upsertChildrenQuery(label) {
  const { parent, relationship } = HIERARCHY[label]
  return `UNWIND $rows AS row
    MATCH (parent:${parent} {id: row.parentId})
    MERGE (node:${label} {id: row.properties.id})
    SET node = row.properties
    WITH parent, node
    OPTIONAL MATCH (previous:${parent})-[stale:${relationship}]->(node)
    WHERE previous <> parent
    DELETE stale
    WITH DISTINCT parent, node
    MERGE (parent)-[:${relationship}]->(node)
    RETURN node.id AS id`
}

// Matches the given nodes through each label's id index rather than scanning every node.
function matchNodes(labels) {
  return labels.map((label) => `MATCH (n:${label}) WHERE n.id IN $ids RETURN n`).join(' UNION ')
}

export async function upsertCourseNode(properties) {
  await runCypher(UPSERT_COURSE, { properties })
}

export async function upsertChildNode(label, parentId, properties) {
  const { records } = await runCypher(upsertChildrenQuery(label), { rows: [{ parentId, properties }] })
  return records.length > 0
}

// Writes a course and its descendants in one transaction, parents before children.
// `levels` is [[label, [{ parentId, properties }]], ...] in hierarchy order.
export function upsertCourseTree(courseProperties, levels) {
  return runWriteTransaction(async (tx) => {
    await tx.run(UPSERT_COURSE, { properties: courseProperties })
    for (const [label, rows] of levels) {
      if (rows.length === 0) continue
      const result = await tx.run(upsertChildrenQuery(label), { rows })
      if (result.records.length !== rows.length) {
        throw new Error(`Could not link every ${label} node to its parent during course synchronization`)
      }
    }
  })
}

// The node's descendants through hierarchy relationships only (never knowledge relationships).
// Returns null when the node is not in the graph.
export async function findSubtree(label, id) {
  const { records } = await runCypher(
    `MATCH (root:${label} {id: $id})
     OPTIONAL MATCH (root)-[:${HIERARCHY_TYPES}*1..${HIERARCHY_DEPTH}]->(descendant)
     WITH root, collect(DISTINCT descendant) AS descendants
     RETURN [node IN descendants | {label: labels(node)[0], id: node.id}] AS descendants`,
    { id },
    { readOnly: true },
  )
  return records.length > 0 ? { descendants: records[0].get('descendants') } : null
}

export async function findAncestorCourseId(label, id) {
  const { records } = await runCypher(
    `MATCH (course:${GRAPH_LABELS.COURSE})-[:${HIERARCHY_TYPES}*1..${HIERARCHY_DEPTH}]->(:${label} {id: $id})
     RETURN course.id AS id LIMIT 1`,
    { id },
    { readOnly: true },
  )
  return records[0]?.get('id') ?? null
}

// DETACH DELETE removes the nodes and only the relationships attached to them, so relationships between
// other nodes are never affected. Returns what was removed.
export function removeNodes(nodes) {
  const labels = [...new Set(nodes.map((node) => node.label))].filter((label) => NODE_LABELS.includes(label))
  const ids = nodes.map((node) => node.id)

  return runWriteTransaction(async (tx) => {
    const relationships = await tx.run(
      `CALL () { ${matchNodes(labels)} }
       MATCH (n)-[r]-()
       RETURN type(r) AS type, count(DISTINCT r) AS count
       ORDER BY type`,
      { ids },
    )
    const removed = await tx.run(
      `CALL () { ${matchNodes(labels)} }
       WITH n, labels(n)[0] AS label
       DETACH DELETE n
       RETURN label, count(*) AS count
       ORDER BY label`,
      { ids },
    )
    const toCounts = (records, key) =>
      Object.fromEntries(records.map((record) => [record.get(key), record.get('count').toNumber()]))
    return { nodes: toCounts(removed.records, 'label'), relationships: toCounts(relationships.records, 'type') }
  })
}

export async function findConceptNodeIds(ids) {
  const { records } = await runCypher(
    `MATCH (concept:${GRAPH_LABELS.CONCEPT}) WHERE concept.id IN $ids RETURN concept.id AS id`,
    { ids },
    { readOnly: true },
  )
  return records.map((record) => record.get('id'))
}

// True when `fromId` already reaches `toId` through one or more `type` relationships.
export async function hasConceptPath(type, fromId, toId) {
  const { records } = await runCypher(
    `MATCH (from:${GRAPH_LABELS.CONCEPT} {id: $fromId}), (to:${GRAPH_LABELS.CONCEPT} {id: $toId})
     RETURN EXISTS { (from)-[:${type}*1..]->(to) } AS found`,
    { fromId, toId },
    { readOnly: true },
  )
  return records[0]?.get('found') === true
}

export async function mergeConceptRelationship(type, fromId, toId) {
  // An undirected MERGE matches an existing RELATED_TO in either direction, so a pair is stored once.
  const pattern = type === CONCEPT_RELATIONSHIPS.RELATED_TO ? `(from)-[:${type}]-(to)` : `(from)-[:${type}]->(to)`
  const { records } = await runCypher(
    `MATCH (from:${GRAPH_LABELS.CONCEPT} {id: $fromId}), (to:${GRAPH_LABELS.CONCEPT} {id: $toId})
     MERGE ${pattern}
     RETURN from.id AS id`,
    { fromId, toId },
  )
  return records.length > 0
}
