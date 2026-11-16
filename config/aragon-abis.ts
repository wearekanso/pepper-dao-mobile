/**
 * Aragon contract ABIs for the PEPPER MainDao.
 *
 * TOKEN_VOTING_ABI: TokenVoting 1.4 implementation shared by every track plugin
 * (0x149aaef5Ffda32D6AC2cE127d04ff0Cf51b4A4AD, verified on Chiliscan).
 * Trimmed to the errors, events and functions the app and indexer use;
 * refresh with scripts/fetch-abi-from-chiliscan.sh.
 *
 * Note: proposalCount() reverts with FunctionDeprecated() on 1.4, so proposals
 * are discovered from ProposalCreated events only.
 */

export const TOKEN_VOTING_ABI = [
  {
    inputs: [],
    name: 'AlreadyInitialized',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'dao',
        type: 'address'
      },
      {
        internalType: 'address',
        name: 'where',
        type: 'address'
      },
      {
        internalType: 'address',
        name: 'who',
        type: 'address'
      },
      {
        internalType: 'bytes32',
        name: 'permissionId',
        type: 'bytes32'
      }
    ],
    name: 'DaoUnauthorized',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint64',
        name: 'limit',
        type: 'uint64'
      },
      {
        internalType: 'uint64',
        name: 'actual',
        type: 'uint64'
      }
    ],
    name: 'DateOutOfBounds',
    type: 'error'
  },
  {
    inputs: [],
    name: 'DelegateCallFailed',
    type: 'error'
  },
  {
    inputs: [],
    name: 'FunctionDeprecated',
    type: 'error'
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'target',
            type: 'address'
          },
          {
            internalType: 'enum IPlugin.Operation',
            name: 'operation',
            type: 'uint8'
          }
        ],
        internalType: 'struct IPlugin.TargetConfig',
        name: 'targetConfig',
        type: 'tuple'
      }
    ],
    name: 'InvalidTargetConfig',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint64',
        name: 'limit',
        type: 'uint64'
      },
      {
        internalType: 'uint64',
        name: 'actual',
        type: 'uint64'
      }
    ],
    name: 'MinDurationOutOfBounds',
    type: 'error'
  },
  {
    inputs: [],
    name: 'NoVotingPower',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      }
    ],
    name: 'NonexistentProposal',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      }
    ],
    name: 'ProposalAlreadyExists',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      }
    ],
    name: 'ProposalExecutionForbidden',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'limit',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'actual',
        type: 'uint256'
      }
    ],
    name: 'RatioOutOfBounds',
    type: 'error'
  },
  {
    inputs: [],
    name: 'TokenClockMismatch',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      },
      {
        internalType: 'address',
        name: 'account',
        type: 'address'
      },
      {
        internalType: 'enum IMajorityVoting.VoteOption',
        name: 'voteOption',
        type: 'uint8'
      }
    ],
    name: 'VoteCastForbidden',
    type: 'error'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'creator',
        type: 'address'
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'startDate',
        type: 'uint64'
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'endDate',
        type: 'uint64'
      },
      {
        indexed: false,
        internalType: 'bytes',
        name: 'metadata',
        type: 'bytes'
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'to',
            type: 'address'
          },
          {
            internalType: 'uint256',
            name: 'value',
            type: 'uint256'
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes'
          }
        ],
        indexed: false,
        internalType: 'struct Action[]',
        name: 'actions',
        type: 'tuple[]'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'allowFailureMap',
        type: 'uint256'
      }
    ],
    name: 'ProposalCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      }
    ],
    name: 'ProposalExecuted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'voter',
        type: 'address'
      },
      {
        indexed: false,
        internalType: 'enum IMajorityVoting.VoteOption',
        name: 'voteOption',
        type: 'uint8'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'votingPower',
        type: 'uint256'
      }
    ],
    name: 'VoteCast',
    type: 'event'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_proposalId',
        type: 'uint256'
      },
      {
        internalType: 'address',
        name: '_account',
        type: 'address'
      },
      {
        internalType: 'enum IMajorityVoting.VoteOption',
        name: '_voteOption',
        type: 'uint8'
      }
    ],
    name: 'canVote',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: '_metadata',
        type: 'bytes'
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'to',
            type: 'address'
          },
          {
            internalType: 'uint256',
            name: 'value',
            type: 'uint256'
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes'
          }
        ],
        internalType: 'struct Action[]',
        name: '_actions',
        type: 'tuple[]'
      },
      {
        internalType: 'uint256',
        name: '_allowFailureMap',
        type: 'uint256'
      },
      {
        internalType: 'uint64',
        name: '_startDate',
        type: 'uint64'
      },
      {
        internalType: 'uint64',
        name: '_endDate',
        type: 'uint64'
      },
      {
        internalType: 'enum IMajorityVoting.VoteOption',
        name: '_voteOption',
        type: 'uint8'
      },
      {
        internalType: 'bool',
        name: '_tryEarlyExecution',
        type: 'bool'
      }
    ],
    name: 'createProposal',
    outputs: [
      {
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: '_metadata',
        type: 'bytes'
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'to',
            type: 'address'
          },
          {
            internalType: 'uint256',
            name: 'value',
            type: 'uint256'
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes'
          }
        ],
        internalType: 'struct Action[]',
        name: '_actions',
        type: 'tuple[]'
      },
      {
        internalType: 'uint64',
        name: '_startDate',
        type: 'uint64'
      },
      {
        internalType: 'uint64',
        name: '_endDate',
        type: 'uint64'
      },
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes'
      }
    ],
    name: 'createProposal',
    outputs: [
      {
        internalType: 'uint256',
        name: 'proposalId',
        type: 'uint256'
      }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'dao',
    outputs: [
      {
        internalType: 'contract IDAO',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_proposalId',
        type: 'uint256'
      }
    ],
    name: 'getProposal',
    outputs: [
      {
        internalType: 'bool',
        name: 'open',
        type: 'bool'
      },
      {
        internalType: 'bool',
        name: 'executed',
        type: 'bool'
      },
      {
        components: [
          {
            internalType: 'enum MajorityVotingBase.VotingMode',
            name: 'votingMode',
            type: 'uint8'
          },
          {
            internalType: 'uint32',
            name: 'supportThreshold',
            type: 'uint32'
          },
          {
            internalType: 'uint64',
            name: 'startDate',
            type: 'uint64'
          },
          {
            internalType: 'uint64',
            name: 'endDate',
            type: 'uint64'
          },
          {
            internalType: 'uint64',
            name: 'snapshotTimepoint',
            type: 'uint64'
          },
          {
            internalType: 'uint256',
            name: 'minVotingPower',
            type: 'uint256'
          }
        ],
        internalType: 'struct MajorityVotingBase.ProposalParameters',
        name: 'parameters',
        type: 'tuple'
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'abstain',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'yes',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'no',
            type: 'uint256'
          }
        ],
        internalType: 'struct MajorityVotingBase.Tally',
        name: 'tally',
        type: 'tuple'
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'to',
            type: 'address'
          },
          {
            internalType: 'uint256',
            name: 'value',
            type: 'uint256'
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes'
          }
        ],
        internalType: 'struct Action[]',
        name: 'actions',
        type: 'tuple[]'
      },
      {
        internalType: 'uint256',
        name: 'allowFailureMap',
        type: 'uint256'
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'target',
            type: 'address'
          },
          {
            internalType: 'enum IPlugin.Operation',
            name: 'operation',
            type: 'uint8'
          }
        ],
        internalType: 'struct IPlugin.TargetConfig',
        name: 'targetConfig',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_proposalId',
        type: 'uint256'
      },
      {
        internalType: 'address',
        name: '_voter',
        type: 'address'
      }
    ],
    name: 'getVoteOption',
    outputs: [
      {
        internalType: 'enum IMajorityVoting.VoteOption',
        name: '',
        type: 'uint8'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getVotingToken',
    outputs: [
      {
        internalType: 'contract IVotesUpgradeable',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_proposalId',
        type: 'uint256'
      }
    ],
    name: 'hasSucceeded',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_account',
        type: 'address'
      }
    ],
    name: 'isMember',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'minDuration',
    outputs: [
      {
        internalType: 'uint64',
        name: '',
        type: 'uint64'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'minParticipation',
    outputs: [
      {
        internalType: 'uint32',
        name: '',
        type: 'uint32'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'minProposerVotingPower',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'supportThreshold',
    outputs: [
      {
        internalType: 'uint32',
        name: '',
        type: 'uint32'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_proposalId',
        type: 'uint256'
      },
      {
        internalType: 'enum IMajorityVoting.VoteOption',
        name: '_voteOption',
        type: 'uint8'
      },
      {
        internalType: 'bool',
        name: '_tryEarlyExecution',
        type: 'bool'
      }
    ],
    name: 'vote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
] as const;

/**
 * vePEPPER IVotes adapter (ERC-5805, timestamp clock).
 * balanceOf is kept because TokenVoting accepts either votes or balance
 * when checking minProposerVotingPower.
 */
export const VOTING_TOKEN_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'getVotes',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'account', type: 'address' },
      { internalType: 'uint256', name: 'timepoint', type: 'uint256' },
    ],
    name: 'getPastVotes',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
