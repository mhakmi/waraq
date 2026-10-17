import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { useColors } from '../theme';

type FieldProps = Pick<
  TextInputProps,
  'value' | 'onChangeText' | 'placeholder' | 'keyboardType' | 'autoComplete' | 'autoFocus' | 'secureTextEntry' | 'onSubmitEditing'
> & {
  label: string;
  help?: string;
  error?: string | null;
  plainText?: boolean;
  trailing?: ReactNode;
};

export function Field({ label, help, error, plainText = false, trailing, ...input }: FieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.accent : colors.line;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.inkMuted }]}>{label}</Text>
      <View
        style={[
          styles.box,
          { backgroundColor: colors.surfaceRaised, borderColor, borderWidth: focused || error ? 2 : 1 },
        ]}
      >
        <TextInput
          {...input}
          accessibilityLabel={label}
          autoCapitalize={plainText ? 'none' : 'sentences'}
          autoCorrect={!plainText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.inkMuted}
          style={[styles.input, { color: colors.ink }]}
        />
        {trailing}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.help, { color: colors.danger }]}>
          {error}
        </Text>
      ) : (
        help && <Text style={[styles.help, { color: colors.inkMuted }]}>{help}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 13.5, fontWeight: '500' },
  box: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingInlineStart: 16, paddingInlineEnd: 4, borderRadius: 12 },
  input: { flex: 1, minWidth: 0, fontSize: 16, paddingBlock: 8 },
  help: { fontSize: 13.5 },
});
