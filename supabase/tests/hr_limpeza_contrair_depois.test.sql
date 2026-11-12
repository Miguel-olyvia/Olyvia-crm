-- ============================================================
-- Testes: 20270115100000_hr_limpeza_contrair.sql (base RH) -- DEPOIS do push
-- ============================================================
-- Corre DEPOIS do db push, NA NIKE, tudo dentro de BEGIN ... ROLLBACK. SQL simples (sem pgTAP).
-- Prova que, com as colunas largadas, continuam a funcionar: definir subsidio e duodecimos (RPC de 5 argumentos), mudar o
-- cargo, mudar o salario do cargo, alterar o motivo de uma versao (gatilho hr_retribuicoes_escrita_so_por_rpc, que continua a
-- recusar uma mudanca de valor por acesso directo), alterar um contrato (gatilho hr_vinculos_registar_alteracao), guardar os
-- limites de horas extra (4 argumentos) e emitir as variaveis de documento.
-- Cada recusa e apanhada num bloco DO com EXCEPTION e so passa se o SQLSTATE e a mensagem forem os esperados.
--
-- O bloco entre os marcadores SMOKE INICIO e SMOKE FIM e o mesmo que o ensaio da migration corre ANTES do ROLLBACK (o ensaio
-- e gerado por C:/Users/carva/.claude/jobs/bbc4f3a6/tmp/limp2/gerar_ensaio.py, fora da pasta das migrations). Nao mexer
-- nos marcadores.
--
-- Ordem (regra do CLAUDE.md, base partilhada):
--   1. ANTES do push: hr_limpeza_contrair_antes.test.sql (so leitura) e o ensaio (migration + este bloco, com ROLLBACK).
--   2. db push.
--   3. Depois do push: este ficheiro tem de dar OK.
--
-- Correr (a partir do worktree ligado a RH; confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/hr_limpeza_contrair_depois.test.sql
--
-- Fixtures (tudo desfeito no ROLLBACK, so na nike b6ffce4f-f630-4933-833a-008649757a33), pelo padrao de
-- hr_pessoa_datas_derivadas.test.sql e hr_cargo_com_admissao_futura.test.sql:
--   - dois cargos NOVOS da nike (criados como postgres: o primeiro periodo de salario abre hoje);
--   - uma pessoa nova com o cargo A e admissao hoje;
--   - uma membership activa da nike emprestada (troca-se-lhe o role_id para um papel de teste; nao se criam memberships
--     por causa do limite de lugares da subscricao);
--   - um contrato EXISTENTE da nike, actualizado com o mesmo valor (nada muda; desfeito no ROLLBACK).
--   Chamadas a base: as RPC correm uma vez cada; ha UMA recusa provada (o gatilho de escrita), dentro do ROLLBACK.
-- ============================================================

BEGIN;

-- >>> SMOKE INICIO
-- --- Ajudas (temporarias, desaparecem com o ROLLBACK) ------------------------
CREATE FUNCTION pg_temp.t_lc_igual(p_obtido text, p_esperado text, p_caso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_obtido IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'FALHOU: % -- esperado %, obtido %', p_caso, coalesce(p_esperado, 'NULL'), coalesce(p_obtido, 'NULL');
  END IF;
END
$f$;

-- --- Fixtures (como postgres), so na nike ------------------------------------
DO $fx$
DECLARE
  v_org uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_m1  uuid;
  v_a1  uuid;
  v_vin uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = v_org) THEN
    RAISE EXCEPTION 'FALHOU: organizacao nike nao encontrada';
  END IF;

  SELECT am.id, u.auth_user_id INTO v_m1, v_a1
    FROM public.anew_memberships am
    JOIN public.anew_users u ON u.id = am.user_id
   WHERE am.organization_id = v_org
     AND am.status = 'active'
     AND am.role_is_client IS NOT TRUE
     AND u.auth_user_id IS NOT NULL
     AND u.deleted_at IS NULL
     AND NOT public.is_system_admin_user(u.auth_user_id)
     AND (SELECT count(*) FROM public.anew_memberships x
           WHERE x.user_id = am.user_id AND x.organization_id = v_org AND x.status = 'active') = 1
   ORDER BY am.id
   LIMIT 1;
  IF v_m1 IS NULL THEN
    RAISE EXCEPTION 'FALHOU: fixture -- a nike nao tem uma membership activa elegivel para emprestar';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system) VALUES
    ('d8a70000-0000-4000-8000-000000002501', 'teste_limpeza_contrair', 'Teste limpeza contrair', v_org, false);
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d8a70000-0000-4000-8000-000000002501', 'hr.pessoas.view'),
    ('d8a70000-0000-4000-8000-000000002501', 'hr.pessoas.laborais.edit'),
    ('d8a70000-0000-4000-8000-000000002501', 'hr.pessoas.retribuicao.view'),
    ('d8a70000-0000-4000-8000-000000002501', 'hr.pessoas.retribuicao.edit'),
    ('d8a70000-0000-4000-8000-000000002501', 'hr.pessoas.retribuicao.corrigir'),
    ('d8a70000-0000-4000-8000-000000002501', 'hr.cargos.salario.alterar'),
    ('d8a70000-0000-4000-8000-000000002501', 'hr.assiduidade.gerir');
  UPDATE public.anew_memberships SET role_id = 'd8a70000-0000-4000-8000-000000002501' WHERE id = v_m1;
  PERFORM set_config('request.jwt.claims', '{}', true);

  PERFORM set_config('teste.lc_claims', json_build_object('sub', v_a1, 'role', 'authenticated')::text, true);
  IF NOT public.has_anew_permission_in_org(v_a1, 'hr.pessoas.retribuicao.edit', v_org)
     OR NOT public.has_anew_permission_in_org(v_a1, 'hr.cargos.salario.alterar', v_org) THEN
    RAISE EXCEPTION 'FALHOU: fixture -- as permissoes de teste nao ficaram no utilizador emprestado';
  END IF;

  -- Dois cargos novos (como postgres, sem sessao: o primeiro periodo abre hoje).
  INSERT INTO public.hr_cargos (id, organization_id, nome, salario_base, periodicidade) VALUES
    ('d8a70000-0000-4000-8000-000000002511', v_org, 'Teste contrair A 2511', 1000.00, 'mensal'),
    ('d8a70000-0000-4000-8000-000000002512', v_org, 'Teste contrair B 2512', 1100.00, 'mensal');
  IF (SELECT s.salario_base FROM public.hr_cargo_salario_em('d8a70000-0000-4000-8000-000000002511', current_date) s) IS DISTINCT FROM 1000.00
     OR (SELECT s.salario_base FROM public.hr_cargo_salario_em('d8a70000-0000-4000-8000-000000002512', current_date) s) IS DISTINCT FROM 1100.00 THEN
    RAISE EXCEPTION 'FALHOU: fixture -- os cargos de teste nao tem salario em vigor hoje';
  END IF;

  -- Uma pessoa nova com o cargo A, admitida hoje.
  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, data_admissao, cargo_id) VALUES
    ('d8a70000-0000-4000-8000-000000002521', v_org, 'TesteContrair', 'Retribuicao', current_date,
     'd8a70000-0000-4000-8000-000000002511');

  -- Um contrato existente da nike (so para o UPDATE com o mesmo valor).
  SELECT v.id INTO v_vin FROM public.pessoas_vinculos v
   WHERE v.organization_id = v_org AND v.deleted_at IS NULL
   ORDER BY v.id LIMIT 1;
  IF v_vin IS NULL THEN
    RAISE EXCEPTION 'FALHOU: fixture -- a nike nao tem nenhum contrato';
  END IF;
  PERFORM set_config('teste.lc_vinculo', v_vin::text, true);
END $fx$;

-- --- Chamadas as RPC, como authenticated -------------------------------------
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.lc_claims'), true); END $t$;
SET LOCAL ROLE authenticated;

-- Este bloco corre como authenticated: sem pg_temp, verificacoes em linha.
DO $t$
DECLARE
  v_res jsonb;
BEGIN
  -- 1. Definir subsidio (modo) e duodecimos: RPC de 5 argumentos.
  v_res := public.rpc_hr_retribuicao_definir_pessoal('d8a70000-0000-4000-8000-000000002521', current_date,
                                                    'cartao', 50::smallint, 'Teste contrair');
  IF coalesce((v_res ->> 'versoes_criadas')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'FALHOU: 1 definir_pessoal devia criar pelo menos uma versao: %', v_res;
  END IF;

  -- 2. Mudar o cargo (A -> B) no dia em que o cargo comecou (modo substituir).
  PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002521',
                                           'd8a70000-0000-4000-8000-000000002512', current_date, 'Teste contrair');

  -- 3. Mudar o salario do cargo B a partir de amanha.
  PERFORM public.rpc_hr_cargo_definir_salario('d8a70000-0000-4000-8000-000000002512', 1200.00, 'mensal',
                                              current_date + 1, 'Teste contrair salario');

  -- 4. Guardar os limites de horas extra (assinatura de 4 argumentos).
  v_res := public.rpc_hr_horas_extra_config_guardar('b6ffce4f-f630-4933-833a-008649757a33', 120, 80, 15);
  IF v_res ->> 'dia_min' IS DISTINCT FROM '120' THEN
    RAISE EXCEPTION 'FALHOU: 4 rpc_hr_horas_extra_config_guardar devolveu %', v_res;
  END IF;
END $t$;

RESET ROLE;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

-- --- Verificacoes (como postgres) --------------------------------------------
DO $t$
BEGIN
  -- As versoes da pessoa: hoje com o salario de B, amanha com o salario novo; modo e duodecimos levados.
  PERFORM pg_temp.t_lc_igual((SELECT r.valor_base::text || '|' || r.subsidio_alimentacao_modo || '|' || r.duodecimos_pct::text
                                FROM public.pessoas_retribuicoes r
                               WHERE r.pessoa_id = 'd8a70000-0000-4000-8000-000000002521' AND r.deleted_at IS NULL
                                 AND r.valido_de <= current_date AND (r.valido_ate IS NULL OR r.valido_ate > current_date)),
                             '1100.00|cartao|50', '5.1 versao de hoje: salario do cargo B, cartao, 50');
  PERFORM pg_temp.t_lc_igual((SELECT r.valor_base::text || '|' || r.subsidio_alimentacao_modo || '|' || r.duodecimos_pct::text
                                FROM public.pessoas_retribuicoes r
                               WHERE r.pessoa_id = 'd8a70000-0000-4000-8000-000000002521' AND r.deleted_at IS NULL
                                 AND r.valido_de = current_date + 1),
                             '1200.00|cartao|50', '5.2 versao de amanha: salario novo do cargo, cartao, 50');

  -- As colunas e as RPC antigas ja nao existem.
  PERFORM pg_temp.t_lc_igual((SELECT count(*)::text FROM pg_attribute a
                               WHERE NOT a.attisdropped
                                 AND ((a.attrelid = 'public.pessoas_retribuicoes'::regclass AND a.attname::text = 'subsidio_alimentacao')
                                   OR (a.attrelid = 'public.pessoas_vinculos'::regclass AND a.attname::text = 'horas_anuais_maximas'))),
                             '0', '6.1 colunas largadas');
  PERFORM pg_temp.t_lc_igual((to_regclass('public.hr_regras_subsidio_alimentacao') IS NULL)::text, 'true', '6.2 tabela antiga largada');
  PERFORM pg_temp.t_lc_igual((to_regprocedure('public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text)') IS NULL
                              AND to_regprocedure('public.rpc_hr_horas_extra_config_guardar(uuid, integer, integer, integer, integer)') IS NULL)::text,
                             'true', '6.3 RPC antigas largadas');
END $t$;

-- 7. Gatilho hr_retribuicoes_escrita_so_por_rpc, com a sessao do utilizador (auth.uid() preenchido) e como postgres:
--    corrigir o motivo de uma versao futura passa (o ROW comparado ja nao tem a coluna largada) e mudar o valor por acesso
--    directo continua recusado.
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.lc_claims'), true); END $t$;
DO $t$
BEGIN
  UPDATE public.pessoas_retribuicoes r
     SET motivo = r.motivo || ' (motivo corrigido)'
   WHERE r.pessoa_id = 'd8a70000-0000-4000-8000-000000002521' AND r.deleted_at IS NULL AND r.valido_de = current_date + 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU: 7.1 nao havia versao de amanha para corrigir o motivo';
  END IF;

  BEGIN
    UPDATE public.pessoas_retribuicoes r
       SET valor_base = r.valor_base + 1
     WHERE r.pessoa_id = 'd8a70000-0000-4000-8000-000000002521' AND r.deleted_at IS NULL AND r.valido_de = current_date + 1;
    RAISE EXCEPTION 'FALHOU: 7.2 mudar o valor de uma versao futura por acesso directo devia dar 42501';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM NOT LIKE 'insufficient_privilege: uma versao de retribuicao em vigor ou futura so se muda pelas funcoes do modulo%' THEN
      RAISE EXCEPTION 'FALHOU: 7.2 recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;
END $t$;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

-- 8. Gatilho hr_vinculos_registar_alteracao: UPDATE de um contrato com o mesmo valor corre e nao regista nada.
DO $t$
DECLARE
  v_antes bigint;
BEGIN
  SELECT count(*) INTO v_antes FROM public.pessoas_vinculos_alteracoes x
   WHERE x.vinculo_id = current_setting('teste.lc_vinculo')::uuid;
  UPDATE public.pessoas_vinculos v
     SET horas_semanais_maximas = v.horas_semanais_maximas
   WHERE v.id = current_setting('teste.lc_vinculo')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHOU: 8 o contrato da fixture desapareceu';
  END IF;
  PERFORM pg_temp.t_lc_igual((SELECT count(*) FROM public.pessoas_vinculos_alteracoes x
                               WHERE x.vinculo_id = current_setting('teste.lc_vinculo')::uuid)::text,
                             v_antes::text, '8 UPDATE com o mesmo valor nao regista alteracoes');
END $t$;

-- 9. Variaveis de documento: o token do subsidio vem da regra salarial (valor em euros ou a linha em branco).
DO $t$
DECLARE
  v_tok text;
BEGIN
  v_tok := public.hr_documento_variaveis('d8a70000-0000-4000-8000-000000002521',
                                         'b6ffce4f-f630-4933-833a-008649757a33', true) ->> 'retribuicao_subsidio_alimentacao';
  IF v_tok IS NULL OR NOT (right(v_tok, 1) = chr(8364) OR v_tok = '____________') THEN
    RAISE EXCEPTION 'FALHOU: 9 o token retribuicao_subsidio_alimentacao saiu %', coalesce(v_tok, 'NULL');
  END IF;
END $t$;

-- 10. O arquivo tem o instantaneo contrair (so contagens).
SELECT a.fase, a.tabela, count(*) AS linhas
  FROM public.hr_legado_arquivo a
 GROUP BY a.fase, a.tabela
 ORDER BY a.fase, a.tabela;

SELECT 'OK: hr_limpeza_contrair -- definir subsidio e duodecimos, mudar cargo, mudar salario do cargo, gatilhos de retribuicao e de contrato, horas extra e documento funcionam sem as colunas (tudo desfeito no ROLLBACK)' AS resultado;
-- <<< SMOKE FIM

ROLLBACK;
