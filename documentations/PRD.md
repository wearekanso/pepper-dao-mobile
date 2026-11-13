## PRD — PepperCoin DAO Mobile Portal

### 1) Overview
- **Vision**: A playful, credible DAO portal that lets anyone track treasury growth, vote via Aragon, stake $PEPPER, and explore the gamified Pepperverse.
- **Chain**: Chiliz Mainnet (ChainID 88888)
- **Token**: $PEPPER `0x60F397acBCfB8f4e3234C659A3E10867e6fA6b67` ([view on Chiliscan](https://chiliscan.com/token/0x60F397acBCfB8f4e3234C659A3E10867e6fA6b67?chainid=88888))
- **DAO**: PEPPER MainDao `0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213` ([Aragon dashboard](https://app.aragon.org/dao/chiliz-mainnet/0x26Ed279F6d9F1bb016f16e75704E6bBCc1F99213/dashboard)). Voting tracks are separate TokenVoting plugins (Standard / Agile / Fast) with vePEPPER voting power; addresses in `config/aragon-governance.ts`
- **Wallet**: ReOwn SDK + WalletConnect fallback
- **Backend**: Aragon SDK for proposals/votes; direct on-chain reads for treasury and staking

### 2) Problem & Goals
- **Problem**: DAO portals are often dull, desktop-first, and confusing for newcomers.
- **Goals**
  - **Engage**: Make governance and treasury tangible and fun.
  - **Enable**: Simple, safe on-chain actions from mobile.
  - **Inform**: Real-time treasury and staking visibility.
  - **Delight**: Gamified Pepperverse and badges.

### 3) Success Metrics
- **On-chain reliability**: ≥ 98% successful transactions (vote, stake, claim).
- **Performance**: Cold start < 2.5s; main screens < 1.2s median.
- **Engagement**: ≥ 25% of connected wallets complete 1+ on-chain action in week 1.
- **Discoverability**: Time-to-first-proposal-view < 5s on first launch.

### 4) Personas
- **Holder/Member**: Owns $PEPPER; wants to stake, vote, track rewards.
- **New Visitor**: Browses in read-only; may connect later.
- **Contributor**: Needs quick governance/treasury views and updates.

### 5) Scope (MVP)
- **Home (The Pulse)**: Live CHZ stream visualization; treasury snapshot with vault breakdowns.
- **Governance**: Proposal list/detail via Aragon SDK; voting; archive.
- **Treasury & Staking**: Approve/stake/unstake/claim; rewards timeline.
- **DAO Feed**: Spotlight and events (proposals, executions, treasury changes).
- **Pepperverse**: Map with unlocks; badge gallery (ERC-721/1155).
- **Onboarding & Wallet**: ReOwn + WalletConnect; strict chain guard (88888).

### 6) Out of Scope (MVP)
- Proposal creation in-app.
- Fiat on-ramps, CEX integrations.
- Advanced analytics dashboards beyond core charts.

### 7) Non-Functional Requirements
- **Security**: No custody; transactions only via wallet; strict chainId checks.
- **Resilience**: RPC pool with retry/backoff; cache reads; offline-tolerant read views.
- **Usability**: Mobile-first; accessible; clear error states; beginner-friendly copy.
- **Observability**: Basic telemetry on screen loads and on-chain actions.

### 8) Dependencies
- **Aragon SDK** (Chiliz EVM support; custom chain registration if needed).
- **Staking contract** (address + ABI provided by DAO).
- **RPC endpoints** for Chiliz (configurable via env).
- **Badge NFT contracts** (optional for MVP).

### 9) Risks & Mitigations
- **Aragon SDK gaps on Chiliz**: Fallback to direct contract reads and manually encoded vote transactions.
- **RPC instability**: Multi-endpoint pool; exponential backoff; cache; “degraded mode” banners.
- **Wallet SDK quirks on RN**: Validate ReOwn early; end-to-end WalletConnect fallback by Week 2.

### 10) Milestones & Deliverables
- **M1 (Weeks 1–3)**: Wallet onboarding, live stream visualization, treasury snapshot.
- **M2 (Weeks 4–6)**: Governance module, staking flows, rewards timeline.
- **M3 (Weeks 7–9)**: Feed, Pepperverse, badges, notifications; QA + polish.

### 11) Analytics & Privacy
- **Events**: `wallet_connected`, `proposal_viewed`, `vote_cast`, `stake_submitted`, `claim_success`, `badge_viewed`.
- **Privacy**: No PII; address-only; opt-out switch in Settings.

### 12) Beginner Glossary
- **Wallet**: Your Web3 account/signature app.
- **RPC**: Gateway to read/write blockchain data.
- **ABI**: Function map to call a smart contract.
- **Aragon SDK**: Toolkit to query proposals and vote in DAOs.


