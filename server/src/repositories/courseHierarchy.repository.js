import prisma from '../database/postgres/prisma.js'
import { GRAPH_LABELS } from '../constants/courseGraph.js'

// Read-only access to the PostgreSQL hierarchy for knowledge graph synchronization.

const DELEGATES = {
  [GRAPH_LABELS.COURSE]: prisma.course,
  [GRAPH_LABELS.MODULE]: prisma.module,
  [GRAPH_LABELS.TOPIC]: prisma.topic,
  [GRAPH_LABELS.CONCEPT]: prisma.concept,
  [GRAPH_LABELS.LESSON]: prisma.lesson,
}

// Only the fields mirrored in the graph.
export function findCourseHierarchy(courseId) {
  return prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      code: true,
      title: true,
      modules: {
        select: {
          id: true,
          title: true,
          topics: {
            select: {
              id: true,
              title: true,
              concepts: {
                select: { id: true, code: true, name: true, lessons: { select: { id: true, title: true } } },
              },
            },
          },
        },
      },
    },
  })
}

export async function findExistingIds(label, ids) {
  if (ids.length === 0) return []
  const rows = await DELEGATES[label].findMany({ where: { id: { in: ids } }, select: { id: true } })
  return rows.map((row) => row.id)
}
