import { loginUser, registerUser } from '../services/auth.service.js'

export async function register(req, res) {
  const user = await registerUser(req.body)

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    data: { user },
  })
}

export async function login(req, res) {
  const { user, token, expiresIn } = await loginUser(req.body)

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: { user, token, tokenType: 'Bearer', expiresIn },
  })
}

export function getMe(req, res) {
  res.status(200).json({
    success: true,
    data: { user: req.user },
  })
}
