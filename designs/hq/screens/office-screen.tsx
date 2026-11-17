import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { PEPPER_DECIMALS } from '@/config/staking';
import { useUser } from '@/contexts/user-context';
import { useWallet } from '@/contexts/wallet-context';
import { useActivities } from '@/hooks/use-activities';
import { useVePepperVotes } from '@/hooks/use-vepepper';
import { copyToClipboard } from '@/lib/clipboard';
import { RANK_IMAGES } from '@/lib/rank-images';
import { getEventTitle, getNextRank, RANK_LABELS, RANK_REQUIREMENTS } from '@/lib/reputation';
import type { Activity, Profile } from '@/types/user';
import { formatCompact, formatDayMonth, shortenAddress, tokenToNumber } from '@/designs/thermal/lib/format';

import { Card, ListRow, ProgressBar, SectionLabel, StatRow, Touchable } from '../components/atoms';
import { ConnectCard } from '../components/connect-card';
import { HqScreen } from '../components/hq-screen';
import { HQ_IMAGES } from '../lib/floors';
import { HQ_COLORS, TYPE } from '../theme';

/**
 * 2F · YOUR OFFICE — rank, progress to the next rank and what earned your REP.
 */
export function OfficeScreen() {
  const router = useRouter();
  const { profile, isLoading, refreshProfile } = useUser();
  const { isConnected, disconnect } = useWallet();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    await refreshProfile();
    setIsRefreshing(false);
  }

  return (
    <HqScreen
      header={{ floor: '2F', title: 'YOUR OFFICE' }}
      banner={HQ_IMAGES.offices}
      refreshing={isRefreshing}
      onRefresh={() => void handleRefresh()}
    >
      {isLoading && !profile ? <ActivityIndicator color={HQ_COLORS.green} style={{ paddingVertical: 32 }} /> : null}

      {!isLoading && (!profile || !isConnected) ? (
        <ConnectCard title="Your desk is empty" message="Connect a wallet to get a rank, earn REP and keep a record of your votes." />
      ) : null}

      {profile && isConnected ? (
        <>
          <Identity profile={profile} />
          <NextRank profile={profile} />
          <OfficeStats profile={profile} />
          <History profile={profile} />
        </>
      ) : null}

      <View>
        <ListRow title="Rulebook" subtitle="Constitution, voting tracks & red lines" right="→" rightColor={HQ_COLORS.green} onPress={() => router.push('/rulebook')} isLast={!isConnected} />
        {isConnected ? (
          <ListRow title="Disconnect wallet" titleColor={HQ_COLORS.red} onPress={() => void disconnect()} isLast />
        ) : null}
      </View>
    </HqScreen>
  );
}

function Identity({ profile }: { profile: Profile }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!profile.wallet_address) return;
    await copyToClipboard(profile.wallet_address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <View style={styles.identity}>
      <Image source={RANK_IMAGES[profile.rank] as number} style={styles.badge} contentFit="contain" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={TYPE.display32}>{RANK_LABELS[profile.rank].toUpperCase()}</Text>
        <Touchable onPress={() => void handleCopy()} hitSlop={6}>
          <Text style={TYPE.body13}>{copied ? 'Address copied' : shortenAddress(profile.wallet_address)}</Text>
        </Touchable>
        <Text style={[TYPE.display22, { color: HQ_COLORS.green }]}>{`${profile.reputation_points} REP`}</Text>
      </View>
    </View>
  );
}

function NextRank({ profile }: { profile: Profile }) {
  const next = getNextRank(profile.rank);

  if (!next) {
    return (
      <Card>
        <Text style={TYPE.label}>TOP RANK</Text>
        <Text style={TYPE.title17}>You run the building. Keep voting to stay on top.</Text>
      </Card>
    );
  }

  const from = RANK_REQUIREMENTS[profile.rank].points;
  const target = RANK_REQUIREMENTS[next].points;
  const progress = target > from ? (profile.reputation_points - from) / (target - from) : 1;

  return (
    <Animated.View>
      <Card>
        <View style={styles.between}>
          <Text style={TYPE.label}>NEXT RANK</Text>
          <Text style={TYPE.display20}>{RANK_LABELS[next].toUpperCase()}</Text>
        </View>
        <ProgressBar progress={progress} color={HQ_COLORS.green} height={8} />
        <Text style={TYPE.body12}>{getRequirementHint(profile, next)}</Text>
      </Card>
    </Animated.View>
  );
}

function OfficeStats({ profile }: { profile: Profile }) {
  const { data: votes } = useVePepperVotes();

  return (
    <StatRow
      stats={[
        { label: 'STREAK', value: `${profile.current_streak_weeks} WK` },
        { label: 'BEST', value: `${profile.longest_streak_weeks} WK` },
        { label: 'POWER', value: votes === undefined ? '–' : formatCompact(tokenToNumber(votes, PEPPER_DECIMALS)), unit: 'vePEPPER' },
      ]}
    />
  );
}

function History({ profile }: { profile: Profile }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { records, isLoading } = useActivities({ profileId: profile.id, limit: 20 });
  const visible = isExpanded ? records : records.slice(0, 4);

  return (
    <View>
      <SectionLabel
        label="RECENT ACTIVITY"
        right={records.length > 4 ? (isExpanded ? 'SHOW LESS' : `SEE ALL ${records.length} →`) : undefined}
        rightColor={HQ_COLORS.green}
        onRightPress={() => setIsExpanded((value) => !value)}
      />
      {isLoading && records.length === 0 ? <ActivityIndicator color={HQ_COLORS.green} style={{ paddingVertical: 16 }} /> : null}
      {!isLoading && records.length === 0 ? (
        <Text style={[TYPE.body13, { paddingVertical: 12 }]}>Nothing yet — cast your first vote in the Ministers Hall.</Text>
      ) : null}
      {visible.map((activity, index) => (
        <ListRow
          key={activity.id}
          title={getEventTitle(activity)}
          subtitle={formatDayMonth(activity.created_at)}
          right={formatActivityPoints(activity)}
          rightColor={activity.points < 0 ? HQ_COLORS.red : HQ_COLORS.green}
          isLast={index === visible.length - 1}
        />
      ))}
    </View>
  );
}

function getRequirementHint(profile: Profile, next: keyof typeof RANK_REQUIREMENTS): string {
  const requirement = RANK_REQUIREMENTS[next];
  const parts = [`${profile.reputation_points} / ${requirement.points} REP`];

  if (requirement.requiresVote && !profile.has_voted) parts.push('cast a vote');
  if (requirement.requiresStreak > profile.current_streak_weeks) parts.push(`${requirement.requiresStreak}-week streak`);
  if (requirement.requiresEngagedProposal && !profile.has_engaged_proposal) parts.push('engage with a proposal');
  if (requirement.requiresPassedProposal && !profile.has_passed_proposal) parts.push('pass a proposal');

  return parts.join(' · ');
}

function formatActivityPoints(activity: Activity): string {
  if (activity.event_type === 'RANK_UP') return 'RANK UP';
  if (activity.points === 0) return '';
  return `${activity.points > 0 ? '+' : ''}${activity.points} REP`;
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  badge: {
    width: 76,
    height: 76,
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
