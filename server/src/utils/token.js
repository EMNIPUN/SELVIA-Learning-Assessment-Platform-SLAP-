import jwt from 'jsonwebtoken'
import env from '../config/env.js'
import { ApiError } from './ApiError.js'

const ALGORITHM = 'HS256'

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, env.jwtSecret, {
    algorithm: ALGORITHM,
    subject: user.id,
    expiresIn: env.jwtExpiresIn,
  })
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] })
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token')
  }
}
