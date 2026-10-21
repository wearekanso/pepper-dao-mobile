import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DURATION, TIMING } from '../motion';
import { INK, SIZE, SPACE, THERMAL_COLORS, TYPE } from '../theme';
import { NavIconButton } from './thermal-nav-bar';

interface ThermalSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Centered Tiny5 title in the sheet's nav bar, e.g. "STAKE PEPPER" */
  title: string;
  /** One-line intro under the nav bar (Meta 18; long reading text goes in children) */
  subtitle?: string;
  children: ReactNode;
  /** Pinned below the body — V2 puts only the primary button here */
  footer?: ReactNode;
  /** Blocks closing while a transaction is in flight */
  locked?: boolean;
}

/**
 * V2 "S2" sheet used for every overlay in the thermal design: 2pt white
 * top line, a nav bar (square close button, centered title), a scrolling
 * body and a pinned footer. Slides up once without bounce; drag the nav bar
 * down, tap the scrim or the close button to dismiss.
 */
export function ThermalSheet({ visible, onClose, title, subtitle, children, footer, locked = false }: ThermalSheetProps) {
  const [isMounted, setIsMounted] = useState(visible);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const offset = useSharedValue(height);
  const scrim = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      offset.value = height;
      offset.value = withTiming(0, TIMING.enter);
      scrim.value = withTiming(1, { duration: DURATION.base });
    } else if (isMounted) {
      scrim.value = withTiming(0, { duration: DURATION.exit });
      offset.value = withTiming(height, TIMING.exit, (finished) => {
        if (finished) runOnJS(setIsMounted)(false);
      });
    }
  }, [visible, height, isMounted, offset, scrim]);

  function requestClose() {
    if (!locked) onClose();
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => !locked && gesture.dy > 6,
        onPanResponderMove: (_, gesture) => {
          offset.value = Math.max(0, gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > DISMISS_DISTANCE || gesture.vy > 1.2) {
            onClose();
          } else {
            offset.value = withTiming(0, TIMING.enter);
          }
        },
      }),
    [locked, offset, onClose],
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value * 0.78 }));

  if (!isMounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={requestClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { maxHeight: height - insets.top - 24 }, sheetStyle]}>
          <View {...panResponder.panHandlers} style={styles.nav}>
            <NavIconButton icon="close" onPress={requestClose} disabled={locked} />
            <Text style={[TYPE.label14, styles.title]} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.navSpacer} />
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, !footer && { paddingBottom: insets.bottom + 24 }]}
          >
            {subtitle ? <Text style={[TYPE.meta18, { color: INK.body }]}>{subtitle}</Text> : null}
            {children}
          </ScrollView>

          {footer ? (
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Section header used inside sheets: "ACTIONS ··········· 1 / 6 DONE" */
export function SheetSection({ label, right, rightColor }: { label: string; right?: string; rightColor?: string }) {
  return (
    <View style={styles.section}>
      <Text style={[TYPE.label12, { color: INK.muted }]}>{label}</Text>
      {right ? <Text style={[TYPE.meta18, { color: rightColor ?? INK.muted }]}>{right}</Text> : null}
    </View>
  );
}

const DISMISS_DISTANCE = 120;

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: THERMAL_COLORS.void,
  },
  keyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: THERMAL_COLORS.void,
    borderTopWidth: SIZE.stroke,
    borderTopColor: THERMAL_COLORS.white,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.margin,
    paddingVertical: 12,
    borderBottomWidth: SIZE.stroke,
    borderBottomColor: THERMAL_COLORS.borderSoft,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  navSpacer: {
    width: SIZE.navButton,
  },
  content: {
    paddingHorizontal: SPACE.margin,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 14,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 4,
    paddingHorizontal: SPACE.margin,
  },
});
