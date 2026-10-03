export function getHealth(req, res) {
  res.status(200).json({
    success: true,
    message: 'SELVIA Learning Platform API is running',
    timestamp: new Date().toISOString(),
  })
}
