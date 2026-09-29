import { encodeBase64 } from 'jsr:@std/encoding/base64';

import { json } from '../_shared/http.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';

type DatabaseWebhook = {
  record?: { id?: string };
};

function backoffMinutes(attempt: number) {
  return Math.min(60, 5 * 2 ** Math.max(0, attempt - 1));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('authorization') !== `Bearer ${Deno.env.get('INTERNAL_WEBHOOK_SECRET')}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const payload = await request.json() as DatabaseWebhook;
  const jobId = payload.record?.id;
  if (!jobId) return json({ error: 'Missing email job ID' }, 400);

  const supabase = getSupabaseAdmin();

  const { data: claimedJobs, error: claimError } = await supabase.rpc('claim_email_job', { p_job_id: jobId });
  if (claimError) return json({ error: 'Unable to claim email job' }, 500);
  if (!claimedJobs || claimedJobs.length === 0) return json({ status: 'ignored' });

  const job = claimedJobs[0] as { id: string; report_id: string; recipient_email: string; attempts: number };

  try {
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('storage_path, submission:submissions!inner(name)')
      .eq('id', job.report_id)
      .eq('status', 'ready')
      .maybeSingle();
    if (reportError || !report) throw new Error('발송할 PDF를 찾을 수 없습니다.');

    const { data: pdf, error: pdfError } = await supabase.storage.from('reports').download(report.storage_path);
    if (pdfError || !pdf) throw new Error('PDF를 읽지 못했습니다.');

    const name = (report.submission as { name: string }).name;
    const safeName = escapeHtml(name);
    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('BREVO_API_KEY') ?? '',
      },
      body: JSON.stringify({
        sender: {
          email: Deno.env.get('BREVO_SENDER_EMAIL'),
          name: Deno.env.get('BREVO_SENDER_NAME') ?? '부사관 진로적성검사',
        },
        to: [{ email: job.recipient_email, name }],
        subject: '[부사관 진로적성검사] 결과지 안내',
        htmlContent: `<p>${safeName}님, 부사관 진로적성검사 결과지를 첨부합니다.</p><p>본 결과는 자기이해와 진로 상담을 돕기 위한 참고 자료입니다.</p><p>문의 또는 개인정보 삭제 요청은 안내된 연락처로 보내 주세요.</p>`,
        attachment: [{
          name: '부사관_진로적성검사_결과지.pdf',
          content: encodeBase64(new Uint8Array(await pdf.arrayBuffer())),
        }],
      }),
    });

    const responseBody = await brevoResponse.json() as { messageId?: string; message?: string };
    if (!brevoResponse.ok || !responseBody.messageId) {
      throw new Error(responseBody.message ?? 'Brevo 발송 요청이 거부되었습니다.');
    }

    await supabase
      .from('email_jobs')
      .update({ status: 'sent', provider_message_id: responseBody.messageId, sent_at: new Date().toISOString() })
      .eq('id', job.id);

    return json({ status: 'sent', messageId: responseBody.messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 발송 오류';
    const retry = job.attempts < 3;
    await supabase
      .from('email_jobs')
      .update({
        status: retry ? 'retry' : 'failed',
        last_error: message.slice(0, 1000),
        next_attempt_at: new Date(Date.now() + backoffMinutes(job.attempts) * 60_000).toISOString(),
      })
      .eq('id', job.id);

    return json({ status: retry ? 'retry' : 'failed' }, 502);
  }
});
