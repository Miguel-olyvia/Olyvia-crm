/**
 * client-portal-action — guarda anti-divergência do espelho.
 *
 * Os testes de `index.test.ts` correm contra `portalGuards.mirror.ts`, uma
 * transcrição literal dos helpers que vivem dentro do `serve()` de
 * `index.ts` (que, por serem closures sobre `supabase`/`user`, não são
 * importáveis — ver o cabeçalho do espelho para a justificação da escolha).
 *
 * A fraqueza óbvia de testar um espelho é ele calar-se quando o original
 * muda. É isso que este ficheiro resolve: lê os dois ficheiros em bruto e
 * compara, bloco a bloco, o texto normalizado de cada helper. Se alguém
 * editar `assertOwnership`, `consumeVerifiedOtp`, `sanitizeReason`,
 * `stripCosts`, `resolveDocEntity` ou `SENSITIVE_LINE_COLUMNS` em
 * `index.ts` sem reflectir a alteração no espelho, o CI falha aqui.
 *
 * ── Se este teste falhar ────────────────────────────────────────────────
 * NÃO alteres o espelho às cegas para o silenciar. A falha quer dizer que a
 * guarda de segurança mudou. O caminho certo é:
 *   1. copiar o bloco novo de `index.ts` para `portalGuards.mirror.ts`;
 *   2. correr `index.test.ts` e ver que comportamento mudou;
 *   3. actualizar/acrescentar os testes de comportamento em conformidade.
 *
 * A normalização ignora indentação e linhas em branco, e nada mais: uma
 * alteração de lógica, de nome de coluna ou de filtro é sempre apanhada.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const indexSource = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
const mirrorSource = Deno.readTextFileSync(new URL("./portalGuards.mirror.ts", import.meta.url));

/**
 * Extrai um bloco de código a partir de um marcador, equilibrando
 * delimitadores. A fase 1 salta a assinatura (incluindo chavetas que
 * apareçam dentro do tipo de retorno, ex.: `Promise<{ ok: boolean }>`);
 * a fase 2 equilibra o corpo.
 */
function extractBlock(
  source: string,
  marker: string,
  open: "{" | "[",
  close: "}" | "]",
): string {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Marcador não encontrado no ficheiro: ${marker}`);
  if (source.indexOf(marker, start + 1) !== -1) {
    throw new Error(`Marcador ambíguo (aparece mais do que uma vez): ${marker}`);
  }

  // Fase 1 — localizar o início do corpo.
  let parenDepth = 0;
  let angleDepth = 0;
  let bodyStart = -1;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];
    if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "<") angleDepth += 1;
    else if (ch === ">" && prev !== "=") angleDepth -= 1;
    else if (ch === open && parenDepth === 0 && angleDepth === 0) {
      bodyStart = i;
      break;
    }
  }
  if (bodyStart === -1) throw new Error(`Início de bloco não encontrado para: ${marker}`);

  // Fase 2 — equilibrar o corpo.
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Bloco não fechado para: ${marker}`);
}

/** Ignora indentação e linhas em branco — e nada mais. */
function normalize(block: string): string {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function assertNoDrift(
  name: string,
  marker: string,
  open: "{" | "[" = "{",
  close: "}" | "]" = "}",
) {
  const fromIndex = normalize(extractBlock(indexSource, marker, open, close));
  const fromMirror = normalize(extractBlock(mirrorSource, marker, open, close));
  assertEquals(
    fromMirror,
    fromIndex,
    `\n\n❌ ${name} divergiu entre index.ts e portalGuards.mirror.ts.\n` +
      `   A guarda de segurança mudou e os testes deixaram de a reflectir.\n` +
      `   Copia o bloco novo para o espelho e revê os testes de index.test.ts\n` +
      `   ANTES de silenciar esta falha.\n`,
  );
}

Deno.test("sem divergência: resolveDocEntity", () => {
  assertNoDrift("resolveDocEntity", "async function resolveDocEntity(");
});

Deno.test("sem divergência: assertOwnership (guarda IDOR)", () => {
  assertNoDrift("assertOwnership", "async function assertOwnership(");
});

Deno.test("sem divergência: consumeVerifiedOtp (uso único do OTP)", () => {
  assertNoDrift("consumeVerifiedOtp", "async function consumeVerifiedOtp(");
});

Deno.test("sem divergência: sanitizeReason", () => {
  assertNoDrift("sanitizeReason", "function sanitizeReason(");
});

Deno.test("sem divergência: SENSITIVE_LINE_COLUMNS", () => {
  assertNoDrift("SENSITIVE_LINE_COLUMNS", "const SENSITIVE_LINE_COLUMNS = [", "[", "]");
});

Deno.test("sem divergência: stripCosts", () => {
  assertNoDrift("stripCosts", "const stripCosts = (");
});

/**
 * O espelho existe só para os testes. Se um dia alguém o importar a partir
 * do código de produção, a extracção passa a ser real e estes testes de
 * divergência deixam de fazer sentido (passam a ser redundantes ou, pior,
 * enganadores). Este teste obriga essa conversa a acontecer.
 */
Deno.test("index.ts não importa o espelho (o espelho é só para testes)", () => {
  assertEquals(
    indexSource.includes("portalGuards.mirror"),
    false,
    "index.ts passou a importar o espelho — nesse caso extrai os helpers a sério e apaga estes testes de divergência.",
  );
});
