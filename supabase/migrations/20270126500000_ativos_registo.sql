-- ==============================================================================
-- 20270126500000_ativos_registo.sql
--
-- ATIVOS, fase 1: o registo de ativos (uma linha por máquina), em três grupos:
--   pessoa    (o portátil nº X; o custo da pessoa continua a sair de pessoas_equipamentos),
--   servico   (liga OBRIGATORIAMENTE a um equipamento do catálogo, cat_equipamentos, da
--              mesma organização),
--   estrutura (armazéns, mesas, cadeiras, TV; só depreciação por tempo).
-- Desenho fechado: vault/ficheiros/ativos/desenho-ativos.md (Parte B).
--
-- SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth). NUNCA a principal (tzbfgw...).
-- Antes do push: confirmar supabase/.temp/project-ref = uetjghdkwbywbftedtth e correr
-- `supabase migration list --linked` (só esta pode estar pendente).
--
-- !!! ENTRA JUNTO COM O ECRÃ /ativos (escrito em paralelo no mesmo ramo) !!! -------
--  O ecrã chama as RPCs abaixo e o menu/rota pedem ativos.view. Aplicar sozinha não
--  parte nada (só cria objectos novos e uma coluna nula), mas o ecrã sem ela dá
--  "função não encontrada" (PGRST202). A migration e o ecrã publicam-se juntos.
--
-- O QUE FAZ
--  1. Tabelas public.ativo e public.ativo_eventos (auditoria só de acrescentar).
--  2. pessoas_equipamentos.ativo_id (nula, FK composta com a organização; um ativo
--     atribuído a uma pessoa de cada vez). NÃO se preenche nada; as RPCs do RH não mudam.
--  3. Permissões NOVAS ativos.view e ativos.edit (categoria assets). NÃO se reutiliza
--     assets.* (está dada a org_admin/org_editor do Grupo BMLar). Concedidas UMA vez aos
--     papéis GLOBAIS super_admin e system_admin (chegam às 6 organizações da base).
--     Nenhum papel de organização recebe nada; o bloco de conferir exige 4 linhas exactas.
--  4. RPCs (SECURITY DEFINER, search_path vazio, só authenticated):
--     rpc_ativos_listar, rpc_ativo_ler, rpc_ativo_criar, rpc_ativo_alterar,
--     rpc_ativo_desativar, rpc_ativo_reativar, rpc_ativo_ligar_pessoa,
--     rpc_ativo_desligar_pessoa, rpc_ativos_opcoes.
--  Não faz: uso, repartição, análise, entrada em preços/estrutura, importação, apagar.
--
-- SEGURANÇA
--  Tabelas sem nenhum direito para PUBLIC/anon/authenticated/service_role, RLS ligada e
--  FORCE; políticas só de defesa (SELECT/INSERT/UPDATE com as permissões novas; nenhuma
--  de DELETE). Leitura e escrita só pelas RPCs. O nome de quem tem um ativo e as
--  atribuições do RH só saem a quem tem hr.pessoas.retribuicao.view na organização.
--
-- ERROS: RAISE ... USING ERRCODE = 'P0001', MESSAGE = 'ATVnn', DETAIL = texto em pt-PT.
--   Falta de sessão/permissão: 42501.
--   ATV02 grupo inválido               ATV11 manutenção inválida
--   ATV03 texto inválido (nome; e, com  ATV12 código repetido
--         o campo no DETAIL, código,    ATV13 centro de custo inválido
--         nº de série, local, notas)    ATV14 ativo não encontrado
--   ATV04 tipo inválido para o grupo   ATV15 ativo desativado
--   ATV05 equipamento do catálogo em   ATV16 desativação inválida (data ou motivo)
--         falta ou de outra org.       ATV17 ativo atribuído a uma pessoa
--   ATV06 equipamento fora do serviço  ATV18 ligação inválida (DETAIL diz porquê)
--   ATV07 data inválida  ATV08 valor de compra  ATV09 residual  ATV10 vida útil
--
-- DESVIOS AO DESENHO (decididos aqui, a validar pelo revisor)
--  a) ops_centro_custo NÃO tem UNIQUE (id, organization_id) (lido no remoto): FK simples
--     e a RPC confere a organização (ATV13).
--  b) ATV03 serve também código, nº de série, localização e notas demasiado longos (o
--     desenho não tinha código para isso); o DETAIL diz qual.
--  c) A lista devolve `ligado` (boolean) em todos os ativos, mesmo sem a permissão do RH:
--     não diz a quem, só que está atribuído (o ecrã precisa para «Sem pessoa ligada» e
--     para não oferecer desativar quem está atribuído).
--  d) Alterar aceita manter um equipamento do catálogo entretanto apagado, ou um centro
--     de custo entretanto inactivo, se já era o do ativo (senão não se podia editar).
--  e) Datas (compra e desativação) aceites entre 2000-01-01 e hoje + 10 anos, como no RH;
--     a tabela guarda entre 2000-01-01 e 2100-01-01.
--  f) Desligar só numa atribuição ainda 'atribuido'; nas devolvidas a ligação fica como
--     histórico.
--
-- COMO SE REVERTE: sem ficheiro de reversão nesta pasta, de propósito. O texto está fora
-- do repositório (jobs/bbc4f3a6/tmp/ativos/reverter.sql) e só serve enquanto não houver
-- ativos registados.
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---- Guardas (estado limpo e dependências) --------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  -- G1 As tabelas novas ainda não existem.
  IF to_regclass('public.ativo') IS NOT NULL OR to_regclass('public.ativo_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: public.ativo ou public.ativo_eventos já existe. Investigar.';
  END IF;
  -- G2 A coluna nova ainda não existe e a tabela do RH sim.
  IF to_regclass('public.pessoas_equipamentos') IS NULL THEN
    RAISE EXCEPTION 'G2: falta public.pessoas_equipamentos (20270104500000).';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = to_regclass('public.pessoas_equipamentos')
                AND a.attname::text = 'ativo_id' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'G2: pessoas_equipamentos.ativo_id já existe. Investigar.';
  END IF;
  -- G3 As permissões novas ainda não existem (nunca reutilizar assets.*).
  SELECT count(DISTINCT p.code) INTO v_n FROM public.anew_permissions p WHERE p.code IN ('ativos.view', 'ativos.edit');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G3: % das permissões ativos.view/ativos.edit já existem. Parar e rever.', v_n;
  END IF;
  -- G4 Nenhuma função do remoto usa já os códigos ATVnn.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public' AND p.prosrc ~ 'ATV[0-9][0-9]';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G4: há % função(ões) que já usam códigos ATVnn. Escolher outros.', v_n;
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname::text = 'public'
     AND (p.proname::text LIKE 'rpc\_ativo%' OR p.proname::text LIKE 'ativos\_%' OR p.proname::text LIKE 'ativo\_eventos%');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'G4: já existem % função(ões) com nomes desta migration. Investigar.', v_n;
  END IF;
  -- G5 cat_equipamentos tem a UNIQUE (id, organization_id), alvo da FK composta.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.cat_equipamentos')
                    AND c.contype::text = 'u'
                    AND pg_get_constraintdef(c.oid)::text = 'UNIQUE (id, organization_id)') THEN
    RAISE EXCEPTION 'G5: cat_equipamentos não tem UNIQUE (id, organization_id).';
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.cat_equipamentos') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'nome', 'vida_anos', 'vida_horas', 'uso_ano_horas', 'ativo', 'apagado_em');
  IF v_n <> 8 THEN
    RAISE EXCEPTION 'G5: cat_equipamentos não tem as colunas esperadas (encontradas % de 8).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.ops_centro_custo') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'codigo', 'nome', 'ativo');
  IF v_n <> 5 THEN
    RAISE EXCEPTION 'G5: ops_centro_custo não tem as colunas esperadas (encontradas % de 5).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas') AND NOT a.attisdropped
     AND a.attname::text IN ('id', 'organization_id', 'nome_completo', 'primeiro_nome', 'apelido', 'deleted_at');
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'G5: pessoas não tem as colunas esperadas (encontradas % de 6).', v_n;
  END IF;
  -- G6 Funções de que dependemos.
  IF to_regprocedure('public.has_anew_permission_in_org(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'G6: falta has_anew_permission_in_org(uuid, text, uuid) ou update_updated_at_column().';
  END IF;
  SELECT count(DISTINCT p.code) INTO v_n FROM public.anew_permissions p
   WHERE p.code IN ('hr.pessoas.retribuicao.view', 'hr.pessoas.retribuicao.edit');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'G6: faltam permissões do RH no catálogo (encontradas % de 2).', v_n;
  END IF;
  -- G7 Os papéis globais existem exactamente uma vez cada.
  SELECT count(*) INTO v_n FROM public.anew_roles r
   WHERE r.code = 'super_admin' AND r.is_system = true AND r.organization_id IS NULL AND r.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G7: % papéis super_admin globais (esperado 1).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.anew_roles r
   WHERE r.code = 'system_admin' AND r.is_system = true AND r.organization_id IS NULL AND r.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'G7: % papéis system_admin globais (esperado 1).', v_n;
  END IF;
  -- G8 Esta é a base de RH (a nike existe aqui).
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = 'b6ffce4f-f630-4933-833a-008649757a33') THEN
    RAISE EXCEPTION 'G8: a organização nike não existe nesta base. É a base certa?';
  END IF;
  -- G9 Quem aplica passa a RLS (tabelas com FORCE; as RPCs correm como o dono).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G9: o papel que aplica (%) não tem BYPASSRLS.', current_user::text;
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Tabelas
-- ==============================================================================

-- ---- 1.1 O ativo ----------------------------------------------------------------
CREATE TABLE public.ativo (
  id                 uuid           NOT NULL DEFAULT gen_random_uuid(),
  organization_id    uuid           NOT NULL,
  grupo              text           NOT NULL,
  tipo               text,
  nome               text           NOT NULL,
  codigo             text,
  num_serie          text,
  cat_equipamento_id uuid,
  data_compra        date           NOT NULL,
  valor_compra       numeric(12,2)  NOT NULL,
  valor_residual     numeric(12,2)  NOT NULL DEFAULT 0,
  vida_meses         integer,
  manutencao_ano     numeric(12,2)  NOT NULL DEFAULT 0,
  centro_custo_id    uuid,
  localizacao        text,
  notas              text,
  estado             text           NOT NULL DEFAULT 'ativo',
  desativado_em      date,
  desativado_motivo  text,
  desativado_nota    text,
  created_at         timestamptz    NOT NULL DEFAULT now(),
  created_by         uuid,
  updated_at         timestamptz    NOT NULL DEFAULT now(),
  updated_by         uuid,

  CONSTRAINT ativo_pkey PRIMARY KEY (id),
  CONSTRAINT ativo_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT ativo_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  -- O equipamento do catálogo é sempre da MESMA organização (FK composta).
  CONSTRAINT ativo_cat_equipamento_fkey
    FOREIGN KEY (cat_equipamento_id, organization_id) REFERENCES public.cat_equipamentos (id, organization_id) ON DELETE RESTRICT,
  -- Sem UNIQUE (id, organization_id) em ops_centro_custo: a RPC confere a organização (ATV13).
  CONSTRAINT ativo_centro_custo_fkey
    FOREIGN KEY (centro_custo_id) REFERENCES public.ops_centro_custo (id) ON DELETE RESTRICT,
  CONSTRAINT ativo_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT ativo_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT ativo_grupo_valido CHECK (grupo IN ('pessoa', 'servico', 'estrutura')),
  CONSTRAINT ativo_tipo_coerente CHECK (
    (grupo = 'pessoa' AND tipo IN ('telemovel', 'portatil', 'viatura', 'fardamento', 'ferramentas', 'outro'))
    OR (grupo = 'estrutura' AND tipo IN ('instalacoes', 'mobiliario', 'eletronica', 'outro'))
    OR (grupo = 'servico' AND tipo IS NULL)),
  CONSTRAINT ativo_equipamento_coerente CHECK ((grupo = 'servico') = (cat_equipamento_id IS NOT NULL)),
  CONSTRAINT ativo_nome CHECK (nome = btrim(nome) AND length(nome) BETWEEN 1 AND 120 AND nome !~ '[[:cntrl:]]'),
  CONSTRAINT ativo_codigo CHECK (codigo IS NULL OR (codigo = btrim(codigo) AND length(codigo) BETWEEN 1 AND 40 AND codigo !~ '[[:cntrl:]]')),
  CONSTRAINT ativo_num_serie CHECK (num_serie IS NULL OR (num_serie = btrim(num_serie) AND length(num_serie) BETWEEN 1 AND 80 AND num_serie !~ '[[:cntrl:]]')),
  CONSTRAINT ativo_localizacao CHECK (localizacao IS NULL OR (localizacao = btrim(localizacao) AND length(localizacao) BETWEEN 1 AND 120 AND localizacao !~ '[[:cntrl:]]')),
  CONSTRAINT ativo_notas CHECK (notas IS NULL OR length(notas) BETWEEN 1 AND 1000),
  CONSTRAINT ativo_data_compra CHECK (data_compra BETWEEN DATE '2000-01-01' AND DATE '2100-01-01'),
  -- NaN é maior do que tudo em numeric: o teto apanha-o.
  CONSTRAINT ativo_valor_compra CHECK (valor_compra > 0 AND valor_compra <= 9999999999.99),
  CONSTRAINT ativo_valor_residual CHECK (valor_residual >= 0 AND valor_residual <= valor_compra),
  CONSTRAINT ativo_vida_meses CHECK (
    (vida_meses IS NULL OR vida_meses BETWEEN 1 AND 600)
    AND (grupo = 'servico' OR vida_meses IS NOT NULL)),
  CONSTRAINT ativo_manutencao_ano CHECK (manutencao_ano >= 0 AND manutencao_ano <= 9999999999.99),
  CONSTRAINT ativo_estado_valido CHECK (estado IN ('ativo', 'desativado')),
  CONSTRAINT ativo_desativado_motivo CHECK (desativado_motivo IS NULL OR desativado_motivo IN ('abatido', 'vendido', 'perdido', 'outro')),
  CONSTRAINT ativo_desativado_nota CHECK (desativado_nota IS NULL OR length(desativado_nota) BETWEEN 1 AND 500),
  CONSTRAINT ativo_desativacao_coerente CHECK (
    (estado = 'ativo' AND desativado_em IS NULL AND desativado_motivo IS NULL AND desativado_nota IS NULL)
    OR (estado = 'desativado' AND desativado_em IS NOT NULL AND desativado_motivo IS NOT NULL
        AND desativado_em >= data_compra AND desativado_em <= DATE '2100-01-01'))
);
COMMENT ON TABLE public.ativo IS
'Registo de ativos: uma linha por coisa comprada (3 iguais = 3 linhas). grupo pessoa (o custo da pessoa continua em pessoas_equipamentos; ligação por pessoas_equipamentos.ativo_id), servico (liga obrigatoriamente a cat_equipamentos da mesma organização; vida_meses NULL = vida do modelo) ou estrutura (depreciação linear por tempo). O valor actual calcula-se no ecrã. Nunca se apaga: desativa-se com data e motivo. Leitura e escrita só pelas RPCs rpc_ativo*. Desde 20270126500000.';

CREATE UNIQUE INDEX ativo_org_codigo_key ON public.ativo (organization_id, lower(codigo)) WHERE codigo IS NOT NULL;
CREATE INDEX idx_ativo_org_grupo_ativos ON public.ativo (organization_id, grupo) WHERE estado = 'ativo';
CREATE INDEX idx_ativo_org_nome ON public.ativo (organization_id, lower(nome), id);
CREATE INDEX idx_ativo_org_equipamento ON public.ativo (organization_id, cat_equipamento_id) WHERE cat_equipamento_id IS NOT NULL;
CREATE INDEX idx_ativo_centro_custo ON public.ativo (centro_custo_id) WHERE centro_custo_id IS NOT NULL;
CREATE INDEX idx_ativo_created_by ON public.ativo (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX idx_ativo_updated_by ON public.ativo (updated_by) WHERE updated_by IS NOT NULL;

-- ---- 1.2 A auditoria (só de acrescentar) -----------------------------------------
CREATE TABLE public.ativo_eventos (
  id                    bigint       GENERATED ALWAYS AS IDENTITY,
  organization_id       uuid         NOT NULL,
  ativo_id              uuid         NOT NULL,
  tipo                  text         NOT NULL,
  actor                 uuid,
  actor_auth_uid        uuid         NOT NULL,
  pessoa_equipamento_id uuid,
  campos                text[]       NOT NULL DEFAULT '{}'::text[],
  em                    timestamptz  NOT NULL DEFAULT now(),

  CONSTRAINT ativo_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT ativo_eventos_ativo_fkey
    FOREIGN KEY (ativo_id, organization_id) REFERENCES public.ativo (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT ativo_eventos_pessoa_equipamento_fkey
    FOREIGN KEY (pessoa_equipamento_id) REFERENCES public.pessoas_equipamentos (id) ON DELETE RESTRICT,
  CONSTRAINT ativo_eventos_tipo_valido CHECK (tipo IN ('criado', 'alterado', 'desativado', 'reativado', 'ligado', 'desligado')),
  CONSTRAINT ativo_eventos_ligacao_coerente CHECK ((tipo IN ('ligado', 'desligado')) = (pessoa_equipamento_id IS NOT NULL)),
  -- Só NOMES de colunas, nunca valores.
  CONSTRAINT ativo_eventos_campos CHECK (
    cardinality(campos) <= 20
    AND campos <@ ARRAY['nome', 'tipo', 'codigo', 'num_serie', 'cat_equipamento_id', 'data_compra', 'valor_compra',
                        'valor_residual', 'vida_meses', 'manutencao_ano', 'centro_custo_id', 'localizacao', 'notas',
                        'estado', 'desativado_em', 'desativado_motivo', 'desativado_nota']::text[])
);
COMMENT ON TABLE public.ativo_eventos IS
'Auditoria dos ativos, só de acrescentar (UPDATE, DELETE e TRUNCATE recusados por trigger). campos leva só os NOMES das colunas alteradas, nunca valores. actor = anew_users.id, sem FK de propósito (um SET NULL chocaria com a imutabilidade). Desde 20270126500000.';
CREATE INDEX idx_ativo_eventos_ativo ON public.ativo_eventos (ativo_id, em DESC, id DESC);
CREATE INDEX idx_ativo_eventos_org ON public.ativo_eventos (organization_id, em);
CREATE INDEX idx_ativo_eventos_pessoa_equipamento ON public.ativo_eventos (pessoa_equipamento_id) WHERE pessoa_equipamento_id IS NOT NULL;

-- ---- 1.3 A ligação no RH -----------------------------------------------------------
ALTER TABLE public.pessoas_equipamentos ADD COLUMN ativo_id uuid;
ALTER TABLE public.pessoas_equipamentos
  ADD CONSTRAINT pessoas_equipamentos_ativo_fkey
  FOREIGN KEY (ativo_id, organization_id) REFERENCES public.ativo (id, organization_id) ON DELETE RESTRICT;
-- Um ativo só pode estar atribuído a uma pessoa de cada vez (as devolvidas ficam como histórico).
CREATE UNIQUE INDEX pessoas_equipamentos_ativo_atribuido_key
  ON public.pessoas_equipamentos (ativo_id) WHERE ativo_id IS NOT NULL AND estado = 'atribuido';
CREATE INDEX idx_pessoas_equipamentos_ativo ON public.pessoas_equipamentos (ativo_id) WHERE ativo_id IS NOT NULL;
COMMENT ON COLUMN public.pessoas_equipamentos.ativo_id IS
'Ativo (grupo pessoa) que corresponde a esta atribuição, ou NULL. Escrito só por rpc_ativo_ligar_pessoa / rpc_ativo_desligar_pessoa; não muda o valor nem a conta do RH. Desde 20270126500000.';

-- ==============================================================================
-- 2. Triggers
-- ==============================================================================
CREATE TRIGGER trg_ativo_updated_at
  BEFORE UPDATE ON public.ativo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE FUNCTION public.ativo_eventos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'ativo_eventos: registo só de acrescentar' USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER trg_ativo_eventos_sem_alterar
  BEFORE UPDATE OR DELETE ON public.ativo_eventos
  FOR EACH ROW EXECUTE FUNCTION public.ativo_eventos_imutavel();
CREATE TRIGGER trg_ativo_eventos_sem_truncate
  BEFORE TRUNCATE ON public.ativo_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.ativo_eventos_imutavel();

-- ==============================================================================
-- 3. Direitos e RLS: ninguém lê nem escreve directamente; só as RPCs
-- ==============================================================================
REVOKE ALL ON TABLE public.ativo         FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.ativo_eventos FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.ativo_eventos_id_seq FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.ativo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ativo         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ativo_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ativo_eventos FORCE ROW LEVEL SECURITY;

-- Defesa em profundidade (para o dia em que alguém conceda direitos de tabela).
-- Nenhuma política de DELETE: apagar é proibido.
CREATE POLICY ativo_ler ON public.ativo FOR SELECT TO authenticated
  USING (public.has_anew_permission_in_org((SELECT auth.uid()), 'ativos.view', organization_id));
CREATE POLICY ativo_criar ON public.ativo FOR INSERT TO authenticated
  WITH CHECK (public.has_anew_permission_in_org((SELECT auth.uid()), 'ativos.edit', organization_id));
CREATE POLICY ativo_editar ON public.ativo FOR UPDATE TO authenticated
  USING (public.has_anew_permission_in_org((SELECT auth.uid()), 'ativos.edit', organization_id))
  WITH CHECK (public.has_anew_permission_in_org((SELECT auth.uid()), 'ativos.edit', organization_id));
CREATE POLICY ativo_eventos_ler ON public.ativo_eventos FOR SELECT TO authenticated
  USING (public.has_anew_permission_in_org((SELECT auth.uid()), 'ativos.view', organization_id));

-- ==============================================================================
-- 4. Permissões novas (só os papéis GLOBAIS super_admin e system_admin)
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('ativos.view', 'Ativos: ver o registo e os valores',
   'Ver a lista de ativos (de serviço, de estrutura e de pessoas), os valores de compra e o valor actual.',
   'assets', NULL, 780, false, 'organization', false),
  ('ativos.edit', 'Ativos: criar, editar e desativar',
   'Registar ativos, alterar os seus dados, desativá-los e ligá-los a equipamentos atribuídos a pessoas.',
   'assets', NULL, 781, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

DO $conceder$
DECLARE
  v_papel      text;
  v_role       uuid;
  v_n          integer;
  v_prev_claim text;
BEGIN
  FOREACH v_papel IN ARRAY ARRAY['super_admin', 'system_admin'] LOOP
    SELECT count(*) INTO v_n FROM public.anew_roles r
     WHERE r.code = v_papel AND r.is_system = true AND r.organization_id IS NULL AND r.deleted_at IS NULL;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'CONCEDER: % papéis % globais de sistema (esperado 1).', v_n, v_papel;
    END IF;
    SELECT r.id INTO v_role FROM public.anew_roles r
     WHERE r.code = v_papel AND r.is_system = true AND r.organization_id IS NULL AND r.deleted_at IS NULL;

    -- protect_system_role_permissions só deixa escrever em papéis de sistema com a claim de
    -- service_role: LOCAL e reposta logo a seguir (padrão de 20270105500000). Nenhum trigger é desligado.
    v_prev_claim := current_setting('request.jwt.claims', true);
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
    SELECT v_role, c.code, NULL::uuid
      FROM unnest(ARRAY['ativos.view', 'ativos.edit']) AS c(code)
    ON CONFLICT (role_id, permission_code) DO NOTHING;
    PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev_claim, '') = '' THEN '{}' ELSE v_prev_claim END, true);
  END LOOP;
END;
$conceder$;

-- ==============================================================================
-- 5. Funções internas (sem EXECUTE para ninguém; correm dentro das RPCs)
-- ==============================================================================

-- 5.1 Sessão + permissão na organização; devolve o anew_users.id do actor.
CREATE FUNCTION public.ativos_exigir(p_org uuid, p_permissao text)
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_anew uuid;
BEGIN
  IF v_uid IS NULL OR p_org IS NULL OR p_permissao IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, p_permissao, p_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501', DETAIL = 'Não tem permissão para esta ação nos ativos.';
  END IF;
  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid AND au.deleted_at IS NULL LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501', DETAIL = 'Não tem permissão para esta ação nos ativos.';
  END IF;
  RETURN v_anew;
END;
$$;

-- 5.2 Normaliza e valida os campos de criar/alterar; devolve a linha pronta (sem id nem
--     metadados). p_id = o ativo que se altera (NULL ao criar).
CREATE FUNCTION public.ativos_validar(
  p_org uuid, p_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid,
  p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer,
  p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid,
  p_localizacao text, p_notas text)
RETURNS public.ativo
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
  c_max      constant numeric := 9999999999.99;
  v          public.ativo;
  v_atual    public.ativo;
  v_compra   numeric;
  v_residual numeric;
  v_manut    numeric;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_org;
  END IF;
  v.organization_id := p_org;

  v.grupo := nullif(btrim(p_grupo), '');
  IF v.grupo IS NULL OR v.grupo NOT IN ('pessoa', 'servico', 'estrutura') THEN
    RAISE EXCEPTION 'ATV02' USING ERRCODE = 'P0001', DETAIL = 'Grupo inválido: escolha Serviço, Estrutura ou Pessoas.';
  END IF;

  v.nome := nullif(btrim(p_nome), '');
  IF v.nome IS NULL OR length(v.nome) > 120 OR v.nome ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'O nome é obrigatório e tem no máximo 120 caracteres.';
  END IF;

  v.tipo := nullif(btrim(p_tipo), '');
  IF (v.grupo = 'pessoa' AND (v.tipo IS NULL OR v.tipo NOT IN ('telemovel', 'portatil', 'viatura', 'fardamento', 'ferramentas', 'outro')))
     OR (v.grupo = 'estrutura' AND (v.tipo IS NULL OR v.tipo NOT IN ('instalacoes', 'mobiliario', 'eletronica', 'outro')))
     OR (v.grupo = 'servico' AND v.tipo IS NOT NULL) THEN
    RAISE EXCEPTION 'ATV04' USING ERRCODE = 'P0001', DETAIL = 'O tipo não serve para este grupo.';
  END IF;

  IF v.grupo = 'servico' THEN
    IF p_cat_equipamento_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM public.cat_equipamentos e
          WHERE e.id = p_cat_equipamento_id AND e.organization_id = p_org
            AND (e.apagado_em IS NULL OR e.id IS NOT DISTINCT FROM v_atual.cat_equipamento_id)) THEN
      RAISE EXCEPTION 'ATV05' USING ERRCODE = 'P0001', DETAIL = 'Escolha o equipamento do catálogo a que esta máquina corresponde.';
    END IF;
    v.cat_equipamento_id := p_cat_equipamento_id;
  ELSIF p_cat_equipamento_id IS NOT NULL THEN
    RAISE EXCEPTION 'ATV06' USING ERRCODE = 'P0001', DETAIL = 'Só os ativos de serviço se ligam a um equipamento do catálogo.';
  END IF;

  IF p_data_compra IS NULL OR NOT isfinite(p_data_compra) OR p_data_compra < DATE '2000-01-01'
     OR p_data_compra > (current_date + interval '10 years')::date THEN
    RAISE EXCEPTION 'ATV07' USING ERRCODE = 'P0001', DETAIL = 'A data de compra é inválida.';
  END IF;
  v.data_compra := p_data_compra;

  -- Arredonda ao cêntimo ANTES de validar; o teto apanha NaN e infinito.
  v_compra := round(p_valor_compra, 2);
  IF v_compra IS NULL OR NOT (v_compra > 0 AND v_compra <= c_max) THEN
    RAISE EXCEPTION 'ATV08' USING ERRCODE = 'P0001', DETAIL = 'O valor de compra tem de ser maior do que zero.';
  END IF;
  v_residual := round(coalesce(p_valor_residual, 0), 2);
  IF NOT (v_residual >= 0 AND v_residual <= v_compra) THEN
    RAISE EXCEPTION 'ATV09' USING ERRCODE = 'P0001', DETAIL = 'O valor residual não pode ser negativo nem maior do que o valor de compra.';
  END IF;
  v.valor_compra := v_compra;
  v.valor_residual := v_residual;

  IF (p_vida_meses IS NULL AND v.grupo <> 'servico')
     OR (p_vida_meses IS NOT NULL AND (p_vida_meses < 1 OR p_vida_meses > 600)) THEN
    RAISE EXCEPTION 'ATV10' USING ERRCODE = 'P0001', DETAIL = 'A vida útil tem de estar entre 1 e 600 meses.';
  END IF;
  v.vida_meses := p_vida_meses;

  v_manut := round(coalesce(p_manutencao_ano, 0), 2);
  IF NOT (v_manut >= 0 AND v_manut <= c_max) THEN
    RAISE EXCEPTION 'ATV11' USING ERRCODE = 'P0001', DETAIL = 'A manutenção por ano não pode ser negativa.';
  END IF;
  v.manutencao_ano := v_manut;

  v.codigo := nullif(btrim(p_codigo), '');
  IF v.codigo IS NOT NULL AND (length(v.codigo) > 40 OR v.codigo ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'O código tem no máximo 40 caracteres.';
  END IF;
  IF v.codigo IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.ativo a
        WHERE a.organization_id = p_org AND a.codigo IS NOT NULL
          AND lower(a.codigo) = lower(v.codigo) AND a.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'ATV12' USING ERRCODE = 'P0001', DETAIL = 'Já existe um ativo com este código.';
  END IF;

  v.num_serie := nullif(btrim(p_num_serie), '');
  IF v.num_serie IS NOT NULL AND (length(v.num_serie) > 80 OR v.num_serie ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'O número de série tem no máximo 80 caracteres.';
  END IF;
  v.localizacao := nullif(btrim(p_localizacao), '');
  IF v.localizacao IS NOT NULL AND (length(v.localizacao) > 120 OR v.localizacao ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'A localização tem no máximo 120 caracteres.';
  END IF;
  v.notas := nullif(btrim(p_notas), '');
  IF v.notas IS NOT NULL AND length(v.notas) > 1000 THEN
    RAISE EXCEPTION 'ATV03' USING ERRCODE = 'P0001', DETAIL = 'As notas têm no máximo 1000 caracteres.';
  END IF;

  IF p_centro_custo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_centro_custo c
        WHERE c.id = p_centro_custo_id AND c.organization_id = p_org
          AND (c.ativo OR c.id IS NOT DISTINCT FROM v_atual.centro_custo_id)) THEN
    RAISE EXCEPTION 'ATV13' USING ERRCODE = 'P0001', DETAIL = 'O centro de custo não existe nesta organização ou está inativo.';
  END IF;
  v.centro_custo_id := p_centro_custo_id;

  RETURN v;
END;
$$;

-- 5.3 O ativo em JSON (colunas explícitas; nunca to_jsonb da linha).
CREATE FUNCTION public.ativos_json(r public.ativo)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'grupo', r.grupo, 'tipo', r.tipo, 'nome', r.nome, 'codigo', r.codigo, 'num_serie', r.num_serie,
    'cat_equipamento_id', r.cat_equipamento_id, 'data_compra', r.data_compra, 'valor_compra', r.valor_compra,
    'valor_residual', r.valor_residual, 'vida_meses', r.vida_meses, 'manutencao_ano', r.manutencao_ano,
    'centro_custo_id', r.centro_custo_id, 'localizacao', r.localizacao, 'notas', r.notas, 'estado', r.estado,
    'desativado_em', r.desativado_em, 'desativado_motivo', r.desativado_motivo, 'desativado_nota', r.desativado_nota,
    'created_at', r.created_at, 'updated_at', r.updated_at)
$$;

-- 5.4 Grava um evento (o actor de sessão é sempre auth.uid()).
CREATE FUNCTION public.ativos_evento(
  p_org uuid, p_ativo_id uuid, p_tipo text, p_actor uuid, p_pessoa_equipamento_id uuid, p_campos text[])
RETURNS void
LANGUAGE sql VOLATILE
SET search_path = ''
AS $$
  INSERT INTO public.ativo_eventos (organization_id, ativo_id, tipo, actor, actor_auth_uid, pessoa_equipamento_id, campos)
  VALUES (p_org, p_ativo_id, p_tipo, p_actor, auth.uid(), p_pessoa_equipamento_id, coalesce(p_campos, '{}'::text[]))
$$;

-- ==============================================================================
-- 6. RPCs (authenticated; SECURITY DEFINER; permissão e organização primeiro)
-- ==============================================================================

-- 6.1 Lista por grupos (ativos.view). Limite 2000 ativos, ordem pelo nome.
--     A quem tem hr.pessoas.retribuicao.view: a quem está atribuído cada ativo pessoa e as
--     atribuições do RH ainda sem ativo. Aos outros: null e rh_oculto = true.
CREATE FUNCTION public.rpc_ativos_listar(p_organization_id uuid, p_incluir_desativados boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_limite constant integer := 2000;
  v_rh       boolean;
  v_trunc    boolean;
  v_todos    boolean := coalesce(p_incluir_desativados, false);
  v_servico  jsonb;
  v_estrut   jsonb;
  v_pessoa   jsonb;
  v_sem      jsonb;
  v_cc       jsonb;
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.view');
  v_rh := public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_organization_id);

  SELECT count(*) > c_limite INTO v_trunc
    FROM (SELECT 1 FROM public.ativo a
           WHERE a.organization_id = p_organization_id AND (v_todos OR a.estado = 'ativo')
           LIMIT c_limite + 1) x;

  WITH sel AS (
    SELECT a AS r
      FROM public.ativo a
     WHERE a.organization_id = p_organization_id AND (v_todos OR a.estado = 'ativo')
     ORDER BY lower(a.nome), a.id
     LIMIT c_limite
  ), j AS (
    SELECT (s.r).grupo AS grupo, lower((s.r).nome) AS ordem, (s.r).id AS id,
           public.ativos_json(s.r)
           || jsonb_build_object(
                'ligado', pe.id IS NOT NULL,
                'cat_equipamento', CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object(
                    'id', e.id, 'nome', e.nome, 'vida_anos', e.vida_anos, 'vida_horas', e.vida_horas,
                    'uso_ano_horas', e.uso_ano_horas, 'apagado', e.apagado_em IS NOT NULL) END,
                'atribuicao', CASE WHEN v_rh AND pe.id IS NOT NULL AND p.id IS NOT NULL THEN jsonb_build_object(
                    'pessoa_equipamento_id', pe.id,
                    'pessoa_nome', coalesce(nullif(btrim(p.nome_completo), ''), nullif(btrim(concat_ws(' ', p.primeiro_nome, p.apelido)), '')),
                    'entrega', pe.entrega) END) AS o
      FROM sel s
      LEFT JOIN public.cat_equipamentos e
        ON e.id = (s.r).cat_equipamento_id AND e.organization_id = (s.r).organization_id
      LEFT JOIN LATERAL (
        SELECT x.id, x.entrega, x.pessoa_id FROM public.pessoas_equipamentos x
         WHERE x.ativo_id = (s.r).id AND x.organization_id = (s.r).organization_id AND x.estado = 'atribuido'
         LIMIT 1) pe ON true
      LEFT JOIN public.pessoas p
        ON p.id = pe.pessoa_id AND p.organization_id = (s.r).organization_id AND p.deleted_at IS NULL
  )
  SELECT coalesce(jsonb_agg(j.o ORDER BY j.ordem, j.id) FILTER (WHERE j.grupo = 'servico'), '[]'::jsonb),
         coalesce(jsonb_agg(j.o ORDER BY j.ordem, j.id) FILTER (WHERE j.grupo = 'estrutura'), '[]'::jsonb),
         coalesce(jsonb_agg(j.o ORDER BY j.ordem, j.id) FILTER (WHERE j.grupo = 'pessoa'), '[]'::jsonb)
    INTO v_servico, v_estrut, v_pessoa
    FROM j;

  IF v_rh THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', y.id,
             'pessoa_nome', y.pessoa_nome,
             'tipo', y.tipo, 'descricao', y.descricao, 'valor', y.valor, 'entrega', y.entrega, 'estado', y.estado)
             ORDER BY y.entrega DESC, y.id), '[]'::jsonb)
      INTO v_sem
      FROM (SELECT pe.id, pe.tipo, pe.descricao, pe.valor, pe.entrega, pe.estado,
                   coalesce(nullif(btrim(p.nome_completo), ''), nullif(btrim(concat_ws(' ', p.primeiro_nome, p.apelido)), '')) AS pessoa_nome
              FROM public.pessoas_equipamentos pe
              JOIN public.pessoas p
                ON p.id = pe.pessoa_id AND p.organization_id = pe.organization_id AND p.deleted_at IS NULL
             WHERE pe.organization_id = p_organization_id AND pe.estado = 'atribuido' AND pe.ativo_id IS NULL
             ORDER BY pe.entrega DESC, pe.id
             LIMIT c_limite) y;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome, 'ativo', c.ativo)
           ORDER BY lower(c.nome), c.id), '[]'::jsonb)
    INTO v_cc
    FROM public.ops_centro_custo c
   WHERE c.organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'servico', v_servico,
    'estrutura', v_estrut,
    'pessoa', jsonb_build_object(
      'ativos', v_pessoa,
      'atribuicoes_sem_ativo', v_sem,
      'rh_oculto', NOT v_rh),
    'centros_custo', v_cc,
    'truncado', v_trunc);
END;
$$;

-- 6.2 Um ativo e os últimos 50 eventos (ativos.view). O nome do actor só com ativos.edit.
CREATE FUNCTION public.rpc_ativo_ler(p_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a       public.ativo;
  v_rh      boolean;
  v_edit    boolean;
  v_cat     jsonb;
  v_atr     jsonb;
  v_ligado  boolean;
  v_eventos jsonb;
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.view');
  SELECT * INTO v_a FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  v_rh   := public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_organization_id);
  v_edit := public.has_anew_permission_in_org(auth.uid(), 'ativos.edit', p_organization_id);

  SELECT jsonb_build_object('id', e.id, 'nome', e.nome, 'vida_anos', e.vida_anos, 'vida_horas', e.vida_horas,
                            'uso_ano_horas', e.uso_ano_horas, 'apagado', e.apagado_em IS NOT NULL)
    INTO v_cat
    FROM public.cat_equipamentos e
   WHERE e.id = v_a.cat_equipamento_id AND e.organization_id = v_a.organization_id;

  SELECT true,
         CASE WHEN v_rh AND p.id IS NOT NULL THEN jsonb_build_object(
           'pessoa_equipamento_id', pe.id,
           'pessoa_nome', coalesce(nullif(btrim(p.nome_completo), ''), nullif(btrim(concat_ws(' ', p.primeiro_nome, p.apelido)), '')),
           'entrega', pe.entrega) END
    INTO v_ligado, v_atr
    FROM public.pessoas_equipamentos pe
    LEFT JOIN public.pessoas p ON p.id = pe.pessoa_id AND p.organization_id = pe.organization_id AND p.deleted_at IS NULL
   WHERE pe.ativo_id = v_a.id AND pe.organization_id = v_a.organization_id AND pe.estado = 'atribuido'
   LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'tipo', z.tipo, 'em', z.em, 'campos', to_jsonb(z.campos),
           'actor_nome', CASE WHEN v_edit THEN z.actor_nome END) ORDER BY z.em DESC, z.id DESC), '[]'::jsonb)
    INTO v_eventos
    FROM (SELECT ev.id, ev.tipo, ev.em, ev.campos, u.name AS actor_nome
            FROM public.ativo_eventos ev
            LEFT JOIN public.anew_users u ON u.id = ev.actor
           WHERE ev.ativo_id = v_a.id AND ev.organization_id = v_a.organization_id
           ORDER BY ev.em DESC, ev.id DESC
           LIMIT 50) z;

  RETURN public.ativos_json(v_a) || jsonb_build_object(
    'cat_equipamento', v_cat,
    'ligado', coalesce(v_ligado, false),
    'atribuicao', v_atr,
    'rh_oculto', NOT v_rh,
    'eventos', v_eventos);
END;
$$;

-- 6.3 Criar (ativos.edit). Devolve {id}.
CREATE FUNCTION public.rpc_ativo_criar(
  p_organization_id uuid, p_grupo text, p_nome text, p_tipo text, p_cat_equipamento_id uuid,
  p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer,
  p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid,
  p_localizacao text, p_notas text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v       public.ativo;
  v_id    uuid := gen_random_uuid();
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  v := public.ativos_validar(p_organization_id, NULL, p_grupo, p_nome, p_tipo, p_cat_equipamento_id,
                             p_data_compra, p_valor_compra, p_valor_residual, p_vida_meses, p_manutencao_ano,
                             p_codigo, p_num_serie, p_centro_custo_id, p_localizacao, p_notas);
  BEGIN
    INSERT INTO public.ativo
      (id, organization_id, grupo, tipo, nome, codigo, num_serie, cat_equipamento_id, data_compra, valor_compra,
       valor_residual, vida_meses, manutencao_ano, centro_custo_id, localizacao, notas, estado, created_by, updated_by)
    VALUES
      (v_id, p_organization_id, v.grupo, v.tipo, v.nome, v.codigo, v.num_serie, v.cat_equipamento_id, v.data_compra,
       v.valor_compra, v.valor_residual, v.vida_meses, v.manutencao_ano, v.centro_custo_id, v.localizacao, v.notas,
       'ativo', v_actor, v_actor);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ATV12' USING ERRCODE = 'P0001', DETAIL = 'Já existe um ativo com este código.';
  END;
  PERFORM public.ativos_evento(p_organization_id, v_id, 'criado', v_actor, NULL, '{}'::text[]);
  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- 6.4 Alterar (ativos.edit): substituição completa; o grupo não muda. Sem mudanças, sem evento.
CREATE FUNCTION public.rpc_ativo_alterar(
  p_id uuid, p_organization_id uuid, p_nome text, p_tipo text, p_cat_equipamento_id uuid,
  p_data_compra date, p_valor_compra numeric, p_valor_residual numeric, p_vida_meses integer,
  p_manutencao_ano numeric, p_codigo text, p_num_serie text, p_centro_custo_id uuid,
  p_localizacao text, p_notas text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor  uuid;
  v_atual  public.ativo;
  v        public.ativo;
  v_campos text[];
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_atual.estado <> 'ativo' THEN
    RAISE EXCEPTION 'ATV15' USING ERRCODE = 'P0001', DETAIL = 'Este ativo está desativado. Reative-o antes de o alterar.';
  END IF;

  v := public.ativos_validar(p_organization_id, p_id, v_atual.grupo, p_nome, p_tipo, p_cat_equipamento_id,
                             p_data_compra, p_valor_compra, p_valor_residual, p_vida_meses, p_manutencao_ano,
                             p_codigo, p_num_serie, p_centro_custo_id, p_localizacao, p_notas);

  v_campos := array_remove(ARRAY[
    CASE WHEN v.nome               IS DISTINCT FROM v_atual.nome               THEN 'nome' END,
    CASE WHEN v.tipo               IS DISTINCT FROM v_atual.tipo               THEN 'tipo' END,
    CASE WHEN v.codigo             IS DISTINCT FROM v_atual.codigo             THEN 'codigo' END,
    CASE WHEN v.num_serie          IS DISTINCT FROM v_atual.num_serie          THEN 'num_serie' END,
    CASE WHEN v.cat_equipamento_id IS DISTINCT FROM v_atual.cat_equipamento_id THEN 'cat_equipamento_id' END,
    CASE WHEN v.data_compra        IS DISTINCT FROM v_atual.data_compra        THEN 'data_compra' END,
    CASE WHEN v.valor_compra       IS DISTINCT FROM v_atual.valor_compra       THEN 'valor_compra' END,
    CASE WHEN v.valor_residual     IS DISTINCT FROM v_atual.valor_residual     THEN 'valor_residual' END,
    CASE WHEN v.vida_meses         IS DISTINCT FROM v_atual.vida_meses         THEN 'vida_meses' END,
    CASE WHEN v.manutencao_ano     IS DISTINCT FROM v_atual.manutencao_ano     THEN 'manutencao_ano' END,
    CASE WHEN v.centro_custo_id    IS DISTINCT FROM v_atual.centro_custo_id    THEN 'centro_custo_id' END,
    CASE WHEN v.localizacao        IS DISTINCT FROM v_atual.localizacao        THEN 'localizacao' END,
    CASE WHEN v.notas              IS DISTINCT FROM v_atual.notas              THEN 'notas' END
  ]::text[], NULL);

  IF cardinality(v_campos) = 0 THEN
    RETURN jsonb_build_object('id', p_id, 'alterado', false, 'campos', '[]'::jsonb);
  END IF;

  BEGIN
    UPDATE public.ativo a
       SET nome = v.nome, tipo = v.tipo, codigo = v.codigo, num_serie = v.num_serie,
           cat_equipamento_id = v.cat_equipamento_id, data_compra = v.data_compra, valor_compra = v.valor_compra,
           valor_residual = v.valor_residual, vida_meses = v.vida_meses, manutencao_ano = v.manutencao_ano,
           centro_custo_id = v.centro_custo_id, localizacao = v.localizacao, notas = v.notas, updated_by = v_actor
     WHERE a.id = p_id AND a.organization_id = p_organization_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ATV12' USING ERRCODE = 'P0001', DETAIL = 'Já existe um ativo com este código.';
  END;
  PERFORM public.ativos_evento(p_organization_id, p_id, 'alterado', v_actor, NULL, v_campos);
  RETURN jsonb_build_object('id', p_id, 'alterado', true, 'campos', to_jsonb(v_campos));
END;
$$;

-- 6.5 Desativar (ativos.edit), com data e motivo. Nunca se apaga.
CREATE FUNCTION public.rpc_ativo_desativar(p_id uuid, p_organization_id uuid, p_data date, p_motivo text, p_nota text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor  uuid;
  v_atual  public.ativo;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_nota   text := nullif(btrim(p_nota), '');
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_atual.estado <> 'ativo' THEN
    RAISE EXCEPTION 'ATV15' USING ERRCODE = 'P0001', DETAIL = 'Este ativo já está desativado.';
  END IF;
  IF p_data IS NULL OR NOT isfinite(p_data) OR p_data < v_atual.data_compra
     OR p_data > (current_date + interval '10 years')::date
     OR v_motivo IS NULL OR v_motivo NOT IN ('abatido', 'vendido', 'perdido', 'outro')
     OR (v_nota IS NOT NULL AND length(v_nota) > 500) THEN
    RAISE EXCEPTION 'ATV16' USING ERRCODE = 'P0001',
      DETAIL = 'Indique a data e o motivo da desativação. A data não pode ser anterior à compra e a nota tem no máximo 500 caracteres.';
  END IF;
  -- A ligação só se escreve com este ativo trancado (rpc_ativo_ligar_pessoa tranca-o primeiro).
  IF EXISTS (SELECT 1 FROM public.pessoas_equipamentos pe
              WHERE pe.ativo_id = p_id AND pe.organization_id = p_organization_id AND pe.estado = 'atribuido') THEN
    RAISE EXCEPTION 'ATV17' USING ERRCODE = 'P0001', DETAIL = 'Este ativo está atribuído a uma pessoa. Devolva-o primeiro no RH.';
  END IF;

  UPDATE public.ativo a
     SET estado = 'desativado', desativado_em = p_data, desativado_motivo = v_motivo, desativado_nota = v_nota,
         updated_by = v_actor
   WHERE a.id = p_id AND a.organization_id = p_organization_id;
  PERFORM public.ativos_evento(p_organization_id, p_id, 'desativado', v_actor, NULL,
    CASE WHEN v_nota IS NULL THEN ARRAY['estado', 'desativado_em', 'desativado_motivo']
         ELSE ARRAY['estado', 'desativado_em', 'desativado_motivo', 'desativado_nota'] END);
  RETURN jsonb_build_object('id', p_id, 'estado', 'desativado');
END;
$$;

-- 6.6 Reativar (ativos.edit): limpa os desativado_*. Já activo: devolve sem evento.
CREATE FUNCTION public.rpc_ativo_reativar(p_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_atual public.ativo;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  SELECT * INTO v_atual FROM public.ativo a WHERE a.id = p_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_atual.estado = 'ativo' THEN
    RETURN jsonb_build_object('id', p_id, 'estado', 'ativo', 'alterado', false);
  END IF;
  UPDATE public.ativo a
     SET estado = 'ativo', desativado_em = NULL, desativado_motivo = NULL, desativado_nota = NULL, updated_by = v_actor
   WHERE a.id = p_id AND a.organization_id = p_organization_id;
  PERFORM public.ativos_evento(p_organization_id, p_id, 'reativado', v_actor, NULL,
                               ARRAY['estado', 'desativado_em', 'desativado_motivo', 'desativado_nota']);
  RETURN jsonb_build_object('id', p_id, 'estado', 'ativo', 'alterado', true);
END;
$$;

-- 6.7 Ligar um ativo pessoa a uma atribuição do RH (ativos.edit E hr.pessoas.retribuicao.edit).
--     Não mexe em valor, conta nem estado da atribuição. Ordem dos trancamentos: ativo, depois atribuição.
CREATE FUNCTION public.rpc_ativo_ligar_pessoa(p_ativo_id uuid, p_pessoa_equipamento_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_a     public.ativo;
  v_pe    public.pessoas_equipamentos;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  PERFORM public.ativos_exigir(p_organization_id, 'hr.pessoas.retribuicao.edit');

  SELECT * INTO v_a FROM public.ativo a WHERE a.id = p_ativo_id AND a.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATV14' USING ERRCODE = 'P0001', DETAIL = 'Ativo não encontrado.';
  END IF;
  IF v_a.grupo <> 'pessoa' THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'Só os ativos do grupo Pessoas se ligam a um equipamento atribuído.';
  END IF;
  IF v_a.estado <> 'ativo' THEN
    RAISE EXCEPTION 'ATV15' USING ERRCODE = 'P0001', DETAIL = 'Este ativo está desativado.';
  END IF;

  SELECT * INTO v_pe FROM public.pessoas_equipamentos pe
   WHERE pe.id = p_pessoa_equipamento_id AND pe.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.pessoas p
                               WHERE p.id = v_pe.pessoa_id AND p.organization_id = p_organization_id AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'A atribuição não existe nesta organização.';
  END IF;
  IF v_pe.estado <> 'atribuido' THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'Esta atribuição já foi devolvida.';
  END IF;
  IF v_pe.ativo_id = p_ativo_id THEN
    RETURN jsonb_build_object('ativo_id', p_ativo_id, 'pessoa_equipamento_id', v_pe.id, 'alterado', false);
  END IF;
  IF v_pe.ativo_id IS NOT NULL THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'Esta atribuição já está ligada a outro ativo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pessoas_equipamentos x
              WHERE x.ativo_id = p_ativo_id AND x.organization_id = p_organization_id AND x.estado = 'atribuido') THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'Este ativo já está atribuído a outra pessoa.';
  END IF;

  BEGIN
    UPDATE public.pessoas_equipamentos pe SET ativo_id = p_ativo_id, updated_by = v_actor
     WHERE pe.id = v_pe.id AND pe.organization_id = p_organization_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'Este ativo já está atribuído a outra pessoa.';
  END;
  PERFORM public.ativos_evento(p_organization_id, p_ativo_id, 'ligado', v_actor, v_pe.id, '{}'::text[]);
  RETURN jsonb_build_object('ativo_id', p_ativo_id, 'pessoa_equipamento_id', v_pe.id, 'alterado', true);
END;
$$;

-- 6.8 Desligar (ativos.edit E hr.pessoas.retribuicao.edit). Só numa atribuição ainda 'atribuido'.
CREATE FUNCTION public.rpc_ativo_desligar_pessoa(p_pessoa_equipamento_id uuid, p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid;
  v_ativo uuid;
  v_pe    public.pessoas_equipamentos;
BEGIN
  v_actor := public.ativos_exigir(p_organization_id, 'ativos.edit');
  PERFORM public.ativos_exigir(p_organization_id, 'hr.pessoas.retribuicao.edit');

  SELECT pe.ativo_id INTO v_ativo FROM public.pessoas_equipamentos pe
   WHERE pe.id = p_pessoa_equipamento_id AND pe.organization_id = p_organization_id;
  IF v_ativo IS NULL THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'Esta atribuição não está ligada a nenhum ativo.';
  END IF;
  -- Mesma ordem que ligar: ativo, depois atribuição.
  PERFORM 1 FROM public.ativo a WHERE a.id = v_ativo AND a.organization_id = p_organization_id FOR UPDATE;
  SELECT * INTO v_pe FROM public.pessoas_equipamentos pe
   WHERE pe.id = p_pessoa_equipamento_id AND pe.organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND OR v_pe.ativo_id IS DISTINCT FROM v_ativo THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'A ligação mudou entretanto. Volte a abrir a lista.';
  END IF;
  IF v_pe.estado <> 'atribuido' THEN
    RAISE EXCEPTION 'ATV18' USING ERRCODE = 'P0001', DETAIL = 'Esta atribuição já foi devolvida: a ligação fica no histórico.';
  END IF;

  UPDATE public.pessoas_equipamentos pe SET ativo_id = NULL, updated_by = v_actor
   WHERE pe.id = v_pe.id AND pe.organization_id = p_organization_id;
  PERFORM public.ativos_evento(p_organization_id, v_ativo, 'desligado', v_actor, v_pe.id, '{}'::text[]);
  RETURN jsonb_build_object('ativo_id', v_ativo, 'pessoa_equipamento_id', v_pe.id, 'alterado', true);
END;
$$;

-- 6.9 Opções dos seletores (ativos.edit): equipamentos do catálogo não apagados e centros
--     de custo activos. Não depende de services.view.
CREATE FUNCTION public.rpc_ativos_opcoes(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_eq jsonb;
  v_cc jsonb;
BEGIN
  PERFORM public.ativos_exigir(p_organization_id, 'ativos.edit');
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', y.id, 'nome', y.nome, 'vida_anos', y.vida_anos, 'vida_horas', y.vida_horas,
           'uso_ano_horas', y.uso_ano_horas, 'ativo', y.ativo) ORDER BY lower(y.nome), y.id), '[]'::jsonb)
    INTO v_eq
    FROM (SELECT e.id, e.nome, e.vida_anos, e.vida_horas, e.uso_ano_horas, e.ativo
            FROM public.cat_equipamentos e
           WHERE e.organization_id = p_organization_id AND e.apagado_em IS NULL
           ORDER BY lower(e.nome), e.id
           LIMIT 2000) y;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'codigo', c.codigo, 'nome', c.nome)
           ORDER BY lower(c.nome), c.id), '[]'::jsonb)
    INTO v_cc
    FROM public.ops_centro_custo c
   WHERE c.organization_id = p_organization_id AND c.ativo;
  RETURN jsonb_build_object('equipamentos', v_eq, 'centros_custo', v_cc);
END;
$$;

-- ==============================================================================
-- 7. Direitos das funções: internas para ninguém; RPCs só para authenticated
-- ==============================================================================
REVOKE ALL ON FUNCTION public.ativo_eventos_imutavel() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_exigir(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_validar(uuid, uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_json(public.ativo) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ativos_evento(uuid, uuid, text, uuid, uuid, text[]) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.rpc_ativos_listar(uuid, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_ler(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_desativar(uuid, uuid, date, text, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_reativar(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_ligar_pessoa(uuid, uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativo_desligar_pessoa(uuid, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.rpc_ativos_opcoes(uuid) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.rpc_ativos_listar(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_ler(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_desativar(uuid, uuid, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_reativar(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_ligar_pessoa(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativo_desligar_pessoa(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ativos_opcoes(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_ativos_listar(uuid, boolean) IS
'Ativos por grupo (ativos.view): {servico:[ativo+cat_equipamento], estrutura:[ativo], pessoa:{ativos:[ativo+atribuicao|null], atribuicoes_sem_ativo|null, rh_oculto}, centros_custo, truncado}. Todos levam ligado (boolean). Quem tem o equipamento e as atribuições do RH só com hr.pessoas.retribuicao.view. Limite 2000. O valor actual calcula-se no ecrã. Desde 20270126500000.';
COMMENT ON FUNCTION public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text) IS
'Cria um ativo (ativos.edit). Erros ATV02..ATV13 (MESSAGE = código, DETAIL em pt-PT). Devolve {id}. Desde 20270126500000.';

-- ==============================================================================
-- 8. Conferir (falha a migration inteira se algo não bater)
-- ==============================================================================
DO $conferir$
DECLARE
  v_n      integer;
  v_global integer;
  v_dist   integer;
  v_f      text;
BEGIN
  -- C1 RLS ligada e forçada nas duas tabelas.
  SELECT count(*) INTO v_n FROM pg_class c
   WHERE c.oid IN (to_regclass('public.ativo'), to_regclass('public.ativo_eventos'))
     AND c.relrowsecurity AND c.relforcerowsecurity;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'C1: RLS forçada em % de 2 tabelas.', v_n;
  END IF;

  -- C2 Nenhum direito de tabela para anon nem authenticated (nem na tabela do RH).
  IF has_table_privilege('anon', 'public.ativo', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.ativo', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.ativo_eventos', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('authenticated', 'public.ativo_eventos', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.pessoas_equipamentos', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.pessoas_equipamentos', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_sequence_privilege('anon', 'public.ativo_eventos_id_seq', 'USAGE,SELECT,UPDATE')
     OR has_sequence_privilege('authenticated', 'public.ativo_eventos_id_seq', 'USAGE,SELECT,UPDATE') THEN
    RAISE EXCEPTION 'C2: anon ou authenticated ficou com direitos directos nas tabelas.';
  END IF;

  -- C3 Políticas: ativo = SELECT, INSERT, UPDATE (nenhuma DELETE nem ALL); eventos = só SELECT.
  SELECT count(*) INTO v_n FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'ativo' AND p.cmd IN ('SELECT', 'INSERT', 'UPDATE');
  IF v_n <> 3 OR EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public'
                          AND p.tablename IN ('ativo', 'ativo_eventos') AND p.cmd IN ('DELETE', 'ALL')) THEN
    RAISE EXCEPTION 'C3: políticas de ativo inesperadas (% de 3, ou há DELETE/ALL).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'ativo_eventos';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C3: ativo_eventos tem % políticas (esperada 1, de SELECT).', v_n;
  END IF;

  -- C4 As RPCs: authenticated executa, anon não; SECURITY DEFINER com search_path fixo.
  FOREACH v_f IN ARRAY ARRAY[
    'public.rpc_ativos_listar(uuid, boolean)',
    'public.rpc_ativo_ler(uuid, uuid)',
    'public.rpc_ativo_criar(uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text)',
    'public.rpc_ativo_alterar(uuid, uuid, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text)',
    'public.rpc_ativo_desativar(uuid, uuid, date, text, text)',
    'public.rpc_ativo_reativar(uuid, uuid)',
    'public.rpc_ativo_ligar_pessoa(uuid, uuid, uuid)',
    'public.rpc_ativo_desligar_pessoa(uuid, uuid)',
    'public.rpc_ativos_opcoes(uuid)'] LOOP
    IF NOT has_function_privilege('authenticated', v_f, 'EXECUTE') OR has_function_privilege('anon', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'C4: direitos de execução errados em %.', v_f;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(v_f) AND p.prosecdef
                     AND 'search_path=""' = ANY (p.proconfig)) THEN
      RAISE EXCEPTION 'C4: % não é SECURITY DEFINER com search_path vazio.', v_f;
    END IF;
  END LOOP;
  -- As internas: ninguém executa.
  FOREACH v_f IN ARRAY ARRAY[
    'public.ativos_exigir(uuid, text)',
    'public.ativos_validar(uuid, uuid, text, text, text, uuid, date, numeric, numeric, integer, numeric, text, text, uuid, text, text)',
    'public.ativos_json(public.ativo)',
    'public.ativos_evento(uuid, uuid, text, uuid, uuid, text[])',
    'public.ativo_eventos_imutavel()'] LOOP
    IF has_function_privilege('authenticated', v_f, 'EXECUTE') OR has_function_privilege('anon', v_f, 'EXECUTE') THEN
      RAISE EXCEPTION 'C4: a função interna % ficou executável por anon ou authenticated.', v_f;
    END IF;
  END LOOP;

  -- C5 Permissões: exactamente 4 linhas (2 códigos x 2 papéis), todas em papéis GLOBAIS de sistema.
  SELECT count(*),
         count(*) FILTER (WHERE r.organization_id IS NULL AND r.is_system = true AND r.code IN ('super_admin', 'system_admin')),
         count(DISTINCT (rp.role_id, rp.permission_code))
    INTO v_n, v_global, v_dist
    FROM public.anew_role_permissions rp
    LEFT JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code IN ('ativos.view', 'ativos.edit');
  IF v_n <> 4 OR v_global <> 4 OR v_dist <> 4 THEN
    RAISE EXCEPTION 'C5: ativos.* em % linhas (% em papéis globais, % distintas), esperadas 4.', v_n, v_global, v_dist;
  END IF;
  SELECT count(DISTINCT p.code) INTO v_n FROM public.anew_permissions p WHERE p.code IN ('ativos.view', 'ativos.edit');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'C5: % de 2 permissões novas no catálogo.', v_n;
  END IF;

  -- C6 A coluna nova e o índice de uma pessoa de cada vez; nada preenchido.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.pessoas_equipamentos')
                  AND a.attname::text = 'ativo_id' AND NOT a.attisdropped AND NOT a.attnotnull)
     OR to_regclass('public.pessoas_equipamentos_ativo_atribuido_key') IS NULL THEN
    RAISE EXCEPTION 'C6: falta pessoas_equipamentos.ativo_id (nula) ou o índice único.';
  END IF;
  SELECT count(*) INTO v_n FROM public.pessoas_equipamentos pe WHERE pe.ativo_id IS NOT NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C6: % atribuições com ativo_id preenchido (esperado 0).', v_n;
  END IF;
END;
$conferir$;

COMMIT;
