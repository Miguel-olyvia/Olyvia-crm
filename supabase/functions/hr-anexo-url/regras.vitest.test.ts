/**
 * @vitest-environment node
 *
 * A matriz tipo x permissao x propria pessoa do hr-anexo-url.
 */
import { describe, expect, it } from "vitest";
import {
  CAMPO_AUDITADO,
  PERMISSAO_POR_TIPO,
  PERMISSAO_PROPRIA,
  TIPOS_ANEXO,
  TTL_SEGUNDOS,
  decidirAcessoAnexo,
  eAcessoPropria,
  eTipoAnexo,
  type TipoAnexo,
} from "./regras.ts";

const NADA = { temPermissaoDoTipo: false, temPermissaoPropria: false, eAPropriaPessoa: false };

describe("constantes", () => {
  it("cada tipo tem a sua permissao, auditoria e validade", () => {
    expect(PERMISSAO_POR_TIPO).toEqual({
      fotografia: "hr.pessoas.view",
      cartao_cidadao: "hr.pessoas.identificacao.reveal",
      comprovativo_iban: "hr.pessoas.bancarios.edit",
    });
    expect(PERMISSAO_PROPRIA).toBe("hr.pessoas.view.own");
    expect(TTL_SEGUNDOS).toEqual({ fotografia: 300, cartao_cidadao: 60, comprovativo_iban: 60 });
    expect(CAMPO_AUDITADO).toEqual({
      fotografia: null,
      cartao_cidadao: "anexo_cartao_cidadao",
      comprovativo_iban: "anexo_comprovativo_iban",
    });
  });

  it("eTipoAnexo so aceita os tres tipos", () => {
    for (const t of TIPOS_ANEXO) expect(eTipoAnexo(t)).toBe(true);
    for (const t of ["", "outro", null, undefined, 1, {}]) expect(eTipoAnexo(t)).toBe(false);
  });
});

describe.each(TIPOS_ANEXO.map((t) => [t] as [TipoAnexo]))("decidirAcessoAnexo(%s)", (tipo) => {
  it("sem permissao nenhuma: recusado, sem auditoria", () => {
    expect(decidirAcessoAnexo(tipo, NADA)).toEqual({ autorizado: false, auditar: null, ttlSegundos: TTL_SEGUNDOS[tipo] });
  });

  it("com a permissao do tipo: autorizado", () => {
    const d = decidirAcessoAnexo(tipo, { ...NADA, temPermissaoDoTipo: true });
    expect(d.autorizado).toBe(true);
    expect(d.auditar).toBe(CAMPO_AUDITADO[tipo]);
    expect(d.ttlSegundos).toBe(TTL_SEGUNDOS[tipo]);
  });

  it("a propria pessoa (com .own): autorizado, e com a mesma auditoria", () => {
    const d = decidirAcessoAnexo(tipo, { ...NADA, temPermissaoPropria: true, eAPropriaPessoa: true });
    expect(d.autorizado).toBe(true);
    expect(d.auditar).toBe(CAMPO_AUDITADO[tipo]);
  });

  it("ter .own mas ser OUTRA pessoa: recusado", () => {
    expect(decidirAcessoAnexo(tipo, { ...NADA, temPermissaoPropria: true }).autorizado).toBe(false);
  });

  it("ser a pessoa mas sem a permissao .own: recusado", () => {
    expect(decidirAcessoAnexo(tipo, { ...NADA, eAPropriaPessoa: true }).autorizado).toBe(false);
  });
});

describe("a matriz cruzada: a permissao de um tipo nao abre os outros", () => {
  // Quem tem hr.pessoas.view (so a fotografia) nao pode abrir o cartao nem o IBAN:
  // o index so calcula `temPermissaoDoTipo` com a permissao DAQUELE tipo.
  it("fotografia: audita nunca; cartao e comprovativo: audita sempre", () => {
    const f = { ...NADA, temPermissaoDoTipo: true };
    expect(decidirAcessoAnexo("fotografia", f).auditar).toBeNull();
    expect(decidirAcessoAnexo("cartao_cidadao", f).auditar).toBe("anexo_cartao_cidadao");
    expect(decidirAcessoAnexo("comprovativo_iban", f).auditar).toBe("anexo_comprovativo_iban");
  });

  it("a fotografia dura 5 minutos; os dois sensiveis 1 minuto", () => {
    expect(decidirAcessoAnexo("fotografia", NADA).ttlSegundos).toBe(300);
    expect(decidirAcessoAnexo("cartao_cidadao", NADA).ttlSegundos).toBe(60);
    expect(decidirAcessoAnexo("comprovativo_iban", NADA).ttlSegundos).toBe(60);
  });
});

describe("eAcessoPropria", () => {
  it("exige as duas condicoes", () => {
    expect(eAcessoPropria({ temPermissaoPropria: true, eAPropriaPessoa: true })).toBe(true);
    expect(eAcessoPropria({ temPermissaoPropria: true, eAPropriaPessoa: false })).toBe(false);
    expect(eAcessoPropria({ temPermissaoPropria: false, eAPropriaPessoa: true })).toBe(false);
    expect(eAcessoPropria({ temPermissaoPropria: false, eAPropriaPessoa: false })).toBe(false);
  });
});
