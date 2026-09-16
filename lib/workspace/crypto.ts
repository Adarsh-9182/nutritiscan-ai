import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const derive = promisify(scrypt);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const result = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${result.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected || expected.length !== 128) return false;
  const result = (await derive(password, salt, 64)) as Buffer;
  return timingSafeEqual(result, Buffer.from(expected, "hex"));
}

let localKey: Promise<Buffer> | undefined;
async function key(): Promise<Buffer> {
  if (process.env.HEALTH_DATA_KEY) {
    if (!/^[a-f0-9]{64}$/i.test(process.env.HEALTH_DATA_KEY))
      throw new Error("Invalid encryption configuration");
    return Buffer.from(process.env.HEALTH_DATA_KEY, "hex");
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("HEALTH_DATA_KEY is required");
  localKey ??= (async () => {
    await mkdir(".local", { recursive: true, mode: 0o700 });
    try {
      await writeFile(".local/data-key", randomBytes(32), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    return readFile(".local/data-key");
  })();
  return localKey;
}

// Bind ciphertext to its account and record to prevent swapping database rows.
export async function seal(value: unknown, context: string): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((b) => b.toString("base64"))
    .join(".");
}
export async function unseal<T>(value: string, context: string): Promise<T> {
  const [iv, tag, bytes] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64"));
  const cipher = createDecipheriv("aes-256-gcm", await key(), iv);
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8"),
  );
}
