export const NICKNAME_STORAGE_KEY = "king-of-flak.nickname";

export function parseNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if ([...name].length < 1 || [...name].length > 12) return null;
  return /^[\p{Script=Han}A-Za-z0-9_]+$/u.test(name) ? name : null;
}

export function readSavedNickname(raw: string | null): string {
  try {
    const saved = JSON.parse(raw ?? "null");
    return saved?.version === 1 ? (parseNickname(saved.nickname) ?? "") : "";
  } catch {
    return "";
  }
}

export function createRoundIdentity(value: unknown, mobile: boolean) {
  const nickname = parseNickname(value);
  return nickname === null
    ? null
    : Object.freeze({
        nickname,
        mobile,
        displayName: `${nickname}_${mobile ? "mb" : "pc"}`,
      });
}
