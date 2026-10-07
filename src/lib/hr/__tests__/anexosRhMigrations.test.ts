/**
 * O CONTEUDO DAS TRES MIGRATIONS DOS ANEXOS PELO RH (parte A, base).
 *
 * 20261210250000  colunas origem, carregado_por, apagado_por; CHECKs que deixam o RH
 *                 ter anexos sem convite; as colunas novas continuam fechadas
 * 20261210260000  cinco RPCs so service_role (reservar, contexto, promover,
 *                 descartar, remover) e duas internas (permissao e autorizar)
 * 20261210270000  D1-A: o ficheiro do convite substitui o que o RH ja tinha anexado
 *
 * Excepcao deliberada a regra "nao testar SQL por texto" (a mesma de
 * loteCAnexosMigrations.test.ts): isto NAO testa comportamento de SQL -- esse fica
 * nos blocos de conferir das proprias migrations, que correm contra o Postgres no
 * `db push`. Testa o que nenhum compilador ve e que se desfaz em silencio quando um
 * lado muda e o outro nao: privilegios que nao podem alargar, a ordem das recusas,
 * a ordem das escritas (avatar a NULL antes de apagar), a auditoria com o utilizador
 * real e que a funcao do convite continua a copia da anterior com so a mudanca dita.
 */
import { describe, expect, it } from "vitest";
import {
  corpoDaFuncao,
  migrationPorVersao,
  migrationQueDefine,
  semComentarios,
  temComando,
} from "./migrationSql";

const M5 = migrationPorVersao("20261210050000");
const M7 = migrationPorVersao("20261210070000");
const M250 = migrationPorVersao("20261210250000");
const M260 = migrationPorVersao("20261210260000");
const M270 = migrationPorVersao("20261210270000");

function compacto(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/** Corpo sem comentarios, numa linha: os testes olham para o codigo, nao para a prosa. */
function codigoDe(sql: string, funcao: string): string {
  return compacto(semComentarios(corpoDaFuncao(sql, funcao)));
}

const RPCS = [
  { nome: "rpc_hr_anexo_rh_reservar", args: "uuid, uuid, text, text, bigint, text, uuid" },
  { nome: "rpc_hr_anexo_rh_contexto", args: "uuid, uuid" },
  { nome: "rpc_hr_anexo_rh_promover", args: "uuid, uuid, text, text, bigint, text, uuid" },
  { nome: "rpc_hr_anexo_rh_descartar", args: "uuid, uuid, text" },
  { nome: "rpc_hr_anexo_rh_remover", args: "uuid, uuid" },
] as const;

const INTERNAS = [
  "hr_anexo_rh_permissao_escrita",
  "hr_anexo_rh_autorizar",
  "hr_anexo_rh_permissao_leitura",
  "hr_anexo_rh_autorizar_leitura",
] as const;

const COLUNAS_CONCEDIDAS = [
  "id",
  "organization_id",
  "pessoa_id",
  "tipo",
  "estado",
  "nome_original",
  "mime_type",
  "tamanho_bytes",
  "promovido_em",
  "criado_em",
];
const COLUNAS_NOVAS = ["origem", "carregado_por", "apagado_por"];

function listaDeTexto(sql: string, nomeVariavel: string): string[] {
  const m = new RegExp(`${nomeVariavel}\\s+text\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]*)\\]`).exec(sql);
  if (!m) throw new Error(`Nao encontrei o array ${nomeVariavel}.`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe("todas as migrations desta parte", () => {
  const todas = { "250000": M250, "260000": M260, "270000": M270 };

  it.each(Object.entries(todas))("%s usa CRLF em todas as linhas", (_nome, sql) => {
    expect(sql).toContain("\r\n");
    expect(/(?<!\r)\n/.test(sql)).toBe(false);
  });

  it.each(Object.entries(todas))("%s nunca desactiva triggers nem traz reversao", (_nome, sql) => {
    const codigo = semComentarios(sql);
    expect(/DISABLE\s+TRIGGER/i.test(codigo)).toBe(false);
    expect(/session_replication_role/i.test(codigo)).toBe(false);
  });

  it.each(Object.entries(todas))("%s diz no cabecalho que precisa de codigo novo", (_nome, sql) => {
    const cabecalho = sql.slice(0, sql.indexOf("-- ---- Guardas"));
    expect(cabecalho).toMatch(/PRECISA DE CODIGO NOVO/);
    expect(cabecalho).toMatch(/hr-anexo-rh/);
  });

  it.each(Object.entries(todas))("%s acaba com conferir ao vivo e a sentinela HR900", (_nome, sql) => {
    expect(sql).toMatch(/ERRCODE\s*=\s*'HR900'/);
    expect(sql).toMatch(/WHEN SQLSTATE 'HR900' THEN/);
    expect(sql).toMatch(/b6ffce4f-f630-4933-833a-008649757a33/);
  });

  it.each(Object.entries(todas))(
    "%s nao concatena colunas do catalogo sem ::text (contype, relkind, typtype)",
    (_nome, sql) => {
      const codigo = semComentarios(sql);
      expect(/\|\|\s*\w*\.?(contype|relkind|typtype)\s*(\|\||\))/.test(codigo)).toBe(false);
    },
  );
});

describe("o conferir ao vivo das tres migrations fabrica a pessoa como o trigger de cargos exige (HRC08)", () => {
  const todas = { "250000": M250, "260000": M260, "270000": M270 };

  it.each(Object.entries(todas))("%s: todo o INSERT INTO public.pessoas ( leva cargo_id", (_nome, sql) => {
    const inserts = [...semComentarios(sql).matchAll(/INSERT INTO public\.pessoas\s*\(([^)]*)\)/g)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const m of inserts) expect(m[1]).toMatch(/\bcargo_id\b/);
  });

  it.each(Object.entries(todas))(
    "%s: cria antes um cargo de teste na nike com nome unico (hr_cargo_nome_chave) e passa a data_admissao",
    (_nome, sql) => {
      const codigo = compacto(semComentarios(sql));
      const cargo = codigo.indexOf("INSERT INTO public.hr_cargos (");
      const pessoa = codigo.indexOf("INSERT INTO public.pessoas (");
      expect(cargo).toBeGreaterThan(-1);
      expect(cargo).toBeLessThan(pessoa);
      const insercaoCargo = codigo.slice(cargo, pessoa);
      expect(insercaoCargo).toMatch(/gen_random_uuid\(\)/);
      expect(insercaoCargo).toContain("v_org_nike");
      expect(codigo.slice(pessoa, pessoa + 260)).toMatch(/cargo_id, data_admissao/);
    },
  );
});

describe("20261210250000 -- a tabela passa a aceitar o RH", () => {
  const codigo = semComentarios(M250);

  it("acrescenta origem (convite por omissao), carregado_por e apagado_por", () => {
    expect(codigo).toMatch(/ADD COLUMN IF NOT EXISTS origem\s+text\s+NOT NULL\s+DEFAULT 'convite'/);
    expect(codigo).toMatch(/ADD COLUMN IF NOT EXISTS carregado_por\s+uuid/);
    expect(codigo).toMatch(/ADD COLUMN IF NOT EXISTS apagado_por\s+uuid/);
  });

  it("origem so aceita convite e rh", () => {
    expect(compacto(codigo)).toMatch(
      /pessoas_anexos_origem_valida CHECK \(origem IN \('convite', 'rh'\)\)/,
    );
  });

  it("pessoas_anexos_activo_tem_convite e reescrita com o mesmo nome: ligado exige convite, pendente convite ou rh", () => {
    const c = compacto(codigo);
    expect(c).toMatch(/DROP CONSTRAINT IF EXISTS pessoas_anexos_activo_tem_convite/);
    const m = /ADD CONSTRAINT pessoas_anexos_activo_tem_convite CHECK \((.*?)\);/.exec(c);
    expect(m).not.toBeNull();
    const definicao = m![1];
    expect(definicao).toContain("'ligado'");
    expect(definicao).toContain("'pendente'");
    expect(definicao).toContain("convite_id IS NOT NULL");
    expect(definicao).toContain("origem = 'rh'");
  });

  it("um anexo do RH nunca tem convite e tem sempre autor", () => {
    const c = compacto(codigo);
    expect(c).toMatch(
      /ADD CONSTRAINT pessoas_anexos_rh_sem_convite CHECK \(origem <> 'rh' OR convite_id IS NULL\)/,
    );
    expect(c).toMatch(
      /ADD CONSTRAINT pessoas_anexos_rh_tem_autor CHECK \(origem <> 'rh' OR carregado_por IS NOT NULL\)/,
    );
  });

  it("conta as linhas que violariam antes de cada ADD de CHECK", () => {
    const idxContagem = M250.indexOf("violariam");
    expect(idxContagem).toBeGreaterThan(-1);
    const adds = [...compacto(codigo).matchAll(/ADD CONSTRAINT (pessoas_anexos_\w+) CHECK/g)].map(
      (m) => m[1],
    );
    expect(adds).toEqual(
      expect.arrayContaining([
        "pessoas_anexos_activo_tem_convite",
        "pessoas_anexos_rh_sem_convite",
        "pessoas_anexos_rh_tem_autor",
      ]),
    );
    // Cada contagem tem de vir antes do ADD do mesmo CHECK.
    for (const nome of [
      "pessoas_anexos_activo_tem_convite",
      "pessoas_anexos_rh_sem_convite",
      "pessoas_anexos_rh_tem_autor",
    ]) {
      const contagem = codigo.indexOf(`v_viola_${nome.replace("pessoas_anexos_", "")}`);
      const adicao = codigo.indexOf(`ADD CONSTRAINT ${nome}`);
      expect(contagem, `contagem de ${nome}`).toBeGreaterThan(-1);
      expect(contagem).toBeLessThan(adicao);
    }
  });

  it("mantem o CHECK da quarentena (admissao/%) como esta", () => {
    expect(codigo).not.toMatch(/DROP CONSTRAINT IF EXISTS pessoas_anexos_quarentena_caminho_formato/);
  });

  it("cria o indice parcial (pessoa_id, tipo) de promovidos e de pendentes do RH", () => {
    const c = compacto(codigo);
    expect(c).toMatch(/CREATE INDEX IF NOT EXISTS \w+ ON public\.pessoas_anexos \(pessoa_id, tipo\)/);
    expect(c).toMatch(/WHERE estado = 'promovido' OR \(estado = 'pendente' AND origem = 'rh'\)/);
  });

  it("nao concede nada a authenticated nem a anon (as colunas novas ficam fechadas)", () => {
    expect(/GRANT\b[^;]*\bTO\s+(authenticated|anon)/i.test(codigo)).toBe(false);
    expect(/GRANT\s+SELECT\s*\(/i.test(codigo)).toBe(false);
  });

  it("o conferir compara as 10 colunas concedidas, as mesmas de 050000, e fecha as 3 novas", () => {
    const concedidasM5 = /GRANT SELECT \(([^)]*)\)\s*ON TABLE public\.pessoas_anexos TO authenticated/
      .exec(M5)![1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    expect(concedidasM5).toEqual(COLUNAS_CONCEDIDAS);

    expect(listaDeTexto(M250, "v_concedidas")).toEqual(COLUNAS_CONCEDIDAS);

    const proibidas = listaDeTexto(M250, "v_proibidas");
    for (const nova of COLUNAS_NOVAS) expect(proibidas).toContain(nova);
    // Nenhuma das concedidas pode estar entre as proibidas.
    for (const c of COLUNAS_CONCEDIDAS) expect(proibidas).not.toContain(c);

    // E percorre TODAS as colunas da tabela (apanha uma coluna futura).
    expect(M250).toMatch(/FOR v_col IN\s+SELECT a\.attname::text FROM pg_attribute a/);
    expect(M250).toMatch(/has_column_privilege\('authenticated', 'public\.pessoas_anexos', v_col, 'SELECT'\)/);
  });

  it("o conferir exige zero escrita para authenticated e anon e uma so politica de SELECT", () => {
    expect(M250).toMatch(/has_table_privilege\('authenticated', 'public\.pessoas_anexos', 'INSERT'\)/);
    expect(M250).toMatch(/has_table_privilege\('authenticated', 'public\.pessoas_anexos', 'UPDATE'\)/);
    expect(M250).toMatch(/has_table_privilege\('authenticated', 'public\.pessoas_anexos', 'DELETE'\)/);
    expect(M250).toMatch(/has_table_privilege\('anon', 'public\.pessoas_anexos', 'INSERT'\)/);
    expect(M250).toMatch(/pg_policies/);
    expect(M250).toMatch(/UMA politica/);
  });

  it("as guardas exigem 'rh' e 'substituido' no CHECK dos motivos e a auditoria de 5 argumentos", () => {
    const guardas = M250.slice(M250.indexOf("DO $guardas$"), M250.indexOf("$guardas$;"));
    expect(guardas).toMatch(/pessoas_anexos_motivo_valido/);
    expect(guardas).toMatch(/'rh'/);
    expect(guardas).toMatch(/'substituido'/);
    expect(guardas).toMatch(/hr_registar_acesso_sensivel\(uuid, uuid, text, text, uuid\)/);
    expect(guardas).toMatch(/caminho_quarentena/);
    expect(guardas).toMatch(/hr\.pessoas\.identificacao\.edit/);
    expect(guardas).toMatch(/hr\.pessoas\.pessoais\.edit/);
  });

  it("o conferir ao vivo prova os quatro recusos pelo nome do CHECK, so na nike", () => {
    const vivo = M250.slice(M250.indexOf("DO $conferir_vivo$"));
    expect(vivo).toMatch(/CONSTRAINT_NAME/);
    for (const nome of [
      "pessoas_anexos_activo_tem_convite",
      "pessoas_anexos_rh_sem_convite",
      "pessoas_anexos_rh_tem_autor",
      "pessoas_anexos_origem_valida",
    ]) {
      expect(vivo, nome).toContain(nome);
    }
    expect(vivo).toMatch(/v_org_nike\s+uuid := 'b6ffce4f-f630-4933-833a-008649757a33'/);
  });
});

describe("20261210260000 -- as cinco RPCs", () => {
  const codigo = semComentarios(M260);

  it.each(RPCS)("$nome: SECURITY DEFINER, search_path fixo e devolve jsonb", ({ nome }) => {
    const inicio = M260.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}\\(`));
    expect(inicio).toBeGreaterThan(-1);
    const cabeca = M260.slice(inicio, M260.indexOf("AS $$", inicio));
    expect(cabeca).toMatch(/RETURNS jsonb/);
    expect(cabeca).toMatch(/SECURITY DEFINER/);
    expect(cabeca).toMatch(/SET search_path TO 'public', 'pg_temp'/);
    // A organizacao nunca entra por parametro: le-se da linha.
    expect(cabeca).not.toMatch(/p_org\b|p_organization_id|p_organizacao/);
  });

  it.each(RPCS)("$nome: EXECUTE so para service_role", ({ nome, args }) => {
    const assinatura = `public.${nome}(${args})`;
    expect(temComando(M260, `REVOKE ALL ON FUNCTION ${assinatura} FROM PUBLIC;`)).toBe(true);
    expect(temComando(M260, `REVOKE ALL ON FUNCTION ${assinatura} FROM anon;`)).toBe(true);
    expect(temComando(M260, `REVOKE ALL ON FUNCTION ${assinatura} FROM authenticated;`)).toBe(true);
    expect(temComando(M260, `GRANT EXECUTE ON FUNCTION ${assinatura} TO service_role;`)).toBe(true);
  });

  it("nenhum GRANT desta migration chega a authenticated, anon ou PUBLIC", () => {
    expect(/GRANT\b[^;]*\bTO\s+(authenticated|anon|PUBLIC)\b/i.test(codigo)).toBe(false);
  });

  it.each(RPCS)("$nome: guarda de service_role e sem_sessao no inicio do corpo", ({ nome }) => {
    const corpo = codigoDe(M260, nome);
    expect(corpo).toContain("request.jwt.claims");
    expect(corpo).toMatch(/IS DISTINCT FROM 'service_role'/);
    expect(corpo).toContain("HR911");
    expect(corpo).toMatch(/p_auth_uid IS NULL/);
    expect(corpo).toContain("'sem_sessao'");
    // A guarda vem antes de qualquer leitura de dados.
    expect(corpo.indexOf("HR911")).toBeLessThan(corpo.indexOf("FROM public."));
    expect(corpo.indexOf("'sem_sessao'")).toBeLessThan(corpo.indexOf("FROM public."));
  });

  it.each(RPCS)("$nome: autoriza com hr_anexo_rh_autorizar contra a organizacao lida da linha", ({ nome }) => {
    const corpo = codigoDe(M260, nome);
    expect(corpo).toMatch(/hr_anexo_rh_autorizar\(p_auth_uid, v_org, /);
  });

  it("a mensagem da guarda e a do precedente (20261130065000)", () => {
    expect(M260).toContain("p_auth_uid so pode ser fornecido por service_role.");
  });

  it("reservar: a ordem das recusas e a do plano", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_reservar");
    const ordem = [
      "FROM public.pessoas WHERE id = p_pessoa_id FOR NO KEY UPDATE",
      "'pessoa_nao_encontrada'",
      "hr_anexo_rh_autorizar(",
      "'anexo_tipo_invalido'",
      "'anexo_formato_invalido'",
      "'anexo_fotografia_formato'",
      "'anexo_vazio'",
      "'anexo_fotografia_demasiado_grande'",
      "'anexo_demasiado_grande'",
      "hr_anexo_rh_autorizar_leitura(",
      "'anexo_substituto_invalido'",
      "'anexo_maximo_ficheiros'",
      "'anexo_tipo_cheio'",
      "'anexo_limite_pessoa'",
      "INSERT INTO public.pessoas_anexos",
    ];
    let anterior = -1;
    for (const marca of ordem) {
      const pos = corpo.indexOf(marca);
      expect(pos, marca).toBeGreaterThan(-1);
      expect(pos, `${marca} depois do anterior`).toBeGreaterThan(anterior);
      anterior = pos;
    }
  });

  it("reservar: constantes, caminho de quarentena do RH e autor", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_reservar");
    expect(corpo).toMatch(/c_max_activos constant integer := 4/);
    expect(corpo).toMatch(/c_max_bytes constant bigint := 10485760/);
    expect(corpo).toMatch(/c_max_bytes_foto constant bigint := 5242880/);
    expect(corpo).toMatch(/c_max_reservas_24h constant integer := 20/);
    expect(corpo).toMatch(/'admissao\/rh\/'/);
    expect(corpo).toMatch(/'rh'/);
    expect(corpo).toMatch(/carregado_por/);
    expect(corpo).toMatch(/p_auth_uid/);
    expect(corpo).toMatch(/interval '24 hours'/);
    // Os activos nao incluem os pendentes nem os ligados de um convite.
    expect(corpo).toMatch(
      /estado = 'promovido' OR \(\w*\.?estado = 'pendente' AND \w*\.?origem = 'rh' AND \w*\.?criado_em > now\(\) - interval '2 hours'\)/,
    );
  });

  it("reservar e promover deixam de contar os pendentes do RH com mais de 2 horas (abandonados), menos o proprio que se promove", () => {
    const reservar = codigoDe(M260, "rpc_hr_anexo_rh_reservar");
    const promover = codigoDe(M260, "rpc_hr_anexo_rh_promover");
    expect(reservar).toMatch(/origem = 'rh' AND a\.criado_em > now\(\) - interval '2 hours'\)\)/);
    expect(promover).toMatch(
      /origem = 'rh' AND \(a\.id = v_anexo\.id OR a\.criado_em > now\(\) - interval '2 hours'\)\)\)/,
    );
    // O tecto de 24 horas continua a contar tudo, apagadas incluidas.
    expect(reservar).toMatch(/a\.origem = 'rh' AND a\.criado_em > now\(\) - interval '24 hours'/);
  });

  it("contexto: so quem reservou, e so um pendente do RH", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_contexto");
    expect(corpo).toMatch(/origem <> 'rh'/);
    expect(corpo).toMatch(/carregado_por IS DISTINCT FROM p_auth_uid/);
    expect(corpo.indexOf("'anexo_nao_encontrado'")).toBeLessThan(corpo.indexOf("'anexo_estado_invalido'"));
    expect(corpo.indexOf("'anexo_estado_invalido'")).toBeLessThan(corpo.indexOf("hr_anexo_rh_autorizar("));
  });

  it("promover: bloqueia a pessoa e depois a linha, na mesma ordem em que reservar e remover", () => {
    for (const nome of ["rpc_hr_anexo_rh_promover", "rpc_hr_anexo_rh_remover"]) {
      const corpo = codigoDe(M260, nome);
      const pessoa = corpo.indexOf("FROM public.pessoas WHERE id = v_pessoa_id FOR NO KEY UPDATE");
      const anexo = corpo.indexOf("FROM public.pessoas_anexos a WHERE a.id = p_anexo_id FOR UPDATE");
      expect(pessoa, `${nome}: pessoa`).toBeGreaterThan(-1);
      expect(anexo, `${nome}: anexo`).toBeGreaterThan(pessoa);
    }
  });

  it("promover: repete mime, tamanho, hash e o caminho final exacto antes de escrever", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_promover");
    const primeiraEscrita = corpo.indexOf("UPDATE public.pessoas_anexos");
    for (const marca of [
      "'anexo_formato_invalido'",
      "'anexo_fotografia_formato'",
      "'anexo_vazio'",
      "'anexo_fotografia_demasiado_grande'",
      "'anexo_demasiado_grande'",
      "'anexo_substituto_invalido'",
      "'anexo_maximo_ficheiros'",
      "'anexo_tipo_cheio'",
    ]) {
      const pos = corpo.indexOf(marca);
      expect(pos, marca).toBeGreaterThan(-1);
      expect(pos, `${marca} antes da escrita`).toBeLessThan(primeiraEscrita);
    }
    expect(corpo).toMatch(/p_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(corpo).toMatch(/p_caminho_final IS DISTINCT FROM v_esperado/);
    expect(corpo).toMatch(/'\/admissao\/'/);
    // O proprio pendente ja conta: recusa so se PASSOU do limite.
    expect(corpo).toMatch(/v_activos > c_max_activos/);
    expect(corpo).toMatch(/v_do_tipo > v_limite_tipo/);
  });

  it("promover: a ordem das escritas e linha, avatar, substituto, auditoria", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_promover");
    const ordem = [
      "UPDATE public.pessoas_anexos SET estado = 'promovido'",
      "UPDATE public.pessoas SET fotografia_anexo_id = ",
      "SET estado = 'apagado', apagado_motivo = 'substituido'",
      "hr_registar_acesso_sensivel(",
    ];
    let anterior = -1;
    for (const marca of ordem) {
      const pos = corpo.indexOf(marca);
      expect(pos, marca).toBeGreaterThan(-1);
      expect(pos, marca).toBeGreaterThan(anterior);
      anterior = pos;
    }
    expect(corpo).toMatch(/ligado_em = now\(\), promovido_em = now\(\)/);
    expect(corpo).toMatch(/apagado_por = p_auth_uid/);
  });

  it("promover audita 'alterar' com p_auth_uid (cartao e comprovativo), e a falha da auditoria falha tudo", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_promover");
    expect(corpo).toMatch(
      /hr_registar_acesso_sensivel\(\s*v_pessoa_id,\s*v_org,\s*[^;]*'alterar',\s*p_auth_uid\s*\)/,
    );
    expect(corpo).toContain("anexo_cartao_cidadao");
    expect(corpo).toContain("anexo_comprovativo_iban");
    expect(corpo).not.toMatch(/EXCEPTION WHEN OTHERS/i);
  });

  it("remover poe fotografia_anexo_id a NULL ANTES de marcar o anexo apagado", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_remover");
    const avatar = corpo.indexOf("UPDATE public.pessoas SET fotografia_anexo_id = NULL");
    const apagar = corpo.indexOf("UPDATE public.pessoas_anexos SET estado = 'apagado'");
    expect(avatar).toBeGreaterThan(-1);
    expect(apagar).toBeGreaterThan(avatar);
    // So limpa o avatar se for ESTE anexo.
    expect(corpo).toMatch(/fotografia_anexo_id = p_anexo_id/);
    expect(corpo).toMatch(/apagado_motivo = 'rh'/);
    expect(corpo).toMatch(/apagado_por = p_auth_uid/);
  });

  it("remover audita 'alterar' com p_auth_uid e aceita promovido de qualquer origem ou pendente do proprio RH", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_remover");
    expect(corpo).toMatch(/hr_registar_acesso_sensivel\(\s*v_pessoa_id,\s*v_org,\s*[^;]*'alterar',\s*p_auth_uid\s*\)/);
    expect(corpo).toContain("anexo_cartao_cidadao");
    expect(corpo).toContain("anexo_comprovativo_iban");
    expect(corpo).toMatch(/'promovido'/);
    expect(corpo).toMatch(/origem = 'rh'/);
    expect(corpo).toMatch(/carregado_por = p_auth_uid/);
    expect(corpo).not.toMatch(/EXCEPTION WHEN OTHERS/i);
  });

  it("descartar: so tres motivos, so pendente do proprio RH, promovido recusado", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_descartar");
    expect(corpo).toMatch(
      /NOT IN \('upload_abandonado', 'formato_invalido', 'demasiado_grande'\)/,
    );
    expect(corpo).toContain("'pedido_invalido'");
    expect(corpo).toMatch(/carregado_por IS DISTINCT FROM p_auth_uid/);
    expect(corpo).toMatch(/estado = 'promovido'/);
    expect(corpo).toContain("'anexo_estado_invalido'");
  });

  it("a pessoa bloqueia-se com FOR NO KEY UPDATE (FOR UPDATE travava as chaves estrangeiras de quem escreve na ficha)", () => {
    expect(/FROM public\.pessoas\b[^;]*\bFOR UPDATE\b/.test(codigo)).toBe(false);
    for (const nome of ["rpc_hr_anexo_rh_reservar", "rpc_hr_anexo_rh_promover", "rpc_hr_anexo_rh_remover"]) {
      expect(codigoDe(M260, nome), nome).toMatch(/FROM public\.pessoas WHERE id = \w+ FOR NO KEY UPDATE/);
    }
  });

  it("substituir e remover exigem tambem a permissao de LEITURA do tipo, depois da de escrita", () => {
    const reservar = codigoDe(M260, "rpc_hr_anexo_rh_reservar");
    expect(reservar).toMatch(
      /IF p_substitui_anexo_id IS NOT NULL THEN v_erro := public\.hr_anexo_rh_autorizar_leitura\(p_auth_uid, v_org, p_tipo\); IF v_erro IS NOT NULL THEN RETURN jsonb_build_object\('erro', v_erro\);/,
    );
    const promover = codigoDe(M260, "rpc_hr_anexo_rh_promover");
    expect(promover).toMatch(
      /IF p_substitui_anexo_id IS NOT NULL THEN v_erro := public\.hr_anexo_rh_autorizar_leitura\(p_auth_uid, v_org, v_anexo\.tipo\);/,
    );
    expect(promover.indexOf("hr_anexo_rh_autorizar_leitura(")).toBeLessThan(promover.indexOf("UPDATE public.pessoas_anexos"));

    const remover = codigoDe(M260, "rpc_hr_anexo_rh_remover");
    const escrita = remover.indexOf("hr_anexo_rh_autorizar(p_auth_uid, v_org, ");
    const leitura = remover.indexOf("hr_anexo_rh_autorizar_leitura(p_auth_uid, v_org, v_anexo.tipo)");
    expect(escrita).toBeGreaterThan(-1);
    expect(leitura).toBeGreaterThan(escrita);
    expect(leitura).toBeLessThan(remover.indexOf("UPDATE public.pessoas SET fotografia_anexo_id = NULL"));
  });

  it("remover: um anexo inexistente, apagado ou de outra organizacao respondem o MESMO codigo (anexo_nao_encontrado)", () => {
    const corpo = codigoDe(M260, "rpc_hr_anexo_rh_remover");
    expect(corpo).toMatch(
      /IF v_erro = 'pessoa_nao_encontrada' THEN RETURN jsonb_build_object\('erro', 'anexo_nao_encontrado'\);/,
    );
    // E nunca devolve pessoa_nao_encontrada a quem pede um anexo.
    expect(corpo).not.toMatch(/'erro', 'pessoa_nao_encontrada'/);
  });

  it("ao apagar (substituir e remover) a linha perde o nome do ficheiro e o hash, e guarda quando, quem e porque", () => {
    const anonimiza = /nome_original = 'apagado', hash_sha256 = NULL/;
    const promover = codigoDe(M260, "rpc_hr_anexo_rh_promover");
    const remover = codigoDe(M260, "rpc_hr_anexo_rh_remover");
    expect(promover).toMatch(
      /SET estado = 'apagado', apagado_motivo = 'substituido', apagado_por = p_auth_uid, apagado_em = now\(\), nome_original = 'apagado', hash_sha256 = NULL/,
    );
    expect(remover).toMatch(
      /SET estado = 'apagado', apagado_motivo = 'rh', apagado_por = p_auth_uid, apagado_em = now\(\), nome_original = 'apagado', hash_sha256 = NULL/,
    );
    expect(promover).toMatch(anonimiza);
    expect(remover).toMatch(anonimiza);
  });

  it("nenhum corpo de RPC usa EXCEPTION WHEN OTHERS", () => {
    for (const { nome } of RPCS) {
      expect(codigoDe(M260, nome), nome).not.toMatch(/EXCEPTION WHEN OTHERS/i);
    }
  });

  it("os literais com % nos RAISE estao escapados (%%)", () => {
    // Um % solto num RAISE sem argumentos rebenta ao correr; so os RAISE do conferir levam argumentos.
    for (const m of semComentarios(M260).matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'\s*;/g)) {
      expect(m[1].replace(/%%/g, ""), m[1]).not.toContain("%");
    }
  });
});

describe("20261210260000 -- as duas funcoes internas", () => {
  it.each(INTERNAS)("%s: sem EXECUTE para ninguem (nem service_role)", (nome) => {
    const codigo = semComentarios(M260);
    const padrao = new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\([^)]*\\) FROM (PUBLIC|anon|authenticated|service_role);`, "g");
    const revogados = [...codigo.matchAll(padrao)].map((m) => m[1]).sort();
    expect(revogados).toEqual(["PUBLIC", "anon", "authenticated", "service_role"].sort());
    expect(new RegExp(`GRANT[^;]*${nome}`).test(codigo)).toBe(false);
  });

  it("hr_anexo_rh_permissao_escrita e IMMUTABLE e devolve NULL para um tipo desconhecido", () => {
    const inicio = M260.search(/CREATE OR REPLACE FUNCTION public\.hr_anexo_rh_permissao_escrita\(/);
    const cabeca = M260.slice(inicio, M260.indexOf("AS $$", inicio));
    expect(cabeca).toMatch(/IMMUTABLE/);
    expect(codigoDe(M260, "hr_anexo_rh_permissao_escrita")).not.toMatch(/ELSE\s+'/);
  });

  it("hr_anexo_rh_permissao_leitura e IMMUTABLE e devolve NULL para um tipo desconhecido", () => {
    const inicio = M260.search(/CREATE OR REPLACE FUNCTION public\.hr_anexo_rh_permissao_leitura\(/);
    expect(inicio).toBeGreaterThan(-1);
    const cabeca = M260.slice(inicio, M260.indexOf("AS $$", inicio));
    expect(cabeca).toMatch(/IMMUTABLE/);
    expect(codigoDe(M260, "hr_anexo_rh_permissao_leitura")).not.toMatch(/ELSE\s+'/);
  });

  it("hr_anexo_rh_autorizar_leitura: sem a permissao de leitura do tipo devolve sem_permissao (o codigo que ja existia)", () => {
    const corpo = codigoDe(M260, "hr_anexo_rh_autorizar_leitura");
    expect(corpo).toMatch(/hr_anexo_rh_permissao_leitura\(p_tipo\)/);
    expect(corpo).toMatch(/has_anew_permission_in_org\(p_auth_uid, /);
    expect(corpo).toContain("'sem_permissao'");
    expect(corpo).not.toMatch(/pessoa_nao_encontrada/);
  });

  it("hr_anexo_rh_autorizar: sem hr.pessoas.view devolve pessoa_nao_encontrada, sem a permissao do tipo sem_permissao", () => {
    const corpo = codigoDe(M260, "hr_anexo_rh_autorizar");
    const view = corpo.indexOf("'hr.pessoas.view'");
    const naoEncontrada = corpo.indexOf("'pessoa_nao_encontrada'");
    const semPermissao = corpo.indexOf("'sem_permissao'");
    expect(view).toBeGreaterThan(-1);
    expect(naoEncontrada).toBeGreaterThan(view);
    expect(semPermissao).toBeGreaterThan(naoEncontrada);
    expect(corpo).toMatch(/has_anew_permission_in_org\(p_auth_uid, /);
    expect(corpo).toMatch(/hr_anexo_rh_permissao_escrita\(p_tipo\)/);
  });
});

describe("20261210260000 -- o conferir", () => {
  it("estrutura: confere EXECUTE das 5 RPCs e das 2 internas e a guarda e a autorizacao nos corpos", () => {
    const estrutura = M260.slice(M260.indexOf("DO $conferir$"), M260.indexOf("DO $conferir_vivo$"));
    expect(estrutura).toMatch(/has_function_privilege\('authenticated'/);
    expect(estrutura).toMatch(/has_function_privilege\('anon'/);
    expect(estrutura).toMatch(/has_function_privilege\('service_role'/);
    expect(estrutura).toMatch(/hr_anexo_rh_autorizar/);
    expect(estrutura).toMatch(/hr_anexo_rh_autorizar_leitura\(uuid, uuid, text\)/);
    expect(estrutura).toMatch(/hr_anexo_rh_permissao_leitura\(text\)/);
    expect(estrutura).toMatch(/Esperavam-se 9 funcoes/);
    expect(estrutura).toMatch(/request\.jwt\.claims/);
    // promover e remover nao podem ter a subtransaccao que engole erros: a auditoria falha tudo.
    expect(estrutura).toMatch(/LIKE '%WHEN OTHERS%'/);
  });

  it("ao vivo: cobre os casos do plano, so na nike e termina em HR900", () => {
    const vivo = M260.slice(M260.indexOf("DO $conferir_vivo$"));
    for (const marca of [
      "anexo_tipo_cheio",
      "anexo_limite_pessoa",
      "pessoa_nao_encontrada",
      "HR911",
      "'substituido'",
      "fotografia_anexo_id",
      "anexo_cartao_cidadao",
      "auth_user_id",
    ]) {
      expect(vivo, marca).toContain(marca);
    }
    expect(vivo).toMatch(/ERRCODE\s*=\s*'HR900'/);
    expect(vivo).not.toMatch(/SET LOCAL ROLE/);
  });

  it("ao vivo: sem super_admin com as permissoes AVISA com RAISE WARNING (nunca um NOTICE perdido)", () => {
    const vivo = M260.slice(M260.indexOf("DO $conferir_vivo$"));
    const salto = vivo.slice(0, vivo.indexOf("PERFORM set_config('request.jwt.claims'"));
    expect(salto).toMatch(/RAISE WARNING 'CONFERIR AO VIVO dos anexos do RH NAO CORREU/);
    expect(salto).not.toMatch(/RAISE NOTICE 'CONFERIR AO VIVO dos anexos do RH saltado/);
    expect(salto).toContain("hr.pessoas.identificacao.reveal");
  });

  it("ao vivo: prova a leitura do tipo, o anonimato do apagado e o mesmo codigo para anexo inexistente", () => {
    const vivo = M260.slice(M260.indexOf("DO $conferir_vivo$"));
    expect(vivo).toContain("hr_anexo_rh_autorizar_leitura(");
    expect(vivo).toContain("sem_permissao");
    expect(vivo).toMatch(/nome_original/);
    expect(vivo).toMatch(/hash_sha256/);
    expect(vivo).toMatch(/rpc_hr_anexo_rh_remover\(v_uid, gen_random_uuid\(\)\)/);
  });

  it("a guarda inclui hr.pessoas.identificacao.reveal no catalogo das permissoes de que dependem os anexos do RH", () => {
    const guardas = M260.slice(M260.indexOf("DO $guardas$"), M260.indexOf("$guardas$;"));
    expect(guardas).toContain("hr.pessoas.identificacao.reveal");
  });
});

describe("20261210270000 -- D1-A: o ficheiro do convite substitui o do RH", () => {
  const MARCA_INICIO = "-- >>> D1-A inicio";
  const MARCA_FIM = "-- <<< D1-A fim";

  function corpoSemBlocoNovo(): string {
    const corpo = corpoDaFuncao(M270, "hr_convite_anexos_promover");
    const i = corpo.indexOf(MARCA_INICIO);
    const f = corpo.indexOf(MARCA_FIM);
    expect(i, "marca de inicio").toBeGreaterThan(-1);
    expect(f, "marca de fim").toBeGreaterThan(i);
    return corpo.slice(0, i) + corpo.slice(f + MARCA_FIM.length);
  }

  it("o corpo e igual ao de 20261210070000 salvo o bloco novo", () => {
    const antigo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_promover")));
    const novo = compacto(semComentarios(corpoSemBlocoNovo()));
    expect(novo).toBe(antigo);
  });

  it("a assinatura e as permissoes continuam as de 070000 (interna, sem GRANT a ninguem)", () => {
    const assinatura = "public.hr_convite_anexos_promover(uuid)";
    expect(M270).toMatch(/CREATE OR REPLACE FUNCTION public\.hr_convite_anexos_promover\(p_convite_id uuid\)\s+RETURNS integer/);
    for (const quem of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(temComando(M270, `REVOKE ALL ON FUNCTION ${assinatura} FROM ${quem};`), quem).toBe(true);
    }
    expect(/GRANT[^;]*hr_convite_anexos_promover/.test(semComentarios(M270))).toBe(false);
  });

  it("mantem a subtransaccao EXCEPTION WHEN OTHERS (nunca parte a admissao)", () => {
    expect(codigoDe(M270, "hr_convite_anexos_promover")).toMatch(/EXCEPTION WHEN OTHERS THEN/);
  });

  it("o bloco novo vem depois de abandonar os pendentes e antes de promover os ligados", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M270, "hr_convite_anexos_promover")));
    const pendentes = corpo.indexOf("apagado_motivo = 'upload_abandonado'");
    const bloco = corpo.indexOf("apagado_motivo = 'substituido'");
    const promove = corpo.indexOf("WITH promovidos AS");
    expect(pendentes).toBeGreaterThan(-1);
    expect(bloco).toBeGreaterThan(pendentes);
    expect(promove).toBeGreaterThan(bloco);
  });

  it("o bloco novo respeita os limites (1, 1, 2), apaga os mais antigos primeiro e deixa apagado_por NULL", () => {
    const corpo = corpoDaFuncao(M270, "hr_convite_anexos_promover");
    const bloco = compacto(
      semComentarios(corpo.slice(corpo.indexOf(MARCA_INICIO), corpo.indexOf(MARCA_FIM))),
    );
    expect(bloco).toMatch(/WHEN 'cartao_cidadao' THEN 2/);
    expect(bloco).toMatch(/WHEN 'comprovativo_iban' THEN 1/);
    expect(bloco).toMatch(/WHEN 'fotografia' THEN 1/);
    expect(bloco).toMatch(/estado = 'ligado'/);
    expect(bloco).toMatch(/estado = 'promovido'/);
    expect(bloco).toMatch(/ORDER BY coalesce\(\w*\.?promovido_em, \w*\.?criado_em\)/);
    expect(bloco).toMatch(/apagado_motivo = 'substituido'/);
    expect(bloco).not.toMatch(/apagado_por\s*=\s*(?!NULL)/);
  });

  it("o bloco novo comeca por bloquear a pessoa (FOR NO KEY UPDATE), na ordem das RPCs do RH, antes de apagar nada", () => {
    const corpo = corpoDaFuncao(M270, "hr_convite_anexos_promover");
    const bloco = compacto(semComentarios(corpo.slice(corpo.indexOf(MARCA_INICIO), corpo.indexOf(MARCA_FIM))));
    const lock = bloco.indexOf("PERFORM 1 FROM public.pessoas WHERE id = v_pessoa FOR NO KEY UPDATE");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(bloco.indexOf("FOR v_tipo, v_novos IN"));
    expect(lock).toBeLessThan(bloco.indexOf("apagado_motivo = 'substituido'"));
    expect(/FOR UPDATE\b/.test(bloco)).toBe(false);
  });

  it("o que o convite substitui perde o nome do ficheiro e o hash (como no remover do RH)", () => {
    const corpo = corpoDaFuncao(M270, "hr_convite_anexos_promover");
    const bloco = compacto(semComentarios(corpo.slice(corpo.indexOf(MARCA_INICIO), corpo.indexOf(MARCA_FIM))));
    expect(bloco).toMatch(/apagado_motivo = 'substituido', nome_original = 'apagado', hash_sha256 = NULL/);
  });

  it("e a definicao mais recente de hr_convite_anexos_promover (nenhuma migration depois a redefine)", () => {
    expect(migrationQueDefine("hr_convite_anexos_promover")).toBe(M270);
  });

  it("o conferir ao vivo prova a substituicao na nike (fotografia, cartao) e o avatar", () => {
    const vivo = M270.slice(M270.indexOf("DO $conferir_vivo$"));
    expect(vivo).toContain("hr_convite_anexos_promover");
    expect(vivo).toContain("'substituido'");
    expect(vivo).toContain("fotografia_anexo_id");
    expect(vivo).toMatch(/v_org_nike\s+uuid := 'b6ffce4f-f630-4933-833a-008649757a33'/);
  });
});
