import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 12

// bcrypt only uses the first 72 bytes of a password; longer passwords are rejected by validation.
export const MAX_PASSWORD_BYTES = 72

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash)
}
