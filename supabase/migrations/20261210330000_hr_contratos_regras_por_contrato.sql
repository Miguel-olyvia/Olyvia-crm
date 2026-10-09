-- ==============================================================================
-- Fim de contrato (2/6): as excepcoes por contrato, o contador de renovacoes e a
-- decisao de terminar.
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO (o separador Contratos mostra e edita as regras do
-- contrato; um cartao mostra o ciclo). Depende de 20261210320000 e de 20261210310000
-- (o historico) e entra no mesmo commit que os ecras. Sozinha acrescenta colunas
-- com valor por omissao e funcoes novas: nada do que corre hoje muda.
--
--
-- -- O QUE FAZ -----------------------------------------------------------------
--
-- 1. Colunas novas em pessoas_vinculos (a opcao mais simples: nao ha tabela 1:1;
--    a RLS e a permissao de editar contratos ja existem na tabela):
--      fim_renovacao_automatica      boolean   NULL = herda da organizacao
--      fim_dias_aviso                integer   NULL = herda (1 a 365)
--      fim_max_renovacoes            integer   NULL = herda (>= 0)
--      fim_duracao_renovacao_valor   integer   NULL = herda
--      fim_duracao_renovacao_unidade text      meses | dias; valor e unidade juntos
--      fim_ao_atingir_limite         text      converter_sem_termo | decisao_manual_rh
--      renovacoes_realizadas         integer   NOT NULL DEFAULT 0: o contador
--      fim_decisao                   text      NULL ou 'terminar' (o RH decidiu
--                                              deixar o contrato terminar)
--      fim_decisao_em / fim_decisao_por
--    As excepcoes sao SO POR CONTRATO, nunca por pessoa. Quem as altera e quem pode
--    editar contratos (hr.pessoas.vinculos.edit): ou pela RPC
--    rpc_hr_vinculo_regra_guardar (que regista o motivo no historico), ou por
--    UPDATE directo (a politica de UPDATE ja o exige).
--
-- 2. O contador (renovacoes_realizadas) e a decisao (fim_decisao*) so mudam pelas
--    RPCs e pela rotina diaria: um trigger BEFORE INSERT OR UPDATE recusa (HRV12)
--    qualquer alteracao feita sem a variavel local hr.vinculo_via_rpc = on. Mudar a
--    data de fim (a mao) limpa a decisao de terminar: deixa de valer para a data
--    antiga.
--
-- 3. A regra efectiva = a do contrato quando preenchida, senao a da organizacao.
--    A "fonte da regra" deriva-se: organizacao se todas as excepcoes sao NULL,
--    personalizado se alguma esta preenchida. Funcoes:
--      hr_contrato_regra_efectiva(vinculo_id)     interna (so service_role)
--      rpc_hr_vinculo_regra(vinculo_id)           leitura para o ecra
--      rpc_hr_vinculo_regra_guardar(...)          escrita das excepcoes
--
-- 4. O historico (hr_vinculos_registar_alteracao) passa a registar tambem estes
--    campos novos (33 no total).
--
--
-- -- O CAMPO renovavel QUE JA EXISTIA ------------------------------------------
--
-- pessoas_vinculos.renovavel (boolean, NULL permitido, da admissao) e REAPROVEITADO:
-- renovavel = false significa "este contrato nao se renova" e bloqueia qualquer
-- renovacao, automatica ou manual. NULL ou true nao bloqueia. Nao ha coluna nova
-- para isto.
--
--
-- -- A LER COM ATENCAO ANTES DO PUSH -------------------------------------------
--
-- a) O trigger de protecao dispara em TODOS os INSERT e UPDATE de pessoas_vinculos
--    mas so olha para colunas novas: nenhum caminho de escrita existente as toca.
-- b) Esta migration so se aplica ao branch de RH.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: largar o trigger e as
-- funcoes, largar as colunas, e repor a funcao do historico com o corpo de
-- 20261210310000.
--
-- Prerequisitos:
--   20261210310000  hr_vinculos_registar_alteracao com motivo e documento
--   20261210320000  hr_regras_fim_contrato
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_regras_fim_contrato') IS NULL THEN
    RAISE EXCEPTION 'hr_regras_fim_contrato nao existe. Aplicar 20261210320000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'renovavel'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos.renovavel nao existe (20261124080000).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.hr_vinculos_registar_alteracao()')
       AND position('hr.alteracao_motivo' IN pg_get_functiondef(p.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'hr_vinculos_registar_alteracao() nao le hr.alteracao_motivo. Aplicar 20261210310000 primeiro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name IN ('renovacoes_realizadas', 'fim_decisao', 'fim_dias_aviso')
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos ja tem alguma das colunas desta migration -- investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. As colunas
-- ==============================================================================
ALTER TABLE public.pessoas_vinculos
  ADD COLUMN fim_renovacao_automatica      boolean,
  ADD COLUMN fim_dias_aviso                integer,
  ADD COLUMN fim_max_renovacoes            integer,
  ADD COLUMN fim_duracao_renovacao_valor   integer,
  ADD COLUMN fim_duracao_renovacao_unidade text,
  ADD COLUMN fim_ao_atingir_limite         text,
  ADD COLUMN renovacoes_realizadas         integer NOT NULL DEFAULT 0,
  ADD COLUMN fim_decisao                   text,
  ADD COLUMN fim_decisao_em                timestamptz,
  ADD COLUMN fim_decisao_por               uuid REFERENCES public.anew_users (id) ON DELETE SET NULL;

ALTER TABLE public.pessoas_vinculos
  ADD CONSTRAINT pessoas_vinculos_fim_dias_aviso_valido
    CHECK (fim_dias_aviso IS NULL OR fim_dias_aviso BETWEEN 1 AND 365),
  ADD CONSTRAINT pessoas_vinculos_fim_max_renovacoes_valido
    CHECK (fim_max_renovacoes IS NULL OR fim_max_renovacoes >= 0),
  ADD CONSTRAINT pessoas_vinculos_fim_duracao_renovacao_coerente
    CHECK (
      (fim_duracao_renovacao_valor IS NULL) = (fim_duracao_renovacao_unidade IS NULL)
      AND (fim_duracao_renovacao_valor IS NULL OR fim_duracao_renovacao_valor > 0)
      AND (fim_duracao_renovacao_unidade IS NULL OR fim_duracao_renovacao_unidade IN ('meses', 'dias'))
    ),
  ADD CONSTRAINT pessoas_vinculos_fim_ao_atingir_limite_valido
    CHECK (fim_ao_atingir_limite IS NULL OR fim_ao_atingir_limite IN ('converter_sem_termo', 'decisao_manual_rh')),
  ADD CONSTRAINT pessoas_vinculos_renovacoes_realizadas_nao_negativas
    CHECK (renovacoes_realizadas >= 0),
  ADD CONSTRAINT pessoas_vinculos_fim_decisao_valida
    CHECK (fim_decisao IS NULL OR fim_decisao = 'terminar');

COMMENT ON COLUMN public.pessoas_vinculos.fim_renovacao_automatica IS
'Excepcao DESTE contrato: renovacao automatica sim/nao. NULL = herda de hr_regras_fim_contrato (da organizacao). Desde 20261210330000.';
COMMENT ON COLUMN public.pessoas_vinculos.fim_dias_aviso IS
'Excepcao DESTE contrato: dias de aviso antes do fim do ciclo (1 a 365). NULL = herda da organizacao.';
COMMENT ON COLUMN public.pessoas_vinculos.fim_max_renovacoes IS
'Excepcao DESTE contrato: numero maximo de renovacoes. NULL = herda da organizacao.';
COMMENT ON COLUMN public.pessoas_vinculos.fim_duracao_renovacao_valor IS
'Excepcao DESTE contrato: duracao de cada renovacao (com fim_duracao_renovacao_unidade). NULL nos dois = herda da organizacao (que, se tambem for NULL, usa a duracao do contrato inicial).';
COMMENT ON COLUMN public.pessoas_vinculos.fim_duracao_renovacao_unidade IS
'meses ou dias; sempre juntamente com fim_duracao_renovacao_valor.';
COMMENT ON COLUMN public.pessoas_vinculos.fim_ao_atingir_limite IS
'Excepcao DESTE contrato: o que acontece ao atingir o limite de renovacoes (converter_sem_termo ou decisao_manual_rh). NULL = herda da organizacao.';
COMMENT ON COLUMN public.pessoas_vinculos.renovacoes_realizadas IS
'Quantas vezes ESTE contrato ja foi renovado (automatica ou manualmente; renovar prolonga o mesmo contrato, nao cria um novo). So muda pelas RPCs de renovacao e pela rotina diaria (trigger de protecao, HRV12).';
COMMENT ON COLUMN public.pessoas_vinculos.fim_decisao IS
'NULL ou terminar: o RH decidiu deixar o contrato terminar na data de fim; a rotina diaria passa-o a terminado no dia seguinte. So muda pelas RPCs (HRV12). Mudar a data de fim limpa-a.';
COMMENT ON COLUMN public.pessoas_vinculos.renovavel IS
'Se o contrato se pode renovar. false bloqueia qualquer renovacao (automatica ou manual) e a rotina de fim de contrato; NULL ou true nao bloqueia. Reaproveitado em 20261210330000 como a marca de nao-renovavel.';

-- ==============================================================================
-- 2. O trigger de protecao do contador e da decisao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_vinculos_proteger_ciclo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- As RPCs e a rotina diaria ligam esta variavel (local a transaccao) em volta
  -- do seu UPDATE e voltam a desliga-la.
  IF coalesce(current_setting('hr.vinculo_via_rpc', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.renovacoes_realizadas <> 0
       OR NEW.fim_decisao IS NOT NULL OR NEW.fim_decisao_em IS NOT NULL OR NEW.fim_decisao_por IS NOT NULL THEN
      RAISE EXCEPTION 'O contador de renovacoes e a decisao de fim de contrato so se alteram pelas RPCs de renovacao e de fim.'
        USING ERRCODE = 'HRV12';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.renovacoes_realizadas IS DISTINCT FROM OLD.renovacoes_realizadas
     OR NEW.fim_decisao IS DISTINCT FROM OLD.fim_decisao
     OR NEW.fim_decisao_em IS DISTINCT FROM OLD.fim_decisao_em
     OR NEW.fim_decisao_por IS DISTINCT FROM OLD.fim_decisao_por THEN
    RAISE EXCEPTION 'O contador de renovacoes e a decisao de fim de contrato so se alteram pelas RPCs de renovacao e de fim.'
      USING ERRCODE = 'HRV12';
  END IF;

  -- Mudar a data de fim a mao: a decisao de terminar na data antiga deixa de valer.
  IF NEW.data_fim IS DISTINCT FROM OLD.data_fim AND NEW.fim_decisao IS NOT NULL THEN
    NEW.fim_decisao := NULL;
    NEW.fim_decisao_em := NULL;
    NEW.fim_decisao_por := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_proteger_ciclo() IS
'Recusa (HRV12) qualquer INSERT ou UPDATE de pessoas_vinculos que mude renovacoes_realizadas ou fim_decisao* sem a variavel local hr.vinculo_via_rpc = on (so as RPCs de renovacao e de fim e a rotina diaria a ligam). Quando a data de fim muda a mao e ha uma decisao de terminar, limpa-a. Desde 20261210330000.';

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_proteger_ciclo ON public.pessoas_vinculos;
CREATE TRIGGER trg_pessoas_vinculos_proteger_ciclo
  BEFORE INSERT OR UPDATE ON public.pessoas_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.hr_vinculos_proteger_ciclo();

-- ==============================================================================
-- 3. O historico regista tambem as colunas novas (33 campos)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_vinculos_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Todos os campos de negocio de pessoas_vinculos. NENHUM e monetario.
  v_campos text[] := ARRAY[
    'tipo_contrato', 'regime', 'regime_contratual',
    'data_inicio', 'data_fim', 'motivo_termo', 'estado',
    'periodo_experimental_dias', 'periodo_experimental_ate', 'periodo_experimental_origem',
    'entidade_legal_org_id', 'tipo_trabalho', 'tempo_trabalho_pct',
    'dias_uteis', 'politica_feriados',
    'horas_periodo', 'horas_frequencia', 'horas_semanais_maximas', 'horas_anuais_maximas',
    'categoria_funcao', 'categoria_profissional',
    'renovavel', 'isencao_horario', 'formacao_inicio', 'formacao_fim',
    'renovacoes_realizadas', 'fim_decisao',
    'fim_renovacao_automatica', 'fim_dias_aviso', 'fim_max_renovacoes',
    'fim_duracao_renovacao_valor', 'fim_duracao_renovacao_unidade', 'fim_ao_atingir_limite'
  ];
  v_old        jsonb := to_jsonb(OLD);
  v_new        jsonb := to_jsonb(NEW);
  v_campo      text;
  v_criado_por uuid;
  v_motivo     text;
  v_doc_txt    text;
  v_documento  uuid;
BEGIN
  -- Marcar como apagado (soft delete) nao e uma alteracao de negocio.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  -- Motivo e documento de apoio, definidos pela RPC que altera o contrato (locais
  -- a transaccao). Por definir ou vazios = NULL.
  v_motivo  := NULLIF(btrim(coalesce(current_setting('hr.alteracao_motivo', true), '')), '');
  v_doc_txt := NULLIF(btrim(coalesce(current_setting('hr.alteracao_documento_id', true), '')), '');
  IF v_doc_txt IS NOT NULL
     AND v_doc_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT d.id INTO v_documento
      FROM public.pessoas_documentos d
     WHERE d.id = v_doc_txt::uuid
       AND d.pessoa_id = NEW.pessoa_id
       AND d.organization_id = NEW.organization_id;
  END IF;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    -- A sincronizacao das horas (hr_vinculos_horas_sincronizar) escreve
    -- horas_periodo e horas_frequencia com hr.skip_horas_auditoria ligada: copiar
    -- o valor da versao em vigor nao e uma alteracao feita por ninguem.
    IF v_campo IN ('horas_periodo', 'horas_frequencia')
       AND coalesce(current_setting('hr.skip_horas_auditoria', true), 'off') = 'on' THEN
      CONTINUE;
    END IF;

    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_vinculos_alteracoes
        (vinculo_id, pessoa_id, organization_id, campo, valor_antes, valor_depois,
         motivo, documento_id, created_by)
      VALUES
        (NEW.id, NEW.pessoa_id, NEW.organization_id, v_campo, v_old ->> v_campo, v_new ->> v_campo,
         v_motivo, v_documento, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_registar_alteracao() IS
'Escreve uma linha em pessoas_vinculos_alteracoes por CADA campo de negocio que mudou num UPDATE de pessoas_vinculos (33 campos: os 25 de 20261210310000 mais renovacoes_realizadas, fim_decisao e as cinco excepcoes fim_*). Nao regista quando a unica mudanca e marcar deleted_at (soft delete). Salta horas_periodo e horas_frequencia quando hr.skip_horas_auditoria esta ligada (so a sincronizacao das horas a liga). Preenche motivo e documento_id a partir das variaveis de sessao locais hr.alteracao_motivo e hr.alteracao_documento_id, que so uma RPC pode definir na mesma transaccao do UPDATE (o documento tem de ser da mesma pessoa e organizacao, senao fica NULL). Lista alargada em 20261210330000.';

-- ==============================================================================
-- 4. A regra efectiva (contrato primeiro, organizacao depois)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_contrato_regra_efectiva(p_vinculo_id uuid)
RETURNS TABLE (
  organization_id      uuid,
  ativo                boolean,
  renovacao_automatica boolean,
  dias_aviso           integer,
  max_renovacoes       integer,
  duracao_valor        integer,
  duracao_unidade      text,
  ao_atingir_limite    text,
  fonte                text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT v.organization_id,
         coalesce(r.ativo, false),
         coalesce(v.fim_renovacao_automatica, r.renovacao_automatica, false),
         coalesce(v.fim_dias_aviso, r.dias_aviso, 30),
         coalesce(v.fim_max_renovacoes, r.max_renovacoes, 0),
         CASE WHEN v.fim_duracao_renovacao_valor IS NOT NULL
              THEN v.fim_duracao_renovacao_valor ELSE r.duracao_renovacao_valor END,
         CASE WHEN v.fim_duracao_renovacao_valor IS NOT NULL
              THEN v.fim_duracao_renovacao_unidade ELSE r.duracao_renovacao_unidade END,
         coalesce(v.fim_ao_atingir_limite, r.ao_atingir_limite, 'decisao_manual_rh'),
         CASE WHEN v.fim_renovacao_automatica IS NULL AND v.fim_dias_aviso IS NULL
                   AND v.fim_max_renovacoes IS NULL AND v.fim_duracao_renovacao_valor IS NULL
                   AND v.fim_ao_atingir_limite IS NULL
              THEN 'organizacao' ELSE 'personalizado' END
    FROM public.pessoas_vinculos v
    LEFT JOIN public.hr_regras_fim_contrato r ON r.organization_id = v.organization_id
   WHERE v.id = p_vinculo_id
$$;

REVOKE ALL ON FUNCTION public.hr_contrato_regra_efectiva(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_contrato_regra_efectiva(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_contrato_regra_efectiva(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_contrato_regra_efectiva(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_contrato_regra_efectiva(uuid) IS
'INTERNA (so service_role; os ecras usam rpc_hr_vinculo_regra). A regra de fim de contrato que vale para um contrato: cada campo vem do proprio contrato (colunas fim_*) quando preenchido, senao da organizacao (hr_regras_fim_contrato). Sem linha da organizacao: ativo = false e valores neutros (30 dias, 0 renovacoes, decisao_manual_rh), que so servem para mostrar, porque desligado nada corre. fonte = organizacao se nenhuma excepcao esta preenchida, personalizado se alguma esta. Desde 20261210330000.';

-- ==============================================================================
-- 5. RPC de leitura da regra de um contrato (para o ecra)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_vinculo_regra(p_vinculo_id uuid)
RETURNS TABLE (
  vinculo_id            uuid,
  ativo                 boolean,
  renovacao_automatica  boolean,
  dias_aviso            integer,
  max_renovacoes        integer,
  duracao_valor         integer,
  duracao_unidade       text,
  ao_atingir_limite     text,
  fonte                 text,
  renovacoes_realizadas integer,
  renovacoes_restantes  integer,
  no_ambito             boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  SELECT pv.organization_id INTO v_org
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL;

  IF v_uid IS NULL OR v_org IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.view', v_org) THEN
    RAISE EXCEPTION 'Sem permissao para ver as regras de fim deste contrato.' USING ERRCODE = 'HRV05';
  END IF;

  RETURN QUERY
  SELECT v.id,
         e.ativo,
         e.renovacao_automatica,
         e.dias_aviso,
         e.max_renovacoes,
         e.duracao_valor,
         e.duracao_unidade,
         e.ao_atingir_limite,
         e.fonte,
         v.renovacoes_realizadas,
         greatest(e.max_renovacoes - v.renovacoes_realizadas, 0),
         (v.tipo_contrato IN ('termo_certo', 'termo_incerto', 'duracao_muito_curta', 'temporario')
          AND v.data_fim IS NOT NULL
          AND v.estado IN ('activo', 'suspenso'))
    FROM public.pessoas_vinculos v
   CROSS JOIN LATERAL public.hr_contrato_regra_efectiva(v.id) e
   WHERE v.id = p_vinculo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_regra(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_regra(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_regra(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_vinculo_regra(uuid) IS
'A regra de fim de contrato EFECTIVA de um contrato, para o ecra. Uma linha: vinculo_id, ativo (a funcionalidade esta ligada na organizacao), renovacao_automatica, dias_aviso, max_renovacoes, duracao_valor, duracao_unidade (NULL = igual a duracao inicial), ao_atingir_limite, fonte (organizacao | personalizado), renovacoes_realizadas, renovacoes_restantes, no_ambito (o contrato tem fim e e de um dos quatro tipos com ciclo). Exige hr.pessoas.vinculos.view; sem sessao, sem permissao ou contrato inexistente: HRV05. Desde 20261210330000.';

-- ==============================================================================
-- 6. RPC de escrita das excepcoes de um contrato
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_vinculo_regra_guardar(
  p_vinculo_id            uuid,
  p_renovacao_automatica  boolean,
  p_dias_aviso            integer,
  p_max_renovacoes        integer,
  p_duracao_valor         integer,
  p_duracao_unidade       text,
  p_ao_atingir_limite     text,
  p_motivo                text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  SELECT pv.organization_id INTO v_org
    FROM public.pessoas_vinculos pv
   WHERE pv.id = p_vinculo_id AND pv.deleted_at IS NULL;

  IF v_uid IS NULL OR v_org IS NULL
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.vinculos.edit', v_org) THEN
    RAISE EXCEPTION 'Sem permissao para alterar as regras de fim deste contrato.' USING ERRCODE = 'HRV05';
  END IF;

  IF p_dias_aviso IS NOT NULL AND (p_dias_aviso < 1 OR p_dias_aviso > 365) THEN
    RAISE EXCEPTION 'Os dias de aviso tem de estar entre 1 e 365; recebi %.', p_dias_aviso USING ERRCODE = 'HRV13';
  END IF;

  IF p_max_renovacoes IS NOT NULL AND p_max_renovacoes < 0 THEN
    RAISE EXCEPTION 'O maximo de renovacoes nao pode ser negativo; recebi %.', p_max_renovacoes USING ERRCODE = 'HRV13';
  END IF;

  IF p_ao_atingir_limite IS NOT NULL AND p_ao_atingir_limite NOT IN ('converter_sem_termo', 'decisao_manual_rh') THEN
    RAISE EXCEPTION 'O comportamento ao atingir o limite tem de ser converter_sem_termo ou decisao_manual_rh; recebi %.', p_ao_atingir_limite
      USING ERRCODE = 'HRV13';
  END IF;

  IF (p_duracao_valor IS NULL) <> (p_duracao_unidade IS NULL) THEN
    RAISE EXCEPTION 'A duracao da renovacao precisa do valor e da unidade, ou de nenhum dos dois (herda).'
      USING ERRCODE = 'HRV13';
  END IF;

  IF p_duracao_valor IS NOT NULL AND (p_duracao_valor < 1 OR p_duracao_unidade NOT IN ('meses', 'dias')) THEN
    RAISE EXCEPTION 'A duracao da renovacao tem de ser positiva e em meses ou dias; recebi % %.', p_duracao_valor, p_duracao_unidade
      USING ERRCODE = 'HRV13';
  END IF;

  PERFORM set_config('hr.alteracao_motivo',
                     coalesce(NULLIF(btrim(p_motivo), ''), 'Excepcao as regras de fim de contrato'), true);

  UPDATE public.pessoas_vinculos
     SET fim_renovacao_automatica      = p_renovacao_automatica,
         fim_dias_aviso                = p_dias_aviso,
         fim_max_renovacoes            = p_max_renovacoes,
         fim_duracao_renovacao_valor   = p_duracao_valor,
         fim_duracao_renovacao_unidade = p_duracao_unidade,
         fim_ao_atingir_limite         = p_ao_atingir_limite
   WHERE id = p_vinculo_id;

  PERFORM set_config('hr.alteracao_motivo', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_regra_guardar(uuid, boolean, integer, integer, integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_vinculo_regra_guardar(uuid, boolean, integer, integer, integer, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_vinculo_regra_guardar(uuid, boolean, integer, integer, integer, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_hr_vinculo_regra_guardar(uuid, boolean, integer, integer, integer, text, text, text) IS
'Define as excepcoes de fim de contrato DESTE contrato (nunca da pessoa): p_renovacao_automatica, p_dias_aviso (1 a 365), p_max_renovacoes (>= 0), p_duracao_valor e p_duracao_unidade (meses | dias; os dois ou nenhum), p_ao_atingir_limite (converter_sem_termo | decisao_manual_rh), p_motivo (opcional, vai para o historico). Cada argumento NULL = herda da organizacao. Substitui as seis excepcoes de uma vez (passar tudo NULL volta a herdar tudo). Exige hr.pessoas.vinculos.edit na organizacao do contrato (HRV05 sem sessao, sem permissao ou contrato inexistente); valores invalidos dao HRV13. Desde 20261210330000.';

-- ==============================================================================
-- Conferir (estrutura): falha o push se algo estiver diferente do esperado.
-- ==============================================================================
DO $conferir$
DECLARE
  v_col    text;
  v_def    text;
  v_n      integer;
  v_campos text[] := ARRAY[
    'tipo_contrato', 'regime', 'regime_contratual',
    'data_inicio', 'data_fim', 'motivo_termo', 'estado',
    'periodo_experimental_dias', 'periodo_experimental_ate', 'periodo_experimental_origem',
    'entidade_legal_org_id', 'tipo_trabalho', 'tempo_trabalho_pct',
    'dias_uteis', 'politica_feriados',
    'horas_periodo', 'horas_frequencia', 'horas_semanais_maximas', 'horas_anuais_maximas',
    'categoria_funcao', 'categoria_profissional',
    'renovavel', 'isencao_horario', 'formacao_inicio', 'formacao_fim',
    'renovacoes_realizadas', 'fim_decisao',
    'fim_renovacao_automatica', 'fim_dias_aviso', 'fim_max_renovacoes',
    'fim_duracao_renovacao_valor', 'fim_duracao_renovacao_unidade', 'fim_ao_atingir_limite'
  ];
BEGIN
  -- 1. As colunas novas existem.
  FOREACH v_col IN ARRAY ARRAY['fim_renovacao_automatica', 'fim_dias_aviso', 'fim_max_renovacoes',
                               'fim_duracao_renovacao_valor', 'fim_duracao_renovacao_unidade',
                               'fim_ao_atingir_limite', 'renovacoes_realizadas', 'fim_decisao',
                               'fim_decisao_em', 'fim_decisao_por'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = v_col
    ) THEN
      RAISE EXCEPTION 'A coluna pessoas_vinculos.% nao foi criada.', v_col;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = 'renovacoes_realizadas'
       AND is_nullable = 'NO' AND column_default LIKE '0%'
  ) THEN
    RAISE EXCEPTION 'renovacoes_realizadas devia ser NOT NULL com valor por omissao 0.';
  END IF;

  -- 2. O trigger de protecao esta ligado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_proteger_ciclo'
       AND tgrelid = to_regclass('public.pessoas_vinculos')
       AND tgfoid = 'public.hr_vinculos_proteger_ciclo()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_vinculos_proteger_ciclo nao esta ligado.';
  END IF;

  -- 3. O historico regista os 33 campos, todos colunas reais.
  v_def := pg_get_functiondef('public.hr_vinculos_registar_alteracao()'::regprocedure);
  FOREACH v_col IN ARRAY v_campos LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos' AND column_name = v_col
    ) THEN
      RAISE EXCEPTION 'O campo % da lista do historico nao e coluna de pessoas_vinculos.', v_col;
    END IF;
    IF position('''' || v_col || '''' IN v_def) = 0 THEN
      RAISE EXCEPTION 'A funcao do historico nao regista o campo %.', v_col;
    END IF;
  END LOOP;
  IF array_length(v_campos, 1) <> 33 THEN
    RAISE EXCEPTION 'A lista do conferir devia ter 33 campos.';
  END IF;

  -- 4. As funcoes: as RPCs SECURITY DEFINER com search_path fixo, sem anon; a
  --    interna so com service_role.
  FOREACH v_col IN ARRAY ARRAY['public.rpc_hr_vinculo_regra(uuid)',
                               'public.rpc_hr_vinculo_regra_guardar(uuid, boolean, integer, integer, integer, text, text, text)',
                               'public.hr_contrato_regra_efectiva(uuid)'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure(v_col) AND p.prosecdef
         AND array_to_string(p.proconfig, ',') LIKE '%search_path=%'
    ) THEN
      RAISE EXCEPTION '% devia ser SECURITY DEFINER com search_path fixo.', v_col;
    END IF;
    IF has_function_privilege('anon', v_col, 'EXECUTE') OR has_function_privilege('public', v_col, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon ou PUBLIC conseguem executar %.', v_col;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.hr_contrato_regra_efectiva(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated nao devia poder executar hr_contrato_regra_efectiva (interna).';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_vinculo_regra(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_hr_vinculo_regra_guardar(uuid, boolean, integer, integer, integer, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated devia poder executar as duas RPCs de regra do contrato.';
  END IF;

  SELECT count(*) INTO v_n FROM public.pessoas_vinculos WHERE renovacoes_realizadas <> 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ha % contrato(s) com renovacoes_realizadas diferente de 0 antes de a rotina existir.', v_n;
  END IF;

  RAISE NOTICE 'OK: 10 colunas novas em pessoas_vinculos, trigger de protecao ligado, historico com 33 campos, funcoes de regra com os privilegios certos.';
END;
$conferir$;

-- ==============================================================================
-- Conferir (ao vivo, so na organizacao nike): cria dados de teste e DESFAZ-OS
-- tudo com a sentinela HR900 (a subtransaccao reverte as linhas).
-- ==============================================================================
DO $conferir_vivo$
DECLARE
  v_org_nike  uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  v_cargo     uuid;
  v_pessoa    uuid;
  v_vinculo   uuid;
  v_n         integer;
  v_cons      text;
  v_sqlstate  text;
  v_dec       text;
  v_fonte     text;
  v_dias      integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_organizations WHERE id = v_org_nike) THEN
    RAISE NOTICE 'Org nike nao encontrada neste ambiente -- o conferir ao vivo das regras por contrato foi saltado.';
    RETURN;
  END IF;

  BEGIN
    -- Escritas SO na nike (organization_id confirmado acima).
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org_nike, 'TESTE MIGRACAO cargo 20261210330000 ' || gen_random_uuid()::text, 0, 'mensal')
    RETURNING id INTO v_cargo;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org_nike, 'TESTE MIGRACAO', '20261210330000 -- apagar', v_cargo, current_date)
    RETURNING id INTO v_pessoa;

    INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, data_fim, estado)
    VALUES (v_pessoa, v_org_nike, 'termo_certo', current_date, current_date + 60, 'activo')
    RETURNING id INTO v_vinculo;

    -- 1. O contador nasce a 0.
    SELECT pv.renovacoes_realizadas INTO v_n FROM public.pessoas_vinculos pv WHERE pv.id = v_vinculo;
    IF v_n <> 0 THEN
      RAISE EXCEPTION 'renovacoes_realizadas devia nascer a 0; foi %.', v_n USING ERRCODE = 'HR965';
    END IF;

    -- 2. Escrever o contador a mao e recusado (HRV12).
    v_sqlstate := NULL;
    BEGIN
      UPDATE public.pessoas_vinculos SET renovacoes_realizadas = 1 WHERE id = v_vinculo;
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV12' THEN
      RAISE EXCEPTION 'Escrever renovacoes_realizadas a mao devia dar HRV12; foi %.', coalesce(v_sqlstate, '(nada)')
        USING ERRCODE = 'HR965';
    END IF;

    -- 3. Com a variavel local ligada (o caminho das RPCs) passa.
    PERFORM set_config('hr.vinculo_via_rpc', 'on', true);
    UPDATE public.pessoas_vinculos
       SET renovacoes_realizadas = 1, fim_decisao = 'terminar', fim_decisao_em = now()
     WHERE id = v_vinculo;
    PERFORM set_config('hr.vinculo_via_rpc', 'off', true);

    -- 4. Mudar a data de fim a mao limpa a decisao de terminar.
    UPDATE public.pessoas_vinculos SET data_fim = current_date + 90 WHERE id = v_vinculo;
    SELECT pv.fim_decisao INTO v_dec FROM public.pessoas_vinculos pv WHERE pv.id = v_vinculo;
    IF v_dec IS NOT NULL THEN
      RAISE EXCEPTION 'Mudar a data de fim devia limpar fim_decisao; ficou %.', v_dec USING ERRCODE = 'HR965';
    END IF;

    -- 5. Um INSERT com contador diferente de 0 e recusado.
    v_sqlstate := NULL;
    BEGIN
      INSERT INTO public.pessoas_vinculos (pessoa_id, organization_id, tipo_contrato, data_inicio, estado, renovacoes_realizadas)
      VALUES (v_pessoa, v_org_nike, 'sem_termo', current_date, 'futuro', 2);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV12' THEN
      RAISE EXCEPTION 'Um INSERT com renovacoes_realizadas = 2 devia dar HRV12; foi %.', coalesce(v_sqlstate, '(nada)')
        USING ERRCODE = 'HR965';
    END IF;

    -- 6. A regra efectiva: sem excepcoes e sem linha da organizacao = organizacao e desligado.
    SELECT e.fonte, e.dias_aviso INTO v_fonte, v_dias FROM public.hr_contrato_regra_efectiva(v_vinculo) e;
    IF v_fonte IS DISTINCT FROM 'organizacao' THEN
      RAISE EXCEPTION 'Sem excepcoes a fonte devia ser organizacao; foi %.', coalesce(v_fonte, '(nada)') USING ERRCODE = 'HR965';
    END IF;

    -- 7. Com uma excepcao preenchida a fonte passa a personalizado e o valor e o do contrato.
    UPDATE public.pessoas_vinculos SET fim_dias_aviso = 10 WHERE id = v_vinculo;
    SELECT e.fonte, e.dias_aviso INTO v_fonte, v_dias FROM public.hr_contrato_regra_efectiva(v_vinculo) e;
    IF v_fonte IS DISTINCT FROM 'personalizado' OR v_dias IS DISTINCT FROM 10 THEN
      RAISE EXCEPTION 'Com fim_dias_aviso = 10 devia ser personalizado e 10 dias; foi % e %.', coalesce(v_fonte, '(nada)'), coalesce(v_dias::text, '(nada)')
        USING ERRCODE = 'HR965';
    END IF;

    -- 8. Cada CHECK recusa o que lhe cabe.
    v_cons := NULL;
    BEGIN
      UPDATE public.pessoas_vinculos SET fim_dias_aviso = 0 WHERE id = v_vinculo;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_vinculos_fim_dias_aviso_valido' THEN
      RAISE EXCEPTION 'fim_dias_aviso = 0 devia ser recusado por pessoas_vinculos_fim_dias_aviso_valido; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR965';
    END IF;

    v_cons := NULL;
    BEGIN
      UPDATE public.pessoas_vinculos SET fim_duracao_renovacao_unidade = 'meses' WHERE id = v_vinculo;
    EXCEPTION WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_cons = CONSTRAINT_NAME;
    END;
    IF v_cons IS DISTINCT FROM 'pessoas_vinculos_fim_duracao_renovacao_coerente' THEN
      RAISE EXCEPTION 'Unidade sem valor devia ser recusada por pessoas_vinculos_fim_duracao_renovacao_coerente; foi por %.', coalesce(v_cons, '(nada)')
        USING ERRCODE = 'HR965';
    END IF;

    -- 9. O historico registou as alteracoes (data_fim, fim_dias_aviso e o contador).
    SELECT count(*) INTO v_n
      FROM public.pessoas_vinculos_alteracoes a
     WHERE a.vinculo_id = v_vinculo AND a.campo IN ('data_fim', 'fim_dias_aviso', 'renovacoes_realizadas', 'fim_decisao');
    IF v_n < 4 THEN
      RAISE EXCEPTION 'O historico devia ter pelo menos 4 linhas (data_fim, fim_dias_aviso, renovacoes_realizadas, fim_decisao); tem %.', v_n
        USING ERRCODE = 'HR965';
    END IF;

    -- 10. As RPCs recusam quem nao tem permissao (utilizador fabricado).
    PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
    v_sqlstate := NULL;
    BEGIN
      PERFORM 1 FROM public.rpc_hr_vinculo_regra(v_vinculo);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'rpc_hr_vinculo_regra devia recusar com HRV05; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR965';
    END IF;
    v_sqlstate := NULL;
    BEGIN
      PERFORM public.rpc_hr_vinculo_regra_guardar(v_vinculo, NULL, 10, NULL, NULL, NULL, NULL, NULL);
    EXCEPTION WHEN OTHERS THEN
      v_sqlstate := SQLSTATE;
    END;
    IF v_sqlstate IS DISTINCT FROM 'HRV05' THEN
      RAISE EXCEPTION 'rpc_hr_vinculo_regra_guardar devia recusar com HRV05; foi %.', coalesce(v_sqlstate, '(nada)') USING ERRCODE = 'HR965';
    END IF;

    RAISE EXCEPTION 'teste_hr_contratos_regras_por_contrato_20261210330000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo desfeito pela subtransaccao.
    WHEN OTHERS THEN
      RAISE EXCEPTION 'O conferir ao vivo das regras por contrato falhou -- SQLSTATE %: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE 'CONFERIR AO VIVO (nike): contador protegido (HRV12), decisao limpa ao mudar a data de fim, regra efectiva organizacao/personalizado, CHECKs, historico dos campos novos e RPCs recusam sem permissao. Tudo desfeito.';
END;
$conferir_vivo$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. PRECISA DE CODIGO NOVO: ver o cabecalho; entra no mesmo commit que os ecras.
-- 2. Listar o que esta pendente IMEDIATAMENTE antes do push
--    (supabase migration list --linked). Nunca migration repair.
-- 3. Correr os testes ANTES do push. Depois de aplicada, NAO se volta atras para
--    demonstrar o vermelho.
-- ==============================================================================
