// 26/11: a base de conhecimento da Olyvia (o chat e a voz leem-na de qualquer página): o guia, o resumo do dia, os negócios e as obras.
import { describe, expect, it, vi } from "vitest";
import { obraDeExemplo } from "./estudioObra/exemploObra";
import { GUIA, gravarConhecimento, itensDoConhecimento } from "./conhecimentoOlyvia";

describe("a base de conhecimento", () => {
  it("tem o guia, um item por negócio, um por obra em curso ou aprovada e o resumo do dia", () => {
    const { S, d } = obraDeExemplo();
    const L = itensDoConhecimento(S, new Date(2026, 10, 26, 10, 0));
    expect(L.filter((x) => x.tipo === "guia")).toHaveLength(GUIA.length);
    expect(L.filter((x) => x.tipo === "negocio")).toHaveLength(S.deals.length);
    const obra = L.find((x) => x.chave === `obra:${d.id}`)!;
    expect(obra).toMatchObject({ tipo: "obra", numero: d.id });
    expect(obra.texto).toMatch(new RegExp(`^Obra ${d.id} de ${d.nome}: em curso`));
    expect(obra.texto).toMatch(/Os agentes propõem: .*Plano/);
    expect(obra.texto).toMatch(/A seguir: /);
    const neg = L.find((x) => x.chave === `negocio:${d.id}`)!;
    expect(neg.texto).toMatch(/fase Obra/);
    expect(neg.texto).toMatch(/proposta de [\d\s.]+,\d{2} € com IVA/);
    const r = L.find((x) => x.tipo === "resumo")!;
    expect(r.texto).toMatch(/^Às 10:00: /);
    expect(r.texto).toMatch(/Hoje os agentes ainda não fizeram nada sozinhos\./);
    // as chaves são únicas (a tabela tem a chave por organização)
    expect(new Set(L.map((x) => x.chave)).size).toBe(L.length);
  });
  it("o guia explica os degraus, o ajuste e a voz (o que se pergunta «como funciona»)", () => {
    const t = GUIA.map((x) => x.texto).join(" ");
    expect(t).toMatch(/2 aplica sozinho ao fim do dia útil/);
    expect(t).toMatch(/nunca empurra o fim da obra/);
    expect(t).toMatch(/resumo do dia/);
  });
  it("grava pela função da base, com a organização e tudo de uma vez", async () => {
    const rpc = vi.fn(async () => ({ data: 3, error: null }));
    expect(await gravarConhecimento({ rpc } as never, "org-1", GUIA.slice(0, 3))).toBe(3);
    expect(rpc).toHaveBeenCalledWith("olyvia_conhecimento_gravar", { p_org: "org-1", p_itens: GUIA.slice(0, 3), p_completo: true });
    const falha = vi.fn(async () => ({ data: null, error: { message: "Sem permissão" } }));
    await expect(gravarConhecimento({ rpc: falha } as never, "org-1", [])).rejects.toThrow("Sem permissão");
  });
});
