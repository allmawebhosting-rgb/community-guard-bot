import { describe, expect, it } from "vitest";
import {
  getJwtAuthTime,
  getOwnedAvatarStorageReference,
  isAccountDeletionEnabled,
  isRecentGoogleAuthentication,
} from "./account-deletion-policy";

describe("account deletion safeguards", () => {
  it("stays disabled unless the flag is exactly true", () => {
    expect(isAccountDeletionEnabled(undefined)).toBe(false);
    expect(isAccountDeletionEnabled("false")).toBe(false);
    expect(isAccountDeletionEnabled("TRUE")).toBe(false);
    expect(isAccountDeletionEnabled("true")).toBe(true);
  });

  it("accepts only Google authentication from the last five minutes", () => {
    expect(isRecentGoogleAuthentication("google", 700, 1000)).toBe(true);
    expect(isRecentGoogleAuthentication("google", 699, 1000)).toBe(false);
    expect(isRecentGoogleAuthentication("google", 1001, 1000)).toBe(false);
    expect(isRecentGoogleAuthentication("email", 999, 1000)).toBe(false);
  });

  it("reads a numeric auth_time claim and rejects malformed tokens", () => {
    const payload = Buffer.from(JSON.stringify({ auth_time: 1234 })).toString("base64url");
    expect(getJwtAuthTime(`header.${payload}.signature`)).toBe(1234);
    expect(getJwtAuthTime("not-a-jwt")).toBeNull();
  });

  it("allows deletion only for a storage object in the user's own folder", () => {
    expect(
      getOwnedAvatarStorageReference(
        "https://project.supabase.co/storage/v1/object/public/avatars/user-123/photo.png",
        "user-123",
        "https://project.supabase.co",
      ),
    ).toEqual({ bucket: "avatars", path: "user-123/photo.png" });

    expect(
      getOwnedAvatarStorageReference(
        "https://external.example/avatar.png",
        "user-123",
        "https://project.supabase.co",
      ),
    ).toBeNull();
    expect(
      getOwnedAvatarStorageReference(
        "https://project.supabase.co/storage/v1/object/public/lost-found-public/public/item.png",
        "user-123",
        "https://project.supabase.co",
      ),
    ).toBeNull();
  });
});
