import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import projectRoutes from './routes/projects.js'
import contentRoutes from './routes/content.js'
import overviewRoutes from './routes/overview.js'
import integrationRoutes from './routes/integrations.js'

function checkPassword(header, password) {
  const [scheme, encoded] = String(header || '').split(' ')
  if (scheme !== 'Basic' || !encoded) return false
  const given = Buffer.from(Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':'))
  const expected = Buffer.from(password)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function buildApp({ db, logger = true, webDist = process.env.WEB_DIST } = {}) {
  const app = Fastify({ logger: logger && { level: process.env.LOG_LEVEL || 'info' }, disableRequestLogging: true })

  // Optional single-user protection, handy when exposed beyond localhost.
  const password = process.env.APP_PASSWORD
  if (password) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.url === '/api/health') return
      if (!checkPassword(req.headers.authorization, password)) {
        return reply.code(401).header('WWW-Authenticate', 'Basic realm="projectory"').send({ error: 'Authentification requise' })
      }
    })
  }

  // Must be set before the route plugins so they inherit it.
  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || 500
    if (status >= 500) req.log.error(err)
    reply.code(status).send({ error: err.message })
  })

  app.get('/api/health', async () => ({ ok: true }))
  await app.register(projectRoutes, { prefix: '/api', db })
  await app.register(contentRoutes, { prefix: '/api', db })
  await app.register(overviewRoutes, { prefix: '/api', db })
  await app.register(integrationRoutes, { prefix: '/api', db })

  // In production the built front-end is served by the same process.
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist })
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Route inconnue' })
      return reply.sendFile('index.html')
    })
  }

  return app
}

export const defaultWebDist = join(import.meta.dirname, '..', '..', 'web', 'dist')
