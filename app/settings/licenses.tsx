import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { copy } from '../../src/copy';
import licenses from '../../src/settings/licenses.json';
import { TitleBar } from '../../src/settings/parts';
import { useColors } from '../../src/theme';

export default function LicensesScreen() {
  const colors = useColors();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.fill, { backgroundColor: colors.surface }]}>
      <TitleBar title={copy.licenses.title} />
      <FlatList
        data={licenses}
        keyExtractor={(item) => `${item.name}@${item.version}`}
        ListHeaderComponent={<Text style={[styles.lead, { color: colors.inkMuted }]}>{copy.licenses.lead(licenses.length)}</Text>}
        renderItem={({ item, index }) => (
          <View
            accessible
            accessibilityLabel={`${item.name} ${item.version}, ${item.license}`}
            style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
          >
            <Text style={[styles.name, { color: colors.ink }]}>{item.name}</Text>
            <Text style={[styles.detail, { color: colors.inkMuted }]}>{`${item.version} · ${item.license}`}</Text>
          </View>
        )}
        contentContainerStyle={styles.listEnd}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lead: { paddingInline: 20, paddingBlockEnd: 12, fontSize: 14.5 },
  row: { paddingBlock: 10, paddingInline: 20, gap: 2 },
  name: { fontSize: 15 },
  detail: { fontSize: 13.5 },
  listEnd: { paddingBlockEnd: 32 },
});
