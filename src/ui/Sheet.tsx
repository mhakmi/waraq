import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, ScrollView, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { copy } from '../copy';
import { useColors } from '../theme';
import { openingPlace, peekPosition, restingPlace } from './sheetMotion';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

type SheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  headerAction?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function Sheet({ visible, title, onClose, headerAction, footer, children }: SheetProps) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <DraggableSheet title={title} onClose={onClose} headerAction={headerAction} footer={footer}>
            {children}
          </DraggableSheet>
          {/* After the sheet in the tree, so TalkBack reads the sheet first, and drawn behind it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.picker.close}
            onPress={onClose}
            style={[StyleSheet.absoluteFill, styles.behind, { backgroundColor: colors.scrim }]}
          />
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function useScreenReader(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setEnabled);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => subscription.remove();
  }, []);
  return enabled;
}

function DraggableSheet({ title, onClose, headerAction, footer, children }: Omit<SheetProps, 'visible'>) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const screenReader = useScreenReader();
  const [expanded, setExpanded] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const peekHeight = window.height * 0.6;

  const belowExpanded = useSharedValue(window.height);
  const sheetHeight = useSharedValue(0);
  const dragStart = useSharedValue(0);
  const scrollTop = useSharedValue(0);
  const closing = useSharedValue(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  function settle(place: 'expanded' | 'peek' | 'closed') {
    setExpanded(place === 'expanded');
    if (place === 'closed') {
      onClose();
    }
  }

  function moveTo(target: number, place: 'expanded' | 'peek' | 'closed') {
    'worklet';
    closing.value = place === 'closed';
    belowExpanded.value = withTiming(target, { duration: 220 }, (finished) => {
      if (finished) {
        scheduleOnRN(settle, place);
      }
    });
  }

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-16, 16],
    onActivate: () => {
      dragStart.value = belowExpanded.value;
    },
    onUpdate: (event) => {
      if (scrollTop.value > 0) {
        dragStart.value = belowExpanded.value - event.translationY;
        return;
      }
      belowExpanded.value = Math.min(Math.max(dragStart.value + event.translationY, 0), sheetHeight.value);
    },
    onDeactivate: (event) => {
      const place = restingPlace(belowExpanded.value, event.velocityY, sheetHeight.value, peekHeight);
      moveTo(place.belowExpanded, place.name);
    },
  });

  function onLayout(event: LayoutChangeEvent) {
    sheetHeight.value = event.nativeEvent.layout.height;
    setMeasuredHeight(event.nativeEvent.layout.height);
  }

  // With a screen reader the sheet opens expanded once; after that a TalkBack user may still drag it to peek.
  const expandedForScreenReader = useRef(false);
  useEffect(() => {
    if (measuredHeight === 0 || screenReader === null || expanded || closing.value) {
      return;
    }
    if (screenReader && expandedForScreenReader.current) {
      return;
    }
    expandedForScreenReader.current = screenReader;
    const place = openingPlace(screenReader, measuredHeight, peekHeight);
    moveTo(place.belowExpanded, place.name);
  }, [measuredHeight, screenReader, expanded, peekHeight]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => moveTo(0, 'expanded'));
    return () => subscription.remove();
  }, []);

  const pinListWhileSheetMoves = useAnimatedScrollHandler((event) => {
    if (belowExpanded.value > 0 && event.contentOffset.y > 0) {
      scrollTo(scrollRef, 0, 0, false);
      return;
    }
    scrollTop.value = event.contentOffset.y;
  });

  const sheetMotion = useAnimatedStyle(() => ({ transform: [{ translateY: belowExpanded.value }] }));
  const footerLiftAtPeek = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.min(belowExpanded.value, peekPosition(sheetHeight.value, peekHeight)) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        onLayout={onLayout}
        style={[
          styles.sheet,
          sheetMotion,
          { backgroundColor: colors.surfaceRaised, paddingBottom: insets.bottom, maxHeight: window.height - insets.top },
        ]}
      >
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: colors.line }]} />
        </View>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            {title}
          </Text>
          {headerAction}
        </View>
        <AnimatedScrollView
          ref={scrollRef}
          simultaneousWith={pan}
          scrollEnabled={expanded}
          onScroll={pinListWhileSheetMoves}
          scrollEventThrottle={16}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </AnimatedScrollView>
        {footer && (
          <Animated.View style={[styles.foot, footerLiftAtPeek, { borderTopColor: colors.line, backgroundColor: colors.surfaceRaised }]}>
            <View style={[styles.footerFiller, { height: window.height, backgroundColor: colors.surfaceRaised }]} />
            {footer}
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  behind: { zIndex: -1 },
  sheet: { flexShrink: 1, borderTopStartRadius: 24, borderTopEndRadius: 24, overflow: 'hidden' },
  handle: { height: 20, alignItems: 'center', justifyContent: 'center' },
  handleBar: { width: 36, height: 4, borderRadius: 2 },
  head: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingInlineStart: 20, paddingInlineEnd: 8 },
  title: { fontSize: 20, fontWeight: '500', flexShrink: 1 },
  body: { paddingInline: 20, paddingBlockStart: 4, paddingBlockEnd: 16, gap: 18 },
  footerFiller: { position: 'absolute', top: 0, start: 0, end: 0 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBlock: 12, paddingInline: 16, borderTopWidth: 1 },
});
