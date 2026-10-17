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
import { tarjima } from '../../i18n';

/**
 * AI Chat javob mexanizmi.
 *
 * MUHIM: backendda erkin savolga javob beruvchi AI yordamchi API'si hali
 * yo'q. Shuning uchun javob O'YLAB TOPILMAYDI — savol tayyor niyatlardan
 * biriga moslanadi va javob mavjud hisobot API'laridan aniq hisoblanadi.
 * Niyat aniqlanmasa — yordamchi buni ochiq aytadi. Backend tayyor bo'lganda
 * `javobBer` ichidagi zaxira tarmog'i haqiqiy so'rov bilan almashtiriladi.
 *
 * Javob matni joriy interfeys tilida yoziladi (`tarjima`). Havola nomi esa
 * o'zbekcha kalit bo'lib qoladi — chat uni ko'rsatishda tarjima qiladi,
 * shuning uchun tarixdagi eski xabarlar ham til almashganda to'g'ri chiqadi.
 */

export type Niyat = 'zaif' | 'yetakchi' | 'javobsiz' | 'kpi' | 'vazifa' | 'issiq';
export type Davr = 'bugun' | 'hafta';

export interface Javob {
  matn: string;
  /** Javob ostidagi havola (masalan suhbatlar ro'yxatiga). */
  havola?: { to: string; nom: string };
}

/**
 * Erkin matnni tayyor niyatlardan biriga moslash (kalit so'zlar bo'yicha).
 * O'zbekcha, inglizcha va ruscha kalit so'zlar tushuniladi.
 */
export function niyatniTop(matn: string): Niyat | null {
  const t = matn.toLowerCase().replace(/[ʻ‘’`]/g, "'");
  if (/zaif|mezon|qiynal|yaxshilanish|xato|tahlil|weak|criteri|improv|mistake|слаб|критер|ошиб|улучш|анализ/.test(t)) return 'zaif';
  if (/eng yaxshi|yetakchi|reyting|kim eng|lider|menejer|best|leader|ranking|\btop\b|лучш|лидер|рейтинг|менеджер/.test(t)) return 'yetakchi';
  if (/javob kut|javobsiz|javob berilmagan|bog'lanmagan|unanswer|no reply|waiting for|без ответа|не ответ|ждут ответ/.test(t)) return 'javobsiz';
  if (/vazifa|kechik|muddat|task|overdue|deadline|задач|просроч|срок/.test(t)) return 'vazifa';
  if (/issiq|lid|pipeline|bitim|bosqich|hot|lead|deal|горяч|лид|сделк|воронк/.test(t)) return 'issiq';
  if (/ko'rsatkich|hafta|natija|holat|statistika|kpi|sotuv|qo'ng'iroq|suhbat|metric|week|result|status|stat|sales|call|conversation|показател|недел|результат|статист|продаж|звон|разговор|переписк/.test(t))
    return 'kpi';
  return null;
}

/** Savolda "bugun" bo'lsa — bugungi kun, aks holda oxirgi 7 kun. */
export function davrniTop(matn: string): Davr {
  return /bugun|today|сегодня/i.test(matn) ? 'bugun' : 'hafta';
}

const KUN = 86400_000;

function davrQs(d: Davr): { qs: string; nom: string } {
  const now = new Date();
  const from = d === 'bugun' ? new Date(new Date().setHours(0, 0, 0, 0)) : new Date(now.getTime() - 7 * KUN);
  return {
    qs: `?from=${encodeURIComponent(from.toISOString())}`,
    nom: d === 'bugun' ? tarjima('Bugun') : tarjima('Oxirgi 7 kunda'),
  };
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
      if (!k) return { matn: tarjima("Ko'rsatkichlarni olib bo'lmadi — sizga sotuvchi biriktirilmagan.") };
      if (k.conversations === 0) {
        return {
          matn: tarjima(`{davr} suhbat bo'lmagan. Davrni kengaytirish uchun "bu hafta" deb so'rang.`, { davr: davrNom }),
        };
      }
      return {
        matn:
          tarjima("{davr} {n} ta suhbat bo'ldi, {m} tasi tahlil qilindi.", {
            davr: davrNom,
            n: k.conversations,
            m: k.analyzed,
          }) +
          '\n' +
          `• ${tarjima("O'rtacha ball: {qiymat}", { qiymat: k.avgScore === null ? tarjima("hali yo'q") : `${k.avgScore}%` })}\n` +
          `• ${tarjima('Birinchi javob (median): {qiymat}', { qiymat: fmtSoniya(k.medianFirstResponseSeconds) })}\n` +
          `• ${tarjima('Javobsiz sessiyalar: {n}', { n: k.unansweredSessions })}\n` +
          `• ${tarjima("Ko'rik talab qiladigan: {n}", { n: k.flagged })}`,
        havola: rahbar ? { to: '/analitika', nom: 'Analitikani ochish' } : { to: '/', nom: 'Kabinetni ochish' },
      };
    }
    case 'zaif': {
      if (rahbar) {
        const r = await api.get<{ criteria: CriterionAgg[]; weakest: CriterionAgg | null }>(`${biz}/dashboard/criteria${q}`);
        if (!r.weakest) {
          return { matn: tarjima("{davr} baholangan mezon yo'q — tahlillar to'planishi kerak.", { davr: davrNom }) };
        }
        const keyingi = r.criteria
          .filter((m) => m.avgPct !== null && m.code !== r.weakest!.code)
          .sort((a, c) => (a.avgPct ?? 0) - (c.avgPct ?? 0))
          .slice(0, 2);
        return {
          matn:
            tarjima("Jamoaning eng zaif joyi — «{nom}» ({kod}): o'rtacha {ball}/3.", {
              nom: r.weakest.name,
              kod: r.weakest.code,
              ball: String(r.weakest.avgScore),
            }) +
            (keyingi.length
              ? '\n' +
                tarjima('Keyingi zaif mezonlar: {royxat}.', {
                  royxat: keyingi.map((m) => `«${m.name}» ${Math.round(m.avgPct!)}%`).join(', '),
                })
              : '') +
            '\n' +
            tarjima("Shu bosqichni jamoa bilan birgalikda mashq qilish eng katta o'sish beradi."),
          havola: { to: '/analitika', nom: 'Barcha mezonlar' },
        };
      }
      const d = await kabinet();
      if (!d?.weakestCriterion) return { matn: tarjima("Hali yetarli baho yo'q — zaif mezonni aniqlab bo'lmadi.") };
      return {
        matn: tarjima("Sizning eng zaif mezoningiz — «{nom}» ({kod}): o'rtacha {ball}/3, {n} ta baho asosida.", {
          nom: d.weakestCriterion.name,
          kod: d.weakestCriterion.code,
          ball: String(d.weakestCriterion.avgScore),
          n: d.weakestCriterion.scored,
        }),
        havola: { to: '/', nom: 'Kabinetda batafsil' },
      };
    }
    case 'yetakchi': {
      if (!rahbar) return { matn: tarjima("Jamoa reytingi faqat rahbarlarga ko'rinadi.") };
      const r = await api.get<{ leaderboard: LeaderboardRow[] }>(`${biz}/dashboard/leaderboard${q}`);
      const top = r.leaderboard.filter((x) => x.avgScore !== null).sort((a, c) => (c.avgScore ?? 0) - (a.avgScore ?? 0)).slice(0, 3);
      if (top.length === 0) return { matn: tarjima("{davr} reyting uchun yetarli tahlil yo'q.", { davr: davrNom }) };
      const [bir] = top;
      return {
        matn:
          tarjima(
            "{davr} eng yaxshi natija — {ism}: o'rtacha {ball}%, {n} ta suhbat, birinchi javob {javob}.",
            {
              davr: davrNom,
              ism: bir!.displayName,
              ball: String(bir!.avgScore),
              n: bir!.conversations,
              javob: fmtSoniya(bir!.medianFirstResponseSeconds),
            },
          ) +
          (top.length > 1
            ? `\n${tarjima('Reyting:')}\n${top
                .map((x, i) =>
                  tarjima('{orin}. {ism} — {ball}% ({n} suhbat)', {
                    orin: i + 1,
                    ism: x.displayName,
                    ball: String(x.avgScore),
                    n: x.conversations,
                  }),
                )
                .join('\n')}`
            : ''),
        havola: { to: '/analitika', nom: "To'liq reyting" },
      };
    }
    case 'javobsiz': {
      const n = (await kpi())?.unansweredSessions ?? 0;
      return n > 0
        ? {
            matn: tarjima(
              'Ha — {davr} {n} ta sessiyada mijoz xabari javobsiz qolgan. Bular eng tez qaytadigan lidlar — bugun qayta yozing.',
              { davr: davrNom.toLowerCase(), n },
            ),
            havola: b.permissions.includes('alert:read')
              ? { to: '/ogohlantirishlar', nom: 'Ogohlantirishlarni ochish' }
              : { to: '/suhbatlar', nom: 'Suhbatlarni ochish' },
          }
        : { matn: tarjima("Yo'q — {davr} barcha mijozlarga javob berilgan.", { davr: davrNom.toLowerCase() }) };
    }
    case 'vazifa': {
      const r = await api.get<{ tasks: TaskRow[] }>(`${biz}/tasks?view=overdue`);
      if (r.tasks.length === 0) return { matn: tarjima("Kechikkan vazifa yo'q — hammasi muddatida.") };
      return {
        matn:
          tarjima('{n} ta vazifa kechikkan:', { n: r.tasks.length }) +
          '\n' +
          r.tasks
            .slice(0, 5)
            .map(
              (t) =>
                `• ${t.title}${t.dueAt ? ` — ${tarjima('muddat {sana}', { sana: fmtSana(t.dueAt) })}` : ''}`,
            )
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
      if (hisob.hot + hisob.warm + hisob.cold === 0) {
        return { matn: tarjima("Hozircha lid sifati baholangan suhbat yo'q.") };
      }
      return {
        matn:
          tarjima('Lidlar holati: {issiq} ta issiq, {iliq} ta iliq, {sovuq} ta sovuq.', {
            issiq: hisob.hot,
            iliq: hisob.warm,
            sovuq: hisob.cold,
          }) +
          (issiq.length
            ? `\n${tarjima('Yopilishga eng yaqin (issiq) lidlar:')}\n${issiq
                .slice(0, 3)
                .map((c) => `• ${fmtSana(c.startedAt)} — ${c.summary ?? tarjima("xulosa yo'q")}`)
                .join('\n')}`
            : ''),
        havola: { to: '/lidlar', nom: 'Lid xulosalari' },
      };
    }
  }
}
