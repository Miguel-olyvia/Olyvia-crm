-- ==============================================================================
-- RH: a data de contratacao, a de antiguidade e a de saida da pessoa passam a
-- DERIVAR dos contratos (pessoas_vinculos). Editam-se so na aba Contratos.
--
-- Desenho fechado e revisto: vault/ficheiros/rh/datas-pessoa-contratos-desenho.md
-- (incluindo "Correccoes da revisao" H1-H4, M1-M8). Mapa:
-- vault/ficheiros/rh/datas-pessoa-contratos-mapa.md.
--
-- *** ORDEM DE ENVIO: ESTA MIGRATION PRIMEIRO, O CODIGO DEPOIS ***
-- O codigo novo -- o prototipo src/components/rh-exemplo,
-- src/lib/hr/datasDaPessoa.ts e os ficheiros PARTILHADOS src/hooks/usePessoa.ts,
-- src/types/hr.ts, src/utils/friendlyError.ts e as traducoes -- esta comitado
-- localmente e SO pode ser publicado DEPOIS desta migration estar aplicada: o
-- select de usePessoa pede pessoas_vinculos.data_antiguidade, que antes do push
-- nao existe (e a leitura da ficha inteira falharia).
--
-- A FICHA ANTIGA (src/components/hr) vai ser deitada fora e NAO foi
-- actualizada. Depois do push:
--   - quem editar uma das tres datas na aba Laborais dessa ficha antiga recebe o
--     erro 23514 com a frase "a data de contratacao, a de antiguidade e a de
--     saida derivam dos contratos -- editam-se na aba Contratos" (reenviar o
--     mesmo valor passa, por isso gravar o resto da aba continua a funcionar);
--   - a criacao de pessoa nessa ficha NAO parte: a base ignora a antiguidade
--     enviada no INSERT (tolerancia H2, anulada em silencio) e aceita a
--     contratacao como provisoria. Retirar a tolerancia H2 numa migration
--     seguinte, quando a ficha antiga tiver sido removida.
--
-- O QUE MUDA
--   1. pessoas_vinculos.data_antiguidade (date NULL) + CHECK
--      pessoas_vinculos_antiguidade_ate_inicio (data_antiguidade <= data_inicio);
--      auditada em hr_vinculos_registar_alteracao (pre-condicao md5 429c72e8...).
--   2. hr_pessoa_datas_calcular(uuid): a regra, UMA so implementacao (M4), pura,
--      STABLE, nunca depende de "hoje":
--        - contam contratos com deleted_at IS NULL (futuros incluidos);
--        - cadeias continuas: um contrato liga-se se comecar no maximo no dia a
--          seguir ao maior fim ja visto na cadeia (sem fim = cadeia aberta;
--          sobrepostos fundem-se);
--        - cadeia de referencia (H4): a de inicio mais recente que tenha pelo
--          menos um contrato nao 'futuro'; so se todas forem so de futuros, a de
--          inicio mais recente;
--        - contratacao = inicio da cadeia; saida = maior data_fim da cadeia SO se
--          todos os contratos dela estiverem 'terminado', senao NULL;
--          antiguidade = data_antiguidade do contrato mais recente da cadeia que
--          a tenha, senao o inicio da cadeia (D4); sem contrato vivo: a funcao
--          devolve as tres NULL (so olha para os contratos);
--        - tem_iniciado = ha pelo menos um contrato vivo NAO 'futuro'
--          (activo, suspenso ou terminado).
--   3. hr_pessoa_datas_recalcular(uuid) SECURITY DEFINER: tranca a pessoa
--      (FOR NO KEY UPDATE, instrucao propria, ANTES de ler os contratos), calcula,
--      e so faz UPDATE se alguma das tres muda; liga hr.sync_datas_pessoa e repoe
--      o valor anterior (M1); pessoa inexistente = devolve sem erro (M2).
--      A SAIDA SO SE LIMPA COM UM CONTRATO JA INICIADO (D8 revista + decisao de
--      11/11). data_saida e barreira de acesso em fn_neg_pessoa_da_conta (ambito
--      do Negocio por papel e por tarefa). Por isso, sem nenhum contrato vivo
--      NAO 'futuro' -- todos apagados, OU so contratos 'futuro' (uma readmissao
--      marcada que ainda nao comecou) -- a data_saida ja gravada MANTEM-SE:
--      apagar o ultimo contrato ou registar um 'futuro' isolado nunca devolve
--      acesso a quem saiu. So um contrato activo/suspenso/terminado limpa a
--      saida, pela regra normal (cadeia com um contrato nao terminado => NULL).
--      Contratacao e antiguidade seguem a regra normal (sem contrato vivo: NULL;
--      so futuros: inicio da cadeia mais recente), COM UMA SO EXCEPCAO, imposta
--      pelo CHECK pessoas_saida_depois_admissao (saida >= admissao), e so no
--      ramo "so futuros": as tres datas gravadas (contratacao, antiguidade e
--      saida) mantem-se APENAS quando ha saida gravada E a contratacao calculada
--      ficaria POSTERIOR a ela (o caso normal de uma readmissao futura) -- senao
--      gravar esse contrato 'futuro' falharia com 23514. Ficam assim ate o
--      contrato comecar. Sem saida gravada, ou com a contratacao calculada <=
--      saida gravada, um 'futuro' isolado define a contratacao e a antiguidade
--      normalmente (e a saida gravada, se houver, mantem-se).
--   4. hr_pessoa_datas_divergencias(uuid): guardado vs calculado (M2), usada
--      pelas guardas do backfill e por verificacoes periodicas. Aplica as mesmas
--      regras do recalculo (saida mantida sem contrato iniciado, e a excepcao do
--      CHECK) e, alem disso, uma pessoa SEM contrato vivo nao e divergencia pela
--      contratacao nem pela antiguidade gravadas (provisorias de uma pessoa nova,
--      opcao B, ou valores antigos que o primeiro contrato vai substituir).
--   5. Trigger AFTER INSERT / UPDATE OF (data_inicio, data_fim, estado,
--      deleted_at, data_antiguidade) / DELETE em pessoas_vinculos -> recalcula.
--   6. Trigger BEFORE INSERT / UPDATE OF as tres datas em pessoas: com
--      hr.sync_datas_pessoa = 'on' passa; UPDATE com valor diferente = 23514
--      (mesmo valor passa, M8); INSERT: recusa data_saida (23514), ANULA
--      data_antiguidade (H2), aceita data_admissao provisoria (opcao B: o cargo
--      abre nessa data). Por GUC e nao por current_user: apanha service_role.
--   7. hr_pessoas_laborais_so_campos (pre-condicao md5 750102e7...): as tres
--      datas saem do grupo Laborais. Editar contratacao/saida/antiguidade passa
--      a exigir hr.pessoas.vinculos.edit (via contrato). So se CONTA (NOTICE)
--      quem perde a edicao: quem tem hr.pessoas.laborais.edit OU hr.pessoas.edit
--      (a pessoas_update_policy aceita qualquer das duas) sem
--      hr.pessoas.vinculos.edit; nada se concede (D10).
--      Sem REVOKE UPDATE por coluna em pessoas: `authenticated` tem hoje UPDATE
--      por coluna (lido no catalogo: a tabela so lhe da SELECT/INSERT), mas o
--      bloqueio fica so no trigger, que tambem apanha service_role. Revogar o
--      UPDATE das tres colunas fica decidido para DEPOIS do deploy do codigo
--      novo (um cliente antigo que reenvie o mesmo valor falharia com 42501).
--   8. EXECUTE das funcoes novas revogado a PUBLIC, anon, authenticated e
--      service_role (H3): so os triggers e o dono as chamam.
--   9. Backfill que ABORTA em vez de adivinhar (todas as divergencias numa so
--      tentativa; a mensagem so traz CONTAGENS por caso e por organizacao, sem
--      ids de pessoas nem uuids de organizacoes -- para investigar, chamar
--      hr_pessoa_datas_divergencias(<org>) uma organizacao de cada vez). So as
--      pessoas apagadas (pessoas.deleted_at) ficam fora; as ARQUIVADAS
--      (estado_registo = 'arquivado') sao verificadas e recalculadas como as
--      outras:
--        G1  contratacao guardada diferente da calculada;
--        G2  saida guardada diferente da calculada;
--        G2b saida guardada NULL e calculada preenchida (H1: a pessoa sairia das
--            listas de activos);
--        G3/M3 antiguidade guardada posterior ao inicio da cadeia (violaria o
--            CHECK novo; nao ha onde a guardar);
--        G4  (assercao) contrato 'terminado' sem data_fim.
--      (A antiga G5, "sem contrato vivo mas com data de saida", deixou de
--      abortar: com a D8 revista esse e um estado valido -- o que fica depois
--      de apagar o ultimo contrato de quem saiu. Passou a ser contada no NOTICE
--      das pessoas sem contrato.)
--      Se passam: a antiguidade guardada diferente da contratacao e copiada para
--      o contrato que abre a cadeia (so a quem tem um contrato ja iniciado:
--      nunca para uma readmissao 'futuro'); depois recalcula-se TODA a pessoa nao
--      apagada com contrato vivo. Pessoas sem contrato nao se tocam: guardam a
--      contratacao/antiguidade/saida que tinham, e o PRIMEIRO contrato que lhes
--      for gravado passa a mandar nas tres datas (substitui-as sem perguntar).
--      Sao CONTADAS por organizacao num NOTICE (sem abortar). Nike, 11/11: 0.
--
-- MUDELAR (e todas as organizacoes): funcoes, triggers e backfill sao
-- partilhados. Se houver divergencias em qualquer organizacao, o db push
-- ABORTA inteiro e nada fica a meio. Se passar: a antiguidade NULL passa a
-- aparecer igual a contratacao; quem tem laborais.edit ou pessoas.edit sem
-- vinculos.edit deixa de editar estas datas; os filtros de "pessoa activa"
-- (data_saida) nao mudam de significado, mas a saida passa a preencher-se
-- sozinha quando o ultimo contrato da cadeia termina. ATENCAO: data_saida e
-- BARREIRA DE ACESSO em fn_neg_pessoa_da_conta (ambito do Negocio por papel e
-- por tarefa). Apagar o ultimo contrato ou registar um contrato 'futuro'
-- isolado NAO limpa a saida, por isso nunca devolve esse acesso; so um contrato
-- ja iniciado (reabrir um terminado, readmitir com contrato activo/suspenso)
-- limpa-a e devolve-o, e quem o pode fazer passa a ser quem tem
-- hr.pessoas.vinculos.edit. NAO PUBLICAR SEM AUTORIZACAO DO
-- UTILIZADOR.
--
-- NIKE (ensaio so-leitura de 11/11): G1 aborta em 56af20de (contratacao 01/10,
-- contrato desde 16/10) -- decisao D6 do utilizador, por tomar. Enquanto nao for
-- corrigida, este push FALHA (de proposito).
--
-- Reverter (se for preciso): largar os dois triggers e as quatro funcoes novas,
-- repor hr_pessoas_laborais_so_campos e hr_vinculos_registar_alteracao com as
-- definicoes de 20270109310000 e 20261210330000 (md5 acima), largar o CHECK e,
-- depois de exportar, a coluna. As datas ja escritas em pessoas ficam.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---- Dentro de uma transaccao -------------------------------------------------
DO $transaccao$
BEGIN
  IF current_setting('lock_timeout') IS DISTINCT FROM '5s' THEN
    RAISE EXCEPTION
      'hr_datas_pessoa_fora_de_transaccao: SET LOCAL nao teve efeito (lock_timeout = %); esta migration tem de correr numa so transaccao.',
      current_setting('lock_timeout')
      USING ERRCODE = '25000';
  END IF;
END;
$transaccao$;

-- ---- Pre-condicoes (so catalogo) ------------------------------------------------
DO $pre$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef('public.hr_pessoas_laborais_so_campos()'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '750102e7bbea8875d3842638be62416a' THEN
    RAISE EXCEPTION 'pre-condicao: hr_pessoas_laborais_so_campos() mudou no vivo (md5 %), reler antes de aplicar', v_md5;
  END IF;

  SELECT md5(pg_get_functiondef('public.hr_vinculos_registar_alteracao()'::regprocedure)) INTO v_md5;
  IF v_md5 IS DISTINCT FROM '429c72e8591bcf42b00c7704d7caffc2' THEN
    RAISE EXCEPTION 'pre-condicao: hr_vinculos_registar_alteracao() mudou no vivo (md5 %), reler antes de aplicar', v_md5;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'public.pessoas_vinculos'::regclass
                AND attname = 'data_antiguidade' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'pre-condicao: pessoas_vinculos.data_antiguidade ja existe';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname::text IN ('hr_pessoa_datas_calcular', 'hr_pessoa_datas_recalcular',
                                        'hr_pessoa_datas_divergencias',
                                        'hr_pessoas_vinculos_derivar_datas_pessoa',
                                        'hr_pessoas_datas_sao_derivadas')) THEN
    RAISE EXCEPTION 'pre-condicao: ja existe uma das funcoes novas (hr_pessoa_datas_* / derivar / sao_derivadas)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_laborais_so_campos'
                   AND tgrelid = 'public.pessoas'::regclass) THEN
    RAISE EXCEPTION 'pre-condicao: trg_pessoas_laborais_so_campos nao existe em pessoas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pessoas_vinculos_registar_alteracao'
                   AND tgrelid = 'public.pessoas_vinculos'::regclass) THEN
    RAISE EXCEPTION 'pre-condicao: trg_pessoas_vinculos_registar_alteracao nao existe em pessoas_vinculos';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pessoas_vinculos_terminado_tem_data_fim'
                   AND conrelid = 'public.pessoas_vinculos'::regclass) THEN
    RAISE EXCEPTION 'pre-condicao: CHECK pessoas_vinculos_terminado_tem_data_fim nao existe (a regra da saida assume-o)';
  END IF;
END;
$pre$;

-- ==============================================================================
-- 1. Antiguidade no contrato
-- ==============================================================================
ALTER TABLE public.pessoas_vinculos
  ADD COLUMN data_antiguidade date NULL;

COMMENT ON COLUMN public.pessoas_vinculos.data_antiguidade IS
  'Data de antiguidade reconhecida neste contrato (<= data_inicio). pessoas.data_antiguidade deriva daqui: o valor do contrato mais recente da cadeia actual que a tenha, senao o inicio da cadeia.';

-- NOT VALID agora (vale ja para as escritas novas, incluindo a copia do
-- backfill); VALIDATE no fim, depois do backfill. A coluna nasce toda NULL e a
-- guarda G3/M3 garante que a copia cumpre, por isso o VALIDATE tem de passar.
ALTER TABLE public.pessoas_vinculos
  ADD CONSTRAINT pessoas_vinculos_antiguidade_ate_inicio
  CHECK (data_antiguidade IS NULL OR data_antiguidade <= data_inicio) NOT VALID;

-- ==============================================================================
-- 2. Auditoria: data_antiguidade entra na lista (resto da funcao inalterado,
--    copiado da definicao viva md5 429c72e8...).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_vinculos_registar_alteracao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Todos os campos de negocio de pessoas_vinculos. NENHUM e monetario.
  v_campos text[] := ARRAY[
    'tipo_contrato', 'regime', 'regime_contratual',
    'data_inicio', 'data_fim', 'data_antiguidade', 'motivo_termo', 'estado',
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
$function$;

-- ==============================================================================
-- 3. A regra (uma so implementacao, M4)
-- ==============================================================================
CREATE FUNCTION public.hr_pessoa_datas_calcular(p_pessoa_id uuid)
 RETURNS TABLE (data_admissao date, data_antiguidade date, data_saida date,
                vinculo_abertura_id uuid, tem_iniciado boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Devolve sempre UMA linha. Sem contrato vivo: datas NULL e tem_iniciado
  -- false (so le contratos). data_admissao IS NULL quer dizer "sem contrato
  -- vivo"; tem_iniciado = ha um contrato vivo nao 'futuro'.
  -- O que depende do valor GUARDADO (manter a saida sem contrato iniciado, e a
  -- excepcao do CHECK saida >= admissao) aplica-se em hr_pessoa_datas_recalcular
  -- e hr_pessoa_datas_divergencias, nao aqui.
  -- Nao usa current_date: um 'futuro' conta como contrato (D3), e a escolha da
  -- cadeia de referencia (H4) depende so do estado gravado.
  WITH v AS (
    SELECT pv.id, pv.data_inicio AS di,
           coalesce(pv.data_fim, 'infinity'::date) AS df,
           pv.data_fim, pv.estado, pv.data_antiguidade
      FROM public.pessoas_vinculos pv
     WHERE pv.pessoa_id = p_pessoa_id
       AND pv.deleted_at IS NULL
  ), m AS (
    -- maior fim (sem fim = infinity) entre os contratos que comecam antes
    SELECT v.*, max(v.df) OVER (ORDER BY v.di, v.df, v.id
                                ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max
      FROM v
  ), g AS (
    -- nova cadeia quando ha um dia (ou mais) sem contrato antes do inicio
    SELECT m.*, sum(CASE WHEN m.prev_max IS NULL OR m.prev_max < m.di - 1 THEN 1 ELSE 0 END)
                  OVER (ORDER BY m.di, m.df, m.id) AS ilha
      FROM m
  ), ilhas AS (
    SELECT g.ilha,
           min(g.di) AS inicio,
           bool_or(g.estado <> 'futuro') AS tem_presente,
           bool_and(g.estado = 'terminado') AS todos_terminados,
           max(g.data_fim) AS fim_max,
           (array_agg(g.data_antiguidade ORDER BY g.di DESC, g.id DESC)
              FILTER (WHERE g.data_antiguidade IS NOT NULL))[1] AS antiguidade,
           (array_agg(g.id ORDER BY g.di, g.id))[1] AS abertura
      FROM g
     GROUP BY g.ilha
  ), ref AS (
    SELECT i.* FROM ilhas i
     ORDER BY i.tem_presente DESC, i.inicio DESC
     LIMIT 1
  )
  SELECT r.inicio,
         coalesce(r.antiguidade, r.inicio),
         CASE WHEN r.todos_terminados THEN r.fim_max END,
         r.abertura,
         -- a cadeia de referencia tem um nao 'futuro' sempre que algum contrato o tem
         coalesce(r.tem_presente, false)
    FROM (SELECT 1) AS um
    LEFT JOIN ref r ON true;
$function$;

COMMENT ON FUNCTION public.hr_pessoa_datas_calcular(uuid) IS
  'Regra unica das datas da pessoa a partir dos contratos vivos (cadeias continuas, cadeia de referencia = a mais recente com contrato nao futuro). Pura, nao depende de hoje. Ver migration 20270114500000.';

-- ==============================================================================
-- 4. Recalcular e gravar (chamada pelo trigger)
-- ==============================================================================
CREATE FUNCTION public.hr_pessoa_datas_recalcular(p_pessoa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prev         text;
  v_adm          date;
  v_ant          date;
  v_sai          date;
  v_iniciado     boolean;
  v_adm_guardada date;
  v_ant_guardada date;
  v_sai_guardada date;
BEGIN
  IF p_pessoa_id IS NULL THEN
    RETURN;
  END IF;

  -- Trancar a pessoa ANTES de ler os contratos (instrucao propria): dois
  -- contratos da mesma pessoa gravados em paralelo serializam aqui e o segundo
  -- le o estado ja com o primeiro.
  SELECT p.data_admissao, p.data_antiguidade, p.data_saida
    INTO v_adm_guardada, v_ant_guardada, v_sai_guardada
    FROM public.pessoas p WHERE p.id = p_pessoa_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    -- M2: pessoa inexistente (ex.: apagada em cascata) -- nada a fazer.
    RETURN;
  END IF;

  SELECT c.data_admissao, c.data_antiguidade, c.data_saida, c.tem_iniciado
    INTO v_adm, v_ant, v_sai, v_iniciado
    FROM public.hr_pessoa_datas_calcular(p_pessoa_id) c;

  -- A saida so se limpa com um contrato ja iniciado (nao 'futuro'). Sem nenhum
  -- contrato vivo, ou so com 'futuro', a saida que ja estava gravada mantem-se:
  -- data_saida e barreira de acesso (fn_neg_pessoa_da_conta) e apagar o ultimo
  -- contrato ou marcar uma readmissao futura nunca devolve acesso a quem saiu.
  IF NOT v_iniciado THEN
    v_sai := v_sai_guardada;
    -- CHECK pessoas_saida_depois_admissao (saida >= admissao): com a saida
    -- mantida, uma contratacao calculada POSTERIOR (readmissao futura) nao pode
    -- ser gravada; ficam a contratacao e a antiguidade gravadas (que ja
    -- cumpriam o CHECK) ate o contrato comecar.
    IF v_sai IS NOT NULL AND v_adm IS NOT NULL AND v_adm > v_sai THEN
      v_adm := v_adm_guardada;
      v_ant := v_ant_guardada;
    END IF;
  END IF;

  -- M1: guardar e repor o valor anterior (pode estar 'on' por quem chamou).
  v_prev := current_setting('hr.sync_datas_pessoa', true);
  PERFORM set_config('hr.sync_datas_pessoa', 'on', true);

  UPDATE public.pessoas p
     SET data_admissao    = v_adm,
         data_antiguidade = v_ant,
         data_saida       = v_sai
   WHERE p.id = p_pessoa_id
     AND (p.data_admissao, p.data_antiguidade, p.data_saida)
         IS DISTINCT FROM (v_adm, v_ant, v_sai);

  PERFORM set_config('hr.sync_datas_pessoa', coalesce(v_prev, ''), true);
END;
$function$;

COMMENT ON FUNCTION public.hr_pessoa_datas_recalcular(uuid) IS
  'Grava em pessoas as datas calculadas por hr_pessoa_datas_calcular (so se mudam). Sem contrato vivo nao futuro, a data_saida guardada mantem-se (barreira de acesso) e, se a contratacao calculada lhe for posterior, tambem a contratacao e a antiguidade gravadas (CHECK saida >= admissao). Chamada pelo trigger de pessoas_vinculos. Sem EXECUTE para roles da API.';

-- ==============================================================================
-- 5. Divergencias guardado vs calculado (guardas do backfill, verificacoes)
-- ==============================================================================
CREATE FUNCTION public.hr_pessoa_datas_divergencias(p_organization_id uuid DEFAULT NULL)
 RETURNS TABLE (
   organization_id     uuid,
   pessoa_id           uuid,
   tem_contrato        boolean,
   adm_guardada        date,
   ant_guardada        date,
   sai_guardada        date,
   adm_calculada       date,
   ant_calculada       date,
   sai_calculada       date,
   vinculo_abertura_id uuid,
   tem_iniciado        boolean
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Pessoas nao apagadas (deleted_at; as arquivadas ENTRAM) cujas tres datas
  -- guardadas diferem das que hr_pessoa_datas_recalcular gravaria.
  -- tem_contrato = ha pelo menos um contrato vivo (data_inicio e NOT NULL);
  -- tem_iniciado = ha um contrato vivo nao 'futuro'.
  -- Mesmas regras do recalculo: sem contrato iniciado a saida guardada conta
  -- como certa, e se a contratacao calculada lhe for posterior tambem contam a
  -- contratacao e a antiguidade guardadas (CHECK saida >= admissao). Alem disso,
  -- sem nenhum contrato vivo a contratacao e a antiguidade guardadas
  -- (provisorias de uma pessoa nova, opcao B, ou antigas) nao sao divergencia.
  -- As guardas do backfill so olham para quem tem contrato (tem_contrato).
  SELECT y.organization_id, y.id, y.tem_contrato,
         y.adm_g, y.ant_g, y.sai_g,
         y.adm_c, y.ant_c, y.sai_c, y.abertura, y.tem_iniciado
    FROM (
      SELECT x.organization_id, x.id, x.tem_contrato, x.tem_iniciado, x.abertura,
             x.adm_g, x.ant_g, x.sai_g,
             CASE WHEN NOT x.tem_contrato THEN x.adm_g
                  WHEN x.mantem_tudo THEN x.adm_g
                  ELSE x.adm_r END AS adm_c,
             CASE WHEN NOT x.tem_contrato THEN x.ant_g
                  WHEN x.mantem_tudo THEN x.ant_g
                  ELSE x.ant_r END AS ant_c,
             CASE WHEN NOT x.tem_iniciado THEN x.sai_g ELSE x.sai_r END AS sai_c
        FROM (
          SELECT p.organization_id, p.id,
                 c.data_admissao IS NOT NULL AS tem_contrato, c.tem_iniciado,
                 c.vinculo_abertura_id AS abertura,
                 p.data_admissao AS adm_g, p.data_antiguidade AS ant_g, p.data_saida AS sai_g,
                 c.data_admissao AS adm_r, c.data_antiguidade AS ant_r, c.data_saida AS sai_r,
                 (NOT c.tem_iniciado AND p.data_saida IS NOT NULL
                  AND c.data_admissao IS NOT NULL AND c.data_admissao > p.data_saida) AS mantem_tudo
            FROM public.pessoas p
           CROSS JOIN LATERAL public.hr_pessoa_datas_calcular(p.id) c
           WHERE (p_organization_id IS NULL OR p.organization_id = p_organization_id)
             AND p.deleted_at IS NULL
        ) x
    ) y
   WHERE (y.adm_g, y.ant_g, y.sai_g) IS DISTINCT FROM (y.adm_c, y.ant_c, y.sai_c);
$function$;

COMMENT ON FUNCTION public.hr_pessoa_datas_divergencias(uuid) IS
  'Pessoas nao apagadas (arquivadas incluidas) com datas guardadas diferentes das calculadas a partir dos contratos. NULL = todas as organizacoes; para investigar, uma organizacao de cada vez. Sem EXECUTE para roles da API.';

-- ==============================================================================
-- 6. Trigger em pessoas_vinculos: cada mudanca de contrato recalcula a pessoa
-- ==============================================================================
CREATE FUNCTION public.hr_pessoas_vinculos_derivar_datas_pessoa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- SECURITY DEFINER: quem grava o contrato (hr.pessoas.vinculos.edit) nao
  -- precisa de hr.pessoas.laborais.edit nem de EXECUTE no recalculo.
  -- pessoa_id e imutavel (trg_pessoas_vinculos_ancora).
  IF TG_OP = 'DELETE' THEN
    PERFORM public.hr_pessoa_datas_recalcular(OLD.pessoa_id);
  ELSE
    PERFORM public.hr_pessoa_datas_recalcular(NEW.pessoa_id);
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_pessoas_vinculos_derivar_datas_pessoa
  AFTER INSERT OR UPDATE OF data_inicio, data_fim, estado, deleted_at, data_antiguidade OR DELETE
  ON public.pessoas_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_vinculos_derivar_datas_pessoa();

-- ==============================================================================
-- 7. Bloqueio da escrita directa das tres datas em pessoas
-- ==============================================================================
CREATE FUNCTION public.hr_pessoas_datas_sao_derivadas()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF coalesce(current_setting('hr.sync_datas_pessoa', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.data_saida IS NOT NULL THEN
      RAISE EXCEPTION
        'pessoas_datas_derivadas: pessoas.data_saida nao se preenche ao criar a pessoa -- deriva dos contratos (aba Contratos).'
        USING ERRCODE = '23514';
    END IF;
    -- H2 (janela push/deploy): o assistente antigo envia a antiguidade no
    -- nucleo. Anula-se em silencio; vem do contrato. Retirar depois do deploy.
    NEW.data_antiguidade := NULL;
    -- data_admissao e aceite como valor provisorio: o trigger do cargo abre a
    -- primeira linha nessa data; o primeiro contrato substitui-a.
    RETURN NEW;
  END IF;

  IF (NEW.data_admissao, NEW.data_antiguidade, NEW.data_saida)
     IS DISTINCT FROM (OLD.data_admissao, OLD.data_antiguidade, OLD.data_saida) THEN
    RAISE EXCEPTION
      'pessoas_datas_derivadas: a data de contratacao, a de antiguidade e a de saida derivam dos contratos -- editam-se na aba Contratos, nao em pessoas.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_pessoas_datas_derivadas
  BEFORE INSERT OR UPDATE OF data_admissao, data_antiguidade, data_saida
  ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_datas_sao_derivadas();

-- ==============================================================================
-- 8. As tres datas saem do grupo Laborais (copiado da definicao viva md5
--    750102e7...; so mudam a lista e o tuplo).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_pessoas_laborais_so_campos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Campos do separador Laborais. As datas de contratacao, antiguidade e saida
  -- sairam (20270114500000): derivam dos contratos e so as escreve
  -- hr_pessoa_datas_recalcular (SECURITY DEFINER, nao passa aqui).
  v_laborais text[] := ARRAY[
    'email_trabalho', 'telefone_trabalho', 'numero_interno', 'cargo',
    'reporta_a_pessoa_id'
  ];
  -- Colunas de sistema. nome_completo é coluna gerada (primeiro_nome/apelido,
  -- que continuam comparados): num BEFORE vem por calcular.
  v_sistema text[] := ARRAY['updated_at', 'updated_by', 'nome_completo'];
  v_novo  jsonb;
  v_velho jsonb;
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  v_novo  := to_jsonb(NEW) - v_sistema;
  v_velho := to_jsonb(OLD) - v_sistema;

  -- Campos fora do separador: hr.pessoas.edit.
  IF (v_novo - v_laborais) IS DISTINCT FROM (v_velho - v_laborais)
     AND NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.edit', OLD.organization_id) THEN
    RAISE EXCEPTION
      'pessoas_laborais_so_campos: com hr.pessoas.laborais.edit (sem hr.pessoas.edit) so se mudam os campos do separador Laborais.'
      USING ERRCODE = '42501';
  END IF;

  -- Campos do separador: hr.pessoas.laborais.edit.
  IF (NEW.email_trabalho, NEW.telefone_trabalho, NEW.numero_interno, NEW.cargo,
      NEW.reporta_a_pessoa_id)
     IS DISTINCT FROM
     (OLD.email_trabalho, OLD.telefone_trabalho, OLD.numero_interno, OLD.cargo,
      OLD.reporta_a_pessoa_id)
     AND NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.laborais.edit', OLD.organization_id) THEN
    RAISE EXCEPTION
      'pessoas_laborais_exige_laborais_edit: mudar os campos do separador Laborais exige hr.pessoas.laborais.edit.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- ==============================================================================
-- 9. EXECUTE (H3): FROM PUBLIC sozinho nao chega no Supabase (os defaults
--    concedem a anon, authenticated e service_role explicitamente).
-- ==============================================================================
REVOKE ALL ON FUNCTION public.hr_pessoa_datas_calcular(uuid)              FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_pessoa_datas_recalcular(uuid)            FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_pessoa_datas_divergencias(uuid)          FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_pessoas_vinculos_derivar_datas_pessoa() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.hr_pessoas_datas_sao_derivadas()           FROM PUBLIC, anon, authenticated, service_role;

-- ==============================================================================
-- 10. Aviso (D10): quem perde a edicao destas datas. A pessoas_update_policy
--     aceita hr.pessoas.edit OU hr.pessoas.laborais.edit; a partir de agora so
--     se mudam pelo contrato (hr.pessoas.vinculos.edit). So se conta; nada se
--     concede.
-- ==============================================================================
DO $aviso$
DECLARE
  v_papeis_lab  integer;
  v_papeis_edit integer;
  v_papeis      integer;
  v_membros     integer;
BEGIN
  WITH perm AS (
    SELECT rp.role_id,
           bool_or(rp.permission_code = 'hr.pessoas.laborais.edit') AS lab,
           bool_or(rp.permission_code = 'hr.pessoas.edit')          AS edit,
           bool_or(rp.permission_code = 'hr.pessoas.vinculos.edit') AS vinc
      FROM public.anew_role_permissions rp
     WHERE rp.permission_code IN ('hr.pessoas.laborais.edit', 'hr.pessoas.edit', 'hr.pessoas.vinculos.edit')
     GROUP BY rp.role_id
  ), perdem AS (
    SELECT perm.role_id, perm.lab, perm.edit FROM perm WHERE (perm.lab OR perm.edit) AND NOT perm.vinc
  )
  SELECT count(*) FILTER (WHERE perdem.lab),
         count(*) FILTER (WHERE perdem.edit),
         count(*),
         (SELECT count(*) FROM public.anew_memberships am
           WHERE am.status = 'active' AND am.role_id IN (SELECT x.role_id FROM perdem x))
    INTO v_papeis_lab, v_papeis_edit, v_papeis, v_membros
    FROM perdem;

  RAISE NOTICE
    'datas_pessoa: % papeis (% membros activos) tem hr.pessoas.laborais.edit ou hr.pessoas.edit sem hr.pessoas.vinculos.edit (% com laborais.edit, % com pessoas.edit) e deixam de editar contratacao/antiguidade/saida. Nada foi concedido.',
    v_papeis, v_membros, v_papeis_lab, v_papeis_edit;
END;
$aviso$;

-- ==============================================================================
-- 11. Backfill: guardas primeiro (acumula tudo, aborta no fim com CONTAGENS)
--     As mensagens so trazem contagens: por caso, numero de pessoas, numero de
--     organizacoes e a contagem de cada organizacao (sem uuids). Para ver quem,
--     hr_pessoa_datas_divergencias(<org>) uma organizacao de cada vez.
-- ==============================================================================

-- Aviso (sem abortar): pessoas sem contrato vivo com contratacao ou
-- antiguidade preenchida, e (a antiga G5) com data de saida. Nao se tocam agora;
-- o primeiro contrato que lhes for gravado passa a mandar nas tres datas. A
-- saida sem contrato e um estado valido (D8 revista): mantem-se.
DO $sem_contrato$
DECLARE
  v_resumo text;
  v_saida  text;
BEGIN
  WITH por_org AS (
    SELECT p.organization_id, count(*) AS n
      FROM public.pessoas p
     WHERE p.deleted_at IS NULL
       AND p.data_saida IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_vinculos pv
                        WHERE pv.pessoa_id = p.id AND pv.deleted_at IS NULL)
     GROUP BY p.organization_id
  )
  SELECT format('%s pessoa(s) em %s organizacao(oes); por organizacao: %s',
                sum(po.n)::text, count(*)::text,
                string_agg(po.n::text, ', ' ORDER BY po.n DESC))
    INTO v_saida
    FROM por_org po
  HAVING count(*) > 0;

  RAISE NOTICE 'datas_pessoa: sem contrato vivo mas com data de saida (mantem-se; D8 revista): %',
    coalesce(v_saida, '0');

  WITH por_org AS (
    SELECT p.organization_id, count(*) AS n
      FROM public.pessoas p
     WHERE p.deleted_at IS NULL
       AND (p.data_admissao IS NOT NULL OR p.data_antiguidade IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM public.pessoas_vinculos pv
                        WHERE pv.pessoa_id = p.id AND pv.deleted_at IS NULL)
     GROUP BY p.organization_id
  )
  SELECT format('%s pessoa(s) em %s organizacao(oes); por organizacao: %s',
                sum(po.n)::text, count(*)::text,
                string_agg(po.n::text, ', ' ORDER BY po.n DESC))
    INTO v_resumo
    FROM por_org po
  HAVING count(*) > 0;

  RAISE NOTICE 'datas_pessoa: sem contrato vivo mas com contratacao/antiguidade preenchida (nao se tocam; o primeiro contrato passa a mandar): %',
    coalesce(v_resumo, '0');
END;
$sem_contrato$;

DO $guardas$
DECLARE
  v_lista text;
  v_g4    integer;
BEGIN
  -- G4 (assercao): o CHECK pessoas_vinculos_terminado_tem_data_fim impede-o.
  SELECT count(*) INTO v_g4
    FROM public.pessoas_vinculos pv
   WHERE pv.deleted_at IS NULL AND pv.estado = 'terminado' AND pv.data_fim IS NULL;

  WITH d AS (
    SELECT * FROM public.hr_pessoa_datas_divergencias(NULL)
  ), casos AS (
    SELECT 'G1 contratacao guardada diferente da calculada'::text AS caso, d.organization_id, d.pessoa_id
      FROM d WHERE d.tem_contrato AND d.adm_guardada IS NOT NULL
               AND d.adm_guardada IS DISTINCT FROM d.adm_calculada
    UNION ALL
    SELECT 'G2 saida guardada diferente da calculada', d.organization_id, d.pessoa_id
      FROM d WHERE d.tem_contrato AND d.sai_guardada IS NOT NULL
               AND d.sai_guardada IS DISTINCT FROM d.sai_calculada
    UNION ALL
    SELECT 'G2b saida por preencher (todos os contratos terminados)', d.organization_id, d.pessoa_id
      FROM d WHERE d.tem_contrato AND d.sai_guardada IS NULL AND d.sai_calculada IS NOT NULL
    UNION ALL
    SELECT 'G3/M3 antiguidade guardada posterior ao inicio da cadeia', d.organization_id, d.pessoa_id
      FROM d WHERE d.tem_contrato AND d.ant_guardada IS NOT NULL
               AND d.ant_guardada > d.adm_calculada
  ), por_org AS (
    SELECT c.caso, c.organization_id, count(*) AS n
      FROM casos c
     GROUP BY c.caso, c.organization_id
  ), por_caso AS (
    SELECT po.caso, sum(po.n) AS pessoas, count(*) AS orgs,
           string_agg(po.n::text, ', ' ORDER BY po.n DESC) AS contagens
      FROM por_org po
     GROUP BY po.caso
  )
  SELECT string_agg(format('%s: %s pessoa(s) em %s organizacao(oes); por organizacao: %s',
                           pc.caso, pc.pessoas::text, pc.orgs::text, pc.contagens),
                    E'\n' ORDER BY pc.caso)
    INTO v_lista
    FROM por_caso pc;

  IF v_g4 > 0 THEN
    v_lista := concat_ws(E'\n', v_lista,
                         format('G4 contratos terminados sem data_fim: %s', v_g4::text));
  END IF;

  IF v_lista IS NOT NULL THEN
    RAISE EXCEPTION E'datas_pessoa_backfill: ha datas guardadas que a regra nao reproduz; corrigir os dados (ou decidir) e voltar a correr. Nada foi alterado.\n%', v_lista
      USING ERRCODE = 'P0001',
            HINT = 'Para ver quem: SELECT * FROM public.hr_pessoa_datas_divergencias(<organizacao>), uma organizacao de cada vez. Regra em hr_pessoa_datas_calcular; desenho datas-pessoa-contratos-desenho.md (G1-G4).';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 12. Backfill: copia a antiguidade e recalcula
-- ==============================================================================
DO $backfill$
DECLARE
  v_copiadas    integer;
  v_recalculadas integer := 0;
  r record;
BEGIN
  -- Motivo na auditoria do contrato (hr_vinculos_registar_alteracao le-o).
  PERFORM set_config('hr.alteracao_motivo', 'Migracao: antiguidade copiada da ficha da pessoa para o contrato que abre a cadeia.', true);

  -- Antiguidade guardada diferente da contratacao (e, pelas guardas, anterior):
  -- vai para o contrato que abre a cadeia. Este UPDATE dispara o trigger novo,
  -- que recalcula a pessoa.
  WITH d AS (
    SELECT * FROM public.hr_pessoa_datas_divergencias(NULL)
     WHERE tem_contrato AND tem_iniciado
       AND ant_guardada IS NOT NULL AND ant_guardada < adm_calculada
  )
  UPDATE public.pessoas_vinculos pv
     SET data_antiguidade = d.ant_guardada
    FROM d
   WHERE pv.id = d.vinculo_abertura_id
     AND pv.pessoa_id = d.pessoa_id;
  GET DIAGNOSTICS v_copiadas = ROW_COUNT;

  PERFORM set_config('hr.alteracao_motivo', '', true);

  -- Todas as pessoas nao apagadas (arquivadas incluidas) com contrato vivo.
  -- Sem contrato: intocadas.
  FOR r IN
    SELECT p.id
      FROM public.pessoas p
     WHERE p.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM public.pessoas_vinculos pv
                    WHERE pv.pessoa_id = p.id AND pv.deleted_at IS NULL)
     ORDER BY p.id
  LOOP
    PERFORM public.hr_pessoa_datas_recalcular(r.id);
    v_recalculadas := v_recalculadas + 1;
  END LOOP;

  RAISE NOTICE 'datas_pessoa_backfill: % antiguidade(s) copiada(s) para o contrato; % pessoa(s) com contrato recalculada(s).',
    v_copiadas, v_recalculadas;
END;
$backfill$;

ALTER TABLE public.pessoas_vinculos
  VALIDATE CONSTRAINT pessoas_vinculos_antiguidade_ate_inicio;

-- ==============================================================================
-- 13. Conferir (M5): SO catalogo. O comportamento vai para o pgTAP
--     (supabase/tests/hr_pessoa_datas_derivadas.test.sql) e para a
--     verificacao ao vivo na nike depois do push.
-- ==============================================================================
DO $conferir$
DECLARE
  v_fn   text;
  v_role text;
  v_trg  text;
  v_res  integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute
                  WHERE attrelid = 'public.pessoas_vinculos'::regclass
                    AND attname = 'data_antiguidade' AND NOT attisdropped
                    AND format_type(atttypid, atttypmod)::text = 'date'
                    AND NOT attnotnull) THEN
    RAISE EXCEPTION 'conferir: pessoas_vinculos.data_antiguidade (date NULL) em falta';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.pessoas_vinculos'::regclass
                    AND conname = 'pessoas_vinculos_antiguidade_ate_inicio'
                    AND contype::text = 'c'
                    AND convalidated) THEN
    RAISE EXCEPTION 'conferir: CHECK pessoas_vinculos_antiguidade_ate_inicio em falta ou por validar';
  END IF;

  FOREACH v_trg IN ARRAY ARRAY['public.pessoas_vinculos:trg_pessoas_vinculos_derivar_datas_pessoa',
                               'public.pessoas:trg_pessoas_datas_derivadas',
                               'public.pessoas:trg_pessoas_laborais_so_campos',
                               'public.pessoas_vinculos:trg_pessoas_vinculos_registar_alteracao']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                    WHERE t.tgrelid = split_part(v_trg, ':', 1)::regclass
                      AND t.tgname::text = split_part(v_trg, ':', 2)
                      AND t.tgenabled::text = 'O') THEN
      RAISE EXCEPTION 'conferir: trigger % em falta ou desactivado', v_trg;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY['public.hr_pessoa_datas_calcular(uuid)',
                              'public.hr_pessoa_datas_recalcular(uuid)',
                              'public.hr_pessoa_datas_divergencias(uuid)',
                              'public.hr_pessoas_vinculos_derivar_datas_pessoa()',
                              'public.hr_pessoas_datas_sao_derivadas()']
  LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      IF has_function_privilege(v_role::name, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'conferir: % ainda tem EXECUTE em %', v_role, v_fn;
      END IF;
    END LOOP;
  END LOOP;

  -- Os dois SECURITY DEFINER novos tem search_path fixo.
  SELECT count(*) INTO v_res
    FROM pg_proc p
   WHERE p.oid IN ('public.hr_pessoa_datas_recalcular(uuid)'::regprocedure,
                   'public.hr_pessoas_vinculos_derivar_datas_pessoa()'::regprocedure)
     AND p.prosecdef
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg::text LIKE 'search\_path=%');
  IF v_res <> 2 THEN
    RAISE EXCEPTION 'conferir: recalcular/derivar deviam ser SECURITY DEFINER com search_path fixo (encontradas %)', v_res;
  END IF;

  -- As tres datas deixaram de ser campos Laborais.
  IF pg_get_functiondef('public.hr_pessoas_laborais_so_campos()'::regprocedure)::text LIKE '%''data_admissao''%' THEN
    RAISE EXCEPTION 'conferir: hr_pessoas_laborais_so_campos ainda lista data_admissao';
  END IF;
END;
$conferir$;

COMMIT;
