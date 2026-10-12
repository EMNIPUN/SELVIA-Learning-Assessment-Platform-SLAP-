import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import env from '../config/env.js'
import { ROLES } from '../constants/roles.js'
import prisma from '../database/postgres/prisma.js'
import { ApiError } from '../utils/ApiError.js'
import { hashPassword, verifyPassword } from '../utils/password.js'
import { signAccessToken } from '../utils/token.js'

// The only user fields that may leave the service. passwordHash is never selected except for login.
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
}

const INVALID_CREDENTIALS = 'Invalid email or password'

// Compared against when the user or their hash is missing, so response time does not reveal either.
let dummyPasswordHash
async function getDummyPasswordHash() {
  dummyPasswordHash ??= await hashPassword(randomUUID())
  return dummyPasswordHash
}

const STUDENT_PROFILE_SELECT = { id: true, studentNumber: true }
const LECTURER_PROFILE_SELECT = { id: true, staffNumber: true }

const DUPLICATE_MESSAGES = {
  email: 'An account with this email already exists',
  studentNumber: 'This student number is already registered',
  staffNumber: 'This staff number is already registered',
}

// Unique index names from the init migration.
const UNIQUE_INDEX_FIELDS = {
  users_email_key: 'email',
  students_student_number_key: 'studentNumber',
  lecturers_staff_number_key: 'staffNumber',
}

// Generous limits because each statement is a network round trip to the hosted database.
const REGISTRATION_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 }

function duplicateConflict(fields) {
  return ApiError.conflict(
    DUPLICATE_MESSAGES[fields[0]],
    fields.map((field) => ({ field, message: DUPLICATE_MESSAGES[field] })),
  )
}

async function findTakenFields({ email, studentNumber, staffNumber }) {
  const [user, student, lecturer] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    studentNumber && prisma.student.findUnique({ where: { studentNumber }, select: { id: true } }),
    staffNumber && prisma.lecturer.findUnique({ where: { staffNumber }, select: { id: true } }),
  ])

  return [user && 'email', student && 'studentNumber', lecturer && 'staffNumber'].filter(Boolean)
}

// Creates the User and its Student or Lecturer profile atomically: if either insert fails, neither is kept.
export async function registerUser({ email, password, firstName, lastName, role, studentNumber, staffNumber }) {
  const takenFields = await findTakenFields({ email, studentNumber, staffNumber })
  if (takenFields.length > 0) {
    throw duplicateConflict(takenFields)
  }

  const passwordHash = await hashPassword(password)

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, firstName, lastName, role },
        select: SAFE_USER_SELECT,
      })

      if (role === ROLES.STUDENT) {
        const student = await tx.student.create({
          data: { userId: user.id, studentNumber },
          select: STUDENT_PROFILE_SELECT,
        })
        return { ...user, student }
      }

      const lecturer = await tx.lecturer.create({
        data: { userId: user.id, staffNumber },
        select: LECTURER_PROFILE_SELECT,
      })
      return { ...user, lecturer }
    }, REGISTRATION_TRANSACTION_OPTIONS)
  } catch (err) {
    // A concurrent registration can claim the same email or number between the check and the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const field = UNIQUE_INDEX_FIELDS[err.meta?.driverAdapterError?.cause?.constraint?.index]
      if (field) {
        throw duplicateConflict([field])
      }
    }
    throw err
  }
}

export async function loginUser({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { ...SAFE_USER_SELECT, passwordHash: true },
  })

  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await getDummyPasswordHash()))

  if (!user?.passwordHash || !passwordMatches) {
    throw ApiError.unauthorized(INVALID_CREDENTIALS)
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated')
  }

  const loggedInUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: SAFE_USER_SELECT,
  })

  return {
    user: loggedInUser,
    token: signAccessToken(loggedInUser),
    expiresIn: env.jwtExpiresIn,
  }
}

export async function getAuthenticatedUser(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: SAFE_USER_SELECT })

  if (!user || !user.isActive) {
    throw ApiError.unauthorized('Invalid token')
  }

  return user
}
