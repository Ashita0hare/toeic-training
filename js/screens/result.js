export async function renderResult(root, navigate, result) {
  if (!result) {
    root.innerHTML = `<p>結果が見つかりません。</p><div class="bottom-bar"><button id="btn-home" class="btn btn-primary btn-wide">ホームへ</button></div>`;
    document.getElementById('btn-home').addEventListener('click', () => navigate('home'));
    return;
  }

  const allSections = [
    ['単語', result.vocab],
    ['応答問題 (Part2)', result.part2],
    ['ディクテーション', result.dictation],
    ['短文穴埋め (Part5)', result.part5],
    ['長文穴埋め (Part6)', result.part6],
    ['読解 (Part7)', result.part7],
    ['言い換えドリル', result.paraphrase],
  ];
  const sections = allSections.filter(([, v]) => v && v.total > 0);
  const totalCorrect = sections.reduce((s, [, v]) => s + v.correct, 0);
  const totalCount = sections.reduce((s, [, v]) => s + v.total, 0);
  const minutes = Math.max(1, Math.round((result.durationSec || 0) / 60));

  root.innerHTML = `
    <div class="center" style="flex:0;">
      <h1>お疲れさまでした 🎉</h1>
      <p class="hint">所要時間 約${minutes}分</p>
      <div class="card" style="width:100%;">
        <h2 style="margin-top:0;">結果</h2>
        ${sections
          .map(
            ([label, v]) =>
              `<div class="result-row"><span>${label}</span><span>${v.correct} / ${v.total}</span></div>`
          )
          .join('')}
        <div class="result-row" style="border-bottom:none; font-weight:700;">
          <span>合計</span><span>${totalCorrect} / ${totalCount}</span>
        </div>
      </div>
    </div>
    ${
      result.wrongItems && result.wrongItems.length
        ? `<div class="card">
            <h2 style="margin-top:0;">間違えた項目（${result.wrongItems.length}件）</h2>
            ${result.wrongItems
              .map(
                (w) => `
              <div style="margin-bottom:14px; padding-bottom:10px; border-bottom:1px solid var(--bg-elev-2);">
                <p class="pill">${labelForType(w.type)}</p>
                <p style="margin:6px 0;">${escapeHtml(w.en)}</p>
                <p class="hint">${escapeHtml(w.ja || '')}</p>
                ${w.explanation ? `<p class="hint">${escapeHtml(w.explanation)}</p>` : ''}
              </div>`
              )
              .join('')}
          </div>`
        : ''
    }
    <div class="bottom-bar">
      <button id="btn-home" class="btn btn-primary btn-wide btn-lg">ホームに戻る</button>
    </div>
  `;
  document.getElementById('btn-home').addEventListener('click', () => navigate('home'));
}

function labelForType(type) {
  return {
    vocab: '単語',
    part2: 'Part2',
    dictation: 'ディクテーション',
    part5: 'Part5',
    part6: 'Part6',
    part7: 'Part7',
    paraphrase: '言い換え',
  }[type] || type;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
