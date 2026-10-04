/** The engine's nakshatra ids have no spaces: "PurvaAshadha" reads better as "Purva Ashadha". */
export const spaced = (name: string): string => name.replace(/([a-z])([A-Z])/g, '$1 $2');

const TITHI_NAMES = [
  'Pratipada',
  'Dwitiya',
  'Tritiya',
  'Chaturthi',
  'Panchami',
  'Shashthi',
  'Saptami',
  'Ashtami',
  'Navami',
  'Dashami',
  'Ekadashi',
  'Dwadashi',
  'Trayodashi',
  'Chaturdashi',
];

/** Tithi 1-30 by name: 1-15 are the bright half ending in Purnima, 16-30 the dark half ending in Amavasya. */
export function tithiName(number: number): string {
  if (number === 15) return 'Purnima';
  if (number === 30) return 'Amavasya';
  const name = TITHI_NAMES[(number - 1) % 15];
  if (!name) return `Tithi ${number}`;
  return `${number < 15 ? 'Shukla' : 'Krishna'} ${name}`;
}
