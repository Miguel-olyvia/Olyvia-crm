/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  normalizeSourceText,
  resolveOriginFromReferrer,
} from "../../../supabase/functions/_shared/referrerSource";

describe("resolveOriginFromReferrer", () => {
  it.each([
    ["https://www.instagram.com/", "Instagram"],
    ["https://instagram.com/p/abc", "Instagram"],
    ["https://l.instagram.com/?u=https%3A%2F%2Fsite.pt", "Instagram"],
    ["https://www.facebook.com/", "Facebook"],
    ["https://m.facebook.com/story.php", "Facebook"],
    ["https://lm.facebook.com/l.php", "Facebook"],
    ["https://www.google.com/search?q=x", "Google"],
    ["https://www.google.pt/", "Google"],
    ["https://lnkd.in/abc", "LinkedIn"],
    ["https://youtu.be/abc", "YouTube"],
  ])("maps %s to %s", (referrer, expected) => {
    expect(resolveOriginFromReferrer(referrer)).toBe(expected);
  });

  it.each([
    ["https://www.some-blog.pt/artigo", "unknown domain invents nothing"],
    ["not a url", "unparseable referrer"],
    ["", "empty referrer"],
    ["   ", "blank referrer"],
  ])("returns null for %s (%s)", (referrer) => {
    expect(resolveOriginFromReferrer(referrer)).toBeNull();
  });

  it("returns null for non-string input instead of throwing", () => {
    expect(resolveOriginFromReferrer(undefined)).toBeNull();
    expect(resolveOriginFromReferrer(null)).toBeNull();
    expect(resolveOriginFromReferrer(42)).toBeNull();
  });

  it("does not match look-alike domains that merely contain a known brand", () => {
    expect(resolveOriginFromReferrer("https://instagram.com.phishing.example/")).toBeNull();
    expect(resolveOriginFromReferrer("https://notfacebook.com/")).toBeNull();
    expect(resolveOriginFromReferrer("https://google.evil.example/")).toBeNull();
  });
});

describe("normalizeSourceText", () => {
  it("folds case, accents and whitespace so a source name matches without configuration", () => {
    expect(normalizeSourceText("Instagram")).toBe("instagram");
    expect(normalizeSourceText("  Google Ads ")).toBe("googleads");
    expect(normalizeSourceText("Cartão de Visita")).toBe("cartaodevisita");
  });

  it("keeps distinct values distinct, so matching on it can never be partial", () => {
    // "face" must never be able to match "Facebook": the caller compares
    // normalized values with ===, and these are different strings.
    expect(normalizeSourceText("face")).not.toBe(normalizeSourceText("Facebook"));
    expect(normalizeSourceText("insta")).not.toBe(normalizeSourceText("Instagram"));
  });

  it("returns null for empty or non-string input", () => {
    expect(normalizeSourceText("")).toBeNull();
    expect(normalizeSourceText("   ")).toBeNull();
    expect(normalizeSourceText(undefined)).toBeNull();
    expect(normalizeSourceText(null)).toBeNull();
    expect(normalizeSourceText(7)).toBeNull();
  });
});
