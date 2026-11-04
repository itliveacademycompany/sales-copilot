/**
 * CRM bosh sahifasi (amoCRM "Рабочий стол" namunasi) — vidjet turlari,
 * standart tartib va server javobi shakli. Ma'nolar `backend/src/crm/boshPanel.ts`
 * boshidagi izohda.
 */

export const STANDART_TURLAR = [
  'overdue_tasks',
  'done_tasks',
  'todo_tasks',
  'no_task_deals',
  'deal_sources',
  'deals_by_manager',
  'goals',
  'system_usage',
  'recent_files',
  'sales_forecast',
  'incoming_calls',
  'outgoing_calls',
  'notes',
  'won_deals',
  'outgoing_messages',
  'processed_chats',
  'incoming_messages',
  'response_time',
] as const;

export type StandartTur = (typeof STANDART_TURLAR)[number];
export type VidjetTuri = StandartTur | 'deals';

export interface BitimFiltri {
  pipelineIds: string[];
  stageIds: string[];
  seatIds: string[];
  sources: string[];
  tags: string[];
  status: 'all' | 'open' | 'won' | 'lost';
  dateField: 'created' | 'closed';
  dateMode: 'all' | 'period' | 'range';
  from?: string;
  to?: string;
  group: 'stage' | 'manager' | 'source' | 'none';
}

export interface Vidjet {
  id: string;
  type: VidjetTuri;
  title?: string;
  filter?: BitimFiltri;
}

/** Katakchadagi o'lcham: s — 1×1, m — 2×2, l — 4×2 (6 ustunli to'r). */
export type Olcham = 's' | 'm' | 'l';

export const VIDJET_META: Record<VidjetTuri, { nom: string; olcham: Olcham; izoh: string }> = {
  overdue_tasks: { nom: "Muddati o'tgan vazifalar", olcham: 's', izoh: "Hozir ochiq va muddati o'tgan vazifalar" },
  done_tasks: { nom: 'Bajarilgan vazifalar', olcham: 's', izoh: 'Tanlangan davrda bajarilgan vazifalar' },
  todo_tasks: { nom: 'Bajarilishi kerak', olcham: 's', izoh: 'Muddati hali kelmagan ochiq vazifalar' },
  no_task_deals: { nom: 'Vazifasiz bitimlar', olcham: 's', izoh: "Ochiq vazifasi yo'q ochiq bitimlar" },
  deal_sources: { nom: 'Bitim manbalari', olcham: 'm', izoh: 'Davrda yaratilgan bitimlar manba bo‘yicha' },
  deals_by_manager: { nom: "Menejerlar bo'yicha bitimlar", olcham: 'm', izoh: "Ochiq bitimlar mas'ul bo'yicha" },
  goals: { nom: 'Maqsadlar', olcham: 'm', izoh: 'Oylik reja va fakt' },
  system_usage: { nom: 'Tizimdan foydalanish', olcham: 'm', izoh: 'Kim tizimda qancha vaqt ishladi' },
  recent_files: { nom: "So'nggi fayllar", olcham: 'm', izoh: "Qo'ng'iroq yozuvlari va yuklangan audio" },
  sales_forecast: { nom: 'Savdo prognozi', olcham: 'l', izoh: 'Ochiq bitimlarning kutilgan yopilishi' },
  incoming_calls: { nom: "Kiruvchi qo'ng'iroqlar", olcham: 's', izoh: "Davrdagi kiruvchi qo'ng'iroqlar" },
  outgoing_calls: { nom: "Chiquvchi qo'ng'iroqlar", olcham: 's', izoh: "Davrdagi chiquvchi qo'ng'iroqlar" },
  notes: { nom: 'Izohlar', olcham: 's', izoh: 'Bitimlarga yozilgan izohlar' },
  won_deals: { nom: 'Muvaffaqiyatli bitimlar', olcham: 's', izoh: 'Yutilgan bosqichdagi bitimlar' },
  outgoing_messages: { nom: "Menejerlar bo'yicha chiquvchi xabarlar", olcham: 'm', izoh: 'Telegram, WhatsApp, Instagram' },
  processed_chats: { nom: 'Ishlangan suhbatlar', olcham: 'm', izoh: 'Menejer javob bergan yozishmalar' },
  incoming_messages: { nom: 'Kiruvchi xabarlar', olcham: 'm', izoh: 'Mijoz xabarlari kanal bo‘yicha' },
  response_time: { nom: "O'rtacha javob vaqti", olcham: 'l', izoh: 'Mijoz yozgandan menejer javobigacha, soat bo‘yicha' },
  deals: { nom: 'Bitimlar', olcham: 'm', izoh: 'O‘zingiz filtr beradigan vidjet' },
};

/** Birinchi ochilganda — amoCRM'dagi tartib. */
export const STANDART_TARTIB: Vidjet[] = STANDART_TURLAR.map((type) => ({ id: type, type }));

export const BOSH_FILTR: BitimFiltri = {
  pipelineIds: [],
  stageIds: [],
  seatIds: [],
  sources: [],
  tags: [],
  status: 'all',
  dateField: 'created',
  dateMode: 'all',
  group: 'stage',
};

// ─── Server javobi ──────────────────────────────────────────────────────────

export interface PanelJavob {
  tasks: { overdue: number; overdueNew: number; done: number; todo: number; todoNew: number } | null;
  deals: {
    noTask: number;
    noTaskSum: number;
    noTaskNew: number;
    open: number;
    openSum: number;
    openDelta: number;
    won: number;
    wonSum: number;
    wonNew: number;
    wonNewSum: number;
  } | null;
  managers: { seatId: string | null; name: string | null; count: number; sum: number; delta: number }[] | null;
  sources: { source: string | null; count: number; sum: number }[] | null;
  goal: {
    month: string;
    row: { planSum: number | null; planCount: number | null; factSum: number; factCount: number; sumPct: number | null; countPct: number | null } | null;
  } | null;
  usage: { userId: string; name: string; minutes: number; lastAt: string | null }[] | null;
  files:
    | {
        conversationId: string;
        fileName: string | null;
        kind: string | null;
        bytes: number | null;
        at: string;
        channel: string;
        direction: string;
        contact: string | null;
        seat: string | null;
      }[]
    | null;
  forecast: { cycleDays: number | null; points: { days: number; count: number; sum: number }[] } | null;
  calls: { inbound: number; outbound: number } | null;
  notes: number | null;
  messages: {
    bySeat: { seatId: string | null; name: string | null; messages: number; chats: number }[];
    incoming: { channel: string; count: number }[];
  } | null;
  responseTime: { hours: { hour: number; minutes: number | null; count: number }[]; avgMinutes: number | null; replies: number } | null;
}

export interface BitimVidjetNatija {
  count: number;
  sum: number;
  delta: number | null;
  groups: { key: string; name: string | null; name2: string | null; color: string | null; count: number; sum: number; delta: number | null }[];
}

/** Bosh sahifa filtri — barcha vidjetlarga bir xil. */
export interface PanelFiltr {
  from: string;
  to: string;
  /** Tanlangan menejer (seat); bo'sh — hammasi. */
  seat: string;
}
