/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  resolveOriginWithoutUtmSource,
  resolvePaidClickAttribution,
} from "../../../supabase/functions/_shared/paidClickSource";

describe("resolvePaidClickAttribution", () => {
  it("treats a gclid as Google Ads paid traffic regardless of the referrer", () => {
    expect(resolvePaidClickAttribution({ gclid: "Cj0KCQ_abc" })).toEqual({
      origin: "Google Ads",
      medium: "cpc",
      clickIdKey: "gclid",
    });
    // Google Ads redirects often arrive with no referrer at all — the click id
    // is then the ONLY signal, and it must still be read.
    expect(
      resolvePaidClickAttribution({ gclid: "Cj0KCQ_abc", referrer: "https://www.google.pt/" })?.origin,
    ).toBe("Google Ads");
  });

  it("separates paid from organic Google: same referrer, different answer", () => {
    const organic = resolvePaidClickAttribution({ referrer: "https://www.google.pt/search?q=x" });
    const paid = resolvePaidClickAttribution({ referrer: "https://www.google.pt/", gclid: "x1" });
    expect(organic).toBeNull();
    expect(paid?.medium).toBe("cpc");
    expect(resolveOriginWithoutUtmSource({ referrer: "https://www.google.pt/search?q=x" })).toBe("Google");
    expect(resolveOriginWithoutUtmSource({ referrer: "https://www.google.pt/", gclid: "x1" })).toBe(
      "Google Ads",
    );
  });

  it("maps an fbclid to the Meta property the referrer names", () => {
    expect(resolvePaidClickAttribution({ fbclid: "IwAR1", referrer: "https://www.facebook.com/" })).toEqual({
      origin: "Facebook",
      medium: "paid_social",
      clickIdKey: "fbclid",
    });
    expect(
      resolvePaidClickAttribution({ fbclid: "IwAR1", referrer: "https://l.instagram.com/" })?.origin,
    ).toBe("Instagram");
    // No referrer (Meta in-app browser often sends none) -> Facebook.
    expect(resolvePaidClickAttribution({ fbclid: "IwAR1" })?.origin).toBe("Facebook");
  });

  it("never lets an fbclid turn a third-party referrer into a Meta origin", () => {
    // Anybody can append ?fbclid=... to a link on their own site. The origin
    // must fall back to Facebook, never become the third-party domain, and
    // never become Instagram/Facebook because the domain "looks" like one.
    const r = resolvePaidClickAttribution({
      fbclid: "IwAR1",
      referrer: "https://notfacebook.com/",
    });
    expect(r?.origin).toBe("Facebook");
    expect(
      resolvePaidClickAttribution({ fbclid: "IwAR1", referrer: "https://www.linkedin.com/" })?.origin,
    ).toBe("Facebook");
  });

  it("maps msclkid to Bing paid", () => {
    expect(resolvePaidClickAttribution({ msclkid: "abc" })).toEqual({
      origin: "Bing",
      medium: "cpc",
      clickIdKey: "msclkid",
    });
  });

  it("prefers gclid over fbclid over msclkid when more than one is present", () => {
    expect(resolvePaidClickAttribution({ gclid: "a", fbclid: "b", msclkid: "c" })?.clickIdKey).toBe("gclid");
    expect(resolvePaidClickAttribution({ fbclid: "b", msclkid: "c" })?.clickIdKey).toBe("fbclid");
  });

  it("ignores empty, blank and non-string click ids instead of inventing paid traffic", () => {
    expect(resolvePaidClickAttribution({ gclid: "" })).toBeNull();
    expect(resolvePaidClickAttribution({ gclid: "   " })).toBeNull();
    expect(resolvePaidClickAttribution({ fbclid: null })).toBeNull();
    expect(resolvePaidClickAttribution({ fbclid: undefined })).toBeNull();
    expect(resolvePaidClickAttribution({})).toBeNull();
    expect(resolvePaidClickAttribution(null)).toBeNull();
    expect(resolvePaidClickAttribution(undefined)).toBeNull();
  });
});

describe("resolveOriginWithoutUtmSource", () => {
  it("falls back to the referrer domain when there is no click id", () => {
    expect(resolveOriginWithoutUtmSource({ referrer: "https://www.instagram.com/p/x" })).toBe("Instagram");
    expect(resolveOriginWithoutUtmSource({ referrer: "https://t.co/abc" })).toBe("Twitter");
  });

  it("invents nothing for a direct visit or an unknown referrer", () => {
    expect(resolveOriginWithoutUtmSource({})).toBeNull();
    expect(resolveOriginWithoutUtmSource({ referrer: "https://www.some-blog.pt/artigo" })).toBeNull();
    expect(resolveOriginWithoutUtmSource(null)).toBeNull();
  });
});
