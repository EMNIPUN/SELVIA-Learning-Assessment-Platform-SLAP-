import express from 'express'
import v1Routes from './routes/v1/index.js'
import { notFound } from './middleware/notFound.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()

app.disable('x-powered-by')

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/v1', v1Routes)

app.use(notFound)
app.use(errorHandler)

export default app
