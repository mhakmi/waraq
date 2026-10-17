import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '../theme';

export type SnackbarContent = { text: string; action?: { label: string; onPress: () => void } };
export type SnackbarMessage = SnackbarContent & { id: number };

const shownForMs = 6000;

let nextMessageId = 1;

export function useSnackbarState() {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const show = useCallback((content: SnackbarContent) => {
    setMessage({ ...content, id: nextMessageId++ });
  }, []);
  const hide = useCallback(() => setMessage(null), []);
  return { message, show, hide };
}

const ShowSnackbar = createContext<(content: SnackbarContent) => void>(() => {});

export const SnackbarProvider = ShowSnackbar.Provider;

export function useShowSnackbar() {
  return useContext(ShowSnackbar);
}

export function Snackbar({ message, bottom, onHide }: { message: SnackbarMessage | null; bottom: number; onHide: () => void }) {
  const colors = useColors();

  useEffect(() => {
    if (message === null) {
      return;
    }
    const timer = setTimeout(onHide, shownForMs);
    return () => clearTimeout(timer);
  }, [message, onHide]);

  if (message === null) {
    return null;
  }
  return (
    <View accessibilityLiveRegion="polite" style={[styles.bar, { bottom, backgroundColor: colors.snackbar }]}>
      <Text style={[styles.text, { color: colors.onSnackbar }]}>{message.text}</Text>
      {message.action && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={message.action.label}
          onPress={() => {
            message.action?.onPress();
            onHide();
          }}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: colors.snackbarAction }]}>{message.action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    insetInline: 12,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBlock: 6,
    paddingInlineStart: 16,
    paddingInlineEnd: 6,
    borderRadius: 10,
    elevation: 8,
  },
  text: { flex: 1, minWidth: 0, fontSize: 14.5 },
  action: { minHeight: 48, minWidth: 48, paddingInline: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 15, fontWeight: '600' },
});
