import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Languages,
  ListChecks,
  LogOut,
  MessagesSquare,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Jarayon } from '../components/loyiha/Jarayon';
import { BOLIMLAR, BOSHLASH, QATLAM_IKONLARI, ROL_RAHBARMI, TAMOYILLAR } from '../components/loyiha/malumot';
import { useMatn } from '../components/loyiha/tarjima';
import { TilTanlash } from '../components/TilTanlash';
import { Xarita } from '../components/loyiha/Xarita';
import '../components/loyiha/loyiha.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA HAQIDA — birinchi ochiladigan landing sahifasi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tizimga kirmagan odam `/` da shu sahifani ko'radi: platforma nima
 * qiladi, qanday ishlaydi, qaysi bo'lim nima uchun va qanday tuzilgan.
 * "Kirish" tugmasi login sahifasiga (`/kirish`) olib boradi. Kirgan
 * foydalanuvchi uchun ham `/loyiha` manzilida ochiq qoladi.
 * Dizayn kirish ekrani bilan bitta tilda — neumorfizm, suzuvchi shakllar,
 * skroll bilan yig'iladigan sahna.
 *
 * Uch tilda (o'zbek, rus, ingliz): matnlar `components/loyiha/tarjima.ts`
 * da, til ilovaning umumiy holatidan (`useTil`) — tepadagi almashtirgich
 * uni o'zgartiradi va tanlov brauzerda eslab qolinadi.
 *
 * Sahifa Layout'dan TASHQARIDA (yon panelsiz) — bu taqdimot, ish ekrani emas.
 *
 * Bo'limlar va "boshlash" qadamlari rolga qarab ko'rsatiladi: sotuvchiga
 * rahbar sozlamalari emas, o'z kabineti bilan ishlash yo'li kerak. Mehmonga
 * esa to'liq (rahbar) ko'rinish — u mahsulotni butunligicha ko'rishi kerak.
 *
 * Ro'yxatlarda kalit — indeks, matn emas: til almashganda elementlar qayta
 * yaratilmasligi kerak, aks holda skroll animatsiyasi holati yo'qoladi.
 */

const BOLIMLAR_NAV = ['jarayon', 'bolimlar', 'boshlash', 'tuzilish'] as const;

type BolimId = (typeof BOLIMLAR_NAV)[number];

function harakatRuxsat(): boolean {
  return window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
}

export function LoyihaHaqida() {
  const { user, business, logout } = useAuth();
  const m = useMatn();
  const navigate = useNavigate();
  const ildizRef = useRef<HTMLDivElement>(null);
  const [siljigan, setSiljigan] = useState(false);
  const [tepagaKorinsin, setTepagaKorinsin] = useState(false);
  const [faolBolim, setFaolBolim] = useState<BolimId | null>(null);

  /** Tizimga kirmagan — landing sifatida ochilgan. */
  const mehmon = !user || !business;
  const p = business?.permissions ?? [];
  const rahbar = mehmon || p.includes('analytics:read:all');
  const ogohKoradi = mehmon || p.includes('alert:read');
  const sozlanmagan = !mehmon && business.onboardingStep !== 'done';
  const ism = user?.displayName?.trim().split(/\s+/)[0];

  const platformaga = () => navigate(mehmon ? '/kirish' : '/');
  const asosiyTugma = mehmon ? m.tugma.kirish : sozlanmagan ? m.tugma.sozlash : m.tugma.platformaga;

  // Kirishdan keyin sahifa doim tepadan ochilsin
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Tepa panel soyasi — sahifa siljigandagina. "Yuqoriga" tugmasi esa
  // ~1.5 ekran pastga tushilgandan keyin (birinchi ekranni to'smasin).
  useEffect(() => {
    const tingla = () => {
      setSiljigan(window.scrollY > 8);
      setTepagaKorinsin(window.scrollY > window.innerHeight * 1.5);
    };
    tingla();
    window.addEventListener('scroll', tingla, { passive: true });
    return () => window.removeEventListener('scroll', tingla);
  }, []);

  // Navigatsiyadagi faol bo'lim (scrollspy)
  useEffect(() => {
    const kuzatuvchi = new IntersectionObserver(
      (yozuvlar) => {
        for (const y of yozuvlar) {
          const id = y.target.id as BolimId;
          // Bo'limdan chiqilganda (masalan hero'ga qaytilganda) belgi o'chadi
          setFaolBolim((joriy) => (y.isIntersecting ? id : joriy === id ? null : joriy));
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const id of BOLIMLAR_NAV) {
      const el = document.getElementById(id);
      if (el) kuzatuvchi.observe(el);
    }
    return () => kuzatuvchi.disconnect();
  }, []);

  // Bloklar ko'rinish maydoniga kirganda paydo bo'ladi (bir marta)
  useEffect(() => {
    const ildiz = ildizRef.current;
    if (!ildiz || !harakatRuxsat()) return;
    ildiz.classList.add('harakat');
    const kuzatuvchi = new IntersectionObserver(
      (yozuvlar) => {
        for (const y of yozuvlar) {
          if (!y.isIntersecting) continue;
          y.target.classList.add('korindi');
          kuzatuvchi.unobserve(y.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    ildiz.querySelectorAll('.ly-paydo').forEach((el) => kuzatuvchi.observe(el));
    return () => kuzatuvchi.disconnect();
  }, []);

  const bolimgaBor = (e: MouseEvent, id: string) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: harakatRuxsat() ? 'smooth' : 'auto' });
  };

  const bolimlar = BOLIMLAR.filter(
    (b) => b.kimga === 'hamma' || (b.kimga === 'rahbar' && rahbar) || (b.kimga === 'ogoh' && ogohKoradi),
  ).map((b) => ({
    ...b,
    ...(b.kalit === 'bosh'
      ? { nom: m.bolimlar.bosh.nom, ...m.bolimlar.bosh[rahbar ? 'rahbar' : 'sotuvchi'] }
      : m.bolimlar.royxat[b.kalit]),
  }));
  const boshlashTuri = rahbar ? 'rahbar' : 'sotuvchi';
  const boshlash = BOSHLASH[boshlashTuri].map((q, i) => ({ ...q, ...m.boshlash[boshlashTuri][i]! }));

  return (
    <div className="ly" ref={ildizRef}>
      {/* Fondagi suzuvchi shakllar — faqat bezak */}
      <div className="ly-shakllar" aria-hidden="true">
        <span className="ly-shar a" />
        <span className="ly-shar b" />
        <span className="ly-shar c" />
        <span className="ly-doira a" />
        <span className="ly-doira b" />
      </div>

      {/* ─── Tepa panel ─── */}
      <header className={`ly-bosh${siljigan ? ' siljigan' : ''}`}>
        <div className="ly-bosh-ichki">
          <a href="#tepa" className="ly-brend" onClick={(e) => bolimgaBor(e, 'tepa')}>
            <span className="logo-belgi" aria-hidden="true">
              <Sparkles />
            </span>
            <span className="logo-matn">
              Sotuv<em>AI</em>
            </span>
          </a>

          <nav className="ly-nav" aria-label={m.nav.aria}>
            {BOLIMLAR_NAV.map((id) => (
              <a
                key={id}
                href={`#${id}`}
                className={faolBolim === id ? 'faol' : undefined}
                aria-current={faolBolim === id ? 'true' : undefined}
                onClick={(e) => bolimgaBor(e, id)}
              >
                {m.nav[id]}
              </a>
            ))}
          </nav>

          <div className="ly-bosh-ong">
            {user && (
              <span className="ly-foydalanuvchi" title={user.email ?? user.login ?? undefined}>
                <span className="ly-avatar" aria-hidden="true">
                  {(ism || user.login || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="ly-foydalanuvchi-matn">
                  <b>{user.displayName}</b>
                  <small>{business?.name}</small>
                </span>
              </span>
            )}
            <TilTanlash />
            <button
              type="button"
              className={`btn ly-bosh-tugma${mehmon ? '' : ' uzun'}`}
              onClick={platformaga}
              aria-label={asosiyTugma}
            >
              <span>{asosiyTugma}</span> <ArrowRight />
            </button>
            {!mehmon && (
              <button
                type="button"
                className="ly-ikon-tugma"
                onClick={() => void logout()}
                aria-label={m.tugma.chiqish}
                title={m.tugma.chiqish}
              >
                <LogOut />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="ly-ichki">
        {/* ─── Hero ─── */}
        <section className="ly-hero" id="tepa">
          <div className="ly-hero-matn">
            <span className="ly-yorliq">
              <Sparkles /> {m.hero.yorliq}
            </span>
            {ism && <p className="ly-salom">{m.hero.salom(ism)}</p>}
            <h1 className="ly-h1">
              {m.hero.sarlavha[0]}
              <br />
              <span className="urgu">{m.hero.sarlavha[1]}</span>
            </h1>
            <p className="ly-lead">{m.hero.lead}</p>
            <div className="ly-hero-tugmalar">
              <button type="button" className="btn ly-katta-tugma" onClick={platformaga}>
                {asosiyTugma} <ArrowRight />
              </button>
              <a href="#jarayon" className="btn ikkinchi ly-katta-tugma" onClick={(e) => bolimgaBor(e, 'jarayon')}>
                {m.tugma.qandayIshlaydi} <ChevronDown />
              </a>
            </div>

            <ul className="ly-faktlar">
              {[<ShieldCheck />, <ListChecks />, <Languages />].map((ikon, i) => (
                <li key={i}>
                  <span className="ly-fakt-ikon">{ikon}</span>
                  <span>
                    <b>{m.faktlar[i]!.nom}</b>
                    <small>{m.faktlar[i]!.izoh}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="ly-hero-vizual">
            <Xarita />
          </div>

          <a href="#jarayon" className="ly-pastga" onClick={(e) => bolimgaBor(e, 'jarayon')}>
            <span className="ly-sichqoncha" aria-hidden="true">
              <i />
            </span>
            {m.hero.pastga}
          </a>
        </section>

        {/* ─── 01 Jarayon ─── */}
        <section className="ly-bolim" id="jarayon">
          <BolimBosh raqam="01" yorliq={m.jarayon.yorliq} sarlavha={m.jarayon.sarlavha} matn={m.jarayon.matn} />
          <Jarayon />
        </section>

        {/* ─── 02 Bo'limlar ─── */}
        <section className="ly-bolim" id="bolimlar">
          <BolimBosh
            raqam="02"
            yorliq={m.bolimlar.yorliq}
            sarlavha={m.bolimlar.sarlavha}
            matn={mehmon ? m.bolimlar.matnMehmon : rahbar ? m.bolimlar.matnRahbar : m.bolimlar.matnSotuvchi}
          />
          <div className="ly-kartalar">
            {bolimlar.map((b, i) => (
              <Link
                key={b.manzil}
                to={b.manzil}
                className="ly-karta ly-paydo"
                style={{ '--kechikish': `${(i % 4) * 60}ms` } as CSSProperties}
              >
                <div className="ly-karta-bosh">
                  <span className="afzallik-ikon">{b.ikon}</span>
                  {b.kimga === 'rahbar' && <span className="ly-chip">{m.bolimlar.rahbarUchun}</span>}
                  <ArrowUpRight className="ly-karta-strelka" aria-hidden="true" />
                </div>
                <h3>{b.nom}</h3>
                <p>{b.matn}</p>
                <ul>
                  {b.imkonlar.map((x, j) => (
                    <li key={j}>
                      <Check aria-hidden="true" /> {x}
                    </li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>
        </section>

        {/* ─── 03 Boshlash ─── */}
        <section className="ly-bolim" id="boshlash">
          <BolimBosh
            raqam="03"
            yorliq={m.boshlash.yorliq}
            sarlavha={rahbar ? m.boshlash.sarlavhaRahbar : m.boshlash.sarlavhaSotuvchi}
            matn={rahbar ? m.boshlash.matnRahbar : m.boshlash.matnSotuvchi}
          />
          <ol className="ly-boshlash">
            {boshlash.map((q, i) => (
              <li
                key={i}
                className="ly-boshlash-qadam ly-paydo"
                style={{ '--kechikish': `${i * 70}ms` } as CSSProperties}
              >
                <span className="ly-boshlash-raqam">{i + 1}</span>
                <div className="ly-boshlash-karta">
                  <div className="ly-boshlash-bosh">
                    <span className="ly-boshlash-ikon">{q.ikon}</span>
                    {q.ixtiyoriy && <span className="ly-chip">{m.boshlash.ixtiyoriy}</span>}
                  </div>
                  <h3>{q.nom}</h3>
                  <p>{q.matn}</p>
                  <Link to={q.manzil} className="btn ikkinchi kichik ly-boshlash-tugma">
                    {q.tugma} <ArrowRight />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ─── 04 Tuzilish ─── */}
        <section className="ly-bolim" id="tuzilish">
          <BolimBosh raqam="04" yorliq={m.tuzilish.yorliq} sarlavha={m.tuzilish.sarlavha} matn={m.tuzilish.matn} />

          <div className="ly-tuzilish">
            <div className="ly-qatlamlar ly-paydo">
              <div className="ly-panel-sarlavha">
                <b>{m.tuzilish.oqim.nom}</b>
                <small>{m.tuzilish.oqim.izoh}</small>
              </div>
              {m.tuzilish.qatlamlar.map((q, i) => (
                <div key={i} className="ly-qatlam" style={{ '--i': i } as CSSProperties}>
                  <span className="ly-qatlam-ikon">{QATLAM_IKONLARI[i]}</span>
                  <span className="ly-qatlam-nom">
                    <b>{q.nom}</b>
                    <small>{q.izoh}</small>
                  </span>
                </div>
              ))}
            </div>

            <div className="ly-rollar ly-paydo">
              <div className="ly-panel-sarlavha">
                <b>{m.tuzilish.rollar.nom}</b>
                <small>{m.tuzilish.rollar.izoh}</small>
              </div>
              <ul>
                {m.tuzilish.rolRoyxat.map((r, i) => (
                  <li key={i}>
                    <span className={`ly-rol-belgi${ROL_RAHBARMI[i] ? '' : ' sotuvchi'}`} aria-hidden="true">
                      {r.nom.slice(0, 1)}
                    </span>
                    <span>
                      <b>{r.nom}</b>
                      <small>{r.matn}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="ly-rollar-izoh">
                <ShieldCheck /> {m.tuzilish.rolEslatma}
              </p>
            </div>
          </div>

          <div className="ly-tamoyillar">
            {m.tuzilish.tamoyillar.map((t, i) => {
              const tuzilma = TAMOYILLAR[i];
              return (
                <article
                  key={i}
                  className={`ly-tamoyil ly-paydo${tuzilma?.kod ? ' keng' : ''}`}
                  style={{ '--kechikish': `${(i % 3) * 70}ms` } as CSSProperties}
                >
                  <span className="afzallik-ikon">{tuzilma?.ikon}</span>
                  <h3>{t.nom}</h3>
                  <p>{t.matn}</p>
                  {tuzilma?.kod && <code className="ly-kod">{tuzilma.kod}</code>}
                </article>
              );
            })}
          </div>
        </section>

        {/* ─── Yakun ─── */}
        <section className="ly-yakun ly-paydo">
          <span className="ly-yakun-halqa" aria-hidden="true" />
          <span className="logo-belgi katta" aria-hidden="true">
            <Sparkles />
          </span>
          <h2>
            {m.yakun.sarlavha[0]} <span className="urgu">{m.yakun.sarlavha[1]}</span>
          </h2>
          <p>{mehmon ? m.yakun.mehmon : sozlanmagan ? m.yakun.sozlanmagan : m.yakun.oddiy}</p>
          <div className="ly-hero-tugmalar markazda">
            <button type="button" className="btn ly-katta-tugma" onClick={platformaga}>
              {asosiyTugma} <ArrowRight />
            </button>
            {!mehmon && !sozlanmagan && (
              <Link to={rahbar ? '/sozlamalar' : '/ai-chat'} className="btn ikkinchi ly-katta-tugma">
                {rahbar ? (
                  <>
                    <Settings /> {m.tugma.sozlamalar}
                  </>
                ) : (
                  <>
                    <MessagesSquare /> {m.tugma.aiChat}
                  </>
                )}
              </Link>
            )}
          </div>
        </section>
      </main>

      <footer className="ly-pastki">
        <span className="logo-matn">
          Sotuv<em>AI</em>
        </span>
        <span>{m.pastki}</span>
      </footer>

      {/* Telefon/planshet uchun "yuqoriga" — kompyuterda sticky panel va logo
          yetarli, u yerda CSS bilan yashiriladi. Ko'rinmaganda `visibility:
          hidden` uni Tab tartibidan ham chiqaradi. */}
      <button
        type="button"
        className={`ly-tepaga${tepagaKorinsin ? ' korinadi' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: harakatRuxsat() ? 'smooth' : 'auto' })}
        aria-label={m.tugma.tepaga}
        title={m.tugma.tepaga}
      >
        <ArrowUp />
      </button>
    </div>
  );
}

function BolimBosh({
  raqam,
  yorliq,
  sarlavha,
  matn,
}: {
  raqam: string;
  yorliq: string;
  sarlavha: [string, string];
  matn: ReactNode;
}) {
  return (
    <div className="ly-bolim-bosh ly-paydo">
      <span className="ly-bolim-yorliq">
        <i>{raqam}</i> {yorliq}
      </span>
      <h2>
        {sarlavha[0]} <span className="urgu">{sarlavha[1]}</span>
      </h2>
      <p>{matn}</p>
    </div>
  );
}
