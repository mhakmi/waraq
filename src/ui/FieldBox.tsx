import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { calendarDateOf, formatCalendarDate, pickerDate, pickerTimeZone, todayCalendarDate } from '../format';
import { copy } from '../copy';
import type { IsoDate } from '../paperless/schemas';
import { touchTarget, useColors } from '../theme';
import { Icon } from './Icon';

type FieldBoxProps = {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  changed?: boolean;
  trailing?: ReactNode;
  small?: boolean;
};

export function FieldLabel({ label, changed = false }: { label: string; changed?: boolean }) {
  const colors = useColors();
  return (
    <Text style={[styles.label, { color: colors.inkMuted }]}>
      {label}
      {changed && (
        <>
          {' · '}
          <Text style={[styles.changed, { color: colors.accent }]}>{copy.edit.changed}</Text>
        </>
      )}
    </Text>
  );
}

export function FieldBox({ label, value, placeholder, onPress, changed = false, trailing, small = false }: FieldBoxProps) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      {!small && <FieldLabel label={label} changed={changed} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ?? placeholder}`}
        onPress={onPress}
        style={[styles.box, { backgroundColor: colors.surfaceRaised, borderColor: changed ? colors.accent : colors.outline }]}
      >
        <View style={styles.valueBlock}>
          {small && <Text style={[styles.smallLabel, { color: colors.inkMuted }]}>{label}</Text>}
          <Text style={[styles.value, { color: value === null ? colors.inkMuted : colors.ink }]}>{value ?? placeholder}</Text>
        </View>
        {trailing ?? (
          <View style={styles.icon}>
            <Icon name="chevronDown" color={colors.ink} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

type DateFieldProps = {
  label: string;
  value: IsoDate | null;
  placeholder: string;
  onChange: (date: IsoDate) => void;
  changed?: boolean;
  small?: boolean;
  trailing?: ReactNode;
};

export function DateField({ label, value, placeholder, onChange, changed, small, trailing }: DateFieldProps) {
  function open() {
    DateTimePickerAndroid.open({
      value: pickerDate(value ?? todayCalendarDate(new Date())),
      mode: 'date',
      timeZoneName: pickerTimeZone,
      onChange: (event, picked) => {
        if (event.type === 'set' && picked !== undefined) {
          onChange(calendarDateOf(picked));
        }
      },
    });
  }
  return (
    <FieldBox
      label={label}
      value={value === null ? null : formatCalendarDate(value, copy.locale)}
      placeholder={placeholder}
      onPress={open}
      changed={changed}
      small={small}
      trailing={trailing ?? <View style={styles.icon} />}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, flex: 1, minWidth: 0 },
  label: { fontSize: 13.5, fontWeight: '500' },
  changed: { fontWeight: '600' },
  box: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingInlineStart: 16, paddingInlineEnd: 4, borderRadius: 12, borderWidth: 1 },
  valueBlock: { flex: 1, minWidth: 0, paddingBlock: 8 },
  smallLabel: { fontSize: 13, fontWeight: '500' },
  value: { fontSize: 16 },
  icon: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
});
