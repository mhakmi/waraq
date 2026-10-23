import { describe, expect, test } from 'vitest';

import type { LabelKind } from '../src/paperless/client';
import { client, uniqueName } from './helpers';

async function listOf(kind: LabelKind) {
  const lists = {
    tags: client.listTags,
    correspondents: client.listCorrespondents,
    documentTypes: client.listDocumentTypes,
    storagePaths: client.listStoragePaths,
    customFields: client.listCustomFields,
  };
  const result = await lists[kind]();
  if (!result.ok) {
    throw new Error(`Could not list ${kind}: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe('labels of every kind', () => {
  test.each([
    ['tags', {}],
    ['correspondents', {}],
    ['documentTypes', {}],
    ['storagePaths', { path: '{{ created_year }}/{{ title }}' }],
    ['customFields', { dataType: 'string' as const }],
  ] as const)('%s can be made, renamed, and deleted', async (kind, extra) => {
    const name = uniqueName(`labels-${kind}`);
    const created = await client.createLabel(kind, { name, ...extra });
    if (!created.ok) {
      throw new Error(JSON.stringify(created.error));
    }
    expect(created.value.name).toBe(name);
    const listed = (await listOf(kind)).find((item) => item.id === created.value.id);
    expect(listed).toMatchObject({ name, documentCount: 0 });

    const renamed = await client.updateLabel(kind, created.value.id, { name: `${name} renamed` });
    expect(renamed.ok && renamed.value.name).toBe(`${name} renamed`);

    expect(await client.deleteLabel(kind, created.value.id)).toEqual({ ok: true, value: null });
    expect((await listOf(kind)).some((item) => item.id === created.value.id)).toBe(false);
  });

  test('a tag keeps its color and inbox flag', async () => {
    const created = await client.createLabel('tags', { name: uniqueName('labels-color'), color: '#e31a1c', isInboxTag: true });
    if (!created.ok) {
      throw new Error(JSON.stringify(created.error));
    }
    const changed = await client.updateLabel('tags', created.value.id, { color: '#33a02c', isInboxTag: false });
    expect(changed.ok && changed.value).toMatchObject({ color: '#33a02c', isInboxTag: false });
    await client.deleteLabel('tags', created.value.id);
  });

  test('a storage path takes a new template', async () => {
    const created = await client.createLabel('storagePaths', { name: uniqueName('labels-path'), path: '{{ title }}' });
    if (!created.ok) {
      throw new Error(JSON.stringify(created.error));
    }
    const changed = await client.updateLabel('storagePaths', created.value.id, { path: '{{ correspondent }}/{{ title }}' });
    expect(changed.ok && changed.value).toMatchObject({ path: '{{ correspondent }}/{{ title }}' });
    await client.deleteLabel('storagePaths', created.value.id);
  });

  test('a select field is made with its options, and a rename that sends them back keeps their ids', async () => {
    const created = await client.createLabel('customFields', {
      name: uniqueName('labels-select'),
      dataType: 'select',
      selectOptions: [{ label: 'Card' }, { label: 'Cash' }],
    });
    if (!created.ok) {
      throw new Error(JSON.stringify(created.error));
    }
    const options = 'selectOptions' in created.value ? created.value.selectOptions : [];
    expect(options.map((option) => option.label)).toEqual(['Card', 'Cash']);

    const withoutOptions = await client.updateLabel('customFields', created.value.id, { name: uniqueName('labels-bare') });
    expect(withoutOptions.ok).toBe(false);

    const renamed = await client.updateLabel('customFields', created.value.id, { name: uniqueName('labels-renamed'), selectOptions: options });
    expect(renamed.ok && 'selectOptions' in renamed.value && renamed.value.selectOptions).toEqual(options);
    await client.deleteLabel('customFields', created.value.id);
  });

  test('a second tag with the same name is rejected with the reason', async () => {
    const name = uniqueName('labels-twice');
    const first = await client.createLabel('tags', { name });
    const second = await client.createLabel('tags', { name });
    expect(second.ok === false && second.error.kind === 'rejected' && second.error.body).toContain('unique');
    if (first.ok) {
      await client.deleteLabel('tags', first.value.id);
    }
  });
});
