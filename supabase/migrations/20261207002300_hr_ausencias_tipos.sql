-- ==============================================================================
-- hr_ausencias_tipos: o catalogo de tipos de ausencia, por organizacao.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Hoje os tipos de ausencia sao seis valores em codigo no frontend
-- (vacation, sick_leave, personal, unpaid, absence, other), escritos em
-- schedule_items.time_off_type, um text sem CHECK e sem catalogo. Nenhuma
-- organizacao pode acrescentar "licenca de casamento" ou dizer que a sua
-- doenca nao desconta saldo -- isso e uma alteracao de codigo.
--
-- E as REGRAS de cada tipo (desconta saldo? exige aprovacao? conta para o
-- minimo legal de 20 dias uteis?) nao existem em sitio nenhum: vivem
-- espalhadas em ifs de UI, cada um com a sua versao.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = um tipo de ausencia de UMA organizacao. O tipo carrega as suas
-- regras como dados, nao como enum de codigo: remunerada, desconta_saldo,
-- conta_minimo_legal, exige_aprovacao_chefia, exige_aprovacao_rh,
-- exige_justificacao, justificacao_sensivel, permite_meio_dia,
-- inclui_fim_de_semana, inclui_feriados, antecedencia_minima_dias.
--
-- categoria e um CHECK fechado (ferias / doenca / parentalidade /
-- sem_retribuicao / falta_justificada / falta_injustificada / compensacao /
-- outro): e por ela que os relatorios agrupam, e um text livre ali tornaria
-- qualquer agregacao uma adivinha.
--
-- codigo e o valor que a projeccao escreve em schedule_items.time_off_type.
-- ACEITA os seis valores hardcoded de hoje, sem os impor: uma organizacao que
-- queira 'vacation' escreve 'vacation'.
--
-- unidade_apresentacao existe porque a contabilidade desta ronda e em DIAS
-- (numeric(6,2), permite 0,25 e 0,5) e alguns tipos apresentam-se em horas. A
-- unidade canonica e o dia por uma razao concreta: a guarda legal e o contador
-- sao em dias uteis, e converter dias em minutos exigiria o horario planeado
-- da pessoa em cada leitura de saldo -- horario que e editavel
-- retroactivamente, o que faria o saldo de Marco mudar por causa de uma
-- correccao de horario feita em Novembro.
--
--
-- -- SEM SEED ------------------------------------------------------------------
--
-- Nenhuma organizacao fica com tipos por magia, ao contrario do board de
-- agenda. Criar o catalogo e decisao de produto de cada organizacao, e a UI da
-- ronda seguinte oferece-o. Consequencia dita as claras: no dia em que esta
-- migracao for aplicada, nao ha tipo nenhum e nao se consegue pedir ausencia
-- nenhuma ate alguem com hr.ausencias.tipos.edit criar o primeiro.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Pedidos, dias, direitos, saldos e aprovacoes: migracoes seguintes.
-- - Nao se toca em schedule_items nem em time_off_type nesta migracao.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
-- - Quem so tem hr.ausencias.view.own ve os seus dias e NAO ve o nome do tipo:
--   esta tabela nao tem pessoa_id e por isso nao tem ramo de ficha-propria. E
--   a MESMA pendencia de produto que a ronda 2 registou para
--   hr_locais_trabalho, e fica levantada aqui tambem, nao resolvida as
--   escondidas.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e so depois de
-- apagar as tabelas que lhe apontam:
--   DROP TABLE public.hr_ausencias_tipos;
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid), 3 argumentos
--   20261121010000  hr.ausencias.tipos.view / .edit no catalogo
--   update_updated_at_column()  (baseline)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'update_updated_at_column() nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.tipos.view') THEN
    RAISE EXCEPTION
      'hr.ausencias.tipos.view nao esta no catalogo. Aplicar 20261121010000 primeiro, senao a tabela nasce invisivel para todos.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.tipos.edit') THEN
    RAISE EXCEPTION 'hr.ausencias.tipos.edit nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;

  IF to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'public.anew_organizations nao existe. Estado da base inesperado.';
  END IF;

  -- Colisao de nome: se a tabela ja existir sem a unique composta, nao e a
  -- desta migracao e nao se altera as cegas.
  IF to_regclass('public.hr_ausencias_tipos') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'hr_ausencias_tipos_id_org_key'
          AND conrelid = to_regclass('public.hr_ausencias_tipos')
     ) THEN
    RAISE EXCEPTION
      'Ja existe public.hr_ausencias_tipos sem a constraint hr_ausencias_tipos_id_org_key. Nao e a tabela desta migracao -- colisao de nome. Investigar.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_ausencias_tipos (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL,

  codigo                   text NOT NULL,
  nome                     text NOT NULL,
  descricao                text,
  categoria                text NOT NULL,
  cor                      text,

  -- As regras. Cada uma e uma decisao de RH que hoje vive num if de UI.
  remunerada               boolean NOT NULL DEFAULT true,
  desconta_saldo           boolean NOT NULL DEFAULT true,
  conta_minimo_legal       boolean NOT NULL DEFAULT false,
  exige_aprovacao_chefia   boolean NOT NULL DEFAULT true,
  exige_aprovacao_rh       boolean NOT NULL DEFAULT true,
  exige_justificacao       boolean NOT NULL DEFAULT false,
  justificacao_sensivel    boolean NOT NULL DEFAULT false,
  permite_meio_dia         boolean NOT NULL DEFAULT true,
  inclui_fim_de_semana     boolean NOT NULL DEFAULT false,
  inclui_feriados          boolean NOT NULL DEFAULT false,
  antecedencia_minima_dias smallint,

  unidade_apresentacao     text NOT NULL DEFAULT 'dia',
  activo                   boolean NOT NULL DEFAULT true,

  deleted_at               timestamptz,
  deleted_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid,
  updated_by               uuid,

  CONSTRAINT hr_ausencias_tipos_pkey PRIMARY KEY (id),

  -- A UNIQUE (id, organization_id) e a peca central do modulo: e o alvo das
  -- FKs COMPOSTAS das tabelas que apontam para ca. Sem ela, um pedido de uma
  -- organizacao podia usar um tipo de outra.
  CONSTRAINT hr_ausencias_tipos_id_org_key UNIQUE (id, organization_id),

  -- anew_organizations e RESTRICT, como hr_locais_trabalho e pessoas: e a
  -- tabela de organizacoes do modulo, e apagar uma organizacao com catalogo de
  -- ausencias de pe nao se faz em silencio.
  CONSTRAINT hr_ausencias_tipos_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_ausencias_tipos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_ausencias_tipos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_ausencias_tipos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_ausencias_tipos_codigo_nao_vazio
    CHECK (btrim(codigo) <> ''),
  CONSTRAINT hr_ausencias_tipos_nome_nao_vazio
    CHECK (btrim(nome) <> ''),

  -- CHECK fechado e nao text livre: e por categoria que os relatorios agrupam.
  CONSTRAINT hr_ausencias_tipos_categoria_valida
    CHECK (categoria IN ('ferias','doenca','parentalidade','sem_retribuicao',
                         'falta_justificada','falta_injustificada','compensacao','outro')),

  CONSTRAINT hr_ausencias_tipos_unidade_valida
    CHECK (unidade_apresentacao IN ('dia','hora')),

  CONSTRAINT hr_ausencias_tipos_antecedencia_nao_negativa
    CHECK (antecedencia_minima_dias IS NULL OR antecedencia_minima_dias >= 0),

  -- Uma justificacao sensivel sem justificacao exigida nao quer dizer nada: a
  -- marca de sensivel e sobre o documento, e sem documento nao ha o que marcar.
  CONSTRAINT hr_ausencias_tipos_sensivel_exige_justificacao
    CHECK (justificacao_sensivel = false OR exige_justificacao = true)
);

-- UNIQUE PARCIAL e case-insensitive: dois tipos vivos com o codigo 'Ferias' e
-- 'ferias' na mesma organizacao seriam o mesmo tipo em duplicado, e a
-- projeccao para time_off_type escreveria valores diferentes para a mesma coisa.
-- Parcial em deleted_at IS NULL para que um codigo apagado possa ser reusado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_ausencias_tipos_org_codigo
  ON public.hr_ausencias_tipos (organization_id, lower(btrim(codigo)))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_ausencias_tipos_org_activo
  ON public.hr_ausencias_tipos (organization_id, categoria)
  WHERE deleted_at IS NULL AND activo = true;

COMMENT ON TABLE public.hr_ausencias_tipos IS
'Catalogo de tipos de ausencia POR ORGANIZACAO, com as regras de cada tipo como DADOS e nao como enum de codigo. Substitui os seis valores hardcoded no frontend (vacation, sick_leave, personal, unpaid, absence, other), que continuam a ser codigos aceitaveis mas deixam de ser os unicos.

SEM SEED de proposito: nenhuma organizacao fica com tipos por magia. Enquanto nao houver um tipo criado, nao se pede ausencia nenhuma.

A contabilidade do modulo e em DIAS (numeric(6,2)), nao em minutos: a guarda legal e o contador sao em dias uteis, e derivar dias de minutos exigiria o horario planeado -- que e editavel retroactivamente e faria o saldo de Marco mudar com uma correccao de Novembro.';

COMMENT ON COLUMN public.hr_ausencias_tipos.codigo IS
'O valor que a projeccao escreve em schedule_items.time_off_type. Aceita os seis valores hardcoded de hoje sem os impor. Unico por organizacao, sem distinguir maiusculas, entre os tipos vivos.';

COMMENT ON COLUMN public.hr_ausencias_tipos.conta_minimo_legal IS
'true nos tipos que contam para o minimo legal de 20 dias uteis gozaveis. E este campo que liga o tipo a guarda de 20261121120000: sem ele a true, a troca de dias por dinheiro nao e limitada.';

COMMENT ON COLUMN public.hr_ausencias_tipos.justificacao_sensivel IS
'true quando o documento justificativo e dado de saude. Nao muda onde o documento e guardado -- ele vive sempre em pessoas_ausencias_justificacoes, tabela separada, porque a RLS e por LINHA e nao por coluna. Muda o registo de acesso: a revelacao passa por RPC e fica em pessoas_acessos_sensiveis.';

COMMENT ON COLUMN public.hr_ausencias_tipos.unidade_apresentacao IS
'dia ou hora, e e SO apresentacao. A contabilidade e sempre em dias; minutos, quando existe, viaja ao lado como informacao.';

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_hr_ausencias_tipos_updated_at ON public.hr_ausencias_tipos;
CREATE TRIGGER trg_hr_ausencias_tipos_updated_at
  BEFORE UPDATE ON public.hr_ausencias_tipos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Grants ----------------------------------------------------------------
REVOKE ALL ON TABLE public.hr_ausencias_tipos FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hr_ausencias_tipos TO authenticated;
GRANT ALL ON TABLE public.hr_ausencias_tipos TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.hr_ausencias_tipos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_ausencias_tipos_select ON public.hr_ausencias_tipos;
CREATE POLICY hr_ausencias_tipos_select ON public.hr_ausencias_tipos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.view', organization_id))
  );

DROP POLICY IF EXISTS hr_ausencias_tipos_insert ON public.hr_ausencias_tipos;
CREATE POLICY hr_ausencias_tipos_insert ON public.hr_ausencias_tipos
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.edit', organization_id))
  );

-- O USING NAO exige deleted_at IS NULL, de proposito: sem isso nao se
-- conseguiria reverter um soft delete, porque a linha apagada ficaria fora do
-- alcance da propria politica que a devia poder ressuscitar.
DROP POLICY IF EXISTS hr_ausencias_tipos_update ON public.hr_ausencias_tipos;
CREATE POLICY hr_ausencias_tipos_update ON public.hr_ausencias_tipos
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.tipos.edit', organization_id)));

DROP POLICY IF EXISTS hr_ausencias_tipos_block_delete ON public.hr_ausencias_tipos;
CREATE POLICY hr_ausencias_tipos_block_delete ON public.hr_ausencias_tipos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_ausencias_tipos_select ON public.hr_ausencias_tipos IS
'Ve o catalogo quem tem hr.ausencias.tipos.view NAQUELA organizacao. SEM ramo de ficha-propria: esta tabela nao tem pessoa_id. PENDENCIA DE PRODUTO conhecida, a mesma de hr_locais_trabalho: quem so tem hr.ausencias.view.own ve os seus dias e nao ve o NOME do tipo. Fica levantada, nao resolvida as escondidas.';

COMMENT ON POLICY hr_ausencias_tipos_block_delete ON public.hr_ausencias_tipos IS
'Nao se apaga um tipo de ausencia: ha pedidos aprovados a apontar-lhe, e um tipo desaparecido tornaria ilegivel o historico. Marca-se deleted_at, ou activo=false.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
BEGIN
  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'hr_ausencias_tipos';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em hr_ausencias_tipos, encontraram-se %.', v_politicas;
  END IF;

  -- get_user_visible_org_ids alarga a organizacao-mae, as filhas e as
  -- associadas. Em RH isso nunca acontece.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,''))
           LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION 'Alguma politica de hr_ausencias_tipos usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  -- has_anew_permission (global, sem organizacao) daria a permissao de uma
  -- organizacao poder sobre as linhas de outra.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos'
       AND (coalesce(qual,'') || ' ' || coalesce(with_check,''))
           ~ 'has_anew_permission\([^_]'
  ) THEN
    RAISE EXCEPTION 'Alguma politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_ausencias_tipos'
       AND policyname = 'hr_ausencias_tipos_update'
       AND (qual IS NULL OR with_check IS NULL)
  ) THEN
    RAISE EXCEPTION 'A politica de UPDATE nao tem USING e WITH CHECK ambos escritos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_ausencias_tipos_id_org_key'
       AND conrelid = to_regclass('public.hr_ausencias_tipos')
       AND cardinality(conkey) = 2
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_tipos_id_org_key nao e a UNIQUE (id, organization_id) esperada. As FKs compostas das tabelas seguintes dependem dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_hr_ausencias_tipos_org_codigo'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial do codigo por organizacao nao ficou criado.';
  END IF;

  RAISE NOTICE 'Conferido: hr_ausencias_tipos com RLS, 4 politicas e a unique composta.';
END;
$conferir$;
