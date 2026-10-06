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
  createdAt: string;
  onboardingCompletedAt: string | null;
}

/** Ish jadvali — biznes va o'rin uchun bir xil shakl. */
export interface IshJadvaliQiymat {
  startHour: number;
  endHour: number;
  days: number[];
}

/** Biznes jadvali — o'rin jadvalida bo'lmagan bosh kalitlar bilan. */
export interface BiznesIshJadvali extends IshJadvaliQiymat {
  alertsOnlyWorkHours: boolean;
  perSeatSchedules: boolean;
}

export interface SeatFull {
  id: string;
  userId: string | null;
  departmentId: string | null;
  displayName: string;
  login: string | null;
  phoneNumbers: string[];
  externalIds: Record<string, string>;
  /** `activation_status` enum: bazada aynan shu uchtasi bor. */
  activation: 'pending' | 'active' | 'disabled';
  telegramLinked: boolean;
  /** Alohida ish jadvali — `null` bo'lsa biznesnikidan foydalanadi. */
  workHours: IshJadvaliQiymat | null;
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

// ─── Kouching: e'tiroz (FR-124) va rahbar izohi (FR-123) ───────────────────

export interface AppealRow {
  id: string;
  criterionScoreId: string;
  status: 'open' | 'accepted' | 'rejected';
  reason: string;
  originalScore: number | null;
  newScore: number | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** Faqat rahbar ro'yxatida keladi. */
  criterionCode?: string;
  criterionName?: string;
  maxScore?: number;
  evidenceQuote?: string | null;
  raisedByName?: string | null;
  conversationId?: string;
}

export interface CommentRow {
  id: string;
  body: string;
  criterionCode: string | null;
  authorId: string | null;
  authorName: string | null;
  seenAt: string | null;
  createdAt: string;
}

export interface AppealCriterionStat {
  code: string;
  name: string;
  total: number;
  accepted: number;
  rejected: number;
  open: number;
  avgCorrection: number | null;
}

export interface CriterionScoreRow {
  /** FR-124: e'tiroz aynan shu qatorga bog'lanadi. */
  id: string;
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
  comments: CommentRow[];
  appeals: AppealRow[];
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

// ─── Analitika ──────────────────────────────────────────────────────────────
//
// Muhim shart: `null` = "hisoblab bo'lmadi", `0` = "haqiqatan nol". Ikkalasini
// aralashtirmaslik kerak — 4 ta suhbatda bitim summasi topilgan bo'lsa,
// qolganini 0 so'm deb qo'shish o'rtacha bitimni darhol yolg'on qiladi.
// Shuning uchun tiplarda ham `number | null` ataylab saqlanadi.

/** Taqsimot bo'lagi — doiraviy va gorizontal diagrammalar uchun. */
export interface Ulush {
  key: string;
  count: number;
  avgScore?: number | null;
  /** Lid sifatida: model aynan qanday yozgani (normallashtirishdan oldin). */
  rawLabels?: string[];
}

export interface AnalyticsOverview {
  conversations: number;
  analyzed: number;
  filtered: number;
  scored: number;
  avgScore: number | null;
  flagged: number;
  warmLeads: number;
  leadKnown: number;
  leadConversionPct: number | null;
  dealSum: number | null;
  dealKnown: number;
  avgDeal: number | null;
  avgDurationSeconds: number | null;
  aiCostUsd: number | null;
  tasks: number;
  tasksDone: number;
  tasksOverdue: number;
  taskCompletionPct: number | null;
}

export interface AnalyticsMix {
  businessRelevance: Ulush[];
  callFamily: Ulush[];
  serviceLine: Ulush[];
  channel: Ulush[];
  status: Ulush[];
}

export interface CategoryAgg {
  categoryCode: string;
  evaluated: number;
  scored: number;
  unknownCount: number;
  avgScore: number | null;
  avgPct: number | null;
  weakCount: number;
  weightPct: number | null;
}

/**
 * Mezon darajasidagi to'liq kesim.
 *
 * `typicalText` / `targetText` — o'ylab topilgan tavsiya EMAS, balki
 * playbook rubrikasining aynan o'sha darajadagi matni (baholangan
 * paytdagi nusxasi). Shu sababli "hozir shunday / shunga intilish kerak"
 * juftligi har doim haqiqiy ta'rifga tayanadi.
 */
export interface CriterionDetail {
  code: string;
  name: string;
  description: string | null;
  categoryCode: string | null;
  evaluated: number;
  scored: number;
  unknownCount: number;
  avgScore: number | null;
  avgPct: number | null;
  weakCount: number;
  maxScore: number;
  typicalLevel: number | null;
  typicalText: string | null;
  targetLevel: number;
  targetText: string | null;
}

/**
 * Ustunlar `code` EMAS, `{code, name}` juftligi bilan keladi: mezon
 * kodlari playbook avlodlari orasida qayta ishlatiladi, shuning uchun
 * bir xil kod ostida ikkita boshqa mezon bo'lishi mumkin. Sarlavhada kod
 * ko'rsatiladi, to'liq nom esa tooltipda.
 */
export interface SeatMatrix {
  criteria: { code: string; name: string }[];
  seats: {
    seatId: string;
    displayName: string;
    cells: { code: string; name: string; avgPct: number | null; scored: number }[];
  }[];
  average: { code: string; name: string; avgPct: number | null }[];
}

export interface AnalyticsQuality {
  criteria: CriterionDetail[];
  seatMatrix: SeatMatrix;
  categories: CategoryAgg[];
  distribution: { bucket: number; label: string; count: number }[];
  compliance: Ulush[];
  topGaps: Ulush[];
}

/** Ko'rib chiqiladigan yoki namunaviy qo'ng'iroq kartochkasi. */
export interface CoachingCall {
  conversationId: string;
  startedAt: string;
  seatName: string | null;
  overallScore: number;
  summary: string | null;
  primaryGap: string | null;
  /** Erkin matnli kouching — aynan shu suhbatga tegishli. */
  improvement: string | null;
  strength: string | null;
  suggestion: string | null;
}

export interface CoachingFocus {
  code: string;
  name: string;
  avgPct: number;
  weak: number;
}

export interface AnalyticsCoaching {
  kpi: {
    seatsNeedingAttention: number;
    callsToReview: number;
    scoredCalls: number;
    seats: number;
  };
  priorities: {
    seatId: string;
    displayName: string;
    scoredCalls: number;
    avgScore: number | null;
    flagged: number;
    weakCount: number;
    focus: CoachingFocus | null;
    secondFocus: CoachingFocus | null;
    reviewCalls: {
      conversationId: string;
      startedAt: string;
      overallScore: number;
      summary: string | null;
    }[];
  }[];
  /** Qisqa yorliqlar — mezon nomidan, shuning uchun sanash mumkin. */
  improve: { code: string; name: string; count: number }[];
  strong: { code: string; name: string; count: number }[];
  reviewCalls: CoachingCall[];
  bestCalls: CoachingCall[];
  trend: {
    seatId: string;
    displayName: string;
    points: { day: string; avgScore: number; calls: number }[];
  }[];
}

export interface AnalyticsVoice {
  talkRatio: {
    seatId: string;
    displayName: string;
    conversations: number;
    /** `duration` — audio vaqti bo'yicha; `chars` — matn hajmi bo'yicha. */
    method: 'duration' | 'chars';
    managerPct: number | null;
    clientPct: number | null;
  }[];
  redFlags: {
    seatId: string;
    displayName: string;
    conversations: number;
    flags: number;
  }[];
  flagKinds: Ulush[];
}

export interface AnalyticsLeads {
  leadQuality: Ulush[];
  urgency: Ulush[];
  objections: Ulush[];
  deals: {
    known: number;
    total: number | null;
    avg: number | null;
    max: number | null;
    currency: string | null;
  };
  decisionMaker: { yes: number; no: number; unknown: number };
}

export type TaskSource = 'all' | 'playbook_analysis' | 'other_analysis' | 'manual';

export interface AnalyticsTasks {
  source: TaskSource;
  /**
   * AYNI DAMDAGI holat — davrga bog'liq emas. "Davrda 846 ta yaratildi"
   * tarixiy fakt, "hozir 589 tasi kechikkan" esa bugungi muammo; ikkalasi
   * bir blokda turmasligi kerak.
   */
  now: { open: number; overdue: number; dueToday: number };
  periodStats: {
    created: number;
    completed: number;
    /** Bajarilganlar orasida eski davrdan qolganlari ham bor — 100% dan oshishi mumkin. */
    completionPct: number | null;
    avgCompletionSeconds: number | null;
  };
  byStatus: Ulush[];
  byAction: (Ulush & { done: number })[];
  bySource: { key: string; open: number; created: number; completed: number }[];
  bySeat: {
    seatId: string;
    displayName: string;
    open: number;
    overdue: number;
    created: number;
    completed: number;
    completionPct: number | null;
  }[];
  daily: { day: string; created: number; completed: number }[];
  byStage: { key: string; open: number; overdue: number }[];
  commitments: { party: string; status: string; count: number }[];
}

export interface AnalyticsActivity {
  timezone: string;
  /** Ish jadvali sozlamasi — "ish vaqtida" bo'linishi shundan hisoblanadi. */
  workHours: { startHour: number; endHour: number; days: number[] };
  totals: { conversations: number; analyzed: number; scored: number; unanswered: number };
  /** Javob berilgan ulushi eng yuqori soat (kamida 3 ta suhbatli). */
  bestHour: { hour: number; pct: number } | null;
  byHour: {
    hour: number;
    count: number;
    avgScore: number | null;
    answered: number;
    unanswered: number;
  }[];
  daily: { day: string; total: number; unanswered: number; avgScore: number | null }[];
  bySeat: {
    seatId: string;
    displayName: string;
    total: number;
    /** Ikkala tomon ham gapirgan suhbat — telefoniyadagi "ulangan" ekvivalenti. */
    engaged: number;
    notEngaged: number;
    analyzed: number;
    scored: number;
    /** Sotuv emas: xizmat, ichki yoki boshqa gaplar. */
    operational: number;
    unanswered: number;
    engagedPct: number | null;
    aiLinked: boolean;
    medianFirstResponseSeconds: number | null;
  }[];
  /** Javobsiz VA tanlangan oyna ichida qayta bog'lanilmagan holatlar. */
  callbackMinutes: number;
  noCallback: {
    seatId: string | null;
    displayName: string;
    total: number;
    inHours: number;
    outHours: number;
  }[];
  newLeads: {
    seatId: string | null;
    displayName: string;
    leads: number;
    responded: number;
    medianSeconds: number | null;
    under1h: number;
    under4h: number;
    under24h: number;
    over24h: number;
  }[];
  /** Birinchi javob tezligi — mijoz sabri bo'yicha chelaklangan. */
  responseSpeed: {
    under15m: number;
    under1h: number;
    under4h: number;
    over4h: number;
    unknown: number;
  };
  unansweredBySeat: {
    seatId: string;
    displayName: string;
    inHours: number;
    outHours: number;
  }[];
  byWeekday: { weekday: number; count: number; avgScore: number | null }[];
  duration: {
    known: number;
    avgSeconds: number | null;
    medianSeconds: number | null;
    maxSeconds: number | null;
  };
  medianFirstResponseSeconds: number | null;
  unansweredSessions: number;
}

/**
 * Anketa savoli va uning javoblari.
 *
 * `answerType` faol playbookdan olinadi; savol u yerda topilmasa (eski
 * avloddan qolgan bo'lsa) `text` deb qaraladi — matnni har doim ro'yxat
 * sifatida ko'rsatish mumkin, shuning uchun bu eng xavfsiz taxmin.
 */
export interface AnketaSavol {
  question: string;
  answerType: string;
  total: number;
  answers: { value: string; count: number }[];
  yes: number;
  no: number;
  numbers: { value: number; count: number }[];
  numericAvg: number | null;
}

export interface AnalyticsCustomer {
  deals: {
    known: number;
    analyzed: number;
    total: number | null;
    avg: number | null;
    currency: string | null;
  };
  dealDaily: { day: string; count: number; sum: number }[];
  /** Erkin matn — shuning uchun diagramma emas, ro'yxat sifatida ko'rsatiladi. */
  budgetReaction: Ulush[];
  serviceMix: { line: string; relevance: string; count: number }[];
  questionnaire: {
    questions: AnketaSavol[];
    matrix: {
      seats: string[];
      questions: string[];
      cells: { seat: string; question: string; count: number }[];
    };
  };
}

/**
 * Lid holati — CRM natijasi EMAS, faollik bo'yicha xulosa.
 * `bitimli` yagona dalilga tayanadi: suhbatda aniq summa aytilgani.
 */
export type LidHolat = 'bitimli' | 'faol' | 'sovimoqda' | 'sovigan';

export interface LidYozuv {
  contactId: string;
  name: string | null;
  seatId: string | null;
  seatName: string | null;
  lastAt: string;
  daysSince: number;
  conversations: number;
  leadQuality: string | null;
  overallScore: number | null;
  primaryGap: string | null;
  summary: string | null;
  dealAmount: number | null;
  holat: LidHolat;
}

export interface AnalyticsFunnel {
  thresholds: { activeDays: number; lostDays: number };
  lifecycle: {
    total: number;
    withDeal: number;
    active: number;
    cooling: number;
    cold: number;
  };
  quality: {
    avgScore: number | null;
    low: number;
    mid: number;
    high: number;
    scored: number;
  };
  lossReasons: { key: string; count: number; example: string | null }[];
  lossStages: { key: string; example: string | null; count: number }[];
  reconnect: LidYozuv[];
}

// ─── Lid xulosalari ─────────────────────────────────────────────────────────

/** Holat CRM natijasi EMAS — faollik bo'yicha aniqlanadi. */
export type LidStatus = 'bitimli' | 'faol' | 'sovimoqda' | 'sovigan';

export interface LidQator {
  contactId: string;
  name: string | null;
  company: string | null;
  seatId: string | null;
  seatName: string | null;
  lastAt: string;
  daysSince: number;
  conversations: number;
  overallScore: number | null;
  leadQuality: string | null;
  dealAmount: number | null;
  holat: LidStatus;
  /** Birinchi e'tiroz, bo'lmasa asosiy zaif joy. */
  reason: string | null;
  stage: string | null;
  summary: string | null;
  /** 0..100 — bashorat emas, qaytish uchun tartiblash balli. */
  winBack: number;
  winBackLevel: 'yuqori' | 'ortacha' | 'past';
  reconnectWindow: string;
}

export interface LidRoyxat {
  total: number;
  thresholds: { activeDays: number; lostDays: number };
  leads: LidQator[];
  hasMore: boolean;
  filters: {
    reasons: { key: string; count: number }[];
    seats: { id: string; name: string }[];
    statuses: LidStatus[];
  };
}

export interface LidTafsilot {
  lead: {
    contactId: string;
    name: string | null;
    company: string | null;
    phone: string | null;
    isDecisionMaker: boolean | null;
    firstSeenAt: string;
    lastAt: string;
    daysSince: number;
    holat: LidStatus;
    seatId: string | null;
    seatName: string | null;
    conversations: number;
    avgScore: number | null;
    dealAmount: number | null;
    dealCurrency: string | null;
    leadQuality: string | null;
    serviceLine: string | null;
    callFamily: string | null;
    winBack: number;
    winBackLevel: 'yuqori' | 'ortacha' | 'past';
    reconnectWindow: string;
  };
  summary: { sarlavha: string; matn: string };
  nextStep: { matn: string; muddat: string };
  signals: {
    medianFirstResponseSeconds: number | null;
    avgFollowUpDays: number | null;
    trend: 'osish' | 'pasayish' | 'barqaror' | null;
    totalTalkSeconds: number;
  };
  reasons: {
    objections: string[];
    primaryGap: string | null;
    weakCriteria: {
      code: string;
      name: string;
      avgScore: number;
      maxScore: number;
      count: number;
    }[];
  };
  coaching: {
    improvements: string[];
    strengths: string[];
    betterPhrases: { context: string; suggestion: string }[];
  };
  /** BANT — faqat dalil bor bo'lgan qismi to'ladi, qolgani `null`. */
  qualification: {
    budget: string | null;
    authority: string | null;
    need: string | null;
    timing: string | null;
  };
  commitments: {
    what: string;
    party: string;
    status: string;
    deadline: string | null;
    createdAt: string;
  }[];
  timeline: {
    conversationId: string;
    startedAt: string;
    endedAt: string | null;
    channel: string;
    status: string;
    seatName: string | null;
    overallScore: number | null;
    summary: string | null;
    primaryGap: string | null;
    turns: number;
    objections: string[];
    dealAmount: number | null;
  }[];
}

// ─── Kunlik hisobot ─────────────────────────────────────────────────────────

export interface HisobotKun {
  date: string;
  conversations: number;
  scored: number;
  avgScore: number | null;
  /** AI matni yozilganmi — u faqat hisobot yuborilgan kunlarda bo'ladi. */
  hasReport: boolean;
}

/**
 * Hisobotning bir kesimi — biznes uchun ham, har menejer uchun ham
 * BIR XIL shakl. Shu tufayli interfeysda bitta komponent ikkalasini
 * ham chizadi va ular hech qachon bir-biridan farq qilib qolmaydi.
 */
export interface HisobotBolimlari {
  activity: {
    conversations: number;
    /** Ikkala tomon ham gapirgan suhbat — "bog'langan" ekvivalenti. */
    engaged: number;
    notEngaged: number;
    engagementPct: number | null;
    talkSeconds: number;
  };
  tasks: { yaratildi: number; bajarildi: number; ochiq: number; kechikkan: number };
  quality: {
    analyzed: number;
    scored: number;
    /** Sotuvga oid bo'lmagan: xizmat, ichki. */
    operational: number;
    unanswered: number;
    flagged: number;
    avgScore: number | null;
    medianFirstResponseSeconds: number | null;
  };
  leads: { newLeads: number; withDeal: number; dealSum: number | null };
  /** Raqamlardan yasalgan tavsiyalar — mos muammo bo'lmasa, jumla yo'q. */
  recommendations: string[];
  conclusion: string;
}

export interface HisobotKuni {
  date: string;
  overall: HisobotBolimlari & {
    previous: {
      date: string;
      conversations: number;
      engaged: number;
      engagementPct: number | null;
      talkSeconds: number;
      avgScore: number | null;
      scored: number;
    } | null;
    questionnaire: { question: string; answers: number }[];
    weakest: { code: string; name: string; avgScore: number; count: number }[];
  };
  bySeat: (HisobotBolimlari & {
    seatId: string;
    displayName: string;
    strength: string | null;
    improvement: string | null;
  })[];
  report: { content: string | null; createdAt: string; triggeredBy: string | null } | null;
}

export interface AnalyticsClients {
  newClients: number;
  returningClients: number;
  linkedConversations: number;
  totalConversations: number;
  top: {
    id: string;
    name: string | null;
    company: string | null;
    isDecisionMaker: boolean | null;
    conversations: number;
    avgScore: number | null;
    lastAt: string;
  }[];
}

export interface AnalyticsTeam {
  categories: string[];
  seats: {
    seatId: string;
    displayName: string;
    conversations: number;
    avgScore: number | null;
    flagged: number;
  }[];
  cells: {
    seatId: string;
    categoryCode: string;
    scored: number;
    unknownCount: number;
    avgPct: number | null;
  }[];
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
  resolvedAt?: string | null;
  /** Server `join` bilan qo'shadi — interfeys alohida so'rov qilmasin. */
  seatName?: string | null;
  conversationSummary?: string | null;
}

/**
 * "3 kun oldin" — ogohlantirishlarda aniq sanadan ko'ra foydaliroq:
 * rahbar uchun muhimi qachon bo'lgani emas, qancha vaqt o'tgani.
 */
export function fmtQachon(iso: string): string {
  const sek = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sek < 60) return 'hozirgina';
  if (sek < 3600) return `${Math.floor(sek / 60)} daqiqa oldin`;
  if (sek < 86400) return `${Math.floor(sek / 3600)} soat oldin`;
  const kun = Math.floor(sek / 86400);
  if (kun < 30) return `${kun} kun oldin`;
  const oy = Math.floor(kun / 30);
  return oy < 12 ? `${oy} oy oldin` : `${Math.floor(oy / 12)} yil oldin`;
}

export interface SeatRow {
  id: string;
  displayName: string;
  isActive: boolean;
}

// ─── Biznes profili (FR-11) ──────────────────────────────────────────────────

export interface BusinessProfile {
  /** Soha — qisqa nom ("ta'lim markazi"). AI kontekstiga birinchi bo'lib tushadi. */
  industry: string;
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
  industry: '',
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

/**
 * `ballRang` FON sifatida ishlatilganda ustiga yoziladigan matn rangi.
 *
 * Nega alohida funksiya kerak: to'rt rangning uchtasi to'q va oq matnni
 * ko'taradi, `--orta` (to'q sariq, #dc8500) esa yorug' — unda oq matn
 * kontrasti atigi 2.84 chiqadi, ya'ni WCAG AA (4.5) dan ancha past va
 * raqam amalda o'qilmaydi. Issiqlik xaritasida bu jiddiy: katakdagi
 * foiz — blokning butun ma'nosi.
 *
 * Chegaralar `ballRang` bilan bir xil bo'lishi SHART, aks holda rang va
 * matn bir-biriga mos kelmay qoladi.
 */
export function ballMatnRang(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score >= BALL_CHEGARA.yuqori) return 'var(--ball-ust-yuqori)';
  if (score >= BALL_CHEGARA.yaxshi) return 'var(--ball-ust-info)';
  if (score >= BALL_CHEGARA.orta) return 'var(--ball-ust-orta)';
  return 'var(--ball-ust-past)';
}
