/**
 * O CONTEUDO DAS CINCO MIGRATIONS DO FLUXO 2 (cargo e salario).
 *
 * 20261210100000  hr_cargos_periodos       (aditiva)
 * 20261210110000  hr_pessoas_cargos        (precisa de codigo novo)
 * 20261210120000  hr_retribuicao_vem_do_cargo (precisa de codigo novo)
 * 20261210130000  hr_cargo_definir_salario (precisa de codigo novo)
 * 20261210140000  hr_cargos_relatorio_e_documentos
 *
 * Mesma excepcao deliberada a regra "nao testar SQL por texto" de
 * loteAAdmissaoMigrations.test.ts: isto NAO testa comportamento -- esse fica nos
 * blocos de conferir das proprias migrations, que correm no `db push`. Testa so
 * os contratos que nenhum compilador ve e que se desfazem em silencio quando um
 * lado muda e o outro nao:
 *
 *   - os codigos HRC que a base lanca tem texto no ecra (errosCargo.ts), e
 *     todos os codigos do ecra existem na base;
 *   - as tres migrations que partem ecras actuais dizem-no no cabecalho;
 *   - as RPCs publicas nao ficam abertas a anon;
 *   - a permissao nova e perigosa e nao e dada a nenhum papel por omissao;
 *   - a migration do trigger de igualdade recria a funcao e usa o cargo da pessoa
 *     NA DATA da versao;
 *   - todas acabam o conferir com HR900, e nenhuma desliga triggers.
 */
import { describe, expect, it } from "vitest";
import { CHAVE_POR_CODIGO } from "@/lib/hr/errosCargo";
import { MIGRATIONS, corpoDaFuncao, migrationPorVersao, semComentarios } from "./migrationSql";

const VERSOES = [
  "20261210100000",
  "20261210110000",
  "20261210120000",
  "20261210130000",
  "20261210140000",
] as const;

const M1 = () => migrationPorVersao(VERSOES[0]);
const M2 = () => migrationPorVersao(VERSOES[1]);
const M3 = () => migrationPorVersao(VERSOES[2]);
const M4 = () => migrationPorVersao(VERSOES[3]);
const M5 = () => migrationPorVersao(VERSOES[4]);

const TODAS = () => VERSOES.map((v) => migrationPorVersao(v));
const normalizar = (sql: string) => sql.replace(/\s+/g, " ");

describe("fluxo 2: os cinco ficheiros", () => {
  it("existem, com timestamps unicos e posteriores a ultima do lote da admissao", () => {
    const nomes = Object.keys(MIGRATIONS).map((k) => k.split("/").pop() as string);
    for (const versao of VERSOES) {
      const encontrados = nomes.filter((n) => n.startsWith(`${versao}_`));
      expect(encontrados, `migration ${versao}`).toHaveLength(1);
      expect(Number(versao)).toBeGreaterThan(20261210080000);
    }
    expect(new Set(VERSOES).size).toBe(VERSOES.length);
  });
});

describe("fluxo 2: contrato de codigos de erro com o ecra", () => {
  const CODIGOS_NOS_FICHEIROS = () => {
    const achados = new Set<string>();
    for (const sql of TODAS()) {
      for (const m of semComentarios(sql).matchAll(/\bHRC\d\d\b/g)) achados.add(m[0]);
    }
    return achados;
  };

  it("todo o codigo HRC que a base lanca tem texto em errosCargo", () => {
    const emFalta = [...CODIGOS_NOS_FICHEIROS()].filter((c) => !CHAVE_POR_CODIGO[c]);
    expect(emFalta).toEqual([]);
  });

  it("todo o codigo HRC do ecra e lancado por alguma das cinco migrations", () => {
    const lancados = CODIGOS_NOS_FICHEIROS();
    const semOrigem = Object.keys(CHAVE_POR_CODIGO).filter(
      (c) => c.startsWith("HRC") && !lancados.has(c),
    );
    expect(semOrigem).toEqual([]);
  });
});

describe("fluxo 2: cabecalhos e dependencias de codigo", () => {
  it.each([
    ["M2", () => M2()],
    ["M3", () => M3()],
    ["M4", () => M4()],
  ])("%s avisa que precisa de codigo novo no mesmo commit", (_nome, ler) => {
    expect(ler()).toContain("PRECISA DE CODIGO NOVO NO MESMO COMMIT");
  });

  it("nenhuma das cinco traz ficheiro de reversao ao lado", () => {
    const nomes = Object.keys(MIGRATIONS).map((k) => k.split("/").pop() as string);
    const doFluxo = nomes.filter((n) => VERSOES.some((v) => n.startsWith(`${v}_`)));
    expect(doFluxo.filter((n) => /revert|reverter|rollback/i.test(n))).toEqual([]);
  });
});

describe("fluxo 2: privilegios", () => {
  const RPCS_PUBLICAS: Array<[string, () => string]> = [
    ["rpc_hr_cargo_definir_salario", () => M4()],
    ["rpc_hr_pessoa_mudar_cargo", () => M3()],
    ["rpc_hr_retribuicao_definir_pessoal", () => M3()],
  ];

  it.each(RPCS_PUBLICAS)("%s: REVOKE a PUBLIC e anon, GRANT so a authenticated e service_role", (nome, ler) => {
    // A convencao do projecto: um comando por papel.
    const sql = normalizar(semComentarios(ler()));
    const assinatura = `public\\.${nome}\\([^)]*\\)`;
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${assinatura} FROM PUBLIC;`));
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${assinatura} FROM anon;`));
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${assinatura} TO authenticated;`));
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${assinatura} TO service_role;`));
    // Nunca um GRANT a anon ou a PUBLIC.
    expect(sql).not.toMatch(new RegExp(`GRANT [^;]*ON FUNCTION ${assinatura} TO [^;]*\\b(anon|PUBLIC)\\b`));
  });

  it("a permissao hr.cargos.salario.alterar e perigosa e nao e atribuida a nenhum papel na M1", () => {
    const sql = semComentarios(M1());
    expect(sql).toContain("hr.cargos.salario.alterar");
    expect(normalizar(sql)).toMatch(/hr\.cargos\.salario\.alterar[^;]*true/);
    expect(normalizar(sql)).not.toMatch(/INSERT INTO (public\.)?anew_role_permissions/i);
    expect(normalizar(sql)).not.toMatch(/(UPDATE|DELETE FROM) (public\.)?anew_role_permissions/i);
  });

  it("a atribuicao ao papel super_admin (so do branch) NAO vive no repositorio", () => {
    const nomes = Object.keys(MIGRATIONS).map((k) => k.split("/").pop() as string);
    expect(nomes.filter((n) => n.startsWith("20261210150000_"))).toEqual([]);
    expect(nomes.filter((n) => /branch_atribuir_permissao_salario/i.test(n))).toEqual([]);
  });

  it("os periodos de salario so se leem com hr.pessoas.retribuicao.view (nunca laborais.view)", () => {
    const sql = normalizar(semComentarios(M1()));
    const politica = sql.match(/CREATE POLICY hr_cargos_periodos_select[^;]*;/)?.[0] ?? "";
    expect(politica).toContain("hr.pessoas.retribuicao.view");
    expect(politica).not.toContain("laborais");
  });

  it("M4 fecha as colunas de salario de hr_cargos e concede o resto coluna a coluna", () => {
    const sql = normalizar(semComentarios(M4()));
    expect(sql).toContain("REVOKE SELECT ON TABLE public.hr_cargos FROM authenticated;");
    const concessao = sql.match(/GRANT SELECT \(([^)]*)\) ON TABLE public\.hr_cargos TO authenticated;/);
    expect(concessao).not.toBeNull();
    const colunas = (concessao?.[1] ?? "").split(",").map((c) => c.trim());
    expect(colunas).toContain("nome");
    expect(colunas).not.toContain("salario_base");
    expect(colunas).not.toContain("periodicidade");
  });

  it("M4 exige hr.cargos.salario.alterar para criar um cargo com salario", () => {
    const sql = semComentarios(M4());
    expect(sql).toMatch(/BEFORE INSERT ON public\.hr_cargos/);
    expect(sql).toContain("hr_cargos_salario_so_com_permissao");
  });
});

describe("fluxo 2: o salario vem do cargo, na data da versao", () => {
  it("M3 recria hr_retribuicao_valor_conforme_cargo e usa o cargo da pessoa nessa data", () => {
    const sql = semComentarios(M3());
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.hr_retribuicao_valor_conforme_cargo\(/);
    expect(sql).toContain("hr_pessoa_cargo_em");
    expect(sql).toContain("hr_cargo_salario_em");
  });

  it("M3 fecha o INSERT directo de retribuicoes a authenticated com uma politica restritiva", () => {
    const sql = normalizar(semComentarios(M3()));
    expect(sql).toMatch(/AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK \(false\)/);
  });

  it("M4 impede o UPDATE directo do salario do cargo (HRC01)", () => {
    const sql = semComentarios(M4());
    expect(sql).toContain("HRC01");
    expect(sql).toMatch(/BEFORE UPDATE OF salario_base, periodicidade/);
  });

  it("M3 guarda o UPDATE directo de retribuicoes: trigger com a GUC das funcoes e politica contra o soft delete", () => {
    const sql = normalizar(semComentarios(M3()));
    expect(sql).toContain("hr_retribuicoes_escrita_so_por_rpc");
    expect(sql).toContain("hr.retribuicao_via_rpc");
    expect(sql).toMatch(/pessoas_retribuicoes_update_sem_apagar ON public\.pessoas_retribuicoes AS RESTRICTIVE FOR UPDATE TO authenticated USING \(true\) WITH CHECK \(deleted_at IS NULL\)/);
  });

  it("M3: mudar o cargo com data passada exige tambem retribuicao.corrigir, e so devolve o salario a quem tem retribuicao.view", () => {
    const corpo = corpoDaFuncao(M3(), "rpc_hr_pessoa_mudar_cargo");
    expect(corpo).toContain("hr.pessoas.retribuicao.corrigir");
    expect(corpo).toContain("hr.pessoas.retribuicao.view");
  });

  it("os locks de pessoa e de cargo sao FOR NO KEY UPDATE (nunca FOR UPDATE)", () => {
    // Uma clausula de lock acaba em ";" (as politicas "FOR UPDATE TO authenticated" nao contam).
    expect(semComentarios(M3())).not.toMatch(/\bFOR UPDATE\s*;/);
    expect(semComentarios(M4())).not.toMatch(/\bFOR UPDATE\s*;/);
    expect(semComentarios(M3())).toMatch(/\bFOR NO KEY UPDATE\s*;/);
    expect(semComentarios(M4())).toMatch(/\bFOR NO KEY UPDATE\s*;/);
  });
});

describe("fluxo 2: seguranca do conferir", () => {
  it.each(VERSOES)("%s acaba o teste fabricado com HR900", (versao) => {
    expect(semComentarios(migrationPorVersao(versao))).toContain("HR900");
  });

  it.each(VERSOES)("%s nunca desliga triggers nem muda o papel de replicacao", (versao) => {
    const sql = semComentarios(migrationPorVersao(versao));
    expect(sql).not.toMatch(/session_replication_role/i);
    expect(sql).not.toMatch(/DISABLE TRIGGER/i);
  });

  it("M5 define o relatorio de divergencias do periodo", () => {
    expect(semComentarios(M5())).toContain("hr_cargos_retribuicoes_divergentes");
  });
});
