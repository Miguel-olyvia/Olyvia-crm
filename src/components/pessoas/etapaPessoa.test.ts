import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  estaAtrasada, etapaEfetiva, indiceEtapa, negocioEmFoco, passoDaPerdida, pedidoMaisAvancado, proximoPasso, todosNegociosPerdidos,
  type EntradaEtapa,
} from "./etapaPessoa";
import { negocioBase, pedidoBase, pessoaBase, resumoBase, visitaBase } from "./fabricaTestes";
import { juntarPessoas } from "./juntarPessoas";
import { PEDIDOS_EXEMPLO } from "./pedidosDeExemplo";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { PedidoNegocio, Pessoa } from "./pessoasTipos";

const orc = (id: string, escolhido = false) => ({ id, valor: 1000, escolhido });
const emOrcamento = negocioBase("o", { orcamentos: [orc("o1", true)] });
const emProposta = (estado: "rascunho" | "enviada" | "aceite") => negocioBase("p", { orcamentos: [orc("p1", true)], proposta: { estado } });
const emContrato = negocioBase("c", { orcamentos: [orc("c1", true)], proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });

const porContactar = pedidoBase("pd-1");
const contactado = pedidoBase("pd-2", { contactado: true });
const comVisita = pedidoBase("pd-3", { contactado: true, visitas: [visitaBase("pd-3-v1")] });
const visitaFeita = pedidoBase("pd-4", { contactado: true, visitas: [visitaBase("pd-4-v1", { estado: "feita" })] });

const entrada = (
  pessoa: Pessoa, abertos = [emOrcamento], papel: EntradaEtapa["papel"] = "lead", pedidos: PedidoNegocio[] = [],
): EntradaEtapa => ({ pessoa, papel, abertos, pedidos });

describe("indiceEtapa", () => {
  it("vai de 0 (Lead) a 4 (Cliente), sem renomear as chaves", () => {
    expect(["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"].map((e) => indiceEtapa(e as never))).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("pedidoMaisAvancado", () => {
  it("é o que está mais à frente: visita, contactado, por contactar; em empate, o primeiro", () => {
    expect(pedidoMaisAvancado([porContactar, comVisita, contactado])?.id).toBe("pd-3");
    expect(pedidoMaisAvancado([porContactar, contactado])?.id).toBe("pd-2");
    expect(pedidoMaisAvancado([contactado, pedidoBase("pd-9", { contactado: true })])?.id).toBe("pd-2");
  });
  it("entre dois pedidos em Visita, o que já tem uma visita feita está mais à frente", () => {
    expect(pedidoMaisAvancado([comVisita, visitaFeita])?.id).toBe("pd-4");
  });
  it("sem pedidos, null", () => {
    expect(pedidoMaisAvancado([])).toBeNull();
  });
});

describe("etapaEfetiva", () => {
  it("cliente se tem negócio ganho, mesmo com um negócio novo em aberto e pedidos", () => {
    expect(etapaEfetiva(entrada(pessoaBase(), [emOrcamento], "cliente", [comVisita]))).toBe("cliente");
  });
  it("com negócio aberto (e sem ganho) é Negócio, mesmo com um pedido em paralelo", () => {
    expect(etapaEfetiva(entrada(pessoaBase(), [emOrcamento], "lead", [porContactar]))).toBe("qualificada");
  });
  it("sem negócio vale o pedido mais avançado: Lead, Contacto ou Visita", () => {
    expect(etapaEfetiva(entrada(pessoaBase(), [], "lead", [porContactar]))).toBe("nova");
    expect(etapaEfetiva(entrada(pessoaBase(), [], "lead", [contactado]))).toBe("emContacto");
    expect(etapaEfetiva(entrada(pessoaBase(), [], "lead", [comVisita]))).toBe("visitaMarcada");
    expect(etapaEfetiva(entrada(pessoaBase(), [], "lead", [porContactar, comVisita, contactado]))).toBe("visitaMarcada");
  });
  it("uma visita só cancelada conta como se não houvesse visita", () => {
    const cancelada = pedidoBase("pd-5", { contactado: true, visitas: [visitaBase("v", { estado: "cancelada" })] });
    expect(etapaEfetiva(entrada(pessoaBase(), [], "lead", [cancelada]))).toBe("emContacto");
  });
  it("sem negócio nem pedido (uma lead que só tem históricos) fica em Contacto", () => {
    expect(etapaEfetiva(entrada(pessoaBase(), [], "lead", []))).toBe("emContacto");
  });
  it("as pessoas de exemplo têm a etapa que o percurso diz", () => {
    const etapa = (nome: string) =>
      juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, PEDIDOS_EXEMPLO).find((r) => r.pessoa.nome === nome)!.etapa;
    expect(etapa("Marta Silveira")).toBe("cliente");
    expect(etapa("Nuno Barros")).toBe("qualificada");
    expect(etapa("Beatriz Sampaio")).toBe("nova");
    expect(etapa("Gonçalo Matias")).toBe("visitaMarcada");
    expect(etapa("Rita Albuquerque")).toBe("visitaMarcada");
  });
});

describe("negocioEmFoco", () => {
  it("é o mais avançado; em empate, o primeiro; sem abertos, null", () => {
    expect(negocioEmFoco([emOrcamento, emContrato, emProposta("enviada")])?.id).toBe("c");
    expect(negocioEmFoco([emProposta("enviada"), negocioBase("q", { proposta: { estado: "rascunho" } })])?.id).toBe("p");
    expect(negocioEmFoco([])).toBeNull();
  });
});

describe("estaAtrasada", () => {
  const hoje = "2026-10-13";
  it("lead: o próximo contacto anterior a hoje; hoje e futuro não", () => {
    expect(estaAtrasada(entrada(pessoaBase("a", { proximoContacto: "2026-10-12" }), []), hoje)).toBe(true);
    expect(estaAtrasada(entrada(pessoaBase("a", { proximoContacto: "2026-10-13" }), []), hoje)).toBe(false);
    expect(estaAtrasada(entrada(pessoaBase("a", { proximoContacto: null }), []), hoje)).toBe(false);
  });
  it("lead: uma visita por fazer de um pedido, com o dia já passado, também a atrasa", () => {
    const passada = pedidoBase("pd-1", { visitas: [visitaBase("v", { data: "2026-10-10" })] });
    expect(estaAtrasada(entrada(pessoaBase("a", { proximoContacto: null }), [], "lead", [passada]), hoje)).toBe(true);
  });
  it("lead: uma visita feita, ou de hoje, não atrasa", () => {
    const feita = pedidoBase("pd-1", { visitas: [visitaBase("v", { data: "2026-10-10", estado: "feita" })] });
    const deHoje = pedidoBase("pd-2", { visitas: [visitaBase("w", { data: hoje })] });
    expect(estaAtrasada(entrada(pessoaBase("a", { proximoContacto: null }), [], "lead", [feita, deHoje]), hoje)).toBe(false);
  });
  it("cliente: só com um negócio em curso com prazo anterior a hoje", () => {
    const atrasado = negocioBase("x", { proximoPrazo: "2026-10-10" });
    const emDia = negocioBase("y", { proximoPrazo: "2026-10-16" });
    const cliente = pessoaBase("a", { proximoContacto: "2026-10-01" });
    expect(estaAtrasada(entrada(cliente, [atrasado], "cliente"), hoje)).toBe(true);
    expect(estaAtrasada(entrada(cliente, [emDia], "cliente"), hoje)).toBe(false);
    expect(estaAtrasada(entrada(cliente, [], "cliente"), hoje)).toBe(false);
  });
  it("uma perdida nunca está atrasada", () => {
    const p = pessoaBase("a", { proximoContacto: "2026-10-01", perdida: { motivo: "preco", data: "2026-10-05" } });
    expect(estaAtrasada(entrada(p, []), hoje)).toBe(false);
  });
});

describe("proximoPasso", () => {
  const passo = (p: Pessoa, abertos = [] as ReturnType<typeof negocioBase>[], papel: "lead" | "cliente" = "lead", pedidos: PedidoNegocio[] = []) =>
    proximoPasso(resumoBase(p, abertos, HOJE_EXEMPLO, papel, pedidos));
  it("antes do negócio vai pelo pedido mais avançado e leva o próximo contacto como prazo", () => {
    expect(passo(pessoaBase("a", { proximoContacto: "2026-10-14" }), [], "lead", [porContactar])).toEqual({ id: "registarChamada", prazo: "2026-10-14" });
    expect(passo(pessoaBase(), [], "lead", [contactado]).id).toBe("marcarVisita");
    expect(passo(pessoaBase(), [], "lead", [comVisita]).id).toBe("fecharLevantamento");
    expect(passo(pessoaBase(), [], "lead", [porContactar, contactado, comVisita]).id).toBe("fecharLevantamento");
  });
  it("com a visita feita o passo da coluna é criar o negócio (o levantamento é opcional)", () => {
    expect(passo(pessoaBase(), [], "lead", [visitaFeita]).id).toBe("criarNegocio");
  });
  it("o prazo é o próximo contacto da pessoa: o mais cedo entre a chamada agendada e as visitas por fazer", () => {
    const visita = pedidoBase("pd-3", { contactado: true, visitas: [visitaBase("v", { data: "2026-10-15" })] });
    expect(passo(pessoaBase("a", { proximoContacto: "2026-10-20" }), [], "lead", [visita]).prazo).toBe("2026-10-15");
    expect(passo(pessoaBase("a", { proximoContacto: "2026-10-14" }), [], "lead", [visita]).prazo).toBe("2026-10-14");
  });
  it("sem pedidos nem negócio aberto não há passo", () => {
    expect(passo(pessoaBase(), [], "lead", [])).toEqual({ id: "nenhum", prazo: null });
  });
  it("em Orçamento: sem orçamentos, sem escolhido, e escolhido sem proposta", () => {
    const p = pessoaBase();
    expect(passo(p, [negocioBase("n")]).id).toBe("fazerLevantamento");
    expect(passo(p, [negocioBase("n", { orcamentos: [orc("a")] })]).id).toBe("escolherOrcamento");
    expect(passo(p, [negocioBase("n", { orcamentos: [orc("a", true)] })]).id).toBe("criarProposta");
  });
  it("em Proposta: rascunho e enviada", () => {
    expect(passo(pessoaBase(), [emProposta("rascunho")]).id).toBe("enviarProposta");
    expect(passo(pessoaBase(), [emProposta("enviada")]).id).toBe("esperarCliente");
  });
  it("em Contrato pendente recolhe a assinatura e usa o prazo do negócio", () => {
    const n = { ...emContrato, proximoPrazo: "2026-10-16" };
    expect(passo(pessoaBase(), [n])).toEqual({ id: "recolherAssinatura", prazo: "2026-10-16" });
  });
  it("com um negócio aberto manda o negócio em foco, mesmo com um pedido mais atrasado ao lado", () => {
    expect(passo(pessoaBase(), [emOrcamento], "lead", [porContactar]).id).toBe("criarProposta");
    expect(passo(pessoaBase(), [emOrcamento], "cliente", [comVisita]).id).toBe("criarProposta");
  });
  it("um cliente sem negócio aberto e sem pedidos não tem passo; com um pedido, segue o pedido", () => {
    expect(passo(pessoaBase(), [], "cliente")).toEqual({ id: "nenhum", prazo: null });
    expect(passo(pessoaBase(), [], "cliente", [contactado]).id).toBe("marcarVisita");
  });
  it("uma perdida não tem passo", () => {
    const perdida = pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } });
    expect(passo(perdida, [emOrcamento], "lead", [porContactar]).id).toBe("nenhum");
  });
});

describe("passoDaPerdida", () => {
  it("usa o passo guardado; nas antigas, o índice da etapa (no máximo 3)", () => {
    const perdida = { motivo: "preco", data: "2026-10-01" } as const;
    expect(passoDaPerdida({ pessoa: pessoaBase("a", { perdida: { ...perdida, passo: 1 } }), etapa: "qualificada" })).toBe(1);
    expect(passoDaPerdida({ pessoa: pessoaBase("a", { perdida }), etapa: "visitaMarcada" })).toBe(2);
    expect(passoDaPerdida({ pessoa: pessoaBase("a", { perdida }), etapa: "cliente" })).toBe(3);
  });
});

describe("todosNegociosPerdidos", () => {
  const perdido = { ...negocioBase("h"), mes: "2026-09", resultado: "perdido" as const };
  const base = (negocios: ReturnType<typeof resumoBase>["negocios"], pessoa = pessoaBase()) => ({ ...resumoBase(pessoa), negocios });
  it("só quando a lead em curso tem negócios e todos estão perdidos", () => {
    expect(todosNegociosPerdidos(base([perdido]))).toBe(true);
    expect(todosNegociosPerdidos(base([perdido, emOrcamento]))).toBe(false);
    expect(todosNegociosPerdidos(base([]))).toBe(false);
  });
  it("não vale para uma lead já perdida nem para um cliente", () => {
    const perdida = pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } });
    expect(todosNegociosPerdidos(base([perdido], perdida))).toBe(false);
    expect(todosNegociosPerdidos({ ...base([perdido]), papel: "cliente" })).toBe(false);
  });
});
