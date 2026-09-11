import { describe, it, expect } from "vitest";
import { proposalTitleFromTemplate } from "../proposalTitleFromTemplate";

// O que se testa: quando escolher um template preenche o titulo, e quando NAO
// deve tocar-lhe. A regra que interessa e nunca apagar o que a pessoa escreveu.

const A = { id: "a", name: "Proposta Venda de Materiais" };
const B = { id: "b", name: "Remodelacoes" };

describe("titulo da proposta a partir do template", () => {
  it("titulo vazio: passa a ser o nome do template", () => {
    expect(proposalTitleFromTemplate("", undefined, A)).toBe(A.name);
  });

  it("titulo so com espacos conta como vazio", () => {
    expect(proposalTitleFromTemplate("   ", undefined, A)).toBe(A.name);
  });

  it("titulo escrito a mao NAO e substituido", () => {
    expect(proposalTitleFromTemplate("Obra da Ana", undefined, A)).toBe("Obra da Ana");
  });

  it("titulo escrito a mao NAO e substituido mesmo havendo template anterior", () => {
    expect(proposalTitleFromTemplate("Obra da Ana", A, B)).toBe("Obra da Ana");
  });

  it("trocar de template actualiza, quando o titulo ainda era o do anterior", () => {
    expect(proposalTitleFromTemplate(A.name, A, B)).toBe(B.name);
  });

  it("tirar o template (Nenhum) mantem o titulo que la esta", () => {
    expect(proposalTitleFromTemplate(A.name, A, undefined)).toBe(A.name);
  });

  it("sem template escolhido e sem titulo, continua vazio", () => {
    expect(proposalTitleFromTemplate("", undefined, undefined)).toBe("");
  });
});
