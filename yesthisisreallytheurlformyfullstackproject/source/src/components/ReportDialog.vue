<script setup>
import { ref } from 'vue';
import { submitWordReport } from '../supabase.js';

const props = defineProps({
  show: Boolean,
  currentWord: String,
});

const emit = defineEmits(['close']);

const reportType = ref('missing');
const customWord = ref('');
const note = ref('');
const submitting = ref(false);
const submitted = ref(false);
const error = ref('');

function open() {
  customWord.value = '';
  note.value = '';
  reportType.value = 'missing';
  submitted.value = false;
  error.value = '';
}

defineExpose({ open });

async function handleSubmit() {
  const word = customWord.value.trim().toUpperCase() || props.currentWord?.toUpperCase() || '';
  if (!word) {
    error.value = 'Please enter a word.';
    return;
  }
  submitting.value = true;
  error.value = '';
  try {
    await submitWordReport(word, reportType.value, note.value.trim());
    submitted.value = true;
  } catch (e) {
    error.value = 'Failed to submit report. Please try again.';
  } finally {
    submitting.value = false;
  }
}

function close() {
  emit('close');
  submitted.value = false;
  error.value = '';
}
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="show" class="dialog-backdrop" @click.self="close">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Report a word">
        <button class="dialog-close" @click="close" aria-label="Close">&times;</button>

        <template v-if="!submitted">
          <h2 class="dialog-title">Report a Word</h2>
          <p class="dialog-subtitle">Help improve the dictionary by reporting missing or bogus words.</p>

          <div class="field">
            <label class="field-label">Report type</label>
            <div class="radio-group">
              <label class="radio-option" :class="{ active: reportType === 'missing' }">
                <input type="radio" v-model="reportType" value="missing" />
                <span class="radio-icon">&#43;</span>
                <span>
                  <strong>Missing word</strong>
                  <span class="radio-desc">This word should be in the dictionary</span>
                </span>
              </label>
              <label class="radio-option" :class="{ active: reportType === 'bogus' }">
                <input type="radio" v-model="reportType" value="bogus" />
                <span class="radio-icon">&#8722;</span>
                <span>
                  <strong>Bogus word</strong>
                  <span class="radio-desc">This word should not be in the dictionary</span>
                </span>
              </label>
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="report-word">Word</label>
            <input
              id="report-word"
              v-model="customWord"
              class="field-input"
              type="text"
              :placeholder="currentWord || 'Enter a word...'"
              maxlength="50"
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <div class="field">
            <label class="field-label" for="report-note">Note <span class="optional">(optional)</span></label>
            <textarea
              id="report-note"
              v-model="note"
              class="field-input field-textarea"
              placeholder="Any additional context..."
              rows="3"
              maxlength="500"
            ></textarea>
          </div>

          <p v-if="error" class="field-error">{{ error }}</p>

          <div class="dialog-actions">
            <button class="btn btn-secondary" @click="close">Cancel</button>
            <button class="btn btn-primary" @click="handleSubmit" :disabled="submitting">
              {{ submitting ? 'Submitting...' : 'Submit Report' }}
            </button>
          </div>
        </template>

        <template v-else>
          <div class="success-state">
            <div class="success-icon">&#10003;</div>
            <h2 class="dialog-title">Report Submitted</h2>
            <p class="dialog-subtitle">Thanks for helping improve the dictionary!</p>
            <button class="btn btn-primary" @click="close">Done</button>
          </div>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.dialog {
  background: var(--dialog-bg);
  border: 1px solid var(--dialog-border);
  border-radius: 16px;
  padding: 32px;
  width: 100%;
  max-width: 460px;
  position: relative;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
}

.dialog-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 22px;
  color: var(--text-muted);
  cursor: pointer;
  line-height: 1;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}
.dialog-close:hover { background: var(--hover-bg); color: var(--text-primary); }

.dialog-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.dialog-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0 0 24px;
}

.field { margin-bottom: 20px; }

.field-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-muted);
}

.field-input {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid var(--input-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 15px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
  font-family: inherit;
}
.field-input:focus { border-color: var(--accent); }

.field-textarea { resize: vertical; min-height: 80px; }

.field-error {
  color: var(--error);
  font-size: 13px;
  margin: -12px 0 16px;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.radio-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border: 1.5px solid var(--input-border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.radio-option:hover { border-color: var(--accent); }
.radio-option.active { border-color: var(--accent); background: var(--accent-subtle); }

.radio-option input[type="radio"] { display: none; }

.radio-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.radio-option.active .radio-icon { background: var(--accent); color: #fff; }

.radio-option strong {
  display: block;
  font-size: 14px;
  color: var(--text-primary);
}

.radio-desc {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 8px;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.1s;
}
.btn:hover { opacity: 0.88; }
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-primary { background: var(--accent); color: #fff; }
.btn-secondary { background: var(--hover-bg); color: var(--text-primary); }

.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 16px 0 8px;
  gap: 12px;
}

.success-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--success-subtle);
  color: var(--success);
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 0.2s; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
</style>
