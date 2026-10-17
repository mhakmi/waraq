import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { thumbnailCacheKey } from '../cache/keys';
import { copy } from '../copy';
import { formatCalendarDate } from '../format';
import type { ListRow } from '../inbox/rows';
import type { AppClient } from '../session';
import { useColors } from '../theme';
import { TagPill } from './Chip';

type DocumentRowProps = {
  row: ListRow;
  divided: boolean;
  client: AppClient;
  serverUrl: string;
  onPress: () => void;
  action?: ReactNode;
};

export function DocumentRow({ row, divided, client, serverUrl, onPress, action }: DocumentRowProps) {
  const colors = useColors();
  const thumbnail = client.documentFile(row.document.id, 'thumb');
  const meta = copy.inbox.meta(row.correspondent, formatCalendarDate(row.document.created, copy.locale));
  return (
    <View style={[styles.row, divided && { borderTopWidth: 1, borderTopColor: colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.document.title}. ${meta}`}
        onPress={onPress}
        style={({ pressed }) => [styles.open, pressed && { opacity: 0.7 }]}
      >
        <Image
          source={{
            uri: thumbnail.url,
            headers: thumbnail.headers,
            cacheKey: thumbnailCacheKey(serverUrl, row.document.id, row.document.modified),
          }}
          contentFit="cover"
          contentPosition="top"
          accessible={false}
          style={[styles.thumb, { backgroundColor: colors.paper, borderColor: colors.line }]}
        />
        <View style={styles.main}>
          <Text style={[styles.title, { color: colors.ink }]}>{row.document.title}</Text>
          <Text style={[styles.meta, { color: colors.inkMuted }]}>{meta}</Text>
          <View style={styles.tags}>
            {row.tags.map((tag) => (
              <TagPill key={tag.id} name={tag.name} inbox={tag.isInboxTag} />
            ))}
          </View>
        </View>
      </Pressable>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingInlineEnd: 12, minHeight: 88 },
  open: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 14, alignItems: 'flex-start', paddingBlock: 12, paddingInlineStart: 20 },
  thumb: { width: 48, height: 64, borderRadius: 3, borderWidth: StyleSheet.hairlineWidth },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 15.5, fontWeight: '500' },
  meta: { fontSize: 13.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBlockStart: 2 },
});
