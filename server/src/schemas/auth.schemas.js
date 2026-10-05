import { z } from 'zod'
import { REGISTRABLE_ROLES, ROLES } from '../constants/roles.js'
import { MAX_PASSWORD_BYTES } from '../utils/password.js'

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .max(255, 'Email must be at most 255 characters')
  .email('Email must be a valid email address')

const name = (label) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} must be at most 100 characters`)

const newPassword = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES, {
    message: `Password must be at most ${MAX_PASSWORD_BYTES} bytes`,
  })
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number')

// Stored uppercase so "it21000001" and "IT21000001" count as the same number.
const profileNumber = (label) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .toUpperCase()
    .min(1, `${label} is required`)
    .max(50, `${label} must be at most 50 characters`)
    .regex(/^[A-Z0-9-]+$/, `${label} may only contain letters, numbers and hyphens`)

// STUDENT requires studentNumber, LECTURER requires staffNumber; the other role's number is dropped.
export const registerSchema = z
  .object({
    email,
    password: newPassword,
    firstName: name('First name'),
    lastName: name('Last name'),
    role: z.enum(REGISTRABLE_ROLES, { error: `Role must be one of: ${REGISTRABLE_ROLES.join(', ')}` }),
    studentNumber: profileNumber('Student number').optional(),
    staffNumber: profileNumber('Staff number').optional(),
  })
  .superRefine(
    (data, ctx) => {
      if (data.role === ROLES.STUDENT && data.studentNumber === undefined) {
        ctx.addIssue({ code: 'custom', path: ['studentNumber'], message: 'Student number is required' })
      }
      if (data.role === ROLES.LECTURER && data.staffNumber === undefined) {
        ctx.addIssue({ code: 'custom', path: ['staffNumber'], message: 'Staff number is required' })
      }
    },
    // Run even when other fields are missing, so every error is reported in one response.
    { when: ({ value }) => REGISTRABLE_ROLES.includes(value?.role) },
  )
  .transform(({ studentNumber, staffNumber, ...account }) =>
    account.role === ROLES.STUDENT ? { ...account, studentNumber } : { ...account, staffNumber },
  )

export const loginSchema = z.object({
  email,
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(1024, 'Password is too long'),
})
