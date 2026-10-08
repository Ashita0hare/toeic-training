// Web Speech API wrapper. Uses only on-device synthesis voices (navigator.speechSynthesis).
// IMPORTANT: on Android Chrome, utterance.voice is frequently ignored, so accent switching
// is done via utterance.lang (en-US / en-GB / en-AU) and we let the engine pick the voice.

export const ACCENTS = {
  US: 'en-US',
  GB: 'en-GB',
  AU: 'en-AU',
};

let cachedVoices = [];

export function primeVoices() {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) return resolve([]);
    const existing = synth.getVoices();
    if (existing && existing.length) {
      cachedVoices = existing;
      return resolve(existing);
    }
    const onChange = () => {
      cachedVoices = synth.getVoices();
      synth.removeEventListener('voiceschanged', onChange);
      resolve(cachedVoices);
    };
    synth.addEventListener('voiceschanged', onChange);
    // Some engines never fire voiceschanged if already loaded; fall back after a short wait.
    setTimeout(() => {
      if (!cachedVoices.length) {
        cachedVoices = synth.getVoices();
        resolve(cachedVoices);
      }
    }, 600);
  });
}

export function getVoices() {
  return cachedVoices.length ? cachedVoices : (window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
}

// Returns { 'en-US': true/false, 'en-GB': ..., 'en-AU': ... }
export function checkAccentAvailability() {
  const voices = getVoices();
  const result = {};
  for (const lang of Object.values(ACCENTS)) {
    result[lang] = voices.some((v) => v.lang && v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  }
  return result;
}

export function isSpeechSupported() {
  return !!window.speechSynthesis;
}

let currentUtterance = null;

export function cancelSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  currentUtterance = null;
}

// speak one string, resolves when playback ends (or errors).
export function speak(text, { lang = ACCENTS.US, rate = 1.0 } = {}) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) return reject(new Error('speech-unsupported'));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = rate;
    u.onend = () => resolve();
    u.onerror = (e) => {
      // "interrupted"/"canceled" happen when the user navigates away mid-speech; not a real failure.
      if (e.error === 'interrupted' || e.error === 'canceled') resolve();
      else reject(e);
    };
    currentUtterance = u;
    window.speechSynthesis.speak(u);
  });
}

// speak a list of strings in order, with a pause between each. Returns a promise.
export async function speakSequence(items, { lang = ACCENTS.US, rate = 1.0, pauseMs = 500 } = {}) {
  for (const text of items) {
    await speak(text, { lang, rate });
    await delay(pauseMs);
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
