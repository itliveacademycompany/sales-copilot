import assert from 'node:assert/strict';
import {
  amaldagiJadval,
  seatWorkHoursSchema,
  suhbatIshVaqtidami,
  workHoursSchema,
} from './settings.js';

/**
 * Ish vaqti tekshiruvi — ogohlantirish darvozasi shu funksiyaga tayanadi.
 *
 * Eng muhim holat: server UTC da ishlaganda ham hisob BIZNES zonasida
 * bo'lishi. Aks holda Toshkentdagi 09:30 UTC da 04:30 bo'lib, har
 * ertalabki suhbat "ish vaqtidan tashqari" deb belgilanardi.
 */

let otdi = 0;
let yiqildi = 0;
function sinov(nom: string, fn: () => void): void {
  try {
    fn();
    otdi++;
    console.log(`  ✓ ${nom}`);
  } catch (e) {
    yiqildi++;
    console.error(`  ✗ ${nom}\n    ${(e as Error).message}`);
  }
}

const jadval = workHoursSchema.parse({ startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5] });
const TZ = 'Asia/Tashkent';

console.log('\nISH VAQTI TEKSHIRUVI');

// 2026-08-13 — payshanba (ISO 4).
sinov('payshanba 12:00 Toshkent — ish vaqtida', () => {
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-13T07:00:00Z'), jadval, TZ), true);
});

sinov('payshanba 08:59 Toshkent — hali erta', () => {
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-13T03:59:00Z'), jadval, TZ), false);
});

sinov('payshanba 09:00 Toshkent — chegaraning o\'zi kiradi', () => {
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-13T04:00:00Z'), jadval, TZ), true);
});

sinov('payshanba 18:00 Toshkent — tugash chegarasi KIRMAYDI', () => {
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-13T13:00:00Z'), jadval, TZ), false);
});

// 2026-08-15 — shanba (ISO 6), jadvalda yo'q.
sinov('shanba 12:00 — ish kuni emas', () => {
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-15T07:00:00Z'), jadval, TZ), false);
});

sinov('yarim tun 00:00 — "24" bo\'lib ketmaydi', () => {
  // 2026-08-13 19:00 UTC = 14-avgust 00:00 Toshkent (juma).
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-13T19:00:00Z'), jadval, TZ), false);
});

sinov('zona hisobga olinadi — bir xil payt, ikki zona, ikki natija', () => {
  const payt = new Date('2026-08-13T04:30:00Z'); // Toshkent 09:30, UTC 04:30
  assert.equal(suhbatIshVaqtidami(payt, jadval, 'Asia/Tashkent'), true);
  assert.equal(suhbatIshVaqtidami(payt, jadval, 'UTC'), false);
});

sinov('noto\'g\'ri zona — cheklov qo\'llanmaydi (ogohlantirish yo\'qolmasin)', () => {
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-15T22:00:00Z'), jadval, 'Yoq/Bunday'), true);
});

sinov('yakshanba jadvalga kirsa — ishlaydi', () => {
  const j = workHoursSchema.parse({ startHour: 0, endHour: 24, days: [7] });
  // 2026-08-16 — yakshanba.
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-16T07:00:00Z'), j, TZ), true);
  assert.equal(suhbatIshVaqtidami(new Date('2026-08-13T07:00:00Z'), j, TZ), false);
});

sinov('standart qiymat — sozlama o\'chirilgan', () => {
  assert.equal(workHoursSchema.parse({}).alertsOnlyWorkHours, false);
});

// ─── Menejer uchun alohida jadval ─────────────────────────────────────────

console.log('\nALOHIDA JADVAL');

const kechki = { startHour: 14, endHour: 22, days: [1, 2, 3, 4, 5] };

sinov("bosh kalit O'CHIQ — o'rin jadvali E'TIBORSIZ qoladi", () => {
  const b = workHoursSchema.parse({ startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5] });
  const n = amaldagiJadval(b, seatWorkHoursSchema.parse(kechki) ?? undefined);
  assert.equal(n.startHour, 9);
  assert.equal(n.endHour, 18);
});

sinov("bosh kalit YOQIQ — o'rin jadvali ustun keladi", () => {
  const b = workHoursSchema.parse({ startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5], perSeatSchedules: true });
  const n = amaldagiJadval(b, seatWorkHoursSchema.parse(kechki) ?? undefined);
  assert.equal(n.startHour, 14);
  assert.equal(n.endHour, 22);
});

sinov("kalit yoqiq, lekin o'rin jadvali yo'q — biznesniki qoladi", () => {
  const b = workHoursSchema.parse({ startHour: 9, endHour: 18, days: [1], perSeatSchedules: true });
  const n = amaldagiJadval(b, seatWorkHoursSchema.parse(null) ?? undefined);
  assert.equal(n.startHour, 9);
  assert.deepEqual(n.days, [1]);
});

sinov("o'rin jadvali biznesning BOSH KALITINI o'zgartira olmaydi", () => {
  const b = workHoursSchema.parse({ perSeatSchedules: true, alertsOnlyWorkHours: true });
  // Yovuz kirish: o'rin jadvali ichida bosh kalitlarni o'chirishga urinish.
  const orin = seatWorkHoursSchema.parse({
    startHour: 0, endHour: 24, days: [1, 2, 3, 4, 5, 6, 7],
    alertsOnlyWorkHours: false, perSeatSchedules: false,
  } as never);
  const n = amaldagiJadval(b, orin ?? undefined);
  assert.equal(n.alertsOnlyWorkHours, true, 'ogohlantirish kaliti saqlanishi kerak');
  assert.equal(n.perSeatSchedules, true, 'bosh kalit saqlanishi kerak');
});

sinov("kechki smena menejeri: 20:00 o'z jadvalida ISH VAQTIDA", () => {
  const b = workHoursSchema.parse({ startHour: 9, endHour: 18, days: [1, 2, 3, 4, 5], perSeatSchedules: true });
  const n = amaldagiJadval(b, seatWorkHoursSchema.parse(kechki) ?? undefined);
  // 2026-08-13 15:00 UTC = 20:00 Toshkent, payshanba.
  const payt = new Date('2026-08-13T15:00:00Z');
  assert.equal(suhbatIshVaqtidami(payt, b, TZ), false, 'biznes jadvalida tashqarida');
  assert.equal(suhbatIshVaqtidami(payt, n, TZ), true, "o'z jadvalida ichkarida");
});

console.log(`\n${otdi}/${otdi + yiqildi} o'tdi`);
process.exit(yiqildi > 0 ? 1 : 0);
