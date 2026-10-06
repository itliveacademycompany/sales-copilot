import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import { lugatniYukla, TilProvider, tilniOqi } from './i18n';
import { korinishOqi, korinishQoll } from './korinish';
import './styles.css';

/**
 * FR-162: saqlangan ko'rinishni React ishga tushishidan OLDIN qo'llaymiz.
 * Aks holda sahifa bir lahza standart mavzu va rangda chaqnab, keyin
 * tanlanganiga o'tardi. Tanlanmagan bo'lsa atribut qo'yilmaydi va CSS
 * o'z standart qiymatiga qaytadi.
 */
korinishQoll(korinishOqi());

const til = tilniOqi();

/**
 * `<html lang>` — ekran o'quvchi uchun.
 *
 * Noto'g'ri `lang` da o'quvchi ruscha matnni o'zbekcha talaffuz bilan
 * o'qiydi va tushunib bo'lmaydi.
 */
document.documentElement.lang = til;

/**
 * Lug'at renderdan OLDIN yuklanadi — faqat o'zbekcha bo'lmasa.
 *
 * O'zbek tilida hech narsa yuklanmaydi: lug'atlar alohida bo'lakda va
 * ular umuman so'ralmaydi. Boshqa tilda esa kutamiz, aks holda birinchi
 * kadr o'zbekcha chiqib, keyin almashardi.
 *
 * Xato bo'lsa (tarmoq uzilgan, bo'lak yuklanmadi) ilova baribir
 * ochiladi — shunchaki o'zbekcha bo'lib. Til tufayli ekran qulflanib
 * qolishi mumkin emas.
 */
async function ishgaTushir(): Promise<void> {
  if (til !== 'uz') {
    try {
      await lugatniYukla(til);
    } catch {
      /* lug'at kelmadi — o'zbekcha ko'rinadi */
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <TilProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </TilProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

void ishgaTushir();
