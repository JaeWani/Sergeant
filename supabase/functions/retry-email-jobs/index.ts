import { json } from '../_shared/http.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';

const MAX_JOBS_PER_RUN = 20;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('authorization') !== `Bearer ${Deno.env.get('INTERNAL_WEBHOOK_SECRET')}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const internalSecret = Deno.env.get('INTERNAL_WEBHOOK_SECRET') ?? '';
  const supabase = getSupabaseAdmin();
  const { data: jobs, error } = await supabase
    .from('email_jobs')
    .select('id')
    .eq('status', 'retry')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(MAX_JOBS_PER_RUN);

  if (error) return json({ error: '재시도 작업을 조회하지 못했습니다.' }, 500);

  const results = await Promise.allSettled((jobs ?? []).map(async ({ id }) => {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-report-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${internalSecret}` },
      body: JSON.stringify({ record: { id } }),
    });
    if (!response.ok) throw new Error(`Email job ${id} failed`);
  }));

  return json({ queued: jobs?.length ?? 0, dispatched: results.filter((result) => result.status === 'fulfilled').length });
});
