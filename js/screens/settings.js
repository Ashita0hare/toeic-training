import { getSetting, setSetting, getAll, putMany } from '../db.js';
import { ACCENTS, checkAccentAvailability, primeVoices, speak, isSpeechSupported } from '../speech.js';

export async function renderSettings(root, navigate) {
  const accent = (await getSetting('accent', ACCENTS.US)) || ACCENTS.US;
  const rate = (await getSetting('rate', 1.0)) || 1.0;
  const dictationMode = (await getSetting('dictationMode', 'tap')) || 'tap';

  root.innerHTML = `
    <h1>設定</h1>

    <div class="card">
      <h2>アクセント</h2>
      <div class="choice-grid">
        <button class="choice-btn" data-accent="${ACCENTS.US}">🇺🇸 米語 (en-US)</button>
        <button class="choice-btn" data-accent="${ACCENTS.GB}">🇬🇧 英語 (en-GB)</button>
        <button class="choice-btn" data-accent="${ACCENTS.AU}">🇦🇺 豪語 (en-AU)</button>
      </div>
      <p class="hint" id="voice-diag" style="margin-top:10px;"></p>
    </div>

    <div class="card">
      <h2>再生速度: <span id="rate-label">${rate.toFixed(1)}x</span></h2>
      <input type="range" id="rate-slider" min="0.8" max="1.2" step="0.1" value="${rate}" style="width:100%" />
      <button id="btn-test-speak" class="btn btn-secondary btn-wide" style="margin-top:10px;">試聴する</button>
    </div>

    <div class="card">
      <h2>ディクテーションの回答方法</h2>
      <div class="choice-grid">
        <button class="choice-btn" data-mode="tap">タップで並べ替え（標準）</button>
        <button class="choice-btn" data-mode="type">キーボードで入力</button>
      </div>
    </div>

    <div class="card">
      <h2>学習記録のバックアップ・引き継ぎ</h2>
      <p class="hint">スマホとPCの間で記録を移すときは、ここでエクスポートしたファイルを別の端末で読み込んでください。</p>
      <button id="btn-export" class="btn btn-secondary btn-wide" style="margin-bottom:8px;">記録をエクスポート（書き出し）</button>
      <label class="btn btn-secondary btn-wide" style="display:block; text-align:center;">
        記録をインポート（読み込み）
        <input type="file" id="file-import" accept="application/json" style="display:none;" />
      </label>
      <p class="hint" id="import-status" style="margin-top:8px;"></p>
    </div>

    <div class="card">
      <h2>ストレージ</h2>
      <p class="hint" id="storage-status">確認中...</p>
    </div>

    <div class="bottom-bar">
      <button id="btn-back" class="btn btn-primary btn-wide">ホームへ戻る</button>
    </div>
  `;

  function markSelected() {
    root.querySelectorAll('[data-accent]').forEach((b) => {
      b.classList.toggle('correct', b.dataset.accent === accentState.accent);
    });
    root.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('correct', b.dataset.mode === accentState.dictationMode);
    });
  }

  const accentState = { accent, dictationMode };
  markSelected();

  root.querySelectorAll('[data-accent]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      accentState.accent = btn.dataset.accent;
      await setSetting('accent', accentState.accent);
      markSelected();
    });
  });

  root.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      accentState.dictationMode = btn.dataset.mode;
      await setSetting('dictationMode', accentState.dictationMode);
      markSelected();
    });
  });

  const rateSlider = document.getElementById('rate-slider');
  rateSlider.addEventListener('input', () => {
    document.getElementById('rate-label').textContent = `${parseFloat(rateSlider.value).toFixed(1)}x`;
  });
  rateSlider.addEventListener('change', async () => {
    await setSetting('rate', parseFloat(rateSlider.value));
  });

  document.getElementById('btn-test-speak').addEventListener('click', () => {
    speak('This is a sample sentence for the listening practice.', {
      lang: accentState.accent,
      rate: parseFloat(rateSlider.value),
    }).catch(() => {});
  });

  document.getElementById('btn-back').addEventListener('click', () => navigate('home'));

  // --- voice diagnostics ---
  const diagEl = document.getElementById('voice-diag');
  if (!isSpeechSupported()) {
    diagEl.innerHTML = '読み上げ機能(Web Speech API)がこの端末では使えません。';
  } else {
    await primeVoices();
    const avail = checkAccentAvailability();
    const lines = [];
    for (const [label, lang] of [['米語', ACCENTS.US], ['英語', ACCENTS.GB], ['豪語', ACCENTS.AU]]) {
      lines.push(`${label}(${lang}): ${avail[lang] ? '利用可能' : '見つかりません'}`);
    }
    diagEl.innerHTML = lines.join('<br>');
    if (!avail[ACCENTS.GB] || !avail[ACCENTS.AU]) {
      diagEl.innerHTML +=
        '<br><br>見つからないアクセントがある場合: Androidの「設定 > システム > 言語と入力 > テキスト読み上げの出力 > Google音声合成エンジンの設定 > 音声データ」で該当言語の音声データをダウンロードしてください（ダウンロード後は一度オンラインが必要です）。';
    }
  }

  // --- storage persistence status ---
  const storageEl = document.getElementById('storage-status');
  if (navigator.storage && navigator.storage.persisted) {
    const persisted = await navigator.storage.persisted();
    storageEl.textContent = persisted
      ? '学習記録は保護モードで保存されています（容量不足時も消えにくい）。'
      : '保護モードが未許可です。ブラウザの設定でこのサイトのデータ保存を許可すると、消えにくくなります。';
  } else {
    storageEl.textContent = 'この端末ではストレージ保護状態を確認できません。';
  }

  // --- export ---
  document.getElementById('btn-export').addEventListener('click', async () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      srs: await getAll('srs'),
      itemStats: await getAll('itemStats'),
      sessionLog: await getAll('sessionLog'),
      settings: await getAll('settings'),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `toeic15-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  // --- import ---
  document.getElementById('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById('import-status');
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.srs) await putMany('srs', data.srs);
      if (data.itemStats) await putMany('itemStats', data.itemStats);
      if (data.sessionLog) await putMany('sessionLog', data.sessionLog);
      if (data.settings) await putMany('settings', data.settings);
      statusEl.textContent = '読み込み完了。ホームに戻って反映を確認してください。';
      statusEl.style.color = 'var(--good)';
    } catch (err) {
      statusEl.textContent = '読み込みに失敗しました。正しいバックアップファイルか確認してください。';
      statusEl.style.color = 'var(--bad)';
    }
  });
}
