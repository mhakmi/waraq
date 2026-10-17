import type { Batch } from '../scan/batch';

export async function enqueueBatch(_batch: Batch): Promise<void> {
  throw new Error('The upload queue comes with part B of Phase 2. This stub is replaced when it merges.');
}
