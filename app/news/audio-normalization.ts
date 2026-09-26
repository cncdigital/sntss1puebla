/** Radio Sindical loudness profile.
 * The UI's "98 dB" target is implemented as a safe digital reference:
 * -14 dBFS RMS target with a -1 dBFS peak ceiling. This avoids clipping
 * while keeping speech and music consistently audible across devices.
 */
export const RADIO_NORMALIZATION_PROFILE = {
  label: "98 dB",
  targetRmsDbfs: -14,
  peakCeilingDbfs: -1,
} as const;

export function calculateRadioNormalizationGain(samples: Float32Array[], targetRmsDbfs = RADIO_NORMALIZATION_PROFILE.targetRmsDbfs, peakCeilingDbfs = RADIO_NORMALIZATION_PROFILE.peakCeilingDbfs) {
  let sumSquares = 0;
  let count = 0;
  let peak = 0;
  for (const channel of samples) {
    for (const sample of channel) {
      const value = Math.max(-1, Math.min(1, sample));
      sumSquares += value * value;
      count += 1;
      peak = Math.max(peak, Math.abs(value));
    }
  }
  if (!count || !peak) return 1;
  const rmsDbfs = 20 * Math.log10(Math.max(Math.sqrt(sumSquares / count), 1e-6));
  const peakDbfs = 20 * Math.log10(Math.max(peak, 1e-6));
  const desiredGain = 10 ** ((targetRmsDbfs - rmsDbfs) / 20);
  const safeGain = 10 ** ((peakCeilingDbfs - peakDbfs) / 20);
  return Math.max(0.05, Math.min(desiredGain, safeGain, 8));
}
