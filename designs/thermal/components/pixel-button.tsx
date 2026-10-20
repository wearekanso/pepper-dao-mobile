import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { PRESS_SINK, usePressFeedback } from '../hooks/use-press-feedback';

import { SIZE, THERMAL_COLORS, TYPE } from '../theme';
import { HardShadow } from './panel';

export type PixelButtonVariant = 'gold' | 'outline' | 'outlineGold' | 'cream' | 'muted' | 'void' | 'paper';

interface PixelButtonProps {
  label: string;
  onPress?: () => void;
  variant?: PixelButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Overrides the fixed V2 height (44pt) with vertical padding */
  paddingVertical?: number;
}

/**
 * Pixel button: solid variants sit on a hard shadow and sink into it on press.
 * Pass `style={{ flex: 1 }}` to share a row.
 */
export function PixelButton({
  label,
  onPress,
  variant = 'gold',
  disabled = false,
  style,
  paddingVertical,
}: PixelButtonProps) {
  const config = VARIANTS[variant];
  const { pressed, pressHandlers } = usePressFeedback();
  const hasShadow = Boolean(config.shadow);
  // RN adds the border to the box; take it out of the padding so every
  // variant's face is the same height and outline buttons line up with the
  // face of a solid button (its hard shadow then sits below the row)
  const borderWidth = config.borderWidth ?? 0;

  // Solid buttons sink toward their shadow; outline buttons just dim
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: hasShadow ? 1 : 1 - pressed.value * 0.35,
    transform: hasShadow
      ? [{ translateX: pressed.value * PRESS_SINK }, { translateY: pressed.value * PRESS_SINK }]
      : [],
  }));

  return (
    <Pressable
      disabled={disabled}
      {...pressHandlers}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.();
      }}
      style={[styles.wrapper, { opacity: disabled ? 0.45 : 1 }, style]}
    >
      {config.shadow ? <HardShadow color={config.shadow} /> : null}
      <Animated.View
        style={[
          styles.body,
          {
            ...(paddingVertical === undefined
              ? { height: SIZE.button }
              : { paddingVertical: Math.max(0, paddingVertical - borderWidth) }),
            backgroundColor: config.background,
            borderColor: config.border ?? 'transparent',
            borderWidth,
          },
          animatedStyle,
        ]}
      >
        <Text style={[TYPE.label14, { color: config.text }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** Wraps any content in a hard shadow without press behaviour */
export function ShadowBox({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <View>
      <HardShadow color={color} />
      {children}
    </View>
  );
}

interface VariantConfig {
  background: string;
  text: string;
  border?: string;
  borderWidth?: number;
  shadow?: string;
}

const VARIANTS: Record<PixelButtonVariant, VariantConfig> = {
  gold: { background: THERMAL_COLORS.gold, text: THERMAL_COLORS.void, shadow: '#000000' },
  outline: { background: 'transparent', text: THERMAL_COLORS.white, border: 'rgba(255,255,255,0.6)', borderWidth: 2 },
  outlineGold: { background: 'transparent', text: THERMAL_COLORS.gold, border: THERMAL_COLORS.gold, borderWidth: 2 },
  cream: { background: THERMAL_COLORS.cream, text: THERMAL_COLORS.void, shadow: THERMAL_COLORS.orange },
  muted: { background: 'transparent', text: 'rgba(255,255,255,0.35)', border: THERMAL_COLORS.borderSoft, borderWidth: 2 },
  void: { background: THERMAL_COLORS.void, text: THERMAL_COLORS.cream, shadow: THERMAL_COLORS.red },
  paper: { background: THERMAL_COLORS.cream, text: THERMAL_COLORS.void, border: THERMAL_COLORS.void, borderWidth: 3, shadow: THERMAL_COLORS.void },
};

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
  },
  body: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
});
