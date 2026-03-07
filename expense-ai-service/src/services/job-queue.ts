import { randomBytes } from 'crypto'
import { 
  extractExpenseFromImage, 
  extractExpenseFromText,
  type ExpenseData 
} from './opencode-runner'
import { downloadImage, cleanupImage } from './image-handler'

// ============================================================================
// Types
// ============================================================================

export interface ExpenseJob {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  jobType: 'image' | 'text'
  imageUrl?: string
  text?: string
  callbackUrl: string
  model?: string
  chatId?: number
  messageId?: number
  metadata?: { userId?: number; timestamp?: number }
  result?: ExpenseData
  error?: string
  createdAt: number
  completedAt?: number
}

interface WebhookPayload {
  jobId: string
  success: boolean
  data?: ExpenseData
  error?: string
  chatId?: number
  messageId?: number
  metadata?: { userId?: number; timestamp?: number }
}

// ============================================================================
// Job Storage (In-Memory)
// ============================================================================

const jobs = new Map<string, ExpenseJob>()

// Job queue for sequential processing
const jobQueue: string[] = []
let isProcessing = false

// Generate unique job ID
function generateJobId(): string {
  const timestamp = Date.now()
  const random = randomBytes(6).toString('hex')
  return `expense_${timestamp}_${random}`
}

// ============================================================================
// Public API
// ============================================================================

export function createImageJob(
  imageUrl: string, 
  callbackUrl: string,
  options?: { model?: string; chatId?: number; messageId?: number; metadata?: { userId?: number; timestamp?: number } }
): string {
  const id = generateJobId()
  
  const job: ExpenseJob = {
    id,
    status: 'pending',
    jobType: 'image',
    imageUrl,
    callbackUrl,
    model: options?.model,
    chatId: options?.chatId,
    messageId: options?.messageId,
    metadata: options?.metadata,
    createdAt: Date.now()
  }
  
  jobs.set(id, job)
  jobQueue.push(id)
  
  // Trigger processing
  processNextJob()
  
  return id
}

export function createTextJob(
  text: string, 
  callbackUrl: string,
  options?: { model?: string; chatId?: number; messageId?: number; metadata?: { userId?: number; timestamp?: number } }
): string {
  const id = generateJobId()
  
  const job: ExpenseJob = {
    id,
    status: 'pending',
    jobType: 'text',
    text,
    callbackUrl,
    model: options?.model,
    chatId: options?.chatId,
    messageId: options?.messageId,
    metadata: options?.metadata,
    createdAt: Date.now()
  }
  
  jobs.set(id, job)
  jobQueue.push(id)
  
  // Trigger processing
  processNextJob()
  
  return id
}

export function getJob(id: string): ExpenseJob | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, updates: Partial<ExpenseJob>): void {
  const job = jobs.get(id)
  if (job) {
    jobs.set(id, { ...job, ...updates })
  }
}

export function getQueueLength(): number {
  return jobQueue.length
}

export function getActiveJobs(): ExpenseJob[] {
  return Array.from(jobs.values()).filter(j => j.status === 'processing')
}

// ============================================================================
// Job Processing
// ============================================================================

async function processNextJob(): Promise<void> {
  if (isProcessing || jobQueue.length === 0) {
    return
  }
  
  isProcessing = true
  const jobId = jobQueue.shift()!
  const job = jobs.get(jobId)
  
  if (!job) {
    isProcessing = false
    processNextJob()
    return
  }
  
  // Update status to processing
  updateJob(jobId, { status: 'processing' })
  
  try {
    let extractResult: { success: boolean; data?: ExpenseData; error?: string }
    
    if (job.jobType === 'text') {
      console.log(`[JobQueue] Processing TEXT job ${jobId}`)
      extractResult = await extractExpenseFromText(job.text!, job.model)
    } else {
      // Image job
      const maskedUrl = job.imageUrl!.replace(/bot\d+:[^/]+/i, 'bot[TOKEN_MASKED]')
      console.log(`[JobQueue] Processing IMAGE job ${jobId}, URL: ${maskedUrl}`)
      
      const downloadResult = await downloadImage(job.imageUrl!)
      
      if (!downloadResult.success || !downloadResult.filePath) {
        throw new Error(downloadResult.error || 'Failed to download image')
      }
      
      const downloadedFilePath = downloadResult.filePath
      extractResult = await extractExpenseFromImage(downloadedFilePath, job.model)
      
      // Cleanup downloaded file
      await cleanupImage(downloadedFilePath)
    }
    
    if (!extractResult.success) {
      throw new Error(extractResult.error || 'Failed to extract expense data')
    }
    
    // Update job with result
    updateJob(jobId, {
      status: 'completed',
      result: extractResult.data,
      completedAt: Date.now()
    })
    
    console.log(`[JobQueue] Job ${jobId} completed successfully`)
    
    // Send webhook
    await sendWebhook(job.callbackUrl, {
      jobId,
      success: true,
      data: extractResult.data,
      chatId: job.chatId,
      messageId: job.messageId,
      metadata: job.metadata
    })
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    updateJob(jobId, {
      status: 'failed',
      error: errorMessage,
      completedAt: Date.now()
    })
    
    console.error(`[JobQueue] Job ${jobId} failed:`, errorMessage)
    
    // Send webhook with error
    await sendWebhook(job.callbackUrl, {
      jobId,
      success: false,
      error: errorMessage,
      chatId: job.chatId,
      messageId: job.messageId,
      metadata: job.metadata
    })
  }
  
  isProcessing = false
  
  // Process next job in queue
  processNextJob()
}

async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  const webhookSecret = process.env.WEBHOOK_SECRET
  
  try {
    console.log(`[JobQueue] Sending webhook to ${url}`)
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    if (webhookSecret) {
      headers['X-Webhook-Secret'] = webhookSecret
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      console.error(`[JobQueue] Webhook failed with status ${response.status}`)
    } else {
      console.log(`[JobQueue] Webhook sent successfully`)
    }
  } catch (error) {
    console.error('[JobQueue] Webhook error:', error)
  }
}

// ============================================================================
// Cleanup Old Jobs (run periodically)
// ============================================================================

const JOB_TTL_MS = 30 * 60 * 1000 // 30 minutes

export function cleanupOldJobs(): void {
  const now = Date.now()
  let cleaned = 0
  
  for (const [id, job] of jobs) {
    if (job.completedAt && (now - job.completedAt) > JOB_TTL_MS) {
      jobs.delete(id)
      cleaned++
    }
  }
  
  if (cleaned > 0) {
    console.log(`[JobQueue] Cleaned up ${cleaned} old jobs`)
  }
}

// Start cleanup interval
setInterval(cleanupOldJobs, 5 * 60 * 1000) // Every 5 minutes

// Legacy export for backwards compatibility
export const createJob = createImageJob
