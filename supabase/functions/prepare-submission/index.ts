import { validateAndPrepareSubmission } from '../_shared/assessment.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';

const TEMPLATE_VERSION = 'sergeant-2026-01';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const input = await request.json();
    const prepared = validateAndPrepareSubmission(input);
    const supabase = getSupabaseAdmin();

    const { data: content, error: contentError } = await supabase
      .from('type_contents')
      .select('type_code, version, label, detail')
      .in('type_code', prepared.primaryTypes)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (contentError || !content?.length) throw new Error('결과 해설 콘텐츠를 찾을 수 없습니다.');
    const contentsByCode = new Map();
    for (const item of content) if (!contentsByCode.has(item.type_code)) contentsByCode.set(item.type_code, item);
    const primaryContents = prepared.primaryTypes.map((type) => contentsByCode.get(type)).filter(Boolean);
    if (primaryContents.length !== prepared.primaryTypes.length) throw new Error('결과 해설 콘텐츠를 찾을 수 없습니다.');
    const primaryLabels = primaryContents.map((item) => item!.label);
    const primaryDescription = primaryContents.map((item) => item!.detail).join('\n\n');
    const secondaryContent = prepared.secondaryType ? contentsByCode.get(prepared.secondaryType) : null;

    const { data: documentTexts, error: documentTextsError } = await supabase
      .from('report_document_texts')
      .select('content_key, text');
    if (documentTextsError) throw new Error('결과지 문구를 불러오지 못했습니다.');

    const provisionalId = crypto.randomUUID();
    const storagePath = `submissions/${provisionalId}/${TEMPLATE_VERSION}.pdf`;
    const { data: submissionId, error: submissionError } = await supabase.rpc(
      'create_prepared_submission',
      {
        p_name: prepared.name,
        p_commission_year: prepared.commissionYear,
        p_mbti: prepared.mbti,
        p_email: prepared.email,
        p_calculation_version: prepared.calculationVersion,
        p_answers: prepared.answers,
        p_scores: prepared.scores,
        p_primary_type: prepared.primaryType,
        p_primary_types: prepared.primaryTypes,
        p_secondary_type: prepared.secondaryType,
        p_is_tie: prepared.isTie,
        p_is_close: prepared.isClose,
        p_content_version: primaryContents[0]!.version,
        p_template_version: TEMPLATE_VERSION,
        p_storage_path: storagePath,
      },
    );

    if (submissionError || !submissionId) throw new Error('설문 저장을 준비하지 못했습니다.');

    const { data: upload, error: uploadError } = await supabase.storage
      .from('reports')
      .createSignedUploadUrl(storagePath);
    if (uploadError || !upload) throw new Error('PDF 업로드 주소를 만들지 못했습니다.');

    return json({
      submissionId,
      report: {
        templateVersion: TEMPLATE_VERSION,
        storagePath,
        signedUploadUrl: upload.signedUrl,
        uploadToken: upload.token,
      },
      result: {
        name: prepared.name,
        primaryType: primaryLabels.join(' · '),
        primaryTypes: primaryLabels,
        secondaryType: secondaryContent?.label ?? null,
        isTie: prepared.isTie,
        isClose: prepared.isClose,
        aptitudeDescription: primaryDescription,
        scores: prepared.scores,
        contentVersion: primaryContents[0]!.version,
        documentTexts: Object.fromEntries((documentTexts ?? []).map((item) => [item.content_key, item.text])),
      },
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
    return json({ error: message }, 400);
  }
});
