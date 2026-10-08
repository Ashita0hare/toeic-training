import { getAll, getSetting } from '../db.js';
import { loadWords, loadPart2, loadPart5, loadDictation, loadPart34, loadPart6, loadPart7, loadParaphrase } from '../data.js';

const TYPE_LABELS = {
  vocab: '単語',
  part2: 'Part2',
  part5: 'Part5',
  dictation: 'ディクテーション',
  part34: 'Part3/4',
  part6: 'Part6',
  part7: 'Part7',
  paraphrase: '言い換え',
};

export async function renderRecords(root, navigate) {
  const [streak, sessionLog, srsRows, itemStatsRows] = await Promise.all([
    getSetting('streakCount', 0),
    getAll('sessionLog'),
    getAll('srs'),
    getAll('itemStats'),
  ]);

  root.innerHTML = `
    <h1>学習記録</h1>

    <div class="streak-row">
      <div><div class="stat-number">${streak || 0}</div><div class="hint">連続学習日数</div></div>
      <div><div class="stat-number">${sessionLog.length}</div><div class="hint">合計セッション数</div></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">パート別正答率（累計）</h2>
      <div id="part-bars"></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">リーディング解答速度</h2>
      <div id="reading-speed"><p class="hint">読み込み中…</p></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">直近のセッション</h2>
      <div id="recent-sessions"></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">苦手な単語</h2>
      <div id="weak-words"><p class="hint">読み込み中…</p></div>
    </div>

    <div class="card">
      <h2 style="margin-top:0;">苦手な問題</h2>
      <div id="weak-items"><p class="hint">読み込み中…</p></div>
    </div>

    <div class="bottom-bar">
      <button id="btn-home" class="btn btn-primary btn-wide btn-lg">ホームに戻る</button>
    </div>
  `;
  document.getElementById('btn-home').addEventListener('click', () => navigate('home'));

  // ---- per-part accumulated accuracy ----
  const PART_KEYS = ['vocab', 'part2', 'dictation', 'part5', 'part6', 'part7', 'paraphrase'];
  const totals = Object.fromEntries(PART_KEYS.map((k) => [k, [0, 0]]));
  sessionLog.forEach((s) => {
    PART_KEYS.forEach((k) => {
      if (s[k]) {
        totals[k][0] += s[k].correct || 0;
        totals[k][1] += s[k].total || 0;
      }
    });
  });
  const barsEl = document.getElementById('part-bars');
  if (sessionLog.length === 0) {
    barsEl.innerHTML = '<p class="hint">まだ記録がありません。今日のセッションをやってみましょう。</p>';
  } else {
    barsEl.innerHTML = Object.entries(totals)
      .map(([k, [c, t]]) => {
        const pct = t > 0 ? Math.round((c / t) * 100) : 0;
        return `
          <div class="bar-row">
            <div class="bar-label"><span>${TYPE_LABELS[k]}</span><span>${t > 0 ? `${c}/${t}（${pct}%）` : '記録なし'}</span></div>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          </div>
        `;
      })
      .join('');
  }

  // ---- recent sessions ----
  const recentEl = document.getElementById('recent-sessions');
  if (sessionLog.length === 0) {
    recentEl.innerHTML = '<p class="hint">まだ記録がありません。</p>';
  } else {
    const recent = [...sessionLog].reverse().slice(0, 7);
    recentEl.innerHTML = recent
      .map((s) => {
        const c = PART_KEYS.reduce((sum, k) => sum + (s[k]?.correct || 0), 0);
        const t = PART_KEYS.reduce((sum, k) => sum + (s[k]?.total || 0), 0);
        const track = s.readingTrack ? `　<span class="pill">${s.readingTrack}日</span>` : '';
        return `<div class="result-row"><span>${s.date}${track}</span><span>${c} / ${t}</span></div>`;
      })
      .join('');
  }

  // ---- reading speed: average answer time per reading part, and WPM trend for Part7 ----
  const speedEl = document.getElementById('reading-speed');
  const readingParts = ['part5', 'part6', 'part7', 'paraphrase'];
  const avgTimeRows = readingParts
    .map((k) => {
      const allTimes = [];
      sessionLog.forEach((s) => {
        if (s[k]?.answerTimesMs?.length) allTimes.push(...s[k].answerTimesMs);
      });
      if (!allTimes.length) return null;
      const avgSec = (allTimes.reduce((a, b) => a + b, 0) / allTimes.length / 1000).toFixed(1);
      return `<div class="wpm-row"><span>${TYPE_LABELS[k]} 平均解答時間</span><span>${avgSec}秒</span></div>`;
    })
    .filter(Boolean);

  const wpmSessions = sessionLog.filter((s) => s.part7?.wpmSamples?.length);
  let wpmTrendHtml = '';
  if (wpmSessions.length) {
    const recentWpm = wpmSessions.slice(-7);
    wpmTrendHtml =
      '<p class="hint" style="margin-top:10px;">Part7 WPM（読む速度）推移</p>' +
      recentWpm
        .map((s) => {
          const avg = Math.round(s.part7.wpmSamples.reduce((a, b) => a + b, 0) / s.part7.wpmSamples.length);
          return `<div class="wpm-row"><span>${s.date}</span><span>${avg} WPM</span></div>`;
        })
        .join('');
  }

  if (!avgTimeRows.length && !wpmTrendHtml) {
    speedEl.innerHTML = '<p class="hint">リーディングの記録はまだありません。</p>';
  } else {
    speedEl.innerHTML = avgTimeRows.join('') + wpmTrendHtml;
  }

  // ---- weak words (from srs store) ----
  const weakWordsEl = document.getElementById('weak-words');
  const words = await loadWords();
  const wordsById = {};
  words.forEach((w) => (wordsById[w.id] = w));
  const weakWords = srsRows
    .filter((r) => (r.wrongCount || 0) > 0)
    .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
    .slice(0, 10);
  if (weakWords.length === 0) {
    weakWordsEl.innerHTML = '<p class="hint">苦手な単語はまだありません。</p>';
  } else {
    weakWordsEl.innerHTML = weakWords
      .map((r) => {
        const w = wordsById[r.id];
        if (!w) return '';
        return `<div class="weak-item"><div><div class="weak-main">${escapeHtml(w.en)}</div><div class="weak-sub">${escapeHtml(w.ja)}</div></div><div class="weak-count">${r.wrongCount}回</div></div>`;
      })
      .join('');
  }

  // ---- weak items (from itemStats store, cross-referenced against data files) ----
  const weakItemsEl = document.getElementById('weak-items');
  const weak = itemStatsRows
    .filter((r) => (r.wrongCount || 0) > 0)
    .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
    .slice(0, 10);
  if (weak.length === 0) {
    weakItemsEl.innerHTML = '<p class="hint">苦手な問題はまだありません。</p>';
  } else {
    const [part2, part5, dictation, part34, part6, part7, paraphrase] = await Promise.all([
      loadPart2(),
      loadPart5(),
      loadDictation(),
      loadPart34(),
      loadPart6(),
      loadPart7(),
      loadParaphrase(),
    ]);
    const lookup = {
      part2: Object.fromEntries(part2.map((x) => [x.id, x.questionEn])),
      part5: Object.fromEntries(part5.map((x) => [x.id, x.sentence])),
      dictation: Object.fromEntries(dictation.map((x) => [x.id, x.en])),
      part34: Object.fromEntries(part34.map((x) => [x.id, x.script[0]?.en || ''])),
      part6: Object.fromEntries(part6.map((x) => [x.id, x.segments.find((s) => s.type === 'text')?.en || x.id])),
      part7: Object.fromEntries(part7.map((x) => [x.id, x.passage])),
      paraphrase: Object.fromEntries(paraphrase.map((x) => [x.id, x.original])),
    };
    weakItemsEl.innerHTML = weak
      .map((r) => {
        const text = lookup[r.type]?.[r.itemId] || r.itemId;
        return `<div class="weak-item"><div><div class="weak-main">${escapeHtml(truncate(text, 60))}</div><div class="weak-sub">${TYPE_LABELS[r.type] || r.type}</div></div><div class="weak-count">${r.wrongCount}回</div></div>`;
      })
      .join('');
  }
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
