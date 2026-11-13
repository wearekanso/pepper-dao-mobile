/**
 * Stake Modal Component
 *
 * Modal for PEPPER token staking operations.
 */

import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { ARAGON_DAO_URL } from '@/config/aragon-governance';
import { STAKING_DEPOSITS_ENABLED } from '@/config/features';
import { useStaking } from '@/hooks/use-staking';

import { StakeInput } from './stake-input';

type OperationType = 'stake' | 'unstake';

interface StakeModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (txHash: string, operation: OperationType) => void;
}

type TabType = 'stake' | 'unstake';

export function StakeModal({ visible, onClose, onSuccess }: StakeModalProps) {
  // Staking into the old contract is closed (no voting power): unstake only
  const [activeTab, setActiveTab] = useState<TabType>(STAKING_DEPOSITS_ENABLED ? 'stake' : 'unstake');
  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');

  const {
    stakingData,
    isLoading,
    error: queryError,
    txStatus,
    txError,
    formattedWalletBalance,
    formattedStakedBalance,
    canStake,
    canUnstake,
    needsApproval,
    approve,
    stake,
    unstake,
    refetch,
  } = useStaking();

  const isPending = txStatus === 'pending';

  function handleClose() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStakeAmount('');
    setUnstakeAmount('');
    onClose();
  }

  async function handleTabChange(tab: TabType) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }

  async function handleApprove() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await approve(stakeAmount);

    // After successful approval, automatically proceed to stake
    if (result.success) {
      const stakeResult = await stake(stakeAmount);
      if (stakeResult.success && stakeResult.txHash) {
        setStakeAmount('');
        onClose();
        onSuccess?.(stakeResult.txHash, 'stake');
      }
    }
  }

  async function handleStake() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await stake(stakeAmount);
    if (result.success && result.txHash) {
      setStakeAmount('');
      onClose();
      onSuccess?.(result.txHash, 'stake');
    }
  }

  async function handleUnstake() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await unstake(unstakeAmount);
    if (result.success && result.txHash) {
      setUnstakeAmount('');
      onClose();
      onSuccess?.(result.txHash, 'unstake');
    }
  }

  // Validation
  const stakeAmountNum = parseFloat(stakeAmount) || 0;
  const showApproveButton = stakeAmountNum > 0 && needsApproval(stakeAmount);
  const canDoStake = stakeAmountNum > 0 && canStake(stakeAmount);
  const unstakeAmountNum = parseFloat(unstakeAmount) || 0;
  const canDoUnstake = unstakeAmountNum > 0 && canUnstake(unstakeAmount);

  const stakeError =
    stakeAmountNum > 0 && !canStake(stakeAmount) && !needsApproval(stakeAmount)
      ? 'Insufficient balance'
      : null;
  const unstakeError = unstakeAmountNum > 0 && !canDoUnstake ? 'Insufficient staked balance' : null;

  const walletBalance = parseFloat(formattedWalletBalance) || 0;
  const stakedBalance = parseFloat(formattedStakedBalance) || 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/85 px-5">
        <View className="w-full max-w-sm border-2 border-[#FFC043] bg-[#1a1a1a] shadow-[4px_4px_0px_#000000]">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-[#FFC043]/30 px-4 py-3">
            <Text className="font-['PPNeueBit-Bold'] text-base uppercase tracking-wider text-[#FFC043]">
              PEPPER Staking
            </Text>
            <Pressable
              onPress={handleClose}
              className="h-7 w-7 items-center justify-center bg-white/10 active:bg-white/20"
            >
              <Text className="font-['PPNeueBit-Bold'] text-xs text-white">X</Text>
            </Pressable>
          </View>

          <ScrollView className="max-h-[65vh] px-4 py-4" showsVerticalScrollIndicator={false}>
            {queryError && !stakingData ? (
              <View className="items-center py-8">
                <Text className="font-['PPNeueBit-Bold'] text-lg uppercase text-[#FF006E]">
                  Unable to load staking data
                </Text>
                <Text className="mt-2 text-center font-['PPNeueBit-Bold'] text-sm text-gray-400">
                  {queryError.message}
                </Text>
                <Pressable
                  onPress={() => { void refetch(); }}
                  className="mt-4 border-4 border-white bg-[#FF006E] px-6 py-3 shadow-[4px_4px_0px_#000000] active:translate-x-1 active:translate-y-1 active:shadow-none"
                >
                  <Text className="font-['PPNeueBit-Bold'] text-xs uppercase tracking-wider text-white">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Balance Overview */}
            <View className="mb-4 flex-row gap-3">
              <View className="flex-1 bg-white/5 p-3">
                <Text className="font-['PPNeueBit-Bold'] text-[10px] uppercase tracking-wider text-white/50">
                  Wallet Balance
                </Text>
                <Text className="mt-1 font-['PPNeueBit-Bold'] text-lg text-white">
                  {isLoading ? '...' : walletBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
              </View>
              <View className="flex-1 bg-[#FFC043]/10 p-3">
                <Text className="font-['PPNeueBit-Bold'] text-[10px] uppercase tracking-wider text-[#FFC043]">
                  Staked
                </Text>
                <Text className="mt-1 font-['PPNeueBit-Bold'] text-lg text-white">
                  {isLoading ? '...' : stakedBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </View>

            {STAKING_DEPOSITS_ENABLED ? null : (
              <View className="mb-4 gap-2 border-2 border-[#FFC043] p-3">
                <Text className="font-['PPNeueBit-Bold'] text-xs uppercase tracking-wider text-[#FFC043]">
                  Staking has moved
                </Text>
                <Text className="text-xs text-white/80">
                  Voting power now comes from locking PEPPER as vePEPPER on Aragon. The old staking contract no longer
                  counts for votes, so unstake your PEPPER here and lock it there.
                </Text>
                <Pressable
                  onPress={() => void Linking.openURL(ARAGON_DAO_URL)}
                  className="items-center border-2 border-[#FFC043] py-2 active:bg-[#FFC043]/10"
                >
                  <Text className="font-['PPNeueBit-Bold'] text-sm uppercase text-[#FFC043]">Lock on Aragon</Text>
                </Pressable>
              </View>
            )}

            {/* Tabs */}
            <View className="mb-4 flex-row bg-white/5" style={STAKING_DEPOSITS_ENABLED ? undefined : { display: 'none' }}>
              <Pressable
                onPress={() => handleTabChange('stake')}
                className={`flex-1 py-2.5 ${activeTab === 'stake' ? 'bg-[#00FF80]' : ''}`}
              >
                <Text
                  className={`text-center font-['PPNeueBit-Bold'] text-sm uppercase ${
                    activeTab === 'stake' ? 'text-black' : 'text-white/50'
                  }`}
                >
                  Stake
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleTabChange('unstake')}
                className={`flex-1 py-2.5 ${activeTab === 'unstake' ? 'bg-[#FF006E]' : ''}`}
              >
                <Text
                  className={`text-center font-['PPNeueBit-Bold'] text-sm uppercase ${
                    activeTab === 'unstake' ? 'text-white' : 'text-white/50'
                  }`}
                >
                  Unstake
                </Text>
              </Pressable>
            </View>

            {/* Tab Content */}
            {activeTab === 'stake' ? (
              <View className="gap-3">
                <StakeInput
                  value={stakeAmount}
                  onChange={setStakeAmount}
                  maxAmount={formattedWalletBalance}
                  label="Amount to Stake"
                  disabled={isPending}
                  error={stakeError}
                />

                {showApproveButton ? (
                  <Pressable
                    onPress={handleApprove}
                    disabled={isPending}
                    className={`py-3 ${isPending ? 'bg-white/20' : 'bg-[#FFC043] active:opacity-80'}`}
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <Text className="text-center font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-black">
                        Stake PEPPER
                      </Text>
                    )}
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handleStake}
                    disabled={!canDoStake || isPending}
                    className={`py-3 ${
                      canDoStake && !isPending ? 'bg-[#FFC043] active:opacity-80' : 'bg-white/20'
                    }`}
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <Text
                        className={`text-center font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider ${
                          canDoStake ? 'text-black' : 'text-white/40'
                        }`}
                      >
                        Stake PEPPER
                      </Text>
                    )}
                  </Pressable>
                )}
              </View>
            ) : (
              <View className="gap-3">
                <StakeInput
                  value={unstakeAmount}
                  onChange={setUnstakeAmount}
                  maxAmount={formattedStakedBalance}
                  label="Amount to Unstake"
                  disabled={isPending}
                  error={unstakeError}
                />

                <Pressable
                  onPress={handleUnstake}
                  disabled={!canDoUnstake || isPending}
                  className={`py-3 ${
                    canDoUnstake && !isPending ? 'bg-[#FF006E] active:opacity-80' : 'bg-white/20'
                  }`}
                >
                  {isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text
                      className={`text-center font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider ${
                        canDoUnstake ? 'text-white' : 'text-white/40'
                      }`}
                    >
                      Unstake PEPPER
                    </Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* Transaction Status */}
            {txError && (
              <View className="mt-3 bg-[#FF006E]/20 p-3">
                <Text className="font-['PPNeueBit-Bold'] text-xs uppercase text-[#FF006E]">Error</Text>
                <Text className="mt-1 font-['PPMondwest-Regular'] text-xs text-white/80">{txError}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
