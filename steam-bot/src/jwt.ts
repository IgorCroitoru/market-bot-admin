import jwt, { type JwtPayload } from "jsonwebtoken";

export function decodeJwtPayload(token: string | null | undefined): JwtPayload | null {
  if (!token) {
    return null;
  }

  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded === "string") {
    return null;
  }

  return decoded;
}

export function getJwtExpirationMs(token: string | null | undefined): number | null {
  const payload = decodeJwtPayload(token);

  if (!payload || typeof payload.exp !== "number") {
    return null;
  }

  return payload.exp * 1000;
}

export function isJwtUsable(
  token: string | null | undefined,
  skewMs = 120_000
): token is string {
  const expiresAt = getJwtExpirationMs(token);

  if (!token || !expiresAt) {
    return false;
  }

  return expiresAt - skewMs > Date.now();
}

export function isJwtExpiringWithin(
  token: string | null | undefined,
  windowMs: number
): boolean {
  const expiresAt = getJwtExpirationMs(token);

  if (!token || !expiresAt) {
    return true;
  }

  return expiresAt - windowMs <= Date.now();
}

export function getJwtExpirationDate(token: string | null | undefined): Date | null {
  const expiresAt = getJwtExpirationMs(token);
  return expiresAt ? new Date(expiresAt) : null;
}

export function getSteamLoginSecureJwt(cookies: string[] | null | undefined): string | null {
  const cookie = cookies?.find((entry) => entry.startsWith("steamLoginSecure="));

  if (!cookie) {
    return null;
  }

  const rawValue = cookie.split(";")[0]?.split("=").slice(1).join("=") ?? "";

  try {
    const decodedValue = decodeURIComponent(rawValue);
    const parts = decodedValue.includes("||")
      ? decodedValue.split("||")
      : decodedValue.split("|");

    return parts[parts.length - 1] || null;
  } catch {
    const parts = rawValue.split("%7C");
    return parts[parts.length - 1] || null;
  }
}
