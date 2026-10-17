import { formatCalendarDate } from '../format';
import type { CustomField, CustomFieldValue, IsoDate } from '../paperless/schemas';

export type CustomFieldRow = { fieldId: number; name: string; value: string };

export type CustomFieldWords = { yes: string; no: string; linkedDocuments: (count: number) => string };

function shownValue(field: CustomField, value: CustomFieldValue['value'], locale: string, words: CustomFieldWords): string | null {
  if (value === null || value === '') {
    return null;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? null : words.linkedDocuments(value.length);
  }
  if (typeof value === 'boolean') {
    return value ? words.yes : words.no;
  }
  if (field.dataType === 'select') {
    return field.selectOptions.find((option) => option.id === value)?.label ?? String(value);
  }
  if (field.dataType === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatCalendarDate(value as IsoDate, locale);
  }
  return String(value);
}

export function customFieldRows(
  values: CustomFieldValue[],
  fields: CustomField[],
  locale: string,
  words: CustomFieldWords,
): CustomFieldRow[] {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  return values.flatMap((entry) => {
    const field = fieldsById.get(entry.fieldId);
    const value = field === undefined ? null : shownValue(field, entry.value, locale, words);
    return field === undefined || value === null ? [] : [{ fieldId: field.id, name: field.name, value }];
  });
}
