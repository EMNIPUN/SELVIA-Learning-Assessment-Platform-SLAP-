import { ExternalIdentityLinkMethod } from '@prisma/client'

/** Supported link methods for this foundation step. No email/student-number auto-link. */
export const EXTERNAL_IDENTITY_LINK_METHODS = ExternalIdentityLinkMethod

export const ADMIN_VERIFIED_LINK_METHOD = ExternalIdentityLinkMethod.ADMIN_VERIFIED

export const MAX_ISSUER_LENGTH = 512
export const MAX_SUBJECT_LENGTH = 255
