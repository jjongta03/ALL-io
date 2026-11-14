import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getConfig } from "./config";
import { AppError } from "./errors";
const prefix = Buffer.from("MAWDENC1");
function encryptionKey() {
  const value = process.env.CONTRACT_ENCRYPTION_KEY;
  if (value && !/^[a-f0-9]{64}$/i.test(value))
    throw new AppError(503, "계약서 암호화 키 설정을 확인하세요.");
  if (!value && getConfig().production)
    throw new AppError(503, "운영 계약서 저장에는 암호화 키가 필요합니다.");
  return value ? Buffer.from(value, "hex") : null;
}
export function protectDocument(bytes: Buffer) {
  const key = encryptionKey();
  if (!key) return bytes;
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    content = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([prefix, iv, cipher.getAuthTag(), content]);
}
export function revealDocument(bytes: Buffer) {
  if (!bytes.subarray(0, prefix.length).equals(prefix)) {
    if (getConfig().production)
      throw new AppError(503, "암호화되지 않은 계약서는 운영에서 열 수 없습니다.");
    return bytes;
  }
  const key = encryptionKey();
  if (!key) throw new AppError(503, "계약서 복호화 키가 필요합니다.");
  try {
    const d = createDecipheriv("aes-256-gcm", key, bytes.subarray(8, 20));
    d.setAuthTag(bytes.subarray(20, 36));
    return Buffer.concat([d.update(bytes.subarray(36)), d.final()]);
  } catch {
    throw new AppError(503, "계약서 복호화에 실패했습니다.");
  }
}
