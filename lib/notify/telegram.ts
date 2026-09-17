export type Button = { text: string; data: string };
export interface Messenger {
  send(chat: string, text: string, buttons?: Button[][]): Promise<void>;
  acknowledge(callbackId: string, text?: string): Promise<void>;
}

export function telegramConfigured() {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
    process.env.TELEGRAM_BOT_USERNAME &&
    process.env.TELEGRAM_WEBHOOK_SECRET,
  );
}

/** Minimal Bot API client. Plain text only, so user content is never parsed
 * as markup, and nothing about the request body is logged. */
export function telegram(
  token = process.env.TELEGRAM_BOT_TOKEN ?? "",
  fetcher: typeof fetch = fetch,
): Messenger {
  async function call(method: string, body: unknown) {
    const response = await fetcher(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error(`Telegram ${method} ${response.status}`);
  }
  return {
    send: (chat, text, buttons) =>
      call("sendMessage", {
        chat_id: chat,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
        ...(buttons?.length
          ? {
              reply_markup: {
                inline_keyboard: buttons.map((row) =>
                  row.map((b) => ({ text: b.text, callback_data: b.data })),
                ),
              },
            }
          : {}),
      }),
    acknowledge: (id, text) =>
      call("answerCallbackQuery", {
        callback_query_id: id,
        ...(text ? { text } : {}),
      }),
  };
}

export type TelegramUpdate = {
  message?: {
    text?: string;
    chat: { id: number; type: string };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number; type: string } };
  };
};
