# Supabase 백엔드 구성

## 구성 요소

- `migrations/202609230001_initial_assessment_schema.sql`: 설문, 응답, 점수, PDF, 이메일 작업 테이블과 자동 큐 생성 트리거
- `functions/prepare-submission`: 브라우저 설문값을 서버에서 재계산하고 PDF 업로드 URL을 발급
- `functions/complete-submission`: 업로드 PDF의 형식·크기·SHA-256을 검증하고 이메일 작업을 생성
- `functions/send-report-email`: 비공개 Storage PDF를 Brevo 트랜잭션 이메일 API로 첨부 발송

## 배포 순서

1. Supabase 프로젝트를 만들고 `reports` Storage 버킷은 비공개 상태로 유지한다.
2. Supabase CLI로 마이그레이션을 적용한다.
3. `supabase/functions/.env.example`을 복사해 실제 값으로 채운 뒤, 해당 파일은 커밋하지 않는다.
4. Secrets를 프로젝트에 설정한다.
5. 세 Edge Function을 배포한다.
6. Dashboard의 Database Webhooks에서 `public.email_jobs` 테이블의 `INSERT` 이벤트를 `send-report-email` 함수에 연결한다.
   - HTTP 헤더 `Authorization: Bearer <INTERNAL_WEBHOOK_SECRET>`를 설정한다.
   - Service Role Key가 아닌 별도 랜덤 비밀값을 사용한다.
7. Brevo에서 발신 도메인과 `BREVO_SENDER_EMAIL`을 인증한다.

## 애플리케이션 연결

1. 프로젝트 루트의 `.env.example`을 `.env.local`로 복사하고 Dashboard의 API Settings에서 발급한 Publishable Key를 입력한다. 이 키와 프로젝트 URL만 브라우저에 둔다.
2. `supabase/functions/.env.example`을 복사한 비공개 파일에 Brevo 값과 `INTERNAL_WEBHOOK_SECRET`을 채운 뒤 `supabase secrets set --env-file <비공개-env-파일>`로 등록한다. Hosted Edge Function은 `SUPABASE_URL`과 서버 키를 자동 주입하므로 별도 등록하지 않는다. 이 값들은 브라우저나 Git에 넣지 않는다.
3. `prepare-submission`, `complete-submission`, `send-report-email`, `retry-email-jobs`를 배포한다. `send-report-email`과 `retry-email-jobs`는 config.toml에서 JWT 검증을 끄고 자체 webhook secret을 검증한다.
4. Database Webhook은 `public.email_jobs`의 INSERT 이벤트를 `send-report-email`에 POST한다. URL은 `https://<project-ref>.supabase.co/functions/v1/send-report-email`이고 Authorization 헤더는 `Bearer <INTERNAL_WEBHOOK_SECRET>`이다.
5. Supabase Cron 또는 외부 스케줄러가 5분마다 `retry-email-jobs`를 같은 Authorization 헤더와 함께 POST하도록 설정한다. 이 함수가 `retry` 상태이며 재시도 시간이 지난 이메일을 최대 20건씩 다시 발송한다.

브라우저는 `prepare-submission`으로 서버 검증과 저장 준비를 요청하고, 반환된 서명 URL로 생성한 PDF를 업로드한 뒤, SHA-256과 함께 `complete-submission`을 호출한다. 업로드가 검증되면 이메일 작업이 생성된다.

## 필요한 Secrets

| 이름 | 용도 |
| --- | --- |
| `SUPABASE_URL` | 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function의 DB·비공개 Storage 접근 |
| `BREVO_API_KEY` | Brevo 트랜잭션 이메일 API 호출 |
| `BREVO_SENDER_EMAIL` | 인증된 발신자 이메일 |
| `BREVO_SENDER_NAME` | 수신자에게 보일 발신자명 |
| `INTERNAL_WEBHOOK_SECRET` | Database Webhook에서 발송 함수로 전달하는 별도 인증값 |

## 발송 상태

`reports.status`가 `ready`로 변경되면 트리거가 `email_jobs`의 `queued` 작업을 만든다. Database Webhook이 해당 작업을 발송 함수로 전달하고, 함수는 상태를 `sending`, `sent`, `retry`, `failed` 중 하나로 갱신한다.

`retry` 작업은 기본적으로 최대 3회까지 지수 백오프를 사용한다. 운영 환경에서는 Supabase Cron 또는 관리자 재발송 기능을 추가해 재시도 대기 작업을 다시 호출한다.
