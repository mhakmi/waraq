import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { useColors } from '../theme';
import { FieldLabel } from './FieldBox';

type FieldProps = Pick<
  TextInputProps,
  'value' | 'onChangeText' | 'placeholder' | 'keyboardType' | 'autoComplete' | 'autoFocus' | 'secureTextEntry' | 'onSubmitEditing' | 'multiline'
> & {
  changed?: boolean;
  label: string;
  help?: string;
  error?: string | null;
  plainText?: boolean;
  trailing?: ReactNode;
};

export function Field({ label, help, error, plainText = false, trailing, changed = false, ...input }: FieldProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused || changed ? colors.accent : colors.outline;
  return (
    <View style={styles.field}>
      <FieldLabel label={label} changed={changed} />
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
  box: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingInlineStart: 16, paddingInlineEnd: 4, borderRadius: 12 },
  input: { flex: 1, minWidth: 0, fontSize: 16, paddingBlock: 8 },
  help: { fontSize: 13.5 },
});
