import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PROPOSAL_CREATION_ENABLED } from '@/config/features';
import { useGovernanceProposals } from '@/hooks/use-governance';
import type { GovernanceProposal, GovernanceStatus } from '@/types/governance';
import { formatAgo, formatCountdown, shortenKey } from '@/designs/thermal/lib/format';
import { getProposalTitle, getVoteSplit, isLiveProposal } from '@/designs/thermal/lib/proposal';

import { Card, ListRow, Notice, SectionLabel, Segmented, SplitBar, Touchable } from '../components/atoms';
import { HqButton } from '../components/hq-button';
import { HqScreen } from '../components/hq-screen';
import { HQ_IMAGES } from '../lib/floors';
import { HQ_COLORS, TYPE } from '../theme';

/**
 * 3F · MINISTERS HALL — open votes as cards, closed votes as a plain list.
 */
export function MinistersHallScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<HallTab>('open');
  const { data, isLoading, isError, isRefetching, refetch } = useGovernanceProposals({});

  const { open, closed } = useMemo(() => {
    const all = data ?? [];
    return { open: all.filter(isLiveProposal), closed: all.filter((proposal) => !isLiveProposal(proposal)) };
  }, [data]);

  function openProposal(proposal: GovernanceProposal) {
    router.push(`/governance/${proposal.id}`);
  }

  const closedPreview = tab === 'open' ? closed.slice(0, 3) : closed;

  return (
    <HqScreen
      header={{
        floor: '3F',
        title: 'MINISTERS HALL',
        right: PROPOSAL_CREATION_ENABLED ? (
          <Touchable onPress={() => router.push('/governance/create')} style={styles.newButton} hitSlop={6}>
            <Text style={TYPE.display20}>+ NEW</Text>
          </Touchable>
        ) : undefined,
      }}
      banner={HQ_IMAGES.ministers}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      <Segmented
        options={[
          { value: 'open', label: `OPEN · ${open.length}` },
          { value: 'closed', label: `CLOSED · ${closed.length}` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {isLoading && !data ? <ActivityIndicator color={HQ_COLORS.green} style={{ paddingVertical: 32 }} /> : null}
      {isError && !data ? <Notice title="COULD NOT LOAD VOTES" message="Pull down to try again." /> : null}

      {tab === 'open' ? (
        <View style={{ gap: 12 }}>
          {data && open.length === 0 ? (
            <Card>
              <Text style={TYPE.title17}>The hall is quiet</Text>
              <Text style={TYPE.body13}>No votes are open right now. New proposals show up here.</Text>
            </Card>
          ) : null}
          {open.map((proposal, index) => (
            <Animated.View key={proposal.id}>
              <OpenProposalCard proposal={proposal} onOpen={() => openProposal(proposal)} />
            </Animated.View>
          ))}
        </View>
      ) : null}

      {closedPreview.length > 0 ? (
        <View>
          {tab === 'open' ? (
            <SectionLabel
              label="RECENTLY CLOSED"
              right="SEE ALL →"
              rightColor={HQ_COLORS.green}
              onRightPress={() => setTab('closed')}
            />
          ) : null}
          {closedPreview.map((proposal, index) => {
            const status = STATUS_LABELS[proposal.status];
            return (
              <ListRow
                key={proposal.id}
                title={getProposalTitle(proposal)}
                subtitle={`${shortenKey(proposal.key)} · ${formatAgo(proposal.endDate).toLowerCase()}`}
                right={status.label}
                rightColor={status.color}
                isLast={index === closedPreview.length - 1}
                onPress={() => openProposal(proposal)}
              />
            );
          })}
        </View>
      ) : null}
    </HqScreen>
  );
}

interface OpenProposalCardProps {
  proposal: GovernanceProposal;
  onOpen: () => void;
}

function OpenProposalCard({ proposal, onOpen }: OpenProposalCardProps) {
  const split = getVoteSplit(proposal);
  const voted = proposal.userVote?.voteOption;
  const hasVoted = Boolean(voted) && voted !== 'NONE';
  const isPending = proposal.status === 'PENDING';
  const canVote = proposal.type === 'PEP' && !isPending;
  const hasVotes = split.yes + split.no > 0;

  return (
    <Card onPress={onOpen} accent={canVote && !hasVoted ? HQ_COLORS.green : undefined}>
      <View style={styles.between}>
        <Text style={TYPE.label}>{shortenKey(proposal.key)}</Text>
        <Text style={TYPE.meta}>
          {isPending ? `Starts in ${formatCountdown(proposal.startDate).toLowerCase()}` : `Ends in ${formatCountdown(proposal.endDate).toLowerCase()}`}
        </Text>
      </View>
      <Text style={TYPE.title17} numberOfLines={2}>
        {getProposalTitle(proposal)}
      </Text>
      <SplitBar yes={split.yes} no={split.no} />
      <View style={styles.between}>
        <Text style={TYPE.body13}>
          {hasVotes ? `Yes ${Math.round(split.yes)}% · No ${Math.round(split.no)}%` : proposal.type === 'PEP' ? 'No votes yet' : 'Ministers approve this one'}
        </Text>
        {hasVoted ? (
          <Text style={[TYPE.display20, { color: HQ_COLORS.green }]}>{`✓ VOTED ${voted}`}</Text>
        ) : canVote ? (
          <HqButton label="VOTE" size="small" onPress={onOpen} />
        ) : null}
      </View>
    </Card>
  );
}

type HallTab = 'open' | 'closed';

const STATUS_LABELS: Record<GovernanceStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'OPEN', color: HQ_COLORS.green },
  PENDING: { label: 'SOON', color: HQ_COLORS.muted },
  SUCCEEDED: { label: 'PASSED', color: HQ_COLORS.green },
  EXECUTED: { label: 'EXECUTED', color: HQ_COLORS.green },
  REJECTED: { label: 'REJECTED', color: HQ_COLORS.red },
};

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  newButton: {
    borderWidth: 1,
    borderColor: HQ_COLORS.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
