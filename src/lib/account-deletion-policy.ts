export const ACCOUNT_DELETION_REAUTH_WINDOW_SECONDS = 5 * 60;

export function isAccountDeletionEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function isRecentGoogleAuthentication(
  provider: string | null | undefined,
  authTime: number | null | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return (
    provider === "google" &&
    typeof authTime === "number" &&
    Number.isFinite(authTime) &&
    authTime <= nowSeconds &&
    nowSeconds - authTime <= ACCOUNT_DELETION_REAUTH_WINDOW_SECONDS
  );
}

export type OwnedAvatarStorageReference = {
  bucket: string;
  path: string;
};

/**
 * Accept only avatar-bucket URLs from this Supabase project whose object is
 * inside the user's own UUID folder. External OAuth avatars and public-report
 * photos are intentionally left alone.
 */
export function getOwnedAvatarStorageReference(
  avatarUrl: string | null | undefined,
  userId: string,
  supabaseUrl: string,
): OwnedAvatarStorageReference | null {
  if (!avatarUrl || !userId) return null;

  try {
    const avatar = new URL(avatarUrl);
    const project = new URL(supabaseUrl);
    if (avatar.origin !== project.origin) return null;

    const prefix = [
      "/storage/v1/object/public/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/authenticated/",
    ].find((candidate) => avatar.pathname.startsWith(candidate));
    if (!prefix) return null;

    const [bucket, ...encodedPath] = avatar.pathname.slice(prefix.length).split("/");
    const pathParts = encodedPath.map((part) => decodeURIComponent(part));
    const path = pathParts.join("/");

    if (
      !bucket ||
      !["avatars", "profile-avatars"].includes(bucket) ||
      !/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(bucket) ||
      pathParts[0] !== userId ||
      pathParts.some((part) => !part || part === "." || part === ".." || part.includes("\0"))
    ) {
      return null;
    }

    return { bucket, path };
  } catch {
    return null;
  }
}

export function getJwtAuthTime(accessToken: string): number | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as {
      auth_time?: unknown;
    };
    return typeof decoded.auth_time === "number" && Number.isFinite(decoded.auth_time)
      ? decoded.auth_time
      : null;
  } catch {
    return null;
  }
}
