// O que o guia mostra da pessoa: os factos da lista da fase, o cartão do cliente e os últimos acontecimentos (só dados reais, nada inventado).
import { describe, expect, it } from "vitest";
import { acontecimentosDoGuia, clienteDoGuia, dadosDoGuia } from "./guiaDados";
import { contactoBase, levantamentoBase, pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import type { ItemAtividade } from "./pessoasTipos";

const t = (chave: string): string => ({ "pessoasPagina.activity.type.chamada": "Chamada", "pessoasPagina.activity.type.historico": "Histórico", "pessoasPagina.x": "Pedido pelo site" })[chave] ?? chave;

describe("dadosDoGuia", () => {
  it("conta so o que existe: contacto por telefone ou email, origem por campanha ou formulario", () => {
    const vazio = dadosDoGuia(pessoaBase("a", { nome: "  ", contacto: { telefone: null, email: null } }), { contactos: [], visitas: [], levantamentos: [] });
    expect(vazio).toMatchObject({ nome: "  ", temContacto: false, temOrigem: false, chamadas: 0, visitasAtivas: 0, levantamentos: 0 });
    const email = dadosDoGuia(pessoaBase("a", { contacto: { telefone: null, email: "a@b.pt" }, campanha: "Verão" }), { contactos: [], visitas: [], levantamentos: [] });
    expect(email).toMatchObject({ temContacto: true, temOrigem: true });
    expect(dadosDoGuia(pessoaBase("a", { formulario: "Site" }), { contactos: [], visitas: [], levantamentos: [] }).temOrigem).toBe(true);
  });

  it("as visitas canceladas nao contam e os registos sao contados", () => {
    const d = dadosDoGuia(pessoaBase("a"), {
      contactos: [contactoBase("c1"), contactoBase("c2")],
      visitas: [visitaPessoaBase("v1"), visitaPessoaBase("v2", { estado: "cancelada" })],
      levantamentos: [levantamentoBase("l1")],
    });
    expect(d).toMatchObject({ chamadas: 2, visitasAtivas: 1, levantamentos: 1 });
  });
});

describe("clienteDoGuia", () => {
  it("usa a morada da pessoa (rua, codigo postal e localidade) e a localidade para o cabecalho", () => {
    const c = clienteDoGuia(pessoaBase("a", { contacto: { telefone: "927 118 300", email: "p@x.pt" }, morada: { linha: "Rua A 1", cp: "2700-001", localidade: "Amadora" } }), "WC social");
    expect(c.cliente).toEqual({ telefone: "927 118 300", email: "p@x.pt", morada: "Rua A 1, 2700-001 Amadora", linha: "WC social" });
    expect(c.local).toBe("Amadora");
  });

  it("sem morada ou servico fica a null (o cartao diz «Por preencher»)", () => {
    const c = clienteDoGuia(pessoaBase("a"), null);
    expect(c.cliente).toEqual({ telefone: null, email: null, morada: null, linha: null });
    expect(c.local).toBeNull();
  });
});

describe("acontecimentosDoGuia", () => {
  const item = (id: string, quando: string, extra: Partial<ItemAtividade> = {}): ItemAtividade => ({
    id, pessoaId: "a", tipo: "historico", titulo: "Pedido", detalhe: "", quando, exemplo: false, ...extra,
  });

  it("mostra os 5 mais recentes, do mais recente para o mais antigo, com o dia formatado", () => {
    const itens = ["2026-10-01", "2026-10-06", "2026-10-03", "2026-10-05", "2026-10-02", "2026-10-04"].map((d, i) => item(`i${i}`, d));
    const r = acontecimentosDoGuia(t, itens);
    expect(r).toHaveLength(5);
    expect(r.map((a) => a.quando)).toEqual(["06/10/2026", "05/10/2026", "04/10/2026", "03/10/2026", "02/10/2026"]);
  });

  it("traduz a chave do titulo quando existe e usa o texto escrito quando nao", () => {
    const r = acontecimentosDoGuia(t, [item("a", "2026-10-06", { chaveTitulo: "pessoasPagina.x" }), item("b", "2026-10-05", { tipo: "chamada", titulo: "Atendeu" })]);
    expect(r[0].texto).toBe("Histórico · Pedido pelo site");
    expect(r[1].texto).toBe("Chamada · Atendeu");
  });

  it("sem atividade devolve uma lista vazia", () => {
    expect(acontecimentosDoGuia(t, [])).toEqual([]);
  });
});
