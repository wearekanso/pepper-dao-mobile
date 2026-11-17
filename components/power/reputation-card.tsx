import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { RANK_IMAGES } from '@/lib/rank-images';
import { RANK_LABELS, REPUTATION_POINTS } from '@/lib/reputation';
import type { Profile } from '@/types/user';

interface ReputationCardProps {
  profile: Profile;
}

/**
 * Reputation info items for the modal
 */
const REPUTATION_INFO = [
  { event: 'Connect Wallet', points: REPUTATION_POINTS.WALLET_CONNECTED, icon: '👛' },
  { event: 'First Vote', points: REPUTATION_POINTS.FIRST_VOTE, icon: '🗳️' },
  { event: 'Vote on Proposal', points: REPUTATION_POINTS.VOTE, icon: '🗳️' },
  { event: 'Proposal Engaged', points: REPUTATION_POINTS.PROPOSAL_ENGAGED, icon: '📜' },
  { event: 'Proposal Passed', points: REPUTATION_POINTS.PROPOSAL_PASSED, icon: '📜' },
  { event: 'Proposal Executed', points: REPUTATION_POINTS.PROPOSAL_EXECUTED, icon: '📜' },
  { event: 'Receive Delegation', points: REPUTATION_POINTS.DELEGATION_RECEIVED, icon: '🤝' },
];

/**
 * Reputation Card Component
 *
 * Displays reputation points and rank side by side
 */
export function ReputationCard({ profile }: ReputationCardProps) {
  const [showInfoModal, setShowInfoModal] = useState(false);

  function handleOpenInfo() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowInfoModal(true);
  }

  function handleCloseInfo() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowInfoModal(false);
  }

  return (
    <>
      <View className="flex-row gap-3">
        {/* Rank */}
        <Card variant="dark" className="flex-1 flex-row items-center gap-3 p-3">
          <Image
            source={RANK_IMAGES[profile.rank]}
            style={{ width: 48, height: 48 }}
            resizeMode="contain"
          />
          <View>
            <Text className="font-['PPNeueBit-Bold'] text-xs uppercase tracking-wider text-[#8B5CF6]">
              Rank
            </Text>
            <Text className="font-['PPNeueBit-Bold'] text-xl text-white">
              {RANK_LABELS[profile.rank]}
            </Text>
          </View>
        </Card>

        {/* Reputation */}
        <Card variant="dark" className="flex-1 items-center justify-center p-3">
          <View className="flex-row items-center gap-1">
            <Text className="font-['PPNeueBit-Bold'] text-xs uppercase tracking-wider text-[#00FF80]">
              Reputation
            </Text>
            <Pressable onPress={handleOpenInfo} hitSlop={8}>
              <MaterialIcons name="info-outline" size={14} color="#00FF80" />
            </Pressable>
          </View>
          <Text className="font-['PPNeueBit-Bold'] text-3xl text-white">
            {profile.reputation_points.toLocaleString()}
          </Text>
        </Card>
      </View>

      {/* Reputation Info Modal */}
      <ReputationInfoModal visible={showInfoModal} onClose={handleCloseInfo} />
    </>
  );
}

/**
 * Reputation Info Modal
 */
function ReputationInfoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/85 px-5">
        <View className="w-full max-w-sm border-2 border-[#00FF80] bg-[#1a1a1a] shadow-[4px_4px_0px_#000000]">
          {/* Header */}
          <View className="flex-row items-center justify-between border-b border-[#00FF80]/30 px-4 py-3">
            <Text className="font-['PPNeueBit-Bold'] text-base uppercase tracking-wider text-[#00FF80]">
              How to Earn Points
            </Text>
            <Pressable
              onPress={onClose}
              className="h-7 w-7 items-center justify-center bg-white/10 active:bg-white/20"
            >
              <Text className="font-['PPNeueBit-Bold'] text-xs text-white">X</Text>
            </Pressable>
          </View>

          {/* Points List */}
          <ScrollView className="max-h-[50vh] px-4 py-3" showsVerticalScrollIndicator={false}>
            {REPUTATION_INFO.map((item, index) => (
              <View
                key={item.event}
                className={`flex-row items-center justify-between py-2.5 ${
                  index < REPUTATION_INFO.length - 1 ? 'border-b border-white/10' : ''
                }`}
              >
                <View className="flex-row items-center gap-2">
                  <Text className="text-base">{item.icon}</Text>
                  <Text className="font-['PPMondwest-Regular'] text-sm text-white/90">
                    {item.event}
                  </Text>
                </View>
                <Text className="font-['PPNeueBit-Bold'] text-sm text-[#00FF80]">
                  +{item.points}
                </Text>
              </View>
            ))}

            {/* Streak Info */}
            <View className="mt-3 bg-[#FFC043]/10 p-3">
              <Text className="font-['PPNeueBit-Bold'] text-[10px] uppercase tracking-wider text-[#FFC043]">
                Streak Bonuses
              </Text>
              <Text className="mt-1 font-['PPMondwest-Regular'] text-xs text-white/70">
                2 weeks: +30 | 4 weeks: +60 | 8 weeks: +120 | 12 weeks: +200
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="p-4">
            <Pressable
              onPress={onClose}
              className="bg-[#00FF80] py-3 active:opacity-80"
            >
              <Text className="text-center font-['PPNeueBit-Bold'] text-sm uppercase tracking-wider text-black">
                Got it
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Compact reputation display
 */
export function ReputationBadge({ points }: { points: number }) {
  return (
    <View className="flex-row items-center gap-1 border-2 border-[#00FF80] bg-[#00FF80]/20 px-2 py-1">
      <Text className="font-['PPNeueBit-Bold'] text-xs text-[#00FF80]">
        {points.toLocaleString()} REP
      </Text>
    </View>
  );
}
