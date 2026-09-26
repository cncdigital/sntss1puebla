export const RADIO_LIVE_SAMPLE_RATE = 16000;
export const RADIO_LIVE_VOICE_RATE = 8000;

export function microphoneLevel(samples: Float32Array): number {
  if (!samples.length) return 0;
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const rms = Math.sqrt(energy / samples.length);
  return Math.min(100, Math.round(Math.sqrt(Math.max(0, rms - .005)) * 180));
}

export function encodeLiveVoice(samples: Float32Array, inputRate: number): Uint8Array {
  const count = Math.floor(samples.length * RADIO_LIVE_VOICE_RATE / inputRate);
  const bytes = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor(index * inputRate / RADIO_LIVE_VOICE_RATE);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((index + 1) * inputRate / RADIO_LIVE_VOICE_RATE)));
    let sum = 0;
    for (let sample = start; sample < end; sample += 1) sum += samples[sample];
    let pcm = Math.round(Math.max(-1, Math.min(1, sum / (end - start))) * 32767);
    const sign = pcm < 0 ? 0x80 : 0;
    pcm = Math.min(32635, Math.abs(pcm) + 132);
    let exponent = 7;
    for (let mask = 0x4000; !(pcm & mask) && exponent > 0; mask >>= 1) exponent -= 1;
    bytes[index] = ~(sign | (exponent << 4) | ((pcm >> (exponent + 3)) & 15)) & 255;
  }
  return bytes;
}

export function decodeLiveVoice(bytes: ArrayBuffer): Float32Array | null {
  if (bytes.byteLength < 500 || bytes.byteLength > 32000) return null;
  const input = new Uint8Array(bytes);
  const samples = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const value = ~input[index] & 255;
    const magnitude = (((value & 15) << 3) + 132) << ((value >> 4) & 7);
    samples[index] = ((value & 0x80) ? 132 - magnitude : magnitude - 132) / 32768;
  }
  return samples;
}

export function decodeLivePcm(bytes: ArrayBuffer): Float32Array | null {
  if (bytes.byteLength < 1000 || bytes.byteLength > 64000 || bytes.byteLength % 2) return null;
  const view = new DataView(bytes);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let index = 0; index < samples.length; index += 1)
    samples[index] = view.getInt16(index * 2, true) / 32768;
  return samples;
}
