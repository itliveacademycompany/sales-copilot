import {
  api,
  fmtSana,
  fmtSoniya,
  lidTuri,
  type BusinessAccess,
  type ConversationRow,
  type CriterionAgg,
  type Kpi,
  type LeaderboardRow,
  type SeatDashboard,
  type TaskRow,
} from '../../api';

/**
 * AI Chat javob mexanizmi.
 *
 * MUHIM: backendda erkin savolga javob beruvchi AI yordamchi API'si hali
 * yo'q. Shuning uchun javob O'YLAB TOPILMAYDI — savol tayyor niyatlardan
 * biriga moslanadi va javob mavjud hisobot API'laridan aniq hisoblanadi.
 * Niyat aniqlanmasa — yordamchi buni ochiq aytadi. Backend tayyor bo'lganda
 * `javobBer` ichidagi zaxira tarmog'i haqiqiy so'rov bilan almashtiriladi.
 */

export type Niyat = 'zaif' | 'yetakchi' | 'javobsiz' | 'kpi' | 'vazifa' | 'issiq';
export type Davr = 'bugun' | 'hafta';

export interface Javob {
  matn: string;
  /** Javob ostidagi havola (masalan suhbatlar ro'yxatiga). */
  havola?: { to: string; nom: string };
}

/** Erkin matnni tayyor niyatlardan biriga moslash (kalit so'zlar bo'yicha). */
export function niyatniTop(matn: string): Niyat | null {
  const t = matn.toLowerCase().replace(/[ʻ‘’`]/g, "'");
  if (/zaif|mezon|qiynal|yaxshilanish|xato|tahlil/.test(t)) return 'zaif';
  if (/eng yaxshi|yetakchi|reyting|kim eng|lider|menejer/.test(t)) return 'yetakchi';
  if (/javob kut|javobsiz|javob berilmagan|bog'lanmagan/.test(t)) return 'javobsiz';
  if (/vazifa|kechik|muddat/.test(t)) return 'vazifa';
  if (/issiq|lid|pipeline|bitim|bosqich/.test(t)) return 'issiq';
  if (/ko'rsatkich|hafta|natija|holat|statistika|kpi|sotuv|qo'ng'iroq|suhbat/.test(t)) return 'kpi';
  return null;
}

/** Savolda "bugun" bo'lsa — bugungi kun, aks holda oxirgi 7 kun. */
export function davrniTop(matn: string): Davr {
  return /bugun/i.test(matn) ? 'bugun' : 'hafta';
}

const KUN = 86400_000;

function davrQs(d: Davr): { qs: string; nom: string } {
  const now = new Date();
  const from = d === 'bugun' ? new Date(new Date().setHours(0, 0, 0, 0)) : new Date(now.getTime() - 7 * KUN);
  return { qs: `?from=${encodeURIComponent(from.toISOString())}`, nom: d === 'bugun' ? 'Bugun' : 'Oxirgi 7 kunda' };
}

export async function javobBer(niyat: Niyat, b: BusinessAccess, davr: Davr = 'hafta'): Promise<Javob> {
  const biz = `/api/v1/businesses/${b.businessId}`;
  const rahbar = b.permissions.includes('analytics:read:all');
  const { qs: q, nom: davrNom } = davrQs(davr);

  // Sotuvchi uchun hamma ko'rsatkich o'z kabinetidan olinadi (FR-112).
  const kabinet = async (): Promise<SeatDashboard | null> =>
    b.seatId ? api.get<SeatDashboard>(`${biz}/dashboard/seats/${b.seatId}${q}`) : null;
  const kpi = async (): Promise<Kpi | undefined> =>
    rahbar ? (await api.get<{ current: Kpi }>(`${biz}/dashboard/kpi${q}`)).current : (await kabinet())?.current;

  switch (niyat) {
    case 'kpi': {
      const k = await kpi();
      if (!k) return { matn: 'Ko\'rsatkichlarni olib bo\'lmadi — sizga sotuvchi biriktirilmagan.' };
      if (k.conversations === 0) {
        return { matn: `${davrNom} suhbat bo'lmagan. Davrni kengaytirish uchun "bu hafta" deb so'rang.` };
      }
      return {
        matn:
          `${davrNom} ${k.conversations} ta suhbat bo'ldi, ${k.analyzed} tasi tahlil qilindi.\n` +
          `• O'rtacha ball: ${k.avgScore === null ? 'hali yo\'q' : `${k.avgScore}%`}\n` +
          `• Birinchi javob (median): ${fmtSoniya(k.medianFirstResponseSeconds)}\n` +
          `• Javobsiz sessiyalar: ${k.unansweredSessions}\n` +
          `• Ko'rik talab qiladigan: ${k.flagged}`,
        havola: rahbar ? { to: '/analitika', nom: 'Analitikani ochish' } : { to: '/', nom: 'Kabinetni ochish' },
      };
    }
    case 'zaif': {
      if (rahbar) {
        const r = await api.get<{ criteria: CriterionAgg[]; weakest: CriterionAgg | null }>(`${biz}/dashboard/criteria${q}`);
        if (!r.weakest) return { matn: `${davrNom} baholangan mezon yo'q — tahlillar to'planishi kerak.` };
        const keyingi = r.criteria
          .filter((m) => m.avgPct !== null && m.code !== r.weakest!.code)
          .sort((a, c) => (a.avgPct ?? 0) - (c.avgPct ?? 0))
          .slice(0, 2);
        return {
          matn:
            `Jamoaning eng zaif joyi — «${r.weakest.name}» (${r.weakest.code}): o'rtacha ${r.weakest.avgScore}/3.` +
            (keyingi.length
              ? `\nKeyingi zaif mezonlar: ${keyingi.map((m) => `«${m.name}» ${Math.round(m.avgPct!)}%`).join(', ')}.`
              : '') +
            '\nShu bosqichni jamoa bilan birgalikda mashq qilish eng katta o\'sish beradi.',
          havola: { to: '/analitika', nom: 'Barcha mezonlar' },
        };
      }
      const d = await kabinet();
      if (!d?.weakestCriterion) return { matn: 'Hali yetarli baho yo\'q — zaif mezonni aniqlab bo\'lmadi.' };
      return {
        matn:
          `Sizning eng zaif mezoningiz — «${d.weakestCriterion.name}» (${d.weakestCriterion.code}): ` +
          `o'rtacha ${d.weakestCriterion.avgScore}/3, ${d.weakestCriterion.scored} ta baho asosida.`,
        havola: { to: '/', nom: 'Kabinetda batafsil' },
      };
    }
    case 'yetakchi': {
      if (!rahbar) return { matn: 'Jamoa reytingi faqat rahbarlarga ko\'rinadi.' };
      const r = await api.get<{ leaderboard: LeaderboardRow[] }>(`${biz}/dashboard/leaderboard${q}`);
      const top = r.leaderboard.filter((x) => x.avgScore !== null).sort((a, c) => (c.avgScore ?? 0) - (a.avgScore ?? 0)).slice(0, 3);
      if (top.length === 0) return { matn: `${davrNom} reyting uchun yetarli tahlil yo'q.` };
      const [bir] = top;
      return {
        matn:
          `${davrNom} eng yaxshi natija — ${bir!.displayName}: o'rtacha ${bir!.avgScore}%, ${bir!.conversations} ta suhbat, ` +
          `birinchi javob ${fmtSoniya(bir!.medianFirstResponseSeconds)}.` +
          (top.length > 1
            ? `\nReyting:\n${top.map((x, i) => `${i + 1}. ${x.displayName} — ${x.avgScore}% (${x.conversations} suhbat)`).join('\n')}`
            : ''),
        havola: { to: '/analitika', nom: 'To\'liq reyting' },
      };
    }
    case 'javobsiz': {
      const n = (await kpi())?.unansweredSessions ?? 0;
      return n > 0
        ? {
            matn: `Ha — ${davrNom.toLowerCase()} ${n} ta sessiyada mijoz xabari javobsiz qolgan. Bular eng tez qaytadigan lidlar — bugun qayta yozing.`,
            havola: b.permissions.includes('alert:read')
              ? { to: '/ogohlantirishlar', nom: 'Ogohlantirishlarni ochish' }
              : { to: '/suhbatlar', nom: 'Suhbatlarni ochish' },
          }
        : { matn: `Yo'q — ${davrNom.toLowerCase()} barcha mijozlarga javob berilgan.` };
    }
    case 'vazifa': {
      const r = await api.get<{ tasks: TaskRow[] }>(`${biz}/tasks?view=overdue`);
      if (r.tasks.length === 0) return { matn: 'Kechikkan vazifa yo\'q — hammasi muddatida.' };
      return {
        matn:
          `${r.tasks.length} ta vazifa kechikkan:\n` +
          r.tasks
            .slice(0, 5)
            .map((t) => `• ${t.title}${t.dueAt ? ` — muddat ${fmtSana(t.dueAt)}` : ''}`)
            .join('\n'),
        havola: { to: '/vazifalar', nom: 'Vazifalarni ochish' },
      };
    }
    case 'issiq': {
      const r = await api.get<{ conversations: ConversationRow[] }>(`${biz}/conversations?status=done&limit=100`);
      const hisob = { hot: 0, warm: 0, cold: 0 };
      for (const c of r.conversations) {
        const t = lidTuri(c.leadQuality);
        if (t) hisob[t]++;
      }
      const issiq = r.conversations.filter((c) => lidTuri(c.leadQuality) === 'hot');
      if (hisob.hot + hisob.warm + hisob.cold === 0) return { matn: 'Hozircha lid sifati baholangan suhbat yo\'q.' };
      return {
        matn:
          `Lidlar holati: ${hisob.hot} ta issiq, ${hisob.warm} ta iliq, ${hisob.cold} ta sovuq.` +
          (issiq.length
            ? `\nYopilishga eng yaqin (issiq) lidlar:\n${issiq
                .slice(0, 3)
                .map((c) => `• ${fmtSana(c.startedAt)} — ${c.summary ?? 'xulosa yo\'q'}`)
                .join('\n')}`
            : ''),
        havola: { to: '/lidlar', nom: 'Lid xulosalari' },
      };
    }
  }
}
