import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { type Draft, readValue, writeDraft } from '../src/documents/customFields';
import { customFieldChanges, customFieldEdits } from '../src/documents/edit';
import type { CustomField, CustomFieldValue, DocumentId, IsoDate } from '../src/paperless/schemas';
import { client, eventually, serverUrl, token, uniqueName } from './helpers';
import { syntheticPdf } from './synthetic-pdf';

const headers = { Authorization: `Token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json; version=10' };

async function createField(dataType: string, extraData: Record<string, unknown> = {}): Promise<CustomField> {
  const response = await fetch(`${serverUrl}/api/custom_fields/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: uniqueName(`field-${dataType}`), data_type: dataType, extra_data: extraData }),
  });
  if (!response.ok) {
    throw new Error(`Could not create a ${dataType} field: ${response.status} ${await response.text()}`);
  }
  const { id } = (await response.json()) as { id: number };
  const fields = await client.listCustomFields();
  const field = fields.ok ? fields.value.find((item) => item.id === id) : undefined;
  if (field === undefined) {
    throw new Error('The new field is not in the list');
  }
  return field;
}

async function upload(title: string, customFields: CustomFieldValue[]): Promise<DocumentId> {
  const filename = `${uniqueName('fields')}.pdf`;
  const posted = await client.postDocument(
    { title, created: null, correspondentId: null, documentTypeId: null, storagePathId: null, tagIds: [], archiveSerialNumber: null, customFields },
    syntheticPdf(title),
    filename,
  );
  if (!posted.ok) {
    throw new Error(`upload failed: ${JSON.stringify(posted.error)}`);
  }
  return eventually(async () => {
    const found = await client.findDocumentByOriginalFilename(filename);
    return found.ok ? found.value : null;
  });
}

async function storedValues(document: DocumentId): Promise<CustomFieldValue[]> {
  const result = await client.getDocument(document);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }
  return result.value.customFields;
}

const dataTypes = ['string', 'url', 'date', 'boolean', 'integer', 'float', 'monetary', 'documentlink', 'select', 'longtext'] as const;
type DataType = (typeof dataTypes)[number];

const fields = {} as Record<DataType, CustomField>;
let linked: DocumentId;
let document: DocumentId;

function uploadValues(): CustomFieldValue[] {
  return [
    { fieldId: fields.string.id, value: 'Hydro account 4471' },
    { fieldId: fields.url.id, value: 'https://example.com/bills/4471' },
    { fieldId: fields.date.id, value: '2026-10-19' },
    { fieldId: fields.boolean.id, value: true },
    { fieldId: fields.integer.id, value: -42 },
    { fieldId: fields.float.id, value: 3.25 },
    { fieldId: fields.monetary.id, value: 'EUR12.50' },
    { fieldId: fields.documentlink.id, value: [linked] },
    { fieldId: fields.select.id, value: fields.select.selectOptions[1].id },
    { fieldId: fields.longtext.id, value: 'First line\nSecond line' },
  ];
}

beforeAll(async () => {
  for (const dataType of dataTypes) {
    const extra =
      dataType === 'select'
        ? { select_options: [{ label: 'Chequing' }, { label: 'Savings' }] }
        : dataType === 'monetary'
          ? { default_currency: 'CAD' }
          : {};
    fields[dataType] = await createField(dataType, extra);
  }
  linked = await upload(uniqueName('linked'), []);
  document = await upload(uniqueName('every field'), uploadValues());
});

afterAll(async () => {
  await client.deleteDocument(document);
  await client.deleteDocument(linked);
  for (const field of Object.values(fields)) {
    await fetch(`${serverUrl}/api/custom_fields/${field.id}/`, { method: 'DELETE', headers });
  }
});

describe('custom fields', () => {
  test('an upload sets a value of every type on the new document', async () => {
    const stored = await storedValues(document);
    expect(stored).toEqual(expect.arrayContaining(uploadValues()));
    expect(stored).toHaveLength(dataTypes.length);
  });

  const changes: [DataType, () => Draft][] = [
    ['string', () => ({ type: 'text', text: 'Hydro account 9001', input: 'line' })],
    ['url', () => ({ type: 'text', text: 'https://example.org/statement', input: 'url' })],
    ['date', () => ({ type: 'date', date: '2026-02-28' as IsoDate })],
    ['boolean', () => ({ type: 'toggle', on: false })],
    ['integer', () => ({ type: 'text', text: '2147483647', input: 'number' })],
    ['float', () => ({ type: 'text', text: '-0.5', input: 'number' })],
    ['monetary', () => ({ type: 'money', currency: 'cad', amount: '83.6' })],
    ['documentlink', () => ({ type: 'documents', ids: [] })],
    ['select', () => ({ type: 'choice', optionId: fields.select.selectOptions[0].id })],
    ['longtext', () => ({ type: 'text', text: 'One\nTwo\nThree', input: 'lines' })],
  ];

  test.each(changes)('an edit of a %s field round-trips through the server and leaves the others', async (dataType, makeDraft) => {
    const field = fields[dataType];
    const before = await storedValues(document);
    const definitions = Object.values(fields);
    const draft = makeDraft();
    const edits = customFieldEdits(before, definitions).map((edit) => (edit.fieldId === field.id ? { ...edit, draft } : edit));
    const outcome = customFieldChanges(before, edits, definitions);
    expect(outcome.changed).toEqual(new Set([field.id]));
    if (outcome.values === null) {
      throw new Error(`nothing to send: ${JSON.stringify([...outcome.problems])}`);
    }

    const saved = await client.updateDocument(document, { customFields: outcome.values });
    expect(saved.ok).toBe(true);
    const after = await storedValues(document);

    const written = writeDraft(field, draft);
    const value = after.find((entry) => entry.fieldId === field.id)?.value;
    expect(written.ok && written.value).toEqual(value);
    expect(readValue(field, value ?? null)).toEqual(readValue(field, written.ok ? written.value : null));
    const others = (entries: CustomFieldValue[]) => entries.filter((entry) => entry.fieldId !== field.id);
    expect(others(after)).toEqual(expect.arrayContaining(others(before)));
    expect(others(after)).toHaveLength(others(before).length);
  });

  test('removing a field takes it off the document', async () => {
    const before = await storedValues(document);
    const definitions = Object.values(fields);
    const edits = customFieldEdits(before, definitions).filter((edit) => edit.fieldId !== fields.longtext.id);
    const outcome = customFieldChanges(before, edits, definitions);
    await client.updateDocument(document, { customFields: outcome.values ?? [] });
    const after = await storedValues(document);
    expect(after.map((entry) => entry.fieldId).sort()).toEqual(edits.map((edit) => edit.fieldId).sort());
  });
});
