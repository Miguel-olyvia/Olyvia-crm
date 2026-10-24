-- ==============================================================================
-- Pedido de alteracao de dias de uma ausencia APROVADA.
--
-- POR APLICAR. PRECISA DE CODIGO NOVO NO ECRA PARA FUNCIONAR -- LEIA ISTO
-- ANTES DE APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Na pagina "minhas ausencias", clicar numas ferias ja aprovadas para mudar as
-- datas nao devia ser um UPDATE directo -- e a mesma familia de defeito que a
-- migracao 20261201010000 fechou: mexer no proprio historico so por ter a
-- permissao. A pessoa que quer mudar os dias de umas ferias aprovadas tem de
-- PEDIR a alteracao, e a alteracao tem de passar pela mesma cadeia de
-- aprovacao que qualquer outro pedido -- nunca reescrever o que ja foi
-- aprovado.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Nao ha tabela nova, nem estados novos. Uma alteracao E um pedido normal em
-- pessoas_ausencias_pedidos, com uma coluna nova, substitui_pedido_id, que
-- aponta ao pedido ja aprovado que ela pretende substituir. Herda a MESMA
-- maquina de estados, as MESMAS RPCs de decisao (rpc_hr_ausencia_decidir_chefia
-- e rpc_hr_ausencia_decidir_rh, so recriadas para, na aprovacao, chamarem
-- hr_ausencias_efectivar_substituicao), e a MESMA tabela de decisoes.
--
-- DECISAO QUE CONDICIONA TUDO: enquanto a alteracao esta pendente, NAO se
-- criam linhas em pessoas_ausencias_dias para ela. O original continua
-- aprovado e a ocupar as datas antigas -- se a alteracao ja tivesse dias
-- proprios, o trigger hr_ausencias_dia_sem_sobreposicao recusava-a sempre que
-- tocasse alguma dessas datas, e v_hr_ausencias_saldos contaria os dias das
-- duas versoes ao mesmo tempo. A alteracao so ganha dias quando e aprovada, e
-- e nesse instante que o original perde os seus -- nunca os dois ao mesmo
-- tempo. Por isso tambem NAO aparece no calendario anual nem no board
-- enquanto pendente: nao se projecta no board na criacao, so na efectivacao.
--
-- Na aprovacao, hr_ausencias_efectivar_substituicao(_pedido_id) corre NA MESMA
-- TRANSACCAO que a decisao, por esta ordem, INEGOCIAVEL:
--   1) sai se o pedido nao for uma substituicao, ou ja nao estiver aprovado;
--   2) le o original, TRANCADO (FOR UPDATE) -- se nao estiver aprovado,
--      ausencia_alteracao_original_ja_fechada (outra decisao chegou primeiro);
--   3) recalcula os dias com o calendario DE AGORA e compara com o gravado no
--      pedido -- se divergir (um feriado mudou entretanto),
--      ausencia_alteracao_calendario_mudou, e a aprovacao INTEIRA aborta;
--   4) cancela o original;
--   5) grava o rasto no original, SEM chamar rpc_hr_ausencia_cancelar (essa
--      RPC exige hr.ausencias.historico.editar e recusa sempre que quem
--      decide e a propria pessoa -- ausencia_historico_proprio, 20261201010000
--      -- e quem aprova uma alteracao raramente tem essa permissao nem devia
--      precisar dela: a autoridade aqui vem de ter decidido a alteracao);
--   6) cria as linhas de dia da alteracao;
--   7) projecta no board os dois.
-- Trocar 4 e 6 faz o trigger de nao-sobreposicao recusar a aprovacao SEMPRE
-- QUE a alteracao toca alguma data que o original ainda ocupa -- e passar sem
-- erro nenhum quando as datas nao se cruzam. O defeito e INTERMITENTE: parece
-- resolvido em qualquer teste que mude o mes inteiro, e volta no primeiro
-- pedido que so move um dia.
--
-- Fronteira ALTERACAO / CORRECCAO: original.data_inicio > current_date. Uma
-- ausencia que ja comecou nao se "altera" para a frente -- corrige-se pelo
-- caminho do historico (rpc_hr_ausencia_corrigir_aprovado).
--
-- Saldo nao bloqueia, avisa (RAISE NOTICE): o mesmo criterio que
-- rpc_hr_ausencia_pedir ja aplica ao nao recusar por falta de direito
-- registado -- quem decide a alteracao e que resolve.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - React, hooks, traducoes, testes de ecra: fora do alcance desta migracao.
-- - Sem escotilha nenhuma para nenhum papel: a fronteira ALTERACAO/CORRECCAO
--   nao tem excepcao.
-- - Nao se toca em rpc_hr_ausencia_pedir, rpc_hr_ausencia_cancelar nem
--   rpc_hr_ausencia_corrigir_aprovado.
--
--
-- -- ISTO PRECISA DE CODIGO NOVO NO ECRA, NA MESMA RONDA -----------------------
--
-- src/lib/hr/ausencias.ts e os componentes de "minhas ausencias" tem de parar
-- de tentar editar o pedido aprovado directamente e passar a chamar
-- rpc_hr_ausencia_pedir_alteracao. Ate essa alteracao ser feita, a base ja
-- aceita o pedido de alteracao, mas nao ha ecra nenhum que o chame -- e um
-- custo aceite, registado aqui para quem tratar do lado da aplicacao a
-- seguir. As DUAS coisas entram juntas: aplicar so esta migracao sem o
-- codigo do ecra deixa a funcionalidade invisivel; escrever so o codigo do
-- ecra sem esta migracao nao compila contra a RPC.
--
--
-- -- COMO SE REVERTE -------------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, por esta ordem
-- (as RPCs recriadas primeiro para a versao anterior delas, depois as
-- funcoes novas, depois a coluna):
--   -- reaplicar rpc_hr_ausencia_decidir_chefia e rpc_hr_ausencia_decidir_rh
--   -- tal como ficaram em 20261121110000 (CREATE OR REPLACE, aridade igual);
--   DROP FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text);
--   DROP FUNCTION public.hr_ausencias_efectivar_substituicao(uuid);
--   ALTER TABLE public.pessoas_ausencias_pedidos DROP COLUMN substitui_pedido_id;
--
--
-- Prerequisitos:
--   20261201010000  ausencia_historico_proprio em rpc_hr_ausencia_cancelar e rpc_hr_ausencia_corrigir_aprovado
--   20261121110000  rpc_hr_ausencia_decidir_chefia(uuid,text,text,date,date), rpc_hr_ausencia_decidir_rh(uuid,text,text), hr_ausencias_estado_inicial(3)
--   20261121130000  hr_ausencias_projectar_no_board(uuid) em vigor
--   20261121100000  hr_ausencias_saldo(uuid,uuid,uuid,date)
--   20261121080000  pessoas_ausencias_dias, hr_ausencias_dia_sem_sobreposicao()
--   20261121060000  pessoas_ausencias_pedidos (unique id, pessoa_id, organization_id)
--   20261122050000  GRANT SELECT por coluna em pessoas_ausencias_pedidos a authenticated
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas_ausencias_pedidos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedidos nao existe. Aplicar 20261121060000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_ausencias_dias') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_dias nao existe. Aplicar 20261121080000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_ausencias_pedido_decisoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_pedido_decisoes nao existe. Aplicar 20261121070000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_ausencias_direitos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_ausencias_direitos nao existe. Aplicar 20261121030000 primeiro.';
  END IF;

  IF to_regclass('public.hr_ausencias_tipos') IS NULL THEN
    RAISE EXCEPTION 'public.hr_ausencias_tipos nao existe. Aplicar 20261121020000 primeiro.';
  END IF;

  IF to_regclass('public.schedule_holidays') IS NULL THEN
    RAISE EXCEPTION 'public.schedule_holidays nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_ausencias_pedidos_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) de pessoas_ausencias_pedidos nao existe; a FK composta de substitui_pedido_id depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_decidir_chefia' AND p.pronargs = 5
  ) THEN
    RAISE EXCEPTION 'public.rpc_hr_ausencia_decidir_chefia(uuid,text,text,date,date) nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_decidir_rh' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'public.rpc_hr_ausencia_decidir_rh(uuid,text,text) nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_estado_inicial' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_estado_inicial(boolean,boolean,boolean) nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_aprovador_chefia' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_aprovador_chefia(uuid,uuid) nao existe. Aplicar 20261121050000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_projectar_no_board' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_projectar_no_board(uuid) nao existe. Aplicar 20261121110000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_saldo' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'hr_ausencias_saldo(uuid,uuid,uuid,date) nao existe. Aplicar 20261121100000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.pedir') THEN
    RAISE EXCEPTION 'hr.ausencias.pedir nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.ausencias.pedir.outros') THEN
    RAISE EXCEPTION 'hr.ausencias.pedir.outros nao esta no catalogo. Aplicar 20261121010000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. A coluna, a FK composta, o CHECK e o indice
-- ==============================================================================
ALTER TABLE public.pessoas_ausencias_pedidos
  ADD COLUMN IF NOT EXISTS substitui_pedido_id uuid;

-- FK COMPOSTA: uma FK simples (so contra id) deixaria uma alteracao apontar
-- ao pedido aprovado de OUTRA pessoa, ou de outra organizacao. A composta
-- contra (id, pessoa_id, organization_id) fecha as duas fugas de uma vez.
ALTER TABLE public.pessoas_ausencias_pedidos
  DROP CONSTRAINT IF EXISTS pessoas_ausencias_pedidos_substitui_fkey;
ALTER TABLE public.pessoas_ausencias_pedidos
  ADD CONSTRAINT pessoas_ausencias_pedidos_substitui_fkey
  FOREIGN KEY (substitui_pedido_id, pessoa_id, organization_id)
  REFERENCES public.pessoas_ausencias_pedidos (id, pessoa_id, organization_id)
  ON DELETE SET NULL (substitui_pedido_id);

ALTER TABLE public.pessoas_ausencias_pedidos
  DROP CONSTRAINT IF EXISTS pessoas_ausencias_pedidos_substitui_nao_a_si_propria;
ALTER TABLE public.pessoas_ausencias_pedidos
  ADD CONSTRAINT pessoas_ausencias_pedidos_substitui_nao_a_si_propria
  CHECK (substitui_pedido_id IS NULL OR substitui_pedido_id <> id);

-- Uma so alteracao PENDENTE de cada vez sobre o mesmo original -- a segunda
-- tentativa tem de decidir a primeira antes de pedir outra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedidos_substitui_pendente
  ON public.pessoas_ausencias_pedidos (substitui_pedido_id)
  WHERE substitui_pedido_id IS NOT NULL AND estado IN ('pendente_chefia', 'pendente_rh');

-- Lookup geral (historico incluido, nao so o pendente).
CREATE INDEX IF NOT EXISTS idx_pessoas_ausencias_pedidos_substitui
  ON public.pessoas_ausencias_pedidos (substitui_pedido_id)
  WHERE substitui_pedido_id IS NOT NULL;

COMMENT ON COLUMN public.pessoas_ausencias_pedidos.substitui_pedido_id IS
'Quando NOT NULL, este pedido e um PEDIDO DE ALTERACAO DE DIAS: pretende substituir o pedido ja aprovado apontado aqui, com novas datas. Nao se reescrevem as datas do original -- seria uma aprovacao que nunca houve. Enquanto este pedido esta pendente_chefia/pendente_rh, o original continua aprovado e a ocupar as suas datas; so na aprovacao (hr_ausencias_efectivar_substituicao) e que o original e cancelado e este pedido ganha as suas linhas de pessoas_ausencias_dias. FK composta contra (id, pessoa_id, organization_id): uma FK simples deixaria substituir o pedido de outra pessoa.';

-- ---- A ARMADILHA CENTRAL: sem este GRANT, a coluna fica invisivel para
-- authenticated e TODAS as leituras de pessoas_ausencias_pedidos falham,
-- porque os hooks pedem as colunas pelo nome e o PostgREST recusa o SELECT
-- inteiro quando uma coluna pedida nao tem GRANT. 20261122050000 revogou o
-- GRANT SELECT ao nivel da TABELA e pos por lista explicita de colunas; uma
-- coluna nova entra so por GRANT explicito, nunca por heranca.
GRANT SELECT (substitui_pedido_id) ON TABLE public.pessoas_ausencias_pedidos TO authenticated;

-- ==============================================================================
-- 2. rpc_hr_ausencia_pedir_alteracao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_pedir_alteracao(
  _pedido_original_id uuid,
  _nova_data_inicio date,
  _nova_data_fim date,
  _novo_meio_dia_inicio boolean DEFAULT false,
  _novo_meio_dia_fim boolean DEFAULT false,
  _motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth        uuid := auth.uid();
  v_anew        uuid;
  v_eu          uuid;
  v_original    public.pessoas_ausencias_pedidos;
  v_tipo        public.hr_ausencias_tipos;
  v_aprovador   uuid;
  v_estado      text;
  v_pedido_id   uuid;
  v_dias_total  numeric(6,2) := 0;
  v_periodo_ini date;
  v_periodo_fim date;
  v_dia         date;
  v_fraccao     numeric(3,2);
  v_feriado     boolean;
  v_fim_semana  boolean;
  v_saldo       record;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_original FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_original_id;
  IF v_original.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_original_id USING ERRCODE = '23503';
  END IF;

  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_original.organization_id);

  -- Autoridade: a MESMA de pedir de raiz -- pedir para si e uma permissao,
  -- pedir por outro e outra. O tipo, o vinculo, a pessoa e a organizacao
  -- HERDAM-SE do original: nao sao argumentos desta RPC.
  IF v_eu IS NOT NULL AND v_eu = v_original.pessoa_id THEN
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir', v_original.organization_id) THEN
      RAISE EXCEPTION 'ausencia_sem_permissao: falta hr.ausencias.pedir nesta organizacao.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.pedir.outros', v_original.organization_id) THEN
      RAISE EXCEPTION
        'ausencia_sem_permissao: pedir uma alteracao na ficha de outra pessoa exige hr.ausencias.pedir.outros nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_original.estado <> 'aprovado' THEN
    RAISE EXCEPTION
      'ausencia_alteracao_original_nao_aprovado: so se pede alteracao de um pedido JA APROVADO; este esta em "%". Um pedido pendente altera-se cancelando e pedindo de novo.', v_original.estado
      USING ERRCODE = '23514';
  END IF;

  -- Fronteira ALTERACAO / CORRECCAO: original.data_inicio, nao data_fim. Uma
  -- ausencia que ja comecou deixa de ser "dias futuros a mudar" e passa a ser
  -- historico -- caminho de rpc_hr_ausencia_corrigir_aprovado, nao este.
  IF v_original.data_inicio <= current_date THEN
    RAISE EXCEPTION
      'ausencia_alteracao_ja_comecou: a ausencia original comeca em %, que ja nao e futuro. Pedir alteracao de dias e so para ausencias que ainda nao comecaram; uma ausencia ja iniciada ou passada corrige-se pelo caminho do historico.', v_original.data_inicio
      USING ERRCODE = '23514';
  END IF;

  -- So uma alteracao pendente de cada vez sobre o mesmo original -- o mesmo
  -- que o indice unico parcial ja garante, mas com mensagem legivel em vez de
  -- uma violacao de indice crua.
  IF EXISTS (
    SELECT 1 FROM public.pessoas_ausencias_pedidos a
     WHERE a.substitui_pedido_id = _pedido_original_id
       AND a.estado IN ('pendente_chefia', 'pendente_rh')
  ) THEN
    RAISE EXCEPTION
      'ausencia_alteracao_ja_pendente: ja ha um pedido de alteracao pendente sobre este original. Decida-o (ou cancele-o) antes de pedir outro.'
      USING ERRCODE = '23514';
  END IF;

  SELECT t.* INTO v_tipo
    FROM public.hr_ausencias_tipos t
   WHERE t.id = v_original.tipo_id AND t.organization_id = v_original.organization_id
     AND t.deleted_at IS NULL AND t.activo = true;

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION
      'ausencia_tipo_invalido: o tipo do pedido original nao existe nesta organizacao, esta apagado, ou esta inactivo.'
      USING ERRCODE = '23503';
  END IF;

  IF _nova_data_fim < _nova_data_inicio THEN
    RAISE EXCEPTION 'ausencia_datas_invalidas: a data de fim e anterior a de inicio.' USING ERRCODE = '23514';
  END IF;

  IF NOT v_tipo.permite_meio_dia AND (_novo_meio_dia_inicio OR _novo_meio_dia_fim) THEN
    RAISE EXCEPTION
      'ausencia_meio_dia_nao_permitido: o tipo "%" nao permite marcacao de meio dia.', v_tipo.nome
      USING ERRCODE = '23514';
  END IF;

  -- O periodo de saldo do PRIMEIRO dia das NOVAS datas, snapshot como em
  -- rpc_hr_ausencia_pedir.
  SELECT d.periodo_inicio, d.periodo_fim INTO v_periodo_ini, v_periodo_fim
    FROM public.pessoas_ausencias_direitos d
   WHERE d.pessoa_id = v_original.pessoa_id AND d.organization_id = v_original.organization_id
     AND d.tipo_id = v_original.tipo_id AND d.deleted_at IS NULL
     AND _nova_data_inicio BETWEEN d.periodo_inicio AND d.periodo_fim
   ORDER BY d.periodo_inicio DESC
   LIMIT 1;

  IF v_periodo_ini IS NULL THEN
    v_periodo_ini := date_trunc('year', _nova_data_inicio)::date;
    v_periodo_fim := (date_trunc('year', _nova_data_inicio) + interval '1 year - 1 day')::date;
  END IF;

  -- Chefia e estado inicial: um snapshot FRESCO tirado agora. A alteracao e
  -- um pedido novo e passa pela cadeia de aprovacao ACTUAL, nao a que aprovou
  -- o original.
  v_aprovador := public.hr_ausencias_aprovador_chefia(v_original.pessoa_id, v_original.organization_id);
  v_estado := public.hr_ausencias_estado_inicial(
    v_tipo.exige_aprovacao_chefia, v_aprovador IS NOT NULL, v_tipo.exige_aprovacao_rh
  );

  -- Contar os dias das NOVAS datas -- mesma expansao de rpc_hr_ausencia_pedir.
  -- NAO se criam linhas de pessoas_ausencias_dias enquanto pendente: o
  -- original continua aprovado e a ocupar essas datas, e o trigger de
  -- nao-sobreposicao recusaria; o contador de saldo tambem contaria a dobrar.
  -- So na aprovacao, em hr_ausencias_efectivar_substituicao, e que o original
  -- e cancelado e as linhas da alteracao nascem -- nessa ordem, nunca ao
  -- contrario.
  v_dia := _nova_data_inicio;
  WHILE v_dia <= _nova_data_fim LOOP
    v_fim_semana := extract(isodow FROM v_dia) IN (6, 7);

    SELECT EXISTS (
      SELECT 1 FROM public.schedule_holidays sh
       WHERE sh.organization_id = v_original.organization_id
         AND (
           (coalesce(sh.is_recurring, false) = false AND sh.holiday_date = v_dia)
           OR (coalesce(sh.is_recurring, false) = true
               AND to_char(sh.holiday_date, 'MM-DD') = to_char(v_dia, 'MM-DD'))
         )
    ) INTO v_feriado;

    IF (v_fim_semana AND NOT v_tipo.inclui_fim_de_semana)
       OR (v_feriado AND NOT v_tipo.inclui_feriados) THEN
      v_dia := v_dia + 1;
      CONTINUE;
    END IF;

    v_fraccao := 1.00;
    IF v_dia = _nova_data_inicio AND _novo_meio_dia_inicio THEN v_fraccao := 0.50; END IF;
    IF v_dia = _nova_data_fim AND _novo_meio_dia_fim THEN v_fraccao := 0.50; END IF;

    v_dias_total := v_dias_total + v_fraccao;
    v_dia := v_dia + 1;
  END LOOP;

  IF v_dias_total <= 0 THEN
    RAISE EXCEPTION
      'ausencia_sem_dias_uteis: o intervalo de % a % nao tem nenhum dia contavel para o tipo "%" (fins de semana e feriados ficam de fora deste tipo).',
      _nova_data_inicio, _nova_data_fim, v_tipo.nome
      USING ERRCODE = '23514';
  END IF;

  -- Saldo: AVISA, nao bloqueia -- o mesmo criterio que rpc_hr_ausencia_pedir
  -- ja aplica ao nao recusar por falta de direito registado. Quem decide a
  -- alteracao e que resolve, nao a base.
  IF v_tipo.desconta_saldo THEN
    SELECT * INTO v_saldo
      FROM public.hr_ausencias_saldo(v_original.pessoa_id, v_original.organization_id, v_original.tipo_id, v_periodo_ini);

    IF v_saldo.disponiveis IS NOT NULL AND v_dias_total > v_saldo.disponiveis THEN
      RAISE NOTICE
        'ausencia_alteracao_saldo_insuficiente: a alteracao pede % dias e o saldo disponivel no periodo e %. Aviso, nao bloqueio -- quem aprova decide.',
        v_dias_total, v_saldo.disponiveis;
    END IF;
  END IF;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);

  INSERT INTO public.pessoas_ausencias_pedidos (
    organization_id, pessoa_id, tipo_id, vinculo_id,
    data_inicio, data_fim, meio_dia_inicio, meio_dia_fim,
    dias_solicitados, motivo, estado,
    aprovador_chefia_pessoa_id, criado_por_pessoa_id, origem,
    periodo_inicio, periodo_fim, created_by,
    substitui_pedido_id
  ) VALUES (
    v_original.organization_id, v_original.pessoa_id, v_original.tipo_id, v_original.vinculo_id,
    _nova_data_inicio, _nova_data_fim, _novo_meio_dia_inicio, _novo_meio_dia_fim,
    v_dias_total, _motivo, v_estado,
    v_aprovador, v_eu, 'ficha',
    v_periodo_ini, v_periodo_fim, v_anew,
    _pedido_original_id
  )
  RETURNING id INTO v_pedido_id;

  -- As decisoes dispensadas, no mesmo molde de rpc_hr_ausencia_pedir: nunca
  -- ha um pedido aprovado sem duas linhas de decisao a explica-lo.
  IF v_estado <> 'pendente_chefia' THEN
    INSERT INTO public.pessoas_ausencias_pedido_decisoes (
      pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
    ) VALUES (
      v_pedido_id, v_original.pessoa_id, v_original.organization_id, 1, 'chefia', 'dispensado',
      CASE
        WHEN NOT v_tipo.exige_aprovacao_chefia
          THEN 'o tipo nao exige aprovacao de chefia'
        ELSE 'sem chefia atribuida'
      END
    );
  END IF;

  IF v_estado = 'aprovado' THEN
    INSERT INTO public.pessoas_ausencias_pedido_decisoes (
      pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
    ) VALUES (
      v_pedido_id, v_original.pessoa_id, v_original.organization_id, 1, 'rh', 'dispensado',
      'o tipo nao exige aprovacao de RH'
    );

    -- Um tipo que nao exige NEM chefia NEM RH nasce ja 'aprovado' -- como em
    -- rpc_hr_ausencia_pedir. So que aqui, ao contrario de um pedido normal,
    -- 'aprovado' e o gatilho da substituicao, e nenhuma RPC de decisao vai
    -- ser chamada depois (nasceu decidido). Por isso efectiva-se AQUI, e nao
    -- so a espera de rpc_hr_ausencia_decidir_chefia/_rh.
    PERFORM public.hr_ausencias_efectivar_substituicao(v_pedido_id);
  END IF;

  -- Projecta no board mesmo no caminho pendente: o contrato fixado no
  -- comentario da propria hr_ausencias_projectar_no_board e que o item existe
  -- DESDE O PEDIDO, com approval_status=pending e status=draft -- e
  -- rpc_hr_ausencia_pedir ja projecta enquanto pendente. Nao projectar aqui
  -- seria uma assimetria sem justificacao entre os dois caminhos de pedido.
  -- Isto NAO reabre a decisao de a alteracao pendente ficar fora do
  -- calendario anual e do contador: esses le em pessoas_ausencias_dias, que
  -- so nasce quando a alteracao e aprovada; o board le as datas do proprio
  -- pedido, nao essa tabela.
  PERFORM public.hr_ausencias_projectar_no_board(v_pedido_id);

  RETURN v_pedido_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text) IS
'Pede a alteracao de dias de um pedido JA APROVADO, herdando tipo, vinculo, pessoa e organizacao do original -- nao sao argumentos. Exige que o original esteja aprovado e ainda nao tenha comecado (data_inicio > hoje; ausencia_alteracao_ja_comecou caso contrario -- uma ausencia ja iniciada corrige-se pelo caminho do historico, rpc_hr_ausencia_corrigir_aprovado). So uma alteracao pendente de cada vez por original (ausencia_alteracao_ja_pendente, e o indice unico parcial por baixo).

NAO cria linhas em pessoas_ausencias_dias enquanto pendente: o original continua a ocupar as suas datas ate haver decisao, e criar dias da alteracao ja causaria sobreposicao ou dobra de saldo. So nasce com dias, e so cancela o original, quando aprovada -- ver hr_ausencias_efectivar_substituicao.

Saldo insuficiente e um AVISO (RAISE NOTICE), nao um bloqueio -- o mesmo criterio que rpc_hr_ausencia_pedir aplica a falta de direito registado.';

-- ==============================================================================
-- 3. hr_ausencias_efectivar_substituicao
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_ausencias_efectivar_substituicao(_pedido_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth               uuid := auth.uid();
  v_anew               uuid;
  v_ped                public.pessoas_ausencias_pedidos;
  v_original           public.pessoas_ausencias_pedidos;
  v_tipo               public.hr_ausencias_tipos;
  v_dias_recalculados  numeric(6,2) := 0;
  v_dia                date;
  v_fraccao            numeric(3,2);
  v_feriado            boolean;
  v_fim_semana         boolean;
  v_p_ini              date;
  v_ordem              smallint;
BEGIN
  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;

  -- 1) Sai se o pedido nao existir, nao for uma substituicao, ou (guarda
  -- extra alem do plano: defesa contra ser chamada por engano numa transicao
  -- que ainda nao e a aprovacao final) ja nao estiver 'aprovado'. As RPCs de
  -- decisao so a chamam quando o novo estado E 'aprovado', mas esta funcao
  -- nao confia so nisso.
  IF v_ped.id IS NULL OR v_ped.substitui_pedido_id IS NULL OR v_ped.estado <> 'aprovado' THEN
    RETURN;
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  -- 2) O original, TRANCADO: FOR UPDATE, para que duas aprovacoes concorrentes
  -- da mesma alteracao (nao deveria acontecer, mas nao se confia nisso) nao
  -- cancelem o original duas vezes nem leiam um estado a meio de mudar.
  SELECT o.* INTO v_original
    FROM public.pessoas_ausencias_pedidos o
   WHERE o.id = v_ped.substitui_pedido_id
     AND o.pessoa_id = v_ped.pessoa_id
     AND o.organization_id = v_ped.organization_id
   FOR UPDATE;

  IF v_original.id IS NULL THEN
    RAISE EXCEPTION
      'ausencia_alteracao_original_inexistente: o pedido original % da alteracao % nao existe, ou nao e da mesma pessoa/organizacao.',
      v_ped.substitui_pedido_id, _pedido_id
      USING ERRCODE = '23503';
  END IF;

  IF v_original.estado <> 'aprovado' THEN
    RAISE EXCEPTION
      'ausencia_alteracao_original_ja_fechada: o pedido original esta em "%", ja nao aprovado -- outra decisao (cancelamento, correccao) chegou primeiro. A aprovacao desta alteracao aborta.', v_original.estado
      USING ERRCODE = '23514';
  END IF;

  SELECT t.* INTO v_tipo FROM public.hr_ausencias_tipos t
   WHERE t.id = v_ped.tipo_id AND t.organization_id = v_ped.organization_id;

  IF v_tipo.id IS NULL THEN
    RAISE EXCEPTION
      'ausencia_tipo_inexistente: o tipo % da alteracao % nao existe nesta organizacao.', v_ped.tipo_id, _pedido_id
      USING ERRCODE = '23503';
  END IF;

  -- 3) Recalcula os dias com o calendario DE AGORA e compara com o gravado no
  -- pedido -- se um feriado ou o fim de semana da organizacao mudou entre o
  -- pedido e esta aprovacao, ausencia_alteracao_calendario_mudou e a
  -- aprovacao INTEIRA aborta (esta excepcao propaga-se atraves da RPC de
  -- decisao que chamou esta funcao, e o UPDATE do estado dessa RPC e desfeito
  -- com ela -- mesma transaccao).
  --
  -- ATENCAO: este loop repete quase a letra a expansao de calendario do passo
  -- 6 (linhas de dia da alteracao, mais abaixo). Os dois tem de continuar a
  -- concordar -- se divergirem, esta verificacao de "o calendario mudou"
  -- passa a comparar contra uma regra diferente da que realmente escreve os
  -- dias no passo 6, e o defeito so aparece nesse desencontro, nao aqui.
  v_dia := v_ped.data_inicio;
  WHILE v_dia <= v_ped.data_fim LOOP
    v_fim_semana := extract(isodow FROM v_dia) IN (6, 7);

    SELECT EXISTS (
      SELECT 1 FROM public.schedule_holidays sh
       WHERE sh.organization_id = v_ped.organization_id
         AND (
           (coalesce(sh.is_recurring, false) = false AND sh.holiday_date = v_dia)
           OR (coalesce(sh.is_recurring, false) = true
               AND to_char(sh.holiday_date, 'MM-DD') = to_char(v_dia, 'MM-DD'))
         )
    ) INTO v_feriado;

    IF (v_fim_semana AND NOT v_tipo.inclui_fim_de_semana)
       OR (v_feriado AND NOT v_tipo.inclui_feriados) THEN
      v_dia := v_dia + 1;
      CONTINUE;
    END IF;

    v_fraccao := 1.00;
    IF v_dia = v_ped.data_inicio AND v_ped.meio_dia_inicio THEN v_fraccao := 0.50; END IF;
    IF v_dia = v_ped.data_fim AND v_ped.meio_dia_fim THEN v_fraccao := 0.50; END IF;

    v_dias_recalculados := v_dias_recalculados + v_fraccao;
    v_dia := v_dia + 1;
  END LOOP;

  IF v_dias_recalculados <> v_ped.dias_solicitados THEN
    RAISE EXCEPTION
      'ausencia_alteracao_calendario_mudou: o calendario mudou entre o pedido (% dias) e agora (% dias) -- um feriado, ou o regime de fim de semana do tipo, foi alterado entretanto. A aprovacao aborta; peca a alteracao de novo para recalcular.',
      v_ped.dias_solicitados, v_dias_recalculados
      USING ERRCODE = '23514';
  END IF;

  -- 4) Cancela o original. So AGORA -- nunca depois das linhas de dia da
  -- alteracao (passo 6). E o UPDATE de estado que liberta as datas: o
  -- trigger AFTER UPDATE espelha as linhas de pessoas_ausencias_dias do
  -- original para 'cancelado', e so dai em diante o trigger de
  -- nao-sobreposicao (BEFORE INSERT em pessoas_ausencias_dias) deixa de as
  -- contar. TROCAR 4 E 6 FAZ O TRIGGER RECUSAR A APROVACAO SEMPRE QUE A
  -- ALTERACAO TOCA UMA DATA QUE O ORIGINAL AINDA OCUPA -- E O DEFEITO E
  -- INTERMITENTE: passa sem erro sempre que as datas novas nao se cruzam com
  -- as antigas, e so aparece no primeiro pedido que move um dia so.
  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  UPDATE public.pessoas_ausencias_pedidos
     SET estado = 'cancelado', updated_by = v_anew
   WHERE id = v_original.id;

  -- 5) O rasto no original -- SEM chamar rpc_hr_ausencia_cancelar. Essa RPC
  -- exige hr.ausencias.historico.editar E recusa sempre que quem decide e a
  -- propria pessoa do pedido (ausencia_historico_proprio, 20261201010000).
  -- Quem decidiu esta alteracao raramente tem essa permissao, e nao devia
  -- precisar dela: a autoridade de substituir o original vem de ter decidido
  -- a alteracao (hr.ausencias.aprovar.chefia ou .aprovar.rh, ja verificadas
  -- pela RPC chamadora), nao de editar historico. O original chega SEMPRE
  -- 'aprovado' a este ponto (passo 2), por isso o passo da decisao e sempre
  -- 'rh' -- o mesmo molde do ramo ELSE de rpc_hr_ausencia_cancelar, que usa
  -- 'rh' para qualquer pedido que nao esteja em pendente_chefia.
  --
  -- Guarda explicita: sem esta verificacao, um utilizador autenticado sem
  -- linha em anew_users chegaria ao INSERT abaixo com v_anew NULL e apanharia
  -- em bruto a violacao do CHECK de 20261121070000:191, que exige
  -- decidido_por_anew_user_id nao-nulo para qualquer resultado que nao seja
  -- 'dispensado'. Aqui traduz-se para um erro legivel, no mesmo prefixo
  -- ausencia_* dos restantes.
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_utilizador_anew: nao ha um utilizador anew_users associado a esta sessao.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(max(d.ordem), 0) + 1 INTO v_ordem
    FROM public.pessoas_ausencias_pedido_decisoes d
   WHERE d.pedido_id = v_original.id AND d.passo = 'rh';

  INSERT INTO public.pessoas_ausencias_pedido_decisoes (
    pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
    decidido_por_anew_user_id, decidido_por_pessoa_id, motivo
  ) VALUES (
    v_original.id, v_original.pessoa_id, v_original.organization_id, v_ordem, 'rh', 'recusado',
    v_anew, public.hr_pessoa_do_utilizador(v_auth, v_original.organization_id),
    'substituido pelo pedido de alteracao de dias ' || _pedido_id::text
  );

  -- 6) As linhas de dia da alteracao -- SO AGORA, com o original ja cancelado
  -- (passo 4) e as suas linhas ja espelhadas para 'cancelado'. So por isso o
  -- trigger de nao-sobreposicao das novas linhas ja nao ve as antigas.
  v_dia := v_ped.data_inicio;
  WHILE v_dia <= v_ped.data_fim LOOP
    v_fim_semana := extract(isodow FROM v_dia) IN (6, 7);

    SELECT EXISTS (
      SELECT 1 FROM public.schedule_holidays sh
       WHERE sh.organization_id = v_ped.organization_id
         AND (
           (coalesce(sh.is_recurring, false) = false AND sh.holiday_date = v_dia)
           OR (coalesce(sh.is_recurring, false) = true
               AND to_char(sh.holiday_date, 'MM-DD') = to_char(v_dia, 'MM-DD'))
         )
    ) INTO v_feriado;

    IF (v_fim_semana AND NOT v_tipo.inclui_fim_de_semana)
       OR (v_feriado AND NOT v_tipo.inclui_feriados) THEN
      v_dia := v_dia + 1;
      CONTINUE;
    END IF;

    v_fraccao := 1.00;
    IF v_dia = v_ped.data_inicio AND v_ped.meio_dia_inicio THEN v_fraccao := 0.50; END IF;
    IF v_dia = v_ped.data_fim AND v_ped.meio_dia_fim THEN v_fraccao := 0.50; END IF;

    SELECT d.periodo_inicio INTO v_p_ini
      FROM public.pessoas_ausencias_direitos d
     WHERE d.pessoa_id = v_ped.pessoa_id AND d.organization_id = v_ped.organization_id
       AND d.tipo_id = v_ped.tipo_id AND d.deleted_at IS NULL
       AND v_dia BETWEEN d.periodo_inicio AND d.periodo_fim
     ORDER BY d.periodo_inicio DESC
     LIMIT 1;

    IF v_p_ini IS NULL THEN
      v_p_ini := date_trunc('year', v_dia)::date;
    END IF;

    INSERT INTO public.pessoas_ausencias_dias (
      pedido_id, pessoa_id, organization_id, tipo_id,
      data, fraccao_dia, conta_saldo, e_feriado, e_fim_semana,
      periodo_inicio, estado
    ) VALUES (
      v_ped.id, v_ped.pessoa_id, v_ped.organization_id, v_ped.tipo_id,
      v_dia, v_fraccao, v_tipo.desconta_saldo, v_feriado, v_fim_semana,
      v_p_ini, 'aprovado'
    );

    v_dia := v_dia + 1;
  END LOOP;

  -- 7) Projecta no board os dois. O trigger AFTER UPDATE de cada UPDATE de
  -- estado (o do original no passo 4, e o da propria alteracao feito pela
  -- RPC de decisao ANTES de chamar esta funcao) ja chama isto
  -- automaticamente -- mas o da alteracao correu SEM as linhas de dia ainda
  -- criadas (passo 6 e depois dele). Repete-se aqui, explicito, depois de
  -- tudo estar escrito, para o board reflectir o estado final dos dois
  -- pedidos independentemente da ordem em que os triggers correram.
  PERFORM public.hr_ausencias_projectar_no_board(v_original.id);
  PERFORM public.hr_ausencias_projectar_no_board(v_ped.id);
END;
$$;

REVOKE ALL ON FUNCTION public.hr_ausencias_efectivar_substituicao(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_ausencias_efectivar_substituicao(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_ausencias_efectivar_substituicao(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_ausencias_efectivar_substituicao(uuid) TO service_role;

COMMENT ON FUNCTION public.hr_ausencias_efectivar_substituicao(uuid) IS
'Efectiva um pedido de alteracao de dias JA APROVADO: cancela o pedido original que ele substitui e cria as suas proprias linhas de pessoas_ausencias_dias. Chamada de dentro de rpc_hr_ausencia_decidir_chefia e rpc_hr_ausencia_decidir_rh, na mesma transaccao, sempre e so quando o novo estado do pedido E aprovado -- e directamente por rpc_hr_ausencia_pedir_alteracao quando a alteracao nasce ja aprovada (tipo sem chefia nem RH). No-op se o pedido nao for uma substituicao ou nao estiver aprovado.

ORDEM INEGOCIAVEL: 1) sai cedo; 2) le e tranca o original; 3) recalcula os dias com o calendario de agora e aborta a aprovacao inteira se divergir do gravado (ausencia_alteracao_calendario_mudou); 4) cancela o original; 5) grava o rasto no original SEM rpc_hr_ausencia_cancelar; 6) cria os dias da alteracao; 7) projecta no board os dois. Inverter 4 e 6 faz o trigger de nao-sobreposicao recusar a aprovacao sempre que a alteracao toca uma data que o original ainda ocupa -- E O DEFEITO E INTERMITENTE, invisivel sempre que as datas novas nao se cruzam com as antigas.

authenticated NAO executa esta funcao directamente: so as RPCs SECURITY DEFINER do modulo a chamam.';

-- ==============================================================================
-- 4. rpc_hr_ausencia_decidir_chefia (recriada: chama a substituicao apos aprovar)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_decidir_chefia(
  _pedido_id uuid,
  _resultado text,
  _motivo text DEFAULT NULL,
  _ajuste_data_inicio date DEFAULT NULL,
  _ajuste_data_fim date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth   uuid := auth.uid();
  v_anew   uuid;
  v_ped      public.pessoas_ausencias_pedidos;
  v_ordem    smallint;
  v_ordem_rh smallint;
  v_novo     text;
  v_exige_rh boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.chefia', v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: decidir o passo de chefia exige hr.ausencias.aprovar.chefia nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  -- E dos SEUS. A hierarquia ACTUAL, e nao o snapshot do pedido: quem entrou
  -- agora tem de conseguir despachar a fila que herdou.
  IF NOT public.hr_ausencias_pessoa_na_minha_cadeia(v_auth, v_ped.pessoa_id, v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_fora_da_cadeia: esta pessoa nao esta na sua cadeia de chefia. Quem tem hr.ausencias.aprovar.chefia decide os pedidos de quem lhe reporta, nao os de toda a organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ped.estado <> 'pendente_chefia' THEN
    RAISE EXCEPTION
      'ausencia_passo_errado: o pedido esta em "%" e o passo de chefia decide-se em pendente_chefia.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  IF _resultado NOT IN ('aprovado','recusado','ajustado') THEN
    RAISE EXCEPTION
      'ausencia_resultado_invalido: no passo de chefia os resultados sao aprovado, recusado ou ajustado (recebido "%").', _resultado
      USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(max(d.ordem), 0) + 1 INTO v_ordem
    FROM public.pessoas_ausencias_pedido_decisoes d
   WHERE d.pedido_id = _pedido_id AND d.passo = 'chefia';

  INSERT INTO public.pessoas_ausencias_pedido_decisoes (
    pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
    decidido_por_anew_user_id, decidido_por_pessoa_id, motivo,
    ajuste_data_inicio, ajuste_data_fim
  ) VALUES (
    _pedido_id, v_ped.pessoa_id, v_ped.organization_id, v_ordem, 'chefia', _resultado,
    v_anew, public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id), _motivo,
    _ajuste_data_inicio, _ajuste_data_fim
  );

  -- 'ajustado' NAO avanca o pedido: e uma contraproposta, e o passo continua em
  -- aberto ate quem pediu aceitar ou refazer. Avanca-lo seria aprovar datas que
  -- a pessoa nunca pediu.
  IF _resultado = 'ajustado' THEN
    RETURN;
  END IF;

  -- O TIPO decide para onde vai um pedido aprovado pela chefia. Sem esta
  -- leitura, um tipo de chefia-so (exige_aprovacao_chefia = true,
  -- exige_aprovacao_rh = false) ficava em pendente_rh a espera de um passo
  -- que nunca devia existir, e ninguem o podia fechar.
  SELECT t.exige_aprovacao_rh INTO v_exige_rh
    FROM public.hr_ausencias_tipos t
   WHERE t.id = v_ped.tipo_id AND t.organization_id = v_ped.organization_id;

  IF v_exige_rh IS NULL THEN
    RAISE EXCEPTION
      'ausencia_tipo_inexistente: o tipo % do pedido % nao existe nesta organizacao. Sem o tipo nao se sabe se ha passo de RH, e decidir as cegas mandava o pedido para uma fila que pode nao existir.',
      v_ped.tipo_id, _pedido_id
      USING ERRCODE = '23503';
  END IF;

  v_novo := public.hr_ausencias_estado_apos_chefia(_resultado, v_exige_rh);

  -- Num tipo de chefia-so o pedido fecha aqui, e a decisao do passo de RH fica
  -- gravada NA MESMA TRANSACCAO com resultado 'dispensado'. Sem ela ficava um
  -- pedido aprovado com meio historico, e o passo em falta lia-se como um
  -- passo perdido em vez de um passo que o tipo nao tem.
  IF v_novo = 'aprovado' THEN
    SELECT coalesce(max(d.ordem), 0) + 1 INTO v_ordem_rh
      FROM public.pessoas_ausencias_pedido_decisoes d
     WHERE d.pedido_id = _pedido_id AND d.passo = 'rh';

    INSERT INTO public.pessoas_ausencias_pedido_decisoes (
      pedido_id, pessoa_id, organization_id, ordem, passo, resultado, motivo
    ) VALUES (
      _pedido_id, v_ped.pessoa_id, v_ped.organization_id, v_ordem_rh, 'rh', 'dispensado',
      'o tipo nao exige aprovacao de RH'
    );
  END IF;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  UPDATE public.pessoas_ausencias_pedidos SET estado = v_novo, updated_by = v_anew WHERE id = _pedido_id;

  -- Chamada nova desta migracao: se este pedido e uma alteracao de dias e o
  -- estado que acabou de ganhar E 'aprovado' (tipo de chefia-so), efectiva-se
  -- a substituicao NA MESMA TRANSACCAO. No-op para qualquer pedido que nao
  -- tenha substitui_pedido_id.
  IF v_novo = 'aprovado' THEN
    PERFORM public.hr_ausencias_efectivar_substituicao(_pedido_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_decidir_chefia(uuid, text, text, date, date) IS
'O passo de chefia. Exige hr.ausencias.aprovar.chefia E que a pessoa esteja na cadeia de chefia ACTUAL de quem decide -- a permissao sozinha nao da poder sobre a organizacao toda.

aprovado leva a pendente_rh nos tipos que exigem aprovacao de RH, e directamente a aprovado nos tipos de chefia-so (exige_aprovacao_chefia = true, exige_aprovacao_rh = false) -- neste caso grava tambem, na mesma transaccao, a decisao do passo de RH com resultado dispensado, para o historico ficar completo. Qual dos dois nao e escolha desta funcao: e hr_ausencias_estado_apos_chefia que responde, e a maquina de estados recusa o outro.

ajustado grava a contraproposta e NAO avanca o pedido, porque avanca-lo seria aprovar datas que a pessoa nao pediu.

Desde 20261201020000: quando o pedido decidido aqui fica aprovado, chama hr_ausencias_efectivar_substituicao na mesma transaccao -- no-op para um pedido normal, e o que cancela o original e cria os dias da alteracao quando este pedido e um pedido de alteracao de dias.';

-- ==============================================================================
-- 5. rpc_hr_ausencia_decidir_rh (recriada: chama a substituicao apos aprovar)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_ausencia_decidir_rh(
  _pedido_id uuid,
  _resultado text,
  _motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth  uuid := auth.uid();
  v_anew  uuid;
  v_ped           public.pessoas_ausencias_pedidos;
  v_ordem         smallint;
  v_novo          text;
  v_exige_chefia  boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'ausencia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  SELECT p.* INTO v_ped FROM public.pessoas_ausencias_pedidos p WHERE p.id = _pedido_id;
  IF v_ped.id IS NULL THEN
    RAISE EXCEPTION 'ausencia_pedido_inexistente: o pedido % nao existe.', _pedido_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.ausencias.aprovar.rh', v_ped.organization_id) THEN
    RAISE EXCEPTION
      'ausencia_sem_permissao: decidir o passo de RH exige hr.ausencias.aprovar.rh nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_ped.estado <> 'pendente_rh' THEN
    RAISE EXCEPTION
      'ausencia_passo_errado: o pedido esta em "%" e o passo de RH decide-se em pendente_rh.', v_ped.estado
      USING ERRCODE = '23514';
  END IF;

  IF _resultado NOT IN ('aprovado','recusado','devolvido') THEN
    RAISE EXCEPTION
      'ausencia_resultado_invalido: no passo de RH os resultados sao aprovado, recusado ou devolvido (recebido "%").', _resultado
      USING ERRCODE = '23514';
  END IF;

  -- O espelho do defeito do passo de chefia: 'devolvido' manda o pedido a
  -- chefia, so que ha pedidos que nunca passaram por chefia nenhuma -- o tipo
  -- dispensa-a, ou a pessoa nao tem chefia resoluvel. Devolve-los deixava-os
  -- em pendente_chefia, uma fila que ninguem consegue abrir: decidir_chefia
  -- exige que a pessoa esteja na cadeia de quem decide, e nao ha cadeia.
  IF _resultado = 'devolvido' THEN
    SELECT t.exige_aprovacao_chefia INTO v_exige_chefia
      FROM public.hr_ausencias_tipos t
     WHERE t.id = v_ped.tipo_id AND t.organization_id = v_ped.organization_id;

    IF NOT coalesce(v_exige_chefia, false)
       OR public.hr_ausencias_aprovador_chefia(v_ped.pessoa_id, v_ped.organization_id) IS NULL THEN
      RAISE EXCEPTION
        'ausencia_sem_passo_de_chefia: este pedido nao tem passo de chefia (o tipo dispensa-o, ou a pessoa nao tem chefia resoluvel neste momento) e devolve-lo deixava-o numa fila que ninguem consegue abrir. Decidir aqui: aprovado ou recusado.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT coalesce(max(d.ordem), 0) + 1 INTO v_ordem
    FROM public.pessoas_ausencias_pedido_decisoes d
   WHERE d.pedido_id = _pedido_id AND d.passo = 'rh';

  INSERT INTO public.pessoas_ausencias_pedido_decisoes (
    pedido_id, pessoa_id, organization_id, ordem, passo, resultado,
    decidido_por_anew_user_id, decidido_por_pessoa_id, motivo
  ) VALUES (
    _pedido_id, v_ped.pessoa_id, v_ped.organization_id, v_ordem, 'rh', _resultado,
    v_anew, public.hr_pessoa_do_utilizador(v_auth, v_ped.organization_id), _motivo
  );

  v_novo := CASE _resultado
    WHEN 'aprovado'  THEN 'aprovado'
    WHEN 'recusado'  THEN 'recusado'
    WHEN 'devolvido' THEN 'pendente_chefia'
  END;

  PERFORM set_config('hr_ausencias.rpc', 'on', true);
  UPDATE public.pessoas_ausencias_pedidos SET estado = v_novo, updated_by = v_anew WHERE id = _pedido_id;

  -- Chamada nova desta migracao: efectiva a substituicao na mesma transaccao
  -- quando o resultado do passo de RH e 'aprovado'. No-op para qualquer
  -- pedido que nao tenha substitui_pedido_id.
  IF v_novo = 'aprovado' THEN
    PERFORM public.hr_ausencias_efectivar_substituicao(_pedido_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_ausencia_decidir_rh(uuid, text, text) IS
'O passo de RH, que fecha o pedido. So ve pedidos em pendente_rh -- e um tipo de chefia-so nunca la chega, porque a aprovacao da chefia leva-o directamente a aprovado.

devolvido exige que haja mesmo passo de chefia para onde devolver (o tipo exige-o E a pessoa tem chefia resoluvel): sem isso o pedido cairia numa fila que ninguem consegue abrir. Havendo, devolve o pedido a pendente_chefia sem perder a primeira volta -- a unique (pedido_id, passo, ordem) da a segunda decisao de chefia a ordem 2 em vez de sobrescrever a 1.

Desde 20261201020000: quando o resultado e aprovado, chama hr_ausencias_efectivar_substituicao na mesma transaccao -- no-op para um pedido normal, e o que cancela o original e cria os dias da alteracao quando este pedido e um pedido de alteracao de dias.';

-- ---- Conferir ----------------------------------------------------------------
-- Cada assercao a seguir prova a REGRA, nao o andaime: para cada uma, o
-- comentario acima dela diz que estado real a faria falhar.
DO $conferir$
DECLARE
  v_n                  int;
  v_tem_coluna         boolean;
  v_tem_fk             boolean;
  v_tem_check          boolean;
  v_tem_indice         boolean;
  v_colunas_tabela     text[];
  v_colunas_concedidas text[];
  v_em_falta           text[];
  v_a_mais             text[];
  v_secdef             boolean;
  v_search_path        text[];
  v_src_chefia         text;
  v_src_rh             text;
BEGIN
  -- Falharia se a ALTER TABLE ADD COLUMN nao tivesse corrido (migracao parou
  -- a meio, ou foi aplicada contra uma base onde a coluna ja existia com
  -- outro tipo).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
       AND column_name = 'substitui_pedido_id' AND data_type = 'uuid'
  ) INTO v_tem_coluna;
  IF NOT v_tem_coluna THEN
    RAISE EXCEPTION 'pessoas_ausencias_pedidos.substitui_pedido_id nao existe (ou nao e uuid).';
  END IF;

  -- Falharia se a FK fosse simples (so contra id) em vez de composta: uma FK
  -- simples deixaria uma alteracao apontar ao pedido de OUTRA pessoa.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'pessoas_ausencias_pedidos_substitui_fkey'
       AND c.conrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND c.contype = 'f'
       AND cardinality(c.conkey) = 3
  ) INTO v_tem_fk;
  IF NOT v_tem_fk THEN
    RAISE EXCEPTION
      'pessoas_ausencias_pedidos_substitui_fkey nao existe ou nao e uma FK composta de 3 colunas -- uma FK simples deixaria substituir o pedido de outra pessoa.';
  END IF;

  -- Falharia se o CHECK tivesse sido esquecido: um pedido apontaria para si
  -- proprio como o original que substitui.
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'pessoas_ausencias_pedidos_substitui_nao_a_si_propria'
       AND c.conrelid = to_regclass('public.pessoas_ausencias_pedidos')
       AND c.contype = 'c'
  ) INTO v_tem_check;
  IF NOT v_tem_check THEN
    RAISE EXCEPTION 'pessoas_ausencias_pedidos_substitui_nao_a_si_propria nao existe.';
  END IF;

  -- Falharia se o indice unico parcial nao existisse: duas alteracoes
  -- pendentes sobre o mesmo original conseguiriam coexistir.
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'pessoas_ausencias_pedidos'
       AND indexname = 'idx_pessoas_ausencias_pedidos_substitui_pendente'
       AND indexdef LIKE '%UNIQUE%'
  ) INTO v_tem_indice;
  IF NOT v_tem_indice THEN
    RAISE EXCEPTION
      'idx_pessoas_ausencias_pedidos_substitui_pendente nao existe (ou nao e UNIQUE) -- duas alteracoes pendentes sobre o mesmo original nao seriam impedidas.';
  END IF;

  -- O CONJUNTO de colunas com GRANT SELECT a authenticated tem de ser
  -- EXACTAMENTE o da tabela menos motivo -- falha para os dois lados.
  -- Repete a mesma verificacao de 20261122050000, agora incluindo
  -- substitui_pedido_id: falharia se esta migracao NAO tivesse dado o GRANT
  -- da coluna nova (fica invisivel, e TODAS as leituras da tabela param,
  -- porque o PostgREST recusa o SELECT inteiro quando uma coluna pedida nao
  -- tem GRANT), e falharia tambem se motivo tivesse ganho GRANT por engano.
  SELECT array_agg(column_name ORDER BY column_name) INTO v_colunas_tabela
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
     AND column_name <> 'motivo';

  SELECT array_agg(column_name ORDER BY column_name) INTO v_colunas_concedidas
    FROM information_schema.role_column_grants
   WHERE table_schema = 'public' AND table_name = 'pessoas_ausencias_pedidos'
     AND grantee = 'authenticated' AND privilege_type = 'SELECT';

  SELECT array_agg(c) INTO v_em_falta
    FROM unnest(coalesce(v_colunas_tabela, '{}'::text[])) c
   WHERE c <> ALL (coalesce(v_colunas_concedidas, '{}'::text[]));

  SELECT array_agg(c) INTO v_a_mais
    FROM unnest(coalesce(v_colunas_concedidas, '{}'::text[])) c
   WHERE c <> ALL (coalesce(v_colunas_tabela, '{}'::text[]));

  IF v_em_falta IS NOT NULL THEN
    RAISE EXCEPTION
      'authenticated ficou sem SELECT em colunas de pessoas_ausencias_pedidos que deviam continuar legiveis: %. Se for substitui_pedido_id, falta o GRANT desta migracao.',
      v_em_falta;
  END IF;

  IF v_a_mais IS NOT NULL THEN
    RAISE EXCEPTION
      'authenticated tem SELECT em colunas de pessoas_ausencias_pedidos fora do esperado (incluindo, possivelmente, motivo): %.',
      v_a_mais;
  END IF;

  -- Falharia se rpc_hr_ausencia_pedir_alteracao ou hr_ausencias_efectivar_
  -- substituicao tivessem sido criadas sem SECURITY DEFINER ou com
  -- search_path aberto -- ficariam vulneraveis a sequestro de search_path.
  FOR v_secdef, v_search_path, v_n IN
    SELECT p.prosecdef, p.proconfig, 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND ((p.proname = 'rpc_hr_ausencia_pedir_alteracao' AND p.pronargs = 6)
            OR (p.proname = 'hr_ausencias_efectivar_substituicao' AND p.pronargs = 1))
  LOOP
    IF NOT v_secdef THEN
      RAISE EXCEPTION 'Uma das funcoes novas desta migracao nao e SECURITY DEFINER.';
    END IF;
    IF v_search_path IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(v_search_path) c WHERE c LIKE 'search_path=%') THEN
      RAISE EXCEPTION 'Uma das funcoes novas desta migracao ficou sem search_path fixo.';
    END IF;
  END LOOP;

  -- Falharia se authenticated tivesse ganho EXECUTE em
  -- hr_ausencias_efectivar_substituicao: passaria a poder cancelar qualquer
  -- pedido aprovado directamente, por fora da cadeia de decisao.
  IF has_function_privilege('authenticated', 'public.hr_ausencias_efectivar_substituicao(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated tem EXECUTE em hr_ausencias_efectivar_substituicao; devia ser so service_role.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_ausencias_efectivar_substituicao(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu EXECUTE em hr_ausencias_efectivar_substituicao.';
  END IF;

  -- Falharia se anon tivesse ganho EXECUTE em rpc_hr_ausencia_pedir_alteracao:
  -- um pedido de alteracao passaria a poder ser criado sem sessao nenhuma.
  IF has_function_privilege('anon', 'public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon tem EXECUTE em rpc_hr_ausencia_pedir_alteracao; devia continuar sem.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_ausencia_pedir_alteracao(uuid, date, date, boolean, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em rpc_hr_ausencia_pedir_alteracao.';
  END IF;

  -- Falharia se o CREATE OR REPLACE tivesse deixado uma segunda assinatura
  -- para tras (uma aridade nova com DEFAULT cria uma segunda funcao e o
  -- PostgREST deixa de saber qual escolher -- ja aconteceu neste projecto).
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_decidir_chefia';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.rpc_hr_ausencia_decidir_chefia; esperava-se exactamente 1.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_decidir_rh';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.rpc_hr_ausencia_decidir_rh; esperava-se exactamente 1.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_pedir_alteracao';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.rpc_hr_ausencia_pedir_alteracao; esperava-se exactamente 1.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'hr_ausencias_efectivar_substituicao';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Ha % funcoes public.hr_ausencias_efectivar_substituicao; esperava-se exactamente 1.', v_n;
  END IF;

  -- A REGRA em si, nao o andaime: o corpo COMPILADO (pg_proc.prosrc) das duas
  -- RPCs de decisao tem de conter a chamada a hr_ausencias_efectivar_
  -- substituicao. Falharia se o CREATE OR REPLACE aplicado na base fosse uma
  -- versao sem a chamada -- por exemplo se este ficheiro fosse editado depois
  -- de um push parcial, ou se uma migracao futura recriasse estas RPCs sem
  -- ler a versao em vigor primeiro (a mesma classe de erro que ja ressuscitou
  -- uma assinatura antiga neste modulo).
  SELECT p.prosrc INTO v_src_chefia
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_decidir_chefia' AND p.pronargs = 5;

  IF v_src_chefia IS NULL OR v_src_chefia NOT LIKE '%hr_ausencias_efectivar_substituicao%' THEN
    RAISE EXCEPTION
      'rpc_hr_ausencia_decidir_chefia nao chama hr_ausencias_efectivar_substituicao no corpo aplicado (pg_proc.prosrc); uma alteracao aprovada pela chefia (tipo de chefia-so) nunca substituiria o original.';
  END IF;

  SELECT p.prosrc INTO v_src_rh
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_ausencia_decidir_rh' AND p.pronargs = 3;

  IF v_src_rh IS NULL OR v_src_rh NOT LIKE '%hr_ausencias_efectivar_substituicao%' THEN
    RAISE EXCEPTION
      'rpc_hr_ausencia_decidir_rh nao chama hr_ausencias_efectivar_substituicao no corpo aplicado (pg_proc.prosrc); uma alteracao aprovada pelo RH nunca substituiria o original.';
  END IF;

  RAISE NOTICE
    'Conferido: coluna, FK composta, CHECK e indice unico parcial existem; GRANT por coluna confere exactamente com a tabela menos motivo (incluindo substitui_pedido_id); as funcoes novas sao SECURITY DEFINER com search_path fixo; hr_ausencias_efectivar_substituicao so e executavel por service_role; rpc_hr_ausencia_pedir_alteracao executavel por authenticated e nao por anon; uma unica funcao com cada nome recriado; e as duas RPCs de decisao chamam mesmo hr_ausencias_efectivar_substituicao no corpo aplicado.';
END;
$conferir$;
