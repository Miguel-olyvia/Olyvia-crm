import { describe, expect, it } from "vitest";
import { seed, type Negocio } from "@/emylia/motor";
import { passoDoItem } from "../processo/passosProcesso";
import { faseEmyliaDaFicha, faseEmyliaDoNegocio, itemDoPosContrato } from "./faseEmylia";

const base = (): Negocio => structuredClone(seed().deals[0]);
const comFase = (fase: number, orc: Partial<NonNullable<Negocio["orc"]>> | null = null): Negocio => {
  const d = base();
  d.perdido = false;
  d.fase = fase;
  d.orc = orc === null ? null : ({ ...(d.orc ?? {}), enviada: null, aceite: null, contrato: null, ...orc } as NonNullable<Negocio["orc"]>);
  return d;
};

describe("faseEmyliaDoNegocio (a fase que o motor da Emylia diz)", () => {
  it("antes do Negócio (Por contactar, Contacto, Visita) não é da Emylia: fica o nosso fluxo", () => {
    expect(faseEmyliaDoNegocio(comFase(0))).toBeNull();
    expect(faseEmyliaDoNegocio(comFase(1))).toBeNull();
    expect(faseEmyliaDoNegocio(comFase(2))).toBeNull();
  });
  it("no Negócio: sem proposta enviada é Orçamento; enviada e por aceitar é Proposta; aceite é Contrato", () => {
    expect(faseEmyliaDoNegocio(comFase(3, null))).toBe("orcamento");
    expect(faseEmyliaDoNegocio(comFase(3, {}))).toBe("orcamento");
    expect(faseEmyliaDoNegocio(comFase(3, { enviada: "20/10" }))).toBe("proposta");
    expect(faseEmyliaDoNegocio(comFase(3, { enviada: "20/10", aceite: "21/10" }))).toBe("contrato");
  });
  it("Financeiro (4) e Obra (5) vêm da fase gravada", () => {
    expect(faseEmyliaDoNegocio(comFase(4, {}))).toBe("financeiro");
    expect(faseEmyliaDoNegocio(comFase(5, {}))).toBe("obra");
  });
  it("um negócio perdido ou com uma fase fora de 0 a 5 não tem fase da Emylia", () => {
    const perdido = comFase(4, {});
    perdido.perdido = true;
    expect(faseEmyliaDoNegocio(perdido)).toBeNull();
    expect(faseEmyliaDoNegocio(comFase(9))).toBeNull();
    expect(faseEmyliaDoNegocio(comFase(-1))).toBeNull();
  });
});

describe("faseEmyliaDaFicha (de onde vem a fase)", () => {
  it("com o negócio lido da base e sem documentos do CRM, manda o motor da Emylia", () => {
    expect(faseEmyliaDaFicha({ d: comFase(5, {}), docsCrm: false, contratoAssinado: true })).toBe("obra");
  });
  it("um negócio com documentos do CRM ou ainda por ler tem a fase que o CRM prova: contrato assinado é Financeiro", () => {
    expect(faseEmyliaDaFicha({ d: comFase(0), docsCrm: true, contratoAssinado: true })).toBe("financeiro");
    expect(faseEmyliaDaFicha({ d: undefined, docsCrm: false, contratoAssinado: true })).toBe("financeiro");
  });
  it("sem contrato assinado e sem fase da Emylia não há fase da Emylia (a barra fica a do guia)", () => {
    expect(faseEmyliaDaFicha({ d: undefined, docsCrm: false, contratoAssinado: false })).toBeNull();
    expect(faseEmyliaDaFicha({ d: comFase(1), docsCrm: false, contratoAssinado: false })).toBeNull();
  });
});

describe("itemDoPosContrato (o item do guia de um negócio ganho, que não tem processo)", () => {
  it("é um negócio com o contrato assinado, no fim do percurso do CRM, sem inventar valor nem prazo", () => {
    const i = itemDoPosContrato({ id: "n1", servico: "WC social" }, "p1");
    expect(i).toMatchObject({ id: "n1", pessoaId: "p1", tipo: "negocio", fase: "contrato", trabalho: "WC social", valor: null, prazo: null, prontoAGanhar: true });
    expect(passoDoItem(i).id).toBe("ganharNegocio");
  });
});
