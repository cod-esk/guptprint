export type PrintStatus = "QUEUED" | "PRINTED" | "PAID";

export interface PrintJob {
  id: string;
  shopId: string;
  /** Kept only in volatile server memory. Never returned to the owner dashboard. */
  fileName: string;
  fileSize: string;
  pages: number;
  copies: number;
  color: boolean;
  duplex: boolean;
  amount: number;
  status: PrintStatus;
  createdAt: number;
  printedAt?: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __GUPTPRINT_JOBS__: PrintJob[] | undefined;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export function jobsStore(): PrintJob[] {
  if (!global.__GUPTPRINT_JOBS__) global.__GUPTPRINT_JOBS__ = [];
  return global.__GUPTPRINT_JOBS__;
}

/**
 * There are no uploaded file bytes in this MVP. This removes expired job metadata
 * from volatile memory. A future storage adapter must delete its object at the
 * same expiry boundary.
 */
export function purgeExpiredJobs() {
  const cutoff = Date.now() - FIFTEEN_MINUTES;
  global.__GUPTPRINT_JOBS__ = jobsStore().filter((job) => job.createdAt > cutoff);
  return global.__GUPTPRINT_JOBS__;
}

/** Never leak a filename or file size to the shop-facing response. */
export function ownerSafeJob(job: PrintJob) {
  const { fileName: _fileName, fileSize: _fileSize, ...safeJob } = job;
  return safeJob;
}
