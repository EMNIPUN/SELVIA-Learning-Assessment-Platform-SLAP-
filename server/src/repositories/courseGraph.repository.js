import { CONCEPT_RELATIONSHIPS, GRAPH_LABELS, HIERARCHY } from '../constants/courseGraph.js'
import { runCypher } from '../database/neo4j/driver.js'

// Labels and relationship types cannot be query parameters, so they are interpolated only from the
// constants in courseGraph.js. All values are passed as parameters.

export async function upsertCourseNode(id, properties) {
  await runCypher(`MERGE (course:${GRAPH_LABELS.COURSE} {id: $id}) SET course += $properties`, { id, properties })
}

// Upserts a Module, Topic, Concept or Lesson and links it to its parent, removing any link from a
// previous parent. Returns false, writing nothing, when the parent node is not in the graph.
export async function upsertChildNode(label, parentId, id, properties) {
  const { parent, relationship } = HIERARCHY[label]
  const { records } = await runCypher(
    `MATCH (parent:${parent} {id: $parentId})
     MERGE (node:${label} {id: $id})
     SET node += $properties
     WITH parent, node
     OPTIONAL MATCH (previous:${parent})-[stale:${relationship}]->(node)
     WHERE previous <> parent
     DELETE stale
     WITH DISTINCT parent, node
     MERGE (parent)-[:${relationship}]->(node)
     RETURN node.id AS id`,
    { parentId, id, properties },
  )
  return records.length > 0
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
