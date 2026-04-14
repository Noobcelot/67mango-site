import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qsblwvirxuaftvwsxuti.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFzYmx3dmlyeHVhZnR2d3N4dXRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTM0NzAsImV4cCI6MjA5MTY4OTQ3MH0.aZ5Kvsg30SOfyRsILsj4YYfIdm_h590a-yCbIPhqSK4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function submitWordReport(word, reportType, note = '') {
  const { error } = await supabase
    .from('word_reports')
    .insert({ word, report_type: reportType, note });
  if (error) throw error;
}

export async function fetchWordReports() {
  const { data, error } = await supabase
    .from('word_reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
