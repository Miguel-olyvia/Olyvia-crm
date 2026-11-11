-- ============================================================
-- Testes: 20270114800000_hr_cargo_com_admissao_futura.sql (base RH)
-- ============================================================
-- Tudo dentro de BEGIN ... ROLLBACK, so na nike. SQL simples (sem pgTAP).
-- Cada recusa e apanhada num bloco DO com EXCEPTION e so passa se o SQLSTATE e a mensagem (SQLERRM) forem os esperados.
--
-- Ordem (regra do CLAUDE.md, base partilhada):
--   1. ANTES do db push, contra o remoto ainda por corrigir: tem de dar VERMELHO no caso 3
--      ('FALHOU: 3.1 ... HRC04 ... so pode comecar ate hoje'). Os casos 1 e 2 ja passam antes (sao recusas que ficam).
--   2. db push da migration.
--   3. Depois do push: tem de dar OK. Nao se volta atras para demonstrar o vermelho.
--
-- Correr (a partir do worktree ligado a RH; confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth):
--   supabase db query --linked -f supabase/tests/hr_cargo_com_admissao_futura.test.sql
--
-- Fixtures (tudo desfeito no ROLLBACK, so na nike b6ffce4f-f630-4933-833a-008649757a33), pelo padrao de
-- hr_pessoa_sem_cargo_na_admissao.test.sql:
--   - dois cargos ACTIVOS da nike (lidos, nao criados);
--   - uma membership activa da nike emprestada (troca-se-lhe o role_id para um papel de teste com hr.pessoas.view e
--     hr.pessoas.laborais.edit; nao se criam memberships por causa do limite de lugares da subscricao);
--   - claims '{}' sempre que se volta a postgres.
--
-- Cobre (A = ficha sem cargo com data_admissao = hoje + 30):
--   1. A, p_desde ANTES da admissao continua recusado: = hoje ("antes da data de admissao") e = admissao - 1, que e
--      futuro ("so pode comecar ate hoje")
--   2. A, p_desde DEPOIS da admissao (futuro) continua recusado ("so pode comecar ate hoje")
--   3. A, p_desde = admissao passa: abre a linha em pessoas_cargos nessa data, em aberto, e pessoas.cargo_id fica
--      preenchido; o resultado diz desde = admissao e cargo_anterior_id NULL
--   4. Ficha sem cargo com data_admissao NULL: p_desde = hoje passa (como ja); p_desde = amanha continua recusado
--   5. Ficha COM linha aberta (admissao futura, nasceu com cargo): comportamento inalterado -- p_desde = inicio da linha
--      corrige o cargo (modo substituir); p_desde = dia seguinte ao inicio continua recusado; o mesmo cargo da HRC07.
--      Ficha COM linha aberta e admissao passada: p_desde = admissao (= inicio da linha) continua recusado; p_desde =
--      hoje muda o cargo (modo normal) e fecha a linha anterior.
-- ============================================================

BEGIN;

-- ─── Ajudas (temporarias, desaparecem com o ROLLBACK) ────────────────────────
CREATE FUNCTION pg_temp.t_igual(p_obtido text, p_esperado text, p_caso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_obtido IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'FALHOU: % -- esperado %, obtido %', p_caso, coalesce(p_esperado, 'NULL'), coalesce(p_obtido, 'NULL');
  END IF;
END
$f$;

-- ─── Fixtures (como postgres), so na nike ────────────────────────────────────
DO $fx$
DECLARE
  v_org     uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_cargos  uuid[];
  v_m1      uuid;
  v_a1      uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = v_org) THEN
    RAISE EXCEPTION 'FALHOU: organizacao nike nao encontrada';
  END IF;

  SELECT array_agg(x.id ORDER BY x.id) INTO v_cargos
    FROM (SELECT c.id FROM public.hr_cargos c
           WHERE c.organization_id = v_org AND c.activo IS TRUE AND c.deleted_at IS NULL
           ORDER BY c.id LIMIT 2) x;
  IF coalesce(array_length(v_cargos, 1), 0) < 2 THEN
    RAISE EXCEPTION 'FALHOU: fixture -- a nike precisa de 2 cargos activos no catalogo; tem %', coalesce(array_length(v_cargos, 1), 0);
  END IF;
  PERFORM set_config('teste.cargo_a', v_cargos[1]::text, true);
  PERFORM set_config('teste.cargo_b', v_cargos[2]::text, true);

  -- Uma membership activa da nike para emprestar.
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
    ('d8a70000-0000-4000-8000-000000002401', 'teste_cargo_adm_futura', 'Teste cargo admissao futura', v_org, false);
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d8a70000-0000-4000-8000-000000002401', 'hr.pessoas.view'),
    ('d8a70000-0000-4000-8000-000000002401', 'hr.pessoas.laborais.edit');

  UPDATE public.anew_memberships SET role_id = 'd8a70000-0000-4000-8000-000000002401' WHERE id = v_m1;

  PERFORM set_config('request.jwt.claims', '{}', true);

  PERFORM set_config('teste.claims_laborais', json_build_object('sub', v_a1, 'role', 'authenticated')::text, true);

  IF NOT public.has_anew_permission_in_org(v_a1, 'hr.pessoas.laborais.edit', v_org)
     OR public.has_anew_permission_in_org(v_a1, 'hr.pessoas.retribuicao.edit', v_org) THEN
    RAISE EXCEPTION 'FALHOU: fixture -- as permissoes do utilizador emprestado nao ficaram so as de teste';
  END IF;

  -- As fichas (como postgres):
  --   ...2101 A: sem cargo, admissao futura (hoje + 30)
  --   ...2102 B: sem cargo, admissao NULL
  --   ...2103 C: com cargo B, admissao futura (hoje + 30) -> primeira linha aberta em hoje + 30
  --   ...2104 D: com cargo B, admissao passada (hoje - 5) -> primeira linha aberta em hoje - 5
  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, data_admissao, cargo_id) VALUES
    ('d8a70000-0000-4000-8000-000000002101', v_org, 'TesteAdmFutura', 'SemCargoFutura', current_date + 30, NULL),
    ('d8a70000-0000-4000-8000-000000002102', v_org, 'TesteAdmFutura', 'SemCargoNula',   NULL,               NULL),
    ('d8a70000-0000-4000-8000-000000002103', v_org, 'TesteAdmFutura', 'ComCargoFutura', current_date + 30, v_cargos[2]),
    ('d8a70000-0000-4000-8000-000000002104', v_org, 'TesteAdmFutura', 'ComCargoPassada', current_date - 5, v_cargos[2]);
END $fx$;

-- Premissas das fixtures (como postgres): A e B sem cargo e sem linhas; C e D com a primeira linha aberta.
DO $t$
BEGIN
  PERFORM pg_temp.t_igual((SELECT coalesce(pe.cargo_id::text, 'NULL') || '|' || coalesce(pe.data_admissao::text, 'NULL')
                             FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000002101'),
                          'NULL|' || (current_date + 30)::text, '0.1 A sem cargo e com admissao futura');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id IN ('d8a70000-0000-4000-8000-000000002101', 'd8a70000-0000-4000-8000-000000002102')),
                          '0', '0.2 A e B sem linhas em pessoas_cargos');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002103'
                              AND c.valido_de = current_date + 30 AND c.valido_ate IS NULL),
                          '1', '0.3 C com a primeira linha aberta na admissao futura');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002104'
                              AND c.valido_de = current_date - 5 AND c.valido_ate IS NULL),
                          '1', '0.4 D com a primeira linha aberta na admissao passada');
END $t$;

-- ─── Chamadas a RPC, como authenticated com laborais.edit ────────────────────
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.claims_laborais'), true); END $t$;
SET LOCAL ROLE authenticated;

-- Este bloco corre como authenticated: sem pg_temp, verificacoes em linha.
DO $t$
DECLARE
  v_res jsonb;
BEGIN
  -- 1.1 A, p_desde = hoje (antes da admissao futura) -> HRC04 "antes da data de admissao"
  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002101',
                                             current_setting('teste.cargo_a')::uuid, current_date, 'Teste');
    RAISE EXCEPTION 'FALHOU: 1.1 A, p_desde = hoje (antes da admissao futura) devia dar HRC04';
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    IF SQLERRM NOT LIKE 'data_invalida: o cargo nao pode comecar antes da data de admissao (%' THEN
      RAISE EXCEPTION 'FALHOU: 1.1 A, p_desde = hoje -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  -- 1.2 A, p_desde = admissao - 1 (futuro, antes da admissao) -> HRC04 "so pode comecar ate hoje"
  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002101',
                                             current_setting('teste.cargo_a')::uuid, current_date + 29, 'Teste');
    RAISE EXCEPTION 'FALHOU: 1.2 A, p_desde = admissao - 1 devia dar HRC04';
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    IF SQLERRM NOT LIKE 'data_invalida: o cargo so pode comecar ate hoje (%' THEN
      RAISE EXCEPTION 'FALHOU: 1.2 A, p_desde = admissao - 1 -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  -- 2.1 A, p_desde = admissao + 1 (futuro, depois da admissao) -> HRC04 "so pode comecar ate hoje"
  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002101',
                                             current_setting('teste.cargo_a')::uuid, current_date + 31, 'Teste');
    RAISE EXCEPTION 'FALHOU: 2.1 A, p_desde = admissao + 1 devia dar HRC04';
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    IF SQLERRM NOT LIKE 'data_invalida: o cargo so pode comecar ate hoje (%' THEN
      RAISE EXCEPTION 'FALHOU: 2.1 A, p_desde = admissao + 1 -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  -- 3.1 A, p_desde = admissao (futura) -> passa. Antes da migration: HRC04 (o vermelho esperado).
  BEGIN
    v_res := public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002101',
                                              current_setting('teste.cargo_a')::uuid, current_date + 30, 'Admitida');
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    RAISE EXCEPTION 'FALHOU: 3.1 A, p_desde = admissao futura foi recusado com HRC04 (a migration 20270114800000 ainda nao esta aplicada?): %', SQLERRM;
  END;
  PERFORM set_config('teste.res_a', v_res::text, true);

  -- 4.1 B (admissao NULL), p_desde = hoje -> passa (como ja passava)
  PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002102',
                                           current_setting('teste.cargo_a')::uuid, current_date, 'Admitida');

  -- 4.2 (admissao NULL, p_desde = amanha) fica mais abaixo, numa ficha propria criada como postgres.

  -- 5.1 C (linha aberta em hoje + 30), p_desde = inicio da linha, outro cargo -> modo substituir, passa (inalterado)
  PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002103',
                                           current_setting('teste.cargo_a')::uuid, current_date + 30, 'Correccao');

  -- 5.2 C, p_desde = inicio da linha + 1 -> HRC04 do ramo com linha aberta (inalterado)
  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002103',
                                             current_setting('teste.cargo_b')::uuid, current_date + 31, 'Teste');
    RAISE EXCEPTION 'FALHOU: 5.2 C, p_desde = inicio da linha + 1 devia dar HRC04';
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    IF SQLERRM NOT LIKE 'data_invalida: o cargo so pode mudar a partir do dia a seguir ao inicio do cargo actual (%' THEN
      RAISE EXCEPTION 'FALHOU: 5.2 C -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  -- 5.3 C, o mesmo cargo que ja tem -> HRC07 (inalterado)
  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002103',
                                             current_setting('teste.cargo_a')::uuid, current_date + 30, 'Teste');
    RAISE EXCEPTION 'FALHOU: 5.3 C, o mesmo cargo devia dar HRC07';
  EXCEPTION WHEN SQLSTATE 'HRC07' THEN
    IF SQLERRM NOT LIKE 'sem_alteracao: a pessoa ja tem este cargo.%' THEN
      RAISE EXCEPTION 'FALHOU: 5.3 C -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  -- 5.4 D (linha aberta em hoje - 5 = admissao), p_desde = admissao -> HRC04 do ramo com linha aberta (inalterado:
  --     a excepcao da admissao e so para fichas SEM linha aberta)
  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002104',
                                             current_setting('teste.cargo_a')::uuid, current_date - 5, 'Teste');
    RAISE EXCEPTION 'FALHOU: 5.4 D, p_desde = admissao com linha aberta devia dar HRC04';
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    IF SQLERRM NOT LIKE 'data_invalida: o cargo so pode mudar a partir do dia a seguir ao inicio do cargo actual (%' THEN
      RAISE EXCEPTION 'FALHOU: 5.4 D -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  -- 5.5 D, p_desde = hoje -> modo normal, passa (inalterado)
  PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002104',
                                           current_setting('teste.cargo_a')::uuid, current_date, 'Promocao');
END $t$;

RESET ROLE;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

-- ─── Verificacoes (como postgres) ────────────────────────────────────────────
DO $t$
BEGIN
  -- 3. A ganhou cargo a comecar na admissao futura
  PERFORM pg_temp.t_igual((SELECT pe.cargo_id::text FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000002101'),
                          current_setting('teste.cargo_a'), '3.2 A: pessoas.cargo_id preenchido');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002101'),
                          '1', '3.3 A: uma so linha em pessoas_cargos');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002101'
                              AND c.cargo_id = current_setting('teste.cargo_a')::uuid
                              AND c.valido_de = current_date + 30 AND c.valido_ate IS NULL),
                          '1', '3.4 A: linha aberta desde a data de admissao');
  PERFORM pg_temp.t_igual(current_setting('teste.res_a')::jsonb ->> 'desde', (current_date + 30)::text,
                          '3.5 A: o resultado diz desde = admissao');
  PERFORM pg_temp.t_igual(current_setting('teste.res_a')::jsonb ->> 'cargo_anterior_id', NULL,
                          '3.6 A: nao tinha cargo antes');

  -- 4.1 B ganhou cargo desde hoje
  PERFORM pg_temp.t_igual((SELECT pe.cargo_id::text FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000002102'),
                          current_setting('teste.cargo_a'), '4.1 B (admissao NULL): cargo atribuido com p_desde = hoje');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002102'
                              AND c.valido_de = current_date AND c.valido_ate IS NULL),
                          '1', '4.1 B: linha aberta desde hoje');

  -- 5.1 C: o cargo foi corrigido no proprio dia de inicio (uma so linha, mesma data, cargo A)
  PERFORM pg_temp.t_igual((SELECT count(*)::text || '|' || min(c.cargo_id::text) || '|' || min(c.valido_de)::text
                             FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002103'),
                          '1|' || current_setting('teste.cargo_a') || '|' || (current_date + 30)::text,
                          '5.1 C: modo substituir inalterado');
  PERFORM pg_temp.t_igual((SELECT pe.cargo_id::text FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000002103'),
                          current_setting('teste.cargo_a'), '5.1 C: pessoas.cargo_id sincronizado');

  -- 5.5 D: a linha antiga fechou hoje e a nova abriu hoje
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002104'
                              AND c.cargo_id = current_setting('teste.cargo_b')::uuid
                              AND c.valido_de = current_date - 5 AND c.valido_ate = current_date),
                          '1', '5.5 D: linha anterior fechada hoje');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002104'
                              AND c.cargo_id = current_setting('teste.cargo_a')::uuid
                              AND c.valido_de = current_date AND c.valido_ate IS NULL),
                          '1', '5.5 D: linha nova aberta hoje');
END $t$;

-- ─── 4.2 Ficha sem cargo com admissao NULL, p_desde = amanha -> continua HRC04 ──
INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, data_admissao) VALUES
  ('d8a70000-0000-4000-8000-000000002105', 'b6ffce4f-f630-4933-833a-008649757a33', 'TesteAdmFutura', 'SemCargoNula2', NULL);

DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.claims_laborais'), true); END $t$;
SET LOCAL ROLE authenticated;

DO $t$
BEGIN
  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002105',
                                             current_setting('teste.cargo_a')::uuid, current_date + 1, 'Teste');
    RAISE EXCEPTION 'FALHOU: 4.2 admissao NULL, p_desde = amanha devia dar HRC04';
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    IF SQLERRM NOT LIKE 'data_invalida: o cargo so pode comecar ate hoje (%' THEN
      RAISE EXCEPTION 'FALHOU: 4.2 admissao NULL, p_desde = amanha -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;
END $t$;

RESET ROLE;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

DO $t$
BEGIN
  -- As recusas nao deixaram nada: A ficou so com a linha do caso 3, e a ficha de 4.2 continua sem cargo e sem linhas.
  PERFORM pg_temp.t_igual((SELECT coalesce(pe.cargo_id::text, 'NULL') FROM public.pessoas pe
                            WHERE pe.id = 'd8a70000-0000-4000-8000-000000002105'),
                          'NULL', '4.2 admissao NULL, p_desde = amanha: continua sem cargo');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002105'),
                          '0', '4.2 admissao NULL, p_desde = amanha: nenhuma linha');
END $t$;

SELECT 'OK: hr_cargo_com_admissao_futura -- todos os casos passaram (tudo desfeito no ROLLBACK)' AS resultado;

ROLLBACK;
