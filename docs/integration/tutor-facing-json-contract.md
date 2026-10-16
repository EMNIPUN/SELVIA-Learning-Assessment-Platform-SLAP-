# Tutor-facing JSON contracts (Repository A → Adaptive AI Tutor)

**Contract version:** `1.0.0`  
**Status:** Canonical for data shapes returned by existing platform services; MCP transport envelope is a **proposal** for future tools.  
**Last aligned with code:** Step 4.4.2 / 4.4.3 (evidence DTO, activity DTO, tutor-token foundation).

## 1. Purpose and system boundary

| Repository | Responsibility |
|---|---|
| **A — Learning & Assessment Platform** (this repo) | Auth, content, learning activities, assessments, **observed** student evidence. Will host the MCP server. |
| **B — Adaptive AI Tutor Agent** | Competency estimation, knowledge gaps, adaptive decisions, interventions. Consumes data via MCP. |

```
Platform (PostgreSQL observations)
  → future MCP tools (Repository A)
  → Adaptive AI Tutor Agent (Repository B)
```

**Platform must not** compute mastery, competency labels, knowledge gaps, recommendations, or interventions.  
**Evidence and activities are observations**, not learner-model outputs.

The Adaptive AI Tutor remains **one** agent with internal modules (no extra agents / internal orchestrator required by this contract).

## 2. Versioning policy

- Breaking changes (rename/remove fields, change null semantics, change enum meanings) require a new major contract version and coordinated tutor-client updates.
- Additive optional fields may ship as a minor version if tutors ignore unknown keys.
- Existing service DTOs (Contracts A & B) are the source of truth; the MCP envelope (Contract C) may evolve independently while mapping onto those DTOs.

## 3. What is “existing” vs “proposed”

| Artifact | Status |
|---|---|
| Performance evidence record shape (`toEvidenceView`) | **Existing** platform DTO |
| Learning activity record shape (`ACTIVITY_SELECT` / Prisma select) | **Existing** platform DTO |
| Evidence/activity filter semantics | **Existing** |
| Tutor-token claims & scopes (`tutorToken.js`) | **Existing** foundation (not mounted on MCP yet) |
| Common MCP response envelope | **Proposed** for future MCP tools |
| Course-knowledge / Neo4j payloads | **Out of scope** here; will use Contract C later |

HTTP JSON responses today use `{ success, data, message? }` on Express routes. That is **not** claimed to be the MCP envelope.

---

## 4. Contract A — Performance evidence (existing DTO)

**Produced by:** `getCurrentEvidence` → `toEvidenceView`  
**Sources:** `server/src/services/studentEvidence.service.js`, `repositories/studentEvidence.query.js`  
**Not exposed as an HTTP route yet**; intended for a future MCP tool with scope `tutor:evidence.read`.

### 4.1 Top-level record

| Field | Type | Nullability | Description |
|---|---|---|---|
| `id` | string (UUID) | required | Evidence row id |
| `courseId` | string (UUID) \| null | nullable | Course of the observation |
| `conceptId` | string (UUID) \| null | nullable | Concept of the observation |
| `sourceType` | enum string | required | See §4.2 |
| `sourceId` | string (UUID) | required | Polymorphic id; see §4.3 |
| `score` | number \| null | nullable | Awarded score; **null = not measured**; **0 = measured zero** |
| `maxScore` | number \| null | nullable | Maximum possible; null for unscored items |
| `percentage` | number \| null | nullable | DB-generated `(score/maxScore)*100` when both allow it; else null |
| `attemptNumber` | integer \| null | nullable | Attempt number when recorded |
| `timeSpentSeconds` | integer \| null | nullable | Column exists; writers often leave null |
| `hintsUsed` | integer \| null | nullable | Column exists; writers often leave null |
| `errorsCount` | integer \| null | nullable | Column exists; writers often leave null |
| `status` | enum string | required | See §4.2 |
| `metadata` | object | required (may be `{}`) | Allowlisted keys only; see §4.4 |
| `observedAt` | Date / ISO-8601 datetime | required | Observation time |

**Not in the DTO:** `studentId`, `supersededByEvidenceId`, mastery, competency, gaps, recommendations, answer keys, raw responses.

### 4.2 Enums (from Prisma)

**`sourceType` (`EvidenceSourceType`):**

| Value | Used by current writers? |
|---|---|
| `EXERCISE_SUBMISSION` | Yes — exercise attempt workflow |
| `ASSESSMENT_ANSWER` | Yes — quiz/assessment finalisation |
| `LEARNING_ACTIVITY` | Enum exists; **no application writer found** |

**`status` (`EvidenceStatus`):**

| Value | Typical use |
|---|---|
| `COMPLETED` | Answered / submitted observation |
| `SKIPPED` | Unanswered question on student submit |
| `TIMED_OUT` | Unanswered on auto-submit |
| `ABANDONED` | Enum exists; **no writer found in `server/src`** |

### 4.3 `sourceId` assignment (confirmed)

| `sourceType` | `sourceId` points to |
|---|---|
| `EXERCISE_SUBMISSION` | `learning_activities.id` of the `EXERCISE_SUBMITTED` activity (`exerciseAttempt.repository.js`) |
| `ASSESSMENT_ANSWER` | `student_answers.id` (`answerEvidence` in `assessmentAttempt.service.js`) |

Exercise/question business ids appear in **metadata** (`exercise_id`, `question_id`), not as `sourceId`.

### 4.4 Metadata allowlist

Only keys in `EVIDENCE_METADATA_KEYS` are returned. Others are stripped.

| Key | Typical source |
|---|---|
| `exercise_id`, `lesson_id`, `exercise_type` | Exercise evidence |
| `assessment_id`, `assessment_type`, `assessment_question_id`, `attempt_id` | Assessment evidence |
| `question_id`, `question_version`, `question_type` | Assessment evidence |
| `difficulty`, `bloom_level` | Both (when recorded) |
| `is_correct` | When the item was judged; **omitted** if unanswered |

No answer text, selected options, or answer keys are included.

### 4.5 Semantics

- **Current only:** `supersededByEvidenceId: null` in the query. Superseded rows are excluded.
- **Empty list:** valid when nothing was observed or student id unknown to the DB.
- **Ordering:** oldest first — `observedAt asc`, then `id asc`.
- **Filters (service):** required `studentId` (caller-authorized); optional `courseId`, `conceptId` (UUID; omit to not filter; null refused).
- **Null preservation:** missing measurements stay `null`; never coalesced to `0`.
- These records are **observations**, not mastery or competency.

### 4.6 Example — exercise submission (score present)

```json
{
  "id": "0f1e2d3c-4b5a-4968-8776-5a4b3c2d1e0f",
  "courseId": "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
  "conceptId": "c0ffee00-1234-4abc-8def-0123456789ab",
  "sourceType": "EXERCISE_SUBMISSION",
  "sourceId": "e1d2c3b4-a596-4877-9665-544332211000",
  "score": 0,
  "maxScore": 1,
  "percentage": 0,
  "attemptNumber": 2,
  "timeSpentSeconds": null,
  "hintsUsed": null,
  "errorsCount": null,
  "status": "COMPLETED",
  "metadata": {
    "exercise_id": "11111111-1111-4111-8111-111111111111",
    "lesson_id": "22222222-2222-4222-8222-222222222222",
    "exercise_type": "MULTIPLE_CHOICE",
    "difficulty": "EASY",
    "bloom_level": "APPLY",
    "is_correct": false
  },
  "observedAt": "2026-10-07T01:20:00.000Z"
}
```

### 4.7 Example — assessment answer (score null / skipped)

```json
{
  "id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  "courseId": "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
  "conceptId": "c0ffee00-1234-4abc-8def-0123456789ab",
  "sourceType": "ASSESSMENT_ANSWER",
  "sourceId": "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
  "score": null,
  "maxScore": 3,
  "percentage": null,
  "attemptNumber": 1,
  "timeSpentSeconds": null,
  "hintsUsed": null,
  "errorsCount": null,
  "status": "SKIPPED",
  "metadata": {
    "question_id": "33333333-3333-4333-8333-333333333333",
    "question_version": 1,
    "question_type": "SHORT_ANSWER",
    "difficulty": "MEDIUM",
    "bloom_level": "UNDERSTAND",
    "assessment_id": "44444444-4444-4444-8444-444444444444",
    "assessment_type": "QUIZ",
    "assessment_question_id": "55555555-5555-4555-8555-555555555555",
    "attempt_id": "66666666-6666-4666-8666-666666666666"
  },
  "observedAt": "2026-10-07T01:25:00.000Z"
}
```

---

## 5. Contract B — Learning behaviour (existing DTO)

**Produced by:** `getStudentActivities` / `listMyActivities`  
**Sources:** `learningActivity.service.js`, `learningActivity.query.js` (`ACTIVITY_SELECT`)  
**HTTP:** `GET /api/v1/learning-activities/me` (student JWT); future MCP tool with scope `tutor:activity.read`.

### 5.1 Top-level record

| Field | Type | Nullability | Description |
|---|---|---|---|
| `id` | string (UUID) | required | Activity row id |
| `activityType` | enum string | required | See §5.2 |
| `targetType` | enum string \| null | nullable | See §5.2 |
| `targetId` | string (UUID) \| null | nullable | Target of the activity |
| `courseId` | string (UUID) \| null | nullable | Derived course when recorded |
| `conceptId` | string (UUID) \| null | nullable | Derived concept when recorded |
| `startedAt` | Date \| null | nullable | Optional duration start (often unset by UI) |
| `endedAt` | Date \| null | nullable | Optional duration end |
| `durationSeconds` | integer \| null | nullable | Optional; student UI currently does not send it |
| `metadata` | object | required (default `{}`) | Free-form JSON as stored |
| `occurredAt` | Date | required | Server/client observation time |
| `createdAt` | Date | required | Row creation time |

**Not in the DTO:** `studentId` (omitted from select for privacy on `/me` and tutor-facing use).

### 5.2 Enums (from Prisma)

**`activityType`:**  
`LESSON_VIEWED`, `LESSON_COMPLETED`, `MATERIAL_VIEWED`, `MATERIAL_DOWNLOADED`, `EXAMPLE_VIEWED`, `EXERCISE_STARTED`, `EXERCISE_HINT_REQUESTED`, `EXERCISE_SUBMITTED`, `ASSESSMENT_STARTED`, `ASSESSMENT_SUBMITTED`

**`targetType`:**  
`LESSON`, `LEARNING_MATERIAL`, `EXAMPLE`, `EXERCISE`, `ASSESSMENT`, `QUESTION`

### 5.3 What the student UI / writers actually record

| Event | Persisted? | Notes |
|---|---|---|
| Lesson opened | Yes — `LESSON_VIEWED` | Client `trackActivity` |
| External material opened | Yes — `MATERIAL_VIEWED` | External URL only |
| Example expanded | Yes — `EXAMPLE_VIEWED` | First open per mount |
| Lesson completed | API allows; **client does not send** | Instrumentation gap |
| Material downloaded | API allows; **no download path / client** | Gap |
| Video progress / resume | **No** | Gap |
| Duration / startedAt / endedAt from UI | Schema allows; **`trackActivity` sends only type + targetId** | Gap |
| Exercise / assessment submit | Yes — separate writers (`EXERCISE_SUBMITTED`, `ASSESSMENT_SUBMITTED`) | Same table |

Activity rows describe **behaviour**; they do not prove understanding.

### 5.4 Filters, limit, ordering

| Filter | Behaviour |
|---|---|
| `studentId` | Required internally; **never** from HTTP query or future tool args |
| `courseId` | Optional UUID |
| `activityType` | Optional full enum |
| `targetType` | Optional full enum |
| `occurredFrom` / `occurredTo` | Optional inclusive bounds on `occurredAt` |
| `limit` | Default **50**, max **200** |
| Ordering | `occurredAt desc`, then `id desc` |
| Cursor pagination | **Not implemented** |

### 5.5 Example

```json
{
  "id": "77777777-8888-4999-8aaa-bbbbbbbbbbbb",
  "activityType": "MATERIAL_VIEWED",
  "targetType": "LEARNING_MATERIAL",
  "targetId": "88888888-9999-4aaa-8bbb-cccccccccccc",
  "courseId": "1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9",
  "conceptId": "c0ffee00-1234-4abc-8def-0123456789ab",
  "startedAt": null,
  "endedAt": null,
  "durationSeconds": null,
  "metadata": {},
  "occurredAt": "2026-10-07T01:18:00.000Z",
  "createdAt": "2026-10-07T01:18:00.120Z"
}
```

---

## 6. Contract C — Common MCP response envelope (**proposed**)

**Not** what Express routes return today. Future MCP tools should map results/errors into this shape (or an equivalent JSON object inside MCP tool `content` / structured content).

### 6.1 Success

```json
{
  "ok": true,
  "data": {
    "records": []
  }
}
```

- `ok: true` with `records: []` means **successful empty result** (not an error).
- `data.records` holds evidence or activity arrays as appropriate.
- Optional later: `data.nextCursor` — **not** defined until pagination exists.

### 6.2 Failure

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Course id must be a valid UUID"
  }
}
```

| `error.code` | Meaning |
|---|---|
| `VALIDATION_ERROR` | Bad filters / input |
| `UNAUTHENTICATED` | Missing/invalid tutor token |
| `FORBIDDEN` | Authenticated but not allowed (role/profile/scope) |
| `DEPENDENCY_UNAVAILABLE` | e.g. knowledge graph 503 (future) |
| `INTERNAL_ERROR` | Unexpected failure; **generic** message only |

**Must never appear in `error`:** stack traces, SQL, Prisma messages, JWTs, secrets, connection strings, internal filesystem paths.

### 6.3 MCP transport mapping (guidance)

- Tool success → MCP tool result with this JSON (e.g. text or structured content).
- Domain failure → MCP tool result with `isError: true` and the same envelope body (`ok: false`), **or** protocol error only for transport-level failures.
- Auth failures at the HTTP gate (`requireBearerAuth`) remain HTTP 401/403 before a tool runs.

### 6.4 Examples

**Empty success**

```json
{ "ok": true, "data": { "records": [] } }
```

**Validation**

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed"
  }
}
```

**Unauthenticated**

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Invalid token"
  }
}
```

**Forbidden**

```json
{
  "ok": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "A student account is required"
  }
}
```

**Dependency unavailable**

```json
{
  "ok": false,
  "error": {
    "code": "DEPENDENCY_UNAVAILABLE",
    "message": "The knowledge graph database is unavailable. Try again later."
  }
}
```

**Internal**

```json
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal error"
  }
}
```

---

## 7. Student identity and security rules

Confirmed against `tutorToken.js`, `authenticate.js`, `getAuthenticatedUser`, `findStudentByUserId`, evidence/activity services:

1. Identity is established by the **trusted backend** (tutor-token verification + live DB checks), not by the LLM.
2. Resolve `sub` → active user; require `STUDENT`; resolve `students.id`; it must match claim `student_id`.
3. Future MCP tool inputs **must not** accept `studentId` / `userId` for student-scoped reads.
4. `courseId` / `conceptId` / activity filters only **narrow** that student’s rows.
5. Login JWTs (`JWT_SECRET`, no tutor iss/aud/scopes) are **not** tutor tokens.
6. Tutor tokens use dedicated secret, issuer, audience, ≤15m lifetime, and scopes:  
   `tutor:evidence.read`, `tutor:activity.read`, `tutor:course.read`.
7. Each future tool must require the matching scope.
8. Evidence/activity DTOs omit `studentId` from returned records.

**Gaps (documented, not fixed in this step):** MCP not mounted; no token-issuing HTTP route; `getCurrentEvidence` has no route and trusts caller-supplied `studentId` until MCP injects it.

---

## 8. Known limitations

- Behaviour fields on evidence (`timeSpentSeconds`, `hintsUsed`, `errorsCount`) are often null.
- Responses/answers are not in evidence metadata.
- `LEARNING_ACTIVITY` evidence source type unused by writers.
- Lesson completion, downloads, video progress, dwell time largely uninstrumented.
- Course enrollment is **not** enforced by application reads today.
- No cursor pagination for activities.
- Graph / course-knowledge contract not defined here.

## 9. Compatibility

Tutors should treat unknown JSON keys as ignorable for forward compatibility within a major version. Removing or reinterpreting null-vs-zero semantics is a breaking change.
