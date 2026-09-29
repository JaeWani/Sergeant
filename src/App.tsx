import { type FormEvent, useEffect, useMemo, useState } from 'react';

import {
  careerTypes,
  scoreLabels,
  surveyQuestions,
  type CareerTypeCode,
  type SurveyQuestion,
} from './features/survey/questions';
import { createReportPdf } from './lib/reportPdf';
import { invokeFunction, sha256Hex, uploadSignedPdf, type PreparedSubmissionResponse } from './lib/supabase';
import { AdminPage } from './features/admin/AdminPage';

const QUESTIONS_PER_PAGE = 6;
const testMbtiOptions = ['INTJ', 'ENFP', 'ISTP', 'ESFJ', 'INFJ', 'ESTP'];

type Answers = Partial<Record<number, number>>;

type Profile = {
  consent: boolean;
  name: string;
  commissionYear: string;
  mbti: string;
  email: string;
};

type Result = {
  scores: Record<CareerTypeCode, number>;
  primaryType: string;
  deliveryMessage: string;
  reportPdf: Blob;
};

type QuestionTextOverride = {
  question_number: number;
  text: string;
};

const initialProfile: Profile = {
  consent: false,
  name: '',
  commissionYear: '',
  mbti: '',
  email: '',
};

function App() {
  if (window.location.hash === '#/admin') return <AdminPage />;

  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [answers, setAnswers] = useState<Answers>({});
  const [page, setPage] = useState(0);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questions, setQuestions] = useState<SurveyQuestion[]>(surveyQuestions);

  useEffect(() => {
    invokeFunction<QuestionTextOverride[]>('survey-questions', {})
      .then((overrides) => {
        const textByNumber = new Map(overrides.map((item) => [item.question_number, item.text]));
        setQuestions(surveyQuestions.map((question) => ({
          ...question,
          text: textByNumber.get(question.id) ?? question.text,
        })));
      })
      .catch(() => {
        // The embedded wording remains available if the content endpoint is unavailable.
      });
  }, []);

  const pageCount = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
  const currentQuestions = questions.slice(
    page * QUESTIONS_PER_PAGE,
    (page + 1) * QUESTIONS_PER_PAGE,
  );
  const answeredCount = Object.keys(answers).length;
  const completion = Math.round((answeredCount / questions.length) * 100);
  const isDevelopment = import.meta.env.DEV;

  const profileError = useMemo(() => {
    if (!profile.consent) return '개인정보 수집 및 이용에 동의해 주세요.';
    if (!profile.name.trim()) return '이름 또는 별칭을 입력해 주세요.';
    if (!/^\d{4}$/.test(profile.commissionYear)) return '임관년도는 네 자리 숫자로 입력해 주세요.';
    if (!profile.email.trim()) return '결과지를 받을 이메일을 입력해 주세요.';

    const normalizedEmail = profile.email.trim().toLowerCase();
    const domain = normalizedEmail.split('@')[1] ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return '이메일 형식을 확인해 주세요.';
    }
    if (domain === 'army.mil' || domain.endsWith('.army.mil')) {
      return 'army.mil 도메인 이메일은 사용할 수 없습니다.';
    }

    return '';
  }, [profile]);

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setMessage('');
  }

  function selectAnswer(questionId: number, value: number) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setMessage('');
  }

  function fillTestAnswers() {
    const testAnswers = Object.fromEntries(
      questions.map((question) => [question.id, ((question.id * 7) % 5) + 1]),
    ) as Answers;
    setAnswers(testAnswers);
    setPage(pageCount - 1);
    setMessage('테스트용 응답 72문항을 자동으로 채웠습니다. 이메일을 확인한 뒤 제출하세요.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function createRandomTestAnswers() {
    return Object.fromEntries(
      questions.map((question) => [question.id, Math.floor(Math.random() * 5) + 1]),
    ) as Answers;
  }

  async function prepareAndDeliverReport(submissionProfile: Profile, submissionAnswers: Answers) {
    const prepared = await invokeFunction<PreparedSubmissionResponse>('prepare-submission', {
      consent: submissionProfile.consent,
      profile: {
        name: submissionProfile.name,
        commissionYear: submissionProfile.commissionYear,
        mbti: submissionProfile.mbti,
        email: submissionProfile.email,
      },
      answers: submissionAnswers,
      calculationVersion: '2026-01',
    });
    const pdf = await createReportPdf({
      name: prepared.result.name,
      primaryType: prepared.result.primaryType,
      aptitudeDescription: prepared.result.aptitudeDescription,
      documentTexts: prepared.result.documentTexts,
    });
    await uploadSignedPdf(prepared.report.signedUploadUrl, pdf);
    await invokeFunction('complete-submission', {
      submissionId: prepared.submissionId,
      storagePath: prepared.report.storagePath,
      sha256: await sha256Hex(pdf),
    });

    return { prepared, pdf };
  }

  async function sendTenRandomTestReports() {
    const recipient = profile.email.trim().toLowerCase();
    const domain = recipient.split('@')[1] ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || domain === 'army.mil' || domain.endsWith('.army.mil')) {
      setPage(0);
      setMessage('테스트 결과를 받을 올바른 이메일 주소를 먼저 입력해 주세요.');
      return;
    }

    const runId = Math.random().toString(36).slice(2, 8);
    let succeeded = 0;
    let firstError = '';
    setIsSubmitting(true);

    try {
      // Sequential execution releases each browser-created PDF before rendering the next one.
      for (let index = 1; index <= 10; index += 1) {
        setMessage(`개발 테스트 ${index}/10: PDF 생성·업로드·이메일 요청 중입니다.`);
        const testProfile: Profile = {
          consent: true,
          name: `개발 테스트 ${runId}-${index}`,
          commissionYear: String(2010 + Math.floor(Math.random() * 17)),
          mbti: testMbtiOptions[Math.floor(Math.random() * testMbtiOptions.length)],
          email: recipient,
        };

        try {
          await prepareAndDeliverReport(testProfile, createRandomTestAnswers());
          succeeded += 1;
        } catch (error) {
          firstError ||= error instanceof Error ? error.message : '알 수 없는 오류';
        }
      }

      setMessage(
        succeeded === 10
          ? `개발 테스트 10/10건의 PDF 업로드와 이메일 요청이 완료되었습니다. ${recipient} 받은편지함을 확인해 주세요.`
          : `개발 테스트 완료: ${succeeded}/10건 성공${firstError ? ` (첫 오류: ${firstError})` : ''}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function validateCurrentPage() {
    if (page === 0 && profileError) {
      setMessage(profileError);
      return false;
    }

    if (currentQuestions.some((question) => answers[question.id] === undefined)) {
      setMessage('현재 페이지의 모든 문항에 답해 주세요.');
      return false;
    }

    return true;
  }

  function goToNextPage() {
    if (!validateCurrentPage()) return;
    setPage((current) => Math.min(current + 1, pageCount - 1));
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goToPreviousPage() {
    setPage((current) => Math.max(current - 1, 0));
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (profileError) {
      setPage(0);
      setMessage(profileError);
      return;
    }

    const firstMissingQuestion = questions.find(
      (question) => answers[question.id] === undefined,
    );
    if (firstMissingQuestion) {
      setPage(Math.floor((firstMissingQuestion.id - 1) / QUESTIONS_PER_PAGE));
      setMessage(`${firstMissingQuestion.id}번 문항에 답해 주세요.`);
      return;
    }

    setIsSubmitting(true);
    setMessage('결과지를 생성하고 안전하게 저장하고 있습니다. 잠시만 기다려 주세요.');

    try {
      const { prepared, pdf } = await prepareAndDeliverReport(profile, answers);

      setResult({
        scores: prepared.result.scores as Record<CareerTypeCode, number>,
      primaryType: prepared.result.primaryType,
      deliveryMessage: `${profile.email.trim()}로 결과지를 발송할 준비가 완료되었습니다. 이메일이 도착할 때까지 잠시 기다려 주세요.`,
        reportPdf: pdf,
      });
      setMessage('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '결과지 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetSurvey() {
    setProfile(initialProfile);
    setAnswers({});
    setPage(0);
    setResult(null);
    setMessage('');
  }

  function downloadReport() {
    if (!result) return;

    const safeName = profile.name.trim().replace(/[\\/:*?"<>|]/g, '_') || '응답자';
    const downloadUrl = URL.createObjectURL(result.reportPdf);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `부사관_진로적성검사_결과지_${safeName}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  }

  if (result) {
    return (
      <main className="app-shell">
        <section className="result-card" aria-labelledby="result-title">
          <p className="eyebrow">부사관 진로적성검사</p>
          <h1 id="result-title">{profile.name.trim()}님의 설문 결과</h1>
          <p className="result-lead">주요 진로 유형은 <strong>{result.primaryType}</strong>입니다.</p>

          <div className="score-grid" aria-label="유형별 점수">
            {careerTypes.map((type) => (
              <article className="score-card" key={type.code}>
                <span>{type.label}</span>
                <strong>{result.scores[type.code]}점</strong>
                <small>60점 만점</small>
              </article>
            ))}
          </div>
          <section className="result-delivery" aria-labelledby="delivery-title">
            <div className="result-delivery-heading">
              <h2 id="delivery-title">결과지 받기</h2>
              <p className="result-note">{result.deliveryMessage}</p>
            </div>
            <div className="result-delivery-actions">
              <button className="email-delivery-button" type="button" disabled>
                <span>이메일로 결과 받기</span>
                <small>{profile.email.trim()}로 발송 요청됨</small>
              </button>
              <button className="download-report-button" type="button" onClick={downloadReport}>
                <span>결과지 다운로드</span>
                <small>PDF 파일로 바로 저장</small>
              </button>
            </div>
          </section>
          <button className="secondary-button" type="button" onClick={resetSurvey}>
            새 설문 시작
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <form className="survey-card" onSubmit={submitSurvey} noValidate>
        <header className="survey-header">
          <p className="eyebrow">부사관 진로적성검사</p>
          <h1>나의 직무 성향 알아보기</h1>
          <p>총 72문항이며, 약 10분이 소요됩니다. 각 문항을 읽고 가장 가까운 응답을 선택해 주세요.</p>
          {isDevelopment && (
            <div className="test-tools">
              <button className="test-fill-button" type="button" onClick={fillTestAnswers} disabled={isSubmitting}>
                테스트용 72문항 자동 선택
              </button>
              <button className="test-fill-button" type="button" onClick={sendTenRandomTestReports} disabled={isSubmitting}>
                현재 이메일로 랜덤 10회 전송
              </button>
            </div>
          )}
        </header>

        {page === 0 && (
          <section className="profile-section" aria-labelledby="profile-title">
            <h2 id="profile-title">개인정보 및 기본 정보</h2>
            <p className="section-description">개인정보 제공에 동의한 응답자에게만 결과지를 이메일로 발송합니다.</p>

            <label className="consent-field">
              <input
                type="checkbox"
                checked={profile.consent}
                onChange={(event) => updateProfile('consent', event.target.checked)}
              />
              <span>개인정보 수집 및 이용에 동의합니다. (필수)</span>
            </label>

            <div className="profile-grid">
              <label>
                이름 또는 별칭 <span aria-hidden="true">*</span>
                <input
                  value={profile.name}
                  onChange={(event) => updateProfile('name', event.target.value)}
                  autoComplete="name"
                  maxLength={40}
                  placeholder="이름 또는 별칭 입력"
                />
              </label>
              <label>
                임관년도 <span aria-hidden="true">*</span>
                <input
                  value={profile.commissionYear}
                  onChange={(event) => updateProfile('commissionYear', event.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="예: 2026"
                />
              </label>
              <label>
                MBTI <small>(선택)</small>
                <input
                  value={profile.mbti}
                  onChange={(event) => updateProfile('mbti', event.target.value.toUpperCase())}
                  maxLength={4}
                  placeholder="예: INTJ"
                />
              </label>
              <label>
                이메일 <span aria-hidden="true">*</span>
                <input
                  value={profile.email}
                  onChange={(event) => updateProfile('email', event.target.value)}
                  inputMode="email"
                  autoComplete="email"
                  placeholder="example@email.com"
                />
              </label>
            </div>
          </section>
        )}

        <section className="question-section" aria-labelledby="questions-title">
          <div className="section-heading">
            <div>
              <p className="section-kicker">5점 척도</p>
              <h2 id="questions-title">문항 {currentQuestions[0].id}~{currentQuestions.at(-1)?.id}</h2>
            </div>
            <span className="required-mark">모든 문항 필수</span>
          </div>

          <div className="question-list">
            {currentQuestions.map((question) => (
              <fieldset className="question-card" key={question.id}>
                <legend>
                  <span className="question-number">{question.id}</span>
                  {question.text}
                </legend>
                <div className="scale-options">
                  {scoreLabels.map((option) => (
                    <label className="scale-option" key={option.value}>
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.value}
                        checked={answers[question.id] === option.value}
                        onChange={() => selectAnswer(question.id, option.value)}
                      />
                      <span className="scale-number">{option.value}</span>
                      <span className="scale-label">{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>

        {message && <p className="form-message" role="alert">{message}</p>}

        <section className="progress-section" aria-label="설문 진행 상황">
          <div className="progress-label">
            <span>응답 완료 {answeredCount} / {questions.length}</span>
            <span>{completion}%</span>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-value" style={{ width: `${completion}%` }} />
          </div>
          <p>문항 묶음 {page + 1} / {pageCount}</p>
        </section>

        <footer className="survey-actions">
          <button className="secondary-button" type="button" onClick={goToPreviousPage} disabled={page === 0}>
            이전
          </button>
          {page < pageCount - 1 ? (
            <button className="primary-button" type="button" onClick={goToNextPage}>
              다음 문항
            </button>
          ) : (
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '결과지 생성 중...' : '결과 확인 및 이메일 발송'}
            </button>
          )}
        </footer>
      </form>
    </main>
  );
}

export default App;
