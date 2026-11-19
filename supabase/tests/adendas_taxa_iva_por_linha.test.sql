-- ============================================================
-- Testes: 20270124030000_adendas_taxa_iva_por_linha.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration. Tudo dentro de BEGIN … ROLLBACK, como postgres (fn_neg_guardar_adendas e fn_neg_ler_adendas
-- são só de service_role): cria um negócio próprio («Teste 124030») na organização do primeiro negócio com número e grava-lhe uma
-- adenda em rascunho com três linhas. Só uma função temporária (pg_temp). Os erros juntam-se em teste.falhas e o resultado sai no SELECT final.
--
-- Correr:
--   supabase db query --linked -o csv -f supabase/tests/adendas_taxa_iva_por_linha.test.sql
--
-- Cobre:
--   A. gravar: a linha a 23% fica iva_percent 23, iva_explicita e total_com_iva × 1,23; a linha a 6% fica 6 e explícita; a linha sem
--      taxa fica 6% e não explícita (como antes)
--   B. ler: taxa_iva 23 e 6 nas duas primeiras; NULL na sem taxa (a «antiga»)
--   C. gravar outra vez a mesma versão (rascunho) com a taxa mudada: a linha muda de taxa
-- ============================================================

BEGIN;

SELECT set_config('teste.falhas', '', true), set_config('teste.ok', 'nao', true);

DO $fx$
DECLARE
  v_base negocios; v_auth uuid; v_act uuid; f text := '';
  n uuid := '12403000-0000-4000-8000-000000000001';
BEGIN
  BEGIN
    SELECT * INTO v_base FROM negocios WHERE numero IS NOT NULL AND deleted_at IS NULL ORDER BY numero LIMIT 1;
    IF v_base.id IS NULL THEN RAISE EXCEPTION 'base sem negócio com número'; END IF;
    SELECT u.auth_user_id, u.id INTO v_auth, v_act FROM anew_users u
    WHERE u.auth_user_id IS NOT NULL AND public.has_anew_permission_in_org(u.auth_user_id, 'pessoas.edit', v_base.organization_id)
    ORDER BY u.created_at NULLS LAST, u.id LIMIT 1;
    IF v_auth IS NULL THEN RAISE EXCEPTION 'sem utilizador com pessoas.edit na organização %', v_base.organization_id; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    INSERT INTO negocios (id, organization_id, root_organization_id, entity_id, titulo, fluxo_emylia)
    VALUES (n, v_base.organization_id, v_base.root_organization_id, v_base.entity_id, 'Teste 124030 adenda', true);
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('teste.org', v_base.organization_id::text, true);
    PERFORM set_config('teste.act', v_act::text, true);
    PERFORM set_config('teste.ok', 'sim', true);
  EXCEPTION WHEN OTHERS THEN
    f := f || format('FIXTURE falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $fx$;

-- a adenda: linha 0 a 23% (os produtos do acerto), linha 1 a 6%, linha 2 sem taxa
CREATE FUNCTION pg_temp.teste_adenda(p_t0 numeric) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('numero', 1, 'referencia', 'AD TESTE/124030-1', 'estado', 'rascunho', 'motivo', 'Teste 124030',
    'total', 250, 'total_com_iva', 100 * (1 + p_t0 / 100) + 50 * 1.06 + 100 * 1.06,
    'versoes', jsonb_build_array(jsonb_build_object('versao', 1, 'estado', 'rascunho', 'desconto', 0, 'verificado', false,
      'linhas', jsonb_build_array(
        jsonb_build_object('ordem', 0, 'servico', NULL, 'chave', 'acerto-p', 'livre', true, 'descricao', 'Materiais e outros valores',
                           'unidade', 'vg', 'quantidade', 1, 'preco_un', 100, 'horas_un', 0, 'perfil', '', 'taxa_iva', p_t0),
        jsonb_build_object('ordem', 1, 'servico', NULL, 'chave', 'mo', 'livre', true, 'descricao', 'Mão de obra',
                           'unidade', 'vg', 'quantidade', 1, 'preco_un', 50, 'horas_un', 0, 'perfil', '', 'taxa_iva', 6),
        jsonb_build_object('ordem', 2, 'servico', NULL, 'chave', 'antiga', 'livre', true, 'descricao', 'Linha sem taxa',
                           'unidade', 'vg', 'quantidade', 1, 'preco_un', 100, 'horas_un', 0, 'perfil', ''))))))
$$;

DO $t$
DECLARE
  f text := ''; v_org uuid; n uuid := '12403000-0000-4000-8000-000000000001'; r record; ls jsonb;
BEGIN
  IF current_setting('teste.ok') <> 'sim' THEN RETURN; END IF;
  v_org := current_setting('teste.org')::uuid;
  BEGIN
    PERFORM public.fn_neg_guardar_adendas(v_org, n, pg_temp.teste_adenda(23), current_setting('teste.act')::uuid);
    -- A
    FOR r IN SELECT ql.ordem, ql.iva_percent, ql.iva_explicita, ql.total_com_iva
             FROM quote_lines ql JOIN quotes q ON q.id = ql.quote_id JOIN adendas a ON a.id = q.adenda_id
             WHERE a.negocio_id = n ORDER BY ql.ordem LOOP
      IF r.ordem = 0 AND (r.iva_percent <> 23 OR NOT r.iva_explicita OR r.total_com_iva <> 123) THEN
        f := f || format('A1 linha a 23%%: iva %s, explícita %s, total %s; ', r.iva_percent, r.iva_explicita, r.total_com_iva);
      ELSIF r.ordem = 1 AND (r.iva_percent <> 6 OR NOT r.iva_explicita) THEN
        f := f || format('A2 linha a 6%%: iva %s, explícita %s; ', r.iva_percent, r.iva_explicita);
      ELSIF r.ordem = 2 AND (r.iva_percent <> 6 OR r.iva_explicita) THEN
        f := f || format('A3 linha sem taxa: iva %s, explícita %s; ', r.iva_percent, r.iva_explicita);
      END IF;
    END LOOP;
    -- B
    ls := public.fn_neg_ler_adendas(n) -> 0 -> 'versoes' -> 0 -> 'linhas';
    IF jsonb_array_length(coalesce(ls, '[]'::jsonb)) <> 3 THEN f := f || format('B0 a leitura trouxe %s linhas; ', jsonb_array_length(ls)); END IF;
    IF (ls -> 0 ->> 'taxa_iva')::numeric IS DISTINCT FROM 23 THEN f := f || 'B1 taxa_iva da linha 0 = ' || coalesce(ls -> 0 ->> 'taxa_iva', 'NULL') || '; '; END IF;
    IF (ls -> 1 ->> 'taxa_iva')::numeric IS DISTINCT FROM 6 THEN f := f || 'B2 taxa_iva da linha 1 = ' || coalesce(ls -> 1 ->> 'taxa_iva', 'NULL') || '; '; END IF;
    IF NOT (ls -> 2 ? 'taxa_iva') OR jsonb_typeof(ls -> 2 -> 'taxa_iva') <> 'null' THEN
      f := f || 'B3 a linha sem taxa devia vir com taxa_iva null: ' || coalesce((ls -> 2 -> 'taxa_iva')::text, 'ausente') || '; ';
    END IF;
    -- C
    PERFORM public.fn_neg_guardar_adendas(v_org, n, pg_temp.teste_adenda(6), current_setting('teste.act')::uuid);
    ls := public.fn_neg_ler_adendas(n) -> 0 -> 'versoes' -> 0 -> 'linhas';
    IF (ls -> 0 ->> 'taxa_iva')::numeric IS DISTINCT FROM 6 THEN f := f || 'C1 a taxa da linha 0 não mudou para 6: ' || coalesce(ls -> 0 ->> 'taxa_iva', 'NULL') || '; '; END IF;
  EXCEPTION WHEN OTHERS THEN f := f || format('bloco falhou: %s %s; ', SQLSTATE, SQLERRM);
  END;
  PERFORM set_config('teste.falhas', current_setting('teste.falhas') || f, true);
END $t$;

SELECT CASE WHEN current_setting('teste.falhas') = '' AND current_setting('teste.ok') = 'sim'
            THEN 'OK: a taxa de IVA das linhas das adendas — A (3), B (4) e C (1)'
            ELSE 'FALHOU: ' || current_setting('teste.falhas')
       END AS resultado;

ROLLBACK;
