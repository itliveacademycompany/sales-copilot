import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import type { Seat, Voronka } from '../malumot';
import { Oyna } from '../Oyna';
import { BOSH_FILTR, STANDART_TURLAR, VIDJET_META, type BitimFiltri, type StandartTur, type Vidjet } from './turlar';

/**
 * "Sozlash" rejimidagi oynalar: vidjet qo'shish va maxsus "Bitimlar"
 * vidjetini yaratish/tahrirlash (amoCRM'dagi "Сделки" vidjeti kabi —
 * voronka, bosqich, mas'ul, manba, teg, holat, sana va guruhlash).
 */

export function VidjetQoshish({ mavjud, onQosh, onBitim, onYop }: { mavjud: Vidjet[]; onQosh: (tur: StandartTur) => void; onBitim: () => void; onYop: () => void }) {
  const t = useT();
  const bor = new Set(mavjud.map((w) => w.type));
  const qolgan = STANDART_TURLAR.filter((x) => !bor.has(x));
  return (
    <Oyna sarlavha={t("Vidjet qo'shish")} onYop={onYop} keng>
      <div className="pn-katalog">
        <button type="button" className="pn-katalog-band maxsus" onClick={onBitim}>
          <span className="pn-katalog-ikon" aria-hidden="true">
            <Plus />
          </span>
          <span>
            <b>{t('Bitimlar (o‘z filtringiz bilan)')}</b>
            <small>{t("Voronka, bosqich, manba, teg va sana bo'yicha — natija bosqich, menejer yoki manba bo'yicha")}</small>
          </span>
        </button>
        {qolgan.length ? (
          qolgan.map((tur) => (
            <button key={tur} type="button" className="pn-katalog-band" onClick={() => onQosh(tur)}>
              <span className="pn-katalog-ikon" aria-hidden="true">
                <Plus />
              </span>
              <span>
                <b>{t(VIDJET_META[tur].nom)}</b>
                <small>{t(VIDJET_META[tur].izoh)}</small>
              </span>
            </button>
          ))
        ) : (
          <p className="yordam">{t("Barcha standart vidjetlar sahifada bor. Maxsus bitim vidjetini istalgancha qo'shishingiz mumkin.")}</p>
        )}
      </div>
    </Oyna>
  );
}

function Tanlovlar<T extends string>({ nom, variantlar, tanlangan, onChange }: { nom: string; variantlar: { k: T; nom: string; rang?: string }[]; tanlangan: T[]; onChange: (v: T[]) => void }) {
  const t = useT();
  return (
    <fieldset className="pn-tanlov">
      <legend>{nom}</legend>
      {variantlar.length ? (
        <div className="pn-tanlov-chiplar">
          {variantlar.map((v) => {
            const faol = tanlangan.includes(v.k);
            return (
              <button
                key={v.k}
                type="button"
                className={`ci-chip${faol ? ' faol' : ''}`}
                aria-pressed={faol}
                onClick={() => onChange(faol ? tanlangan.filter((x) => x !== v.k) : [...tanlangan, v.k])}
              >
                {v.rang && <i className="pn-rang-nuqta" style={{ background: v.rang }} aria-hidden="true" />}
                {v.nom}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="yordam">{t("Variant yo'q")}</p>
      )}
      <small className="yordam">{tanlangan.length ? t('{n} ta tanlangan', { n: tanlangan.length }) : t('Hammasi')}</small>
    </fieldset>
  );
}

export function BitimVidjetTahrir({
  boshlangich,
  voronkalar,
  seatlar,
  onSaqla,
  onYop,
}: {
  boshlangich: Vidjet | null;
  voronkalar: Voronka[];
  seatlar: Seat[];
  onSaqla: (w: { title: string; filter: BitimFiltri }) => void;
  onYop: () => void;
}) {
  const t = useT();
  const [nom, setNom] = useState(boshlangich?.title ?? '');
  const [f, setF] = useState<BitimFiltri>(() => ({ ...BOSH_FILTR, ...(boshlangich?.filter ?? {}) }));
  const [xato, setXato] = useState<string | null>(null);
  const ozg = (q: Partial<BitimFiltri>) => setF((x) => ({ ...x, ...q }));

  // Bosqichlar — tanlangan voronkalardan (voronka tanlanmasa — hammasi)
  const bosqichlar = useMemo(
    () =>
      voronkalar
        .filter((v) => !f.pipelineIds.length || f.pipelineIds.includes(v.id))
        .flatMap((v) => v.stages.map((s) => ({ k: s.id, nom: voronkalar.length > 1 ? `${v.name} · ${s.name}` : s.name, rang: s.color }))),
    [voronkalar, f.pipelineIds],
  );

  const saqla = () => {
    const n = nom.trim();
    if (!n) return setXato(t('Vidjet nomini kiriting'));
    if (f.dateMode === 'range' && (!f.from || !f.to || f.from > f.to)) return setXato(t("Sana oralig'ini to'g'ri kiriting"));
    const ruxsat = new Set(bosqichlar.map((b) => b.k));
    onSaqla({
      title: n,
      filter: {
        ...f,
        // Voronka o'zgargach, unga tegishli bo'lmagan bosqichlar qolib ketmasin
        stageIds: f.stageIds.filter((s) => ruxsat.has(s)),
        tags: f.tags.map((x) => x.trim()).filter(Boolean),
        sources: f.sources.map((x) => x.trim()).filter(Boolean),
        ...(f.dateMode === 'range' ? {} : { from: undefined, to: undefined }),
      },
    });
  };

  return (
    <Oyna
      sarlavha={boshlangich ? t('Bitim vidjetini tahrirlash') : t('Yangi bitim vidjeti')}
      onYop={onYop}
      onSubmit={saqla}
      keng
      past={
        <>
          {xato && <span className="xato-qator">{xato}</span>}
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor qilish')}
          </button>
          <button type="submit" className="btn">
            {t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="pn-nom">{t('Vidjet nomi')}</label>
        <input id="pn-nom" className="input" value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} placeholder={t('Masalan: Target orqali kelgan lidlar')} />
      </div>

      {voronkalar.length > 1 && (
        <Tanlovlar nom={t('Voronkalar')} variantlar={voronkalar.map((v) => ({ k: v.id, nom: v.name }))} tanlangan={f.pipelineIds} onChange={(v) => ozg({ pipelineIds: v })} />
      )}
      <Tanlovlar nom={t('Bosqichlar')} variantlar={bosqichlar} tanlangan={f.stageIds} onChange={(v) => ozg({ stageIds: v })} />
      {seatlar.length > 0 && (
        <Tanlovlar nom={t("Mas'ullar")} variantlar={seatlar.map((s) => ({ k: s.id, nom: s.displayName }))} tanlangan={f.seatIds} onChange={(v) => ozg({ seatIds: v })} />
      )}

      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="pn-holat">{t('Bitim holati')}</label>
          <select id="pn-holat" className="input" value={f.status} onChange={(e) => ozg({ status: e.target.value as BitimFiltri['status'] })}>
            <option value="all">{t('Hammasi')}</option>
            <option value="open">{t('Ochiq')}</option>
            <option value="won">{t('Muvaffaqiyatli')}</option>
            <option value="lost">{t('Yo‘qotilgan')}</option>
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="pn-guruh">{t("Natijani guruhlash")}</label>
          <select id="pn-guruh" className="input" value={f.group} onChange={(e) => ozg({ group: e.target.value as BitimFiltri['group'] })}>
            <option value="stage">{t("Bosqich bo'yicha")}</option>
            <option value="manager">{t("Mas'ul bo'yicha")}</option>
            <option value="source">{t("Manba bo'yicha")}</option>
            <option value="none">{t('Guruhlamasdan (faqat jami)')}</option>
          </select>
        </div>
      </div>

      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="pn-manba">{t('Manbalar (vergul bilan)')}</label>
          <input
            id="pn-manba"
            className="input"
            value={f.sources.join(', ')}
            maxLength={2000}
            onChange={(e) => ozg({ sources: e.target.value ? e.target.value.split(',').map((x) => x.trimStart()) : [] })}
            placeholder="telegram, instagram"
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="pn-teg">{t('Teglar (vergul bilan)')}</label>
          <input
            id="pn-teg"
            className="input"
            value={f.tags.join(', ')}
            maxLength={2000}
            onChange={(e) => ozg({ tags: e.target.value ? e.target.value.split(',').map((x) => x.trimStart()) : [] })}
            placeholder="target, direct"
          />
        </div>
      </div>

      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="pn-sana">{t('Sana')}</label>
          <select id="pn-sana" className="input" value={f.dateMode} onChange={(e) => ozg({ dateMode: e.target.value as BitimFiltri['dateMode'] })}>
            <option value="all">{t('Sanasiz — barcha bitimlar')}</option>
            <option value="period">{t('Bosh sahifadagi davr (Bugun, Hafta…)')}</option>
            <option value="range">{t("Qat'iy oraliq")}</option>
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="pn-sana-turi">{t('Qaysi sana')}</label>
          <select id="pn-sana-turi" className="input" value={f.dateField} onChange={(e) => ozg({ dateField: e.target.value as BitimFiltri['dateField'] })}>
            <option value="created">{t('Yaratilgan sana')}</option>
            <option value="closed">{t('Yopilgan sana')}</option>
          </select>
        </div>
      </div>
      {f.dateMode === 'range' && (
        <div className="vr-oyna-ikki">
          <div className="maydon-blok">
            <label htmlFor="pn-dan">{t('Boshlanish')}</label>
            <input id="pn-dan" className="input" type="date" value={f.from ?? ''} max={f.to} onChange={(e) => ozg({ from: e.target.value || undefined })} />
          </div>
          <div className="maydon-blok">
            <label htmlFor="pn-gacha">{t('Tugash')}</label>
            <input id="pn-gacha" className="input" type="date" value={f.to ?? ''} min={f.from} onChange={(e) => ozg({ to: e.target.value || undefined })} />
          </div>
        </div>
      )}
      <p className="yordam">
        {f.dateMode === 'period'
          ? t("Katta raqam — tanlangan davrga mos bitimlar soni.")
          : t("Katta raqam — filtrga mos bitimlar; \"+N\" — ulardan tanlangan davrga tushganlari.")}
      </p>
    </Oyna>
  );
}
