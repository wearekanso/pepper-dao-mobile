import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { StyleSheet, Text, View } from 'react-native';

import { INK, SIZE, SPACE, STATUS_COLORS, THERMAL_COLORS, TYPE } from '../theme';
import { ChevronLink, StatusTag, Touchable } from './atoms';
import { Panel } from './panel';
import { PixelButton } from './pixel-button';

interface ErrorCardProps {
  message: string;
  onRetry: () => void;
  /** Explorer page for "OPEN IN CHILISCAN"; hidden when absent */
  explorerUrl?: string;
}

/** "Signal lost" — a load failed; retry, or check the chain directly */
export function ErrorCard({ message, onRetry, explorerUrl }: ErrorCardProps) {
  return (
    <Panel>
      <StatusTag label="COULDN'T LOAD" status="negative" />
      <Text style={TYPE.display24}>Signal lost</Text>
      <Text style={TYPE.body14}>{message}</Text>
      <PixelButton label="RETRY" variant="gold" onPress={onRetry} />
      {explorerUrl ? (
        <View style={styles.between}>
          <Text style={[TYPE.meta18, { color: INK.muted }]}>Still not working?</Text>
          <ChevronLink
            label="OPEN IN CHILISCAN"
            onPress={() => void openBrowserAsync(explorerUrl, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC })}
          />
        </View>
      ) : null}
    </Panel>
  );
}

interface EmptyCardProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** "Nothing here yet" — a list or filter came back empty */
export function EmptyCard({ title, message, actionLabel, onAction }: EmptyCardProps) {
  return (
    <Panel>
      <Text style={[TYPE.label12, { color: INK.muted }]}>NOTHING HERE YET</Text>
      <Text style={TYPE.display24}>{title}</Text>
      <Text style={[TYPE.body14, { color: INK.muted }]}>{message}</Text>
      {actionLabel && onAction ? <PixelButton label={actionLabel} variant="outline" onPress={onAction} /> : null}
    </Panel>
  );
}

/** Static placeholder card while a list loads (no shimmer: one motion language) */
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Panel gap={10}>
      <View style={styles.between}>
        <View style={[styles.bar, { width: 80 }]} />
        <View style={[styles.bar, { width: 90 }]} />
      </View>
      <View style={[styles.bar, { width: 150 }]} />
      {Array.from({ length: lines }, (_, index) => (
        <View key={index} style={[styles.bar, styles.barTall, { width: index === 0 ? '80%' : '55%' }]} />
      ))}
    </Panel>
  );
}

interface NoticeBannerProps {
  label: string;
  message: string;
  tone: 'muted' | 'negative';
  actionLabel: string;
  onAction: () => void;
  /** `solid` renders the action as a small gold button instead of a text link */
  solidAction?: boolean;
}

/** One-line app state above the content: offline, wrong network … */
export function NoticeBanner({ label, message, tone, actionLabel, onAction, solidAction = false }: NoticeBannerProps) {
  const isNegative = tone === 'negative';

  return (
    <View style={[styles.banner, isNegative && { borderColor: STATUS_COLORS.negative.stroke }]}>
      <View style={[styles.row, { flex: 1, gap: 8 }]}>
        {isNegative ? null : <View style={styles.dot} />}
        <View style={{ flexShrink: 1 }}>
          <Text style={[TYPE.label12, { color: isNegative ? STATUS_COLORS.negative.text : THERMAL_COLORS.white }]}>{label}</Text>
          <Text style={[TYPE.meta18, { color: INK.muted }]} numberOfLines={1}>
            {message}
          </Text>
        </View>
      </View>
      {solidAction ? (
        <PixelButton label={actionLabel} variant="gold" size="small" style={{ alignSelf: 'auto' }} onPress={onAction} />
      ) : (
        <Touchable onPress={onAction} hitSlop={8}>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{actionLabel}</Text>
        </Touchable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bar: {
    height: 12,
    backgroundColor: THERMAL_COLORS.ghost,
  },
  barTall: {
    height: 18,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACE.rowX,
    paddingVertical: 10,
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
    borderColor: THERMAL_COLORS.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderWidth: 1,
    borderColor: INK.muted,
  },
});
