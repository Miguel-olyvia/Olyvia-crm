-- ==============================================================================
-- pessoas_ausencias_pedidos: o pedido de ausencia.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Hoje uma ausencia e uma linha em schedule_items, criada directamente pelo
-- formulario, com approval_status='pending' escrito pelo proprio cliente. Nao
-- ha pedido: ha uma marcacao no calendario que alguem carimba depois. Daqui
-- resulta que a ausencia existe antes de ser autorizada, que quem a criou
-- decide o seu proprio estado de aprovacao, e que nao ha onde guardar quem
-- pediu, a quem, com que antecedencia, e a que periodo de saldo imputa.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- O PEDIDO NASCE AQUI. schedule_items passa a ser uma PROJECCAO, nunca uma
-- origem (20261121130000).
--
-- Cinco decisoes que ficam escritas:
--
-- 1. estado e uma CACHE, nao a fonte da verdade. A fonte e
--    pessoas_ausencias_pedido_decisoes (20261121070000), append-only. A coluna
--    fica porque a fila de pendentes e a consulta mais frequente do modulo e
--    nao se resolve com um LATERAL a tabela de decisoes em cada linha. A
--    maquina de estados de 20261121110000 garante-lhe a coerencia.
--
-- 2. SEM deleted_at. Cancelar e um ESTADO, nao um apagamento: um pedido
--    cancelado tem de continuar a explicar porque aquele dia esteve reservado.
--
-- 3. dias_solicitados e GRAVADO e nao calculado na leitura. Depende dos
--    feriados e do calendario NO MOMENTO DO PEDIDO -- mudar um feriado em
--    Dezembro nao pode reescrever o que foi aprovado em Marco.
--
-- 4. aprovador_chefia_pessoa_id e um SNAPSHOT, resolvido por
--    hr_ausencias_aprovador_chefia no momento do pedido. Quando alguem muda de
--    chefe em Julho, os pedidos de Marco continuam a dizer quem os tinha de
--    aprovar. (A RLS usa a hierarquia actual; sao coisas diferentes.)
--
-- 5. periodo_inicio / periodo_fim tambem sao snapshot: o periodo de saldo a que
--    o pedido imputa fica preso ao pedido, e nao se recalcula quando o direito
--    do ano seguinte for criado.
--
-- estado: pendente_chefia / pendente_rh / aprovado / recusado / cancelado.
-- Aqui e so o CHECK do dominio; as ARESTAS entre eles sao a maquina de estados
-- de 20261121110000, e ate essa migracao ser aplicada nada muda o estado
-- porque a escrita esta fechada.
--
--
-- -- ESCRITA FECHADA -----------------------------------------------------------
--
-- authenticated tem SELECT e mais nada; tres politicas AS RESTRICTIVE ... false
-- e a escrita entra toda por RPC SECURITY DEFINER. Razao: criar um pedido nao e
-- inserir uma linha -- resolve a chefia, expande os dias civis, verifica
-- sobreposicoes, imputa periodos de saldo e cria a projeccao no board. Um
-- WITH CHECK nao garante nada disso.
--
-- E ha o precedente: a RLS de UPDATE de schedule_items sem WITH CHECK e
-- exactamente o buraco por onde hoje se muda approval_status e user_id para
-- valores fora do proprio ambito.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - A maquina de estados, as RPCs e o espelho para os dias: 20261121110000.
-- - A ligacao ao board (schedule_item_id passa a ter uma projeccao do outro
--   lado): 20261121130000. Ate la a coluna existe e fica NULL.
-- - Nao se toca em schedule_items nesta migracao.
-- - Nao se toca em pessoas_vinculos nem em pessoas_retribuicoes.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TABLE public.pessoas_ausencias_pedidos;
--
--
-- Prerequisitos:
--   20261120030000  pessoas (unique pessoas_id_org_key)
--   20261120060000  pessoas_vinculos (unique pessoas_vinculos_id_pessoa_org_key)
--   20261120040000  hr_satelite_ancora_imutavel()
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261121020000  hr_ausencias_tipos
--   20261121050000  hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe. Aplicar 20261120030000 primeiro.';
  END IF;

  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;

  IF to_regclass('public.schedule_items') IS NULL THEN
    RAISE EXCEPTION 'public.schedule_items nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_vinculos_id_pessoa_org_key nao existe; a FK composta de vinculo_id depende dela.';
  END IF;

  -- Por nome E aridade: a de 3 argumentos, nunca uma versao antiga.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_pessoa_na_minha_cadeia' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'hr_ausencias_pessoa_na_minha_cadeia(uuid, uuid, uuid) nao existe. Aplicar 20261121050000 primeiro: a politica de SELECT depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid, uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.view') THEN
    RAISE EXCEPTION 'hr.ausencias.view nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pessoas_ausencias_pedidos (
  id                         uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id            uuid NOT NULL,
  pessoa_id                  uuid NOT NULL,

  tipo_id                    uuid NOT NULL,
  vinculo_id                 uuid,

  data_inicio                date NOT NULL,
  data_fim                   date NOT NULL,
  meio_dia_inicio            boolean NOT NULL DEFAULT false,
  meio_dia_fim               boolean NOT NULL DEFAULT false,
  hora_inicio                time,
  hora_fim                   time,

  -- GRAVADO, nao calculado na leitura: depende dos feriados no momento do
  -- pedido, e um feriado alterado em Dezembro nao reescreve Marco.
  dias_solicitados           numeric(6,2) NOT NULL,
  minutos_solicitados        integer,

  motivo                     text,

  -- CACHE do estado. A fonte da verdade e a tabela de decisoes.
  estado                     text NOT NULL DEFAULT 'pendente_chefia',

  -- SNAPSHOT de quem tinha de aprovar no momento do pedido.
  aprovador_chefia_pessoa_id uuid,
  criado_por_pessoa_id       uuid,

  origem                     text NOT NULL DEFAULT 'board',

  -- A projeccao no board. Ganha o outro lado da ligacao em 20261121130000.
  schedule_item_id           uuid,

  -- SNAPSHOT do periodo de saldo a que este pedido imputa.
  periodo_inicio             date NOT NULL,
  periodo_fim                date NOT NULL,

  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid,
  updated_by                 uuid,

  CONSTRAINT pessoas_ausencias_pedidos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_ausencias_pedidos_id_org_key UNIQUE (id, organization_id),

  -- Alvo das FKs compostas das decisoes, dos dias e das justificacoes: sem
  -- pessoa_id na chave, uma decisao podia apontar ao pedido de outra pessoa.
  CONSTRAINT pessoas_ausencias_pedidos_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  CONSTRAINT pessoas_ausencias_pedidos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  CONSTRAINT pessoas_ausencias_pedidos_tipo_fkey
    FOREIGN KEY (tipo_id, organization_id)
    REFERENCES public.hr_ausencias_tipos (id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_ausencias_pedidos_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  -- O aprovador e uma pessoa DA MESMA organizacao. FK composta: uma simples
  -- deixaria o pedido dizer que e aprovado por alguem de outra organizacao.
  CONSTRAINT pessoas_ausencias_pedidos_aprovador_fkey
    FOREIGN KEY (aprovador_chefia_pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id)
    ON DELETE SET NULL (aprovador_chefia_pessoa_id),

  CONSTRAINT pessoas_ausencias_pedidos_criado_por_pessoa_fkey
    FOREIGN KEY (criado_por_pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id)
    ON DELETE SET NULL (criado_por_pessoa_id),

  CONSTRAINT pessoas_ausencias_pedidos_schedule_item_fkey
    FOREIGN KEY (schedule_item_id) REFERENCES public.schedule_items (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_ausencias_pedidos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_ausencias_pedidos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_ausencias_pedidos_datas_validas
    CHECK (data_fim >= data_inicio),

  CONSTRAINT pessoas_ausencias_pedidos_dias_positivos
    CHECK (dias_solicitados > 0),
  CONSTRAINT pessoas_ausencias_pedidos_minutos_positivos
    CHECK (minutos_solicitados IS NULL OR minutos_solicitados > 0),

  CONSTRAINT pessoas_ausencias_pedidos_periodo_valido
    CHECK (periodo_fim > periodo_inicio),

  CONSTRAINT pessoas_ausencias_pedidos_estado_valido
    CHECK (estado IN ('pendente_chefia','pendente_rh','aprovado','recusado','cancelado')),

  CONSTRAINT pessoas_ausencias_pedidos_origem_valida
    CHECK (origem IN ('board','ficha','importacao')),

  -- As horas vem as duas ou nenhuma: uma so nao define intervalo.
  CONSTRAINT pessoas_ausencias_pedidos_horas_coerentes
    CHECK ((hora_inicio IS NULL) = (hora_fim IS NULL)),

  -- Um intervalo de horas so faz sentido dentro do mesmo dia; entre dias, a
  -- unidade e o dia e as horas nao querem dizer nada.
  CONSTRAINT pessoas_ausencias_pedidos_horas_no_mesmo_dia
    CHECK (hora_inicio IS NULL OR (data_inicio = data_fim AND hora_fim > hora_inicio)),

  -- Meio dia num pedido de um dia so: as duas marcas ao mesmo tempo num unico
  -- dia dariam o dia inteiro por dois meios dias, e a fraccao ficava errada.
  CONSTRAINT pessoas_ausencias_pedidos_meio_dia_coerente
    CHECK (data_inicio <> data_fim OR NOT (meio_dia_inicio AND meio_dia_fim))
);

-- A fila de pendentes e a consulta mais frequente do modulo.
CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedidos_fila
  ON public.pessoas_ausencias_pedidos (organization_id, estado, data_inicio)
  WHERE estado IN ('pendente_chefia','pendente_rh');

-- A fila da chefia: o que aquele aprovador tem em maos.
CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedidos_aprovador
  ON public.pessoas_ausencias_pedidos (aprovador_chefia_pessoa_id, estado)
  WHERE aprovador_chefia_pessoa_id IS NOT NULL AND estado = 'pendente_chefia';

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedidos_pessoa
  ON public.pessoas_ausencias_pedidos (pessoa_id, data_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedidos_periodo
  ON public.pessoas_ausencias_pedidos (pessoa_id, tipo_id, periodo_inicio);

CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedidos_schedule_item
  ON public.pessoas_ausencias_pedidos (schedule_item_id)
  WHERE schedule_item_id IS NOT NULL;

COMMENT ON TABLE public.pessoas_ausencias_pedidos IS
'O pedido de ausencia. E AQUI que a ausencia nasce; schedule_items passa a ser uma PROJECCAO e nunca uma origem.

estado e uma CACHE. A fonte da verdade e pessoas_ausencias_pedido_decisoes, append-only, porque a pergunta "quem aprovou isto" tem duas respostas simultaneas -- a chefia e o RH -- e uma coluna guarda uma.

SEM deleted_at: cancelar e um estado, nao um apagamento. Um pedido cancelado continua a explicar porque aquele dia esteve reservado.

dias_solicitados, aprovador_chefia_pessoa_id, periodo_inicio e periodo_fim sao todos SNAPSHOT. Feriados mudam, chefes mudam, periodos de saldo abrem e fecham -- e nenhuma dessas mudancas pode reescrever o que foi pedido e aprovado em Marco.';

COMMENT ON COLUMN public.pessoas_ausencias_pedidos.estado IS
'CACHE mantida pela maquina de estados de 20261121110000. As arestas permitidas sao: pendente_chefia -> pendente_rh / recusado / cancelado; pendente_rh -> aprovado / recusado / cancelado / pendente_chefia (devolvido); aprovado -> cancelado (exige hr.ausencias.historico.editar); recusado e cancelado sao terminais. Um pedido recusado pela chefia NUNCA chega ao RH, porque pendente_chefia -> aprovado nao existe como aresta.';

COMMENT ON COLUMN public.pessoas_ausencias_pedidos.aprovador_chefia_pessoa_id IS
'SNAPSHOT de hr_ausencias_aprovador_chefia no momento do pedido. NULL quando nao havia chefia resoluvel -- e nesse caso o pedido nasce em pendente_rh com uma decisao resultado=dispensado gravada, nunca em pendente_chefia a espera de ninguem.';

COMMENT ON COLUMN public.pessoas_ausencias_pedidos.dias_solicitados IS
'GRAVADO. Depende dos feriados e do calendario no momento do pedido; calcula-lo na leitura faria um feriado alterado em Dezembro reescrever o que foi aprovado em Marco.';

COMMENT ON COLUMN public.pessoas_ausencias_pedidos.schedule_item_id IS
'A projeccao no board de agenda. Fica NULL ate 20261121130000 existir. O item e criado pela propria RPC de pedir, com approval_status=pending e status=draft: o que deixa de existir e a marcacao AUTONOMA, nao a visibilidade do que se pediu.';

-- ---- Triggers de padrao ----------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_ausencias_pedidos_updated_at ON public.pessoas_ausencias_pedidos;
CREATE TRIGGER trg_pessoas_ausencias_pedidos_updated_at
  BEFORE UPDATE ON public.pessoas_ausencias_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_ausencias_pedidos_ancora ON public.pessoas_ausencias_pedidos;
CREATE TRIGGER trg_pessoas_ausencias_pedidos_ancora
  BEFORE UPDATE ON public.pessoas_ausencias_pedidos
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants: SELECT e mais nada -------------------------------------------
REVOKE ALL ON TABLE public.pessoas_ausencias_pedidos FROM anon;
REVOKE ALL ON TABLE public.pessoas_ausencias_pedidos FROM authenticated;
GRANT SELECT ON TABLE public.pessoas_ausencias_pedidos TO authenticated;
GRANT ALL ON TABLE public.pessoas_ausencias_pedidos TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.pessoas_ausencias_pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_ausencias_pedidos_select ON public.pessoas_ausencias_pedidos;
CREATE POLICY pessoas_ausencias_pedidos_select ON public.pessoas_ausencias_pedidos
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.aprovar.chefia', organization_id))
      AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoa_id, organization_id))
    )
  );

DROP POLICY IF EXISTS pessoas_ausencias_pedidos_block_insert ON public.pessoas_ausencias_pedidos;
CREATE POLICY pessoas_ausencias_pedidos_block_insert ON public.pessoas_ausencias_pedidos
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_pedidos_block_update ON public.pessoas_ausencias_pedidos;
CREATE POLICY pessoas_ausencias_pedidos_block_update ON public.pessoas_ausencias_pedidos
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_ausencias_pedidos_block_delete ON public.pessoas_ausencias_pedidos;
CREATE POLICY pessoas_ausencias_pedidos_block_delete ON public.pessoas_ausencias_pedidos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_ausencias_pedidos_select ON public.pessoas_ausencias_pedidos IS
'Tres ramos: quem tem hr.ausencias.view naquela organizacao; o trabalhador os seus (hr.ausencias.view.own + conta ligada a ficha); e a chefia toda a sua cadeia abaixo (hr.ausencias.aprovar.chefia). O terceiro usa a hierarquia ACTUAL e nao o snapshot do pedido, de proposito: quem entrou agora tem de conseguir despachar a fila que herdou.';

COMMENT ON POLICY pessoas_ausencias_pedidos_block_insert ON public.pessoas_ausencias_pedidos IS
'Escrita fechada, no padrao de pessoas_contas e anew_entity_org_links. Criar um pedido resolve a chefia, expande os dias civis, verifica sobreposicoes, imputa periodos de saldo e cria a projeccao no board -- um WITH CHECK ve uma linha e nao garante nada disso. Entra por rpc_hr_ausencia_pedir (20261121110000).';

COMMENT ON POLICY pessoas_ausencias_pedidos_block_update ON public.pessoas_ausencias_pedidos IS
'USING e WITH CHECK ambos false. A RLS de UPDATE de schedule_items sem WITH CHECK e o buraco por onde hoje se muda approval_status e user_id para valores fora do proprio ambito -- nao se repete aqui.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
  v_restr     integer;
  v_qual      text;
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_ausencias_pedidos';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_pedidos';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas em pessoas_ausencias_pedidos, encontraram-se %.', v_politicas;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_pedidos'
     AND permissive = 'RESTRICTIVE';
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita, encontraram-se %.', v_restr;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION
      'authenticated tem GRANT de escrita em pessoas_ausencias_pedidos. Esta tabela e SELECT e mais nada.';
  END IF;

  SELECT coalesce(qual,'') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_pedidos'
     AND policyname = 'pessoas_ausencias_pedidos_select';

  -- As duas guardas contra reescritas a partir de versoes antigas.
  IF v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION
      'A politica de SELECT perdeu o ramo de ficha-propria. O trabalhador nao veria os seus proprios pedidos.';
  END IF;
  IF v_qual NOT LIKE '%hr_ausencias_pessoa_na_minha_cadeia%' THEN
    RAISE EXCEPTION
      'A politica de SELECT perdeu o ramo da chefia. A fila de aprovacao ficaria vazia para quem a tem de despachar.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
       AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION
      'pessoas_ausencias_pedidos ganhou deleted_at. Cancelar e um estado, nao um apagamento.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_pedidos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) nao ficou criada; as FKs compostas das decisoes, dos dias e das justificacoes dependem dela.';
  END IF;

  RAISE NOTICE 'Conferido: pessoas_ausencias_pedidos com escrita fechada e os tres ramos de leitura.';
END;
$conferir$;
