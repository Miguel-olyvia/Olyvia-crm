import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  sanitizeEmail,
  sanitizePhone,
  sanitizeText,
  dedupArray,
  sanitizeFieldValues,
} from "./inputSanitizers.ts";

Deno.test("sanitizeEmail rejects multiple @ (Efigenia case)", () => {
  assertEquals(
    sanitizeEmail(
      "Efigenia.jose.martins@gmail.com.jose.martins@gmail.com.jose.martins@gmail.com",
    ),
    null,
  );
});

Deno.test("sanitizeEmail rejects consecutive dots", () => {
  assertEquals(sanitizeEmail("foo..bar@gmail.com"), null);
});

Deno.test("sanitizeEmail trims and lowercases valid", () => {
  assertEquals(sanitizeEmail("  Foo@Bar.COM  "), "foo@bar.com");
});

Deno.test("sanitizeEmail rejects missing dot in domain", () => {
  assertEquals(sanitizeEmail("foo@bar"), null);
});

Deno.test("sanitizeEmail rejects internal whitespace", () => {
  assertEquals(sanitizeEmail("foo @bar.com"), null);
});

Deno.test("sanitizePhone rejects fully repeated block", () => {
  assertEquals(sanitizePhone("925230258925230258"), null);
});

Deno.test("sanitizePhone normalises with +", () => {
  assertEquals(sanitizePhone("+351 925 230 258"), "+351925230258");
});

Deno.test("sanitizePhone rejects too short", () => {
  assertEquals(sanitizePhone("12345"), null);
});

Deno.test("sanitizePhone rejects all zeros", () => {
  assertEquals(sanitizePhone("00000000"), null);
});

Deno.test("sanitizeText collapses spaces and trims", () => {
  assertEquals(sanitizeText("  hello    world  "), "hello world");
});

Deno.test("dedupArray preserves order", () => {
  assertEquals(dedupArray(["Casa de Banho", "Casa de Banho", "Cozinha"]), [
    "Casa de Banho",
    "Cozinha",
  ]);
});

Deno.test("sanitizeFieldValues handles Efigenia payload", () => {
  const input = {
    po_email:
      "Efigenia.jose.martins@gmail.com.jose.martins@gmail.com.jose.martins@gmail.com",
    po_telefone: "+351 925 230 258",
    po_nome: "Efigénia  ",
    po_apelido: "Martins ",
    po_area_remodelar: ["Casa de Banho", "Casa de Banho"],
    po_codigo_postal: "2840-000 ",
  };
  const { cleaned, report } = sanitizeFieldValues(input, {
    email: "po_email",
    phone: "po_telefone",
    first_name: "po_nome",
    last_name: "po_apelido",
  });
  assertEquals(cleaned.po_email, null);
  assertEquals(cleaned.po_telefone, "+351925230258");
  assertEquals(cleaned.po_nome, "Efigénia");
  assertEquals(cleaned.po_apelido, "Martins");
  assertEquals(cleaned.po_area_remodelar, ["Casa de Banho"]);
  assertEquals(cleaned.po_codigo_postal, "2840-000");
  assertEquals(report.email_rejected !== undefined, true);
  assertEquals(report.arrays_deduped.includes("po_area_remodelar"), true);
});

Deno.test("sanitizeFieldValues preserves _meta", () => {
  const meta = { current_step: 2, tracking: { utm_source: "google" } };
  const { cleaned } = sanitizeFieldValues({ _meta: meta, foo: "bar" });
  assertEquals(cleaned._meta, meta);
});
