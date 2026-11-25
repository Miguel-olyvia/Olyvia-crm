// O que se oferece num negócio: um negócio fechado (ganho ou perdido) só se edita depois de reaberto (decisão 5), e com a bandeira da migration B
// ligada o lixo e a edição seguem as permissões que a ficha devolve NESTE negócio (decisão 6). Sem o campo (a base ainda não o devolve) nada se
// restringe mais do que antes. Funções puras.
import { describe, expect, it } from "vitest";
import { dadosFalsos } from "@/components/negocio-metas/costuraTestUtil";
import type { PermissoesDoNegocio } from "@/components/negocio-metas/costuraNegocio";
import { negocioBase } from "./fabricaTestes";
import { acoesDoNegocio, negocioFechado } from "./permissoesNegocio";

const ABERTO = negocioBase("n1", { estadoReal: "aberto" });
const GANHO = negocioBase("n2", { estadoReal: "ganho" });
const PERDIDO = negocioBase("n3", { estadoReal: "perdido" });
const PERDA = { motivo: "x", mes: "2026-10", data: "2026-10-01", fase: "orcamento" as const };

const dadosCom = (permissoes: PermissoesDoNegocio | null, sobre = {}) =>
  dadosFalsos({ podeApagar: true, permissoesNegocio: () => permissoes, ...sobre });

describe("negocioFechado", () => {
  it("um negócio aberto não está fechado", () => {
    expect(negocioFechado(ABERTO, undefined)).toBe(false);
    expect(negocioFechado(negocioBase("n"), undefined)).toBe(false);
  });

  it("ganho e perdido estão fechados, venha o estado do negócio ou a perda da ficha", () => {
    expect(negocioFechado(GANHO, undefined)).toBe(true);
    expect(negocioFechado(PERDIDO, undefined)).toBe(true);
    expect(negocioFechado(ABERTO, PERDA)).toBe(true);
    expect(negocioFechado({ ...ABERTO, resultado: "perdido" } as never, undefined)).toBe(true);
    expect(negocioFechado({ ...ABERTO, resultado: "ganho" } as never, undefined)).toBe(true);
  });
});

describe("acoesDoNegocio: o negócio fechado", () => {
  it("aberto com pessoas.edit: edita", () => {
    const a = acoesDoNegocio(dadosFalsos(), ABERTO, { perda: undefined, porNegocio: false });
    expect(a).toMatchObject({ fechado: false, podeAgir: true, podeEditar: true });
  });

  it.each([["ganho", GANHO, undefined], ["perdido", PERDIDO, PERDA]])("%s: pode agir (reabrir) mas não editar", (_nome, negocio, perda) => {
    const a = acoesDoNegocio(dadosFalsos(), negocio, { perda, porNegocio: false });
    expect(a).toMatchObject({ fechado: true, podeAgir: true, podeEditar: false });
  });

  it("o lixo não depende do estado: um negócio fechado continua a poder ir para o lixo", () => {
    expect(acoesDoNegocio(dadosFalsos({ podeApagar: true }), GANHO, { perda: undefined, porNegocio: false }).podeApagar).toBe(true);
  });

  it("sem pessoas.edit nada se oferece; sem os dados da ficha (exemplo) também não", () => {
    expect(acoesDoNegocio(dadosFalsos({ podeEditar: false, podeApagar: true }), ABERTO, { perda: undefined, porNegocio: false }))
      .toEqual({ fechado: false, podeAgir: false, podePerder: false, podeEditar: false, podeApagar: false, podeRestaurar: false });
    expect(acoesDoNegocio(null, ABERTO, { perda: undefined, porNegocio: true }))
      .toEqual({ fechado: false, podeAgir: false, podePerder: false, podeEditar: false, podeApagar: false, podeRestaurar: false });
  });
});

// 23/11/2026 (B1): «Perder negócio» e «Anular perda» pedem negocios.perder no servidor; o ecrã só os mostra com ela (DadosNegocio.podePerder).
describe("acoesDoNegocio: perder e anular a perda (negocios.perder)", () => {
  const sem = { perda: undefined, porNegocio: false };
  it("com pessoas.edit e negocios.perder: pode perder", () => {
    expect(acoesDoNegocio(dadosFalsos({ podePerder: true }), ABERTO, sem).podePerder).toBe(true);
  });
  it("com pessoas.edit mas sem negocios.perder: não pode perder nem anular, e o resto fica igual", () => {
    const a = acoesDoNegocio(dadosFalsos({ podePerder: false }), ABERTO, sem);
    expect(a).toMatchObject({ podePerder: false, podeAgir: true, podeEditar: true });
    expect(acoesDoNegocio(dadosFalsos({ podePerder: false }), PERDIDO, { perda: PERDA, porNegocio: false }).podePerder).toBe(false);
  });
  it("sem o campo (exemplo, permissões por ler): não restringe mais do que pessoas.edit", () => {
    expect(acoesDoNegocio(dadosFalsos(), ABERTO, sem).podePerder).toBe(true);
    expect(acoesDoNegocio(dadosFalsos({ podeEditar: false, podePerder: true }), ABERTO, sem).podePerder).toBe(false);
  });
});

describe("acoesDoNegocio: as permissões por negócio (bandeira da migration B)", () => {
  const sem = { perda: undefined };

  it("com a bandeira desligada os campos são ignorados", () => {
    const a = acoesDoNegocio(dadosCom({ editar: false, apagar: false, restaurar: false }), ABERTO, { ...sem, porNegocio: false });
    expect(a).toMatchObject({ podeAgir: true, podeEditar: true, podeApagar: true, podeRestaurar: true });
  });

  it("ligada e sem o campo (a base ainda não o devolve): nada se restringe mais do que hoje", () => {
    for (const permissoes of [null, {}]) {
      const a = acoesDoNegocio(dadosCom(permissoes), ABERTO, { ...sem, porNegocio: true });
      expect(a).toMatchObject({ podeAgir: true, podeEditar: true, podeApagar: true, podeRestaurar: true });
    }
    // Dados que nem sabem de permissões por negócio (a função não existe).
    expect(acoesDoNegocio(dadosFalsos({ podeApagar: true }), ABERTO, { ...sem, porNegocio: true })).toMatchObject({ podeEditar: true, podeApagar: true });
  });

  it("ligada, pode_editar falso: não edita, não age e não apaga (o lixo é um UPDATE: a política de edição aplica-se)", () => {
    const a = acoesDoNegocio(dadosCom({ editar: false, apagar: true, restaurar: true }), ABERTO, { ...sem, porNegocio: true });
    expect(a).toMatchObject({ podeAgir: false, podeEditar: false, podeApagar: false, podeRestaurar: false });
  });

  it("ligada, pode_apagar falso: edita mas não apaga; pode_restaurar falso: não restaura", () => {
    const a = acoesDoNegocio(dadosCom({ editar: true, apagar: false, restaurar: true }), ABERTO, { ...sem, porNegocio: true });
    expect(a).toMatchObject({ podeEditar: true, podeApagar: false, podeRestaurar: true });
    const b = acoesDoNegocio(dadosCom({ editar: true, apagar: true, restaurar: false }), ABERTO, { ...sem, porNegocio: true });
    expect(b).toMatchObject({ podeApagar: true, podeRestaurar: false });
  });

  it("nunca oferece mais do que a permissão da página: campo verdadeiro com pessoas.delete em falta não apaga", () => {
    const a = acoesDoNegocio(dadosCom({ editar: true, apagar: true, restaurar: true }, { podeApagar: false }), ABERTO, { ...sem, porNegocio: true });
    expect(a).toMatchObject({ podeEditar: true, podeApagar: false, podeRestaurar: false });
  });

  it("um valor que não é booleano não restringe", () => {
    const a = acoesDoNegocio(dadosCom({ editar: "nao", apagar: null } as never), ABERTO, { ...sem, porNegocio: true });
    expect(a).toMatchObject({ podeEditar: true, podeApagar: true });
  });

  it("fechado e sem permissão por negócio: nada de editar, e agir também não", () => {
    const a = acoesDoNegocio(dadosCom({ editar: false }), GANHO, { ...sem, porNegocio: true });
    expect(a).toMatchObject({ fechado: true, podeAgir: false, podeEditar: false });
  });
});
