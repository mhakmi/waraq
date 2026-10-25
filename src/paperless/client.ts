import { z } from 'zod';

import { describeError, errorForStatus, failure, type PaperlessError, type Result, success } from './errors';
import {
  ChangedDocument,
  Correspondent,
  CustomField,
  type CustomFieldDataType,
  type CustomFieldValue,
  DocumentDetail,
  DocumentId,
  DocumentIdAndChange,
  DocumentIdOnly,
  DocumentPermissions,
  DocumentSummary,
  documentSummaryFields,
  DocumentType,
  Group,
  type IsoDate,
  NotesResponse,
  pageOf,
  SavedView,
  StoragePath,
  Tag,
  TaskId,
  TokenErrorBody,
  TokenResponse,
  UiSettings,
  User,
} from './schemas';
import { LenientTask, Task, taskStatus, type TaskStatus } from './tasks';
import type { ServerUrl } from './url';

export const apiVersion = 10;

const requestTimeoutMs = 30_000;
const uploadTimeoutMs = 10 * 60_000;
const listPageSize = 1000;

export type Auth = { kind: 'token'; token: string };

export type FileAppender<File> = (form: FormData, field: string, file: File, filename: string) => void;

export type HttpResponse = {
  status: number;
  url: string;
  redirected: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | FormData; signal: AbortSignal },
) => Promise<HttpResponse>;

export type ClientOptions<File> = {
  baseUrl: ServerUrl;
  auth: Auth;
  extraHeaders?: Record<string, string>;
  fetch: Fetch;
  appendFile: FileAppender<File>;
};

export type UploadFields = {
  title: string;
  created: IsoDate | null;
  correspondentId: number | null;
  documentTypeId: number | null;
  storagePathId: number | null;
  tagIds: number[];
  archiveSerialNumber: number | null;
  customFields: CustomFieldValue[];
};

export type DocumentOrderField =
  | 'created'
  | 'added'
  | 'modified'
  | 'title'
  | 'archive_serial_number'
  | 'correspondent__name'
  | 'document_type__name'
  | 'page_count';

export type DocumentQuery = {
  ids?: number[];
  query?: string;
  tagIdsAll?: number[];
  tagIdsAny?: number[];
  correspondentId?: number;
  documentTypeId?: number;
  storagePathId?: number;
  createdFrom?: IsoDate;
  createdTo?: IsoDate;
  orderBy?: { field: DocumentOrderField; descending: boolean };
  page?: number;
  pageSize?: number;
  savedViewDefaults?: Record<string, string>;
};

export type DocumentChanges = {
  title?: string;
  created?: IsoDate;
  correspondentId?: number | null;
  documentTypeId?: number | null;
  storagePathId?: number | null;
  tagIds?: number[];
  archiveSerialNumber?: number | null;
  customFields?: CustomFieldValue[];
};

export type LabelKind = 'tags' | 'correspondents' | 'documentTypes' | 'storagePaths' | 'customFields';

const labelEndpoints = {
  tags: { path: 'tags/', item: Tag },
  correspondents: { path: 'correspondents/', item: Correspondent },
  documentTypes: { path: 'document_types/', item: DocumentType },
  storagePaths: { path: 'storage_paths/', item: StoragePath },
  customFields: { path: 'custom_fields/', item: CustomField },
};

export type LabelChanges = {
  name?: string;
  color?: string;
  isInboxTag?: boolean;
  path?: string;
  dataType?: CustomFieldDataType;
  selectOptions?: { id?: string; label: string }[];
};

function wireLabel(changes: LabelChanges): Record<string, unknown> {
  return {
    name: changes.name,
    color: changes.color,
    is_inbox_tag: changes.isInboxTag,
    path: changes.path,
    data_type: changes.dataType,
    extra_data: changes.selectOptions === undefined ? undefined : { select_options: changes.selectOptions },
  };
}

export type FileRequest = { url: string; headers: Record<string, string> };

export type DocumentFile = 'thumb' | 'preview' | 'download';

export type ServerInfo = {
  serverVersion: string;
  apiVersion: number;
  user: { id: number; username: string };
  permissions: string[];
};

export type ProbeError =
  | PaperlessError
  | { kind: 'unsupported_version'; serverVersion: string | null; apiVersion: number | null };

export type TokenError =
  | PaperlessError
  | { kind: 'bad_credentials' }
  | { kind: 'mfa_required' }
  | { kind: 'mfa_invalid' };

type QueryValue = string | number | boolean | undefined;

type Connection = {
  baseUrl: ServerUrl;
  fetch: Fetch;
  headers: Record<string, string>;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: string | FormData;
  timeoutMs?: number;
};

function urlFor(baseUrl: ServerUrl, path: string, query: Record<string, QueryValue> = {}): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  const search = pairs.length > 0 ? `?${pairs.join('&')}` : '';
  return `${baseUrl}/api/${path}${search}`;
}

async function send(
  connection: Connection,
  path: string,
  options: RequestOptions = {},
): Promise<Result<{ headers: HttpResponse['headers']; body: unknown }>> {
  const headers: Record<string, string> = {
    Accept: `application/json; version=${apiVersion}`,
    ...connection.headers,
  };
  if (typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? requestTimeoutMs);

  let status: number;
  let responseHeaders: HttpResponse['headers'];
  let text: string;
  try {
    const response = await connection.fetch(urlFor(connection.baseUrl, path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
    });
    status = response.status;
    responseHeaders = response.headers;
    text = await response.text();
  } catch (error) {
    if (timedOut) {
      return failure({ kind: 'timeout' });
    }
    return failure({ kind: 'network', message: describeError(error) });
  } finally {
    clearTimeout(timer);
  }

  if (status < 200 || status >= 300) {
    return failure(errorForStatus(status, text));
  }
  if (text === '') {
    return success({ headers: responseHeaders, body: null });
  }
  try {
    return success({ headers: responseHeaders, body: JSON.parse(text) });
  } catch {
    return failure({ kind: 'invalid_response', message: `Expected JSON, got: ${text.slice(0, 200)}` });
  }
}

function parseBody<Schema extends z.ZodType>(schema: Schema, body: unknown): Result<z.output<Schema>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return failure({ kind: 'invalid_response', message: z.prettifyError(parsed.error) });
  }
  return success(parsed.data);
}

async function requestJson<Schema extends z.ZodType>(
  connection: Connection,
  path: string,
  schema: Schema,
  options: RequestOptions = {},
): Promise<Result<z.output<Schema>>> {
  const response = await send(connection, path, options);
  if (!response.ok) {
    return response;
  }
  return parseBody(schema, response.value.body);
}

async function listAll<Item extends z.ZodType>(
  connection: Connection,
  path: string,
  item: Item,
  query: Record<string, QueryValue> = {},
): Promise<Result<z.output<Item>[]>> {
  const items: z.output<Item>[] = [];
  for (let page = 1; ; page += 1) {
    const result = await requestJson(connection, path, pageOf(item), {
      query: { ...query, page, page_size: listPageSize },
    });
    if (!result.ok) {
      return result;
    }
    items.push(...result.value.items);
    if (!result.value.hasNextPage) {
      return success(items);
    }
  }
}

function idList(ids: number[] | undefined): string | undefined {
  return ids === undefined || ids.length === 0 ? undefined : ids.join(',');
}

export function documentQueryParameters(query: DocumentQuery): Record<string, QueryValue> {
  const ordering = query.orderBy
    ? `${query.orderBy.descending ? '-' : ''}${query.orderBy.field}`
    : undefined;
  const own: Record<string, QueryValue> = {
    id__in: idList(query.ids),
    query: query.query,
    tags__id__all: idList(query.tagIdsAll),
    tags__id__in: idList(query.tagIdsAny),
    correspondent__id: query.correspondentId,
    document_type__id: query.documentTypeId,
    storage_path__id: query.storagePathId,
    created__date__gte: query.createdFrom,
    created__date__lte: query.createdTo,
    ordering,
    page: query.page,
    page_size: query.pageSize,
    fields: documentSummaryFields.join(','),
    truncate_content: true,
  };
  const parameters: Record<string, QueryValue> = { ...query.savedViewDefaults };
  for (const [key, value] of Object.entries(own)) {
    if (value !== undefined) {
      parameters[key] = value;
    }
  }
  return parameters;
}

function wireChanges(changes: DocumentChanges): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    title: changes.title,
    created: changes.created,
    correspondent: changes.correspondentId,
    document_type: changes.documentTypeId,
    storage_path: changes.storagePathId,
    tags: changes.tagIds,
    archive_serial_number: changes.archiveSerialNumber,
    custom_fields: changes.customFields?.map((entry) => ({ field: entry.fieldId, value: entry.value })),
  };
  for (const key of Object.keys(wire)) {
    if (wire[key] === undefined) {
      delete wire[key];
    }
  }
  return wire;
}

function formFromFields(fields: UploadFields): FormData {
  const form = new FormData();
  form.append('title', fields.title);
  if (fields.created !== null) {
    form.append('created', fields.created);
  }
  if (fields.correspondentId !== null) {
    form.append('correspondent', String(fields.correspondentId));
  }
  if (fields.documentTypeId !== null) {
    form.append('document_type', String(fields.documentTypeId));
  }
  if (fields.storagePathId !== null) {
    form.append('storage_path', String(fields.storagePathId));
  }
  for (const tagId of fields.tagIds) {
    form.append('tags', String(tagId));
  }
  if (fields.archiveSerialNumber !== null) {
    form.append('archive_serial_number', String(fields.archiveSerialNumber));
  }
  if (fields.customFields.length > 0) {
    const values: Record<string, CustomFieldValue['value']> = {};
    for (const field of fields.customFields) {
      values[String(field.fieldId)] = field.value;
    }
    form.append('custom_fields', JSON.stringify(values));
  }
  return form;
}

function notesResult(result: Result<z.output<typeof NotesResponse>>) {
  if (!result.ok) {
    return result;
  }
  if ('error' in result.value) {
    return failure<PaperlessError>({ kind: 'rejected', status: 200, body: result.value.error });
  }
  return success(result.value);
}

function authHeaders(auth: Auth): Record<string, string> {
  return { Authorization: `Token ${auth.token}` };
}

function tokenErrorFromBody(body: string): TokenError | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const result = TokenErrorBody.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  const messages = result.data.non_field_errors;
  if (messages.includes('MFA code is required')) {
    return { kind: 'mfa_required' };
  }
  if (messages.includes('Invalid MFA code')) {
    return { kind: 'mfa_invalid' };
  }
  return { kind: 'bad_credentials' };
}

export async function obtainToken(
  server: { baseUrl: ServerUrl; fetch: Fetch; extraHeaders?: Record<string, string> },
  credentials: { username: string; password: string; code?: string },
): Promise<Result<string, TokenError>> {
  const connection = { baseUrl: server.baseUrl, fetch: server.fetch, headers: { ...server.extraHeaders } };
  const result = await requestJson(connection, 'token/', TokenResponse, {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  if (!result.ok && result.error.kind === 'rejected' && result.error.status === 400) {
    return failure(tokenErrorFromBody(result.error.body) ?? result.error);
  }
  return result;
}

// Send uploads and downloads through this fetch too. expo-file-system has its own HTTP client, which skips the account's headers.
export function createPaperlessClient<File>(options: ClientOptions<File>) {
  const connection: Connection = {
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    headers: { ...options.extraHeaders, ...authHeaders(options.auth) },
  };

  return {
    async probeServer(): Promise<Result<ServerInfo, ProbeError>> {
      const response = await send(connection, 'ui_settings/');
      if (!response.ok) {
        if (response.error.kind === 'rejected' && response.error.status === 406) {
          return failure({ kind: 'unsupported_version', serverVersion: null, apiVersion: null });
        }
        return response;
      }
      const serverVersion = response.value.headers.get('x-version');
      const apiVersionHeader = response.value.headers.get('x-api-version');
      const serverApiVersion = apiVersionHeader === null ? null : Number.parseInt(apiVersionHeader, 10);
      const tooOld = serverApiVersion === null || Number.isNaN(serverApiVersion) || serverApiVersion < apiVersion;
      if (serverVersion === null || tooOld) {
        return failure({ kind: 'unsupported_version', serverVersion, apiVersion: serverApiVersion });
      }
      const settings = parseBody(UiSettings, response.value.body);
      if (!settings.ok) {
        return settings;
      }
      return success({
        serverVersion,
        apiVersion: serverApiVersion,
        user: settings.value.user,
        permissions: settings.value.permissions,
      });
    },

    listDocuments(query: DocumentQuery = {}) {
      return requestJson(connection, 'documents/', pageOf(DocumentSummary), {
        query: documentQueryParameters(query),
      });
    },

    // bulk_edit refuses the whole request when one document in it may not be changed, so those are left out.
    async listChangeableDocumentIds(query: DocumentQuery): Promise<Result<DocumentId[]>> {
      const listed = await listAll(connection, 'documents/', DocumentIdAndChange, {
        ...documentQueryParameters(query),
        fields: 'id,user_can_change',
      });
      return listed.ok ? success(listed.value.filter((document) => document.user_can_change).map((document) => document.id)) : listed;
    },

    changeTags(ids: DocumentId[], changes: { add: number[]; remove: number[] }) {
      return requestJson(connection, 'documents/bulk_edit/', z.object({ result: z.string() }), {
        method: 'POST',
        body: JSON.stringify({
          documents: ids,
          method: 'modify_tags',
          parameters: { add_tags: changes.add, remove_tags: changes.remove },
        }),
      });
    },

    getDocument(id: DocumentId) {
      return requestJson(connection, `documents/${id}/`, DocumentDetail);
    },

    updateDocument(id: DocumentId, changes: DocumentChanges) {
      return requestJson(connection, `documents/${id}/`, ChangedDocument, {
        method: 'PATCH',
        body: JSON.stringify(wireChanges(changes)),
      });
    },

    deleteDocument(id: DocumentId) {
      return requestJson(connection, `documents/${id}/`, z.null(), { method: 'DELETE' });
    },

    autocomplete(term: string, limit = 10) {
      return requestJson(connection, 'search/autocomplete/', z.array(z.string()), { query: { term, limit } });
    },

    documentFile(id: DocumentId, file: DocumentFile, fileOptions: { original?: boolean } = {}): FileRequest {
      const query = fileOptions.original ? { original: true } : {};
      return {
        url: urlFor(connection.baseUrl, `documents/${id}/${file}/`, query),
        headers: { ...connection.headers },
      };
    },

    async findDocumentByOriginalFilename(filename: string): Promise<Result<DocumentId | null>> {
      const result = await requestJson(connection, 'documents/', pageOf(DocumentIdOnly), {
        query: { original_filename__iexact: filename, fields: 'id' },
      });
      if (!result.ok) {
        return result;
      }
      return success(result.value.items[0] ?? null);
    },

    async listNotes(id: DocumentId) {
      return notesResult(await requestJson(connection, `documents/${id}/notes/`, NotesResponse));
    },

    async addNote(id: DocumentId, text: string) {
      const result = await requestJson(connection, `documents/${id}/notes/`, NotesResponse, {
        method: 'POST',
        body: JSON.stringify({ note: text }),
      });
      return notesResult(result);
    },

    async deleteNote(id: DocumentId, noteId: number) {
      const result = await requestJson(connection, `documents/${id}/notes/`, NotesResponse, {
        method: 'DELETE',
        query: { id: noteId },
      });
      return notesResult(result);
    },

    getDocumentPermissions(id: DocumentId) {
      return requestJson(connection, `documents/${id}/`, DocumentPermissions, {
        query: { full_perms: true, fields: 'owner,permissions' },
      });
    },

    listUsers: () => listAll(connection, 'users/', User),
    listGroups: () => listAll(connection, 'groups/', Group),

    listTags: () => listAll(connection, 'tags/', Tag),
    listCorrespondents: () => listAll(connection, 'correspondents/', Correspondent),
    listDocumentTypes: () => listAll(connection, 'document_types/', DocumentType),
    listStoragePaths: () => listAll(connection, 'storage_paths/', StoragePath),
    listCustomFields: () => listAll(connection, 'custom_fields/', CustomField),
    listSavedViews: () => listAll(connection, 'saved_views/', SavedView),

    createLabel(kind: LabelKind, changes: LabelChanges) {
      const { path, item } = labelEndpoints[kind];
      return requestJson(connection, path, item, { method: 'POST', body: JSON.stringify(wireLabel(changes)) });
    },

    updateLabel(kind: LabelKind, id: number, changes: LabelChanges) {
      const { path, item } = labelEndpoints[kind];
      return requestJson(connection, `${path}${id}/`, item, { method: 'PATCH', body: JSON.stringify(wireLabel(changes)) });
    },

    deleteLabel(kind: LabelKind, id: number) {
      return requestJson(connection, `${labelEndpoints[kind].path}${id}/`, z.null(), { method: 'DELETE' });
    },

    readUiSettings: () => requestJson(connection, 'ui_settings/', UiSettings),

    createSavedView: (name: string, view: Pick<SavedView, 'sortField' | 'sortReverse' | 'filterRules'>) =>
      requestJson(connection, 'saved_views/', SavedView, {
        method: 'POST',
        body: JSON.stringify({
          name,
          sort_field: view.sortField,
          sort_reverse: view.sortReverse,
          filter_rules: view.filterRules.map((rule) => ({ rule_type: rule.ruleType, value: rule.value })),
        }),
      }),

    postDocument(fields: UploadFields, file: File, filename: string): Promise<Result<TaskId>> {
      const form = formFromFields(fields);
      options.appendFile(form, 'document', file, filename);
      return requestJson(connection, 'documents/post_document/', TaskId, {
        method: 'POST',
        body: form,
        timeoutMs: uploadTimeoutMs,
      });
    },

    async getTask(taskId: TaskId): Promise<Result<TaskStatus>> {
      const result = await requestJson(connection, 'tasks/', pageOf(Task), { query: { task_id: taskId } });
      if (!result.ok) {
        return result;
      }
      return success(taskStatus(result.value.items[0]));
    },

    async findConsumeTaskByFilename(filename: string, createdAfter: Date): Promise<Result<TaskId | null>> {
      const result = await listAll(connection, 'tasks/', LenientTask, {
        task_type: 'consume_file',
        date_created_after: createdAfter.toISOString(),
        ordering: '-date_created',
      });
      if (!result.ok) {
        return result;
      }
      const newest = result.value.find((task) => task !== null && task.input_data.filename === filename);
      return success(newest?.task_id ?? null);
    },
  };
}

export type PaperlessClient<File> = ReturnType<typeof createPaperlessClient<File>>;
