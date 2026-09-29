import { corsHeaders, json } from '../_shared/http.ts';
import { getSupabaseAdmin } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('survey_question_texts')
      .select('question_number, text')
      .order('question_number');
    if (error) throw error;
    return json(data ?? []);
  } catch (error) {
    console.error('survey-questions failed', error);
    return json({ error: '설문 문항을 불러오지 못했습니다.' }, 500);
  }
});
