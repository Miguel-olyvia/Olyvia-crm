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

describe("dadosDoGuia: o que ficou registado em cada passo (so factos do ecra)", () => {
  const tr = (chave: string): string => ({ "pessoasPagina.result.atendeuInteressado": "Atendeu · interessado" })[chave] ?? chave;
  const vazios = { contactos: [], visitas: [], levantamentos: [] };

  it("sem tradutor nao ha detalhes", () => {
    expect(dadosDoGuia(pessoaBase("a", { nome: "Paulo" }), vazios).detalhes).toBeUndefined();
  });

  it("quem pede, contacto e origem saem da ficha; o que falta nao aparece", () => {
    const d = dadosDoGuia(pessoaBase("a", { nome: "Paulo Nogueira", contacto: { telefone: "912 000 000", email: "p@x.pt" }, campanha: "Verão", formulario: "Site" }), vazios, tr);
    expect(d.detalhes).toEqual({ quemPede: "Paulo Nogueira", contacto: "912 000 000 · p@x.pt", origem: "Verão · Site" });
    const so = dadosDoGuia(pessoaBase("a", { nome: "Ana", contacto: { telefone: null, email: "a@b.pt" } }), vazios, tr);
    expect(so.detalhes).toEqual({ quemPede: "Ana", contacto: "a@b.pt" });
  });

  it("a chamada e a mais recente, com o resultado e o dia", () => {
    const d = dadosDoGuia(pessoaBase("a"), {
      ...vazios,
      contactos: [contactoBase("c1", { data: "2026-10-10", resultado: "naoAtendeu" }), contactoBase("c2", { data: "2026-10-25", resultado: "atendeuInteressado" })],
    }, tr);
    expect(d.detalhes?.chamada).toBe("Atendeu · interessado · 25/10/2026");
  });

  it("uma chamada sem resultado conhecido mostra so o dia", () => {
    const d = dadosDoGuia(pessoaBase("a"), { ...vazios, contactos: [contactoBase("c1", { data: "2026-10-25", resultado: null })] }, tr);
    expect(d.detalhes?.chamada).toBe("25/10/2026");
  });

  it("a visita marcada e a mais proxima nao cancelada, com o dia e a hora; as canceladas nao contam", () => {
    const d = dadosDoGuia(pessoaBase("a"), {
      ...vazios,
      visitas: [visitaPessoaBase("v1", { data: "2026-10-30", hora: "14:30" }), visitaPessoaBase("v2", { data: "2026-11-02", estado: "cancelada" })],
    }, tr);
    expect(d.detalhes?.visitaMarcada).toBe("30/10/2026 · 14:30");
    const semHora = dadosDoGuia(pessoaBase("a"), { ...vazios, visitas: [visitaPessoaBase("v1", { data: "2026-10-30", hora: "" })] }, tr);
    expect(semHora.detalhes?.visitaMarcada).toBe("30/10/2026");
    const canceladas = dadosDoGuia(pessoaBase("a"), { ...vazios, visitas: [visitaPessoaBase("v2", { estado: "cancelada" })] }, tr);
    expect(canceladas.detalhes?.visitaMarcada).toBeUndefined();
  });

  it("com uma visita ja feita e outra por fazer, a marcada e a que esta por fazer e nao a mais antiga", () => {
    const d = dadosDoGuia(pessoaBase("a"), {
      ...vazios,
      visitas: [
        visitaPessoaBase("v1", { data: "2026-10-20", hora: "10:00", estado: "feita" }),
        visitaPessoaBase("v2", { data: "2026-10-30", hora: "14:30" }),
        visitaPessoaBase("v3", { data: "2026-11-05", hora: "09:00" }),
      ],
    }, tr);
    expect(d.detalhes?.visitaMarcada).toBe("30/10/2026 · 14:30");
    expect(d.detalhes?.visitaFeita).toBe("20/10/2026");
    const soFeita = dadosDoGuia(pessoaBase("a"), { ...vazios, visitas: [visitaPessoaBase("v1", { data: "2026-10-20", estado: "feita" })] }, tr);
    expect(soFeita.detalhes?.visitaMarcada).toBe("20/10/2026 · 10:00");
  });

  it("a visita feita e o levantamento levam o dia", () => {
    const d = dadosDoGuia(pessoaBase("a"), {
      ...vazios,
      visitas: [visitaPessoaBase("v1", { data: "2026-10-20", estado: "feita" })],
      levantamentos: [levantamentoBase("l1", { data: "2026-10-21" })],
    }, tr);
    expect(d.detalhes?.visitaFeita).toBe("20/10/2026");
    expect(d.detalhes?.levantamento).toBe("21/10/2026");
  });
});

describe("clienteDoGuia", () => {
  it("usa a morada da pessoa (rua, codigo postal e localidade) e a localidade para o cabecalho", () => {
    const c = clienteDoGuia(pessoaBase("a", { contacto: { telefone: "927 118 300", email: "p@x.pt" }, morada: { linha: "Rua A 1", cp: "2700-001", localidade: "Amadora" } }), "WC social");
    expect(c.cliente).toEqual({ telefone: "927 118 300", email: "p@x.pt", morada: "Rua A 1, 2700-001 Amadora", linha: "WC social", nif: null, nifUltimos3: null, nifRegistado: false });
    expect(c.local).toBe("Amadora");
  });

  it("sem morada ou servico fica a null (o cartao diz «Por preencher»)", () => {
    const c = clienteDoGuia(pessoaBase("a"), null);
    expect(c.cliente).toEqual({ telefone: null, email: null, morada: null, linha: null, nif: null, nifUltimos3: null, nifRegistado: false });
    expect(c.local).toBeNull();
  });

  it("o NIF é sempre um campo do cartão: sem NIF vai a null (o cartão diz «Por preencher») e nunca entra nos extras", () => {
    const c = clienteDoGuia(pessoaBase("a", { distrito: "Lisboa" }), null);
    expect(c.cliente.nif).toBeNull();
    expect(c.cliente.extras?.map((e) => e.chave)).toEqual(["distrito"]);
  });

  it("com NIF leva-o; só com os últimos 3 dígitos leva só esses; só com «tem NIF» diz que há um registado", () => {
    expect(clienteDoGuia(pessoaBase("a", { nif: "123456789" }), null).cliente).toMatchObject({ nif: "123456789", nifUltimos3: null });
    expect(clienteDoGuia(pessoaBase("a", { nifUltimos3: "789" }), null).cliente).toMatchObject({ nif: null, nifUltimos3: "789", nifRegistado: true });
    expect(clienteDoGuia(pessoaBase("a", { temNif: true }), null).cliente).toMatchObject({ nif: null, nifUltimos3: null, nifRegistado: true });
  });

  it("o NIF da empresa continua nos extras", () => {
    const c = clienteDoGuia(pessoaBase("a", { empresa: { nome: "Obras Lda", nif: "500000000" } }), null);
    expect(c.cliente.extras).toEqual([{ chave: "empresa", valor: "Obras Lda" }, { chave: "nifEmpresa", valor: "500000000" }]);
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
