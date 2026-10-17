import type { SavedView } from '../paperless/schemas';

type RuleParameter = { name: string; many?: boolean; whenEmpty?: string };

const paperlessRuleParameters: Record<number, RuleParameter> = {
  0: { name: 'title__icontains' },
  1: { name: 'content__icontains' },
  2: { name: 'archive_serial_number' },
  3: { name: 'correspondent__id', whenEmpty: 'correspondent__isnull' },
  4: { name: 'document_type__id', whenEmpty: 'document_type__isnull' },
  5: { name: 'is_in_inbox' },
  6: { name: 'tags__id__all', many: true },
  7: { name: 'is_tagged' },
  8: { name: 'created__date__lt' },
  9: { name: 'created__date__gt' },
  10: { name: 'created__year' },
  11: { name: 'created__month' },
  12: { name: 'created__day' },
  13: { name: 'added__date__lt' },
  14: { name: 'added__date__gt' },
  15: { name: 'modified__date__lt' },
  16: { name: 'modified__date__gt' },
  17: { name: 'tags__id__none', many: true },
  18: { name: 'archive_serial_number__isnull' },
  19: { name: 'title_content' },
  20: { name: 'query' },
  21: { name: 'more_like_id' },
  22: { name: 'tags__id__in', many: true },
  23: { name: 'archive_serial_number__gt' },
  24: { name: 'archive_serial_number__lt' },
  25: { name: 'storage_path__id', whenEmpty: 'storage_path__isnull' },
  26: { name: 'correspondent__id__in', many: true },
  27: { name: 'correspondent__id__none', many: true },
  28: { name: 'document_type__id__in', many: true },
  29: { name: 'document_type__id__none', many: true },
  30: { name: 'storage_path__id__in', many: true },
  31: { name: 'storage_path__id__none', many: true },
  32: { name: 'owner__id' },
  33: { name: 'owner__id__in', many: true },
  34: { name: 'owner__isnull' },
  35: { name: 'owner__id__none', many: true },
  36: { name: 'custom_fields__icontains' },
  37: { name: 'shared_by__id', many: true },
  38: { name: 'custom_fields__id__all', many: true },
  39: { name: 'custom_fields__id__in', many: true },
  40: { name: 'custom_fields__id__none', many: true },
  41: { name: 'has_custom_fields' },
  42: { name: 'custom_field_query' },
  43: { name: 'created__date__lte' },
  44: { name: 'created__date__gte' },
  45: { name: 'added__date__lte' },
  46: { name: 'added__date__gte' },
  47: { name: 'mime_type' },
  48: { name: 'title_search' },
  49: { name: 'text' },
  50: { name: 'has_duplicates' },
};

export type ViewParameters =
  | { ok: true; parameters: Record<string, string> }
  | { ok: false; unknownRuleTypes: number[] };

export function viewParameters(view: SavedView): ViewParameters {
  const parameters: Record<string, string> = {};
  const unknownRuleTypes: number[] = [];
  for (const rule of view.filterRules) {
    const parameter = paperlessRuleParameters[rule.ruleType];
    if (parameter === undefined) {
      unknownRuleTypes.push(rule.ruleType);
      continue;
    }
    if (rule.value === null) {
      if (parameter.whenEmpty !== undefined) {
        parameters[parameter.whenEmpty] = '1';
      }
      continue;
    }
    const earlier = parameters[parameter.name];
    parameters[parameter.name] = parameter.many && earlier !== undefined ? `${earlier},${rule.value}` : rule.value;
  }
  if (unknownRuleTypes.length > 0) {
    return { ok: false, unknownRuleTypes };
  }
  if (view.sortField !== null) {
    parameters.ordering = `${view.sortReverse ? '-' : ''}${view.sortField}`;
  }
  return { ok: true, parameters };
}
