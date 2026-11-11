-- ============================================================
-- Testes: 20270114700000_hr_pessoa_sem_cargo_na_admissao.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration, NA NIKE, e tudo dentro de BEGIN ... ROLLBACK. SQL simples (sem pgTAP).
-- Antes da migration o caso 1 fica vermelho (HRC08 -> 'FALHOU: 1 ...').
-- Cada recusa e apanhada num bloco DO com EXCEPTION e so passa se o SQLSTATE e a mensagem (SQLERRM) forem os esperados.
--
-- Correr (qualquer falha rebenta com 'FALHOU: ...'; o resultado util e o ultimo SELECT):
--   supabase db query --linked -f supabase/tests/hr_pessoa_sem_cargo_na_admissao.test.sql   (a partir do worktree ligado a RH)
--
-- Fixtures (tudo desfeito no ROLLBACK, so na nike b6ffce4f-f630-4933-833a-008649757a33):
--   - quatro cargos ACTIVOS da nike (lidos, nao criados -- criar cargos passa por guardas de salario e de seguro):
--     A e B ficam como estao; C e desactivado e D e apagado so dentro da transaccao (UPDATE activo/deleted_at);
--   - uma membership activa da nike emprestada (troca-se-lhe o role_id para um papel de teste com hr.pessoas.view e
--     hr.pessoas.laborais.edit; nao se criam memberships por causa do limite de lugares da subscricao);
--   - claims '{}' sempre que se volta a postgres (trg_protect_system_role_perms le-as como jsonb).
--   - cargo de OUTRA organizacao: a base RH so tem a nike, e as escritas fora da nike estao proibidas, por isso nao se
--     fabrica outra organizacao. Se existir um cargo de outra organizacao usa-se (so leitura); senao o caso 2b fica
--     'NAO VERIFICADO' no resultado final. O caso 2a (cargo inexistente) passa pelo mesmo ramo da guarda (HRC02).
--
-- Cobre:
--   1. INSERT sem cargo passa e NAO abre linha em pessoas_cargos; a ficha sem cargo continua editavel
--   2. INSERT com cargo inexistente (2a) ou de outra organizacao (2b) -> HRC02
--   3. INSERT com cargo desactivado -> HRC09; com cargo apagado -> HRC02
--   4. UPDATE directo de NULL para um cargo, sem a GUC -> HRC10
--   5. Dar o cargo pelo caminho certo (rpc_hr_pessoa_mudar_cargo, como authenticated com laborais.edit): passa, abre a
--      linha em pessoas_cargos e pessoas.cargo_id fica sincronizado
--   6. Voltar um cargo preenchido a NULL -> HRC08; mudar o cargo sem a GUC -> HRC10; INSERT com cargo continua a abrir
--      a primeira linha
--   7. A rpc_hr_pessoa_mudar_cargo numa ficha sem cargo:
--      7a data_admissao NULL -> atribuir cargo com p_desde = hoje passa;
--      7b data_admissao futura -> HRC04 com p_desde = hoje ("antes da data de admissao"); com p_desde = admissao
--         passa desde 20270114800000 (antes dava HRC04 "so pode comecar ate hoje") e abre a linha nessa data.
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

-- Uma recusa so vale se a mensagem for a esperada (p_padrao e um padrao LIKE).
CREATE FUNCTION pg_temp.t_erro(p_mensagem text, p_padrao text, p_caso text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  IF p_mensagem IS NULL OR p_mensagem NOT LIKE p_padrao THEN
    RAISE EXCEPTION 'FALHOU: % -- recusado, mas com outra mensagem: %', p_caso, coalesce(p_mensagem, 'NULL');
  END IF;
END
$f$;

-- ─── Fixtures (como postgres), so na nike ────────────────────────────────────
DO $fx$
DECLARE
  v_org     uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_cargos  uuid[];
  v_outro   uuid;
  v_m1      uuid;
  v_a1      uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = v_org) THEN
    RAISE EXCEPTION 'FALHOU: organizacao nike nao encontrada';
  END IF;

  SELECT array_agg(x.id ORDER BY x.id) INTO v_cargos
    FROM (SELECT c.id FROM public.hr_cargos c
           WHERE c.organization_id = v_org AND c.activo IS TRUE AND c.deleted_at IS NULL
           ORDER BY c.id LIMIT 4) x;
  IF coalesce(array_length(v_cargos, 1), 0) < 4 THEN
    RAISE EXCEPTION 'FALHOU: fixture -- a nike precisa de 4 cargos activos no catalogo; tem %', coalesce(array_length(v_cargos, 1), 0);
  END IF;
  PERFORM set_config('teste.cargo_a', v_cargos[1]::text, true);
  PERFORM set_config('teste.cargo_b', v_cargos[2]::text, true);
  PERFORM set_config('teste.cargo_c', v_cargos[3]::text, true);
  PERFORM set_config('teste.cargo_d', v_cargos[4]::text, true);

  -- C desactivado e D apagado, so dentro desta transaccao.
  UPDATE public.hr_cargos SET activo = false     WHERE id = v_cargos[3] AND organization_id = v_org;
  UPDATE public.hr_cargos SET deleted_at = now() WHERE id = v_cargos[4] AND organization_id = v_org;

  -- Cargo de outra organizacao: so leitura, se existir.
  SELECT c.id INTO v_outro
    FROM public.hr_cargos c
   WHERE c.organization_id <> v_org AND c.activo IS TRUE AND c.deleted_at IS NULL
   ORDER BY c.id LIMIT 1;
  PERFORM set_config('teste.cargo_outra_org', coalesce(v_outro::text, ''), true);

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
    ('d8a70000-0000-4000-8000-000000002301', 'teste_sem_cargo_laborais', 'Teste sem cargo laborais', v_org, false);
  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d8a70000-0000-4000-8000-000000002301', 'hr.pessoas.view'),
    ('d8a70000-0000-4000-8000-000000002301', 'hr.pessoas.laborais.edit');

  UPDATE public.anew_memberships SET role_id = 'd8a70000-0000-4000-8000-000000002301' WHERE id = v_m1;

  PERFORM set_config('request.jwt.claims', '{}', true);

  PERFORM set_config('teste.claims_laborais', json_build_object('sub', v_a1, 'role', 'authenticated')::text, true);

  IF NOT public.has_anew_permission_in_org(v_a1, 'hr.pessoas.laborais.edit', v_org)
     OR public.has_anew_permission_in_org(v_a1, 'hr.pessoas.retribuicao.edit', v_org) THEN
    RAISE EXCEPTION 'FALHOU: fixture -- as permissoes do utilizador emprestado nao ficaram so as de teste';
  END IF;
END $fx$;

-- ─── 1. INSERT sem cargo passa e nao abre linha ──────────────────────────────
DO $t$
BEGIN
  BEGIN
    INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido)
    VALUES ('d8a70000-0000-4000-8000-000000002001', 'b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'Admissao');
  EXCEPTION WHEN SQLSTATE 'HRC08' THEN
    RAISE EXCEPTION 'FALHOU: 1.1 INSERT sem cargo foi recusado com HRC08 (a migration 20270114700000 ainda nao esta aplicada?): %', SQLERRM;
  END;

  PERFORM pg_temp.t_igual((SELECT coalesce(pe.cargo_id::text, 'NULL') FROM public.pessoas pe
                            WHERE pe.id = 'd8a70000-0000-4000-8000-000000002001'),
                          'NULL', '1.1 a ficha nasce sem cargo');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002001'),
                          '0', '1.2 sem cargo nao abre linha em pessoas_cargos');

  -- 1.3 a ficha sem cargo continua editavel, e reenviar cargo_id NULL passa
  UPDATE public.pessoas SET notas = 'teste sem cargo' WHERE id = 'd8a70000-0000-4000-8000-000000002001';
  UPDATE public.pessoas SET cargo_id = NULL WHERE id = 'd8a70000-0000-4000-8000-000000002001';
  PERFORM pg_temp.t_igual((SELECT pe.notas FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000002001'),
                          'teste sem cargo', '1.3 ficha sem cargo editavel');
END $t$;

-- ─── 2. Cargo inexistente ou de outra organizacao -> HRC02 ───────────────────
DO $t$
BEGIN
  BEGIN
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id)
    VALUES ('b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'CargoInexistente', gen_random_uuid());
    RAISE EXCEPTION 'FALHOU: 2a INSERT com cargo inexistente devia ser recusado';
  EXCEPTION WHEN SQLSTATE 'HRC02' THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'cargo_nao_encontrado: o cargo escolhido nao existe nesta organizacao ou foi apagado.%',
                           '2a cargo inexistente');
  END;

  IF current_setting('teste.cargo_outra_org') = '' THEN
    PERFORM set_config('teste.caso_2b', 'NAO VERIFICADO (a base RH so tem a nike; nao se fabrica outra organizacao)', true);
  ELSE
    BEGIN
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id)
      VALUES ('b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'CargoOutraOrg',
              current_setting('teste.cargo_outra_org')::uuid);
      RAISE EXCEPTION 'FALHOU: 2b INSERT com cargo de outra organizacao devia ser recusado';
    EXCEPTION WHEN SQLSTATE 'HRC02' THEN
      PERFORM pg_temp.t_erro(SQLERRM, 'cargo_nao_encontrado: o cargo escolhido nao existe nesta organizacao ou foi apagado.%',
                             '2b cargo de outra organizacao');
    END;
    PERFORM set_config('teste.caso_2b', 'verificado', true);
  END IF;
END $t$;

-- ─── 3. Cargo desactivado -> HRC09; apagado -> HRC02 ─────────────────────────
DO $t$
BEGIN
  BEGIN
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id)
    VALUES ('b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'CargoDesactivado', current_setting('teste.cargo_c')::uuid);
    RAISE EXCEPTION 'FALHOU: 3.1 INSERT com cargo desactivado devia ser recusado';
  EXCEPTION WHEN SQLSTATE 'HRC09' THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'cargo_desactivado: o cargo escolhido esta desactivado.%', '3.1 cargo desactivado');
  END;

  BEGIN
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id)
    VALUES ('b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'CargoApagado', current_setting('teste.cargo_d')::uuid);
    RAISE EXCEPTION 'FALHOU: 3.2 INSERT com cargo apagado devia ser recusado';
  EXCEPTION WHEN SQLSTATE 'HRC02' THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'cargo_nao_encontrado: o cargo escolhido nao existe nesta organizacao ou foi apagado.%',
                           '3.2 cargo apagado');
  END;
END $t$;

-- ─── 4. UPDATE directo de NULL para um cargo, sem a GUC -> HRC10 ─────────────
DO $t$
BEGIN
  BEGIN
    UPDATE public.pessoas SET cargo_id = current_setting('teste.cargo_a')::uuid
     WHERE id = 'd8a70000-0000-4000-8000-000000002001';
    RAISE EXCEPTION 'FALHOU: 4.1 UPDATE directo de NULL para um cargo devia ser recusado';
  EXCEPTION WHEN SQLSTATE 'HRC10' THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'cargo_so_por_rpc: pessoas.cargo_id passou a ser derivado do historico de cargos%',
                           '4.1 UPDATE directo de NULL para um cargo');
  END;
END $t$;

-- ─── 5. Dar o cargo pelo caminho certo (como authenticated) ──────────────────
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.claims_laborais'), true); END $t$;
SET LOCAL ROLE authenticated;

DO $t$
DECLARE
  v_res jsonb;
BEGIN
  -- sem pg_temp: este bloco corre como authenticated
  v_res := public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002001',
                                            current_setting('teste.cargo_a')::uuid,
                                            current_date,
                                            'Passou a admissao');
  PERFORM set_config('teste.res_mudar', v_res::text, true);
END $t$;

RESET ROLE;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

DO $t$
BEGIN
  PERFORM pg_temp.t_igual((SELECT pe.cargo_id::text FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000002001'),
                          current_setting('teste.cargo_a'), '5.1 pessoas.cargo_id sincronizado pelo historico');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002001'
                              AND c.cargo_id = current_setting('teste.cargo_a')::uuid
                              AND c.valido_de = current_date AND c.valido_ate IS NULL),
                          '1', '5.2 a funcao abriu a linha do cargo desde hoje');
  PERFORM pg_temp.t_igual(current_setting('teste.res_mudar')::jsonb ->> 'cargo_anterior_id', NULL,
                          '5.3 a ficha nao tinha cargo antes');
END $t$;

-- ─── 6. O que continua recusado depois de a ficha ter cargo ──────────────────
DO $t$
BEGIN
  BEGIN
    UPDATE public.pessoas SET cargo_id = NULL WHERE id = 'd8a70000-0000-4000-8000-000000002001';
    RAISE EXCEPTION 'FALHOU: 6.1 voltar um cargo preenchido a NULL devia ser recusado';
  EXCEPTION WHEN SQLSTATE 'HRC08' THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'cargo_obrigatorio: uma pessoa que ja tem cargo nao pode voltar a ficar sem cargo.%',
                           '6.1 cargo para NULL');
  END;

  BEGIN
    UPDATE public.pessoas SET cargo_id = current_setting('teste.cargo_b')::uuid
     WHERE id = 'd8a70000-0000-4000-8000-000000002001';
    RAISE EXCEPTION 'FALHOU: 6.2 mudar o cargo sem a GUC devia ser recusado';
  EXCEPTION WHEN SQLSTATE 'HRC10' THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'cargo_so_por_rpc: pessoas.cargo_id passou a ser derivado do historico de cargos%',
                           '6.2 mudar o cargo sem GUC');
  END;

  -- 6.3 com cargo continua tudo como antes: a primeira linha abre na admissao
  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
  VALUES ('d8a70000-0000-4000-8000-000000002002', 'b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'ComCargo',
          current_setting('teste.cargo_b')::uuid, current_date - 5);
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002002'
                              AND c.cargo_id = current_setting('teste.cargo_b')::uuid
                              AND c.valido_de = current_date - 5 AND c.valido_ate IS NULL),
                          '1', '6.3 INSERT com cargo abre a primeira linha na admissao');
END $t$;

-- ─── 7. A RPC numa ficha sem cargo ───────────────────────────────────────────
-- 7a data_admissao NULL: atribuir cargo com p_desde = hoje passa.
-- 7b data_admissao FUTURA: p_desde = hoje (antes da admissao) continua HRC04; p_desde = data de admissao passa
--    desde 20270114800000.
INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, data_admissao) VALUES
  ('d8a70000-0000-4000-8000-000000002003', 'b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'AdmissaoNula', NULL),
  ('d8a70000-0000-4000-8000-000000002004', 'b6ffce4f-f630-4933-833a-008649757a33', 'TesteSemCargo', 'AdmissaoFutura', current_date + 30);

DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.claims_laborais'), true); END $t$;
SET LOCAL ROLE authenticated;

DO $t$
BEGIN
  -- sem pg_temp: este bloco corre como authenticated (verificacoes em linha)
  PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002003',
                                           current_setting('teste.cargo_a')::uuid, current_date, 'Passou a admissao');

  BEGIN
    PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002004',
                                             current_setting('teste.cargo_a')::uuid, current_date, 'Passou a admissao');
    RAISE EXCEPTION 'FALHOU: 7b.1 cargo com p_desde = hoje, antes da admissao futura, devia dar HRC04';
  EXCEPTION WHEN SQLSTATE 'HRC04' THEN
    IF SQLERRM NOT LIKE 'data_invalida: o cargo nao pode comecar antes da data de admissao (%' THEN
      RAISE EXCEPTION 'FALHOU: 7b.1 admissao futura, p_desde = hoje -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  -- 7b.2 desde 20270114800000: p_desde = admissao futura passa (ver hr_cargo_com_admissao_futura.test.sql).
  PERFORM public.rpc_hr_pessoa_mudar_cargo('d8a70000-0000-4000-8000-000000002004',
                                           current_setting('teste.cargo_a')::uuid, current_date + 30, 'Passou a admissao');
END $t$;

RESET ROLE;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

DO $t$
BEGIN
  PERFORM pg_temp.t_igual((SELECT pe.cargo_id::text FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000002003'),
                          current_setting('teste.cargo_a'), '7a admissao NULL: cargo atribuido com p_desde = hoje');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002003'
                              AND c.valido_de = current_date AND c.valido_ate IS NULL),
                          '1', '7a admissao NULL: linha aberta desde hoje');
  PERFORM pg_temp.t_igual((SELECT pe.cargo_id::text FROM public.pessoas pe
                            WHERE pe.id = 'd8a70000-0000-4000-8000-000000002004'),
                          current_setting('teste.cargo_a'), '7b admissao futura: cargo atribuido com p_desde = admissao');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_cargos c
                            WHERE c.pessoa_id = 'd8a70000-0000-4000-8000-000000002004'
                              AND c.valido_de = current_date + 30 AND c.valido_ate IS NULL),
                          '1', '7b admissao futura: uma linha aberta desde a admissao');
END $t$;

SELECT 'OK: hr_pessoa_sem_cargo_na_admissao -- todos os casos passaram (tudo desfeito no ROLLBACK)' AS resultado,
       current_setting('teste.caso_2b', true) AS caso_2b_outra_organizacao;

ROLLBACK;
