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

export type ViewRules = Pick<SavedView, 'sortField' | 'sortReverse' | 'filterRules'>;

export type ViewParameters =
  | { ok: true; parameters: Record<string, string> }
  | { ok: false; unknownRuleTypes: number[] };

export function viewParameters(view: ViewRules): ViewParameters {
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

const listOnlyParameters = new Set(['page', 'page_size', 'fields', 'truncate_content']);

export type RulesFromParameters = { ok: true; view: ViewRules } | { ok: false; unknownParameters: string[] };

// The same table as viewParameters, read the other way, so a saved view gives back the list it was saved from.
export function viewRules(parameters: Record<string, string | number | boolean | undefined>): RulesFromParameters {
  const filterRules: ViewRules['filterRules'] = [];
  const unknownParameters: string[] = [];
  let sortField: string | null = null;
  let sortReverse = false;
  for (const [name, value] of Object.entries(parameters)) {
    if (value === undefined || listOnlyParameters.has(name)) {
      continue;
    }
    const text = String(value);
    if (name === 'ordering') {
      sortReverse = text.startsWith('-');
      sortField = sortReverse ? text.slice(1) : text;
      continue;
    }
    const entry = Object.entries(paperlessRuleParameters).find(
      ([, parameter]) => parameter.name === name || parameter.whenEmpty === name,
    );
    if (entry === undefined) {
      unknownParameters.push(name);
      continue;
    }
    const [ruleType, parameter] = entry;
    if (parameter.whenEmpty === name) {
      filterRules.push({ ruleType: Number(ruleType), value: null });
    } else {
      const values = parameter.many ? text.split(',') : [text];
      filterRules.push(...values.map((one) => ({ ruleType: Number(ruleType), value: one })));
    }
  }
  if (unknownParameters.length > 0) {
    return { ok: false, unknownParameters };
  }
  return { ok: true, view: { sortField, sortReverse, filterRules } };
}
