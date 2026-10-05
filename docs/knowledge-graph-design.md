# SELVIA Learning Platform — Course Knowledge Graph (Neo4j)

> **Status:** Structure and synchronization foundation (Step 10.2). Nothing is synchronized automatically yet,
> and no graph operation is exposed through the API.

## 1. Responsibilities

| Store | Owns |
|---|---|
| PostgreSQL | Every entity and its properties, and the `Course → Module → Topic → Concept → Lesson` hierarchy (system of record). |
| Neo4j | A read-optimised copy of that hierarchy, plus the relationships **between concepts**, which exist only in Neo4j (see `database-design.md` §1.2). |

The graph never invents identities: every node's `id` is the PostgreSQL `id` of the same entity.

## 2. Nodes

Properties are deliberately minimal and use the PostgreSQL field names.

| Label | Properties | PostgreSQL source |
|---|---|---|
| `Course` | `id`, `code`, `title` | `courses` |
| `Module` | `id`, `title` | `modules` |
| `Topic` | `id`, `title` | `topics` |
| `Concept` | `id`, `code`, `name` | `concepts` |
| `Lesson` | `id`, `title` | `lessons` |

`modules`, `topics` and `lessons` have no `code` column, and courses, modules, topics and lessons use `title` rather than `name`, so the graph does the same.

## 3. Relationships

### 3.1 Hierarchy (content organisation)

```
(:Course)-[:HAS_MODULE]->(:Module)-[:HAS_TOPIC]->(:Topic)-[:HAS_CONCEPT]->(:Concept)-[:HAS_LESSON]->(:Lesson)
```

Mirrors the PostgreSQL foreign keys. Each child has exactly one parent; re-syncing a child under a different parent moves the relationship.

### 3.2 Knowledge (semantic / learning relationships, `Concept` to `Concept` only)

| Relationship | Meaning | Direction | Rules |
|---|---|---|---|
| `PREREQUISITE_OF` | `(a)-[:PREREQUISITE_OF]->(b)`: learn `a` before `b` (learning order). | Directed | Must stay acyclic. |
| `REQUIRES` | `(a)-[:REQUIRES]->(b)`: `a` cannot be understood or applied without `b` (dependency). | Directed | Must stay acyclic. |
| `RELATED_TO` | `a` and `b` are associated, without ordering. | Symmetric | Stored once per pair, in either direction. |

A concept cannot be related to itself. Concepts may be related across topics and courses.

## 4. Constraints

Applied with `npm run graph:schema` (idempotent, `IF NOT EXISTS`):

| Name | Constraint |
|---|---|
| `course_id_unique` | `Course.id` is unique |
| `module_id_unique` | `Module.id` is unique |
| `topic_id_unique` | `Topic.id` is unique |
| `concept_id_unique` | `Concept.id` is unique |
| `lesson_id_unique` | `Lesson.id` is unique |

Each uniqueness constraint also provides the index `MERGE` uses to find a node by `id`.

## 5. Synchronization foundation

Code: `server/src/services/courseGraph.service.js` (internal, no routes) and `server/src/repositories/courseGraph.repository.js` (Cypher).

| Function | Behaviour |
|---|---|
| `syncCourse(courseId)` | Reads the course from PostgreSQL and upserts its node. |
| `syncModule` / `syncTopic` / `syncConcept` / `syncLesson(id)` | Reads the entity from PostgreSQL, upserts its node and its hierarchy relationship. The parent must already be in the graph (409 otherwise). |
| `addPrerequisite(prerequisiteId, conceptId)` | `PREREQUISITE_OF`, rejecting cycles (409). |
| `addRequirement(conceptId, requiredConceptId)` | `REQUIRES`, rejecting cycles (409). |
| `addRelatedConcept(conceptId, relatedConceptId)` | `RELATED_TO`. |

All writes use `MERGE`, so repeating any operation leaves the graph unchanged.

## 6. Not yet implemented

- Automatic or bulk synchronization, background workers, event queues.
- Removing nodes or relationships when PostgreSQL rows are deleted.
- Cycle detection across relationship types (each of `PREREQUISITE_OF` and `REQUIRES` is checked separately).
- Student Knowledge Graph and anything computed from student evidence.
