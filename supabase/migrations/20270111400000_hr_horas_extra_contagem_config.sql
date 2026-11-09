-- ==============================================================================
-- Horas extra aprovadas (ENTREGA E1 do plano "horas extra aprovadas passam a
-- contar no relatorio e no pagamento"): o interruptor por organizacao, a
-- leitura das horas extra de uma pessoa num intervalo e a assinatura que o
-- fecho da folha vai conferir (20270111410000). ADITIVA: nada do que existe
-- muda de comportamento.
--
-- PROVISORIO. NAO FAZER db push sem: (1) listar o remoto imediatamente antes,
-- a partir do worktree rh-pessoas (project-ref uetjghdkwbywbftedtth), e
-- confirmar que so este ficheiro e 20270111410000 ficam pendentes, acima de
-- 20270110710000 (20270111300000 fica reservado as denuncias); (2) correr a
-- prova na nike em transaccao desfeita ANTES do push (o conferir abaixo e essa
-- prova); (3) revisao ecc:database-reviewer e ecc:security-reviewer. Entra no
-- MESMO push que 20270111410000 (fecho e folha fechada), que depende desta.
--
--
-- -- PRECISA DE CODIGO NOVO NO MESMO ENVIO --------------------------------------
--
-- NAO para nada partir: a coluna nasce NULL em todas as organizacoes e as RPCs
-- sao novas. Para USAR: o relatorio (E4) le rpc_hr_horas_extra_do_periodo; o
-- processamento (E5) le rpc_hr_horas_extra_assinaturas e envia
-- horas_extra_assinatura ao fechar; o ecra de configuracao (E6) chama
-- rpc_hr_horas_extra_contagem_guardar. Ligar o interruptor antes de E3 a E5
-- estarem publicadas faz o fecho recusar sem traducao no ecra (ver
-- 20270111410000).
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. hr_horas_extra_config.aprovacao_conta_desde date NULL (D1). NULL = como
--    hoje (modo bruto). Com uma data: os dias com data >= essa data contam so
--    as horas extra CONFIRMADAS (modo aprovacao); os anteriores ficam em modo
--    bruto. CHECK 2000-01-01..2100-12-31. A tabela tem UMA linha por
--    organizacao (PK organization_id; sem linha = omissoes): guardar o
--    interruptor numa organizacao sem linha cria-a com as omissoes de
--    hr_horas_extra_config_omissao(); desligar sem linha nao cria nada.
--    rpc_hr_horas_extra_config_guardar nao mexe nesta coluna (o seu ON
--    CONFLICT so actualiza os quatro limites).
--
-- 2. rpc_hr_horas_extra_contagem_guardar(p_organization_id uuid, p_desde date)
--      RETURNS jsonb {aprovacao_desde, alterada}
--    hr.assiduidade.gerir, organizacao empregadora e limite por actor (via
--    hr_horas_extra_exigir_escrita, como as outras escritas de horas extra).
--    p_desde NULL desliga. Data de 2000-01-01 ate hoje + 5 anos (Lisboa).
--    Toma o lock da organizacao (a chave 'hr_periodos_processamento:' de
--    hr_desvios_config e das regras salariais) e FOR SHARE das folhas que
--    acabam a partir da data: fechar uma folha a meio espera por esta
--    transaccao. Recusa (HRA87) uma data nova em ou antes do fim de uma
--    folha FECHADA e, nos dois sentidos, qualquer alteracao que deixe de
--    cobrir uma folha fechada que a data antiga cobria (existe folha fechada
--    com data_fim >= data antiga e (p_desde NULL ou data_fim < p_desde)):
--    depois de uma folha fechada com a contagem ligada, nao se desliga nem
--    se adia (revisao M1).
--    A mesma data que ja la esta: alterada=false, sem evento. Evento
--    config_alterada {campo, antes, depois, linha_criada}.
--
-- 3. rpc_hr_horas_extra_do_periodo(p_organization_id uuid, p_pessoa_id uuid,
--      p_de date, p_ate date) RETURNS jsonb
--      {pessoa_id, aprovacao_desde, linhas: [{id, data, origem, estado,
--       minutos, nocturno_min, tipo_registo}], assinatura}
--    Ambito de leitura das horas extra (hr_horas_extra_ambito_leitura):
--    hr.assiduidade.view qualquer pessoa da organizacao; view.own so a sua
--    (p_pessoa_id NULL = a sua; outra = 42501). Com view, p_pessoa_id NULL e
--    pedido_invalido. Ate 62 dias. Todas as linhas (pendente, confirmada,
--    rejeitada), por data e id. assinatura = hr_horas_extra_assinatura da
--    pessoa no intervalo (NULL so com o interruptor desligado). pessoa_id
--    vai a mais do que o
--    plano pede: diz a quem tem view.own qual foi a pessoa resolvida.
--
-- 4. hr_horas_extra_assinaturas_periodo(org, de, ate, pessoas uuid[]) e
--    hr_horas_extra_assinatura(org, pessoa, de, ate) (internas): para CADA
--    pessoa pedida, md5(coalesce(string_agg(id || ':' || estado || ':' ||
--    minutos || ':' || origem, ',' ORDER BY id), '') || '|' ||
--    to_char(aprovacao_conta_desde, 'YYYY-MM-DD')) das linhas com data no
--    intervalo (revisao H1). Liga a assinatura ao modo usado: com o
--    interruptor ligado NUNCA e NULL (quem nao tem linhas tambem tem); com
--    ele desligado e sempre NULL. A data vai por to_char e nao por ::text
--    (nao depende do DateStyle da sessao).
--
-- 5. rpc_hr_horas_extra_assinaturas(p_periodo_id uuid) RETURNS TABLE
--      (pessoa_id uuid, assinatura text)
--    As mesmas permissoes de rpc_hr_desvios_assinaturas:
--    hr.processamento.periodo.gerir ou hr.assiduidade.gerir na organizacao do
--    periodo (inexistente e sem permissao: a mesma recusa). Intervalo:
--    data_inicio..data_fim do periodo (o que o fecho confere). Pessoas: as
--    nao apagadas com vinculo sobreposto ao periodo e as que tem horas extra
--    nele (o que o fecho exige e permite).
--
-- 6. rpc_hr_horas_extra_do_periodo_org(p_organization_id uuid, p_de date,
--      p_ate date) RETURNS jsonb
--      {aprovacao_desde, pessoas: [{pessoa_id, linhas: [...], assinatura}]}
--    O mesmo que a 3 para varias pessoas numa so chamada (para o cliente
--    deixar de chamar pessoa a pessoa; revisao M3). view: as pessoas nao
--    apagadas com vinculo sobreposto ao intervalo ou com horas extra nele;
--    view.own: so a propria. Ate 62 dias. Linhas no formato da 3.
--
--
-- -- DECISOES TOMADAS AQUI (a validar) -------------------------------------------
--
--  a) Depois de uma folha fechada com a contagem ligada, o interruptor ja
--     nao se desliga nem se adia (revisao M1): os dias dessas folhas nunca
--     voltam a modo bruto nem perdem a proteccao do trigger de
--     20270111410000. Mudar de regime depois disso exige uma migracao.
--  b) Guardar o interruptor numa organizacao sem linha cria a linha com as
--     omissoes: rpc_hr_horas_extra_config_ler passa a devolver omissao=false
--     para essa organizacao (os valores sao os mesmos).
--  c) Nenhuma RPC de leitura do interruptor para o ecra de configuracao: o
--     plano nao a pede (rpc_hr_horas_extra_do_periodo devolve-o, mas exige uma
--     pessoa). Ver o relatorio da entrega.
--  d) LACUNA CONHECIDA (revisao M3, nao medida): rpc_hr_horas_extra_do_periodo
--     e uma chamada por pessoa (N chamadas no relatorio da organizacao), e
--     hr_horas_extra_assinaturas_periodo e SQL com SET search_path (nao e
--     inlined; plano generico com ANY(array)). A RPC _org (6) existe para o
--     cliente juntar as chamadas; medir na nike antes de a usar.
--
--
-- -- O QUE MUDA PARA AS OUTRAS ORGANIZACOES DA BASE RH --------------------------
--
-- Nada: a coluna nasce NULL em todas (incluindo a nike). Mudelar nao esta
-- nesta base.
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo, como nas outras RPCs de horas extra) ---
--
--   reutilizados: 42501 insufficient_privilege, HRA10 pedido_invalido, HRA31
--   nao_encontrado, HRA33 organizacao_nao_empregadora, HRA41 limite_excedido,
--   HRA78 data_invalida, HRA81 config_invalida, HRA84 intervalo_excedido.
--   novo:
--     HRA87 folha_fechada (a data nova cai em ou antes do fim de uma folha
--           fechada, ou a alteracao deixa de cobrir uma folha fechada; DETAIL
--           diz qual). 20270111410000 usa-o tambem no trigger de
--           pessoas_horas_extra.
--   horas_extra_contagem_fora_de_transaccao (25000)
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao, de proposito. A mao, por migration nova, e so
-- depois de reverter 20270111410000 (o fecho e o trigger usam isto): largar
-- as tres RPCs e as duas funcoes internas e, depois de exportar os valores,
-- a coluna aprovacao_conta_desde.
-- ==============================================================================

SET LOCAL lock_timeout = '5s';

-- ---- G00: dentro de uma transaccao -------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'horas_extra_contagem_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_lista text;
  v_n     integer;
  v_cod   text;
BEGIN
  -- G0. Quem aplica passa a RLS (tabelas de horas extra FORCE sem politicas;
  --     as RPCs definer correm com os direitos deste papel).
  IF NOT EXISTS (SELECT 1 FROM pg_roles r
                  WHERE r.rolname::text = current_user::text AND (r.rolsuper OR r.rolbypassrls)) THEN
    RAISE EXCEPTION 'G0: o papel que aplica (%) nao tem BYPASSRLS; com FORCE RLS as RPCs nao leriam as horas extra.', current_user::text;
  END IF;

  -- G1. hr_horas_extra_config existe, com UMA linha por organizacao (PK so
  --     organization_id), e a coluna nova ainda nao existe.
  IF to_regclass('public.hr_horas_extra_config') IS NULL THEN
    RAISE EXCEPTION 'G1: falta public.hr_horas_extra_config (20270104800000).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                  WHERE c.conrelid = to_regclass('public.hr_horas_extra_config')
                    AND c.contype::text = 'p'
                    AND array_length(c.conkey, 1) = 1
                    AND a.attname::text = 'organization_id') THEN
    RAISE EXCEPTION 'G1: hr_horas_extra_config deixou de ter a PK so em organization_id (uma linha por organizacao). Reler o desenho.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = to_regclass('public.hr_horas_extra_config')
                AND a.attname::text = 'aprovacao_conta_desde' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'G1: hr_horas_extra_config ja tem aprovacao_conta_desde. Ler o que la esta.';
  END IF;

  -- G2. Nomes novos livres.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('hr_horas_extra_assinaturas_periodo', 'hr_horas_extra_assinatura',
                             'rpc_hr_horas_extra_contagem_guardar', 'rpc_hr_horas_extra_do_periodo',
                             'rpc_hr_horas_extra_assinaturas', 'rpc_hr_horas_extra_do_periodo_org');
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G2: ja existem funcoes com nomes desta migration: %.', v_lista;
  END IF;

  -- G3. Suporte (as internas de 20270104800000 e as RPCs usadas na prova).
  SELECT string_agg(f, ', ') INTO v_lista
    FROM unnest(ARRAY['public.has_anew_permission_in_org(uuid, text, uuid)',
                      'public.hr_pessoa_do_utilizador(uuid, uuid)',
                      'public.hr_horas_extra_exigir_escrita(uuid, boolean)',
                      'public.hr_horas_extra_ambito_leitura(uuid, uuid)',
                      'public.hr_horas_extra_recusar(uuid, text, text)',
                      'public.hr_horas_extra_evento(uuid, uuid, uuid, text, uuid, jsonb)',
                      'public.hr_horas_extra_config_omissao()',
                      'public.hr_horas_extra_config_efetiva(uuid)',
                      'public.hr_horas_extra_hoje()',
                      'public.rpc_hr_hora_extra_registar(uuid, uuid, date, time without time zone, time without time zone, text)',
                      'public.rpc_hr_hora_extra_decidir(uuid, uuid, text, text)']) AS f
   WHERE to_regprocedure(f) IS NULL;
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G3: faltam funcoes: %.', v_lista;
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('pessoas_horas_extra', 'id'), ('pessoas_horas_extra', 'organization_id'),
                 ('pessoas_horas_extra', 'pessoa_id'), ('pessoas_horas_extra', 'data'),
                 ('pessoas_horas_extra', 'estado'), ('pessoas_horas_extra', 'minutos'),
                 ('pessoas_horas_extra', 'nocturno_min'), ('pessoas_horas_extra', 'origem'),
                 ('pessoas_horas_extra', 'tipo_registo'),
                 ('hr_horas_extra_config', 'dia_min'), ('hr_horas_extra_config', 'ano_min'),
                 ('hr_horas_extra_config', 'alerta_pct'), ('hr_horas_extra_config', 'minimo_min'),
                 ('hr_horas_extra_config', 'updated_by'),
                 ('hr_periodos_processamento', 'organization_id'), ('hr_periodos_processamento', 'estado'),
                 ('hr_periodos_processamento', 'data_inicio'), ('hr_periodos_processamento', 'data_fim'),
                 ('hr_periodos_processamento', 'transicao'),
                 ('pessoas', 'deleted_at'), ('pessoas', 'estado_registo'),
                 ('pessoas_contas', 'anew_user_id'))
         AS e(tabela, coluna)
   WHERE EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.' || e.tabela)
                    AND a.attname::text = e.coluna AND NOT a.attisdropped);
  IF v_n <> 22 THEN
    RAISE EXCEPTION 'G3: faltam colunas esperadas em pessoas_horas_extra, hr_horas_extra_config, hr_periodos_processamento, pessoas ou pessoas_contas (% de 22).', v_n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.pessoas_horas_extra_eventos')
                    AND c.conname::text = 'pessoas_horas_extra_eventos_acao_valida'
                    AND position('config_alterada' IN pg_get_constraintdef(c.oid)) > 0) THEN
    RAISE EXCEPTION 'G3: o CHECK de pessoas_horas_extra_eventos ja nao aceita config_alterada.';
  END IF;

  -- G4. Permissoes usadas (nenhuma e criada).
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.view', 'hr.assiduidade.view.own', 'hr.assiduidade.gerir',
                               'hr.processamento.periodo.gerir'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G4: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;

  -- G5. O codigo novo HRA87 nao esta em uso em nenhuma funcao do remoto.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_lista
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public' AND p.prosrc LIKE '%HRA87%';
  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION 'G5: o codigo HRA87 ja e usado por: %. Escolher outro.', v_lista;
  END IF;
END;
$guardas$;


-- ==============================================================================
-- 1. A coluna
-- ==============================================================================
ALTER TABLE public.hr_horas_extra_config
  ADD COLUMN aprovacao_conta_desde date,
  ADD CONSTRAINT hr_horas_extra_config_aprovacao_desde_intervalo
    CHECK (aprovacao_conta_desde IS NULL
           OR aprovacao_conta_desde BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');

COMMENT ON COLUMN public.hr_horas_extra_config.aprovacao_conta_desde IS
'Interruptor "so as horas extra aprovadas contam" (D1 do plano das horas extra aprovadas). NULL = como antes (modo bruto). Com uma data: os dias com data >= esta contam so as horas extra confirmadas (relatorio e pagamento), as pendentes de pessoas activas bloqueiam o fecho da folha e nada se cria nem decide numa folha fechada (20270111410000). Grava-se so por rpc_hr_horas_extra_contagem_guardar, nunca em ou antes do fim de uma folha fechada. Desde 20270111400000.';


-- ==============================================================================
-- 2. A assinatura das horas extra (internas)
-- ==============================================================================
-- Para CADA pessoa pedida: o que o fecho confere contra o que o cliente usou
-- no calculo. Inclui a data do interruptor (liga a assinatura ao modo usado):
-- desligado, NULL; ligado, nunca NULL (quem nao tem linhas tambem tem). A
-- data vai por to_char (nao depende do DateStyle da sessao).
CREATE FUNCTION public.hr_horas_extra_assinaturas_periodo(
  p_organization_id uuid,
  p_data_de         date,
  p_data_ate        date,
  p_pessoas         uuid[]
)
RETURNS TABLE (pessoa_id uuid, assinatura text)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH pedidas AS (
    SELECT DISTINCT u.pid FROM unnest(p_pessoas) AS u(pid) WHERE u.pid IS NOT NULL
  ),
  linhas AS (
    SELECT x.pessoa_id,
           string_agg(x.id::text || ':' || x.estado || ':' || x.minutos::text || ':' || x.origem,
                      ',' ORDER BY x.id) AS texto
      FROM public.pessoas_horas_extra x
     WHERE x.organization_id = p_organization_id
       AND x.data BETWEEN p_data_de AND p_data_ate
       AND x.pessoa_id = ANY (p_pessoas)
     GROUP BY x.pessoa_id
  ),
  interruptor AS (
    SELECT (SELECT c.aprovacao_conta_desde FROM public.hr_horas_extra_config c
             WHERE c.organization_id = p_organization_id) AS desde
  )
  SELECT pd.pid,
         md5(coalesce(l.texto, '') || '|' || to_char(i.desde, 'YYYY-MM-DD'))
    FROM pedidas pd
    CROSS JOIN interruptor i
    LEFT JOIN linhas l ON l.pessoa_id = pd.pid
$$;

COMMENT ON FUNCTION public.hr_horas_extra_assinaturas_periodo(uuid, date, date, uuid[]) IS
'INTERNA (sem EXECUTE para ninguem). Para cada pessoa de p_pessoas: md5(coalesce(string_agg(id:estado:minutos:origem por id, separado por virgulas), vazio) || barra vertical || aprovacao_conta_desde em YYYY-MM-DD) das horas extra (qualquer estado e tipo) com data no intervalo. Interruptor desligado: NULL para todas; ligado: nunca NULL, tambem para quem nao tem linhas. Usada por hr_horas_extra_assinatura, rpc_hr_horas_extra_assinaturas, rpc_hr_horas_extra_do_periodo_org e pelo fecho da folha. Desde 20270111400000.';

CREATE FUNCTION public.hr_horas_extra_assinatura(
  p_organization_id uuid,
  p_pessoa_id       uuid,
  p_data_de         date,
  p_data_ate        date
)
RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT s.assinatura
    FROM public.hr_horas_extra_assinaturas_periodo(p_organization_id, p_data_de, p_data_ate, ARRAY[p_pessoa_id]) AS s
   WHERE s.pessoa_id = p_pessoa_id
$$;

COMMENT ON FUNCTION public.hr_horas_extra_assinatura(uuid, uuid, date, date) IS
'INTERNA (sem EXECUTE para ninguem). A assinatura das horas extra de uma pessoa no intervalo (ver hr_horas_extra_assinaturas_periodo): NULL so com o interruptor desligado. Desde 20270111400000.';

-- ==============================================================================
-- 3. RPCs
-- ==============================================================================

-- 3.1 Ligar, mudar ou desligar o interruptor.
CREATE FUNCTION public.rpc_hr_horas_extra_contagem_guardar(p_organization_id uuid, p_desde date)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anew    uuid;
  v_limite  date;
  v_existe  boolean;
  v_antes   date;
  v_fechado date;
  v_descob  date;
  v_o       jsonb := public.hr_horas_extra_config_omissao();
BEGIN
  -- Sessao, hr.assiduidade.gerir, utilizador da aplicacao, organizacao
  -- empregadora e limite por actor, ANTES de ler qualquer dado.
  v_anew := public.hr_horas_extra_exigir_escrita(p_organization_id, false);

  v_limite := (public.hr_horas_extra_hoje() + interval '5 years')::date;
  IF p_desde IS NOT NULL
     AND (NOT isfinite(p_desde) OR p_desde < DATE '2000-01-01' OR p_desde > v_limite) THEN
    RAISE EXCEPTION 'config_invalida' USING ERRCODE = 'HRA81',
      DETAIL = 'aprovacao_conta_desde tem de estar entre 2000-01-01 e ' || to_char(v_limite, 'YYYY-MM-DD') || '.';
  END IF;

  -- Lock da organizacao (a mesma chave da margem dos desvios, das regras
  -- salariais e de abrir a folha), antes de ler a linha e as folhas.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr_periodos_processamento:' || p_organization_id::text, 0));

  SELECT true, c.aprovacao_conta_desde INTO v_existe, v_antes
    FROM public.hr_horas_extra_config c
   WHERE c.organization_id = p_organization_id
     FOR UPDATE;
  v_existe := coalesce(v_existe, false);

  -- Nada muda: idempotente, sem evento (desligar sem linha nao cria a linha).
  IF v_antes IS NOT DISTINCT FROM p_desde THEN
    RETURN jsonb_build_object('aprovacao_desde', p_desde, 'alterada', false);
  END IF;

  -- FOR SHARE das folhas que acabam a partir da mais antiga das duas datas
  -- (a antiga e a nova): um fecho em curso (FOR UPDATE da linha) termina
  -- antes, e as leituras seguintes ja o veem.
  PERFORM 1 FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.data_fim >= LEAST(p_desde, v_antes)
     FOR SHARE;
  SELECT max(pp.data_fim) INTO v_fechado
    FROM public.hr_periodos_processamento pp
   WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado';

  -- Ligar ou antecipar sobre uma folha fechada.
  IF p_desde IS NOT NULL AND v_fechado IS NOT NULL AND v_fechado >= p_desde THEN
    RAISE EXCEPTION 'folha_fechada' USING ERRCODE = 'HRA87',
      DETAIL = 'Ha uma folha fechada ate ' || to_char(v_fechado, 'YYYY-MM-DD')
               || '; a contagem das horas extra aprovadas so pode comecar a partir de '
               || to_char(v_fechado + 1, 'YYYY-MM-DD') || '.';
  END IF;

  -- Desligar ou adiar deixando de cobrir uma folha fechada que a data antiga
  -- cobria (revisao M1): os dias dessa folha voltariam a modo bruto.
  IF v_antes IS NOT NULL THEN
    SELECT max(pp.data_fim) INTO v_descob
      FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = p_organization_id AND pp.estado = 'fechado'
       AND pp.data_fim >= v_antes
       AND (p_desde IS NULL OR pp.data_fim < p_desde);
    IF v_descob IS NOT NULL THEN
      RAISE EXCEPTION 'folha_fechada' USING ERRCODE = 'HRA87',
        DETAIL = 'A contagem das horas extra aprovadas vale desde ' || to_char(v_antes, 'YYYY-MM-DD')
                 || ' e ja fechou uma folha ate ' || to_char(v_descob, 'YYYY-MM-DD')
                 || '; depois disso nao se desliga nem se adia.';
    END IF;
  END IF;

  -- Uma linha por organizacao: sem linha, nasce com as omissoes.
  INSERT INTO public.hr_horas_extra_config AS c
    (organization_id, dia_min, ano_min, alerta_pct, minimo_min, aprovacao_conta_desde, updated_by)
  VALUES
    (p_organization_id, (v_o ->> 'dia_min')::integer, (v_o ->> 'ano_min')::integer,
     (v_o ->> 'alerta_pct')::integer, (v_o ->> 'minimo_min')::integer, p_desde, v_anew)
  ON CONFLICT (organization_id) DO UPDATE
    SET aprovacao_conta_desde = EXCLUDED.aprovacao_conta_desde,
        updated_by            = EXCLUDED.updated_by;

  PERFORM public.hr_horas_extra_evento(p_organization_id, NULL, NULL, 'config_alterada', v_anew,
    jsonb_build_object('campo', 'aprovacao_conta_desde', 'antes', v_antes, 'depois', p_desde,
                       'linha_criada', NOT v_existe));

  RETURN jsonb_build_object('aprovacao_desde', p_desde, 'alterada', true);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_horas_extra_contagem_guardar(uuid, date) IS
'RH (authenticated). Liga (p_desde = primeiro dia em que so contam as horas extra confirmadas), muda ou desliga (p_desde NULL) a contagem das horas extra aprovadas da organizacao (hr_horas_extra_config.aprovacao_conta_desde). Data de 2000-01-01 ate hoje + 5 anos (config_invalida HRA81); nunca em ou antes do fim de uma folha fechada (folha_fechada HRA87, DETAIL com a primeira data aceite). Toma o lock da organizacao e FOR SHARE das folhas que acabam a partir da data. Sem linha, cria-a com as omissoes. A mesma data: alterada=false, sem evento. Evento config_alterada {campo, antes, depois, linha_criada}. Devolve {aprovacao_desde, alterada}. Exige hr.assiduidade.gerir (42501), organizacao empregadora (HRA33); limite_excedido HRA41. Tambem recusa (HRA87) desligar ou adiar quando isso deixa de cobrir uma folha fechada que a data antiga cobria. Desde 20270111400000.';

-- 3.2 As horas extra de uma pessoa num intervalo (o relatorio le isto).
CREATE FUNCTION public.rpc_hr_horas_extra_do_periodo(
  p_organization_id uuid,
  p_pessoa_id       uuid,
  p_de              date,
  p_ate             date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_dias constant integer := 62;
  v_pessoa   uuid;
  v_desde    date;
  v_linhas   jsonb;
BEGIN
  -- view: a pessoa pedida; view.own: a sua (outra = 42501); sem nada: 42501.
  v_pessoa := public.hr_horas_extra_ambito_leitura(p_organization_id, p_pessoa_id);
  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END IF;
  IF p_de IS NULL OR p_ate IS NULL OR NOT isfinite(p_de) OR NOT isfinite(p_ate)
     OR p_ate < p_de OR p_de < DATE '2000-01-01' OR p_ate > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA78';
  END IF;
  IF (p_ate - p_de) + 1 > c_max_dias THEN
    RAISE EXCEPTION 'intervalo_excedido' USING ERRCODE = 'HRA84';
  END IF;
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = v_pessoa AND p.organization_id = p_organization_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  SELECT c.aprovacao_conta_desde INTO v_desde
    FROM public.hr_horas_extra_config c
   WHERE c.organization_id = p_organization_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'data', x.data, 'origem', x.origem, 'estado', x.estado,
           'minutos', x.minutos, 'nocturno_min', x.nocturno_min, 'tipo_registo', x.tipo_registo)
         ORDER BY x.data, x.id), '[]'::jsonb)
    INTO v_linhas
    FROM public.pessoas_horas_extra x
   WHERE x.organization_id = p_organization_id
     AND x.pessoa_id = v_pessoa
     AND x.data BETWEEN p_de AND p_ate;

  RETURN jsonb_build_object(
    'pessoa_id', v_pessoa,
    'aprovacao_desde', v_desde,
    'linhas', v_linhas,
    'assinatura', public.hr_horas_extra_assinatura(p_organization_id, v_pessoa, p_de, p_ate));
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_horas_extra_do_periodo(uuid, uuid, date, date) IS
'RH ou a propria pessoa (authenticated). As horas extra de UMA pessoa entre p_de e p_ate (ate 62 dias), todos os estados: {pessoa_id, aprovacao_desde (o interruptor da organizacao, ou null), linhas: [{id, data, origem, estado, minutos, nocturno_min, tipo_registo}] por data e id, assinatura (md5 de hr_horas_extra_assinatura no intervalo, com a data do interruptor; null so com o interruptor desligado)}. Com p_de/p_ate = data_inicio/data_fim da folha, a assinatura e a que rpc_hr_horas_extra_assinaturas devolve e o fecho confere. hr.assiduidade.view: qualquer pessoa (p_pessoa_id obrigatorio, senao pedido_invalido HRA10); hr.assiduidade.view.own: so a sua (NULL = a sua; outra = 42501). Recusas: 42501, pedido_invalido HRA10, data_invalida HRA78, intervalo_excedido HRA84, nao_encontrado HRA31. Desde 20270111400000.';

-- 3.3 As assinaturas de um periodo da folha (o processamento le isto antes de fechar).
CREATE FUNCTION public.rpc_hr_horas_extra_assinaturas(p_periodo_id uuid)
RETURNS TABLE (pessoa_id uuid, assinatura text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_auth    uuid := auth.uid();
  v_periodo public.hr_periodos_processamento%ROWTYPE;
BEGIN
  IF v_auth IS NULL THEN
    PERFORM public.hr_horas_extra_recusar(NULL, 'insufficient_privilege', '42501');
  END IF;

  SELECT * INTO v_periodo FROM public.hr_periodos_processamento pp WHERE pp.id = p_periodo_id;

  -- Inexistente e sem permissao dao a mesma recusa (organizacao NULL).
  IF NOT (coalesce(public.has_anew_permission_in_org(v_auth, 'hr.processamento.periodo.gerir', v_periodo.organization_id), false)
          OR coalesce(public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.gerir', v_periodo.organization_id), false)) THEN
    PERFORM public.hr_horas_extra_recusar(v_periodo.organization_id, 'insufficient_privilege', '42501');
  END IF;

  -- As pessoas: nao apagadas, com vinculo sobreposto ao periodo (o que o
  -- fecho exige ou permite) ou com horas extra nele.
  RETURN QUERY
  SELECT s.pessoa_id, s.assinatura
    FROM public.hr_horas_extra_assinaturas_periodo(
           v_periodo.organization_id, v_periodo.data_inicio, v_periodo.data_fim,
           ARRAY(SELECT p.id
                   FROM public.pessoas p
                  WHERE p.organization_id = v_periodo.organization_id
                    AND p.deleted_at IS NULL
                    AND (EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                                  WHERE v.pessoa_id = p.id AND v.organization_id = p.organization_id
                                    AND v.deleted_at IS NULL
                                    AND v.data_inicio <= v_periodo.data_fim
                                    AND (v.data_fim IS NULL OR v.data_fim >= v_periodo.data_inicio))
                         OR EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                                     WHERE x.pessoa_id = p.id AND x.organization_id = p.organization_id
                                       AND x.data BETWEEN v_periodo.data_inicio AND v_periodo.data_fim)))) AS s
   ORDER BY s.pessoa_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_horas_extra_assinaturas(uuid) IS
'Por pessoa nao apagada com vinculo sobreposto ao periodo da folha ou com horas extra nele, a assinatura das horas extra de data_inicio a data_fim (md5 com a data do interruptor; ver hr_horas_extra_assinaturas_periodo; NULL so com o interruptor desligado). O cliente envia-a em horas_extra_assinatura de CADA resultado ao fechar (com o interruptor ligado a chave e obrigatoria); com a contagem das aprovadas ligada, o fecho recusa com processamento_fechar_horas_extra_desactualizadas se ja nao for a mesma (20270111410000). Ler DEPOIS de decidir as pendentes. Exige hr.processamento.periodo.gerir ou hr.assiduidade.gerir na organizacao do periodo (inexistente e sem permissao: a mesma recusa, 42501). Desde 20270111400000.';


-- 3.4 As horas extra de varias pessoas num intervalo, numa so chamada (M3).
CREATE FUNCTION public.rpc_hr_horas_extra_do_periodo_org(
  p_organization_id uuid,
  p_de              date,
  p_ate             date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max_dias constant integer := 62;
  v_pessoa   uuid;
  v_ids      uuid[];
  v_desde    date;
  v_pessoas  jsonb;
BEGIN
  -- view: NULL (todas); view.own: a propria; sem nada: 42501.
  v_pessoa := public.hr_horas_extra_ambito_leitura(p_organization_id, NULL);
  IF p_de IS NULL OR p_ate IS NULL OR NOT isfinite(p_de) OR NOT isfinite(p_ate)
     OR p_ate < p_de OR p_de < DATE '2000-01-01' OR p_ate > DATE '2100-12-31' THEN
    RAISE EXCEPTION 'data_invalida' USING ERRCODE = 'HRA78';
  END IF;
  IF (p_ate - p_de) + 1 > c_max_dias THEN
    RAISE EXCEPTION 'intervalo_excedido' USING ERRCODE = 'HRA84';
  END IF;

  IF v_pessoa IS NOT NULL THEN
    v_ids := ARRAY(SELECT p.id FROM public.pessoas p
                    WHERE p.id = v_pessoa AND p.organization_id = p_organization_id AND p.deleted_at IS NULL);
  ELSE
    v_ids := ARRAY(SELECT p.id
                     FROM public.pessoas p
                    WHERE p.organization_id = p_organization_id
                      AND p.deleted_at IS NULL
                      AND (EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                                    WHERE v.pessoa_id = p.id AND v.organization_id = p.organization_id
                                      AND v.deleted_at IS NULL
                                      AND v.data_inicio <= p_ate
                                      AND (v.data_fim IS NULL OR v.data_fim >= p_de))
                           OR EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                                       WHERE x.pessoa_id = p.id AND x.organization_id = p.organization_id
                                         AND x.data BETWEEN p_de AND p_ate)));
  END IF;

  SELECT c.aprovacao_conta_desde INTO v_desde
    FROM public.hr_horas_extra_config c
   WHERE c.organization_id = p_organization_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'pessoa_id', s.pessoa_id,
           'linhas', coalesce(l.linhas, '[]'::jsonb),
           'assinatura', s.assinatura) ORDER BY s.pessoa_id), '[]'::jsonb)
    INTO v_pessoas
    FROM public.hr_horas_extra_assinaturas_periodo(p_organization_id, p_de, p_ate, v_ids) AS s
    LEFT JOIN (SELECT x.pessoa_id,
                      jsonb_agg(jsonb_build_object(
                        'id', x.id, 'data', x.data, 'origem', x.origem, 'estado', x.estado,
                        'minutos', x.minutos, 'nocturno_min', x.nocturno_min, 'tipo_registo', x.tipo_registo)
                      ORDER BY x.data, x.id) AS linhas
                 FROM public.pessoas_horas_extra x
                WHERE x.organization_id = p_organization_id
                  AND x.data BETWEEN p_de AND p_ate
                  AND x.pessoa_id = ANY (v_ids)
                GROUP BY x.pessoa_id) AS l
      ON l.pessoa_id = s.pessoa_id;

  RETURN jsonb_build_object('aprovacao_desde', v_desde, 'pessoas', v_pessoas);
END;
$$;

COMMENT ON FUNCTION public.rpc_hr_horas_extra_do_periodo_org(uuid, date, date) IS
'RH ou a propria pessoa (authenticated). O mesmo que rpc_hr_horas_extra_do_periodo para varias pessoas numa so chamada: {aprovacao_desde, pessoas: [{pessoa_id, linhas: [{id, data, origem, estado, minutos, nocturno_min, tipo_registo}], assinatura}]} por pessoa_id. hr.assiduidade.view: as pessoas nao apagadas com vinculo sobreposto ao intervalo ou com horas extra nele; hr.assiduidade.view.own: so a propria. Ate 62 dias. Recusas: 42501, data_invalida HRA78, intervalo_excedido HRA84. Desde 20270111400000.';


-- ==============================================================================
-- 4. EXECUTE explicito (o Supabase da EXECUTE por omissao a anon e authenticated)
-- ==============================================================================
REVOKE ALL ON FUNCTION public.hr_horas_extra_assinaturas_periodo(uuid, date, date, uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_horas_extra_assinatura(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_contagem_guardar(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_do_periodo(uuid, uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_assinaturas(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_hr_horas_extra_do_periodo_org(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_contagem_guardar(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_do_periodo(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_assinaturas(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_horas_extra_do_periodo_org(uuid, date, date) TO authenticated;


-- ==============================================================================
-- 5. Conferir: falha a migration inteira se algo nao bater
-- ==============================================================================
DO $conferir$
DECLARE
  k_nike     constant uuid := 'b6ffce4f-f630-4933-833a-008649757a33'::uuid;
  k_motivo   constant text := 'prova da migracao 20270111400000';
  k_estado   constant text[] := ARRAY['sem sessao', 'sem permissao'];
  k_limites  constant text[] := ARRAY['HRA84', 'HRA78', 'HRA10', 'HRA84'];
  k_mudancas constant text[] := ARRAY['desligar', 'adiar', 'antecipar'];
  v_rpcs     text[] := ARRAY[
    'public.rpc_hr_horas_extra_contagem_guardar(uuid, date)',
    'public.rpc_hr_horas_extra_do_periodo(uuid, uuid, date, date)',
    'public.rpc_hr_horas_extra_assinaturas(uuid)',
    'public.rpc_hr_horas_extra_do_periodo_org(uuid, date, date)'];
  v_internas text[] := ARRAY[
    'public.hr_horas_extra_assinaturas_periodo(uuid, date, date, uuid[])',
    'public.hr_horas_extra_assinatura(uuid, uuid, date, date)'];
  v_fn       text;
  v_grant    text;
  v_papel    text;
  v_priv     text;
  v_n        integer;
  v_msg      text;
  v_st       text;
  v_j        jsonb;
  v_cfg_ant  jsonb;
  v_hoje     date;
  v_ult      date;
  v_ini      date;
  v_fim      date;
  v_d        date;
  v_uid      uuid;
  v_autor    uuid;
  v_uid2     uuid;
  v_autor2   uuid;
  v_falso    uuid;
  v_own      uuid;
  v_w        uuid;
  v_p        uuid;
  v_per      uuid;
  v_he       uuid;
  v_origem   text;
  v_s1       text;
  v_s2       text;
  v_prova_decisor text;
  v_prova_own     text;
BEGIN
  -- 5.1 EXECUTE por aclexplode (sem o dono); SECURITY DEFINER so nas RPCs;
  --     search_path vazio em todas.
  FOREACH v_fn IN ARRAY v_rpcs || v_internas LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Conferir: a funcao % nao existe.', v_fn;
    END IF;
    SELECT coalesce(string_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END, ','
                               ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END), '')
      INTO v_grant
      FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = to_regprocedure(v_fn)::oid AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner;
    IF v_fn = ANY (v_rpcs) AND v_grant <> 'authenticated' THEN
      RAISE EXCEPTION 'Conferir: % devia ter EXECUTE so para authenticated; tem "%".', v_fn, v_grant;
    ELSIF v_fn <> ALL (v_rpcs) AND v_grant <> '' THEN
      RAISE EXCEPTION 'Conferir: a interna % tem EXECUTE para "%".', v_fn, v_grant;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)::oid
                      AND coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Conferir: % nao tem search_path vazio.', v_fn;
    END IF;
    IF (v_fn = ANY (v_rpcs)) IS DISTINCT FROM
       (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(v_fn)::oid) THEN
      RAISE EXCEPTION 'Conferir: % devia ser SECURITY DEFINER so se for RPC.', v_fn;
    END IF;
  END LOOP;

  -- 5.2 A coluna (date, NULL), o CHECK, as tabelas continuam sem privilegios,
  --     e nenhuma organizacao fica com o interruptor ligado.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = to_regclass('public.hr_horas_extra_config')
                    AND a.attname::text = 'aprovacao_conta_desde' AND NOT a.attisdropped
                    AND a.atttypid = 'pg_catalog.date'::regtype::oid AND NOT a.attnotnull) THEN
    RAISE EXCEPTION 'Conferir: hr_horas_extra_config.aprovacao_conta_desde devia existir, date, aceitando NULL.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                  WHERE c.conrelid = to_regclass('public.hr_horas_extra_config')
                    AND c.conname::text = 'hr_horas_extra_config_aprovacao_desde_intervalo'
                    AND c.contype::text = 'c') THEN
    RAISE EXCEPTION 'Conferir: falta o CHECK hr_horas_extra_config_aprovacao_desde_intervalo.';
  END IF;
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_papel, 'public.hr_horas_extra_config', v_priv)
         OR has_table_privilege(v_papel, 'public.pessoas_horas_extra', v_priv) THEN
        RAISE EXCEPTION 'Conferir: % tem % em hr_horas_extra_config ou pessoas_horas_extra.', v_papel, v_priv;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.hr_horas_extra_config c WHERE c.aprovacao_conta_desde IS NOT NULL) THEN
    RAISE EXCEPTION 'Conferir: a migration nao devia ligar o interruptor em nenhuma organizacao.';
  END IF;

  -- 5.3 Comportamento na nike, com datas reais (o registo a mao so aceita os
  --     ultimos 12 meses), DESFEITO no fim (sentinela HHC00).
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.id = k_nike) THEN
      RAISE EXCEPTION 'Conferir: a nike nao existe.';
    END IF;
    v_hoje := public.hr_horas_extra_hoje();

    -- Quem regista (gerir, view, gerir a folha) e quem decide (gerir, outro
    -- utilizador se houver). Toda a consulta leva a organizacao da nike.
    SELECT au.auth_user_id, au.id INTO v_uid, v_autor
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike), false)
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.processamento.periodo.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike falta um utilizador activo com hr.assiduidade.gerir, hr.assiduidade.view e hr.processamento.periodo.gerir.';
    END IF;
    SELECT au.auth_user_id, au.id INTO v_uid2, v_autor2
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND au.id <> v_autor
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.gerir', k_nike), false)
     ORDER BY au.id
     LIMIT 1;
    IF v_uid2 IS NULL THEN
      v_uid2 := v_uid;
      v_autor2 := v_autor;
      v_prova_decisor := 'o mesmo que registou (a nike so tem um utilizador activo com gerir)';
    ELSE
      v_prova_decisor := 'outro utilizador';
    END IF;

    -- Um intervalo fora de qualquer folha da nike, que inclua um dia ate hoje.
    SELECT max(pp.data_fim) INTO v_ult FROM public.hr_periodos_processamento pp WHERE pp.organization_id = k_nike;
    v_ini := greatest(coalesce(v_ult + 1, make_date(extract(year FROM v_hoje)::integer, extract(month FROM v_hoje)::integer, 1)),
                      v_hoje - 300);
    IF v_ini > v_hoje THEN
      RAISE EXCEPTION 'Conferir: a nike ja tem folhas ate %; a prova precisa de um dia ate hoje fora de qualquer folha.', v_ult;
    END IF;
    v_fim := (make_date(extract(year FROM v_ini)::integer, extract(month FROM v_ini)::integer, 1)
              + interval '1 month' - interval '1 day')::date;
    IF EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp
                WHERE pp.organization_id = k_nike
                  AND pp.ano = extract(year FROM v_fim)::integer AND pp.mes = extract(month FROM v_fim)::integer) THEN
      v_fim := (make_date(extract(year FROM v_ini)::integer, extract(month FROM v_ini)::integer, 1)
                + interval '2 months' - interval '1 day')::date;
    END IF;
    v_d := least(v_fim, v_hoje);

    -- A pessoa de teste: activa com vinculo no intervalo, sem ligacao a quem
    -- regista ou decide, sem horas extra no dia.
    SELECT p.id INTO v_p
      FROM public.pessoas p
     WHERE p.organization_id = k_nike AND p.deleted_at IS NULL AND p.estado_registo = 'activo'
       AND EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                    WHERE v.pessoa_id = p.id AND v.organization_id = k_nike AND v.deleted_at IS NULL
                      AND v.data_inicio <= v_fim AND (v.data_fim IS NULL OR v.data_fim >= v_ini))
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_contas pc
                        WHERE pc.pessoa_id = p.id AND pc.organization_id = k_nike
                          AND pc.anew_user_id IN (v_autor, v_autor2))
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                        WHERE x.pessoa_id = p.id AND x.organization_id = k_nike AND x.data = v_d)
     ORDER BY p.id
     LIMIT 1;
    IF v_p IS NULL THEN
      RAISE EXCEPTION 'Conferir: na nike nao ha pessoa activa com vinculo entre % e %, sem ligacao aos utilizadores de teste e sem horas extra a %.', v_ini, v_fim, v_d;
    END IF;

    -- a) Sem sessao e sem permissao: as quatro RPCs recusam com 42501.
    FOR v_n IN 1..2 LOOP
      IF v_n = 1 THEN
        PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
      ELSE
        v_falso := gen_random_uuid();
        PERFORM set_config('request.jwt.claim.sub', v_falso::text, true),
                set_config('request.jwt.claims', json_build_object('sub', v_falso, 'role', 'authenticated')::text, true);
      END IF;
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: guardar o interruptor % devia dar 42501 (deu %).', k_estado[v_n], coalesce(v_st, 'aceite');
      END IF;
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_do_periodo(k_nike, v_p, v_d, v_d);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: ler as horas extra do periodo % devia dar 42501 (deu %).', k_estado[v_n], coalesce(v_st, 'aceite');
      END IF;
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_do_periodo_org(k_nike, v_d, v_d);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: ler as horas extra da organizacao % devia dar 42501 (deu %).', k_estado[v_n], coalesce(v_st, 'aceite');
      END IF;
      v_st := NULL;
      BEGIN
        PERFORM 1 FROM public.rpc_hr_horas_extra_assinaturas(gen_random_uuid());
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: ler as assinaturas % devia dar 42501 (deu %).', k_estado[v_n], coalesce(v_st, 'aceite');
      END IF;
    END LOOP;

    -- b) Interruptor desligado: a assinatura e NULL. Ligar sobre uma folha
    --    fechada e recusado (subtransaccao desfeita, HHC01).
    IF public.hr_horas_extra_assinatura(k_nike, v_p, v_d, v_d) IS NOT NULL THEN
      RAISE EXCEPTION 'Conferir: com o interruptor desligado a assinatura devia ser NULL.';
    END IF;
    BEGIN
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
      INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim, transicao)
      VALUES (k_nike, extract(year FROM v_fim)::integer, extract(month FROM v_fim)::integer, 'aberto', v_ini, v_fim, true)
      RETURNING id INTO v_per;
      UPDATE public.hr_periodos_processamento SET estado = 'fechado', fechado_em = now() WHERE id = v_per;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      v_st := NULL;
      v_msg := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE; v_msg := SQLERRM;
      END;
      IF v_st IS DISTINCT FROM 'HRA87' OR v_msg IS DISTINCT FROM 'folha_fechada' THEN
        RAISE EXCEPTION 'Conferir: ligar o interruptor sobre a folha fechada de % a % devia dar folha_fechada HRA87 (deu % %).', v_ini, v_fim, coalesce(v_st, 'aceite'), coalesce(v_msg, '');
      END IF;
      RAISE EXCEPTION 'ligar_sobre_fechada_ok' USING ERRCODE = 'HHC01';
    EXCEPTION
      WHEN SQLSTATE 'HHC01' THEN NULL;
    END;

    -- c) Ligar o interruptor: fora do intervalo recusado; grava, regista o
    --    evento e nao mexe nos limites; a mesma data e inerte.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    SELECT to_jsonb(e) INTO v_cfg_ant FROM public.hr_horas_extra_config_efetiva(k_nike) AS e;
    v_st := NULL;
    BEGIN
      PERFORM public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_hoje + 2000);
    EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
    END;
    IF v_st IS DISTINCT FROM 'HRA81' THEN
      RAISE EXCEPTION 'Conferir: o interruptor a mais de 5 anos devia dar HRA81 (deu %).', coalesce(v_st, 'aceite');
    END IF;
    v_j := public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
    IF (v_j ->> 'alterada')::boolean IS NOT TRUE OR (v_j ->> 'aprovacao_desde')::date IS DISTINCT FROM v_d THEN
      RAISE EXCEPTION 'Conferir: ligar o interruptor a % devia gravar; deu %.', v_d, v_j::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.hr_horas_extra_config c
                    WHERE c.organization_id = k_nike AND c.aprovacao_conta_desde = v_d AND c.updated_by = v_autor) THEN
      RAISE EXCEPTION 'Conferir: a linha da nike devia ficar com aprovacao_conta_desde = % e o autor.', v_d;
    END IF;
    SELECT to_jsonb(e) INTO v_j FROM public.hr_horas_extra_config_efetiva(k_nike) AS e;
    IF (v_j - 'omissao') IS DISTINCT FROM (v_cfg_ant - 'omissao') THEN
      RAISE EXCEPTION 'Conferir: ligar o interruptor nao devia mudar os limites (antes %, depois %).', v_cfg_ant::text, v_j::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pessoas_horas_extra_eventos e
                    WHERE e.organization_id = k_nike AND e.acao = 'config_alterada' AND e.ator_id = v_autor
                      AND e.dados ->> 'campo' = 'aprovacao_conta_desde'
                      AND (e.dados ->> 'depois')::date = v_d) THEN
      RAISE EXCEPTION 'Conferir: ligar o interruptor devia registar o evento config_alterada.';
    END IF;
    v_j := public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
    IF (v_j ->> 'alterada')::boolean IS NOT FALSE THEN
      RAISE EXCEPTION 'Conferir: gravar a mesma data devia ser inerte (alterada=false); deu %.', v_j::text;
    END IF;

    -- d) Ligado, quem nao tem linhas tambem tem assinatura (nunca NULL).
    IF public.hr_horas_extra_assinatura(k_nike, v_p, v_hoje + 1, v_hoje + 1)
       IS DISTINCT FROM md5('|' || to_char(v_d, 'YYYY-MM-DD')) THEN
      RAISE EXCEPTION 'Conferir: com o interruptor ligado a assinatura de quem nao tem linhas devia ser md5(''|'' || data do interruptor).';
    END IF;

    -- e) Registar uma hora extra (pendente) com quem regista.
    v_j := public.rpc_hr_hora_extra_registar(k_nike, v_p, v_d, TIME '21:00', TIME '22:00', k_motivo);
    v_he := (v_j ->> 'id')::uuid;
    v_origem := v_j ->> 'origem';
    IF v_he IS NULL OR (v_j ->> 'minutos')::integer IS DISTINCT FROM 60 OR v_origem IS NULL THEN
      RAISE EXCEPTION 'Conferir: registar 21:00-22:00 devia criar uma hora extra de 60 minutos; deu %.', v_j::text;
    END IF;

    -- f) A leitura devolve a linha, o interruptor e a assinatura do estado
    --    pendente com a data do interruptor.
    v_j := public.rpc_hr_horas_extra_do_periodo(k_nike, v_p, v_d, v_d);
    v_s1 := v_j ->> 'assinatura';
    IF (v_j ->> 'pessoa_id')::uuid IS DISTINCT FROM v_p
       OR jsonb_array_length(v_j -> 'linhas') <> 1
       OR (v_j -> 'linhas' -> 0 ->> 'id')::uuid IS DISTINCT FROM v_he
       OR (v_j -> 'linhas' -> 0 ->> 'data')::date IS DISTINCT FROM v_d
       OR (v_j -> 'linhas' -> 0 ->> 'estado') IS DISTINCT FROM 'pendente'
       OR (v_j -> 'linhas' -> 0 ->> 'origem') IS DISTINCT FROM v_origem
       OR (v_j -> 'linhas' -> 0 ->> 'minutos')::integer IS DISTINCT FROM 60
       OR (v_j -> 'linhas' -> 0 ->> 'nocturno_min')::integer IS DISTINCT FROM 0
       OR (v_j -> 'linhas' -> 0 ->> 'tipo_registo') IS DISTINCT FROM 'registada'
       OR (v_j ->> 'aprovacao_desde')::date IS DISTINCT FROM v_d
       OR v_s1 IS DISTINCT FROM md5(v_he::text || ':pendente:60:' || v_origem || '|' || to_char(v_d, 'YYYY-MM-DD')) THEN
      RAISE EXCEPTION 'Conferir: a leitura do periodo devia devolver a hora extra pendente registada; deu %.', v_j::text;
    END IF;

    -- g) Decidir (confirmar) com o decisor, que nao esta ligado a pessoa
    --    (HRA75 recusa quem decide as suas proprias horas).
    PERFORM set_config('request.jwt.claim.sub', v_uid2::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid2, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_hora_extra_decidir(v_he, k_nike, 'confirmar', k_motivo);
    IF (v_j ->> 'estado') IS DISTINCT FROM 'confirmada' THEN
      RAISE EXCEPTION 'Conferir: confirmar a hora extra devia dar confirmada; deu %.', v_j::text;
    END IF;

    -- h) A assinatura muda ao decidir.
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    v_j := public.rpc_hr_horas_extra_do_periodo(k_nike, v_p, v_d, v_d);
    v_s2 := v_j ->> 'assinatura';
    IF v_s2 IS NOT DISTINCT FROM v_s1
       OR v_s2 IS DISTINCT FROM md5(v_he::text || ':confirmada:60:' || v_origem || '|' || to_char(v_d, 'YYYY-MM-DD'))
       OR (v_j -> 'linhas' -> 0 ->> 'estado') IS DISTINCT FROM 'confirmada'
       OR public.hr_horas_extra_assinatura(k_nike, v_p, v_d, v_d) IS DISTINCT FROM v_s2 THEN
      RAISE EXCEPTION 'Conferir: depois de confirmar a assinatura devia mudar para a do estado confirmada; deu %.', v_j::text;
    END IF;

    -- i) A leitura por organizacao: v_p com a linha e a mesma assinatura;
    --    nenhuma assinatura NULL com o interruptor ligado.
    v_j := public.rpc_hr_horas_extra_do_periodo_org(k_nike, v_d, v_d);
    IF (v_j ->> 'aprovacao_desde')::date IS DISTINCT FROM v_d
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'pessoas') AS e(value)
                       WHERE (e.value ->> 'pessoa_id')::uuid = v_p
                         AND (e.value ->> 'assinatura') = v_s2
                         AND (e.value -> 'linhas' -> 0 ->> 'id')::uuid = v_he)
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'pessoas') AS e(value)
                   WHERE (e.value ->> 'assinatura') IS NULL) THEN
      RAISE EXCEPTION 'Conferir: a leitura por organizacao devia trazer v_p com a linha e a assinatura da leitura por pessoa, e nenhuma assinatura NULL.';
    END IF;

    -- j) As assinaturas de uma folha aberta do intervalo: a de v_p e a da
    --    leitura; nenhuma NULL; vem toda a pessoa com vinculo no periodo.
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    INSERT INTO public.hr_periodos_processamento (organization_id, ano, mes, estado, data_inicio, data_fim, transicao)
    VALUES (k_nike, extract(year FROM v_fim)::integer, extract(month FROM v_fim)::integer, 'aberto', v_ini, v_fim, true)
    RETURNING id INTO v_per;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    IF (SELECT s.assinatura FROM public.rpc_hr_horas_extra_assinaturas(v_per) AS s WHERE s.pessoa_id = v_p)
       IS DISTINCT FROM public.hr_horas_extra_assinatura(k_nike, v_p, v_ini, v_fim)
       OR EXISTS (SELECT 1 FROM public.rpc_hr_horas_extra_assinaturas(v_per) AS s WHERE s.assinatura IS NULL)
       OR EXISTS (SELECT 1 FROM public.pessoas p
                   WHERE p.organization_id = k_nike AND p.deleted_at IS NULL
                     AND EXISTS (SELECT 1 FROM public.pessoas_vinculos v
                                  WHERE v.pessoa_id = p.id AND v.organization_id = k_nike AND v.deleted_at IS NULL
                                    AND v.data_inicio <= v_fim AND (v.data_fim IS NULL OR v.data_fim >= v_ini))
                     AND NOT EXISTS (SELECT 1 FROM public.rpc_hr_horas_extra_assinaturas(v_per) AS s
                                      WHERE s.pessoa_id = p.id)) THEN
      RAISE EXCEPTION 'Conferir: rpc_hr_horas_extra_assinaturas devia trazer v_p com a assinatura certa, todas as pessoas com vinculo no periodo e nenhuma assinatura NULL.';
    END IF;

    -- k) Fechada a folha com a contagem ligada: desligar, adiar e antecipar
    --    recusados (HRA87); a mesma data continua inerte.
    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    UPDATE public.hr_periodos_processamento SET estado = 'fechado', fechado_em = now() WHERE id = v_per;
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true),
            set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    FOR v_n IN 1..3 LOOP
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_contagem_guardar(k_nike, (ARRAY[NULL, v_fim + 1, v_d - 1]::date[])[v_n]);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM 'HRA87' THEN
        RAISE EXCEPTION 'Conferir: % o interruptor depois de uma folha fechada coberta devia dar HRA87 (deu %).', k_mudancas[v_n], coalesce(v_st, 'aceite');
      END IF;
    END LOOP;
    v_j := public.rpc_hr_horas_extra_contagem_guardar(k_nike, v_d);
    IF (v_j ->> 'alterada')::boolean IS NOT FALSE
       OR NOT EXISTS (SELECT 1 FROM public.hr_horas_extra_config c
                       WHERE c.organization_id = k_nike AND c.aprovacao_conta_desde = v_d) THEN
      RAISE EXCEPTION 'Conferir: depois das recusas o interruptor devia continuar em % (e a mesma data inerte); deu %.', v_d, v_j::text;
    END IF;

    -- l) Limites da leitura: 63 dias (HRA84), datas invertidas (HRA78), view
    --    sem pessoa (HRA10), 63 dias por organizacao (HRA84).
    FOR v_n IN 1..4 LOOP
      v_st := NULL;
      BEGIN
        IF v_n = 1 THEN
          PERFORM public.rpc_hr_horas_extra_do_periodo(k_nike, v_p, v_d - 62, v_d);
        ELSIF v_n = 2 THEN
          PERFORM public.rpc_hr_horas_extra_do_periodo(k_nike, v_p, v_d, v_d - 1);
        ELSIF v_n = 3 THEN
          PERFORM public.rpc_hr_horas_extra_do_periodo(k_nike, NULL, v_d, v_d);
        ELSE
          PERFORM public.rpc_hr_horas_extra_do_periodo_org(k_nike, v_d - 62, v_d);
        END IF;
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM k_limites[v_n] THEN
        RAISE EXCEPTION 'Conferir: o caso % da leitura devia dar % (deu %).', v_n, k_limites[v_n], coalesce(v_st, 'aceite');
      END IF;
    END LOOP;

    -- m) view.own so ve a sua: com NULL resolve a propria pessoa; pedir v_p e
    --    42501; a leitura por organizacao so traz a propria.
    SELECT au.auth_user_id, public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) INTO v_own, v_w
      FROM public.anew_memberships am
      JOIN public.anew_users au ON au.id = am.user_id
     WHERE am.organization_id = k_nike AND am.status = 'active' AND au.auth_user_id IS NOT NULL
       AND coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view.own', k_nike), false)
       AND NOT coalesce(public.has_anew_permission_in_org(au.auth_user_id, 'hr.assiduidade.view', k_nike), false)
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS NOT NULL
       AND public.hr_pessoa_do_utilizador(au.auth_user_id, k_nike) IS DISTINCT FROM v_p
     ORDER BY au.id
     LIMIT 1;
    IF v_own IS NULL THEN
      v_prova_own := 'nao provado: na nike nao ha utilizador activo com hr.assiduidade.view.own, sem view, ligado a uma ficha';
    ELSE
      PERFORM set_config('request.jwt.claim.sub', v_own::text, true),
              set_config('request.jwt.claims', json_build_object('sub', v_own, 'role', 'authenticated')::text, true);
      v_j := public.rpc_hr_horas_extra_do_periodo(k_nike, NULL, v_d, v_d);
      IF (v_j ->> 'pessoa_id')::uuid IS DISTINCT FROM v_w
         OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_j -> 'linhas') AS l(value)
                     WHERE NOT EXISTS (SELECT 1 FROM public.pessoas_horas_extra x
                                        WHERE x.id = (l.value ->> 'id')::uuid AND x.pessoa_id = v_w)) THEN
        RAISE EXCEPTION 'Conferir: com view.own a leitura devia resolver a propria pessoa e so as suas linhas; deu %.', v_j::text;
      END IF;
      v_st := NULL;
      BEGIN
        PERFORM public.rpc_hr_horas_extra_do_periodo(k_nike, v_p, v_d, v_d);
      EXCEPTION WHEN OTHERS THEN v_st := SQLSTATE;
      END;
      IF v_st IS DISTINCT FROM '42501' THEN
        RAISE EXCEPTION 'Conferir: com view.own ler outra pessoa devia dar 42501 (deu %).', coalesce(v_st, 'aceite');
      END IF;
      v_j := public.rpc_hr_horas_extra_do_periodo_org(k_nike, v_d, v_d);
      IF jsonb_array_length(v_j -> 'pessoas') <> 1
         OR (v_j -> 'pessoas' -> 0 ->> 'pessoa_id')::uuid IS DISTINCT FROM v_w THEN
        RAISE EXCEPTION 'Conferir: com view.own a leitura por organizacao devia trazer so a propria pessoa; deu %.', v_j::text;
      END IF;
      v_prova_own := 'provado';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);
    RAISE NOTICE 'Conferir: prova na nike entre % e % (dia %); decisor: %; view.own: %.',
      v_ini, v_fim, v_d, v_prova_decisor, coalesce(v_prova_own, '?');
    RAISE EXCEPTION 'teste_horas_extra_contagem_ok' USING ERRCODE = 'HHC00';
  EXCEPTION
    WHEN SQLSTATE 'HHC00' THEN
      NULL; -- sucesso: tudo o que o bloco escreveu na nike foi desfeito.
  END;

  PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

  IF EXISTS (SELECT 1 FROM public.hr_horas_extra_config c WHERE c.aprovacao_conta_desde IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.pessoas_horas_extra x WHERE x.motivo_origem = k_motivo)
     OR EXISTS (SELECT 1 FROM public.hr_periodos_processamento pp WHERE pp.id = v_per) THEN
    RAISE EXCEPTION 'Conferir: o teste deixou linhas na nike.';
  END IF;

  RAISE NOTICE 'Conferido: interruptor aprovacao_conta_desde (nasce NULL; ligar, inerte na mesma data, recusado sobre folha fechada, e depois de uma folha fechada coberta desligar, adiar e antecipar recusados; intervalo de datas); assinatura NULL desligado e nunca NULL ligado (tambem sem linhas), muda ao decidir; leitura por pessoa e por organizacao; assinaturas da folha com todas as pessoas com vinculo; limites da leitura e recusas sem sessao/permissao; RPCs so para authenticated, internas sem EXECUTE.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes, a partir do
--    worktree rh-pessoas (project-ref uetjghdkwbywbftedtth): pendentes so este
--    ficheiro e 20270111410000, acima de 20270110710000.
-- 2. Prova na nike ANTES do push: correr os dois ficheiros numa transaccao
--    terminada por um RAISE EXCEPTION (desfaz tudo). O NOTICE diz o intervalo
--    usado e o que ficou por provar.
-- ==============================================================================
