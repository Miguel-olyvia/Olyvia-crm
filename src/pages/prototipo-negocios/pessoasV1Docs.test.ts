import { describe, expect, it } from "vitest";
import { aberto, seed } from "./motor";
import { docFase } from "./negociosApp";
import { clientesApp, leadsApp, perdidasApp } from "./pessoasDocs";
import { COLUNAS_V1, colunasV1, contagensV1, fichaV1, foraDoQuadro, listaV1, pessoaV1, valorAlternativas } from "./pessoasV1Docs";

describe("Pessoas no V1 (proposta de 16/10)", () => {
  const S = seed();

  it("três grupos: em curso (leads e clientes com negócio novo), clientes e perdidas", () => {
    const n = contagensV1(S);
    expect(n.curso).toBe(leadsApp(S).length + clientesApp(S).filter((p) => p.novoNegocio).length);
    expect(n.clientes).toBe(clientesApp(S).length);
    expect(n.perdidas).toBe(perdidasApp(S).length);
    expect(listaV1(S, "curso")).toHaveLength(n.curso);
  });

  it("a pesquisa procura nos três grupos, cada pessoa uma só vez", () => {
    const alguem = clientesApp(S)[0];
    const r = listaV1(S, "perdidas", alguem.nome.slice(0, 5));
    expect(r.some((l) => l.nome === alguem.nome)).toBe(true);
    expect(new Set(r.map((l) => l.nome)).size).toBe(r.length);
  });

  it("cada linha diz o que fazer a seguir", () => {
    for (const l of listaV1(S, "curso")) expect(l.proximo.length).toBeGreaterThan(0);
    for (const l of listaV1(S, "perdidas")) expect(l.proximo).toMatch(/^Perdida/);
  });

  it("a ficha tem no máximo um botão, e só para quem faz o passo", () => {
    for (const p of [...leadsApp(S), ...clientesApp(S)]) {
      const f = fichaV1(S, p);
      if (f.agora.btn) { expect(f.agora.de).toBeUndefined(); expect(f.agora.id).not.toBeNull(); }
      expect(f.negocios.length).toBeGreaterThan(0);
    }
  });

  it("uma pessoa perdida não tem próximo passo", () => {
    const p = perdidasApp(S)[0];
    if (!p) return;
    const f = fichaV1(S, p);
    expect(f.agora.btn).toBeUndefined();
    expect(f.agora.id).toBeNull();
  });

  it("os negócios de exemplo não abrem (não têm página)", () => {
    for (const p of [...leadsApp(S), ...clientesApp(S)]) {
      for (const n of fichaV1(S, p).negocios) if (n.abre !== null) expect(S.deals.some((d) => d.id === n.abre)).toBe(true);
    }
  });

  it("pessoaV1 encontra pelo nome", () => {
    const p = leadsApp(S)[0];
    expect(pessoaV1(S, p.nome)?.nome).toBe(p.nome);
    expect(pessoaV1(S, "Ninguém com este nome")).toBeUndefined();
  });
});

describe("valor de orçamentos alternativos (decisão de 13/10: não se somam)", () => {
  it("um só dá o valor; vários dão o intervalo; nenhum diz que ainda não há", () => {
    expect(valorAlternativas({ orcamentos: [{ id: "a", titulo: "A", valor: 1000 }] })).toMatch(/^1\.?000,00 €$/);
    expect(valorAlternativas({ orcamentos: [{ id: "a", titulo: "A", valor: 3000 }, { id: "b", titulo: "B", valor: 1000 }] })).toMatch(/1\.?000,00 € a 3\.?000,00 €/);
    expect(valorAlternativas({ orcamentos: [] })).toBe("Sem valor ainda");
  });
});

describe("Negócios por documento no V1", () => {
  const S = seed();
  it("quatro colunas, do orçamento ao pagamento; cada negócio numa só", () => {
    const c = colunasV1(S);
    expect(COLUNAS_V1.map((x) => x.id)).toEqual(["orcamento", "proposta", "contrato", "financeiro"]);
    const dentro = COLUNAS_V1.flatMap((x) => c[x.id]);
    expect(dentro.length).toBe(aberto(S).filter((d) => docFase(d) !== null).length);
    expect(new Set(dentro.map((d) => d.id)).size).toBe(dentro.length);
  });
  it("os que ficam fora estão contados (antes em Pessoas, depois em obra)", () => {
    const f = foraDoQuadro(S), dentro = COLUNAS_V1.reduce((a, x) => a + colunasV1(S)[x.id].length, 0);
    expect(f.antes + f.obra + dentro).toBe(aberto(S).length);
  });
});
