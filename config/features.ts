/**
 * Feature switches for functionality that is built but not yet released.
 */

/**
 * Creating proposals from mobile is hidden until metadata is pinned to IPFS.
 * Aragon reads proposal titles from an `ipfs://CID` link; the app currently
 * writes inline JSON, so mobile-created proposals would show untitled in Aragon.
 * See https://github.com/wearekanso/pepper-dao-mobile/issues/7
 */
export const PROPOSAL_CREATION_ENABLED = false;

/**
 * Staking into the old staking contract (0x5cA4…) is closed: it no longer
 * gives voting power. Voting power now comes from locking PEPPER as vePEPPER,
 * which users do on Aragon until the in-app lock flow ships. Unstaking from
 * the old contract stays open so holders can move their PEPPER.
 */
export const STAKING_DEPOSITS_ENABLED = false;
