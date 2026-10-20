import { useSharedValue, withTiming } from 'react-native-reanimated';

import { TIMING } from '../motion';

/**
 * One press feel for every tappable surface in the thermal design:
 * `pressed` animates 0 → 1 quickly on press-in and eases back on release;
 * callers map it to a small sink (`PRESS_SINK` pt) or a fade.
 *
 * No press delay on purpose — `unstable_pressDelay` drops quick taps on iOS.
 */
export function usePressFeedback() {
  const pressed = useSharedValue(0);

  return {
    pressed,
    pressHandlers: {
      onPressIn: () => {
        pressed.value = withTiming(1, TIMING.press);
      },
      onPressOut: () => {
        pressed.value = withTiming(0, TIMING.release);
      },
    },
  };
}

/** How far a solid button / panel sinks toward its hard shadow */
export const PRESS_SINK = 2;
