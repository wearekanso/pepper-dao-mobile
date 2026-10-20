import { Image } from 'expo-image';
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

import { DashedDivider, SectionLabel, Tag, Touchable } from '../components/atoms';
import { HardShadow, Panel } from '../components/panel';
import { ThermalScreen } from '../components/thermal-screen';
import { CONSTITUTION, type ConstitutionArticle, GLANCE_FACTS, VOTING_TRACKS } from '../lib/constitution';
import { fadeOut, layoutTransition, TIMING } from '../motion';
import { INK, SIZE, THERMAL_COLORS, TYPE } from '../theme';

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
      <View style={{ gap: 6 }}>
        <Text style={TYPE.display32}>RULEBOOK</Text>
        <Text style={[TYPE.meta18, { color: INK.muted }]}>
          {`Pepper DAO Constitution · ${CONSTITUTION.length} articles · ~6 min read`}
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <SectionLabel label="AT A GLANCE" />
        <View style={{ gap: 12 }}>
          {[GLANCE_FACTS.slice(0, 2), GLANCE_FACTS.slice(2, 4)].map((pair, rowIndex) => (
            <View key={rowIndex} style={[styles.row, { gap: 12, alignItems: 'stretch' }]}>
              {pair.map((fact) => (
                <Panel key={fact.label} gap={4} style={{ flex: 1 }}>
                  <View style={[styles.row, { gap: 8 }]}>
                    <Image source={GLANCE_ICONS[fact.icon]} style={{ width: 26, height: 26 }} contentFit="contain" />
                    <Text style={[TYPE.label12, { color: INK.muted }]}>{fact.label}</Text>
                  </View>
                  <Text style={TYPE.display32}>{fact.value}</Text>
                  <Text style={[TYPE.meta18, { color: INK.muted }]}>{fact.hint}</Text>
                </Panel>
              ))}
            </View>
          ))}
        </View>
        <Panel gap={10}>
          <Text style={[TYPE.label12, { color: INK.muted }]}>VOTING TRACKS</Text>
          <TrackList />
        </Panel>
      </View>

      <View style={{ gap: 10 }}>
        <SectionLabel label="ARTICLES" />
        {CONSTITUTION.map((article, index) => (
          <ArticlePanel
            key={article.number}
            article={article}
            index={index}
            isOpen={openSet.has(article.number)}
            onToggle={() => toggle(article)}
          />
        ))}
      </View>

      <Text style={[TYPE.label12, { color: INK.faint }]}>LONG LIVE THE PEPPER PEOPLE</Text>
    </ThermalScreen>
  );
}

interface ArticlePanelProps {
  article: ConstitutionArticle;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}

function ArticlePanel({ article, isOpen, onToggle }: ArticlePanelProps) {
  const rotation = useSharedValue(isOpen ? 1 : 0);
  const accent = article.locked ? THERMAL_COLORS.red : THERMAL_COLORS.gold;

  useEffect(() => {
    rotation.value = withTiming(isOpen ? 1 : 0, TIMING.enter);
  }, [isOpen, rotation]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value * 180}deg` }] }));

  return (
    <Animated.View layout={layoutTransition()}>
      <HardShadow />
      <View style={[styles.panel, { borderColor: isOpen ? accent : THERMAL_COLORS.border }]}>
        <Touchable onPress={onToggle} pressedOpacity={0.75} style={styles.header}>
          <Text style={[TYPE.display24, { color: article.locked ? THERMAL_COLORS.red : isOpen ? THERMAL_COLORS.gold : INK.faint }]}>
            {article.number}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={[styles.row, { gap: 8 }]}>
              <Text style={TYPE.label12}>{article.title}</Text>
              {article.locked ? (
                <Tag label="PERMANENT" color={THERMAL_COLORS.red} textColor={THERMAL_COLORS.red} variant="outline" />
              ) : null}
            </View>
            <Text style={[TYPE.meta18, { color: INK.muted }]}>{article.summary}</Text>
          </View>
          <Animated.View style={iconStyle}>
            <PixelToggle isOpen={isOpen} color={isOpen ? accent : THERMAL_COLORS.white} />
          </Animated.View>
        </Touchable>

        {isOpen ? (
          <Animated.View exiting={fadeOut()} style={{ gap: 12 }}>
            {article.body ? <Text style={TYPE.body14}>{article.body}</Text> : null}
            {article.tracks ? <TrackList /> : null}
            {article.points?.map((point) => (
              <View key={point.label} style={{ gap: 2 }}>
                <Text style={[TYPE.label12, { color: accent }]}>{point.label}</Text>
                <Text style={[TYPE.body14, { color: INK.muted }]}>{point.text}</Text>
              </View>
            ))}
            {article.quote ? (
              <View style={[styles.quote, { borderLeftColor: accent }]}>
                <Text style={[TYPE.body14, { color: INK.muted }]}>{article.quote}</Text>
              </View>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
    </Animated.View>
  );
}

/** 12pt pixel "+" / "−" drawn from blocks so it stays on the pixel grid */
function PixelToggle({ isOpen, color }: { isOpen: boolean; color: string }) {
  return (
    <View style={styles.toggle}>
      <View style={[styles.toggleBar, { backgroundColor: color }]} />
      {isOpen ? null : <View style={[styles.toggleBar, styles.toggleBarVertical, { backgroundColor: color }]} />}
    </View>
  );
}

/** STANDARD / AGILE / FAST rows: colour dot, use, and how long the vote runs */
function TrackList() {
  return (
    <View style={{ gap: 10 }}>
      {VOTING_TRACKS.map((track, index) => (
        <View key={track.label} style={{ gap: 10 }}>
          {index > 0 ? <DashedDivider /> : null}
          <View style={[styles.row, { gap: 12, alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={[styles.row, { gap: 8 }]}>
                <View style={[styles.dot, { backgroundColor: THERMAL_COLORS[track.tone] }]} />
                <Text style={TYPE.label12}>{track.label}</Text>
              </View>
              <Text style={[TYPE.meta18, { color: INK.muted }]}>{track.hint}</Text>
            </View>
            <Text style={[TYPE.meta18, { color: THERMAL_COLORS.gold }]}>{track.duration}</Text>
          </View>
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

const GLANCE_ICONS: Record<(typeof GLANCE_FACTS)[number]['icon'], number> = {
  vault: require('@/assets/images/pepper/vault.png'),
  logo: require('@/assets/images/pepper/logo.png'),
  supply: require('@/assets/images/pepper/total-supply.png'),
  burn: require('@/assets/images/pepper/burn.png'),
};

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
  panel: {
    backgroundColor: THERMAL_COLORS.void,
    borderWidth: SIZE.stroke,
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
    borderLeftWidth: SIZE.stroke,
    paddingLeft: 12,
  },
  dot: {
    width: 8,
    height: 8,
  },
  toggle: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBar: {
    position: 'absolute',
    width: 12,
    height: 2,
  },
  toggleBarVertical: {
    width: 2,
    height: 12,
  },
});
