// As fases de um negócio como a ficha as mostra, para cada combinação dos negócios de exemplo: só aparecem as da abordagem que existem
// (contacto, visita, levantamento), e Orçamento, Proposta e Contrato aparecem sempre, feitas, atual ou por fazer.
import { describe, expect, it } from "vitest";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { REGISTOS_VAZIOS } from "@/components/negocio-metas/registosTipos";
import { fasesDoNegocio, type FaseDoNegocio } from "./fasesDoNegocio";
import { NEGOCIOS_VARIADO } from "./negociosExemploVariado";
import { ID_ORCAMENTO_BLOQUEADO, ID_ORCAMENTO_DIRECAO, ID_ORCAMENTO_VERIFICADO } from "./processo/extrasExemploVariado";
import { REGISTOS_EXEMPLO } from "./registosExemplo";

const negocio = (id: string): NegocioMes => NEGOCIOS_VARIADO.find((n) => n.id === id) as NegocioMes;
const resumo = (fases: readonly FaseDoNegocio[]): string[] => fases.map((f) => `${f.id}:${f.estado}`);
const fases = (id: string) => resumo(fasesDoNegocio(negocio(id), REGISTOS_EXEMPLO));

describe("fasesDoNegocio: o que existe aparece, o resto não", () => {
  it("só falado: contacto feito e depois a cadeia a partir do Orçamento", () => {
    expect(fases("vn-leonor-orc")).toEqual(["contacto:feita", "orcamento:atual", "proposta:porFazer", "contrato:porFazer"]);
  });

  it("contacto e visita feita, sem levantamento, com a Proposta enviada", () => {
    expect(fases("vn-vitor-prop")).toEqual(["contacto:feita", "visita:feita", "orcamento:feita", "proposta:atual", "contrato:porFazer"]);
  });

  it("só levantamento, sem contacto nem visita", () => {
    expect(fases(ID_ORCAMENTO_VERIFICADO)).toEqual(["levantamento:feita", "orcamento:atual", "proposta:porFazer", "contrato:porFazer"]);
  });

  it("só visita, sem contacto nem levantamento", () => {
    expect(fases(ID_ORCAMENTO_BLOQUEADO)).toEqual(["visita:feita", "orcamento:atual", "proposta:porFazer", "contrato:porFazer"]);
  });

  it("contacto e levantamento, sem visita", () => {
    expect(fases(ID_ORCAMENTO_DIRECAO)).toEqual(["contacto:feita", "levantamento:feita", "orcamento:atual", "proposta:porFazer", "contrato:porFazer"]);
  });

  it("contacto, visita e levantamento, com o Contrato por assinar: tudo o que passou está feito", () => {
    expect(fases("vn-zita-con")).toEqual([
      "contacto:feita", "visita:feita", "levantamento:feita", "orcamento:feita", "proposta:feita", "contrato:atual",
    ]);
  });

  it("sem nada ligado: só a cadeia, com o Orçamento atual", () => {
    expect(fases("vn-otilia-orc")).toEqual(["orcamento:atual", "proposta:porFazer", "contrato:porFazer"]);
  });

  it("um negócio antigo traz a visita e o levantamento no próprio negócio, e mostra-os", () => {
    expect(fases("vn-otilia-prop")).toEqual(["visita:feita", "levantamento:feita", "orcamento:feita", "proposta:atual", "contrato:porFazer"]);
  });
});

describe("fasesDoNegocio: Levantamento, ganho e perda", () => {
  it("em Levantamento (por decidir), a fase aparece como atual mesmo sem levantamento", () => {
    const porDecidir: NegocioMes = { ...negocio("vn-leonor-orc"), orcamentos: [], decisaoLevantamento: "porDecidir" };
    expect(resumo(fasesDoNegocio(porDecidir, REGISTOS_EXEMPLO))).toEqual(
      ["contacto:feita", "levantamento:atual", "orcamento:porFazer", "proposta:porFazer", "contrato:porFazer"],
    );
  });

  it("um negócio ganho tem tudo feito e a fase Ganho no fim", () => {
    const ganho: NegocioMes = { ...negocio("vn-zita-con"), contrato: { estado: "assinado" } };
    expect(resumo(fasesDoNegocio(ganho, REGISTOS_EXEMPLO)).slice(-3)).toEqual(["proposta:feita", "contrato:feita", "ganho:feita"]);
  });

  it("um negócio perdido na Proposta mostra a Proposta como perdida, e o Contrato por fazer", () => {
    const f = fasesDoNegocio(negocio("vn-vitor-prop"), REGISTOS_EXEMPLO, { fase: "proposta" });
    expect(resumo(f)).toEqual(["contacto:feita", "visita:feita", "orcamento:feita", "proposta:perdida", "contrato:porFazer"]);
  });

  it("um negócio perdido de meses anteriores (sem perda guardada) fica perdido na fase em que ficou", () => {
    const f = fasesDoNegocio(negocio("vn-vitor-prop"), REGISTOS_VAZIOS, undefined, true);
    expect(resumo(f)).toEqual(["orcamento:feita", "proposta:perdida", "contrato:porFazer"]);
  });

  it("uma visita ainda por fazer aparece como por fazer, e não como feita", () => {
    const registos = {
      ...REGISTOS_VAZIOS,
      visitas: [{ ...REGISTOS_EXEMPLO.visitas.find((v) => v.id === "rvl-1")!, estado: "porFazer" as const }],
    };
    expect(resumo(fasesDoNegocio(negocio("vn-vitor-prop"), registos))).toContain("visita:porFazer");
  });
});
