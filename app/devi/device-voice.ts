import { narrationText } from "./voice-text";

type DeviceVoiceCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
};

const FEMININE_SPANISH_NAMES = [
  "paulina",
  "dalia",
  "sabina",
  "luciana",
  "lucia",
  "mónica",
  "monica",
  "helena",
  "soledad",
  "conchita",
  "maría",
  "maria",
];

function voiceScore(voice: SpeechSynthesisVoice) {
  const language = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;
  if (language === "es-mx") score += 100;
  else if (language === "es-419") score += 90;
  else if (language === "es-us") score += 80;
  else if (language.startsWith("es")) score += 60;
  if (FEMININE_SPANISH_NAMES.some((candidate) => name.includes(candidate)))
    score += 25;
  if (voice.localService) score += 5;
  return score;
}

export function cancelDeviceVoice() {
  if (typeof window !== "undefined" && "speechSynthesis" in window)
    window.speechSynthesis.cancel();
}

export function speakWithDeviceVoice(
  value: unknown,
  callbacks: DeviceVoiceCallbacks = {},
) {
  if (
    typeof window === "undefined" ||
    !("speechSynthesis" in window) ||
    typeof SpeechSynthesisUtterance === "undefined"
  )
    return false;

  const text = narrationText(value);
  if (!text) return false;
  const synthesis = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  const preferredVoice = synthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith("es"))
    .sort((left, right) => voiceScore(right) - voiceScore(left))[0];
  utterance.lang = preferredVoice?.lang || "es-MX";
  utterance.voice = preferredVoice || null;
  utterance.rate = 0.96;
  utterance.pitch = 1.03;
  utterance.volume = 1;
  utterance.onstart = () => callbacks.onStart?.();
  utterance.onend = () => callbacks.onEnd?.();
  utterance.onerror = () => callbacks.onError?.();
  synthesis.cancel();
  synthesis.speak(utterance);
  return true;
}
