import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import './styles.css';

/**
 * FR-162: saqlangan mavzuni React ishga tushishidan OLDIN qo'llaymiz.
 * Aks holda sahifa bir lahza tizim mavzusida chaqnab, keyin tanlanganiga
 * o'tardi. Tanlanmagan bo'lsa atribut qo'yilmaydi va CSS tizim
 * sozlamasiga qaytadi.
 */
const saqlanganMavzu = localStorage.getItem('sotuvai-mavzu');
if (saqlanganMavzu === 'light' || saqlanganMavzu === 'dark') {
  document.documentElement.setAttribute('data-theme', saqlanganMavzu);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
