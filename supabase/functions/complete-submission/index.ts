import { corsHeaders, json } from '../_shared/http.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';

const MAX_PDF_BYTES = 5 * 1024 * 1024;

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    const submissionId = String(body.submissionId ?? '');
    const storagePath = String(body.storagePath ?? '');
    const declaredHash = String(body.sha256 ?? '').toLowerCase();

    if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new Error('유효하지 않은 설문 ID입니다.');
    if (!/^[a-f0-9]{64}$/.test(declaredHash)) throw new Error('유효하지 않은 PDF 해시입니다.');

    const supabase = getSupabaseAdmin();

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('id, storage_path, status')
      .eq('submission_id', submissionId)
      .maybeSingle();

    if (reportError || !report || report.status !== 'awaiting_upload' || report.storage_path !== storagePath) {
      throw new Error('PDF 업로드 상태를 확인할 수 없습니다.');
    }

    const { data: pdf, error: downloadError } = await supabase.storage.from('reports').download(storagePath);
    if (downloadError || !pdf) throw new Error('업로드된 PDF를 찾을 수 없습니다.');
    if (pdf.size < 5 || pdf.size > MAX_PDF_BYTES) throw new Error('PDF 파일 크기를 확인해 주세요.');

    const bytes = await pdf.arrayBuffer();
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    if (header !== '%PDF-') throw new Error('PDF 형식의 파일만 업로드할 수 있습니다.');

    const digest = await crypto.subtle.digest('SHA-256', bytes);
    if (toHex(digest) !== declaredHash) throw new Error('PDF 무결성 검증에 실패했습니다.');

    const { error: updateError } = await supabase
      .from('reports')
      .update({ status: 'ready', sha256: declaredHash, byte_size: pdf.size, uploaded_at: new Date().toISOString() })
      .eq('id', report.id)
      .eq('status', 'awaiting_upload');

    if (updateError) throw new Error('PDF 저장 상태를 완료하지 못했습니다.');
    return json({ reportId: report.id, status: 'ready' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return json({ error: message }, 400);
  }
});
