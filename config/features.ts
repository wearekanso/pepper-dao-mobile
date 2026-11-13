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
