import { expect, test } from 'vitest';

import type { CustomField } from '../paperless/schemas';
import { customFieldRows } from './customFields';

function field(id: number, name: string, dataType: CustomField['dataType'], selectOptions: CustomField['selectOptions'] = []): CustomField {
  return { id, name, dataType, selectOptions, defaultCurrency: null, documentCount: 1 };
}

const fields = [
  field(1, 'Amount due', 'monetary'),
  field(2, 'Due date', 'date'),
  field(3, 'Paid', 'boolean'),
  field(4, 'Account', 'select', [{ id: 'a1', label: 'Chequing' }]),
  field(5, 'Related', 'documentlink'),
  field(6, 'Note', 'string'),
];

const words = { yes: 'Yes', no: 'No', linkedDocuments: (count: number) => `${count} documents` };

test('shows each set field by its name, in the order the document lists them', () => {
  const rows = customFieldRows(
    [
      { fieldId: 2, value: '2026-10-19' },
      { fieldId: 1, value: 'CAD83.62' },
      { fieldId: 3, value: false },
      { fieldId: 4, value: 'a1' },
      { fieldId: 5, value: [3, 4] },
    ],
    fields,
    'en-CA',
    words,
  );
  expect(rows.map((row) => [row.name, row.value])).toEqual([
    ['Due date', 'Oct 19, 2026'],
    ['Amount due', 'CAD83.62'],
    ['Paid', 'No'],
    ['Account', 'Chequing'],
    ['Related', '2 documents'],
  ]);
});

test('leaves out empty values and fields the account cannot see', () => {
  const rows = customFieldRows(
    [
      { fieldId: 6, value: '' },
      { fieldId: 6, value: null },
      { fieldId: 5, value: [] },
      { fieldId: 99, value: 'hidden' },
    ],
    fields,
    'en-CA',
    words,
  );
  expect(rows).toEqual([]);
});
