import { Sparkles } from 'lucide-react';

/**
 * Ilova ishga tushayotgandagi ekran — `index.html` dagi bilan bir xil markup
 * (uslubi o'sha yerda, ichki `<style>` da). HTML'dagi ekran React kelguncha,
 * bu esa kirish tekshirilguncha va til lug'ati yuklanguncha ko'rinadi —
 * foydalanuvchi bitta uzluksiz yuklanish ekranini ko'radi.
 *
 * `ilk-davom` — kirish (paydo bo'lish) animatsiyasi takrorlanmasin: HTML
 * ekrandan shunga almashganda sahna "o'chib-yonmaydi". Holat matni tili
 * `<html data-ilk-til>` dan (index.html dagi skript qo'yadi).
 */
const HOLAT: Record<'uz' | 'ru' | 'en', string[]> = {
  uz: ["Suhbatlar yig'ilmoqda…", 'AI tahlil tayyorlanmoqda…', "Ko'rsatkichlar hisoblanmoqda…"],
  ru: ['Собираем разговоры…', 'Готовим AI-анализ…', 'Считаем показатели…'],
  en: ['Gathering conversations…', 'Preparing AI analysis…', 'Calculating metrics…'],
};

export function IlkYuklanish({ izoh = 'Yuklanmoqda' }: { izoh?: string }) {
  return (
    <div className="ilk-yuklanish ilk-davom" role="status" aria-label={izoh}>
      <div className="ilk-sahna" aria-hidden="true">
        <span className="ilk-halqa ilk-halqa-2" />
        <span className="ilk-halqa ilk-halqa-1" />
        <span className="ilk-orbita" />
        <span className="ilk-orb">
          <span className="ilk-belgi">
            <Sparkles />
          </span>
        </span>
      </div>
      <div className="ilk-brend">
        Deal <em>Mind</em>
      </div>
      <div className="ilk-tolqin" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="ilk-holat" aria-hidden="true">
        {(Object.keys(HOLAT) as (keyof typeof HOLAT)[]).map((til) => (
          <div key={til} className="ilk-holat-ichi" data-l={til}>
            {/* 4-qator 1-ning nusxasi — aylanish sakramasdan davom etadi */}
            {[...HOLAT[til], HOLAT[til][0]].map((m, i) => (
              <span key={i}>{m}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
