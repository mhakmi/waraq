import { calendarDateOf, formatCalendarDate, pickerDate } from '../format';
import type { CustomField, CustomFieldValue, IsoDate } from '../paperless/schemas';

export type WireValue = CustomFieldValue['value'];
export type DataType = CustomField['dataType'];

export type TextInput = 'line' | 'lines' | 'url' | 'number';

export type Draft =
  | { type: 'text'; text: string; input: TextInput }
  | { type: 'toggle'; on: boolean }
  | { type: 'date'; date: IsoDate | null }
  | { type: 'choice'; optionId: string | null }
  | { type: 'money'; currency: string; amount: string }
  | { type: 'documents'; ids: number[] };

export type Problem = 'tooLong' | 'notWholeNumber' | 'tooLarge' | 'notNumber' | 'notWebAddress' | 'notAmount' | 'notCurrency';

export type Written = { ok: true; value: WireValue } | { ok: false; problem: Problem };

export type FieldWords = { yes: string; no: string; linkedDocuments: (count: number) => string };

type Kind<Shape extends Draft> = {
  read(value: WireValue, field: CustomField): Shape | null;
  write(draft: Shape, field: CustomField): Written;
  show(value: NonNullable<WireValue>, field: CustomField, locale: string, words: FieldWords): string;
};

function kind<Shape extends Draft>(spec: Kind<Shape>): Kind<Draft> {
  return spec as unknown as Kind<Draft>;
}

const longestString = 128;
const largestInteger = 2_147_483_647;
const smallestInteger = -2_147_483_648;

function written(value: WireValue): Written {
  return { ok: true, value };
}

function refused(problem: Problem): Written {
  return { ok: false, problem };
}

function textKind(input: TextInput, check: (text: string) => Written): Kind<Draft> {
  const storedAs = input === 'number' ? 'number' : 'string';
  return kind<Extract<Draft, { type: 'text' }>>({
    read: (value) => {
      if (value === null) {
        return { type: 'text', text: '', input };
      }
      return typeof value === storedAs ? { type: 'text', text: String(value), input } : null;
    },
    write: (draft) => (draft.text.trim() === '' ? written(null) : check(draft.text.trim())),
    show: (value) => String(value),
  });
}

const amountPattern = /^-?\d+(\.\d{1,2})?$/;
const moneyPattern = /^([A-Z]{3})?(-?\d+(\.\d{1,2})?)$/;

function moneyParts(value: WireValue): { currency: string | null; amount: string } | null {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string') {
    return null;
  }
  const match = moneyPattern.exec(text);
  return match === null ? null : { currency: match[1] ?? null, amount: match[2] };
}

// A phone keyboard in many locales types a comma for the decimal mark. Three digits after it could be a thousands separator, so that stays refused.
function withDecimalPoint(text: string): string {
  return /^-?\d+,\d{1,2}$/.test(text) ? text.replace(',', '.') : text;
}

function twoDecimals(amount: string): string {
  const [whole, decimals = ''] = amount.split('.');
  return `${whole}.${decimals.padEnd(2, '0')}`;
}

function formatMoney(amount: string, currency: string | null, locale: string): string {
  if (currency === null) {
    return amount;
  }
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

function isRealDay(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && calendarDateOf(pickerDate(text as IsoDate)) === text;
}

function isDocumentIdList(value: WireValue): value is number[] {
  return Array.isArray(value) && value.every((id) => Number.isInteger(id) && id > 0);
}

export const fieldKinds = {
  string: textKind('line', (text) => (text.length > longestString ? refused('tooLong') : written(text))),
  longtext: textKind('lines', written),
  url: textKind('url', (text) => (/^[a-z][a-z0-9+.-]*:\/\/[^\s/?#]+\S*$/i.test(text) ? written(text) : refused('notWebAddress'))),
  integer: textKind('number', (text) => {
    if (!/^-?\d+$/.test(text)) {
      return refused('notWholeNumber');
    }
    const value = Number(text);
    return value > largestInteger || value < smallestInteger ? refused('tooLarge') : written(value);
  }),
  float: textKind('number', (typed) => {
    const text = withDecimalPoint(typed);
    return /^-?\d+(\.\d+)?$/.test(text) ? written(Number(text)) : refused('notNumber');
  }),
  boolean: kind<Extract<Draft, { type: 'toggle' }>>({
    read: (value) => (value === null ? { type: 'toggle', on: false } : typeof value === 'boolean' ? { type: 'toggle', on: value } : null),
    write: (draft) => written(draft.on),
    show: (value, field, locale, words) => (value ? words.yes : words.no),
  }),
  date: kind<Extract<Draft, { type: 'date' }>>({
    read: (value) => (value === null ? { type: 'date', date: null } : typeof value === 'string' && isRealDay(value) ? { type: 'date', date: value as IsoDate } : null),
    write: (draft) => written(draft.date),
    show: (value, field, locale) => (typeof value === 'string' && isRealDay(value) ? formatCalendarDate(value as IsoDate, locale) : String(value)),
  }),
  select: kind<Extract<Draft, { type: 'choice' }>>({
    read: (value) => (value === null ? { type: 'choice', optionId: null } : typeof value === 'string' ? { type: 'choice', optionId: value } : null),
    write: (draft) => written(draft.optionId),
    show: (value, field) => field.selectOptions.find((option) => option.id === value)?.label ?? String(value),
  }),
  monetary: kind<Extract<Draft, { type: 'money' }>>({
    read: (value, field) => {
      if (value === null || value === '') {
        return { type: 'money', currency: field.defaultCurrency ?? '', amount: '' };
      }
      const parts = moneyParts(value);
      return parts === null ? null : { type: 'money', currency: parts.currency ?? field.defaultCurrency ?? '', amount: parts.amount };
    },
    write: (draft) => {
      const amount = withDecimalPoint(draft.amount.trim());
      const currency = draft.currency.trim().toUpperCase();
      if (amount === '') {
        return written(null);
      }
      if (!amountPattern.test(amount)) {
        return refused('notAmount');
      }
      if (currency !== '' && !/^[A-Z]{3}$/.test(currency)) {
        return refused('notCurrency');
      }
      return written(`${currency}${twoDecimals(amount)}`);
    },
    show: (value, field, locale) => {
      const parts = moneyParts(value);
      return parts === null ? String(value) : formatMoney(parts.amount, parts.currency ?? field.defaultCurrency, locale);
    },
  }),
  documentlink: kind<Extract<Draft, { type: 'documents' }>>({
    read: (value) => (value === null ? { type: 'documents', ids: [] } : isDocumentIdList(value) ? { type: 'documents', ids: value } : null),
    write: (draft) => written(draft.ids.length === 0 ? null : draft.ids),
    show: (value, field, locale, words) => (Array.isArray(value) ? words.linkedDocuments(value.length) : String(value)),
  }),
  unsupported: kind<Draft>({
    read: () => null,
    write: () => {
      throw new Error('A field of a type this app does not know has no draft to write.');
    },
    show: (value) => (Array.isArray(value) ? value.join(', ') : String(value)),
  }),
} satisfies Record<DataType, Kind<Draft>>;

export function readValue(field: CustomField, value: WireValue): Draft | null {
  return fieldKinds[field.dataType].read(value, field);
}

export function writeDraft(field: CustomField, draft: Draft): Written {
  return fieldKinds[field.dataType].write(draft, field);
}

export function showValue(field: CustomField, value: WireValue, locale: string, words: FieldWords): string | null {
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return fieldKinds[field.dataType].show(value, field, locale, words);
}

export type CustomFieldRow = { fieldId: number; name: string; value: string };

export function customFieldRows(
  values: CustomFieldValue[],
  fields: CustomField[],
  locale: string,
  words: FieldWords,
): CustomFieldRow[] {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  return values.flatMap((entry) => {
    const field = fieldsById.get(entry.fieldId);
    const value = field === undefined ? null : showValue(field, entry.value, locale, words);
    return field === undefined || value === null ? [] : [{ fieldId: field.id, name: field.name, value }];
  });
}
