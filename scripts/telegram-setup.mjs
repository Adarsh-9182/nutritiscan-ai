// One-time bot setup: registers the webhook (with its secret) and commands.
// Usage: TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… APP_ORIGIN=https://www.nutritiscan.com node scripts/telegram-setup.mjs
const {
  TELEGRAM_BOT_TOKEN: token,
  TELEGRAM_WEBHOOK_SECRET: secret,
  APP_ORIGIN: origin,
} = process.env;
if (!token || !secret || !origin)
  throw new Error(
    "TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_ORIGIN are required",
  );
if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret))
  throw new Error("TELEGRAM_WEBHOOK_SECRET must be 16–256 of A-Z a-z 0-9 _ -");
async function call(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}
await call("setWebhook", {
  url: `${origin}/api/telegram`,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
await call("setMyCommands", {
  commands: [
    { command: "today", description: "Today’s care list and log" },
    { command: "week", description: "Your last 7 days" },
    { command: "help", description: "What I can do" },
    { command: "stop", description: "Disconnect NutritiScan" },
  ],
});
const me = await call("getMe", {});
console.log(
  `Webhook set for @${me.username}. Set TELEGRAM_BOT_USERNAME=${me.username} in Vercel.`,
);
