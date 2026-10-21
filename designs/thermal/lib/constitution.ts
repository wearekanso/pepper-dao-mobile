/**
 * Pepper DAO Constitution, condensed for the Thermal Pixel rulebook.
 * Source of truth for the full text: components/community/*-section.tsx
 */
export interface ConstitutionArticle {
  number: string;
  title: string;
  summary: string;
  body?: string;
  quote?: string;
  points?: Array<{ label: string; text: string }>;
  locked?: boolean;
  tracks?: boolean;
}

export const CONSTITUTION: Array<ConstitutionArticle> = [
  {
    number: '01',
    title: 'PREAMBLE',
    summary: 'We are the Pepper People',
    body: "Pepper DAO is created by the community, for the community. A united movement within the Chiliz Ecosystem, building a future that's transparent, fun, and spicy.",
    quote:
      'As $PEPPER becomes the platform token of Kayen.finance, this Constitution is the shared promise to grow together and ensure every voice matters.',
  },
  {
    number: '02',
    title: 'IDENTITY & POWER',
    summary: 'Community-powered · 8.89Q max supply · ve-voting',
    body: 'Pepper DAO is a decentralized, community-powered organization within the Chiliz ecosystem. Not a corporate office — a parliament of participation coordinated through the DAO portal.',
    points: [
      { label: 'SUPPLY', text: '8,888.8 Quadrillion — a high-supply community asset for maximum distribution.' },
      { label: 'VOTING POWER', text: 'Lock $PEPPER to earn vePEPPER. Longer locks yield more power via the Curve ve-model.' },
      { label: 'BURN ENGINE', text: '50% buyback / 50% burn — automatic, on every trade.' },
    ],
  },
  {
    number: '03',
    title: 'PEOPLE RIGHTS',
    summary: 'Vote, propose, get early access on Kayen',
    body: 'Every $PEPPER holder can be a member of the DAO and has the following rights:',
    points: [
      {
        label: 'GOVERNANCE ACCESS',
        text: 'Vote on proposals, community incentives and decisions for Pepper DAO and Kayen.finance — including which liquidity pools receive yield.',
      },
      { label: 'PROPOSAL SUBMISSION', text: 'Formal on-chain proposals require the 1 Trillion $PEPPER threshold.' },
      { label: 'EARLY ACCESS', text: '"First Look" beta access to features like limit orders and perpetuals on Kayen.' },
    ],
  },
  {
    number: '04',
    title: 'THE PARLIAMENT',
    summary: '3 elected ministers: Prime, Treasury, Publicity',
    points: [
      { label: 'PRIME MINISTER', text: 'Coordinates governance processes, schedules votes and keeps communication flowing across the DAO.' },
      { label: 'TREASURY MINISTER', text: 'Manages the treasury, spending and financial reporting — every penny visible to the community.' },
      { label: 'PUBLICITY MINISTER', text: "Runs Pepper's social channels day-to-day: content, amplification, announcements and growth." },
    ],
    quote: 'Ministers can be removed at any time by a 60% community vote if they fail to uphold these standards.',
  },
  {
    number: '05',
    title: 'VOTING TRACKS',
    summary: 'Longer tracks for bigger decisions',
    tracks: true,
    points: [
      { label: 'STANDARD · 7 DAYS', text: 'Major treasury spending, protocol parameter changes or Ministerial elections.' },
      { label: 'AGILE · 3 DAYS', text: 'Community initiatives and minor operational adjustments.' },
      { label: 'FAST · 48H · 66%', text: 'Critical security patches or urgent, time-sensitive treasury requests.' },
    ],
    body: 'Submitting a formal on-chain proposal requires 1 Trillion $PEPPER — enforced by the Aragon threshold plugin.',
  },
  {
    number: '06',
    title: 'THE RED LINES',
    summary: 'Rules no standard proposal can change',
    locked: true,
    points: [
      { label: 'INFLATION CADENCE', text: "The Community/Pepper allocation must be spent gradually and strategically to protect the token and the project's health." },
      { label: 'CORE PROTOCOL RULES', text: 'Voters cannot stop or fundamentally change the automated Buyback & Burn Engine.' },
      { label: 'TREASURY LIMITS', text: 'Any single vote spending above a community-set threshold requires a 66% super-majority.' },
    ],
  },
  {
    number: '07',
    title: 'TREASURY & GROWTH',
    summary: 'Every penny visible. No private spending.',
    body: 'The DAO treasury comes from the Community/Pepper allocation and potential future partnerships. How it is used is decided by Pepper DAO.',
    quote: 'Transparency over secrecy: every penny spent is visible for all to see. No hidden deals, no private spending — ever.',
  },
];

/** "At a glance" facts above the articles */
export const GLANCE_FACTS = [
  { label: 'TO PROPOSE', value: '1T', hint: 'PEPPER staked', icon: 'vault' },
  { label: 'MINISTERS', value: '3', hint: 'Prime · Treasury · Publicity', icon: 'logo' },
  { label: 'MAX SUPPLY', value: '8.89Q', hint: 'PEPPER, max', icon: 'supply' },
  { label: 'BURN', value: '50%', hint: 'of every trade fee', icon: 'burn' },
] as const;

/** Voting tracks: how long a vote runs and what it is for */
export const VOTING_TRACKS = [
  { label: 'STANDARD', duration: '7 DAYS', hint: 'Big spending, protocol changes, elections', tone: 'violet' },
  { label: 'AGILE', duration: '3 DAYS', hint: 'Community initiatives, small adjustments', tone: 'orange' },
  { label: 'FAST', duration: '48 HOURS', hint: 'Urgent fixes · needs 66% YES (supermajority)', tone: 'red' },
] as const;
