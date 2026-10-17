import { z } from 'zod';

export const DocumentId = z.number().int().positive().brand<'DocumentId'>();
export type DocumentId = z.infer<typeof DocumentId>;

export const TaskId = z.string().min(1).brand<'TaskId'>();
export type TaskId = z.infer<typeof TaskId>;

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .brand<'IsoDate'>();
export type IsoDate = z.infer<typeof IsoDate>;

export function pageOf<Item extends z.ZodType>(item: Item) {
  return z
    .object({
      count: z.number().int(),
      next: z.string().nullable(),
      results: z.array(item),
    })
    .transform((page) => ({
      count: page.count,
      items: page.results,
      hasNextPage: page.next !== null,
    }));
}

export const TokenResponse = z.object({ token: z.string().min(1) }).transform((body) => body.token);

export const TokenErrorBody = z.object({ non_field_errors: z.array(z.string()) });

export const UiSettings = z.object({
  user: z.object({ id: z.number().int(), username: z.string() }),
  permissions: z.array(z.string()),
});

const SearchHit = z.object({
  score: z.number(),
  highlights: z.string().nullable(),
  rank: z.number().int(),
});

export const CustomFieldValue = z.object({
  fieldId: z.number().int(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.number().int()), z.null()]),
});
export type CustomFieldValue = z.infer<typeof CustomFieldValue>;

const WireCustomFieldValue = z
  .object({ field: z.number().int(), value: CustomFieldValue.shape.value })
  .transform((entry) => ({ fieldId: entry.field, value: entry.value }));

const documentSummaryShape = {
  id: DocumentId,
  title: z.string(),
  created: IsoDate,
  added: z.string(),
  correspondent: z.number().int().nullable(),
  document_type: z.number().int().nullable(),
  storage_path: z.number().int().nullable(),
  tags: z.array(z.number().int()),
  archive_serial_number: z.number().int().nullable(),
  page_count: z.number().int().nullable(),
  original_file_name: z.string().nullable(),
  content: z.string(),
};

export const documentSummaryFields = Object.keys(documentSummaryShape);

function summaryFromWire(document: z.infer<z.ZodObject<typeof documentSummaryShape>>) {
  return {
    id: document.id,
    title: document.title,
    created: document.created,
    added: document.added,
    correspondentId: document.correspondent,
    documentTypeId: document.document_type,
    storagePathId: document.storage_path,
    tagIds: document.tags,
    archiveSerialNumber: document.archive_serial_number,
    pageCount: document.page_count,
    originalFileName: document.original_file_name,
    content: document.content,
  };
}

export const DocumentSummary = z
  .object({ ...documentSummaryShape, __search_hit__: SearchHit.optional() })
  .transform((document) => ({
    ...summaryFromWire(document),
    searchHit: document.__search_hit__ ?? null,
  }));
export type DocumentSummary = z.infer<typeof DocumentSummary>;

export const DocumentDetail = z
  .object({
    ...documentSummaryShape,
    modified: z.string(),
    mime_type: z.string(),
    owner: z.number().int().nullable(),
    user_can_change: z.boolean(),
    custom_fields: z.array(WireCustomFieldValue),
  })
  .transform((document) => ({
    ...summaryFromWire(document),
    modified: document.modified,
    mimeType: document.mime_type,
    ownerId: document.owner,
    userCanChange: document.user_can_change,
    customFields: document.custom_fields,
  }));
export type DocumentDetail = z.infer<typeof DocumentDetail>;

export const DocumentIdOnly = z.object({ id: DocumentId }).transform((document) => document.id);

export const Note = z
  .object({
    id: z.number().int(),
    note: z.string(),
    created: z.string(),
    user: z.object({ id: z.number().int(), username: z.string() }),
  })
  .transform((note) => ({
    id: note.id,
    text: note.note,
    created: note.created,
    user: note.user,
  }));
export type Note = z.infer<typeof Note>;

export const NotesResponse = z.union([
  z.array(Note),
  z.object({ error: z.string() }),
]);

export const Tag = z
  .object({
    id: z.number().int(),
    name: z.string(),
    color: z.string(),
    text_color: z.string(),
    is_inbox_tag: z.boolean(),
    parent: z.number().int().nullable(),
    document_count: z.number().int(),
  })
  .transform((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    textColor: tag.text_color,
    isInboxTag: tag.is_inbox_tag,
    parentId: tag.parent,
    documentCount: tag.document_count,
  }));
export type Tag = z.infer<typeof Tag>;

export const Correspondent = z
  .object({
    id: z.number().int(),
    name: z.string(),
    document_count: z.number().int(),
    last_correspondence: z.string().nullable(),
  })
  .transform((correspondent) => ({
    id: correspondent.id,
    name: correspondent.name,
    documentCount: correspondent.document_count,
    lastCorrespondence: correspondent.last_correspondence,
  }));
export type Correspondent = z.infer<typeof Correspondent>;

export const DocumentType = z
  .object({ id: z.number().int(), name: z.string(), document_count: z.number().int() })
  .transform((documentType) => ({
    id: documentType.id,
    name: documentType.name,
    documentCount: documentType.document_count,
  }));
export type DocumentType = z.infer<typeof DocumentType>;

export const StoragePath = z
  .object({ id: z.number().int(), name: z.string(), path: z.string(), document_count: z.number().int() })
  .transform((storagePath) => ({
    id: storagePath.id,
    name: storagePath.name,
    path: storagePath.path,
    documentCount: storagePath.document_count,
  }));
export type StoragePath = z.infer<typeof StoragePath>;

const customFieldDataTypes = [
  'string',
  'url',
  'date',
  'boolean',
  'integer',
  'float',
  'monetary',
  'documentlink',
  'select',
  'longtext',
] as const;

export const CustomField = z
  .object({
    id: z.number().int(),
    name: z.string(),
    data_type: z.union([
      z.enum(customFieldDataTypes),
      z.string().transform(() => 'unsupported' as const),
    ]),
    extra_data: z
      .object({
        select_options: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
        default_currency: z.string().nullable().optional(),
      })
      .nullable(),
    document_count: z.number().int(),
  })
  .transform((field) => ({
    id: field.id,
    name: field.name,
    dataType: field.data_type,
    selectOptions: field.extra_data?.select_options ?? [],
    defaultCurrency: field.extra_data?.default_currency ?? null,
    documentCount: field.document_count,
  }));
export type CustomField = z.infer<typeof CustomField>;

export const SavedView = z
  .object({
    id: z.number().int(),
    name: z.string(),
    sort_field: z.string().nullable(),
    sort_reverse: z.boolean(),
    filter_rules: z.array(z.object({ rule_type: z.number().int(), value: z.string().nullable() })),
    page_size: z.number().int().nullable(),
  })
  .transform((view) => ({
    id: view.id,
    name: view.name,
    sortField: view.sort_field,
    sortReverse: view.sort_reverse,
    filterRules: view.filter_rules.map((rule) => ({ ruleType: rule.rule_type, value: rule.value })),
    pageSize: view.page_size,
  }));
export type SavedView = z.infer<typeof SavedView>;
