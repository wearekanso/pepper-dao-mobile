import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, type ImageSource } from 'expo-image';
import { useRouter } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { TreasuryTransactionsModal } from '@/components/home/treasury-transactions-modal';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PixelAlertModal } from '@/components/ui/pixel-alert-modal';
import {
  BUYBACK_WALLET_ADDRESS,
  MAIN_DAO_TREASURY_ADDRESS,
  PEPPER_STAKING_CONTRACT_ADDRESS,
  PEPPER_TREASURY_WALLET_ADDRESS,
  PepperTokenMetrics,
} from '@/config/pepper-token';
import { DANGER_RED, FOREST_GREEN, SUCCESS_GREEN } from '@/constants/theme';
import { usePepperTokenMetrics } from '@/hooks/use-pepper-token-metrics';
import {
  calculateBurnedFromOriginalSupply,
  formatPepperAmount,
  formatTreasuryChzDelta,
} from '@/lib/pepper-metrics';
import { telemetry } from '@/lib/telemetry';

const ICON_TOTAL_SUPPLY = require('@/assets/images/pepper/total-supply.png');
const ICON_TREASURY = require('@/assets/images/pepper/treasury.png');
const ICON_VAULT = require('@/assets/images/pepper/vault.png');
const ICON_BURN = require('@/assets/images/pepper/burn.png');
const ICON_PEPPER_TREASURY = require('@/assets/images/pepper/treasury.png');
const ICON_BUYBACK = require('@/assets/images/pepper/pepper.png');

const FANX_SWAP_URL = 'https://app.fanx.xyz/trade/swap';

interface PepperDashboardProps {
  showHeader?: boolean;
}

export function PepperDashboard({ showHeader = true }: PepperDashboardProps) {
  const router = useRouter();
  const { metrics, isError, isFetching, lastUpdated } =
    usePepperTokenMetrics();

  const [isTreasuryModalVisible, setIsTreasuryModalVisible] =
    useState<boolean>(false);
  const [isTreasuryInfoVisible, setIsTreasuryInfoVisible] =
    useState<boolean>(false);
  const [isStakedInfoVisible, setIsStakedInfoVisible] =
    useState<boolean>(false);
  const [isPepperTreasuryInfoVisible, setIsPepperTreasuryInfoVisible] =
    useState<boolean>(false);
  const [isBuybackInfoVisible, setIsBuybackInfoVisible] =
    useState<boolean>(false);

  const decimals = metrics?.decimals ?? 18;

  useEffect(() => {
    telemetry.trackPepperDashboardViewed();
  }, []);

  async function handleGetPepper() {
    await openBrowserAsync(FANX_SWAP_URL, {
      presentationStyle: WebBrowserPresentationStyle.AUTOMATIC,
    });
  }

  function handleStakeAndVote() {
    router.push('/power');
  }

  return (
    <ScrollView className="flex-1 w-full pt-16" contentContainerClassName="pb-8" showsVerticalScrollIndicator={false}>
      <Card
        elevation="lg"
        className="w-full border-4 border-white p-6"
        style={{ backgroundColor: FOREST_GREEN }}
      >
        {showHeader ? (
          <View className="mb-6 items-center">
            {/* <Image
              source={ICON_LOGO}
              style={{ width: 72, height: 72, marginBottom: 12 }}
              contentFit="contain"
            /> */}
            <ThemedText
              type="display"
              lightColor="#FFFFFF"
              className="text-center font-bold"
            >
              $PEPPER IS FOR THE PEOPLE
            </ThemedText>


            <View className="mt-4 flex-row gap-3">
              <Button
                variant="primary"
                onPress={handleGetPepper}
                className="flex-1"
              >
                GET PEPPER
              </Button>
              <Button
                variant="secondary"
                onPress={handleStakeAndVote}
                className="flex-1"
              >
                STAKE & VOTE
              </Button>
            </View>
          </View>
        ) : null}

        <View className="mt-2">
          <MetricsGrid
            decimals={decimals}
            isError={isError}
            isFetching={isFetching}
            lastUpdated={lastUpdated}
            metrics={metrics ?? null}
            onPressTreasury={() => {
              setIsTreasuryModalVisible(true);
            }}
            onTreasuryInfoPress={() => {
              setIsTreasuryInfoVisible(true);
            }}
            onStakedInfoPress={() => {
              setIsStakedInfoVisible(true);
            }}
            onPepperTreasuryInfoPress={() => {
              setIsPepperTreasuryInfoVisible(true);
            }}
            onBuybackInfoPress={() => {
              setIsBuybackInfoVisible(true);
            }}
          />
        </View>
      </Card>

      <TreasuryTransactionsModal
        visible={isTreasuryModalVisible}
        onClose={() => {
          setIsTreasuryModalVisible(false);
        }}
      />

      <PixelAlertModal
        visible={isTreasuryInfoVisible}
        onClose={() => setIsTreasuryInfoVisible(false)}
        title="Treasury"
        message="These funds are managed by the PEPPER community through voting."
        copyableAddress={MAIN_DAO_TREASURY_ADDRESS}
        type="info"
      />

      <PixelAlertModal
        visible={isStakedInfoVisible}
        onClose={() => setIsStakedInfoVisible(false)}
        title="Staked Pepper"
        message="This is the total amount of staked PEPPER."
        copyableAddress={PEPPER_STAKING_CONTRACT_ADDRESS}
        type="info"
      />

      <PixelAlertModal
        visible={isPepperTreasuryInfoVisible}
        onClose={() => setIsPepperTreasuryInfoVisible(false)}
        title="Pepper Treasury"
        message="The Pepper Treasury wallet holds the funds shown on peppercoin.com. Every move is visible on-chain."
        copyableAddress={PEPPER_TREASURY_WALLET_ADDRESS}
        type="info"
      />

      <PixelAlertModal
        visible={isBuybackInfoVisible}
        onClose={() => setIsBuybackInfoVisible(false)}
        title="Daily Buyback"
        message="CHZ set aside for the daily PEPPER buyback. This wallet buys PEPPER from the market every day."
        copyableAddress={BUYBACK_WALLET_ADDRESS}
        type="info"
      />
    </ScrollView>
  );
}

interface MetricsGridProps {
  metrics: PepperTokenMetricsOrNull;
  decimals: number;
  isError: boolean;
  isFetching: boolean;
  lastUpdated: string | null;
  onPressTreasury: () => void;
  onTreasuryInfoPress: () => void;
  onStakedInfoPress: () => void;
  onPepperTreasuryInfoPress: () => void;
  onBuybackInfoPress: () => void;
}

function MetricsGrid({
  metrics,
  decimals,
  isError,
  isFetching,
  lastUpdated,
  onPressTreasury,
  onTreasuryInfoPress,
  onStakedInfoPress,
  onPepperTreasuryInfoPress,
  onBuybackInfoPress,
}: MetricsGridProps) {
  const hasData = metrics !== null;

  return (
    <View>
      <View className="mb-4 flex-row items-start justify-between">
        <View>
          <ThemedText
            type="subtitle"
            lightColor="#FFFFFF"
            className="font-bold"
          >
            Treasury Snapshot
          </ThemedText>
          {/* <ThemedText
            type="caption"
            lightColor="#E5FFF4"
            className="text-xs"
          >
            {lastUpdated
              ? `Last updated ${formatTimeSince(lastUpdated)} ago`
              : 'Waiting for first snapshot...'}
          </ThemedText> */}
        </View>

        {/* Small pulse indicator when background refresh is running */}
        {isFetching ? (
          <View className="h-3 w-3 rounded-full bg-mint" />
        ) : null}
      </View>

      <View className="flex-col gap-4">
        <MetricTile
          label="Pepper Supply"
          value={hasData ? formatPepperAmount(metrics.totalSupply, decimals) : '–'}
          icon={ICON_TOTAL_SUPPLY}
        />
        <MetricTile
          label="Treasury (CHZ)"
          value={
            hasData
              ? `${formatPepperAmount(metrics.treasuryChzBalance, 18)} CHZ`
              : '–'
          }
          subtitle={
            hasData && metrics.treasuryChzDelta !== null
              ? formatTreasuryChzDelta(metrics.treasuryChzDelta)
              : null
          }
          subtitleColor={
            hasData && metrics.treasuryChzDelta !== null
              ? metrics.treasuryChzDelta > BigInt(0)
                ? SUCCESS_GREEN
                : metrics.treasuryChzDelta < BigInt(0)
                  ? DANGER_RED
                  : undefined
              : undefined
          }
          onPress={onPressTreasury}
          onInfoPress={onTreasuryInfoPress}
          icon={ICON_TREASURY}
          goldFlow
        />
        <MetricTile
          label="Staked Pepper"
          value={
            hasData && metrics.hasStakedData
              ? formatPepperAmount(metrics.stakedAmount, decimals)
              : '–'
          }
          onInfoPress={onStakedInfoPress}
          icon={ICON_VAULT}
        />
        <MetricTile
          label="Pepper Treasury"
          value={
            hasData
              ? `${formatPepperAmount(metrics.pepperTreasuryChzBalance, 18)} CHZ`
              : '–'
          }
          onInfoPress={onPepperTreasuryInfoPress}
          icon={ICON_PEPPER_TREASURY}
        />
        <MetricTile
          label="Daily Buyback"
          value={
            hasData
              ? `${formatPepperAmount(metrics.buybackChzBalance, 18)} CHZ`
              : '–'
          }
          onInfoPress={onBuybackInfoPress}
          icon={ICON_BUYBACK}
        />
        <MetricTile
          label="Burnt Pepper"
          value={
            hasData
              ? formatPepperAmount(
                  calculateBurnedFromOriginalSupply(metrics.totalSupply, decimals),
                  0,
                )
              : '–'
          }
          icon={ICON_BURN}
        />
      </View>

      {isError ? (
        <View className="mt-3">
          <ThemedText
            type="caption"
            lightColor="#FFB3B3"
            className="text-xs"
          >
            Showing latest available data
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

interface MetricTileProps {
  label: string;
  value: string;
  icon: ImageSource;
  subtitle?: string | null;
  subtitleColor?: string;
  onPress?: () => void;
  onInfoPress?: () => void;
  goldFlow?: boolean;
}

const AnimatedRect = Animated.createAnimatedComponent(Rect);

function SnakeBorder() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);

  const perimeter = 2 * (size.width + size.height);
  const segmentLength = perimeter > 0 ? perimeter * 0.4 : 240;
  const gapLength = perimeter > 0 ? perimeter - segmentLength : 520;

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress, perimeter]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: -progress.value * perimeter,
  }));

  return (
    <View
      style={{ position: 'absolute', top: -2, left: -2, right: -2, bottom: -2 }}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ width, height });
      }}
    >
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          <AnimatedRect
            x={2}
            y={2}
            width={size.width - 4}
            height={size.height - 4}
            fill="none"
            stroke="#FFC043"
            strokeWidth={3}
            strokeDasharray={`${segmentLength} ${gapLength}`}
            animatedProps={animatedProps}
          />
        </Svg>
      ) : null}
    </View>
  );
}

function MetricTile({
  label,
  value,
  subtitle,
  subtitleColor,
  onPress,
  onInfoPress,
  icon,
  goldFlow,
}: MetricTileProps) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className="w-full flex-row gap-4 rounded-none border-2 border-white bg-surface-alt px-3 py-4 active:opacity-80"
      style={{
        shadowColor: '#000000',
        shadowOffset: { width: 3, height: 3 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 4,
      }}
    >
      {goldFlow ? <SnakeBorder /> : null}
      <Image
        source={icon}
        style={{ width: 48, height: 48 }}
        contentFit="contain"
      />
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <ThemedText type="caption">
            {label.toUpperCase()}
          </ThemedText>
          {onInfoPress ? (
            <Pressable onPress={onInfoPress} hitSlop={8}>
              <MaterialIcons name="info-outline" size={18} color="#666666" />
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row items-end gap-2">
          <ThemedText type="title">
            {value}
          </ThemedText>
          {subtitle ? (
            <ThemedText
              type="caption"
              lightColor={subtitleColor}
              className="text-xs mb-2"
            >
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

type PepperTokenMetricsOrNull = PepperTokenMetrics | null;
