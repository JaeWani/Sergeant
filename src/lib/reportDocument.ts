export const reportDocumentKeys = [
  'document_title',
  'profile_name_label',
  'profile_type_label',
  'primary_heading',
] as const;

export type ReportDocumentKey = typeof reportDocumentKeys[number];
export type ReportDocumentTexts = Partial<Record<ReportDocumentKey, string>>;

export const defaultReportDocumentTexts: Record<ReportDocumentKey, string> = {
  document_title: '부사관 진로적성검사 결과',
  profile_name_label: '이름',
  profile_type_label: '진로 유형',
  primary_heading: '[세부 설명]',
};

export const reportDocumentSections = [
  { key: 'document_title', label: '문서 제목', kind: 'short' },
  { key: 'profile_name_label', label: '이름 항목명', kind: 'short' },
  { key: 'profile_type_label', label: '진로 유형 항목명', kind: 'short' },
  { key: 'primary_heading', label: '결과 설명 제목', kind: 'short' },
] as const satisfies ReadonlyArray<{ key: ReportDocumentKey; label: string; kind: 'short' | 'long' }>;

export function documentText(texts: ReportDocumentTexts | undefined, key: ReportDocumentKey) {
  return texts?.[key]?.trim() || defaultReportDocumentTexts[key];
}
