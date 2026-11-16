import type { GovernanceProposal } from '@/types/governance';

/**
 * Mock governance proposals for development and testing
 */
export const MOCK_GOVERNANCE_PROPOSALS: Array<GovernanceProposal> = [
  {
    id: '0x1234_1',
    pluginProposalId: '1',
    pluginAddress: '0x0000000000000000000000000000000000000000',
    track: null,
    key: 'PROP-1',
    title: 'Increase Staking Rewards by 15%',
    description:
      'This proposal aims to boost community engagement by increasing staking rewards from 12% to 15% APY. The additional rewards will come from the treasury reserve allocation.',
    status: 'ACTIVE',
    type: 'MULTISIG',
    proposer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    startDate: Math.floor((Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000).toString(),
    endDate: Math.floor((Date.now() + 5 * 24 * 60 * 60 * 1000) / 1000).toString(), // 5 days from now
    executedAt: null,
    approvals: 3,
    minApprovals: 4,
    approvalReached: false,
    actions: [
      {
        to: '0x1234567890abcdef1234567890abcdef12345678',
        value: '0',
        data: '0x',
      },
    ],
    timeLabel: '5 days left',
    tally: {
      yes: '125000000000000000000000', // 125k tokens
      no: '45000000000000000000000', // 45k tokens
      abstain: '10000000000000000000000', // 10k tokens
    },
    votingSettings: {
      supportThreshold: 500000, // 50%
      minParticipation: 150000, // 15%
      minDuration: 259200, // 3 days
      minProposerVotingPower: '100000000000000000000', // 100 tokens
    },
    totalVotingPower: '1000000000000000000000000', // 1M tokens
  },
  {
    id: '0x1234_2',
    pluginProposalId: '2',
    pluginAddress: '0x0000000000000000000000000000000000000000',
    track: null,
    key: 'PROP-2',
    title: 'Launch NFT Marketplace Integration',
    description:
      'Integrate Pepper DAO with a decentralized NFT marketplace to allow members to trade exclusive DAO NFTs and collectibles. This will create a new revenue stream for the DAO.',
    status: 'ACTIVE',
    type: 'PEP',
    proposer: '0x8Ba1f109551bD432803012645Ac136ddd64DBa72',
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    startDate: Math.floor((Date.now() - 1 * 24 * 60 * 60 * 1000) / 1000).toString(),
    endDate: Math.floor((Date.now() + 6 * 24 * 60 * 60 * 1000) / 1000).toString(), // 6 days from now
    executedAt: null,
    approvals: 5,
    minApprovals: 4,
    approvalReached: true,
    actions: [
      {
        to: '0xabcdef1234567890abcdef1234567890abcdef12',
        value: '0',
        data: '0x',
      },
    ],
    timeLabel: '6 days left',
    tally: {
      yes: '780000000000000000000000', // 780k tokens
      no: '120000000000000000000000', // 120k tokens
      abstain: '50000000000000000000000', // 50k tokens
    },
    votingSettings: {
      supportThreshold: 500000, // 50%
      minParticipation: 150000, // 15%
      minDuration: 259200, // 3 days
      minProposerVotingPower: '100000000000000000000', // 100 tokens
    },
    totalVotingPower: '1000000000000000000000000', // 1M tokens
  },
  {
    id: '0x1234_3',
    pluginProposalId: '3',
    pluginAddress: '0x0000000000000000000000000000000000000000',
    track: null,
    key: 'PROP-3',
    title: 'Community Grant Program Q1 2026',
    description:
      'Allocate 50,000 PEPPER tokens for community grants to support ecosystem projects, developer tools, and educational initiatives during Q1 2026.',
    status: 'PENDING',
    type: 'MULTISIG',
    proposer: '0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db',
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
    startDate: Math.floor((Date.now() + 2 * 24 * 60 * 60 * 1000) / 1000).toString(), // starts in 2 days
    endDate: Math.floor((Date.now() + 9 * 24 * 60 * 60 * 1000) / 1000).toString(), // ends in 9 days
    executedAt: null,
    approvals: 0,
    minApprovals: 4,
    approvalReached: false,
    actions: [
      {
        to: '0x9876543210fedcba9876543210fedcba98765432',
        value: '0',
        data: '0x',
      },
    ],
    timeLabel: 'Starts in 2 days',
    tally: {
      yes: '0',
      no: '0',
      abstain: '0',
    },
    votingSettings: {
      supportThreshold: 500000, // 50%
      minParticipation: 150000, // 15%
      minDuration: 259200, // 3 days
      minProposerVotingPower: '100000000000000000000', // 100 tokens
    },
    totalVotingPower: '1000000000000000000000000', // 1M tokens
  },
  {
    id: '0x1234_4',
    pluginProposalId: '4',
    pluginAddress: '0x0000000000000000000000000000000000000000',
    track: null,
    key: 'PROP-4',
    title: 'Treasury Diversification Strategy',
    description:
      'Executed proposal to diversify DAO treasury holdings by allocating 30% to stablecoins, 50% to PEPPER tokens, and 20% to blue-chip DeFi assets.',
    status: 'EXECUTED',
    type: 'MULTISIG',
    proposer: '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    startDate: Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000).toString(),
    endDate: Math.floor((Date.now() - 23 * 24 * 60 * 60 * 1000) / 1000).toString(), // ended 23 days ago
    executedAt: Math.floor((Date.now() - 22 * 24 * 60 * 60 * 1000) / 1000).toString(), // executed 22 days ago
    approvals: 5,
    minApprovals: 4,
    approvalReached: true,
    actions: [
      {
        to: '0xfedcba9876543210fedcba9876543210fedcba98',
        value: '0',
        data: '0x',
      },
    ],
    timeLabel: '22 days ago',
    tally: {
      yes: '650000000000000000000000', // 650k tokens
      no: '100000000000000000000000', // 100k tokens
      abstain: '30000000000000000000000', // 30k tokens
    },
    votingSettings: {
      supportThreshold: 500000, // 50%
      minParticipation: 150000, // 15%
      minDuration: 259200, // 3 days
      minProposerVotingPower: '100000000000000000000', // 100 tokens
    },
    totalVotingPower: '1000000000000000000000000', // 1M tokens
  },
  {
    id: '0x1234_5',
    pluginProposalId: '5',
    pluginAddress: '0x0000000000000000000000000000000000000000',
    track: null,
    key: 'PROP-5',
    title: 'Reduce Proposal Threshold to 50 PEPPER',
    description:
      'Lower the minimum token requirement for creating proposals from 100 PEPPER to 50 PEPPER to encourage broader community participation in governance.',
    status: 'EXECUTED',
    type: 'PEP',
    proposer: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(), // 45 days ago
    startDate: Math.floor((Date.now() - 45 * 24 * 60 * 60 * 1000) / 1000).toString(),
    endDate: Math.floor((Date.now() - 38 * 24 * 60 * 60 * 1000) / 1000).toString(),
    executedAt: Math.floor((Date.now() - 37 * 24 * 60 * 60 * 1000) / 1000).toString(),
    approvals: 6,
    minApprovals: 4,
    approvalReached: true,
    actions: [
      {
        to: '0x5555555555555555555555555555555555555555',
        value: '0',
        data: '0x',
      },
    ],
    timeLabel: '37 days ago',
    tally: {
      yes: '890000000000000000000000', // 890k tokens
      no: '50000000000000000000000', // 50k tokens
      abstain: '20000000000000000000000', // 20k tokens
    },
    votingSettings: {
      supportThreshold: 500000, // 50%
      minParticipation: 150000, // 15%
      minDuration: 259200, // 3 days
      minProposerVotingPower: '100000000000000000000', // 100 tokens
    },
    totalVotingPower: '1000000000000000000000000', // 1M tokens
  },
  {
    id: '0x1234_6',
    pluginProposalId: '6',
    pluginAddress: '0x0000000000000000000000000000000000000000',
    track: null,
    key: 'PROP-6',
    title: 'Partnership with ChilizX Exchange',
    description:
      'Establish strategic partnership with ChilizX exchange for enhanced liquidity and trading pairs. This includes co-marketing initiatives and potential token listing.',
    status: 'ACTIVE',
    type: 'ADMIN',
    proposer: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    startDate: Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000).toString(),
    endDate: Math.floor((Date.now() + 4 * 24 * 60 * 60 * 1000) / 1000).toString(), // 4 days from now
    executedAt: null,
    approvals: 2,
    minApprovals: 3,
    approvalReached: false,
    actions: [
      {
        to: '0x6666666666666666666666666666666666666666',
        value: '0',
        data: '0x',
      },
    ],
    timeLabel: '4 days left',
    tally: {
      yes: '420000000000000000000000', // 420k tokens
      no: '180000000000000000000000', // 180k tokens
      abstain: '60000000000000000000000', // 60k tokens
    },
    votingSettings: {
      supportThreshold: 500000, // 50%
      minParticipation: 150000, // 15%
      minDuration: 259200, // 3 days
      minProposerVotingPower: '100000000000000000000', // 100 tokens
    },
    totalVotingPower: '1000000000000000000000000', // 1M tokens
  },
];

/**
 * Filter mock proposals by status
 */
export function getMockProposalsByStatus(
  status: 'ALL' | 'ACTIVE' | 'EXECUTED' | 'PENDING' | 'DEFEATED' | 'SUCCEEDED'
): Array<GovernanceProposal> {
  if (status === 'ALL') {
    return MOCK_GOVERNANCE_PROPOSALS;
  }
  return MOCK_GOVERNANCE_PROPOSALS.filter((p) => p.status === status);
}

/**
 * Get a single mock proposal by ID
 */
export function getMockProposalById(
  proposalId: string | undefined
): GovernanceProposal | null {
  if (!proposalId) {
    return null;
  }
  return MOCK_GOVERNANCE_PROPOSALS.find((p) => p.id === proposalId) ?? null;
}
