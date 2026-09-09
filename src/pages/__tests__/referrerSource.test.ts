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

  // -- Expanded domain table: every origin below is reachable from a real
  //    click, including the mobile hosts, the platforms' own outbound
  //    redirectors and their own short-link domains. --
  it.each([
    // Instagram
    ["https://l.instagram.com/?u=https%3A%2F%2Fsite.pt", "Instagram"],
    ["https://lm.instagram.com/", "Instagram"],
    ["https://instagr.am/p/x", "Instagram"],
    // Facebook
    ["https://l.facebook.com/l.php", "Facebook"],
    ["https://mbasic.facebook.com/", "Facebook"],
    ["https://business.facebook.com/", "Facebook"],
    ["https://fb.me/abc", "Facebook"],
    ["https://fb.watch/abc", "Facebook"],
    // Google
    ["https://www.google.co.uk/search?q=x", "Google"],
    ["https://news.google.com/", "Google"],
    // LinkedIn
    ["https://www.linkedin.com/feed/", "LinkedIn"],
    ["https://pt.linkedin.com/", "LinkedIn"],
    ["https://lnkd.in/abc", "LinkedIn"],
    // YouTube
    ["https://m.youtube.com/watch?v=x", "YouTube"],
    ["https://youtu.be/abc", "YouTube"],
    ["https://www.youtube-nocookie.com/embed/x", "YouTube"],
    // TikTok
    ["https://www.tiktok.com/@user/video/1", "TikTok"],
    ["https://m.tiktok.com/", "TikTok"],
    ["https://vm.tiktok.com/abc", "TikTok"],
    ["https://vt.tiktok.com/abc", "TikTok"],
    // Bing
    ["https://www.bing.com/search?q=x", "Bing"],
    ["https://cn.bing.com/", "Bing"],
    // DuckDuckGo
    ["https://duckduckgo.com/?q=x", "DuckDuckGo"],
    ["https://html.duckduckgo.com/html/", "DuckDuckGo"],
    ["https://lite.duckduckgo.com/lite/", "DuckDuckGo"],
    ["https://start.duckduckgo.com/", "DuckDuckGo"],
    // Yahoo
    ["https://search.yahoo.com/search?p=x", "Yahoo"],
    ["https://r.search.yahoo.com/_ylt=abc", "Yahoo"],
    ["https://pt.search.yahoo.com/", "Yahoo"],
    // Twitter / X
    ["https://twitter.com/user/status/1", "Twitter"],
    ["https://mobile.twitter.com/", "Twitter"],
    ["https://x.com/user/status/1", "Twitter"],
    ["https://t.co/abcdef", "Twitter"],
    // Pinterest
    ["https://www.pinterest.com/pin/1/", "Pinterest"],
    ["https://pt.pinterest.com/", "Pinterest"],
    ["https://www.pinterest.co.uk/", "Pinterest"],
    ["https://pin.it/abc", "Pinterest"],
    // WhatsApp
    ["https://web.whatsapp.com/", "WhatsApp"],
    ["https://api.whatsapp.com/send?phone=1", "WhatsApp"],
    ["https://chat.whatsapp.com/abc", "WhatsApp"],
    ["https://wa.me/351912345678", "WhatsApp"],
    // Telegram
    ["https://t.me/olyvia", "Telegram"],
    ["https://web.telegram.org/", "Telegram"],
    ["https://telegram.me/olyvia", "Telegram"],
    // Reddit
    ["https://www.reddit.com/r/x/comments/1", "Reddit"],
    ["https://old.reddit.com/", "Reddit"],
    ["https://np.reddit.com/", "Reddit"],
    ["https://out.reddit.com/", "Reddit"],
    ["https://redd.it/abc", "Reddit"],
    // Snapchat
    ["https://www.snapchat.com/", "Snapchat"],
    ["https://story.snapchat.com/", "Snapchat"],
    ["https://t.snapchat.com/abc", "Snapchat"],
  ])("maps %s to %s", (referrer, expected) => {
    expect(resolveOriginFromReferrer(referrer)).toBe(expected);
  });

  // -- Negative case per origin. Anybody can register `nottiktok.com` or
  //    `tiktok.com.phishing.example`; neither may ever be attributed to the
  //    brand it imitates. (Regression: the old Google rule matched
  //    `google.evil.example`.) --
  it.each([
    "instagram",
    "facebook",
    "google",
    "linkedin",
    "youtube",
    "tiktok",
    "bing",
    "duckduckgo",
    "yahoo",
    "twitter",
    "x",
    "pinterest",
    "whatsapp",
    "telegram",
    "reddit",
    "snapchat",
  ])("never attributes look-alike domains of %s", (brand) => {
    expect(resolveOriginFromReferrer(`https://not${brand}.com/`)).toBeNull();
    expect(resolveOriginFromReferrer(`https://${brand}.com.phishing.example/`)).toBeNull();
    expect(resolveOriginFromReferrer(`https://${brand}.evil.example/`)).toBeNull();
    expect(resolveOriginFromReferrer(`https://${brand}-com.example/`)).toBeNull();
    expect(resolveOriginFromReferrer(`https://my${brand}.pt/`)).toBeNull();
  });

  it("never attributes look-alike domains of the short-link hosts", () => {
    for (const host of [
      "not-t.co",
      "t.co.phishing.example",
      "nott.me",
      "t.me.evil.example",
      "notwa.me",
      "wa.me.phishing.example",
      "notyoutu.be",
      "youtu.be.evil.example",
      "notlnkd.in",
      "lnkd.in.phishing.example",
      "notredd.it",
      "redd.it.evil.example",
      "notpin.it",
      "pin.it.phishing.example",
      "notfb.me",
      "fb.me.evil.example",
    ]) {
      expect(resolveOriginFromReferrer(`https://${host}/`), host).toBeNull();
    }
  });

  it("ignores a trailing dot in the hostname (same host in FQDN form)", () => {
    expect(resolveOriginFromReferrer("https://www.instagram.com./p/x")).toBe("Instagram");
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
