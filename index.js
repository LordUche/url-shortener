require('dotenv/config')
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const morgan = require('morgan')
const mongoose = require('mongoose')
const mongoSanitize = require('express-mongo-sanitize')
const xss = require('xss-clean')
const yup = require('yup')
const { nanoid } = require('nanoid')

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION 💥 Shutting down server...')
  console.error(`${err.name}:`, err)
  process.exit(1)
})

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true
  })
  .then(() => console.log('✨ Database connection successful!'))
  .catch((error) => console.log('💥', error.message))

const schema = yup.object().shape({
  slug: yup
    .string()
    .trim()
    .matches(/[a-zA-Z0-9_-]/)
    .lowercase()
    .nullable(),
  url: yup.string().url().required()
})

const linkSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      unique: [true, 'Slug is taken'],
      trim: true,
      required: [true, 'Slug is required']
    },
    url: { type: String, required: [true, 'URL is required'] }
  },
  { toObject: { versionKey: false }, toJSON: { versionKey: false } }
)

const Link = mongoose.model('Link', linkSchema)

const app = express()
app.use(cors())
app.use(helmet())
app.use(compression())
app.use(express.json())
app.use(mongoSanitize())
app.use(xss())
if (app.get('env') === 'development') app.use(morgan('tiny'))

app.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params
    const link = await Link.findOne({ slug })
    if (!link) {
      const error = new Error('Link not found')
      error.status = 404
      next(error)
    }
    res.redirect(link.url)
  } catch (error) {
    next(error)
  }
})

app.post('/url', async (req, res, next) => {
  try {
    let { slug, url } = req.body
    if (!slug) slug = nanoid(5)
    const validBody = await schema.validate({ slug, url }, { stripUnknown: true })
    const link = await Link.create(validBody)
    res.status(201).json(link)
  } catch (error) {
    next(error)
  }
})

app.use((error, req, res, next) => {
  error.status ? res.status(error.status) : res.status(500)
  if (error.name === 'MongoError' && error.code === 11000) {
    error.message = 'Slug is taken'
  }
  console.log(error)
  res.json({
    message: error.message,
    stack: app.get('env') === 'development' ? error.stack : undefined
  })
})

const PORT = process.env.PORT || 1337
const server = app.listen(PORT, () => console.log('🚀 App started on port', PORT))

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION 💥 Shutting down server...')
  console.error(`${err.name}:`, err)
  server.close(() => process.exit(1))
})

process.on('SIGTERM', () => {
  console.log('SIGTERM SIGNAL RECEIVED 👋 Shutting down gracefully...')
  server.close(() => console.log('💥 Process terminated!'))
})
