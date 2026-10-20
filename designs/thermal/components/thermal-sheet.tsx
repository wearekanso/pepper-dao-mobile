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
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DURATION, TIMING } from '../motion';
import { SPACE, THERMAL_COLORS, TYPE } from '../theme';
import { Touchable } from './atoms';

interface ThermalSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Small label next to the orange square, e.g. "FIELD GUIDE · HEAT" */
  eyebrow: string;
  /** Large Jersey title at the top of the scroll content */
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Sticky action row pinned to the bottom (buttons) */
  footer?: ReactNode;
  /** Blocks closing while a transaction is in flight */
  locked?: boolean;
}

/**
 * The one sheet used for every overlay in the thermal design (info, lists,
 * forms). Slides up once without bounce; drag the top edge down, tap the
 * scrim or the X to close. Content scrolls under a sticky footer.
 */
export function ThermalSheet({ visible, onClose, eyebrow, title, subtitle, children, footer, locked = false }: ThermalSheetProps) {
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

  const footerSpace = footer ? FOOTER_HEIGHT + insets.bottom + 8 : insets.bottom + 24;

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
          <View {...panResponder.panHandlers}>
            <HeatStrip />
            <View style={styles.header}>
              <View style={styles.eyebrow}>
                <View style={{ width: 8, height: 8, backgroundColor: THERMAL_COLORS.orange }} />
                <Text style={[TYPE.label10, { color: THERMAL_COLORS.cream, opacity: 0.6 }]}>{eyebrow}</Text>
              </View>
              <Touchable onPress={requestClose} hitSlop={12} style={[styles.close, locked && { opacity: 0.3 }]}>
                <Text style={TYPE.label12}>X</Text>
              </Touchable>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, { paddingBottom: footerSpace }]}
          >
            {title ? (
              <View style={{ gap: 6 }}>
                <Text style={TYPE.display40}>{title}</Text>
                {subtitle ? <Text style={TYPE.body13}>{subtitle}</Text> : null}
              </View>
            ) : null}
            {children}
          </ScrollView>

          {footer ? (
            <View pointerEvents="box-none" style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
              <FooterFade />
              <View style={styles.footerButtons}>{footer}</View>
            </View>
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
      <Text style={[TYPE.label10, { opacity: 0.6 }]}>{label}</Text>
      {right ? <Text style={[TYPE.meta16, rightColor ? { color: rightColor } : { opacity: 0.6 }]}>{right}</Text> : null}
    </View>
  );
}

function HeatStrip() {
  return (
    <View style={styles.strip}>
      {STRIP.map((color, index) => (
        <View key={index} style={{ flex: 1, height: 3, backgroundColor: color }} />
      ))}
    </View>
  );
}

function FooterFade() {
  const { width } = useWindowDimensions();
  // Wrapped so react-native-svg never intercepts taps meant for the buttons
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={FOOTER_HEIGHT + 60}>
        <Defs>
          <LinearGradient id="sheet-footer" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={THERMAL_COLORS.void} stopOpacity={0} />
            <Stop offset="0.3" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
            <Stop offset="1" stopColor={THERMAL_COLORS.void} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={FOOTER_HEIGHT + 60} fill="url(#sheet-footer)" />
      </Svg>
    </View>
  );
}

const STRIP = [
  THERMAL_COLORS.cream, THERMAL_COLORS.gold, THERMAL_COLORS.gold, THERMAL_COLORS.orange, THERMAL_COLORS.orange,
  THERMAL_COLORS.orange, THERMAL_COLORS.red, THERMAL_COLORS.red, THERMAL_COLORS.orange, THERMAL_COLORS.orange,
  THERMAL_COLORS.orange, THERMAL_COLORS.gold, THERMAL_COLORS.gold, THERMAL_COLORS.cream, THERMAL_COLORS.cream,
];

const FOOTER_HEIGHT = 74;
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
    borderTopWidth: 2,
    borderTopColor: THERMAL_COLORS.border,
  },
  strip: {
    flexDirection: 'row',
    gap: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.margin,
    paddingTop: 16,
  },
  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  close: {
    borderWidth: 2,
    borderColor: THERMAL_COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  content: {
    paddingHorizontal: SPACE.margin,
    paddingTop: 16,
    gap: SPACE.section,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 24,
    paddingHorizontal: SPACE.margin,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
});
