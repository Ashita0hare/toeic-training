// Loads the static question/vocab JSON (served from ./data/, cached by the service worker).
const cache = {};

async function loadJson(path) {
  if (cache[path]) return cache[path];
  const res = await fetch(path);
  if (!res.ok) throw new Error(`failed to load ${path}`);
  const data = await res.json();
  cache[path] = data;
  return data;
}

export const loadWords = () => loadJson('./data/words.json');
export const loadPart2 = () => loadJson('./data/part2.json');
export const loadPart5 = () => loadJson('./data/part5.json');
export const loadDictation = () => loadJson('./data/dictation.json');
export const loadPart34 = () => loadJson('./data/part34.json');
