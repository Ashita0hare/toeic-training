// Picks which items to show today, prioritizing previously-wrong items while still rotating content.
export function pickItems(allItems, statsByKey, type, count) {
  const now = Date.now();
  const scored = allItems.map((item) => {
    const key = `${type}:${item.id}`;
    const st = statsByKey[key];
    const daysSince = st && st.lastShown ? (now - st.lastShown) / 86400000 : 9999;
    const wrongCount = (st && st.wrongCount) || 0;
    const score = wrongCount * 50 + Math.min(daysSince, 30);
    return { item, score, rand: Math.random(), key };
  });
  scored.sort((a, b) => b.score - a.score || a.rand - b.rand);

  const poolSize = Math.min(scored.length, Math.max(count * 3, count));
  const pool = scored.slice(0, poolSize);
  shuffle(pool);
  return pool.slice(0, count).map((x) => x.item);
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function statsMapByKey(rows) {
  const map = {};
  for (const r of rows) map[r.key] = r;
  return map;
}
