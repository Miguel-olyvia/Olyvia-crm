// A lista de propostas (Proposals.tsx) usa uma lista EXPLÍCITA de colunas. Sem `language` nela, o chip «PT · EN»
// nunca aparece e o idioma gravado não chega à ficha. A página não se monta em testes (4 000+ linhas), por isso
// lê-se a constante PROPOSALS_LIST_SELECT do código-fonte e confere-se a lista de colunas de primeiro nível.
import { describe, expect, it } from "vitest";
import fonte from "../Proposals.tsx?raw";

function lerSelect(): string[] {
  const m = fonte.match(/const PROPOSALS_LIST_SELECT =([\s\S]*?);\r?\n/);
  if (!m) throw new Error("PROPOSALS_LIST_SELECT não encontrada");
  const texto = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join("");
  // Só o primeiro nível (as relações pedidas entre parênteses não contam).
  let nivel = 0;
  let atual = "";
  const colunas: string[] = [];
  for (const ch of texto) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      colunas.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  colunas.push(atual.trim());
  return colunas;
}

describe("PROPOSALS_LIST_SELECT", () => {
  it("pede a coluna language (uma só vez)", () => {
    expect(lerSelect().filter((c) => c === "language")).toHaveLength(1);
  });

  it("continua a NÃO trazer os snapshots pesados", () => {
    const colunas = lerSelect();
    for (const pesada of ["published_snapshot", "decided_snapshot", "template_snapshot"]) expect(colunas).not.toContain(pesada);
  });

  it("não perdeu colunas que já pedia", () => {
    const colunas = lerSelect();
    for (const c of ["id", "title", "template_id", "proposal_number", "decided_published_at"]) expect(colunas).toContain(c);
  });
});
