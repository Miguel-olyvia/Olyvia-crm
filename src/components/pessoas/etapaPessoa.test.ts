import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  estaAtrasada, etapaEfetiva, indiceEtapa, negocioEmFoco, passoDaPerdida, proximoPasso, todosNegociosPerdidos, type EntradaEtapa,
} from "./etapaPessoa";
import { negocioBase, pessoaBase, resumoBase } from "./fabricaTestes";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { Pessoa } from "./pessoasTipos";

const orc = (id: string, escolhido = false) => ({ id, valor: 1000, escolhido });
const emOrcamento = negocioBase("o", { orcamentos: [orc("o1", true)] });
const emProposta = (estado: "rascunho" | "enviada" | "aceite") => negocioBase("p", { orcamentos: [orc("p1", true)], proposta: { estado } });
const emContrato = negocioBase("c", { orcamentos: [orc("c1", true)], proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });
const entrada = (pessoa: Pessoa, abertos = [emOrcamento], papel: EntradaEtapa["papel"] = "lead"): EntradaEtapa => ({ pessoa, papel, abertos });

describe("indiceEtapa", () => {
  it("vai de 0 (Lead) a 4 (Cliente), sem renomear as chaves", () => {
    expect(["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"].map((e) => indiceEtapa(e as never))).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("etapaEfetiva", () => {
  it("cliente se tem negócio ganho, mesmo com um negócio novo em aberto", () => {
    expect(etapaEfetiva(entrada(pessoaBase(), [emOrcamento], "cliente"))).toBe("cliente");
  });
  it("com negócio aberto (e sem ganho) é Negócio", () => {
    expect(etapaEfetiva(entrada(pessoaBase("a", { etapa: "nova" })))).toBe("qualificada");
  });
  it("sem negócio vale a etapa de exemplo, limitada a Lead, Contacto e Visita", () => {
    expect(etapaEfetiva(entrada(pessoaBase("a", { etapa: "visitaMarcada" }), []))).toBe("visitaMarcada");
    expect(etapaEfetiva(entrada(pessoaBase("a", { etapa: "qualificada" }), []))).toBe("emContacto");
    expect(etapaEfetiva(entrada(pessoaBase("a", { etapa: "cliente" }), []))).toBe("emContacto");
  });
  it("Por contactar sem chamada; com chamada registada passa a Contactada", () => {
    expect(etapaEfetiva(entrada(pessoaBase("a", { etapa: "nova" }), []))).toBe("nova");
    expect(etapaEfetiva(entrada(pessoaBase("a", { etapa: "nova", resultadoContacto: "naoAtendeu" }), []))).toBe("emContacto");
  });
  it("as pessoas de exemplo têm a etapa que o percurso diz", () => {
    const etapa = (nome: string) => juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO).find((r) => r.pessoa.nome === nome)!.etapa;
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
  const passo = (p: Pessoa, abertos = [] as ReturnType<typeof negocioBase>[], papel: "lead" | "cliente" = "lead") =>
    proximoPasso(resumoBase(p, abertos, HOJE_EXEMPLO, papel));
  it("antes do negócio vai pela etapa e leva o próximo contacto como prazo", () => {
    expect(passo(pessoaBase("a", { etapa: "nova", proximoContacto: "2026-10-14" }))).toEqual({ id: "registarChamada", prazo: "2026-10-14" });
    expect(passo(pessoaBase("a", { etapa: "emContacto" })).id).toBe("marcarVisita");
    expect(passo(pessoaBase("a", { etapa: "visitaMarcada" })).id).toBe("fecharLevantamento");
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
  it("um cliente com negócio novo em aberto segue o negócio; sem ele, e uma perdida, não têm passo", () => {
    expect(passo(pessoaBase(), [emOrcamento], "cliente").id).toBe("criarProposta");
    expect(passo(pessoaBase(), [], "cliente")).toEqual({ id: "nenhum", prazo: null });
    expect(passo(pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } }), [emOrcamento]).id).toBe("nenhum");
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
