/**
 * @vitest-environment node
 */
// 26/11: a migration da fase A1.1 dos ATIVOS (20270129100000) lida como TEXTO, antes de qualquer push. Confere o que
// se pode conferir sem a correr: CRLF, cabeçalho (só base de RH, ecrã no mesmo envio, ordem de aplicação, a fase 1 não
// se reescreve), uma só transação, assinaturas que só crescem (DROP + CREATE das que ganham parâmetros), a correção do
// RH a pedir ativos.edit e nunca as permissões do RH (ATV-1), a ordem dos trincos, a carga antes da regra da fonte
// única, as correções M1..M8 da revisão final, os códigos ATV19..ATV33 e HRA91, e os RAISE com tantos argumentos como %.
// Erros de tipo do SQL só se apanham a correr na base: as guardas G1..G6 e C1..C10 fazem-no dentro da transação.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pasta = resolve(process.cwd(), "supabase/migrations");
const nome = "20270129100000_ativos_a1.sql";
const caminho = resolve(pasta, nome);
const bytes = existsSync(caminho) ? readFileSync(caminho) : Buffer.alloc(0);
const bruto = bytes.toString("utf8");
/** Sem comentários de linha e com os espaços normalizados. */
const sql = bruto.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");

/** O corpo de uma função: de CREATE [OR REPLACE] FUNCTION public.<nome>( até ao $$; que a fecha. */
function corpo(fn: string): string {
  const m = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\(`).exec(sql);
  if (!m) return "";
  const fim = sql.indexOf("$$;", sql.indexOf("AS $$", m.index));
  return sql.slice(m.index, fim + 3);
}

/** A lista de parâmetros de uma função (o texto entre o primeiro ( e o ) antes de RETURNS). */
function parametros(fn: string): string {
  const c = corpo(fn);
  return c.slice(c.indexOf("(") + 1, c.indexOf(") RETURNS")).trim();
}

const HOJE_CRIAR =
  "p_organization_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid, p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer, p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid, p_localizacao text, p_notas text,";
const HOJE_ALTERAR =
  "p_id uuid, p_organization_id uuid, p_nome text, p_tipo text, p_cat_equipamento_id uuid, p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer, p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid, p_localizacao text, p_notas text,";
const HOJE_ATRIBUIR =
  "p_pessoa_id uuid, p_organization_id uuid, p_tipo text, p_descricao text, p_valor numeric, p_entrega date, p_conta_modo text DEFAULT 'repartido'::text, p_conta_meses integer DEFAULT NULL::integer, p_conta_inicio date DEFAULT NULL::date, p_conta_fim date DEFAULT NULL::date, p_id uuid DEFAULT gen_random_uuid(),";

const RPCS = [
  "rpc_ativo_criar",
  "rpc_ativo_alterar",
  "rpc_ativo_desativar",
  "rpc_ativo_reativar",
  "rpc_ativos_listar",
  "rpc_ativo_ler",
  "rpc_ativos_opcoes",
  "rpc_ativo_ligar_pessoa",
  "rpc_ativo_desligar_pessoa",
  "rpc_hr_equipamento_atribuir",
  "rpc_hr_equipamento_devolver",
  "rpc_hr_equipamento_alterar_conta",
  "rpc_hr_equipamentos_listar",
  "rpc_hr_equipamentos_livres",
  "rpc_hr_equipamento_corrigir",
];
const INTERNAS = [
  "ativos_hoje",
  "ativos_prefixo",
  "ativos_proximo_codigo",
  "ativos_validar",
  "ativos_json",
  "ativos_criar_interno",
  "ativos_de_linha_rh",
  "ativos_verificar_entrega",
];

describe(`migration ${nome}`, () => {
  it("existe e usa CRLF em todas as linhas (contado por bytes 0x0D)", () => {
    expect(bytes.length).toBeGreaterThan(0);
    let lf = 0;
    let crlf = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x0a) {
        lf++;
        if (i > 0 && bytes[i - 1] === 0x0d) crlf++;
      }
    }
    expect(lf).toBeGreaterThan(500);
    expect(crlf).toBe(lf);
  });

  it("carimbo maior do que tudo o que existe (20270128200000 é o último no remoto) e único", () => {
    // 27/11: as migrations da fase 1 dos ativos (20270130[1-4]00000, a seguir à onda 7) vêm depois desta, de propósito.
    const fase1 = /^20270130[1-4]00000_/;
    const outras = readdirSync(pasta).filter((f) => /^\d{14}_/.test(f) && f !== nome && !fase1.test(f));
    for (const f of outras) expect(f.slice(0, 14) < nome.slice(0, 14), f).toBe(true);
    expect(nome.slice(0, 14) > "20270128200000").toBe(true);
    expect(readdirSync(pasta).filter((f) => f.startsWith("20270129100000_"))).toEqual([nome]);
    expect(readdirSync(pasta).filter((f) => /ativo/.test(f) && /(revert|reverter|rollback|desfazer)/i.test(f))).toEqual([]);
  });

  it("cabeçalho: base de RH, ecrã no mesmo envio (com o que muda), ordem de aplicação e a fase 1 intacta", () => {
    expect(bruto).toContain("SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth)");
    expect(bruto).toContain("ESTA MIGRATION PRECISA DO ECRÃ NOVO (RH Custos e Ativos) PUBLICADO NA MESMA SESSÃO");
    expect(bruto).toContain("A migration 20270126900000_ativos_registo.sql NÃO se reescreve");
    expect(bruto).toContain("supabase migration list --linked");
    expect(bruto).toContain("ORDEM DE APLICAÇÃO");
    // [M6] o código do RH que muda está nomeado (não custoMes.ts)
    for (const f of ["lib/equipamentos.ts:51-58", "custo/CustoEquipamentos.tsx", "lib/custoItens.ts", "custo/modulo/ItensDoMes.tsx", "custo/rotuloConta.ts", "custo/escolhaConta.ts", "equipamentoDaLinha"]) {
      expect(bruto, f).toContain(f);
    }
    for (const m of ["[M1]", "[M2]", "[M3]", "[M4]", "[M5]", "[M6]", "[M7]", "[M8]", "[LOW]"]) expect(bruto, m).toContain(m);
  });

  it("uma só transação, com lock_timeout logo no início", () => {
    expect(sql.match(/\bBEGIN;/g)).toHaveLength(1);
    expect(sql.match(/\bCOMMIT;/g)).toHaveLength(1);
    expect(sql.trim().endsWith("COMMIT;")).toBe(true);
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';/);
  });

  it("assinaturas que só crescem: DROP da antiga e CREATE da nova, os parâmetros de hoje à cabeça e os novos com DEFAULT", () => {
    const drops = [...sql.matchAll(/DROP FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(drops.sort()).toEqual(["ativos_validar", "rpc_ativo_alterar", "rpc_ativo_criar", "rpc_hr_equipamento_atribuir"]);
    for (const fn of ["rpc_ativo_criar", "rpc_ativo_alterar", "rpc_hr_equipamento_atribuir", "ativos_validar"]) {
      const d = sql.indexOf(`DROP FUNCTION public.${fn}(`);
      const c = sql.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(d, fn).toBeGreaterThan(0);
      expect(c, fn).toBeGreaterThan(d);
      expect(sql, fn).not.toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    const novos = (p: string, hoje: string) => {
      expect(p.startsWith(hoje), p.slice(0, 80)).toBe(true);
      const resto = p.slice(hoje.length).split(",").map((x) => x.trim()).filter(Boolean);
      expect(resto.length).toBeGreaterThan(0);
      for (const r of resto) expect(r, r).toMatch(/ DEFAULT /);
    };
    novos(parametros("rpc_ativo_criar"), HOJE_CRIAR);
    novos(parametros("rpc_ativo_alterar"), HOJE_ALTERAR);
    novos(parametros("rpc_hr_equipamento_atribuir"), HOJE_ATRIBUIR);
    expect(parametros("rpc_ativo_alterar")).toContain("p_campos_novos boolean DEFAULT false");
    // ligar e desligar ficam (mesma assinatura) e recusam; o DROP é na A1.3
    for (const fn of ["rpc_ativo_ligar_pessoa", "rpc_ativo_desligar_pessoa"]) {
      expect(sql).not.toContain(`DROP FUNCTION public.${fn}`);
      expect(corpo(fn)).toContain("RAISE EXCEPTION 'ATV25'");
    }
    expect(sql).not.toMatch(/\bDROP (TABLE|POLICY|INDEX|TRIGGER)\b/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
  });

  it("ATV-1: a correção pede ativos.edit e NUNCA as permissões nem os eventos do RH", () => {
    const c = corpo("rpc_hr_equipamento_corrigir");
    expect(c).not.toBe("");
    expect(c).toContain("public.ativos_exigir(p_organization_id, 'ativos.edit')");
    expect(c).not.toContain("hr_custo_exigir_escrita");
    expect(c).not.toContain("hr_custo_evento");
    expect(c).not.toContain("hr.pessoas.retribuicao");
    expect(sql).not.toMatch(/INSERT INTO public\.hr_custo_eventos/);
    // eventos no histórico do ativo; limite próprio (o do RH exige as permissões do RH)
    expect(c).toContain("'ocupacao_corrigida'");
    expect(c).toContain("RAISE EXCEPTION 'ATV33'");
    expect(c).toContain("'pessoas_afetadas'");
    // a organização é a do ativo
    expect(c).toMatch(/FROM public\.ativo a WHERE a\.id = p_ativo_id AND a\.organization_id = p_organization_id FOR UPDATE/);
  });

  it("ordem dos trincos: ativo antes da linha do RH (devolver, atribuir com ativo, corrigir)", () => {
    const dev = corpo("rpc_hr_equipamento_devolver");
    const lerSemTrinco = dev.indexOf("SELECT e.ativo_id INTO v_ativo");
    const ativo = dev.indexOf("FROM public.ativo a WHERE a.id = v_ativo AND a.organization_id = p_organization_id FOR UPDATE");
    const linha = dev.indexOf("FOR UPDATE OF e");
    expect(lerSemTrinco).toBeGreaterThan(0);
    expect(ativo).toBeGreaterThan(lerSemTrinco);
    expect(linha).toBeGreaterThan(ativo);
    expect(dev).toContain("IF v_e.ativo_id IS DISTINCT FROM v_ativo THEN");
    expect(dev).toContain("'desligado'");

    const atr = corpo("rpc_hr_equipamento_atribuir");
    const t0 = atr.indexOf("public.hr_custo_exigir_escrita(p_organization_id)");
    const t1 = atr.indexOf("WHERE a.id = p_ativo_id AND a.organization_id = p_organization_id FOR UPDATE");
    const t2 = atr.indexOf("pg_advisory_xact_lock(hashtextextended('hr_equipamentos:'");
    const t4 = atr.indexOf("INSERT INTO public.pessoas_equipamentos");
    expect(t0).toBeGreaterThan(0);
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
    expect(t4).toBeGreaterThan(t2);
    // idempotência ANTES de criar o ativo no caminho 3
    const c3 = atr.lastIndexOf("SELECT e.id, e.pessoa_id, e.organization_id, e.ativo_id INTO v_exist");
    expect(atr.indexOf("public.ativos_de_linha_rh(")).toBeGreaterThan(c3);
    // atribuir escreve `ligado` no ativo (e criar escreve `criado`)
    expect(atr).toContain("'ligado'");
    expect(corpo("ativos_criar_interno")).toContain("'criado'");

    const cor = corpo("rpc_hr_equipamento_corrigir");
    expect(cor.indexOf("FROM public.pessoas_equipamentos pe WHERE pe.id = p_pessoa_equipamento_id")).toBeGreaterThan(
      cor.indexOf("WHERE a.id = p_ativo_id AND a.organization_id = p_organization_id FOR UPDATE"),
    );
  });

  it("[M1] desativar compara com coalesce(data_compra, inicio_aluguer) antes da CHECK, que faz o mesmo", () => {
    const d = corpo("rpc_ativo_desativar");
    const val = d.indexOf("p_data < coalesce(v_atual.data_compra, v_atual.inicio_aluguer)");
    expect(val).toBeGreaterThan(0);
    expect(d.indexOf("UPDATE public.ativo a")).toBeGreaterThan(val);
    expect(d).toContain("RAISE EXCEPTION 'ATV29'");
    expect(sql).toContain("desativado_em >= coalesce(data_compra, inicio_aluguer)");
  });

  it("[M2] reativar recusa um armazém já ocupado (ATV30) e devolve o aviso dos meses passados", () => {
    const r = corpo("rpc_ativo_reativar");
    const rec = r.indexOf("RAISE EXCEPTION 'ATV30'");
    expect(rec).toBeGreaterThan(0);
    expect(r.indexOf("UPDATE public.ativo a")).toBeGreaterThan(rec);
    expect(r).toContain("'aviso'");
    expect(r).toContain("também nos meses passados");
  });

  it("[M3] carga inicial ANTES da regra da fonte única, com guarda que pára em linhas inesperadas", () => {
    const carga = sql.indexOf("DO $carga$");
    const regra = sql.indexOf("ADD CONSTRAINT pessoas_equipamentos_fonte_unica");
    expect(carga).toBeGreaterThan(0);
    expect(regra).toBeGreaterThan(sql.indexOf("DO $carga_conferir$"));
    expect(regra).toBeGreaterThan(carga);
    expect(sql.indexOf("DROP NOT NULL")).toBeLessThan(carga);
    expect(sql).toContain("não se convertem sozinhas em ativo");
    expect(sql).toContain("já ligadas a um ativo pela fase 1");
    // a regra: com ativo, sem cópia; sem ativo, só a farda
    expect(sql).toContain("(ativo_id IS NOT NULL AND tipo IS NULL AND descricao IS NULL AND valor IS NULL");
    expect(sql).toContain("tipo IS NOT NULL AND tipo = 'fardamento'");
  });

  it("[M4] o alugado para o ecrã antigo começa no MAIOR entre o início e a entrega; a compatibilidade usa conta_inicio", () => {
    const l = corpo("rpc_hr_equipamentos_listar");
    expect(l).toContain(
      "greatest(date_trunc('month', a.inicio_aluguer::timestamp)::date, date_trunc('month', q.entrega::timestamp)::date)",
    );
    expect(l).toContain("'conta_desde'");
    for (const k of ["'id'", "'pessoa_id'", "'tipo'", "'descricao'", "'valor'", "'entrega'", "'conta_modo'", "'conta_meses'", "'conta_inicio'", "'conta_fim'", "'estado'", "'devolucao'", "'estado_devolucao'", "'created_at'", "'updated_at'", "'ativo_id'", "'ativo'"]) {
      expect(l, k).toContain(k);
    }
    const lr = corpo("ativos_de_linha_rh");
    expect(lr).toContain("coalesce(p_inicio_aluguer, p_conta_inicio)");
    expect(lr).toContain("CASE WHEN p_conta_modo = 'todosMeses' THEN 'alugado' ELSE 'comprado' END");
    // entrega antes do início: recusada, nunca gravada
    expect(corpo("ativos_verificar_entrega")).toContain("p_entrega < coalesce(p_a.data_compra, p_a.inicio_aluguer)");
  });

  it("[M5] datas do aluguer: início <= primeira entrega, fim >= última, contrato não terminado ao entregar", () => {
    for (const fn of ["rpc_ativo_alterar", "rpc_hr_equipamento_corrigir"]) {
      const c = corpo(fn);
      expect(c, fn).toContain("coalesce(v.data_compra, v.inicio_aluguer) > v_min");
      expect(c, fn).toContain("v.fim_aluguer < v_max");
      expect(c, fn).toContain("RAISE EXCEPTION 'ATV28'");
    }
    const v = corpo("ativos_verificar_entrega");
    expect(v).toContain("p_entrega > p_a.fim_aluguer");
    expect(v).toContain("p_a.fim_aluguer < public.ativos_hoje()");
    expect(v).toContain("coalesce(o.devolucao, 'infinity'::date) > p_entrega");
    // regra explícita: a desativação pode passar o fim (a renda pára no mais cedo)
    expect(bruto).toContain("desativado_em PODE ser depois de fim_aluguer");
  });

  it("[M7] fardamento não vira ativo: recusado ao validar, ao entregar e fora da lista de livres", () => {
    expect(corpo("ativos_validar")).toMatch(/IF v\.grupo = 'pessoa' AND v\.tipo = 'fardamento' THEN RAISE EXCEPTION 'ATV23'/);
    expect(corpo("ativos_verificar_entrega")).toMatch(/IF p_a\.tipo = 'fardamento' THEN RAISE EXCEPTION 'ATV23'/);
    expect(corpo("rpc_hr_equipamentos_livres")).toContain("a.tipo <> 'fardamento'");
    // a farda continua só no RH, como hoje
    expect(corpo("rpc_hr_equipamento_atribuir")).toContain("IF p_tipo = 'fardamento' THEN INSERT INTO public.pessoas_equipamentos");
  });

  it("[M8] a data de compra vem do parâmetro (ou da entrega na carga), nunca de uma coluna do RH", () => {
    expect(parametros("ativos_de_linha_rh")).toContain("p_data_compra date");
    expect(corpo("ativos_de_linha_rh")).toContain("coalesce(p_data_compra, p_entrega)");
    // e/pe/x/o/q são sempre pessoas_equipamentos nesta migration (r em ativos_json e y nos livres são o ativo)
    expect(sql).not.toMatch(/\b(e|pe|x|o|q)\.data_compra\b/);
    expect(sql).toContain("r.conta_modo, r.conta_meses, r.conta_inicio, r.conta_fim, r.entrega, NULL");
  });

  it("[LOW] hoje em Lisboa, nome cortado com btrim, sem seguros, sem gatilhos, sem sugestão de vida", () => {
    expect(corpo("ativos_hoje")).toContain("(now() AT TIME ZONE 'Europe/Lisbon')::date");
    expect(sql).not.toMatch(/current_date/i);
    expect(corpo("ativos_de_linha_rh")).toContain("btrim(left(btrim(p_descricao), 120))");
    expect(sql).not.toMatch(/seguro|apolice|ap[oó]lice/i);
    expect(sql).not.toMatch(/proxima_manutencao date|ADD COLUMN proxima_manutencao/);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.(ativos_vida_sugerida|rpc_hr_equipamento_corrigir_datas|hr_pessoas_apagar_sem_equipamento)\(/);
    expect(sql).not.toMatch(/CREATE TRIGGER/);
    // lpad não corta números grandes do código
    expect(corpo("ativos_proximo_codigo")).toContain("CASE WHEN v_n < 10000 THEN lpad(v_n::text, 4, '0') ELSE v_n::text END");
  });

  it("direitos: internas para ninguém; rpc só para authenticated; contador e tabelas sem direitos diretos", () => {
    for (const fn of RPCS) {
      const c = corpo(fn);
      expect(c, fn).not.toBe("");
      expect(c, fn).toContain("SECURITY DEFINER SET search_path = ''");
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, service_role;`));
      expect(sql, fn).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated;`));
    }
    for (const fn of INTERNAS) {
      const c = corpo(fn);
      expect(c, fn).not.toBe("");
      expect(c, fn).not.toContain("SECURITY DEFINER");
      expect(sql, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role;`));
      expect(sql, fn).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(`));
    }
    expect(sql).not.toMatch(/TO anon\b/);
    expect(sql).not.toMatch(/GRANT [^;]* ON (TABLE )?public\.(ativo|ativo_eventos|ativo_codigo_contador|pessoas_equipamentos|warehouses)\b/);
    expect(sql).toContain("REVOKE ALL ON TABLE public.ativo_codigo_contador FROM PUBLIC, anon, authenticated, service_role;");
    expect(sql).toContain("ALTER TABLE public.ativo_codigo_contador FORCE ROW LEVEL SECURITY;");
    expect(sql).not.toMatch(/CREATE POLICY/);
    // a guarda final confere que anon/authenticated não têm direitos de tabela em ativo
    expect(sql).toContain("ARRAY['public.ativo', 'public.ativo_eventos', 'public.ativo_codigo_contador', 'public.pessoas_equipamentos']");
  });

  it("os códigos de erro novos ATV19..ATV33 e HRA91 existem, com P0001 e texto em pt-PT", () => {
    for (let n = 19; n <= 33; n++) {
      const codigo = `ATV${n}`;
      expect(sql, codigo).toMatch(new RegExp(`RAISE EXCEPTION '${codigo}' USING ERRCODE = 'P0001', DETAIL = '[^']+'`));
    }
    expect(sql).toContain("RAISE EXCEPTION 'equipamento_e_ativo' USING ERRCODE = 'HRA91';");
    // HRA91 antes de escrever em alterar_conta
    const ac = corpo("rpc_hr_equipamento_alterar_conta");
    expect(ac.indexOf("HRA91")).toBeGreaterThan(0);
    expect(ac.indexOf("UPDATE public.pessoas_equipamentos")).toBeGreaterThan(ac.indexOf("HRA91"));
  });

  it("os RAISE com % têm tantos argumentos como marcas", () => {
    const raises = [...sql.matchAll(/RAISE (?:EXCEPTION|NOTICE|WARNING) '((?:[^']|'')*)'([^;]*);/g)];
    expect(raises.length).toBeGreaterThan(80);
    for (const m of raises) {
      const marcas = (m[1].replace(/%%/g, "").match(/%/g) ?? []).length;
      let nivel = 0;
      const partes = [""];
      for (const ch of m[2].split("USING")[0]) {
        if (ch === "(") nivel++;
        if (ch === ")") nivel--;
        if (ch === "," && nivel === 0) partes.push("");
        else partes[partes.length - 1] += ch;
      }
      const params = partes.filter((x) => x.trim()).length;
      expect({ msg: m[1], marcas }).toEqual({ msg: m[1], marcas: params });
    }
  });

  it("guardas antes e conferência depois; catálogo lido com ::text", () => {
    for (const g of ["G1", "G2", "G3", "G4", "G5", "G6"]) expect(sql).toContain(`RAISE EXCEPTION '${g}:`);
    for (const c of ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10"]) expect(sql).toContain(`RAISE EXCEPTION '${c}:`);
    expect(sql).toContain("md5(pg_get_constraintdef(c.oid)::text)");
    expect(sql).toContain("pg_get_function_identity_arguments(p.oid)::text = v_f.args");
    expect(sql).toContain("md5(p.prosrc::text) = v_f.h");
    expect(sql).toContain("c.contype::text = 'c'");
    expect(sql).not.toMatch(/\|\| *c\.contype|\|\| *contype/);
    expect(sql).not.toMatch(/CREATE (UNIQUE )?(TABLE|INDEX) IF NOT EXISTS|ADD COLUMN IF NOT EXISTS/);
    expect(sql).not.toMatch(/to_jsonb\((a|r|v|v_a|v_atual|s\.r)\)/);
    expect(sql).not.toMatch(/ALTER TABLE public\.ops_centro_custo/);
  });

  it("armazém: mesma empresa pela FK composta, um só ativo vivo, nome só com inventory.view", () => {
    expect(sql).toContain("ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_id_org_key UNIQUE (id, organization_id);");
    expect(sql).toContain(
      "FOREIGN KEY (warehouse_id, organization_id) REFERENCES public.warehouses (id, organization_id) ON DELETE RESTRICT",
    );
    expect(sql).toContain(
      "CREATE UNIQUE INDEX ativo_warehouse_ativo_key ON public.ativo (warehouse_id) WHERE warehouse_id IS NOT NULL AND estado = 'ativo';",
    );
    for (const fn of ["rpc_ativos_listar", "rpc_ativo_ler", "rpc_ativos_opcoes"]) {
      expect(corpo(fn), fn).toContain("'inventory.view'");
    }
    expect(corpo("ativos_validar")).toContain("'inventory.view'");
    expect(corpo("ativos_json")).not.toContain("'warehouse_id'");
  });

  it("armazém: sem inventory.view não se desliga (o null escondido mantém a ligação de hoje)", () => {
    const c = corpo("ativos_validar");
    // A permissão confere-se FORA do IF do armazém preenchido: vale também para desligar.
    const perm = c.indexOf("IF v_wh IS DISTINCT FROM v_atual.warehouse_id AND NOT coalesce(public.has_anew_permission_in_org(auth.uid(), 'inventory.view', p_org), false) THEN");
    const preenchido = c.indexOf("IF v_wh IS NOT NULL THEN");
    expect(perm).toBeGreaterThan(-1);
    expect(preenchido).toBeGreaterThan(perm);
    expect(c.slice(perm, preenchido)).toContain("IF v_wh IS NULL THEN v_wh := v_atual.warehouse_id; ELSE RAISE EXCEPTION 'ATV22'");
    expect(c).toContain("v.warehouse_id := v_wh;");
    expect(c).not.toContain("v.warehouse_id := p_warehouse_id;");
    expect(c).not.toContain("IF p_warehouse_id IS NOT NULL THEN");
  });

  it("cabeçalho: códigos que o RH recebe ao atribuir e as recusas novas no RH", () => {
    for (const cod of ["ATV05", "ATV07", "ATV24", "ATV32"]) {
      expect(bruto.slice(0, bruto.indexOf("ORDEM DE APLICAÇÃO")), cod).toContain(cod);
    }
    expect(bruto).toContain("MUDANÇAS DE COMPORTAMENTO no RH");
    expect(bruto).toContain("olyvia_conhecimento_orcamento_custos");
  });
});
