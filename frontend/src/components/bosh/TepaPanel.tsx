import { Bell, CalendarRange, FileText, Search, Settings, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtSana, type ConversationRow } from '../../api';
import { useAuth } from '../../auth';
import { useLokalAvatar } from '../avatar';
import { useT } from '../../i18n';
import { avatarRang, boshHarf, type Davr, type DavrTuri } from './malumot';

/** Qidiruvda topiladigan bo'limlar — menyu bilan bir xil. */
const SAHIFALAR = [
  { nom: 'Bosh sahifa', yol: '/' },
  { nom: 'Qo\'ng\'iroqlar', yol: '/qongiroqlar' },
  { nom: 'AI Chat', yol: '/ai-chat' },
  { nom: 'Analitika', yol: '/analitika' },
  { nom: 'Kunlik hisobot', yol: '/kunlik-hisobot' },
  { nom: 'Lid xulosalari', yol: '/lidlar' },
  { nom: 'Ogohlantirishlar', yol: '/ogohlantirishlar' },
  { nom: 'Suhbatlar', yol: '/suhbatlar' },
  { nom: 'Vazifalar', yol: '/vazifalar' },
  { nom: 'Baholash mezonlari', yol: '/playbook' },
  { nom: 'Sozlamalar', yol: '/sozlamalar' },
];

interface Natija {
  kalit: string;
  nom: string;
  izoh: string;
  yol: string;
  turi: 'sahifa' | 'suhbat';
}

/**
 * Tepa panel: global qidiruv (bo'limlar + yuklangan suhbatlar xulosasi),
 * AI yordamchi, ogohlantirishlar va foydalanuvchi.
 *
 * Qidiruv klaviatura bilan to'liq ishlaydi: ↑/↓ tanlash, Enter ochish,
 * Esc yopish, "/" — istalgan joydan qidiruvga fokus.
 */
export function TepaPanel({
  biznesNomi,
  foydalanuvchi,
  ogohSoni,
  ogohKoradi,
  suhbatlar,
}: {
  biznesNomi: string;
  foydalanuvchi: string;
  ogohSoni: number;
  ogohKoradi: boolean;
  suhbatlar: ConversationRow[];
}) {
  const navigate = useNavigate();
  const t = useT();
  // Profil rasmi: fayldan (shu brauzerda) yoki havoladan; bo'lmasa bosh harflar
  const { user } = useAuth();
  const lokalRasm = useLokalAvatar(user?.id);
  const rasm = lokalRasm ?? user?.avatarUrl ?? null;
  const [soz, setSoz] = useState('');
  const [ochiq, setOchiq] = useState(false);
  const [tanlangan, setTanlangan] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tugma = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const yozmoqda = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !yozmoqda) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', tugma);
    return () => window.removeEventListener('keydown', tugma);
  }, []);

  const natijalar = useMemo<Natija[]>(() => {
    const q = soz.trim().toLowerCase();
    if (q.length < 2) return [];
    const sahifa = SAHIFALAR.filter((s) => s.nom.toLowerCase().includes(q)).map<Natija>((s) => ({
      kalit: s.yol,
      nom: s.nom,
      izoh: 'Bo\'lim',
      yol: s.yol,
      turi: 'sahifa',
    }));
    const suhbat = suhbatlar
      .filter((c) => (c.summary ?? '').toLowerCase().includes(q) || (c.primaryGap ?? '').toLowerCase().includes(q))
      .slice(0, 6)
      .map<Natija>((c) => ({
        kalit: c.id,
        nom: c.summary ?? 'Suhbat',
        izoh: fmtSana(c.startedAt),
        yol: `/suhbatlar/${c.id}`,
        turi: 'suhbat',
      }));
    return [...sahifa, ...suhbat].slice(0, 9);
  }, [soz, suhbatlar]);

  const ot = (n: Natija) => {
    setOchiq(false);
    setSoz('');
    navigate(n.yol);
  };

  const klaviatura = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTanlangan((i) => Math.min(i + 1, natijalar.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTanlangan((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && natijalar[tanlangan]) {
      e.preventDefault();
      ot(natijalar[tanlangan]);
    } else if (e.key === 'Escape') {
      setOchiq(false);
      input.current?.blur();
    }
  };

  return (
    <header className="tepa-panel">
      <div className="tepa-biznes">{biznesNomi}</div>

      <div className="tepa-qidiruv" role="combobox" aria-expanded={ochiq && soz.length >= 2} aria-haspopup="listbox">
        <Search className="tepa-qidiruv-ikon" aria-hidden="true" />
        <input
          ref={input}
          value={soz}
          onChange={(e) => {
            setSoz(e.target.value);
            setOchiq(true);
            setTanlangan(0);
          }}
          onFocus={() => setOchiq(true)}
          onBlur={() => setTimeout(() => setOchiq(false), 150)}
          onKeyDown={klaviatura}
          placeholder={t('Qidirish...')}
          aria-label="Bo'lim yoki suhbat qidirish"
          aria-controls="tepa-qidiruv-natija"
        />
        <kbd className="tepa-kbd" aria-hidden="true">/</kbd>
        <button type="button" className="tepa-ai" onClick={() => navigate('/ai-chat')}>
          <Sparkles /> {t('AI yordamchi')}
        </button>

        {ochiq && soz.trim().length >= 2 && (
          <ul className="tepa-natijalar" id="tepa-qidiruv-natija" role="listbox">
            {natijalar.length === 0 ? (
              <li className="tepa-natija-bosh">Hech narsa topilmadi</li>
            ) : (
              natijalar.map((n, i) => (
                <li
                  key={n.kalit}
                  role="option"
                  aria-selected={i === tanlangan}
                  className={`tepa-natija${i === tanlangan ? ' tanlangan' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ot(n);
                  }}
                  onMouseEnter={() => setTanlangan(i)}
                >
                  <span className="tepa-natija-ikon" aria-hidden="true">
                    {n.turi === 'sahifa' ? <Search /> : <FileText />}
                  </span>
                  <span className="tepa-natija-matn">
                    <b>{n.nom}</b>
                    <small>{n.izoh}</small>
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className="tepa-ong">
        {ogohKoradi && (
          <button
            type="button"
            className="tepa-qongiroq"
            onClick={() => navigate('/ogohlantirishlar')}
            aria-label={`Ogohlantirishlar: ${ogohSoni} ta yangi`}
            title="Ogohlantirishlar"
          >
            <Bell />
            {ogohSoni > 0 && <span className="tepa-soni">{ogohSoni > 99 ? '99+' : ogohSoni}</span>}
          </button>
        )}
        <button
          type="button"
          className="tepa-foydalanuvchi"
          onClick={() => navigate('/sozlamalar')}
          title={t('Profil va sozlamalar')}
        >
          <span className="tepa-avatar" style={{ background: avatarRang(foydalanuvchi) }}>
            {rasm ? <img src={rasm} alt="" className="tepa-avatar-rasm" /> : boshHarf(foydalanuvchi)}
            <span className="tepa-onlayn" aria-hidden="true" />
          </span>
          <span className="tepa-ism">
            <b>{foydalanuvchi}</b>
            <small>{biznesNomi}</small>
          </span>
        </button>
      </div>
    </header>
  );
}

const DAVR_NOMLARI: { turi: Exclude<DavrTuri, 'maxsus'>; nom: string }[] = [
  { turi: 'bugun', nom: 'Bugun' },
  { turi: 'hafta', nom: 'Hafta' },
  { turi: 'oy', nom: 'Oy' },
];

function sanaInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const k = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${k}`;
}

export function sanaOraliq(d: Davr): string {
  const f = (x: Date) =>
    `${String(x.getDate()).padStart(2, '0')}.${String(x.getMonth() + 1).padStart(2, '0')}.${x.getFullYear()}`;
  return `${f(d.from)} – ${f(new Date(d.to.getTime() - 1))}`;
}

/** Sarlavha: biznes nomi + davr (Bugun / Hafta / Oy / Maxsus oraliq). */
export function DavrPanel({
  biznesNomi,
  davr,
  onTanla,
  onMaxsus,
  onSozlama,
}: {
  biznesNomi: string;
  davr: Davr;
  onTanla: (t: Exclude<DavrTuri, 'maxsus'>) => void;
  onMaxsus: (from: string, to: string) => void;
  onSozlama: () => void;
}) {
  const [ochiq, setOchiq] = useState(false);
  const [from, setFrom] = useState(sanaInput(davr.from));
  const [to, setTo] = useState(sanaInput(new Date(davr.to.getTime() - 1)));
  const bugun = sanaInput(new Date());
  const yaroqli = from !== '' && to !== '' && from <= to;

  return (
    <div className="card davr-panel">
      <h1>{biznesNomi}</h1>
      <div className="davr-boshqaruv">
        <div className="tab-qator" role="tablist" aria-label="Davr">
          {DAVR_NOMLARI.map((d) => (
            <button
              key={d.turi}
              role="tab"
              aria-selected={davr.turi === d.turi}
              className={`tab${davr.turi === d.turi ? ' active' : ''}`}
              onClick={() => {
                setOchiq(false);
                onTanla(d.turi);
              }}
            >
              {d.nom}
            </button>
          ))}
        </div>

        <div className="davr-maxsus-qobiq">
          <button
            type="button"
            className={`davr-maxsus${davr.turi === 'maxsus' ? ' faol' : ''}`}
            onClick={() => setOchiq((v) => !v)}
            aria-expanded={ochiq}
          >
            <CalendarRange />
            <span>Maxsus</span>
            <span className="davr-chiziq" aria-hidden="true" />
            <span className="davr-sana">{sanaOraliq(davr)}</span>
          </button>
          {ochiq && (
            <div className="davr-popover" role="dialog" aria-label="Maxsus davr">
              <div className="maydon-blok">
                <label htmlFor="d-from">Boshlanish</label>
                <input id="d-from" type="date" value={from} max={bugun} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="maydon-blok">
                <label htmlFor="d-to">Tugash</label>
                <input id="d-to" type="date" value={to} max={bugun} onChange={(e) => setTo(e.target.value)} />
              </div>
              {!yaroqli && <div className="yordam" style={{ color: 'var(--past)' }}>Boshlanish tugashdan keyin bo'lmasin</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn ikkinchi kichik" onClick={() => setOchiq(false)}>
                  Bekor
                </button>
                <button
                  className="btn kichik"
                  disabled={!yaroqli}
                  onClick={() => {
                    setOchiq(false);
                    onMaxsus(from, to);
                  }}
                >
                  Qo'llash
                </button>
              </div>
            </div>
          )}
        </div>

        <button type="button" className="davr-sozlama" onClick={onSozlama} aria-label="Sozlamalar" title="Sozlamalar">
          <Settings />
        </button>
      </div>
    </div>
  );
}
