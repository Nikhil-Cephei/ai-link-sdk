/**
 * useScaleProfile — user biometric profile management.
 *
 * The profile (gender, age, height in cm) is required by the scale's body-fat
 * algorithm. It is sent to the device automatically whenever the scale requests
 * it, always using the most recently set values.
 *
 * Must be used inside <ScaleProvider>.
 *
 * @example
 * const { userProfile, updateProfile } = useScaleProfile();
 * updateProfile({ gender: 1, age: 30, heightCm: 175 });
 */
import type { UserProfile } from '../HeightBodyFatScale';
import { useScaleContext } from './ScaleContext';

export interface ScaleProfile {
  /** Current user profile used for body-fat calculations. */
  userProfile: UserProfile;
  /**
   * Update the profile. Syncs to the scale instance immediately — no need to
   * reconnect or re-initialise.
   */
  updateProfile: (profile: UserProfile) => void;
}

export function useScaleProfile(): ScaleProfile {
  const { userProfile, updateProfile } = useScaleContext();
  return { userProfile, updateProfile };
}
