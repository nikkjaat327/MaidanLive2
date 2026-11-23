import arenaTurfEmptyImg from '../assets/images/arena_turf_empty_1795011087551.jpg';
import stadiumFloodlightHeroImg from '../assets/images/stadium_floodlight_hero_1795011087164.jpg';

export type SportOption = 'Cricket' | 'Kabaddi' | 'Football' | 'Volleyball' | 'Other';

export const SPORT_OPTIONS: SportOption[] = [
  'Cricket',
  'Kabaddi',
  'Football',
  'Volleyball',
  'Other',
];

export const HERO_BANNER_IMAGE = stadiumFloodlightHeroImg;
export const EMPTY_ARENA_IMAGE = arenaTurfEmptyImg;
