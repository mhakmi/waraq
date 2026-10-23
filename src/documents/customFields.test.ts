import { describe, expect, test } from 'vitest';

import type { CustomField, IsoDate } from '../paperless/schemas';
import { customFieldRows, type DataType, type Draft, readValue, showValue, writeDraft } from './customFields';

function field(dataType: DataType, extra: Partial<CustomField> = {}): CustomField {
  return { id: 1, name: dataType, dataType, selectOptions: [], defaultCurrency: null, documentCount: 0, ...extra };
}

const words = { yes: 'Yes', no: 'No', linkedDocuments: (count: number) => `${count} documents` };
const select = field('select', { selectOptions: [{ id: 'a1', label: 'Chequing' }, { id: 'b2', label: 'Savings' }] });
const money = field('monetary', { defaultCurrency: 'CAD' });

function text(value: string, input: 'line' | 'lines' | 'url' | 'number'): Draft {
  return { type: 'text', text: value, input };
}

describe('read gives the draft for a stored value, and null for one the type cannot hold', () => {
  test.each<[string, CustomField, unknown, Draft | null]>([
    ['string', field('string'), 'Hydro', text('Hydro', 'line')],
    ['longtext', field('longtext'), 'Line one\nLine two', text('Line one\nLine two', 'lines')],
    ['url', field('url'), 'https://example.com', text('https://example.com', 'url')],
    ['integer', field('integer'), 42, text('42', 'number')],
    ['float', field('float'), 3.25, text('3.25', 'number')],
    ['boolean', field('boolean'), true, { type: 'toggle', on: true }],
    ['date', field('date'), '2026-10-19', { type: 'date', date: '2026-10-19' as IsoDate }],
    ['select', select, 'b2', { type: 'choice', optionId: 'b2' }],
    ['monetary with a currency', money, 'EUR12.50', { type: 'money', currency: 'EUR', amount: '12.50' }],
    ['monetary without one takes the default', money, '12.5', { type: 'money', currency: 'CAD', amount: '12.5' }],
    ['documentlink', field('documentlink'), [3, 4], { type: 'documents', ids: [3, 4] }],
    ['empty string', field('string'), null, text('', 'line')],
    ['empty integer', field('integer'), null, text('', 'number')],
    ['empty boolean', field('boolean'), null, { type: 'toggle', on: false }],
    ['empty date', field('date'), null, { type: 'date', date: null }],
    ['empty select', select, null, { type: 'choice', optionId: null }],
    ['empty monetary', money, null, { type: 'money', currency: 'CAD', amount: '' }],
    ['empty documentlink', field('documentlink'), null, { type: 'documents', ids: [] }],
    ['a word in an integer field', field('integer'), 'many', null],
    ['a number in a string field', field('string'), 7, null],
    ['a day that does not exist', field('date'), '2026-02-30', null],
    ['money with a comma', money, 'EUR1,00', null],
    ['links that are not ids', field('documentlink'), ['a'], null],
    ['a type from a newer server', field('unsupported'), 'anything', null],
  ])('%s', (name, definition, value, draft) => {
    expect(readValue(definition, value as never)).toEqual(draft);
  });
});

describe('write checks a draft and gives the value Paperless takes', () => {
  test.each<[string, CustomField, Draft, unknown]>([
    ['string, trimmed', field('string'), text('  Hydro ', 'line'), 'Hydro'],
    ['longtext keeps its lines', field('longtext'), text('a\nb', 'lines'), 'a\nb'],
    ['url', field('url'), text('https://example.com/bill?id=3', 'url'), 'https://example.com/bill?id=3'],
    ['integer', field('integer'), text('-12', 'number'), -12],
    ['float', field('float'), text('0.75', 'number'), 0.75],
    ['boolean', field('boolean'), { type: 'toggle', on: false }, false],
    ['date', field('date'), { type: 'date', date: '2026-01-31' as IsoDate }, '2026-01-31'],
    ['select', select, { type: 'choice', optionId: 'a1' }, 'a1'],
    ['monetary, padded to two decimals', money, { type: 'money', currency: 'eur', amount: '12.5' }, 'EUR12.50'],
    ['monetary, negative', money, { type: 'money', currency: 'CAD', amount: '-3' }, 'CAD-3.00'],
    ['monetary with no currency', field('monetary'), { type: 'money', currency: '', amount: '8' }, '8.00'],
    ['documentlink', field('documentlink'), { type: 'documents', ids: [5] }, [5]],
    ['empty text is no value', field('string'), text('  ', 'line'), null],
    ['empty number is no value', field('integer'), text('', 'number'), null],
    ['empty date is no value', field('date'), { type: 'date', date: null }, null],
    ['no option is no value', select, { type: 'choice', optionId: null }, null],
    ['no amount is no value', money, { type: 'money', currency: 'CAD', amount: '' }, null],
    ['no links is no value', field('documentlink'), { type: 'documents', ids: [] }, null],
  ])('%s', (name, definition, draft, value) => {
    expect(writeDraft(definition, draft)).toEqual({ ok: true, value });
  });

  test.each<[string, CustomField, Draft, string]>([
    ['string over 128 characters', field('string'), text('x'.repeat(129), 'line'), 'tooLong'],
    ['url with no scheme', field('url'), text('example.com', 'url'), 'notWebAddress'],
    ['url with a space', field('url'), text('https://exa mple.com', 'url'), 'notWebAddress'],
    ['integer with decimals', field('integer'), text('1.5', 'number'), 'notWholeNumber'],
    ['integer past 32 bits', field('integer'), text('2147483648', 'number'), 'tooLarge'],
    ['float with a comma', field('float'), text('1,5', 'number'), 'notNumber'],
    ['amount with three decimals', money, { type: 'money', currency: 'CAD', amount: '1.234' }, 'notAmount'],
    ['amount with a comma', money, { type: 'money', currency: 'CAD', amount: '1,50' }, 'notAmount'],
    ['currency that is not three letters', money, { type: 'money', currency: 'EURO', amount: '1' }, 'notCurrency'],
  ])('refuses %s', (name, definition, draft, problem) => {
    expect(writeDraft(definition, draft)).toEqual({ ok: false, problem });
  });

  test('a value read and written again is the value Paperless stored', () => {
    const stored: [CustomField, unknown][] = [
      [field('string'), 'Hydro'],
      [field('integer'), 42],
      [field('float'), 3.25],
      [field('boolean'), true],
      [field('date'), '2026-10-19'],
      [select, 'b2'],
      [money, 'EUR12.50'],
      [field('documentlink'), [3, 4]],
    ];
    for (const [definition, value] of stored) {
      const draft = readValue(definition, value as never);
      expect(draft === null ? null : writeDraft(definition, draft)).toEqual({ ok: true, value });
    }
  });
});

describe('show', () => {
  test.each<[string, CustomField, unknown, string]>([
    ['date as a calendar day', field('date'), '2026-10-19', 'Oct 19, 2026'],
    ['select by its label', select, 'a1', 'Chequing'],
    ['select option the server dropped, by its id', select, 'zz', 'zz'],
    ['boolean', field('boolean'), false, 'No'],
    ['money in its currency', money, 'EUR12.50', '€12.50'],
    ['money without a code in the default currency', money, '83.62', '$83.62'],
    ['money with no currency at all', field('monetary'), '83.62', '83.62'],
    ['document links by count', field('documentlink'), [3, 4], '2 documents'],
    ['a type from a newer server as it came', field('unsupported'), 'raw', 'raw'],
    ['a value shaped as an object', field('unsupported'), { currency: 'EUR' }, '{"currency":"EUR"}'],
  ])('%s', (name, definition, value, shown) => {
    expect(showValue(definition, value as never, 'en-CA', words)).toBe(shown);
  });

  test('rows leave out empty values and fields the account cannot see', () => {
    const fields = [{ ...field('string'), id: 6, name: 'Note' }, { ...field('documentlink'), id: 5, name: 'Related' }];
    const rows = customFieldRows(
      [
        { fieldId: 6, value: '' },
        { fieldId: 6, value: null },
        { fieldId: 5, value: [] },
        { fieldId: 5, value: [1] },
        { fieldId: 99, value: 'hidden' },
      ],
      fields,
      'en-CA',
      words,
    );
    expect(rows).toEqual([{ fieldId: 5, name: 'Related', value: '1 documents' }]);
  });
});
