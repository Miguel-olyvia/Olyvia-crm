import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import type { RegistosDaPessoa } from "@/components/negocio-metas/registosTipos";
import { contactoBase, levantamentoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "../fabricaTestes";
import { itemEmFoco, itensDaPessoa } from "./itensProcesso";

const contactada = registosBase({ contactos: [contactoBase()] });
const comVisita = registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase()] });
const visitaFeita = registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase("rv-1", { estado: "feita" })], levantamentos: [levantamentoBase()] });
const aberto = negocioBase("n1", { orcamentos: [{ id: "o", valor: 1000, escolhido: true }] });

const itens = (registos: RegistosDaPessoa, abertos = [] as ReturnType<typeof negocioBase>[]) =>
  itensDaPessoa(resumoBase(pessoaBase("a"), abertos, HOJE_EXEMPLO, "lead", registos), HOJE_EXEMPLO);

describe("itensDaPessoa", () => {
  it("uma pessoa em abordagem dá UM item de pessoa (pessoa-<id>), na coluna dos registos, sem trabalho", () => {
    const [nova] = itens(registosBase());
    const [contactado] = itens(contactada);
    const [visita] = itens(comVisita);
    expect(nova).toMatchObject({ id: "pessoa-a", tipo: "pessoa", fase: "porContactar", trabalho: null, pessoaId: "a" });
    expect(contactado).toMatchObject({ id: "pessoa-a", tipo: "pessoa", fase: "contactado" });
    expect(visita).toMatchObject({ id: "pessoa-a", tipo: "pessoa", fase: "visita" });
  });

  it("um item de pessoa não tem pedido: não leva a identificação de um pedido nem rótulo", () => {
    const [i] = itens(contactada);
    expect(i).not.toHaveProperty("pedidoId");
    expect(i).not.toHaveProperty("rotuloPedido");
  });

  it("com negócios abertos há só itens de negócio (a pessoa já não está na abordagem), um por negócio", () => {
    const lista = itens(comVisita, [aberto, negocioBase("n2", { orcamentos: [{ id: "o", valor: 5, escolhido: true }], proposta: { estado: "enviada" } })]);
    expect(lista.map((i) => [i.id, i.tipo])).toEqual([["n1", "negocio"], ["n2", "negocio"]]);
  });

  it("visitaFeita vem dos registos da pessoa", () => {
    expect([itens(registosBase())[0].visitaFeita, itens(comVisita)[0].visitaFeita, itens(visitaFeita)[0].visitaFeita]).toEqual([false, false, true]);
  });

  it("o prazo de uma pessoa em Visita é o da sua próxima visita por fazer; atrasado se o dia já passou", () => {
    const passada = registosBase({ visitas: [visitaPessoaBase("rv-1", { data: "2026-10-01" })] });
    const r = resumoBase(pessoaBase("a", { proximoContacto: null }), [], HOJE_EXEMPLO, "lead", passada);
    expect(itensDaPessoa(r, HOJE_EXEMPLO)[0]).toMatchObject({ prazo: "2026-10-01", atrasado: true });
    expect(itens(comVisita)[0]).toMatchObject({ prazo: "2026-10-20", atrasado: false });
  });

  it("um negócio não tem visita feita e traz o que a regra dos passos precisa", () => {
    const [n] = itens(registosBase(), [aberto]);
    expect(n).toMatchObject({ tipo: "negocio", visitaFeita: false, orcamentos: 1 });
  });

  it("um negócio com o levantamento por decidir é um item na fase Levantamento", () => {
    const [n] = itens(registosBase(), [negocioBase("n1", { orcamentos: [], decisaoLevantamento: "porDecidir" })]);
    expect(n).toMatchObject({ tipo: "negocio", fase: "levantamento" });
  });

  it("uma pessoa perdida ou com a abordagem encerrada não tem itens", () => {
    const perdida = pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } });
    expect(itensDaPessoa(resumoBase(perdida, [], HOJE_EXEMPLO, "lead", contactada), HOJE_EXEMPLO)).toEqual([]);
    const encerrada = pessoaBase("a", { encerrada: { resultado: "semInteresse", motivo: "preco", data: "2026-10-01" } });
    expect(itensDaPessoa(resumoBase(encerrada, [], HOJE_EXEMPLO, "lead", contactada), HOJE_EXEMPLO)).toEqual([]);
  });
});

describe("itensDaPessoa: o fim do percurso, só nos negócios da base (com estadoReal)", () => {
  const daBase = (extra: Partial<ReturnType<typeof negocioBase>>) =>
    negocioBase("n1", { estadoReal: "aberto", orcamentos: [{ id: "o", valor: 1000, escolhido: true }], ...extra });
  const itemDe = (n: ReturnType<typeof negocioBase>) => itens(registosBase(), [n])[0];

  it("proposta aceite sem contrato: propostaAceite", () => {
    expect(itemDe(daBase({ proposta: { estado: "aceite" } }))).toMatchObject({ fase: "proposta", propostaAceite: true, prontoAGanhar: false });
  });

  it("proposta aceite COM contrato pendente: já não é «criar o contrato»", () => {
    const i = itemDe(daBase({ proposta: { estado: "aceite" }, contrato: { estado: "pendente" } }));
    expect(i).toMatchObject({ fase: "contrato", propostaAceite: false, prontoAGanhar: false });
  });

  it("contrato assinado, negócio aberto e a base diz que está pronto: prontoAGanhar, na coluna do contrato (não desaparece do quadro)", () => {
    const i = itemDe(daBase({ proposta: { estado: "aceite" }, contrato: { estado: "assinado" }, prontoAGanhar: true }));
    expect(i).toMatchObject({ fase: "contrato", prontoAGanhar: true, propostaAceite: false });
  });

  it("contrato assinado mas a base não diz que está pronto: não se oferece ganhar", () => {
    expect(itemDe(daBase({ contrato: { estado: "assinado" }, prontoAGanhar: false })).prontoAGanhar).toBe(false);
  });

  it("um negócio de exemplo (sem estadoReal) nunca recebe os campos novos como verdadeiros", () => {
    const i = itemDe(negocioBase("n1", { orcamentos: [{ id: "o", valor: 1, escolhido: true }], proposta: { estado: "aceite" } }));
    expect(i.propostaAceite ?? false).toBe(false);
    expect(i.prontoAGanhar ?? false).toBe(false);
  });
});

describe("itemEmFoco", () => {
  it("com negócio aberto é o do negócio mais avançado", () => {
    const r = resumoBase(pessoaBase("a"), [aberto, negocioBase("n0", { orcamentos: [] })], HOJE_EXEMPLO, "lead", contactada);
    expect(itemEmFoco(r, itensDaPessoa(r, HOJE_EXEMPLO))?.id).toBe("n1");
  });

  it("sem negócio aberto é o da pessoa em abordagem", () => {
    const r = resumoBase(pessoaBase("a"), [], HOJE_EXEMPLO, "lead", comVisita);
    expect(itemEmFoco(r, itensDaPessoa(r, HOJE_EXEMPLO))?.id).toBe("pessoa-a");
  });

  it("sem itens, null", () => {
    expect(itemEmFoco({ abertos: [] }, [])).toBeNull();
  });
});
