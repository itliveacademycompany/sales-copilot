import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type AppealCriterionStat,
  type BusinessAccess,
  type ConversationDetail,
  type ConversationRow,
  type TaskAnalytics,
  type TaskRow,
} from '../../api';
import type { Davr } from '../bosh/malumot';

/**
 * Analitika uchun bosh sahifa ma'lumotiga QO'SHIMCHA yuklanadiganlar:
 *   • suhbat tafsilotlari (suhbat turi, soha, xizmat) — ro'yxat API'sida yo'q;
 *   • vazifalar ro'yxati va statistikasi;
 *   • e'tirozlar statistikasi (AI kalibratsiyasi).
 *
 * Tafsilotlar davrdagi BARCHA tahlillar uchun, 100 talik paketlarda
 * (`POST …/conversations/details`) keladi — grafik kutib turmaydi,
 * ma'lumot kelgan sari to'ladi. Ilgari har suhbat alohida so'ralib, 150 ta
 * bilan to'xtardi: 706 tahlildan grafiklarga 150 tasi tushardi.
 * Paket transkriptsiz, shuning uchun umumiy `tafsilotKesh` ga yozilmaydi
 * (u suhbat sahifasida to'liq detal sifatida ishlatiladi).
 */

const VAZIFA_HOLATLARI = ['pending', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
const PAKET = 100;
const PARALLEL = 3;

export function useAnalitikaQoshimcha(
  business: BusinessAccess | null,
  davr: Davr,
  joriyRows: ConversationRow[] | null,
) {
  const [tafsilot, setTafsilot] = useState<Record<string, ConversationDetail>>({});
  const [vazifalar, setVazifalar] = useState<TaskRow[] | null>(null);
  const [vazifaCheklangan, setVazifaCheklangan] = useState(false);
  const [vazifaStat, setVazifaStat] = useState<TaskAnalytics | null>(null);
  const [etirozlar, setEtirozlar] = useState<AppealCriterionStat[] | null>(null);
  const kesh = useRef<Record<string, ConversationDetail>>({});

  const biz = business ? `/api/v1/businesses/${business.businessId}` : '';
  const p = business?.permissions ?? [];

  useEffect(() => {
    if (!business) return;
    // Ro'yxat API'sida sahifalash yo'q (limit ≤ 200) — har holat alohida
    // so'raladi, shunda 1000 tagacha vazifa ko'rinadi. Biror holat chegaraga
    // tegsa, raqamlar "kamida" ekani interfeysda aytiladi.
    void Promise.all(
      VAZIFA_HOLATLARI.map((h) =>
        api.get<{ tasks: TaskRow[] }>(`${biz}/tasks?limit=200&status=${h}`).then((r) => r.tasks),
      ),
    )
      .then((qismlar) => {
        setVazifaCheklangan(qismlar.some((q) => q.length >= 200));
        setVazifalar(qismlar.flat());
      })
      .catch(() => setVazifalar([]));
    if (p.includes('task:read:all')) {
      void api.get<TaskAnalytics>(`${biz}/tasks/analytics`).then(setVazifaStat).catch(() => undefined);
    }
    if (p.includes('appeal:resolve')) {
      void api
        .get<{ criteria: AppealCriterionStat[] }>(`${biz}/appeals/analytics`)
        .then((r) => setEtirozlar(r.criteria))
        .catch(() => setEtirozlar([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz, davr.from.getTime(), davr.to.getTime()]);

  useEffect(() => {
    if (!business || !joriyRows) return;
    let bekor = false;
    const ids = joriyRows
      .filter((r) => r.status === 'done')
      .map((r) => r.id)
      .filter((id) => !kesh.current[id]);
    const navbat: string[][] = [];
    for (let i = 0; i < ids.length; i += PAKET) navbat.push(ids.slice(i, i + PAKET));
    const ishchi = async () => {
      while (!bekor && navbat.length) {
        const paket = navbat.shift()!;
        const r = await api
          .post<{ details: ConversationDetail[] }>(`${biz}/conversations/details`, { ids: paket })
          .catch(() => null);
        if (r && !bekor) {
          for (const d of r.details) kesh.current[d.conversation.id] = d;
          setTafsilot({ ...kesh.current });
        }
      }
    };
    void Promise.all(Array.from({ length: PARALLEL }, ishchi));
    return () => {
      bekor = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz, joriyRows]);

  const kutilmoqda = (joriyRows ?? []).filter((r) => r.status === 'done' && !tafsilot[r.id]).length;

  /** Bitta vazifani joyida almashtirish yoki qo'shish (holat o'zgarganda, yangi vazifa) — qayta yuklamasdan. */
  const vazifaniYangila = useCallback((t: TaskRow) => {
    setVazifalar((v) => {
      const eski = v ?? [];
      return eski.some((x) => x.id === t.id) ? eski.map((x) => (x.id === t.id ? t : x)) : [t, ...eski];
    });
  }, []);

  return { tafsilot, vazifalar, vazifaniYangila, vazifaCheklangan, vazifaStat, etirozlar, tafsilotKutilmoqda: kutilmoqda };
}

// ─── Vaqt bo'laklari ────────────────────────────────────────────────────────

export interface Bolak {
  nom: string;
  from: number;
  to: number;
}

const KUN = 86400_000;
const dd = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Bir kun — 2 soatlik, 14 kungacha — kunlik, undan uzun — haftalik bo'laklar. */
export function bolaklar(davr: Davr): { royxat: Bolak[]; turi: 'soat' | 'kun' | 'hafta' } {
  const from = davr.from.getTime();
  const to = davr.to.getTime();
  const kunlar = (to - from) / KUN;
  const royxat: Bolak[] = [];
  if (kunlar <= 1.01) {
    for (let t = from; t < to; t += 2 * 3600_000) {
      const d = new Date(t);
      royxat.push({ nom: `${String(d.getHours()).padStart(2, '0')}:00`, from: t, to: Math.min(to, t + 2 * 3600_000) });
    }
    return { royxat, turi: 'soat' };
  }
  const bosh = new Date(davr.from);
  bosh.setHours(0, 0, 0, 0);
  const qadam = kunlar > 14 ? 7 : 1;
  for (let t = bosh.getTime(); t < to; t += qadam * KUN) {
    const a = new Date(t);
    const b = new Date(Math.min(to, t + qadam * KUN) - 1);
    royxat.push({ nom: qadam === 1 ? dd(a) : `${dd(a)}–${dd(b)}`, from: t, to: t + qadam * KUN });
  }
  return { royxat, turi: qadam === 1 ? 'kun' : 'hafta' };
}

export function bolakda(rows: ConversationRow[], b: Bolak): ConversationRow[] {
  return rows.filter((r) => {
    const t = new Date(r.startedAt).getTime();
    return t >= b.from && t < b.to;
  });
}
