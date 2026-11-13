/**
 * Vote Modal Component
 *
 * Modal for casting votes on governance proposals.
 * Clean, modern design following StakeModal pattern.
 */

import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';

import { useVoting } from '@/hooks/use-voting';
import type { GovernanceProposal, VoteOption } from '@/types/governance';

interface VoteModalProps {
  visible: boolean;
  onClose: () => void;
  proposal: GovernanceProposal;
  initialVoteOption?: VoteOption;
  onSuccess?: (txHash: string, voteOption: VoteOption) => void;
}

interface VoteOptionButtonProps {
  label: string;
  option: VoteOption;
  color: string;
  isSelected: boolean;
  disabled: boolean;
  onPress: () => void;
}

function VoteOptionButton(props: VoteOptionButtonProps) {
  const { label, isSelected, disabled, onPress, color } = props;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="mb-3 border-4 p-4 active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50"
      style={{
        backgroundColor: isSelected ? color : '#111827',
        borderColor: isSelected ? color : '#FFFFFF',
        shadowColor: '#000000',
        shadowOffset: { width: 4, height: 4 },
        shadowOpacity: isSelected ? 0 : 1,
        shadowRadius: 0,
      }}
    >
      <View className="flex-row items-center justify-between">
        <Text
          className="font-['PPNeueBit-Bold'] text-base uppercase tracking-wider"
          style={{
            color: isSelected ? '#000000' : '#FFFFFF',
          }}
        >
          {label}
        </Text>
        {isSelected ? (
          <Text className="font-['PPNeueBit-Bold'] text-base" style={{ color: '#000000' }}>
            ✓
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function VoteModal(props: VoteModalProps) {
  const { visible, onClose, proposal, initialVoteOption, onSuccess } = props;

  const [selectedOption, setSelectedOption] = useState<VoteOption | null>(
    initialVoteOption && initialVoteOption !== 'NONE' ? initialVoteOption : null
  );

  const {
    formattedVotingPower,
    isLoading: isLoadingVotingPower,
    txStatus,
    txError,
    vote,
    resetTxState,
  } = useVoting(proposal.pluginProposalId, proposal.pluginAddress);

  const isPending = txStatus === 'pending';
  const isSuccess = txStatus === 'success';

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedOption(
        initialVoteOption && initialVoteOption !== 'NONE' ? initialVoteOption : null
      );
      resetTxState();
    }
  }, [visible, initialVoteOption, resetTxState]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const handleVoteSelect = useCallback(async (option: VoteOption) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedOption(option);
  }, []);

  const handleSubmitVote = useCallback(async () => {
    if (!selectedOption || !proposal.pluginProposalId) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await vote(proposal.pluginProposalId, selectedOption);

    if (result.success && result.txHash) {
      setTimeout(() => {
        onClose();
        onSuccess?.(result.txHash!, selectedOption);
      }, 1500);
    }
  }, [selectedOption, proposal.pluginProposalId, vote, onClose, onSuccess]);

  const canSubmit = selectedOption && !isPending && !isSuccess;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/85 px-5">
        <View className="w-full max-w-sm border-2 border-[#FFC043] bg-[#1a1a1a] shadow-[4px_4px_0px_#000000]">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-[#FFC043]/30 px-4 py-3">
            <Text className="font-['PPNeueBit-Bold'] text-base uppercase tracking-wider text-[#FFC043]">
              Cast Your Vote
            </Text>
            <Pressable
              onPress={handleClose}
              disabled={isPending}
              className="h-7 w-7 items-center justify-center bg-white/10 active:bg-white/20"
            >
              <Text className="font-['PPNeueBit-Bold'] text-xs text-white">X</Text>
            </Pressable>
          </View>

          <View className="px-4 py-4">
            {/* Proposal Info */}
            <View className="mb-4 flex-row items-center gap-3">
              <View className="bg-[#FFC043] px-2 py-1">
                <Text className="font-['PPNeueBit-Bold'] text-xs text-black">
                  {proposal.key}
                </Text>
              </View>
              <Text
                className="flex-1 text-sm leading-5 text-white/90"
                numberOfLines={2}
              >
                {proposal.title}
              </Text>
            </View>

            {/* Voting Power */}
            <View className="mb-4 flex-row items-center justify-between bg-white/5 p-3">
              <Text className="font-['PPNeueBit-Bold'] text-[10px] uppercase tracking-wider text-white/50">
                Your Voting Power
              </Text>
              <Text className="font-['PPNeueBit-Bold'] text-base text-[#FFC043]">
                {isLoadingVotingPower ? '...' : formattedVotingPower} PEPPER
              </Text>
            </View>

            {/* Vote Options */}
            <Text className="mb-3 font-['PPNeueBit-Bold'] text-[10px] uppercase tracking-wider text-white/50">
              Select Your Vote
            </Text>

            <VoteOptionButton
              label="Yes - Approve"
              option="YES"
              color="#00FF80"
              isSelected={selectedOption === 'YES'}
              disabled={isPending || isSuccess}
              onPress={() => handleVoteSelect('YES')}
            />

            <VoteOptionButton
              label="No - Reject"
              option="NO"
              color="#FF006E"
              isSelected={selectedOption === 'NO'}
              disabled={isPending || isSuccess}
              onPress={() => handleVoteSelect('NO')}
            />

            <VoteOptionButton
              label="Abstain"
              option="ABSTAIN"
              color="#6B7280"
              isSelected={selectedOption === 'ABSTAIN'}
              disabled={isPending || isSuccess}
              onPress={() => handleVoteSelect('ABSTAIN')}
            />

            {/* Error Message */}
            {txError ? (
              <View className="mb-3 bg-[#FF006E]/20 p-3">
                <Text className="font-['PPNeueBit-Bold'] text-xs uppercase text-[#FF006E]">
                  Error
                </Text>
                <Text className="mt-1 font-['PPMondwest-Regular'] text-xs text-white/80">
                  {txError}
                </Text>
              </View>
            ) : null}

            {/* Vote Button */}
            <Pressable
              onPress={handleSubmitVote}
              disabled={!canSubmit}
              className={`mt-2 py-4 ${
                isSuccess
                  ? 'bg-[#00FF80]'
                  : canSubmit
                    ? 'bg-[#FFC043] active:opacity-80'
                    : 'bg-white/20'
              }`}
              style={{
                borderWidth: 4,
                borderColor: isSuccess ? '#00FF80' : canSubmit ? '#FFC043' : 'rgba(255,255,255,0.2)',
                shadowColor: '#000000',
                shadowOffset: { width: 4, height: 4 },
                shadowOpacity: canSubmit || isSuccess ? 1 : 0,
                shadowRadius: 0,
              }}
            >
              {isPending ? (
                <View className="flex-row items-center justify-center gap-2">
                  <ActivityIndicator size="small" color="#000000" />
                  <Text className="font-['PPNeueBit-Bold'] text-base uppercase tracking-wider text-black">
                    Voting...
                  </Text>
                </View>
              ) : isSuccess ? (
                <Text className="text-center font-['PPNeueBit-Bold'] text-base uppercase tracking-wider text-black">
                  Vote Submitted!
                </Text>
              ) : (
                <Text
                  className={`text-center font-['PPNeueBit-Bold'] text-base uppercase tracking-wider ${
                    canSubmit ? 'text-black' : 'text-white/40'
                  }`}
                >
                  {selectedOption ? 'Vote' : 'Select an Option'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
