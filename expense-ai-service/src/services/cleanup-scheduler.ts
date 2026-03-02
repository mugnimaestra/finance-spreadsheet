import { cleanupOldImages } from "./image-handler";

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_MAX_AGE_MINUTES = 60;

function getIntervalMinutes(): number {
  const envValue = process.env.CLEANUP_INTERVAL_MINUTES;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_INTERVAL_MINUTES;
}

function getMaxAgeMinutes(): number {
  const envValue = process.env.CLEANUP_MAX_AGE_MINUTES;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_AGE_MINUTES;
}

async function runCleanup(): Promise<void> {
  const maxAge = getMaxAgeMinutes();
  try {
    const deletedCount = await cleanupOldImages(maxAge);
    if (deletedCount > 0) {
      console.log(`[Cleanup] Deleted ${deletedCount} old image file(s) (older than ${maxAge} min)`);
    }
  } catch (error) {
    console.error("[Cleanup] Error during cleanup:", error);
  }
}

export async function startCleanupScheduler(): Promise<void> {
  const intervalMinutes = getIntervalMinutes();
  const maxAgeMinutes = getMaxAgeMinutes();
  
  // Run startup cleanup immediately
  console.log(`[Cleanup] Running startup cleanup (max age: ${maxAgeMinutes} min)...`);
  await runCleanup();
  
  // Schedule periodic cleanup
  const intervalMs = intervalMinutes * 60 * 1000;
  cleanupIntervalId = setInterval(() => {
    runCleanup();
  }, intervalMs);
  
  console.log(`[Cleanup] Scheduler started (interval: ${intervalMinutes} min)`);
}

export function stopCleanupScheduler(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    console.log("[Cleanup] Scheduler stopped");
  }
}
