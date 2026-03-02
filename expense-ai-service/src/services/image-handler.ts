import { mkdir, unlink, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

// Types
export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

// Constants
const TEMP_DIR = "/tmp/expense-ai-images";
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/octet-stream", // Telegram often returns this
];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

// Magic bytes for image detection
const IMAGE_SIGNATURES: { bytes: number[]; extension: string }[] = [
  { bytes: [0xFF, 0xD8, 0xFF], extension: "jpg" },           // JPEG
  { bytes: [0x89, 0x50, 0x4E, 0x47], extension: "png" },     // PNG
  { bytes: [0x52, 0x49, 0x46, 0x46], extension: "webp" },    // WebP (RIFF header)
];

/**
 * Ensures the temp directory exists, creating it if necessary
 */
async function ensureTempDir(): Promise<void> {
  try {
    await mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, which is fine
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
}

/**
 * Generates a unique filename using timestamp and random string
 */
function generateUniqueFilename(extension: string): string {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `expense_${timestamp}_${randomStr}.${extension}`;
}

/**
 * Extracts file extension from content-type header
 */
function getExtensionFromContentType(contentType: string): string | null {
  const typeMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return typeMap[contentType.toLowerCase().split(";")[0].trim()] || null;
}

/**
 * Extracts file extension from URL path
 */
function getExtensionFromUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
    if (match) {
      const ext = match[1].toLowerCase();
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        return ext === "jpeg" ? "jpg" : ext;
      }
    }
  } catch {
    // Invalid URL, return null
  }
  return null;
}

/**
 * Detects image type from magic bytes (file signature)
 */
function detectImageTypeFromBytes(data: ArrayBuffer): string | null {
  const bytes = new Uint8Array(data);
  
  for (const sig of IMAGE_SIGNATURES) {
    let matches = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (bytes[i] !== sig.bytes[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      // For WebP, also check for WEBP marker at offset 8
      if (sig.extension === "webp") {
        const webpMarker = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
        let isWebp = true;
        for (let i = 0; i < webpMarker.length; i++) {
          if (bytes[8 + i] !== webpMarker[i]) {
            isWebp = false;
            break;
          }
        }
        if (!isWebp) continue;
      }
      return sig.extension;
    }
  }
  return null;
}

/**
 * Validates if the content-type is an allowed image format
 */
function isValidImageContentType(contentType: string): boolean {
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();
  return ALLOWED_CONTENT_TYPES.includes(normalizedType);
}

/**
 * Downloads an image from a URL and saves it to the temp directory
 * @param url - The URL of the image to download
 * @returns Promise with success status, file path, or error message
 */
export async function downloadImage(url: string): Promise<DownloadResult> {
  try {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { success: false, error: "Invalid URL provided" };
    }

    // Ensure temp directory exists
    await ensureTempDir();

    // Log the URL being fetched (mask bot token for security, but show structure)
    const maskedUrl = url.replace(/(bot\d+:)[^/]+/i, '$1[TOKEN_MASKED]');
    console.log(`[ImageHandler] Downloading image from: ${maskedUrl}`);
    console.log(`[ImageHandler] URL length: ${url.length}, starts with: ${url.substring(0, 30)}...`);

    // Fetch the image using Bun's native fetch API
    const response = await fetch(url);

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to download image: HTTP ${response.status} ${response.statusText}`,
      };
    }

    // Get the image data as ArrayBuffer first (we need it for magic byte detection)
    const imageData = await response.arrayBuffer();

    // Validate content-type
    const contentType = response.headers.get("content-type");
    if (!contentType || !isValidImageContentType(contentType)) {
      return {
        success: false,
        error: `Invalid content type: ${contentType || "unknown"}. Expected one of: ${ALLOWED_CONTENT_TYPES.join(", ")}`,
      };
    }

    // Determine file extension using multiple strategies:
    // 1. Try content-type first (most reliable for proper servers)
    // 2. Fall back to URL extension (for Telegram-style URLs)
    // 3. Fall back to magic bytes detection (most reliable for actual content)
    let extension = getExtensionFromContentType(contentType);
    
    if (!extension) {
      // Content-type didn't give us an extension, try URL
      extension = getExtensionFromUrl(url);
    }
    
    if (!extension) {
      // Still no extension, detect from magic bytes
      extension = detectImageTypeFromBytes(imageData);
    }
    
    if (!extension) {
      return {
        success: false,
        error: `Could not determine image type. Content-Type: ${contentType}, URL: ${url}`,
      };
    }

    // Generate unique filename
    const filename = generateUniqueFilename(extension);
    const filePath = join(TEMP_DIR, filename);

    // Write to file
    await Bun.write(filePath, imageData);

    return { success: true, filePath };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { success: false, error: `Failed to download image: ${errorMessage}` };
  }
}

/**
 * Deletes a temporary image file
 * @param filePath - The path to the file to delete
 */
export async function cleanupImage(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    // Silently handle errors - file might not exist or already be deleted
    // This is intentional as per requirements to handle errors gracefully
    const errCode = (error as NodeJS.ErrnoException).code;
    if (errCode !== "ENOENT") {
      // Log unexpected errors but don't throw
      console.warn(`Warning: Could not delete temp file ${filePath}:`, error);
    }
  }
}

/**
 * Cleans up old temporary images based on age
 * @param maxAgeMinutes - Maximum age in minutes (default: 30)
 * @returns Number of files deleted
 */
export async function cleanupOldImages(maxAgeMinutes: number = 30): Promise<number> {
  let deletedCount = 0;

  try {
    // Ensure temp directory exists before trying to read it
    await ensureTempDir();

    const files = await readdir(TEMP_DIR);
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    for (const file of files) {
      const filePath = join(TEMP_DIR, file);

      try {
        const fileStat = await stat(filePath);

        // Check if file is older than maxAge
        const fileAge = now - fileStat.mtimeMs;
        if (fileAge > maxAgeMs) {
          await unlink(filePath);
          deletedCount++;
        }
      } catch (error) {
        // Skip files that can't be accessed or have already been deleted
        continue;
      }
    }
  } catch (error) {
    // If we can't read the directory, log warning but don't throw
    console.warn("Warning: Could not clean up old images:", error);
  }

  return deletedCount;
}

// Export constants for external use if needed
export { TEMP_DIR, ALLOWED_EXTENSIONS, ALLOWED_CONTENT_TYPES };
