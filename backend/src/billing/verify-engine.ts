import { decideBillingAction, type SubscriptionSnapshot } from './engine.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING QARORI — sof funksiya testi (DB'siz)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:billing-logic
 *
 * `decideBillingAction` DB'dan ataylab ajratilgan — shu tufayli soat va
 * kalendarni to'liq nazorat qilib, holat mashinasining har chekkasini
 * (grace muddati aynan tugagan payt kabi) sinash mumkin.
 */

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const NOW = new Date('2026-08-01T00:00:00Z');
const GRACE_DAYS = 10;
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function sub(over: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    status: 'trial',
    balance: 0,
    seatPrice: 640_000,
    trialEndsAt: null,
    currentPeriodEnd: null,
    graceEndsAt: null,
    ...over,
  };
}

console.log('\nBilling qaror mashinasi\n');

// ── Sinov davri ──
check(
  'sinov davomida hech narsa qilinmaydi',
  decideBillingAction(sub({ status: 'trial', trialEndsAt: day(5) }), 3, NOW, GRACE_DAYS).type === 'none',
);
check(
  'sinov tugagan, balans yetarli → yechish',
  decideBillingAction(
    sub({ status: 'trial', trialEndsAt: day(-1), balance: 2_000_000 }),
    2,
    NOW,
    GRACE_DAYS,
  ).type === 'charge',
);
check(
  'sinov tugagan, seat yo\'q → yechishsiz faollashtirish',
  (() => {
    const a = decideBillingAction(sub({ status: 'trial', trialEndsAt: day(-1) }), 0, NOW, GRACE_DAYS);
    return a.type === 'charge' && a.amount === 0;
  })(),
);
check(
  'sinov tugagan, balans yetarsiz → grace',
  decideBillingAction(sub({ status: 'trial', trialEndsAt: day(-1), balance: 100 }), 3, NOW, GRACE_DAYS)
    .type === 'enter_grace',
);

// ── Faol obuna ──
check(
  'davr tugamagan → hech narsa',
  decideBillingAction(sub({ status: 'active', currentPeriodEnd: day(10), balance: 0 }), 3, NOW, GRACE_DAYS)
    .type === 'none',
);
check(
  'davr tugadi, balans yetarli → qayta yechish',
  decideBillingAction(
    sub({ status: 'active', currentPeriodEnd: day(-1), balance: 5_000_000 }),
    2,
    NOW,
    GRACE_DAYS,
  ).type === 'charge',
);
check(
  'davr tugadi, balans yetarsiz → grace',
  decideBillingAction(sub({ status: 'active', currentPeriodEnd: day(-1), balance: 0 }), 3, NOW, GRACE_DAYS)
    .type === 'enter_grace',
);

// ── Grace ──
check(
  'grace davomida, balans hali yetarsiz → hech narsa (kutilmoqda)',
  decideBillingAction(sub({ status: 'grace', graceEndsAt: day(3), balance: 0 }), 3, NOW, GRACE_DAYS).type ===
    'none',
);
check(
  'grace davomida to\'lov kelsa → darhol faollashtirish (muddat tugashini kutmasdan)',
  decideBillingAction(
    sub({ status: 'grace', graceEndsAt: day(5), balance: 5_000_000 }),
    2,
    NOW,
    GRACE_DAYS,
  ).type === 'charge',
);
check(
  'grace muddati tugadi, to\'lov yo\'q → degraded',
  decideBillingAction(sub({ status: 'grace', graceEndsAt: day(-1), balance: 0 }), 3, NOW, GRACE_DAYS).type ===
    'degrade',
);
check(
  'grace muddati AYNAN shu daqiqada tugadi → degraded (chekka holat)',
  decideBillingAction(sub({ status: 'grace', graceEndsAt: NOW, balance: 0 }), 1, NOW, GRACE_DAYS).type ===
    'degrade',
);

// ── Degraded ──
check(
  'degraded, balans hali yo\'q → hech narsa (o\'zi tiklanmaydi)',
  decideBillingAction(sub({ status: 'degraded', balance: 0 }), 3, NOW, GRACE_DAYS).type === 'none',
);
check(
  'degraded, balans to\'ldirildi → qayta faollashtirish',
  decideBillingAction(sub({ status: 'degraded', balance: 5_000_000 }), 2, NOW, GRACE_DAYS).type === 'charge',
);

// ── Bekor qilingan ──
check(
  'cancelled hech qachon o\'zgarmaydi',
  decideBillingAction(sub({ status: 'cancelled', balance: 5_000_000 }), 0, NOW, GRACE_DAYS).type === 'none',
);

console.log(`\n${fail === 0 ? 'Billing mantiqi butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`);
if (fail > 0) process.exit(1);
