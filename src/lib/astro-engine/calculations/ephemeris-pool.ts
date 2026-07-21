// =============================================================================
// STUB — replaced in full by Task 7. Always reports disabled so all traffic
// runs the in-process core path until the real pool lands.
// =============================================================================

export function getEphemerisPool() {
  return {
    isEnabled: () => false,
    runPlanetPositions: (): never => {
      throw new Error('Ephemeris worker pool not yet implemented');
    },
    runHouses: (): never => {
      throw new Error('Ephemeris worker pool not yet implemented');
    },
    runAscendant: (): never => {
      throw new Error('Ephemeris worker pool not yet implemented');
    },
  };
}
