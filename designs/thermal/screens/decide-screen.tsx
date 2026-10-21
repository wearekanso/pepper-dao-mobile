import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useGovernanceProposals } from '@/hooks/use-governance';
import type { GovernanceProposal } from '@/types/governance';

import { ChevronLink, FilterChip, LiveMarker, SectionLabel } from '../components/atoms';
import { PixelButton } from '../components/pixel-button';
import { EndedList, LiveProposalPanel } from '../components/proposal-panels';
import { EmptyCard, ErrorCard, SkeletonCard } from '../components/state-cards';
import { TabHeader } from '../components/tab-header';
import { ThermalScreen } from '../components/thermal-screen';
import { isLiveProposal } from '../lib/proposal';
import { layoutTransition } from '../motion';

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
        <View style={{ gap: 12 }}>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </View>
      ) : null}

      {isError && !data ? (
        <ErrorCard
          message="We couldn't reach the Chiliz network to load proposals. Your data is safe — try again in a moment."
          onRetry={() => void refetch()}
          explorerUrl={EXPLORER_URL}
        />
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
        <EmptyCard
          title={EMPTY_COPY[filter].title}
          message={EMPTY_COPY[filter].message}
          actionLabel={filter === 'ALL' ? undefined : 'SHOW ALL PROPOSALS'}
          onAction={() => setFilter('ALL')}
        />
      ) : null}
    </ThermalScreen>
  );
}

const FILTERS = ['ALL', 'COMMUNITY', 'COUNCIL'] as const;
type FilterKey = (typeof FILTERS)[number];

const EMPTY_COPY: Record<FilterKey, { title: string; message: string }> = {
  ALL: { title: 'No proposals yet', message: 'The first proposal will heat up here. Anyone with enough vePEPPER can start one.' },
  COMMUNITY: {
    title: 'No community votes',
    message: 'Community votes show up here once ministers approve a proposal. Council decisions are under COUNCIL.',
  },
  COUNCIL: {
    title: 'No council decisions',
    message: 'Council decisions show up here when ministers make admin changes. Community votes are under ALL or COMMUNITY.',
  },
};

const EXPLORER_URL = 'https://chiliscan.com';

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
});
