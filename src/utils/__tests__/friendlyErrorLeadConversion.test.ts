import { describe, it, expect } from "vitest";
import { mapFriendlyErrorText } from "../friendlyError";

/**
 * Uma lead que já gerou cliente tem de ficar em "convertida": a restrição
 * `anew_leads_conversao_coerente` recusa qualquer outro estado. Quem arrastasse
 * a lead para outra coluna apanhava a recusa em cru, em inglês e a falar de
 * tabelas e restrições.
 */
describe("recusa de mudar o estado de uma lead já convertida", () => {
  // A mensagem tal como o Postgres a devolve.
  const recusaDaBase =
    'new row for relation "anew_leads" violates check constraint "anew_leads_conversao_coerente"';

  it("explica em linguagem de quem usa a aplicação, sem falar da base de dados", () => {
    const texto = mapFriendlyErrorText(recusaDaBase);
    expect(texto).not.toBe(recusaDaBase);
    expect(texto).not.toMatch(/constraint|relation|anew_leads/i);
  });

  it("diz porquê e o que fazer a seguir", () => {
    const texto = mapFriendlyErrorText(recusaDaBase);
    expect(texto).toMatch(/convert/i);
    expect(texto).toMatch(/revert/i);
  });

  it("não engole outros erros da mesma tabela", () => {
    const outro = 'null value in column "name" of relation "anew_leads" violates not-null constraint';
    expect(mapFriendlyErrorText(outro)).not.toMatch(/revert/i);
  });
});
