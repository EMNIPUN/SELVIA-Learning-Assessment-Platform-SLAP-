import { UserRole } from '@prisma/client'

export const ROLES = UserRole

// ADMIN accounts cannot be created through public registration.
export const REGISTRABLE_ROLES = [UserRole.STUDENT, UserRole.LECTURER]
