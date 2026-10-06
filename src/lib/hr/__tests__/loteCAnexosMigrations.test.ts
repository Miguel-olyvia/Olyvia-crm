/**
 * O CONTEUDO DAS QUATRO MIGRATIONS DOS ANEXOS DO CONVITE (lote C, base).
 *
 * 20261210050000  tabela pessoas_anexos, fotografia na ficha, auditoria
 * 20261210060000  RPCs publicas do convite (reservar, contexto, ligar, descartar, listar)
 * 20261210070000  ciclo de vida (promover, transferir, limpar) e submeter/criar redefinidas
 * 20261210080000  agendamento da limpeza, condicionado aos segredos do Vault
 *
 * Excepcao deliberada a regra "nao testar SQL por texto" (a mesma de
 * loteAAdmissaoMigrations.test.ts): isto NAO testa comportamento de SQL -- esse
 * fica nos blocos de conferir das proprias migrations, que correm contra o
 * Postgres no `db push`. Testa o que nenhum compilador ve e que se desfaz em
 * silencio quando um lado muda e o outro nao: privilegios que nao podem
 * alargar, as colunas que o ecra nunca pode ler, a ordem das recusas, e que as
 * duas funcoes redefinidas sao a copia das versoes anteriores com so a mudanca
 * dita.
 */
import { describe, expect, it } from "vitest";

const MIGRATIONS = import.meta.glob("../../../../supabase/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** O codigo da Edge hr-anexo-url que decide quem abre cada tipo (a base tem de dizer o mesmo). */
const REGRAS_ANEXO_URL = Object.values(
  import.meta.glob("../../../../supabase/functions/hr-anexo-url/regras.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>,
)[0];

function migrationPorVersao(versao: string): string {
  const chave = Object.keys(MIGRATIONS).find((k) => k.includes(`/${versao}_`));
  if (!chave) throw new Error(`Migration ${versao} nao encontrada.`);
  return MIGRATIONS[chave];
}

const M3 = migrationPorVersao("20261210030000");
const M4 = migrationPorVersao("20261210040000");
const M5 = migrationPorVersao("20261210050000");
const M6 = migrationPorVersao("20261210060000");
const M7 = migrationPorVersao("20261210070000");
const M8 = migrationPorVersao("20261210080000");

function padraoDeCriacao(nomeFuncao: string): RegExp {
  return new RegExp("CREATE (?:OR REPLACE )?FUNCTION public\\." + nomeFuncao + "\\(");
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

function semComentarios(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

function compacto(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

function temComando(sql: string, comando: string): boolean {
  return compacto(sql).includes(comando);
}

const MIGRATIONS_ANEXOS: ReadonlyArray<readonly [string, string]> = [
  ["20261210050000", M5],
  ["20261210060000", M6],
  ["20261210070000", M7],
  ["20261210080000", M8],
];

// -----------------------------------------------------------------------------
// Em todas
// -----------------------------------------------------------------------------

describe("as quatro migrations dos anexos", () => {
  it.each(MIGRATIONS_ANEXOS)("%s tem guardas, conferir e o aviso de codigo novo", (versao, sql) => {
    expect(sql, versao).toMatch(/DO \$guardas\$/);
    expect(sql, versao).toMatch(/DO \$conferir[a-z_]*\$/);
    expect(sql, versao).toMatch(/PRECISA DE CODIGO NOVO/);
    expect(sql, versao).toMatch(/ANTES DO db push/);
  });

  it("os blocos que escrevem dados de teste desfazem-no com a sentinela HR900", () => {
    for (const sql of [M5, M6, M7]) {
      expect(sql).toMatch(/USING ERRCODE = 'HR900'/);
      expect(sql).toMatch(/WHEN SQLSTATE 'HR900' THEN/);
      // So se escreve na organizacao nike.
      expect(sql).toMatch(/b6ffce4f-f630-4933-833a-008649757a33/);
    }
  });

  it("nenhuma tem DELETE em storage.objects nem SQL que toque nos buckets", () => {
    for (const [, sql] of MIGRATIONS_ANEXOS) {
      const codigo = semComentarios(sql);
      expect(codigo).not.toMatch(/DELETE\s+FROM\s+storage\./i);
      expect(codigo).not.toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
      expect(codigo).not.toMatch(/CREATE POLICY[^;]*storage\.objects/i);
    }
  });

  it("as versoes sao unicas e vem a seguir ao BIC", () => {
    const versoes = Object.keys(MIGRATIONS).map((k) => /\/(\d{14})_/.exec(k)?.[1]);
    for (const [versao] of MIGRATIONS_ANEXOS) {
      expect(versoes.filter((v) => v === versao), versao).toHaveLength(1);
      expect(versao > "20261210040000").toBe(true);
    }
  });
});

// -----------------------------------------------------------------------------
// 050000: a tabela
// -----------------------------------------------------------------------------

describe("20261210050000 -- pessoas_anexos", () => {
  const codigo = semComentarios(M5);

  it("tem as colunas e as constraints do desenho", () => {
    const tabela = codigo.slice(codigo.indexOf("CREATE TABLE IF NOT EXISTS public.pessoas_anexos"));
    for (const coluna of [
      "id", "organization_id", "pessoa_id", "convite_id", "tipo", "estado", "bucket", "caminho",
      "nome_original", "mime_type", "tamanho_bytes", "hash_sha256", "upload_ip", "criado_em",
      "ligado_em", "promovido_em", "apagado_em", "apagado_motivo", "objecto_removido_em",
      "caminho_quarentena", "quarentena_removida_em", "limpeza_tentativas",
    ]) {
      expect(tabela, coluna).toMatch(new RegExp("\\n\\s+" + coluna + "\\s+[a-z]"));
    }
    expect(codigo).toMatch(/FOREIGN KEY \(pessoa_id, organization_id\)\s+REFERENCES public\.pessoas \(id, organization_id\)/);
    expect(codigo).toMatch(/FOREIGN KEY \(convite_id\)\s+REFERENCES public\.pessoas_convites_admissao \(id\)/);
    expect(compacto(codigo)).not.toMatch(/FOREIGN KEY \(convite_id\) REFERENCES public\.pessoas_convites_admissao \(id\) ON DELETE CASCADE/);
    expect(codigo).toMatch(/CONSTRAINT pessoas_anexos_caminho_key UNIQUE \(caminho\)/);
  });

  it("os dominios fechados: tipo, estado, bucket, mime, motivo, hash", () => {
    const c = compacto(codigo);
    expect(c).toMatch(/tipo IN \('cartao_cidadao', 'comprovativo_iban', 'fotografia'\)/);
    expect(c).toMatch(/estado IN \('pendente', 'ligado', 'promovido', 'apagado'\)/);
    expect(c).toMatch(/bucket IN \('hr-documentos-quarantine', 'hr-documentos'\)/);
    expect(c).toMatch(/mime_type IS NULL OR mime_type IN \('application\/pdf', 'image\/png', 'image\/jpeg'\)/);
    expect(c).toMatch(
      /'removido_pela_pessoa', 'convite_expirado', 'convite_revogado', 'substituido', 'upload_abandonado', 'formato_invalido', 'demasiado_grande', 'rh'/,
    );
    expect(c).toMatch(/hash_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(c).toMatch(/length\(nome_original\) BETWEEN 1 AND 200/);
  });

  it("os CHECKs de coerencia entre estado, bucket e metadados", () => {
    const c = compacto(codigo);
    expect(c).toMatch(/estado <> 'pendente' OR bucket = 'hr-documentos-quarantine'/);
    expect(c).toMatch(
      /estado NOT IN \('ligado', 'promovido'\) OR \(bucket = 'hr-documentos' AND mime_type IS NOT NULL AND tamanho_bytes IS NOT NULL AND hash_sha256 IS NOT NULL\)/,
    );
    expect(c).toMatch(/estado <> 'apagado' OR \(apagado_em IS NOT NULL AND apagado_motivo IS NOT NULL\)/);
    expect(c).toMatch(/estado NOT IN \('pendente', 'ligado'\) OR convite_id IS NOT NULL/);
  });

  it("a leitura e por coluna e nunca inclui o que identifica o objecto ou o autor", () => {
    const grant = /GRANT SELECT \(([^)]*)\)\s+ON TABLE public\.pessoas_anexos TO authenticated;/.exec(codigo);
    expect(grant).not.toBeNull();
    const colunas = (grant === null ? "" : grant[1]).split(",").map((c) => c.trim()).sort();
    expect(colunas).toEqual(
      [
        "id", "organization_id", "pessoa_id", "tipo", "estado", "nome_original", "mime_type",
        "tamanho_bytes", "promovido_em", "criado_em",
      ].sort(),
    );
    for (const proibida of [
      "caminho", "hash_sha256", "upload_ip", "convite_id", "apagado_motivo", "objecto_removido_em",
      "caminho_quarentena", "quarentena_removida_em", "limpeza_tentativas",
    ]) {
      expect(colunas, proibida).not.toContain(proibida);
    }
    // O conferir tambem as lista como proibidas (falha o push se alguem as conceder).
    const conferir = compacto(M5.slice(M5.lastIndexOf("DO $conferir$")));
    expect(conferir).toMatch(/'caminho_quarentena', 'quarentena_removida_em', 'limpeza_tentativas'/);
  });

  it("guarda o caminho da quarentena ate ao fim, numa coluna propria, com os CHECKs de coerencia", () => {
    const c = compacto(codigo);
    expect(c).toMatch(/caminho_quarentena text,/);
    expect(c).toMatch(/quarentena_removida_em timestamptz,/);
    expect(c).toMatch(/limpeza_tentativas integer NOT NULL DEFAULT 0/);
    // So se marca como removida uma quarentena que existiu; o caminho e o da quarentena.
    expect(c).toMatch(/quarentena_removida_em IS NULL OR caminho_quarentena IS NOT NULL/);
    expect(c).toMatch(/caminho_quarentena IS NULL OR caminho_quarentena LIKE 'admissao\/%'/);
    // Indice parcial para a limpeza encontrar o que falta apagar.
    expect(c).toMatch(
      /pessoas_anexos_quarentena_por_remover_idx ON public\.pessoas_anexos \(criado_em\) WHERE caminho_quarentena IS NOT NULL AND quarentena_removida_em IS NULL/,
    );
    // Nunca se concede a authenticated.
    expect(codigo).not.toMatch(/GRANT SELECT \([^)]*caminho_quarentena/);
  });

  it("fecha anon e authenticated, abre service_role e liga a RLS", () => {
    expect(temComando(codigo, "REVOKE ALL ON TABLE public.pessoas_anexos FROM anon;")).toBe(true);
    expect(temComando(codigo, "REVOKE ALL ON TABLE public.pessoas_anexos FROM authenticated;")).toBe(true);
    expect(temComando(codigo, "GRANT ALL ON TABLE public.pessoas_anexos TO service_role;")).toBe(true);
    expect(temComando(codigo, "ALTER TABLE public.pessoas_anexos ENABLE ROW LEVEL SECURITY;")).toBe(true);
    expect(codigo).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*ON TABLE public\.pessoas_anexos TO authenticated/);
  });

  it("uma so politica, so SELECT, so promovidos, com a permissao de cada tipo ou ser o proprio", () => {
    const politicas = [...codigo.matchAll(/CREATE POLICY (\w+) ON public\.pessoas_anexos/g)];
    expect(politicas).toHaveLength(1);
    const politica = codigo.slice(codigo.indexOf("CREATE POLICY"));
    const c = compacto(politica.slice(0, politica.indexOf(";") + 1));
    expect(c).toMatch(/FOR SELECT TO authenticated/);
    expect(c).toMatch(/estado = 'promovido'/);
    expect(c).toMatch(/'hr\.pessoas\.view\.own', organization_id/);
    expect(c).toMatch(/pessoa_id = public\.hr_pessoa_do_utilizador/);
  });

  it("a leitura depende do tipo, com a MESMA matriz da Edge hr-anexo-url (nome_original e texto livre)", () => {
    const politica = codigo.slice(codigo.indexOf("CREATE POLICY"));
    const c = compacto(politica.slice(0, politica.indexOf(";") + 1));
    // Cada tipo exige a sua permissao: nunca so hr.pessoas.view para os dois sensiveis.
    expect(c).toMatch(/tipo = 'fotografia' AND \(SELECT public\.has_anew_permission_in_org\(\(SELECT auth\.uid\(\)\), 'hr\.pessoas\.view', organization_id\)\)/);
    expect(c).toMatch(/tipo = 'cartao_cidadao' AND \(SELECT public\.has_anew_permission_in_org\(\(SELECT auth\.uid\(\)\), 'hr\.pessoas\.identificacao\.reveal', organization_id\)\)/);
    expect(c).toMatch(/tipo = 'comprovativo_iban' AND \(SELECT public\.has_anew_permission_in_org\(\(SELECT auth\.uid\(\)\), 'hr\.pessoas\.bancarios\.edit', organization_id\)\)/);
    // hr.pessoas.view sozinho so aparece ligado a fotografia.
    expect([...c.matchAll(/'hr\.pessoas\.view'/g)]).toHaveLength(1);
    // Espelha supabase/functions/hr-anexo-url/regras.ts.
    const regras = REGRAS_ANEXO_URL;
    expect(regras).toMatch(/fotografia: "hr\.pessoas\.view"/);
    expect(regras).toMatch(/cartao_cidadao: "hr\.pessoas\.identificacao\.reveal"/);
    expect(regras).toMatch(/comprovativo_iban: "hr\.pessoas\.bancarios\.edit"/);
    expect(regras).toMatch(/PERMISSAO_PROPRIA = "hr\.pessoas\.view\.own"/);
  });

  it("o conferir exige as quatro permissoes no catalogo e as tres no texto da politica", () => {
    expect(M5).toMatch(/anew_permissions/);
    expect(M5).toMatch(/qual LIKE '%hr\.pessoas\.identificacao\.reveal%' AND qual LIKE '%hr\.pessoas\.bancarios\.edit%'/);
    // O conferir ao vivo ja nao assume que o super_admin ve os documentos sensiveis.
    expect(M5).toMatch(/v_ve_cartao := public\.has_anew_permission_in_org\(v_uid_real, 'hr\.pessoas\.identificacao\.reveal'/);
    expect(M5).toMatch(/v_ve_iban\s+:= public\.has_anew_permission_in_org\(v_uid_real, 'hr\.pessoas\.bancarios\.edit'/);
  });

  it("a fotografia da ficha so aponta para uma fotografia promovida da mesma pessoa", () => {
    expect(codigo).toMatch(/ADD COLUMN IF NOT EXISTS fotografia_anexo_id uuid/);
    expect(compacto(codigo)).toMatch(/REFERENCES public\.pessoas_anexos \(id\) ON DELETE SET NULL/);
    const corpo = compacto(corpoDaFuncao(M5, "hr_pessoas_fotografia_valida"));
    expect(corpo).toMatch(/NEW\.fotografia_anexo_id IS NULL/);
    expect(corpo).toMatch(/a\.tipo = 'fotografia'/);
    expect(corpo).toMatch(/a\.estado = 'promovido'/);
    expect(corpo).toMatch(/a\.pessoa_id = NEW\.id/);
    expect(corpo).toMatch(/a\.organization_id = NEW\.organization_id/);
    expect(corpo).toMatch(/RAISE EXCEPTION 'fotografia_invalida' USING ERRCODE = '23514'/);
    expect(compacto(codigo)).toMatch(/BEFORE INSERT OR UPDATE OF fotografia_anexo_id ON public\.pessoas/);
  });

  it("a auditoria passa a 10 valores e conserva os 8 antigos", () => {
    const novo = compacto(codigo.slice(codigo.indexOf("ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido")));
    const lista = novo.slice(0, novo.indexOf("]));"));
    for (const valor of [
      "niss", "iban", "conta_bancaria", "incapacidade", "retribuicao", "documento",
      "sindicalizacao", "horas_contratadas", "anexo_cartao_cidadao", "anexo_comprovativo_iban",
    ]) {
      expect(lista, valor).toContain(`'${valor}'`);
    }
    expect([...lista.matchAll(/'[a-z_]+'/g)]).toHaveLength(10);
    expect(lista).not.toContain("'fotografia'");
  });

  it("o conferir compara as colunas concedidas com as da tabela", () => {
    expect(M5).toMatch(/has_column_privilege\('authenticated', 'public\.pessoas_anexos'/);
    expect(M5).toMatch(/pg_attribute/);
  });
});

// -----------------------------------------------------------------------------
// 060000: as RPCs publicas
// -----------------------------------------------------------------------------

const ASSINATURAS_060 = [
  "rpc_hr_convite_anexo_reservar(text, text, text, bigint, text, inet)",
  "rpc_hr_convite_anexo_contexto(text, uuid)",
  "rpc_hr_convite_anexo_ligar(text, uuid, text, text, bigint, text)",
  "rpc_hr_convite_anexo_descartar(text, uuid, text)",
  "rpc_hr_convite_anexos_listar(text)",
];

describe("20261210060000 -- as RPCs do convite", () => {
  it.each(ASSINATURAS_060)("%s: so service_role", (assinatura) => {
    for (const quem of ["PUBLIC", "anon", "authenticated"]) {
      expect(temComando(M6, `REVOKE ALL ON FUNCTION public.${assinatura} FROM ${quem};`), quem).toBe(true);
    }
    expect(temComando(M6, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`)).toBe(true);
    expect(temComando(M6, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`)).toBe(false);
    expect(temComando(M6, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO anon;`)).toBe(false);
  });

  it("todas sao SECURITY DEFINER com o search_path fixo e nenhuma incrementa attempts", () => {
    for (const nome of [
      "rpc_hr_convite_anexo_reservar", "rpc_hr_convite_anexo_contexto", "rpc_hr_convite_anexo_ligar",
      "rpc_hr_convite_anexo_descartar", "rpc_hr_convite_anexos_listar",
    ]) {
      const inicio = M6.search(padraoDeCriacao(nome));
      const cabeca = compacto(M6.slice(inicio, M6.indexOf("AS $$", inicio)));
      expect(cabeca, nome).toMatch(/SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
      expect(semComentarios(corpoDaFuncao(M6, nome)), nome).not.toMatch(/attempts\s*=/);
    }
  });

  it("reservar: as recusas pela ordem do desenho, com as constantes e o FOR UPDATE", () => {
    const corpo = semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_reservar"));
    expect(corpo).toMatch(/FOR UPDATE/);
    expect(corpo).toMatch(/c_max_activos\s+constant integer := 4/);
    expect(corpo).toMatch(/c_max_reservas\s+constant integer := 12/);
    expect(corpo).toMatch(/10485760/);
    expect(corpo).toMatch(/5242880/);
    const ordem = [
      "convite_invalido",
      "anexo_tipo_invalido",
      "anexo_formato_invalido",
      "anexo_fotografia_formato",
      "anexo_vazio",
      "anexo_demasiado_grande",
      "anexo_fotografia_demasiado_grande",
      "anexo_maximo_ficheiros",
      "anexo_tipo_cheio",
      "anexo_limite_convite",
    ].map((codigoErro) => corpo.indexOf(`'${codigoErro}'`));
    for (const posicao of ordem) expect(posicao).toBeGreaterThan(0);
    expect(ordem.filter((_, i) => i < 5)).toEqual([...ordem.slice(0, 5)].sort((a, b) => a - b));
    expect(Math.min(ordem[5], ordem[6])).toBeGreaterThan(ordem[4]);
    expect(Math.min(ordem[7], ordem[8], ordem[9])).toBeGreaterThan(Math.max(ordem[5], ordem[6]));
    expect(ordem[7]).toBeLessThan(ordem[8]);
    expect(ordem[8]).toBeLessThan(ordem[9]);
  });

  it("reservar: cartao 2, comprovativo 1, fotografia 1, e nunca devolve organizacao nem pessoa", () => {
    const corpo = semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_reservar"));
    expect(compacto(corpo)).toMatch(/'cartao_cidadao' THEN 2/);
    expect(compacto(corpo)).toMatch(/'comprovativo_iban' THEN 1/);
    expect(compacto(corpo)).toMatch(/'fotografia' THEN 1/);
    const resposta = corpo.slice(corpo.lastIndexOf("RETURN jsonb_build_object"));
    expect(resposta).toMatch(/'anexo_id'/);
    expect(resposta).toMatch(/'caminho'/);
    expect(resposta).not.toMatch(/organization_id|pessoa_id/);
    expect(corpo).toMatch(/'hr-documentos-quarantine'/);
  });

  it("reservar e quem preenche caminho_quarentena (o mesmo valor de caminho); ligar nunca lhe toca", () => {
    const reservar = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_reservar")));
    expect(reservar).toMatch(/caminho, caminho_quarentena, nome_original, upload_ip/);
    expect(reservar).toMatch(/'hr-documentos-quarantine', v_caminho, v_caminho, v_nome, p_ip/);
    // Nenhuma outra RPC deste lote escreve a coluna.
    for (const nome of [
      "rpc_hr_convite_anexo_contexto", "rpc_hr_convite_anexo_ligar",
      "rpc_hr_convite_anexo_descartar", "rpc_hr_convite_anexos_listar",
    ]) {
      const corpo = semComentarios(corpoDaFuncao(M6, nome));
      expect(corpo, nome).not.toMatch(/caminho_quarentena\s*=/);
    }
    // ligar so muda caminho e bucket para os finais.
    const ligar = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_ligar")));
    const update = ligar.slice(ligar.indexOf("UPDATE public.pessoas_anexos"));
    expect(update).toMatch(/SET estado = 'ligado', bucket = 'hr-documentos', caminho = p_caminho_final/);
    expect(update).not.toMatch(/caminho_quarentena/);
  });

  it("a listagem nunca devolve o caminho da quarentena", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexos_listar")));
    expect(corpo).not.toMatch(/caminho_quarentena/);
  });

  it("os motivos de convite morto seguem a ordem de _estado e nunca contam tentativas", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M6, "hr_convite_anexos_motivo")));
    const ordem = ["convite_ja_usado", "convite_revogado", "convite_expirado", "convite_bloqueado"].map((m) =>
      corpo.indexOf(`'${m}'`),
    );
    for (const p of ordem) expect(p).toBeGreaterThan(0);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
    expect(corpo).toMatch(/p_attempts >= 10/);
  });

  it("contexto devolve o que a Edge precisa e recusa o anexo de outro convite", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_contexto")));
    for (const campo of ["'anexo_id'", "'tipo'", "'estado'", "'caminho'", "'organization_id'", "'pessoa_id'"]) {
      expect(corpo, campo).toContain(campo);
    }
    expect(corpo).toMatch(/a\.convite_id = v_convite\.id/);
    expect(corpo).toMatch(/'anexo_nao_encontrado'/);
    expect(corpo).toMatch(/'anexo_estado_invalido'/);
  });

  it("ligar: repete as verificacoes com o tipo REAL e so aceita o caminho final exacto", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_ligar")));
    expect(corpo).toMatch(/FOR UPDATE/);
    expect(corpo).toMatch(/'\/admissao\/'/);
    expect(corpo).toMatch(/p_caminho_final IS DISTINCT FROM/);
    expect(corpo).toMatch(/estado = 'ligado'/);
    expect(corpo).toMatch(/bucket = 'hr-documentos'/);
    expect(corpo).toMatch(/hash_sha256 = p_hash/);
    expect(corpo).toMatch(/'anexo_fotografia_formato'/);
    expect(corpo).toMatch(/'anexo_tipo_cheio'/);
    expect(corpo).toMatch(/'anexo_maximo_ficheiros'/);
    expect(corpo).toMatch(/jsonb_build_object\('ok', true, 'anexo'/);
  });

  it("descartar: so os quatro motivos, e remover exige convite vivo", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_descartar")));
    expect(corpo).toMatch(
      /p_motivo NOT IN \('removido_pela_pessoa', 'formato_invalido', 'demasiado_grande', 'upload_abandonado'\)/,
    );
    expect(corpo).toMatch(/p_motivo = 'removido_pela_pessoa'/);
    expect(corpo).toMatch(/'estado', 'promovido'|estado = 'promovido'/);
    expect(corpo).toMatch(/jsonb_build_object\('ok', true, 'bucket'/);
  });

  it("descartar devolve onde esta o objecto E o caminho da quarentena, tanto no descarte como no repetido", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexo_descartar")));
    expect(corpo).toMatch(/SELECT a\.id, a\.estado, a\.bucket, a\.caminho, a\.caminho_quarentena INTO v_anexo/);
    const respostas = [
      ...corpo.matchAll(
        /RETURN jsonb_build_object\('ok', true, 'bucket', v_anexo\.bucket, 'caminho', v_anexo\.caminho, 'caminho_quarentena', v_anexo\.caminho_quarentena\);/g,
      ),
    ];
    // Uma no ramo idempotente (ja apagado) e outra no fim.
    expect(respostas).toHaveLength(2);
    // A assinatura e os motivos aceites nao mudaram.
    expect(compacto(M6)).toMatch(/rpc_hr_convite_anexo_descartar\( p_token_hash text, p_anexo_id uuid, p_motivo text \)/);
  });

  it("listar: so os ligados, ordenados, com nome e tamanho", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M6, "rpc_hr_convite_anexos_listar")));
    expect(corpo).toMatch(/a\.estado = 'ligado'/);
    expect(corpo).toMatch(/ORDER BY a\.tipo, a\.ligado_em/);
    expect(corpo).toMatch(/'nome_original'/);
    expect(corpo).toMatch(/'tamanho_bytes'/);
    expect(corpo).not.toMatch(/a\.caminho|hash_sha256|upload_ip/);
  });
});

// -----------------------------------------------------------------------------
// 070000: o ciclo de vida
// -----------------------------------------------------------------------------

describe("20261210070000 -- promover, transferir, limpar", () => {
  it("promover e transferir sao internas: ninguem as executa por fora", () => {
    for (const assinatura of [
      "hr_convite_anexos_promover(uuid)",
      "hr_convite_anexos_transferir(uuid, uuid, uuid, boolean)",
    ]) {
      for (const quem of ["PUBLIC", "anon", "authenticated", "service_role"]) {
        expect(temComando(M7, `REVOKE ALL ON FUNCTION public.${assinatura} FROM ${quem};`), assinatura + quem).toBe(true);
      }
      expect(temComando(M7, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO`), assinatura).toBe(false);
    }
  });

  it("limpar, objecto_removido e limpeza_estado: so service_role", () => {
    for (const assinatura of [
      "hr_convite_anexos_limpar(integer, integer)",
      "hr_convite_anexos_objecto_removido(uuid[])",
      "hr_convite_anexos_limpeza_estado()",
    ]) {
      for (const quem of ["PUBLIC", "anon", "authenticated"]) {
        expect(temComando(M7, `REVOKE ALL ON FUNCTION public.${assinatura} FROM ${quem};`), assinatura + quem).toBe(true);
      }
      expect(temComando(M7, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`), assinatura).toBe(true);
      expect(temComando(M7, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`), assinatura).toBe(false);
    }
  });

  it("promover nunca parte a admissao: corre numa subtransaccao e em falha deixa os anexos em ligado", () => {
    const corpo = semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_promover"));
    // Nunca levanta por si; apanha tudo o que o trigger da fotografia ou a auditoria levantem.
    expect(corpo).not.toMatch(/RAISE EXCEPTION/);
    expect(compacto(corpo)).toMatch(/EXCEPTION WHEN OTHERS THEN RAISE WARNING '[^']*%[^']*', p_convite_id, SQLSTATE, SQLERRM; RETURN 0; END;/);
    // O aviso leva o convite e o SQLSTATE, nunca dados da pessoa.
    expect(corpo).not.toMatch(/v_pessoa[^,;]*,\s*SQLSTATE/);
    // O EXCEPTION e do bloco da funcao inteira: vem depois do RETURN v_n.
    expect(corpo.indexOf("RETURN v_n;")).toBeLessThan(corpo.indexOf("EXCEPTION WHEN OTHERS"));
  });

  it("a limpeza volta a promover os anexos ligados de convites ja usados (promocao que falhou)", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_limpar")));
    expect(corpo).toMatch(/a\.estado = 'ligado' AND c\.used_at IS NOT NULL LIMIT 50 LOOP PERFORM public\.hr_convite_anexos_promover\(v_convite\); END LOOP;/);
    // Depois de devolver as linhas (RETURN QUERY nao termina a funcao).
    expect(corpo.indexOf("RETURN QUERY")).toBeLessThan(corpo.indexOf("hr_convite_anexos_promover"));
  });

  it("limpeza_estado e so leitura e devolve as chaves que a Edge le", () => {
    const inicio = M7.search(padraoDeCriacao("hr_convite_anexos_limpeza_estado"));
    const cabeca = compacto(M7.slice(inicio, M7.indexOf("AS $$", inicio)));
    expect(cabeca).toMatch(/RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'/);
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_limpeza_estado")));
    for (const chave of [
      "por_remover", "por_remover_antigos", "quarentena_por_remover", "promocoes_pendentes",
      "max_tentativas", "job_agendado",
    ]) {
      expect(corpo, chave).toContain(`'${chave}'`);
    }
    expect(corpo).not.toMatch(/\bINSERT\b|\bDELETE\b|\bUPDATE\b/);
    // Sem pg_cron a funcao compila e responde job_agendado = false.
    expect(corpo).toMatch(/to_regclass\('cron\.job'\) IS NOT NULL/);
    expect(corpo).toMatch(/EXECUTE 'SELECT EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = \$1\)'/);
    expect(corpo).toMatch(/'hr-convite-anexos-limpar'/);
  });

  it("promover: ligado passa a promovido, pendente a abandonado, fotografia na ficha, auditoria do cartao e do comprovativo", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_promover")));
    expect(corpo).toMatch(/estado = 'promovido'/);
    expect(corpo).toMatch(/apagado_motivo = 'upload_abandonado'/);
    expect(corpo).toMatch(/UPDATE public\.pessoas SET fotografia_anexo_id/);
    expect(corpo).toMatch(/'anexo_cartao_cidadao', 'alterar'/);
    expect(corpo).toMatch(/'anexo_comprovativo_iban', 'alterar'/);
    // O convite_id fica como historico: nunca se anula.
    expect(corpo).not.toMatch(/convite_id = NULL/);
  });

  it("transferir espelha a heranca: so ligados e so quando herda, o resto e substituido", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_transferir")));
    expect(corpo).toMatch(/IF p_herdar THEN/);
    expect(corpo).toMatch(/ORDER BY c\.created_at DESC/);
    expect(corpo).toMatch(/apagado_motivo = 'substituido'/);
    expect(corpo).toMatch(/c\.used_at IS NULL/);
    expect(corpo).toMatch(/c\.id <> p_convite_novo/);
    const mover = corpo.indexOf("SET convite_id = p_convite_novo");
    const apagar = corpo.indexOf("apagado_motivo = 'substituido'");
    expect(mover).toBeGreaterThan(0);
    expect(mover).toBeLessThan(apagar);
  });

  it("limpar usa o mesmo criterio de 7 dias da limpeza dos rascunhos e a regra das 3 horas", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_limpar")));
    expect(compacto(M7)).toMatch(/p_dias_tolerancia integer DEFAULT 7/);
    expect(compacto(M7)).toMatch(/p_limite integer DEFAULT 200/);
    expect(corpo).toMatch(/c\.used_at IS NULL/);
    expect(corpo).toMatch(/c\.valid_until < now\(\) - v_tolerancia/);
    expect(corpo).toMatch(/c\.revoked_at < now\(\) - v_tolerancia/);
    expect(corpo).toMatch(/'convite_expirado'/);
    expect(corpo).toMatch(/'convite_revogado'/);
    expect(corpo).toMatch(/interval '3 hours'/);
    expect(corpo).toMatch(/objecto_removido_em IS NULL/);
    expect(corpo).not.toMatch(/rascunho/);
    expect(corpo).toMatch(/#variable_conflict use_column|ORDER BY/);
  });

  it("limpar devolve as seis colunas da interface e apanha a quarentena de linhas ligadas e promovidas", () => {
    const inicio = M7.search(padraoDeCriacao("hr_convite_anexos_limpar"));
    const cabeca = compacto(M7.slice(inicio, M7.indexOf("AS $$", inicio)));
    expect(cabeca).toMatch(
      /RETURNS TABLE \( anexo_id uuid, bucket text, caminho text, caminho_quarentena text, caminhos_finais text\[\], tentativas integer \)/,
    );
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_limpar")));
    // Dois motivos para uma linha entrar: objecto por remover (apagada) ou quarentena por remover (nao pendente).
    expect(corpo).toMatch(/\(a\.estado = 'apagado' AND a\.objecto_removido_em IS NULL\)/);
    expect(corpo).toMatch(
      /\(a\.estado <> 'pendente' AND a\.caminho_quarentena IS NOT NULL AND a\.quarentena_removida_em IS NULL\)/,
    );
    // A regra das 3 horas vale para as duas.
    expect(corpo).toMatch(/WHERE a\.criado_em < now\(\) - c_pendente_max AND \(/);
    // As linhas apagadas que nunca foram ligadas trazem os tres caminhos finais possiveis.
    expect(corpo).toMatch(/m\.ligado_em IS NULL THEN ARRAY\[/);
    for (const ext of ["pdf", "png", "jpg"]) {
      expect(corpo, ext).toContain(`'/admissao/' || m.id::text || '.${ext}'`);
    }
    // Nao repete no segundo campo o objecto que ja e a quarentena.
    expect(corpo).toMatch(/NOT \(m\.estado = 'apagado' AND m\.objecto_removido_em IS NULL AND m\.caminho = m\.caminho_quarentena\)/);
  });

  it("limpar ordena por tentativas e incrementa-as: linhas que falham sempre nao bloqueiam a fila", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_limpar")));
    expect(corpo).toMatch(/ORDER BY a\.limpeza_tentativas, coalesce\(a\.apagado_em, a\.criado_em\), a\.id LIMIT v_limite FOR UPDATE OF a SKIP LOCKED/);
    expect(corpo).toMatch(/SET limpeza_tentativas = a\.limpeza_tentativas \+ 1/);
    expect(corpo).toMatch(/ORDER BY m\.limpeza_tentativas, m\.id/);
    // O antigo corte cego por apagado_em ja nao existe.
    expect(corpo).not.toMatch(/ORDER BY a\.apagado_em, a\.id LIMIT/);
  });

  it("objecto_removido so marca o que ja nao pode ser reutilizado", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_objecto_removido")));
    expect(corpo).toMatch(/estado = 'apagado'/);
    expect(corpo).toMatch(/ligado_em IS NOT NULL OR/);
    expect(corpo).toMatch(/criado_em < now\(\) - interval '3 hours'/);
  });

  it("objecto_removido marca tambem a quarentena (so passadas 3 horas e nunca de um pendente)", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_objecto_removido")));
    expect(corpo).toMatch(
      /quarentena_removida_em = CASE WHEN a\.caminho_quarentena IS NOT NULL AND a\.quarentena_removida_em IS NULL AND a\.estado <> 'pendente' AND a\.criado_em < now\(\) - interval '3 hours' THEN now\(\)/,
    );
    // O objecto final de uma linha viva (ligada ou promovida) nunca se marca como removido.
    expect(corpo).toMatch(
      /objecto_removido_em = CASE WHEN a\.estado = 'apagado' AND a\.objecto_removido_em IS NULL/,
    );
  });

  it("a limpeza diaria dos rascunhos nao foi redefinida", () => {
    expect(M7).not.toMatch(padraoDeCriacao("hr_convites_admissao_limpar"));
  });
});

describe("20261210070000 -- submeter e criar redefinidas", () => {
  const corpoM4 = corpoDaFuncao(M4, "rpc_hr_convite_admissao_submeter");
  const corpoM7 = corpoDaFuncao(M7, "rpc_hr_convite_admissao_submeter");

  it("submeter e a copia da versao do BIC com SO tres mudancas", () => {
    const esperado = compacto(semComentarios(corpoM4))
      .replace("v_pessoa_id uuid;", "v_pessoa_id uuid; v_convite_id uuid;")
      .replace(
        "RETURNING pessoa_id, organization_id INTO v_pessoa_id, v_org;",
        "RETURNING id, pessoa_id, organization_id INTO v_convite_id, v_pessoa_id, v_org;",
      )
      .replace(
        "RETURN v_pessoa_id; END;",
        "PERFORM public.hr_convite_anexos_promover(v_convite_id); RETURN v_pessoa_id; END;",
      );
    expect(esperado).not.toBe(compacto(semComentarios(corpoM4)));
    expect(compacto(semComentarios(corpoM7))).toBe(esperado);
  });

  it("submeter nao engole erros dos dados; o isolamento da promocao e da propria promover", () => {
    // Qualquer RAISE dos dados desfaz a admissao: sem bloco EXCEPTION em submeter. A falha dos
    // ficheiros nao a desfaz porque hr_convite_anexos_promover tem a sua subtransaccao.
    const corpo = semComentarios(corpoM7);
    expect(corpo).not.toMatch(/EXCEPTION\s+WHEN/);
    expect(semComentarios(corpoDaFuncao(M7, "hr_convite_anexos_promover"))).toMatch(/EXCEPTION\s+WHEN OTHERS/);
    const promover = corpo.indexOf("hr_convite_anexos_promover");
    expect(promover).toBeGreaterThan(corpo.indexOf("hr_bic_valido"));
    expect(promover).toBeGreaterThan(corpo.lastIndexOf("RAISE EXCEPTION"));
    expect(promover).toBeLessThan(corpo.lastIndexOf("RETURN v_pessoa_id"));
  });

  it("submeter mantem assinatura, grants e a lista de codigos", () => {
    const assinatura = "rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)";
    expect(temComando(M7, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`)).toBe(true);
    expect(temComando(M7, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`)).toBe(false);
    const codigos = (c: string) => [...c.matchAll(/RAISE EXCEPTION '([a-z_]+)'\s+USING ERRCODE = '([A-Z0-9]{5})'/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(codigos(corpoM7)).toEqual(codigos(corpoM4));
    expect(corpoM7).toContain("HRA18");
  });

  it("a copia de submeter tem o tratamento do swift do BIC (branco nunca apaga, legado invalido a NULL)", () => {
    const c = compacto(semComentarios(corpoM7));
    expect(c).toMatch(
      /swift = CASE WHEN v_conta_bic IS NOT NULL THEN EXCLUDED\.swift WHEN public\.hr_bic_valido\(pessoas_dados_bancarios\.swift\) THEN pessoas_dados_bancarios\.swift ELSE NULL END/,
    );
    expect(c).not.toMatch(/swift = CASE WHEN p_dados \? 'conta_swift'/);
  });

  it("submeter nao junta os anexos aos dados nem cria pendencia", () => {
    const corpo = semComentarios(corpoM7);
    expect(corpo).not.toMatch(/p_dados \? 'anexo/);
    expect(corpo).not.toMatch(/pessoas_anexos/);
  });

  it("criar parte da versao de 20261210030000 e so acrescenta a heranca dos ficheiros", () => {
    const antigo = compacto(semComentarios(corpoDaFuncao(M3, "rpc_hr_convite_admissao_criar")));
    const novo = compacto(semComentarios(corpoDaFuncao(M7, "rpc_hr_convite_admissao_criar")));
    expect(novo).toContain("v_herda_anexos");
    expect(novo).toContain("hr_convite_anexos_transferir(p_pessoa_id, v_org, v_id, coalesce(v_herda_anexos, false))");
    // Tirando o que se acrescentou, e o mesmo texto.
    const semAcrescentos = novo
      .replace(/ v_herda_anexos boolean;/, "")
      .replace(/ SELECT \(lower\(m\.email_destino\)[\s\S]*?FROM \(SELECT[\s\S]*?LIMIT 1\) m;/, "")
      .replace(/ PERFORM public\.hr_convite_anexos_transferir\([^;]*;/, "");
    expect(semAcrescentos).toBe(antigo);
  });

  it("criar calcula a heranca ANTES de revogar o convite antigo e espelha a regra do rascunho", () => {
    const corpo = compacto(semComentarios(corpoDaFuncao(M7, "rpc_hr_convite_admissao_criar")));
    const calcular = corpo.indexOf("v_herda_anexos :=");
    const calcular2 = corpo.indexOf("INTO v_herda_anexos");
    const posCalculo = calcular > 0 ? calcular : calcular2;
    expect(posCalculo).toBeGreaterThan(0);
    expect(posCalculo).toBeLessThan(corpo.indexOf("SET revoked_at = now()"));
    expect(corpo).toMatch(/lower\(m\.email_destino\) = lower\(p_email\)/);
    expect(corpo).toMatch(/m\.fim_de_vida >= now\(\) - c_heranca/);
    expect(corpo).toMatch(/a\.estado IN \('pendente', 'ligado'\)/);
    expect(corpo.indexOf("hr_convite_anexos_transferir")).toBeGreaterThan(corpo.indexOf("RETURNING id INTO v_id"));
  });

  it("criar mantem os cinco argumentos, so service_role e o retorno", () => {
    expect(compacto(M7)).toMatch(/RETURNS TABLE \(convite_id uuid, rascunho_herdado boolean\)/);
    const assinatura = "rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)";
    for (const quem of ["PUBLIC", "anon", "authenticated"]) {
      expect(temComando(M7, `REVOKE ALL ON FUNCTION public.${assinatura} FROM ${quem};`), quem).toBe(true);
    }
    expect(temComando(M7, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`)).toBe(true);
    expect(compacto(M7)).not.toMatch(/DROP FUNCTION[^;]*rpc_hr_convite_admissao_criar/);
  });
});

// -----------------------------------------------------------------------------
// 080000: o agendamento
// -----------------------------------------------------------------------------

describe("20261210080000 -- agendamento da limpeza", () => {
  const codigo = semComentarios(M8);

  it("so agenda se existirem pg_cron, pg_net e os dois segredos do Vault; senao avisa", () => {
    expect(codigo).toMatch(/pg_extension WHERE extname = 'pg_cron'/);
    expect(codigo).toMatch(/pg_extension WHERE extname = 'pg_net'/);
    expect(codigo).toMatch(/name = 'project_functions_url'/);
    expect(codigo).toMatch(/name = 'cron_service_role_key'/);
    expect(codigo).toMatch(/RAISE NOTICE/);
    expect(codigo).not.toMatch(/edge_functions_base_url/);
  });

  it("as pendencias aparecem como WARNING (visivel no log do push), nao como NOTICE", () => {
    const avisos = [...codigo.matchAll(/RAISE (NOTICE|WARNING) 'PENDENCIA/g)].map((m) => m[1]);
    expect(avisos.length).toBeGreaterThanOrEqual(5);
    expect(avisos.every((nivel) => nivel === "WARNING")).toBe(true);
  });

  it("explica no cabecalho porque nao falha e como se ve que o job nao existe", () => {
    const cabecalho = M8.slice(0, M8.indexOf("-- ---- Guardas"));
    expect(cabecalho).toMatch(/NAO falha de/);
    expect(cabecalho).toMatch(/hr_convite_anexos_limpeza_estado\(\)/);
    expect(cabecalho).toMatch(/job_agendado/);
    // A guarda exige a funcao de estado, que o aviso do cabecalho refere.
    expect(M8).toMatch(/to_regprocedure\('public\.hr_convite_anexos_limpeza_estado\(\)'\) IS NULL/);
  });

  it("agenda um job proprio, a chamar convite-admissao-limpeza, sem segredos no texto", () => {
    expect(codigo).toMatch(/cron\.schedule\(\s*'hr-convite-anexos-limpar'/);
    expect(codigo).toMatch(/convite-admissao-limpeza/);
    expect(codigo).toMatch(/net\.http_post/);
    // Os segredos lem-se na execucao do job, dentro do comando agendado.
    expect(compacto(codigo)).toMatch(/\$job\$[\s\S]*decrypted_secret[\s\S]*\$job\$/);
    expect(codigo).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(codigo).not.toMatch(/https:\/\/[a-z0-9]+\.supabase\.co/);
  });

  it("nao mexe no job dos rascunhos", () => {
    expect(codigo).not.toMatch(/hr-convites-admissao-limpar/);
  });

  it("a migration nunca falha por falta de segredos, e o conferir diz o que aconteceu", () => {
    expect(M8).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(M8).toMatch(/PENDENCIA/);
  });
});

describe("fixtures dos conferir ao vivo respeitam o formato do token_hash", () => {
  // O CHECK pessoas_convites_admissao_token_hash_formato exige 64 hex minusculos;
  // um literal como 'conferir-70-q' rebentou o db push de 060000 (SQLSTATE 23514).
  const HASH_VALIDO = /encode\(sha256\(convert_to\('[^']+', 'UTF8'\)\), 'hex'\)/;

  it("060000: os tokens de teste sao SHA-256 em hex", () => {
    const m6 = migrationPorVersao("20261210060000");
    expect(m6).toMatch(new RegExp(`v_token\\s+constant text := ${HASH_VALIDO.source}`));
    expect(m6).toMatch(new RegExp(`v_token_b\\s+constant text := ${HASH_VALIDO.source}`));
  });

  it("070000: nenhum INSERT de convite nem chamada a criar usa um token literal", () => {
    const m7 = migrationPorVersao("20261210070000");
    expect(m7).not.toMatch(/(?<!convert_to\()'conferir-70-[a-z0-9]+'/);
    expect(m7.match(new RegExp(HASH_VALIDO.source, "g"))?.length).toBe(6);
  });
});
