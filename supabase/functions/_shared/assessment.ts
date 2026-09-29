export const TYPE_ORDER = ['R', 'I', 'A', 'S', 'E', 'C'] as const;

export type TypeCode = (typeof TYPE_ORDER)[number];

export type PreparedSubmission = {
  name: string;
  commissionYear: number;
  mbti: string;
  email: string;
  answers: Record<string, number>;
  scores: Record<TypeCode, number>;
  primaryType: TypeCode;
  primaryTypes: TypeCode[];
  secondaryType: TypeCode | null;
  isTie: boolean;
  isClose: boolean;
  calculationVersion: string;
};

export function calculateScores(answers: Record<string, number>) {
  const scores: Record<TypeCode, number> = {
    R: 0,
    I: 0,
    A: 0,
    S: 0,
    E: 0,
    C: 0,
  };

  for (let questionNumber = 1; questionNumber <= 72; questionNumber += 1) {
    const type = TYPE_ORDER[(questionNumber - 1) % TYPE_ORDER.length];
    scores[type] += answers[String(questionNumber)];
  }

  const orderedTypes = [...TYPE_ORDER].sort((left, right) => scores[right] - scores[left]);
  const highestScore = scores[orderedTypes[0]];
  const primaryTypes = orderedTypes.filter((type) => scores[type] === highestScore);
  const firstNonPrimary = orderedTypes.find((type) => !primaryTypes.includes(type));
  const isClose = primaryTypes.length === 1
    && firstNonPrimary !== undefined
    && highestScore - scores[firstNonPrimary] <= 2;

  return {
    scores,
    primaryType: primaryTypes[0],
    primaryTypes,
    secondaryType: isClose ? firstNonPrimary ?? null : null,
    isTie: primaryTypes.length > 1,
    isClose,
  };
}

export function validateAndPrepareSubmission(input: unknown): PreparedSubmission {
  if (typeof input !== 'object' || input === null) {
    throw new Error('잘못된 요청 형식입니다.');
  }

  const payload = input as Record<string, unknown>;
  const profile = payload.profile as Record<string, unknown> | undefined;
  const rawAnswers = payload.answers as Record<string, unknown> | undefined;

  if (payload.consent !== true) throw new Error('개인정보 수집 동의가 필요합니다.');
  if (!profile || !rawAnswers) throw new Error('필수 설문 데이터가 없습니다.');

  const name = String(profile.name ?? '').trim();
  const commissionYear = Number(profile.commissionYear);
  const mbti = String(profile.mbti ?? '').trim().toUpperCase();
  const email = String(profile.email ?? '').trim().toLowerCase();
  const calculationVersion = String(payload.calculationVersion ?? '2026-01');

  if (name.length < 1 || name.length > 40) throw new Error('이름 또는 별칭을 확인해 주세요.');
  if (!Number.isInteger(commissionYear) || commissionYear < 1900 || commissionYear > 2100) {
    throw new Error('임관년도를 확인해 주세요.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('이메일 형식을 확인해 주세요.');
  const emailDomain = email.split('@')[1] ?? '';
  if (emailDomain === 'army.mil' || emailDomain.endsWith('.army.mil')) {
    throw new Error('army.mil 도메인 이메일은 사용할 수 없습니다.');
  }
  if (mbti && !/^[A-Z]{4}$/.test(mbti)) throw new Error('MBTI 형식을 확인해 주세요.');

  const answers: Record<string, number> = {};
  for (let questionNumber = 1; questionNumber <= 72; questionNumber += 1) {
    const value = Number(rawAnswers[String(questionNumber)]);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`${questionNumber}번 문항의 응답을 확인해 주세요.`);
    }
    answers[String(questionNumber)] = value;
  }

  if (Object.keys(rawAnswers).length !== 72) throw new Error('설문 문항 수가 올바르지 않습니다.');

  const { scores, primaryType, primaryTypes, secondaryType, isTie, isClose } = calculateScores(answers);
  return { name, commissionYear, mbti, email, answers, scores, primaryType, primaryTypes, secondaryType, isTie, isClose, calculationVersion };
}
