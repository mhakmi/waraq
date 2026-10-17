import { type EventSubscription, NativeModule, requireNativeModule } from 'expo';

export type Rotation = 0 | 90 | 180 | 270;

export type ScanMode = 'full' | 'base' | 'filter';

export type ScanOptions = {
  directory: string;
  pageLimit?: number;
  galleryImport?: boolean;
  mode?: ScanMode;
};

export type ScannedImage = { uri: string; width: number; height: number };

export type ImportedFile =
  | { kind: 'image'; uri: string; name: string; width: number; height: number }
  | { kind: 'pdf'; uri: string; name: string; pageCount: number; thumbnailUri: string };

export type ImportResult = { files: ImportedFile[]; skipped: number };

export type PdfPage = { uri: string; rotation: Rotation };

export type PdfSummary = { pageCount: number; bytes: number };

export type ScanErrorKind = 'cancelled' | 'unavailable' | 'busy' | 'unknown';

export type PdfErrorKind = 'page_missing' | 'out_of_space' | 'decode_failed' | 'unknown';

export class ScanError extends Error {
  constructor(
    readonly kind: ScanErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

export class PdfError extends Error {
  constructor(
    readonly kind: PdfErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'PdfError';
  }
}

type ScannerEvents = {
  onShare: () => void;
  onPrepareProgress: (event: { fraction: number }) => void;
};

declare class ScannerNativeModule extends NativeModule<ScannerEvents> {
  isAvailable(): Promise<boolean>;
  prepare(): Promise<void>;
  scan(options: Required<ScanOptions>): Promise<ScannedImage[]>;
  writePdf(pages: PdfPage[], outputUri: string): Promise<PdfSummary>;
  pickFiles(directory: string): Promise<ImportResult>;
  takeSharedFiles(directory: string): Promise<ImportResult>;
}

const native = requireNativeModule<ScannerNativeModule>('Scanner');

const scanErrorKinds: Record<string, ScanErrorKind> = {
  ERR_SCAN_CANCELLED: 'cancelled',
  ERR_SCANNER_UNAVAILABLE: 'unavailable',
  ERR_SCANNER_BUSY: 'busy',
};

const pdfErrorKinds: Record<string, PdfErrorKind> = {
  ERR_PAGE_MISSING: 'page_missing',
  ERR_OUT_OF_SPACE: 'out_of_space',
  ERR_DECODE_FAILED: 'decode_failed',
};

function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return '';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toScanError(error: unknown): ScanError {
  return new ScanError(scanErrorKinds[codeOf(error)] ?? 'unknown', messageOf(error));
}

function toPdfError(error: unknown): PdfError {
  return new PdfError(pdfErrorKinds[codeOf(error)] ?? 'unknown', messageOf(error));
}

export function isAvailable(): Promise<boolean> {
  return native.isAvailable();
}

export async function prepare(onProgress?: (fraction: number) => void): Promise<void> {
  const subscription = onProgress === undefined ? null : native.addListener('onPrepareProgress', (event) => onProgress(event.fraction));
  try {
    await native.prepare();
  } catch (error) {
    throw toScanError(error);
  } finally {
    subscription?.remove();
  }
}

export async function scan(options: ScanOptions): Promise<ScannedImage[]> {
  try {
    return await native.scan({ pageLimit: 0, galleryImport: false, mode: 'full', ...options });
  } catch (error) {
    throw toScanError(error);
  }
}

export async function writePdf(pages: PdfPage[], outputUri: string): Promise<PdfSummary> {
  try {
    return await native.writePdf(pages, outputUri);
  } catch (error) {
    throw toPdfError(error);
  }
}

export async function pickFiles(directory: string): Promise<ImportResult> {
  try {
    return await native.pickFiles(directory);
  } catch (error) {
    throw toScanError(error);
  }
}

export function takeSharedFiles(directory: string): Promise<ImportResult> {
  return native.takeSharedFiles(directory);
}

export function addShareListener(listener: () => void): EventSubscription {
  return native.addListener('onShare', listener);
}
