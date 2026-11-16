import { MAIN_DAO_TREASURY_ADDRESS } from '@/config/pepper-token';

/**
 * The HQ building, top to bottom. Each floor is a section of the app;
 * `band` is the floor's vertical slice of the cross-section art (0…1).
 */
export const FLOORS: Array<Floor> = [
  { key: '3F', name: 'MINISTERS HALL', href: '/governance', band: [0.14, 0.31] },
  { key: '2F', name: 'YOUR OFFICE', href: '/community', band: [0.33, 0.47] },
  { key: '1F', name: 'SEED VAULT', href: '/power', band: [0.48, 0.62] },
  { key: 'B1', name: 'TREASURY', href: '/floor/treasury', band: [0.63, 0.77] },
  { key: 'B2', name: 'BURN FURNACE', href: '/floor/furnace', band: [0.78, 0.93] },
];

export const HQ_IMAGES = {
  building: require('../assets/hq-building.png') as number,
  /** Tower art with the elevator car removed — TowerLife draws the moving car */
  buildingEmptyShaft: require('../assets/hq-building-empty-shaft.png') as number,
  elevatorCar: require('../assets/elevator-car.png') as number,
  ministers: require('../assets/room-ministers.png') as number,
  offices: require('../assets/room-offices.png') as number,
  seed: require('../assets/room-seed.png') as number,
  treasury: require('../assets/room-treasury.png') as number,
  furnace: require('../assets/room-furnace.png') as number,
} as const;

/** Width / height of the cross-section art */
export const BUILDING_RATIO = 960 / 1280;

export const EXPLORER_URL = 'https://chiliscan.com';
export const TREASURY_ADDRESS = MAIN_DAO_TREASURY_ADDRESS;

export interface Floor {
  key: string;
  name: string;
  href: string;
  band: [number, number];
}
