import { MAX_UPLOAD_MB, readUpload, saveUpload } from '../uploads.js'
import { tr } from '../i18n.js'

// Raw file upload: the body is the file itself, its name goes in ?name=.
export default async function uploadRoutes(app) {
  // Scoped to this plugin: every content type arrives as a Buffer.
  app.removeAllContentTypeParsers()
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_MB * 1024 * 1024 }, (req, body, done) => done(null, body))

  app.setErrorHandler((err, req, reply) => {
    if (err.statusCode === 413) return reply.code(413).send({ error: tr('Fichier trop volumineux ({mb} Mo maximum)', { mb: MAX_UPLOAD_MB }) })
    const status = err.statusCode || 500
    if (status >= 500) req.log.error(err)
    reply.code(status).send({ error: err.message })
  })

  app.post('/uploads', async (req, reply) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return reply.code(400).send({ error: tr('Fichier vide') })
    const saved = saveUpload(req.body, { name: String(req.query.name || ''), mime: req.headers['content-type'] || '' })
    return reply.code(201).send(saved)
  })

  app.get('/uploads/:file', async (req, reply) => {
    const found = readUpload(req.params.file)
    if (!found) return reply.code(404).send({ error: tr('Fichier introuvable') })
    return reply.headers(found.headers).send(found.stream)
  })
}
