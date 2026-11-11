-- ============================================================
-- Testes: 20270114500000_hr_pessoa_datas_derivadas_dos_contratos.sql (base RH)
-- ============================================================
-- Corre DEPOIS de aplicar a migration, NA NIKE, e tudo dentro de BEGIN ... ROLLBACK: cria pessoas (com um cargo activo do
-- catalogo da nike), contratos e dois papeis de teste na organizacao nike (b6ffce4f-f630-4933-833a-008649757a33), empresta duas
-- memberships activas da nike (troca-lhes o papel so dentro da transaccao; nao se criam memberships novas por causa do limite de
-- lugares da subscricao) e desfaz tudo no fim. Nao toca em dados de nenhuma outra organizacao. SQL simples (sem pgTAP).
-- Cada recusa so passa se a mensagem (SQLERRM) for a esperada.
--
-- Correr (qualquer falha rebenta com 'FALHOU: ...'; o resultado util e o ultimo SELECT):
--   supabase db query --linked -f supabase/tests/hr_pessoa_datas_derivadas.test.sql   (a partir do worktree ligado a RH)
--
-- Cobre:
--   1. Bloqueio da escrita directa: UPDATE com valor diferente = 23514; mesmo valor passa; INSERT com saida = 23514; INSERT anula a
--      antiguidade (H2) e aceita a contratacao provisoria, que o primeiro contrato substitui
--   2. Utilizador com hr.pessoas.vinculos.edit sem laborais.edit grava o contrato e as datas acompanham; authenticated sem EXECUTE
--      no recalculo (42501); utilizador so com laborais.edit: mudar uma data = 23514, mudar o cargo passa
--   3. A regra: contiguos, sobrepostos, intervalo (readmissao), apagados, futuro isolado depois de terminado (H4), futuro contiguo,
--      so futuro, sem fim com terminado dentro, suspenso, futuro que passa a activo, DELETE fisico, apagar a pessoa em cascata
--   4. Antiguidade no contrato, CHECK antiguidade <= inicio, auditoria do contrato
--   5. M1 (GUC reposto) e M2 (pessoa inexistente)
--   6. A saida so se limpa com um contrato ja iniciado: apagar o ultimo contrato de quem saiu mantem a saida; um contrato 'futuro'
--      isolado mantem a saida (e, como a contratacao calculada lhe seria posterior, mantem tambem contratacao e antiguidade, por causa
--      do CHECK saida >= admissao); um contrato novo activo limpa-a (readmissao); suspenso com saida anterior segue a regra
--   7. hr_pessoa_datas_divergencias: apanha uma data fora da regra; nao conta a saida mantida, a readmissao futura, nem a
--      contratacao provisoria de uma pessoa nova sem contrato
-- ============================================================

BEGIN;

-- ─── Ajudas (temporarias, desaparecem com o ROLLBACK) ────────────────────────
CREATE FUNCTION pg_temp.t_datas(p uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT (pe.data_admissao, pe.data_antiguidade, pe.data_saida)::text FROM public.pessoas pe WHERE pe.id = p
$f$;

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
-- Guardas lidas nas definicoes VIVAS (11/11) que a fixture tem de cumprir:
--   - hr_pessoas_cargo_guarda (BEFORE INSERT em pessoas): cargo_id obrigatorio, da mesma organizacao, activo e nao apagado
--     (HRC08/HRC02/HRC09). Corre ANTES de trg_pessoas_datas_derivadas (ordem alfabetica), por isso ate o INSERT que se espera
--     recusado por causa da saida (1.4) leva cargo. hr_pessoas_cargo_primeira_linha abre pessoas_cargos em
--     coalesce(data_admissao, hoje); hr_pessoas_cargos_sem_sobreposicao: uma so linha por pessoa, sem conflito.
--   - pessoas_vinculos: hr_pessoas_vinculos_horas_e_derivado recusa horas no INSERT (nao se mandam); hr_vinculos_proteger_ciclo
--     recusa renovacoes/decisao de fim (nao se mandam); idx_pessoas_vinculos_um_em_vigor: um activo/suspenso por pessoa.
--   - anew_memberships: fn_enforce_user_seat_limit conta lugares a cada membership NOVA activa (a nike tem subscricao) -- por
--     isso NAO se criam utilizadores nem memberships: reaproveitam-se duas memberships activas da nike (utilizadores nao
--     system admin, com uma so membership activa na nike) e troca-se-lhes o role_id para os papeis de teste. Trocar o papel
--     de uma membership activa nao consome lugar (o trigger sai cedo). Tudo desfeito no ROLLBACK.
--   - anew_role_permissions: trg_protect_system_role_perms le request.jwt.claims como jsonb -- as claims nunca ficam ''.
DO $fx$
DECLARE
  v_org   uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_cargo uuid;
  v_m1    uuid;
  v_m2    uuid;
  v_a1    uuid;
  v_a2    uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = v_org) THEN
    RAISE EXCEPTION 'FALHOU: organizacao nike nao encontrada';
  END IF;

  SELECT c.id INTO v_cargo
    FROM public.hr_cargos c
   WHERE c.organization_id = v_org AND c.activo IS TRUE AND c.deleted_at IS NULL
   ORDER BY c.id
   LIMIT 1;
  IF v_cargo IS NULL THEN
    RAISE EXCEPTION 'FALHOU: fixture -- a nike nao tem nenhum cargo activo no catalogo';
  END IF;
  PERFORM set_config('teste.cargo', v_cargo::text, true);

  -- Duas memberships activas da nike para emprestar (ver nota acima).
  WITH elegiveis AS (
    SELECT am.id AS membership_id, u.auth_user_id
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
     LIMIT 2
  )
  SELECT (array_agg(e.membership_id ORDER BY e.membership_id))[1], (array_agg(e.membership_id ORDER BY e.membership_id))[2],
         (array_agg(e.auth_user_id ORDER BY e.membership_id))[1], (array_agg(e.auth_user_id ORDER BY e.membership_id))[2]
    INTO v_m1, v_m2, v_a1, v_a2
    FROM elegiveis e;
  IF v_m2 IS NULL THEN
    RAISE EXCEPTION 'FALHOU: fixture -- a nike nao tem duas memberships activas elegiveis para emprestar';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  INSERT INTO public.anew_roles (id, code, name, organization_id, is_system) VALUES
    ('d8a70000-0000-4000-8000-000000000301', 'teste_datas_so_contratos', 'Teste datas so contratos', v_org, false),
    ('d8a70000-0000-4000-8000-000000000302', 'teste_datas_so_laborais', 'Teste datas so laborais', v_org, false);

  INSERT INTO public.anew_role_permissions (role_id, permission_code) VALUES
    ('d8a70000-0000-4000-8000-000000000301', 'hr.pessoas.vinculos.view'),
    ('d8a70000-0000-4000-8000-000000000301', 'hr.pessoas.vinculos.edit'),
    ('d8a70000-0000-4000-8000-000000000302', 'hr.pessoas.view'),
    ('d8a70000-0000-4000-8000-000000000302', 'hr.pessoas.laborais.edit');

  UPDATE public.anew_memberships SET role_id = 'd8a70000-0000-4000-8000-000000000301' WHERE id = v_m1;
  UPDATE public.anew_memberships SET role_id = 'd8a70000-0000-4000-8000-000000000302' WHERE id = v_m2;

  PERFORM set_config('request.jwt.claims', '{}', true);

  -- Claims de cada utilizador emprestado (usadas antes de SET LOCAL ROLE authenticated).
  PERFORM set_config('teste.claims_contratos', json_build_object('sub', v_a1, 'role', 'authenticated')::text, true);
  PERFORM set_config('teste.claims_laborais',  json_build_object('sub', v_a2, 'role', 'authenticated')::text, true);

  -- Confirmar que as permissoes ficaram como o teste precisa.
  IF NOT public.has_anew_permission_in_org(v_a1, 'hr.pessoas.vinculos.edit', v_org)
     OR public.has_anew_permission_in_org(v_a1, 'hr.pessoas.laborais.edit', v_org)
     OR NOT public.has_anew_permission_in_org(v_a2, 'hr.pessoas.laborais.edit', v_org)
     OR public.has_anew_permission_in_org(v_a2, 'hr.pessoas.edit', v_org)
     OR public.has_anew_permission_in_org(v_a2, 'hr.pessoas.vinculos.edit', v_org) THEN
    RAISE EXCEPTION 'FALHOU: fixture -- as permissoes dos utilizadores emprestados nao ficaram so as de teste';
  END IF;

  -- Uma pessoa por cenario, todas sem datas, com um cargo activo da nike.
  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, cargo_id)
  SELECT ('d8a70000-0000-4000-8000-0000000010' || lpad(n::text, 2, '0'))::uuid, v_org, 'TesteDatas' || n, 'Teste', v_cargo
    FROM generate_series(1, 21) AS n;
END $fx$;

-- ─── 1. Bloqueio da escrita directa (como postgres: o mesmo caminho da service_role) ──
DO $t$
BEGIN
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
  VALUES ('d8a70000-0000-4000-8000-000000001001', 'b6ffce4f-f630-4933-833a-008649757a33', 'sem_termo', '2024-03-01', 'activo');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001001'), '(2024-03-01,2024-03-01,)', '1.0 contrato sem fim');

  BEGIN
    UPDATE public.pessoas SET data_admissao = '2020-01-01' WHERE id = 'd8a70000-0000-4000-8000-000000001001';
    RAISE EXCEPTION 'FALHOU: 1.1 UPDATE directo de data_admissao com valor diferente devia ser recusado';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'pessoas_datas_derivadas: a data de contratacao, a de antiguidade e a de saida derivam dos contratos%',
                           '1.1 UPDATE directo de data_admissao');
  END;

  BEGIN
    UPDATE public.pessoas SET data_saida = '2030-01-01' WHERE id = 'd8a70000-0000-4000-8000-000000001001';
    RAISE EXCEPTION 'FALHOU: 1.2 UPDATE directo de data_saida devia ser recusado';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'pessoas_datas_derivadas: a data de contratacao, a de antiguidade e a de saida derivam dos contratos%',
                           '1.2 UPDATE directo de data_saida');
  END;

  -- 1.3 reenviar os mesmos valores passa
  UPDATE public.pessoas SET data_admissao = '2024-03-01', data_antiguidade = '2024-03-01', data_saida = NULL
   WHERE id = 'd8a70000-0000-4000-8000-000000001001';

  BEGIN
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_saida)
    VALUES ('b6ffce4f-f630-4933-833a-008649757a33', 'TesteDatas', 'ComSaida', current_setting('teste.cargo')::uuid, '2025-01-01');
    RAISE EXCEPTION 'FALHOU: 1.4 INSERT de pessoa com data_saida devia ser recusado';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.t_erro(SQLERRM, 'pessoas_datas_derivadas: pessoas.data_saida nao se preenche ao criar a pessoa%',
                           '1.4 INSERT com data_saida');
  END;

  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, cargo_id, data_admissao, data_antiguidade)
  VALUES ('d8a70000-0000-4000-8000-000000001099', 'b6ffce4f-f630-4933-833a-008649757a33', 'TesteDatas', 'Nova',
          current_setting('teste.cargo')::uuid, '2025-05-01', '2019-01-01');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001099'), '(2025-05-01,,)',
                          '1.5 INSERT: antiguidade anulada (H2), contratacao provisoria aceite');

  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
  VALUES ('d8a70000-0000-4000-8000-000000001099', 'b6ffce4f-f630-4933-833a-008649757a33', 'sem_termo', '2025-05-12', 'activo');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001099'), '(2025-05-12,2025-05-12,)',
                          '1.6 o primeiro contrato substitui a contratacao provisoria; antiguidade = contratacao (D4)');
END $t$;

-- ─── 2. Permissoes ───────────────────────────────────────────────────────────
-- 2.1-2.2 so com hr.pessoas.vinculos.edit (membership emprestada 1)
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.claims_contratos'), true); END $t$;
SET LOCAL ROLE authenticated;

DO $t$
BEGIN
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
  VALUES ('d8a70000-0000-4000-8000-000000001002', 'b6ffce4f-f630-4933-833a-008649757a33', 'sem_termo', '2023-09-04', 'activo');

  BEGIN
    PERFORM public.hr_pessoa_datas_recalcular('d8a70000-0000-4000-8000-000000001002');
    RAISE EXCEPTION 'FALHOU: 2.2 authenticated nao devia ter EXECUTE em hr_pessoa_datas_recalcular';
  EXCEPTION WHEN insufficient_privilege THEN
    -- verificacao em linha (sem pg_temp: este bloco corre como authenticated)
    IF SQLERRM NOT LIKE 'permission denied for function hr_pessoa_datas_recalcular%' THEN
      RAISE EXCEPTION 'FALHOU: 2.2 EXECUTE de hr_pessoa_datas_recalcular -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;
END $t$;

RESET ROLE;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

DO $t$
BEGIN
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001002'), '(2023-09-04,2023-09-04,)',
                          '2.1 vinculos.edit sem laborais.edit grava o contrato e as datas acompanham');
END $t$;

-- 2.3-2.4 so com hr.pessoas.laborais.edit (membership emprestada 2)
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', current_setting('teste.claims_laborais'), true); END $t$;
SET LOCAL ROLE authenticated;

DO $t$
DECLARE
  v_n integer;
BEGIN
  BEGIN
    UPDATE public.pessoas SET data_admissao = '2000-01-01' WHERE id = 'd8a70000-0000-4000-8000-000000001001';
    RAISE EXCEPTION 'FALHOU: 2.3 com so laborais.edit, mudar a contratacao devia dar 23514';
  EXCEPTION WHEN check_violation THEN
    -- verificacao em linha (sem pg_temp: este bloco corre como authenticated)
    IF SQLERRM NOT LIKE 'pessoas_datas_derivadas: a data de contratacao, a de antiguidade e a de saida derivam dos contratos%' THEN
      RAISE EXCEPTION 'FALHOU: 2.3 so laborais.edit a mudar a contratacao -- recusado, mas com outra mensagem: %', SQLERRM;
    END IF;
  END;

  UPDATE public.pessoas SET cargo = 'Cargo de teste datas' WHERE id = 'd8a70000-0000-4000-8000-000000001001';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'FALHOU: 2.4 o UPDATE do cargo nao encontrou a pessoa (RLS?): % linhas', v_n;
  END IF;
END $t$;

RESET ROLE;
DO $t$ BEGIN PERFORM set_config('request.jwt.claims', '{}', true); END $t$;

DO $t$
BEGIN
  PERFORM pg_temp.t_igual((SELECT pe.cargo FROM public.pessoas pe WHERE pe.id = 'd8a70000-0000-4000-8000-000000001001'),
                          'Cargo de teste datas', '2.4 com so laborais.edit, mudar o cargo passa');
END $t$;

-- ─── 3. A regra ──────────────────────────────────────────────────────────────
DO $t$
DECLARE
  v_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
BEGIN
  -- 3.1 contiguos fundem-se; termo certo ainda activo: saida NULL (D2)
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001003', v_org, 'termo_certo', '2022-01-01', '2022-06-30', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001003', v_org, 'termo_certo', '2022-07-01', '2027-06-30', 'activo');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001003'), '(2022-01-01,2022-01-01,)', '3.1 contiguos');

  -- 3.2 sobrepostos fundem-se; todos terminados: saida = maior data_fim
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001004', v_org, 'termo_certo', '2021-01-01', '2021-12-31', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001004', v_org, 'termo_certo', '2021-06-01', '2022-03-31', 'terminado');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001004'), '(2021-01-01,2021-01-01,2022-03-31)', '3.2 sobrepostos');

  -- 3.3 um dia sem contrato separa cadeias: conta a actual (D1)
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001005', v_org, 'termo_certo', '2018-01-01', '2019-12-31', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001005', v_org, 'sem_termo',   '2020-01-02', NULL,         'activo');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001005'), '(2020-01-02,2020-01-02,)', '3.3 intervalo');

  -- 3.4 contrato apagado nao conta
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado, deleted_at) VALUES
    ('d8a70000-0000-4000-8000-000000001006', v_org, 'termo_certo', '2015-01-01', '2015-12-31', 'terminado', now());
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001006', v_org, 'sem_termo', '2016-01-01', 'activo');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001006'), '(2016-01-01,2016-01-01,)', '3.4 apagado');

  -- 3.5 H4: futuro isolado depois de terminado nao apaga a saida
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001007', v_org, 'termo_certo', '2020-01-01', '2020-12-31', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001007', v_org, 'sem_termo',   '2099-01-01', NULL,         'futuro');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001007'), '(2020-01-01,2020-01-01,2020-12-31)', '3.5 H4');

  -- 3.6 futuro contiguo entra na cadeia: saida NULL
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001008', v_org, 'termo_certo', '2020-01-01', '2020-12-31', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001008', v_org, 'termo_certo', '2021-01-01', '2021-12-31', 'futuro');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001008'), '(2020-01-01,2020-01-01,)', '3.6 futuro contiguo');

  -- 3.7 so futuro, pessoa nova sem saida: contratacao = inicio do futuro
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001009', v_org, 'sem_termo', '2099-02-01', 'futuro');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001009'), '(2099-02-01,2099-02-01,)', '3.7 so futuro');

  -- 3.8 apagar o ultimo contrato de quem nunca saiu: as tres a NULL
  UPDATE public.pessoas_vinculos SET deleted_at = now() WHERE pessoa_id = 'd8a70000-0000-4000-8000-000000001009';
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001009'), '(,,)', '3.8 apagar o ultimo, sem saida');

  -- 3.9 sem contrato: a funcao devolve uma linha NULL
  PERFORM pg_temp.t_igual((SELECT (c.data_admissao, c.data_antiguidade, c.data_saida, c.tem_iniciado)::text
                             FROM public.hr_pessoa_datas_calcular('d8a70000-0000-4000-8000-000000001010') c),
                          '(,,,f)', '3.9 calcular sem contrato');

  -- 3.10 sem fim abre a cadeia ate infinito; um terminado la dentro nao a parte
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001014', v_org, 'sem_termo',   '2019-01-01', NULL,         'activo'),
    ('d8a70000-0000-4000-8000-000000001014', v_org, 'termo_certo', '2021-01-01', '2021-06-30', 'terminado');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001014'), '(2019-01-01,2019-01-01,)', '3.10 sem fim');

  -- 3.11 suspenso conta como contrato em vigor
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001015', v_org, 'termo_certo', '2019-01-01', '2019-12-31', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001015', v_org, 'sem_termo',   '2020-01-01', NULL,         'suspenso');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001015'), '(2019-01-01,2019-01-01,)', '3.11 suspenso');

  -- 3.12 o futuro isolado da 3.5 passa a activo: readmissao, saida limpa
  UPDATE public.pessoas_vinculos SET estado = 'activo'
   WHERE pessoa_id = 'd8a70000-0000-4000-8000-000000001007' AND data_inicio = '2099-01-01';
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001007'), '(2099-01-01,2099-01-01,)', '3.12 futuro passa a activo');

  -- 3.13 DELETE fisico do contrato em vigor (a RLS bloqueia-o a authenticated; aqui como postgres)
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001017', v_org, 'termo_certo', '2018-01-01', '2018-12-31', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001017', v_org, 'sem_termo',   '2020-01-01', NULL,         'activo');
  DELETE FROM public.pessoas_vinculos
   WHERE pessoa_id = 'd8a70000-0000-4000-8000-000000001017' AND data_inicio = '2020-01-01';
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001017'), '(2018-01-01,2018-01-01,2018-12-31)', '3.13 DELETE fisico');

  -- 3.14 apagar a pessoa em cascata: o trigger encontra a pessoa ja apagada e devolve sem erro (M2).
  --      Varias tabelas tem FK para pessoas sem cascata (RESTRICT/NO ACTION, lido no catalogo); se alguma linha criada por
  --      outros triggers impedir o DELETE, o caso fica como NAO VERIFICADO no resultado final, nao como falha da migration.
  BEGIN
    DELETE FROM public.pessoas WHERE id = 'd8a70000-0000-4000-8000-000000001017';
    PERFORM set_config('teste.cascata', 'verificado', true);
  EXCEPTION WHEN foreign_key_violation THEN
    PERFORM set_config('teste.cascata', 'NAO VERIFICADO (FK sem cascata: ' || SQLERRM || ')', true);
  END;
END $t$;

-- ─── 4. Antiguidade no contrato, CHECK e auditoria ───────────────────────────
DO $t$
DECLARE
  v_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
BEGIN
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado, data_antiguidade) VALUES
    ('d8a70000-0000-4000-8000-000000001011', v_org, 'sem_termo', '2024-01-01', 'activo', '2012-04-01');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001011'), '(2024-01-01,2012-04-01,)', '4.1 antiguidade do contrato');

  BEGIN
    INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado, data_antiguidade) VALUES
      ('d8a70000-0000-4000-8000-000000001012', v_org, 'sem_termo', '2024-01-01', 'activo', '2024-01-02');
    RAISE EXCEPTION 'FALHOU: 4.2 antiguidade posterior ao inicio do contrato devia ser recusada pelo CHECK';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.t_erro(SQLERRM, '%pessoas_vinculos_antiguidade_ate_inicio%', '4.2 CHECK antiguidade <= inicio');
  END;

  UPDATE public.pessoas_vinculos SET data_antiguidade = '2010-01-01'
   WHERE pessoa_id = 'd8a70000-0000-4000-8000-000000001011';
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.pessoas_vinculos_alteracoes a
                            WHERE a.pessoa_id = 'd8a70000-0000-4000-8000-000000001011' AND a.campo = 'data_antiguidade'),
                          '1', '4.3 mudar a antiguidade do contrato fica na auditoria');
END $t$;

-- ─── 5. M2 e M1 ──────────────────────────────────────────────────────────────
DO $t$
BEGIN
  PERFORM public.hr_pessoa_datas_recalcular('00000000-0000-0000-0000-00000000dead');  -- M2: sem erro
END $t$;

SET LOCAL hr.sync_datas_pessoa = 'valor-anterior';
DO $t$
BEGIN
  PERFORM public.hr_pessoa_datas_recalcular('d8a70000-0000-4000-8000-000000001013');
  PERFORM pg_temp.t_igual(current_setting('hr.sync_datas_pessoa', true), 'valor-anterior', '5.1 M1: GUC reposto');
END $t$;
SET LOCAL hr.sync_datas_pessoa = '';

-- ─── 6. A saida so se limpa com um contrato ja iniciado ──────────────────────
DO $t$
DECLARE
  v_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
BEGIN
  -- 6.1 quem saiu (pessoa 04 da 3.2, saida 2022-03-31) fica sem contratos: saida mantida
  UPDATE public.pessoas_vinculos SET deleted_at = now()
   WHERE pessoa_id = 'd8a70000-0000-4000-8000-000000001004' AND deleted_at IS NULL;
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001004'), '(,,2022-03-31)',
                          '6.1 apagar o ultimo contrato de quem saiu mantem a saida');

  -- 6.2 readmissao: a mesma pessoa recebe um contrato NOVO activo -> saida limpa
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001004', v_org, 'sem_termo', '2023-05-01', 'activo');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001004'), '(2023-05-01,2023-05-01,)',
                          '6.2 readmissao com contrato activo limpa a saida');

  -- 6.3 quem saiu (2019-12-31), sem contratos vivos, recebe so um contrato 'futuro': saida mantida;
  --     a contratacao calculada (2099) seria posterior a saida, por isso contratacao e antiguidade tambem se mantem
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001018', v_org, 'termo_certo', '2019-01-01', '2019-12-31', 'terminado');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001018'), '(2019-01-01,2019-01-01,2019-12-31)', '6.3a saiu');
  UPDATE public.pessoas_vinculos SET deleted_at = now() WHERE pessoa_id = 'd8a70000-0000-4000-8000-000000001018';
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001018'), '(,,2019-12-31)', '6.3b sem contratos');
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001018', v_org, 'sem_termo', '2099-01-01', 'futuro');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001018'), '(,,2019-12-31)',
                          '6.3c so um contrato futuro: saida mantida (e contratacao/antiguidade, pelo CHECK)');

  -- 6.4 o futuro comeca (passa a activo): agora a regra normal limpa a saida
  UPDATE public.pessoas_vinculos SET estado = 'activo'
   WHERE pessoa_id = 'd8a70000-0000-4000-8000-000000001018' AND data_inicio = '2099-01-01';
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001018'), '(2099-01-01,2099-01-01,)',
                          '6.4 o futuro passa a activo: saida limpa');

  -- 6.5 suspenso com saida anterior: segue a regra (cadeia nova com contrato iniciado -> saida NULL)
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001019', v_org, 'termo_certo', '2019-01-01', '2019-12-31', 'terminado');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001019'), '(2019-01-01,2019-01-01,2019-12-31)', '6.5a saiu');
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001019', v_org, 'sem_termo', '2021-01-01', 'suspenso');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001019'), '(2021-01-01,2021-01-01,)',
                          '6.5b suspenso numa cadeia nova: saida limpa pela regra');

  -- 6.6 pessoa sem contratos e sem saida: o recalculo deixa tudo NULL
  PERFORM public.hr_pessoa_datas_recalcular('d8a70000-0000-4000-8000-000000001010');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001010'), '(,,)', '6.6 sem contratos e sem saida');
END $t$;

-- ─── 7. hr_pessoa_datas_divergencias ─────────────────────────────────────────
DO $t$
DECLARE
  v_org constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
BEGIN
  -- 7.1 apanha uma contratacao gravada fora da regra
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001016', v_org, 'sem_termo', '2024-01-01', 'activo');
  PERFORM set_config('hr.sync_datas_pessoa', 'on', true);
  UPDATE public.pessoas SET data_admissao = '2023-01-01' WHERE id = 'd8a70000-0000-4000-8000-000000001016';
  PERFORM set_config('hr.sync_datas_pessoa', '', true);
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.hr_pessoa_datas_divergencias(v_org) d
                            WHERE d.pessoa_id = 'd8a70000-0000-4000-8000-000000001016' AND d.tem_contrato
                              AND d.adm_guardada = '2023-01-01' AND d.adm_calculada = '2024-01-01'),
                          '1', '7.1 divergencia apanhada');

  -- 7.2 nao sao divergencia: saida mantida sem contratos (pessoa 20), readmissao futura com saida mantida (pessoa 21),
  --     contratacao provisoria de uma pessoa nova sem contrato (pessoa 22)
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001020', v_org, 'termo_certo', '2017-01-01', '2017-12-31', 'terminado'),
    ('d8a70000-0000-4000-8000-000000001021', v_org, 'termo_certo', '2017-01-01', '2017-12-31', 'terminado');
  UPDATE public.pessoas_vinculos SET deleted_at = now()
   WHERE pessoa_id IN ('d8a70000-0000-4000-8000-000000001020', 'd8a70000-0000-4000-8000-000000001021');
  INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado) VALUES
    ('d8a70000-0000-4000-8000-000000001021', v_org, 'sem_termo', '2099-03-01', 'futuro');
  -- pessoa nova criada como o assistente a cria (opcao B): contratacao provisoria, sem contrato ainda
  INSERT INTO public.pessoas (id, organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
  VALUES ('d8a70000-0000-4000-8000-000000001022', v_org, 'TesteDatas', 'Provisoria',
          current_setting('teste.cargo')::uuid, '2026-12-01');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001022'), '(2026-12-01,,)', '7.2c contratacao provisoria');

  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001020'), '(,,2017-12-31)', '7.2a saida mantida');
  PERFORM pg_temp.t_igual(pg_temp.t_datas('d8a70000-0000-4000-8000-000000001021'), '(,,2017-12-31)', '7.2b futuro com saida mantida');
  PERFORM pg_temp.t_igual((SELECT count(*)::text FROM public.hr_pessoa_datas_divergencias(v_org) d
                            WHERE d.pessoa_id IN ('d8a70000-0000-4000-8000-000000001020',
                                                  'd8a70000-0000-4000-8000-000000001021',
                                                  'd8a70000-0000-4000-8000-000000001022')),
                          '0', '7.2 saida mantida, readmissao futura e contratacao provisoria nao sao divergencia');
END $t$;

SELECT 'OK: hr_pessoa_datas_derivadas -- todos os casos passaram (tudo desfeito no ROLLBACK)' AS resultado,
       current_setting('teste.cascata', true) AS caso_3_14_cascata;

ROLLBACK;
