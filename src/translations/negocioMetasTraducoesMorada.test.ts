// Os textos novos da Qualificação do negócio e da morada da obra (entidade, local, origem, pedido do cliente) existem em pt e en, com os mesmos marcadores.
import { describe, expect, it } from "vitest";
import { MOTIVOS_LOCALIZACAO } from "@/hooks/pessoas/localizacaoMorada";
import { negocioMetasVisitaTranslations } from "./negocioMetasVisita";
import { pessoasPaginaTranslations } from "./pessoasPagina";

const { en, pt } = negocioMetasVisitaTranslations;
const P = "businessGoals.new.";
const marcas = (texto: string): string[] => (texto.match(/\{\w+\}/g) ?? []).sort();

describe("traduções da morada da obra e do pedido", () => {
  const chaves = [
    "address.fromEntity", "address.fromEntity.empty", "address.fromEntity.done", "address.here", "address.here.busy", "address.here.done", "address.here.weak",
    "address.origin.entidade", "address.origin.manual", "address.origin.localizacao", "qual.request", "qual.request.help", "qual.request.count", "qual.noDeal",
    ...MOTIVOS_LOCALIZACAO.map((m) => `address.here.err.${m}`),
  ];

  it("todas existem nas duas línguas, sem texto vazio", () => {
    for (const c of chaves) {
      expect(pt[`${P}${c}`]?.trim(), c).toBeTruthy();
      expect(en[`${P}${c}`]?.trim(), c).toBeTruthy();
    }
  });

  it("os marcadores coincidem entre pt e en", () => {
    for (const c of chaves) expect(marcas(en[`${P}${c}`]), c).toEqual(marcas(pt[`${P}${c}`]));
    expect(marcas(pt[`${P}address.here.done`])).toEqual(["{m}"]);
    expect(marcas(pt[`${P}qual.request.count`])).toEqual(["{m}", "{n}"]);
  });
});

describe("traduções do guia e de «quem vai estar»", () => {
  const ficha = pessoasPaginaTranslations;
  it("as razões do passo de marcar a visita e o botão de outra chamada existem em pt e en", () => {
    for (const c of ["razao.semInteresse", "razao.numeroErrado", "outraChamada"]) {
      expect(ficha.pt[`pessoasPagina.guia.${c}`]?.trim(), c).toBeTruthy();
      expect(ficha.en[`pessoasPagina.guia.${c}`]?.trim(), c).toBeTruthy();
    }
  });

  it("«quem vai estar» tem o rótulo e as quatro opções em pt e en", () => {
    for (const c of ["present", "present.cliente", "present.casal", "present.familia", "present.outra"]) {
      expect(ficha.pt[`pessoasPagina.real.visit.agenda.${c}`]?.trim(), c).toBeTruthy();
      expect(ficha.en[`pessoasPagina.real.visit.agenda.${c}`]?.trim(), c).toBeTruthy();
    }
  });
});
