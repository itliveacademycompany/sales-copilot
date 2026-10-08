import { api, type ConversationDetail } from '../api';

/**
 * Suhbat tafsilotlari uchun umumiy kesh (bosh sahifa, Qo'ng'iroqlar,
 * Analitika).
 *
 * Nega kerak: ro'yxat API'si suhbat turi, xizmat va telefonni bermaydi,
 * shuning uchun bir nechta sahifa har suhbat tafsilotini alohida so'raydi.
 * Keshsiz sahifalar orasida yurish bir xil so'rovlarni qayta-qayta yuborib,
 * serverdagi so'rovlar chegarasiga (daqiqasiga 300) tez yetadi.
 *
 * Bir xil suhbat uchun bir vaqtda kelgan so'rovlar bitta va'daga (promise)
 * birlashtiriladi. Muddat — 5 daqiqa: tahlil qayta ishlansa, yangisi
 * ko'p kutmay ko'rinadi. Xato keshlanmaydi.
 */

const MUDDAT = 5 * 60_000;
const kesh = new Map<string, { vaqt: number; vada: Promise<ConversationDetail> }>();

export function tafsilotOl(biz: string, id: string): Promise<ConversationDetail> {
  const kalit = `${biz}/${id}`;
  const bor = kesh.get(kalit);
  if (bor && Date.now() - bor.vaqt < MUDDAT) return bor.vada;
  const vada = api.get<ConversationDetail>(`${biz}/conversations/${id}`);
  kesh.set(kalit, { vaqt: Date.now(), vada });
  vada.catch(() => kesh.delete(kalit));
  return vada;
}

/** Keshda tayyor turgan tafsilot (sinxron) — kutmasdan darhol ko'rsatish uchun. */
export function tafsilotKeshda(biz: string, id: string): boolean {
  const bor = kesh.get(`${biz}/${id}`);
  return !!bor && Date.now() - bor.vaqt < MUDDAT;
}
