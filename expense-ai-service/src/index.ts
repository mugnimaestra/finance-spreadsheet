import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { healthRoutes } from './routes/health'
import { expenseRoutes } from './routes/expense'
import { startCleanupScheduler } from './services/cleanup-scheduler'

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

// Export for Bun runtime
export default {
  port,
  fetch: app.fetch,
}
