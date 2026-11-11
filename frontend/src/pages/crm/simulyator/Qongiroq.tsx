import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText, type StartSessionResponse, type TrainingApi, type VoiceTurnResponse } from '../../../features/mashq';
import { useJonliMikrofon } from './useJonliMikrofon';
import {
  davomiylik,
  iziSaqla,
  type JurnalQator,
  type MashqKarta,
  mmss,
  type QongiroqIzi,
  YAKUNLASH_OLDIDAN,
} from './yordamchi';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'NG'IROQ EKRANI — AI mijoz bilan jonli, qo'lsiz suhbat
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bosqichlar: ulanmoqda (gudok) → tinglayapti ⇄ o'ylayapti → gapiryapti.
 * Sessiya (AI mijoz shaxsi) yaratilguncha gudok chalinib turadi — 10-25 s
 * kutish haqiqiy qo'ng'iroqdagidek "mijoz ko'targuncha" bo'lib o'tadi.
 * Sotuvchi gapirib pauza qilsa — gap o'zi yuboriladi (`useJonliMikrofon`);
 * mijoz javobi oqim bilan ijro etiladi, shu payt mikrofon tinglamaydi.
 * Vaqt tugashidan 30 s oldin ogohlantirish, tugaganda qo'ng'iroq yopiladi.
 */

type Bosqich = 'ulanmoqda' | 'tinglayapti' | 'tanilmoqda' | 'oylayapti' | 'gapiryapti' | 'tugamoqda';

interface Qator extends JurnalQator {
  id: number;
  kutilmoqda?: boolean;
}

interface Props {
  api: TrainingApi;
  karta: MashqKarta;
  /** Sessiyani yaratadi (gudok shu payt chalinadi). */
  boshla: () => Promise<StartSessionResponse>;
  qurilmaId: string | undefined;
  onTugadi: (sessionId: string, iz: QongiroqIzi) => void;
  /** Ulanmasdan bekor qilindi yoki sessiya yaratilmadi. */
  onBekor: () => void;
  /** Serverdagi nutqni tanish modeli yuklanganmi (gudok shunga qarab to'xtaydi). */
  sttHolati: () => Promise<boolean>;
}

interface Sessiya {
  id: string;
  ism: string;
  yonalish: 'inbound' | 'outbound';
}

/** Telefon gudogi (425 Hz): 1 s ovoz, ~3 s jim — bir sikl 4 s. */
async function gudok(): Promise<void> {
  try {
    const ctx = new AudioContext();
    const t = ctx.currentTime + 0.05;
    for (const bosh of [0]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = 425;
      g.gain.setValueAtTime(0, t + bosh);
      g.gain.linearRampToValueAtTime(0.08, t + bosh + 0.03);
      g.gain.setValueAtTime(0.08, t + bosh + 0.97);
      g.gain.linearRampToValueAtTime(0, t + bosh + 1);
      osc.connect(g).connect(ctx.destination);
      osc.start(t + bosh);
      osc.stop(t + bosh + 1.02);
    }
    await new Promise((r) => setTimeout(r, 1000));
    void ctx.close();
    await new Promise((r) => setTimeout(r, 1500));
  } catch {
    await new Promise((r) => setTimeout(r, 2500));
  }
}

function base64Blob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime || 'audio/wav' });
}

export function Qongiroq({ api, karta, boshla, qurilmaId, onTugadi, onBekor, sttHolati }: Props) {
  const jami = davomiylik(karta.qiyinlik);
  const [sessiya, setSessiya] = useState<Sessiya | null>(null);
  const [ulanishXato, setUlanishXato] = useState<string | null>(null);
  const sessiyaRef = useRef<Sessiya | null>(null);
  const mijozIsmi = sessiya?.ism ?? '';
  const yonalish = sessiya?.yonalish ?? (karta.yonalish ?? 'outbound');
  const [bosqich, setBosqich] = useState<Bosqich>('ulanmoqda');
  const [ochirilgan, setOchirilgan] = useState(false);
  const [otgan, setOtgan] = useState(0);
  const [qatorlar, setQatorlar] = useState<Qator[]>([]);
  const [xabar, setXabar] = useState<string | null>(null);

  const boshlanish = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const tugadiRef = useRef(false);
  const idRef = useRef(0);
  const jurnalRef = useRef<Qator[]>([]);
  const pastRef = useRef<HTMLDivElement | null>(null);

  const vaqt = (): number => (boshlanish.current === null ? 0 : (Date.now() - boshlanish.current) / 1000);

  const qatorlarniYangila = (f: (q: Qator[]) => Qator[]): void => {
    jurnalRef.current = f(jurnalRef.current);
    setQatorlar(jurnalRef.current);
  };

  const qosh = (kim: Qator['kim'], matn: string, kutilmoqda = false): number => {
    idRef.current += 1;
    const id = idRef.current;
    qatorlarniYangila((q) => [...q, { id, kim, matn, t: vaqt(), kutilmoqda }]);
    return id;
  };

  const xabarKorsat = (m: string): void => {
    setXabar(m);
    window.setTimeout(() => setXabar((x) => (x === m ? null : x)), 4000);
  };

  // ── Tugatish ────────────────────────────────────────────────────────────
  const mikRef = useRef<{ yop: () => void } | null>(null);
  const tugat = useCallback(
    async (kim: QongiroqIzi['tugatdi']): Promise<void> => {
      if (tugadiRef.current) return;
      tugadiRef.current = true;
      setBosqich('tugamoqda');
      audioRef.current?.pause();
      mikRef.current?.yop();
      const s = sessiyaRef.current;
      if (!s) {
        // Mijoz hali "ko'tarmagan" — tahlil qiladigan narsa yo'q.
        onBekor();
        return;
      }
      const davom = Math.min(jami, vaqt());
      if (kim !== 'mijoz') {
        await api.endSession(s.id, kim === 'vaqt' ? 'time_limit' : 'user_ended').catch(() => undefined);
      }
      const iz: QongiroqIzi = {
        davom,
        jami,
        tugatdi: kim,
        jurnal: jurnalRef.current.filter((q) => !q.kutilmoqda).map(({ kim: k, matn, t }) => ({ kim: k, matn, t })),
        karta,
        mijozIsmi: s.ism,
      };
      iziSaqla(s.id, iz);
      onTugadi(s.id, iz);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, jami, karta, onTugadi, onBekor],
  );

  // ── Mijoz ovozini ijro etish ──────────────────────────────────────────────
  const ijro = useCallback(
    (manba: { url?: string; b64?: string; mime?: string }, matn: string, oxirgi: boolean): void => {
      const audio = audioRef.current;
      let korsatildi = false;
      const matnniKorsat = (): void => {
        if (korsatildi || !matn) return;
        korsatildi = true;
        qosh('customer', matn);
      };
      const keyingi = (): void => {
        matnniKorsat();
        if (tugadiRef.current) return;
        if (oxirgi) {
          void tugat('mijoz');
          return;
        }
        // Mijoz ovozining "dumi" mikrofonga tushmasin.
        window.setTimeout(() => !tugadiRef.current && setBosqich('tinglayapti'), 250);
      };
      if (!audio || (!manba.url && !manba.b64)) {
        keyingi();
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      if (manba.url) audio.src = manba.url;
      else {
        urlRef.current = URL.createObjectURL(base64Blob(manba.b64!, manba.mime ?? 'audio/wav'));
        audio.src = urlRef.current;
      }
      audio.onplaying = () => {
        setBosqich('gapiryapti');
        matnniKorsat();
      };
      audio.onended = keyingi;
      audio.onerror = () => {
        xabarKorsat("Mijoz ovozi yuklanmadi — matni o'ngda ko'rinadi.");
        keyingi();
      };
      audio.play().catch(() => {
        // Brauzer ijroni to'sdi — matn ko'rsatiladi, suhbat davom etadi.
        keyingi();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tugat],
  );

  // ── Sotuvchi gapi tugadi → serverga ───────────────────────────────────────
  const gapKeldi = useCallback(
    async (wav: Blob): Promise<void> => {
      const s = sessiyaRef.current;
      if (tugadiRef.current || !s) return;
      setBosqich('tanilmoqda');
      const kutishId = qosh('seller', '', true);
      const xatoga = (err: unknown): void => {
        qatorlarniYangila((q) => q.filter((x) => x.id !== kutishId));
        if (tugadiRef.current) return;
        const status = (err as { status?: number }).status;
        if (status === 409 && /tugag|ended|not_active|budget/i.test(String((err as Error).message))) {
          void tugat('mijoz');
          return;
        }
        xabarKorsat(`${errorText(err, true)} Qayta gapiring.`);
        setBosqich('tinglayapti');
      };

      // 1-bosqich: faqat nutqni tanish (~2 s) — gapingiz darhol ekranda ko'rinadi.
      let tanildi: Awaited<ReturnType<TrainingApi['transcribeVoice']>>;
      try {
        tanildi = await api.transcribeVoice(s.id, wav);
      } catch (err) {
        xatoga(err);
        return;
      }
      if (tugadiRef.current) return;
      const matn = tanildi.sttText.trim();
      if (!tanildi.recognized || !matn) {
        qatorlarniYangila((q) => q.filter((x) => x.id !== kutishId));
        xabarKorsat("Gapingiz eshitilmadi — biroz balandroq va aniqroq qaytaring.");
        setBosqich('tinglayapti');
        return;
      }
      qatorlarniYangila((q) => q.map((x) => (x.id === kutishId ? { ...x, matn, kutilmoqda: false } : x)));

      // 2-bosqich: mijoz javobi (AI) va ovozi.
      setBosqich('oylayapti');
      let javob: VoiceTurnResponse;
      try {
        javob = await api.voiceReply(s.id, { transcriptId: tanildi.transcriptId, text: matn });
      } catch (err) {
        if (tugadiRef.current) return;
        // Gap ekranda qoladi, lekin serverga yetib bormadi — belgilab qo'yamiz.
        qatorlarniYangila((q) => q.map((x) => (x.id === kutishId ? { ...x, matn: `${matn} (yuborilmadi)` } : x)));
        const status = (err as { status?: number }).status;
        if (status === 409 && /tugag|ended|not_active|budget/i.test(String((err as Error).message))) {
          void tugat('mijoz');
          return;
        }
        xabarKorsat(`${errorText(err, true)} Qayta gapiring.`);
        setBosqich('tinglayapti');
        return;
      }
      ijro(
        javob.audioStreamUrl ? { url: javob.audioStreamUrl } : { b64: javob.audio, mime: javob.audioMime },
        javob.customerText,
        javob.ended,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, ijro, tugat],
  );

  const mik = useJonliMikrofon({
    tinglash: bosqich === 'tinglayapti' && !ochirilgan,
    onGap: (wav) => void gapKeldi(wav),
  });
  mikRef.current = mik;

  // ── Ulanish: mikrofon, sessiya yaratilguncha gudok, (kiruvchi) mijozning birinchi gapi ──
  useEffect(() => {
    let bekor = false;
    void (async () => {
      const ok = await mik.och(qurilmaId);
      if (bekor || !ok) return; // mikrofon xatosi ekranda ko'rsatiladi
      let natija: StartSessionResponse | null = null;
      let xato: unknown = null;
      const sorov = boshla().then(
        (r) => {
          natija = r;
          // Gudok paytida ekrandan chiqib ketilgan — yaratilgan sessiya ochiq qolmasin.
          if (bekor) void api.endSession(r.sessionId, 'user_cancelled').catch(() => undefined);
        },
        (e: unknown) => {
          xato = e ?? new Error('sessiya yaratilmadi');
        },
      );
      // Nutqni tanish modeli tayyormi — har gudokda so'raladi (birinchi gap yuklanishni kutmasin).
      let sttTayyor = false;
      const sttniTekshir = (): void => {
        void sttHolati()
          .then((t) => {
            if (t) sttTayyor = true;
          })
          .catch(() => {
            sttTayyor = true; // tekshirib bo'lmasa — kutib o'tirmaymiz
          });
      };
      sttniTekshir();
      const gudokBoshi = Date.now();
      // Kamida bir gudok; sessiya VA nutqni tanish tayyor bo'lguncha davom etadi
      // (STT uchun ko'pi bilan ~60 s — undan keyin baribir ulanadi).
      do {
        await gudok();
        if (bekor) return;
        if (!sttTayyor) sttniTekshir();
      } while ((natija === null && xato === null) || (!sttTayyor && Date.now() - gudokBoshi < 60_000));
      await sorov;
      if (bekor) return;
      if (xato || !natija) {
        setUlanishXato(errorText(xato, true));
        mikRef.current?.yop();
        return;
      }
      const r: StartSessionResponse = natija;
      const s: Sessiya = { id: r.sessionId, ism: r.persona.name, yonalish: r.persona.direction };
      sessiyaRef.current = s;
      setSessiya(s);
      if (tugadiRef.current) {
        // Gudok paytida "Tugatish" bosilgan — yaratilgan sessiya yopiladi.
        void api.endSession(s.id, 'user_cancelled').catch(() => undefined);
        return;
      }
      boshlanish.current = Date.now();
      if (s.yonalish === 'inbound') {
        try {
          const ochilish = await api.openingAudio(s.id);
          if (bekor) return;
          if (ochilish) {
            ijro({ b64: ochilish.audio, mime: ochilish.audioMime }, ochilish.text, false);
            return;
          }
        } catch {
          /* ochilish ovozi bo'lmasa ham suhbat davom etadi */
        }
      }
      setBosqich('tinglayapti');
    })();
    return () => {
      bekor = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Taymer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = window.setInterval(() => {
      if (boshlanish.current === null || tugadiRef.current) return;
      const s = vaqt();
      setOtgan(s);
      if (s >= jami) void tugat('vaqt');
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jami, tugat]);

  // Sahifadan chiqishda: ovoz to'xtaydi, URL bo'shaydi.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  useEffect(() => {
    pastRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [qatorlar]);

  const qoldi = Math.max(0, jami - otgan);
  const yakunlash = jami - YAKUNLASH_OLDIDAN;
  const yakunlashVaqti = otgan >= yakunlash && bosqich !== 'tugamoqda';
  const holat =
    mik.xato
      ? 'Mikrofon ishlamayapti'
      : bosqich === 'ulanmoqda'
        ? yonalish === 'inbound'
          ? 'Kiruvchi qo\'ng\'iroq…'
          : 'Qo\'ng\'iroq qilinmoqda…'
        : bosqich === 'tugamoqda'
          ? 'Qo\'ng\'iroq tugadi'
          : ochirilgan
            ? 'Mikrofoningiz o\'chiq'
            : bosqich === 'tanilmoqda'
              ? 'Tinglab oldi…'
              : bosqich === 'oylayapti'
              ? 'O\'ylayapti…'
              : bosqich === 'gapiryapti'
                ? 'Gapiryapti'
                : mik.gapiryapti
                  ? 'Sizni eshityapti'
                  : 'Tinglayapti';

  return (
    <div className="sm-qongiroq">
      <div className="sm-q-sahna">
        <div className="sm-q-tepa">
          <div className="sm-q-taymer">
            <span className="sm-q-son">{mmss(qoldi)}</span>
            <span className="sm-q-izoh">qoldi · jami {mmss(jami)}</span>
            <span className="sm-q-yakun">Yakunlash: {mmss(yakunlash)}</span>
          </div>
          <div className="sm-q-chiziq" role="progressbar" aria-valuemin={0} aria-valuemax={jami} aria-valuenow={Math.round(otgan)}>
            <span style={{ width: `${Math.min(100, (otgan / jami) * 100)}%` }} />
            <i style={{ left: `${(yakunlash / jami) * 100}%` }} />
          </div>
          <div className="sm-q-maqsad">Mashq: {karta.sarlavha}</div>
        </div>

        <div className="sm-q-markaz">
          <div className={`sm-q-avatar sm-q-${bosqich}`} aria-hidden>
            <span className="sm-q-tolqin" />
            <span className="sm-q-tolqin sm-q-tolqin-2" />
            <span className="sm-q-harf">{mijozIsmi.trim().charAt(0).toUpperCase() || <Phone size={38} />}</span>
          </div>
          <div className="sm-q-ism">{mijozIsmi || 'AI mijoz'}</div>
          <div className="sm-q-holat" aria-live="polite">
            {ulanishXato ? 'Ulanib bo\'lmadi' : holat}
          </div>
          {ulanishXato ? (
            <div className="sm-q-xato">
              {ulanishXato}
              <button type="button" onClick={onBekor}>
                Orqaga qaytish
              </button>
            </div>
          ) : null}
          {yakunlashVaqti ? (
            <div className="sm-q-ogoh" role="status">
              {mmss(qoldi)} qoldi — suhbatni yakunlang va keyingi qadamni kelishib oling
            </div>
          ) : null}
          {mik.xato ? (
            <div className="sm-q-xato">
              {mik.xato.matn}
              {sessiya ? (
                <button type="button" onClick={() => void mik.och(qurilmaId)}>
                  Qayta urinish
                </button>
              ) : (
                <button type="button" onClick={onBekor}>
                  Orqaga qaytish
                </button>
              )}
            </div>
          ) : null}
          {xabar ? <div className="sm-q-xabar">{xabar}</div> : null}
        </div>

        <div className="sm-q-boshqaruv">
          <button
            type="button"
            className={`sm-q-tugma${ochirilgan ? ' sm-q-tugma-faol' : ''}`}
            onClick={() => setOchirilgan((v) => !v)}
            disabled={bosqich === 'tugamoqda'}
            aria-pressed={ochirilgan}
          >
            <span className="sm-q-doira">
              {ochirilgan ? <MicOff size={20} /> : <Mic size={20} />}
              {!ochirilgan && mik.gapiryapti ? <span className="sm-q-mik-yonadi" /> : null}
            </span>
            {ochirilgan ? 'Mikrofonni yoqish' : "Mikrofonni o'chirish"}
          </button>
          <button
            type="button"
            className="sm-q-tugma sm-q-tugat"
            onClick={() => void tugat('siz')}
            disabled={bosqich === 'tugamoqda'}
          >
            <span className="sm-q-doira">
              <PhoneOff size={20} />
            </span>
            Tugatish
          </button>
        </div>
      </div>

      <aside className="sm-q-matn" aria-label="Jonli matn">
        <div className="sm-q-matn-bosh">
          <b>Jonli matn</b>
          <span>Faqat qo'ng'iroqdan keyingi tahlil uchun</span>
        </div>
        <div className="sm-q-matn-royxat">
          {qatorlar.length === 0 ? (
            <p className="sm-q-matn-bosh-yoq">
              {yonalish === 'inbound' ? 'Mijoz birinchi gapiradi.' : "Ulangach, birinchi bo'lib siz gapiring."}
            </p>
          ) : null}
          {qatorlar.map((q) => (
            <div key={q.id} className={`sm-q-qator sm-q-${q.kim}`}>
              <span className="sm-q-kim">
                {q.kim === 'customer' ? mijozIsmi : 'Siz'} · {mmss(q.t)}
              </span>
              <div className="sm-q-pufak">
                {q.kutilmoqda ? (
                  <span className="sm-q-nuqtalar" aria-label="Tanilmoqda">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  q.matn
                )}
              </div>
            </div>
          ))}
          <div ref={pastRef} />
        </div>
      </aside>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} preload="auto" hidden />
    </div>
  );
}
