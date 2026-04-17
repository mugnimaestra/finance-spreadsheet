import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { healthRoutes } from './routes/health'
import { expenseRoutes } from './routes/expense'
import { startCleanupScheduler, stopCleanupScheduler } from './services/cleanup-scheduler'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: '*', // Allow all origins (will restrict later)
}))

// Routes
app.route('/health', healthRoutes)
app.route('/api/expense', expenseRoutes)

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'expense-ai-service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      expense: '/api/expense',
    },
  })
})

// Server configuration
const port = Number(process.env.PORT) || 3000

console.log(`Expense AI Service starting on port ${port}`)

// Start background cleanup scheduler
startCleanupScheduler().catch((error) => {
  console.error('Failed to start cleanup scheduler:', error)
})

// Start server explicitly to get server instance for graceful shutdown
const server = Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`Expense AI Service listening on port ${server.port}`)

// ============================================================================
// Graceful Shutdown
// ============================================================================

let isShuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`[Shutdown] Received ${signal}, shutting down gracefully...`)

  // 1. Stop accepting new connections
  try {
    server.stop()
    console.log('[Shutdown] Server stopped accepting new connections')
  } catch (err) {
    console.error('[Shutdown] Error stopping server:', err)
  }

  // 2. Stop cleanup scheduler
  try {
    stopCleanupScheduler()
  } catch (err) {
    console.error('[Shutdown] Error stopping cleanup scheduler:', err)
  }

  // 3. Give in-flight requests a moment to complete
  await new Promise((resolve) => setTimeout(resolve, 2000))

  console.log('[Shutdown] Graceful shutdown complete')
  process.exit(0)
}

// Register signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
