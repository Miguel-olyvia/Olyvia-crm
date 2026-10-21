-- ============================================================
-- 20261226140000_neg_fecho_funcoes  (Fase N, migration D)
-- ============================================================
-- Desenho: vault ficheiros/crm/negocios-fecho-por-tipo-desenho.md (v4),
--   secções 8, 9, 10, 12, 13, 14.2 e 16.1 (linha D).
--
-- O que faz (só funções; NÃO toca em documentos nem em tabelas partilhadas)
--   Internas (DEFINER salvo indicação; sem EXECUTE para ninguém):
--     fn_neg_pode_editar(negocios)          pessoas.edit com âmbito sobre o negócio
--                                            (a mesma regra da política negocios_update);
--                                            INVOKER, usada só dentro de funções DEFINER
--     fn_neg_contrato_hash(uuid)            md5 do conteúdo do contrato (10.4)
--     fn_neg_conteudo_hash(text, uuid)      proposta: compute_proposal_business_hash;
--                                            contrato: fn_neg_contrato_hash
--     fn_neg_prova_contrato(uuid)           P1, P2 ou P3 (secção 8), ou nulo
--     fn_neg_prova_proposta(uuid, uuid)     P1 (portal) ou utilizador, ou nulo
--     fn_neg_momento_assinatura(uuid, timestamptz)   10.3
--     fn_neg_houve_alteracoes(uuid, text, uuid)      10.4: compara com o hash do
--                                            evento da decisão; sem ele, com
--                                            decided_snapshot_hash; sem nenhum, «sem
--                                            alterações» (o lado seguro)
--     fn_neg_canal(uuid, text)              crm / portal / assinatura / sistema
--     fn_neg_mudar_estado(...)              escreve o estado pelo caminho das funções,
--                                            com a origem e o evento (variáveis locais)
--     fn_neg_anotar(...)                    evento acompanhamento ou alerta (e o alerta
--                                            em negocios)
--     fn_neg_converter_pessoa(uuid, text, uuid)  conversão em cliente: cópia
--                                            conservadora de fn_contract_signed_convert_to_client
--                                            (cliente da organização, ou de uma irmã da
--                                            mesma raiz, ou novo; fecha as leads abertas
--                                            da pessoa), sem sessão, idempotente, com o
--                                            bloqueio da pessoa
--     fn_neg_ganhar_interno(...)            ganho + conversão pela configuração (10.1);
--                                            se a conversão falhar, fica ganho com o
--                                            alerta conversao_falhou
--     fn_neg_tem_positivo_activo(negocios, uuid)
--                                            há outro documento positivo ativo (proposta
--                                            aceite; no fecho no contrato, também contrato
--                                            assinado): trava a perda por proposta recusada.
--                                            Outra proposta em rascunho ou enviada NÃO trava.
--     fn_neg_positivo_decisivo(negocios)    o positivo decisivo COM prova (14.2)
--     fn_neg_decidir_negocio(text, uuid, text, text, uuid, uuid)
--                                            as tabelas 9.1 e 9.2; chamada só pelos
--                                            gatilhos de decisão (migration F)
--   Públicas (EXECUTE só para authenticated):
--     neg_reavaliar_negocio(uuid)           «Fechar agora»: DEFINER; só reparação de
--                                            GANHOS (nunca de perdas), com o negócio aberto
--                                            e um positivo decisivo COM prova; nunca dá
--                                            ganho sem prova. Com a conversão automática
--                                            exige também leads.convert com âmbito sobre as
--                                            leads que a conversão fecha (como
--                                            neg_ganhar_negocio); sem ela dá o ganho, NÃO
--                                            converte, regista o acompanhamento «Conversão
--                                            em cliente por fazer» e devolve
--                                            conversao = 'por_fazer'
--     neg_reabrir_ganho(uuid, text)         «Reabrir negócio»: INVOKER; NG009 motivo,
--                                            negócio editável e ganho (NG001/NG002), NG008,
--                                            pessoas.reopen (42501); não mexe nos documentos
--                                            nem desfaz a conversão.
--                                            ATENÇÃO: pessoas.reopen protege só ESTE BOTÃO.
--                                            A reabertura automática por documento
--                                            (substituição de contrato, proposta recusada
--                                            depois de aceite, documento reaberto com
--                                            alterações) acontece em fn_neg_decidir_negocio
--                                            sem pessoas.reopen, por desenho: é o documento
--                                            que manda, e quem escreve no documento já
--                                            passou pelas regras dele.
--     neg_dispensar_alerta(uuid)            «Manter perdido» e afins: DEFINER; limpa o
--                                            alerta com pessoas.edit e deixa evento
--     neg_ganhar_negocio(uuid, uuid, jsonb) recriada: passa a RECUSAR negócios abertos
--                                            (NG002) e só converte (manual, ou conversão
--                                            que falhou); deixa de ler momento_ganho
--     neg_ligar_registo(uuid, text, uuid)   recriada: NG023 (contrato num negócio com
--                                            fecho na proposta), NG024 (só documentos
--                                            criados antes da activação de Pessoas), e
--                                            escreve os documentos pelo caminho
--                                            app.neg_via_funcao (exigido pela migration E)
--     neg_mudar_fecho(uuid, text, boolean)  recriada: depois de confirmar, chama
--                                            neg_reavaliar_negocio (ganho só com prova)
--
-- Limite da prova (secção 8): P1, P2, P3 e os hashes de conteúdo lêem colunas
--   simples dos documentos (signature_image, signed_by_name, partes assinadas,
--   company_signature_date, ...), que quem pode escrever nessas tabelas pode
--   preencher à mão. A prova protege contra ENGANO (um ganho por um clique
--   errado), NÃO contra FRAUDE de quem já tem escrita nos documentos.
--
-- Tabelas escritas: só negocios e negocio_eventos (e, na conversão, as mesmas
--   que fn_contract_signed_convert_to_client já escreve: anew_clients,
--   anew_leads, workflow_execution_log), e só a partir de um negócio com linha
--   de configuração. Nenhum gatilho é criado aqui.
-- Autorização: normal (desenho, 16.1).
-- Impacto na Mudelar: nenhum. Nenhuma função nova age sem negócio e sem linha
--   de configuração (a Mudelar tem 0 e 0). As recriadas são só de Pessoas.
--   neg_ganhar_negocio e neg_ligar_registo mantêm os privilégios que tinham.
--
-- O que o ecrã tem de fazer junto (secção 14.2)
--   - «Dar como ganho» sai em todo o lado (diálogo, podeGanhar.ts, tipos,
--     traduções, passos, selo «pronto a ganhar»).
--   - «Fechar agora» chama neg_reavaliar_negocio; com mudou:false explicar
--     que não há positivo com prova; com conversao:'por_fazer' dizer que a
--     conversão ficou por fazer e oferecer «Converter em cliente».
--   - «Converter em cliente» chama neg_ganhar_negocio (só em negócios ganhos).
--   - «Reabrir negócio» chama neg_reabrir_ganho; escondido a quem não tem
--     pessoas.reopen (sem a migration C, ninguém a tem).
--   - No alerta: «Manter perdido» = neg_dispensar_alerta; «Anular perda e dar
--     como ganho» = neg_anular_perda seguido de neg_reavaliar_negocio.
--   - «Ligar registos» só no modo de migração; traduzir NG023 e NG024.
--   - neg_mudar_fecho devolve também «reavaliacao» depois de confirmar.
--
-- ATENÇÃO, ordem de aplicação (migration e código entram juntos): no instante deste
--   push, neg_ganhar_negocio passa a recusar negócios abertos (NG002). O botão
--   antigo «Dar como ganho» (src/hooks/pessoas/useMutacoesNegocio.ts, `ganhar`)
--   continua a chamá-la com a bandeira do fecho DESLIGADA e passa a falhar com NG002;
--   os ganhos automáticos só chegam com a migration F. Entre D e F ninguém dá um
--   negócio como ganho na nike. Por isso D, E e F empurram-se NA MESMA JANELA e a
--   bandeira FECHO_V4_ATIVO liga-se (e o código é publicado) logo a seguir. Não se
--   empurra D sozinha, nem se deixa a bandeira desligada depois de D.
--
-- Pré-condição: md5 lido no remoto a 20/10 das funções recriadas e das de
--   que estas dependem; A e B aplicadas (md5 do corpo das funções que criaram);
--   nenhuma das funções novas existe.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226140000_neg_fecho_funcoes.sql), só depois de reverter
--   E e F (que dependem destas funções).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição
DO $pre$
DECLARE
  v_txt text;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.neg_ganhar_negocio(uuid,uuid,jsonb)',                 'b805cc894294a797bca3f466893af5b6'),
              ('public.neg_ligar_registo(uuid,text,uuid)',                   '5ed5cf7c02dffd6d4943a98b7b10d0e8'),
              ('public.neg_anular_perda(uuid,text)',                         '9b39e2fdca993931af1210b1a587f027'),
              ('public.fn_neg_negocio_editavel(uuid,text[])',                '05b8dd6fd7e952c1d02dadff8e529f25'),
              ('public.fn_neg_exigir_config(uuid)',                          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_tem_permissao_org(uuid,text)',                 '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_escolher_lead(uuid,uuid,uuid,text)',           'c90baaf27ba54677161e4bc94c1b5895'),
              ('public.fn_neg_lead_aberta(text)',                            'cb988326544ed75840624bfb78e55b7f'),
              ('public.rpc_convert_lead_to_client(uuid,jsonb,uuid,uuid,uuid)', 'c03719b805fbdcda023efb53e7f2c8e8'),
              ('public.fn_resolve_client_marketing_origin(uuid,uuid)',       'e5974c3ba1d14b849b46882de1da5d74'),
              ('public.fn_contract_signed_convert_to_client()',              '1bdad2e0c91aec1f7be3c6d1bfe1ace7'),
              ('public.compute_proposal_business_hash(uuid)',                'fcd04abea1b4ce5fe6f3b6f0d71080f5'),
              ('public.fn_negocios_actor()',                                 '26296535afef27c393ab0c932995e3cb'),
              ('public.current_business_user_id()',                          '7e60101f074e4ff526559140be6618bb'),
              ('public.crm_scope_keys(text)',                                '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',                      '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',                          '29782031244dd3b0842ca43b271e2bf1')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 20/10: %; nada feito.', v_txt;
  END IF;

  -- A e B aplicadas, tal como foram escritas (md5 do corpo sem CR).
  v_txt := (SELECT string_agg(e.sig, ', ')
            FROM (VALUES
              ('public.neg_mudar_fecho(uuid,text,boolean)',      'e2350e9fa8b55ec93722bac91ebf0502'),
              ('public.fn_negocios_guardar_alteracao()',         'c3b810cf5223a5660c49236d4d914cd6'),
              ('public.fn_negocios_registar_evento()',           '9421de540e5ee74ef4dd833cabe64cf7')
            ) AS e(sig, h)
            WHERE pg_catalog.to_regprocedure(e.sig) IS NULL
               OR (SELECT md5(replace(p.prosrc, chr(13), '')) FROM pg_catalog.pg_proc p
                   WHERE p.oid = pg_catalog.to_regprocedure(e.sig)) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as migrations A e B não estão aplicadas como escritas: %; nada feito.', v_txt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                 WHERE a.attrelid = 'public.negocio_workflow_config'::regclass
                   AND a.attname::text = 'reflexao_dias' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: falta a configuração do fecho (migration B); nada feito.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.pronamespace = 'public'::regnamespace
               AND p.proname IN ('fn_neg_pode_editar', 'fn_neg_contrato_hash', 'fn_neg_conteudo_hash',
                                 'fn_neg_prova_contrato', 'fn_neg_prova_proposta', 'fn_neg_momento_assinatura',
                                 'fn_neg_houve_alteracoes', 'fn_neg_canal', 'fn_neg_mudar_estado',
                                 'fn_neg_anotar', 'fn_neg_converter_pessoa', 'fn_neg_ganhar_interno',
                                 'fn_neg_tem_positivo_activo', 'fn_neg_positivo_decisivo',
                                 'fn_neg_decidir_negocio', 'neg_reavaliar_negocio', 'neg_reabrir_ganho',
                                 'neg_dispensar_alerta')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: alguma das funções novas já existe; nada feito.';
  END IF;

  -- Colunas que as funções lêem nos documentos.
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attnum > 0 AND NOT a.attisdropped
        AND ((a.attrelid = 'public.client_contracts'::regclass AND a.attname::text IN (
               'negocio_id', 'status', 'deleted_at', 'replaced_by_contract_id', 'signature_date',
               'signed_by_name', 'signature_image', 'company_signature_date', 'company_signed_by_id',
               'accepted_at', 'contract_body_html', 'total_value', 'payment_terms', 'start_date',
               'end_date', 'prompt_values', 'contract_template_id', 'template_id', 'currency',
               'cancellation_reason', 'created_at'))
          OR (a.attrelid = 'public.proposals'::regclass AND a.attname::text IN (
               'negocio_id', 'status', 'deleted_at', 'is_deleted', 'signature_image', 'accepted_at',
               'decided_snapshot_hash', 'rejection_reason', 'rejection_notes', 'created_at'))
          OR (a.attrelid = 'public.client_contract_parties'::regclass AND a.attname::text IN (
               'contract_id', 'is_signatory', 'status', 'signed_at')))) <> 35 THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: as colunas lidas nos documentos não são as de 20/10; nada feito.';
  END IF;
END
$pre$;

-- ============================================================
-- Auxiliares de leitura
-- ============================================================

CREATE FUNCTION public.fn_neg_pode_editar(p_neg public.negocios)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND p_neg.id IS NOT NULL
     AND p_neg.organization_id IN (SELECT public.get_user_crm_org_ids(auth.uid()))
     AND public.has_anew_permission(auth.uid(), 'pessoas.edit')
     AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                 WHERE k.scope_key = p_neg.organization_id::text || ':*'
                    OR k.scope_key = p_neg.organization_id::text || ':' || p_neg.assigned_to::text
                    OR k.scope_key = p_neg.organization_id::text || ':' || p_neg.created_by::text);
$function$;

CREATE FUNCTION public.fn_neg_contrato_hash(p_contract_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
  SELECT md5(jsonb_build_object(
           'contract_body_html', cc.contract_body_html,
           'total_value', cc.total_value,
           'payment_terms', cc.payment_terms,
           'start_date', cc.start_date,
           'end_date', cc.end_date,
           'prompt_values', cc.prompt_values,
           'contract_template_id', cc.contract_template_id,
           'template_id', cc.template_id,
           'currency', cc.currency)::text)
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id;
$function$;

CREATE FUNCTION public.fn_neg_conteudo_hash(p_tipo text, p_id uuid)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
  SELECT CASE p_tipo
           WHEN 'proposta' THEN public.compute_proposal_business_hash(p_id)
           WHEN 'contrato' THEN public.fn_neg_contrato_hash(p_id)
         END;
$function$;

CREATE FUNCTION public.fn_neg_prova_contrato(p_contract_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_cc public.client_contracts;
BEGIN
  SELECT cc.* INTO v_cc FROM public.client_contracts cc WHERE cc.id = p_contract_id;
  IF NOT FOUND OR v_cc.status IS NULL OR v_cc.status NOT IN ('signed', 'assinado', 'active') THEN
    RETURN NULL;
  END IF;
  -- P1: assinatura do cliente no portal.
  IF v_cc.signature_date IS NOT NULL
     AND NULLIF(btrim(v_cc.signed_by_name), '') IS NOT NULL
     AND NULLIF(btrim(v_cc.signature_image), '') IS NOT NULL THEN
    RETURN 'P1';
  END IF;
  -- P2: todas as partes signatárias assinaram (validate-contract-signature).
  IF EXISTS (SELECT 1 FROM public.client_contract_parties pp
             WHERE pp.contract_id = v_cc.id AND pp.is_signatory = true)
     AND NOT EXISTS (SELECT 1 FROM public.client_contract_parties pp
                     WHERE pp.contract_id = v_cc.id AND pp.is_signatory = true
                       AND (pp.status IS DISTINCT FROM 'signed' OR pp.signed_at IS NULL)) THEN
    RETURN 'P2';
  END IF;
  -- P3: «Marcar como Assinado» (assinatura da empresa).
  IF v_cc.company_signature_date IS NOT NULL AND v_cc.company_signed_by_id IS NOT NULL THEN
    RETURN 'P3';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.fn_neg_prova_proposta(p_proposal_id uuid, p_actor uuid)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_status text;
  v_assin  text;
  v_aceite timestamptz;
BEGIN
  SELECT pr.status, pr.signature_image, pr.accepted_at
    INTO v_status, v_assin, v_aceite
  FROM public.proposals pr WHERE pr.id = p_proposal_id;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'accepted' THEN
    RETURN NULL;
  END IF;
  IF NULLIF(btrim(v_assin), '') IS NOT NULL AND v_aceite IS NOT NULL THEN
    RETURN 'P1';
  END IF;
  IF p_actor IS NOT NULL THEN
    RETURN 'utilizador';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE FUNCTION public.fn_neg_momento_assinatura(p_contract_id uuid, p_ganho_em timestamptz)
  RETURNS timestamptz
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(
    cc.signature_date,
    (SELECT max(pp.signed_at) FROM public.client_contract_parties pp
     WHERE pp.contract_id = cc.id AND pp.is_signatory = true AND pp.status = 'signed'),
    cc.company_signature_date,
    cc.accepted_at,
    p_ganho_em)
  FROM public.client_contracts cc
  WHERE cc.id = p_contract_id;
$function$;

CREATE FUNCTION public.fn_neg_houve_alteracoes(p_negocio_id uuid, p_tipo text, p_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_antes text;
  v_agora text;
BEGIN
  SELECT e.conteudo_hash INTO v_antes
  FROM public.negocio_eventos e
  WHERE e.negocio_id = p_negocio_id AND e.origem_id = p_id AND e.conteudo_hash IS NOT NULL
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 1;

  IF v_antes IS NULL AND p_tipo = 'proposta' THEN
    SELECT pr.decided_snapshot_hash INTO v_antes FROM public.proposals pr WHERE pr.id = p_id;
  END IF;

  -- Sem retrato da decisão: conta como sem alterações (o lado seguro).
  IF v_antes IS NULL THEN
    RETURN false;
  END IF;

  v_agora := public.fn_neg_conteudo_hash(p_tipo, p_id);
  RETURN v_agora IS NOT NULL AND v_agora <> v_antes;
END;
$function$;

CREATE FUNCTION public.fn_neg_canal(p_actor uuid, p_prova text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SET search_path = public, pg_temp
AS $function$
  SELECT CASE
           WHEN p_actor IS NOT NULL THEN 'crm'
           WHEN p_prova = 'P1' THEN 'portal'
           WHEN p_prova = 'P2' THEN 'assinatura'
           WHEN current_setting('app.audit_source', true) = 'portal' THEN 'portal'
           WHEN current_setting('app.audit_source', true) = 'signature' THEN 'assinatura'
           ELSE 'sistema'
         END;
$function$;

-- ============================================================
-- Auxiliares de escrita (só negocios e negocio_eventos)
-- ============================================================

CREATE FUNCTION public.fn_neg_mudar_estado(
  p_negocio_id uuid,
  p_estado text,
  p_fase text,
  p_motivo text,
  p_motivo_reabertura text,
  p_origem_tipo text,
  p_origem_id uuid,
  p_origem_estado text,
  p_canal text,
  p_prova text,
  p_hash text,
  p_detalhe text)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM set_config('app.neg_origem_tipo', COALESCE(p_origem_tipo, ''), true);
  PERFORM set_config('app.neg_origem_id', COALESCE(p_origem_id::text, ''), true);
  PERFORM set_config('app.neg_ev_origem_estado', COALESCE(left(p_origem_estado, 60), ''), true);
  PERFORM set_config('app.neg_ev_canal', COALESCE(p_canal, ''), true);
  PERFORM set_config('app.neg_ev_prova', COALESCE(p_prova, ''), true);
  PERFORM set_config('app.neg_ev_hash', COALESCE(p_hash, ''), true);
  PERFORM set_config('app.neg_ev_detalhe', COALESCE(left(p_detalhe, 1000), ''), true);
  IF p_motivo_reabertura IS NOT NULL THEN
    PERFORM set_config('app.negocio_motivo_reabertura', left(p_motivo_reabertura, 1000), true);
  END IF;

  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n
  SET estado = p_estado,
      fase_perda = CASE WHEN p_estado = 'perdido' THEN p_fase END,
      motivo_perda = CASE WHEN p_estado = 'perdido' THEN left(p_motivo, 1000) END
  WHERE n.id = p_negocio_id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);

  PERFORM set_config('app.neg_origem_tipo', '', true);
  PERFORM set_config('app.neg_origem_id', '', true);
  PERFORM set_config('app.neg_ev_origem_estado', '', true);
  PERFORM set_config('app.neg_ev_canal', '', true);
  PERFORM set_config('app.neg_ev_prova', '', true);
  PERFORM set_config('app.neg_ev_hash', '', true);
  PERFORM set_config('app.neg_ev_detalhe', '', true);
  PERFORM set_config('app.negocio_motivo_reabertura', '', true);
END;
$function$;

CREATE FUNCTION public.fn_neg_anotar(
  p_negocio_id uuid,
  p_tipo text,
  p_alerta text,
  p_detalhe text,
  p_origem_tipo text,
  p_origem_id uuid,
  p_origem_estado text,
  p_canal text,
  p_prova text,
  p_hash text)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_tipo NOT IN ('acompanhamento', 'alerta') THEN
    RAISE EXCEPTION 'fn_neg_anotar: tipo inválido.' USING ERRCODE = 'NG009';
  END IF;

  INSERT INTO public.negocio_eventos
    (negocio_id, organization_id, root_organization_id, tipo, created_by, detalhe,
     origem_tipo, origem_id, origem_estado, canal, prova, conteudo_hash)
  SELECT n.id, n.organization_id, n.root_organization_id, p_tipo, public.fn_negocios_actor(),
         left(p_detalhe, 1000),
         CASE WHEN p_origem_id IS NOT NULL THEN p_origem_tipo END, p_origem_id,
         CASE WHEN p_origem_id IS NOT NULL THEN left(p_origem_estado, 60) END,
         p_canal,
         CASE WHEN p_origem_id IS NOT NULL THEN p_prova END,
         CASE WHEN p_origem_id IS NOT NULL THEN p_hash END
  FROM public.negocios n
  WHERE n.id = p_negocio_id;

  IF p_alerta IS NOT NULL THEN
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.negocios n SET alerta_codigo = p_alerta
    WHERE n.id = p_negocio_id AND n.alerta_codigo IS DISTINCT FROM p_alerta;
    PERFORM set_config('app.neg_via_funcao', 'off', true);
  END IF;
END;
$function$;

-- Conversão em cliente (cópia conservadora do gatilho de contratos).
CREATE FUNCTION public.fn_neg_converter_pessoa(p_negocio_id uuid, p_doc_tipo text, p_doc_id uuid)
  RETURNS uuid
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg                public.negocios;
  v_root_org_id        uuid;
  v_client_id          uuid;
  v_client_status      text;
  v_actor              uuid;
  v_origin_source      text;
  v_origin_source_id   uuid;
  v_origin_campaign_id uuid;
  v_leads_closed       integer := 0;
  v_doc_criador        uuid;
BEGIN
  SELECT n.* INTO v_neg FROM public.negocios n WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  -- Uma conversão de cada vez por pessoa (o mesmo bloqueio de neg_ganhar_negocio).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || v_neg.organization_id::text || ':' || v_neg.entity_id::text, 0));

  v_root_org_id := COALESCE(v_neg.root_organization_id, v_neg.organization_id);

  SELECT o.origin_source, o.origin_source_id, o.origin_campaign_id
    INTO v_origin_source, v_origin_source_id, v_origin_campaign_id
  FROM public.fn_resolve_client_marketing_origin(v_neg.entity_id, v_neg.organization_id) AS o
  LIMIT 1;

  SELECT c.id, c.status INTO v_client_id, v_client_status
  FROM public.anew_clients c
  WHERE c.entity_id = v_neg.entity_id AND c.organization_id = v_neg.organization_id
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    IF v_client_status IS DISTINCT FROM 'active' THEN
      UPDATE public.anew_clients SET status = 'active' WHERE id = v_client_id;
    END IF;
    UPDATE public.anew_clients
    SET origin_source = COALESCE(origin_source, v_origin_source),
        origin_source_id = COALESCE(origin_source_id, v_origin_source_id),
        origin_campaign_id = COALESCE(origin_campaign_id, v_origin_campaign_id)
    WHERE id = v_client_id
      AND (origin_source IS NULL OR origin_source_id IS NULL OR origin_campaign_id IS NULL);
  ELSE
    -- Cliente de uma organização irmã da mesma raiz: reutiliza, não muda de sítio.
    SELECT c.id INTO v_client_id
    FROM public.anew_clients c
    WHERE c.entity_id = v_neg.entity_id AND c.root_organization_id = v_root_org_id
    ORDER BY c.created_at ASC
    LIMIT 1;

    IF v_client_id IS NULL THEN
      IF p_doc_tipo = 'contrato' THEN
        SELECT cc.created_by INTO v_doc_criador FROM public.client_contracts cc WHERE cc.id = p_doc_id;
      ELSIF p_doc_tipo = 'proposta' THEN
        SELECT pr.created_by INTO v_doc_criador FROM public.proposals pr WHERE pr.id = p_doc_id;
      END IF;
      v_actor := NULL;
      BEGIN
        v_actor := NULLIF(current_setting('app.audit_user_id', true), '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_actor := NULL;
      END;
      v_actor := COALESCE(v_actor, public.current_business_user_id(), v_doc_criador, v_neg.created_by);
      IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.id = v_actor) THEN
        v_actor := NULL;
      END IF;

      INSERT INTO public.anew_clients (
        entity_id, organization_id, root_organization_id,
        status, source_type, source_id, created_by,
        origin_source, origin_source_id, origin_campaign_id
      ) VALUES (
        v_neg.entity_id, v_neg.organization_id, v_root_org_id,
        'active', CASE WHEN p_doc_tipo = 'contrato' THEN 'contract' ELSE 'direct_sale' END,
        p_doc_id, v_actor,
        v_origin_source, v_origin_source_id, v_origin_campaign_id
      )
      RETURNING id INTO v_client_id;
    END IF;
  END IF;

  -- Fechar as leads abertas da pessoa nesta organização (nunca as perdidas
  -- nem as apagadas; só preenche o que estiver vazio).
  v_actor := NULL;
  BEGIN
    v_actor := NULLIF(current_setting('app.audit_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  v_actor := COALESCE(v_actor, public.current_business_user_id());
  IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.id = v_actor) THEN
    v_actor := NULL;
  END IF;

  UPDATE public.anew_leads AS l
  SET status = 'converted',
      converted_to_client_id = COALESCE(l.converted_to_client_id, v_client_id),
      converted_at = COALESCE(l.converted_at, now()),
      converted_by = COALESCE(l.converted_by, v_actor),
      updated_at = now()
  WHERE l.entity_id = v_neg.entity_id
    AND l.organization_id = v_neg.organization_id
    AND l.deleted_at IS NULL
    AND lower(COALESCE(l.status::text, '')) <> 'lost'
    AND (lower(COALESCE(l.status::text, '')) IS DISTINCT FROM 'converted'
         OR l.converted_to_client_id IS NULL
         OR l.converted_at IS NULL);
  GET DIAGNOSTICS v_leads_closed = ROW_COUNT;

  INSERT INTO public.workflow_execution_log (
    source_entity, source_record_id, target_entity, target_record_id,
    action_type, status, execution_data
  ) VALUES (
    'negocio', v_neg.id, 'client', v_client_id,
    'trigger:negocio_conversao', 'success',
    jsonb_build_object('leads_closed', v_leads_closed, 'documento', p_doc_tipo, 'documento_id', p_doc_id)
  );

  RETURN v_client_id;
END;
$function$;

CREATE FUNCTION public.fn_neg_ganhar_interno(
  p_negocio_id uuid,
  p_origem_tipo text,
  p_origem_id uuid,
  p_origem_estado text,
  p_canal text,
  p_prova text,
  p_hash text,
  p_detalhe text)
  RETURNS text
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org      uuid;
  v_conv     text;
  v_sqlstate text;
  v_sqlerrm  text;
BEGIN
  SELECT n.organization_id INTO v_org FROM public.negocios n WHERE n.id = p_negocio_id;
  SELECT c.conversao_ao_ganhar INTO v_conv
  FROM public.negocio_workflow_config c WHERE c.organization_id = v_org;

  PERFORM public.fn_neg_mudar_estado(p_negocio_id, 'ganho', NULL, NULL, NULL,
    p_origem_tipo, p_origem_id, p_origem_estado, p_canal, p_prova, p_hash, p_detalhe);

  IF v_conv IS DISTINCT FROM 'automatica' THEN
    RETURN COALESCE(v_conv, 'nao_alterar');
  END IF;

  BEGIN
    PERFORM public.fn_neg_converter_pessoa(p_negocio_id, p_origem_tipo, p_origem_id);
    RETURN 'feita';
  EXCEPTION WHEN OTHERS THEN
    -- O negócio fica ganho na mesma; a ficha oferece «Converter em cliente».
    -- O evento (visível a quem lê o histórico) leva só o SQLSTATE e um texto fixo: a mensagem do Postgres pode trazer nomes de
    -- constraints, colunas ou valores. O detalhe técnico fica em workflow_execution_log.
    v_sqlstate := SQLSTATE;
    v_sqlerrm := SQLERRM;
    BEGIN
      INSERT INTO public.workflow_execution_log (
        source_entity, source_record_id, target_entity, target_record_id,
        action_type, status, error_message, execution_data
      ) VALUES (
        'negocio', p_negocio_id, 'negocio', p_negocio_id,
        'trigger:negocio_conversao', 'error', v_sqlerrm,
        jsonb_build_object('sqlstate', v_sqlstate, 'documento', p_origem_tipo, 'documento_id', p_origem_id)
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM public.fn_neg_anotar(p_negocio_id, 'alerta', 'conversao_falhou',
      'A conversão em cliente falhou (código ' || v_sqlstate || '). Use «Converter em cliente» para repetir.',
      p_origem_tipo, p_origem_id, p_origem_estado, p_canal, NULL, NULL);
    RETURN 'falhou';
  END;
END;
$function$;

CREATE FUNCTION public.fn_neg_tem_positivo_activo(p_neg public.negocios, p_excluir uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.proposals pr
                 WHERE pr.negocio_id = p_neg.id AND pr.id IS DISTINCT FROM p_excluir
                   AND pr.status = 'accepted'
                   AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
      OR (p_neg.fecho = 'contrato'
          AND EXISTS (SELECT 1 FROM public.client_contracts cc
                      WHERE cc.negocio_id = p_neg.id AND cc.id IS DISTINCT FROM p_excluir
                        AND cc.status IN ('signed', 'assinado', 'active')
                        AND cc.deleted_at IS NULL AND cc.replaced_by_contract_id IS NULL));
$function$;

-- O positivo decisivo COM prova (para «Fechar agora» e a mudança de fecho).
CREATE FUNCTION public.fn_neg_positivo_decisivo(p_neg public.negocios)
  RETURNS TABLE(tipo text, id uuid, estado text, prova text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_neg.fecho = 'proposta' THEN
    RETURN QUERY
    SELECT 'proposta'::text, pr.id, pr.status,
           COALESCE(public.fn_neg_prova_proposta(pr.id, NULL),
                    (SELECT e.prova FROM public.negocio_eventos e
                     WHERE e.negocio_id = p_neg.id AND e.origem_id = pr.id
                       AND e.origem_estado = 'accepted' AND e.prova IS NOT NULL
                     ORDER BY e.created_at DESC, e.id DESC LIMIT 1))
    FROM public.proposals pr
    WHERE pr.negocio_id = p_neg.id AND pr.status = 'accepted'
      AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
      AND COALESCE(public.fn_neg_prova_proposta(pr.id, NULL),
                   (SELECT e.prova FROM public.negocio_eventos e
                    WHERE e.negocio_id = p_neg.id AND e.origem_id = pr.id
                      AND e.origem_estado = 'accepted' AND e.prova IS NOT NULL
                    ORDER BY e.created_at DESC, e.id DESC LIMIT 1)) IS NOT NULL
    ORDER BY pr.accepted_at DESC NULLS LAST, pr.id
    LIMIT 1;
  ELSE
    RETURN QUERY
    SELECT 'contrato'::text, cc.id, cc.status, public.fn_neg_prova_contrato(cc.id)
    FROM public.client_contracts cc
    WHERE cc.negocio_id = p_neg.id AND cc.status IN ('signed', 'assinado', 'active')
      AND cc.deleted_at IS NULL AND cc.replaced_by_contract_id IS NULL
      AND public.fn_neg_prova_contrato(cc.id) IS NOT NULL
    ORDER BY public.fn_neg_momento_assinatura(cc.id, NULL) DESC NULLS LAST, cc.id
    LIMIT 1;
  END IF;
END;
$function$;

-- ============================================================
-- Decisão (tabelas 9.1 e 9.2). Chamada só pelos gatilhos adiados (F).
-- ============================================================
CREATE FUNCTION public.fn_neg_decidir_negocio(
  p_tipo text,
  p_doc_id uuid,
  p_status_antes text,
  p_status_depois text,
  p_negocio_antes uuid,
  p_negocio_depois uuid)
  RETURNS void
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  c_pos_pr  CONSTANT text[] := ARRAY['accepted'];
  c_neg_pr  CONSTANT text[] := ARRAY['rejected'];
  c_pos_cc  CONSTANT text[] := ARRAY['signed', 'assinado', 'active'];
  c_neg_cc  CONSTANT text[] := ARRAY['cancelled', 'cancelado', 'rejected', 'recusado'];
  v_actor     uuid := public.fn_negocios_actor();
  v_neg       public.negocios;
  v_cfg       public.negocio_workflow_config;
  v_org       uuid;
  v_entity    uuid;
  v_status    text;
  v_neg_doc   uuid;
  v_apagado   boolean;
  v_subst     boolean := false;
  v_motivo_cl text;
  v_cls_antes text;
  v_cls_dep   text;
  v_ligacao   boolean := p_negocio_antes IS DISTINCT FROM p_negocio_depois;
  v_decisivo  boolean;
  v_origem    boolean;
  v_classe    text;
  v_prova     text;
  v_hash      text;
  v_canal     text;
  v_nome      text := CASE WHEN p_tipo = 'proposta' THEN 'Proposta' ELSE 'Contrato' END;
  v_momento   timestamptz;
BEGIN
  IF p_tipo NOT IN ('proposta', 'contrato') OR p_doc_id IS NULL OR p_negocio_depois IS NULL THEN
    RETURN;
  END IF;

  -- 1. Reler o documento. Idempotente: só age se o documento ainda está no
  --    estado e no negócio deste evento (um evento posterior trata o resto).
  IF p_tipo = 'proposta' THEN
    SELECT pr.organization_id, pr.entity_id, pr.status, pr.negocio_id,
           (pr.deleted_at IS NOT NULL OR pr.is_deleted IS TRUE),
           COALESCE(NULLIF(btrim(pr.rejection_notes), ''), NULLIF(btrim(pr.rejection_reason), ''))
      INTO v_org, v_entity, v_status, v_neg_doc, v_apagado, v_motivo_cl
    FROM public.proposals pr WHERE pr.id = p_doc_id;
  ELSE
    SELECT cc.organization_id, cc.entity_id, cc.status, cc.negocio_id,
           (cc.deleted_at IS NOT NULL), (cc.replaced_by_contract_id IS NOT NULL),
           NULLIF(btrim(cc.cancellation_reason), '')
      INTO v_org, v_entity, v_status, v_neg_doc, v_apagado, v_subst, v_motivo_cl
    FROM public.client_contracts cc WHERE cc.id = p_doc_id;
  END IF;
  IF NOT FOUND OR v_neg_doc IS DISTINCT FROM p_negocio_depois
     OR v_status IS DISTINCT FROM p_status_depois THEN
    RETURN;
  END IF;

  -- 2. Sai sem fazer nada nos casos da secção 9.
  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_depois AND n.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT c.* INTO v_cfg FROM public.negocio_workflow_config c
  WHERE c.organization_id = v_neg.organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_org IS DISTINCT FROM v_neg.organization_id OR v_entity IS DISTINCT FROM v_neg.entity_id
     OR v_apagado THEN
    RETURN;
  END IF;
  IF p_tipo = 'contrato' AND v_neg.fecho = 'proposta' THEN
    RETURN;
  END IF;

  -- 3. Classes de estado.
  v_cls_antes := CASE
    WHEN p_tipo = 'proposta' AND p_status_antes = ANY (c_pos_pr) THEN 'positivo'
    WHEN p_tipo = 'proposta' AND p_status_antes = ANY (c_neg_pr) THEN 'negativo'
    WHEN p_tipo = 'contrato' AND p_status_antes = ANY (c_pos_cc) THEN 'positivo'
    WHEN p_tipo = 'contrato' AND p_status_antes = ANY (c_neg_cc) THEN 'negativo'
    ELSE 'neutro' END;
  v_cls_dep := CASE
    WHEN p_tipo = 'proposta' AND p_status_depois = ANY (c_pos_pr) THEN 'positivo'
    WHEN p_tipo = 'proposta' AND p_status_depois = ANY (c_neg_pr) THEN 'negativo'
    WHEN p_tipo = 'contrato' AND p_status_depois = ANY (c_pos_cc) THEN 'positivo'
    WHEN p_tipo = 'contrato' AND p_status_depois = ANY (c_neg_cc) THEN 'negativo'
    ELSE 'neutro' END;
  v_decisivo := (p_tipo = v_neg.fecho);
  v_origem := (v_neg.decisao_origem_id IS NOT DISTINCT FROM p_doc_id);

  -- 4. Classe da transição (9.1).
  IF v_ligacao THEN
    -- T11: uma ligação só conta se o documento já for positivo. A prova é a
    -- das colunas: quem liga não é quem aceitou (decisão 1 da v3, adiada).
    IF v_cls_dep <> 'positivo' THEN
      RETURN;
    END IF;
    v_prova := CASE WHEN p_tipo = 'proposta' THEN public.fn_neg_prova_proposta(p_doc_id, NULL)
                    ELSE public.fn_neg_prova_contrato(p_doc_id) END;
    v_classe := CASE WHEN v_prova IS NOT NULL THEN 'positivo' ELSE 'positivo_sem_prova' END;
  ELSIF v_cls_dep = 'positivo' AND v_cls_antes <> 'positivo' THEN
    v_prova := CASE WHEN p_tipo = 'proposta' THEN public.fn_neg_prova_proposta(p_doc_id, v_actor)
                    ELSE public.fn_neg_prova_contrato(p_doc_id) END;
    v_classe := CASE WHEN v_prova IS NOT NULL THEN 'positivo' ELSE 'positivo_sem_prova' END;
  ELSIF v_cls_dep = 'positivo' THEN
    RETURN;                                               -- T2
  ELSIF v_cls_dep = 'negativo' AND v_cls_antes <> 'negativo' THEN
    IF p_tipo = 'proposta' THEN
      v_classe := CASE WHEN v_cls_antes = 'positivo' THEN 'recusa_depois_aceite' ELSE 'recusa_proposta' END;
    ELSIF v_subst THEN
      v_classe := 'substituicao';
    ELSIF v_cls_antes = 'positivo' THEN
      v_classe := 'cancelamento_assinado';
    ELSE
      v_classe := 'recusa_contrato';
    END IF;
  ELSIF v_cls_antes = 'positivo' AND v_cls_dep = 'neutro' THEN
    v_classe := CASE WHEN v_actor IS NOT NULL AND public.fn_neg_houve_alteracoes(v_neg.id, p_tipo, p_doc_id)
                     THEN 'reabertura' ELSE 'sem_efeito' END;
  ELSIF v_cls_antes = 'negativo' AND v_cls_dep = 'neutro' THEN
    v_classe := CASE WHEN v_actor IS NOT NULL AND public.fn_neg_houve_alteracoes(v_neg.id, p_tipo, p_doc_id)
                     THEN 'reenviado' ELSE 'reenviado_sem_alteracoes' END;
  ELSE
    RETURN;
  END IF;

  -- Retrato do conteúdo nas decisões positivas e negativas (10.4).
  IF v_classe IN ('positivo', 'positivo_sem_prova', 'recusa_proposta', 'recusa_contrato',
                  'recusa_depois_aceite', 'cancelamento_assinado') THEN
    v_hash := public.fn_neg_conteudo_hash(p_tipo, p_doc_id);
  END IF;
  v_canal := public.fn_neg_canal(v_actor, v_prova);

  -- 5. Efeito no negócio (9.2).
  IF v_classe = 'positivo' THEN
    IF NOT v_decisivo THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        'Proposta aceite; o negócio fecha no contrato.',
        p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash);
    ELSIF v_neg.estado = 'aberto' THEN
      PERFORM public.fn_neg_ganhar_interno(v_neg.id, p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash,
        CASE WHEN p_tipo = 'proposta' THEN 'Proposta aceite' ELSE 'Contrato assinado' END);
    ELSIF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        v_nome || ' positivo num negócio já ganho.',
        p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash);
    ELSE
      PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'positivo_depois_perda',
        v_nome || ' aceite ou assinado depois da perda.',
        p_tipo, p_doc_id, v_status, v_canal, v_prova, v_hash);
    END IF;

  ELSIF v_classe = 'positivo_sem_prova' THEN
    IF NOT v_decisivo OR v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        v_nome || ' aceite ou assinado sem prova.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    ELSE
      PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'sem_prova',
        'Assinado ou aceite sem prova.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'recusa_proposta' THEN
    -- A recusa só perde se não houver outro documento positivo ativo (proposta
    -- aceite, ou contrato assinado no fecho no contrato). Outra proposta em
    -- rascunho ou enviada não trava a perda (decisão do utilizador).
    IF v_neg.estado = 'aberto' THEN
      IF public.fn_neg_tem_positivo_activo(v_neg, p_doc_id) OR v_cfg.recusa_proposta = 'manter_aberto' THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Proposta recusada.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSE
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'proposta',
          'Automático: proposta recusada' || COALESCE(': ' || v_motivo_cl, ''), NULL,
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Proposta recusada');
      END IF;
    ELSIF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Proposta recusada num negócio ganho.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'recusa_contrato' THEN
    IF v_neg.estado = 'aberto' THEN
      IF v_cfg.recusa_contrato = 'manter_aberto' THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato recusado ou cancelado antes de assinado.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSE
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'contrato',
          CASE WHEN v_status IN ('cancelled', 'cancelado')
               THEN 'Automático: contrato cancelado antes de assinado'
               ELSE 'Automático: contrato recusado' END || COALESCE(': ' || v_motivo_cl, ''), NULL,
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Contrato recusado ou cancelado');
      END IF;
    ELSIF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato recusado ou cancelado num negócio ganho.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'substituicao' THEN
    IF v_neg.estado = 'ganho' AND v_origem THEN
      PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
        'Contrato substituído: aguarda assinatura da nova versão',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, 'Contrato substituído');
    ELSE
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato substituído por uma nova versão.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
    END IF;

  ELSIF v_classe = 'cancelamento_assinado' THEN
    IF v_neg.estado = 'ganho' AND v_origem THEN
      v_momento := public.fn_neg_momento_assinatura(p_doc_id, v_neg.ganho_em);
      IF v_cfg.reflexao_dias IS NULL THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'prazo_por_configurar',
          'Contrato cancelado depois de assinado; o prazo de reflexão não está configurado: o negócio continua ganho.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSIF v_momento IS NOT NULL AND now() <= v_momento + make_interval(days => v_cfg.reflexao_dias) THEN
        IF v_cfg.cancelamento_no_prazo = 'perder' THEN
          PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'contrato',
            'Desistência dentro do prazo' || COALESCE(': ' || v_motivo_cl, ''), NULL,
            p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Desistência dentro do prazo');
        ELSE
          PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
            'Contrato cancelado dentro do prazo; a configuração mantém o ganho.',
            p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
        END IF;
      ELSE
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Cancelado depois do prazo.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      END IF;
    ELSIF v_neg.estado <> 'perdido' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Contrato cancelado depois de assinado.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
    END IF;

  ELSIF v_classe = 'reabertura' THEN
    IF v_neg.estado = 'ganho' AND v_origem THEN
      PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
        v_nome || ' reaberto com alterações',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, v_nome || ' reaberto com alterações');
    END IF;

  ELSIF v_classe = 'sem_efeito' THEN
    IF v_neg.estado = 'ganho' THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'mudanca_sem_efeito',
        v_nome || ' saiu de aceite ou assinado sem alterações: o negócio continua ganho.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
    END IF;

  ELSIF v_classe = 'recusa_depois_aceite' THEN
    IF v_neg.estado = 'aberto' THEN
      IF public.fn_neg_tem_positivo_activo(v_neg, p_doc_id) OR v_cfg.recusa_proposta = 'manter_aberto' THEN
        PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL, 'Proposta recusada depois de aceite.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      ELSE
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'proposta',
          'Automático: proposta recusada depois de aceite' || COALESCE(': ' || v_motivo_cl, ''), NULL,
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Proposta recusada depois de aceite');
      END IF;
    ELSIF v_neg.estado = 'ganho' THEN
      IF v_origem AND v_actor IS NOT NULL THEN
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
          'Proposta recusada depois de aceite',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, 'Proposta recusada depois de aceite');
        SELECT n.* INTO v_neg FROM public.negocios n WHERE n.id = v_neg.id;
        IF v_cfg.recusa_proposta = 'perder' AND NOT public.fn_neg_tem_positivo_activo(v_neg, p_doc_id) THEN
          PERFORM public.fn_neg_mudar_estado(v_neg.id, 'perdido', 'proposta',
            'Automático: proposta recusada depois de aceite' || COALESCE(': ' || v_motivo_cl, ''), NULL,
            p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash, 'Proposta recusada depois de aceite');
        END IF;
      ELSE
        PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'recusa_depois_aceite',
          'Proposta recusada depois de aceite: o negócio continua ganho.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, v_hash);
      END IF;
    END IF;

  ELSIF v_classe = 'reenviado' THEN
    IF v_neg.estado = 'perdido' THEN
      IF v_origem THEN
        PERFORM public.fn_neg_mudar_estado(v_neg.id, 'aberto', NULL, NULL,
          v_nome || ' reenviado com alterações',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL, v_nome || ' reenviado com alterações');
      ELSE
        PERFORM public.fn_neg_anotar(v_neg.id, 'alerta', 'reenvio_sem_reabrir',
          v_nome || ' reenviado com alterações, mas a perda não veio dele (ou foi manual): o negócio continua perdido.',
          p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
      END IF;
    END IF;

  ELSIF v_classe = 'reenviado_sem_alteracoes' THEN
    IF v_neg.estado = 'perdido' AND v_origem THEN
      PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
        v_nome || ' reenviado sem alterações: não reabre o negócio.',
        p_tipo, p_doc_id, v_status, v_canal, NULL, NULL);
    END IF;
  END IF;
END;
$function$;

-- ============================================================
-- Públicas
-- ============================================================

-- «Fechar agora»: só reparação.
CREATE FUNCTION public.neg_reavaliar_negocio(p_negocio_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg      public.negocios;
  v_pos      record;
  v_conv     text;
  v_hash     text;
  v_chaves   text[];
  v_converte boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND OR NOT public.fn_neg_pode_editar(v_neg) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM public.fn_neg_exigir_config(v_neg.organization_id);
  IF v_neg.estado <> 'aberto' THEN
    RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_neg.estado
      USING ERRCODE = 'NG002';
  END IF;

  SELECT d.tipo, d.id, d.estado, d.prova INTO v_pos FROM public.fn_neg_positivo_decisivo(v_neg) AS d;
  IF NOT FOUND OR v_pos.id IS NULL THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'aberto', 'motivo', 'sem_positivo_com_prova');
  END IF;

  v_hash := public.fn_neg_conteudo_hash(v_pos.tipo, v_pos.id);

  -- Conversão automática pela configuração: quem carrega no botão tem de poder
  -- converter (leads.convert com âmbito sobre as leads que a conversão fecha,
  -- como neg_ganhar_negocio). Sem isso dá o ganho, não converte e deixa a
  -- conversão por fazer («Converter em cliente»). Esta função exige sessão;
  -- sem sessão (portal) a conversão vem dos gatilhos, por fn_neg_ganhar_interno.
  SELECT c.conversao_ao_ganhar INTO v_conv
  FROM public.negocio_workflow_config c WHERE c.organization_id = v_neg.organization_id;
  IF v_conv = 'automatica' THEN
    v_chaves := public.crm_scope_keys('leads.convert');
    v_converte := public.fn_neg_tem_permissao_org(v_neg.organization_id, 'leads.convert')
      AND NOT EXISTS (
        SELECT 1 FROM public.anew_leads l
        WHERE l.entity_id = v_neg.entity_id
          AND l.organization_id = v_neg.organization_id
          AND l.deleted_at IS NULL
          AND lower(COALESCE(l.status::text, '')) <> 'lost'
          AND (lower(COALESCE(l.status::text, '')) IS DISTINCT FROM 'converted'
               OR l.converted_to_client_id IS NULL
               OR l.converted_at IS NULL)
          AND (l.organization_id::text || ':*' = ANY (v_chaves)
               OR l.organization_id::text || ':' || l.assigned_to::text = ANY (v_chaves)
               OR l.organization_id::text || ':' || l.created_by::text = ANY (v_chaves)) IS NOT TRUE);
  END IF;

  IF v_conv = 'automatica' AND NOT v_converte THEN
    PERFORM public.fn_neg_mudar_estado(v_neg.id, 'ganho', NULL, NULL, NULL,
      v_pos.tipo, v_pos.id, v_pos.estado, 'crm', v_pos.prova, v_hash, 'Fechar agora (reparação)');
    PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
      'Conversão em cliente por fazer: quem fechou não tem a permissão de converter leads. Use «Converter em cliente».',
      v_pos.tipo, v_pos.id, v_pos.estado, 'crm', NULL, NULL);
    v_conv := 'por_fazer';
  ELSE
    v_conv := public.fn_neg_ganhar_interno(v_neg.id, v_pos.tipo, v_pos.id, v_pos.estado, 'crm',
                                            v_pos.prova, v_hash, 'Fechar agora (reparação)');
  END IF;

  RETURN jsonb_build_object('mudou', true, 'estado', 'ganho', 'origem_tipo', v_pos.tipo,
                            'origem_id', v_pos.id, 'prova', v_pos.prova, 'conversao', v_conv);
END;
$function$;

-- «Reabrir negócio» (ganho -> aberto), com pessoas.reopen.
CREATE FUNCTION public.neg_reabrir_ganho(p_negocio_id uuid, p_motivo text)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo);
BEGIN
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: razão da reabertura (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  -- Existe, não está no lixo, pessoas.edit com âmbito (RLS), configuração
  -- (NG008) e estado ganho (NG002).
  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['ganho']);

  IF NOT public.fn_neg_tem_permissao_org(v_neg.organization_id, 'pessoas.reopen') THEN
    RAISE EXCEPTION 'Sem permissão para reabrir negócios ganhos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config('app.neg_origem_tipo', '', true);
  PERFORM set_config('app.neg_origem_id', '', true);
  PERFORM set_config('app.negocio_motivo_reabertura', v_motivo, true);
  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n SET estado = 'aberto', fase_perda = NULL, motivo_perda = NULL
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);
  PERFORM set_config('app.negocio_motivo_reabertura', '', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'aberto');
END;
$function$;

-- Dispensar o alerta em aberto («Manter perdido» e afins).
CREATE FUNCTION public.neg_dispensar_alerta(p_negocio_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_neg public.negocios;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL
  FOR NO KEY UPDATE;
  IF NOT FOUND OR NOT public.fn_neg_pode_editar(v_neg) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM public.fn_neg_exigir_config(v_neg.organization_id);

  IF v_neg.alerta_codigo IS NULL THEN
    RETURN jsonb_build_object('mudou', false, 'estado', v_neg.estado);
  END IF;

  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n SET alerta_codigo = NULL WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);

  PERFORM public.fn_neg_anotar(v_neg.id, 'acompanhamento', NULL,
    'Alerta dispensado: ' || v_neg.alerta_codigo, NULL, NULL, NULL, 'crm', NULL, NULL);

  RETURN jsonb_build_object('mudou', true, 'estado', v_neg.estado, 'alerta', v_neg.alerta_codigo);
END;
$function$;

-- «Converter em cliente»: só em negócios ganhos.
CREATE OR REPLACE FUNCTION public.neg_ganhar_negocio(p_negocio_id uuid, p_lead_id uuid DEFAULT NULL::uuid, p_client_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg        public.negocios;
  v_mudou      boolean := false;
  v_lead       public.anew_leads;
  v_client_id  uuid;
  v_client_org uuid;
  v_conversao  text;
  v_outras     int;
BEGIN
  IF p_client_data IS NOT NULL AND jsonb_typeof(p_client_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados do cliente.' USING ERRCODE = 'NG009';
  END IF;

  -- 1. Negócio editável e JÁ ganho (o ganho vem dos documentos; aberto ou
  --    perdido: NG002). Fase N: deixa de dar o ganho e de ler o momento do ganho.
  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['ganho']);

  -- 2. Conversão de UMA lead aberta, serializada por pessoa.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || v_neg.organization_id::text || ':' || v_neg.entity_id::text, 0));

  SELECT * INTO v_lead FROM public.fn_neg_escolher_lead(
    v_neg.organization_id, v_neg.entity_id, p_lead_id, 'aberta');

  IF v_lead.id IS NOT NULL
     AND (v_lead.status = 'converted' OR v_lead.converted_to_client_id IS NOT NULL) THEN
    -- Lead indicada já convertida: não se chama o rpc.
    v_conversao := 'ja_convertida';
    v_client_id := v_lead.converted_to_client_id;

  ELSIF v_lead.id IS NOT NULL AND public.fn_neg_lead_aberta(v_lead.status::text) THEN
    -- D5: leads.convert com âmbito sobre esta lead (como as políticas).
    IF NOT (public.has_anew_permission(auth.uid(), 'leads.convert')
            AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('leads.convert')) AS k(scope_key)
                        WHERE k.scope_key = v_lead.organization_id::text || ':*'
                           OR k.scope_key = v_lead.organization_id::text || ':' || v_lead.assigned_to::text
                           OR k.scope_key = v_lead.organization_id::text || ':' || v_lead.created_by::text)) THEN
      RAISE EXCEPTION 'Sem permissão para converter a lead.' USING ERRCODE = 'NG007';
    END IF;

    SELECT c.id, c.organization_id INTO v_client_id, v_client_org
    FROM public.rpc_convert_lead_to_client(
      v_lead.id, COALESCE(p_client_data, '{}'::jsonb), NULL::uuid, NULL::uuid, NULL::uuid) AS c;
    IF v_client_org IS DISTINCT FROM v_neg.organization_id THEN
      RAISE EXCEPTION 'A conversão desta lead não é possível nesta organização.' USING ERRCODE = 'NG012';
    END IF;
    v_conversao := 'feita';
    v_mudou := true;

  ELSE
    -- Sem lead aberta, ou a indicada está fechada (rejeitada, perdida,
    -- cancelada): não converte; só se a pessoa já for cliente desta organização.
    SELECT c.id INTO v_client_id
    FROM public.anew_clients c
    WHERE c.organization_id = v_neg.organization_id AND c.entity_id = v_neg.entity_id
      AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT 1;
    IF v_client_id IS NOT NULL THEN
      v_conversao := 'ja_cliente';
    ELSE
      SELECT l.* INTO v_lead
      FROM public.anew_leads l
      WHERE l.organization_id = v_neg.organization_id AND l.entity_id = v_neg.entity_id
        AND l.deleted_at IS NULL AND l.converted_to_client_id IS NOT NULL
      ORDER BY l.converted_at DESC NULLS LAST, l.created_at DESC
      LIMIT 1;
      IF v_lead.id IS NULL THEN
        RAISE EXCEPTION 'A pessoa não tem lead aberta para converter.' USING ERRCODE = 'NG015';
      END IF;
      v_conversao := 'ja_convertida';
      v_client_id := v_lead.converted_to_client_id;
    END IF;
  END IF;

  -- Cliente já existente tem de ser desta organização (lido sob RLS).
  IF v_conversao = 'ja_convertida' THEN
    SELECT c.organization_id INTO v_client_org
    FROM public.anew_clients c
    WHERE c.id = v_client_id;
    IF v_client_org IS DISTINCT FROM v_neg.organization_id THEN
      RAISE EXCEPTION 'A conversão desta lead não é possível nesta organização.' USING ERRCODE = 'NG012';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_outras
  FROM public.anew_leads l
  WHERE l.organization_id = v_neg.organization_id AND l.entity_id = v_neg.entity_id
    AND l.deleted_at IS NULL
    AND l.id IS DISTINCT FROM v_lead.id
    AND public.fn_neg_lead_aberta(l.status::text);

  -- 3. A conversão que falhou deixa de estar em alerta.
  IF v_neg.alerta_codigo = 'conversao_falhou' THEN
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.negocios n SET alerta_codigo = NULL
    WHERE n.id = v_neg.id AND n.alerta_codigo = 'conversao_falhou';
    PERFORM set_config('app.neg_via_funcao', 'off', true);
  END IF;

  -- 4. O rpc de conversão deixa a auditoria genérica desligada até ao fim da transacção.
  PERFORM set_config('app.audit_bypass', 'off', true);

  RETURN jsonb_build_object('mudou', v_mudou, 'estado', 'ganho', 'conversao', v_conversao,
                            'lead_id', v_lead.id, 'client_id', v_client_id,
                            'outras_leads_abertas', v_outras);
END;
$function$;

-- Ligação tardia: só para a migração dos dados actuais (secção 13).
CREATE OR REPLACE FUNCTION public.neg_ligar_registo(p_negocio_id uuid, p_tipo text, p_registo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg      public.negocios;
  v_existe   boolean;
  v_atual    uuid;
  v_n        int;
  v_sem_base boolean;
  v_criado   timestamptz;
  v_activado timestamptz;
BEGIN
  IF p_registo_id IS NULL OR p_tipo IS NULL
     OR p_tipo NOT IN ('contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo ou registo.' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);

  IF p_tipo = 'contrato' AND v_neg.fecho = 'proposta' THEN
    RAISE EXCEPTION 'Este negócio fecha na proposta (venda directa): não se ligam contratos.'
      USING ERRCODE = 'NG023';
  END IF;

  -- Documentos: só os criados antes da activação de Pessoas na organização.
  SELECT c.created_at INTO v_activado
  FROM public.negocio_workflow_config c WHERE c.organization_id = v_neg.organization_id;

  IF p_tipo = 'contacto' THEN
    SELECT true, i.negocio_id INTO v_existe, v_atual
    FROM public.entity_interactions i
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.entity_interactions i SET negocio_id = v_neg.id
    WHERE i.id = p_registo_id AND i.organization_id = v_neg.organization_id
      AND i.entity_id = v_neg.entity_id AND i.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'visita' THEN
    SELECT true, s.negocio_id INTO v_existe, v_atual
    FROM public.schedule_items s
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      AND (EXISTS (SELECT 1 FROM public.anew_leads l WHERE l.id = s.lead_id AND l.entity_id = v_neg.entity_id)
           OR EXISTS (SELECT 1 FROM public.anew_clients c WHERE c.id = s.client_id AND c.entity_id = v_neg.entity_id));
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    UPDATE public.schedule_items s SET negocio_id = v_neg.id
    WHERE s.id = p_registo_id AND s.organization_id = v_neg.organization_id
      AND s.time_off_type IS NULL AND s.vacation_id IS NULL AND s.negocio_id IS NULL
      AND (EXISTS (SELECT 1 FROM public.anew_leads l WHERE l.id = s.lead_id AND l.entity_id = v_neg.entity_id)
           OR EXISTS (SELECT 1 FROM public.anew_clients c WHERE c.id = s.client_id AND c.entity_id = v_neg.entity_id));
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'levantamento' THEN
    -- O trigger do levantamento valida o resto (um por negócio, permissão).
    SELECT true, lv.negocio_id INTO v_existe, v_atual
    FROM public.levantamentos lv
    WHERE lv.id = p_registo_id AND lv.organization_id = v_neg.organization_id
      AND lv.entity_id = v_neg.entity_id AND lv.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = v_neg.id AND o.id <> p_registo_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
    UPDATE public.levantamentos lv SET negocio_id = v_neg.id
    WHERE lv.id = p_registo_id AND lv.organization_id = v_neg.organization_id
      AND lv.entity_id = v_neg.entity_id AND lv.deleted_at IS NULL AND lv.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;

  ELSIF p_tipo = 'orcamento' THEN
    SELECT true, q.negocio_id, q.created_at INTO v_existe, v_atual, v_criado
    FROM public.quotes q
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF v_existe AND v_criado >= v_activado THEN
      RAISE EXCEPTION 'Só os documentos anteriores à activação se ligam à mão.' USING ERRCODE = 'NG024';
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.quotes q SET negocio_id = v_neg.id
    WHERE q.id = p_registo_id AND q.organization_id = v_neg.organization_id
      AND q.entity_id = v_neg.entity_id AND q.deleted_at IS NULL AND q.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);

  ELSIF p_tipo = 'proposta' THEN
    SELECT true, pr.negocio_id, pr.created_at INTO v_existe, v_atual, v_criado
    FROM public.proposals pr
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF v_existe AND v_criado >= v_activado THEN
      RAISE EXCEPTION 'Só os documentos anteriores à activação se ligam à mão.' USING ERRCODE = 'NG024';
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.proposals pr SET negocio_id = v_neg.id
    WHERE pr.id = p_registo_id AND pr.organization_id = v_neg.organization_id
      AND pr.entity_id = v_neg.entity_id AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE
      AND pr.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);

  ELSE -- contrato
    SELECT true, cc.negocio_id,
           (cc.status NOT IN ('signed', 'assinado') AND cc.quote_id IS NULL AND cc.proposal_id IS NULL),
           cc.created_at
      INTO v_existe, v_atual, v_sem_base, v_criado
    FROM public.client_contracts cc
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.deleted_at IS NULL;
    IF v_existe AND v_atual IS NOT DISTINCT FROM v_neg.id THEN
      RETURN jsonb_build_object('mudou', false);
    END IF;
    IF v_existe AND v_criado >= v_activado THEN
      RAISE EXCEPTION 'Só os documentos anteriores à activação se ligam à mão.' USING ERRCODE = 'NG024';
    END IF;
    -- Contrato por assinar sem orçamento nem proposta: o trigger existente
    -- set_client_contract_total_value_sem_iva poria o valor a NULL.
    IF v_existe AND v_sem_base THEN
      RAISE EXCEPTION 'Este contrato não tem orçamento nem proposta: não se liga antes de ser assinado.'
        USING ERRCODE = 'NG014';
    END IF;
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.client_contracts cc SET negocio_id = v_neg.id
    WHERE cc.id = p_registo_id AND cc.organization_id = v_neg.organization_id
      AND cc.entity_id = v_neg.entity_id AND cc.deleted_at IS NULL AND cc.negocio_id IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM set_config('app.neg_via_funcao', 'off', true);
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
  END IF;
  RETURN jsonb_build_object('mudou', true);
END;
$function$;

-- Mudar o tipo de fecho: igual à da migration A, mais a reavaliação com
-- prova depois de confirmar.
CREATE OR REPLACE FUNCTION public.neg_mudar_fecho(
  p_negocio_id uuid,
  p_fecho text,
  p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg      public.negocios;
  v_ganharia boolean := false;
  v_reav     jsonb;
BEGIN
  IF p_fecho IS NULL OR p_fecho NOT IN ('proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo de fecho (proposta ou contrato).' USING ERRCODE = 'NG009';
  END IF;

  -- Existe, não está no lixo, organização com Pessoas e pessoas.edit com
  -- âmbito (RLS de negocios no FOR NO KEY UPDATE).
  SELECT * INTO v_neg
  FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto', 'ganho', 'perdido']);

  IF v_neg.estado <> 'aberto' THEN
    RAISE EXCEPTION 'O tipo de fecho só muda num negócio aberto: reabra o negócio ou anule a perda primeiro.'
      USING ERRCODE = 'NG022';
  END IF;

  IF v_neg.fecho = p_fecho THEN
    RETURN jsonb_build_object('mudou', false, 'fecho', v_neg.fecho, 'precisa_confirmar', false);
  END IF;

  IF p_fecho = 'proposta' THEN
    IF EXISTS (SELECT 1 FROM public.client_contracts cc
               WHERE cc.negocio_id = v_neg.id AND cc.deleted_at IS NULL
                 AND cc.replaced_by_contract_id IS NULL
                 AND cc.status IN ('pending_signature', 'signed', 'assinado', 'active')) THEN
      RAISE EXCEPTION 'Há um contrato assinado ou enviado para assinatura: o negócio não pode passar a fechar na proposta.'
        USING ERRCODE = 'NG022';
    END IF;
    v_ganharia := EXISTS (SELECT 1 FROM public.proposals pr
                          WHERE pr.negocio_id = v_neg.id AND pr.status = 'accepted'
                            AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE);
  ELSE
    IF EXISTS (SELECT 1 FROM public.proposals pr
               WHERE pr.negocio_id = v_neg.id AND pr.status = 'accepted'
                 AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) THEN
      RAISE EXCEPTION 'Há uma proposta aceite: o negócio não pode passar a fechar no contrato.'
        USING ERRCODE = 'NG022';
    END IF;
    v_ganharia := EXISTS (SELECT 1 FROM public.client_contracts cc
                          WHERE cc.negocio_id = v_neg.id AND cc.deleted_at IS NULL
                            AND cc.replaced_by_contract_id IS NULL
                            AND cc.status IN ('signed', 'assinado', 'active'));
  END IF;

  IF v_ganharia AND NOT COALESCE(p_confirmar, false) THEN
    RETURN jsonb_build_object('mudou', false, 'fecho', v_neg.fecho, 'precisa_confirmar', true);
  END IF;

  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n SET fecho = p_fecho WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);

  -- Fase N, D: um positivo decisivo com prova dá o ganho (nunca sem prova).
  IF v_ganharia THEN
    v_reav := public.neg_reavaliar_negocio(v_neg.id);
  END IF;

  RETURN jsonb_build_object('mudou', true, 'fecho', p_fecho, 'precisa_confirmar', false,
                            'reavaliacao', v_reav);
END;
$function$;

-- ============================================================
-- Privilégios
-- ============================================================
REVOKE ALL ON FUNCTION public.fn_neg_pode_editar(public.negocios) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_contrato_hash(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_conteudo_hash(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_prova_contrato(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_prova_proposta(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_momento_assinatura(uuid, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_houve_alteracoes(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_canal(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_mudar_estado(uuid, text, text, text, text, text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_anotar(uuid, text, text, text, text, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_converter_pessoa(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_ganhar_interno(uuid, text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_tem_positivo_activo(public.negocios, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_positivo_decisivo(public.negocios) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_decidir_negocio(text, uuid, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.neg_reavaliar_negocio(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_reavaliar_negocio(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.neg_reabrir_ganho(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_reabrir_ganho(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.neg_dispensar_alerta(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_dispensar_alerta(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_neg_decidir_negocio(text, uuid, text, text, uuid, uuid) IS
  'Pessoas, Fase N: decide o efeito de uma transição de proposta ou contrato ligado a um negócio (tabelas 9.1 e 9.2 do desenho v4). Interna; chamada só pelos gatilhos adiados trg_negocios_fecho_proposta e trg_negocios_fecho_contrato. Escreve só em negocios e negocio_eventos (e na conversão pela configuração). 20261226140000.';
COMMENT ON FUNCTION public.fn_neg_converter_pessoa(uuid, text, uuid) IS
  'Pessoas, Fase N: converte a pessoa do negócio em cliente (cópia conservadora de fn_contract_signed_convert_to_client): reutiliza o cliente da organização ou de uma irmã da mesma raiz, ou cria-o; fecha as leads abertas. Interna, sem sessão, idempotente. 20261226140000.';
COMMENT ON FUNCTION public.neg_reavaliar_negocio(uuid) IS
  'Pessoas: «Fechar agora» (reparação de ganhos). Num negócio aberto com um positivo decisivo COM prova, dá o ganho e converte pela configuração; a conversão automática exige leads.convert com âmbito sobre as leads da pessoa, e sem ela fica por fazer (conversao: por_fazer). Nunca dá ganho sem prova; não repara perdas. 42501 sem sessão; NG001; NG008; NG002. 20261226140000.';
COMMENT ON FUNCTION public.neg_reabrir_ganho(uuid, text) IS
  'Pessoas: «Reabrir negócio» ganho -> aberto, com motivo e pessoas.reopen. Não mexe nos documentos nem desfaz a conversão. NG009; NG001; NG008; NG002; 42501. 20261226140000.';
COMMENT ON FUNCTION public.neg_dispensar_alerta(uuid) IS
  'Pessoas: limpa o alerta em aberto do negócio («Manter perdido» e afins), com pessoas.edit, e regista acompanhamento. 20261226140000.';
COMMENT ON FUNCTION public.neg_ganhar_negocio(uuid, uuid, jsonb) IS
  'Pessoas: «Converter em cliente» num negócio JÁ ganho (o ganho vem dos documentos). Aberto ou perdido: NG002. Limpa o alerta conversao_falhou. 20261226140000.';
COMMENT ON FUNCTION public.neg_ligar_registo(uuid, text, uuid) IS
  'Pessoas: liga um registo a um negócio aberto. Só para a migração dos dados actuais: os documentos (orçamento, proposta, contrato) só se ligam se criados antes da activação de Pessoas (NG024); contrato num negócio com fecho na proposta NG023. 20261226140000.';

-- CONFERIR
DO $conferir$
DECLARE
  v_n   int;
  v_txt text;
BEGIN
  -- 1. Todas as funções existem com a forma esperada.
  SELECT string_agg(e.sig, ', ') INTO v_txt
  FROM (VALUES
    ('public.fn_neg_pode_editar(public.negocios)',             false, 's'),
    ('public.fn_neg_contrato_hash(uuid)',                      true,  's'),
    ('public.fn_neg_conteudo_hash(text,uuid)',                 true,  's'),
    ('public.fn_neg_prova_contrato(uuid)',                     true,  's'),
    ('public.fn_neg_prova_proposta(uuid,uuid)',                true,  's'),
    ('public.fn_neg_momento_assinatura(uuid,timestamptz)',     true,  's'),
    ('public.fn_neg_houve_alteracoes(uuid,text,uuid)',         true,  's'),
    ('public.fn_neg_canal(uuid,text)',                         false, 's'),
    ('public.fn_neg_mudar_estado(uuid,text,text,text,text,text,uuid,text,text,text,text,text)', true, 'v'),
    ('public.fn_neg_anotar(uuid,text,text,text,text,uuid,text,text,text,text)', true, 'v'),
    ('public.fn_neg_converter_pessoa(uuid,text,uuid)',         true,  'v'),
    ('public.fn_neg_ganhar_interno(uuid,text,uuid,text,text,text,text,text)', true, 'v'),
    ('public.fn_neg_tem_positivo_activo(public.negocios,uuid)', true, 's'),
    ('public.fn_neg_positivo_decisivo(public.negocios)',       true,  's'),
    ('public.fn_neg_decidir_negocio(text,uuid,text,text,uuid,uuid)', true, 'v'),
    ('public.neg_reavaliar_negocio(uuid)',                     true,  'v'),
    ('public.neg_reabrir_ganho(uuid,text)',                    false, 'v'),
    ('public.neg_dispensar_alerta(uuid)',                      true,  'v'),
    ('public.neg_ganhar_negocio(uuid,uuid,jsonb)',             false, 'v'),
    ('public.neg_ligar_registo(uuid,text,uuid)',               false, 'v'),
    ('public.neg_mudar_fecho(uuid,text,boolean)',              false, 'v')
  ) AS e(sig, definer, vol)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(e.sig)
      AND p.prosecdef = e.definer
      AND p.provolatile::text = e.vol
      AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
      AND p.proconfig = ARRAY['search_path=public, pg_temp']::text[]);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: funções sem a forma esperada (segurança, volatilidade, dono ou search_path): %', v_txt;
  END IF;

  -- 2. Internas: sem EXECUTE para ninguém.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('fn_neg_pode_editar', 'fn_neg_contrato_hash', 'fn_neg_conteudo_hash',
                      'fn_neg_prova_contrato', 'fn_neg_prova_proposta', 'fn_neg_momento_assinatura',
                      'fn_neg_houve_alteracoes', 'fn_neg_canal', 'fn_neg_mudar_estado', 'fn_neg_anotar',
                      'fn_neg_converter_pessoa', 'fn_neg_ganhar_interno', 'fn_neg_tem_positivo_activo',
                      'fn_neg_positivo_decisivo', 'fn_neg_decidir_negocio')
    AND (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
         OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
         OR pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % função(ões) interna(s) com EXECUTE para anon, authenticated ou service_role', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('fn_neg_pode_editar', 'fn_neg_contrato_hash', 'fn_neg_conteudo_hash',
                      'fn_neg_prova_contrato', 'fn_neg_prova_proposta', 'fn_neg_momento_assinatura',
                      'fn_neg_houve_alteracoes', 'fn_neg_canal', 'fn_neg_mudar_estado', 'fn_neg_anotar',
                      'fn_neg_converter_pessoa', 'fn_neg_ganhar_interno', 'fn_neg_tem_positivo_activo',
                      'fn_neg_positivo_decisivo', 'fn_neg_decidir_negocio');
  IF v_n <> 15 THEN
    RAISE EXCEPTION 'CONFERIR: % de 15 funções internas', v_n;
  END IF;

  -- 3. Públicas novas: só authenticated.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.oid IN ('public.neg_reavaliar_negocio(uuid)'::regprocedure,
                             'public.neg_reabrir_ganho(uuid,text)'::regprocedure,
                             'public.neg_dispensar_alerta(uuid)'::regprocedure)
               AND (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
                    OR pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
                    OR NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                    OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee = 0))) THEN
    RAISE EXCEPTION 'CONFERIR: privilégios das funções públicas novas não são só authenticated';
  END IF;

  -- 4. As recriadas mudaram e mantêm os privilégios (authenticated sim, anon não).
  IF md5(pg_catalog.pg_get_functiondef('public.neg_ganhar_negocio(uuid,uuid,jsonb)'::regprocedure)) = 'b805cc894294a797bca3f466893af5b6'
     OR md5(pg_catalog.pg_get_functiondef('public.neg_ligar_registo(uuid,text,uuid)'::regprocedure)) = '5ed5cf7c02dffd6d4943a98b7b10d0e8' THEN
    RAISE EXCEPTION 'CONFERIR: neg_ganhar_negocio ou neg_ligar_registo não mudaram';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
             WHERE p.oid IN ('public.neg_ganhar_negocio(uuid,uuid,jsonb)'::regprocedure,
                             'public.neg_ligar_registo(uuid,text,uuid)'::regprocedure,
                             'public.neg_mudar_fecho(uuid,text,boolean)'::regprocedure)
               AND (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
                    OR NOT pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'CONFERIR: privilégios das funções recriadas mudaram';
  END IF;
  IF position('momento_ganho' IN pg_catalog.pg_get_functiondef('public.neg_ganhar_negocio(uuid,uuid,jsonb)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'CONFERIR: neg_ganhar_negocio ainda lê momento_ganho';
  END IF;

  -- 5. Puras sem dados: o canal e o hash de um contrato que não existe.
  IF public.fn_neg_canal(NULL, 'P1') <> 'portal' OR public.fn_neg_canal(NULL, 'P2') <> 'assinatura'
     OR public.fn_neg_canal('00000000-0000-0000-0000-000000000000'::uuid, NULL) <> 'crm'
     OR public.fn_neg_canal(NULL, NULL) NOT IN ('sistema', 'portal', 'assinatura') THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_canal não devolve o esperado';
  END IF;
  IF public.fn_neg_contrato_hash('00000000-0000-0000-0000-000000000000'::uuid) IS NOT NULL
     OR public.fn_neg_prova_contrato('00000000-0000-0000-0000-000000000000'::uuid) IS NOT NULL
     OR public.fn_neg_prova_proposta('00000000-0000-0000-0000-000000000000'::uuid, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR: as auxiliares devolvem valor para um documento inexistente';
  END IF;
  -- O hash de contrato tem a forma esperada num contrato da nike (só leitura).
  IF EXISTS (SELECT 1 FROM public.client_contracts cc
             WHERE cc.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'::uuid
               AND public.fn_neg_contrato_hash(cc.id) !~ '^[0-9a-f]{32}$'
             LIMIT 1) THEN
    RAISE EXCEPTION 'CONFERIR: fn_neg_contrato_hash devolve um valor fora da forma md5';
  END IF;

  -- 6. Sem sessão, as públicas DEFINER recusam.
  BEGIN
    PERFORM public.neg_reavaliar_negocio('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION 'CONFERIR: neg_reavaliar_negocio aceitou uma chamada sem sessão';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.neg_dispensar_alerta('00000000-0000-0000-0000-000000000000'::uuid);
    RAISE EXCEPTION 'CONFERIR: neg_dispensar_alerta aceitou uma chamada sem sessão';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- 7. A decisão sai sem fazer nada para um documento inexistente.
  PERFORM public.fn_neg_decidir_negocio('contrato', '00000000-0000-0000-0000-000000000000'::uuid,
    'draft', 'signed', NULL, '00000000-0000-0000-0000-000000000000'::uuid);
  SELECT count(*) INTO v_n FROM public.negocio_eventos e WHERE e.created_at = now();
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: a decisão escreveu % evento(s) num caso que devia sair', v_n;
  END IF;
END
$conferir$;

COMMIT;
