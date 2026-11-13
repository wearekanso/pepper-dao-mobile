import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ProposalCard } from '@/components/governance';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PROPOSAL_CREATION_ENABLED } from '@/config/features';
import { FOREST_GREEN } from '@/constants/theme';
import { useGovernanceProposals } from '@/hooks/use-governance';
import type { GovernanceProposal } from '@/types/governance';

type ProposalTypeFilter = 'ALL' | 'ADMIN' | 'PEP';

const FILTER_TABS: Array<{ key: ProposalTypeFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'ADMIN', label: 'Admin' },
  { key: 'PEP', label: 'Pepper Evolution' },
];

export function LegacyGovernanceScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProposalTypeFilter>('ALL');

  const { data: allProposals, isLoading, isError, refetch } = useGovernanceProposals({});

  function handleCreateProposal() {
    router.push('/governance/create');
  }

  // Filter proposals by type
  const proposals = allProposals?.filter((p) => {
    if (activeTab === 'ALL') return true;
    return p.type === activeTab;
  });

  function renderContent() {
    if (isLoading && !proposals) {
      return (
        <View className="items-center justify-center py-16">
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text className="mt-4 text-xs uppercase tracking-wider text-white">
            Loading proposals...
          </Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View className="items-center justify-center py-16">
          <Text className="mb-3 text-sm text-white">
            Unable to load governance proposals.
          </Text>
          <Pressable
            onPress={() => {
              void refetch();
            }}
            className="border-4 border-white bg-[#FF006E] px-6 py-3 shadow-[4px_4px_0px_#000000] active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            <Text className="text-xs font-bold uppercase tracking-wider text-white">
              Retry
            </Text>
          </Pressable>
        </View>
      );
    }

    if (!proposals || proposals.length === 0) {
      return (
        <View className="items-center justify-center py-16">
          <Text className="mb-2 text-sm text-white">
            No proposals yet.
          </Text>
          <Text className="text-xs text-white/80">
            New governance proposals will appear here.
          </Text>
        </View>
      );
    }

    return (
      <FlashList<GovernanceProposal>
        data={proposals}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={180}
        contentContainerStyle={{ paddingVertical: 4 }}
        renderItem={({ item }) => (
          <View className="mb-4">
            <ProposalCard proposal={item} />
          </View>
        )}
      />
    );
  }

  return (
    <ThemedView
      className="flex-1"
      style={{ backgroundColor: FOREST_GREEN }}
    >
      <View className="flex-1 px-4 pb-6 pt-16">
        <View className="mb-4">
          <View className="flex-row items-center justify-between">
            <ThemedText
              type="display"
              lightColor="#FFFFFF"
              className="font-bold text-white"
            >
              Proposals
            </ThemedText>
            {PROPOSAL_CREATION_ENABLED ? (
              <Pressable
                onPress={handleCreateProposal}
                className="flex-row items-center gap-1.5 border border-white/60 px-3 py-1.5 active:bg-white/10"
              >
                <Text className="font-['PPNeueBit-Bold'] text-sm text-white">+</Text>
                <Text className="font-['PPNeueBit-Bold'] text-xs uppercase tracking-wider text-white">
                  Submit
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text className="text-xs text-white/80" style={{ maxWidth: 260 }}>
            Review Pepper DAO governance proposals created in Aragon.
          </Text>
        </View>

        {/* Filter Tabs */}
        <View
          style={{
            flexDirection: 'row',
            borderBottomWidth: 2,
            borderBottomColor: 'rgba(255, 255, 255, 0.2)',
          }}
        >
          {FILTER_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  marginRight: 8,
                  borderBottomWidth: 3,
                  borderBottomColor: isActive ? '#FFEA00' : 'transparent',
                  marginBottom: -2,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.5)',
                  }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flex: 1, marginTop: 16 }}>
          {renderContent()}
        </View>
      </View>

    </ThemedView>
  );
}


