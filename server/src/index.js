import { openDb } from './db.js'
import { buildApp, defaultWebDist } from './app.js'
import { startScheduler } from './sync/index.js'

const db = openDb()
const app = await buildApp({ db, webDist: process.env.WEB_DIST || defaultWebDist })

await app.listen({ port: Number(process.env.PORT || 3001), host: process.env.HOST || '0.0.0.0' })
startScheduler(db, app.log)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await app.close()
    db.close()
    process.exit(0)
  })
}
