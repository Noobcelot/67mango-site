<script setup>
import { ref, computed } from 'vue';
import { fetchWordReports } from '../supabase.js';

const props = defineProps({
  show: Boolean,
});

const emit = defineEmits(['close']);

const reports = ref([]);
const loading = ref(false);
const error = ref('');
const searchQuery = ref('');

const filteredReports = computed(() => {
  if (!searchQuery.value) return reports.value;
  const q = searchQuery.value.toLowerCase();
  return reports.value.filter(r =>
    r.word.toLowerCase().includes(q) ||
    r.report_type.toLowerCase().includes(q)
  );
});

const reportCounts = computed(() => {
  return {
    total: reports.value.length,
    missing: reports.value.filter(r => r.report_type === 'missing').length,
    bogus: reports.value.filter(r => r.report_type === 'bogus').length,
  };
});

async function loadReports() {
  loading.value = true;
  error.value = '';
  try {
    reports.value = await fetchWordReports();
  } catch (e) {
    error.value = 'Failed to load reports.';
  } finally {
    loading.value = false;
  }
}

function open() {
  searchQuery.value = '';
  loadReports();
}

defineExpose({ open });

function close() {
  emit('close');
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getReportBadgeClass(reportType) {
  return reportType === 'missing' ? 'badge-missing' : 'badge-bogus';
}

function getReportBadgeLabel(reportType) {
  return reportType === 'missing' ? '+ Missing' : '- Bogus';
}
</script>

<template>
  <Transition name="dialog-fade">
    <div v-if="show" class="dialog-backdrop" @click.self="close">
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Word reports">
        <button class="dialog-close" @click="close" aria-label="Close">&times;</button>

        <div class="dialog-header">
          <h2 class="dialog-title">Word Reports</h2>
          <p class="dialog-subtitle">{{ reportCounts.total }} reports total</p>
        </div>

        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-value">{{ reportCounts.missing }}</div>
            <div class="stat-label">Missing</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ reportCounts.bogus }}</div>
            <div class="stat-label">Bogus</div>
          </div>
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search words..."
          class="search-input"
        />

        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>Loading reports...</p>
        </div>

        <div v-else-if="filteredReports.length === 0" class="empty-state">
          <p>No reports found.</p>
        </div>

        <div v-else class="reports-table-container">
          <table class="reports-table">
            <thead>
              <tr>
                <th>Word</th>
                <th>Type</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="report in filteredReports" :key="report.id" class="report-row">
                <td class="cell-word">
                  <strong>{{ report.word }}</strong>
                  <span v-if="report.note" class="note-indicator" title="This report has a note">📝</span>
                </td>
                <td class="cell-type">
                  <span :class="['badge', getReportBadgeClass(report.report_type)]">
                    {{ getReportBadgeLabel(report.report_type) }}
                  </span>
                </td>
                <td class="cell-date">{{ formatDate(report.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-primary" @click="close">Close</button>
        </div>
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
  max-width: 720px;
  max-height: 80vh;
  position: relative;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
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

.dialog-header {
  margin-bottom: 24px;
}

.dialog-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px;
}

.dialog-subtitle {
  font-size: 14px;
  color: var(--text-muted);
  margin: 0;
}

.stats-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--fragment-bg);
  border-radius: 10px;
  padding: 16px 12px;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.search-input {
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 20px;
  border: 1.5px solid var(--input-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.search-input:focus { border-color: var(--accent); }

.error-message {
  color: var(--error);
  font-size: 13px;
  padding: 12px 14px;
  background: var(--error-subtle);
  border-radius: 8px;
  margin-bottom: 16px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  color: var(--text-muted);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  color: var(--text-muted);
  font-size: 14px;
}

.reports-table-container {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 20px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.reports-table thead {
  position: sticky;
  top: 0;
  background: var(--fragment-bg);
}

.reports-table th {
  padding: 12px 14px;
  text-align: left;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-color);
}

.report-row {
  border-bottom: 1px solid var(--border-color);
  transition: background 0.15s;
}
.report-row:hover { background: var(--hover-bg); }

.reports-table td {
  padding: 12px 14px;
  color: var(--text-secondary);
}

.cell-word {
  font-weight: 500;
  color: var(--text-primary);
}

.note-indicator {
  margin-left: 6px;
  opacity: 0.6;
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 11px;
  white-space: nowrap;
}

.badge-missing {
  background: rgba(34, 197, 94, 0.1);
  color: var(--success);
}

.badge-bogus {
  background: var(--error-subtle);
  color: var(--error);
}

.cell-date {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
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

.btn-primary { background: var(--accent); color: #fff; }

.dialog-fade-enter-active,
.dialog-fade-leave-active { transition: opacity 0.2s; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .dialog {
    max-height: 90vh;
    padding: 24px;
  }

  .stats-row {
    grid-template-columns: 1fr 1fr;
  }

  .reports-table {
    font-size: 12px;
  }

  .reports-table th,
  .reports-table td {
    padding: 10px 10px;
  }
}
</style>
