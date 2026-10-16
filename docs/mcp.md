# Claude ulanishi (MCP)

Kompaniya egasi yoki rahbar platformani **o'z Claude akkauntidan** boshqaradi: savol beradi — Claude haqiqiy ma'lumotdan javob beradi; ruxsat berilgan bo'lsa vazifa qo'yadi, ogohlantirishni yopadi va h.k.

> «Bu hafta jamoa qanday ishladi? Eng zaif menejer va uning zaif mezoni qaysi?»
> «Maktubaning oxirgi 5 ta qo'ng'irog'ini ko'rib chiq — iqtiboslar bilan ko'rsat.»
> «Muxlisaga ertaga 10:00 ga mijozga qayta qo'ng'iroq vazifasini qo'y.»

## Arxitektura

```
Claude (claude.ai / Desktop / Code)
   │  1. GET /.well-known/oauth-protected-resource      (RFC 9728)
   │  2. GET /.well-known/oauth-authorization-server    (RFC 8414)
   │  3. POST /oauth/register                           (DCR, RFC 7591)
   │  4. GET /oauth/authorize ──► sayt: /mcp/ruxsat  (kirish + «Ruxsat berish»)
   │  5. POST /oauth/token  (PKCE S256)  ──► access (1 soat) + refresh (30 kun)
   ▼
POST /mcp   Authorization: Bearer sai_at_…        (Streamable HTTP, stateless)
   │
   └─► vosita ──► app.inject(REST API, o'sha Bearer bilan)
                   └─ requireBusiness / requirePermission / RLS — saytdagi bilan bir xil
```

**Asosiy qaror:** MCP vositalari mavjud REST API'ni foydalanuvchining o'z tokeni bilan chaqiradi. Ruxsatlar, tenant izolatsiyasi, validatsiya qayta yozilmaydi va hech qachon saytdan farq qilmaydi: rahbar butun jamoani, sotuvchi faqat o'zini ko'radi.

| Fayl | Vazifa |
|---|---|
| `backend/src/mcp/oauth.ts` | OAuth 2.1: mijoz, PKCE, kod, token, refresh rotation, bekor qilish |
| `backend/src/http/routes/oauth.ts` | `.well-known`, `/oauth/*`, ruxsat sahifasi API, ulangan ilovalar |
| `backend/src/mcp/server.ts` | MCP vositalari va tayyor so'rovlar |
| `backend/src/http/routes/mcp.ts` | `/mcp` endpointi |
| `backend/src/http/auth-plugin.ts` | Bearer token → foydalanuvchi konteksti, cheklovlar |
| `frontend/src/pages/McpRuxsat.tsx` | Ruxsat sahifasi |
| `frontend/src/components/sozlama/ClaudeUlanishi.tsx` | Sozlamalar → Claude ulanishi |
| `backend/src/http/verify-mcp.ts` | To'liq oqim testi (`npm run verify:mcp`, 34 tekshiruv) |

## Xavfsizlik modeli

- **Kim ulay oladi:** kompaniya egasi, rahbar (`analytics:read:all`) yoki platforma admini. Sotuvchi ruxsat bera olmaydi.
- **Ruxsat darajasi (scope):** `read` — faqat o'qish; `read write` — boshqarish. `read` tokenda yozish vositalari umuman ko'rsatilmaydi, REST yozuv so'rovlari 403.
- **Hisob amallari yopiq:** Bearer token faqat `/mcp`, `/api/v1/businesses/*` va `GET /api/v1/auth/context` uchun. Parol, sessiyalar, admin panel — faqat saytda.
- **Tokenlar:** bazada faqat SHA-256 xeshi. Kod bir martalik (10 daqiqa), PKCE S256 majburiy. Refresh har ishlatilganda almashtiriladi; eski refresh qayta kelsa — o'g'irlik deb hisoblanib, butun ruxsat bekor qilinadi.
- **Qaytish manzili:** faqat HTTPS yoki localhost; begona `redirect_uri` ga hech qachon yo'naltirilmaydi.
- **Bekor qilish:** Sozlamalar → Claude ulanishi → «Bekor qilish» yoki `POST /oauth/revoke`.
- **Ma'lumot oqimi:** Claude'ga yuborilgan javoblar (suhbat matnlari, ismlar) Anthropic serverlaridan o'tadi — mijozlarga va shaxsiy ma'lumotlar qonuniga nisbatan buni hisobga oling.

## Vositalar

**O'qish (13):** `list_businesses`, `get_team_overview`, `list_managers`, `get_manager_report`, `list_conversations`, `get_conversation` (isbot iqtiboslari bilan), `list_alerts`, `list_tasks`, `get_daily_report`, `get_analytics` (12 bo'lim), `list_leads`, `get_playbook`, `get_integrations_status`.

**Boshqarish (6, faqat `write`):** `update_alert`, `create_task`, `update_task`, `add_conversation_comment`, `sync_moizvonki`, `reanalyze_conversation` (AI xarajati bor).

**Tayyor so'rovlar:** `weekly_review` (haftalik jamoa sharhi), `coach_manager` (menejer uchun kouching rejasi).

Yangi vosita qo'shish — `server.ts` da bitta `registerTool` va bitta `api(...)` chaqiruvi; ruxsat tekshiruvi endpointning o'zida bo'ladi.

## Ulash

**Lokal (Claude Code):**

```bash
claude mcp add --transport http sotuv-intellekti http://localhost:3001/mcp
```

so'ng Claude Code'da `/mcp` → sotuv-intellekti → Authenticate → brauzerda kirish va ruxsat.

**claude.ai / Claude Desktop:** Settings → Connectors → Add custom connector → URL: `${PUBLIC_URL}/mcp`.

claude.ai ulanishi uchun backend **ommaviy HTTPS** manzilda bo'lishi va `.env` da `PUBLIC_URL` o'rnatilishi shart (masalan `PUBLIC_URL=https://api.sotuv.uz`). Claude'ning qaytish manzili: `https://claude.ai/api/mcp/auth_callback` (kelajakda `https://claude.com/api/mcp/auth_callback` ham) — ikkalasi ham HTTPS, qoidaga mos.

## Tekshirish

```bash
npm run verify:mcp
```

Rasmiy MCP SDK mijozi haqiqiy HTTP orqali: kashfiyot, DCR, PKCE, bir martalik kod, scope cheklovi, sotuvchi cheklovi, hisob amallari yopiqligi, refresh almashtirish va o'g'irlik aniqlanishi, bekor qilish.
