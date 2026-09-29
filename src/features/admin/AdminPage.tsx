import { type FormEvent, useMemo, useState } from 'react';

import { invokeFunction } from '../../lib/supabase';
import { defaultReportDocumentTexts, reportDocumentSections, type ReportDocumentKey } from '../../lib/reportDocument';
import { careerTypes, surveyQuestions } from '../survey/questions';

type Page = 'dashboard' | 'submissions' | 'questions' | 'analysis' | 'document';
type OneOrMany<T> = T | T[] | null;
type QuestionText = { question_number: number; text: string; updated_at?: string };
type AnalysisContent = { id: string; type_code: string; version: string; label: string; detail: string; created_at: string };
type DocumentText = { contentKey: ReportDocumentKey; text: string };
type ReportDocumentResponse = {
  texts: Array<{ content_key: ReportDocumentKey; text: string; updated_at: string }>;
  savedCount: number;
  editableCount: number;
  state: 'baseline' | 'customized' | 'partial';
  updatedAt: string | null;
};

type Dashboard = {
  submissions: number;
  waiting: number;
  processing: number;
  needsReview: number;
  brevo: {
    state: 'available' | 'unavailable';
    plan: string | null;
    dailyLimit: number | null;
    remaining: number | null;
    accountCredits: number | null;
    updatedAt: string;
    reason: string;
  };
};

type Submission = {
  id: string;
  name: string;
  email: string;
  commission_year: number;
  mbti: string | null;
  created_at: string;
  answers: OneOrMany<{ question_number: number; score: number }>;
  score_results: OneOrMany<{ primary_type: string; score_r: number; score_i: number; score_a: number; score_s: number; score_e: number; score_c: number }>;
  reports: OneOrMany<{ status: string; uploaded_at: string | null; email_jobs: OneOrMany<{ id: string; status: string; attempts: number; provider_message_id: string | null; last_error: string | null; sent_at: string | null; created_at: string }> }>;
};

function first<T>(value: OneOrMany<T>) { return Array.isArray(value) ? value[0] ?? null : value; }
function formatDate(value: string | null | undefined) { return value ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'; }
function typeName(code: string | undefined) { return careerTypes.find((type) => type.code === code)?.label.replace(/\s*\([A-Z]\)$/, '') ?? ''; }
function emailStatus(job: { status: string } | null) { return job?.status ?? 'no_request'; }
function questionDraftsFrom(overrides: QuestionText[]) {
  const overrideMap = new Map(overrides.map((item) => [item.question_number, item.text]));
  return surveyQuestions.map((question) => ({ question_number: question.id, text: overrideMap.get(question.id) ?? question.text }));
}

export function AdminPage() {
  const [password, setPassword] = useState('');
  const [sessionPassword, setSessionPassword] = useState('');
  const [page, setPage] = useState<Page>('dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [questionDrafts, setQuestionDrafts] = useState<QuestionText[] | null>(null);
  const [analysisContents, setAnalysisContents] = useState<AnalysisContent[] | null>(null);
  const [documentDrafts, setDocumentDrafts] = useState<DocumentText[] | null>(null);
  const [documentStatus, setDocumentStatus] = useState<ReportDocumentResponse | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selected, setSelected] = useState<Submission | null>(null);

  async function request<T>(action: string, body: Record<string, unknown> = {}) {
    return invokeFunction<T>('admin-dashboard', { password: sessionPassword, action, ...body });
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) return setMessage('관리자 비밀번호를 입력해 주세요.');
    setLoading(true); setMessage('');
    try {
      const data = await invokeFunction<Dashboard>('admin-dashboard', { password, action: 'dashboard' });
      setSessionPassword(password); setPassword(''); setDashboard(data); setPage('dashboard');
    } catch (error) { setMessage(error instanceof Error ? error.message : '관리자 인증에 실패했습니다.'); }
    finally { setLoading(false); }
  }

  async function navigate(next: Page) {
    setPage(next); setMessage('');
    if (next === 'submissions' && !submissions) {
      setLoading(true);
      try { setSubmissions(await request<Submission[]>('submissions')); }
      catch (error) { setMessage(error instanceof Error ? error.message : '제출자 목록을 불러오지 못했습니다.'); }
      finally { setLoading(false); }
    }
    if (next === 'questions' && !questionDrafts) {
      setLoading(true);
      try { setQuestionDrafts(questionDraftsFrom(await request<QuestionText[]>('question_texts'))); }
      catch (error) { setMessage(error instanceof Error ? error.message : '설문 문항을 불러오지 못했습니다.'); }
      finally { setLoading(false); }
    }
    if (next === 'analysis' && !analysisContents) {
      setLoading(true);
      try { setAnalysisContents(await request<AnalysisContent[]>('analysis_contents')); }
      catch (error) { setMessage(error instanceof Error ? error.message : '분석자료를 불러오지 못했습니다.'); }
      finally { setLoading(false); }
    }
    if (next === 'document' && !documentDrafts) {
      setLoading(true);
      try {
        const document = await request<ReportDocumentResponse>('report_document');
        const savedTextMap = new Map(document.texts.map((item) => [item.content_key, item.text]));
        setDocumentDrafts(reportDocumentSections.map((section) => ({ contentKey: section.key, text: savedTextMap.get(section.key) ?? defaultReportDocumentTexts[section.key] })));
        setDocumentStatus(document);
      } catch (error) { setMessage(error instanceof Error ? error.message : '결과지 문구를 불러오지 못했습니다.'); }
      finally { setLoading(false); }
    }
  }

  async function saveQuestionTexts() {
    if (!questionDrafts) return;
    setLoading(true); setMessage('');
    try {
      const saved = await request<QuestionText[]>('save_question_texts', {
        questions: questionDrafts.map((question) => ({ questionNumber: question.question_number, text: question.text })),
      });
      setQuestionDrafts(questionDraftsFrom(saved));
      setMessage('72개 문항 문구를 저장했습니다. 이후 설문 화면에 반영됩니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '설문 문구를 저장하지 못했습니다.'); }
    finally { setLoading(false); }
  }

  function updateQuestion(questionNumber: number, text: string) {
    setQuestionDrafts((current) => current?.map((question) => question.question_number === questionNumber ? { ...question, text } : question) ?? null);
  }

  async function saveAnalysisContents() {
    if (!analysisContents) return;
    setLoading(true); setMessage('');
    try {
      const saved = await request<AnalysisContent[]>('save_analysis_contents', {
        analysisContents: analysisContents.map((content) => ({ typeCode: content.type_code, label: content.label, detail: content.detail })),
      });
      setAnalysisContents(saved);
      setMessage('6개 유형의 분석자료를 저장했습니다. 이후 생성되는 결과지에 반영됩니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '분석자료를 저장하지 못했습니다.'); }
    finally { setLoading(false); }
  }

  function updateAnalysis(typeCode: string, field: 'label' | 'detail', value: string) {
    setAnalysisContents((current) => current?.map((content) => content.type_code === typeCode ? { ...content, [field]: value } : content) ?? null);
  }

  async function saveReportDocument() {
    if (!documentDrafts) return;
    setLoading(true); setMessage('');
    try {
      const saved = await request<ReportDocumentResponse>('save_report_document', {
        documentTexts: documentDrafts.map((item) => ({ contentKey: item.contentKey, text: item.text })),
      });
      const savedTextMap = new Map(saved.texts.map((item) => [item.content_key, item.text]));
      setDocumentDrafts(reportDocumentSections.map((section) => ({ contentKey: section.key, text: savedTextMap.get(section.key) ?? defaultReportDocumentTexts[section.key] })));
      setDocumentStatus(saved);
      setMessage('결과지 고정 문구를 저장했습니다. 이후 생성되는 PDF에 반영됩니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '결과지 문구를 저장하지 못했습니다.'); }
    finally { setLoading(false); }
  }

  function updateDocumentText(contentKey: ReportDocumentKey, text: string) {
    setDocumentDrafts((current) => current?.map((item) => item.contentKey === contentKey ? { ...item, text } : item) ?? null);
  }

  function lock() {
    setPassword(''); setSessionPassword(''); setDashboard(null); setSubmissions(null); setQuestionDrafts(null); setAnalysisContents(null); setDocumentDrafts(null); setDocumentStatus(null);
    setSelected(null); setPage('dashboard'); setMessage('');
  }

  const filteredSubmissions = useMemo(() => (submissions ?? []).filter((submission) => {
    const report = first(submission.reports); const job = report ? first(report.email_jobs) : null;
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || submission.name.toLowerCase().includes(term) || submission.email.toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || emailStatus(job) === statusFilter;
    const date = submission.created_at.slice(0, 10);
    return matchesSearch && matchesStatus && (!startDate || date >= startDate) && (!endDate || date <= endDate);
  }), [submissions, search, statusFilter, startDate, endDate]);

  if (!dashboard) return (
    <main className="admin-shell"><section className="admin-login-card" aria-labelledby="admin-login-title">
      <p className="eyebrow">OFFICER CAREER ASSESSMENT</p><h1 id="admin-login-title">관리자 페이지</h1>
      <p>운영 현황과 제출 결과를 확인하려면 관리자 비밀번호를 입력해 주세요.</p>
      <form onSubmit={unlock} className="admin-login-form"><label>관리자 비밀번호<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus /></label>
        {message && <p className="form-message admin-message" role="alert">{message}</p>}<button className="primary-button" disabled={loading}>{loading ? '확인 중…' : '관리자 페이지 열기'}</button></form>
      <a className="admin-back-link" href="/">설문 페이지로 돌아가기</a>
    </section></main>
  );

  const brevo = dashboard.brevo;
  const usableQuota = brevo.remaining !== null && brevo.dailyLimit !== null;
  const ringOffset = usableQuota ? 251.2 * (1 - Math.max(0, Math.min(1, Number(brevo.remaining) / Number(brevo.dailyLimit)))) : 251.2;

  return <main className="admin-shell"><section className="admin-workspace">
    <header className="admin-topbar"><button className="admin-brand" onClick={() => navigate('dashboard')}>부사관 진로적성 · 관리자</button><nav aria-label="관리자 메뉴">
      <button className={page === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}>대시보드</button><button className={page === 'submissions' ? 'active' : ''} onClick={() => navigate('submissions')}>제출자 목록</button><button className={page === 'questions' ? 'active' : ''} onClick={() => navigate('questions')}>설문 문항</button><button className={page === 'analysis' ? 'active' : ''} onClick={() => navigate('analysis')}>분석자료</button><button className={page === 'document' ? 'active' : ''} onClick={() => navigate('document')}>결과지 문서</button></nav><button className="secondary-button" onClick={lock}>로그아웃</button></header>
    {message && <p className="form-message admin-message" role="alert">{message}</p>}
    {page === 'dashboard' && <section className="admin-page"><header className="admin-page-heading"><div><p className="eyebrow">OVERVIEW</p><h1>운영 대시보드</h1><p>제출·결과지·이메일 처리 상태를 빠르게 확인합니다.</p></div></header>
      <div className="admin-summary-grid">
        <button onClick={() => navigate('submissions')}><span>전체 응답</span><strong>{dashboard.submissions.toLocaleString()}건</strong><small>제출자 목록 보기</small></button>
        <button onClick={() => { setStatusFilter('queued'); navigate('submissions'); }}><span>발송 대기</span><strong>{dashboard.waiting.toLocaleString()}건</strong><small>대기·재시도 작업</small></button>
        <button onClick={() => { setStatusFilter('sending'); navigate('submissions'); }}><span>처리 중</span><strong>{dashboard.processing.toLocaleString()}건</strong><small>이메일 발송 요청 처리</small></button>
        <button onClick={() => navigate('submissions')}><span>확인 필요</span><strong>{dashboard.needsReview.toLocaleString()}건</strong><small>PDF·이메일 실패 포함</small></button>
      </div>
      <section className="brevo-card"><div><p className="section-kicker">BREVO DELIVERY</p><h2>Brevo 발송 가능량</h2><p>{brevo.reason}</p><small>계정 플랜: {brevo.plan ?? '확인 불가'} · 마지막 갱신: {formatDate(brevo.updatedAt)}</small></div><div className="quota-ring" aria-label="Brevo 발송 가능량"><svg viewBox="0 0 100 100"><circle className="quota-track" cx="50" cy="50" r="40"/><circle className={usableQuota ? 'quota-value' : 'quota-unknown'} cx="50" cy="50" r="40" style={{ strokeDashoffset: ringOffset }}/></svg><div>{usableQuota ? <><strong>잔여 {brevo.remaining}건</strong><span>하루 한도 {brevo.dailyLimit}건</span></> : brevo.accountCredits !== null ? <><strong>발송 크레딧 {brevo.accountCredits}건</strong><span>{brevo.dailyLimit ? `하루 한도 ${brevo.dailyLimit}건` : '일일 한도 확인 불가'}</span></> : <><strong>잔여량 확인 불가</strong><span>{brevo.dailyLimit ? `하루 한도 ${brevo.dailyLimit}건` : '계정 한도 미확인'}</span></>}</div></div></section>
      <p className="admin-disclaimer">‘Brevo 접수’는 Brevo API가 발송 요청을 수락한 상태입니다. 실제 수신자 전달 완료 여부는 현재 연동에서 별도로 확인하지 않습니다.</p>
    </section>}
    {page === 'submissions' && <section className="admin-page"><header className="admin-page-heading"><div><p className="eyebrow">SUBMISSIONS</p><h1>제출자 목록</h1><p>자세한 점수·응답·발송 이력은 행의 ‘보기’에서 확인합니다.</p></div><button className="secondary-button" onClick={() => navigate('dashboard')}>대시보드로</button></header>
      <div className="admin-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름 또는 이메일 검색"/><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)}/><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)}/><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">전체 발송 상태</option><option value="queued">발송 대기</option><option value="retry">재시도 대기</option><option value="sending">처리 중</option><option value="sent">Brevo 접수</option><option value="failed">확인 필요</option><option value="no_request">발송 요청 없음</option></select></div>
      <div className="admin-table-wrap"><table className="admin-user-table"><thead><tr><th>제출 시각</th><th>제출자</th><th>이메일</th><th>주 유형</th><th>발송 상태</th><th>상세</th></tr></thead><tbody>{filteredSubmissions.map((submission) => { const result = first(submission.score_results); const report = first(submission.reports); const job = report ? first(report.email_jobs) : null; const code = result?.primary_type; return <tr key={submission.id}><td>{formatDate(submission.created_at)}</td><td className="admin-user-name">{submission.name}</td><td>{submission.email}</td><td>{code ? `${code} (${typeName(code)})` : '-'}</td><td><span className={`admin-status admin-status-${emailStatus(job)}`}>{emailStatus(job) === 'sent' ? 'Brevo 접수' : emailStatus(job)}</span></td><td><button className="admin-detail-button" onClick={() => setSelected(submission)}>보기</button></td></tr>; })}{!loading && filteredSubmissions.length === 0 && <tr><td className="admin-empty-cell" colSpan={6}>조건에 맞는 제출자가 없습니다.</td></tr>}</tbody></table></div>
    </section>}
    {page === 'questions' && <section className="admin-page"><header className="admin-page-heading"><div><p className="eyebrow">SURVEY QUESTIONS</p><h1>설문 문항</h1><p>문항 번호와 유형은 고정하고, 응답자에게 보이는 문구만 수정합니다.</p></div><div className="admin-page-actions"><button className="secondary-button" onClick={() => navigate('dashboard')}>대시보드로</button><button className="primary-button" onClick={saveQuestionTexts} disabled={loading || !questionDrafts}>{loading ? '저장 중…' : '문항 문구 저장'}</button></div></header>
      <ol className="admin-question-editor">{questionDrafts?.map((question) => { const definition = surveyQuestions[question.question_number - 1]; return <li key={question.question_number}><label><span>{question.question_number} · {definition.type}<em>{typeName(definition.type)}</em></span><textarea value={question.text} maxLength={500} onChange={(event) => updateQuestion(question.question_number, event.target.value)} /></label><small>{question.text.length}/500</small></li>; })}</ol>
    </section>}
    {page === 'analysis' && <section className="admin-page"><header className="admin-page-heading"><div><p className="eyebrow">V3 ANALYSIS CONTENT</p><h1>분석자료</h1><p>V3 엑셀의 ‘분석자료’ 시트에서 결과지에 쓰이는 6개 유형별 제목과 분석 문구입니다.</p></div><div className="admin-page-actions"><button className="secondary-button" onClick={() => navigate('dashboard')}>대시보드로</button><button className="primary-button" onClick={saveAnalysisContents} disabled={loading || !analysisContents}>{loading ? '저장 중…' : '분석자료 저장'}</button></div></header>
      <div className="admin-analysis-list">{analysisContents?.map((content) => <article key={content.type_code}><header><p>{content.type_code}</p><h2>{typeName(content.type_code)}</h2><small>현재 적용 버전 {content.version}</small></header><label>결과 제목<input value={content.label} maxLength={120} onChange={(event) => updateAnalysis(content.type_code, 'label', event.target.value)} /></label><label>결과 분석 문구<textarea value={content.detail} maxLength={12000} rows={13} onChange={(event) => updateAnalysis(content.type_code, 'detail', event.target.value)} /></label><small className="admin-character-count">{content.detail.length.toLocaleString()}/12,000</small></article>)}</div>
    </section>}
    {page === 'document' && <section className="admin-page"><header className="admin-page-heading"><div><p className="eyebrow">RESULT DOCUMENT</p><h1>결과지 문서</h1><p>고정 문구는 여기에서 수정합니다. 응답자 이름·주 유형·유형별 결과 분석처럼 자동으로 바뀌는 값은 잠겨 있습니다.</p></div><div className="admin-page-actions"><button className="secondary-button" onClick={() => navigate('dashboard')}>대시보드로</button><button className="primary-button" onClick={saveReportDocument} disabled={loading || !documentDrafts}>{loading ? '저장 중…' : '문서 저장'}</button></div></header>
      <section className="admin-document-status" aria-label="문서 상태"><div><span>문서 상태</span><strong>{documentStatus?.state === 'customized' ? '사용자 문구 적용 중' : documentStatus?.state === 'partial' ? '일부 문구 저장됨' : '기본 템플릿 사용 중'}</strong></div><div><span>편집 항목</span><strong>{documentStatus?.savedCount ?? 0} / {documentStatus?.editableCount ?? reportDocumentSections.length} 저장됨</strong></div><div><span>마지막 저장</span><strong>{formatDate(documentStatus?.updatedAt)}</strong></div><div><span>적용 시점</span><strong>다음 PDF 생성부터</strong></div></section>
      <article className="admin-document-editor"><header><p>PDF 결과지 · 고정 문구 편집</p><small>문단 줄바꿈은 PDF에도 유지됩니다.</small></header><section><h2>표지와 결과 안내</h2><div className="admin-document-blocks">{documentDrafts?.slice(0, 7).map((item) => { const definition = reportDocumentSections.find((section) => section.key === item.contentKey)!; return <label className={definition.kind === 'long' ? 'long' : ''} key={item.contentKey}><span>{definition.label}</span>{definition.kind === 'long' ? <textarea value={item.text} rows={item.contentKey === 'notice' ? 5 : 4} maxLength={12000} onChange={(event) => updateDocumentText(item.contentKey, event.target.value)} /> : <input value={item.text} maxLength={12000} onChange={(event) => updateDocumentText(item.contentKey, event.target.value)} />}<small>{item.text.length.toLocaleString()}자</small></label>; })}</div><aside className="admin-locked-values"><strong>자동 값 · 편집 불가</strong><span>응답자 이름</span><span>주 진로 유형</span><span>유형별 분석자료</span><p>유형별 결과 분석 문구는 ‘분석자료’ 메뉴에서 수정합니다.</p></aside></section><section><h2>진로 유형 설명</h2><div className="admin-document-blocks">{documentDrafts?.slice(7).map((item) => { const definition = reportDocumentSections.find((section) => section.key === item.contentKey)!; return <label className={definition.kind === 'long' ? 'long' : ''} key={item.contentKey}><span>{definition.label}</span>{definition.kind === 'long' ? <textarea value={item.text} rows={5} maxLength={12000} onChange={(event) => updateDocumentText(item.contentKey, event.target.value)} /> : <input value={item.text} maxLength={12000} onChange={(event) => updateDocumentText(item.contentKey, event.target.value)} />}<small>{item.text.length.toLocaleString()}자</small></label>; })}</div></section></article>
    </section>}
  </section>{selected && <section className="admin-detail-backdrop" role="dialog" aria-modal="true" aria-label="제출 상세"><article><button className="admin-close" onClick={() => setSelected(null)}>닫기</button><h2>{selected.name} 제출 상세</h2><p>{selected.email} · {formatDate(selected.created_at)}</p><h3>유형 점수</h3>{(() => { const score =first(selected.score_results); return <dl className="admin-score-detail">{score && [['R', score.score_r], ['I', score.score_i], ['A', score.score_a], ['S', score.score_s], ['E', score.score_e], ['C', score.score_c]].map(([code, value]) => <div key={code}><dt>{code} ({typeName(code as string)})</dt><dd>{value}</dd></div>)}</dl>; })()}<h3>발송 이력</h3>{(() => { const report = first(selected.reports); const job = report ? first(report.email_jobs) : null; return <p>{job ? `${job.status === 'sent' ? 'Brevo 접수' : job.status} · ${formatDate(job.sent_at ?? job.created_at)} · 시도 ${job.attempts}회${job.last_error ? ` · ${job.last_error}` : ''}` : '발송 작업이 없습니다.'}</p>; })()}<h3>응답</h3><div className="admin-answer-grid">{(Array.isArray(selected.answers) ? selected.answers : selected.answers ? [selected.answers] : []).sort((a, b) => a.question_number - b.question_number).map((answer) => <span key={answer.question_number}>{answer.question_number}번 · {answer.score}</span>)}</div></article></section>}</main>;
}
