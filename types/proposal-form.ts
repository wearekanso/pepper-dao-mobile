import { z } from 'zod';

import type { GovernanceTrack } from '@/config/aragon-governance';

/**
 * Resource link for proposal
 */
export interface ProposalResource {
  url: string;
  title: string;
}

/**
 * Form state for creating a proposal
 */
export interface ProposalFormState {
  title: string;
  summary: string;
  body: string;
  resources: Array<ProposalResource>;
  /** Voting track (plugin) the proposal is created on */
  track: GovernanceTrack;
}

/**
 * Initial form state
 */
export const INITIAL_PROPOSAL_FORM_STATE: ProposalFormState = {
  title: '',
  summary: '',
  body: '',
  resources: [],
  track: 'STANDARD',
};

/**
 * Character limits for form fields
 */
export const PROPOSAL_FORM_LIMITS = {
  TITLE_MAX: 128,
  SUMMARY_MAX: 480,
  BODY_MAX: 10000,
  MAX_RESOURCES: 5,
} as const;

/**
 * Zod validation schema for proposal form
 */
export const ProposalFormSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(PROPOSAL_FORM_LIMITS.TITLE_MAX, `Title must be ${PROPOSAL_FORM_LIMITS.TITLE_MAX} characters or less`),
  summary: z
    .string()
    .max(PROPOSAL_FORM_LIMITS.SUMMARY_MAX, `Summary must be ${PROPOSAL_FORM_LIMITS.SUMMARY_MAX} characters or less`)
    .optional()
    .or(z.literal('')),
  body: z
    .string()
    .max(PROPOSAL_FORM_LIMITS.BODY_MAX, `Body must be ${PROPOSAL_FORM_LIMITS.BODY_MAX} characters or less`)
    .optional()
    .or(z.literal('')),
  resources: z
    .array(
      z.object({
        url: z.string().url('Invalid URL format'),
        title: z.string().min(1, 'Resource title is required'),
      })
    )
    .max(PROPOSAL_FORM_LIMITS.MAX_RESOURCES, `Maximum ${PROPOSAL_FORM_LIMITS.MAX_RESOURCES} resources allowed`)
    .optional()
    .default([]),
});

export type ProposalFormInput = z.infer<typeof ProposalFormSchema>;

/**
 * Parameters for creating a proposal on-chain
 */
export interface CreateProposalParams {
  title: string;
  summary?: string;
  body?: string;
  resources?: Array<ProposalResource>;
  /** Voting track (plugin) to create the proposal on; defaults to STANDARD */
  track?: GovernanceTrack;
}

/**
 * Result of a proposal creation transaction
 */
export interface CreateProposalResult {
  status: 'success' | 'error';
  proposalId?: string;
  /** Track plugin the proposal was created on */
  pluginAddress?: string;
  txHash?: string;
  error?: string;
}

/**
 * Proposer eligibility data
 */
export interface ProposerEligibility {
  /** Minimum voting power required to create proposals */
  minRequired: bigint;
  /** User's current voting power */
  userPower: bigint;
  /** Whether user meets the requirement */
  isEligible: boolean;
}
