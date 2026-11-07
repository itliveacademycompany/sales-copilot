import { useState } from 'react';
import './murojaat-avatar.css';

/**
 * Murojaat yozuvchisining profil rasmi (Telegram, Messenger, Instagram).
 * Rasm kelguncha va kelmasa (yopiq yoki yo'q) — bosh harflar ko'rinadi.
 * Ota element `position: relative` va dumaloq bo'lishi kerak.
 */
export function AvatarRasmi({ src, harflar }: { src: string | null; harflar: string }) {
  const [holat, setHolat] = useState<'kutish' | 'tayyor' | 'yoq'>('kutish');
  return (
    <>
      {holat !== 'tayyor' && harflar}
      {src && holat !== 'yoq' && (
        <img
          className={`avatar-rasm${holat === 'tayyor' ? ' tayyor' : ''}`}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setHolat('tayyor')}
          onError={() => setHolat('yoq')}
        />
      )}
    </>
  );
}

/** "Ali Valiyev" → "AV"; raqam yoki bo'sh bo'lsa "#". */
export function boshHarflar(nom: string): string {
  const q = nom.replace(/^[@+]/, '').trim().split(/\s+/).filter(Boolean);
  const h = ((q[0]?.[0] ?? '') + (q[1]?.[0] ?? '')).toUpperCase();
  return /\d/.test(h) || !h ? '#' : h;
}

/** Profil rasmi faqat tarmoq xabarlarida bor (reklama formasi, qo'ng'iroqda yo'q). */
export function avatarManzili(base: string, m: { id: string; source: string; payload?: { type?: string } | null }): string | null {
  return ['facebook', 'instagram', 'telegram'].includes(m.source) && m.payload?.type === 'message' ? `${base}/crm-app/inbox/${m.id}/avatar` : null;
}
