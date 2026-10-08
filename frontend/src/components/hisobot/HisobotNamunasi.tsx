import { FileText } from 'lucide-react';
import type { HisobotSozlama, Qism } from './hisobotMalumot';

/**
 * Hisobot namunasi — tanlangan qismlar bilan hisobot qanday ko'rinishini
 * ko'rsatadi. Nomlar (menejer, voronka, yo'nalish, savol, lid guruhi)
 * biznesingizdan olinadi; raqamlar NAMUNAVIY.
 */
export function HisobotNamunasi({
  s,
  menejerlar,
  voronkalar,
  lidGuruhlar,
  xizmatlar,
  savollar,
}: {
  s: HisobotSozlama;
  menejerlar: string[];
  voronkalar: string[];
  lidGuruhlar: string[];
  xizmatlar: string[];
  savollar: string[];
}) {
  const bolim = (k: Qism, nom: string, qatorlar: string[]) =>
    s.qismlar[k] ? (
      <section key={k} className="hn-bolim">
        <b>{nom}</b>
        {qatorlar.map((q, i) => (
          <p key={i}>{q}</p>
        ))}
      </section>
    ) : null;

  const m = menejerlar.length ? menejerlar : ['Menejer 1', 'Menejer 2'];
  const yonalishlar = xizmatlar.length ? xizmatlar : ["Asosiy yo'nalish"];
  const yoq = !Object.values(s.qismlar).some(Boolean);

  return (
    <div className="hn">
      <div className="hn-bosh">
        <FileText />
        <div>
          <b>Hisobot namunasi</b>
          <p>Tanlangan qismlar bilan kunlik hisobot qanday ko'rinishini ko'rsatadi. Nomlar biznesingizdan, raqamlar namunaviy.</p>
        </div>
      </div>
      <div className="hn-matn">
        {yoq && <p className="hn-bosh-holat">Hech bir qism tanlanmagan — hisobot bo'sh bo'ladi.</p>}
        {bolim('crm', 'CRM faolligi', [
          "- Jami qo'ng'iroqlar: 170",
          "- Bog'langan qo'ng'iroqlar: 92",
          "- Mijozga yetib borilmagan qo'ng'iroqlar: 78",
          "- Bog'lanish darajasi: 54.1%",
          '- Umumiy suhbat vaqti: 2 soat 7 daqiqa',
          "- Oldingi ish kuni: jami qo'ng'iroqlar 104, bog'langan 62, bog'lanish darajasi 59.6%",
        ])}
        {bolim('vazifalar', 'Vazifalar rejasi', [
          '- Bugungi reja vazifalaridan bajarilgani: 17 / 24',
          '- Bugungi reja vazifalaridan qolgani: 7',
          '- Bugun yakunlangan vazifalar: 29',
          'Menejerlar bo\'yicha (bajarildi/reja, qoldi, jami yakunlandi):',
          ...m.slice(0, 4).map((n, i) => `- ${n}: ${6 - i} / ${8 - i}, qoldi 2, jami ${9 - i}`),
        ])}
        {bolim('sifat', "Qo'ng'iroqlar sifati", [
          "- Tahlil qilingan qo'ng'iroqlar: 89",
          "- Savdo ssenariysi asosidagi qo'ng'iroqlar: 35 (39.3%)",
          "- Operatsion yoki chiqarilgan qo'ng'iroqlar: 54",
          "- Bog'lanilmagan holatlar: 40",
          "- O'rtacha ball: 40.0",
        ])}
        {bolim('menejerlar', 'Menejerlar faoliyati', [
          m.join(', '),
          "- Ko'rsatkichlar: Jami qo'ng'iroqlar: 91; Bog'langan: 55; Bog'lanish darajasi: 60.4%; O'rtacha ball: 40.0",
          '- Kuchli tomonlar: Professional ohang; Faol tinglash',
          "- E'tibor kerak bo'lgan jihatlar: Murojaat manbasini aniqlashtirish; To'lov shartlarini tushuntirish",
        ])}
        {bolim('lidlar', 'Lidlar harakati', [
          '- Yangi lidlar: 166',
          '- Yutilgan bitimlar: 1',
          "- Yo'qotilgan lidlar: 0",
          `- Kiritilgan voronkalar: ${voronkalar.length ? voronkalar.join(', ') : 'barcha voronkalar'}`,
        ])}
        {bolim('lidSifati', 'Lid sifati', [
          '- Jami yangi lidlar: 166',
          '- Ishlangan lidlar: 121',
          '- Sifatli: 46',
          '- Sifatsiz: 38',
          "- Bog'lana olinmagan: 37",
          ...(lidGuruhlar.length ? ['Guruhlar:', ...lidGuruhlar.map((g, i) => `- ${g}: ${[59, 19, 17, 6, 4, 3][i] ?? 2}`)] : []),
        ])}
        {bolim('xizmat', "Xizmat yo'nalishlari", yonalishlar.map((y, i) => `- ${y}: ${[13, 10, 7, 5, 3][i] ?? 2}`))}
        {bolim(
          'anketa',
          'Anketa savollari',
          savollar.length ? savollar.flatMap((q, i) => [`- ${q}`, `Bugungi holat: ${34 - i * 3} ta tahlil qilingan suhbatdan ${28 - i * 2} tasida javob olindi.`]) : ['Tanlangan savol yo\'q.'],
        )}
        {bolim('tavsiya', 'Tavsiyalar', [
          '1. Bugun kirgan yangi lidlarni tezkorlik bilan qayta ishlash.',
          "2. Bog'lanib bo'lmagan mijozlar bilan qayta aloqaga chiqish.",
          "3. Menejerlar uchun ishonch uyg'otish va to'lov shartlarini tushuntirish bo'yicha trening.",
        ])}
        {s.otishlar.length > 0 &&
          s.qismlar.lidlar && (
            <section className="hn-bolim">
              <b>Voronka bosqichlari harakati</b>
              {s.otishlar.map((o, i) => (
                <p key={o.id}>
                  - {o.voronka}: {o.dan} → {o.ga}: {[12, 7, 4, 3][i] ?? 2}
                </p>
              ))}
            </section>
          )}
        {bolim('xulosa', 'Xulosa', ["Lidlar oqimi yuqori, biroq qo'ng'iroqlar sifati va ulanish darajasi nazoratni talab qiladi."])}
      </div>
    </div>
  );
}
