import { getCloudflareEnv, getDatabase } from "@/lib/cloudflare";

// Every member gets their own address for turning email into a task: forward anything to it and it lands in
// Command Intake, assigned to them. The code in the address is what proves the mail is theirs, so it is
// private, and regenerating it immediately stops the old one working (see apps/email-intake).

const DEFAULT_INTAKE_MAILBOX = "tasks@tristanmaratos.com";
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1: these get read aloud and written down

function intakeMailbox(): string {
  return (getCloudflareEnv().EMAIL_INTAKE_ADDRESS || DEFAULT_INTAKE_MAILBOX).trim().toLowerCase();
}

export function addressForCode(code: string): string {
  const mailbox = intakeMailbox();
  const at = mailbox.indexOf("@");
  if (at < 1) return mailbox;
  return mailbox.slice(0, at) + "+" + code + mailbox.slice(at);
}

function newCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export async function getEmailIntake(userId: string): Promise<{ code: string; address: string }> {
  const db = getDatabase();
  const row = await db
    .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'email_code'")
    .bind(userId)
    .first<{ value: string }>();
  if (row?.value) return { code: row.value, address: addressForCode(row.value) };
  return rotateEmailIntake(userId);
}

export async function rotateEmailIntake(userId: string): Promise<{ code: string; address: string }> {
  const code = newCode();
  await getDatabase()
    .prepare(
      "INSERT INTO user_settings (user_id, key, value, updated_at) VALUES (?, 'email_code', ?, ?) " +
      "ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(userId, code, new Date().toISOString())
    .run();
  return { code, address: addressForCode(code) };
}
