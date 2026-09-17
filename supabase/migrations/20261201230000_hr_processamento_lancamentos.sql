-- ==============================================================================
-- hr_processamento_lancamentos -- premios e outros valores pontuais lancados
-- a uma pessoa DENTRO de um periodo de processamento salarial
-- (hr_periodos_processamento, 20261201220000).
--
-- POR APLICAR. NAO CORRER `supabase db push` -- fica para revisao de base de
-- dados e de seguranca antes de ser aplicado.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- "Acrescentar premios e outros valores pontuais" ao periodo aberto -- um
-- premio de produtividade, um reembolso de despesas, um valor negociado a
-- mao. Nao e assiduidade (isso ja vem de useRelatorioAssiduidadeMensal, sem
-- recalculo nenhum) nem retribuicao base (isso e pessoas_retribuicoes) -- e um
-- valor PONTUAL, deste mes, opcionalmente ligado a um codigo do catalogo
-- (hr_codigos_processamento, 20261201190000).
--
--
-- -- ESCRITA: SO POR RPC, E SO ENQUANTO O PERIODO ESTIVER ABERTO ---------------
--
-- Um lancamento nao se pode criar nem anular depois de o periodo estar
-- "fechado" -- essa regra fica na RPC, NAO numa trigger propria na tabela.
-- DECISAO EXPLICITA: as duas RPCs (criar/anular) ja tem de bloquear a linha do
-- periodo com FOR UPDATE para evitar a corrida com
-- rpc_hr_processamento_periodo_fechar (fechar a meio de uma escrita) -- uma
-- trigger BEFORE INSERT/UPDATE nesta tabela repetiria exactamente a mesma
-- consulta ao periodo sem ganhar nada, e teria de decidir sozinha se corre
-- ANTES ou DEPOIS do lock que a RPC ja fez. Fica tudo numa camada so: a RPC.
-- A tabela continua com INSERT/UPDATE bloqueados a `authenticated` por
-- politica (mesmo padrao de hr_obras_horas), por isso nao ha caminho de
-- escrita nenhum que possa saltar esta verificacao a partir do cliente.
--
-- NUNCA SE APAGA UM LANCAMENTO -- SO SE ANULA (anulado_em/anulado_por/
-- anulado_motivo), mesma convencao de hr_obras_horas: fica visivel no
-- periodo, marcado como anulado, para auditoria.
--
--
-- -- PERMISSAO -------------------------------------------------------------
--
--   hr.processamento.lancamentos.gerir   criar e anular lancamentos pontuais (is_dangerous)
--
-- Parent hr.processamento.periodo.view (20261201220000). NENHUMA atribuicao a
-- papel aqui -- ver a migracao separada 20261201240000.
--
-- LEITURA: reaproveita hr.processamento.periodo.view (quem ve o periodo ve os
-- lancamentos desse periodo) OU a propria hr.processamento.lancamentos.gerir
-- -- nao se cria uma terceira permissao .view so para isto.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - O recibo e a exportacao: FASE 2.
-- - Qualquer calculo agregado do periodo (total a pagar, IRS, Seg. Social):
--   esta tabela so regista o LANCAMENTO, nao soma nem processa nada.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_processamento_lancamento_anular(uuid, text);
--   DROP FUNCTION IF EXISTS public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid);
--   DROP TABLE IF EXISTS public.hr_processamento_lancamentos;
--   DELETE FROM public.anew_permissions WHERE code = 'hr.processamento.lancamentos.gerir';
-- Isto apaga os lancamentos pontuais registados. Exportar antes.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120090000  hr_pessoa_do_utilizador nao usado aqui; pessoas (id, organization_id) existe
--   20261201190000  hr_codigos_processamento
--   20261201220000  hr_periodos_processamento (id, organization_id) UNIQUE
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_periodos_processamento') IS NULL THEN
    RAISE EXCEPTION 'public.hr_periodos_processamento nao existe. Aplicar 20261201220000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_periodos_processamento_id_org_key'
       AND conrelid = 'public.hr_periodos_processamento'::regclass
  ) THEN
    RAISE EXCEPTION 'hr_periodos_processamento_id_org_key nao existe -- a FK composta desta migracao depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_id_org_key' AND conrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'pessoas_id_org_key nao existe -- a FK composta a pessoas desta migracao depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'update_updated_at_column() nao existe -- esperava-a de 20260615130000_baseline_new_database.sql.';
  END IF;

  IF to_regclass('public.hr_codigos_processamento') IS NULL THEN
    RAISE EXCEPTION 'public.hr_codigos_processamento nao existe. Aplicar 20261201190000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.processamento.periodo.view') THEN
    RAISE EXCEPTION 'hr.processamento.periodo.view nao esta no catalogo. Aplicar 20261201220000 primeiro.';
  END IF;

  IF to_regclass('public.hr_processamento_lancamentos') IS NOT NULL THEN
    RAISE EXCEPTION 'public.hr_processamento_lancamentos ja existe. Esta migracao ja foi aplicada.';
  END IF;
END;
$guardas$;

-- ---- Catalogo: uma permissao nova -------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.processamento.lancamentos.gerir', 'Lancar premios e valores pontuais no processamento salarial',
   'PERIGOSA. Criar e anular lancamentos pontuais (premios, reembolsos, valores negociados) dentro de um periodo de processamento salarial ABERTO. Bloqueado pela RPC assim que o periodo fecha.',
   'hr', 'hr.processamento.periodo.view', 760, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ==============================================================================
-- hr_processamento_lancamentos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.hr_processamento_lancamentos (
  id                        uuid NOT NULL DEFAULT gen_random_uuid(),
  periodo_id                uuid NOT NULL,
  pessoa_id                 uuid NOT NULL,
  organization_id           uuid NOT NULL,

  descricao                 text NOT NULL,
  valor                     numeric(10,2) NOT NULL,
  codigo_processamento_id   uuid,

  anulado_em                timestamptz,
  anulado_por               uuid REFERENCES public.anew_users (id) ON DELETE SET NULL,
  anulado_motivo            text,

  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES public.anew_users (id) ON DELETE SET NULL,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by                uuid REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_processamento_lancamentos_pkey PRIMARY KEY (id),
  -- ON DELETE RESTRICT, nao CASCADE: esta tabela e "nunca se apaga, so se
  -- anula" -- apagar o periodo ou a pessoa nunca deve apagar lancamentos em
  -- silencio.
  CONSTRAINT hr_processamento_lancamentos_periodo_fkey
    FOREIGN KEY (periodo_id, organization_id)
    REFERENCES public.hr_periodos_processamento (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT hr_processamento_lancamentos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT hr_processamento_lancamentos_codigo_fkey
    FOREIGN KEY (codigo_processamento_id) REFERENCES public.hr_codigos_processamento (id) ON DELETE SET NULL,

  CONSTRAINT hr_processamento_lancamentos_valor_nao_zero CHECK (valor <> 0),
  CONSTRAINT hr_processamento_lancamentos_valor_razoavel CHECK (abs(valor) <= 1000000),
  CONSTRAINT hr_processamento_lancamentos_descricao_nao_vazia CHECK (btrim(descricao) <> ''),
  -- So numa direccao (anulado_por IMPLICA anulado_em), nao equivalencia:
  -- anulado_por e FK ON DELETE SET NULL para anew_users, e a cascata que
  -- corre quando esse utilizador e apagado poe anulado_por a NULL numa linha
  -- ja anulada (anulado_em continua preenchido). Uma equivalencia rejeitava
  -- esse estado -- (false) = (true) -- e o DELETE em anew_users falhava em
  -- bruto, mesmo raciocinio de hr_periodos_processamento_fechado_consistente
  -- (20261201220000) para fechado_por.
  CONSTRAINT hr_processamento_lancamentos_anulado_consistente
    CHECK (anulado_por IS NULL OR anulado_em IS NOT NULL),
  CONSTRAINT hr_processamento_lancamentos_anulado_motivo_obrigatorio
    CHECK (anulado_em IS NULL OR btrim(coalesce(anulado_motivo, '')) <> '')
);

COMMENT ON TABLE public.hr_processamento_lancamentos IS
'Premios e outros valores pontuais lancados a uma pessoa dentro de um periodo de processamento salarial. Uma linha anulada NUNCA se apaga: fica visivel, marcada por anulado_em/anulado_por/anulado_motivo. INSERT/UPDATE directos bloqueados a authenticated: a unica escrita e por rpc_hr_processamento_lancamento_criar e rpc_hr_processamento_lancamento_anular (SECURITY DEFINER), que tambem recusam qualquer escrita quando o periodo ja esta "fechado". Depois de anulada, a linha e completamente imutavel (trg_hr_processamento_lancamento_imutavel_apos_anular); enquanto activa, so a transicao para anulada e permitida por UPDATE.';
COMMENT ON COLUMN public.hr_processamento_lancamentos.codigo_processamento_id IS
'Opcional: liga o lancamento a um codigo do catalogo (hr_codigos_processamento, transversal ou proprio da organizacao). NULL = valor solto, sem codigo.';
COMMENT ON COLUMN public.hr_processamento_lancamentos.valor IS
'Valor pontual em euros. Negativo E intencional -- descontos e correcoes tambem passam por aqui, nao so premios e reembolsos. Limitado a abs(valor) <= 1000000 (hr_processamento_lancamentos_valor_razoavel) e arredondado a 2 casas decimais pela RPC de criacao antes de gravar.';

CREATE INDEX IF NOT EXISTS idx_hr_processamento_lancamentos_periodo
  ON public.hr_processamento_lancamentos (periodo_id);
CREATE INDEX IF NOT EXISTS idx_hr_processamento_lancamentos_pessoa
  ON public.hr_processamento_lancamentos (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_hr_processamento_lancamentos_organization_id
  ON public.hr_processamento_lancamentos (organization_id);
CREATE INDEX IF NOT EXISTS idx_hr_processamento_lancamentos_anulado_por
  ON public.hr_processamento_lancamentos (anulado_por);
CREATE INDEX IF NOT EXISTS idx_hr_processamento_lancamentos_created_by
  ON public.hr_processamento_lancamentos (created_by);
CREATE INDEX IF NOT EXISTS idx_hr_processamento_lancamentos_updated_by
  ON public.hr_processamento_lancamentos (updated_by);
CREATE INDEX IF NOT EXISTS idx_hr_processamento_lancamentos_codigo_processamento_id
  ON public.hr_processamento_lancamentos (codigo_processamento_id);

DROP TRIGGER IF EXISTS trg_hr_processamento_lancamentos_updated_at ON public.hr_processamento_lancamentos;
CREATE TRIGGER trg_hr_processamento_lancamentos_updated_at
  BEFORE UPDATE ON public.hr_processamento_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Trigger: imutavel depois de anulada; so a transicao de anulacao muda
-- ---- uma linha activa ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_processamento_lancamento_imutavel_apos_anular()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.anulado_em IS NOT NULL THEN
    -- Linha ja anulada: fica completamente imutavel, EXCEPTO a transicao de
    -- preenchido para NULL em anulado_por, created_by, updated_by e
    -- codigo_processamento_id -- as tres primeiras sao FK ON DELETE SET NULL
    -- para anew_users e a ultima para hr_codigos_processamento, e essa
    -- transicao e a UNICA forma legitima de mudar depois de anulada (a
    -- cascata que corre quando esse utilizador ou codigo e apagado).
    -- Reintroduzir um valor, ou trocar por outro, continua recusado -- so a
    -- direccao preenchido->NULL passa.
    IF NEW.anulado_por IS DISTINCT FROM OLD.anulado_por
       AND NOT (OLD.anulado_por IS NOT NULL AND NEW.anulado_por IS NULL) THEN
      RAISE EXCEPTION 'Um lancamento anulado e imutavel: anulado_por so pode mudar de preenchido para NULL, pela cascata ON DELETE SET NULL de anew_users.'
        USING ERRCODE = '22000';
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       AND NOT (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL) THEN
      RAISE EXCEPTION 'Um lancamento anulado e imutavel: created_by so pode mudar de preenchido para NULL, pela cascata ON DELETE SET NULL de anew_users.'
        USING ERRCODE = '22000';
    END IF;

    IF NEW.updated_by IS DISTINCT FROM OLD.updated_by
       AND NOT (OLD.updated_by IS NOT NULL AND NEW.updated_by IS NULL) THEN
      RAISE EXCEPTION 'Um lancamento anulado e imutavel: updated_by so pode mudar de preenchido para NULL, pela cascata ON DELETE SET NULL de anew_users.'
        USING ERRCODE = '22000';
    END IF;

    IF NEW.codigo_processamento_id IS DISTINCT FROM OLD.codigo_processamento_id
       AND NOT (OLD.codigo_processamento_id IS NOT NULL AND NEW.codigo_processamento_id IS NULL) THEN
      RAISE EXCEPTION 'Um lancamento anulado e imutavel: codigo_processamento_id so pode mudar de preenchido para NULL, pela cascata ON DELETE SET NULL de hr_codigos_processamento.'
        USING ERRCODE = '22000';
    END IF;

    IF NEW.valor IS DISTINCT FROM OLD.valor
       OR NEW.descricao IS DISTINCT FROM OLD.descricao
       OR NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id
       OR NEW.periodo_id IS DISTINCT FROM OLD.periodo_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.anulado_em IS DISTINCT FROM OLD.anulado_em
       OR NEW.anulado_motivo IS DISTINCT FROM OLD.anulado_motivo THEN
      RAISE EXCEPTION 'Um lancamento anulado e imutavel: nenhuma coluna pode mudar por UPDATE directo, salvo a excepcao documentada para anulado_por, created_by, updated_by e codigo_processamento_id.'
        USING ERRCODE = '22000';
    END IF;

    RETURN NEW;
  END IF;

  -- Linha ainda activa: created_by e codigo_processamento_id tambem podem
  -- transitar de preenchido para NULL, pela mesma cascata ON DELETE SET NULL
  -- -- created_by aponta para anew_users, codigo_processamento_id para
  -- hr_codigos_processamento. Qualquer OUTRA mudanca a estas duas colunas
  -- (reintroduzir um valor, ou trocar por outro) continua recusada, tal como
  -- tudo o resto que nao seja a transicao para anulado.
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NOT (OLD.created_by IS NOT NULL AND NEW.created_by IS NULL) THEN
    RAISE EXCEPTION 'Um lancamento activo so aceita a transicao para anulado -- created_by so pode mudar de preenchido para NULL, pela cascata ON DELETE SET NULL de anew_users.'
      USING ERRCODE = '22000';
  END IF;

  IF NEW.codigo_processamento_id IS DISTINCT FROM OLD.codigo_processamento_id
     AND NOT (OLD.codigo_processamento_id IS NOT NULL AND NEW.codigo_processamento_id IS NULL) THEN
    RAISE EXCEPTION 'Um lancamento activo so aceita a transicao para anulado -- codigo_processamento_id so pode mudar de preenchido para NULL, pela cascata ON DELETE SET NULL de hr_codigos_processamento.'
      USING ERRCODE = '22000';
  END IF;

  IF NEW.valor IS DISTINCT FROM OLD.valor
     OR NEW.descricao IS DISTINCT FROM OLD.descricao
     OR NEW.pessoa_id IS DISTINCT FROM OLD.pessoa_id
     OR NEW.periodo_id IS DISTINCT FROM OLD.periodo_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Um lancamento activo so aceita a transicao para anulado -- valor, descricao, pessoa_id, periodo_id, organization_id e created_at nao podem mudar por UPDATE directo.'
      USING ERRCODE = '22000';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_processamento_lancamento_imutavel_apos_anular() IS
'Guarda de imutabilidade de hr_processamento_lancamentos. Uma linha ja anulada (anulado_em IS NOT NULL) fica completamente imutavel, EXCEPTO a transicao de preenchido para NULL em anulado_por, created_by, updated_by (FK ON DELETE SET NULL para anew_users) e codigo_processamento_id (FK ON DELETE SET NULL para hr_codigos_processamento) -- as quatro sao a UNICA forma legitima de mudar depois de anulada (cascata quando esse utilizador ou codigo e apagado), nunca uma edicao arbitraria. Uma linha ainda activa so aceita a transicao para anulado (anulado_em/anulado_por/anulado_motivo de NULL para preenchido, mais updated_at/updated_by), mais a mesma excepcao de cascata para created_by (anew_users) e codigo_processamento_id (hr_codigos_processamento) -- qualquer OUTRA alteracao a valor, descricao, pessoa_id, periodo_id, organization_id, codigo_processamento_id, created_at ou created_by e recusada. SECURITY INVOKER: so le OLD/NEW, nao precisa de privilegios elevados.';

DROP TRIGGER IF EXISTS trg_hr_processamento_lancamento_imutavel_apos_anular ON public.hr_processamento_lancamentos;
CREATE TRIGGER trg_hr_processamento_lancamento_imutavel_apos_anular
  BEFORE UPDATE ON public.hr_processamento_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_processamento_lancamento_imutavel_apos_anular();

COMMENT ON TRIGGER trg_hr_processamento_lancamento_imutavel_apos_anular ON public.hr_processamento_lancamentos IS
'Aplica public.hr_processamento_lancamento_imutavel_apos_anular() -- ver COMMENT da funcao.';

-- ---- Grants: escrita so por RPC ---------------------------------------------
REVOKE ALL ON TABLE public.hr_processamento_lancamentos FROM anon;
REVOKE ALL ON TABLE public.hr_processamento_lancamentos FROM authenticated;

GRANT SELECT ON TABLE public.hr_processamento_lancamentos TO authenticated;
GRANT ALL ON TABLE public.hr_processamento_lancamentos TO service_role;

ALTER TABLE public.hr_processamento_lancamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_processamento_lancamentos_select ON public.hr_processamento_lancamentos;
CREATE POLICY hr_processamento_lancamentos_select ON public.hr_processamento_lancamentos
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.processamento.periodo.view', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.processamento.lancamentos.gerir', organization_id))
  );

COMMENT ON POLICY hr_processamento_lancamentos_select ON public.hr_processamento_lancamentos IS
'Ve quem tem hr.processamento.periodo.view (o resumo do periodo, lancamentos incluidos) OU hr.processamento.lancamentos.gerir NAQUELA organizacao. Uma linha anulada continua visivel -- nao ha soft delete aqui.';

DROP POLICY IF EXISTS hr_processamento_lancamentos_block_insert ON public.hr_processamento_lancamentos;
CREATE POLICY hr_processamento_lancamentos_block_insert ON public.hr_processamento_lancamentos
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS hr_processamento_lancamentos_block_update ON public.hr_processamento_lancamentos;
CREATE POLICY hr_processamento_lancamentos_block_update ON public.hr_processamento_lancamentos
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS hr_processamento_lancamentos_block_delete ON public.hr_processamento_lancamentos;
CREATE POLICY hr_processamento_lancamentos_block_delete ON public.hr_processamento_lancamentos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_processamento_lancamentos_block_insert ON public.hr_processamento_lancamentos IS
'INSERT bloqueado por completo a authenticated: a unica forma de criar um lancamento e rpc_hr_processamento_lancamento_criar, que tambem recusa escrever se o periodo ja estiver fechado.';
COMMENT ON POLICY hr_processamento_lancamentos_block_update ON public.hr_processamento_lancamentos IS
'UPDATE bloqueado por completo a authenticated. Anular nao e um UPDATE do cliente: e rpc_hr_processamento_lancamento_anular, que recusa anular num periodo fechado e exige motivo.';

-- ==============================================================================
-- RPC 1: criar
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_processamento_lancamento_criar(
  p_periodo_id uuid,
  p_pessoa_id uuid,
  p_descricao text,
  p_valor numeric,
  p_codigo_processamento_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_periodo   public.hr_periodos_processamento%ROWTYPE;
  v_pessoa_org uuid;
  v_autor_id  uuid;
  v_novo_id   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar exige um utilizador autenticado.';
  END IF;

  IF p_periodo_id IS NULL OR p_pessoa_id IS NULL THEN
    RAISE EXCEPTION 'p_periodo_id e p_pessoa_id sao obrigatorios.';
  END IF;

  IF p_descricao IS NULL OR btrim(p_descricao) = '' THEN
    RAISE EXCEPTION 'p_descricao nao pode ser vazia.';
  END IF;

  IF p_valor IS NULL OR p_valor = 0 THEN
    RAISE EXCEPTION 'p_valor tem de ser diferente de zero.';
  END IF;

  IF abs(round(p_valor, 2)) > 1000000 THEN
    RAISE EXCEPTION 'p_valor nao pode exceder 1.000.000 EUR em valor absoluto.';
  END IF;

  -- FOR SHARE, nao FOR UPDATE: fecha a corrida com
  -- rpc_hr_processamento_periodo_fechar (que usa FOR UPDATE na mesma linha),
  -- mas dois lancamentos concorrentes a pessoas diferentes do mesmo periodo
  -- ja nao se bloqueiam um ao outro -- so continuam bloqueados por, e a
  -- bloquear, um fecho de periodo em curso.
  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento
   WHERE id = p_periodo_id
   FOR SHARE;

  -- A verificacao de permissao corre logo depois do lock, ANTES de qualquer
  -- RAISE EXCEPTION que revele se o periodo existe ou o seu estado -- mesmo
  -- raciocinio de rpc_hr_processamento_periodo_fechar (20261201220000).
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.lancamentos.gerir', v_periodo.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.lancamentos.gerir nesta organizacao.';
  END IF;

  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', p_periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'Periodo % ja esta fechado -- nao aceita lancamentos novos.', p_periodo_id;
  END IF;

  SELECT p.organization_id INTO v_pessoa_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id
     AND p.deleted_at IS NULL;

  IF v_pessoa_org IS NULL THEN
    RAISE EXCEPTION 'Pessoa % nao encontrada.', p_pessoa_id;
  END IF;

  IF v_pessoa_org <> v_periodo.organization_id THEN
    RAISE EXCEPTION 'A pessoa % nao pertence a organizacao deste periodo.', p_pessoa_id;
  END IF;

  IF p_codigo_processamento_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hr_codigos_processamento c
     WHERE c.id = p_codigo_processamento_id
       AND c.activo
       AND (c.organization_id IS NULL OR c.organization_id = v_periodo.organization_id)
  ) THEN
    RAISE EXCEPTION 'Codigo de processamento % invalido, inactivo, ou de outra organizacao.', p_codigo_processamento_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  INSERT INTO public.hr_processamento_lancamentos (
    periodo_id, pessoa_id, organization_id, descricao, valor, codigo_processamento_id,
    created_by, updated_by
  ) VALUES (
    p_periodo_id, p_pessoa_id, v_periodo.organization_id, btrim(p_descricao), round(p_valor, 2), p_codigo_processamento_id,
    v_autor_id, v_autor_id
  )
  RETURNING id INTO v_novo_id;

  RETURN v_novo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_processamento_lancamento_criar(uuid, uuid, text, numeric, uuid) IS
'Cria um lancamento pontual (premio, reembolso, valor negociado) numa pessoa, dentro de um periodo ABERTO. Exige hr.processamento.lancamentos.gerir na organizacao do periodo. Recusa periodo fechado, pessoa de outra organizacao, e codigo de processamento invalido/inactivo/de outra organizacao.';

-- ==============================================================================
-- RPC 2: anular -- nunca apaga a linha, e so enquanto o periodo estiver aberto
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_processamento_lancamento_anular(
  p_lancamento_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth       uuid := auth.uid();
  v_lancamento public.hr_processamento_lancamentos%ROWTYPE;
  v_periodo    public.hr_periodos_processamento%ROWTYPE;
  v_autor_id   uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_processamento_lancamento_anular exige um utilizador autenticado.';
  END IF;

  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'p_motivo e obrigatorio para anular um lancamento.';
  END IF;

  -- FOR UPDATE: lock do proprio lancamento (nao do periodo -- isso e o
  -- SELECT seguinte). A permissao so pode ser verificada depois deste SELECT
  -- porque e dele que se conhece v_lancamento.organization_id.
  SELECT * INTO v_lancamento
    FROM public.hr_processamento_lancamentos
   WHERE id = p_lancamento_id
   FOR UPDATE;

  -- Ordem: SELECT lancamento FOR UPDATE -> verificar permissao -> verificar
  -- se o lancamento existe -> SELECT periodo FOR SHARE -> verificar se o
  -- periodo esta fechado -> verificar se ja esta anulado. A permissao corre
  -- ANTES do "nao encontrado" pelo mesmo motivo de
  -- rpc_hr_processamento_periodo_fechar: quando o lancamento nao existe,
  -- v_lancamento.organization_id fica NULL e has_anew_permission_in_org
  -- devolve false, por isso quem nao tem a permissao nunca distingue
  -- "lancamento inexistente" de qualquer outro estado.
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.processamento.lancamentos.gerir', v_lancamento.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.processamento.lancamentos.gerir nesta organizacao.';
  END IF;

  IF v_lancamento.id IS NULL THEN
    RAISE EXCEPTION 'Lancamento % nao encontrado.', p_lancamento_id;
  END IF;

  -- FOR SHARE no periodo, nao FOR UPDATE: mesma corrida com
  -- rpc_hr_processamento_periodo_fechar que a RPC de criar ja trata, sem
  -- bloquear anulacoes concorrentes de lancamentos diferentes do mesmo
  -- periodo entre si.
  SELECT * INTO v_periodo
    FROM public.hr_periodos_processamento
   WHERE id = v_lancamento.periodo_id
   FOR SHARE;

  -- Guarda simetrica a de criar: a FK ja garante que isto nao acontece
  -- (periodo_id nunca aponta para um periodo inexistente), mas fica
  -- explicito por simetria e para nao depender so da FK.
  IF v_periodo.id IS NULL THEN
    RAISE EXCEPTION 'Periodo % nao encontrado.', v_lancamento.periodo_id;
  END IF;

  IF v_periodo.estado = 'fechado' THEN
    RAISE EXCEPTION 'O periodo deste lancamento ja esta fechado -- nao aceita anulacoes.';
  END IF;

  IF v_lancamento.anulado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Lancamento % ja esta anulado.', p_lancamento_id;
  END IF;

  SELECT au.id INTO v_autor_id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  IF v_autor_id IS NULL THEN
    RAISE EXCEPTION 'Utilizador autenticado sem ficha em anew_users.';
  END IF;

  UPDATE public.hr_processamento_lancamentos
     SET anulado_em = now(),
         anulado_por = v_autor_id,
         anulado_motivo = btrim(p_motivo),
         updated_by = v_autor_id
   WHERE id = p_lancamento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_processamento_lancamento_anular(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_processamento_lancamento_anular(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_lancamento_anular(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_processamento_lancamento_anular(uuid, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_processamento_lancamento_anular(uuid, text) IS
'Anula um lancamento JA CRIADO, sem apagar a linha. Recusa anular quando o periodo do lancamento ja esta fechado, quando o lancamento ja estava anulado, ou sem hr.processamento.lancamentos.gerir na organizacao. Exige motivo nao vazio.';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas integer;
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'hr_processamento_lancamentos';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'hr_processamento_lancamentos ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hr_processamento_lancamentos'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activo em hr_processamento_lancamentos.';
  END IF;

  IF has_table_privilege('authenticated', 'public.hr_processamento_lancamentos', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hr_processamento_lancamentos', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hr_processamento_lancamentos', 'DELETE')
     OR has_table_privilege('authenticated', 'public.hr_processamento_lancamentos', 'TRUNCATE') THEN
    RAISE EXCEPTION 'authenticated tem INSERT, UPDATE, DELETE ou TRUNCATE em hr_processamento_lancamentos -- devia ter zero.';
  END IF;

  IF (SELECT count(*) FROM public.anew_permissions WHERE code = 'hr.processamento.lancamentos.gerir') <> 1 THEN
    RAISE EXCEPTION 'hr.processamento.lancamentos.gerir nao ficou no catalogo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_role_permissions WHERE permission_code = 'hr.processamento.lancamentos.gerir'
  ) THEN
    RAISE EXCEPTION 'hr.processamento.lancamentos.gerir ja esta atribuido a um papel -- esta migracao so cria catalogo/tabela/RPCs.';
  END IF;

  -- A trigger nova (imutabilidade apos anular) tem de existir e estar activa,
  -- ao lado da ja existente de updated_at -- 2 triggers no total.
  IF (
    SELECT count(*) FROM pg_trigger t
     WHERE t.tgrelid = 'public.hr_processamento_lancamentos'::regclass
       AND NOT t.tgisinternal
  ) <> 2 THEN
    RAISE EXCEPTION 'hr_processamento_lancamentos devia ter 2 triggers (updated_at + imutavel_apos_anular).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.hr_processamento_lancamentos'::regclass
       AND t.tgname = 'trg_hr_processamento_lancamento_imutavel_apos_anular'
       AND t.tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'trg_hr_processamento_lancamento_imutavel_apos_anular nao existe ou nao esta activa em hr_processamento_lancamentos.';
  END IF;

  -- 4) Teste ao vivo, contra a organizacao nike. hr.processamento.lancamentos.gerir
  -- e hr.processamento.periodo.gerir sao permissoes NOVAS e, por desenho
  -- (verificado acima: "nao atribuida a um papel"), esta migracao nao as
  -- atribui a ninguem -- por isso NENHUM utilizador real as tem neste preciso
  -- momento. Mesmo padrao de 20261201220000 (hr_periodos_processamento) e de
  -- 20261201100000 (hr_obras_horas): atribui as duas permissoes
  -- TEMPORARIAMENTE ao papel super_admin, so dentro desta subtransaccao --
  -- desfeita, com tudo o resto (periodo, pessoas, organizacao descartavel,
  -- lancamentos), pela mesma sentinela HR900 abaixo. Cria o SEU PROPRIO
  -- periodo (ano=2099, mes=2, distinto do mes=1 que 20261201220000 usa no seu
  -- proprio PASSO 4) -- nunca depende de um periodo de outra migracao
  -- persistir, porque o dela tambem e revertido por rollback.
  DECLARE
    v_org_nike        uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
    v_role_id         uuid;
    v_uid_real        uuid;
    v_periodo_id      uuid;
    v_pessoa_nike     uuid;
    v_org_outra       uuid;
    v_pessoa_outra    uuid;
    v_codigo_invalido uuid := gen_random_uuid();
    v_lancamento_id   uuid;
    v_lancamento_id2  uuid;
    v_row             public.hr_processamento_lancamentos%ROWTYPE;
    v_falhou_valor_zero     boolean := false;
    v_falhou_descricao      boolean := false;
    v_falhou_cross_org      boolean := false;
    v_falhou_codigo         boolean := false;
    v_falhou_repetir_anular boolean := false;
    v_falhou_update_directo boolean := false;
    v_falhou_periodo_fechado_criar  boolean := false;
    v_falhou_periodo_fechado_anular boolean := false;
  BEGIN
    SELECT au.auth_user_id, am.role_id
      INTO v_uid_real, v_role_id
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
      JOIN public.anew_roles ar ON ar.id = am.role_id AND ar.code = 'super_admin'
     WHERE am.organization_id = v_org_nike
       AND am.status = 'active'
     LIMIT 1;

    IF v_uid_real IS NULL THEN
      RAISE NOTICE 'PASSO 4 SALTADO: nenhum utilizador com membership activo e papel super_admin na nike foi encontrado -- rpc_hr_processamento_lancamento_criar/anular nao foram exercitadas ao vivo nesta migracao (so as verificacoes estruturais acima correram).';
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_protect_system_role_perms'
           AND tgrelid = to_regclass('public.anew_role_permissions')
      ) THEN
        RAISE EXCEPTION
          'O trigger trg_protect_system_role_perms nao existe. Este bloco desactiva-o e reactiva-o; sem ele o estado nao e o esperado.';
      END IF;

      EXECUTE 'ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms';

      INSERT INTO public.anew_role_permissions (role_id, permission_code)
      VALUES
        (v_role_id, 'hr.processamento.periodo.gerir'),
        (v_role_id, 'hr.processamento.lancamentos.gerir')
      ON CONFLICT (role_id, permission_code) DO NOTHING;

      EXECUTE 'ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms';

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_uid_real, 'role', 'authenticated')::text, true);

      -- 4.1: abrir um periodo de teste (2099, mes 2).
      SELECT public.rpc_hr_processamento_periodo_abrir(v_org_nike, 2099::smallint, 2::smallint) INTO v_periodo_id;

      -- 4.2: criar uma pessoa de teste na nike (mesmo padrao de hr_obras_horas).
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
      VALUES (v_org_nike, 'Teste Migracao', 'Lancamentos 20261201230000')
      RETURNING id INTO v_pessoa_nike;

      -- 4.3: criar um lancamento com sucesso -- confirma a linha criada.
      SELECT public.rpc_hr_processamento_lancamento_criar(
        v_periodo_id, v_pessoa_nike, 'Premio Teste 20261201230000', 123.45
      ) INTO v_lancamento_id;

      SELECT * INTO v_row FROM public.hr_processamento_lancamentos WHERE id = v_lancamento_id;

      IF v_row.id IS NULL
         OR v_row.periodo_id IS DISTINCT FROM v_periodo_id
         OR v_row.pessoa_id IS DISTINCT FROM v_pessoa_nike
         OR v_row.organization_id IS DISTINCT FROM v_org_nike
         OR v_row.valor <> 123.45
         OR v_row.descricao <> 'Premio Teste 20261201230000'
         OR v_row.anulado_em IS NOT NULL THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar nao criou a linha como esperado (periodo_id=%, pessoa_id=%, organization_id=%, valor=%, descricao=%, anulado_em=%).',
          v_row.periodo_id, v_row.pessoa_id, v_row.organization_id, v_row.valor, v_row.descricao, v_row.anulado_em
          USING ERRCODE = 'HR940';
      END IF;

      -- Segundo lancamento, activo, guardado para o passo 4.13 (anular num
      -- periodo ja fechado) -- o do passo 4.3 e anulado no 4.8, por isso nao
      -- serve para provar a regra "periodo fechado recusa anular".
      SELECT public.rpc_hr_processamento_lancamento_criar(
        v_periodo_id, v_pessoa_nike, 'Segundo lancamento 20261201230000', 10.00
      ) INTO v_lancamento_id2;

      -- 4.4: p_valor = 0 tem de ser recusado.
      BEGIN
        PERFORM public.rpc_hr_processamento_lancamento_criar(v_periodo_id, v_pessoa_nike, 'Valor zero', 0);
      EXCEPTION WHEN OTHERS THEN
        IF position('p_valor tem de ser diferente de zero' IN SQLERRM) > 0 THEN
          v_falhou_valor_zero := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_valor_zero THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar aceitou p_valor = 0.' USING ERRCODE = 'HR941';
      END IF;

      -- 4.5: p_descricao vazia tem de ser recusada.
      BEGIN
        PERFORM public.rpc_hr_processamento_lancamento_criar(v_periodo_id, v_pessoa_nike, '   ', 10);
      EXCEPTION WHEN OTHERS THEN
        IF position('p_descricao nao pode ser vazia' IN SQLERRM) > 0 THEN
          v_falhou_descricao := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_descricao THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar aceitou p_descricao vazia.' USING ERRCODE = 'HR942';
      END IF;

      -- 4.6: pessoa de OUTRA organizacao tem de ser recusada. Organizacao e
      -- pessoa descartaveis, criadas so para este teste -- mais simples e
      -- mais seguro de reverter do que ir buscar uma pessoa real de outra
      -- organizacao (essas sao so-leitura, regra do workspace); revertidas
      -- pela mesma sentinela HR900, nao por DELETE manual.
      INSERT INTO public.anew_organizations (name)
      VALUES ('__conferir_20261201230000__')
      RETURNING id INTO v_org_outra;

      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
      VALUES (v_org_outra, 'Teste', 'OutraOrganizacao 20261201230000')
      RETURNING id INTO v_pessoa_outra;

      BEGIN
        PERFORM public.rpc_hr_processamento_lancamento_criar(v_periodo_id, v_pessoa_outra, 'Cross org', 10);
      EXCEPTION WHEN OTHERS THEN
        IF position('nao pertence a organizacao deste periodo' IN SQLERRM) > 0 THEN
          v_falhou_cross_org := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_cross_org THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar aceitou uma pessoa de outra organizacao.' USING ERRCODE = 'HR943';
      END IF;

      -- 4.7: codigo_processamento_id inexistente tem de ser recusado.
      BEGIN
        PERFORM public.rpc_hr_processamento_lancamento_criar(
          v_periodo_id, v_pessoa_nike, 'Codigo invalido', 10, v_codigo_invalido
        );
      EXCEPTION WHEN OTHERS THEN
        IF position('Codigo de processamento' IN SQLERRM) > 0 THEN
          v_falhou_codigo := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_codigo THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar aceitou um codigo_processamento_id inexistente.' USING ERRCODE = 'HR944';
      END IF;

      -- 4.8: anular o lancamento do passo 4.3, com sucesso.
      PERFORM public.rpc_hr_processamento_lancamento_anular(v_lancamento_id, 'Motivo de teste 20261201230000');

      SELECT * INTO v_row FROM public.hr_processamento_lancamentos WHERE id = v_lancamento_id;

      IF v_row.id IS NULL
         OR v_row.anulado_em IS NULL
         OR v_row.anulado_por IS NULL
         OR v_row.anulado_motivo IS DISTINCT FROM 'Motivo de teste 20261201230000' THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_anular nao deixou a linha marcada como esperado (anulado_em=%, anulado_por=%, anulado_motivo=%).',
          v_row.anulado_em, v_row.anulado_por, v_row.anulado_motivo
          USING ERRCODE = 'HR945';
      END IF;

      -- 4.9: anular outra vez o mesmo lancamento tem de ser recusado.
      BEGIN
        PERFORM public.rpc_hr_processamento_lancamento_anular(v_lancamento_id, 'Segunda tentativa de anular');
      EXCEPTION WHEN OTHERS THEN
        IF position('ja esta anulado' IN SQLERRM) > 0 THEN
          v_falhou_repetir_anular := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_repetir_anular THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_anular aceitou anular um lancamento ja anulado.' USING ERRCODE = 'HR946';
      END IF;

      -- 4.10: UPDATE directo (como postgres/dono, simulando o que service_role
      -- poderia tentar) na linha ja anulada, mudando valor -- tem de ser
      -- recusado pela trigger trg_hr_processamento_lancamento_imutavel_apos_anular.
      BEGIN
        UPDATE public.hr_processamento_lancamentos SET valor = 999.99 WHERE id = v_lancamento_id;
      EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = '22000' AND position('imutavel' IN SQLERRM) > 0 THEN
          v_falhou_update_directo := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_update_directo THEN
        RAISE EXCEPTION 'Um UPDATE directo mudou valor numa linha ja anulada -- trg_hr_processamento_lancamento_imutavel_apos_anular nao bloqueou.' USING ERRCODE = 'HR947';
      END IF;

      -- 4.10b: simular directamente a cascata ON DELETE SET NULL de
      -- anew_users sobre a linha ja anulada (v_lancamento_id, anulado_por
      -- preenchido desde o 4.8) -- prova ao vivo a correcao desta migracao:
      -- o CHECK hr_processamento_lancamentos_anulado_consistente deixou de
      -- ser uma equivalencia ((anulado_em IS NULL) = (anulado_por IS NULL))
      -- e passou a uma implicacao numa so direccao, e a excepcao ja existente
      -- na trigger para esta coluna continua a deixar passar so este sentido.
      -- Sem a correcao ao CHECK, este UPDATE falhava com (false) = (true).
      UPDATE public.hr_processamento_lancamentos SET anulado_por = NULL WHERE id = v_lancamento_id;

      SELECT * INTO v_row FROM public.hr_processamento_lancamentos WHERE id = v_lancamento_id;

      IF v_row.anulado_por IS NOT NULL OR v_row.anulado_em IS NULL THEN
        RAISE EXCEPTION 'A transicao anulado_por preenchido->NULL numa linha ja anulada nao ficou como esperado (anulado_por=%, anulado_em=%) -- o CHECK hr_processamento_lancamentos_anulado_consistente ou a trigger estao a bloquear a cascata ON DELETE SET NULL de anew_users.',
          v_row.anulado_por, v_row.anulado_em
          USING ERRCODE = 'HR9410';
      END IF;

      -- 4.11: fechar o periodo de teste.
      PERFORM public.rpc_hr_processamento_periodo_fechar(v_periodo_id);

      -- 4.12: criar um lancamento novo nesse periodo (agora fechado) tem de
      -- ser recusado -- a regra central deste ficheiro.
      BEGIN
        PERFORM public.rpc_hr_processamento_lancamento_criar(v_periodo_id, v_pessoa_nike, 'Periodo fechado', 10);
      EXCEPTION WHEN OTHERS THEN
        IF position('ja esta fechado' IN SQLERRM) > 0 THEN
          v_falhou_periodo_fechado_criar := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_periodo_fechado_criar THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_criar aceitou criar num periodo fechado.' USING ERRCODE = 'HR948';
      END IF;

      -- 4.13: anular um lancamento existente (v_lancamento_id2, ainda activo)
      -- nesse periodo agora fechado tem de ser recusado.
      BEGIN
        PERFORM public.rpc_hr_processamento_lancamento_anular(v_lancamento_id2, 'Tentativa apos fecho');
      EXCEPTION WHEN OTHERS THEN
        IF position('ja esta fechado' IN SQLERRM) > 0 THEN
          v_falhou_periodo_fechado_anular := true;
        ELSE
          RAISE;
        END IF;
      END;
      IF NOT v_falhou_periodo_fechado_anular THEN
        RAISE EXCEPTION 'rpc_hr_processamento_lancamento_anular aceitou anular num periodo fechado.' USING ERRCODE = 'HR949';
      END IF;

      RAISE NOTICE 'PASSO 4: rpc_hr_processamento_lancamento_criar e rpc_hr_processamento_lancamento_anular exercitadas ao vivo contra a nike (uid=%) -- criar com sucesso, valor=0 recusado, descricao vazia recusada, pessoa de outra organizacao recusada, codigo invalido recusado, anular com sucesso, segunda anulacao recusada, UPDATE directo apos anular recusado, cascata anulado_por preenchido->NULL numa linha anulada aceite (CHECK anulado_consistente + trigger), periodo fechado recusa criar e recusa anular, tudo confirmado.', v_uid_real;
    END IF;

    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'teste_hr_processamento_lancamentos_20261201230000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados/atribuicoes/organizacao de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
      RAISE EXCEPTION
        'Um dos testes desta migracao (hr_processamento_lancamentos) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'OK: hr_processamento_lancamentos com 4 politicas, RLS activo, zero grants de escrita a authenticated, catalogo com 1 codigo sem atribuicao a papel, trigger de imutabilidade apos anular activa, RPCs exercitadas ao vivo contra a nike quando havia super_admin disponivel.';
END;
$conferir$;
