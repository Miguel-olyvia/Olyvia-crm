/**
 * Junta o catálogo de sistema com a configuração da empresa (cfg_campos) e
 * valida/formata os valores dos campos da empresa.
 *
 * A validação é a MESMA de fn_cfg_validar_valores (migração 20261209100000):
 * ambas leem a definição — não há regras por campo escritas à mão. Os testes
 * de definicoes.test.ts cobrem os mesmos casos que
 * operacao-app/tools/validar-campos-configuraveis.mjs.
 */

import {
  CATALOGO_SISTEMA,
  SECCOES_PADRAO,
  type DefCampo,
  type Ficha,
  type LinhaCampo,
  type Opcao,
} from "./catalogo";

export type ValoresExtra = Record<string, unknown>;
/** Valores no formulário: texto para números/datas, boolean para sim/não. */
export type ValoresFormulario = Record<string, string | boolean>;

export interface FichaCombinada {
  ficha: Ficha;
  /** Todos (sistema + empresa, ativos ou não), pela ordem configurada. */
  todos: DefCampo[];
  /** Ajustes aos campos de sistema, por chave (para os formulários de sempre). */
  sistema: Record<string, DefCampo>;
  /** Campos da empresa ativos, pela ordem. */
  extra: DefCampo[];
  /** A empresa já configurou esta ficha? */
  configurada: boolean;
}

const num = (x: unknown): number | null => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

const juntarOpcoes = (base: Opcao[], ajuste: Opcao[] | undefined): Opcao[] => {
  if (!ajuste?.length) return base;
  const rot = new Map(ajuste.map((o) => [o.valor, o.rotulo]));
  return base.map((o) => ({ ...o, rotulo: rot.get(o.valor)?.trim() || o.rotulo }));
};

/** Do catálogo + linhas de cfg_campos (desta empresa e ficha) para as definições. */
export function combinarFicha(ficha: Ficha, linhas: readonly LinhaCampo[] | null | undefined): FichaCombinada {
  const daFicha = linhas ?? [];
  const porChave = new Map(daFicha.map((l) => [l.chave, l]));
  const n = CATALOGO_SISTEMA[ficha].length;

  const sistemaDefs: DefCampo[] = CATALOGO_SISTEMA[ficha].map((base) => {
    const l = porChave.get(base.chave);
    if (!l || !l.sistema) return { ...base };
    return {
      ...base,
      rotulo: l.rotulo?.trim() || base.rotulo,
      ajuda: l.ajuda?.trim() || base.ajuda,
      opcoes: juntarOpcoes(base.opcoes, l.opcoes),
      obrigatorio: !!l.obrigatorio,
      ativo: l.ativo !== false,
      ordem: l.ordem ?? base.ordem,
    };
  });

  const extraDefs: DefCampo[] = daFicha
    .filter((l) => !l.sistema && l.tipo)
    .map((l, i) => ({
      chave: l.chave,
      sistema: false,
      seccao: l.seccao || SECCOES_PADRAO[ficha][SECCOES_PADRAO[ficha].length - 1].chave,
      rotulo: l.rotulo?.trim() || l.chave,
      ajuda: l.ajuda?.trim() || null,
      tipo: l.tipo!,
      opcoes: l.opcoes ?? [],
      minimo: num(l.minimo),
      maximo: num(l.maximo),
      casas_decimais: l.casas_decimais ?? 0,
      unidade: l.unidade || null,
      obrigatorio: !!l.obrigatorio,
      ativo: l.ativo !== false,
      ordem: l.ordem ?? n + i,
      condicao: l.condicao ?? null,
      papeis: [],
    }));

  const todos = [...sistemaDefs, ...extraDefs].sort((a, b) => a.ordem - b.ordem);
  return {
    ficha,
    todos,
    sistema: Object.fromEntries(sistemaDefs.map((d) => [d.chave, d])),
    extra: todos.filter((d) => !d.sistema && d.ativo),
    configurada: daFicha.length > 0,
  };
}

/** De volta às linhas a gravar (rpc_cfg_gravar_ficha). Só grava ajustes que mudam algo. */
export function linhasParaGravar(ficha: Ficha, todos: readonly DefCampo[]): LinhaCampo[] {
  const base = new Map(CATALOGO_SISTEMA[ficha].map((d) => [d.chave, d]));
  return todos.map((d, ordem) => {
    if (d.sistema) {
      const b = base.get(d.chave)!;
      const opcoes = d.opcoes.filter((o) => {
        const ob = b.opcoes.find((x) => x.valor === o.valor);
        return ob && ob.rotulo !== o.rotulo;
      });
      return {
        chave: d.chave,
        sistema: true,
        rotulo: d.rotulo !== b.rotulo ? d.rotulo : null,
        ajuda: d.ajuda !== b.ajuda ? d.ajuda : null,
        opcoes,
        obrigatorio: d.obrigatorio,
        ativo: d.ativo,
        ordem,
      };
    }
    return {
      chave: d.chave,
      sistema: false,
      seccao: d.seccao,
      rotulo: d.rotulo,
      ajuda: d.ajuda,
      tipo: d.tipo,
      opcoes: d.tipo === "escolha" ? d.opcoes : [],
      minimo: d.tipo === "numero" ? d.minimo : null,
      maximo: d.tipo === "numero" ? d.maximo : null,
      casas_decimais: d.tipo === "numero" ? d.casas_decimais : 0,
      unidade: d.tipo === "numero" ? d.unidade : null,
      obrigatorio: d.obrigatorio,
      ativo: d.ativo,
      ordem,
      condicao: d.condicao,
    };
  });
}

/** Um campo de sistema está visível? (sem configuração: sim) */
export const visivel = (f: FichaCombinada | null | undefined, chave: string): boolean =>
  f?.sistema[chave]?.ativo !== false;

/** Rótulo de um campo de sistema (o da empresa, senão o de sempre). */
export const rotulo = (f: FichaCombinada | null | undefined, chave: string, porOmissao: string): string => {
  const d = f?.sistema[chave];
  if (!d) return porOmissao;
  const base = CATALOGO_SISTEMA[f!.ficha].find((x) => x.chave === chave);
  return base && d.rotulo !== base.rotulo ? d.rotulo : porOmissao;
};

/** Rótulo de uma opção de um campo de sistema. */
export const rotuloOpcao = (f: FichaCombinada | null | undefined, chave: string, valor: string, porOmissao: string): string => {
  const d = f?.sistema[chave];
  if (!d) return porOmissao;
  const base = CATALOGO_SISTEMA[f!.ficha].find((x) => x.chave === chave)?.opcoes.find((o) => o.valor === valor);
  const atual = d.opcoes.find((o) => o.valor === valor);
  return base && atual && atual.rotulo !== base.rotulo ? atual.rotulo : porOmissao;
};

const comoTexto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
};

/** A condição "só aparece se" cumpre-se com estes valores? */
export function condicaoCumprida(def: DefCampo, contexto: Record<string, unknown>): boolean {
  if (!def.condicao) return true;
  const v = comoTexto(contexto[def.condicao.campo]);
  return v !== null && v !== "" && def.condicao.valores.includes(v);
}

/** Dos valores gravados (jsonb) para o formulário. */
export function paraFormulario(defs: readonly DefCampo[], gravados: ValoresExtra | null | undefined): ValoresFormulario {
  const r: ValoresFormulario = {};
  for (const d of defs) {
    const v = gravados?.[d.chave];
    if (d.tipo === "sim_nao") {
      if (typeof v === "boolean") r[d.chave] = v;
      continue;
    }
    if (v === null || v === undefined) continue;
    r[d.chave] = d.tipo === "numero" ? String(v).replace(".", ",") : String(v);
  }
  return r;
}

export interface ResultadoValidacao {
  valores: ValoresExtra;
  erros: Record<string, string>;
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const dataValida = (s: string) => {
  if (!DATA.test(s)) return false;
  const [a, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/**
 * Valida e limpa (como fn_cfg_validar_valores). `contexto` = valores dos
 * campos de sistema, para as condições sobre eles.
 */
export function validarValores(
  defs: readonly DefCampo[],
  form: ValoresFormulario,
  contexto: Record<string, unknown> = {},
): ResultadoValidacao {
  const valores: ValoresExtra = {};
  const erros: Record<string, string> = {};

  for (const d of defs) {
    if (d.sistema || !d.ativo) continue;
    const bruto = form[d.chave];
    if (bruto === undefined || bruto === null || (typeof bruto === "string" && bruto.trim() === "")) continue;

    switch (d.tipo) {
      case "sim_nao":
        if (typeof bruto !== "boolean") erros[d.chave] = `${d.rotulo}: tem de ser sim ou não`;
        else valores[d.chave] = bruto;
        break;
      case "escolha":
        if (typeof bruto !== "string" || !d.opcoes.some((o) => o.valor === bruto)) erros[d.chave] = `${d.rotulo}: opção inválida`;
        else valores[d.chave] = bruto;
        break;
      case "numero": {
        const t = String(bruto).trim().replace(",", ".");
        if (!/^-?\d+(\.\d+)?$/.test(t)) { erros[d.chave] = `${d.rotulo}: tem de ser um número`; break; }
        const n = Number(t);
        const casas = (t.split(".")[1] ?? "").replace(/0+$/, "").length;
        if (casas > d.casas_decimais) { erros[d.chave] = `${d.rotulo}: no máximo ${d.casas_decimais} casa(s) decimal(is)`; break; }
        if ((d.minimo !== null && n < d.minimo) || (d.maximo !== null && n > d.maximo)) {
          erros[d.chave] = `${d.rotulo}: tem de estar entre ${d.minimo ?? "−∞"} e ${d.maximo ?? "∞"}`;
          break;
        }
        valores[d.chave] = n;
        break;
      }
      case "texto":
      case "texto_longo": {
        const t = String(bruto).trim();
        const lim = d.tipo === "texto" ? 200 : 2000;
        if (Array.from(t).length > lim) erros[d.chave] = `${d.rotulo}: no máximo ${lim} caracteres`;
        else valores[d.chave] = t;
        break;
      }
      case "data":
        if (typeof bruto !== "string" || !dataValida(bruto)) erros[d.chave] = `${d.rotulo}: data inválida`;
        else valores[d.chave] = bruto;
        break;
    }
  }

  // Condições: tira o que deixou de fazer sentido, até estabilizar.
  let mudou = true;
  while (mudou) {
    mudou = false;
    const ctx = { ...contexto, ...valores };
    for (const d of defs) {
      if (d.sistema || !d.ativo || !d.condicao || !(d.chave in valores)) continue;
      if (!condicaoCumprida(d, ctx)) {
        delete valores[d.chave];
        mudou = true;
      }
    }
  }
  // Erros de campos escondidos pela condição não contam.
  const ctxFinal = { ...contexto, ...valores };
  for (const k of Object.keys(erros)) {
    const d = defs.find((x) => x.chave === k);
    if (d && !condicaoCumprida(d, ctxFinal)) delete erros[k];
  }
  return { valores, erros };
}

/** Obrigatórios por preencher (não bloqueia: o ecrã avisa). */
export function emFalta(
  defs: readonly DefCampo[],
  valores: Record<string, unknown>,
): DefCampo[] {
  return defs.filter((d) => {
    if (!d.ativo || !d.obrigatorio || !condicaoCumprida(d, valores)) return false;
    const v = valores[d.chave];
    return v === undefined || v === null || v === "";
  });
}

/** Texto de um valor para resumos ("Horário: Manhã"). */
export function formatarValor(d: DefCampo, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  switch (d.tipo) {
    case "sim_nao":
      return v === true ? "Sim" : v === false ? "Não" : null;
    case "escolha":
      return d.opcoes.find((o) => o.valor === v)?.rotulo ?? String(v);
    case "numero": {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      const t = n.toLocaleString("pt-PT", { maximumFractionDigits: d.casas_decimais });
      return d.unidade ? `${t} ${d.unidade}` : t;
    }
    case "data": {
      const s = String(v);
      return dataValida(s) ? s.split("-").reverse().join("/") : s;
    }
    default:
      return String(v);
  }
}

/** "Horário de acesso: Manhã · Credenciação: Sim" — para resumos de uma linha. */
export function resumoExtra(defs: readonly DefCampo[], valores: ValoresExtra | null | undefined): string | null {
  if (!valores) return null;
  const partes = defs
    .filter((d) => !d.sistema && d.ativo)
    .map((d) => {
      const t = formatarValor(d, valores[d.chave]);
      if (t === null) return null;
      return d.tipo === "sim_nao" ? (valores[d.chave] ? d.rotulo : null) : `${d.rotulo}: ${t}`;
    })
    .filter((x): x is string => !!x);
  return partes.length ? partes.join(" · ") : null;
}

/** Secções com campos da empresa, pela ordem (as padrão primeiro). */
export function seccoesExtra(f: FichaCombinada): { chave: string; rotulo: string; campos: DefCampo[] }[] {
  const padrao = SECCOES_PADRAO[f.ficha];
  const chaves = Array.from(new Set([...padrao.map((s) => s.chave), ...f.extra.map((d) => d.seccao)]));
  return chaves
    .map((chave) => ({
      chave,
      rotulo: padrao.find((s) => s.chave === chave)?.rotulo ?? rotuloSeccao(chave),
      campos: f.extra.filter((d) => d.seccao === chave),
    }))
    .filter((s) => s.campos.length > 0);
}

/** "acessos_obra" → "Acessos obra". */
export const rotuloSeccao = (chave: string): string => {
  const t = chave.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Como paraFormulario, mas sem precisar das definições (para hidratar antes de
 * a configuração chegar): sim/não fica boolean, números passam a texto com
 * vírgula, texto fica texto. Objetos/listas (de outros donos do mesmo jsonb,
 * ex. formulários das campanhas) ficam de fora.
 */
export function gravadosParaFormulario(gravados: unknown): ValoresFormulario {
  const r: ValoresFormulario = {};
  if (!gravados || typeof gravados !== "object" || Array.isArray(gravados)) return r;
  for (const [k, v] of Object.entries(gravados as Record<string, unknown>)) {
    if (typeof v === "boolean") r[k] = v;
    else if (typeof v === "number" && Number.isFinite(v)) r[k] = String(v).replace(".", ",");
    else if (typeof v === "string") r[k] = v;
  }
  return r;
}
