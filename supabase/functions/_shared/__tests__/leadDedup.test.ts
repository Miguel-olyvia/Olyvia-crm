import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyDedupOutcome, type DedupCandidate, type DedupSubmission } from "../leadDedup.ts";

// NOTA SOBRE A ASSINATURA
//
// A proposta do pedido tinha `candidatos` como uma lista já resolvida
// entidade-a-entidade (um "match" por linha). Mas a função tem de ser PURA e
// decidir ela própria os 8 casos -- incluindo o 06 CONFLITO, que só existe
// quando o email aponta para uma entidade e o telefone para OUTRA. Para isso
// a função precisa de saber, por candidato, TODOS os emails e telefones que
// lhe pertencem (uma entidade pode ter mais do que um de cada), e comparar
// contra o que veio na submissão. Por isso `candidatos` é:
//
//   type DedupCandidate = { entityId: string; emails: string[]; phones: string[] }
//
// e a submissão (email/telefone que chegaram no formulário) é:
//
//   type DedupSubmission = { email?: string | null; phone?: string | null }
//
// `candidatos` já vem filtrado por organização (anew_entity_org_links) e sem
// utilizadores internos (anew_users.registration_origin = 'invited') --
// quem chama a função é que faz essas queries; classifyDedupOutcome não
// acede à base de dados.
//
// Segue-se o padrão dos ficheiros irmãos deste directório
// (`_shared/nifCrypto.test.ts`, `_shared/cors.test.ts`,
// `_shared/orgScopedQuery.test.ts`): Deno.test + `assert` do std, porque
// `vitest.config.ts` só inclui `src/**/*.{test,spec}.{ts,tsx}` -- ficheiros
// de Edge Functions (supabase/functions/**) nunca são vistos pelo vitest.
// Corre-se com `deno test`.

function candidato(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    entityId: "entity-1",
    emails: [],
    phones: [],
    ...overrides,
  };
}

Deno.test("01 MATCH_FORTE: email e telefone batem na mesma entidade", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "ana@example.com", phone: "910000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_FORTE",
    entityId: "e1",
  });
});

Deno.test("02 MATCH_EMAIL: só o email bate (sem telefone na submissão)", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "ana@example.com", phone: null };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_EMAIL",
    entityId: "e1",
  });
});

Deno.test("03 MATCH_EMAIL: email bate, telefone submetido é diferente do da ficha -> novoTelefone assinalado", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "ana@example.com", phone: "920000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_EMAIL",
    entityId: "e1",
    novoTelefone: "920000000",
  });
});

Deno.test("04 MATCH_TELEFONE: só o telefone bate (sem email na submissão)", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: null, phone: "910000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_TELEFONE",
    entityId: "e1",
  });
});

Deno.test("05 MATCH_TELEFONE: telefone bate, email submetido é diferente do da ficha -> novoEmail assinalado", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "outro@example.com", phone: "910000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_TELEFONE",
    entityId: "e1",
    novoEmail: "outro@example.com",
  });
});

Deno.test("06 CONFLITO: o email aponta para uma entidade e o telefone para outra", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e-email", emails: ["ana@example.com"], phones: [] }),
    candidato({ entityId: "e-telefone", emails: [], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "ana@example.com", phone: "910000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "CONFLITO",
    entityIdEmail: "e-email",
    entityIdTelefone: "e-telefone",
  });
});

Deno.test("07 SEM_MATCH: lista de candidatos vazia mas a submissão é verificável", () => {
  const submissao: DedupSubmission = { email: "novo@example.com", phone: "911111111" };

  assertEquals(classifyDedupOutcome([], submissao), { kind: "SEM_MATCH" });
});

Deno.test("07 SEM_MATCH: há candidatos na organização mas nenhum bate", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["outra@example.com"], phones: ["933333333"] }),
  ];
  const submissao: DedupSubmission = { email: "novo@example.com", phone: "911111111" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), { kind: "SEM_MATCH" });
});

Deno.test("08 NAO_VERIFICAVEL: a submissão não tem email nem telefone", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: null, phone: null };

  assertEquals(classifyDedupOutcome(candidatos, submissao), { kind: "NAO_VERIFICAVEL" });
});

Deno.test("08 NAO_VERIFICAVEL: mesmo sem candidatos nenhuns", () => {
  assertEquals(classifyDedupOutcome([], { email: undefined, phone: undefined }), {
    kind: "NAO_VERIFICAVEL",
  });
});

Deno.test("trata email vazio/espaços como ausente", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "   ", phone: "910000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_TELEFONE",
    entityId: "e1",
  });
});

Deno.test("trata email placeholder comum como ausente (não conta como dado real)", () => {
  // Formulários públicos às vezes têm o campo email preenchido com um valor
  // que não é um email real (autofill agressivo, copy-paste errado). "n/a",
  // "-", "sem email" não têm "@" e não devem contar como dado verificável.
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: [], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "n/a", phone: "910000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_TELEFONE",
    entityId: "e1",
  });
});

Deno.test("email não bate por não ter '@' -- não é tratado como texto igual a nada", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: [] }),
  ];
  const submissao: DedupSubmission = { email: "n/a", phone: null };

  assertEquals(classifyDedupOutcome(candidatos, submissao), { kind: "NAO_VERIFICAVEL" });
});

Deno.test("email compara em minúsculas e sem espaços à volta", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: [] }),
  ];
  const submissao: DedupSubmission = { email: "  ANA@EXAMPLE.COM  ", phone: null };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_EMAIL",
    entityId: "e1",
  });
});

Deno.test("telefone com +351, espaços e traços bate pelos últimos 9 dígitos", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: [], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: null, phone: "+351 91 000-0000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_TELEFONE",
    entityId: "e1",
  });
});

Deno.test("telefone da ficha também vem formatado (+351, espaços) -- normaliza dos dois lados", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: [], phones: ["+351 910 000 000"] }),
  ];
  const submissao: DedupSubmission = { email: null, phone: "910000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_TELEFONE",
    entityId: "e1",
  });
});

Deno.test("telefone demasiado curto (menos de 7 dígitos úteis) não conta como verificável", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: [], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: null, phone: "12345" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), { kind: "NAO_VERIFICAVEL" });
});

Deno.test("email bate em mais do que um dos emails da mesma entidade -> continua MATCH_FORTE (não duplica)", () => {
  const candidatos: DedupCandidate[] = [
    candidato({
      entityId: "e1",
      emails: ["antigo@example.com", "ana@example.com"],
      phones: ["910000000", "920000000"],
    }),
  ];
  const submissao: DedupSubmission = { email: "ana@example.com", phone: "920000000" };

  assertEquals(classifyDedupOutcome(candidatos, submissao), {
    kind: "MATCH_FORTE",
    entityId: "e1",
  });
});

Deno.test("email e telefone batem em entidades diferentes mas o telefone também está numa terceira entidade -- CONFLITO usa uma das entidades de telefone encontradas", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e-email", emails: ["ana@example.com"], phones: [] }),
    candidato({ entityId: "e-telefone-1", emails: [], phones: ["910000000"] }),
    candidato({ entityId: "e-telefone-2", emails: [], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "ana@example.com", phone: "910000000" };

  const result = classifyDedupOutcome(candidatos, submissao);
  assertEquals(result.kind, "CONFLITO");
  if (result.kind === "CONFLITO") {
    assertEquals(result.entityIdEmail, "e-email");
    assertEquals(["e-telefone-1", "e-telefone-2"].includes(result.entityIdTelefone), true);
  }
});

Deno.test("não muta a lista de candidatos nem a submissão recebidas", () => {
  const candidatos: DedupCandidate[] = [
    candidato({ entityId: "e1", emails: ["ana@example.com"], phones: ["910000000"] }),
  ];
  const submissao: DedupSubmission = { email: "ana@example.com", phone: "910000000" };
  const candidatosCopia = JSON.parse(JSON.stringify(candidatos));
  const submissaoCopia = JSON.parse(JSON.stringify(submissao));

  classifyDedupOutcome(candidatos, submissao);

  assertEquals(candidatos, candidatosCopia);
  assertEquals(submissao, submissaoCopia);
});
