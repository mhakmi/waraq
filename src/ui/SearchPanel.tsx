import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { BackHandler, I18nManager, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { queryKeys } from '../cache/keys';
import { copy } from '../copy';
import type { Labels, Named } from '../labels';
import { unwrap } from '../query';
import { withRecentSearch } from '../search/recent';
import { loadRecentSearches, saveRecentSearches } from '../search/store';
import { useClient, useSignedIn } from '../session';
import { touchTarget, useColors } from '../theme';
import { Icon, type IconName } from './Icon';

export type MatchKind = keyof typeof copy.search.kinds;
export type LabelMatch = { kind: MatchKind; label: Named };

const typingPauseMs = 250;
const shortestTerm = 2;
const labelMatchLimit = 5;

type SearchPanelProps = {
  initialText: string;
  labels: Labels;
  onSearch: (text: string) => void;
  onPickLabel: (match: LabelMatch) => void;
  onClose: () => void;
};

function labelMatches(labels: Labels, typed: string): LabelMatch[] {
  const term = typed.toLowerCase();
  if (term.length < shortestTerm) {
    return [];
  }
  const lists: [MatchKind, Named[] | undefined][] = [
    ['correspondent', labels.correspondents.data],
    ['tag', labels.tags.data],
    ['documentType', labels.documentTypes.data],
    ['storagePath', labels.storagePaths.data],
  ];
  return lists
    .flatMap(([kind, items]) =>
      (items ?? []).filter((item) => item.name.toLowerCase().includes(term)).map((label) => ({ kind, label })),
    )
    .slice(0, labelMatchLimit);
}

export function SearchPanel({ initialText, labels, onSearch, onPickLabel, onClose }: SearchPanelProps) {
  const colors = useColors();
  const client = useClient();
  const { account } = useSignedIn();
  const [text, setText] = useState(initialText);
  const [term, setTerm] = useState(initialText.trim());
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    loadRecentSearches(account.id).then(setRecent);
  }, [account.id]);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), typingPauseMs);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);

  const suggestions = useQuery({
    queryKey: queryKeys.autocomplete(account.id, term.toLowerCase()),
    queryFn: () => unwrap(client.autocomplete(term)),
    enabled: term.length >= shortestTerm,
    staleTime: 60_000,
  });

  function search(value: string) {
    const next = withRecentSearch(recent, value);
    saveRecentSearches(account.id, next);
    onSearch(value.trim());
  }

  const matches = labelMatches(labels, text.trim());
  const words = term.length >= shortestTerm ? (suggestions.data ?? []) : [];

  return (
    <View style={styles.fill}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel={copy.shell.back} onPress={onClose} style={styles.iconButton}>
          <View style={I18nManager.isRTL && styles.flipped}>
            <Icon name="back" color={colors.ink} />
          </View>
        </Pressable>
        <View style={[styles.field, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => search(text)}
            placeholder={copy.documents.searchPlaceholder}
            placeholderTextColor={colors.inkMuted}
            accessibilityLabel={copy.documents.searchPlaceholder}
            style={[styles.input, { color: colors.ink }]}
          />
          {text !== '' && (
            <Pressable accessibilityRole="button" accessibilityLabel={copy.search.clear} onPress={() => setText('')} style={styles.iconButton}>
              <Icon name="close" color={colors.ink} />
            </Pressable>
          )}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {words.length > 0 && (
          <Group title={copy.search.suggestions}>
            {words.map((word) => (
              <Suggestion key={word} icon="search" label={word} typed={text.trim()} onPress={() => search(word)} />
            ))}
          </Group>
        )}
        {matches.length > 0 && (
          <Group title={copy.search.labels}>
            {matches.map((match) => (
              <Suggestion
                key={`${match.kind}-${match.label.id}`}
                icon={match.kind === 'tag' ? 'tag' : 'person'}
                label={match.label.name}
                sub={copy.search.kinds[match.kind]}
                onPress={() => onPickLabel(match)}
              />
            ))}
          </Group>
        )}
        {recent.length > 0 && (
          <Group title={copy.search.recent}>
            {recent.map((word) => (
              <Suggestion key={word} icon="history" label={word} onPress={() => search(word)} />
            ))}
          </Group>
        )}
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View>
      <Text accessibilityRole="header" style={[styles.groupHead, { color: colors.inkMuted }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

type SuggestionProps = { icon: IconName; label: string; sub?: string; typed?: string; onPress: () => void };

function Suggestion({ icon, label, sub, typed = '', onPress }: SuggestionProps) {
  const colors = useColors();
  const typedPart = typed !== '' && label.toLowerCase().startsWith(typed.toLowerCase()) ? label.slice(0, typed.length) : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surfaceSunken }]}
    >
      <Icon name={icon} color={colors.inkMuted} />
      <View style={styles.suggestionText}>
        <Text style={[styles.suggestionLabel, { color: colors.ink }]}>
          <Text style={styles.typed}>{typedPart}</Text>
          {label.slice(typedPart.length)}
        </Text>
        {sub && <Text style={[styles.sub, { color: colors.inkMuted }]}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBlockStart: 8, paddingBlockEnd: 12, paddingInlineStart: 4, paddingInlineEnd: 16 },
  iconButton: { width: touchTarget, height: touchTarget, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  flipped: { transform: [{ scaleX: -1 }] },
  field: { flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingInlineStart: 16, paddingInlineEnd: 4, borderRadius: 28, borderWidth: 2 },
  input: { flex: 1, minWidth: 0, fontSize: 16 },
  groupHead: { paddingBlockStart: 16, paddingBlockEnd: 6, paddingInline: 20, fontSize: 13.5, fontWeight: '600' },
  suggestion: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingInline: 20 },
  suggestionText: { flex: 1, minWidth: 0 },
  suggestionLabel: { fontSize: 15.5 },
  typed: { fontWeight: '700' },
  sub: { fontSize: 13 },
});
