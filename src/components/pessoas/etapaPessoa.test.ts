// Os passos do percurso, o negócio em foco, o passo de cada negócio e o «atrasada» de um cliente. A etapa e o passo lidos dos registos da
// pessoa estão em `etapaRegistos.test.ts`.
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { contactoBase, negocioBase, pessoaBase, registosBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { indiceEtapa, negocioEmFoco, passoDaPerdida, proximoPasso, todosNegociosPerdidos } from "./etapaPessoa";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { Pessoa } from "./pessoasTipos";
import { REGISTOS_EXEMPLO } from "./registosExemplo";

const orc = (id: string, escolhido = false) => ({ id, valor: 1000, escolhido });
const emOrcamento = negocioBase("o", { orcamentos: [orc("o1", true)] });
const emProposta = (estado: "rascunho" | "enviada" | "aceite") => negocioBase("p", { orcamentos: [orc("p1", true)], proposta: { estado } });
const emContrato = negocioBase("c", { orcamentos: [orc("c1", true)], proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });

describe("indiceEtapa", () => {
  it("vai de 0 (Lead) a 4 (Cliente), sem renomear as chaves", () => {
    expect(["nova", "emContacto", "visitaMarcada", "qualificada", "cliente"].map((e) => indiceEtapa(e as never))).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("a etapa das pessoas de exemplo", () => {
  it("é a que o percurso diz, lida dos registos e dos negócios", () => {
    const etapa = (nome: string) =>
      juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, REGISTOS_EXEMPLO).find((r) => r.pessoa.nome === nome)!.etapa;
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

describe("o atraso de um cliente", () => {
  const hoje = "2026-10-13";
  const atrasada = (pessoa: Pessoa, abertos: ReturnType<typeof negocioBase>[]) => resumoBase(pessoa, abertos, hoje, "cliente").atrasada;
  it("só com um negócio em curso com prazo anterior a hoje", () => {
    const cliente = pessoaBase("a", { proximoContacto: "2026-10-01" });
    expect(atrasada(cliente, [negocioBase("x", { proximoPrazo: "2026-10-10" })])).toBe(true);
    expect(atrasada(cliente, [negocioBase("y", { proximoPrazo: "2026-10-16" })])).toBe(false);
    expect(atrasada(cliente, [])).toBe(false);
  });
});

describe("proximoPasso", () => {
  const passo = (p: Pessoa, abertos = [] as ReturnType<typeof negocioBase>[], papel: "lead" | "cliente" = "lead", registos = registosBase()) =>
    proximoPasso(resumoBase(p, abertos, HOJE_EXEMPLO, papel, registos));
  it("antes do negócio vai pelos registos e leva o próximo contacto como prazo", () => {
    expect(passo(pessoaBase("a", { proximoContacto: "2026-10-14" }))).toEqual({ id: "registarChamada", prazo: "2026-10-14" });
    expect(passo(pessoaBase(), [], "lead", registosBase({ contactos: [contactoBase()] })).id).toBe("marcarVisita");
    expect(passo(pessoaBase(), [], "lead", registosBase({ contactos: [contactoBase()], visitas: [visitaPessoaBase()] })).id).toBe("fecharLevantamento");
  });
  it("com a visita feita o passo da coluna é criar o negócio (o levantamento é opcional)", () => {
    expect(passo(pessoaBase(), [], "lead", registosBase({ visitas: [visitaPessoaBase("rv-1", { estado: "feita" })] })).id).toBe("criarNegocio");
  });
  it("em Orçamento: sem orçamentos, e com orçamentos (escolhido ou não: não há passo de escolher) sem proposta", () => {
    const p = pessoaBase();
    expect(passo(p, [negocioBase("n")]).id).toBe("fazerLevantamento");
    expect(passo(p, [negocioBase("n", { orcamentos: [orc("a")] })]).id).toBe("criarProposta");
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
  it("com um negócio aberto manda o negócio em foco, mesmo com registos por ligar ao lado", () => {
    expect(passo(pessoaBase(), [emOrcamento], "lead", registosBase({ contactos: [contactoBase()] })).id).toBe("criarProposta");
    expect(passo(pessoaBase(), [emOrcamento], "cliente", registosBase({ visitas: [visitaPessoaBase()] })).id).toBe("criarProposta");
  });
  it("sem negócio aberto, mesmo sendo cliente, o passo segue os registos por ligar", () => {
    expect(passo(pessoaBase(), [], "cliente", registosBase({ contactos: [contactoBase()] }))).toEqual({ id: "marcarVisita", prazo: null });
  });
  it("uma perdida não tem passo", () => {
    const perdida = pessoaBase("a", { perdida: { motivo: "preco", data: "2026-10-01" } });
    expect(passo(perdida, [emOrcamento], "lead", registosBase({ contactos: [contactoBase()] })).id).toBe("nenhum");
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
