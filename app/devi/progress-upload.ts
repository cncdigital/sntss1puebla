export const PROGRESS_UPLOAD_CHUNK_BYTES = 768 * 1024;

export function progressUploadPartCount(fileSize: number) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return 0;
  return Math.ceil(fileSize / PROGRESS_UPLOAD_CHUNK_BYTES);
}

export function progressUploadPartSize(fileSize: number, partIndex: number) {
  const partCount = progressUploadPartCount(fileSize);
  if (
    !Number.isSafeInteger(partIndex) ||
    partIndex < 0 ||
    partIndex >= partCount
  )
    return 0;
  return Math.min(
    PROGRESS_UPLOAD_CHUNK_BYTES,
    fileSize - partIndex * PROGRESS_UPLOAD_CHUNK_BYTES,
  );
}
