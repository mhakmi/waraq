import { beforeAll, describe, expect, test } from 'vitest';

import { viewParameters } from '../src/documents/views';
import { obtainToken } from '../src/paperless/client';
import type { DocumentId, IsoDate, SavedView } from '../src/paperless/schemas';
import {
  client,
  clientWithToken,
  createLabel,
  eventually,
  serverUrl,
  token,
  uniqueName,
} from './helpers';
import { syntheticPdf } from './synthetic-pdf';

function emptyFields(title: string) {
  return {
    title,
    created: null,
    correspondentId: null,
    documentTypeId: null,
    storagePathId: null,
    tagIds: [],
    archiveSerialNumber: null,
    customFields: [],
  };
}

async function uploadAndWait(title: string, tagIds: number[], created: IsoDate): Promise<DocumentId> {
  const filename = `${uniqueName('client')}.pdf`;
  const posted = await client.postDocument(
    { ...emptyFields(title), tagIds, created },
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

describe('signing in', () => {
  test('a wrong password is reported as bad credentials', async () => {
    const result = await obtainToken(
      { baseUrl: serverUrl, fetch },
      { username: 'admin', password: 'not-the-password' },
    );
    expect(result).toEqual({ ok: false, error: { kind: 'bad_credentials' } });
  });

  test('a bad token is reported as unauthorized', async () => {
    const result = await clientWithToken('not-a-real-token').probeServer();
    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
  });
});

describe('probeServer', () => {
  test('reads the server and API versions and the signed-in user', async () => {
    const result = await client.probeServer();
    if (!result.ok) {
      throw new Error(JSON.stringify(result.error));
    }
    expect(result.value.apiVersion).toBeGreaterThanOrEqual(10);
    expect(result.value.serverVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(result.value.user.username).toBe('admin');
  });
});

describe('documents', () => {
  const marker = uniqueName('marker').replace(/-/g, '');
  let firstTag: number;
  let secondTag: number;
  let bothTagged: DocumentId;
  let firstOnly: DocumentId;

  beforeAll(async () => {
    firstTag = await createLabel('tags', uniqueName('first'));
    secondTag = await createLabel('tags', uniqueName('second'));
    bothTagged = await uploadAndWait(`${marker} both`, [firstTag, secondTag], '2024-03-05' as IsoDate);
    firstOnly = await uploadAndWait(`${marker} first`, [firstTag], '2025-07-09' as IsoDate);
  });

  test('tags all and tags any filter differently', async () => {
    const all = await client.listDocuments({ tagIdsAll: [firstTag, secondTag] });
    const any = await client.listDocuments({ tagIdsAny: [firstTag, secondTag] });
    expect(all.ok && all.value.items.map((document) => document.id)).toEqual([bothTagged]);
    expect(any.ok && any.value.items.map((document) => document.id).sort()).toEqual(
      [bothTagged, firstOnly].sort(),
    );
  });

  test('a created range keeps only documents inside it', async () => {
    const result = await client.listDocuments({
      tagIdsAny: [firstTag],
      createdFrom: '2025-01-01' as IsoDate,
      createdTo: '2025-12-31' as IsoDate,
    });
    expect(result.ok && result.value.items.map((document) => document.id)).toEqual([firstOnly]);
  });

  test('ordering and page size apply', async () => {
    const result = await client.listDocuments({
      tagIdsAny: [firstTag],
      orderBy: { field: 'created', descending: false },
      pageSize: 1,
    });
    if (!result.ok) {
      throw new Error(JSON.stringify(result.error));
    }
    expect(result.value.count).toBe(2);
    expect(result.value.items.map((document) => document.id)).toEqual([bothTagged]);
    expect(result.value.hasNextPage).toBe(true);
  });

  test('a full-text query finds the document by its content', async () => {
    const result = await eventually(async () => {
      const found = await client.listDocuments({ query: `${marker} first` });
      return found.ok && found.value.items.some((document) => document.id === firstOnly) ? found : null;
    });
    expect(result.ok && result.value.items[0].searchHit).not.toBeNull();
  });

  test('detail, notes, and the thumbnail are readable', async () => {
    const detail = await client.getDocument(bothTagged);
    expect(detail.ok && detail.value.tagIds.sort()).toEqual([firstTag, secondTag].sort());

    const added = await client.addNote(bothTagged, 'checked by the integration suite');
    expect(added.ok && added.value.map((note) => note.text)).toEqual(['checked by the integration suite']);
    const notes = await client.listNotes(bothTagged);
    expect(notes.ok && notes.value.length).toBe(1);

    const thumbnail = client.documentFile(bothTagged, 'thumb');
    const response = await fetch(thumbnail.url, { headers: thumbnail.headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
  });

  test('labels list includes a tag and a correspondent made for this run', async () => {
    const tags = await client.listTags();
    expect(tags.ok && tags.value.some((tag) => tag.id === firstTag)).toBe(true);
    const correspondentId = await createLabel('correspondents', uniqueName('sender'));
    const correspondents = await client.listCorrespondents();
    expect(correspondents.ok && correspondents.value.some((item) => item.id === correspondentId)).toBe(true);
    for (const list of [
      await client.listDocumentTypes(),
      await client.listStoragePaths(),
      await client.listCustomFields(),
      await client.listSavedViews(),
    ]) {
      expect(list.ok).toBe(true);
    }
  });
});

describe('editing', () => {
  const marker = uniqueName('edit').replace(/-/g, '');
  let inboxTag: number;
  let keptTag: number;
  let document: DocumentId;

  beforeAll(async () => {
    const created = await client.createTag(uniqueName('inbox'));
    if (!created.ok) {
      throw new Error(JSON.stringify(created.error));
    }
    inboxTag = created.value.id;
    keptTag = await createLabel('tags', uniqueName('kept'));
    document = await uploadAndWait(`${marker} bill`, [inboxTag, keptTag], '2026-09-27' as IsoDate);
  });

  test('a PATCH with only the tags changes the tags and leaves every other field', async () => {
    const before = await client.getDocument(document);
    const result = await client.updateDocument(document, { tagIds: [keptTag] });
    if (!before.ok || !result.ok) {
      throw new Error(JSON.stringify(before.ok ? result : before));
    }
    expect(result.value.tagIds).toEqual([keptTag]);
    expect({ ...result.value, tagIds: before.value.tagIds, modified: before.value.modified }).toEqual(before.value);
  });

  test('a PATCH sets the title, a calendar date, an archive number, and clears a correspondent', async () => {
    const correspondent = await createLabel('correspondents', uniqueName('sender'));
    await client.updateDocument(document, { correspondentId: correspondent });
    const asn = 900_000 + Math.floor(Math.random() * 99_999);
    const result = await client.updateDocument(document, {
      title: `${marker} bill, September 2026`,
      created: '2026-01-01' as IsoDate,
      archiveSerialNumber: asn,
      correspondentId: null,
    });
    expect(result.ok && result.value).toMatchObject({
      title: `${marker} bill, September 2026`,
      created: '2026-01-01',
      archiveSerialNumber: asn,
      correspondentId: null,
    });
  });

  test('a new correspondent can be made by name', async () => {
    const name = uniqueName('made');
    const result = await client.createCorrespondent(name);
    expect(result.ok && result.value.name).toBe(name);
  });

  test('autocomplete suggests a word from the document text', async () => {
    const word = marker.slice(0, 8);
    const result = await eventually(async () => {
      const found = await client.autocomplete(word);
      return found.ok && found.value.length > 0 ? found : null;
    });
    expect(result.ok && result.value.some((suggestion) => suggestion.startsWith(word))).toBe(true);
  });

  test('a note can be added and read back', async () => {
    const added = await client.addNote(document, 'Pay before October 19.');
    expect(added.ok && added.value.map((note) => note.text)).toEqual(['Pay before October 19.']);
  });

  test('delete removes the document', async () => {
    const doomed = await uploadAndWait(`${marker} doomed`, [], '2026-02-02' as IsoDate);
    const result = await client.deleteDocument(doomed);
    expect(result).toEqual({ ok: true, value: null });
    const after = await client.getDocument(doomed);
    expect(after).toEqual({ ok: false, error: { kind: 'not_found' } });
  });
});

describe('saved views', () => {
  async function createView(rules: { rule_type: number; value: string | null }[]): Promise<SavedView> {
    const response = await fetch(`${serverUrl}/api/saved_views/`, {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json; version=10' },
      body: JSON.stringify({ name: uniqueName('view'), sort_field: 'created', sort_reverse: false, filter_rules: rules }),
    });
    if (!response.ok) {
      throw new Error(`Could not create a view: ${response.status} ${await response.text()}`);
    }
    const { id } = (await response.json()) as { id: number };
    const views = await client.listSavedViews();
    const view = views.ok ? views.value.find((item) => item.id === id) : undefined;
    if (view === undefined) {
      throw new Error('The new view is not in the list');
    }
    return view;
  }

  test("a view's rules filter and order the list as the server's web app would", async () => {
    const marker = uniqueName('view').replace(/-/g, '');
    const tag = await createLabel('tags', uniqueName('viewtag'));
    const older = await uploadAndWait(`${marker} older`, [tag], '2025-03-01' as IsoDate);
    const newer = await uploadAndWait(`${marker} newer`, [tag], '2026-03-01' as IsoDate);
    await uploadAndWait(`${marker} before range`, [tag], '2024-03-01' as IsoDate);

    const view = await createView([
      { rule_type: 6, value: String(tag) },
      { rule_type: 44, value: '2025-01-01' },
    ]);
    const parameters = viewParameters(view);
    if (!parameters.ok) {
      throw new Error(`unknown rule types ${parameters.unknownRuleTypes}`);
    }
    const result = await client.listDocuments({ savedViewDefaults: parameters.parameters });
    expect(result.ok && result.value.items.map((document) => document.id)).toEqual([older, newer]);
  });
});
