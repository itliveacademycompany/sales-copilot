/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RUXSATLAR MATRITSASI — TZ 2.1
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rollar emas, **ruxsatlar** tekshiriladi. Sabab: `if (role === 'owner')`
 * ko'rinishidagi tekshiruvlar kodga tarqalib ketadi va yangi rol qo'shilganda
 * ularning hammasini topish kerak bo'ladi. Ruxsat nomi bilan tekshirilganda
 * yangi rol faqat shu faylda ta'riflanadi.
 *
 * Ko'lam (scope) ruxsat nomining bir qismi:
 *   conversation:read:all         butun biznes
 *   conversation:read:department  faqat o'z bo'limi
 *   conversation:read:own         faqat o'zining
 */

export const PERMISSIONS = [
  // Biznes
  'business:read',
  'business:write',
  'subscription:manage',

  // Sozlamalar
  'playbook:read',
  'playbook:write',
  'integration:manage',
  'schedule:manage',

  // Odamlar
  'member:manage', // rahbarlar
  'seat:manage:all', // sotuvchilar (butun biznes)
  'seat:manage:department', // sotuvchilar (o'z bo'limi)

  // Ma'lumot
  'conversation:read:all',
  'conversation:read:department',
  'conversation:read:own',
  'media:listen:all',
  'media:listen:department',
  'media:listen:own',
  'analytics:read:all',
  'analytics:read:department',
  'analytics:read:own',
  'export:data',

  // Vazifalar (TZ 3.7A)
  'task:read:all',
  'task:read:department',
  'task:read:own',
  'task:manage:all',
  'task:manage:department',
  'task:update:own', // sotuvchi o'z vazifasining holatini o'zgartiradi

  // Ogohlantirishlar (TZ 3.8)
  'alert:read',
  'alert:resolve',

  // AI
  'assistant:all',
  'assistant:own',

  // Baholash
  'appeal:create',
  'appeal:resolve',

  // Audit
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Biznes ichidagi rol. `manager` `seat` orqali keladi, `business_member` orqali emas. */
export type Role = 'owner' | 'supervisor' | 'head' | 'auditor' | 'manager';

const OWNER: Permission[] = [
  'business:read',
  'business:write',
  'subscription:manage',
  'playbook:read',
  'playbook:write',
  'integration:manage',
  'schedule:manage',
  'member:manage',
  'seat:manage:all',
  'conversation:read:all',
  'media:listen:all',
  'analytics:read:all',
  'export:data',
  'task:read:all',
  'task:manage:all',
  'alert:read',
  'alert:resolve',
  'assistant:all',
  'appeal:resolve',
  'audit:read',
];

/**
 * Rahbar — kundalik boshqaruv.
 * Ega'dan farqi: obunani boshqara olmaydi va boshqa rahbar qo'sha olmaydi.
 * Bu ataylab: to'lov va odamlar ustidan nazorat egada qoladi.
 */
const SUPERVISOR: Permission[] = [
  'business:read',
  'business:write',
  'playbook:read',
  'playbook:write',
  'integration:manage',
  'schedule:manage',
  'seat:manage:all',
  'conversation:read:all',
  'media:listen:all',
  'analytics:read:all',
  'export:data',
  'task:read:all',
  'task:manage:all',
  'alert:read',
  'alert:resolve',
  'assistant:all',
  'appeal:resolve',
  'audit:read',
];

/**
 * Bo'lim boshlig'i — faqat o'z bo'limi doirasida.
 * Bo'lim darajasidagi rol shu sohadagi tizimlarda standart amaliyot.
 */
const HEAD: Permission[] = [
  'business:read',
  'playbook:read',
  'schedule:manage',
  'seat:manage:department',
  'conversation:read:department',
  'conversation:read:own',
  'media:listen:department',
  'analytics:read:department',
  'analytics:read:own',
  'task:read:department',
  'task:read:own',
  'task:manage:department',
  'alert:read',
  'assistant:own',
  'appeal:create',
];

/**
 * Auditor — faqat o'qish. Hech narsani o'zgartira olmaydi, hatto
 * o'z profilidan tashqari. Tashqi tekshiruv yoki konsultant uchun.
 */
const AUDITOR: Permission[] = [
  'business:read',
  'playbook:read',
  'conversation:read:all',
  'media:listen:all',
  'analytics:read:all',
  'export:data',
  'task:read:all',
  'alert:read',
  'audit:read',
];

/**
 * Sotuvchi — faqat o'zi.
 *
 * `appeal:create` bu yerda hal qiluvchi: sotuvchi noto'g'ri bahoga e'tiroz
 * bildira olmasa, tizimga ishonch yo'qoladi va u sabotajga o'tadi.
 */
const MANAGER: Permission[] = [
  'business:read',
  'playbook:read',
  'conversation:read:own',
  'media:listen:own',
  'analytics:read:own',
  'task:read:own',
  'task:update:own',
  'assistant:own',
  'appeal:create',
];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: OWNER,
  supervisor: SUPERVISOR,
  head: HEAD,
  auditor: AUDITOR,
  manager: MANAGER,
};

export function permissionsFor(role: Role): readonly Permission[] {
  return MATRIX[role];
}

export function hasPermission(
  granted: readonly Permission[],
  needed: Permission,
): boolean {
  return granted.includes(needed);
}

/**
 * Ma'lumot ko'rish ko'lami — so'rovlarni cheklash uchun.
 *
 * Marshrut kodida `if (role === ...)` yozish o'rniga shu funksiya
 * chaqiriladi va natijaga qarab filtr qo'yiladi.
 */
export type Scope = 'all' | 'department' | 'own' | 'none';

export function readScope(
  granted: readonly Permission[],
  resource: 'conversation' | 'analytics' | 'media',
): Scope {
  const key = resource === 'media' ? 'media:listen' : `${resource}:read`;
  if (granted.includes(`${key}:all` as Permission)) return 'all';
  if (granted.includes(`${key}:department` as Permission)) return 'department';
  if (granted.includes(`${key}:own` as Permission)) return 'own';
  return 'none';
}
