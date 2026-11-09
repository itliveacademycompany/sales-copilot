import { Sparkles } from 'lucide-react';

/**
 * Ilova ishga tushayotgandagi ekran — `index.html` dagi bilan bir xil
 * (uslubi o'sha yerda, ichki `<style>` da). HTML'dagi ekran React kelguncha,
 * bu esa kirish tekshirilguncha va til lug'ati yuklanguncha ko'rinadi —
 * foydalanuvchi bitta uzluksiz yuklanish ekranini ko'radi.
 */
export function IlkYuklanish({ izoh = 'Yuklanmoqda' }: { izoh?: string }) {
  return (
    <div className="ilk-yuklanish" role="status" aria-label={izoh}>
      <div className="ilk-brend">
        <span className="ilk-belgi" aria-hidden="true">
          <Sparkles />
        </span>
        <span>
          Deal <em>Mind</em>
        </span>
      </div>
      <div className="ilk-chiziq" />
    </div>
  );
}
