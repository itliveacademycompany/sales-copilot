/**
 * Telegram'ga xabar yuborish.
 *
 * Yig'ish (webhook) va yuborish ataylab ikki xil modulda: yig'ish hech
 * qachon to'xtamasligi kerak (FR-156), yuborish esa tashqi tarmoqqa
 * bog'liq va yiqilishi mumkin. Ular bir modulda bo'lsa, yuborishdagi
 * xato yig'ishni ham xavf ostiga qo'yardi.
 */

/**
 * Telegram API manzili.
 *
 * O'zgaruvchidan olinadi, faqat TEST uchun: soxta server bilan sinash
 * aks holda haqiqiy tarmoqqa chiqishni talab qilardi. Ishlab chiqarishda
 * o'zgaruvchi qo'yilmaydi va standart manzil ishlatiladi.
 */
function apiBase(): string {
  // Har chaqiruvda o'qiladi, modul yuklanganda emas: test o'zgaruvchini
  // import'lardan KEYIN qo'yadi, va modul darajasidagi o'qish o'shanda
  // eski qiymatni ushlab qolardi.
  return process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
}

export interface SendResult {
  ok: boolean;
  /** Telegram qaytargan xato tavsifi — jurnalga yozish uchun. */
  error?: string;
}

/**
 * Bitta xabar yuboradi.
 *
 * **Hech qachon otilmaydi.** Kunlik hisobot sikli ichida chaqiriladi va
 * bitta biznesning noto'g'ri chat id si qolgan bizneslarning hisobotini
 * to'xtatib qo'ymasligi kerak.
 *
 * `parse_mode` ataylab berilmaydi: mijoz nomi yoki suhbat xulosasi ichida
 * `_` yoki `*` bo'lsa Markdown buziladi va Telegram butun xabarni rad
 * etadi. Oddiy matn hech qachon yiqilmaydi.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  timeoutMs = 10_000,
): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${apiBase()}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return { ok: false, error: `HTTP ${res.status}: ${body}` };
    }
    const json = (await res.json()) as { ok?: boolean; description?: string };
    return json.ok === true ? { ok: true } : { ok: false, error: json.description ?? 'noma\'lum xato' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message === 'The operation was aborted.' ? 'vaqt tugadi' : message };
  } finally {
    clearTimeout(timer);
  }
}
