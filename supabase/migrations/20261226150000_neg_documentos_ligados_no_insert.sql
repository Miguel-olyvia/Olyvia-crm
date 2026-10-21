-- ============================================================
-- 20261226150000_neg_documentos_ligados_no_insert  (Fase N, migration E)
-- ============================================================
-- *** SÓ SE APLICA COM AUTORIZAÇÃO EXPRESSA DO UTILIZADOR, FORA DA HORA DE
-- *** PONTA. Cria gatilhos em QUATRO TABELAS PARTILHADAS COM A MUDELAR:
-- *** quotes, proposals, client_contracts e pipeline_links.
-- Frase para pedir a autorização (desenho, 16.1): «Para a Mudelar não muda
-- nada nos dados nem no comportamento; há um bloqueio curto nessas tabelas
-- durante a aplicação, e cada INSERT de contrato, orçamento ou ligação de
-- pipeline passa a fazer no máximo uma leitura por chave primária».
-- O bloqueio (SHARE ROW EXCLUSIVE, o de CREATE TRIGGER) é pedido com NOWAIT,
-- até 10 tentativas de 0,5 s; se não o conseguir, a migration aborta sem
-- fazer nada. Enquanto dura (até ao COMMIT, só catálogo), os INSERT/UPDATE
-- nessas quatro tabelas esperam.
--
-- Desenho: vault ficheiros/crm/negocios-fecho-por-tipo-desenho.md (v4),
--   secções 5, 6, 7 e 16.1 (linha E).
--
-- Regra de sessão da herança (revisão de segurança de 21/10)
--   COM SESSÃO (auth.uid() não nulo, um utilizador do CRM): a herança só liga
--   o documento se o utilizador tiver pessoas.edit com âmbito sobre o negócio
--   (fn_neg_pode_editar) e o negócio estiver ABERTO (fn_neg_heranca_permitida).
--   Se não cumprir, a herança NÃO liga e o documento cria-se NORMALMENTE, sem
--   negócio: nunca falha nem aborta o INSERT (fica «por ligar»).
--   Excepção: o substituto de um contrato (replaces_contract_id, criado por
--   cancel_and_replace_contract) herda com o negócio aberto OU GANHO, porque o
--   INSERT do substituto acontece antes de a substituição reabrir o negócio
--   (a decisão é adiada para o COMMIT); continua a exigir pessoas.edit.
--   SEM SESSÃO (portal, assinatura, processos do sistema): como no desenho; um
--   negócio ganho ou perdido também herda (para gerar o alerta).
--   A validação aplica a MESMA regra, por isso a herança nunca preenche um
--   valor que a validação depois recuse.
--
-- Limite da prova (secção 8): P1, P2, P3 e os hashes de conteúdo são colunas
--   simples dos documentos (signature_image, signed_by_name, partes
--   assinadas, company_signature_date, decided_snapshot_hash, ...) que quem
--   pode escrever nessas tabelas pode forjar. Protegem contra ENGANO, não
--   contra FRAUDE de quem já tem escrita nos documentos.
--
-- O que faz
--   1. Herança no INSERT (BEFORE INSERT, DEFINER, sem EXECUTE para ninguém).
--      Só preenche negocio_id quando a linha vem sem ele, o documento de
--      origem o tem, a organização do negócio tem configuração, o negócio
--      não está no lixo, a linha é da mesma organização e pessoa, e a regra
--      de sessão acima o permite:
--        client_contracts  trg_negocios_10_herdar: 1. variável
--                          app.neg_criar_contrato (consumida); 2.
--                          replaces_contract_id (substituto; aberto ou ganho com
--                          sessão, qualquer estado sem sessão); 3. proposal_id;
--                          4. quote_id. SÓ com fecho = 'contrato'. Proposta e
--                          orçamento em negócios diferentes: não herda e fica um
--                          evento alerta nos dois.
--        quotes            trg_negocios_10_herdar: 1. app.neg_criar_orcamento
--                          (consumida); 2. proposal_id. Nos dois tipos de fecho.
--        proposals         trg_negocios_10_herdar: só app.neg_criar_proposta
--                          (consumida).
--      Cada gatilho tem WHEN: sem documento de origem nem variável, a função
--      nem é chamada.
--   2. A proposta da cadeia herda no instante em que a ligação ao orçamento
--      aparece (AFTER, DEFINER):
--        quotes            trg_negocios_30_herdar_proposta (AFTER UPDATE OF
--                          proposal_id, o WHEN do desenho) e
--                          trg_negocios_31_herdar_proposta_ins (AFTER INSERT com
--                          negocio_id e proposal_id; acrescento ao desenho, que só
--                          previa o UPDATE: um orçamento criado no negócio já com
--                          proposta também a liga);
--        pipeline_links    trg_negocios_30_herdar_proposta (AFTER INSERT OR
--                          UPDATE OF proposal_id, WHEN proposal_id e quote_id não
--                          nulos; só ligações 'active'; a organização da ligação
--                          tem de ser a do orçamento e, com sessão, uma das
--                          organizações do utilizador).
--      Ambos escrevem proposals.negocio_id só se estiver vazio, com a variável
--      app.neg_herdar_proposta = o negócio (o caminho que a validação aceita
--      sem sessão, porque o portal não tem utilizador), e com a regra de sessão
--      acima. O UPDATE da proposta corre num sub-bloco EXCEPTION: um erro não
--      aborta o aceite do cliente no portal (accept_quote) nem nenhum outro
--      INSERT/UPDATE; a proposta fica «por ligar» e o erro fica em
--      workflow_execution_log (action_type 'trigger:negocio_heranca', status
--      'error').
--      LACUNA ACEITE pelo utilizador: o accept_quote do portal de um orçamento
--      SEM pipeline_links activo não deixa rasto do orçamento na proposta:
--      essa proposta fica sem negócio (visível como «por ligar»).
--   3. Validação de negocio_id (D10, secção 7), BEFORE, DEFINER, nas três
--      tabelas: trg_negocios_20_validar_ins (INSERT com negocio_id) e
--      trg_negocios_20_validar_upd (UPDATE OF negocio_id que o MUDA, incluindo
--      para nulo). Corre depois da herança (ordem alfabética dos nomes).
--      Valor não nulo, sempre: negócio existe e não está no lixo (NG001),
--      organização com configuração (NG008), mesma organização e pessoa
--      (NG004), e contratos só com fecho = 'contrato' (NG023). Depois:
--        INSERT herdado SEM sessão (valor = negocio_id do documento de
--          origem): mais nada;
--        INSERT COM sessão, herdado ou não (o valor igual a uma origem deixa de
--          dispensar a verificação): negócio aberto (NG002) e pessoas.edit com
--          âmbito (42501); o substituto de um contrato aceita aberto ou ganho;
--        INSERT de criação sem sessão: recusado (fn_neg_pode_editar exige
--          sessão);
--        UPDATE herdado (app.neg_herdar_proposta = o valor, proposta sem
--          negócio): sem sessão, mais nada; com sessão, aberto e pessoas.edit;
--        UPDATE pela ligação tardia (app.neg_via_funcao = on, documento sem
--          negócio): negócio aberto e pessoas.edit com âmbito;
--        UPDATE para NULO (desligar): só por neg_desligar_registo
--          (app.neg_via_funcao = on), com o negócio de antes aberto e
--          pessoas.edit com âmbito; fora disso, recusado (42501). O ON DELETE
--          SET NULL das FK não tem excepção: os negócios não se apagam
--          (política negocios_no_delete para authenticated, nenhuma função
--          apaga negócios); um DELETE por service_role seria recusado por este
--          gatilho em vez de desligar documentos em silêncio;
--        qualquer outro UPDATE de negocio_id: recusado (42501).
--   3b. neg_desligar_registo (recriada, INVOKER, privilégios mantidos): igual à
--      de 20/10, mais app.neg_via_funcao = on à volta dos três UPDATE de
--      documentos (orçamento, proposta, contrato), que a validação exige.
--   4. Funções de criação (INVOKER; EXECUTE só para authenticated) que
--      envolvem as RPC partilhadas SEM as alterar:
--        neg_criar_orcamento(p_negocio_id, p_quote_data, p_lines, p_fees,
--          p_totals, p_inline_quotes, p_diagnostic_suggestions) -> quotes
--          (envolve rpc_save_quote só na criação: p_quote_id vai a NULL)
--        neg_criar_proposta(p_negocio_id, p_proposal_data,
--          p_selected_quote_ids, p_inline_quotes, p_proposal_items,
--          p_quote_entity_id) -> proposals (envolve rpc_create_proposal)
--        neg_criar_contrato(p_negocio_id, os 15 argumentos de
--          rpc_create_client_contract) -> uuid (exige fecho = 'contrato', NG023)
--      Cada uma: negócio editável e aberto (fn_neg_negocio_editavel: NG001,
--      NG008, NG002), organização e pessoa do pedido iguais às do negócio
--      (NG004), põe a variável app.neg_criar_<tabela>, chama a RPC, limpa a
--      variável e confirma que o documento ficou ligado (NG004).
--
-- Impacto na Mudelar (medido a 20/10, contagens agregadas): 0 documentos com
--   negocio_id e 0 linhas de configuração. A validação e os AFTER só correm com
--   negocio_id preenchido ou a mudar (WHEN falso para a Mudelar: os
--   documentos dela têm todos negocio_id nulo). A herança corre nos
--   INSERT que têm documento de origem (nos últimos 30 dias, fora da nike: 119
--   contratos, todos com origem, e 244 orçamentos com proposta) e faz até 3
--   leituras por chave primária, que dão nulo; não escreve nada. Custo medido
--   na nike (SELECT em ciclo, 3 x 1000 corridas): cerca de 6 µs por INSERT,
--   mais a chamada plpgsql. Nenhum dado da Mudelar muda.
--
-- O que o ecrã tem de fazer junto
--   Os 6 ficheiros partilhados (QuoteBuilder.tsx, ProposalCreateDialog.tsx,
--   ContractDetailDialog.tsx, Quotes.tsx, Proposals.tsx, ClientContracts.tsx)
--   ganham a prop opcional negocioId (no contrato, ?negocio=): com ela, a
--   criação chama neg_criar_orcamento / neg_criar_proposta / neg_criar_contrato
--   (ou, no INSERT directo do diálogo de proposta, põe a coluna negocio_id);
--   sem ela, a chamada é exactamente a de hoje. onSaved e ?voltar= deixam de
--   ligar; useLigarAoVoltar sai. Num negócio com fecho na proposta, o editor de
--   contrato não é oferecido. Traduzir NG001, NG002, NG004, NG008, NG023 e
--   42501. Regenerar os tipos do Supabase.
--
-- Pré-condição: md5 lido no remoto a 20/10 das RPC envolvidas e das funções
--   de gatilho vizinhas; os gatilhos das quatro tabelas são os de 20/10; a
--   migration D aplicada (md5 do corpo das funções de que esta depende).
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226150000_neg_documentos_ligados_no_insert.sql), só
--   depois de reverter F. Também partilhada: exige a mesma autorização.
--   Os negocio_id já escritos ficam (a reversão não apaga ligações).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição
DO $pre$
DECLARE
  v_txt text;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.rpc_save_quote(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 'f3e45a0897c1d5f90b8505d7062e849d'),
              ('public.rpc_create_proposal(jsonb,uuid[],jsonb,jsonb,uuid)',      'db37c441836f3bc2b39804ab9d2328b1'),
              ('public.rpc_create_client_contract(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,date,date,text,text,text,text,jsonb)', '68779cfede89984e2ec04d9562c7373d'),
              ('public.cancel_and_replace_contract(uuid,text,boolean)',          '1410eb20dc41b015651af9e754581ccf'),
              ('public.fn_sync_quote_proposal_id()',                             '317c5dafb94eb45e63fbfaacb57a159e'),
              ('public.fn_neg_negocio_editavel(uuid,text[])',                    '05b8dd6fd7e952c1d02dadff8e529f25'),
              ('public.neg_desligar_registo(uuid,text,uuid)',                    '4dc6cd33903c56da1a9526303b0c0439')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10: %; nada feito.', v_txt;
  END IF;

  -- A migration D aplicada como escrita (md5 do corpo sem CR).
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.fn_neg_pode_editar(public.negocios)',  'fef63350211f700670162c68d04baf59'),
              ('public.fn_neg_anotar(uuid,text,text,text,text,uuid,text,text,text,text)', 'c2f4738fce8262fd99a3cb740d5e852f'),
              ('public.neg_ligar_registo(uuid,text,uuid)',    'eaad2935625bcaf75f458764e023973e')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_catalog.pg_proc p
                   WHERE p.oid = pg_catalog.to_regprocedure(e.sig)) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: a migration D não está aplicada como escrita: %; nada feito.', v_txt;
  END IF;

  -- Os gatilhos das quatro tabelas são os de 20/10 (nomes e definições).
  v_txt := (SELECT string_agg(e.tbl, ', ')
            FROM (VALUES
              ('public.quotes',           'a5cd46300974b20c76a594a77a99c6d8'),
              ('public.proposals',        '0aa2521eee9076b407dd804d5c00f80b'),
              ('public.client_contracts', 'de46dd654e0f939a4302d93c800db00b'),
              ('public.pipeline_links',   '30cc6a02395776690471a42110ce604e')
            ) AS e(tbl, h)
            WHERE (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                                         ORDER BY t.tgname::text))
                   FROM pg_catalog.pg_trigger t
                   WHERE t.tgrelid = e.tbl::regclass AND NOT t.tgisinternal) IS DISTINCT FROM e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: os gatilhos mudaram desde 20/10 em: %; nada feito.', v_txt;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('fn_neg_herdar_contrato', 'fn_neg_herdar_orcamento', 'fn_neg_herdar_proposta',
                                 'fn_neg_herdar_proposta_ligacao', 'fn_neg_validar_documento',
                                 'fn_neg_negocio_para_heranca', 'fn_neg_heranca_permitida',
                                 'neg_criar_orcamento', 'neg_criar_proposta', 'neg_criar_contrato')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: alguma das funções novas já existe; nada feito.';
  END IF;
END
$pre$;

-- Bloqueio curto das quatro tabelas: NOWAIT, até 10 tentativas.
DO $bloqueio$
DECLARE
  v_i int;
BEGIN
  FOR v_i IN 1..10 LOOP
    BEGIN
      LOCK TABLE public.quotes, public.proposals, public.client_contracts, public.pipeline_links
        IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(0.5);
    END;
  END LOOP;
  RAISE EXCEPTION 'BLOQUEIO: as tabelas partilhadas estão ocupadas (10 tentativas); nada feito. Tentar fora da hora de ponta.';
END
$bloqueio$;

-- ============================================================
-- Auxiliar da herança
-- Devolve a linha inteira (SELECT n) e não a lista de colunas (SELECT n.*):
-- assim o resultado é sempre do tipo public.negocios, mesmo depois de uma
-- migration futura acrescentar ou largar colunas em negocios.
-- ============================================================
CREATE FUNCTION public.fn_neg_negocio_para_heranca(p_negocio_id uuid, p_organization_id uuid, p_entity_id uuid)
  RETURNS public.negocios
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
  SELECT n
  FROM public.negocios n
  WHERE n.id = p_negocio_id
    AND n.deleted_at IS NULL
    AND n.organization_id = p_organization_id
    AND n.entity_id = p_entity_id
    AND EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                WHERE c.organization_id = n.organization_id);
$function$;

-- Regra de sessão da herança (a mesma na herança e na validação).
CREATE FUNCTION public.fn_neg_heranca_permitida(p_neg public.negocios, p_estados text[])
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  -- Sem sessão (portal, assinatura, sistema): a herança do desenho.
  -- Com sessão: negócio num dos estados indicados e pessoas.edit com âmbito.
  SELECT p_neg.id IS NOT NULL
     AND (auth.uid() IS NULL
          OR (p_neg.estado = ANY (p_estados) AND public.fn_neg_pode_editar(p_neg)));
$function$;

-- ============================================================
-- 1. Herança no INSERT
-- ============================================================
CREATE FUNCTION public.fn_neg_herdar_contrato()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_var  text;
  v_cand uuid;
  v_pr   uuid;
  v_qt   uuid;
  v_neg  public.negocios;
BEGIN
  IF NEW.negocio_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Criado a partir do negócio (neg_criar_contrato): a variável é consumida.
  v_var := NULLIF(current_setting('app.neg_criar_contrato', true), '');
  IF v_var IS NOT NULL THEN
    PERFORM set_config('app.neg_criar_contrato', '', true);
    NEW.negocio_id := v_var::uuid;
    RETURN NEW;
  END IF;

  -- 2. Substituto: herda do contrato que substitui. Sem sessão, em qualquer
  --    estado; com sessão, pessoas.edit e negócio aberto ou ganho (o INSERT do
  --    substituto vem antes de a substituição reabrir o negócio).
  IF NEW.replaces_contract_id IS NOT NULL THEN
    SELECT o.negocio_id INTO v_cand FROM public.client_contracts o WHERE o.id = NEW.replaces_contract_id;
    IF v_cand IS NOT NULL THEN
      v_neg := public.fn_neg_negocio_para_heranca(v_cand, NEW.organization_id, NEW.entity_id);
      IF v_neg.id IS NOT NULL AND v_neg.fecho = 'contrato'
         AND public.fn_neg_heranca_permitida(v_neg, ARRAY['aberto', 'ganho']) THEN
        NEW.negocio_id := v_neg.id;
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  -- 3 e 4. Proposta e orçamento de origem.
  IF NEW.proposal_id IS NOT NULL THEN
    SELECT o.negocio_id INTO v_pr FROM public.proposals o WHERE o.id = NEW.proposal_id;
  END IF;
  IF NEW.quote_id IS NOT NULL THEN
    SELECT o.negocio_id INTO v_qt FROM public.quotes o WHERE o.id = NEW.quote_id;
  END IF;
  IF v_pr IS NULL AND v_qt IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_pr IS NOT NULL AND v_qt IS NOT NULL AND v_pr <> v_qt THEN
    -- Proposta e orçamento em negócios diferentes: não herda; alerta nos dois.
    FOREACH v_cand IN ARRAY ARRAY[v_pr, v_qt] LOOP
      v_neg := public.fn_neg_negocio_para_heranca(v_cand, NEW.organization_id, NEW.entity_id);
      IF v_neg.id IS NOT NULL THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', NULL,
          'Contrato criado de uma proposta e de um orçamento de negócios diferentes: ficou sem negócio.',
          'contrato', NEW.id, NEW.status, public.fn_neg_canal(public.fn_negocios_actor(), NULL), NULL, NULL);
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Com sessão: só num negócio aberto e com pessoas.edit; senão o contrato
  -- cria-se sem negócio.
  v_neg := public.fn_neg_negocio_para_heranca(COALESCE(v_pr, v_qt), NEW.organization_id, NEW.entity_id);
  IF v_neg.id IS NOT NULL AND v_neg.fecho = 'contrato'
     AND public.fn_neg_heranca_permitida(v_neg, ARRAY['aberto']) THEN
    NEW.negocio_id := v_neg.id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.fn_neg_herdar_orcamento()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_var  text;
  v_cand uuid;
  v_neg  public.negocios;
BEGIN
  IF NEW.negocio_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Criado a partir do negócio (neg_criar_orcamento): a variável é
  --    consumida pelo primeiro INSERT (o orçamento principal de rpc_save_quote).
  v_var := NULLIF(current_setting('app.neg_criar_orcamento', true), '');
  IF v_var IS NOT NULL THEN
    PERFORM set_config('app.neg_criar_orcamento', '', true);
    NEW.negocio_id := v_var::uuid;
    RETURN NEW;
  END IF;

  -- 2. Proposta de origem (com sessão: negócio aberto e pessoas.edit; senão
  --    o orçamento cria-se sem negócio).
  IF NEW.proposal_id IS NOT NULL THEN
    SELECT o.negocio_id INTO v_cand FROM public.proposals o WHERE o.id = NEW.proposal_id;
    IF v_cand IS NOT NULL THEN
      v_neg := public.fn_neg_negocio_para_heranca(v_cand, NEW.organization_id, NEW.entity_id);
      IF v_neg.id IS NOT NULL AND public.fn_neg_heranca_permitida(v_neg, ARRAY['aberto']) THEN
        NEW.negocio_id := v_neg.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.fn_neg_herdar_proposta()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_var text;
BEGIN
  IF NEW.negocio_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- Só a criação a partir do negócio (neg_criar_proposta); a variável é consumida.
  v_var := NULLIF(current_setting('app.neg_criar_proposta', true), '');
  IF v_var IS NOT NULL THEN
    PERFORM set_config('app.neg_criar_proposta', '', true);
    NEW.negocio_id := v_var::uuid;
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. A proposta herda quando a ligação ao orçamento aparece
-- ============================================================
CREATE FUNCTION public.fn_neg_herdar_proposta_ligacao()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg_id uuid;
  v_org    uuid;
  v_ent    uuid;
  v_prop   uuid := NEW.proposal_id;
  v_neg    public.negocios;
BEGIN
  IF TG_TABLE_NAME = 'quotes' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RETURN NULL;
    END IF;
    v_neg_id := NEW.negocio_id;
    v_org := NEW.organization_id;
    v_ent := NEW.entity_id;
  ELSE
    IF NEW.status IS DISTINCT FROM 'active' THEN
      RETURN NULL;
    END IF;
    SELECT q.negocio_id, q.organization_id, q.entity_id INTO v_neg_id, v_org, v_ent
    FROM public.quotes q
    WHERE q.id = NEW.quote_id AND q.deleted_at IS NULL;
    -- Saída barata primeiro (caminho quente da Mudelar: nenhum orçamento tem
    -- negócio): só uma leitura por chave primária, SEM get_user_crm_org_ids.
    IF v_neg_id IS NULL OR v_prop IS NULL THEN
      RETURN NULL;
    END IF;
    -- A ligação tem de ser da organização do orçamento e, com sessão, de uma
    -- das organizações do utilizador.
    IF NEW.organization_id IS DISTINCT FROM v_org
       OR (auth.uid() IS NOT NULL
           AND (NEW.organization_id IN (SELECT public.get_user_crm_org_ids(auth.uid()))) IS NOT TRUE) THEN
      RETURN NULL;
    END IF;
  END IF;
  IF v_neg_id IS NULL OR v_prop IS NULL THEN
    RETURN NULL;
  END IF;

  -- Com sessão: só num negócio aberto e com pessoas.edit; senão a proposta
  -- fica por ligar.
  v_neg := public.fn_neg_negocio_para_heranca(v_neg_id, v_org, v_ent);
  IF v_neg.id IS NULL OR NOT public.fn_neg_heranca_permitida(v_neg, ARRAY['aberto']) THEN
    RETURN NULL;
  END IF;

  -- Nunca aborta quem chamou (o aceite do cliente no portal, em particular):
  -- um erro deixa a proposta por ligar e fica registado.
  BEGIN
    PERFORM set_config('app.neg_herdar_proposta', v_neg.id::text, true);
    UPDATE public.proposals p
    SET negocio_id = v_neg.id
    WHERE p.id = v_prop
      AND p.negocio_id IS NULL
      AND p.organization_id = v_neg.organization_id
      AND p.entity_id = v_neg.entity_id
      AND p.deleted_at IS NULL
      AND p.is_deleted IS NOT TRUE;
    PERFORM set_config('app.neg_herdar_proposta', '', true);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'proposal', v_prop, 'negocio', v_neg.id,
        'trigger:negocio_heranca', 'error', SQLERRM,
        jsonb_build_object('sqlstate', SQLSTATE, 'origem', TG_TABLE_NAME, 'origem_id', NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;
  PERFORM set_config('app.neg_herdar_proposta', '', true);

  RETURN NULL;
END;
$function$;

-- ============================================================
-- 3. Validação de negocio_id (D10)
-- ============================================================
CREATE FUNCTION public.fn_neg_validar_documento()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg     public.negocios;
  v_herdado boolean := false;
  v_subst   boolean := false;
  v_sessao  boolean := auth.uid() IS NOT NULL;
BEGIN
  -- Desligar (valor -> nulo): só por neg_desligar_registo, que põe
  -- app.neg_via_funcao; o negócio de antes tem de estar aberto e editável.
  IF NEW.negocio_id IS NULL THEN
    IF TG_OP <> 'UPDATE' THEN
      RETURN NEW;
    END IF;
    IF OLD.negocio_id IS NULL THEN
      RETURN NEW;
    END IF;
    IF COALESCE(current_setting('app.neg_via_funcao', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Um documento só se desliga do negócio pela acção da página Pessoas.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT n.* INTO v_neg FROM public.negocios n
    WHERE n.id = OLD.negocio_id AND n.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    IF v_neg.estado <> 'aberto' THEN
      RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_neg.estado
        USING ERRCODE = 'NG002';
    END IF;
    IF NOT public.fn_neg_pode_editar(v_neg) THEN
      RAISE EXCEPTION 'Sem permissão para desligar documentos deste negócio.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = NEW.negocio_id AND n.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                 WHERE c.organization_id = v_neg.organization_id) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_neg.organization_id
     OR NEW.entity_id IS DISTINCT FROM v_neg.entity_id THEN
    RAISE EXCEPTION 'O documento tem de ser da mesma organização e da mesma pessoa do negócio.'
      USING ERRCODE = 'NG004';
  END IF;
  IF TG_TABLE_NAME = 'client_contracts' AND v_neg.fecho <> 'contrato' THEN
    RAISE EXCEPTION 'Este negócio fecha na proposta (venda directa): não leva contratos.'
      USING ERRCODE = 'NG023';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Herança: o valor é o negocio_id do documento de origem.
    IF TG_TABLE_NAME = 'client_contracts' THEN
      v_subst := NEW.replaces_contract_id IS NOT NULL AND EXISTS (
                   SELECT 1 FROM public.client_contracts o
                   WHERE o.id = NEW.replaces_contract_id AND o.negocio_id = NEW.negocio_id);
      v_herdado := v_subst
                OR (NEW.proposal_id IS NOT NULL AND EXISTS (
                      SELECT 1 FROM public.proposals o
                      WHERE o.id = NEW.proposal_id AND o.negocio_id = NEW.negocio_id))
                OR (NEW.quote_id IS NOT NULL AND EXISTS (
                      SELECT 1 FROM public.quotes o
                      WHERE o.id = NEW.quote_id AND o.negocio_id = NEW.negocio_id));
    ELSIF TG_TABLE_NAME = 'quotes' THEN
      v_herdado := NEW.proposal_id IS NOT NULL AND EXISTS (
                     SELECT 1 FROM public.proposals o
                     WHERE o.id = NEW.proposal_id AND o.negocio_id = NEW.negocio_id);
    END IF;
    -- Sem sessão (portal, assinatura): a herança não exige mais nada.
    IF v_herdado AND NOT v_sessao THEN
      RETURN NEW;
    END IF;
    -- Com sessão, herdado ou não, e criação a partir do negócio: aberto (o
    -- substituto de um contrato também ganho) e pessoas.edit com âmbito.
    IF v_subst AND v_sessao AND v_neg.estado = 'ganho' THEN
      NULL;
    ELSIF v_neg.estado <> 'aberto' THEN
      RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_neg.estado
        USING ERRCODE = 'NG002';
    END IF;
    IF NOT public.fn_neg_pode_editar(v_neg) THEN
      RAISE EXCEPTION 'Sem permissão para criar documentos neste negócio.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE de negocio_id para um valor não nulo e diferente.
  IF TG_TABLE_NAME = 'proposals' AND OLD.negocio_id IS NULL
     AND COALESCE(current_setting('app.neg_herdar_proposta', true), '') = NEW.negocio_id::text THEN
    IF v_sessao AND NOT public.fn_neg_heranca_permitida(v_neg, ARRAY['aberto']) THEN
      RAISE EXCEPTION 'Sem permissão para ligar documentos a este negócio.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF COALESCE(current_setting('app.neg_via_funcao', true), '') = 'on' AND OLD.negocio_id IS NULL THEN
    IF v_neg.estado <> 'aberto' THEN
      RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_neg.estado
        USING ERRCODE = 'NG002';
    END IF;
    IF NOT public.fn_neg_pode_editar(v_neg) THEN
      RAISE EXCEPTION 'Sem permissão para ligar documentos a este negócio.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'O negócio de um documento só muda pelas acções da página Pessoas.'
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

-- ============================================================
-- Gatilhos (os nomes ordenam: 10 herança, 20 validação, 30 herança da proposta)
-- ============================================================
CREATE TRIGGER trg_negocios_10_herdar
  BEFORE INSERT ON public.client_contracts
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NULL
        AND (NEW.replaces_contract_id IS NOT NULL OR NEW.proposal_id IS NOT NULL
             OR NEW.quote_id IS NOT NULL
             OR COALESCE(current_setting('app.neg_criar_contrato', true), '') <> ''))
  EXECUTE FUNCTION public.fn_neg_herdar_contrato();

CREATE TRIGGER trg_negocios_10_herdar
  BEFORE INSERT ON public.quotes
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NULL
        AND (NEW.proposal_id IS NOT NULL
             OR COALESCE(current_setting('app.neg_criar_orcamento', true), '') <> ''))
  EXECUTE FUNCTION public.fn_neg_herdar_orcamento();

CREATE TRIGGER trg_negocios_10_herdar
  BEFORE INSERT ON public.proposals
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NULL
        AND COALESCE(current_setting('app.neg_criar_proposta', true), '') <> '')
  EXECUTE FUNCTION public.fn_neg_herdar_proposta();

CREATE TRIGGER trg_negocios_20_validar_ins
  BEFORE INSERT ON public.client_contracts
  FOR EACH ROW WHEN (NEW.negocio_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_neg_validar_documento();
CREATE TRIGGER trg_negocios_20_validar_upd
  BEFORE UPDATE OF negocio_id ON public.client_contracts
  FOR EACH ROW WHEN (NEW.negocio_id IS DISTINCT FROM OLD.negocio_id)
  EXECUTE FUNCTION public.fn_neg_validar_documento();

CREATE TRIGGER trg_negocios_20_validar_ins
  BEFORE INSERT ON public.quotes
  FOR EACH ROW WHEN (NEW.negocio_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_neg_validar_documento();
CREATE TRIGGER trg_negocios_20_validar_upd
  BEFORE UPDATE OF negocio_id ON public.quotes
  FOR EACH ROW WHEN (NEW.negocio_id IS DISTINCT FROM OLD.negocio_id)
  EXECUTE FUNCTION public.fn_neg_validar_documento();

CREATE TRIGGER trg_negocios_20_validar_ins
  BEFORE INSERT ON public.proposals
  FOR EACH ROW WHEN (NEW.negocio_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_neg_validar_documento();
CREATE TRIGGER trg_negocios_20_validar_upd
  BEFORE UPDATE OF negocio_id ON public.proposals
  FOR EACH ROW WHEN (NEW.negocio_id IS DISTINCT FROM OLD.negocio_id)
  EXECUTE FUNCTION public.fn_neg_validar_documento();

CREATE TRIGGER trg_negocios_30_herdar_proposta
  AFTER UPDATE OF proposal_id ON public.quotes
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NOT NULL AND NEW.proposal_id IS NOT NULL
        AND OLD.proposal_id IS DISTINCT FROM NEW.proposal_id)
  EXECUTE FUNCTION public.fn_neg_herdar_proposta_ligacao();

CREATE TRIGGER trg_negocios_31_herdar_proposta_ins
  AFTER INSERT ON public.quotes
  FOR EACH ROW
  WHEN (NEW.negocio_id IS NOT NULL AND NEW.proposal_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_neg_herdar_proposta_ligacao();

CREATE TRIGGER trg_negocios_30_herdar_proposta
  AFTER INSERT OR UPDATE OF proposal_id ON public.pipeline_links
  FOR EACH ROW
  WHEN (NEW.proposal_id IS NOT NULL AND NEW.quote_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_neg_herdar_proposta_ligacao();

-- ============================================================
-- 4. Funções de criação a partir do negócio
-- ============================================================
CREATE FUNCTION public.neg_criar_orcamento(
  p_negocio_id uuid,
  p_quote_data jsonb,
  p_lines jsonb,
  p_fees jsonb,
  p_totals jsonb,
  p_inline_quotes jsonb DEFAULT '[]'::jsonb,
  p_diagnostic_suggestions jsonb DEFAULT '[]'::jsonb)
  RETURNS public.quotes
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg public.negocios;
  v_q   public.quotes;
BEGIN
  IF p_quote_data IS NULL OR jsonb_typeof(p_quote_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados do orçamento.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF NULLIF(p_quote_data ->> 'organization_id', '')::uuid IS DISTINCT FROM v_neg.organization_id
     OR NULLIF(p_quote_data ->> 'entity_id', '')::uuid IS DISTINCT FROM v_neg.entity_id THEN
    RAISE EXCEPTION 'O orçamento tem de ser da mesma organização e da mesma pessoa do negócio.'
      USING ERRCODE = 'NG004';
  END IF;

  PERFORM set_config('app.neg_criar_orcamento', v_neg.id::text, true);
  v_q := public.rpc_save_quote(NULL::uuid, p_quote_data, p_lines, p_fees, p_totals,
                               p_inline_quotes, p_diagnostic_suggestions);
  PERFORM set_config('app.neg_criar_orcamento', '', true);

  IF v_q.negocio_id IS DISTINCT FROM v_neg.id THEN
    RAISE EXCEPTION 'O orçamento não ficou ligado ao negócio.' USING ERRCODE = 'NG004';
  END IF;
  RETURN v_q;
END;
$function$;

CREATE FUNCTION public.neg_criar_proposta(
  p_negocio_id uuid,
  p_proposal_data jsonb,
  p_selected_quote_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_inline_quotes jsonb DEFAULT '[]'::jsonb,
  p_proposal_items jsonb DEFAULT '[]'::jsonb,
  p_quote_entity_id uuid DEFAULT NULL::uuid)
  RETURNS public.proposals
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg public.negocios;
  v_p   public.proposals;
BEGIN
  IF p_proposal_data IS NULL OR jsonb_typeof(p_proposal_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados da proposta.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF NULLIF(p_proposal_data ->> 'organization_id', '')::uuid IS DISTINCT FROM v_neg.organization_id
     OR NULLIF(p_proposal_data ->> 'entity_id', '')::uuid IS DISTINCT FROM v_neg.entity_id THEN
    RAISE EXCEPTION 'A proposta tem de ser da mesma organização e da mesma pessoa do negócio.'
      USING ERRCODE = 'NG004';
  END IF;

  PERFORM set_config('app.neg_criar_proposta', v_neg.id::text, true);
  v_p := public.rpc_create_proposal(p_proposal_data, p_selected_quote_ids, p_inline_quotes,
                                    p_proposal_items, p_quote_entity_id);
  PERFORM set_config('app.neg_criar_proposta', '', true);

  IF v_p.negocio_id IS DISTINCT FROM v_neg.id THEN
    RAISE EXCEPTION 'A proposta não ficou ligada ao negócio.' USING ERRCODE = 'NG004';
  END IF;
  RETURN v_p;
END;
$function$;

CREATE FUNCTION public.neg_criar_contrato(
  p_negocio_id uuid,
  p_client_id uuid,
  p_entity_id uuid,
  p_organization_id uuid,
  p_root_organization_id uuid,
  p_proposal_id uuid,
  p_contract_template_id uuid,
  p_total_value numeric,
  p_currency text,
  p_start_date date,
  p_end_date date,
  p_notes text,
  p_payment_terms text,
  p_contract_body_html text,
  p_final_body_html text,
  p_prompt_values jsonb)
  RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_id     uuid;
  v_ligado uuid;
BEGIN
  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF v_neg.fecho <> 'contrato' THEN
    RAISE EXCEPTION 'Este negócio fecha na proposta (venda directa): não leva contratos.'
      USING ERRCODE = 'NG023';
  END IF;
  IF p_organization_id IS DISTINCT FROM v_neg.organization_id
     OR p_entity_id IS DISTINCT FROM v_neg.entity_id THEN
    RAISE EXCEPTION 'O contrato tem de ser da mesma organização e da mesma pessoa do negócio.'
      USING ERRCODE = 'NG004';
  END IF;

  PERFORM set_config('app.neg_criar_contrato', v_neg.id::text, true);
  v_id := public.rpc_create_client_contract(
    p_client_id, p_entity_id, p_organization_id, p_root_organization_id, p_proposal_id,
    p_contract_template_id, p_total_value, p_currency, p_start_date, p_end_date, p_notes,
    p_payment_terms, p_contract_body_html, p_final_body_html, p_prompt_values);
  PERFORM set_config('app.neg_criar_contrato', '', true);

  SELECT cc.negocio_id INTO v_ligado FROM public.client_contracts cc WHERE cc.id = v_id;
  IF FOUND AND v_ligado IS DISTINCT FROM v_neg.id THEN
    RAISE EXCEPTION 'O contrato não ficou ligado ao negócio.' USING ERRCODE = 'NG004';
  END IF;
  RETURN v_id;
END;
$function$;

-- ============================================================
-- 5. Desligar: a de 20/10, com app.neg_via_funcao nos documentos (a
--    validação recusa qualquer outro caminho para nulo). Os privilégios
--    mantêm-se (CREATE OR REPLACE).
-- ============================================================
CREATE OR REPLACE FUNCTION public.neg_desligar_registo(p_negocio_id uuid, p_tipo text, p_registo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg    public.negocios;
  v_existe boolean;
  v_atual  uuid;
  v_n      int;
BEGIN
  IF p_registo_id IS NULL OR p_tipo IS NULL
     OR p_tipo NOT IN ('contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo ou registo.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF p_tipo = 'levantamento' THEN
    RAISE EXCEPTION 'Este registo não se desliga.' USING ERRCODE = 'NG005';
  END IF;

  IF p_tipo = 'contacto' THEN
    SELECT true, i.negocio_id INTO v_existe, v_atual
    FROM public.entity_interactions i
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.entity_interactions i SET negocio_id = NULL
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id AND i.negocio_id = v_neg.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'visita' THEN
    SELECT true, s.negocio_id INTO v_existe, v_atual
    FROM public.schedule_items s
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.schedule_items s SET negocio_id = NULL
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.negocio_id = v_neg.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'orcamento' THEN
    SELECT true, q.negocio_id INTO v_existe, v_atual
    FROM public.quotes q
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.quotes q SET negocio_id = NULL
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.negocio_id = v_neg.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);

  ELSIF p_tipo = 'proposta' THEN
    SELECT true, pr.negocio_id INTO v_existe, v_atual
    FROM public.proposals pr
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.proposals pr SET negocio_id = NULL
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.negocio_id = v_neg.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);

  ELSE -- contrato
    SELECT true, cc.negocio_id INTO v_existe, v_atual
    FROM public.client_contracts cc
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NULL THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.client_contracts cc SET negocio_id = NULL
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.negocio_id = v_neg.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Registo indisponível para desligar.' USING ERRCODE = 'NG004';
  END IF;
  RETURN jsonb_build_object('mudou', true);
END;
$function$;

-- ============================================================
-- Privilégios
-- ============================================================
REVOKE ALL ON FUNCTION public.fn_neg_negocio_para_heranca(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_heranca_permitida(public.negocios, text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_herdar_contrato() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_herdar_orcamento() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_herdar_proposta() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_herdar_proposta_ligacao() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_validar_documento() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.neg_criar_orcamento(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_criar_orcamento(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.neg_criar_proposta(uuid, jsonb, uuid[], jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_criar_proposta(uuid, jsonb, uuid[], jsonb, jsonb, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.neg_criar_contrato(uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, date, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_criar_contrato(uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, date, text, text, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.neg_criar_orcamento(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) IS
  'Pessoas: cria um orçamento já ligado ao negócio (aberto), envolvendo rpc_save_quote (criação) sem a alterar. NG001, NG002, NG004, NG008, NG009. Se rpc_save_quote mudar de argumentos, esta função tem de acompanhar. 20261226150000.';
COMMENT ON FUNCTION public.neg_criar_proposta(uuid, jsonb, uuid[], jsonb, jsonb, uuid) IS
  'Pessoas: cria uma proposta já ligada ao negócio (aberto), envolvendo rpc_create_proposal sem a alterar. NG001, NG002, NG004, NG008, NG009. Se rpc_create_proposal mudar de argumentos, esta função tem de acompanhar. 20261226150000.';
COMMENT ON FUNCTION public.neg_criar_contrato(uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, date, date, text, text, text, text, jsonb) IS
  'Pessoas: cria um contrato já ligado ao negócio (aberto, com fecho no contrato), envolvendo rpc_create_client_contract sem a alterar. NG001, NG002, NG004, NG008, NG023. Se rpc_create_client_contract mudar de argumentos, esta função tem de acompanhar. 20261226150000.';
COMMENT ON FUNCTION public.fn_neg_validar_documento() IS
  'Pessoas, D10: valida negocio_id em quotes, proposals e client_contracts (INSERT e qualquer UPDATE que o mude): negócio vivo, organização com Pessoas, mesma organização e pessoa, contratos só com fecho no contrato. Com sessão, tudo (herdado ou não) exige negócio aberto (o substituto de um contrato também ganho) e pessoas.edit; sem sessão, só a herança passa. Desligar (para nulo) só por neg_desligar_registo, com o negócio aberto e pessoas.edit. Outros UPDATE recusados. 20261226150000.';

-- CONFERIR
DO $conferir$
DECLARE
  v_n   int;
  v_txt text;
BEGIN
  -- 1. Os gatilhos anteriores das quatro tabelas ficaram intactos.
  v_txt := (SELECT string_agg(e.tbl, ', ')
            FROM (VALUES
              ('public.quotes',           'a5cd46300974b20c76a594a77a99c6d8'),
              ('public.proposals',        '0aa2521eee9076b407dd804d5c00f80b'),
              ('public.client_contracts', 'de46dd654e0f939a4302d93c800db00b'),
              ('public.pipeline_links',   '30cc6a02395776690471a42110ce604e')
            ) AS e(tbl, h)
            WHERE (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                                         ORDER BY t.tgname::text))
                   FROM pg_catalog.pg_trigger t
                   WHERE t.tgrelid = e.tbl::regclass AND NOT t.tgisinternal
                     AND t.tgname::text NOT LIKE 'trg\_negocios\_%') IS DISTINCT FROM e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: os gatilhos anteriores mudaram em: %', v_txt;
  END IF;

  -- 2. Os novos: 12 gatilhos, activos, nas tabelas e funções esperadas.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal AND t.tgenabled::text = 'O'
    AND ((t.tgrelid = 'public.client_contracts'::regclass AND t.tgname::text = 'trg_negocios_10_herdar' AND p.proname::text = 'fn_neg_herdar_contrato')
      OR (t.tgrelid = 'public.quotes'::regclass AND t.tgname::text = 'trg_negocios_10_herdar' AND p.proname::text = 'fn_neg_herdar_orcamento')
      OR (t.tgrelid = 'public.proposals'::regclass AND t.tgname::text = 'trg_negocios_10_herdar' AND p.proname::text = 'fn_neg_herdar_proposta')
      OR (t.tgrelid IN ('public.client_contracts'::regclass, 'public.quotes'::regclass, 'public.proposals'::regclass)
          AND t.tgname::text IN ('trg_negocios_20_validar_ins', 'trg_negocios_20_validar_upd')
          AND p.proname::text = 'fn_neg_validar_documento')
      OR (t.tgrelid = 'public.quotes'::regclass AND t.tgname::text IN ('trg_negocios_30_herdar_proposta', 'trg_negocios_31_herdar_proposta_ins')
          AND p.proname::text = 'fn_neg_herdar_proposta_ligacao')
      OR (t.tgrelid = 'public.pipeline_links'::regclass AND t.tgname::text = 'trg_negocios_30_herdar_proposta'
          AND p.proname::text = 'fn_neg_herdar_proposta_ligacao'));
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'CONFERIR: % de 12 gatilhos novos activos e correctos', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgname::text LIKE 'trg\_negocios\_%'
    AND t.tgrelid IN ('public.client_contracts'::regclass, 'public.quotes'::regclass,
                      'public.proposals'::regclass, 'public.pipeline_links'::regclass);
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'CONFERIR: % gatilhos trg_negocios_* nas tabelas partilhadas (esperado 12)', v_n;
  END IF;
  -- Todos com WHEN (a Mudelar não chama as funções sem documento de origem).
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t
             WHERE NOT t.tgisinternal AND t.tgname::text LIKE 'trg\_negocios\_%'
               AND t.tgrelid IN ('public.client_contracts'::regclass, 'public.quotes'::regclass,
                                 'public.proposals'::regclass, 'public.pipeline_links'::regclass)
               AND t.tgqual IS NULL) THEN
    RAISE EXCEPTION 'CONFERIR: há gatilho novo sem WHEN';
  END IF;

  -- 3. Funções: forma e privilégios.
  SELECT string_agg(e.sig, ', ') INTO v_txt
  FROM (VALUES
    ('public.fn_neg_negocio_para_heranca(uuid,uuid,uuid)', true,  's'),
    ('public.fn_neg_heranca_permitida(public.negocios,text[])', false, 's'),
    ('public.fn_neg_herdar_contrato()',                   true,  'v'),
    ('public.fn_neg_herdar_orcamento()',                  true,  'v'),
    ('public.fn_neg_herdar_proposta()',                   true,  'v'),
    ('public.fn_neg_herdar_proposta_ligacao()',           true,  'v'),
    ('public.fn_neg_validar_documento()',                 true,  'v'),
    ('public.neg_criar_orcamento(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', false, 'v'),
    ('public.neg_criar_proposta(uuid,jsonb,uuid[],jsonb,jsonb,uuid)',        false, 'v'),
    ('public.neg_criar_contrato(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,date,date,text,text,text,text,jsonb)', false, 'v')
  ) AS e(sig, definer, vol)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(e.sig)
      AND p.prosecdef = e.definer AND p.provolatile::text = e.vol
      AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
      AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funções sem a forma esperada: %', v_txt;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('fn_neg_negocio_para_heranca', 'fn_neg_heranca_permitida', 'fn_neg_herdar_contrato',
                      'fn_neg_herdar_orcamento', 'fn_neg_herdar_proposta', 'fn_neg_herdar_proposta_ligacao',
                      'fn_neg_validar_documento')
    AND (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
         OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % função(ões) interna(s) com EXECUTE a mais', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('neg_criar_orcamento', 'neg_criar_proposta', 'neg_criar_contrato')
    AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee = 0);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: % de 3 funções de criação só com authenticated', v_n;
  END IF;

  -- 4. As RPC envolvidas não mudaram (as funções novas acompanham estas assinaturas).
  IF md5(pg_catalog.pg_get_functiondef('public.rpc_save_quote(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)) <> 'f3e45a0897c1d5f90b8505d7062e849d'
     OR md5(pg_catalog.pg_get_functiondef('public.rpc_create_proposal(jsonb,uuid[],jsonb,jsonb,uuid)'::regprocedure)) <> 'db37c441836f3bc2b39804ab9d2328b1'
     OR md5(pg_catalog.pg_get_functiondef('public.rpc_create_client_contract(uuid,uuid,uuid,uuid,uuid,uuid,numeric,text,date,date,text,text,text,text,jsonb)'::regprocedure)) <> '68779cfede89984e2ec04d9562c7373d' THEN
    RAISE EXCEPTION 'CONFERIR: uma RPC partilhada mudou';
  END IF;

  -- 4b. neg_desligar_registo recriada: mudou, INVOKER, mesmos privilégios
  --     (authenticated sim, anon não), e marca app.neg_via_funcao (conta-se no
  --     corpo sem comentários: três 'on').
  IF md5(pg_catalog.pg_get_functiondef('public.neg_desligar_registo(uuid,text,uuid)'::regprocedure)) = '4dc6cd33903c56da1a9526303b0c0439'
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                WHERE p.oid = 'public.neg_desligar_registo(uuid,text,uuid)'::regprocedure
                  AND (p.prosecdef
                       OR pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
                       OR NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')))
     OR (SELECT count(*) FROM regexp_matches(
           regexp_replace((SELECT p.prosrc FROM pg_catalog.pg_proc p
                           WHERE p.oid = 'public.neg_desligar_registo(uuid,text,uuid)'::regprocedure),
                          '--[^\n]*', '', 'g'),
           'set_config\(''app\.neg_via_funcao'', ''on''', 'g')) <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: neg_desligar_registo não ficou como esperado';
  END IF;

  -- 4c. Os três gatilhos de validação de UPDATE também correm para nulo.
  SELECT count(*) INTO v_n FROM pg_catalog.pg_trigger t
  WHERE NOT t.tgisinternal AND t.tgname::text = 'trg_negocios_20_validar_upd'
    AND t.tgrelid IN ('public.client_contracts'::regclass, 'public.quotes'::regclass, 'public.proposals'::regclass)
    AND pg_catalog.pg_get_triggerdef(t.oid) LIKE '%WHEN ((new.negocio_id IS DISTINCT FROM old.negocio_id))%';
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'CONFERIR: % de 3 gatilhos de validação de UPDATE com o WHEN esperado', v_n;
  END IF;

  -- 5. Nada ficou ligado nesta transacção, e fora da nike não há documentos com negócio.
  SELECT (SELECT count(*) FROM public.quotes q WHERE q.negocio_id IS NOT NULL
            AND q.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
       + (SELECT count(*) FROM public.proposals p WHERE p.negocio_id IS NOT NULL
            AND p.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
       + (SELECT count(*) FROM public.client_contracts c WHERE c.negocio_id IS NOT NULL
            AND c.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'::uuid)
    INTO v_n;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % documento(s) com negócio fora da nike', v_n;
  END IF;
END
$conferir$;

COMMIT;
