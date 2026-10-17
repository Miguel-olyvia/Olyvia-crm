// A matriz dos exemplos variados, documentada: por pessoa, o papel, a etapa, a coluna do Quadro de Pessoas em que cada item cai (um
// por pedido e um por negócio em curso), o "A fazer" de cada um e o "Próximo passo" da lista. Se uma regra do fluxo mudar, esta tabela
// diz que casos de exemplo mudaram. O dia fixo é HOJE_EXEMPLO.
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { proximoPasso, type IdPasso } from "./etapaPessoa";
import { juntarPessoas } from "./juntarPessoas";
import { PEDIDOS_EXEMPLO } from "./pedidosDeExemplo";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { EtapaPessoa, PapelPessoa } from "./pessoasTipos";
import { EXTRAS_VARIADO } from "./processo/extrasExemploVariado";
import { itensDaPessoa } from "./processo/itensProcesso";
import { passoDoItem } from "./processo/passosProcesso";
import type { PassoProcesso } from "./processo/tiposProcesso";
import type { ColunaQuadro } from "./quadro/cartoesQuadroPessoas";

/** [id do item, coluna do Quadro, "A fazer", em atraso]. Os pedidos têm o id `pedido-<pd>`; os negócios, o do negócio. */
type Item = readonly [id: string, coluna: ColunaQuadro, aFazer: PassoProcesso, atrasado?: true];

interface Caso {
  papel: PapelPessoa;
  etapa: EtapaPessoa;
  /** A coluna "Próximo passo" da lista. */
  proximo: IdPasso;
  atrasada: boolean;
  itens: readonly Item[];
}

const MATRIZ: Record<string, Caso> = {
  // LEADS
  "pv-ema": { papel: "lead", etapa: "nova", proximo: "registarChamada", atrasada: false, itens: [["pedido-pd-101", "porContactar", "registarChamada"]] },
  "pv-duarte": { papel: "lead", etapa: "emContacto", proximo: "marcarVisita", atrasada: false, itens: [["pedido-pd-102", "contactado", "marcarVisita"]] },
  "pv-filipa": { papel: "lead", etapa: "visitaMarcada", proximo: "fecharLevantamento", atrasada: false, itens: [["pedido-pd-103", "visita", "marcarVisitaFeita"]] },
  "pv-gaspar": { papel: "lead", etapa: "visitaMarcada", proximo: "criarNegocio", atrasada: false, itens: [["pedido-pd-104", "visita", "criarNegocio"]] },
  "pv-helga": { papel: "lead", etapa: "visitaMarcada", proximo: "criarNegocio", atrasada: false, itens: [["pedido-pd-105", "visita", "criarNegocio"]] },
  "pv-ivo": { papel: "lead", etapa: "visitaMarcada", proximo: "criarNegocio", atrasada: false, itens: [["pedido-pd-106", "visita", "criarNegocio"]] },
  "pv-jaime": {
    papel: "lead", etapa: "visitaMarcada", proximo: "fecharLevantamento", atrasada: false,
    itens: [["pedido-pd-107", "contactado", "marcarVisita"], ["pedido-pd-108", "visita", "marcarVisitaFeita"]],
  },
  "pv-leonor": { papel: "lead", etapa: "qualificada", proximo: "criarProposta", atrasada: false, itens: [["vn-leonor-orc", "orcamento", "criarProposta"]] },
  // CLIENTES
  "pv-otilia": {
    papel: "cliente", etapa: "cliente", proximo: "recolherAssinatura", atrasada: false,
    itens: [["vn-otilia-orc", "orcamento", "criarProposta"], ["vn-otilia-prop", "proposta", "registarRespostaCliente"], ["vn-otilia-con", "contrato", "registarAssinatura"]],
  },
  "pv-pascoal": {
    papel: "cliente", etapa: "cliente", proximo: "esperarCliente", atrasada: false,
    itens: [["pedido-pd-109", "visita", "criarNegocio"], ["vn-pascoal-prop", "proposta", "registarRespostaCliente"]],
  },
  "pv-quiteria": {
    papel: "cliente", etapa: "cliente", proximo: "marcarVisita", atrasada: false,
    itens: [["pedido-pd-110", "porContactar", "registarChamada"], ["pedido-pd-111", "contactado", "marcarVisita"]],
  },
  "pv-rodrigo": { papel: "cliente", etapa: "cliente", proximo: "registarChamada", atrasada: false, itens: [["pedido-pd-112", "porContactar", "registarChamada"]] },
  "pv-sara": { papel: "cliente", etapa: "cliente", proximo: "criarProposta", atrasada: false, itens: [["vn-sara-orc", "orcamento", "enviarProposta"]] },
  "pv-tomas": { papel: "cliente", etapa: "cliente", proximo: "criarProposta", atrasada: false, itens: [["vn-tomas-orc", "orcamento", "verificarOrcamento"]] },
  "pv-ursula": { papel: "cliente", etapa: "cliente", proximo: "criarProposta", atrasada: false, itens: [["vn-ursula-orc", "orcamento", "aguardarDirecao"]] },
  "pv-vitor": {
    papel: "cliente", etapa: "cliente", proximo: "esperarCliente", atrasada: true,
    itens: [["vn-vitor-prop", "proposta", "registarRespostaCliente", true]],
  },
  "pv-zita": { papel: "cliente", etapa: "cliente", proximo: "recolherAssinatura", atrasada: false, itens: [["vn-zita-con", "contrato", "registarAssinatura"]] },
};

const RESUMOS = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, PEDIDOS_EXEMPLO);
const resumoDe = (id: string) => RESUMOS.find((r) => r.pessoa.id === id)!;

describe("matriz dos exemplos variados: cada pessoa, em que coluna cai cada item e qual é o A fazer", () => {
  it("a matriz cobre as 17 pessoas novas, 8 leads e 9 clientes", () => {
    expect(Object.keys(MATRIZ)).toHaveLength(17);
    expect(Object.values(MATRIZ).filter((c) => c.papel === "lead")).toHaveLength(8);
    expect(Object.values(MATRIZ).filter((c) => c.papel === "cliente")).toHaveLength(9);
  });

  it.each(Object.entries(MATRIZ))("%s: papel, etapa, atraso e Próximo passo", (id, esperado) => {
    const r = resumoDe(id);
    expect(r, id).toBeDefined();
    expect({ papel: r.papel, etapa: r.etapa, atrasada: r.atrasada, proximo: proximoPasso(r).id }).toEqual({
      papel: esperado.papel, etapa: esperado.etapa, atrasada: esperado.atrasada, proximo: esperado.proximo,
    });
  });

  it.each(Object.entries(MATRIZ))("%s: coluna do Quadro e A fazer de cada item", (id, esperado) => {
    const itens = itensDaPessoa(resumoDe(id), HOJE_EXEMPLO, EXTRAS_VARIADO);
    expect(itens.map((i) => [i.id, i.fase, passoDoItem(i).id, ...(i.atrasado ? [true] : [])])).toEqual(esperado.itens.map((i) => [...i]));
  });

  it("os 3 estados do orçamento detalhado dão 3 A fazer diferentes; sem os extras seriam todos «criar a proposta»", () => {
    const sem = ["pv-sara", "pv-tomas", "pv-ursula"].flatMap((id) => itensDaPessoa(resumoDe(id), HOJE_EXEMPLO).map((i) => passoDoItem(i).id));
    expect(sem).toEqual(["criarProposta", "criarProposta", "criarProposta"]);
  });

  it("a Otília tem 3 negócios abertos, o ganho antigo e o perdido; o Rodrigo só tem terminados e um pedido novo", () => {
    expect(resumoDe("pv-otilia").abertos).toHaveLength(3);
    expect(resumoDe("pv-otilia").negocios).toHaveLength(5);
    const rodrigo = resumoDe("pv-rodrigo");
    expect(rodrigo.abertos).toHaveLength(0);
    expect(rodrigo.negocios.length).toBe(2);
    expect(rodrigo.pedidos).toHaveLength(1);
  });

  it("só o Vítor tem um negócio em atraso entre as pessoas novas, e a Zita tem tudo em dia", () => {
    const atrasadas = Object.keys(MATRIZ).filter((id) => resumoDe(id).atrasada);
    expect(atrasadas).toEqual(["pv-vitor"]);
    expect(itensDaPessoa(resumoDe("pv-zita"), HOJE_EXEMPLO, EXTRAS_VARIADO).some((i) => i.atrasado)).toBe(false);
  });
});
