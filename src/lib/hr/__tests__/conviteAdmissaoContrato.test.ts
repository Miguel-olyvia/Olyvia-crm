/**
 * O TESTE QUE AMARRA OS TRES LADOS DO CONVITE DE ADMISSAO.
 *
 * PORQUE EXISTE
 * --------------
 * O convite passa por tres runtimes diferentes -- React, Deno, PostgreSQL --
 * e cada um tinha a sua ideia de como se chamavam os campos. O ecra mandava
 * `linha1`, a Edge Function reagrupava em `{ pessoas_moradas: { linha1 } }`, e
 * a RPC lia `morada_linha1`. Nenhum `->>` acertava, os `ON CONFLICT` eram
 * incondicionais, e o resultado era uma submissao que APAGAVA a ficha inteira
 * -- NIF, NISS, morada -- marcava o convite como usado e devolvia ok.
 *
 * Um compilador nunca apanharia isto: sao tres linguagens e o contrato e
 * jsonb. Por isso e um teste que le os TRES ficheiros e compara as listas.
 *
 * O que este teste cobre:
 *   1. as chaves do ecra sao exactamente as chaves da lista branca da Edge
 *      Function e exactamente as que a RPC le de `p_dados`;
 *   2. a lista declarada nao pode divergir do que a funcao de construcao
 *      devolve de facto;
 *   3. as unicas chaves que a RPC le e que o payload nao traz sao as da conta
 *      bancaria, que a Edge Function nao reencaminha por decisao pendente --
 *      e a lista dessas e fechada, para nao servir de saco de excepcoes;
 *   4. a lista de campos obrigatorios em TypeScript e a mesma que a base
 *      declara em `hr_admissao_campos_obrigatorios()`, incluindo quais sao
 *      condicionais.
 *
 * Le sempre a migration MAIS RECENTE que define cada funcao, por ordem de
 * nome -- e nao a primeira que aparecer.
 *
 * SOBRE A REGRA "nao testar SQL por texto"
 * -----------------------------------------
 * O CLAUDE.md do projecto proibe testes que facam regex sobre o texto de uma
 * migration, e com razao: nao testam comportamento e partem-se com qualquer
 * reescrita inofensiva. Este teste e a excepcao que a regra nao cobre, e vale
 * a pena dizer porque:
 *
 *   - nao testa COMPORTAMENTO de SQL nenhum -- testa que tres listas de NOMES
 *     escritas em tres linguagens dizem o mesmo. Nao ha outra forma: o
 *     contrato e jsonb e nenhum compilador o ve;
 *   - so olha para literais de chave dentro de `p_dados`. Reescrever o SQL a
 *     volta nao o parte; mudar um nome de chave num lado so, sim -- e e isso
 *     que se quer;
 *   - o comportamento propriamente dito (as escritas preservarem, o portao de
 *     obrigatorios travar) e verificado do lado da base, no bloco de conferir
 *     da propria migration, que corre contra o Postgres a serio no `db push`.
 */
import { describe, expect, it } from "vitest";
import {
  CHAVES_PAYLOAD_CONVITE,
  RASCUNHO_CONVITE_VAZIO,
  construirPayloadConvite,
} from "@/lib/hr/conviteAdmissaoPayload";
import {
  CAMPOS_OBRIGATORIOS_ADMISSAO,
  campoEhObrigatorio,
  type CodigoCampoObrigatorioAdmissao,
  type RascunhoConviteObrigatorios,
} from "@/lib/hr/admissaoObrigatorios";

// Os ficheiros dos outros dois lados entram por `import.meta.glob` e nao por
// `node:fs`: o tsconfig da aplicacao nao tem os tipos do Node, e um teste que
// so passa a typecheck com uma dependencia nova nao vale o que custa.
const MIGRATIONS = import.meta.glob("../../../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const EDGE = Object.values(
  import.meta.glob("../../../../supabase/functions/convite-admissao/index.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

/**
 * As chaves que a RPC le e que NENHUM payload traz: o ramo da conta bancaria,
 * inalcancavel enquanto nao estiver decidido se um token valido substitui a
 * permissao do utilizador para escrever o IBAN. A lista e comparada por
 * igualdade, nao por "contem": uma excepcao nova tem de ser escrita aqui de
 * propria mao, com esta explicacao a frente.
 */
const CHAVES_SO_DA_RPC = [
  "conta_agencia",
  "conta_banco",
  "conta_swift",
  "conta_titular",
  "iban",
] as const;

const SO_DA_RPC = new Set<string>(CHAVES_SO_DA_RPC);

/** So o CREATE conta -- um DROP ou uma linha de comentario nao definem nada. */
function padraoDeCriacao(nomeFuncao: string): RegExp {
  return new RegExp("CREATE (?:OR REPLACE )?FUNCTION public\\." + nomeFuncao + "\\(");
}

/** A migration mais recente (por nome) que define esta funcao. */
function migrationQueDefine(nomeFuncao: string): string {
  const padrao = padraoDeCriacao(nomeFuncao);
  const candidatas = Object.keys(MIGRATIONS)
    .sort()
    .filter((ficheiro) => padrao.test(MIGRATIONS[ficheiro]));
  if (candidatas.length === 0) {
    throw new Error(`Nenhuma migration define public.${nomeFuncao}.`);
  }
  return MIGRATIONS[candidatas[candidatas.length - 1]];
}

/** O corpo entre `AS $$` e o `$$;` seguinte, a partir da definicao da funcao. */
function corpoDaFuncao(sql: string, nomeFuncao: string): string {
  const inicio = sql.search(padraoDeCriacao(nomeFuncao));
  const abre = sql.indexOf("AS $$", inicio);
  const fecha = sql.indexOf("$$;", abre);
  if (inicio < 0 || abre < 0 || fecha < 0) {
    throw new Error(`Nao consegui isolar o corpo de public.${nomeFuncao}.`);
  }
  return sql.slice(abre, fecha);
}

/** Todas as chaves de jsonb que o corpo da RPC vai buscar a `p_dados`. */
function chavesLidasPelaRpc(corpo: string): string[] {
  const chaves = new Set<string>();

  // hr_json_texto(p_dados, 'x') / p_dados ->> 'x' / p_dados ? 'x'
  const directas = /(?:hr_json_texto\(p_dados,\s*|p_dados\s*(?:->>|\?)\s*)'([a-z0-9_]+)'/g;
  for (const m of corpo.matchAll(directas)) chaves.add(m[1]);

  // p_dados ?| ARRAY[ 'a','b', ... ] -- as guardas de bloco, multi-linha
  const listas = /p_dados\s*\?\|\s*ARRAY\[([^\]]*)\]/g;
  for (const lista of corpo.matchAll(listas)) {
    for (const m of lista[1].matchAll(/'([a-z0-9_]+)'/g)) chaves.add(m[1]);
  }

  return [...chaves].sort();
}

/** A lista branca da Edge Function. */
function chavesDaEdgeFunction(): string[] {
  const bloco = /const CAMPOS_CONVITE = \[([^\]]*)\] as const;/.exec(EDGE);
  if (!bloco) throw new Error("Nao encontrei CAMPOS_CONVITE na Edge Function.");
  return [...bloco[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]).sort();
}

const esperadas = [...CHAVES_PAYLOAD_CONVITE].sort();

describe("o contrato de chaves do convite de admissao", () => {
  it("a lista declarada e exactamente o que o ecra constroi", () => {
    const construidas = Object.keys(construirPayloadConvite(RASCUNHO_CONVITE_VAZIO)).sort();
    expect(construidas).toEqual(esperadas);
  });

  it("o payload traz SEMPRE todas as chaves, mesmo em branco", () => {
    // Uma chave ausente diz a RPC "preserva o que la esta"; uma chave a null
    // diz "limpa". Se o ecra deixasse de mandar as vazias, um campo apagado de
    // proposito nunca chegaria a ser apagado.
    const payload = construirPayloadConvite(RASCUNHO_CONVITE_VAZIO);
    for (const chave of esperadas) {
      expect(Object.prototype.hasOwnProperty.call(payload, chave)).toBe(true);
    }
  });

  it("a lista branca da Edge Function e a mesma", () => {
    expect(chavesDaEdgeFunction()).toEqual(esperadas);
  });

  it("a RPC de submeter le exactamente essas chaves, mais as da conta bancaria", () => {
    const sql = migrationQueDefine("rpc_hr_convite_admissao_submeter");
    const lidas = chavesLidasPelaRpc(corpoDaFuncao(sql, "rpc_hr_convite_admissao_submeter"));

    const doContrato = lidas.filter((c) => !SO_DA_RPC.has(c));
    const foraDoContrato = lidas.filter((c) => SO_DA_RPC.has(c));

    expect(doContrato).toEqual(esperadas);
    // Igualdade, nao "contem": a lista de excepcoes e fechada.
    expect(foraDoContrato).toEqual([...CHAVES_SO_DA_RPC].sort());
  });

  it("nenhuma chave do contrato fica so num dos lados", () => {
    const edge = new Set(chavesDaEdgeFunction());
    const sql = migrationQueDefine("rpc_hr_convite_admissao_submeter");
    const rpc = new Set(chavesLidasPelaRpc(corpoDaFuncao(sql, "rpc_hr_convite_admissao_submeter")));

    const orfas = esperadas.filter((c) => !edge.has(c) || !rpc.has(c));
    expect(orfas).toEqual([]);
  });
});

interface CampoSql {
  codigo: string;
  origem: string;
  condicional: boolean;
}

function camposObrigatoriosDaBase(): CampoSql[] {
  const sql = migrationQueDefine("hr_admissao_campos_obrigatorios");
  const corpo = corpoDaFuncao(sql, "hr_admissao_campos_obrigatorios");
  const linhas = [...corpo.matchAll(/\('([a-z0-9_]+)',\s*'(pessoa|rh)',\s*(true|false)\)/g)];
  if (linhas.length === 0) {
    throw new Error("Nao encontrei nenhuma linha em hr_admissao_campos_obrigatorios().");
  }
  return linhas.map((m) => ({ codigo: m[1], origem: m[2], condicional: m[3] === "true" }));
}

const VAZIO_OBRIGATORIOS: RascunhoConviteObrigatorios = {
  data_nascimento: "",
  nacionalidade: "",
  telefone_pessoal: "",
  email_pessoal: "",
  estado_civil: "",
  dependentes: "",
  nif: "",
  niss: "",
  tipo_documento: "",
  numero_documento: "",
  validade_documento: "",
  linha1: "",
  codigo_postal: "",
  localidade: "",
};

describe("a lista de obrigatorios da admissao", () => {
  it("o TypeScript e a base declaram os mesmos campos de origem 'pessoa'", () => {
    const daBase = camposObrigatoriosDaBase()
      .filter((c) => c.origem === "pessoa")
      .map((c) => c.codigo)
      .sort();
    const doEcra = CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => c.codigo as string).sort();
    expect(doEcra).toEqual(daBase);
  });

  it("os campos de origem 'rh' NAO estao no formulario publico", () => {
    // Sao os que o RH preenche na retaguarda. Se aparecessem aqui, a pessoa
    // ficava presa num campo que nao ve nem pode preencher.
    const doEcra = new Set(CAMPOS_OBRIGATORIOS_ADMISSAO.map((c) => c.codigo as string));
    const rh = camposObrigatoriosDaBase().filter((c) => c.origem === "rh");
    expect(rh.length).toBeGreaterThan(0);
    for (const campo of rh) expect(doEcra.has(campo.codigo)).toBe(false);
  });

  it("os dois lados concordam em QUAIS sao condicionais", () => {
    for (const campo of camposObrigatoriosDaBase().filter((c) => c.origem === "pessoa")) {
      const codigo = campo.codigo as CodigoCampoObrigatorioAdmissao;
      // Num rascunho totalmente vazio, um campo condicional ainda nao e
      // exigido; um incondicional e-o sempre.
      const exigidoNoVazio = campoEhObrigatorio(VAZIO_OBRIGATORIOS, codigo);
      expect(exigidoNoVazio).toBe(!campo.condicional);
    }
  });
});
