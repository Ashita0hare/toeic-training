import { getSetting } from '../db.js';
import { isSpeechSupported, checkAccentAvailability, primeVoices } from '../speech.js';

export async function renderHome(root, navigate, updateStreakBadge) {
  const lastLog = await getSetting('lastSessionSummary', null);

  root.innerHTML = `
    <div class="center">
      <h1>今日の15分</h1>
      <p class="hint">単語 → 応答問題 → ディクテーション → 短文穴埋め<br>順番にやるだけ。考えなくていい。</p>
      ${lastLog ? `<div class="pill">前回: ${lastLog}</div>` : ''}
      <div id="voice-warning"></div>
    </div>
    <div class="bottom-bar">
      <button id="btn-start" class="btn btn-primary btn-wide btn-lg">今日のセッションを始める</button>
    </div>
  `;

  document.getElementById('btn-start').addEventListener('click', () => navigate('session'));

  if (updateStreakBadge) updateStreakBadge();

  // Warn (don't block) if speech synthesis or accent voices look unavailable.
  if (!isSpeechSupported()) {
    document.getElementById('voice-warning').innerHTML =
      '<p class="hint" style="color:var(--warn)">この端末は読み上げ(Web Speech API)に対応していません。設定から詳細を確認してください。</p>';
    return;
  }
  await primeVoices();
  const avail = checkAccentAvailability();
  if (!avail['en-US']) {
    document.getElementById('voice-warning').innerHTML =
      '<p class="hint" style="color:var(--warn)">英語の音声データが見つかりません。⚙️設定から案内を確認してください。</p>';
  }
}
