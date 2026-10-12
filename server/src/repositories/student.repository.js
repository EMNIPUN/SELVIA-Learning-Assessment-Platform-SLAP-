import prisma from '../database/postgres/prisma.js'

export function findStudentByUserId(userId) {
  return prisma.student.findUnique({ where: { userId }, select: { id: true } })
}
