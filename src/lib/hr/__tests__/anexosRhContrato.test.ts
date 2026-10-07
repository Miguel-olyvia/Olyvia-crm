/**
 * O TESTE DE CONTRATO DOS ANEXOS PELO RH (base, edge e cliente).
 *
 * Tres lados dizem a mesma coisa e nenhum compilador os liga:
 *   - as RPCs rpc_hr_anexo_rh_* (20261210260000) devolvem jsonb com a chave `erro`;
 *   - a Edge hr-anexo-rh tem o catalogo CODIGOS_RH (supabase/functions/hr-anexo-rh/erros.ts);
 *   - o ecra mapeia cada codigo para uma chave de traducao (chaveDeErroAnexoRh).
 * E as constantes (limites, tamanhos, permissoes por tipo) vivem em SQL, na Edge e no
 * cliente. Se um lado muda e o outro nao, isto falha em vez de falhar em silencio.
 *
 * Fica aqui o que a base fecha: (a) os codigos, (c) os limites e (d) as permissoes. O
 * ponto (b) -- cada codigo ter chave nas cinco linguas -- fecha com as traducoes (UI).
 */
import { describe, expect, it } from "vitest";
import { LIMITES_ANEXOS } from "@/lib/hr/conviteAnexos";
import { PERMISSAO_ESCRITA_POR_TIPO } from "@/lib/hr/anexosRh";
import { corpoDaFuncao, migrationPorVersao, semComentarios } from "./migrationSql";

const M260 = migrationPorVersao("20261210260000");

function bruto(glob: Record<string, string>): string {
  const valores = Object.values(glob);
  if (valores.length !== 1) throw new Error("O ficheiro esperado nao foi encontrado.");
  return valores[0];
}

const ERROS_RH = bruto(
  import.meta.glob("../../../../supabase/functions/hr-anexo-rh/erros.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);

const REGRAS_ANEXO_URL = bruto(
  import.meta.glob("../../../../supabase/functions/hr-anexo-url/regras.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);

const ANEXOS_CONVITE = bruto(
  import.meta.glob("../../../../supabase/functions/convite-admissao/anexos.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
);

/** Codigos que so a Edge produz: nunca saem de uma RPC. */
const SO_DA_EDGE = ["erro_inesperado", "accao_desconhecida", "demasiadas_tentativas", "anexo_nao_carregado"];

const FUNCOES_COM_ERRO = [
  "rpc_hr_anexo_rh_reservar",
  "rpc_hr_anexo_rh_contexto",
  "rpc_hr_anexo_rh_promover",
  "rpc_hr_anexo_rh_descartar",
  "rpc_hr_anexo_rh_remover",
] as const;

function codigosDaEdge(): string[] {
  const semLinhasDeComentario = ERROS_RH.replace(/\/\/.*$/gm, "");
  const inicio = semLinhasDeComentario.indexOf("export const CODIGOS_RH = [");
  const fim = semLinhasDeComentario.indexOf("] as const", inicio);
  if (inicio < 0 || fim < 0) throw new Error("Nao encontrei CODIGOS_RH em erros.ts.");
  return [...semLinhasDeComentario.slice(inicio, fim).matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
}

/** Todo literal de erro que a base pode devolver: nas cinco RPCs e em hr_anexo_rh_autorizar. */
function codigosDoSql(): string[] {
  const codigos = new Set<string>();
  for (const nome of FUNCOES_COM_ERRO) {
    const corpo = semComentarios(corpoDaFuncao(M260, nome));
    for (const m of corpo.matchAll(/'erro',\s*'([a-z_0-9]+)'/g)) codigos.add(m[1]);
  }
  const autorizar = semComentarios(corpoDaFuncao(M260, "hr_anexo_rh_autorizar"));
  for (const m of autorizar.matchAll(/RETURN\s+'([a-z_0-9]+)'/g)) codigos.add(m[1]);
  const autorizarLeitura = semComentarios(corpoDaFuncao(M260, "hr_anexo_rh_autorizar_leitura"));
  for (const m of autorizarLeitura.matchAll(/RETURN\s+'([a-z_0-9]+)'/g)) codigos.add(m[1]);
  return [...codigos].sort();
}

describe("(a) os codigos de erro: base e Edge", () => {
  it("o catalogo da Edge nao tem repetidos", () => {
    const edge = codigosDaEdge();
    expect(new Set(edge).size).toBe(edge.length);
  });

  it("todo o literal de erro devolvido pelas RPCs pertence a CODIGOS_RH", () => {
    const edge = codigosDaEdge();
    const sql = codigosDoSql();
    expect(sql.length).toBeGreaterThan(10);
    const desconhecidos = sql.filter((c) => !edge.includes(c));
    expect(desconhecidos).toEqual([]);
  });

  it("todo o CODIGOS_RH aparece no SQL ou esta na lista explicita de codigos so da Edge", () => {
    const sql = codigosDoSql();
    const sobram = codigosDaEdge().filter((c) => !sql.includes(c) && !SO_DA_EDGE.includes(c));
    expect(sobram).toEqual([]);
  });

  it("a lista dos codigos so da Edge nao inclui nenhum que o SQL ja devolve", () => {
    const sql = codigosDoSql();
    expect(SO_DA_EDGE.filter((c) => sql.includes(c))).toEqual([]);
  });

  it("os codigos da seccao 2.2 do plano estao todos no SQL, incluindo os dois novos", () => {
    const sql = codigosDoSql();
    for (const c of [
      "sem_sessao",
      "pessoa_nao_encontrada",
      "sem_permissao",
      "pedido_invalido",
      "anexo_tipo_invalido",
      "anexo_formato_invalido",
      "anexo_fotografia_formato",
      "anexo_vazio",
      "anexo_demasiado_grande",
      "anexo_fotografia_demasiado_grande",
      "anexo_maximo_ficheiros",
      "anexo_tipo_cheio",
      "anexo_nao_encontrado",
      "anexo_estado_invalido",
      "anexo_falha_envio",
      "anexo_substituto_invalido",
      "anexo_limite_pessoa",
    ]) {
      expect(sql, c).toContain(c);
    }
  });

  it("nenhuma RPC devolve um codigo do convite (convite_*): o catalogo do RH e proprio", () => {
    expect(codigosDoSql().filter((c) => c.startsWith("convite_"))).toEqual([]);
  });
});

/** O corpo de uma funcao a partir do SQL, sem comentarios e numa linha. */
function corpoCompacto(funcao: string): string {
  return semComentarios(corpoDaFuncao(M260, funcao)).replace(/\s+/g, " ");
}

function constanteSql(corpo: string, nome: string): number {
  const m = new RegExp(`${nome}\\s+constant\\s+(?:integer|bigint)\\s*:=\\s*(\\d+)`).exec(corpo);
  if (!m) throw new Error(`Constante ${nome} nao encontrada.`);
  return Number(m[1]);
}

function limitesPorTipoSql(corpo: string): Record<string, number> {
  const resultado: Record<string, number> = {};
  for (const m of corpo.matchAll(/WHEN '(cartao_cidadao|comprovativo_iban|fotografia)' THEN (\d+)/g)) {
    resultado[m[1]] = Number(m[2]);
  }
  return resultado;
}

function numeroDaEdge(chave: string): number {
  const m = new RegExp(`${chave}:\\s*(\\d+)`).exec(ANEXOS_CONVITE);
  if (!m) throw new Error(`${chave} nao encontrado em convite-admissao/anexos.ts.`);
  return Number(m[1]);
}

function porTipoDaEdge(): Record<string, number> {
  const m = /porTipo:\s*\{([^}]*)\}/.exec(ANEXOS_CONVITE);
  if (!m) throw new Error("porTipo nao encontrado em convite-admissao/anexos.ts.");
  const resultado: Record<string, number> = {};
  for (const t of m[1].matchAll(/([a-z_]+):\s*(\d+)/g)) resultado[t[1]] = Number(t[2]);
  return resultado;
}

describe("(c) as constantes da base sao as da Edge e as do cliente", () => {
  const funcoes = ["rpc_hr_anexo_rh_reservar", "rpc_hr_anexo_rh_promover"] as const;

  it.each(funcoes)("%s: 4 activos, 2/1/1 por tipo, 10 MB e 5 MB, como convite-admissao/anexos.ts", (nome) => {
    const corpo = corpoCompacto(nome);
    expect(constanteSql(corpo, "c_max_activos")).toBe(numeroDaEdge("maxActivos"));
    expect(constanteSql(corpo, "c_max_bytes")).toBe(numeroDaEdge("tamanhoMaxBytes"));
    expect(constanteSql(corpo, "c_max_bytes_foto")).toBe(numeroDaEdge("fotografiaMaxBytes"));
    expect(limitesPorTipoSql(corpo)).toEqual(porTipoDaEdge());
  });

  it.each(funcoes)("%s: os mesmos valores que LIMITES_ANEXOS do cliente (conviteAnexos.ts)", (nome) => {
    const corpo = corpoCompacto(nome);
    expect(constanteSql(corpo, "c_max_activos")).toBe(LIMITES_ANEXOS.maxActivos);
    expect(constanteSql(corpo, "c_max_bytes")).toBe(LIMITES_ANEXOS.tamanhoMaximoBytes);
    expect(constanteSql(corpo, "c_max_bytes_foto")).toBe(LIMITES_ANEXOS.fotografiaMaximaBytes);
    expect(limitesPorTipoSql(corpo)).toEqual({ ...LIMITES_ANEXOS.porTipo });
  });

  it("os valores em si: 4; 2, 1, 1; 10485760; 5242880", () => {
    expect(LIMITES_ANEXOS.maxActivos).toBe(4);
    expect({ ...LIMITES_ANEXOS.porTipo }).toEqual({ cartao_cidadao: 2, comprovativo_iban: 1, fotografia: 1 });
    expect(LIMITES_ANEXOS.tamanhoMaximoBytes).toBe(10485760);
    expect(LIMITES_ANEXOS.fotografiaMaximaBytes).toBe(5242880);
  });

  it("o tecto de reservas por pessoa em 24 h e 20 e so existe na base (uma constante nova)", () => {
    expect(constanteSql(corpoCompacto("rpc_hr_anexo_rh_reservar"), "c_max_reservas_24h")).toBe(20);
  });

  it("reservar e promover dizem o mesmo sobre os limites por tipo", () => {
    expect(limitesPorTipoSql(corpoCompacto("rpc_hr_anexo_rh_reservar"))).toEqual(
      limitesPorTipoSql(corpoCompacto("rpc_hr_anexo_rh_promover")),
    );
  });
});

describe("(d) a permissao de escrita por tipo: base e cliente", () => {
  function permissoesDoSql(): Record<string, string> {
    const corpo = corpoCompacto("hr_anexo_rh_permissao_escrita");
    const resultado: Record<string, string> = {};
    for (const m of corpo.matchAll(/WHEN '([a-z_]+)' THEN '([a-z._]+)'/g)) resultado[m[1]] = m[2];
    return resultado;
  }

  it("hr_anexo_rh_permissao_escrita e igual a PERMISSAO_ESCRITA_POR_TIPO de anexosRh.ts", () => {
    expect(permissoesDoSql()).toEqual({ ...PERMISSAO_ESCRITA_POR_TIPO });
  });

  function permissoesDeLeituraDoSql(): Record<string, string> {
    const corpo = corpoCompacto("hr_anexo_rh_permissao_leitura");
    const resultado: Record<string, string> = {};
    for (const m of corpo.matchAll(/WHEN '([a-z_]+)' THEN '([a-z._]+)'/g)) resultado[m[1]] = m[2];
    return resultado;
  }

  it("a permissao de LEITURA por tipo (exigida a substituir e remover) e a que hr-anexo-url usa para abrir o ficheiro", () => {
    const m = /PERMISSAO_POR_TIPO[^=]*=\s*\{([^}]*)\}/.exec(REGRAS_ANEXO_URL);
    expect(m).not.toBeNull();
    const daEdge: Record<string, string> = {};
    for (const t of m![1].matchAll(/([a-z_]+):\s*"([a-z._]+)"/g)) daEdge[t[1]] = t[2];
    expect(permissoesDeLeituraDoSql()).toEqual(daEdge);
  });

  it("a leitura por tipo e a do plano (cartao reveal, comprovativo bancarios.edit, fotografia view)", () => {
    expect(permissoesDeLeituraDoSql()).toEqual({
      cartao_cidadao: "hr.pessoas.identificacao.reveal",
      comprovativo_iban: "hr.pessoas.bancarios.edit",
      fotografia: "hr.pessoas.view",
    });
  });

  it("sao as tres do plano", () => {
    expect(permissoesDoSql()).toEqual({
      cartao_cidadao: "hr.pessoas.identificacao.edit",
      comprovativo_iban: "hr.pessoas.bancarios.edit",
      fotografia: "hr.pessoas.pessoais.edit",
    });
  });
});
