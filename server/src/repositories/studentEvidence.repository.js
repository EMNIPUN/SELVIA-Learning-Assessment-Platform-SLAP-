import prisma from '../database/postgres/prisma.js'
import { currentEvidenceQuery } from './studentEvidence.query.js'

// student_evidence is append-only (enforced by a database trigger) and is written only together with the
// submission it observes (exerciseAttempt.repository.js, assessmentAttempt.repository.js). This module only reads.

export function findCurrentEvidence(filters) {
  return prisma.studentEvidence.findMany(currentEvidenceQuery(filters))
}
