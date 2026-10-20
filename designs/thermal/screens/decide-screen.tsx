import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useGovernanceProposals } from '@/hooks/use-governance';
import type { GovernanceProposal } from '@/types/governance';

import { ChevronLink, FilterChip, LiveMarker, SectionLabel } from '../components/atoms';
import { Panel } from '../components/panel';
import { PixelButton } from '../components/pixel-button';
import { EndedList, LiveProposalPanel } from '../components/proposal-panels';
import { TabHeader } from '../components/tab-header';
import { ThermalScreen } from '../components/thermal-screen';
import { isLiveProposal } from '../lib/proposal';
import { layoutTransition } from '../motion';
import { INK, THERMAL_COLORS, TYPE } from '../theme';

/**
 * DECIDE — every Aragon proposal: live votes up top, the ended log below.
 */
export function DecideScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const { data, isLoading, isError, isRefetching, refetch } = useGovernanceProposals({});

  const { live, ended, liveCount, endedCount } = useMemo(() => {
    const all = data ?? [];
    const filtered = all.filter((proposal) => FILTER_TYPES[filter].includes(proposal.type));
    return {
      live: filtered.filter(isLiveProposal),
      ended: filtered.filter((proposal) => !isLiveProposal(proposal)),
      liveCount: all.filter(isLiveProposal).length,
      endedCount: all.filter((proposal) => !isLiveProposal(proposal)).length,
    };
  }, [data, filter]);

  function openProposal(proposal: GovernanceProposal) {
    router.push(`/governance/${proposal.id}`);
  }

  return (
    <ThermalScreen preset="decide" refreshing={isRefetching} onRefresh={() => void refetch()}>
      <TabHeader
        title="DECIDE"
        subtitle={data ? `${liveCount} LIVE · ${endedCount} ENDED` : 'SYNCING WITH ARAGON…'}
        subtitleAccessory={<ChevronLink label="RULEBOOK" onPress={() => router.push('/rulebook')} />}
      />

      <View style={[styles.row, { gap: 8 }]}>
        {FILTERS.map((item) => (
          <FilterChip key={item} label={item} isActive={filter === item} onPress={() => setFilter(item)} />
        ))}
        <View style={{ flex: 1 }} />
        <PixelButton
          label="+ NEW"
          variant="outlineGold"
          size="small"
          style={{ alignSelf: 'auto' }}
          onPress={() => router.push('/governance/create')}
        />
      </View>

      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={THERMAL_COLORS.gold} />
          <Text style={[TYPE.label12, { color: INK.muted }]}>SCANNING PROPOSALS…</Text>
        </View>
      ) : null}

      {isError && !data ? (
        <Panel borderColor={THERMAL_COLORS.red}>
          <Text style={TYPE.display24}>Signal lost</Text>
          <Text style={TYPE.body13}>Unable to load governance proposals.</Text>
          <PixelButton label="RETRY" onPress={() => void refetch()} />
        </Panel>
      ) : null}

      {live.length > 0 ? (
        <Animated.View layout={layoutTransition()} style={{ gap: 8 }}>
          <LiveMarker />
          {live.map((proposal, index) => (
            <LiveProposalPanel
              key={`${filter}-${proposal.id}`}
              proposal={proposal}
              index={index}
              onOpen={() => openProposal(proposal)}
            />
          ))}
        </Animated.View>
      ) : null}

      {ended.length > 0 ? (
        <Animated.View layout={layoutTransition()} style={{ gap: 10 }}>
          <SectionLabel label="ENDED" />
          <EndedList key={filter} proposals={ended} index={live.length + 1} onOpen={openProposal} />
        </Animated.View>
      ) : null}

      {data && live.length === 0 && ended.length === 0 ? (
        <Panel>
          <Text style={TYPE.display24}>Cold zone</Text>
          <Text style={TYPE.body13}>No proposals match this filter yet.</Text>
        </Panel>
      ) : null}
    </ThermalScreen>
  );
}

const FILTERS = ['ALL', 'COMMUNITY', 'COUNCIL'] as const;
type FilterKey = (typeof FILTERS)[number];

const FILTER_TYPES: Record<FilterKey, Array<GovernanceProposal['type']>> = {
  ALL: ['PEP', 'ADMIN', 'MULTISIG', 'OTHER'],
  COMMUNITY: ['PEP'],
  COUNCIL: ['ADMIN', 'MULTISIG'],
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
    gap: 8,
  },
  center: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 32,
  },
});
