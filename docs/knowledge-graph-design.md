# SELVIA Learning Platform — Course Knowledge Graph (Neo4j)

> **Status:** Hierarchy create/update/delete auto-syncs to Neo4j (best-effort). Explicit `/graph` sync
> endpoints remain for repair when Neo4j was unavailable.

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

## 5. Synchronization

Code: `server/src/routes/v1/courseGraph.routes.js` → `controllers/courseGraph.controller.js` → `services/courseGraph.service.js` → `repositories/courseGraph.repository.js` (Cypher) and `repositories/courseHierarchy.repository.js` (PostgreSQL reads).

Auto-sync after PostgreSQL hierarchy writes: `services/graphAutoSync.service.js`, called from
`course`, `module`, `topic`, `concept`, and `lesson` services. Failures are logged and never fail the
HTTP request. Child upserts require the parent node to already exist in Neo4j; if it is missing, the
child sync is skipped and a warning is logged (use `sync-hierarchy` to repair).

### 5.1 API

All endpoints are under `/api/v1/graph`, require a lecturer token, and act only on courses the lecturer owns (403 otherwise). Students cannot use them.

| Method and path | Behaviour |
|---|---|
| `POST /courses/:courseId/sync` | Upserts the course node. |
| `POST /modules/:moduleId/sync` | Upserts the module node and its `HAS_MODULE` link. |
| `POST /topics/:topicId/sync` | Upserts the topic node and its `HAS_TOPIC` link. |
| `POST /concepts/:conceptId/sync` | Upserts the concept node and its `HAS_CONCEPT` link. |
| `POST /lessons/:lessonId/sync` | Upserts the lesson node and its `HAS_LESSON` link. |
| `POST /courses/:courseId/sync-hierarchy` | Upserts the course and every module, topic, concept and lesson under it, parents first, in one transaction. |
| `DELETE /courses/:courseId`, `/modules/:moduleId`, `/topics/:topicId`, `/concepts/:conceptId`, `/lessons/:lessonId` | Removes the node and its hierarchy descendants (§5.3). |

| Status | Meaning |
|---|---|
| 400 | Invalid id. |
| 401 / 403 | Not authenticated, not a lecturer, or not the course owner. |
| 404 | The record is not in PostgreSQL (sync), or the node is not in the graph (removal). |
| 409 | Sync: the parent node is not in the graph (`Sync the <parent> first`); missing parents are never created. Removal: the record, or one of its graph descendants, still exists in PostgreSQL. |
| 503 | Neo4j is unavailable or not configured. |

### 5.2 Upsert rules

- Nodes are matched by `id` with `MERGE`, and `SET node = properties` replaces the mirrored properties with the current PostgreSQL values, so repeating any sync leaves the graph unchanged.
- A child re-synced under a different parent loses the link to its previous parent.
- Synchronization only touches hierarchy relationships. `PREREQUISITE_OF`, `REQUIRES` and `RELATED_TO` are never created, replaced or removed by it.
- `sync-hierarchy` returns `synced` (count per label) and `staleNodes`: graph descendants of the course that no longer exist in PostgreSQL. Stale nodes are reported, never deleted automatically.

### 5.3 Removal

Removal is explicit and mirrors a deletion that has already happened in PostgreSQL:

1. The record must no longer exist in PostgreSQL (409 otherwise; sync it instead to update it).
2. The node must exist in the graph (404 otherwise).
3. If the ancestor course still exists in PostgreSQL, only its owner may remove nodes under it. If the course itself was deleted, any lecturer may remove its leftover nodes.
4. No hierarchy descendant may still exist in PostgreSQL (409 with the offending ids); this prevents removing nodes for content that was moved rather than deleted.
5. The node and its hierarchy descendants are removed with `DETACH DELETE` in one transaction. This removes only relationships attached to those nodes, including knowledge relationships of removed concepts; nodes and relationships elsewhere, including other courses, are untouched.

The response reports what was removed, for example `{"nodes":{"Lesson":1},"relationships":{"HAS_LESSON":1}}`.

### 5.4 Knowledge relationships (internal)

These service functions have no routes yet; relationships are never inferred automatically.

| Function | Behaviour |
|---|---|
| `addPrerequisite(prerequisiteId, conceptId)` | `PREREQUISITE_OF`, rejecting cycles (409). |
| `addRequirement(conceptId, requiredConceptId)` | `REQUIRES`, rejecting cycles (409). |
| `addRelatedConcept(conceptId, relatedConceptId)` | `RELATED_TO`. |

## 6. Not yet implemented

- Automatic synchronization when PostgreSQL records change, background workers, event queues.
- API endpoints for knowledge relationships.
- Cycle detection across relationship types (each of `PREREQUISITE_OF` and `REQUIRES` is checked separately).
- Student Knowledge Graph and anything computed from student evidence.
