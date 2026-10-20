import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useUser } from '@/contexts/user-context';
import { useGovernanceProposals } from '@/hooks/use-governance';
import { usePepperTokenMetrics } from '@/hooks/use-pepper-token-metrics';
import { calculateBurnedFromOriginalSupply, formatPepperAmount } from '@/lib/pepper-metrics';
import { telemetry } from '@/lib/telemetry';

import { BlinkDot, ChevronLink, StatusLabel } from '../components/atoms';
import { CornerBrackets } from '../components/corner-brackets';
import { InfoSheet } from '../components/info-sheet';
import { Panel } from '../components/panel';
import { PixelArt } from '../components/pixel-art';
import { PixelButton } from '../components/pixel-button';
import { LiveProposalPanel } from '../components/proposal-panels';
import { ThermalScreen } from '../components/thermal-screen';
import { TreasurySheet } from '../components/treasury-sheet';
import { WalletChip } from '../components/wallet-chip';
import { useCountUp } from '../hooks/use-count-up';
import { useFocusKey } from '../hooks/use-focus-key';
import { DEMO_PROPOSAL_ID, DEMO_VOTE_ENABLED } from '../lib/demo-vote';
import { formatCompact, formatInteger, tokenToNumber } from '../lib/format';
import { getHeatProgress } from '../lib/heat-levels';
import { isLiveProposal } from '../lib/proposal';
import { THERMAL_COLORS, TYPE } from '../theme';

/**
 * PULSE — the DAO's vital signs: treasury, token readouts, the live vote
 * and shortcuts to your heat and the rulebook.
 */
export function PulseScreen() {
  const router = useRouter();
  const focusKey = useFocusKey();
  const { metrics, isFetching, refetch } = usePepperTokenMetrics();
  const { data: proposals, refetch: refetchProposals } = useGovernanceProposals({});
  const [modal, setModal] = useState<ModalKey | null>(null);

  useEffect(() => {
    telemetry.trackPepperDashboardViewed();
  }, []);

  const decimals = metrics?.decimals ?? 18;
  const treasuryChz = metrics ? tokenToNumber(metrics.treasuryChzBalance, 18) : 0;
  const animatedTreasury = useCountUp(treasuryChz, 1400);
  const delta = metrics?.treasuryChzDelta ?? null;

  const readouts = useMemo<Array<Readout>>(() => {
    const burned = metrics ? Number(calculateBurnedFromOriginalSupply(metrics.totalSupply, decimals)) : null;
    return [
      {
        key: 'supply',
        label: 'SUPPLY',
        icon: ICON_SUPPLY,
        value: metrics ? formatCompact(tokenToNumber(metrics.totalSupply, decimals)) : '–',
        hint: metrics ? formatPepperAmount(metrics.totalSupply, decimals) : 'loading…',
      },
      {
        key: 'burnt',
        label: 'BURNT',
        icon: ICON_BURN,
        value: burned !== null ? formatCompact(burned) : '–',
        hint: 'gone forever',
      },
      {
        key: 'staked',
        label: 'STAKED',
        icon: ICON_VAULT,
        value: metrics?.hasStakedData ? formatCompact(tokenToNumber(metrics.stakedAmount, decimals)) : '–',
        hint: 'locked as vePEPPER',
        modal: 'staked',
      },
      {
        key: 'cex',
        label: 'CEX FUND',
        icon: ICON_CEX,
        value: metrics ? formatCompact(tokenToNumber(metrics.cexFundChzBalance, 18)) : '–',
        hint: 'CHZ · tier-1 listing',
        modal: 'cex',
      },
    ];
  }, [metrics, decimals]);

  const liveProposal = useMemo(() => {
    const live = (proposals ?? []).filter(isLiveProposal);
    return live.find((proposal) => proposal.type === 'PEP') ?? live[0] ?? null;
  }, [proposals]);

  function handleRefresh() {
    refetch();
    void refetchProposals();
  }

  async function handleGetPepper() {
    await openBrowserAsync(FANX_SWAP_URL, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
  }

  return (
    <ThermalScreen preset="pulse" refreshing={isFetching && Boolean(metrics)} onRefresh={handleRefresh}>
      <Animated.View style={styles.between}>
        <View style={styles.row6}>
          <BlinkDot />
          <Text style={TYPE.meta18}>LIVE · TREASURY</Text>
        </View>
        <WalletChip />
      </Animated.View>

      <Pressable onPress={() => setModal('treasury')} onLongPress={() => setModal('treasuryInfo')}>
        <View style={styles.hero}>
          <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>DAO TREASURY · MANAGED BY VOTE</Text>
          <View style={styles.heroValue}>
            <Text style={[TYPE.display72, styles.dropShadow, { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit>
              {metrics ? formatInteger(animatedTreasury) : '––––––'}
            </Text>
            <Text style={[TYPE.label15, styles.dropShadowSmall, { marginBottom: 8 }]}>CHZ</Text>
          </View>
          <Text style={[TYPE.meta20, { color: THERMAL_COLORS.gold }]}>{formatDelta(delta)}</Text>
          <CornerBrackets size={16} focusKey={focusKey} />
        </View>
      </Pressable>

      <Animated.View style={[styles.row, { gap: 12 }]}>
        <PixelButton label="GET PEPPER" variant="gold" style={{ flex: 1 }} onPress={() => void handleGetPepper()} />
        <PixelButton label="STAKE & VOTE" variant="outline" style={{ flex: 1 }} onPress={() => router.push('/power')} />
      </Animated.View>

      <View style={{ gap: 12 }}>
        {[readouts.slice(0, 2), readouts.slice(2, 4)].map((pair, rowIndex) => (
          <View key={rowIndex} style={[styles.row, { gap: 12 }]}>
            {pair.map((readout, columnIndex) => (
              <Panel
                key={readout.key}
                index={2 + rowIndex * 2 + columnIndex}
                gap={6}
                style={{ flex: 1 }}
                onPress={readout.modal ? () => setModal(readout.modal!) : undefined}
              >
                <View style={[styles.row, { gap: 8, alignItems: 'center' }]}>
                  <Image source={readout.icon} style={{ width: 26, height: 26 }} contentFit="contain" />
                  <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>{readout.label}</Text>
                </View>
                <Text style={TYPE.display32} numberOfLines={1} adjustsFontSizeToFit>
                  {readout.value}
                </Text>
                <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.6)' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {readout.hint}
                </Text>
              </Panel>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.between}>
        <StatusLabel label="LIVE NOW" />
        <ChevronLink label="ALL PROPOSALS" onPress={() => router.push('/governance')} />
      </View>

      {liveProposal ? (
        <LiveProposalPanel
          proposal={liveProposal}
          variant="compact"
          index={6}
          onOpen={() => router.push(`/governance/${liveProposal.id}`)}
        />
      ) : (
        <Panel index={6}>
          <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>NO SIGNAL</Text>
          <Text style={TYPE.display24}>No live vote right now</Text>
          <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.6)' }]}>The next proposal will heat up here.</Text>
        </Panel>
      )}

      {DEMO_VOTE_ENABLED ? (
        <PixelButton
          label="TRY A TEST VOTE >"
          variant="outline"
          onPress={() => router.push(`/governance/${DEMO_PROPOSAL_ID}`)}
        />
      ) : null}

      <HeatShortcut index={7} onPress={() => router.push('/power')} />

      <Panel index={8} onPress={() => router.push('/rulebook')}>
        <View style={[styles.row, { gap: 12, alignItems: 'center' }]}>
          <PixelArt name="scroll" />
          <View style={{ flex: 1 }}>
            <Text style={TYPE.label12}>RULEBOOK</Text>
            <Text style={[TYPE.meta16, { color: 'rgba(255,255,255,0.6)' }]}>
              {'Constitution, voting tracks & red lines'}
            </Text>
          </View>
          <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
        </View>
      </Panel>

      <TreasurySheet visible={modal === 'treasury'} onClose={() => setModal(null)} address={TREASURY_ADDRESS} />
      <InfoSheet
        visible={modal === 'treasuryInfo'}
        onClose={() => setModal(null)}
        title="DAO TREASURY"
        message="These funds are managed by the PEPPER community through voting. Every penny spent is visible on-chain."
        address={TREASURY_ADDRESS}
      />
      <InfoSheet
        visible={modal === 'staked'}
        onClose={() => setModal(null)}
        title="STAKED PEPPER"
        message="The total amount of PEPPER locked as vePEPPER. Staked PEPPER is what powers governance votes."
        address={STAKING_ADDRESS}
      />
      <InfoSheet
        visible={modal === 'cex'}
        onClose={() => setModal(null)}
        title="CEX FUND"
        message="The CEX Fund will be used to secure a Tier 1 Centralized Exchange listing for PEPPER. If the funds raised are insufficient after 90 days, they will be returned to the PEPPER Treasury to be managed by the community."
        address={CEX_FUND_ADDRESS}
      />
    </ThermalScreen>
  );
}

interface HeatShortcutProps {
  index: number;
  onPress: () => void;
}

function HeatShortcut({ index, onPress }: HeatShortcutProps) {
  const { profile } = useUser();
  const heat = profile ? getHeatProgress(profile) : null;
  const streakWeeks = profile?.current_streak_weeks ?? 0;

  return (
    <Panel index={index} onPress={onPress}>
      <View style={[styles.row, { gap: 12, alignItems: 'center' }]}>
        <PixelArt name="pepperSmall" />
        <View style={{ flex: 1 }}>
          <Text style={[TYPE.label10, { color: 'rgba(255,255,255,0.6)' }]}>YOUR HEAT</Text>
          <Text style={TYPE.meta18} numberOfLines={1}>
            {heat ? `${heat.current.name} · ${formatInteger(heat.shu)} SHU` : 'CONNECT TO HEAT UP'}
          </Text>
        </View>
        {streakWeeks > 0 ? (
          <View style={[styles.row, { gap: 4, alignItems: 'center' }]}>
            <PixelArt name="flameSmall" />
            <Text style={[TYPE.meta18, { color: THERMAL_COLORS.orange }]}>{`${streakWeeks}W`}</Text>
          </View>
        ) : null}
        <Text style={[TYPE.label12, { color: THERMAL_COLORS.gold }]}>{'>'}</Text>
      </View>
    </Panel>
  );
}

function formatDelta(delta: bigint | null): string {
  if (delta === null || delta === BigInt(0)) return 'STEADY TODAY';
  const sign = delta > BigInt(0) ? '+' : '-';
  const absolute = delta > BigInt(0) ? delta : -delta;
  return `${sign}${formatPepperAmount(absolute, 18)} CHZ TODAY`;
}

type ModalKey = 'treasury' | 'treasuryInfo' | 'staked' | 'cex';

interface Readout {
  key: string;
  label: string;
  icon: number;
  value: string;
  hint: string;
  modal?: ModalKey;
}

const ICON_SUPPLY = require('@/assets/images/pepper/total-supply.png');
const ICON_BURN = require('@/assets/images/pepper/burn.png');
const ICON_VAULT = require('@/assets/images/pepper/vault.png');
const ICON_CEX = require('@/assets/images/pepper/cex-fund.png');

const FANX_SWAP_URL = 'https://app.fanx.xyz/trade/swap';
const TREASURY_ADDRESS = '0x1d70027242A82362fd2c818bb2A3a2cAaA513816';
const STAKING_ADDRESS = '0x5cA4C88339D89B2547a001003Cca84F62F557A72';
const CEX_FUND_ADDRESS = '0x0ECAB88E26f7eA29D0DcB4aBcF060A5Ae09a1C2B';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  row6: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hero: {
    paddingHorizontal: 14,
    paddingVertical: 18,
    gap: 6,
  },
  heroValue: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  dropShadow: {
    textShadowColor: '#000000',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 0.1,
  },
  dropShadowSmall: {
    textShadowColor: '#000000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0.1,
  },
});
