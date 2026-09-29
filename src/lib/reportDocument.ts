export const reportDocumentKeys = [
  'document_title',
  'profile_name_label',
  'profile_type_label',
  'primary_heading',
  'intro',
  'notice',
  'reference_heading',
  'reference_r_label',
  'reference_r_description',
  'reference_i_label',
  'reference_i_description',
  'reference_a_label',
  'reference_a_description',
  'reference_s_label',
  'reference_s_description',
  'reference_e_label',
  'reference_e_description',
  'reference_c_label',
  'reference_c_description',
] as const;

export type ReportDocumentKey = typeof reportDocumentKeys[number];
export type ReportDocumentTexts = Partial<Record<ReportDocumentKey, string>>;

export const defaultReportDocumentTexts: Record<ReportDocumentKey, string> = {
  document_title: '부사관 진로적성검사 결과',
  profile_name_label: '이름',
  profile_type_label: '진로 유형',
  primary_heading: '[세부 설명]',
  intro: '본 결과는 R·I·A·S·E·C 성향을 군 직무 환경에 맞춰 해석한 자기이해 자료입니다. 현재의 선호와 강점을 점검하고 성장 방향을 탐색하는 데 활용해 주세요.',
  notice: '본 결과는 개인의 현재 흥미와 성향을 바탕으로 도출된 참고 자료입니다. 상담 보조 목적 외에 인사 선발, 보직 배정, 진급 또는 교육 선발의 자동 결정 근거로 사용하지 않습니다.\n개인의 노력과 경험에 따라 성향은 확장되고 달라질 수 있습니다.',
  reference_heading: '진로 유형 설명',
  reference_r_label: '야전·실무형',
  reference_r_description: '장비 운용과 현장 중심의 임무 수행에서 강점을 보이는 유형입니다. 전투장비 운용과 유지관리, 전술적 운용, 현장 실행력이 필요한 역할에서 역량을 발휘할 수 있습니다. 명확한 목표와 역할이 주어졌을 때 집중력과 책임감을 발휘하는 점이 강점입니다.',
  reference_i_label: '기술·분석형',
  reference_i_description: '분석적 사고와 문제 해결 능력이 뛰어나며, 복잡한 시스템과 정보를 이해하고 활용하는 데 강점을 지닌 유형입니다. 군에서는 이러한 능력이 정보전, 기술전, 미래전 수행에 핵심적으로 활용됩니다. 감이나 경험보다는 객관적인 자료와 근거를 바탕으로 판단하며, 끊임없이 전문성을 향상시키려는 성향이 강합니다.',
  reference_a_label: '창의형',
  reference_a_description: '창의적인 표현과 방법, 새로운 아이디어를 통해 조직에 활력을 불어넣는 역할을 합니다. 군 조직에서는 이러한 성향이 장병 사기진작, 홍보, 심리전, 문화 활동 등에서 중요한 의미를 갖습니다. 독창적인 시각으로 문제를 바라보고 기존의 방식을 개선하여 더 효과적인 결과를 만들어내는 데 강점을 보입니다.',
  reference_s_label: '관계형',
  reference_s_description: '사람을 이해하고 돕는 데 강점을 가진 유형으로, 조직 내 안정과 협력을 이끄는 중요한 역할을 수행합니다. 이들은 자신의 성과뿐만 아니라 전우와 부하의 발전, 부대의 단결, 공동의 목표 달성에서 큰 보람을 느낍니다. 상대방의 이야기를 잘 듣고 공감하며, 갈등을 원만하게 조정하고 협력적인 분위기를 만드는 능력이 뛰어납니다.',
  reference_e_label: '리더형',
  reference_e_description: '리더십과 의사결정 능력(협의, 조정)이 뛰어나며, 조직을 이끌고 목표를 달성하는 데 강점을 가진 유형입니다. 또한 이 유형은 상황을 빠르게 파악하고 방향을 설정하여 조직을 이끄는 능력이 뛰어나며, 부하들을 동기부여하고 목표 달성을 위해 자원을 효과적으로 배분하는 데 능숙합니다.',
  reference_c_label: '행정·관리형',
  reference_c_description: '체계적인 관리와 정확한 업무 수행에 강점을 가진 유형으로, 군 조직의 안정적 운영을 유지하는 데 필수적인 역할을 담당합니다. 맡은 일을 끝까지 책임감 있게 수행하며, 작은 실수도 줄이기 위해 세심하게 확인하는 습관을 가지고 있습니다.',
};

export const reportDocumentSections = [
  { key: 'document_title', label: '문서 제목', kind: 'short' },
  { key: 'profile_name_label', label: '이름 항목명', kind: 'short' },
  { key: 'profile_type_label', label: '진로 유형 항목명', kind: 'short' },
  { key: 'primary_heading', label: '결과 설명 제목', kind: 'short' },
  { key: 'intro', label: '결과 소개 문단', kind: 'long' },
  { key: 'notice', label: '안내 상자 문구', kind: 'long' },
  { key: 'reference_heading', label: '유형 설명 제목', kind: 'short' },
  { key: 'reference_r_label', label: 'R 유형명', kind: 'short' },
  { key: 'reference_r_description', label: 'R 유형 설명', kind: 'long' },
  { key: 'reference_i_label', label: 'I 유형명', kind: 'short' },
  { key: 'reference_i_description', label: 'I 유형 설명', kind: 'long' },
  { key: 'reference_a_label', label: 'A 유형명', kind: 'short' },
  { key: 'reference_a_description', label: 'A 유형 설명', kind: 'long' },
  { key: 'reference_s_label', label: 'S 유형명', kind: 'short' },
  { key: 'reference_s_description', label: 'S 유형 설명', kind: 'long' },
  { key: 'reference_e_label', label: 'E 유형명', kind: 'short' },
  { key: 'reference_e_description', label: 'E 유형 설명', kind: 'long' },
  { key: 'reference_c_label', label: 'C 유형명', kind: 'short' },
  { key: 'reference_c_description', label: 'C 유형 설명', kind: 'long' },
] as const satisfies ReadonlyArray<{ key: ReportDocumentKey; label: string; kind: 'short' | 'long' }>;

export function documentText(texts: ReportDocumentTexts | undefined, key: ReportDocumentKey) {
  return texts?.[key]?.trim() || defaultReportDocumentTexts[key];
}
