import { Hono } from 'hono'

export const healthRoutes = new Hono()

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
})

healthRoutes.get('/ready', (c) => {
  return c.json({
    ready: true,
    timestamp: new Date().toISOString(),
  })
})
