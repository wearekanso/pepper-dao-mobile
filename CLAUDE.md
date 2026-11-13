# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pepper DAO Mobile is a React Native (Expo) app for the Pepper DAO governance platform on Chiliz blockchain. It provides wallet connectivity, governance proposal voting, staking, and user reputation tracking.

## Commands

### Development
```bash
npm install          # Install dependencies
npx expo start       # Start Expo development server
npm run ios          # Run on iOS simulator (expo run:ios)
npm run android      # Run on Android emulator (expo run:android)
npm run web          # Start web version
npm run lint         # Run ESLint
```

### Supabase Edge Functions
```bash
npm run supabase:deploy              # Deploy all Edge Functions
npm run supabase:deploy:sync         # Deploy sync-proposals (--no-verify-jwt)
npm run supabase:deploy:notify       # Deploy send-notification
npm run supabase:logs:sync           # View sync-proposals logs
npm run supabase:logs:notify         # View send-notification logs
npm run supabase:types               # Generate TypeScript types from schema
```

## Architecture

### Provider Hierarchy (app/_layout.tsx)
The app uses nested context providers in this order:
```
SafeAreaProvider > AppKitProvider > QueryClientProvider > UserProvider > OnboardingProvider > WalletProvider > WalletProfileLinker > OnboardingGate > Stack
```

### Key Integrations
- **Wallet**: Reown AppKit (`@reown/appkit-react-native`) for WalletConnect/Web3 wallet connections
- **Blockchain**: Chiliz Chain (mainnet: 88888, testnet: 88882) via ethers.js and viem
- **Governance**: Aragon OSx PEPPER MainDao `0x26Ed…9213`. Each voting track (Standard / Agile / Fast) is its own TokenVoting 1.4 plugin; voting power is vePEPPER read from an IVotes adapter. All addresses live in `config/aragon-governance.ts`; keep `supabase/functions/sync-proposals` in sync with it
- **Backend**: Supabase for cached proposals, push notifications, and user profiles
- **State**: TanStack Query for server state, React Context for app state

### Data Flow for Governance
1. `sync-proposals` Edge Function indexes blockchain events into Supabase `proposals` table
2. Mobile app fetches from Supabase (fast reads) via `services/governance-api.ts`
3. `useGovernanceProposals` hook wraps the API with TanStack Query caching
4. On-chain voting and proposal creation call the proposal's track plugin directly via `services/voting-api.ts` and `services/proposal-api.ts`. Proposal IDs are 256-bit: keep them as strings/BigInt, never `parseInt`

### Directory Structure
- `app/` - Expo Router file-based routes (tabs, modals, deep links)
- `components/` - Organized by feature: governance/, wallet/, staking/, power/, onboarding/, ui/
- `contexts/` - React Context providers: wallet-context, user-context, onboarding-context
- `hooks/` - Custom hooks wrapping TanStack Query and business logic
- `services/` - API layer: governance-api, staking-api, chiliz-api
- `config/` - Chain configs, Aragon governance addresses, Supabase client, AppKit setup
- `lib/` - Utilities: storage (MMKV), fonts, push notifications, voting calculations
- `supabase/` - Edge Functions and database migrations

### Supabase Backend
- **Tables**: `proposals`, `device_tokens`, `sync_state`, `notification_history`, `user_profiles`, `activities`, `streaks`
- **Edge Functions**: `sync-proposals` (blockchain indexer), `send-notification` (Expo push)
- Types generated to `types/supabase.ts`

## Coding Conventions

### TypeScript
- Use interfaces over types; avoid enums (use maps)
- Use `Array<T>` syntax instead of `T[]`
- Strict mode enabled

### Naming
- Directories: lowercase with dashes (e.g., `components/auth-wizard`)
- Components: PascalCase with named exports
- Functions/variables: camelCase
- Constants: UPPERCASE_SNAKE_CASE

### Styling
- NativeWind (Tailwind CSS for React Native) via `className` prop
- Retro/pixel art aesthetic: sharp corners, thick borders (2-4px), solid shadows
- Brand colors: pepper-red (#E54545), forest (#1E4F3A), gold (#FFC043)
- Fonts: PPNeueBit-Bold (pixel), PPMondwest-Regular (sans)

### File Structure
Order within files: exported component, subcomponents, helpers, static content, types

### State Management
- TanStack Query for server state with 30s stale time
- React Context + useReducer for global app state
- MMKV (`lib/storage.ts`) for persistent local storage

### Error Handling
- Use Zod for runtime validation
- Early returns for error conditions
- Handle errors at function start

### Navigation
- Expo Router file-based routing
- Layout files (`_layout.tsx`) for Stack/Tab configuration
- Dynamic routes with `[param]` syntax
