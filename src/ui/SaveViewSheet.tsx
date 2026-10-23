import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { queryKeys } from '../cache/keys';
import { copy } from '../copy';
import { viewRules } from '../documents/views';
import { type DocumentQuery, documentQueryParameters } from '../paperless/client';
import type { SavedView } from '../paperless/schemas';
import { unwrap } from '../query';
import { useClient, useSignedIn } from '../session';
import { useColors } from '../theme';
import { Button } from './Button';
import { Field } from './Field';
import { Sheet } from './Sheet';

type SaveViewSheetProps = {
  query: DocumentQuery;
  onSaved: (view: SavedView) => void;
  onClose: () => void;
};

export function SaveViewSheet({ query, onSaved, onClose }: SaveViewSheetProps) {
  const colors = useColors();
  const client = useClient();
  const queryClient = useQueryClient();
  const { account } = useSignedIn();
  const [name, setName] = useState('');
  const rules = viewRules(documentQueryParameters(query));

  const save = useMutation({
    mutationFn: async () => {
      if (!rules.ok) {
        throw new Error(`No rule for ${rules.unknownParameters.join(', ')}`);
      }
      return unwrap(client.createSavedView(name.trim(), rules.view));
    },
    onSuccess: async (view) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.savedViews(account.id) });
      onSaved(view);
    },
  });

  return (
    <Sheet
      visible
      title={copy.saveView.title}
      onClose={onClose}
      footer={
        <View style={styles.footer}>
          <Button label={copy.saveView.save} busy={save.isPending} disabled={name.trim() === ''} onPress={() => save.mutate()} />
        </View>
      }
    >
      <Field
        label={copy.saveView.name}
        value={name}
        onChangeText={setName}
        autoFocus
        help={copy.saveView.nameHelp}
        onSubmitEditing={() => name.trim() !== '' && save.mutate()}
      />
      {save.isError && (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
          {copy.saveView.failed}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  error: { fontSize: 14.5 },
});
