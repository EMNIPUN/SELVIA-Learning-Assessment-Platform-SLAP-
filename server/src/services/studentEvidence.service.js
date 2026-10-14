import { parseOrThrow } from '../middleware/validate.js'
import { toEvidenceView } from '../repositories/studentEvidence.query.js'
import * as evidenceRepository from '../repositories/studentEvidence.repository.js'
import { currentEvidenceFiltersSchema } from '../schemas/studentEvidence.schemas.js'

// Reads the evidence observed about a student for the Adaptive AI Tutor, which alone interprets it. Nothing here
// computes mastery, competency, gaps, recommendations or adaptive decisions, and nothing is written.
//
// Not exposed through a route yet. Whoever exposes it decides who may read which student's evidence: this
// service takes a student id and does not check the caller.

// { studentId, courseId?, conceptId? }; invalid input is a 400. Returns the student's current (not superseded)
// evidence, oldest first. An empty list means nothing was observed, and is also what an unknown student id gives.
export async function getCurrentEvidence(filters) {
  const rows = await evidenceRepository.findCurrentEvidence(parseOrThrow(currentEvidenceFiltersSchema, filters))
  return rows.map(toEvidenceView)
}
