import { describe, expect, it } from "vitest";
import { isPortugueseNif, REDACTED, scrubMessageText } from "../scrubMessage";

const CUSTOMER_EMAIL = "joao@exemplo.pt";

describe("Postgres constraint violations (rigid format)", () => {
  it("redacts the key value but keeps the constraint and the column name", () => {
    const message =
      'duplicate key value violates unique constraint "clients_email_key"\n' +
      `Key (email)=(${CUSTOMER_EMAIL}) already exists.`;

    const scrubbed = scrubMessageText(message);

    expect(scrubbed).not.toContain(CUSTOMER_EMAIL);
    expect(scrubbed).not.toContain("exemplo.pt");
    // What a developer needs to act on the issue survives intact.
    expect(scrubbed).toContain('unique constraint "clients_email_key"');
    expect(scrubbed).toContain(`Key (email)=(${REDACTED}) already exists.`);
  });

  it("keeps every column of a composite key", () => {
    const scrubbed = scrubMessageText(
      `Key (organization_id, email)=(0f8e-uuid, ${CUSTOMER_EMAIL}) already exists.`
    );

    expect(scrubbed).toBe(`Key (organization_id, email)=(${REDACTED}) already exists.`);
  });

  it("redacts the value of a foreign-key violation detail", () => {
    const scrubbed = scrubMessageText(
      'insert or update on table "proposals" violates foreign key constraint "proposals_client_id_fkey"\n' +
        'Key (client_id)=(9d3f2b1a-0000-4000-8000-000000000000) is not present in table "clients".'
    );

    expect(scrubbed).toContain('foreign key constraint "proposals_client_id_fkey"');
    expect(scrubbed).toContain(`Key (client_id)=(${REDACTED}) is not present in table "clients".`);
    expect(scrubbed).not.toContain("9d3f2b1a");
  });

  it("drops the whole row of a `Failing row contains` detail", () => {
    const scrubbed = scrubMessageText(
      'new row for relation "leads" violates check constraint "leads_status_check"\n' +
        `Failing row contains (1, Joao Silva, ${CUSTOMER_EMAIL}, 912345678, invalido).`
    );

    expect(scrubbed).toContain('check constraint "leads_status_check"');
    expect(scrubbed).toContain(`Failing row contains (${REDACTED}).`);
    expect(scrubbed).not.toContain("Joao Silva");
    expect(scrubbed).not.toContain(CUSTOMER_EMAIL);
    expect(scrubbed).not.toContain("912345678");
  });

  it("strips the query string of a URL quoted in the message", () => {
    const scrubbed = scrubMessageText(
      `Failed to load https://abc.supabase.co/rest/v1/clients?email=eq.${encodeURIComponent(CUSTOMER_EMAIL)}&select=* (500)`
    );

    expect(scrubbed).not.toContain("exemplo.pt");
    expect(scrubbed).toContain("https://abc.supabase.co/rest/v1/clients");
    expect(scrubbed).toContain("(500)");
  });
});

describe("free-text patterns", () => {
  it("redacts an email embedded in prose", () => {
    expect(scrubMessageText(`Não foi possível enviar para ${CUSTOMER_EMAIL} (SMTP 550)`)).toBe(
      `Não foi possível enviar para ${REDACTED} (SMTP 550)`
    );
  });

  it("redacts an IBAN", () => {
    const scrubbed = scrubMessageText("Pagamento recusado para PT50000201231234567890154");
    expect(scrubbed).toBe(`Pagamento recusado para ${REDACTED}`);
  });

  it("redacts a NIF that passes the check digit", () => {
    expect(isPortugueseNif("501442600")).toBe(true);
    expect(scrubMessageText("NIF 501442600 inválido para faturação")).toBe(
      `NIF ${REDACTED} inválido para faturação`
    );
  });

  it("leaves a 9-digit run that is not a valid NIF alone", () => {
    // The deliberate trade-off: bare 9-digit numbers (ids, counters, phone
    // numbers) are not redacted unless the NIF checksum says so.
    expect(isPortugueseNif("123456780")).toBe(false);
    expect(scrubMessageText("job 123456780 timed out")).toBe("job 123456780 timed out");
  });

  it("does not touch numbers that are longer or shorter than nine digits", () => {
    const message = "retry after 1500 ms, batch 12345678901 of 42";
    expect(scrubMessageText(message)).toBe(message);
  });
});

describe("messages that must survive untouched", () => {
  const untouched = [
    "x.map is not a function",
    "Cannot read properties of undefined (reading 'id')",
    'relation "public.anew_users" does not exist',
    "JWT expired",
    "new row violates row-level security policy for table \"proposals\"",
    "invalid input syntax for type uuid: \"abc\"",
    "Maximum update depth exceeded. This can happen when a component calls setState inside useEffect.",
    "Failed to fetch dynamically imported module: /assets/Quotes-x.js",
    "TypeError: Converting circular structure to JSON",
    "column proposals.valor does not exist",
  ];

  it.each(untouched)("leaves %s exactly as it is", (message) => {
    expect(scrubMessageText(message)).toBe(message);
  });

  it("returns the empty string unchanged", () => {
    expect(scrubMessageText("")).toBe("");
  });
});
