import { AlertTriangle, Check, Clock, Keyboard, Mic, Phone, Target, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SellerProfile } from '../../../features/mashq';
import { mikrofonlar, useJonliMikrofon } from './useJonliMikrofon';
import {
  boshlangichDaraja,
  type Daraja,
  davomiylik,
  kayfiyatNomi,
  type MashqKarta,
  mmss,
  profilniOqi,
  profilTogri,
  YAKUNLASH_OLDIDAN,
} from './yordamchi';

/**
 * "Boshlashdan oldin" oynasi: vaziyat, mijoz kayfiyati, mikrofon tekshiruvi
 * (qurilma tanlash + daraja chizig'i) va vaqt chizig'i. Ssenariy mijozi
 * sotuvchiga ismi bilan murojaat qiladi — shuning uchun profil bir marta so'raladi.
 */

export interface BoshlashTanlovi {
  daraja: Daraja;
  sotuvchi: SellerProfile | null;
  qurilmaId: string | undefined;
  rejim: 'ovoz' | 'matn';
}

interface Props {
  karta: MashqKarta;
  ovozBor: boolean;
  foydalanuvchiIsmi: string;
  band: boolean;
  xato: string | null;
  onYop: () => void;
  onBoshla: (t: BoshlashTanlovi) => void;
}

const SEGMENT = 16;

export function BoshlashOyna({ karta, ovozBor, foydalanuvchiIsmi, band, xato, onYop, onBoshla }: Props) {
  const ssenariy = karta.tur === 'ssenariy';
  const jami = davomiylik(karta.qiyinlik);
  const [daraja, setDaraja] = useState<Daraja>(() => boshlangichDaraja(karta.qiyinlik));
  const [profil, setProfil] = useState<Partial<SellerProfile>>(() => {
    const p = profilniOqi();
    return { ...p, name: p.name ?? (foydalanuvchiIsmi.split(/\s+/)[0] || undefined) };
  });
  const [profilTahrir, setProfilTahrir] = useState(() => !profilTogri(profilniOqi()));
  const [rozilik, setRozilik] = useState(false);

  const mik = useJonliMikrofon({ tinglash: false });
  const [qurilmalar, setQurilmalar] = useState<MediaDeviceInfo[]>([]);
  const [qurilma, setQurilma] = useState<string>('');
  const [eshitildi, setEshitildi] = useState(false);

  // Oyna ochilishi bilan mikrofon tekshiruvi (ovozli rejim bo'lsa).
  useEffect(() => {
    if (!ovozBor) return;
    void mik.och().then(async (ok) => {
      if (!ok) return;
      const r = await mikrofonlar();
      setQurilmalar(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ovozBor]);

  useEffect(() => {
    if (mik.daraja > 0.35) setEshitildi(true);
  }, [mik.daraja]);

  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !band) onYop();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onYop, band]);

  const profilOk = !ssenariy || profilTogri(profil);
  const rozilikOk = !karta.ogohlantirish || rozilik;
  const tayyor = profilOk && rozilikOk && !band;
  const ovozTayyor = ovozBor && mik.ochiq;

  const boshla = (rejim: 'ovoz' | 'matn'): void => {
    if (!tayyor) return;
    // Mikrofon oyna yopilganda (unmount) o'zi bo'shaydi; xato bo'lsa — qayta urinish uchun ochiq qoladi.
    onBoshla({
      daraja,
      sotuvchi: ssenariy ? (profil as SellerProfile) : null,
      qurilmaId: qurilma || undefined,
      rejim,
    });
  };

  const yakunlash = jami - YAKUNLASH_OLDIDAN;
  const yonganSegment = Math.round(mik.daraja * SEGMENT);

  return (
    <div className="sm-qoplama" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !band && onYop()}>
      <div className="sm-oyna sm-oyna-boshlash" role="dialog" aria-modal="true" aria-labelledby="sm-boshlash-nom">
        <div className="sm-oyna-bosh">
          <h2 id="sm-boshlash-nom">Boshlashdan oldin</h2>
          <button type="button" className="sm-yopish" onClick={onYop} disabled={band} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>

        <div className="sm-oyna-tana">
          <div className="sm-vaziyat">
            <span className="sm-vaziyat-belgi" aria-hidden>
              <Target size={18} />
            </span>
            <div>
              <div className="sm-vaziyat-nom">{karta.sarlavha}</div>
              <div className="sm-vaziyat-tavsif">{karta.tavsif}</div>
              {ssenariy ? (
                <label className="sm-kayfiyat">
                  Mijoz kayfiyati:
                  <select value={daraja} onChange={(e) => setDaraja(e.target.value as Daraja)}>
                    <option value="easy">Yumshoq</option>
                    <option value="medium">O'rtacha</option>
                    <option value="hard">Qattiq</option>
                  </select>
                </label>
              ) : (
                <div className="sm-kayfiyat">Mijoz kayfiyati: {kayfiyatNomi(karta.qiyinlik)}</div>
              )}
            </div>
          </div>

          {ssenariy ? (
            <div className="sm-qadam">
              <span className={`sm-qadam-belgi${profilOk ? ' sm-ok' : ''}`} aria-hidden>
                {profilOk ? <Check size={14} /> : '1'}
              </span>
              <div className="sm-qadam-tana">
                <div className="sm-qadam-sarlavha">
                  <b>Siz</b>
                  {!profilTahrir && profilOk ? (
                    <span className="sm-profil-qisqa">
                      {profil.name} · {profil.gender === 'female' ? 'ayol' : 'erkak'} · {profil.age} yosh
                      <button type="button" className="sm-havola" onClick={() => setProfilTahrir(true)}>
                        O'zgartirish
                      </button>
                    </span>
                  ) : null}
                </div>
                {profilTahrir || !profilOk ? (
                  <>
                    <div className="sm-profil">
                      <input
                        aria-label="Ismingiz"
                        placeholder="Ismingiz"
                        maxLength={60}
                        value={profil.name ?? ''}
                        onChange={(e) => setProfil({ ...profil, name: e.target.value })}
                      />
                      <div className="sm-segment" role="radiogroup" aria-label="Jinsingiz">
                        {(['male', 'female'] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            role="radio"
                            aria-checked={profil.gender === g}
                            className={profil.gender === g ? 'sm-faol' : ''}
                            onClick={() => setProfil({ ...profil, gender: g })}
                          >
                            {g === 'male' ? 'Erkak' : 'Ayol'}
                          </button>
                        ))}
                      </div>
                      <input
                        aria-label="Yoshingiz"
                        placeholder="Yosh"
                        type="number"
                        min={16}
                        max={80}
                        className="sm-yosh"
                        value={profil.age ?? ''}
                        onChange={(e) => setProfil({ ...profil, age: e.target.value ? Number(e.target.value) : undefined })}
                      />
                    </div>
                    <p className="sm-izoh">Mijoz sizga shunga qarab murojaat qiladi (aka/opa, ismingiz bilan).</p>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {ovozBor ? (
            <div className="sm-qadam">
              <span className={`sm-qadam-belgi${eshitildi ? ' sm-ok' : ''}`} aria-hidden>
                {eshitildi ? <Check size={14} /> : <Mic size={14} />}
              </span>
              <div className="sm-qadam-tana">
                <div className="sm-qadam-sarlavha">
                  <b>Mikrofon</b>
                  {qurilmalar.length > 0 ? (
                    <select
                      className="sm-qurilma"
                      aria-label="Mikrofon qurilmasi"
                      value={qurilma}
                      onChange={(e) => {
                        setQurilma(e.target.value);
                        setEshitildi(false);
                        void mik.och(e.target.value || undefined);
                      }}
                    >
                      <option value="">Standart mikrofon</option>
                      {qurilmalar
                        .filter((d) => d.deviceId && d.deviceId !== 'default')
                        .map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Mikrofon ${i + 1}`}
                          </option>
                        ))}
                    </select>
                  ) : null}
                </div>
                <div className="sm-daraja" aria-hidden>
                  {Array.from({ length: SEGMENT }, (_, i) => (
                    <span key={i} className={i < yonganSegment ? 'sm-yongan' : ''} />
                  ))}
                </div>
                {mik.xato ? (
                  <p className="sm-izoh sm-izoh-xato">{mik.xato.matn}</p>
                ) : (
                  <p className={`sm-izoh${eshitildi ? ' sm-izoh-ok' : ''}`}>
                    {!mik.ochiq ? 'Mikrofon ochilmoqda…' : eshitildi ? 'Ovozingiz yaxshi eshitilyapti.' : 'Gapirsangiz, chiziq qimirlaydi.'}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="sm-xabar sm-xabar-info">
              Ovozli qo'ng'iroq hali yoqilmagan (administrator Admin → AI provayderlar bo'limiga Google Gemini kalitini
              qo'shishi kerak). Hozircha matn bilan yozishib mashq qilishingiz mumkin.
            </div>
          )}

          <div className="sm-qadam">
            <span className="sm-qadam-belgi" aria-hidden>
              <Clock size={14} />
            </span>
            <div className="sm-qadam-tana">
              <div className="sm-qadam-sarlavha">
                <b>{jami / 60} daqiqa, pauzasiz</b>
              </div>
              <div className="sm-vaqt-chiziq" aria-hidden>
                <span className="sm-vaqt-belgi" style={{ left: `${(yakunlash / jami) * 100}%` }} />
              </div>
              <div className="sm-vaqt-yozuv">
                <span>0:00</span>
                <span>
                  {mmss(yakunlash)} yakunlash · {mmss(jami)}
                </span>
              </div>
              <p className="sm-izoh">
                {mmss(yakunlash)} da suhbatni yakunlash vaqti kelganini eslatamiz, {mmss(jami)} da qo'ng'iroq tugaydi.
                Oldinroq tugatishingiz mumkin, lekin pauza qilib bo'lmaydi.
              </p>
            </div>
          </div>

          {karta.ogohlantirish ? (
            <label className="sm-xabar sm-xabar-ogoh sm-rozilik">
              <AlertTriangle size={16} aria-hidden />
              <span>
                {karta.ogohlantirish}
                <span className="sm-rozilik-qator">
                  <input type="checkbox" checked={rozilik} onChange={(e) => setRozilik(e.target.checked)} /> Tushundim,
                  davom etaman
                </span>
              </span>
            </label>
          ) : null}
          {karta.matnTavsiya && ovozBor ? (
            <div className="sm-xabar sm-xabar-info">Bu mijoz uchun mos ovoz yo'q — matn bilan mashq qilish tavsiya etiladi.</div>
          ) : null}
          {xato ? <div className="sm-xabar sm-xabar-xato">{xato}</div> : null}
        </div>

        {ovozBor ? (
          <div className="sm-matn-qator">
            Mikrofonsiz mashq qilmoqchimisiz?
            <button type="button" className="sm-havola" disabled={!tayyor} onClick={() => boshla('matn')}>
              <Keyboard size={14} /> Matn bilan yozishish
            </button>
          </div>
        ) : null}
        <div className="sm-oyna-past">
          <span className="sm-bosh-joy" />
          <button type="button" className="sm-tugma" onClick={onYop} disabled={band}>
            Hozir emas
          </button>
          {ovozBor ? (
            <button
              type="button"
              className="sm-tugma sm-tugma-asosiy"
              disabled={!tayyor || !ovozTayyor}
              onClick={() => boshla('ovoz')}
            >
              <Phone size={15} /> {band ? 'Ulanmoqda…' : `Qo'ng'iroqni boshlash · ${jami / 60} daqiqa`}
            </button>
          ) : (
            <button type="button" className="sm-tugma sm-tugma-asosiy" disabled={!tayyor} onClick={() => boshla('matn')}>
              <Keyboard size={15} /> {band ? 'Boshlanmoqda…' : 'Matn bilan boshlash'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
