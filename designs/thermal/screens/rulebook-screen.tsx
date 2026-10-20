import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { StorageService } from '@/lib/storage';

import { Tag, Touchable } from '../components/atoms';
import { HardShadow } from '../components/panel';
import { ThermalScreen } from '../components/thermal-screen';
import { CONSTITUTION, type ConstitutionArticle } from '../lib/constitution';
import { DURATION, fadeOut, layoutTransition, TIMING } from '../motion';
import { THERMAL_COLORS, TYPE } from '../theme';

/**
 * RULEBOOK — the constitution as an accordion. Opening an article marks it
 * read; the segmented progress bar remembers what you've read.
 */
export function RulebookScreen() {
  const router = useRouter();
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(['01']));
  const [readSet, setReadSet] = useState<Set<string>>(() => loadReadSet());

  useEffect(() => {
    StorageService.setString(READ_KEY, JSON.stringify(Array.from(readSet)));
  }, [readSet]);

  function toggle(article: ConstitutionArticle) {
    void Haptics.selectionAsync();
    setOpenSet((previous) => {
      const next = new Set(previous);
      if (next.has(article.number)) next.delete(article.number);
      else next.add(article.number);
      return next;
    });
    setReadSet((previous) => (previous.has(article.number) ? previous : new Set(previous).add(article.number)));
  }

  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <ThermalScreen
      preset="rulebook"
      bottomSpace={48}
      navBar={{ title: 'RULEBOOK', onBack: handleBack, accessory: `READ ${readSet.size} / ${CONSTITUTION.length}` }}
    >
      <Animated.View style={{ gap: 2 }}>
        <Text style={TYPE.display40}>RULEBOOK</Text>
        <Text style={[TYPE.meta18, { color: 'rgba(255,255,255,0.6)' }]}>
          {`Pepper DAO Constitution · ${CONSTITUTION.length} articles · ~6 min`}
        </Text>
      </Animated.View>

      <View style={[styles.row, { gap: 3 }]}>
        {CONSTITUTION.map((article) => (
          <ProgressCell key={article.number} isRead={readSet.has(article.number)} />
        ))}
      </View>

      {CONSTITUTION.map((article, index) => (
        <ArticlePanel
          key={article.number}
          article={article}
          index={index}
          isOpen={openSet.has(article.number)}
          onToggle={() => toggle(article)}
        />
      ))}

      <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.4)', textAlign: 'center' }]}>LONG LIVE THE PEPPER PEOPLE</Text>
    </ThermalScreen>
  );
}

function ProgressCell({ isRead }: { isRead: boolean }) {
  const fill = useSharedValue(isRead ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(isRead ? 1 : 0, { duration: DURATION.reveal });
  }, [fill, isRead]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  return (
    <View style={styles.progressCell}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: THERMAL_COLORS.gold, transformOrigin: 'left' }, animatedStyle]} />
    </View>
  );
}

interface ArticlePanelProps {
  article: ConstitutionArticle;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

function ArticlePanel({ article, index, isOpen, onToggle }: ArticlePanelProps) {
  const rotation = useSharedValue(isOpen ? 1 : 0);
  const accent = article.locked ? THERMAL_COLORS.red : THERMAL_COLORS.gold;

  useEffect(() => {
    rotation.value = withTiming(isOpen ? 1 : 0, TIMING.enter);
  }, [isOpen, rotation]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value * 180}deg` }] }));

  return (
    <Animated.View layout={layoutTransition()}>
      <HardShadow />
      <View
        style={[
          styles.panel,
          { borderColor: article.locked ? THERMAL_COLORS.red : THERMAL_COLORS.border },
        ]}
      >
        <Touchable onPress={onToggle} pressedOpacity={0.75} style={styles.header}>
          <Text
            style={[
              TYPE.meta26,
              { color: article.locked ? THERMAL_COLORS.red : isOpen ? THERMAL_COLORS.gold : 'rgba(255,255,255,0.4)' },
            ]}
          >
            {article.number}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={[styles.row, { gap: 8 }]}>
              <Text style={TYPE.label12}>{article.title}</Text>
              {article.locked ? <Tag label="LOCKED" color={THERMAL_COLORS.red} textColor={THERMAL_COLORS.white} /> : null}
            </View>
            <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.6)' }]}>{article.summary}</Text>
          </View>
          <Animated.Text style={[TYPE.display24, { color: isOpen ? accent : 'rgba(255,255,255,0.6)' }, iconStyle]}>
            {isOpen ? '-' : '+'}
          </Animated.Text>
        </Touchable>

        {article.tracks ? <TrackChips /> : null}

        {isOpen ? (
          <Animated.View exiting={fadeOut()} style={{ gap: 12 }}>
            {article.body ? <Text style={[TYPE.body14, { color: 'rgba(255,255,255,0.85)' }]}>{article.body}</Text> : null}
            {article.points?.map((point, pointIndex) => (
              <Animated.View
                key={point.label}
               
                style={{ gap: 2 }}
              >
                <Text style={[TYPE.label10, { color: accent }]}>{point.label}</Text>
                <Text style={TYPE.body13}>{point.text}</Text>
              </Animated.View>
            ))}
            {article.quote ? (
              <View style={[styles.quote, { borderLeftColor: accent }]}>
                <Text style={TYPE.body13}>{article.quote}</Text>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function TrackChips() {
  return (
    <View style={[styles.row, { gap: 8 }]}>
      {TRACKS.map((track) => (
        <View key={track.label} style={[styles.track, { backgroundColor: track.color }]}>
          <Text style={[TYPE.label10, { color: track.text }]}>{track.label}</Text>
          <Text style={[TYPE.meta16, { color: track.text }]}>{track.value}</Text>
        </View>
      ))}
    </View>
  );
}

function loadReadSet(): Set<string> {
  try {
    const stored = StorageService.getString(READ_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    const list = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    return new Set(['01', ...list]);
  } catch {
    return new Set(['01']);
  }
}

const READ_KEY = 'thermal:rulebook_read';

const TRACKS = [
  { label: 'STANDARD', value: '7 DAYS', color: THERMAL_COLORS.violet, text: THERMAL_COLORS.white },
  { label: 'AGILE', value: '3 DAYS', color: THERMAL_COLORS.orange, text: THERMAL_COLORS.void },
  { label: 'FAST', value: '48H · 66%', color: THERMAL_COLORS.red, text: THERMAL_COLORS.white },
];

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressCell: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  panel: {
    backgroundColor: THERMAL_COLORS.panel,
    borderWidth: 2,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quote: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  track: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});
