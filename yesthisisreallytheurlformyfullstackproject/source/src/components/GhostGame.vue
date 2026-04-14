<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { buildTrie, getComputerMove } from '../gameEngine.js';
import ReportDialog from './ReportDialog.vue';

const hardMode = ref(true);

const trie = ref(null);
const loading = ref(true);
const currentNode = ref(null);
const currentWord = ref('');
const gameStatus = ref('playing');
const computerLetter = ref('');
const invalidInput = ref(false);
const history = ref([]);
const showReport = ref(false);
const reportDialog = ref(null);
const letterInput = ref('');
const inputEl = ref(null);
const thinkingDelay = ref(false);

onMounted(async () => {
  const res = await fetch('/words.txt');
  const text = await res.text();
  const words = text.trim().split('\n').map(w => w.trim().toUpperCase()).filter(Boolean);
  trie.value = buildTrie(words);
  currentNode.value = trie.value;
  loading.value = false;
  await nextTick();
  inputEl.value?.focus();
});

const currentFragment = computed(() => currentWord.value);
const validLetters = computed(() => {
  if (!currentNode.value) return [];
  return Object.keys(currentNode.value.children);
});

async function handlePlayerInput() {
  if (gameStatus.value !== 'playing' || thinkingDelay.value) return;
  const letter = letterInput.value.trim().toUpperCase();
  letterInput.value = '';
  if (!letter || letter.length !== 1 || !/^[A-Z]$/.test(letter)) return;

  if (!(letter in currentNode.value.children)) {
    invalidInput.value = true;
    setTimeout(() => { invalidInput.value = false; }, 600);
    return;
  }

  currentNode.value = currentNode.value.children[letter];
  currentWord.value += letter;
  history.value.push({ letter, player: 'human' });

  if (currentNode.value.isLeaf) {
    gameStatus.value = 'human-lost';
    return;
  }

  thinkingDelay.value = true;
  await new Promise(r => setTimeout(r, 420));
  thinkingDelay.value = false;

  const move = getComputerMove(currentNode.value, hardMode.value);
  if (!move) {
    gameStatus.value = 'human-won';
    return;
  }

  currentNode.value = currentNode.value.children[move];
  currentWord.value += move;
  computerLetter.value = move;
  history.value.push({ letter: move, player: 'computer' });

  if (currentNode.value.isLeaf) {
    gameStatus.value = 'human-won';
    return;
  }

  setTimeout(() => { computerLetter.value = ''; }, 800);
  await nextTick();
  inputEl.value?.focus();
}

function resetGame() {
  currentNode.value = trie.value;
  currentWord.value = '';
  gameStatus.value = 'playing';
  computerLetter.value = '';
  invalidInput.value = false;
  history.value = [];
  letterInput.value = '';
  thinkingDelay.value = false;
  nextTick(() => inputEl.value?.focus());
}

function openReport() {
  showReport.value = true;
  reportDialog.value?.open();
}

function closeReport() {
  showReport.value = false;
}
</script>

<template>
  <div class="game-page">
    <header class="game-header">
      <div class="header-inner">
        <h1 class="game-logo">Ghost</h1>
        <div class="header-controls">
          <label class="mode-toggle">
            <input type="checkbox" v-model="hardMode" />
            <span>Hard mode</span>
          </label>
          <button class="report-btn" @click="openReport" title="Report a word">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
              <line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            Report a word
          </button>
        </div>
      </div>
    </header>

    <main class="game-main">
      <div v-if="loading" class="loading-state">
        <div class="spinner"></div>
        <p>Loading dictionary...</p>
      </div>

      <template v-else>
        <div class="game-card">
          <div class="fragment-area">
            <div class="fragment-label">Current fragment</div>
            <div class="fragment-display" :class="{ shake: invalidInput, flash: !!computerLetter }">
              <span
                v-for="(entry, i) in history"
                :key="i"
                :class="['fragment-letter', entry.player === 'computer' ? 'letter-computer' : 'letter-human', { 'letter-new': i === history.length - 1 && entry.player === 'computer' }]"
              >{{ entry.letter }}</span>
              <span v-if="!history.length" class="fragment-placeholder">_</span>
            </div>
          </div>

          <div v-if="gameStatus === 'playing'" class="input-area">
            <div class="thinking-bar" v-if="thinkingDelay">
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
              <span class="thinking-dot"></span>
            </div>
            <template v-else>
              <label class="input-label" for="letter-input">Add a letter</label>
              <div class="input-row">
                <input
                  id="letter-input"
                  ref="inputEl"
                  v-model="letterInput"
                  class="letter-input"
                  :class="{ error: invalidInput }"
                  type="text"
                  maxlength="1"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="A-Z"
                  @keydown.enter="handlePlayerInput"
                  @input="letterInput = letterInput.replace(/[^a-zA-Z]/g, '')"
                />
                <button class="submit-btn" @click="handlePlayerInput">Add</button>
              </div>
              <p v-if="invalidInput" class="invalid-hint">That letter doesn't continue any valid word.</p>
              <p v-else class="input-hint">Press Enter or click Add</p>
            </template>
          </div>

          <div v-else class="result-area">
            <div class="result-banner" :class="gameStatus === 'human-won' ? 'result-win' : 'result-lose'">
              <div class="result-icon">{{ gameStatus === 'human-won' ? '&#127881;' : '&#128128;' }}</div>
              <div>
                <div class="result-title">{{ gameStatus === 'human-won' ? 'You win!' : 'You lose!' }}</div>
                <div class="result-word">
                  {{ gameStatus === 'human-won' ? 'The computer completed' : 'You completed' }} the word
                  <strong>&ldquo;{{ currentWord }}&rdquo;</strong>
                </div>
              </div>
            </div>
            <div class="result-actions">
              <button class="btn-play-again" @click="resetGame">Play Again</button>
              <button class="btn-report-word" @click="openReport">Report &ldquo;{{ currentWord }}&rdquo;</button>
            </div>
          </div>
        </div>

        <div class="how-to-play">
          <h2>How to play</h2>
          <ul>
            <li>Players take turns adding one letter to a growing word fragment.</li>
            <li>You must not complete a valid dictionary word.</li>
            <li>The player who completes a real word <strong>loses</strong>.</li>
            <li>You cannot add a letter that makes it impossible to form any word.</li>
          </ul>
        </div>
      </template>
    </main>

    <ReportDialog
      ref="reportDialog"
      :show="showReport"
      :current-word="currentWord || undefined"
      @close="closeReport"
    />
  </div>
</template>

<style scoped>
.game-page {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  background: var(--page-bg);
}

.game-header {
  border-bottom: 1px solid var(--border-color);
  background: var(--header-bg);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-inner {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 24px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.game-logo {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0;
  letter-spacing: -0.5px;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  user-select: none;
}

.mode-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--accent);
}

.report-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1.5px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.report-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-subtle);
}

.game-main {
  flex: 1;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  padding: 40px 24px;
  box-sizing: border-box;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  gap: 16px;
  color: var(--text-muted);
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.game-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 40px 36px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
}

.fragment-area {
  margin-bottom: 36px;
  text-align: center;
}

.fragment-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.fragment-display {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  background: var(--fragment-bg);
  border-radius: 14px;
  padding: 16px 20px;
  transition: background 0.2s;
}

.fragment-letter {
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -1px;
  transition: transform 0.15s;
}

.letter-human { color: var(--accent); }
.letter-computer { color: var(--text-secondary); }

@keyframes pop {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
.letter-new { animation: pop 0.25s ease-out; }

.fragment-placeholder { font-size: 36px; color: var(--text-muted); opacity: 0.4; }

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
.shake { animation: shake 0.3s ease-in-out; }

.input-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.input-label {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.input-row {
  display: flex;
  gap: 10px;
}

.letter-input {
  width: 72px;
  height: 52px;
  text-align: center;
  font-size: 26px;
  font-weight: 700;
  border: 2px solid var(--input-border);
  border-radius: 12px;
  background: var(--input-bg);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
  text-transform: uppercase;
  font-family: inherit;
}
.letter-input:focus { border-color: var(--accent); }
.letter-input.error { border-color: var(--error); animation: shake 0.3s; }

.submit-btn {
  height: 52px;
  padding: 0 24px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}
.submit-btn:hover { opacity: 0.88; }
.submit-btn:active { transform: scale(0.97); }

.input-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.invalid-hint {
  font-size: 12px;
  color: var(--error);
  margin: 0;
}

.thinking-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  color: var(--text-muted);
  font-size: 13px;
}

.thinking-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: bounce 0.6s ease-in-out infinite alternate;
}
.thinking-dot:nth-child(2) { animation-delay: 0.15s; }
.thinking-dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes bounce { from { opacity: 0.3; transform: translateY(0); } to { opacity: 1; transform: translateY(-6px); } }

.result-area { display: flex; flex-direction: column; gap: 20px; }

.result-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 14px;
}

.result-win { background: var(--success-subtle); }
.result-lose { background: var(--error-subtle); }

.result-icon { font-size: 36px; }

.result-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.result-word {
  font-size: 14px;
  color: var(--text-secondary);
}

.result-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-play-again {
  flex: 1;
  padding: 12px 20px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-play-again:hover { opacity: 0.88; }

.btn-report-word {
  flex: 1;
  padding: 12px 20px;
  background: none;
  border: 1.5px solid var(--border-color);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn-report-word:hover { border-color: var(--accent); color: var(--accent); }

.how-to-play {
  margin-top: 36px;
  padding: 28px 32px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
}

.how-to-play h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.how-to-play ul {
  margin: 0;
  padding: 0 0 0 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.how-to-play li {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

@media (max-width: 480px) {
  .game-main { padding: 24px 16px; }
  .game-card { padding: 28px 20px; }
  .fragment-letter { font-size: 28px; }
}
</style>
