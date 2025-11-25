import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

// connect to supabase storage
const storageClient = createClient(supabaseUrl, supabaseKey);

/**
 * Upload a file to Supabase Storage from the backend
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @param fileBuffer - The file buffer to upload
 * @param contentType - The MIME type of the file
 */
export async function uploadFileFromBuffer(
  bucket: string,
  path: string,
  fileBuffer: Buffer,
  contentType: string
) {
  const { data, error } = await storageClient.storage
    .from(bucket)
    .upload(path, fileBuffer, {
      contentType,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return data;
}

/**
 * Get a public URL for a file
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 */
export function getPublicUrl(bucket: string, path: string) {
  const { data } = storageClient.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete a file from storage
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 */
export async function deleteFile(bucket: string, path: string) {
  const { error } = await storageClient.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

/**
 * Create a signed URL for temporary access to a private file
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @param expiresIn - Expiration time in seconds
 */
export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 3600
) {
  const { data, error } = await storageClient.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    throw new Error(`Signed URL creation failed: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * List files in a bucket
 * @param bucket - The storage bucket name
 * @param folder - Optional folder path
 */
export async function listFiles(bucket: string, folder: string = '') {
  const { data, error } = await storageClient.storage.from(bucket).list(folder, {
    limit: 100,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
  });

  if (error) {
    throw new Error(`List failed: ${error.message}`);
  }

  return data;
}
