import { beforeAll, describe, expect, test } from 'vitest';

import { obtainToken } from '../src/paperless/client';
import type { DocumentId, IsoDate } from '../src/paperless/schemas';
import {
  client,
  clientWithToken,
  createLabel,
  eventually,
  serverUrl,
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
