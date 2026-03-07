import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { 
  extractExpenseFromText, 
  extractExpenseFromImage,
  writeExpenseToSheets,
  type ExpenseData 
} from '../services/opencode-runner'
import { downloadImage, cleanupImage } from '../services/image-handler'
import { createJob, createTextJob, getJob, type ExpenseJob } from '../services/job-queue'

// ============================================================================
// Types
// ============================================================================

interface ExtractTextRequest {
  text: string
  model?: string
  callbackUrl?: string  // If provided, use async mode
  chatId?: number       // For webhook context
  messageId?: number    // For webhook context
  metadata?: { userId?: number; timestamp?: number }
}

interface ExtractImageRequest {
  imageUrl: string
  model?: string
  callbackUrl?: string  // If provided, use async mode
  chatId?: number       // For webhook context
  messageId?: number    // For webhook context
  metadata?: { userId?: number; timestamp?: number }
}

interface WriteExpenseRequest {
  expense: ExpenseData
}

interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  jobId?: string
  status?: string
}

// ============================================================================
// Route Setup
// ============================================================================

export const expenseRoutes = new Hono()

const apiToken = process.env.API_TOKEN

if (apiToken) {
  expenseRoutes.use('/*', bearerAuth({ token: apiToken }))
} else {
  expenseRoutes.use('/*', async (c, next) => {
    console.warn('WARNING: API_TOKEN is not configured. All requests will be rejected.')
    return c.json<ApiResponse>({
      success: false,
      error: 'Server misconfiguration: API authentication not configured'
    }, 500)
  })
}

// ============================================================================
// POST /extract/text - Extract expense data from text
// Supports both sync and async modes
// ============================================================================

expenseRoutes.post('/extract/text', async (c) => {
  try {
    const body = await c.req.json<ExtractTextRequest>()
    
    if (!body.text || typeof body.text !== 'string') {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing or invalid "text" field in request body'
      }, 400)
    }

    if (body.text.trim().length === 0) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Text field cannot be empty'
      }, 400)
    }

    // ========================================================================
    // ASYNC MODE: callbackUrl provided
    // ========================================================================
    if (body.callbackUrl) {
      // Validate callbackUrl
      try {
        new URL(body.callbackUrl)
      } catch {
        return c.json<ApiResponse>({
          success: false,
          error: 'Invalid URL format for "callbackUrl"'
        }, 400)
      }

      const jobId = createTextJob(
        body.text,
        body.callbackUrl,
        {
          model: body.model,
          chatId: body.chatId,
          messageId: body.messageId,
          metadata: body.metadata
        }
      )

      console.log(`[Async] Created job ${jobId} for text extraction`)

      return c.json<ApiResponse>({
        success: true,
        jobId,
        status: 'pending',
        message: 'Job queued for processing'
      }, 202)
    }

    // ========================================================================
    // SYNC MODE: No callbackUrl - process immediately
    // ========================================================================
    const result = await extractExpenseFromText(body.text, body.model)

    if (!result.success) {
      return c.json<ApiResponse>({
        success: false,
        error: result.error || 'Failed to extract expense data'
      }, 422)
    }

    return c.json<ApiResponse<ExpenseData>>({
      success: true,
      data: result.data
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid JSON in request body'
      }, 400)
    }

    console.error('Error in /extract/text:', error)
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500)
  }
})

// ============================================================================
// POST /extract/image - Extract expense data from image URL
// Supports both sync and async modes
// ============================================================================

expenseRoutes.post('/extract/image', async (c) => {
  let downloadedFilePath: string | undefined

  try {
    const body = await c.req.json<ExtractImageRequest>()

    if (!body.imageUrl || typeof body.imageUrl !== 'string') {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing or invalid "imageUrl" field in request body'
      }, 400)
    }

    try {
      new URL(body.imageUrl)
    } catch {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid URL format for "imageUrl"'
      }, 400)
    }

    // ========================================================================
    // ASYNC MODE: callbackUrl provided
    // ========================================================================
    if (body.callbackUrl) {
      // Validate callbackUrl
      try {
        new URL(body.callbackUrl)
      } catch {
        return c.json<ApiResponse>({
          success: false,
          error: 'Invalid URL format for "callbackUrl"'
        }, 400)
      }

      const jobId = createJob(
        body.imageUrl,
        body.callbackUrl,
        {
          model: body.model,
          chatId: body.chatId,
          messageId: body.messageId,
          metadata: body.metadata
        }
      )

      console.log(`[Async] Created job ${jobId} for image extraction`)

      return c.json<ApiResponse>({
        success: true,
        jobId,
        status: 'pending',
        message: 'Job queued for processing'
      }, 202)
    }

    // ========================================================================
    // SYNC MODE: No callbackUrl - process immediately
    // ========================================================================
    const downloadResult = await downloadImage(body.imageUrl)

    if (!downloadResult.success || !downloadResult.filePath) {
      return c.json<ApiResponse>({
        success: false,
        error: downloadResult.error || 'Failed to download image'
      }, 422)
    }

    downloadedFilePath = downloadResult.filePath

    const extractResult = await extractExpenseFromImage(downloadedFilePath, body.model)

    await cleanupImage(downloadedFilePath)
    downloadedFilePath = undefined

    if (!extractResult.success) {
      return c.json<ApiResponse>({
        success: false,
        error: extractResult.error || 'Failed to extract expense data from image'
      }, 422)
    }

    return c.json<ApiResponse<ExpenseData>>({
      success: true,
      data: extractResult.data
    })
  } catch (error) {
    if (downloadedFilePath) {
      await cleanupImage(downloadedFilePath).catch(() => {})
    }

    if (error instanceof SyntaxError) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid JSON in request body'
      }, 400)
    }

    console.error('Error in /extract/image:', error)
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500)
  }
})

// ============================================================================
// GET /jobs/:id - Get job status
// ============================================================================

expenseRoutes.get('/jobs/:id', async (c) => {
  const jobId = c.req.param('id')

  if (!jobId) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Missing job ID'
    }, 400)
  }

  const job = getJob(jobId)

  if (!job) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Job not found'
    }, 404)
  }

  const response: ApiResponse<ExpenseJob> = {
    success: true,
    data: job,
    status: job.status
  }

  // Add result or error based on status
  if (job.status === 'completed' && job.result) {
    response.data = job
  } else if (job.status === 'failed' && job.error) {
    response.error = job.error
  }

  return c.json(response)
})

// ============================================================================
// POST /write - Write expense data to Google Sheets
// ============================================================================

expenseRoutes.post('/write', async (c) => {
  try {
    const body = await c.req.json<WriteExpenseRequest>()

    if (!body.expense || typeof body.expense !== 'object') {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing or invalid "expense" field in request body'
      }, 400)
    }

    const requiredFields = [
      'timestamp',
      'date',
      'category',
      'subcategory',
      'description',
      'merchant',
      'amount',
      'paymentMethod'
    ] as const

    for (const field of requiredFields) {
      if (body.expense[field] === undefined || body.expense[field] === null) {
        return c.json<ApiResponse>({
          success: false,
          error: `Missing required expense field: "${field}"`
        }, 400)
      }
    }

    const result = await writeExpenseToSheets(body.expense)

    if (!result.success) {
      return c.json<ApiResponse>({
        success: false,
        error: result.error || 'Failed to write expense to Google Sheets'
      }, 422)
    }

    return c.json<ApiResponse>({
      success: true,
      message: 'Expense successfully written to Google Sheets'
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Invalid JSON in request body'
      }, 400)
    }

    console.error('Error in /write:', error)
    return c.json<ApiResponse>({
      success: false,
      error: 'Internal server error'
    }, 500)
  }
})
