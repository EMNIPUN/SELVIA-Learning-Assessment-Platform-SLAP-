// Course Knowledge Graph vocabulary. Every node's `id` is the PostgreSQL id of the same entity.

export const GRAPH_LABELS = Object.freeze({
  COURSE: 'Course',
  MODULE: 'Module',
  TOPIC: 'Topic',
  CONCEPT: 'Concept',
  LESSON: 'Lesson',
})

// Content organisation mirrored from PostgreSQL: each child node has exactly one parent.
export const HIERARCHY = Object.freeze({
  [GRAPH_LABELS.MODULE]: { parent: GRAPH_LABELS.COURSE, relationship: 'HAS_MODULE' },
  [GRAPH_LABELS.TOPIC]: { parent: GRAPH_LABELS.MODULE, relationship: 'HAS_TOPIC' },
  [GRAPH_LABELS.CONCEPT]: { parent: GRAPH_LABELS.TOPIC, relationship: 'HAS_CONCEPT' },
  [GRAPH_LABELS.LESSON]: { parent: GRAPH_LABELS.CONCEPT, relationship: 'HAS_LESSON' },
})

// Semantic relationships between concepts. These exist only in Neo4j.
export const CONCEPT_RELATIONSHIPS = Object.freeze({
  // (a)-[:PREREQUISITE_OF]->(b): a should be learned before b.
  PREREQUISITE_OF: 'PREREQUISITE_OF',
  // (a)-[:RELATED_TO]-(b): symmetric association, stored once per pair.
  RELATED_TO: 'RELATED_TO',
  // (a)-[:REQUIRES]->(b): a cannot be understood or applied without b.
  REQUIRES: 'REQUIRES',
})

export const CONCEPT_RELATIONSHIP_TYPES = Object.values(CONCEPT_RELATIONSHIPS)

// Dependency relationships must stay acyclic, otherwise no valid learning order exists.
export const ACYCLIC_CONCEPT_RELATIONSHIPS = Object.freeze([
  CONCEPT_RELATIONSHIPS.PREREQUISITE_OF,
  CONCEPT_RELATIONSHIPS.REQUIRES,
])
