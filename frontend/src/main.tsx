import { LucideProvider } from 'lucide-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import { TilProvider } from './i18n';
import './styles.css';

/**
 * FR-162: saqlangan mavzuni React ishga tushishidan OLDIN qo'llaymiz.
 * Aks holda sahifa bir lahza boshqa mavzuda chaqnab, keyin tanlanganiga
 * o'tardi.
 *
 * Sukut bo'yicha — yorug' (oq) dizayn. Tizim sozlamasiga faqat
 * foydalanuvchi "Tizim bo'yicha" ni o'zi tanlaganda ergashiladi.
 */
const saqlanganMavzu = localStorage.getItem('sotuvai-mavzu');
if (saqlanganMavzu !== 'system') {
  document.documentElement.setAttribute(
    'data-theme',
    saqlanganMavzu === 'dark' ? 'dark' : 'light',
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Barcha ikonlar uchun yagona chiziq qalinligi (SF Symbols'ga yaqin).
        O'lcham CSS'da: .lucide { 1em } — matn o'lchamiga moslashadi. */}
    <LucideProvider strokeWidth={1.75}>
      <BrowserRouter>
        <AuthProvider>
          <TilProvider>
            <App />
          </TilProvider>
        </AuthProvider>
      </BrowserRouter>
    </LucideProvider>
  </StrictMode>,
);
