import * as Scanner from '../../modules/scanner';
import { copy } from '../copy';
import type { AccountId } from '../account/id';
import type { ScannedPage } from './batch';
import { addImportedFiles, batchFolderUri, loadBatch, pagesFromScan } from './store';

export type ScanOutcome = { kind: 'scanned'; pages: ScannedPage[] } | { kind: 'closed' } | { kind: 'problem'; message: string };

export async function scanPages(pageLimit = 0): Promise<ScanOutcome> {
  try {
    const images = await Scanner.scan({ directory: batchFolderUri(), pageLimit, galleryImport: true });
    return images.length === 0 ? { kind: 'closed' } : { kind: 'scanned', pages: pagesFromScan(images) };
  } catch (error) {
    if (error instanceof Scanner.ScanError && (error.kind === 'cancelled' || error.kind === 'busy')) {
      return { kind: 'closed' };
    }
    if (error instanceof Scanner.ScanError && error.kind === 'unavailable') {
      return { kind: 'problem', message: copy.scan.unavailable };
    }
    return { kind: 'problem', message: copy.scan.scanFailed };
  }
}

function importProblem(result: Scanner.ImportResult, added: number): string | null {
  if (added === 0 && result.skipped > 0) {
    return copy.scan.nothingImported;
  }
  return result.skipped > 0 ? copy.scan.skipped(result.skipped) : null;
}

export async function pickFiles(accountId: AccountId): Promise<string | null> {
  try {
    const result = await Scanner.pickFiles(batchFolderUri());
    await loadBatch(accountId);
    return importProblem(result, addImportedFiles(accountId, result.files));
  } catch {
    return copy.scan.pickFailed;
  }
}

export async function takeSharedFiles(accountId: AccountId): Promise<{ added: number; problem: string | null }> {
  try {
    const result = await Scanner.takeSharedFiles(batchFolderUri());
    await loadBatch(accountId);
    const added = addImportedFiles(accountId, result.files);
    return { added, problem: importProblem(result, added) };
  } catch {
    return { added: 0, problem: copy.scan.pickFailed };
  }
}
