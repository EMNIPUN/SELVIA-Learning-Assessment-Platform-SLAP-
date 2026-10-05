import prisma from '../database/postgres/prisma.js'

export function findLecturerByUserId(userId) {
  return prisma.lecturer.findUnique({ where: { userId }, select: { id: true } })
}
