-- ==============================================================================
-- 20261210090000_hr_seed_dados_teste_branch.sql
--
-- SEMENTE DE DADOS DE TESTE DO MODULO DE RH -- SO PARA O BRANCH DE DESENVOLVIMENTO
-- DO RH (ref uetjghdkwbywbftedtth). NAO e uma migration de producao e NUNCA deve
-- ser empurrada para a base partilhada (tzbfgwpckrfbqcolqxtm). Vive fora do git.
--
-- O QUE FAZ
--   Cria, na organizacao nike (b6ffce4f-f630-4933-833a-008649757a33), 14 fichas
--   de teste (numero_interno TRH-0001 a TRH-0014, e-mails @teste-rh.olyvia.invalid),
--   3 centros, 10 cargos, contratos, retribuicoes, horas contratadas, afectacoes,
--   horario planeado, faltas, ausencias e ferias, picagens e horas realizadas de
--   2026-08-10 a 2026-10-05, obras, documentos, 4 papeis novos e 6 utilizadores
--   com conta (palavra-passe unica, ver o vault) ligados a 6 das fichas.
--
-- O QUE NAO FAZ
--   Nao toca nas 7 fichas de teste anteriores (ZZ Teste Fluxo1 e afins). Nao cria
--   contas bancarias (Vault), processamento salarial, organograma, projeccao de
--   ausencias no calendario, nem ficheiros de storage.
--
-- REGRAS RESPEITADAS
--   - So escreve na organizacao nike. Aborta se houver mais do que uma organizacao.
--   - Sem session_replication_role: todos os triggers do modulo ficam activos.
--     A UNICA excepcao e o trigger trg_pessoas_horario_planeado_janela_imutavel,
--     desligado so durante os INSERT do horario planeado (B11) e reactivado no
--     mesmo bloco; o CONFERIR confirma tgenabled = 'O'.
--   - Idempotente: se ja existir uma pessoa com numero_interno TRH-, avisa e sai.
--   - Tudo em blocos DO; o CONFERIR final faz RAISE EXCEPTION se um numero falhar.
--   - Sem COMMIT: corre dentro da transaccao do db push, por isso uma falha
--     desfaz tudo.
--
-- MODELO DE SALARIO
--   O salario base vem so do cargo: todas as retribuicoes tem valor_base e
--   periodicidade iguais aos do cargo da pessoa. Subsidio de alimentacao e
--   duodecimos continuam por pessoa.
--
-- ANTES DO db push
--   Esta migration so cria dados. A pasta tem de ter esta migration como unica
--   pendente (supabase migration list --linked) e o link tem de apontar ao branch.
-- ==============================================================================

-- ==============================================================================
-- B00 -- Guardas anti-producao e pre-requisitos
-- ==============================================================================
DO $trh_b00$
DECLARE
  c_nike constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33';
  v_n integer;
  v_f text;
  v_t text;
  v_c text;
BEGIN
  -- Uma so organizacao, e e a nike.
  SELECT count(*) INTO v_n FROM public.anew_organizations;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'B00: esperava-se exactamente 1 organizacao e ha %. Esta semente so corre no branch de teste do RH.', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = c_nike) THEN
    RAISE EXCEPTION 'B00: a unica organizacao nao e a nike (%). Abortado.', c_nike;
  END IF;

  -- Exactamente um super_admin activo na nike (o Miguel, autor das colunas created_by).
  SELECT count(DISTINCT m.user_id) INTO v_n
    FROM public.anew_memberships m
    JOIN public.anew_roles r ON r.id = m.role_id
   WHERE m.organization_id = c_nike
     AND m.status = 'active'
     AND r.code = 'super_admin';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'B00: esperava-se exactamente 1 utilizador super_admin activo na nike e ha %.', v_n;
  END IF;

  -- Funcoes de que a semente depende.
  FOREACH v_f IN ARRAY ARRAY[
    'public.hr_picagens_consolidar(uuid,uuid,date)',
    'public.hr_ausencias_tipos_semear(uuid)',
    'public.hr_documento_variaveis(uuid,uuid,boolean)',
    'public.hr_documento_substituir_variaveis(text,jsonb)',
    'public.hr_nif_valido(text)',
    'public.hr_niss_valido(text)',
    'public.hr_ausencias_calcular_direito_admissao(date)',
    'public.hr_ausencias_aprovador_chefia(uuid,uuid)',
    'public.hr_assiduidade_desvios(uuid,date,date)',
    'extensions.crypt(text,text)',
    'extensions.gen_salt(text,integer)'
  ]
  LOOP
    IF to_regprocedure(v_f) IS NULL THEN
      RAISE EXCEPTION 'B00: falta a funcao % no branch.', v_f;
    END IF;
  END LOOP;

  -- Tabelas de que a semente depende.
  FOREACH v_t IN ARRAY ARRAY[
    'public.pessoas','public.pessoas_dados_pessoais','public.pessoas_identificacao',
    'public.pessoas_moradas','public.pessoas_contactos_emergencia','public.pessoas_fardamento',
    'public.pessoas_vinculos','public.pessoas_vinculos_horas','public.pessoas_retribuicoes',
    'public.pessoas_contas','public.pessoas_afectacoes','public.pessoas_horario_planeado',
    'public.pessoas_horario_realizado','public.pessoas_picagens','public.pessoas_faltas',
    'public.pessoas_faltas_justificacoes','public.pessoas_ausencias_direitos',
    'public.pessoas_ausencias_ajustes','public.pessoas_ausencias_pedidos',
    'public.pessoas_ausencias_dias','public.pessoas_ausencias_pedido_decisoes',
    'public.pessoas_ausencias_justificacoes','public.pessoas_documentos',
    'public.pessoas_documentos_modelos','public.pessoas_documentos_clausulas',
    'public.hr_cargos','public.hr_locais_trabalho','public.hr_obras_horas',
    'public.hr_regras_subsidio_alimentacao','public.hr_ausencias_tipos',
    'public.schedule_holidays','public.schedule_settings',
    'public.anew_roles','public.anew_role_permissions','public.anew_memberships',
    'public.anew_users','public.anew_entities','public.anew_entity_emails',
    'public.anew_entity_org_links','auth.users','auth.identities'
  ]
  LOOP
    IF to_regclass(v_t) IS NULL THEN
      RAISE EXCEPTION 'B00: falta a tabela % no branch.', v_t;
    END IF;
  END LOOP;

  -- Colunas que dependem da versao do GoTrue / das migrations recentes.
  FOREACH v_c IN ARRAY ARRAY[
    'auth.identities.provider_id',
    'public.pessoas.cargo_id',
    'public.pessoas.local_id',
    'public.pessoas_retribuicoes.duodecimos_pct',
    'public.pessoas_documentos.assinatura_origem',
    'public.hr_locais_trabalho.contacto_nome'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = split_part(v_c, '.', 1)
         AND table_name = split_part(v_c, '.', 2)
         AND column_name = split_part(v_c, '.', 3)
    ) THEN
      RAISE EXCEPTION 'B00: falta a coluna % no branch.', v_c;
    END IF;
  END LOOP;

  -- Catalogo de permissoes hr.* presente.
  SELECT count(*) INTO v_n FROM public.anew_permissions WHERE code LIKE 'hr.%';
  IF v_n < 20 THEN
    RAISE EXCEPTION 'B00: o catalogo hr.%% tem so % permissoes -- o branch nao tem o modulo de RH completo.', v_n;
  END IF;

  -- Conflitos de nomes que a semente criaria (so se ainda nao foi semeada).
  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas WHERE organization_id = c_nike AND numero_interno LIKE 'TRH-%'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.hr_locais_trabalho
       WHERE organization_id = c_nike AND deleted_at IS NULL
         AND (lower(btrim(nome)) IN ('sede lisboa','centro porto','armazém setúbal')
              OR codigo IN ('LIS','POR','SET'))
    ) THEN
      RAISE EXCEPTION 'B00: ja existe um centro com o nome ou codigo que a semente quer criar (Sede Lisboa / Centro Porto / Armazem Setubal, LIS / POR / SET). Abortado sem escrever nada.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.hr_cargos
       WHERE organization_id = c_nike
         AND nome IN ('Diretor(a) de Operações','Responsável de Centro','Técnico(a) de RH',
                      'Técnico(a) de Projeto','Técnico(a) de Manutenção','Administrativo(a)',
                      'Administrativo(a) (tempo parcial)','Rececionista',
                      'Operador(a) de Armazém','Estagiário(a)')
    ) THEN
      RAISE EXCEPTION 'B00: ja existe um cargo com o nome de um dos 10 que a semente quer criar. Abortado sem escrever nada.';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE email LIKE '%@teste-rh.olyvia.invalid') THEN
      RAISE EXCEPTION 'B00: ja existem utilizadores @teste-rh.olyvia.invalid sem fichas TRH- -- estado inesperado. Abortado.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.anew_roles
       WHERE code IN ('teste_rh_gestao','teste_rh_chefia','teste_rh_colaborador','teste_rh_so_ponto')
    ) THEN
      RAISE EXCEPTION 'B00: ja existem papeis teste_rh_* sem fichas TRH- -- estado inesperado. Abortado.';
    END IF;
  END IF;
END;
$trh_b00$;
-- ==============================================================================
-- B01 -- Estado, constantes e helpers (so em pg_temp; nada persiste no schema)
-- ==============================================================================
CREATE TEMP TABLE trh_estado (ja boolean NOT NULL);
INSERT INTO trh_estado (ja)
SELECT EXISTS (
  SELECT 1 FROM public.pessoas
   WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
     AND numero_interno LIKE 'TRH-%'
);
DO $trh_b01_aviso$
BEGIN
  IF (SELECT ja FROM pg_temp.trh_estado) THEN
    RAISE NOTICE 'TRH: ja existem pessoas com numero_interno TRH-. A semente ja foi aplicada; os blocos seguintes saem sem escrever nada.';
  END IF;
END;
$trh_b01_aviso$;
CREATE FUNCTION pg_temp.trh_ja() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT ja FROM pg_temp.trh_estado LIMIT 1), false) $$;
CREATE FUNCTION pg_temp.trh_org() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT 'b6ffce4f-f630-4933-833a-008649757a33'::uuid $$;
-- Identificador determinista: md5('rh-seed|<tipo>|<chave>')::uuid
CREATE FUNCTION pg_temp.trh_sid(p_tipo text, p_chave text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT md5('rh-seed|' || p_tipo || '|' || p_chave)::uuid $$;
-- O anew_users do Miguel (o unico super_admin activo da nike).
CREATE FUNCTION pg_temp.trh_miguel() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT m.user_id
    FROM public.anew_memberships m
    JOIN public.anew_roles r ON r.id = m.role_id
   WHERE m.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
     AND m.status = 'active'
     AND r.code = 'super_admin'
$$;
-- Pessoa da semente a partir da chave curta (ex.: 'teresa').
CREATE FUNCTION pg_temp.trh_pessoa(p_chave text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT pg_temp.trh_sid('pessoa', p_chave) $$;
-- Local da semente a partir do codigo (LIS, POR, SET).
CREATE FUNCTION pg_temp.trh_local(p_codigo text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT pg_temp.trh_sid('local', p_codigo) $$;
-- Palavra-passe de teste: hash bcrypt calculado UMA vez e reutilizado.
-- ok = a palavra-passe confere com o hash no momento em que e calculado; assim o texto
-- da palavra-passe aparece so aqui e o CONFERIR nao precisa de o repetir.
CREATE TEMP TABLE trh_hash (h text NOT NULL, ok boolean NOT NULL);
INSERT INTO trh_hash (h, ok)
SELECT x.h, extensions.crypt(x.pw, x.h) = x.h
  FROM (SELECT s.pw, extensions.crypt(s.pw, extensions.gen_salt('bf', 10)) AS h
          FROM (SELECT 'Teste-RH-2026!'::text AS pw) s) x
 WHERE NOT pg_temp.trh_ja();
-- ==============================================================================
-- B02 -- Calendario da organizacao, tipos de ausencia e regra do subsidio
-- ==============================================================================
DO $trh_b02$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  v_n      integer;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  -- A semente nao e uma alteracao feita por um utilizador: sem auditoria generica.
  PERFORM set_config('app.audit_bypass', 'on', true);

  -- schedule_settings: so se a nike ainda nao tiver (organization_id e UNIQUE).
  INSERT INTO public.schedule_settings (organization_id, country_code, timezone, created_by)
  SELECT v_org, 'PT', 'Europe/Lisbon', v_miguel
   WHERE NOT EXISTS (SELECT 1 FROM public.schedule_settings WHERE organization_id = v_org);

  -- Feriados nacionais de Portugal (14 linhas): 10 fixos recorrentes e 4 moveis.
  INSERT INTO public.schedule_holidays
    (id, country_code, organization_id, name, holiday_date, is_recurring, is_custom, created_by)
  SELECT pg_temp.trh_sid('feriado', f.d::text), 'PT', v_org, f.nome, f.d::date, f.rec, true, v_miguel
    FROM (VALUES
      ('Ano Novo',                     '2026-01-01', true),
      ('Dia da Liberdade',             '2026-04-25', true),
      ('Dia do Trabalhador',           '2026-05-01', true),
      ('Dia de Portugal',              '2026-06-10', true),
      ('Assunção de Nossa Senhora',    '2026-08-15', true),
      ('Implantação da República',     '2026-10-05', true),
      ('Todos os Santos',              '2026-11-01', true),
      ('Restauração da Independência', '2026-12-01', true),
      ('Imaculada Conceição',          '2026-12-08', true),
      ('Natal',                        '2026-12-25', true),
      ('Sexta-feira Santa',            '2026-04-03', false),
      ('Corpo de Deus',                '2026-06-04', false),
      ('Sexta-feira Santa',            '2027-03-26', false),
      ('Corpo de Deus',                '2027-05-27', false)
    ) AS f(nome, d, rec)
  ON CONFLICT (id) DO NOTHING;

  -- Os 11 tipos de ausencia canonicos (idempotente; o branch pode nao os ter).
  PERFORM public.hr_ausencias_tipos_semear(v_org);
  SELECT count(DISTINCT lower(btrim(codigo))) INTO v_n
    FROM public.hr_ausencias_tipos
   WHERE organization_id = v_org AND deleted_at IS NULL
     AND upper(codigo) IN ('FERIAS','ASSIST_FAMILIA','BAIXA_MEDICA','CASAMENTO','CONGRESSO',
                           'DOENCA_FAMILIAR','EXAMES','LICENCA_PARENTAL','MOTIVOS_FAMILIARES',
                           'OUTRO','TELETRABALHO');
  IF v_n <> 11 THEN
    RAISE EXCEPTION 'B02: esperavam-se 11 tipos de ausencia canonicos na nike e ha %.', v_n;
  END IF;

  -- Regra do subsidio de alimentacao (uma por organizacao).
  INSERT INTO public.hr_regras_subsidio_alimentacao
    (organization_id, valor_diario, modo, minutos_minimos_dia, created_by)
  SELECT v_org, 9.60, 'cartao', 240, v_miguel
   WHERE NOT EXISTS (SELECT 1 FROM public.hr_regras_subsidio_alimentacao WHERE organization_id = v_org);
END;
$trh_b02$;
-- ==============================================================================
-- B03 -- Quatro papeis de teste e respectivas permissoes (so na nike)
-- ==============================================================================
CREATE TEMP TABLE trh_perm (papel text NOT NULL, permissao text NOT NULL);
DO $trh_b03$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  v_falta  text;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);

  INSERT INTO public.anew_roles
    (id, code, name, description, organization_id, is_system, is_default, can_sign_contracts, created_by)
  VALUES
    (pg_temp.trh_sid('role', 'teste_rh_gestao'),     'teste_rh_gestao',     'Teste RH - Gestão',
     'Gestão de RH sem as acções perigosas (correcções, saúde, sindicalização, revelar NISS, dispositivos).',
     v_org, false, false, false, v_miguel),
    (pg_temp.trh_sid('role', 'teste_rh_chefia'),     'teste_rh_chefia',     'Teste RH - Chefia',
     'Chefia de equipa: aprova ausências da sua cadeia, vê a assiduidade da equipa e pica.',
     v_org, false, false, false, v_miguel),
    (pg_temp.trh_sid('role', 'teste_rh_colaborador'),'teste_rh_colaborador','Teste RH - Colaborador',
     'Colaborador: a própria ficha, pedir ausências e picar.',
     v_org, false, false, false, v_miguel),
    (pg_temp.trh_sid('role', 'teste_rh_so_ponto'),   'teste_rh_so_ponto',   'Teste RH - Só ponto',
     'Só picar o ponto e ver o próprio horário.',
     v_org, false, false, false, v_miguel);

  -- Gestao: todo o catalogo hr.% excepto TODA a permissao marcada is_dangerous
  -- (anew_permissions.is_dangerous: retribuicao, IBAN, saude, atestados, processamento,
  -- criar contas, arquivar, ajustar, importar...) e as acções perigosas.
  INSERT INTO trh_perm (papel, permissao)
  SELECT 'teste_rh_gestao', p.code
    FROM public.anew_permissions p
   WHERE p.code LIKE 'hr.%'
     AND p.code !~ '\.corrigir(\.|$)'
     AND p.code NOT LIKE 'hr.pessoas.saude.%'
     AND p.code NOT LIKE 'hr.pessoas.sindicalizacao.%'
     AND p.code <> 'hr.pessoas.identificacao.reveal'
     AND p.code <> 'hr.pessoas.acessos_sensiveis.view'
     AND p.code <> 'hr.ausencias.historico.editar'
     AND p.code <> 'hr.ausencias.tipos.edit'
     AND p.code NOT LIKE 'hr.assiduidade.dispositivos.%'
     AND coalesce(p.is_dangerous, false) = false;

  INSERT INTO trh_perm (papel, permissao) VALUES
    ('teste_rh_chefia', 'hr.module.access'),
    ('teste_rh_chefia', 'hr.pessoas.view.own'),
    ('teste_rh_chefia', 'hr.ausencias.view.own'),
    ('teste_rh_chefia', 'hr.ausencias.pedir'),
    ('teste_rh_chefia', 'hr.ausencias.aprovar.chefia'),
    ('teste_rh_chefia', 'hr.assiduidade.view.own'),
    ('teste_rh_chefia', 'hr.assiduidade.picar'),
    ('teste_rh_chefia', 'hr.assiduidade.equipa.view'),
    ('teste_rh_chefia', 'hr.pessoas.documentos.view.own'),

    ('teste_rh_colaborador', 'hr.module.access'),
    ('teste_rh_colaborador', 'hr.pessoas.view.own'),
    ('teste_rh_colaborador', 'hr.ausencias.view.own'),
    ('teste_rh_colaborador', 'hr.ausencias.pedir'),
    ('teste_rh_colaborador', 'hr.assiduidade.view.own'),
    ('teste_rh_colaborador', 'hr.assiduidade.picar'),
    ('teste_rh_colaborador', 'hr.pessoas.documentos.view.own'),

    ('teste_rh_so_ponto', 'hr.assiduidade.picar'),
    ('teste_rh_so_ponto', 'hr.assiduidade.view.own'),
    ('teste_rh_so_ponto', 'hr.pessoas.view.own');

  -- Toda a permissao pedida tem de existir no catalogo; nada se inventa.
  SELECT string_agg(DISTINCT t.permissao, ', ') INTO v_falta
    FROM trh_perm t
   WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = t.permissao);
  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'B03: permissoes em falta no catalogo: %', v_falta;
  END IF;

  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT pg_temp.trh_sid('role', t.papel), t.permissao, v_miguel
    FROM trh_perm t;
END;
$trh_b03$;
-- ==============================================================================
-- B04 -- Seis utilizadores com conta (auth + perfil + membership), mesma palavra-passe
-- ==============================================================================
CREATE TEMP TABLE trh_conta (
  chave text PRIMARY KEY, nome text NOT NULL, primeiro text NOT NULL, apelido text NOT NULL,
  email text NOT NULL, papel text NOT NULL
);
INSERT INTO trh_conta (chave, nome, primeiro, apelido, email, papel) VALUES
  ('helena', 'Helena Brandão',  'Helena', 'Brandão',  'helena.brandao@teste-rh.olyvia.invalid',  'teste_rh_gestao'),
  ('paulo',  'Paulo Nogueira',  'Paulo',  'Nogueira', 'paulo.nogueira@teste-rh.olyvia.invalid',  'teste_rh_chefia'),
  ('marta',  'Marta Sequeira',  'Marta',  'Sequeira', 'marta.sequeira@teste-rh.olyvia.invalid',  'teste_rh_colaborador'),
  ('diogo',  'Diogo Pereira',   'Diogo',  'Pereira',  'diogo.pereira@teste-rh.olyvia.invalid',   'teste_rh_colaborador'),
  ('ines',   'Inês Lourenço',   'Inês',   'Lourenço', 'ines.lourenco@teste-rh.olyvia.invalid',   'teste_rh_colaborador'),
  ('sergio', 'Sérgio Matos',    'Sérgio', 'Matos',    'sergio.matos@teste-rh.olyvia.invalid',    'teste_rh_so_ponto');
DO $trh_b04$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  v_hash   text;
  c        record;
  v_col    text;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  PERFORM set_config('app.audit_bypass', 'on', true);
  SELECT h INTO v_hash FROM trh_hash WHERE ok LIMIT 1;
  IF v_hash IS NULL OR v_hash NOT LIKE '$2%' THEN
    RAISE EXCEPTION 'B04: o hash bcrypt nao foi calculado ou nao confere (extensions.crypt).';
  END IF;

  FOR c IN SELECT * FROM trh_conta ORDER BY chave
  LOOP
    -- 1. auth.users (GoTrue). admin_created=true faz o handle_new_user sair a entrada.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid,
      pg_temp.trh_sid('auth', c.chave), 'authenticated', 'authenticated',
      c.email, v_hash, now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', c.nome, 'admin_created', true),
      now(), now()
    );

    -- 2. auth.identities (a coluna email e gerada).
    INSERT INTO auth.identities (
      id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
      pg_temp.trh_sid('identity', c.chave),
      pg_temp.trh_sid('auth', c.chave), 'email', pg_temp.trh_sid('auth', c.chave)::text,
      jsonb_build_object('sub', pg_temp.trh_sid('auth', c.chave)::text, 'email', c.email,
                         'email_verified', true, 'phone_verified', false),
      now(), now(), now()
    );

    -- 3 e 4. Entidade e e-mail de trabalho.
    INSERT INTO public.anew_entities (id, type, display_name, first_name, last_name, status, created_by)
    VALUES (pg_temp.trh_sid('entity', c.chave), 'person', c.nome, c.primeiro, c.apelido, 'active', v_miguel);

    INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary, is_verified, created_by)
    VALUES (pg_temp.trh_sid('entity', c.chave), c.email, 'work', true, true, v_miguel);

    -- 5. Perfil de negocio. O trigger de sincronizacao preenche auth_to_business_user_map.
    INSERT INTO public.anew_users (
      id, email, name, status, created_by, auth_user_id, entity_id,
      has_completed_welcome, registration_origin
    ) VALUES (
      pg_temp.trh_sid('anew_user', c.chave), c.email, c.nome, 'active', v_miguel,
      pg_temp.trh_sid('auth', c.chave), pg_temp.trh_sid('entity', c.chave), true, 'invited'
    );

    -- 6. Membership na nike com o papel de teste.
    INSERT INTO public.anew_memberships (
      user_id, organization_id, role_id, status, relationship_type, join_method, accepted_at, created_by
    ) VALUES (
      pg_temp.trh_sid('anew_user', c.chave), v_org, pg_temp.trh_sid('role', c.papel),
      'active', 'member', 'admin_created', now(), v_miguel
    );

    -- 7. Ligacao da entidade a organizacao.
    INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary)
    SELECT pg_temp.trh_sid('entity', c.chave), v_org, true
     WHERE NOT EXISTS (
       SELECT 1 FROM public.anew_entity_org_links
        WHERE entity_id = pg_temp.trh_sid('entity', c.chave) AND organization_id = v_org
     );
  END LOOP;

  -- Colunas de token do GoTrue a '' (NULL nelas parte o login). So as que existirem.
  FOREACH v_col IN ARRAY ARRAY[
    'confirmation_token','recovery_token','email_change_token_new','email_change',
    'email_change_token_current','phone_change','phone_change_token','reauthentication_token'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = v_col
    ) THEN
      EXECUTE format(
        'UPDATE auth.users SET %I = '''' WHERE email LIKE %L AND %I IS NULL',
        v_col, '%@teste-rh.olyvia.invalid', v_col
      );
    END IF;
  END LOOP;

  PERFORM set_config('app.audit_bypass', 'off', true);
END;
$trh_b04$;
-- ==============================================================================
-- Dados mestre da semente (so em pg_temp): cargos, centros e as 14 pessoas
-- ==============================================================================
CREATE TEMP TABLE trh_cargo (
  slug text PRIMARY KEY, nome text NOT NULL, salario numeric(12,2) NOT NULL,
  periodicidade text NOT NULL, horas_ref numeric(5,2)
);
INSERT INTO trh_cargo (slug, nome, salario, periodicidade, horas_ref) VALUES
  ('dir_op',        'Diretor(a) de Operações',           3200.00, 'mensal', 40),
  ('resp_centro',   'Responsável de Centro',             2100.00, 'mensal', 40),
  ('tec_rh',        'Técnico(a) de RH',                  1650.00, 'mensal', 40),
  ('tec_proj',      'Técnico(a) de Projeto',             1500.00, 'mensal', 40),
  ('tec_manut',     'Técnico(a) de Manutenção',          1250.00, 'mensal', 40),
  ('admin',         'Administrativo(a)',                 1050.00, 'mensal', 40),
  ('admin_parcial', 'Administrativo(a) (tempo parcial)',  525.00, 'mensal', 20),
  ('rececao',       'Rececionista',                       950.00, 'mensal', 40),
  ('operador',      'Operador(a) de Armazém',               5.80, 'hora',   40),
  ('estagio',       'Estagiário(a)',                      840.00, 'mensal', 30);
CREATE TEMP TABLE trh_local (
  cod text PRIMARY KEY, nome text NOT NULL, tipo text NOT NULL, morada text NOT NULL,
  cidade text NOT NULL, distrito text NOT NULL, cp text NOT NULL,
  lat numeric(10,8) NOT NULL, lon numeric(11,8) NOT NULL, contacto text NOT NULL, tel text NOT NULL
);
INSERT INTO trh_local (cod, nome, tipo, morada, cidade, distrito, cp, lat, lon, contacto, tel) VALUES
  ('LIS', 'Sede Lisboa',      'sede',      'Rua Fictícia 100',      'Lisboa',  'Lisboa',  '1000-100',
   38.72250000, -9.13930000, 'Receção Lisboa',  '+351 210 000 001'),
  ('POR', 'Centro Porto',     'escritorio','Avenida Fictícia 200',  'Porto',   'Porto',   '4000-200',
   41.15790000, -8.62910000, 'Receção Porto',   '+351 220 000 002'),
  ('SET', 'Armazém Setúbal',  'armazem',   'Zona Industrial 3',     'Setúbal', 'Setúbal', '2900-300',
   38.52440000, -8.89260000, 'Chefe de armazém','+351 265 000 003');
CREATE TEMP TABLE trh_p (
  n int PRIMARY KEY, chave text NOT NULL UNIQUE, primeiro text NOT NULL, apelido text NOT NULL,
  email_u text NOT NULL, cargo_slug text NOT NULL, local_cod text NOT NULL,
  admissao date NOT NULL, saida date, reporta text, genero text NOT NULL, conta boolean NOT NULL,
  -- contrato
  v_tipo text NOT NULL, v_regime text NOT NULL, v_inicio date NOT NULL, v_fim date,
  v_estado text NOT NULL, v_tipo_trab text NOT NULL, v_dias text[] NOT NULL,
  v_feriados text NOT NULL, v_pct numeric NOT NULL, v_catf text NOT NULL, v_catp text NOT NULL,
  v_renov boolean, v_isenc boolean NOT NULL, v_form_i date, v_form_f date, v_motivo text,
  v_pe_dias int,
  -- horas contratadas
  horas numeric NOT NULL, horas_de date NOT NULL, horas_ate date,
  -- retribuicao (valor e periodicidade vem do cargo)
  subs numeric, subs_modo text, duod smallint NOT NULL, ret_de date NOT NULL, ret_ate date
);
INSERT INTO trh_p VALUES
 (1,'teresa','Teresa','Albuquerque','teresa.albuquerque','dir_op','LIS','2019-03-01',NULL,NULL,'feminino',false,
  'sem_termo','tempo_inteiro','2019-03-01',NULL,'activo','hibrido',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'direcao_quadro_superior','Quadro superior',NULL,true,NULL,NULL,NULL,180,
  40,'2019-03-01',NULL, NULL,NULL,100,'2019-03-01',NULL),
 (2,'helena','Helena','Brandão','helena.brandao','tec_rh','LIS','2022-09-12',NULL,'teresa','feminino',true,
  'sem_termo','tempo_inteiro','2022-09-12',NULL,'activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Técnico especialista',NULL,false,NULL,NULL,NULL,90,
  40,'2022-09-12',NULL, 9.60,'cartao',50,'2022-09-12',NULL),
 (3,'paulo','Paulo','Nogueira','paulo.nogueira','resp_centro','LIS','2020-02-03',NULL,'teresa','masculino',true,
  'sem_termo','tempo_inteiro','2020-02-03',NULL,'activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'tecnica_confianca','Responsável de equipa',NULL,false,NULL,NULL,NULL,180,
  40,'2020-02-03',NULL, 9.60,'cartao',50,'2020-02-03',NULL),
 (4,'rita','Rita','Cardoso','rita.cardoso','resp_centro','POR','2021-05-17',NULL,'teresa','feminino',false,
  'sem_termo','tempo_inteiro','2021-05-17',NULL,'activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Responsável de equipa',NULL,false,NULL,NULL,NULL,90,
  40,'2021-05-17',NULL, 9.60,'cartao',100,'2021-05-17',NULL),
 (5,'marta','Marta','Sequeira','marta.sequeira','tec_proj','LIS','2023-01-09',NULL,'paulo','feminino',true,
  'sem_termo','tempo_inteiro','2023-01-09',NULL,'activo','hibrido',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Técnico',NULL,false,NULL,NULL,NULL,90,
  40,'2023-01-09',NULL, 9.60,'cartao',50,'2023-01-09',NULL),
 (6,'diogo','Diogo','Pereira','diogo.pereira','tec_manut','LIS','2024-04-15',NULL,'paulo','masculino',true,
  'sem_termo','tempo_inteiro','2024-04-15',NULL,'activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Técnico',NULL,false,NULL,NULL,NULL,90,
  40,'2024-04-15',NULL, 9.60,'cartao',0,'2024-04-15',NULL),
 (7,'ines','Inês','Lourenço','ines.lourenco','admin','LIS','2026-02-02',NULL,'paulo','feminino',true,
  'termo_certo','tempo_inteiro','2026-02-02','2027-02-01','activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Administrativo',true,false,NULL,NULL,'Acréscimo excepcional de atividade da empresa',30,
  40,'2026-02-02',NULL, 9.60,'cartao',50,'2026-02-02',NULL),
 (8,'sergio','Sérgio','Matos','sergio.matos','operador','SET','2025-06-02',NULL,'paulo','masculino',true,
  'sem_termo','tempo_inteiro','2025-06-02',NULL,'activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Operador',NULL,false,NULL,NULL,NULL,90,
  40,'2025-06-02',NULL, 6.00,'dinheiro',0,'2025-06-02',NULL),
 (9,'carla','Carla','Monteiro','carla.monteiro','rececao','LIS','2024-10-01',NULL,'paulo','feminino',false,
  'sem_termo','tempo_inteiro','2024-10-01',NULL,'activo','presencial',ARRAY['ter','qua','qui','sex','sab'],
  'trabalho_habitual',100,'geral','Rececionista',NULL,false,NULL,NULL,NULL,90,
  40,'2024-10-01',NULL, 9.60,'cartao',50,'2024-10-01',NULL),
 (10,'andreia','Andreia','Costa','andreia.costa','admin_parcial','POR','2024-06-03',NULL,'rita','feminino',false,
  'tempo_parcial','tempo_parcial','2024-06-03',NULL,'suspenso','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',50,'geral','Administrativo',NULL,false,NULL,NULL,NULL,90,
  20,'2024-06-03',NULL, 4.80,'cartao',100,'2024-06-03',NULL),
 (11,'nuno','Nuno','Baptista','nuno.baptista','admin','POR','2026-09-22',NULL,'rita','masculino',false,
  'termo_incerto','tempo_inteiro','2026-09-22',NULL,'activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Administrativo',NULL,false,NULL,NULL,'Substituição de colaboradora em licença parental',30,
  40,'2026-09-22',NULL, 9.60,'cartao',50,'2026-09-22',NULL),
 (12,'sofia','Sofia','Antunes','sofia.antunes','estagio','LIS','2026-03-02',NULL,'paulo','feminino',false,
  'estagio','tempo_parcial','2026-03-02','2027-02-26','activo','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',75,'geral','Estagiário',NULL,false,'2026-03-02','2027-02-26',NULL,NULL,
  30,'2026-03-02',NULL, 9.60,'cartao',0,'2026-03-02',NULL),
 (13,'vasco','Vasco','Teixeira','vasco.teixeira','tec_manut','POR','2025-09-01','2026-08-31','rita','masculino',false,
  'termo_certo','tempo_inteiro','2025-09-01','2026-08-31','terminado','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Técnico',NULL,false,NULL,NULL,'Obra de duração determinada',30,
  40,'2025-09-01','2026-08-31', 9.60,'cartao',50,'2025-09-01','2026-08-31'),
 (14,'joana','Joana','Fernandes','joana.fernandes','tec_proj','LIS','2026-11-02',NULL,'paulo','feminino',false,
  'sem_termo','tempo_inteiro','2026-11-02',NULL,'futuro','presencial',ARRAY['seg','ter','qua','qui','sex'],
  'nao_laboral',100,'geral','Técnico',NULL,false,NULL,NULL,NULL,90,
  40,'2026-11-02',NULL, 9.60,'cartao',50,'2026-11-02',NULL);
-- Digitos de controlo de NIF e NISS (as mesmas regras de hr_nif_valido / hr_niss_valido).
CREATE FUNCTION pg_temp.trh_nif(p8 text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT p8 || (CASE WHEN (q.s % 11) < 2 THEN 0 ELSE 11 - (q.s % 11) END)::text
    FROM (SELECT sum(substr(p8, i, 1)::integer * (10 - i)) AS s FROM generate_series(1, 8) AS i) q
$$;
CREATE FUNCTION pg_temp.trh_niss(p10 text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT p10 || (9 - (q.s % 10))::text
    FROM (SELECT sum(substr(p10, i, 1)::integer * (ARRAY[29,23,19,17,13,11,7,5,3,2])[i]) AS s
            FROM generate_series(1, 10) AS i) q
$$;
-- ==============================================================================
-- B05 -- Cargos e centros de trabalho
-- ==============================================================================
DO $trh_b05$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  INSERT INTO public.hr_cargos
    (id, organization_id, nome, salario_base, periodicidade, horas_referencia, activo, created_by)
  SELECT pg_temp.trh_sid('cargo', c.slug), v_org, c.nome, c.salario, c.periodicidade, c.horas_ref, true, v_miguel
    FROM trh_cargo c;

  INSERT INTO public.hr_locais_trabalho
    (id, organization_id, nome, codigo, tipo, morada, cidade, codigo_postal, pais,
     latitude, longitude, activo, contacto_nome, contacto_telefone, created_by)
  SELECT pg_temp.trh_local(l.cod), v_org, l.nome, l.cod, l.tipo, l.morada, l.cidade, l.cp, 'PT',
         l.lat, l.lon, true, l.contacto, l.tel, v_miguel
    FROM trh_local l;
END;
$trh_b05$;
-- ==============================================================================
-- B06 -- Fichas (sem local_id: e derivado das afectacoes) e satelites 1:1
-- ==============================================================================
DO $trh_b06$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  -- Um so INSERT: as FK compostas de reporta_a_pessoa_id verificam-se no fim da instrucao.
  INSERT INTO public.pessoas
    (id, organization_id, numero_interno, primeiro_nome, apelido, email_trabalho, telefone_trabalho,
     cargo, local_trabalho, cargo_id, reporta_a_pessoa_id, data_admissao, data_antiguidade, data_saida,
     estado_registo, notas, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org, 'TRH-' || lpad(p.n::text, 4, '0'),
         p.primeiro, p.apelido, p.email_u || '@teste-rh.olyvia.invalid',
         '210000' || lpad(p.n::text, 3, '0'),
         c.nome, l.nome, pg_temp.trh_sid('cargo', p.cargo_slug),
         CASE WHEN p.reporta IS NULL THEN NULL ELSE pg_temp.trh_pessoa(p.reporta) END,
         p.admissao, p.admissao, p.saida, 'activo',
         'Ficha de teste da semente de RH (nao e uma pessoa real).', v_miguel
    FROM trh_p p
    JOIN trh_cargo c ON c.slug = p.cargo_slug
    JOIN trh_local l ON l.cod = p.local_cod;

  -- Dados pessoais
  INSERT INTO public.pessoas_dados_pessoais
    (pessoa_id, organization_id, data_nascimento, genero, nacionalidade, telefone_pessoal,
     estado_civil, dependentes, irs_retencao_percentagem, naturalidade_pais,
     habilitacao_academica, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org,
         DATE '1970-01-01' + ((p.n * 1733) % 9500),
         p.genero, 'PT',
         CASE WHEN p.chave IN ('nuno','joana') THEN NULL
              ELSE '91' || lpad((1000000 + p.n * 137)::text, 7, '0') END,
         (ARRAY['solteiro','casado','uniao_de_facto','divorciado'])[1 + (p.n % 4)],
         (p.n % 3)::smallint,
         (10 + (p.n % 7) * 2.5)::numeric(5,2),
         'PT',
         (ARRAY['licenciatura','secundario','mestrado','3_ciclo'])[1 + (p.n % 4)],
         v_miguel
    FROM trh_p p;

  -- Identificacao (NIF e NISS com digito de controlo certo; Nuno e Joana sem NISS)
  INSERT INTO public.pessoas_identificacao
    (pessoa_id, organization_id, tipo_documento, numero_documento, validade_documento, nif, niss, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org, 'cartao_cidadao',
         lpad((10000000 + p.n * 7919)::text, 8, '0') || ' ' || (p.n % 10)::text || ' ZZ' || (p.n % 10)::text,
         DATE '2030-01-01' + (p.n * 31),
         pg_temp.trh_nif('29' || lpad((p.n * 37 + 100)::text, 6, '0')),
         CASE WHEN p.chave IN ('nuno','joana') THEN NULL
              ELSE pg_temp.trh_niss('1' || lpad((20000000 + p.n * 7919)::text, 9, '0')) END,
         v_miguel
    FROM trh_p p;

  -- Morada principal
  INSERT INTO public.pessoas_moradas
    (pessoa_id, organization_id, tipo, linha1, linha2, codigo_postal, localidade, distrito, pais, is_principal, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org, 'residencia',
         'Rua de Teste n.º ' || (p.n * 3)::text, (p.n % 5 + 1)::text || '.º Esq.',
         substr(l.cp, 1, 2) || lpad((p.n * 7)::text, 2, '0') || '-' || lpad((p.n * 11)::text, 3, '0'),
         l.cidade, l.distrito, 'PT', true, v_miguel
    FROM trh_p p JOIN trh_local l ON l.cod = p.local_cod;

  -- Contacto de emergencia
  INSERT INTO public.pessoas_contactos_emergencia
    (pessoa_id, organization_id, nome, relacao, telefone, ordem, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org, 'Contacto de Emergência ' || p.n::text,
         (ARRAY['cônjuge','mãe','irmão','amiga'])[1 + (p.n % 4)],
         '93' || lpad((2000000 + p.n * 211)::text, 7, '0'), 1, v_miguel
    FROM trh_p p;

  -- Fardamento (Nuno e Joana ficam sem ele, de proposito: pendencia de admissao)
  INSERT INTO public.pessoas_fardamento
    (pessoa_id, organization_id, tamanho_cima, tamanho_baixo, tamanho_calcado, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org,
         (ARRAY['s','m','l','xl'])[1 + (p.n % 4)],
         (ARRAY['38','40','42','44','m','l'])[1 + (p.n % 6)],
         (35 + p.n % 10)::text, v_miguel
    FROM trh_p p
   WHERE p.chave NOT IN ('nuno','joana');
END;
$trh_b06$;
-- ==============================================================================
-- B07 -- Contratos (vinculos), horas contratadas e mudancas de estado
--   As horas entram em pessoas_vinculos_horas; o trigger sincroniza-as para o
--   vinculo em vigor. Vasco e Andreia nascem activos e passam a terminado /
--   suspenso por UPDATE, para gerar o historico em pessoas_vinculos_alteracoes.
-- ==============================================================================
DO $trh_b07$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  r        record;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  INSERT INTO public.pessoas_vinculos
    (id, pessoa_id, organization_id, tipo_contrato, regime, data_inicio, data_fim, motivo_termo,
     periodo_experimental_dias, periodo_experimental_ate, periodo_experimental_origem,
     estado, tipo_trabalho, dias_uteis, politica_feriados, tempo_trabalho_pct,
     categoria_funcao, categoria_profissional, renovavel, isencao_horario,
     formacao_inicio, formacao_fim, created_by)
  SELECT pg_temp.trh_sid('vinculo', p.chave), pg_temp.trh_pessoa(p.chave), v_org,
         p.v_tipo, p.v_regime, p.v_inicio,
         CASE WHEN p.chave = 'vasco' THEN NULL ELSE p.v_fim END,
         p.v_motivo, p.v_pe_dias,
         CASE WHEN p.v_pe_dias IS NULL THEN NULL ELSE p.v_inicio + p.v_pe_dias END,
         CASE WHEN p.v_pe_dias IS NULL THEN NULL ELSE 'sugerido' END,
         CASE WHEN p.chave IN ('vasco','andreia') THEN 'activo' ELSE p.v_estado END,
         p.v_tipo_trab, p.v_dias, p.v_feriados, p.v_pct,
         p.v_catf, p.v_catp, p.v_renov, p.v_isenc,
         p.v_form_i, p.v_form_f, v_miguel
    FROM trh_p p;

  -- Versao de horas contratadas (a auditoria de horas nao regista uma semente).
  FOR r IN SELECT * FROM trh_p ORDER BY n
  LOOP
    PERFORM set_config('hr.skip_horas_auditoria', 'on', true);
    INSERT INTO public.pessoas_vinculos_horas
      (pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia,
       valido_de, valido_ate, motivo, created_by)
    VALUES
      (pg_temp.trh_pessoa(r.chave), v_org, pg_temp.trh_sid('vinculo', r.chave),
       r.horas, 'semanal', r.horas_de, r.horas_ate, 'Horas do contrato inicial', v_miguel);
  END LOOP;
  PERFORM set_config('hr.skip_horas_auditoria', 'off', true);

  -- Mudancas de estado por UPDATE (geram historico real).
  UPDATE public.pessoas_vinculos
     SET estado = 'terminado', data_fim = DATE '2026-08-31', updated_by = v_miguel
   WHERE id = pg_temp.trh_sid('vinculo', 'vasco');

  UPDATE public.pessoas_vinculos
     SET estado = 'suspenso', updated_by = v_miguel
   WHERE id = pg_temp.trh_sid('vinculo', 'andreia');
END;
$trh_b07$;
-- ==============================================================================
-- B08 -- Retribuicoes: valor base e periodicidade IGUAIS aos do cargo da pessoa.
--   Subsidio de alimentacao e duodecimos sao por pessoa. Sem aumentos individuais.
--   Vasco fechada a 2026-08-31; Joana a partir de 2026-11-02.
-- ==============================================================================
DO $trh_b08$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  INSERT INTO public.pessoas_retribuicoes
    (pessoa_id, organization_id, vinculo_id, valor_base, moeda, periodicidade,
     subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct,
     valido_de, valido_ate, motivo, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org, pg_temp.trh_sid('vinculo', p.chave),
         c.salario, 'EUR', c.periodicidade,
         p.subs, p.subs_modo, p.duod,
         p.ret_de, p.ret_ate, 'Retribuição do cargo', v_miguel
    FROM trh_p p
    JOIN trh_cargo c ON c.slug = p.cargo_slug;
END;
$trh_b08$;
-- ==============================================================================
-- B09 -- Ligar as 6 contas as respectivas fichas (so estas seis)
-- ==============================================================================
DO $trh_b09$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  INSERT INTO public.pessoas_contas
    (pessoa_id, organization_id, anew_user_id, entity_id, estado, ligada_por)
  SELECT pg_temp.trh_pessoa(c.chave), v_org, pg_temp.trh_sid('anew_user', c.chave),
         pg_temp.trh_sid('entity', c.chave), 'activa', v_miguel
    FROM trh_conta c;
END;
$trh_b09$;
-- ==============================================================================
-- B10 -- Afectacoes aos centros (as fechadas nascem fechadas)
--   O trigger deriva pessoas.local_id da afectacao em aberto mais recente.
--   Diogo: Setubal desde 15/04, Lisboa desde 16/04 (Lisboa e o local por omissao).
-- ==============================================================================
CREATE TEMP TABLE trh_afect (
  chave text NOT NULL, cod text NOT NULL, de date NOT NULL, ate date, confirmada boolean NOT NULL
);
INSERT INTO trh_afect (chave, cod, de, ate, confirmada) VALUES
  ('teresa',  'LIS', '2019-03-01', NULL,         true),
  ('helena',  'LIS', '2022-09-12', NULL,         true),
  ('paulo',   'LIS', '2020-02-03', NULL,         true),
  ('rita',    'POR', '2021-05-17', NULL,         true),
  ('marta',   'LIS', '2023-01-09', NULL,         true),
  ('diogo',   'SET', '2024-04-15', NULL,         true),
  ('diogo',   'LIS', '2024-04-16', NULL,         true),
  ('ines',    'POR', '2026-02-02', '2026-09-13', false),
  ('ines',    'LIS', '2026-09-14', NULL,         false),
  ('sergio',  'SET', '2025-06-02', NULL,         true),
  ('carla',   'LIS', '2024-10-01', NULL,         true),
  ('andreia', 'POR', '2024-06-03', NULL,         true),
  ('nuno',    'POR', '2026-09-22', NULL,         false),
  ('sofia',   'LIS', '2026-03-02', NULL,         false),
  ('vasco',   'POR', '2025-09-01', '2026-08-31', true),
  ('joana',   'LIS', '2026-11-02', NULL,         false);
DO $trh_b10$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  r        record;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  -- Linha a linha e com as fechadas primeiro: o local por omissao da pessoa sai
  -- sempre da ultima afectacao em aberto inserida (valido_de mais recente).
  FOR r IN SELECT * FROM trh_afect ORDER BY (ate IS NULL), de, chave
  LOOP
    INSERT INTO public.pessoas_afectacoes
      (pessoa_id, organization_id, vinculo_id, local_id, valido_de, valido_ate, motivo,
       origem, confirmada_por, confirmada_em, created_by)
    VALUES
      (pg_temp.trh_pessoa(r.chave), v_org, pg_temp.trh_sid('vinculo', r.chave),
       pg_temp.trh_local(r.cod), r.de, r.ate,
       CASE WHEN r.ate IS NOT NULL THEN 'Afectação já terminada (semente de teste)'
            ELSE 'Afectação em curso (semente de teste)' END,
       'declarada',
       CASE WHEN r.confirmada THEN v_miguel ELSE NULL END,
       CASE WHEN r.confirmada THEN now() ELSE NULL END,
       v_miguel);
  END LOOP;
END;
$trh_b10$;
-- ==============================================================================
-- B11 -- Horario planeado
--   Padrao semanal (09:00-13:00 e 14:00-18:00, seg a sex), versoes no tempo
--   (Marta a 21/09, Ines a 14/09), dois centros (Diogo), repartido com folgas
--   explicitas (Carla), parcial (Andreia), estagio (Sofia), regras fechada
--   (Vasco) e futura (Joana). Teresa tem isencao de horario: nao tem linhas.
--   Feriado de 2026-10-05: excepcao nao_trabalha para quem folga e uma excepcao
--   de manha para o Paulo, que o trabalha.
--   O UNICO trigger desligado e o da janela imutavel, so durante os INSERT.
-- ==============================================================================
CREATE TEMP TABLE trh_regra (
  chave text NOT NULL, dow int NOT NULL, ord int NOT NULL, ini time, fim time, cod text,
  de date NOT NULL, ate date, folga boolean NOT NULL, vez text NOT NULL
);
CREATE FUNCTION pg_temp.trh_regra_add(
  p_chave text, p_dows int[], p_cod text,
  p_ini1 time, p_fim1 time, p_ini2 time, p_fim2 time,
  p_de date, p_ate date, p_vez text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d int;
BEGIN
  FOREACH d IN ARRAY p_dows LOOP
    INSERT INTO pg_temp.trh_regra VALUES (p_chave, d, 1, p_ini1, p_fim1, p_cod, p_de, p_ate, false, p_vez);
    IF p_ini2 IS NOT NULL THEN
      INSERT INTO pg_temp.trh_regra VALUES (p_chave, d, 2, p_ini2, p_fim2, p_cod, p_de, p_ate, false, p_vez);
    END IF;
  END LOOP;
END $$;
SELECT pg_temp.trh_regra_add('helena',  ARRAY[1,2,3,4,5], 'LIS', '09:00','13:00','14:00','18:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('paulo',   ARRAY[1,2,3,4,5], 'LIS', '09:00','13:00','14:00','18:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('rita',    ARRAY[1,2,3,4,5], 'POR', '09:00','13:00','14:00','18:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('marta',   ARRAY[1,2,3,4,5], 'LIS', '09:00','13:00','14:00','18:00', '2026-08-10', '2026-09-20', 'v1');
SELECT pg_temp.trh_regra_add('marta',   ARRAY[1,2,3,4,5], 'LIS', '08:30','12:30','13:30','17:30', '2026-09-21', NULL, 'v2');
SELECT pg_temp.trh_regra_add('diogo',   ARRAY[1,2,3],     'LIS', '09:00','13:00','14:00','18:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('diogo',   ARRAY[4,5],       'SET', '09:00','13:00','14:00','18:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('ines',    ARRAY[1,2,3,4,5], 'POR', '09:00','13:00','14:00','18:00', '2026-08-10', '2026-09-13', 'v1');
SELECT pg_temp.trh_regra_add('ines',    ARRAY[1,2,3,4,5], 'LIS', '09:00','13:00','14:00','18:00', '2026-09-14', NULL, 'v2');
SELECT pg_temp.trh_regra_add('sergio',  ARRAY[1,2,3,4,5], 'SET', '08:00','12:00','13:00','17:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('carla',   ARRAY[2,3,4,5,6], 'LIS', '10:00','14:00','15:00','19:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('andreia', ARRAY[1,2,3,4,5], 'POR', '09:00','13:00', NULL, NULL,      '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('nuno',    ARRAY[1,2,3,4,5], 'POR', '09:00','13:00','14:00','18:00', '2026-09-22', NULL, 'v1');
SELECT pg_temp.trh_regra_add('sofia',   ARRAY[1,2,3,4,5], 'LIS', '09:00','13:00','14:00','16:00', '2026-08-10', NULL, 'v1');
SELECT pg_temp.trh_regra_add('vasco',   ARRAY[1,2,3,4,5], 'POR', '09:00','13:00','14:00','18:00', '2026-08-10', '2026-08-31', 'v1');
SELECT pg_temp.trh_regra_add('joana',   ARRAY[1,2,3,4,5], 'LIS', '09:00','13:00','14:00','18:00', '2026-11-02', NULL, 'v1');
-- Carla: dias de descanso explicitos (segunda e domingo).
INSERT INTO trh_regra (chave, dow, ord, ini, fim, cod, de, ate, folga, vez) VALUES
  ('carla', 1, 1, NULL, NULL, NULL, '2026-08-10', NULL, true, 'v1'),
  ('carla', 0, 1, NULL, NULL, NULL, '2026-08-10', NULL, true, 'v1');
DO $trh_b11$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  v_dono   boolean;
  v_n      integer;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  -- Quem corre a migration tem de poder desligar o trigger (dono da tabela).
  SELECT pg_has_role(current_user, c.relowner, 'USAGE') INTO v_dono
    FROM pg_class c WHERE c.oid = 'public.pessoas_horario_planeado'::regclass;
  IF NOT coalesce(v_dono, false) THEN
    RAISE EXCEPTION 'B11: % nao e o dono de pessoas_horario_planeado; nao pode desligar o trigger da janela imutavel.', current_user;
  END IF;

  ALTER TABLE public.pessoas_horario_planeado DISABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

  -- Regras recorrentes
  INSERT INTO public.pessoas_horario_planeado
    (id, pessoa_id, organization_id, vinculo_id, local_id, dia_semana, hora_inicio, hora_fim,
     nao_trabalha, ordem, valido_de, valido_ate, notas, created_by)
  SELECT pg_temp.trh_sid('plan', r.chave || '|' || r.dow || '|' || r.ord || '|' || r.vez),
         pg_temp.trh_pessoa(r.chave), v_org, pg_temp.trh_sid('vinculo', r.chave),
         CASE WHEN r.folga THEN NULL ELSE pg_temp.trh_local(r.cod) END,
         r.dow::smallint, r.ini, r.fim, r.folga, r.ord::smallint, r.de, r.ate,
         CASE WHEN r.folga THEN 'Dia de descanso' ELSE NULL END, v_miguel
    FROM trh_regra r;

  -- Excepcao do feriado de 2026-10-05 para quem nao o trabalha (9 pessoas).
  INSERT INTO public.pessoas_horario_planeado
    (id, pessoa_id, organization_id, vinculo_id, local_id, data, hora_inicio, hora_fim,
     nao_trabalha, ordem, notas, created_by)
  SELECT pg_temp.trh_sid('plan', c.chave || '|ex|2026-10-05'),
         pg_temp.trh_pessoa(c.chave), v_org, pg_temp.trh_sid('vinculo', c.chave),
         NULL, DATE '2026-10-05', NULL, NULL, true, 1,
         'Feriado nacional (5 de Outubro): não trabalha', v_miguel
    FROM (VALUES ('helena'),('rita'),('marta'),('diogo'),('ines'),('sergio'),('andreia'),('nuno'),('sofia')) AS c(chave);

  -- Paulo trabalha o feriado, so de manha.
  INSERT INTO public.pessoas_horario_planeado
    (id, pessoa_id, organization_id, vinculo_id, local_id, data, hora_inicio, hora_fim,
     nao_trabalha, ordem, notas, created_by)
  VALUES
    (pg_temp.trh_sid('plan', 'paulo|ex|2026-10-05'), pg_temp.trh_pessoa('paulo'), v_org,
     pg_temp.trh_sid('vinculo', 'paulo'), pg_temp.trh_local('LIS'), DATE '2026-10-05',
     TIME '09:00', TIME '13:00', false, 1,
     'Feriado nacional trabalhado, só de manhã', v_miguel);

  ALTER TABLE public.pessoas_horario_planeado ENABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

  -- Confirmacao no proprio bloco: o trigger ficou activo (tgenabled = 'O').
  SELECT count(*) INTO v_n
    FROM pg_trigger
   WHERE tgrelid = 'public.pessoas_horario_planeado'::regclass
     AND tgname = 'trg_pessoas_horario_planeado_janela_imutavel'
     AND tgenabled = 'O';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'B11: o trigger trg_pessoas_horario_planeado_janela_imutavel nao ficou reactivado.';
  END IF;
END;
$trh_b11$;
-- ==============================================================================
-- B12 -- Direitos de ferias (14) e ajustes (2)
--   22 dias no ano civil para quem ja tinha ano completo; para quem entrou em 2026
--   o calculo proporcional da propria base (hr_ausencias_calcular_direito_admissao).
-- ==============================================================================
DO $trh_b12$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  v_ferias uuid;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  SELECT t.id INTO v_ferias
    FROM public.hr_ausencias_tipos t
   WHERE t.organization_id = v_org AND upper(t.codigo) = 'FERIAS' AND t.deleted_at IS NULL
   ORDER BY t.created_at LIMIT 1;
  IF v_ferias IS NULL THEN
    RAISE EXCEPTION 'B12: nao ha tipo FERIAS na nike.';
  END IF;

  -- Quem ja tinha o ano completo: 22 dias.
  INSERT INTO public.pessoas_ausencias_direitos
    (pessoa_id, organization_id, tipo_id, vinculo_id, periodo_inicio, periodo_fim,
     dias_direito, origem, notas, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org, v_ferias, pg_temp.trh_sid('vinculo', p.chave),
         DATE '2026-01-01', DATE '2026-12-31', 22, 'legal',
         'Direito anual (semente de teste)', v_miguel
    FROM trh_p p
   WHERE extract(year FROM p.admissao) < 2026;

  -- Quem entrou em 2026: calculo proporcional da base.
  INSERT INTO public.pessoas_ausencias_direitos
    (pessoa_id, organization_id, tipo_id, vinculo_id, periodo_inicio, periodo_fim,
     dias_direito, origem, disponivel_a_partir_de, prazo_limite_gozo, regra_calculo, notas, created_by)
  SELECT pg_temp.trh_pessoa(p.chave), v_org, v_ferias, pg_temp.trh_sid('vinculo', p.chave),
         d.periodo_inicio, d.periodo_fim, d.dias_direito, 'legal',
         d.disponivel_a_partir_de, d.prazo_limite_gozo, 'admissao_proporcional',
         'Direito do ano de admissão (semente de teste)', v_miguel
    FROM trh_p p
    CROSS JOIN LATERAL public.hr_ausencias_calcular_direito_admissao(p.admissao) d
   WHERE extract(year FROM p.admissao) = 2026;

  -- Ajustes conservadores (o trigger do minimo legal exige >= 20 dias gozaveis).
  INSERT INTO public.pessoas_ausencias_ajustes
    (pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias,
     motivo_codigo, motivo, aplicado_por_anew_user_id)
  VALUES
    (pg_temp.trh_pessoa('helena'), v_org, v_ferias, DATE '2026-01-01', DATE '2026-12-31', 3,
     'transporte_periodo_anterior', 'Três dias de 2025 transitados por acordo', v_miguel),
    (pg_temp.trh_pessoa('diogo'), v_org, v_ferias, DATE '2026-01-01', DATE '2026-12-31', -1,
     'correccao', 'Correcção de um dia gozado a mais em 2025', v_miguel);
END;
$trh_b12$;
-- ==============================================================================
-- B13 -- Faltas e justificacoes (ANTES das ausencias e das picagens)
--   Uma falta nao pode ser marcada sobre ferias ja aprovadas, nem cruzar horas
--   realizadas; por isso entram primeiro. A falta de dia completo da Rita (16/09)
--   fica depois coberta pelas ferias de 14 a 18/09: desvio falta_coberta_por_ausencia.
--   8 faltas: 7 activas e 1 anulada. Justificacao: 3 justificadas, 1 recusada,
--   1 pendente de documento e 3 sem justificacao (uma delas a anulada).
-- ==============================================================================
CREATE TEMP TABLE trh_falta (
  k text PRIMARY KEY, chave text NOT NULL, data date NOT NULL, ini time NOT NULL, fim time NOT NULL,
  motivo text NOT NULL, just text NOT NULL, remunerada boolean NOT NULL, cod text NOT NULL,
  just_motivo text, anulada boolean NOT NULL DEFAULT false
);
INSERT INTO trh_falta (k, chave, data, ini, fim, motivo, just, remunerada, cod, just_motivo, anulada) VALUES
  ('ines-0819',   'ines',   '2026-08-19', '09:00', '09:25', 'atraso',                  'justificada',        false, 'POR', NULL, false),
  ('marta-0915',  'marta',  '2026-09-15', '09:00', '11:00', 'doenca',                  'justificada',        false, 'LIS', NULL, false),
  ('sergio-0910', 'sergio', '2026-09-10', '08:00', '17:00', 'ausencia_nao_comunicada', 'sem_justificacao',   false, 'SET', NULL, false),
  ('diogo-0929',  'diogo',  '2026-09-29', '09:00', '18:00', 'doenca',                  'pendente_documento', false, 'LIS', NULL, false),
  ('ines-0917',   'ines',   '2026-09-17', '14:00', '18:00', 'assuntos_pessoais',       'recusada',           false, 'LIS',
   'O assunto indicado não justifica a ausência neste horário.', false),
  ('rita-0923',   'rita',   '2026-09-23', '14:00', '18:00', 'formacao',                'justificada',        true,  'POR', NULL, false),
  ('helena-0901', 'helena', '2026-09-01', '09:00', '09:30', 'atraso',                  'sem_justificacao',   false, 'LIS', NULL, true),
  ('rita-0916',   'rita',   '2026-09-16', '09:00', '18:00', 'assuntos_pessoais',       'sem_justificacao',   false, 'POR', NULL, false);
DO $trh_b13$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  INSERT INTO public.pessoas_faltas
    (id, pessoa_id, organization_id, data, vinculo_id, local_id, hora_inicio, hora_fim,
     motivo_codigo, justificacao_estado, remunerada, desconta_saldo,
     justificacao_decidida_por, justificacao_decidida_em, justificacao_motivo,
     estado, anulado_em, anulado_por_anew_user_id, anulacao_motivo, created_by)
  SELECT pg_temp.trh_sid('falta', f.k), pg_temp.trh_pessoa(f.chave), v_org, f.data,
         pg_temp.trh_sid('vinculo', f.chave), pg_temp.trh_local(f.cod), f.ini, f.fim,
         f.motivo, f.just, f.remunerada, false,
         CASE WHEN f.just IN ('justificada','recusada') THEN v_miguel ELSE NULL END,
         CASE WHEN f.just IN ('justificada','recusada') THEN now() ELSE NULL END,
         f.just_motivo,
         CASE WHEN f.anulada THEN 'anulada' ELSE 'activa' END,
         CASE WHEN f.anulada THEN now() ELSE NULL END,
         CASE WHEN f.anulada THEN v_miguel ELSE NULL END,
         CASE WHEN f.anulada THEN 'Registada por engano: a entrada foi às 08:57.' ELSE NULL END,
         v_miguel
    FROM trh_falta f;

  -- Justificacoes (3). Sem ficheiros: so referencia e texto.
  INSERT INTO public.pessoas_faltas_justificacoes
    (falta_id, pessoa_id, organization_id, tipo_documento, documento_ref, entidade_emissora,
     data_documento, texto, created_by)
  VALUES
    (pg_temp.trh_sid('falta', 'ines-0819'), pg_temp.trh_pessoa('ines'), v_org,
     'declaracao_propria', NULL, NULL, DATE '2026-08-19',
     'Atraso da linha de comboio nessa manhã.', v_miguel),
    (pg_temp.trh_sid('falta', 'marta-0915'), pg_temp.trh_pessoa('marta'), v_org,
     'declaracao_medica', 'DM-2026-0915', 'Clínica Fictícia de Teste', DATE '2026-09-15', NULL, v_miguel),
    (pg_temp.trh_sid('falta', 'rita-0923'), pg_temp.trh_pessoa('rita'), v_org,
     'convocatoria', 'CONV-FORM-2026-09', 'Entidade Formadora Fictícia', DATE '2026-09-10', NULL, v_miguel);
END;
$trh_b13$;
-- ==============================================================================
-- B14 -- Pedidos de ausencia, dias, decisoes e justificacao
--   rpc_hr_ausencia_pedir exige auth.uid(); aqui replica-se a mesma logica em SQL
--   (versao de 20261207021700): dias sem fins de semana nem feriados, periodo do
--   direito que contem o primeiro dia, snapshot da chefia, estado final directo
--   (o trigger de transicao so actua em UPDATE OF estado).
--   14 pedidos: 8 aprovados, 1 recusado, 1 cancelado, 3 pendentes de chefia e 1
--   pendente de RH. Decisoes: 20.
-- ==============================================================================
CREATE TEMP TABLE trh_ped (
  k text PRIMARY KEY, chave text NOT NULL, tipo text NOT NULL, ini date NOT NULL, fim date NOT NULL,
  mi boolean NOT NULL DEFAULT false, mf boolean NOT NULL DEFAULT false,
  estado text NOT NULL, motivo text, dec text NOT NULL, dec_motivo text
);
INSERT INTO trh_ped (k, chave, tipo, ini, fim, mi, mf, estado, motivo, dec, dec_motivo) VALUES
  ('marta-ago',  'marta',  'FERIAS',           '2026-08-17', '2026-08-21', false, false, 'aprovado',        'Férias de Verão', 'A2', NULL),
  ('diogo-set',  'diogo',  'FERIAS',           '2026-08-31', '2026-09-04', false, false, 'aprovado',        'Férias de Verão', 'A2', NULL),
  ('helena-ago', 'helena', 'FERIAS',           '2026-08-24', '2026-08-28', false, false, 'aprovado',        'Férias de Verão', 'A2', NULL),
  ('rita-set',   'rita',   'FERIAS',           '2026-09-14', '2026-09-18', false, false, 'aprovado',        'Semana de férias', 'A2', NULL),
  ('sergio-set', 'sergio', 'FERIAS',           '2026-09-14', '2026-09-18', false, false, 'recusado',        'Semana de férias', 'R1',
   'A equipa do armazém já está reduzida nessa semana.'),
  ('sergio-out', 'sergio', 'FERIAS',           '2026-10-12', '2026-10-16', false, false, 'aprovado',        'Semana de férias', 'A2', NULL),
  ('helena-out', 'helena', 'FERIAS',           '2026-10-19', '2026-10-23', false, false, 'cancelado',       'Semana de férias (cancelada)', 'A2', NULL),
  ('ines-nov',   'ines',   'FERIAS',           '2026-11-23', '2026-11-27', false, false, 'pendente_chefia', 'Semana de férias', 'N',  NULL),
  ('marta-dez',  'marta',  'FERIAS',           '2026-12-21', '2026-12-31', false, false, 'pendente_chefia', 'Férias de Natal', 'N',  NULL),
  ('carla-nov',  'carla',  'FERIAS',           '2026-11-10', '2026-11-14', false, false, 'pendente_rh',     'Semana de férias', 'C1', NULL),
  ('nuno-dez',   'nuno',   'FERIAS',           '2026-12-14', '2026-12-18', false, false, 'pendente_chefia', 'Semana de férias (a chefia directa não tem conta)', 'N', NULL),
  ('carla-baixa','carla',  'BAIXA_MEDICA',     '2026-09-02', '2026-09-04', false, false, 'aprovado',        NULL, 'D2', NULL),
  ('paulo-fam',  'paulo',  'ASSIST_FAMILIA',   '2026-09-24', '2026-09-24', true,  false, 'aprovado',        'Acompanhar familiar a uma consulta (trabalha de tarde)', 'A2', NULL),
  ('andreia-par','andreia','LICENCA_PARENTAL', '2026-09-21', '2026-12-18', false, false, 'aprovado',        NULL, 'D2', NULL);
-- Dias contaveis de um pedido (mesma expansao da RPC).
CREATE FUNCTION pg_temp.trh_dias_pedido(
  p_org uuid, p_tipo uuid, p_ini date, p_fim date, p_mi boolean, p_mf boolean
) RETURNS TABLE (data date, fraccao numeric, feriado boolean, fim_semana boolean)
LANGUAGE sql STABLE AS $$
  SELECT g.d,
         (CASE WHEN g.d = p_ini AND p_mi THEN 0.50
               WHEN g.d = p_fim AND p_mf THEN 0.50
               ELSE 1.00 END)::numeric(3,2),
         h.f, w.f
    FROM (SELECT x::date AS d FROM generate_series(p_ini, p_fim, interval '1 day') x) g
    JOIN public.hr_ausencias_tipos t ON t.id = p_tipo AND t.organization_id = p_org
   CROSS JOIN LATERAL (
     SELECT EXISTS (
       SELECT 1 FROM public.schedule_holidays sh
        WHERE sh.organization_id = p_org
          AND ((coalesce(sh.is_recurring, false) = false AND sh.holiday_date = g.d)
               OR (coalesce(sh.is_recurring, false) = true
                   AND to_char(sh.holiday_date, 'MM-DD') = to_char(g.d, 'MM-DD')))
     ) AS f
   ) h
   CROSS JOIN LATERAL (SELECT extract(isodow FROM g.d) IN (6, 7) AS f) w
   WHERE NOT ((w.f AND NOT t.inclui_fim_de_semana) OR (h.f AND NOT t.inclui_feriados))
$$;
-- Inicio do periodo de saldo que contem uma data (direito registado, ou ano civil).
CREATE FUNCTION pg_temp.trh_periodo_ini(p_pessoa uuid, p_tipo uuid, p_data date) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT d.periodo_inicio FROM public.pessoas_ausencias_direitos d
      WHERE d.pessoa_id = p_pessoa AND d.tipo_id = p_tipo AND d.deleted_at IS NULL
        AND p_data BETWEEN d.periodo_inicio AND d.periodo_fim
      ORDER BY d.periodo_inicio DESC LIMIT 1),
    date_trunc('year', p_data)::date)
$$;
CREATE FUNCTION pg_temp.trh_periodo_fim(p_pessoa uuid, p_tipo uuid, p_data date) RETURNS date
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT d.periodo_fim FROM public.pessoas_ausencias_direitos d
      WHERE d.pessoa_id = p_pessoa AND d.tipo_id = p_tipo AND d.deleted_at IS NULL
        AND p_data BETWEEN d.periodo_inicio AND d.periodo_fim
      ORDER BY d.periodo_inicio DESC LIMIT 1),
    (date_trunc('year', p_data) + interval '1 year - 1 day')::date)
$$;
DO $trh_b14$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  r        record;
  v_tipo   uuid;
  v_pessoa uuid;
  v_dias   numeric(6,2);
  v_aprov  uuid;
  v_chefe  text;
  v_chefe_user uuid;
  v_chefe_pessoa uuid;
  v_desconta boolean;
  v_estado_dia text;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  FOR r IN SELECT * FROM trh_ped ORDER BY k
  LOOP
    SELECT t.id, t.desconta_saldo INTO v_tipo, v_desconta
      FROM public.hr_ausencias_tipos t
     WHERE t.organization_id = v_org AND upper(t.codigo) = r.tipo AND t.deleted_at IS NULL
     ORDER BY t.created_at LIMIT 1;
    IF v_tipo IS NULL THEN
      RAISE EXCEPTION 'B14: tipo de ausencia % nao existe na nike.', r.tipo;
    END IF;

    v_pessoa := pg_temp.trh_pessoa(r.chave);
    v_aprov  := public.hr_ausencias_aprovador_chefia(v_pessoa, v_org);

    SELECT coalesce(sum(d.fraccao), 0) INTO v_dias
      FROM pg_temp.trh_dias_pedido(v_org, v_tipo, r.ini, r.fim, r.mi, r.mf) d;
    IF v_dias <= 0 THEN
      RAISE EXCEPTION 'B14: o pedido % nao tem nenhum dia contavel.', r.k;
    END IF;

    INSERT INTO public.pessoas_ausencias_pedidos
      (id, organization_id, pessoa_id, tipo_id, vinculo_id, data_inicio, data_fim,
       meio_dia_inicio, meio_dia_fim, dias_solicitados, motivo, estado,
       aprovador_chefia_pessoa_id, origem, periodo_inicio, periodo_fim, created_by)
    VALUES
      (pg_temp.trh_sid('pedido', r.k), v_org, v_pessoa, v_tipo, pg_temp.trh_sid('vinculo', r.chave),
       r.ini, r.fim, r.mi, r.mf, v_dias, r.motivo, r.estado,
       v_aprov, 'importacao',
       pg_temp.trh_periodo_ini(v_pessoa, v_tipo, r.ini), pg_temp.trh_periodo_fim(v_pessoa, v_tipo, r.ini),
       v_miguel);

    v_estado_dia := CASE r.estado
      WHEN 'aprovado'  THEN 'aprovado'
      WHEN 'recusado'  THEN 'recusado'
      WHEN 'cancelado' THEN 'cancelado'
      ELSE 'pendente' END;

    INSERT INTO public.pessoas_ausencias_dias
      (pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia, conta_saldo,
       e_feriado, e_fim_semana, periodo_inicio, estado)
    SELECT pg_temp.trh_sid('pedido', r.k), v_pessoa, v_org, v_tipo, d.data, d.fraccao, v_desconta,
           d.feriado, d.fim_semana, pg_temp.trh_periodo_ini(v_pessoa, v_tipo, d.data), v_estado_dia
      FROM pg_temp.trh_dias_pedido(v_org, v_tipo, r.ini, r.fim, r.mi, r.mf) d;

    -- Decisoes: o que a RPC escreveria. A chefia directa decide pela propria conta
    -- (e ficha) se a tiver. Senao e uma decisao CARREGADA PELA SEMENTE: decidido_por_anew_user_id
    -- do Miguel e decidido_por_pessoa_id NULL, para nao atribuir a decisao a quem nao a tomou
    -- (a coluna da ficha e nullable; o CHECK autor_obrigatorio so exige o anew_user).
    SELECT p.reporta INTO v_chefe FROM trh_p p WHERE p.chave = r.chave;
    SELECT CASE WHEN EXISTS (SELECT 1 FROM trh_conta c WHERE c.chave = v_chefe)
                THEN pg_temp.trh_sid('anew_user', v_chefe) ELSE v_miguel END,
           CASE WHEN EXISTS (SELECT 1 FROM trh_conta c WHERE c.chave = v_chefe)
                THEN pg_temp.trh_pessoa(v_chefe) ELSE NULL END
      INTO v_chefe_user, v_chefe_pessoa;

    IF r.dec = 'A2' THEN
      INSERT INTO public.pessoas_ausencias_pedido_decisoes
        (pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
         decidido_por_anew_user_id, decidido_por_pessoa_id, motivo)
      VALUES
        (pg_temp.trh_sid('pedido', r.k), v_pessoa, v_org, 1, 'chefia', 'aprovado',
         v_chefe_user, v_chefe_pessoa, NULL),
        (pg_temp.trh_sid('pedido', r.k), v_pessoa, v_org, 1, 'rh', 'aprovado',
         v_miguel, NULL, NULL);
    ELSIF r.dec = 'R1' THEN
      INSERT INTO public.pessoas_ausencias_pedido_decisoes
        (pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
         decidido_por_anew_user_id, decidido_por_pessoa_id, motivo)
      VALUES
        (pg_temp.trh_sid('pedido', r.k), v_pessoa, v_org, 1, 'chefia', 'recusado',
         v_chefe_user, v_chefe_pessoa, r.dec_motivo);
    ELSIF r.dec = 'C1' THEN
      INSERT INTO public.pessoas_ausencias_pedido_decisoes
        (pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
         decidido_por_anew_user_id, decidido_por_pessoa_id, motivo)
      VALUES
        (pg_temp.trh_sid('pedido', r.k), v_pessoa, v_org, 1, 'chefia', 'aprovado',
         v_chefe_user, v_chefe_pessoa, NULL);
    ELSIF r.dec = 'D2' THEN
      INSERT INTO public.pessoas_ausencias_pedido_decisoes
        (pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo)
      VALUES
        (pg_temp.trh_sid('pedido', r.k), v_pessoa, v_org, 1, 'chefia', 'dispensado',
         'o tipo nao exige aprovacao de chefia'),
        (pg_temp.trh_sid('pedido', r.k), v_pessoa, v_org, 1, 'rh', 'dispensado',
         'o tipo nao exige aprovacao de RH');
    END IF;
  END LOOP;

  -- Justificacao da baixa da Carla (atestado, referencia e entidade ficticias).
  INSERT INTO public.pessoas_ausencias_justificacoes
    (pedido_id, pessoa_id, organization_id, tipo_documento, documento_ref, entidade_emissora, data_documento)
  VALUES
    (pg_temp.trh_sid('pedido', 'carla-baixa'), pg_temp.trh_pessoa('carla'), v_org,
     'atestado_medico', 'ATM-2026-0902', 'Centro de Saúde Fictício de Teste', DATE '2026-09-02');
END;
$trh_b14$;
-- ==============================================================================
-- B15 -- Picagens, consolidacao, correccao, anulacao, realizado manual e validacao
--   Janela fixa: segunda 2026-08-10 a segunda 2026-10-05.
--   Base: para cada bloco planeado de cada dia util, entrada ate 7 minutos ANTES
--   do inicio e saida ate 7 minutos DEPOIS do fim (deterministico, por hashtext),
--   de modo a nao inventar desvios que ninguem pediu. Pessoas com conta: origem
--   web/app; sem conta: importacao. Sem picagens em dias de ausencia aprovada de
--   dia inteiro. Os casos de teste sao ajustes explicitos (tabela trh_ajuste).
-- ==============================================================================
CREATE TEMP TABLE trh_ajuste (
  chave text NOT NULL, data date NOT NULL, ord int NOT NULL,
  skip_in boolean NOT NULL DEFAULT false, skip_out boolean NOT NULL DEFAULT false,
  ent time, sai time, origem_in text, rh_in boolean NOT NULL DEFAULT false,
  PRIMARY KEY (chave, data, ord)
);
INSERT INTO trh_ajuste (chave, data, ord, skip_in, skip_out, ent, sai, origem_in, rh_in) VALUES
  -- Atraso nao registado (Diogo, 12/08): entrada as 09:35
  ('diogo',  '2026-08-12', 1, false, false, '09:35', NULL, NULL, false),
  -- Atraso com falta justificada (Ines, 19/08): entrada as 09:25
  ('ines',   '2026-08-19', 1, false, false, '09:25', NULL, NULL, false),
  -- Almoco nao picado (Marta, 26/08): so 09:02 a 18:03
  ('marta',  '2026-08-26', 1, false, true,  '09:02', NULL, NULL, false),
  ('marta',  '2026-08-26', 2, true,  false, NULL,    '18:03', NULL, false),
  -- Saida antecipada (Paulo, 04/09): saida as 16:30
  ('paulo',  '2026-09-04', 2, false, false, NULL,    '16:30', NULL, false),
  -- Entrada sem saida (Helena, 08/09): entrada das 14:00 sem saida
  ('helena', '2026-09-08', 2, false, true,  '14:00', NULL, NULL, false),
  -- Hora extra (Diogo, 10/09): saida as 20:15
  ('diogo',  '2026-09-10', 2, false, false, NULL,    '20:15', NULL, false),
  -- Hora extra nocturna (Sergio, 17/09): saida as 23:10
  ('sergio', '2026-09-17', 2, false, false, NULL,    '23:10', NULL, false),
  -- Falta completa registada (Sergio, 10/09): sem picagens
  ('sergio', '2026-09-10', 1, true,  true,  NULL, NULL, NULL, false),
  ('sergio', '2026-09-10', 2, true,  true,  NULL, NULL, NULL, false),
  -- Falta completa nao registada (Carla, sabado 29/08): sem picagens e sem falta
  ('carla',  '2026-08-29', 1, true,  true,  NULL, NULL, NULL, false),
  ('carla',  '2026-08-29', 2, true,  true,  NULL, NULL, NULL, false),
  -- Falta justificada parcial (Marta, 15/09): falta 09:00-11:00, entrada as 11:00
  ('marta',  '2026-09-15', 1, false, false, '11:00', NULL, NULL, false),
  -- Falta pendente de documento (Diogo, 29/09): dia completo
  ('diogo',  '2026-09-29', 1, true,  true,  NULL, NULL, NULL, false),
  ('diogo',  '2026-09-29', 2, true,  true,  NULL, NULL, NULL, false),
  -- Falta recusada (Ines, 17/09): so de manha
  ('ines',   '2026-09-17', 2, true,  true,  NULL, NULL, NULL, false),
  -- Falta por formacao (Rita, 23/09): so de manha
  ('rita',   '2026-09-23', 2, true,  true,  NULL, NULL, NULL, false),
  -- Meio dia de assistencia a familia (Paulo, 24/09): trabalha so de tarde
  ('paulo',  '2026-09-24', 1, true,  true,  NULL, NULL, NULL, false),
  -- Picagem corrigida (Andreia, 09/09): a saida da manha e lancada a mao (ver abaixo)
  ('andreia','2026-09-09', 1, false, true,  NULL, NULL, NULL, false),
  -- Picagem duplicada (Ines, 22/09): entrada 09:01 (a segunda, 09:02, e anulada abaixo)
  ('ines',   '2026-09-22', 1, false, false, '09:01', NULL, NULL, false),
  -- Picagem esquecida lancada por RH (Sofia, 24/09): entrada das 09:00 por manual_rh
  ('sofia',  '2026-09-24', 1, false, false, '09:00', NULL, 'manual_rh', true),
  -- Realizado manual (Sergio, 23/09): sem picagens, lancado a mao abaixo
  ('sergio', '2026-09-23', 1, true,  true,  NULL, NULL, NULL, false),
  ('sergio', '2026-09-23', 2, true,  true,  NULL, NULL, NULL, false);
-- B15a: picagens de base
DO $trh_b15a$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  v_tz     text;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  SELECT coalesce(nullif(btrim(s.timezone), ''), 'Europe/Lisbon') INTO v_tz
    FROM public.schedule_settings s WHERE s.organization_id = v_org LIMIT 1;
  v_tz := coalesce(v_tz, 'Europe/Lisbon');

  INSERT INTO public.pessoas_picagens
    (id, pessoa_id, organization_id, momento, data_local, hora_local, sentido,
     local_id, vinculo_id, planeado_id, origem, estado,
     registado_por_anew_user_id, created_by)
  WITH dias AS (
    SELECT x::date AS d
      FROM generate_series(DATE '2026-08-10', DATE '2026-10-05', interval '1 day') x
  ),
  alvo AS (
    SELECT p.chave, p.conta, pg_temp.trh_pessoa(p.chave) AS pessoa_id FROM trh_p p
  ),
  blocos AS (
    SELECT a.chave, a.conta, a.pessoa_id, di.d, hp.id AS planeado_id, hp.ordem::int AS ord,
           hp.hora_inicio AS ini, hp.hora_fim AS fim, hp.local_id
      FROM alvo a
      JOIN public.pessoas_horario_planeado hp ON hp.pessoa_id = a.pessoa_id
      JOIN dias di ON di.d = hp.data
     WHERE hp.deleted_at IS NULL AND hp.nao_trabalha = false
       AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL
    UNION ALL
    SELECT a.chave, a.conta, a.pessoa_id, di.d, hp.id, hp.ordem::int,
           hp.hora_inicio, hp.hora_fim, hp.local_id
      FROM alvo a
      JOIN public.pessoas_horario_planeado hp ON hp.pessoa_id = a.pessoa_id
      JOIN dias di ON hp.dia_semana = extract(dow FROM di.d)::smallint
     WHERE hp.deleted_at IS NULL AND hp.nao_trabalha = false AND hp.data IS NULL
       AND hp.hora_inicio IS NOT NULL AND hp.hora_fim IS NOT NULL
       AND (hp.valido_de IS NULL OR di.d >= hp.valido_de)
       AND (hp.valido_ate IS NULL OR di.d <= hp.valido_ate)
       AND NOT EXISTS (
         SELECT 1 FROM public.pessoas_horario_planeado ex
          WHERE ex.pessoa_id = hp.pessoa_id AND ex.data = di.d AND ex.deleted_at IS NULL
       )
  ),
  uteis AS (
    SELECT b.* FROM blocos b
     WHERE NOT EXISTS (
       SELECT 1 FROM public.pessoas_ausencias_dias ad
        WHERE ad.pessoa_id = b.pessoa_id AND ad.data = b.d
          AND ad.estado = 'aprovado' AND ad.fraccao_dia >= 1.00
     )
  ),
  eventos AS (
    SELECT u.*,
           coalesce(aj.skip_in, false)  AS skip_in,
           coalesce(aj.skip_out, false) AS skip_out,
           aj.ent, aj.sai, aj.origem_in, coalesce(aj.rh_in, false) AS rh_in,
           CASE WHEN u.conta
                THEN CASE WHEN abs(hashtext(u.chave || u.d::text)::bigint) % 2 = 0 THEN 'web' ELSE 'app' END
                ELSE 'importacao' END AS origem_base,
           (abs(hashtext(u.chave || u.d::text || u.ord::text || 'i')::bigint) % 8)::int AS dev_in,
           (abs(hashtext(u.chave || u.d::text || u.ord::text || 'o')::bigint) % 8)::int AS dev_out
      FROM uteis u
      LEFT JOIN trh_ajuste aj ON aj.chave = u.chave AND aj.data = u.d AND aj.ord = u.ord
  ),
  picagens AS (
    SELECT pg_temp.trh_sid('pic', e.chave || '|' || e.d::text || '|' || e.ord::text || '|e') AS id,
           e.pessoa_id, e.chave, e.d, 'entrada'::text AS sentido,
           coalesce(e.ent, e.ini - make_interval(mins => e.dev_in)) AS hora,
           e.local_id, e.planeado_id,
           coalesce(e.origem_in, e.origem_base) AS origem, e.rh_in AS rh
      FROM eventos e WHERE NOT e.skip_in
    UNION ALL
    SELECT pg_temp.trh_sid('pic', e.chave || '|' || e.d::text || '|' || e.ord::text || '|s'),
           e.pessoa_id, e.chave, e.d, 'saida',
           coalesce(e.sai, e.fim + make_interval(mins => e.dev_out)),
           e.local_id, e.planeado_id, e.origem_base, false
      FROM eventos e WHERE NOT e.skip_out
  )
  SELECT x.id, x.pessoa_id, v_org, ((x.d + x.hora)::timestamp AT TIME ZONE v_tz), x.d, x.hora,
         x.sentido, x.local_id, pg_temp.trh_sid('vinculo', x.chave), x.planeado_id, x.origem, 'valida',
         CASE WHEN x.rh THEN v_miguel ELSE NULL END,
         CASE WHEN x.rh THEN v_miguel ELSE NULL END
    FROM picagens x;
END;
$trh_b15a$;
-- B15b: casos manuais (correccao, anulacao, descanso trabalhado, realizado manual)
DO $trh_b15b$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  v_tz     text;
  v_plan   uuid;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  SELECT coalesce(nullif(btrim(s.timezone), ''), 'Europe/Lisbon') INTO v_tz
    FROM public.schedule_settings s WHERE s.organization_id = v_org LIMIT 1;
  v_tz := coalesce(v_tz, 'Europe/Lisbon');

  -- 1. Picagem corrigida (Andreia, quarta 09/09): saida lancada as 15:00, corrigida para as 13:00.
  SELECT hp.id INTO v_plan
    FROM public.pessoas_horario_planeado hp
   WHERE hp.pessoa_id = pg_temp.trh_pessoa('andreia') AND hp.dia_semana = 3
     AND hp.ordem = 1 AND hp.deleted_at IS NULL;

  INSERT INTO public.pessoas_picagens
    (id, pessoa_id, organization_id, momento, data_local, hora_local, sentido, local_id, vinculo_id,
     planeado_id, origem, estado, registado_por_anew_user_id, created_by)
  VALUES
    (pg_temp.trh_sid('pic', 'andreia|0909|errada'), pg_temp.trh_pessoa('andreia'), v_org,
     ((DATE '2026-09-09' + TIME '15:00')::timestamp AT TIME ZONE v_tz), DATE '2026-09-09', TIME '15:00',
     'saida', pg_temp.trh_local('POR'), pg_temp.trh_sid('vinculo', 'andreia'), v_plan,
     'manual_rh', 'valida', v_miguel, v_miguel);

  INSERT INTO public.pessoas_picagens
    (id, pessoa_id, organization_id, momento, data_local, hora_local, sentido, local_id, vinculo_id,
     planeado_id, origem, estado, corrige_picagem_id, correccao_tipo, correccao_motivo,
     registado_por_anew_user_id, created_by)
  VALUES
    (pg_temp.trh_sid('pic', 'andreia|0909|certa'), pg_temp.trh_pessoa('andreia'), v_org,
     ((DATE '2026-09-09' + TIME '13:00')::timestamp AT TIME ZONE v_tz), DATE '2026-09-09', TIME '13:00',
     'saida', pg_temp.trh_local('POR'), pg_temp.trh_sid('vinculo', 'andreia'), v_plan,
     'manual_rh', 'valida', pg_temp.trh_sid('pic', 'andreia|0909|errada'), 'hora_errada',
     'Hora de saída lançada por engano (15:00); a saída foi às 13:00.', v_miguel, v_miguel);

  UPDATE public.pessoas_picagens
     SET estado = 'corrigida'
   WHERE id = pg_temp.trh_sid('pic', 'andreia|0909|errada');

  -- 2. Picagem duplicada anulada (Ines, terca 22/09): 09:01 e 09:02, a segunda anulada.
  SELECT hp.id INTO v_plan
    FROM public.pessoas_horario_planeado hp
   WHERE hp.pessoa_id = pg_temp.trh_pessoa('ines') AND hp.dia_semana = 2
     AND hp.ordem = 1 AND hp.deleted_at IS NULL AND hp.valido_de = DATE '2026-09-14';

  INSERT INTO public.pessoas_picagens
    (id, pessoa_id, organization_id, momento, data_local, hora_local, sentido, local_id, vinculo_id,
     planeado_id, origem, estado, created_by)
  VALUES
    (pg_temp.trh_sid('pic', 'ines|0922|duplicada'), pg_temp.trh_pessoa('ines'), v_org,
     ((DATE '2026-09-22' + TIME '09:02')::timestamp AT TIME ZONE v_tz), DATE '2026-09-22', TIME '09:02',
     'entrada', pg_temp.trh_local('LIS'), pg_temp.trh_sid('vinculo', 'ines'), v_plan,
     'web', 'valida', NULL);

  UPDATE public.pessoas_picagens
     SET estado = 'anulada', anulado_em = now(), anulado_por_anew_user_id = v_miguel,
         anulacao_motivo = 'Picagem duplicada (duplo clique no botão de entrada).'
   WHERE id = pg_temp.trh_sid('pic', 'ines|0922|duplicada');

  -- 3. Descanso trabalhado (Sergio, domingo 20/09): 08:00 a 12:00, sem horario planeado.
  INSERT INTO public.pessoas_picagens
    (id, pessoa_id, organization_id, momento, data_local, hora_local, sentido, local_id, vinculo_id,
     planeado_id, origem, estado, registado_por_anew_user_id, created_by)
  VALUES
    (pg_temp.trh_sid('pic', 'sergio|0920|e'), pg_temp.trh_pessoa('sergio'), v_org,
     ((DATE '2026-09-20' + TIME '08:00')::timestamp AT TIME ZONE v_tz), DATE '2026-09-20', TIME '08:00',
     'entrada', pg_temp.trh_local('SET'), pg_temp.trh_sid('vinculo', 'sergio'), NULL,
     'manual_rh', 'valida', v_miguel, v_miguel),
    (pg_temp.trh_sid('pic', 'sergio|0920|s'), pg_temp.trh_pessoa('sergio'), v_org,
     ((DATE '2026-09-20' + TIME '12:00')::timestamp AT TIME ZONE v_tz), DATE '2026-09-20', TIME '12:00',
     'saida', pg_temp.trh_local('SET'), pg_temp.trh_sid('vinculo', 'sergio'), NULL,
     'manual_rh', 'valida', v_miguel, v_miguel);

  -- 4. Realizado manual (Sergio, quarta 23/09): 08:00 a 17:00, origem manual.
  INSERT INTO public.pessoas_horario_realizado
    (pessoa_id, organization_id, vinculo_id, local_id, data, hora_inicio, hora_fim,
     origem, estado, notas, created_by)
  VALUES
    (pg_temp.trh_pessoa('sergio'), v_org, pg_temp.trh_sid('vinculo', 'sergio'), pg_temp.trh_local('SET'),
     DATE '2026-09-23', TIME '08:00', TIME '17:00', 'manual', 'registado',
     'Lançamento manual: o leitor de picagens não funcionou nesse dia.', v_miguel);
END;
$trh_b15b$;
-- B15c: consolidar todos os dias com picagens (emparelha entrada/saida e escreve o realizado)
DO $trh_b15c$
DECLARE
  v_org uuid := pg_temp.trh_org();
  r     record;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  FOR r IN
    SELECT DISTINCT pi.pessoa_id, pi.data_local
      FROM public.pessoas_picagens pi
      JOIN trh_p p ON pg_temp.trh_pessoa(p.chave) = pi.pessoa_id
     WHERE pi.organization_id = v_org
     ORDER BY pi.pessoa_id, pi.data_local
  LOOP
    PERFORM public.hr_picagens_consolidar(r.pessoa_id, v_org, r.data_local);
  END LOOP;
END;
$trh_b15c$;
-- B15d: validar o realizado de 10 a 28/08 (pelo Miguel) e rejeitar uma linha (Vasco, 12/08, tarde).
--   Depois de consolidar tudo; o rejeitado por ultimo (o consolidador ignora rejeitados).
DO $trh_b15d$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  PERFORM set_config('hr_assiduidade.rpc', 'on', true);

  UPDATE public.pessoas_horario_realizado h
     SET estado = 'validado', validado_por = v_miguel, validado_em = now(), updated_by = v_miguel
   WHERE h.organization_id = v_org
     AND h.pessoa_id IN (SELECT pg_temp.trh_pessoa(p.chave) FROM trh_p p)
     AND h.data BETWEEN DATE '2026-08-10' AND DATE '2026-08-28'
     AND h.estado = 'registado' AND h.deleted_at IS NULL
     AND NOT (h.pessoa_id = pg_temp.trh_pessoa('vasco') AND h.data = DATE '2026-08-12'
              AND h.hora_inicio >= TIME '12:00');

  UPDATE public.pessoas_horario_realizado h
     SET estado = 'rejeitado', motivo_rejeicao = 'Horas da tarde não confirmadas pela chefia (picagem suspeita).',
         updated_by = v_miguel
   WHERE h.organization_id = v_org
     AND h.pessoa_id = pg_temp.trh_pessoa('vasco')
     AND h.data = DATE '2026-08-12' AND h.hora_inicio >= TIME '12:00'
     AND h.estado = 'registado' AND h.deleted_at IS NULL;

  PERFORM set_config('hr_assiduidade.rpc', 'off', true);
END;
$trh_b15d$;
-- ==============================================================================
-- B16 -- Horas de obra (4 linhas, uma anulada)
-- ==============================================================================
DO $trh_b16$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  INSERT INTO public.hr_obras_horas
    (pessoa_id, organization_id, data, horas, descricao, registado_por,
     anulado_em, anulado_por, anulado_motivo, created_by)
  VALUES
    (pg_temp.trh_pessoa('diogo'),  v_org, DATE '2026-09-11', 3.50, 'Obra Rua das Flores (teste)',
     v_miguel, NULL, NULL, NULL, v_miguel),
    (pg_temp.trh_pessoa('diogo'),  v_org, DATE '2026-09-18', 2.00, 'Obra Rua das Flores (teste)',
     v_miguel, NULL, NULL, NULL, v_miguel),
    (pg_temp.trh_pessoa('sergio'), v_org, DATE '2026-09-12', 4.00, 'Descarga de camião no cliente (teste)',
     v_miguel, NULL, NULL, NULL, v_miguel),
    (pg_temp.trh_pessoa('sergio'), v_org, DATE '2026-09-19', 1.50, 'Descarga de camião no cliente (teste)',
     v_miguel, now(), v_miguel, 'Lançada na ficha errada.', v_miguel);
END;
$trh_b16$;
-- ==============================================================================
-- B17 -- Modelos, clausulas e documentos emitidos
--   4 modelos, 3 clausulas e 11 documentos. O corpo emitido e o do modelo com as
--   variaveis substituidas pelas funcoes da propria base (hr_documento_variaveis e
--   hr_documento_substituir_variaveis). Os modelos de contrato e de recibo nao
--   usam variaveis de retribuicao, por isso a Joana (contrato futuro, sem
--   retribuicao em vigor hoje) emite sem abortar. Sem ficheiros nem storage.
-- ==============================================================================
CREATE TEMP TABLE trh_modelo (k text PRIMARY KEY, nome text NOT NULL, tipo text NOT NULL, corpo text NOT NULL);
INSERT INTO trh_modelo (k, nome, tipo, corpo) VALUES
  ('contrato', 'Contrato de trabalho', 'contrato',
   '<h1>{{documento_titulo}}</h1><p>Entre <b>{{empresa_nome}}</b> e <b>{{pessoa_nome_completo}}</b>, NIF {{pessoa_nif}}, residente em {{pessoa_morada}}, {{pessoa_codigo_postal}} {{pessoa_localidade}}, é celebrado o presente contrato de trabalho {{vinculo_tipo_contrato}}, com início em {{vinculo_data_inicio}}.</p><p>O trabalhador exerce as funções de {{pessoa_cargo}}, em {{pessoa_local_trabalho}}, com um período normal de trabalho de {{vinculo_horas_semanais}} horas semanais. A retribuição é a prevista para o cargo, nos termos do anexo salarial.</p><p>Emitido em {{documento_data_emissao}}.</p>'),
  ('adenda', 'Adenda de horário de trabalho', 'adenda',
   '<h1>{{documento_titulo}}</h1><p>As partes, <b>{{empresa_nome}}</b> e <b>{{pessoa_nome_completo}}</b>, acordam alterar o horário de trabalho do trabalhador, mantendo as {{vinculo_horas_semanais}} horas semanais, com efeitos a partir de 21 de setembro de 2026.</p><p>Emitida em {{documento_data_emissao}}.</p>'),
  ('declaracao', 'Declaração de vínculo e retribuição', 'declaracao',
   '<h1>{{documento_titulo}}</h1><p>Declara-se que <b>{{pessoa_nome_completo}}</b> ({{pessoa_numero_interno}}) é trabalhador(a) de <b>{{empresa_nome}}</b> desde {{pessoa_data_admissao}}, na função de {{pessoa_cargo}}, com uma retribuição base de {{retribuicao_valor_base}} {{retribuicao_moeda}} ({{retribuicao_periodicidade}}).</p><p>Emitida em {{documento_data_emissao}}.</p>'),
  ('recibo', 'Recibo de fardamento', 'recibo',
   '<h1>{{documento_titulo}}</h1><p><b>{{pessoa_nome_completo}}</b> declara ter recebido de <b>{{empresa_nome}}</b> o fardamento atribuído à função de {{pessoa_cargo}}, comprometendo-se a zelar pela sua conservação.</p><p>Emitido em {{documento_data_emissao}}.</p>');
DO $trh_b17$
DECLARE
  v_miguel uuid := pg_temp.trh_miguel();
  v_org    uuid := pg_temp.trh_org();
  r        record;
  v_corpo  text;
  v_vars   jsonb;
  v_usa    boolean;
BEGIN
  IF pg_temp.trh_ja() THEN RETURN; END IF;

  -- Modelos
  INSERT INTO public.pessoas_documentos_modelos
    (id, organization_id, nome, tipo, corpo_html, variaveis, activo, created_by)
  SELECT pg_temp.trh_sid('modelo', m.k), v_org, m.nome, m.tipo, m.corpo,
         coalesce((SELECT jsonb_agg(DISTINCT lower(x.m[1]))
                     FROM regexp_matches(m.corpo, '\{\{\s*([A-Za-z0-9_]+)\s*\}\}', 'g') AS x(m)),
                  '[]'::jsonb),
         true, v_miguel
    FROM trh_modelo m;

  -- Clausulas
  INSERT INTO public.pessoas_documentos_clausulas (id, organization_id, nome, categoria, corpo_html, activo, created_by)
  VALUES
    (pg_temp.trh_sid('clausula', 'confidencialidade'), v_org, 'Confidencialidade', 'confidencialidade',
     '<p>O trabalhador obriga-se a guardar sigilo sobre toda a informação confidencial da empresa a que tenha acesso, durante e após a vigência do contrato.</p>', true, v_miguel),
    (pg_temp.trh_sid('clausula', 'exclusividade'), v_org, 'Exclusividade', 'exclusividade',
     '<p>Durante a vigência do contrato, o trabalhador não exerce actividade concorrente com a da empresa sem autorização escrita.</p>', true, v_miguel),
    (pg_temp.trh_sid('clausula', 'local'), v_org, 'Local de trabalho', 'local de trabalho',
     '<p>O local de trabalho é o indicado no contrato, podendo ser alterado nos termos da lei.</p>', true, v_miguel);

  -- Documentos emitidos (11)
  FOR r IN
    SELECT * FROM (VALUES
      ('contrato-helena', 'helena', 'contrato',   'Contrato de trabalho - Helena Brandão',   'assinado'),
      ('contrato-paulo',  'paulo',  'contrato',   'Contrato de trabalho - Paulo Nogueira',   'assinado'),
      ('contrato-marta',  'marta',  'contrato',   'Contrato de trabalho - Marta Sequeira',   'assinado'),
      ('contrato-diogo',  'diogo',  'contrato',   'Contrato de trabalho - Diogo Pereira',    'assinado'),
      ('contrato-ines',   'ines',   'contrato',   'Contrato de trabalho - Inês Lourenço',    'assinado'),
      ('contrato-joana',  'joana',  'contrato',   'Contrato de trabalho - Joana Fernandes',  'a_aguardar_assinatura'),
      ('decl-marta',      'marta',  'declaracao', 'Declaração de vínculo - Marta Sequeira',  'a_aguardar_assinatura'),
      ('decl-sofia',      'sofia',  'declaracao', 'Declaração de vínculo - Sofia Antunes',   'rascunho'),
      ('adenda-marta',    'marta',  'adenda',     'Adenda de horário - Marta Sequeira',      'assinado'),
      ('adenda-carla',    'carla',  'adenda',     'Adenda de horário - Carla Monteiro',      'anulado'),
      ('recibo-sergio',   'sergio', 'recibo',     'Recibo de fardamento - Sérgio Matos',     'a_aguardar_assinatura')
    ) AS d(k, chave, modelo, titulo, estado)
  LOOP
    SELECT m.corpo INTO v_corpo FROM trh_modelo m WHERE m.k = r.modelo;
    v_usa := v_corpo ~* '\{\{\s*retribuicao_';
    v_vars := public.hr_documento_variaveis(pg_temp.trh_pessoa(r.chave), v_org, v_usa)
              || jsonb_build_object(
                   'documento_titulo', r.titulo,
                   'documento_tipo', r.modelo,
                   'documento_data_emissao', to_char(current_date, 'DD/MM/YYYY'));
    v_corpo := public.hr_documento_substituir_variaveis(v_corpo, v_vars);

    INSERT INTO public.pessoas_documentos
      (id, pessoa_id, organization_id, vinculo_id, modelo_id, tipo, titulo, corpo_html, estado,
       emitido_em, emitido_por, assinado_em, assinado_por_auth_uid, assinatura_origem,
       anulado_em, anulado_por, anulado_motivo, created_by)
    VALUES
      (pg_temp.trh_sid('documento', r.k), pg_temp.trh_pessoa(r.chave), v_org,
       pg_temp.trh_sid('vinculo', r.chave), pg_temp.trh_sid('modelo', r.modelo),
       r.modelo, r.titulo, v_corpo, r.estado,
       CASE WHEN r.estado = 'rascunho' THEN NULL ELSE now() END,
       CASE WHEN r.estado = 'rascunho' THEN NULL ELSE v_miguel END,
       CASE WHEN r.estado = 'assinado'
            THEN CASE WHEN r.k = 'adenda-marta' THEN TIMESTAMPTZ '2026-09-18 10:00:00+01' ELSE now() END
            ELSE NULL END,
       CASE WHEN r.estado = 'assinado' THEN pg_temp.trh_sid('auth', r.chave) ELSE NULL END,
       CASE WHEN r.estado = 'assinado' THEN 'interna' ELSE NULL END,
       CASE WHEN r.estado = 'anulado' THEN now() ELSE NULL END,
       CASE WHEN r.estado = 'anulado' THEN v_miguel ELSE NULL END,
       CASE WHEN r.estado = 'anulado' THEN 'Emitida por engano: a Carla não mudou de horário.' ELSE NULL END,
       v_miguel);
  END LOOP;
END;
$trh_b17$;
-- ==============================================================================
-- B18 -- CONFERIR: contagens, intervalos e invariantes. RAISE EXCEPTION se algo falhar.
--   So conta linhas marcadas (TRH-, @teste-rh.olyvia.invalid, ids deterministas);
--   nao assume totais absolutos da organizacao (ha 7 fichas de teste anteriores).
-- ==============================================================================
CREATE FUNCTION pg_temp.trh_ck(p_nome text, p_obtido bigint, p_esperado bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_obtido IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'CONFERIR falhou: % -- esperado %, obtido %.', p_nome, p_esperado, p_obtido;
  END IF;
END $$;
CREATE FUNCTION pg_temp.trh_ck_entre(p_nome text, p_obtido bigint, p_min bigint, p_max bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_obtido IS NULL OR p_obtido < p_min OR p_obtido > p_max THEN
    RAISE EXCEPTION 'CONFERIR falhou: % -- esperado entre % e %, obtido %.', p_nome, p_min, p_max, p_obtido;
  END IF;
END $$;
DO $trh_b18$
DECLARE
  c_nike uuid := pg_temp.trh_org();
  v_miguel uuid := pg_temp.trh_miguel();
  v_col text;
  v_n bigint;
  v_tipos bigint;
  v_validados bigint;
  v_rejeitados bigint;
  v_picagens bigint;
  v_realizados bigint;
  v_tab text;
  v_pessoas uuid[];
  v_tabelas integer := 0;
BEGIN
  IF pg_temp.trh_ja() THEN
    RAISE NOTICE 'TRH: CONFERIR nao corrido (a semente ja existia antes desta execucao).';
    RETURN;
  END IF;

  -- ---- Contas e papeis ------------------------------------------------------
  PERFORM pg_temp.trh_ck('auth.users marcados',
    (SELECT count(*) FROM auth.users WHERE email LIKE '%@teste-rh.olyvia.invalid'), 6);
  PERFORM pg_temp.trh_ck('auth.identities marcadas',
    (SELECT count(*) FROM auth.identities WHERE user_id IN
       (SELECT id FROM auth.users WHERE email LIKE '%@teste-rh.olyvia.invalid')), 6);
  PERFORM pg_temp.trh_ck('anew_users marcados',
    (SELECT count(*) FROM public.anew_users WHERE email LIKE '%@teste-rh.olyvia.invalid'), 6);
  PERFORM pg_temp.trh_ck('anew_memberships novas (nike, activas)',
    (SELECT count(*) FROM public.anew_memberships
      WHERE organization_id = c_nike AND status = 'active'
        AND user_id IN (SELECT id FROM public.anew_users WHERE email LIKE '%@teste-rh.olyvia.invalid')), 6);
  PERFORM pg_temp.trh_ck('anew_memberships dos utilizadores de teste fora da nike',
    (SELECT count(*) FROM public.anew_memberships
      WHERE organization_id <> c_nike
        AND user_id IN (SELECT id FROM public.anew_users WHERE email LIKE '%@teste-rh.olyvia.invalid')), 0);
  PERFORM pg_temp.trh_ck('hash bcrypt verificado contra a palavra-passe ao ser calculado',
    (SELECT count(*) FROM trh_hash WHERE ok AND h ~ '^\$2[abxy]\$10\$.{53}$'), 1);
  PERFORM pg_temp.trh_ck('contas com esse hash bcrypt',
    (SELECT count(*) FROM auth.users
      WHERE email LIKE '%@teste-rh.olyvia.invalid'
        AND encrypted_password IN (SELECT h FROM trh_hash WHERE ok)), 6);
  PERFORM pg_temp.trh_ck('auth.users sem email confirmado',
    (SELECT count(*) FROM auth.users
      WHERE email LIKE '%@teste-rh.olyvia.invalid' AND email_confirmed_at IS NULL), 0);

  FOREACH v_col IN ARRAY ARRAY[
    'confirmation_token','recovery_token','email_change_token_new','email_change',
    'email_change_token_current','phone_change','phone_change_token','reauthentication_token'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = v_col) THEN
      EXECUTE format('SELECT count(*) FROM auth.users WHERE email LIKE %L AND %I IS NULL',
                     '%@teste-rh.olyvia.invalid', v_col) INTO v_n;
      PERFORM pg_temp.trh_ck('auth.users.' || v_col || ' a NULL', v_n, 0);
    END IF;
  END LOOP;

  PERFORM pg_temp.trh_ck('anew_roles novos',
    (SELECT count(*) FROM public.anew_roles WHERE code LIKE 'teste_rh_%'), 4);
  PERFORM pg_temp.trh_ck('papeis de teste nao-sistema e da nike',
    (SELECT count(*) FROM public.anew_roles
      WHERE code LIKE 'teste_rh_%' AND is_system = false AND organization_id = c_nike), 4);
  -- Contagens contra anew_role_permissions e anew_permissions reais, nao contra trh_perm.
  PERFORM pg_temp.trh_ck('papel chefia: permissoes atribuidas',
    (SELECT count(*) FROM public.anew_role_permissions
      WHERE role_id = pg_temp.trh_sid('role', 'teste_rh_chefia')), 9);
  PERFORM pg_temp.trh_ck('papel colaborador: permissoes atribuidas',
    (SELECT count(*) FROM public.anew_role_permissions
      WHERE role_id = pg_temp.trh_sid('role', 'teste_rh_colaborador')), 7);
  PERFORM pg_temp.trh_ck('papel so_ponto: permissoes atribuidas',
    (SELECT count(*) FROM public.anew_role_permissions
      WHERE role_id = pg_temp.trh_sid('role', 'teste_rh_so_ponto')), 3);
  PERFORM pg_temp.trh_ck('papel gestao: permissoes atribuidas = catalogo hr.* nao perigoso e sem as exclusoes',
    (SELECT count(*) FROM public.anew_role_permissions
      WHERE role_id = pg_temp.trh_sid('role', 'teste_rh_gestao')),
    (SELECT count(*) FROM public.anew_permissions p
      WHERE p.code LIKE 'hr.%'
        AND p.code !~ '\.corrigir(\.|$)'
        AND p.code NOT LIKE 'hr.pessoas.saude.%'
        AND p.code NOT LIKE 'hr.pessoas.sindicalizacao.%'
        AND p.code <> 'hr.pessoas.identificacao.reveal'
        AND p.code <> 'hr.pessoas.acessos_sensiveis.view'
        AND p.code <> 'hr.ausencias.historico.editar'
        AND p.code <> 'hr.ausencias.tipos.edit'
        AND p.code NOT LIKE 'hr.assiduidade.dispositivos.%'
        AND coalesce(p.is_dangerous, false) = false));
  PERFORM pg_temp.trh_ck_entre('papel gestao: pelo menos uma permissao',
    (SELECT count(*) FROM public.anew_role_permissions
      WHERE role_id = pg_temp.trh_sid('role', 'teste_rh_gestao')), 1, 100000);
  PERFORM pg_temp.trh_ck('permissoes dos papeis de teste que nao existem no catalogo',
    (SELECT count(*) FROM public.anew_role_permissions rp
       JOIN public.anew_roles r ON r.id = rp.role_id
      WHERE r.code LIKE 'teste_rh_%'
        AND NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = rp.permission_code)), 0);
  -- Nenhum papel de teste tem uma permissao is_dangerous: so o super_admin do Miguel as tem.
  PERFORM pg_temp.trh_ck('permissoes is_dangerous em papeis teste_rh_*',
    (SELECT count(*) FROM public.anew_role_permissions rp
       JOIN public.anew_roles r ON r.id = rp.role_id
       JOIN public.anew_permissions p ON p.code = rp.permission_code
      WHERE r.code LIKE 'teste_rh_%' AND p.is_dangerous IS TRUE), 0);
  PERFORM pg_temp.trh_ck('papel gestao sem acoes perigosas (lista manual)',
    (SELECT count(*) FROM public.anew_role_permissions
      WHERE role_id = pg_temp.trh_sid('role', 'teste_rh_gestao')
        AND (permission_code ~ '\.corrigir(\.|$)'
             OR permission_code LIKE 'hr.pessoas.saude.%'
             OR permission_code LIKE 'hr.pessoas.sindicalizacao.%'
             OR permission_code IN ('hr.pessoas.identificacao.reveal','hr.pessoas.acessos_sensiveis.view',
                                    'hr.ausencias.historico.editar','hr.ausencias.tipos.edit')
             OR permission_code LIKE 'hr.assiduidade.dispositivos.%')), 0);

  -- ---- Fichas e cadastro ----------------------------------------------------
  PERFORM pg_temp.trh_ck('pessoas TRH-',
    (SELECT count(*) FROM public.pessoas WHERE organization_id = c_nike AND numero_interno LIKE 'TRH-%'), 14);
  PERFORM pg_temp.trh_ck('pessoas TRH- fora da nike',
    (SELECT count(*) FROM public.pessoas WHERE organization_id <> c_nike AND numero_interno LIKE 'TRH-%'), 0);
  PERFORM pg_temp.trh_ck('pessoas_contas activas',
    (SELECT count(*) FROM public.pessoas_contas
      WHERE estado = 'activa' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 6);
  PERFORM pg_temp.trh_ck('hr_locais_trabalho',
    (SELECT count(*) FROM public.hr_locais_trabalho
      WHERE organization_id = c_nike AND deleted_at IS NULL AND codigo IN ('LIS','POR','SET')), 3);
  PERFORM pg_temp.trh_ck('hr_cargos',
    (SELECT count(*) FROM public.hr_cargos
      WHERE organization_id = c_nike AND id IN (SELECT pg_temp.trh_sid('cargo', slug) FROM trh_cargo)), 10);
  PERFORM pg_temp.trh_ck('pessoas_afectacoes',
    (SELECT count(*) FROM public.pessoas_afectacoes
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 16);
  PERFORM pg_temp.trh_ck('pessoas_afectacoes abertas',
    (SELECT count(*) FROM public.pessoas_afectacoes
      WHERE valido_ate IS NULL AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('pessoas com local_id (derivado das afectacoes)',
    (SELECT count(*) FROM public.pessoas
      WHERE numero_interno LIKE 'TRH-%' AND organization_id = c_nike AND local_id IS NOT NULL), 13);
  PERFORM pg_temp.trh_ck('so o Vasco fica sem local_id',
    (SELECT count(*) FROM public.pessoas
      WHERE id = pg_temp.trh_pessoa('vasco') AND local_id IS NULL), 1);

  PERFORM pg_temp.trh_ck('pessoas_dados_pessoais',
    (SELECT count(*) FROM public.pessoas_dados_pessoais WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('pessoas_identificacao',
    (SELECT count(*) FROM public.pessoas_identificacao WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('pessoas_moradas',
    (SELECT count(*) FROM public.pessoas_moradas WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('pessoas_contactos_emergencia',
    (SELECT count(*) FROM public.pessoas_contactos_emergencia WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('pessoas_fardamento (Nuno e Joana sem ele)',
    (SELECT count(*) FROM public.pessoas_fardamento WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 12);
  PERFORM pg_temp.trh_ck('NIF invalidos',
    (SELECT count(*) FROM public.pessoas_identificacao
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p) AND NOT public.hr_nif_valido(nif)), 0);
  PERFORM pg_temp.trh_ck('NISS invalidos (os preenchidos)',
    (SELECT count(*) FROM public.pessoas_identificacao
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
        AND niss IS NOT NULL AND NOT public.hr_niss_valido(niss)), 0);
  PERFORM pg_temp.trh_ck('fichas com NISS',
    (SELECT count(*) FROM public.pessoas_identificacao
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p) AND niss IS NOT NULL), 12);

  -- ---- Contratos, horas e retribuicoes ---------------------------------------
  PERFORM pg_temp.trh_ck('pessoas_vinculos',
    (SELECT count(*) FROM public.pessoas_vinculos WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('vinculos activos',
    (SELECT count(*) FROM public.pessoas_vinculos
      WHERE estado = 'activo' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 11);
  PERFORM pg_temp.trh_ck('vinculos suspensos',
    (SELECT count(*) FROM public.pessoas_vinculos
      WHERE estado = 'suspenso' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('vinculos terminados',
    (SELECT count(*) FROM public.pessoas_vinculos
      WHERE estado = 'terminado' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('vinculos futuros',
    (SELECT count(*) FROM public.pessoas_vinculos
      WHERE estado = 'futuro' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('Andreia com tipo_contrato tempo_parcial',
    (SELECT count(*) FROM public.pessoas_vinculos
      WHERE pessoa_id = pg_temp.trh_pessoa('andreia') AND tipo_contrato = 'tempo_parcial'), 1);
  PERFORM pg_temp.trh_ck('pessoas_vinculos_horas',
    (SELECT count(*) FROM public.pessoas_vinculos_horas WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('vinculos em vigor com horas sincronizadas',
    (SELECT count(*) FROM public.pessoas_vinculos
      WHERE estado IN ('activo','suspenso') AND horas_periodo IS NOT NULL
        AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 12);
  PERFORM pg_temp.trh_ck('historico de contratos gerado por UPDATE (Vasco e Andreia)',
    (SELECT count(DISTINCT vinculo_id) FROM public.pessoas_vinculos_alteracoes
      WHERE vinculo_id IN (pg_temp.trh_sid('vinculo','vasco'), pg_temp.trh_sid('vinculo','andreia'))), 2);

  PERFORM pg_temp.trh_ck('pessoas_retribuicoes',
    (SELECT count(*) FROM public.pessoas_retribuicoes WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('retribuicoes diferentes do cargo (valor ou periodicidade)',
    (SELECT count(*) FROM public.pessoas_retribuicoes r
       JOIN public.pessoas p ON p.id = r.pessoa_id
       JOIN public.hr_cargos c ON c.id = p.cargo_id
      WHERE r.pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
        AND (r.valor_base IS DISTINCT FROM c.salario_base OR r.periodicidade IS DISTINCT FROM c.periodicidade)), 0);
  PERFORM pg_temp.trh_ck('retribuicoes em aberto',
    (SELECT count(*) FROM public.pessoas_retribuicoes
      WHERE valido_ate IS NULL AND deleted_at IS NULL
        AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 13);

  -- ---- Horario planeado ----------------------------------------------------
  PERFORM pg_temp.trh_ck('pessoas_horario_planeado',
    (SELECT count(*) FROM public.pessoas_horario_planeado
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 157);
  PERFORM pg_temp.trh_ck('trigger da janela imutavel activo (tgenabled = O)',
    (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.pessoas_horario_planeado'::regclass
        AND tgname = 'trg_pessoas_horario_planeado_janela_imutavel' AND tgenabled = 'O'), 1);

  -- ---- Faltas -----------------------------------------------------------------
  PERFORM pg_temp.trh_ck('pessoas_faltas',
    (SELECT count(*) FROM public.pessoas_faltas WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 8);
  PERFORM pg_temp.trh_ck('faltas activas',
    (SELECT count(*) FROM public.pessoas_faltas
      WHERE estado = 'activa' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 7);
  PERFORM pg_temp.trh_ck('faltas anuladas',
    (SELECT count(*) FROM public.pessoas_faltas
      WHERE estado = 'anulada' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('faltas justificadas',
    (SELECT count(*) FROM public.pessoas_faltas
      WHERE justificacao_estado = 'justificada' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 3);
  PERFORM pg_temp.trh_ck('faltas recusadas',
    (SELECT count(*) FROM public.pessoas_faltas
      WHERE justificacao_estado = 'recusada' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('faltas sem justificacao',
    (SELECT count(*) FROM public.pessoas_faltas
      WHERE justificacao_estado = 'sem_justificacao' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 3);
  PERFORM pg_temp.trh_ck('faltas pendentes de documento',
    (SELECT count(*) FROM public.pessoas_faltas
      WHERE justificacao_estado = 'pendente_documento' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('pessoas_faltas_justificacoes',
    (SELECT count(*) FROM public.pessoas_faltas_justificacoes
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 3);

  -- ---- Ausencias --------------------------------------------------------------
  PERFORM pg_temp.trh_ck('hr_ausencias_tipos canonicos da nike',
    (SELECT count(DISTINCT upper(codigo)) FROM public.hr_ausencias_tipos
      WHERE organization_id = c_nike AND deleted_at IS NULL
        AND upper(codigo) IN ('FERIAS','ASSIST_FAMILIA','BAIXA_MEDICA','CASAMENTO','CONGRESSO',
                              'DOENCA_FAMILIAR','EXAMES','LICENCA_PARENTAL','MOTIVOS_FAMILIARES',
                              'OUTRO','TELETRABALHO')), 11);
  PERFORM pg_temp.trh_ck('pessoas_ausencias_direitos',
    (SELECT count(*) FROM public.pessoas_ausencias_direitos
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('pessoas_ausencias_ajustes',
    (SELECT count(*) FROM public.pessoas_ausencias_ajustes
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 2);
  PERFORM pg_temp.trh_ck('pessoas_ausencias_pedidos',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 14);
  PERFORM pg_temp.trh_ck('pedidos aprovados',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos
      WHERE estado = 'aprovado' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 8);
  PERFORM pg_temp.trh_ck('pedidos recusados',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos
      WHERE estado = 'recusado' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('pedidos cancelados',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos
      WHERE estado = 'cancelado' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('pedidos pendentes de chefia',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos
      WHERE estado = 'pendente_chefia' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 3);
  PERFORM pg_temp.trh_ck('pedidos pendentes de RH',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos
      WHERE estado = 'pendente_rh' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('pessoas_ausencias_pedido_decisoes',
    (SELECT count(*) FROM public.pessoas_ausencias_pedido_decisoes
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 20);
  PERFORM pg_temp.trh_ck('pessoas_ausencias_justificacoes',
    (SELECT count(*) FROM public.pessoas_ausencias_justificacoes
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('pedidos cujos dias_solicitados nao igualam a soma das fraccoes dos dias',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos pd
      WHERE pd.pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
        AND pd.dias_solicitados IS DISTINCT FROM
            (SELECT coalesce(sum(d.fraccao_dia), 0) FROM public.pessoas_ausencias_dias d WHERE d.pedido_id = pd.id)), 0);
  PERFORM pg_temp.trh_ck('pedidos sem nenhum dia',
    (SELECT count(*) FROM public.pessoas_ausencias_pedidos pd
      WHERE pd.pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
        AND NOT EXISTS (SELECT 1 FROM public.pessoas_ausencias_dias d WHERE d.pedido_id = pd.id)), 0);

  -- ---- Obras, calendario e documentos ------------------------------------------
  PERFORM pg_temp.trh_ck('hr_obras_horas',
    (SELECT count(*) FROM public.hr_obras_horas WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 4);
  PERFORM pg_temp.trh_ck('hr_obras_horas anuladas',
    (SELECT count(*) FROM public.hr_obras_horas
      WHERE anulado_em IS NOT NULL AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 1);
  PERFORM pg_temp.trh_ck('schedule_holidays semeados (created_by do Miguel)',
    (SELECT count(*) FROM public.schedule_holidays
      WHERE organization_id = c_nike AND created_by = v_miguel
        AND id = md5('rh-seed|feriado|' || holiday_date::text)::uuid), 14);
  PERFORM pg_temp.trh_ck('pessoas_documentos_modelos',
    (SELECT count(*) FROM public.pessoas_documentos_modelos
      WHERE id IN (SELECT pg_temp.trh_sid('modelo', k) FROM trh_modelo)), 4);
  PERFORM pg_temp.trh_ck('pessoas_documentos_clausulas',
    (SELECT count(*) FROM public.pessoas_documentos_clausulas
      WHERE id IN (pg_temp.trh_sid('clausula','confidencialidade'), pg_temp.trh_sid('clausula','exclusividade'),
                   pg_temp.trh_sid('clausula','local'))), 3);
  PERFORM pg_temp.trh_ck('pessoas_documentos',
    (SELECT count(*) FROM public.pessoas_documentos WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 11);
  PERFORM pg_temp.trh_ck('documentos assinados',
    (SELECT count(*) FROM public.pessoas_documentos
      WHERE estado = 'assinado' AND assinatura_origem = 'interna'
        AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 6);
  PERFORM pg_temp.trh_ck('documentos com {{token}} por substituir',
    (SELECT count(*) FROM public.pessoas_documentos
      WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p) AND corpo_html LIKE '%{{%'), 0);

  -- ---- Assiduidade --------------------------------------------------------------
  SELECT count(*) INTO v_picagens
    FROM public.pessoas_picagens
   WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p) AND estado = 'valida';
  PERFORM pg_temp.trh_ck_entre('pessoas_picagens validas', v_picagens, 1200, 1800);

  PERFORM pg_temp.trh_ck('picagem corrigida (cadeia de correccao)',
    (SELECT count(*) FROM public.pessoas_picagens
      WHERE estado = 'corrigida' AND pessoa_id = pg_temp.trh_pessoa('andreia')), 1);
  PERFORM pg_temp.trh_ck('picagem anulada',
    (SELECT count(*) FROM public.pessoas_picagens
      WHERE estado = 'anulada' AND pessoa_id = pg_temp.trh_pessoa('ines')), 1);

  PERFORM pg_temp.trh_ck('realizado de picagem com numero de picagens diferente de 2',
    (SELECT count(*) FROM public.pessoas_horario_realizado h
      WHERE h.pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
        AND h.origem = 'picagem' AND h.deleted_at IS NULL
        AND (SELECT count(*) FROM public.pessoas_picagens pi WHERE pi.realizado_id = h.id) <> 2), 0);
  PERFORM pg_temp.trh_ck('picagens em dias de ausencia aprovada de dia inteiro',
    (SELECT count(*) FROM public.pessoas_picagens pi
       JOIN public.pessoas_ausencias_dias ad
         ON ad.pessoa_id = pi.pessoa_id AND ad.data = pi.data_local
        AND ad.estado = 'aprovado' AND ad.fraccao_dia >= 1.00
      WHERE pi.pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 0);
  PERFORM pg_temp.trh_ck('pares de realizado sobrepostos',
    (SELECT count(*) FROM public.pessoas_horario_realizado a
       JOIN public.pessoas_horario_realizado b
         ON a.pessoa_id = b.pessoa_id AND a.data = b.data AND a.id < b.id
        AND a.hora_inicio < b.hora_fim AND b.hora_inicio < a.hora_fim
      WHERE a.pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
        AND a.deleted_at IS NULL AND b.deleted_at IS NULL
        AND a.estado <> 'rejeitado' AND b.estado <> 'rejeitado'), 0);

  SELECT count(*) FILTER (WHERE estado = 'validado'), count(*) FILTER (WHERE estado = 'rejeitado'),
         count(*)
    INTO v_validados, v_rejeitados, v_realizados
    FROM public.pessoas_horario_realizado
   WHERE pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p) AND deleted_at IS NULL;
  IF v_validados < 1 THEN
    RAISE EXCEPTION 'CONFERIR falhou: nenhum realizado validado.';
  END IF;
  PERFORM pg_temp.trh_ck('realizado rejeitado (Vasco, 12/08, tarde)', v_rejeitados, 1);
  PERFORM pg_temp.trh_ck('realizado validado fora de 10 a 28/08',
    (SELECT count(*) FROM public.pessoas_horario_realizado
      WHERE estado = 'validado' AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
        AND (data < DATE '2026-08-10' OR data > DATE '2026-08-28')), 0);
  PERFORM pg_temp.trh_ck('realizado validado pelo proprio',
    (SELECT count(*) FROM public.pessoas_horario_realizado h
       JOIN public.pessoas_contas pc ON pc.pessoa_id = h.pessoa_id AND pc.estado = 'activa'
      WHERE h.validado_por = pc.anew_user_id), 0);
  PERFORM pg_temp.trh_ck('realizado validado por quem nao e o Miguel',
    (SELECT count(*) FROM public.pessoas_horario_realizado
      WHERE estado = 'validado' AND validado_por IS DISTINCT FROM v_miguel
        AND pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)), 0);

  -- Os cinco tipos de desvio da fila aparecem.
  SELECT count(DISTINCT d.tipo) INTO v_tipos
    FROM public.hr_assiduidade_desvios(c_nike, DATE '2026-08-10', DATE '2026-10-05') d
   WHERE d.pessoa_id IN (SELECT pg_temp.trh_pessoa(chave) FROM trh_p)
     AND d.tipo IN ('planeado_sem_realizado','planeado_parcialmente_realizado','realizado_sem_planeado',
                    'pendente_par','falta_coberta_por_ausencia');
  PERFORM pg_temp.trh_ck('tipos de desvio presentes na fila (de 5)', v_tipos, 5);

  -- ---- Isolamento: nada fora da nike ------------------------------------------------
  PERFORM pg_temp.trh_ck('registos de teste fora da nike (cargos, centros, papeis, feriados)',
    (SELECT count(*) FROM public.hr_cargos
      WHERE id IN (SELECT pg_temp.trh_sid('cargo', slug) FROM trh_cargo) AND organization_id <> c_nike)
    + (SELECT count(*) FROM public.hr_locais_trabalho
        WHERE codigo IN ('LIS','POR','SET') AND nome IN (SELECT nome FROM trh_local) AND organization_id <> c_nike)
    + (SELECT count(*) FROM public.anew_roles WHERE code LIKE 'teste_rh_%' AND organization_id IS DISTINCT FROM c_nike)
    + (SELECT count(*) FROM public.schedule_holidays
        WHERE id = md5('rh-seed|feriado|' || holiday_date::text)::uuid AND organization_id <> c_nike), 0);

  -- Em TODA a tabela de public com pessoa_id e organization_id (descoberta no catalogo, nao
  -- por lista), as linhas das pessoas TRH- tem de estar na nike.
  SELECT array_agg(pg_temp.trh_pessoa(chave)) INTO v_pessoas FROM trh_p;
  FOR v_tab IN
    SELECT t.table_name::text
      FROM information_schema.tables t
      JOIN information_schema.columns cp
        ON cp.table_schema = t.table_schema AND cp.table_name = t.table_name
       AND cp.column_name = 'pessoa_id' AND cp.data_type = 'uuid'
      JOIN information_schema.columns co
        ON co.table_schema = t.table_schema AND co.table_name = t.table_name
       AND co.column_name = 'organization_id' AND co.data_type = 'uuid'
     WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
     ORDER BY t.table_name
  LOOP
    v_tabelas := v_tabelas + 1;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE pessoa_id = ANY (%L::uuid[]) AND organization_id IS DISTINCT FROM %L::uuid',
                   v_tab, v_pessoas::text, c_nike) INTO v_n;
    PERFORM pg_temp.trh_ck('linhas de pessoas TRH- fora da nike em public.' || v_tab, v_n, 0);
  END LOOP;
  PERFORM pg_temp.trh_ck_entre('tabelas com pessoa_id e organization_id inspeccionadas', v_tabelas, 5, 1000);

  RAISE NOTICE 'TRH: CONFERIR ok. Picagens validas: %, realizados vivos: % (validados %, rejeitados %).',
    v_picagens, v_realizados, v_validados, v_rejeitados;
END;
$trh_b18$;
