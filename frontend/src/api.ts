/**
 * Backend API klienti. Hamma so'rov cookie'li sessiya bilan ketadi
 * (vite proxy tufayli bitta origin — CORS muammosi yo'q).
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = (await res.json()) as { title?: string; detail?: string };
      detail = j.title ?? j.detail ?? detail;
    } catch {
      /* JSON bo'lmasa statusText qoladi */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

// ─── Tiplar (backend javoblariga mos) ───────────────────────────────────────

export interface BusinessAccess {
  businessId: string;
  slug: string;
  name: string;
  role: string;
  seatId: string | null;
  permissions: string[];
  onboardingStep: 'profile' | 'playbook' | 'channel' | 'team' | 'done';
}

export interface AuthContext {
  user: {
    id: string;
    email: string | null;
    login: string | null;
    displayName: string;
    avatarUrl: string | null;
    locale: string;
  };
  businesses: BusinessAccess[];
}

// ─── Sozlamalar (FR-160, 161, 164, 165, 166) ────────────────────────────────

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  timezone: string;
  currency: string;
  locale: string;
  onboardingStep: string;
}

export interface SeatFull {
  id: string;
  userId: string | null;
  departmentId: string | null;
  displayName: string;
  login: string | null;
  phoneNumbers: string[];
  externalIds: Record<string, string>;
  activation: 'pending' | 'active' | 'suspended';
  telegramLinked: boolean;
  isActive: boolean;
  isOccupied: boolean;
  totalConversations: number;
  avgScore: string | null;
  lastConversationAt: string | null;
  createdAt: string;
}

export interface MemberRow {
  id: string;
  userId: string;
  role: 'owner' | 'supervisor' | 'head' | 'auditor';
  departmentId: string | null;
  activation: string;
  isActive: boolean;
  addedAt: string;
  user: {
    id: string;
    email: string | null;
    displayName: string;
    avatarUrl: string | null;
    lastLoginAt: string | null;
  } | null;
}

export interface TelegramIntegration {
  connected: boolean;
  integration?: {
    id: string;
    kind: string;
    status: string;
    config: {
      botUsername?: string | null;
      tokenHint?: string | null;
      connectedAt?: string | null;
      /** FR-134: kunlik hisobot sozlamalari shu yerda saqlanadi. */
      reportChatId?: string | null;
      reportHour?: number;
    };
    syncEnabled: boolean;
    lastError: string | null;
    updatedAt: string;
  };
}

/** FR-134: saqlangan kunlik hisobot. */
export interface DailyReportRow {
  id: string;
  summaryDate: string;
  content: string | null;
  stats: Record<string, unknown>;
  triggeredBy: string | null;
  createdAt: string;
}

export interface ConversationRow {
  id: string;
  channel: string;
  seatId: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  excludedReason: string | null;
  language: string | null;
  overallScore: string | null;
  leadQuality: string | null;
  primaryGap: string | null;
  summary: string | null;
  isFlagged: boolean | null;
  scoringMode: string | null;
  segmentCount: number;
}

export interface Segment {
  id: string;
  seq: number;
  speaker: string;
  text: string;
  startSeconds: string;
}

export interface CriterionScoreRow {
  criterionCode: string;
  criterionName: string;
  categoryCode: string | null;
  categoryWeightPct: string | null;
  score: number | null;
  maxScore: number;
  evidenceQuote: string | null;
  evidenceStartSeconds: string | null;
  evidenceSegmentId: string | null;
  confidence: string | null;
}

export interface Coaching {
  strengths: string[];
  improvements: string[];
  betterPhrases: { context: string; suggestion: string }[];
}

export interface Analysis {
  id: string;
  overallScore: string | null;
  leadQuality: string | null;
  primaryGap: string | null;
  summary: string | null;
  scoringMode: string | null;
  isFlagged: boolean;
  flaggedReason: string | null;
  costUsd: string | null;
  managerNote: Coaching | null;
  dynamics: {
    replyMetrics?: {
      customerTurns: number;
      repliedTurns: number;
      unansweredTurns: number;
      firstResponseSeconds: number | null;
      medianResponseSeconds: number | null;
    };
    needsReply?: boolean | null;
  } | null;
  // ─── To'liq kontekst: rahbar suhbat detalidan chiqmasdan qaror qilsin ───
  speakerAttributionMethod: string | null;
  businessRelevance: string | null;
  callFamily: string | null;
  serviceLine: string | null;
  classificationConfidence: string | null;
  compliance: 'ok' | 'warning' | 'violation' | null;
  scoredCategories: number | null;
  totalCategories: number | null;
  clientExtracted: {
    name: string | null;
    company: string | null;
    role: string | null;
    isDecisionMaker: boolean | null;
  } | null;
  deal: { amount: number | null; currency: string | null; stage: string | null } | null;
  signals: { urgency: 'low' | 'medium' | 'high' | null; budgetReaction: string | null; objections: string[] } | null;
  questionnaireAnswers: { question: string; answer: string | null }[] | null;
}

export interface CommitmentRow {
  id: string;
  byParty: 'manager' | 'client';
  what: string;
  deadline: string | null;
  status: 'pending' | 'done' | 'missed';
}

export interface ContactInfo {
  id: string;
  name: string | null;
  company: string | null;
  role: string | null;
  isDecisionMaker: boolean | null;
}

export interface PreviousConversation {
  id: string;
  startedAt: string;
  overallScore: string | null;
  summary: string | null;
}

export interface ConversationDetail {
  conversation: ConversationRow & {
    externalThreadId: string | null;
    direction: string;
    phoneFrom: string | null;
    phoneTo: string | null;
    isOffHours: boolean;
    managerName: string | null;
    /** Media — FAZA 2 (audio + STT). FAZA 1 Telegram matnida null. */
    mediaUrl: string | null;
    mediaKind: string | null;
    durationSeconds: number | null;
  };
  segments: Segment[];
  analysis: Analysis | null;
  scores: CriterionScoreRow[];
  commitments: CommitmentRow[];
  contact: ContactInfo | null;
  previousConversations: PreviousConversation[];
  categoryNames: Record<string, string>;
}

export interface Kpi {
  conversations: number;
  analyzed: number;
  filtered: number;
  avgScore: number | null;
  flagged: number;
  medianFirstResponseSeconds: number | null;
  unansweredSessions: number;
  aiCostUsd: number | null;
}

export interface LeaderboardRow {
  seatId: string;
  displayName: string;
  conversations: number;
  analyzed: number;
  avgScore: number | null;
  bestScore: number | null;
  flagged: number;
  medianFirstResponseSeconds: number | null;
}

export interface CriterionAgg {
  code: string;
  name: string;
  categoryCode: string | null;
  evaluated: number;
  scored: number;
  unknownCount: number;
  avgScore: number | null;
  avgPct: number | null;
  weakCount: number;
}

export interface TrendPoint {
  bucket: string;
  conversations: number;
  avgScore: number | null;
  flagged: number;
}

// ─── Sotuvchi kabineti (FR-112) ─────────────────────────────────────────────

export interface SeatCriterionRow {
  code: string;
  name: string;
  categoryCode: string | null;
  myScored: number;
  myUnknown: number;
  myAvg: number | null;
  teamAvg: number | null;
  maxScore: number;
}

export interface SeatDashboard {
  period: { from: string; to: string };
  seat: { id: string; displayName: string | null };
  current: Kpi;
  previous: Kpi;
  weakestCriterion: { code: string; name: string; scored: number; avgScore: number } | null;
  criteria: SeatCriterionRow[];
}

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
  seatId: string | null;
  conversationId: string | null;
  source: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  isOverdue: boolean;
}

export interface TaskAnalytics {
  total: number;
  done: number;
  pending: number;
  inProgress: number;
  overdue: number;
  fromAi: number;
  completionRatePct: number | null;
  avgCompletionHours: number | null;
}

export interface AlertRow {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'new' | 'seen' | 'resolved';
  title: string;
  body: Record<string, unknown>;
  conversationId: string | null;
  seatId: string | null;
  createdAt: string;
}

export interface SeatRow {
  id: string;
  displayName: string;
  isActive: boolean;
}

// ─── Biznes profili (FR-11) ──────────────────────────────────────────────────

export interface BusinessProfile {
  businessDescription: string;
  primaryOffers: string[];
  typicalCustomers: string;
  customerProblem: string;
  customerType: 'b2b' | 'b2c' | 'both';
  leadSources: string[];
  salesModel: string;
  callDirection: 'inbound' | 'outbound' | 'mixed';
  salesCycle: string;
  avgDealAmount: number | null;
  avgDealCurrency: string;
  decisionMakers: string;
  mustCaptureFields: string[];
  commonCustomerQuestions: string[];
  commonObjections: string[];
  successSignals: string[];
  failureSignals: string[];
  redLines: string[];
  sensitiveTopics: string[];
  excludedRoutes: string[];
  vocabulary: string[];
  additionalNotes: string;
}

export const EMPTY_PROFILE: BusinessProfile = {
  businessDescription: '',
  primaryOffers: [],
  typicalCustomers: '',
  customerProblem: '',
  customerType: 'b2c',
  leadSources: [],
  salesModel: '',
  callDirection: 'mixed',
  salesCycle: '',
  avgDealAmount: null,
  avgDealCurrency: 'UZS',
  decisionMakers: '',
  mustCaptureFields: [],
  commonCustomerQuestions: [],
  commonObjections: [],
  successSignals: [],
  failureSignals: [],
  redLines: [],
  sensitiveTopics: [],
  excludedRoutes: [],
  vocabulary: [],
  additionalNotes: '',
};

export interface ProfileCompleteness {
  percent: number;
  missing: string[];
  readyForPlaybook: boolean;
}

// ─── Playbook ─────────────────────────────────────────────────────────────────

export interface Rubric {
  '0': string;
  '1': string;
  '2': string;
  '3': string;
}

export interface Category {
  code: string;
  name: string;
  weightPct: number;
  order: number;
}

export interface Criterion {
  code: string;
  categoryCode: string;
  name: string;
  description: string;
  rubric: Rubric;
  appliesTo: { callFamilies: string[]; serviceLines: string[]; directions: string[] };
  isActive: boolean;
  order: number;
}

export interface CallFamily {
  key: string;
  name: string;
  description: string;
  scored: boolean;
}

export interface RedFlag {
  key: string;
  description: string;
  severity: 'warning' | 'critical';
}

export interface PlaybookBody {
  criteria: { categories: Category[]; criteria: Criterion[] };
  questionnaire: { title: string; questions: { id: string; question: string; answerType: string; required: boolean }[] };
  classificationPolicy: { callFamilies: CallFamily[]; redFlags: RedFlag[]; serviceLines: string[] };
  promptNotes: {
    stage1: { vocabulary: string[]; contextHint: string };
    stage2: { businessContext: string; extractionHints: string; taskGuidance: string };
    stage3: { scoringGuidance: string; coachingNotes: string; complianceNotes: string };
  };
  leadQuality: Record<string, unknown>;
  changeNote?: string;
}

export interface PlaybookVersion {
  id: string;
  version: number;
  isActive: boolean;
  origin: string;
  changeNote: string | null;
  createdAt: string;
  activatedAt: string | null;
}

export interface ValidateResult {
  valid: boolean;
  summary?: { categories: number; criteria: number; activeCriteria: number; totalWeight: number };
  errors?: Record<string, string[]>;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface BillingStatus {
  status: 'trial' | 'active' | 'past_due' | 'grace' | 'degraded' | 'cancelled';
  daysLeft: number | null;
}

export interface BillingTransaction {
  id: string;
  type: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  description: string | null;
  createdAt: string;
}

export interface BillingFull {
  subscription: {
    status: string;
    balance: string;
    trialEndsAt: string | null;
    graceEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  monthlySeatPriceUzs: number;
  activeSeats: number;
  estimatedMonthlyCostUzs: number;
  transactions: BillingTransaction[];
}

// ─── Formatlash yordamchilari ───────────────────────────────────────────────

/** "31.07, 14:05" — locale'ga bog'lanmagan barqaror format. */
export function fmtSana(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}, ${hh}:${mi}`;
}

/** "31.07" — trend o'qi uchun. */
export function fmtKun(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtSoniya(s: number | null | undefined): string {
  if (s === null || s === undefined) return '—';
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} daq`;
  return `${(s / 3600).toFixed(1)} soat`;
}

/** "1 200 000 so'm" — minglik ajratgichlar bilan. */
export function fmtPul(v: number | string | null | undefined, currency = 'UZS'): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  const formatted = Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return currency === 'UZS' ? `${formatted} so'm` : `${formatted} ${currency}`;
}

/**
 * Ball shkalasi — TZ 8.1 #3 bo'yicha 4 bosqich.
 * Bu yagona manba: Gauge, Dashboard va ConversationDetail shu funksiyalarni
 * ishlatadi. Chegarani o'zgartirish kerak bo'lsa faqat shu yerda o'zgartiriladi.
 *
 *   0–40  past    qizil
 *  40–60  orta    sariq
 *  60–80  yaxshi  ko'k
 *  80–100 yuqori  yashil
 */
export const BALL_CHEGARA = { yuqori: 80, yaxshi: 60, orta: 40 } as const;

export function ballKlass(score: number | null): string {
  if (score === null) return 'yoq';
  if (score >= BALL_CHEGARA.yuqori) return 'yuqori';
  if (score >= BALL_CHEGARA.yaxshi) return 'yaxshi';
  if (score >= BALL_CHEGARA.orta) return 'orta';
  return 'past';
}

/** Ball uchun CSS rang o'zgaruvchisi — chiziq, gauge va diagrammalar uchun. */
export function ballRang(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score >= BALL_CHEGARA.yuqori) return 'var(--yuqori)';
  if (score >= BALL_CHEGARA.yaxshi) return 'var(--info)';
  if (score >= BALL_CHEGARA.orta) return 'var(--orta)';
  return 'var(--past)';
}
