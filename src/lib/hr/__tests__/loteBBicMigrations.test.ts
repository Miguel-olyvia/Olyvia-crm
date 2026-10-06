/**
 * O CONTEUDO DA MIGRATION DO BIC (lote B, base): 20261210040000.
 *
 * O BIC (codigo SWIFT) passa a ser um campo da conta bancaria, com formato
 * validado, configuravel como o IBAN e que se grava mesmo sem IBAN; e
 * rpc_hr_definir_bic corrige so o BIC na ficha.
 *
 * Saiu de loteAAdmissaoMigrations.test.ts (que passou das 800 linhas por levar
 * dois lotes); os auxiliares sao partilhados em migrationSql.ts. Excepcao
 * deliberada a regra "nao testar SQL por texto" (a mesma de
 * loteAAdmissaoMigrations.test.ts): isto NAO testa comportamento de SQL -- esse
 * fica nos blocos de conferir da propria migration, que correm contra o
 * Postgres no `db push`. Testa o que nenhum compilador ve e que se desfaz em
 * silencio quando um lado muda e o outro nao.
 */
import { describe, expect, it } from "vitest";
import {
  camposObrigatoriosDe,
  corpoDaFuncao,
  migrationPorVersao,
  semComentarios,
  temComando,
} from "./migrationSql";

const M2 = migrationPorVersao("20261210020000");
const M4 = migrationPorVersao("20261210040000");

function compacto(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const camposObrigatorios = camposObrigatoriosDe;

// -----------------------------------------------------------------------------
// 20261210040000 -- o BIC na conta bancaria
// -----------------------------------------------------------------------------

describe("migration 20261210040000 -- o BIC (codigo SWIFT) na conta bancaria", () => {
  const corpoSubmeterM4 = corpoDaFuncao(M4, "rpc_hr_convite_admissao_submeter");
  const submeterSemComentarios = semComentarios(corpoSubmeterM4);

  it("a lista de campos passa a 29 de origem 'pessoa' e os mesmos 5 de 'rh', com conta_bic nao condicional", () => {
    const campos = camposObrigatorios(M4);
    expect(campos.filter((c) => c.origem === "pessoa")).toHaveLength(29);
    expect(
      campos
        .filter((c) => c.origem === "rh")
        .map((c) => c.codigo)
        .sort(),
    ).toEqual(["cargo", "data_admissao", "duodecimos", "subsidio_alimentacao", "tipo_contrato"]);
    const bic = campos.find((c) => c.codigo === "conta_bic");
    expect(bic).toEqual({ codigo: "conta_bic", origem: "pessoa", condicional: false });
  });

  it("conta_bic vem logo a seguir a conta_banco e o gancho do horario continua comentado", () => {
    const codigos = camposObrigatorios(M4).map((c) => c.codigo);
    expect(codigos.indexOf("conta_bic")).toBe(codigos.indexOf("conta_banco") + 1);
    expect(codigos).not.toContain("tipo_horario");
    expect(M4).toMatch(/GANCHO: o campo tipo_horario/);
  });

  it("os codigos da lista de M4 sao os de M2 mais conta_bic (nada se perdeu na copia)", () => {
    const antes = camposObrigatorios(M2).map((c) => c.codigo);
    const depois = camposObrigatorios(M4).map((c) => c.codigo);
    expect(depois.filter((c) => c !== "conta_bic")).toEqual(antes);
  });

  it("todo o campo de M4 tem permissao e conta_bic exige hr.pessoas.bancarios.view", () => {
    const corpo = corpoDaFuncao(M4, "hr_admissao_campo_permissao");
    const comPermissao = new Set(
      [...corpo.matchAll(/\('([a-z0-9_]+)',\s*'[a-z_]+',\s*'hr\.[a-z.]+'\)/g)].map((m) => m[1]),
    );
    for (const campo of camposObrigatorios(M4)) {
      expect(comPermissao.has(campo.codigo), `sem permissao: ${campo.codigo}`).toBe(true);
    }
    expect(corpo).toMatch(/'conta_bic',\s+'pessoas_dados_bancarios',\s+'hr\.pessoas\.bancarios\.view'/);
  });

  it("as pendencias leem o BIC da coluna swift e mantem o resto do corpo de M2", () => {
    const corpo = corpoDaFuncao(M4, "hr_admissao_pendencias");
    expect(corpo).toMatch(/nullif\(btrim\(coalesce\(b\.swift, ''\)\), ''\)\s+AS conta_bic/);
    expect(corpo).toMatch(/c\.posicao IN \('convite', 'ficha'\)/);
    expect(corpo).toMatch(/p\.cargo_id::text\s+AS cargo/);
    expect(corpo).toMatch(/v_servico/);
    expect(corpo).toMatch(/c\.codigo <> 'validade_documento'/);
    expect(corpo).toMatch(/c\.codigo <> 'nif'/);
    expect(corpo).not.toMatch(/c\.obrigatorio/);
    // Sem condicao especial para o BIC no WHERE final.
    expect(semComentarios(corpo)).not.toMatch(/c\.codigo <> 'conta_bic'/);
  });

  it("hr_bic_valido: IMMUTABLE, 8 ou 11 caracteres, NULL e falso, sem acesso a anon", () => {
    expect(M4).toMatch(/CREATE OR REPLACE FUNCTION public\.hr_bic_valido\(p_bic text\)/);
    expect(M4).toMatch(/RETURNS boolean\s+LANGUAGE sql IMMUTABLE PARALLEL SAFE/);
    const corpo = semComentarios(corpoDaFuncao(M4, "hr_bic_valido"));
    expect(corpo).toContain("^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$");
    expect(corpo).toMatch(/p_bic IS NOT NULL/);
    expect(temComando(M4, "REVOKE ALL ON FUNCTION public.hr_bic_valido(text) FROM PUBLIC;")).toBe(true);
    expect(temComando(M4, "REVOKE ALL ON FUNCTION public.hr_bic_valido(text) FROM anon;")).toBe(true);
    expect(temComando(M4, "GRANT EXECUTE ON FUNCTION public.hr_bic_valido(text) TO authenticated;")).toBe(true);
    expect(temComando(M4, "GRANT EXECUTE ON FUNCTION public.hr_bic_valido(text) TO service_role;")).toBe(true);
    expect(temComando(M4, "GRANT EXECUTE ON FUNCTION public.hr_bic_valido(text) TO anon;")).toBe(false);
  });

  it("a constraint antiga cai, a nova entra NOT VALID e so se valida se nao houver legado", () => {
    expect(M4).toMatch(/DROP CONSTRAINT IF EXISTS pessoas_dados_bancarios_swift_formato\b/);
    expect(M4).toMatch(
      /ADD CONSTRAINT pessoas_dados_bancarios_swift_bic_formato\s+CHECK \(swift IS NULL OR public\.hr_bic_valido\(swift\)\)\s+NOT VALID/,
    );
    expect(M4).toMatch(/VALIDATE CONSTRAINT pessoas_dados_bancarios_swift_bic_formato/);
    // O legado conta-se e avisa-se com a contagem; os valores nunca saem.
    expect(M4).toMatch(/RAISE NOTICE[^;]*%/);
    const nova = M4.indexOf("ADD CONSTRAINT pessoas_dados_bancarios_swift_bic_formato");
    const validar = M4.indexOf("VALIDATE CONSTRAINT pessoas_dados_bancarios_swift_bic_formato");
    expect(nova).toBeGreaterThan(0);
    expect(nova).toBeLessThan(validar);
  });

  it("o cabecalho avisa que a migration e o codigo novo entram no mesmo deploy", () => {
    const cabecalho = M4.slice(0, M4.indexOf("-- ---- Guardas"));
    expect(cabecalho).toMatch(/MESMO deploy/);
    expect(cabecalho).toMatch(/convite-admissao/);
    expect(cabecalho).toMatch(/20261210030000/);
  });

  it("o cabecalho diz claramente que a criacao de acesso fica travada para fichas sem BIC", () => {
    const cabecalho = M4.slice(0, M4.indexOf("-- ---- Guardas"));
    // conta_bic fica com posicao por omissao 'convite' (decisao do produto: o BIC como o IBAN).
    expect(cabecalho).toMatch(/Posicao por omissao: convite|posicao por omissao 'convite'/);
    expect(cabecalho).toMatch(/CRIACAO DE ACESSO FICA TRAVADA/);
    expect(cabecalho).toMatch(/409 ficha_incompleta/);
    expect(cabecalho).toMatch(/ate ele ser\s+(?:--\s*)?preenchido/);
    // Nao manda escrever na configuracao da Mudelar antes do push.
    expect(cabecalho).not.toMatch(/configura conta_bic como opcional antes do push/);
    // E o BIC continua com posicao por omissao 'convite' na lista de campos (nunca opcional).
    expect(M4).toMatch(/\('conta_bic',\s+'pessoa',\s+false\)/);
  });

  it("as seccoes de codigo estao numeradas sem saltos", () => {
    // Os titulos das seccoes de codigo vem logo a seguir a uma linha de "=====" (a lista
    // "A REGRA NOVA" do cabecalho tambem tem numeros, mas nao tem essa moldura).
    const numeros = [...M4.matchAll(/={10,}\r?\n-- (\d+)\. /g)].map((m) => Number(m[1]));
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("o legado do swift fica documentado no cabecalho e o conferir exige o tratamento na submissao", () => {
    const cabecalho = M4.slice(0, M4.indexOf("-- ---- Guardas"));
    expect(cabecalho).toMatch(/em TODA\s+(?:--\s*)?a escrita a essa linha/);
    expect(cabecalho).toMatch(/passa um swift legado invalido a NULL/);
    expect(M4).toMatch(/perdeu o tratamento do swift legado invalido/);
  });

  it("submeter de M4 leva o BIC e nao perdeu nada de M3", () => {
    for (const marca of [
      "hr_bic_valido",
      "HRA18",
      "v_conta_bic",
      "hr_json_texto(p_dados, 'conta_swift')",
      "HRA16",
      "HRA17",
      "hr_nif_valido",
      "hr_niss_valido",
      "hr_pessoa_duplicados_candidatos",
    ]) {
      expect(corpoSubmeterM4, marca).toContain(marca);
    }
    expect(corpoSubmeterM4).toMatch(/pend\.posicao = 'convite'/);
    expect(corpoSubmeterM4).toMatch(/RETURNING pessoa_id, organization_id INTO v_pessoa_id, v_org/);
  });

  it("o BIC e normalizado (maiusculas, sem espacos) antes de validar e de gravar", () => {
    expect(submeterSemComentarios).toMatch(
      /v_conta_bic := nullif\(upper\(regexp_replace\(coalesce\(public\.hr_json_texto\(p_dados, 'conta_swift'\), ''\), '\[\[:space:\]\]', '', 'g'\)\), ''\);/,
    );
    // O INSERT do ramo do IBAN grava a variavel normalizada, nao o texto cru.
    const insere = submeterSemComentarios.indexOf("v_secret_id, right(v_conta_num, 4), left(v_conta_num, 2),");
    expect(insere).toBeGreaterThan(0);
    expect(submeterSemComentarios.slice(insere, insere + 120)).toContain("v_conta_bic, true");
  });

  it("um BIC em branco nunca apaga o da ficha e um swift legado invalido passa a NULL (ramo do IBAN)", () => {
    // Um BIC dado grava-se; sem BIC fica o que la esta se for valido; senao NULL.
    expect(compacto(submeterSemComentarios)).toMatch(
      /swift = CASE WHEN v_conta_bic IS NOT NULL THEN EXCLUDED\.swift WHEN public\.hr_bic_valido\(pessoas_dados_bancarios\.swift\) THEN pessoas_dados_bancarios\.swift ELSE NULL END/,
    );
    // Ja nao depende de a CHAVE conta_swift existir em p_dados (o ecra envia-a sempre,
    // null quando vazia, e isso apagava um BIC gravado pelo RH).
    expect(submeterSemComentarios).not.toMatch(/swift = CASE WHEN p_dados \? 'conta_swift'/);
  });

  it("os dois ramos do BIC concordam: o ramo so-BIC so corre com BIC preenchido e escreve o dado", () => {
    expect(submeterSemComentarios).toMatch(/IF v_conta_num IS NULL AND v_conta_bic IS NOT NULL THEN/);
    expect(submeterSemComentarios).toMatch(/swift = EXCLUDED\.swift,\s+updated_at = now\(\)/);
  });

  it("a validacao do BIC vem DEPOIS do IBAN e ANTES do portao, e vale mesmo sem IBAN", () => {
    const iban = submeterSemComentarios.indexOf("RAISE EXCEPTION 'iban_invalido'");
    const bic = submeterSemComentarios.indexOf("RAISE EXCEPTION 'bic_invalido' USING ERRCODE = 'HRA18'");
    const portao = submeterSemComentarios.indexOf("FROM public.hr_admissao_pendencias(v_pessoa_id)");
    expect(iban).toBeGreaterThan(0);
    expect(bic).toBeGreaterThan(iban);
    expect(bic).toBeLessThan(portao);
    expect(submeterSemComentarios).toMatch(
      /IF v_conta_bic IS NOT NULL AND NOT public\.hr_bic_valido\(v_conta_bic\) THEN/,
    );
  });

  it("o portao dispensa conta_bic quando a pessoa o deu, independente do IBAN", () => {
    expect(submeterSemComentarios).toMatch(/AND NOT \(pend\.codigo = 'conta_bic'\s+AND v_conta_bic IS NOT NULL\)/);
  });

  it("um BIC sem IBAN grava so o BIC, sem auditoria de acesso sensivel", () => {
    const ramo = submeterSemComentarios.indexOf("v_conta_num IS NULL AND v_conta_bic IS NOT NULL");
    const retorno = submeterSemComentarios.indexOf("RETURN v_pessoa_id;");
    expect(ramo).toBeGreaterThan(0);
    expect(ramo).toBeLessThan(retorno);
    const bloco = submeterSemComentarios.slice(ramo, retorno);
    expect(bloco).toMatch(/INSERT INTO public\.pessoas_dados_bancarios/);
    expect(bloco).toMatch(/ON CONFLICT \(pessoa_id\) DO UPDATE SET\s+swift = EXCLUDED\.swift/);
    expect(bloco).not.toMatch(/hr_registar_acesso_sensivel/);
    expect(bloco).not.toMatch(/vault\./);
    // A auditoria do ramo do IBAN continua la, uma so vez.
    expect(
      submeterSemComentarios.match(/hr_registar_acesso_sensivel\(v_pessoa_id, v_org, 'conta_bancaria', 'alterar'\)/g),
    ).toHaveLength(1);
  });

  it("submeter de M4 continua so service_role", () => {
    const assinatura = "rpc_hr_convite_admissao_submeter(text, jsonb, text, inet, text)";
    for (const quem of ["PUBLIC", "anon", "authenticated"]) {
      expect(temComando(M4, `REVOKE ALL ON FUNCTION public.${assinatura} FROM ${quem};`), quem).toBe(true);
    }
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`)).toBe(true);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`)).toBe(false);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO anon;`)).toBe(false);
  });

  it("registar_recusa de M4 aceita os 10 codigos (com bic_invalido) e continua so service_role", () => {
    const corpo = corpoDaFuncao(M4, "rpc_hr_convite_admissao_registar_recusa");
    const lista = /c_codigos constant text\[\] := ARRAY\[([^\]]*)\]/.exec(corpo);
    expect(lista).not.toBeNull();
    const codigos = [...(lista === null ? "" : lista[1]).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(codigos).toHaveLength(10);
    expect(codigos).toContain("bic_invalido");
    expect(corpo).toMatch(/p_codigo IN \('nif_ja_existe', 'niss_ja_existe'\)\s+THEN least\(attempts \+ 1, c_tecto\)/);
    const assinatura = "rpc_hr_convite_admissao_registar_recusa(text, text, text[], uuid[])";
    for (const quem of ["PUBLIC", "anon", "authenticated"]) {
      expect(temComando(M4, `REVOKE ALL ON FUNCTION public.${assinatura} FROM ${quem};`), quem).toBe(true);
    }
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`)).toBe(true);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`)).toBe(false);
  });

  it("rpc_hr_definir_conta: mesma assinatura de 7 argumentos, normaliza e valida o BIC", () => {
    const assinatura = "rpc_hr_definir_conta(uuid, text, text, text, text, text, text)";
    expect(M4).toMatch(
      /CREATE OR REPLACE FUNCTION public\.rpc_hr_definir_conta\(\s*p_pessoa_id uuid,\s*p_formato\s+text,\s*p_conta\s+text,\s*p_titular\s+text DEFAULT NULL,\s*p_banco\s+text DEFAULT NULL,\s*p_agencia\s+text DEFAULT NULL,\s*p_swift\s+text DEFAULT NULL\s*\)/,
    );
    // Nunca DROP + CREATE: duas candidatas ja pararam o PostgREST.
    expect(semComentarios(M4)).not.toMatch(/DROP FUNCTION[^;]*rpc_hr_definir_conta/);
    const corpo = semComentarios(corpoDaFuncao(M4, "rpc_hr_definir_conta"));
    expect(corpo).toMatch(/v_swift\s+text;/);
    expect(corpo).toMatch(
      /v_swift := nullif\(upper\(regexp_replace\(coalesce\(p_swift, ''\), '\[\[:space:\]\]', '', 'g'\)\), ''\);/,
    );
    expect(corpo).toMatch(
      /IF v_swift IS NOT NULL AND NOT public\.hr_bic_valido\(v_swift\) THEN\s+RAISE EXCEPTION 'bic_invalido';/,
    );
    // O INSERT e o ON CONFLICT usam a variavel normalizada, nunca o parametro cru.
    expect(corpo).toMatch(/v_secret_id, right\(v_conta, 4\), v_pais, v_swift,/);
    expect(corpo).toMatch(/swift\s+=\s+EXCLUDED\.swift/);
    expect(corpo).not.toMatch(/v_pais, p_swift/);
    // Conserva o resto de 20261125030000: Vault, gate e auditoria.
    expect(corpo).toMatch(/hr\.pessoas\.bancarios\.edit/);
    expect(corpo).toMatch(/vault\.create_secret/);
    expect(corpo).toMatch(/hr_registar_acesso_sensivel\(p_pessoa_id, v_org, 'conta_bancaria', 'alterar'\)/);
    expect(temComando(M4, `REVOKE ALL ON FUNCTION public.${assinatura} FROM anon;`)).toBe(true);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`)).toBe(true);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO anon;`)).toBe(false);
  });

  it("a validacao do BIC em definir_conta vem depois da conta e antes de ir ao Vault", () => {
    const corpo = semComentarios(corpoDaFuncao(M4, "rpc_hr_definir_conta"));
    expect(corpo.indexOf("'iban_invalido'")).toBeGreaterThan(0);
    expect(corpo.indexOf("'iban_invalido'")).toBeLessThan(corpo.indexOf("'bic_invalido'"));
    expect(corpo.indexOf("'bic_invalido'")).toBeLessThan(corpo.indexOf("vault.create_secret"));
  });

  it("o bloco de conferir nao escreve dados e prova as funcoes, a lista e os privilegios", () => {
    const conferir = M4.slice(M4.lastIndexOf("DO $conferir$"));
    expect(conferir).toMatch(/OK: /);
    for (const marca of [
      "CGDIPTPLXXX",
      "CGDI1TPL",
      "ABCD1234",
      "hr_admissao_campos_obrigatorios_org",
      "hr_admissao_campos_override_validos",
      "swift_bic_formato",
      "has_function_privilege",
      "HRA01",
    ]) {
      expect(conferir, marca).toContain(marca);
    }
    expect(conferir).not.toMatch(/\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE public\./);
    expect(conferir).not.toContain("HR900");
  });

  it("cuidados de escrita: sem ::regclass resolvido cedo", () => {
    expect(semComentarios(M4)).not.toContain("::regclass");
  });
});

describe("migration 20261210040000 -- rpc_hr_definir_bic (corrigir so o BIC na ficha)", () => {
  const assinatura = "rpc_hr_definir_bic(uuid, text)";

  it("existe uma vez, com dois argumentos, e so se define em M4", () => {
    expect(M4.match(/CREATE (?:OR REPLACE )?FUNCTION public\.rpc_hr_definir_bic\(/g)).toHaveLength(1);
    expect(M4).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_hr_definir_bic\(\s*p_pessoa_id uuid,\s*p_bic\s+text\s*\)/);
    expect(semComentarios(M4)).not.toMatch(/DROP FUNCTION[^;]*rpc_hr_definir_bic/);
  });

  it("o gate e hr.pessoas.bancarios.edit na organizacao da pessoa, e a pessoa tem de existir", () => {
    const corpo = semComentarios(corpoDaFuncao(M4, "rpc_hr_definir_bic"));
    expect(corpo).toMatch(/has_anew_permission_in_org\(auth\.uid\(\), 'hr\.pessoas\.bancarios\.edit', v_org\)/);
    expect(corpo).toMatch(/p\.deleted_at IS NULL/);
    expect(corpo).toMatch(/RAISE EXCEPTION 'pessoa_nao_encontrada'/);
    expect(corpo).toMatch(/RAISE EXCEPTION 'insufficient_privilege'/);
    // O gate vem antes de qualquer validacao ou escrita.
    expect(corpo.indexOf("insufficient_privilege")).toBeLessThan(corpo.indexOf("hr_bic_valido"));
    expect(corpo.indexOf("insufficient_privilege")).toBeLessThan(corpo.indexOf("INSERT INTO"));
  });

  it("normaliza, valida e nunca grava um BIC mal formado", () => {
    const corpo = semComentarios(corpoDaFuncao(M4, "rpc_hr_definir_bic"));
    expect(corpo).toMatch(/v_bic := nullif\(upper\(regexp_replace\(coalesce\(p_bic, ''\), '\[\[:space:\]\]', '', 'g'\)\), ''\);/);
    expect(corpo).toMatch(/IF v_bic IS NOT NULL AND NOT public\.hr_bic_valido\(v_bic\) THEN\s+RAISE EXCEPTION 'bic_invalido';/);
    expect(corpo.indexOf("'bic_invalido'")).toBeLessThan(corpo.indexOf("INSERT INTO"));
  });

  it("um BIC vazio limpa e nunca cria linha; um valido cria a linha sem segredo nem auditoria", () => {
    const corpo = semComentarios(corpoDaFuncao(M4, "rpc_hr_definir_bic"));
    const limpa = corpo.indexOf("IF v_bic IS NULL THEN");
    const insere = corpo.indexOf("INSERT INTO");
    expect(limpa).toBeGreaterThan(0);
    expect(limpa).toBeLessThan(insere);
    expect(corpo.slice(limpa, insere)).toMatch(/UPDATE public\.pessoas_dados_bancarios\s+SET swift\s+= NULL/);
    // Sem linha a limpar devolve false (o ecra nao diz "guardado" quando nada se gravou).
    expect(corpo.slice(limpa, insere)).toMatch(/GET DIAGNOSTICS v_n = ROW_COUNT;\s+RETURN v_n > 0;/);
    expect(corpo).toMatch(/ON CONFLICT \(pessoa_id\) DO UPDATE SET\s+swift\s+= EXCLUDED\.swift/);
    expect(corpo).not.toMatch(/hr_registar_acesso_sensivel/);
    expect(corpo).not.toMatch(/vault\./);
    // Escreve so a coluna swift: nunca toca no segredo nem nas mascaras da conta.
    expect(corpo).not.toMatch(/conta_secret_id|conta_ultimos4|titular/);
  });

  it("devolve boolean: true se escreveu, false se nao havia nada a alterar", () => {
    const inicio = M4.indexOf("CREATE OR REPLACE FUNCTION public.rpc_hr_definir_bic(");
    const cabeca = M4.slice(inicio, M4.indexOf("AS $$", inicio));
    expect(cabeca).toMatch(/RETURNS boolean/);
    expect(cabeca).not.toMatch(/RETURNS void/);
    const corpo = semComentarios(corpoDaFuncao(M4, "rpc_hr_definir_bic"));
    // O caminho que escreve termina em RETURN true; nao ha RETURN; solto.
    expect(corpo).toMatch(/RETURN true;/);
    expect(corpo).not.toMatch(/RETURN;/);
    // O conferir prova o tipo de retorno.
    expect(M4).toMatch(/pg_get_function_result\(p\.oid\) = 'boolean'/);
  });

  it("e executavel por authenticated e service_role, nunca por anon", () => {
    expect(temComando(M4, `REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC;`)).toBe(true);
    expect(temComando(M4, `REVOKE ALL ON FUNCTION public.${assinatura} FROM anon;`)).toBe(true);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated;`)).toBe(true);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO service_role;`)).toBe(true);
    expect(temComando(M4, `GRANT EXECUTE ON FUNCTION public.${assinatura} TO anon;`)).toBe(false);
  });

  it("e SECURITY DEFINER com search_path fixo", () => {
    const inicio = M4.indexOf("CREATE OR REPLACE FUNCTION public.rpc_hr_definir_bic(");
    const cabeca = M4.slice(inicio, M4.indexOf("AS $$", inicio));
    expect(cabeca).toMatch(/SECURITY DEFINER/);
    expect(cabeca).toMatch(/SET search_path TO 'public', 'pg_temp'/);
  });
});
