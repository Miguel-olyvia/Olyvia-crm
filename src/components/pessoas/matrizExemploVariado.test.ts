// A matriz dos exemplos variados, documentada: por pessoa, o papel, a etapa, a Parte do Quadro (1: abordagem, 2: negócios), a coluna em que cada
// item cai (um por pessoa em abordagem, ou um por negócio em curso), o "A fazer" de cada um e o "Próximo passo" da lista. Se uma regra do fluxo
// mudar, esta tabela diz que casos de exemplo mudaram. O dia fixo é HOJE_EXEMPLO. Os registos (contacto, visita, levantamento) são da pessoa.
import { describe, expect, it } from "vitest";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { proximoPasso, type IdPasso } from "./etapaPessoa";
import { juntarPessoas } from "./juntarPessoas";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { EtapaPessoa, ParteQuadro, PapelPessoa } from "./pessoasTipos";
import { EXTRAS_VARIADO } from "./processo/extrasExemploVariado";
import { itensDaPessoa } from "./processo/itensProcesso";
import { passoDoItem } from "./processo/passosProcesso";
import type { PassoProcesso } from "./processo/tiposProcesso";
import type { ColunaQuadro } from "./quadro/cartoesQuadroPessoas";
import { REGISTOS_EXEMPLO } from "./registosExemplo";

/** [id do item, coluna do Quadro, "A fazer", em atraso]. Uma pessoa em abordagem tem o id `pessoa-<id>`; os negócios, o do negócio. */
type Item = readonly [id: string, coluna: ColunaQuadro, aFazer: PassoProcesso, atrasado?: true];

interface Caso {
  papel: PapelPessoa;
  etapa: EtapaPessoa;
  /** A Parte do Quadro: a mesma pessoa nunca está nas duas. */
  parte: ParteQuadro;
  /** A coluna "Próximo passo" da lista. */
  proximo: IdPasso;
  atrasada: boolean;
  itens: readonly Item[];
}

const abordagem = (id: string, coluna: ColunaQuadro, aFazer: PassoProcesso): readonly Item[] => [[`pessoa-${id}`, coluna, aFazer]];

const MATRIZ: Record<string, Caso> = {
  // LEADS
  "pv-ema": { papel: "lead", etapa: "nova", parte: "abordagem", proximo: "registarChamada", atrasada: false, itens: abordagem("pv-ema", "porContactar", "registarChamada") },
  "pv-duarte": { papel: "lead", etapa: "emContacto", parte: "abordagem", proximo: "marcarVisita", atrasada: false, itens: abordagem("pv-duarte", "contactado", "marcarVisita") },
  "pv-filipa": { papel: "lead", etapa: "visitaMarcada", parte: "abordagem", proximo: "fecharLevantamento", atrasada: false, itens: abordagem("pv-filipa", "visita", "marcarVisitaFeita") },
  "pv-gaspar": { papel: "lead", etapa: "visitaMarcada", parte: "abordagem", proximo: "criarNegocio", atrasada: false, itens: abordagem("pv-gaspar", "visita", "criarNegocio") },
  "pv-helga": { papel: "lead", etapa: "visitaMarcada", parte: "abordagem", proximo: "criarNegocio", atrasada: false, itens: abordagem("pv-helga", "visita", "criarNegocio") },
  "pv-ivo": { papel: "lead", etapa: "visitaMarcada", parte: "abordagem", proximo: "criarNegocio", atrasada: false, itens: abordagem("pv-ivo", "visita", "criarNegocio") },
  // Dois pedidos em paralelo eram dois itens; agora é UMA pessoa com um contacto e uma visita por fazer: um só cartão, na Visita.
  "pv-jaime": { papel: "lead", etapa: "visitaMarcada", parte: "abordagem", proximo: "fecharLevantamento", atrasada: false, itens: abordagem("pv-jaime", "visita", "marcarVisitaFeita") },
  "pv-leonor": { papel: "lead", etapa: "qualificada", parte: "negocios", proximo: "criarProposta", atrasada: false, itens: [["vn-leonor-orc", "orcamento", "criarProposta"]] },
  // CLIENTES
  "pv-otilia": {
    papel: "cliente", etapa: "cliente", parte: "negocios", proximo: "recolherAssinatura", atrasada: false,
    itens: [["vn-otilia-orc", "orcamento", "criarProposta"], ["vn-otilia-prop", "proposta", "registarRespostaCliente"], ["vn-otilia-con", "contrato", "registarAssinatura"]],
  },
  // Com um negócio aberto a pessoa está só na Parte 2: a visita por ligar vê-se na ficha, não é um segundo cartão.
  "pv-pascoal": {
    papel: "cliente", etapa: "cliente", parte: "negocios", proximo: "esperarCliente", atrasada: false,
    itens: [["vn-pascoal-prop", "proposta", "registarRespostaCliente"]],
  },
  // Sem negócio aberto e com registos por ligar posteriores ao último negócio, volta à Parte 1.
  "pv-quiteria": { papel: "cliente", etapa: "cliente", parte: "abordagem", proximo: "marcarVisita", atrasada: false, itens: abordagem("pv-quiteria", "contactado", "marcarVisita") },
  "pv-rodrigo": { papel: "cliente", etapa: "cliente", parte: "abordagem", proximo: "registarChamada", atrasada: false, itens: abordagem("pv-rodrigo", "porContactar", "registarChamada") },
  "pv-sara": { papel: "cliente", etapa: "cliente", parte: "negocios", proximo: "criarProposta", atrasada: false, itens: [["vn-sara-orc", "orcamento", "enviarProposta"]] },
  "pv-tomas": { papel: "cliente", etapa: "cliente", parte: "negocios", proximo: "criarProposta", atrasada: false, itens: [["vn-tomas-orc", "orcamento", "verificarOrcamento"]] },
  "pv-ursula": { papel: "cliente", etapa: "cliente", parte: "negocios", proximo: "criarProposta", atrasada: false, itens: [["vn-ursula-orc", "orcamento", "aguardarDirecao"]] },
  "pv-vitor": {
    papel: "cliente", etapa: "cliente", parte: "negocios", proximo: "esperarCliente", atrasada: true,
    itens: [["vn-vitor-prop", "proposta", "registarRespostaCliente", true]],
  },
  "pv-zita": { papel: "cliente", etapa: "cliente", parte: "negocios", proximo: "recolherAssinatura", atrasada: false, itens: [["vn-zita-con", "contrato", "registarAssinatura"]] },
};

const RESUMOS = juntarPessoas(PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO, HOJE_EXEMPLO, REGISTOS_EXEMPLO);
const resumoDe = (id: string) => RESUMOS.find((r) => r.pessoa.id === id)!;

describe("matriz dos exemplos variados: cada pessoa, em que coluna cai cada item e qual é o A fazer", () => {
  it("a matriz cobre as 17 pessoas novas, 8 leads e 9 clientes", () => {
    expect(Object.keys(MATRIZ)).toHaveLength(17);
    expect(Object.values(MATRIZ).filter((c) => c.papel === "lead")).toHaveLength(8);
    expect(Object.values(MATRIZ).filter((c) => c.papel === "cliente")).toHaveLength(9);
  });

  it.each(Object.entries(MATRIZ))("%s: papel, etapa, Parte do Quadro, atraso e Próximo passo", (id, esperado) => {
    const r = resumoDe(id);
    expect(r, id).toBeDefined();
    expect({ papel: r.papel, etapa: r.etapa, parte: r.parte, atrasada: r.atrasada, proximo: proximoPasso(r).id }).toEqual({
      papel: esperado.papel, etapa: esperado.etapa, parte: esperado.parte, atrasada: esperado.atrasada, proximo: esperado.proximo,
    });
  });

  it.each(Object.entries(MATRIZ))("%s: coluna do Quadro e A fazer de cada item", (id, esperado) => {
    const itens = itensDaPessoa(resumoDe(id), HOJE_EXEMPLO, EXTRAS_VARIADO);
    expect(itens.map((i) => [i.id, i.fase, passoDoItem(i).id, ...(i.atrasado ? [true] : [])])).toEqual(esperado.itens.map((i) => [...i]));
  });

  it("a mesma pessoa nunca está nas duas Partes: ou tem UM item de pessoa (Parte 1) ou só itens de negócio (Parte 2)", () => {
    for (const id of Object.keys(MATRIZ)) {
      const tipos = new Set(itensDaPessoa(resumoDe(id), HOJE_EXEMPLO, EXTRAS_VARIADO).map((i) => i.tipo));
      expect(tipos.size, id).toBeLessThanOrEqual(1);
    }
  });

  it("os 3 estados do orçamento detalhado dão 3 A fazer diferentes; sem os extras seriam todos «criar a proposta»", () => {
    const sem = ["pv-sara", "pv-tomas", "pv-ursula"].flatMap((id) => itensDaPessoa(resumoDe(id), HOJE_EXEMPLO).map((i) => passoDoItem(i).id));
    expect(sem).toEqual(["criarProposta", "criarProposta", "criarProposta"]);
  });

  it("a Otília tem 3 negócios abertos, o ganho antigo e o perdido; o Rodrigo só tem terminados e volta à abordagem", () => {
    expect(resumoDe("pv-otilia").abertos).toHaveLength(3);
    expect(resumoDe("pv-otilia").negocios).toHaveLength(5);
    const rodrigo = resumoDe("pv-rodrigo");
    expect(rodrigo.abertos).toHaveLength(0);
    expect(rodrigo.negocios.length).toBe(2);
    expect(rodrigo.parte).toBe("abordagem");
    expect(rodrigo.registos.contactos).toHaveLength(0);
  });

  it("a Pascoal tem uma visita por ligar à vista na ficha, mas só aparece na Parte 2 (tem um negócio aberto)", () => {
    const pascoal = resumoDe("pv-pascoal");
    expect(pascoal.parte).toBe("negocios");
    expect(pascoal.registos.visitas.filter((v) => v.negocioId === null).length).toBeGreaterThan(0);
  });

  it("só o Vítor tem um negócio em atraso entre as pessoas novas, e a Zita tem tudo em dia", () => {
    const atrasadas = Object.keys(MATRIZ).filter((id) => resumoDe(id).atrasada);
    expect(atrasadas).toEqual(["pv-vitor"]);
    expect(itensDaPessoa(resumoDe("pv-zita"), HOJE_EXEMPLO, EXTRAS_VARIADO).some((i) => i.atrasado)).toBe(false);
  });
});
