import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useGovernanceProposals } from '@/hooks/use-governance';
import type { GovernanceProposal } from '@/types/governance';

import { ChevronLink, FilterChip, StatusLabel } from '../components/atoms';
import { Panel } from '../components/panel';
import { PixelButton } from '../components/pixel-button';
import { EndedList, LiveProposalPanel } from '../components/proposal-panels';
import { ThermalScreen } from '../components/thermal-screen';
import { WalletChip } from '../components/wallet-chip';
import { isLiveProposal } from '../lib/proposal';
import { layoutTransition } from '../motion';
import { THERMAL_COLORS, TYPE } from '../theme';

/**
 * DECIDE — every Aragon proposal: live votes up top, the ended log below.
 */
export function DecideScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const { data, isLoading, isError, isRefetching, refetch } = useGovernanceProposals({});

  const { live, ended, liveCount, endedCount } = useMemo(() => {
    const all = data ?? [];
    const filtered = all.filter((proposal) => filter === 'ALL' || proposal.type === filter);
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
      <Animated.View style={styles.between}>
        <Text style={TYPE.display40}>PROPOSALS</Text>
        <WalletChip />
      </Animated.View>

      <View style={styles.between}>
        <Text style={[TYPE.meta18, { color: 'rgba(255,255,255,0.6)' }]}>
          {data ? `${liveCount} LIVE · ${endedCount} ENDED · VIA ARAGON` : 'SYNCING WITH ARAGON…'}
        </Text>
        <PixelButton
          label="+ NEW"
          variant="outlineGold"
          paddingVertical={8}
          style={{ alignSelf: 'auto' }}
          onPress={() => router.push('/governance/create')}
        />
      </View>

      <View style={[styles.row, { gap: 8 }]}>
        {FILTERS.map((item) => (
          <FilterChip
            key={item}
            label={item}
            isActive={filter === item}
            onPress={() => setFilter(item)}
          />
        ))}
        <View style={{ flex: 1 }} />
        <ChevronLink label="RULEBOOK" onPress={() => router.push('/rulebook')} />
      </View>

      {isLoading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={THERMAL_COLORS.gold} />
          <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>SCANNING PROPOSALS…</Text>
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
        <Animated.View layout={layoutTransition()} style={{ gap: 18 }}>
          <StatusLabel label="LIVE" />
          {live.map((proposal, index) => (
            <LiveProposalPanel
              key={`${filter}-${proposal.id}`}
              proposal={proposal}
              variant="full"
              index={index}
              onOpen={() => openProposal(proposal)}
            />
          ))}
        </Animated.View>
      ) : null}

      {ended.length > 0 ? (
        <Animated.View layout={layoutTransition()} style={{ gap: 18 }}>
          <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>ENDED</Text>
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

const FILTERS = ['ALL', 'ADMIN', 'PEP'] as const;
type FilterKey = (typeof FILTERS)[number];

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
