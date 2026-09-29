import { createClient } from 'npm:@supabase/supabase-js@2';

export function getSupabaseAdmin() {
  const rawSecretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  let secretKeys: Record<string, string> = {};
  if (rawSecretKeys) {
    try {
      secretKeys = JSON.parse(rawSecretKeys) as Record<string, string>;
    } catch {
      // Fall back to the legacy server-only key below. This keeps functions
      // compatible while Supabase key environments are being migrated.
    }
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const secretKey = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !secretKey) throw new Error('관리자용 Supabase 서버 키를 찾을 수 없습니다.');
  return createClient(url, secretKey);
}
