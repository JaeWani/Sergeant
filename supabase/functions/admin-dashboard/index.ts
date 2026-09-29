import { corsHeaders, json } from '../_shared/http.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';

type AdminAction =
  | 'dashboard'
  | 'submissions'
  | 'question_texts'
  | 'save_question_texts'
  | 'analysis_contents'
  | 'save_analysis_contents'
  | 'report_document'
  | 'save_report_document';

type AdminRequest = {
  password?: unknown;
  action?: unknown;
  questions?: unknown;
  analysisContents?: unknown;
  documentTexts?: unknown;
};

const careerTypeCodes = ['R', 'I', 'A', 'S', 'E', 'C'] as const;
type CareerTypeCode = typeof careerTypeCodes[number];
const reportDocumentKeys = [
  'document_title', 'profile_name_label', 'profile_type_label',
  'primary_heading', 'intro', 'notice', 'reference_heading',
  'reference_r_label', 'reference_r_description',
  'reference_i_label', 'reference_i_description',
  'reference_a_label', 'reference_a_description',
  'reference_s_label', 'reference_s_description',
  'reference_e_label', 'reference_e_description',
  'reference_c_label', 'reference_c_description',
] as const;
type ReportDocumentKey = typeof reportDocumentKeys[number];

async function hashText(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function passwordsMatch(provided: string, expected: string) {
  const [providedHash, expectedHash] = await Promise.all([hashText(provided), hashText(expected)]);
  let difference = 0;
  for (let index = 0; index < providedHash.length; index += 1) difference |= providedHash[index] ^ expectedHash[index];
  return difference === 0;
}

async function countRows(supabase: ReturnType<typeof getSupabaseAdmin>, table: string, statuses?: string[]) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (statuses?.length === 1) query = query.eq('status', statuses[0]);
  if (statuses && statuses.length > 1) query = query.in('status', statuses);
  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

function validateQuestionTexts(value: unknown) {
  if (!Array.isArray(value) || value.length !== 72) throw new Error('72개 문항 문구가 필요합니다.');
  const numbers = new Set<number>();
  return value.map((item) => {
    const record = item as { questionNumber?: unknown; text?: unknown };
    const questionNumber = Number(record.questionNumber);
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!Number.isInteger(questionNumber) || questionNumber < 1 || questionNumber > 72 || numbers.has(questionNumber)) {
      throw new Error('문항 번호가 올바르지 않습니다.');
    }
    if (text.length < 1 || text.length > 500) throw new Error(`${questionNumber}번 문항 문구를 확인해 주세요.`);
    numbers.add(questionNumber);
    return { question_number: questionNumber, text };
  });
}

async function getQuestionTexts(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('survey_question_texts')
    .select('question_number, text, updated_at')
    .order('question_number');
  if (error) throw new Error(`문항 문구를 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

type ReportDocumentTextRow = { content_key: ReportDocumentKey; text: string; updated_at: string };

function validateReportDocumentTexts(value: unknown) {
  if (!Array.isArray(value) || value.length !== reportDocumentKeys.length) {
    throw new Error('결과지의 고정 문구를 모두 저장해야 합니다.');
  }
  const keys = new Set<string>();
  return value.map((item) => {
    const record = item as { contentKey?: unknown; text?: unknown };
    const contentKey = typeof record.contentKey === 'string' ? record.contentKey : '';
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!reportDocumentKeys.includes(contentKey as ReportDocumentKey) || keys.has(contentKey)) {
      throw new Error('결과지 문구 항목이 올바르지 않습니다.');
    }
    if (text.length < 1 || text.length > 12000) throw new Error(`${contentKey} 문구를 확인해 주세요.`);
    keys.add(contentKey);
    return { content_key: contentKey as ReportDocumentKey, text };
  });
}

function reportDocumentStatus(rows: ReportDocumentTextRow[]) {
  const updatedAt = rows.reduce<string | null>((latest, row) => !latest || row.updated_at > latest ? row.updated_at : latest, null);
  return {
    texts: rows,
    savedCount: rows.length,
    editableCount: reportDocumentKeys.length,
    state: rows.length === 0 ? 'baseline' : rows.length === reportDocumentKeys.length ? 'customized' : 'partial',
    updatedAt,
  };
}

async function getReportDocument(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('report_document_texts')
    .select('content_key, text, updated_at')
    .order('content_key');
  if (error) throw new Error(`결과지 문구를 불러오지 못했습니다. ${error.message}`);
  return reportDocumentStatus((data ?? []) as ReportDocumentTextRow[]);
}

async function saveReportDocument(supabase: ReturnType<typeof getSupabaseAdmin>, value: unknown) {
  const { data, error } = await supabase
    .from('report_document_texts')
    .upsert(validateReportDocumentTexts(value), { onConflict: 'content_key' })
    .select('content_key, text, updated_at')
    .order('content_key');
  if (error) throw new Error(`결과지 문구를 저장하지 못했습니다. ${error.message}`);
  return reportDocumentStatus(data as ReportDocumentTextRow[]);
}

function validateAnalysisContents(value: unknown) {
  if (!Array.isArray(value) || value.length !== careerTypeCodes.length) {
    throw new Error('6개 유형의 분석자료가 모두 필요합니다.');
  }

  const types = new Set<string>();
  return value.map((item) => {
    const record = item as { typeCode?: unknown; label?: unknown; detail?: unknown };
    const typeCode = typeof record.typeCode === 'string' ? record.typeCode : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const detail = typeof record.detail === 'string' ? record.detail.trim() : '';
    if (!careerTypeCodes.includes(typeCode as CareerTypeCode) || types.has(typeCode)) {
      throw new Error('분석자료 유형이 올바르지 않습니다.');
    }
    if (label.length < 1 || label.length > 120) throw new Error(`${typeCode} 유형의 제목을 확인해 주세요.`);
    if (detail.length < 1 || detail.length > 12000) throw new Error(`${typeCode} 유형의 분석 문구를 확인해 주세요.`);
    types.add(typeCode);
    return { type_code: typeCode as CareerTypeCode, label, detail };
  });
}

type AnalysisContentRow = {
  id: string;
  type_code: CareerTypeCode;
  version: string;
  label: string;
  detail: string;
  created_at: string;
};

async function getAnalysisContents(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('type_contents')
    .select('id, type_code, version, label, detail, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`분석자료를 불러오지 못했습니다. ${error.message}`);

  const currentByType = new Map<CareerTypeCode, AnalysisContentRow>();
  for (const row of (data ?? []) as AnalysisContentRow[]) {
    if (careerTypeCodes.includes(row.type_code) && !currentByType.has(row.type_code)) currentByType.set(row.type_code, row);
  }
  if (currentByType.size !== careerTypeCodes.length) throw new Error('현재 사용 중인 6개 유형 분석자료를 모두 찾지 못했습니다.');
  return careerTypeCodes.map((typeCode) => currentByType.get(typeCode)!);
}

async function saveAnalysisContents(supabase: ReturnType<typeof getSupabaseAdmin>, value: unknown) {
  const updates = validateAnalysisContents(value);
  const current = await getAnalysisContents(supabase);
  const currentByType = new Map(current.map((row) => [row.type_code, row]));
  const results = await Promise.all(updates.map(async (update) => {
    const existing = currentByType.get(update.type_code);
    if (!existing) throw new Error(`${update.type_code} 유형의 현재 분석자료를 찾지 못했습니다.`);
    const { data, error } = await supabase
      .from('type_contents')
      .update({ label: update.label, detail: update.detail })
      .eq('id', existing.id)
      .select('id, type_code, version, label, detail, created_at')
      .single();
    if (error) throw new Error(`${update.type_code} 유형 분석자료를 저장하지 못했습니다. ${error.message}`);
    return data as AnalysisContentRow;
  }));
  return careerTypeCodes.map((typeCode) => results.find((row) => row.type_code === typeCode)!);
}

async function getBrevoAccountStatus() {
  const updatedAt = new Date().toISOString();
  const apiKey = Deno.env.get('BREVO_API_KEY');
  if (!apiKey) return { state: 'unavailable', plan: null, dailyLimit: null, remaining: null, accountCredits: null, updatedAt, reason: 'Brevo API 키가 설정되지 않았습니다.' };

  try {
    const response = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': apiKey } });
    if (!response.ok) return { state: 'unavailable', plan: null, dailyLimit: null, remaining: null, accountCredits: null, updatedAt, reason: `Brevo 계정 조회 실패 (${response.status})` };

    const account = await response.json() as { plan?: Array<{ type?: unknown; credits?: unknown; creditsType?: unknown }> };
    const plans = (account.plan ?? []).map((plan) => ({
      type: typeof plan.type === 'string' ? plan.type : '',
      credits: typeof plan.credits === 'number' && Number.isFinite(plan.credits) ? plan.credits : null,
      creditsType: typeof plan.creditsType === 'string' ? plan.creditsType : '',
    }));
    const freePlan = plans.find((plan) => plan.type.toLowerCase() === 'free');
    const sendLimitPlan = plans.find((plan) => plan.creditsType === 'sendLimit' && plan.type.toLowerCase() === 'free')
      ?? plans.find((plan) => plan.creditsType === 'sendLimit');
    const accountCredits = sendLimitPlan?.credits ?? null;
    const dailyLimit = freePlan ? 300 : null;
    // Brevo calls this field `credits` with `creditsType: sendLimit`.  It is
    // shown as account-provided send credits.  A daily ratio is only shown when
    // the account itself identifies the plan as Free (whose daily allowance is 300).
    const remaining = dailyLimit !== null && accountCredits !== null && accountCredits >= 0 && accountCredits <= dailyLimit
      ? accountCredits
      : null;
    return {
      state: 'available',
      plan: freePlan ? 'free' : (plans.find((plan) => plan.type)?.type ?? 'unknown'),
      dailyLimit,
      remaining,
      accountCredits,
      updatedAt,
      reason: remaining !== null
        ? 'Brevo 계정 API의 sendLimit 크레딧을 표시합니다.'
        : accountCredits !== null
          ? 'Brevo 계정 API가 발송 크레딧을 반환했지만, 일일 한도와의 관계를 확인할 수 없습니다.'
          : 'Brevo 계정 API에서 발송 크레딧 값을 받지 못했습니다.',
    };
  } catch {
    return { state: 'unavailable', plan: null, dailyLimit: null, remaining: null, accountCredits: null, updatedAt, reason: 'Brevo 계정 정보를 확인하지 못했습니다.' };
  }
}

async function getDashboard(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const [submissions, waiting, processing, reportReview, emailReview, brevo] = await Promise.all([
    countRows(supabase, 'submissions'),
    countRows(supabase, 'email_jobs', ['queued', 'retry']),
    countRows(supabase, 'email_jobs', ['sending']),
    countRows(supabase, 'reports', ['awaiting_upload', 'failed']),
    countRows(supabase, 'email_jobs', ['failed']),
    getBrevoAccountStatus(),
  ]);
  return {
    submissions,
    waiting,
    processing,
    needsReview: reportReview + emailReview,
    brevo,
  };
}

async function getSubmissions(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from('submissions')
    .select(`
      id, name, commission_year, mbti, email, consented_at, created_at,
      answers (question_number, score),
      score_results (primary_type, score_r, score_i, score_a, score_s, score_e, score_c),
      reports (id, status, storage_path, uploaded_at, email_jobs (id, status, attempts, provider_message_id, last_error, sent_at, created_at))
    `)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(`제출자 목록을 불러오지 못했습니다: ${error.message}`);
  return data ?? [];
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const expectedPassword = Deno.env.get('ADMIN_DASHBOARD_PASSWORD');
    if (!expectedPassword) return json({ error: '관리자 비밀번호가 설정되지 않았습니다.' }, 503);
    const body = await request.json() as AdminRequest;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!(await passwordsMatch(password, expectedPassword))) return json({ error: '관리자 비밀번호가 올바르지 않습니다.' }, 401);

    const action = (typeof body.action === 'string' ? body.action : 'dashboard') as AdminAction;
    const supabase = getSupabaseAdmin();
    if (action === 'dashboard') return json(await getDashboard(supabase));
    if (action === 'submissions') return json(await getSubmissions(supabase));
    if (action === 'question_texts') return json(await getQuestionTexts(supabase));
    if (action === 'save_question_texts') {
      const { data, error } = await supabase
        .from('survey_question_texts')
        .upsert(validateQuestionTexts(body.questions), { onConflict: 'question_number' })
        .select('question_number, text, updated_at')
        .order('question_number');
      if (error) throw new Error(`문항 문구를 저장하지 못했습니다: ${error.message}`);
      return json(data ?? []);
    }
    if (action === 'analysis_contents') return json(await getAnalysisContents(supabase));
    if (action === 'save_analysis_contents') return json(await saveAnalysisContents(supabase, body.analysisContents));
    if (action === 'report_document') return json(await getReportDocument(supabase));
    if (action === 'save_report_document') return json(await saveReportDocument(supabase, body.documentTexts));
    return json({ error: '지원하지 않는 관리자 요청입니다.' }, 400);
  } catch (error) {
    console.error('admin-dashboard failed', error);
    return json({ error: '관리자 정보를 불러오지 못했습니다.' }, 500);
  }
});
