import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUser } from './tenant.js';

/**
 * Video qayerdan keladi:
 *   `link` — tashqi havola (YouTube, Vimeo, Google Drive, … yoki to'g'ridan
 *            to'g'ri .mp4 manzil). Pleyer manzili o'qish paytida havoladan
 *            hisoblanadi (`qollanma/havola.ts`) — ya'ni tahlilchi
 *            yaxshilansa, eski yozuvlar ham avtomatik yangi qoidaga o'tadi.
 *   `file` — serverga yuklangan fayl (`MEDIA_DIR/qollanma/<id>/`).
 */
export const guideSource = pgEnum('guide_source', ['link', 'file']);

/**
 * Yuklangan faylning holati. Havola har doim `ready`.
 *   `waiting`    — yozuv yaratildi, fayl hali yuklanmadi
 *   `processing` — ffmpeg brauzerga mos formatga o'tkazmoqda
 *   `ready`      — ko'rsa bo'ladi
 *   `failed`     — fayl buzuq yoki video emas (`error` da sabab)
 */
export const guideStatus = pgEnum('guide_status', ['waiting', 'processing', 'ready', 'failed']);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'LLANMA VIDEOLARI — platforma darajasida
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Platformadan qanday foydalanish haqidagi o'quv videolari. Bitta ro'yxat
 * BUTUN platforma uchun: har bir kabinetdagi har bir foydalanuvchi bir xil
 * qo'llanmani ko'radi. Shuning uchun jadval tenant'ga tegishli EMAS va RLS
 * qo'llanmaydi (ai_provider bilan bir toifa).
 *
 * O'qish — har qanday kirgan foydalanuvchi (faqat `is_published`).
 * Yozish — faqat `super_admin`.
 */
export const guideVideo = pgTable(
  'guide_video',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    title: text('title').notNull(),
    description: text('description'),
    /** Bo'lim nomi (masalan "Qo'ng'iroqlar") — filtr chiplari shundan quriladi. */
    category: text('category'),

    source: guideSource('source').notNull(),
    /** `link` uchun — asl havola (yoki saytdagi nisbiy yo'l: `/qollanma-media/x.mp4`). */
    url: text('url'),
    /** Havola muqovasi (oEmbed'dan). Yuklangan faylda muqova diskda turadi. */
    thumbnailUrl: text('thumbnail_url'),

    status: guideStatus('status').notNull().default('ready'),
    error: text('error'),

    /** Yuklangan fayl: asl nomi, hajmi (bayt), tayyor video MIME turi. */
    fileName: text('file_name'),
    fileSize: bigint('file_size', { mode: 'number' }),
    fileMime: text('file_mime'),
    /** Diskda `muqova.jpg` bormi (ffmpeg kadrni olishga ulgurdimi). */
    hasPoster: boolean('has_poster').notNull().default(false),

    durationSec: integer('duration_sec'),
    /** Ro'yxatdagi o'rni — kichigi tepada. */
    sortOrder: integer('sort_order').notNull().default(0),
    /** `false` — qoralama: faqat super admin ko'radi. */
    isPublished: boolean('is_published').notNull().default(true),

    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guide_video_order_idx').on(t.sortOrder, t.createdAt)],
);
