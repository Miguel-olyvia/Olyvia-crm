-- 20270125600000 (auditoria de permissões 20/11): o servidor alinha-se com o ecrã.
-- A) Respostas do acerto do valor e do supervisor das medidas (gravadas como negocio_respostas por neg_guardar_negocio, sem verificação
--    própria até aqui) passam a pedir a permissão do passo, como no ecrã (PERM_DO_PASSO, src/emylia/permissoes.ts):
--      nota_credito, acerto_valor <-> 'nota de crédito'          negocios.registar_fatura   (registarNotaCredito)
--      acerto_valor (sem adenda, n.º da adenda, limpar)           negocios.orcamento.editar  (semAdendaDoValor, adendaDoValor)
--      acerto_sem_adenda_aprov: pedir ('pedida')                  negocios.orcamento.editar  (semAdendaDoValor de quem não aprova margens)
--      acerto_sem_adenda_aprov: aprovar ('ok') ou recusar         negocios.margem.aprovar    (aprovarSemAdenda, recusarSemAdenda)
--      acerto_sem_adenda_por                                      negocios.orcamento.editar ou negocios.margem.aprovar
--      supervisor_medidas                                         negocios.obra.planear      (supervisorMedidas)
--    Só o que muda de verdade (fotografia antes/depois em fn_neg_marcas_permissoes, chave 'acerto').
-- B) fn_neg_pode_gravar(negocio): a regra de neg_guardar_negocio ao nível do negócio (pessoas.edit na organização, âmbito
--    fn_neg_no_ambito e não só execução), sem o filtro da fase. neg_ler_negocios devolve-a em negocio.pode_gravar.
-- C) neg_perder_negocio, neg_anular_perda, neg_ganhar_negocio, neg_reabrir_ganho e neg_mudar_fecho usavam fn_neg_negocio_editavel
--    (INVOKER: RLS de negocios só pelas crm_scope_keys) e neg_dispensar_alerta, neg_reavaliar_negocio e fn_neg_tornar_cliente usavam
--    fn_neg_pode_editar: o mesmo negócio que o ecrã grava (fn_neg_no_ambito: back-office do perfil, tarefas na obra) dava NG001.
--    Prova (20/11, BEGIN/ROLLBACK, Financeiro da Grupo BMLar): fn_neg_no_ambito = true, fn_neg_negocio_editavel = NG001.
--    Passam a usar fn_neg_negocio_gravavel (SECURITY DEFINER, mesma regra fn_neg_pode_gravar). As verificações de permissão de cada
--    ação (negocios.perder, pessoas.reopen, leads.convert...) ficam iguais. fn_neg_negocio_editavel não muda (outros chamadores do CRM).

CREATE OR REPLACE FUNCTION public.fn_neg_pode_gravar(p_neg negocios)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270125600000: a regra de neg_guardar_negocio para gravar o negócio (sem o filtro da fase, que o ecrã trata)
  SELECT p_neg.id IS NOT NULL AND auth.uid() IS NOT NULL
    AND coalesce(public.fn_cat_pode(p_neg.organization_id, 'pessoas.edit'), false)
    AND public.fn_neg_no_ambito(p_neg, 'pessoas.edit')
    AND NOT coalesce(public.fn_neg_so_execucao(p_neg.organization_id, 'pessoas.view'), false)
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_pode_gravar(negocios) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_neg_negocio_gravavel(p_negocio_id uuid, p_estados text[])
 RETURNS negocios
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg public.negocios;
BEGIN
  -- 20270125600000: fn_neg_negocio_editavel com o âmbito de neg_guardar_negocio (fn_neg_pode_gravar) em vez da RLS de negocios.
  --   Quem entra pelo invólucro do Papel no Negócio (app.neg_via_papel) passa se fn_neg_negocio_so_papel o confirmar, como antes.
  SELECT n.* INTO v_neg
  FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL
  FOR NO KEY UPDATE;

  IF NOT FOUND OR NOT (public.fn_neg_pode_gravar(v_neg)
                       OR (coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND public.fn_neg_negocio_so_papel(v_neg.id))) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  PERFORM public.fn_neg_exigir_config(v_neg.organization_id);

  IF NOT (v_neg.estado = ANY (p_estados)) THEN
    RAISE EXCEPTION 'O negócio está %: esta acção não é possível.', v_neg.estado
      USING ERRCODE = 'NG002';
  END IF;
  RETURN v_neg;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_negocio_gravavel(uuid, text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.neg_perder_negocio(p_negocio_id uuid, p_fase text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo);
BEGIN
  -- 20270125600000: SECURITY DEFINER e fn_neg_negocio_gravavel (o âmbito de neg_guardar_negocio, fn_neg_pode_gravar) em vez
  --   de fn_neg_negocio_editavel + RLS de negocios; as permissões da ação ficam iguais.
  -- 20270105700000: quem só tem o Papel no Negócio (sem pessoas.edit com âmbito sobre este negócio) entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RETURN public.fn_neg_papel_perder_negocio(p_negocio_id, p_fase, p_motivo);
  END IF;

  IF p_fase IS NULL OR p_fase NOT IN
     ('lead', 'contacto', 'visita', 'levantamento', 'orcamento', 'proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: fase da perda.' USING ERRCODE = 'NG009';
  END IF;
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: motivo da perda (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_gravavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  -- 20270105200000: além do pessoas.edit (as políticas de negocios), pede negocios.perder
  IF NOT public.fn_cat_pode(v_neg.organization_id, 'negocios.perder') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.perder): não pode dar o negócio como perdido.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_neg.estado = 'perdido' AND v_neg.fase_perda = p_fase AND v_neg.motivo_perda = v_motivo THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'perdido');
  END IF;

  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n
  SET estado = 'perdido', fase_perda = p_fase, motivo_perda = v_motivo
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'perdido');
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_anular_perda(p_negocio_id uuid, p_motivo_reabertura text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo_reabertura);
BEGIN
  -- 20270125600000: SECURITY DEFINER e fn_neg_negocio_gravavel (o âmbito de neg_guardar_negocio, fn_neg_pode_gravar) em vez
  --   de fn_neg_negocio_editavel + RLS de negocios; as permissões da ação ficam iguais.
  -- 20270105700000: quem só tem o Papel no Negócio entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RETURN public.fn_neg_papel_anular_perda(p_negocio_id, p_motivo_reabertura);
  END IF;

  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: razão da reabertura (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  SELECT * INTO v_neg FROM public.fn_neg_negocio_gravavel(p_negocio_id, ARRAY['aberto', 'perdido']);

  -- 20270105200000: além do pessoas.edit (as políticas de negocios), pede negocios.perder
  IF NOT public.fn_cat_pode(v_neg.organization_id, 'negocios.perder') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.perder): não pode anular a perda do negócio.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_neg.estado = 'aberto' THEN
    RETURN jsonb_build_object('mudou', false, 'estado', 'aberto');
  END IF;

  PERFORM set_config('app.negocio_motivo_reabertura', v_motivo, true);
  PERFORM set_config('app.neg_via_funcao', 'on', true);
  UPDATE public.negocios n
  SET estado = 'aberto', fase_perda = NULL, motivo_perda = NULL
  WHERE n.id = v_neg.id;
  PERFORM set_config('app.neg_via_funcao', 'off', true);
  PERFORM set_config('app.negocio_motivo_reabertura', '', true);

  RETURN jsonb_build_object('mudou', true, 'estado', 'aberto');
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_ganhar_negocio(p_negocio_id uuid, p_lead_id uuid DEFAULT NULL::uuid, p_client_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg public.negocios;
  v_res jsonb;
BEGIN
  -- 20270125600000: SECURITY DEFINER e fn_neg_negocio_gravavel (o âmbito de neg_guardar_negocio, fn_neg_pode_gravar) em vez
  --   de fn_neg_negocio_editavel + RLS de negocios; as permissões da ação ficam iguais.
  IF p_client_data IS NOT NULL AND jsonb_typeof(p_client_data) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: dados do cliente.' USING ERRCODE = 'NG009';
  END IF;

  -- 1. Negócio editável e JÁ ganho (o ganho vem dos documentos; aberto ou
  --    perdido: NG002).
  SELECT * INTO v_neg FROM public.fn_neg_negocio_gravavel(p_negocio_id, ARRAY['ganho']);

  -- 2. 20261228200000: a pessoa passa a cliente pela entidade (client_since).
  v_res := public.fn_neg_tornar_cliente(v_neg.id);

  -- 3. A conversão que falhou deixa de estar em alerta.
  IF v_neg.alerta_codigo = 'conversao_falhou' THEN
    PERFORM set_config('app.neg_via_funcao', 'on', true);
    UPDATE public.negocios n SET alerta_codigo = NULL
    WHERE n.id = v_neg.id AND n.alerta_codigo = 'conversao_falhou';
    PERFORM set_config('app.neg_via_funcao', 'off', true);
  END IF;

  RETURN jsonb_build_object('mudou', COALESCE((v_res ->> 'mudou')::boolean, false), 'estado', 'ganho',
                            'conversao', v_res ->> 'conversao',
                            'lead_id', NULL, 'client_id', NULL,
                            'outras_leads_abertas', 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_reabrir_ganho(p_negocio_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg    public.negocios;
  v_motivo text := btrim(p_motivo);
BEGIN
  -- 20270125600000: SECURITY DEFINER e fn_neg_negocio_gravavel (o âmbito de neg_guardar_negocio, fn_neg_pode_gravar) em vez
  --   de fn_neg_negocio_editavel + RLS de negocios; as permissões da ação ficam iguais.
  IF v_motivo IS NULL OR v_motivo = '' OR char_length(v_motivo) > 1000 THEN
    RAISE EXCEPTION 'Valor inválido: razão da reabertura (1 a 1000 caracteres).' USING ERRCODE = 'NG009';
  END IF;

  -- Existe, não está no lixo, pessoas.edit com âmbito (RLS), configuração
  -- (NG008) e estado ganho (NG002).
  SELECT * INTO v_neg FROM public.fn_neg_negocio_gravavel(p_negocio_id, ARRAY['ganho']);

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

CREATE OR REPLACE FUNCTION public.neg_mudar_fecho(p_negocio_id uuid, p_fecho text, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg      public.negocios;
  v_ganharia boolean := false;
  v_reav     jsonb;
BEGIN
  -- 20270125600000: SECURITY DEFINER e fn_neg_negocio_gravavel (o âmbito de neg_guardar_negocio, fn_neg_pode_gravar) em vez
  --   de fn_neg_negocio_editavel + RLS de negocios; as permissões da ação ficam iguais.
  IF p_fecho IS NULL OR p_fecho NOT IN ('proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo de fecho (proposta ou contrato).' USING ERRCODE = 'NG009';
  END IF;

  -- Existe, não está no lixo, organização com Pessoas e pessoas.edit com
  -- âmbito (RLS de negocios no FOR NO KEY UPDATE).
  SELECT * INTO v_neg
  FROM public.fn_neg_negocio_gravavel(p_negocio_id, ARRAY['aberto', 'ganho', 'perdido']);

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

CREATE OR REPLACE FUNCTION public.neg_dispensar_alerta(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  -- 20270125600000: também com o âmbito de neg_guardar_negocio (fn_neg_pode_gravar); quem já passava continua a passar
  IF NOT FOUND OR NOT (public.fn_neg_pode_editar(v_neg) OR public.fn_neg_pode_gravar(v_neg)) THEN
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

CREATE OR REPLACE FUNCTION public.neg_reavaliar_negocio(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg      public.negocios;
  v_pos      record;
  v_conv     text;
  v_hash     text;
  v_converte boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL
  FOR NO KEY UPDATE;
  -- 20270125600000: também com o âmbito de neg_guardar_negocio (fn_neg_pode_gravar); quem já passava continua a passar
  IF NOT FOUND OR NOT (public.fn_neg_pode_editar(v_neg) OR public.fn_neg_pode_gravar(v_neg)) THEN
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
  -- converter (20261228200000: leads.convert com âmbito sobre a entidade, como
  -- fn_neg_tornar_cliente), salvo se a pessoa já for cliente. Sem isso dá o
  -- ganho, não converte e deixa a conversão por fazer («Converter em
  -- cliente»). Esta função exige sessão; sem sessão (portal) a conversão vem
  -- dos gatilhos, por fn_neg_ganhar_interno.
  SELECT c.conversao_ao_ganhar INTO v_conv
  FROM public.negocio_workflow_config c WHERE c.organization_id = v_neg.organization_id;
  IF v_conv = 'automatica' THEN
    v_converte := EXISTS (SELECT 1 FROM public.anew_entities e
                          WHERE e.id = v_neg.entity_id AND e.organization_id = v_neg.organization_id
                            AND e.client_since IS NOT NULL)
                  OR (public.fn_neg_tem_permissao_org(v_neg.organization_id, 'leads.convert')
                      AND public.fn_neg_pessoa_no_ambito(v_neg.organization_id, v_neg.entity_id, 'convert'));
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

CREATE OR REPLACE FUNCTION public.fn_neg_tornar_cliente(p_negocio_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg     public.negocios;
  v_cliente date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT n.* INTO v_neg FROM public.negocios n
  WHERE n.id = p_negocio_id AND n.deleted_at IS NULL;
  -- 20270125600000: também com o âmbito de neg_guardar_negocio (fn_neg_pode_gravar); quem já passava continua a passar
  IF NOT FOUND OR NOT (public.fn_neg_pode_editar(v_neg) OR public.fn_neg_pode_gravar(v_neg)) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;
  PERFORM public.fn_neg_exigir_config(v_neg.organization_id);
  IF v_neg.estado <> 'ganho' THEN
    RAISE EXCEPTION 'O negócio não está ganho: esta acção não é possível.' USING ERRCODE = 'NG002';
  END IF;

  -- Uma conversão de cada vez por pessoa (a mesma chave de fn_neg_converter_pessoa).
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'neg_pessoa:' || v_neg.organization_id::text || ':' || v_neg.entity_id::text, 0));

  SELECT e.client_since INTO v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_neg.entity_id AND e.organization_id = v_neg.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
  IF v_cliente IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', false, 'conversao', 'ja_cliente', 'cliente_desde', v_cliente);
  END IF;

  IF NOT public.fn_neg_pessoa_no_ambito(v_neg.organization_id, v_neg.entity_id, 'convert') THEN
    RAISE EXCEPTION 'Sem permissão para converter a lead.' USING ERRCODE = 'NG007';
  END IF;

  PERFORM public.fn_neg_converter_pessoa(v_neg.id, NULL::text, NULL::uuid);

  SELECT e.client_since INTO v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_neg.entity_id;

  RETURN jsonb_build_object('mudou', true, 'conversao', 'feita', 'cliente_desde', v_cliente);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_neg_marcas_permissoes(p_negocio uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT q.*, 'v' || q.versao AS chave FROM quotes q
    WHERE q.negocio_id = p_negocio AND q.adenda_id IS NULL AND q.fluxo_emylia AND q.deleted_at IS NULL
    UNION ALL
    SELECT q.*, 'a' || a.numero || '.' || q.versao FROM quotes q JOIN adendas a ON a.id = q.adenda_id
    WHERE a.negocio_id = p_negocio AND q.deleted_at IS NULL
  ), c AS (
    SELECT c.*, 'v' || c.versao AS chave FROM client_contracts c
    WHERE c.negocio_id = p_negocio AND c.adenda_id IS NULL AND c.versao IS NOT NULL AND c.deleted_at IS NULL
    UNION ALL
    SELECT c.*, 'a' || a.numero || '.' || c.versao FROM client_contracts c JOIN adendas a ON a.id = c.adenda_id
    WHERE a.negocio_id = p_negocio AND c.versao IS NOT NULL AND c.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'orc', jsonb_build_object(
      'versoes', coalesce((SELECT jsonb_object_agg(q.chave, jsonb_build_object(
        'modelo', coalesce(q.modelo_base, ''), 'desconto', coalesce(q.desconto_fracao, 0), 'venda_direta', coalesce(q.venda_direta, false),
        'preco_final', q.preco_final, 'total_com_iva', q.total_com_iva, 'inicio_obra', q.inicio_obra, 'equipa', q.equipa,
        'sem_demolicao', coalesce(q.sem_demolicao, false), 'prestacoes_por_fases', coalesce(q.prestacoes_por_fases, false),
        'motivos_versao', to_jsonb(coalesce(q.motivos_versao, '{}')), 'nota_versao', q.nota_versao,
        'linhas', (SELECT jsonb_agg(s.j ORDER BY s.o, s.j::text) FROM (
            SELECT l.ordem AS o, jsonb_build_object(
              'tipo', l.tipo_emylia, 'servico', l.service_id, 'produto', l.product_id, 'chave', l.chave_emylia,
              'descricao', CASE WHEN l.service_id IS NULL THEN coalesce(l.descricao_snapshot, '') END, 'unidade', coalesce(l.unidade, ''),
              'quantidade', coalesce(l.quantidade_exata, l.qt), 'preco_un', coalesce(l.preco_un_exato, l.retail_price_unit, 0),
              'taxa_iva', CASE WHEN l.iva_explicita THEN l.iva_percent END, 'fornecedor', l.fornecedor,
              'qtd_origem', l.qtd_origem, 'preco_un_origem', l.preco_un_origem, 'custo_un_origem', l.custo_un_origem,
              'custo_un', CASE WHEN q.adenda_id IS NULL THEN coalesce(l.custo_un_exato, l.cost_price, 0)
                               WHEN cu.congelado THEN l.custo_un_exato END,
              'custo_manual', coalesce(l.custo_manual, false), 'mao_obra_congelada', l.mao_obra_congelada,
              'perfil', coalesce(l.perfil_nome, ''), 'perfil_chave', l.perfil_chave,
              'congelado', coalesce(cu.congelado, false), 'horas_un', coalesce(cu.horas_un, 0), 'mao_obra_un', coalesce(cu.mao_obra_un, 0),
              'equipamentos_un', coalesce(cu.equipamentos_un, 0), 'consumiveis_un', coalesce(cu.consumiveis_un, 0),
              'estrutura_hora', coalesce(cu.estrutura_hora, 0), 'estrutura_un', coalesce(cu.estrutura_un, 0), 'ajuste_un', coalesce(cu.ajuste_un, 0),
              'oficios', (SELECT jsonb_agg(jsonb_build_object('perfil_chave', o.perfil_chave, 'nome', o.nome, 'horas_un', o.horas_un,
                            'custo_hora', o.custo_hora, 'tecnicos', o.tecnicos) ORDER BY o.ordem) FROM quote_line_oficios o WHERE o.quote_line_id = l.id),
              'zonas', (SELECT jsonb_agg(jsonb_build_object('zona', z.nome, 'quantidade', lz.quantidade, 'valor', lz.valor) ORDER BY lz.ordem)
                        FROM quote_line_zonas lz JOIN quote_zonas z ON z.id = lz.zona_id WHERE lz.quote_line_id = l.id),
              'materiais', (SELECT jsonb_agg(jsonb_build_object('nome', m.nome, 'quantidade', m.quantidade, 'unidade', coalesce(m.unidade, ''),
                              'preco', m.preco, 'fornecedor', m.fornecedor) ORDER BY m.ordem) FROM quote_line_materiais m WHERE m.quote_line_id = l.id)
            ) AS j
            FROM quote_lines l LEFT JOIN quote_line_custos cu ON cu.quote_line_id = l.id WHERE l.quote_id = q.id) s),
        'zonas', (SELECT jsonb_agg(z.nome ORDER BY z.ordem, z.nome) FROM quote_zonas z WHERE z.quote_id = q.id),
        'prazo', (SELECT jsonb_agg(jsonb_build_object('tarefa', p.tarefa, 'dias', p.dias) ORDER BY p.tarefa, p.dias) FROM quote_prazo p WHERE p.quote_id = q.id),
        'prestacoes', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'rotulo', p.rotulo, 'pct', p.pct, 'marco', p.marco, 'fase', p.fase) ORDER BY p.ordem)
                       FROM quote_prestacoes p WHERE p.quote_id = q.id),
        'precos_manuais', (SELECT jsonb_agg(jsonb_build_object('descricao', p.descricao, 'preco', p.preco) ORDER BY p.descricao, p.preco)
                           FROM quote_precos_manuais p WHERE p.quote_id = q.id),
        'produtos', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'produto', p.produto_id, 'nome', p.nome, 'unidade', p.unidade, 'custo_un', p.custo_un,
                       'pvp_un', p.pvp_un, 'categoria', p.categoria_id, 'quantidade', p.quantidade, 'cliente_fornece', coalesce(p.cliente_fornece, false),
                       'servico', p.servico_id, 'fator', p.fator, 'sem_instalacao', coalesce(p.sem_instalacao, false)) ORDER BY p.ordem, p.produto_id)
                     FROM quote_versao_produtos p WHERE p.quote_id = q.id),
        'partes_fora', (SELECT jsonb_agg(DISTINCT p.parte) FROM quote_versao_partes p WHERE p.quote_id = q.id)
      )) FROM q), '{}'::jsonb),
      'adendas', coalesce((SELECT jsonb_object_agg(a.numero::text, jsonb_build_object('motivo', coalesce(a.motivo, ''), 'total', a.total,
                   'total_com_iva', a.total_com_iva)) FROM adendas a WHERE a.negocio_id = p_negocio), '{}'::jsonb)),
    'aprov', coalesce((SELECT jsonb_object_agg(q.chave, q.aprovacao) FROM q), '{}'::jsonb),
    'envio', coalesce((SELECT jsonb_object_agg(q.chave, q.estado) FROM q), '{}'::jsonb),
    'contrato', coalesce((SELECT jsonb_object_agg(c.chave, jsonb_build_object(
      'status', c.status, 'substituido', c.replaced_by_contract_id IS NOT NULL, 'revisto_por', c.revisto_por, 'revisto_em', c.revisto_em,
      'clausulas', (SELECT jsonb_agg(jsonb_build_object('titulo', k.titulo, 'texto', k.texto) ORDER BY k.titulo, k.texto)
                    FROM client_contract_clausulas k WHERE k.contract_id = c.id),
      'pedidos', (SELECT jsonb_agg(jsonb_build_object('clausula', p.clausula, 'nota', p.nota) ORDER BY p.ordem)
                  FROM client_contract_pedidos p WHERE p.contract_id = c.id)
    )) FROM c), '{}'::jsonb),
    -- 20270105200000: o contacto (negocios.contacto.registar): o resultado da chamada, as tentativas e o voltar a ligar
    -- 20270113120000: e a marca do contacto concluído pela assistente comercial («Passar ao comercial», contacto_concluido)
    'contacto', (SELECT jsonb_object_agg(r.campo_chave, jsonb_build_object('valor', coalesce(r.valor, ''), 'sugerido', coalesce(r.sugerido, false)))
                 FROM negocio_respostas r WHERE r.negocio_id = p_negocio AND r.campo_chave IN ('resultado', 'tentativas', 'religar', 'contacto_concluido')),
    -- 20270105200000: a visita e o diagnóstico no local, com os mesmos coalesce do INSERT de neg_guardar_negocio
    --   (um negócio sem medidas gravadas dá a fotografia de umas medidas vazias, para a primeira gravação não parecer mudança)
    -- 20270114320000: partida em duas. 'visita' é a agenda (negocios.visita.gerir): a vaga, a lista de visitas e as respostas v<n>_ (menos
    --   v<n>_combinado). 'diagnostico' é o preenchimento (negocios.visita.preencher): medidas, necessidades, fotografias, fechar o levantamento,
    --   serviços, produtos, partes, v<n>_combinado e o diagnóstico (diag_…, div_<divisão>_diag_…).
    'visita', jsonb_build_object(
      'agenda', (SELECT jsonb_build_object('slot', nullif(m.slot, ''), 'visitas', to_jsonb(coalesce(m.visitas, '{}')))
                 FROM (SELECT 1) u LEFT JOIN negocio_medidas m ON m.negocio_id = p_negocio),
      'respostas', (SELECT jsonb_object_agg(r.campo_chave, jsonb_build_object('valor', coalesce(r.valor, ''), 'sugerido', coalesce(r.sugerido, false)))
                    FROM negocio_respostas r WHERE r.negocio_id = p_negocio AND r.campo_chave ~ '^v[0-9]+_' AND r.campo_chave !~ '^v[0-9]+_combinado$')
    ),
    'diagnostico', jsonb_build_object(
      'medidas', (SELECT jsonb_build_object('pav', coalesce(m.pav, 0), 'par', coalesce(m.par, 0), 'ptf', coalesce(m.ptf, 0), 'ptq', coalesce(m.ptq, 0),
                    'pts', coalesce(m.pts, 0), 'pcs', coalesce(m.pcs, 0), 'necessidades', to_jsonb(coalesce(m.necessidades, '{}')),
                    'fotos_total', coalesce(m.fotos_total, 0), 'fotos_exterior', coalesce(m.fotos_exterior, 0), 'fotos_interior', coalesce(m.fotos_interior, 0),
                    'fotos_area', coalesce(m.fotos_area, 0), 'fechada', coalesce(m.fechada, false))
                  FROM (SELECT 1) u LEFT JOIN negocio_medidas m ON m.negocio_id = p_negocio),
      'servicos', (SELECT jsonb_agg(jsonb_build_object('servico', s.servico_id, 'inclusao', s.inclusao, 'quantidade', s.quantidade, 'mantem', s.mantem,
                     'cliente_compra', s.cliente_compra) ORDER BY s.servico_id, s.inclusao, s.quantidade, s.cliente_compra) FROM negocio_servicos s WHERE s.negocio_id = p_negocio),
      'produtos', (SELECT jsonb_agg(jsonb_build_object('produto', p.produto_id, 'quantidade', p.quantidade, 'cliente_fornece', coalesce(p.cliente_fornece, false),
                     'servico', p.servico_id, 'sem_instalacao', coalesce(p.sem_instalacao, false)) ORDER BY p.produto_id, p.servico_id, p.quantidade)
                   FROM negocio_produtos p WHERE p.negocio_id = p_negocio),
      'partes', (SELECT jsonb_agg(DISTINCT x.parte ORDER BY x.parte) FROM negocio_partes_fora x WHERE x.negocio_id = p_negocio),
      -- das respostas, o que ficou combinado na visita (v<n>_combinado) e o diagnóstico da área (diag_…, div_<divisão>_diag_…)
      'respostas', (SELECT jsonb_object_agg(r.campo_chave, jsonb_build_object('valor', coalesce(r.valor, ''), 'sugerido', coalesce(r.sugerido, false)))
                    FROM negocio_respostas r WHERE r.negocio_id = p_negocio AND r.campo_chave ~ '^(v[0-9]+_combinado$|diag_|div_[a-z0-9]+_diag_)')
    ),
    -- 20270113110000 (F3): as medidas retificadas no local e a sua aceitação (negocios.obra.planear): as respostas retif_… (as medidas, as
    --   notas, a planta, quem e quando aceitou). Desde a 20270112800000, retif_aceite desbloqueia a aprovação do plano, o contrato e a EC.
    'retif', (SELECT jsonb_object_agg(r.campo_chave, coalesce(r.valor, ''))
              FROM negocio_respostas r WHERE r.negocio_id = p_negocio AND r.campo_chave LIKE 'retif\_%'),
    -- 20270125600000: o acerto do valor (nota de crédito, sem adenda, a aprovação da Direção) e quem vai medir (supervisor_medidas)
    'acerto', (SELECT jsonb_object_agg(r.campo_chave, coalesce(r.valor, ''))
               FROM negocio_respostas r WHERE r.negocio_id = p_negocio
                 AND r.campo_chave IN ('acerto_valor', 'nota_credito', 'acerto_sem_adenda_aprov', 'acerto_sem_adenda_por', 'supervisor_medidas')),
    -- 20270105200000: o que o comercial regista da decisão do cliente (negocios.proposta.decidir): o pedido de alterações de cada versão
    --   (do orçamento e das adendas) e a decisão de cada adenda
    'decisao', jsonb_build_object(
      'pedidos', coalesce((SELECT jsonb_object_agg(q.chave, jsonb_build_object('motivos', to_jsonb(q.pedido_cliente_motivos), 'nota', q.pedido_cliente_nota,
                   'em', q.pedido_cliente_em)) FROM q
                 WHERE q.pedido_cliente_motivos IS NOT NULL OR q.pedido_cliente_nota IS NOT NULL OR q.pedido_cliente_em IS NOT NULL), '{}'::jsonb),
      'adendas', coalesce((SELECT jsonb_object_agg(a.numero::text, jsonb_build_object('referencia', a.referencia, 'estado', a.estado,
                   'recusa', a.recusa_motivo)) FROM adendas a WHERE a.negocio_id = p_negocio), '{}'::jsonb)
    )
  )
$function$;

CREATE OR REPLACE FUNCTION public.neg_guardar_negocio(p_org uuid, p_negocio_id uuid, p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'pessoas.edit');
  v_neg negocios; b jsonb := p_linhas->'negocio'; e jsonb; o jsonb; l jsonb; k jsonb;
  v_q uuid; v_l uuid; v_z uuid; v_prop uuid; v_atual uuid; v_aceite uuid; v_c uuid; v_c_ant uuid; v_f uuid; v_pg uuid;
  i int; v_iva numeric; v_tot numeric; v_estado text; v_status text; v_ids uuid[] := '{}'; v_avisos text[] := '{}';
  v_docs_crm boolean; v_q_base text; v_c_base text; v_fixo boolean;
  v_min smallint; v_fase smallint; v_ignorado boolean := false;
  v_antes jsonb; v_depois jsonb; -- 20270102210000
  v_dec_antes jsonb; v_dec_depois jsonb; -- 20270106040000
  v_so_visita boolean := false; v_cont_antes jsonb; -- 20270113130000
  v_so_agenda boolean := false; v_agenda_antes jsonb; -- 20270114320000
  v_abertos boolean; -- 20270117830000
BEGIN
  -- 20270111100000: quem lê os negócios reduzidos (sem pessoas.view, com negocios.obra.executar: sem orçamentos, contratos nem faturas)
  -- não os grava por aqui: gravar o que leu apagava o que não recebeu
  IF public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view): só lê o negócio reduzido da obra e não o pode gravar.' USING ERRCODE = 'CT001';
  END IF;
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  -- 20270110400000: o âmbito de pessoas.edit sobre o negócio (dono = assigned_to/created_by; TEAM/ORG pelas chaves). Mantêm o acesso
  -- de antes: admin, quem entra sem pessoas.edit no perfil (Papel no Negócio, obra.planear/executar) ou tem um Papel no Negócio
  -- que dá pessoas.edit, e quem tem tarefas na obra deste negócio (fn_neg_no_ambito).
  IF NOT public.fn_neg_no_ambito(v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  -- 20270125020000 início (auditoria 19/11): a versão que o ecrã leu (p_linhas.versao_lida, de neg_versoes). Outra gravação depois
  --   dessa leitura: NE015 e nada se grava. Sem versao_lida (os chamadores antigos), grava como antes. Tranca a versão até ao fim
  --   (duas gravações do mesmo negócio já não se cruzam) e sobe-a; o negócio relê-se já com o trinco.
  PERFORM public.fn_neg_versao_conferir(p_negocio_id, p_linhas);
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  -- 20270125020000 fim

  -- 20270113130000 (cada fase pede a sua permissão; substitui a regra da 20270113120000, que fica como um caso desta): gravar o negócio
  --   pede, além de pessoas.edit, uma permissão da fase em que ele está na base (a gravada ou a dada pelo servidor), por perfil, Papel
  --   no Negócio ou admin (fn_cat_pode). O mapa (o mesmo de PERMS_DA_FASE, src/emylia/permissoes.ts):
  --     Por contactar / Contacto (0, 1)        negocios.contacto.registar
  --     Contacto «passado ao comercial» e Visita (1 com contacto_concluido, 2)   negocios.visita.gerir
  --     Negócio (3)   negocios.orcamento.editar, negocios.margem.aprovar, negocios.proposta.enviar, negocios.proposta.decidir e
  --                   negocios.contrato.editar (20270117200000: sem negocios.obra.planear; as medidas e o plano passaram à Obra, 20270116000000)
  --     Financeiro (4) sem permissão de fase (fica pessoas.edit, como antes; não foi pedido e tiraria a fatura a quem a regista)
  --     Obra (5)      as negocios.obra.* e as do Negócio (as adendas) e, 20270117200000, negocios.registar_fatura e
  --                   negocios.validar_pagamento: o Financeiro fatura as prestações, as adendas e a fatura final e valida os pagamentos
  --                   na Obra (o 1.º pagamento validado já a passa a Obra)
  --   Prova a 11/11 (SELECT a todos os perfis com pessoas.edit e aos papéis): só perdem o perfil «Assistente Comercial» (Negócio e Obra) e
  --   o «Gestor de obra» (Contacto e Visita), que é o pretendido; nenhum papel perde.
  DECLARE
    v_fb smallint := greatest(coalesce(v_neg.fase, 0), public.fn_neg_fase_minima(p_negocio_id));
    v_concl boolean := EXISTS (SELECT 1 FROM negocio_respostas r WHERE r.negocio_id = p_negocio_id AND r.campo_chave = 'contacto_concluido'
                                 AND coalesce(r.valor, '') <> '');
    v_da_fase text[];
  BEGIN
    v_da_fase := CASE
      WHEN v_fb <= 1 AND NOT v_concl THEN ARRAY['negocios.contacto.registar', 'negocios.visita.gerir']
      WHEN v_fb <= 2 THEN ARRAY['negocios.visita.gerir', 'negocios.visita.preencher'] -- 20270114320000: uma das duas; o que muda decide
      WHEN v_fb = 3 THEN ARRAY['negocios.orcamento.editar', 'negocios.margem.aprovar', 'negocios.proposta.enviar', 'negocios.proposta.decidir',
                               'negocios.contrato.editar']
      WHEN v_fb = 4 THEN NULL
      ELSE ARRAY['negocios.obra.planear', 'negocios.obra.executar', 'negocios.obra.materiais', 'negocios.obra.imprevistos', 'negocios.obra.fechar',
                 'negocios.obra.tecnico', 'negocios.orcamento.editar', 'negocios.margem.aprovar', 'negocios.proposta.enviar',
                 'negocios.proposta.decidir', 'negocios.contrato.editar', 'negocios.registar_fatura', 'negocios.validar_pagamento']
    END;
    -- em Contacto, quem gere visitas sem contacto.registar (o comercial) grava para marcar a visita, mas não muda os dados do Contacto:
    -- fotografa-se aqui e compara-se no fim (v_so_visita, v_cont_antes)
    IF v_fb <= 1 AND NOT v_concl AND NOT public.fn_cat_pode(p_org, 'negocios.contacto.registar') THEN
      v_so_visita := true;
      v_cont_antes := public.fn_neg_dados_contacto(p_negocio_id);
    END IF;
    -- 20270114320000: na Visita (2), quem só gere as visitas (marcar, remarcar, cancelar: a assistente comercial) não muda mais nada do negócio
    IF v_fb = 2 AND NOT public.fn_cat_pode(p_org, 'negocios.visita.preencher') THEN
      v_so_agenda := true;
      v_agenda_antes := public.fn_neg_dados_contacto(p_negocio_id);
    END IF;
    IF v_da_fase IS NOT NULL AND NOT EXISTS (SELECT 1 FROM unnest(v_da_fase) AS c(codigo) WHERE public.fn_cat_pode(p_org, c.codigo)) THEN
      RAISE EXCEPTION 'Sem permissão (%): não pode mudar este negócio na fase em que está.', v_da_fase[1] USING ERRCODE = 'CT001';
    END IF;
  END;

  -- um negócio do CRM (orçamentos, contratos ou vendas diretas do CRM) não se grava por aqui: abre-se em Contratos/Propostas; e o
  -- negócio só passa ao fluxo da Emylia se não tiver documentos do CRM (com fluxo_emylia a encomenda do CRM deixava de reservar) (20261231994000)
  v_docs_crm := public.fn_neg_docs_crm(p_negocio_id);
  IF NOT coalesce(v_neg.fluxo_emylia, false) AND v_docs_crm THEN
    RAISE EXCEPTION 'Este negócio é do CRM: abra-o em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;

  -- as permissões finas (20270102210000): pessoas.edit grava o comum (lead, visita, levantamento, serviços, histórico); o orçamento, a
  -- aprovação da margem, o envio da proposta e o contrato pedem cada um a sua, só quando mudam de verdade (a fotografia da base antes e
  -- depois). Quem não vê custos grava com os custos da base (a leitura deu-lhos a null); quem não edita o orçamento, com os totais da base.
  v_antes := public.fn_neg_marcas_permissoes(p_negocio_id);
  v_dec_antes := public.fn_neg_marcas_decisao_principal(p_negocio_id); -- 20270106040000
  -- 20270117830000: as medidas retificadas e o contrato só depois do pagamento validado (fn_neg_medidas_e_plano_abertos). Lê-se antes
  --   de gravar: o JSON (ex.: venda_direta numa versão aceite) não abre a porta a si próprio.
  v_abertos := public.fn_neg_medidas_e_plano_abertos(p_negocio_id);
  -- 20270110200000: "vê custos" é a regra única fn_quote_custos_pode (a mesma da leitura): quem os vê grava-os.
  IF NOT public.fn_quote_custos_pode(p_org) THEN p_linhas := public.fn_neg_repor_custos(p_negocio_id, p_linhas); END IF;
  IF NOT public.fn_cat_pode(p_org, 'negocios.orcamento.editar') THEN p_linhas := public.fn_neg_repor_totais(p_negocio_id, p_linhas); END IF;

  -- a fase 4 (contrato assinado ou venda direta aceite) e a 5 (encomenda de cliente emitida) são do servidor, como a fatura, o
  -- pagamento, o recibo e a anulação (neg_registar_fatura, neg_validar_pagamento, neg_anular_contrato): do JSON fica só a fase até ao
  -- Negócio (3); o resto fica o da base, com aviso (20261231999700)
  v_min := public.fn_neg_fase_minima(p_negocio_id);
  v_fase := CASE WHEN v_neg.anulado_em IS NOT NULL THEN v_neg.fase
                 WHEN v_min > 0 THEN v_min
                 ELSE least(coalesce((b->>'fase')::smallint, 0), 3)::smallint END;
  IF b ? 'fase' AND (b->>'fase')::smallint IS DISTINCT FROM v_fase AND greatest(coalesce((b->>'fase')::smallint, 0), coalesce(v_fase, 0)) >= 4 THEN
    v_avisos := v_avisos || format('A fase %s só a dão o portal e o Financeiro (ficou %s).', b->>'fase', coalesce(v_fase, 0));
  END IF;
  IF (b ? 'fatura_numero' AND b->>'fatura_numero' IS DISTINCT FROM v_neg.fatura_numero)
     OR (b ? 'fatura_paga' AND coalesce((b->>'fatura_paga')::boolean, false) IS DISTINCT FROM coalesce(v_neg.fatura_paga, false))
     OR (b ? 'recibo_numero' AND b->>'recibo_numero' IS DISTINCT FROM v_neg.recibo_numero)
     OR (b ? 'anulado_em' AND (b->>'anulado_em' IS NULL) IS DISTINCT FROM (v_neg.anulado_em IS NULL)) THEN
    v_ignorado := true;
  END IF;

  -- o negócio (o título só muda num negócio aberto: o CRM protege o dos fechados)
  UPDATE negocios SET fase = v_fase, linha = b->>'linha', linha_por_definir = coalesce((b->>'linha_por_definir')::boolean, false),
    servico_pedido = b->>'servico_pedido', morada_obra = b->>'morada_obra', origem = b->>'origem', pedido_em = (b->>'pedido_em')::timestamptz,
    dono_papel = b->>'dono_papel',
    fluxo_emylia = coalesce(v_neg.fluxo_emylia, false) OR NOT v_docs_crm,
    titulo = CASE WHEN v_neg.estado = 'aberto' AND coalesce(b->>'titulo', '') <> '' THEN b->>'titulo' ELSE titulo END
  WHERE id = p_negocio_id;

  -- respostas, medidas, serviços e produtos da visita, partes tiradas, histórico (substituem-se)
  DELETE FROM negocio_respostas WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_respostas (organization_id, negocio_id, campo_chave, valor, sugerido, atualizado_por)
  SELECT p_org, p_negocio_id, x->>'campo_chave', coalesce(x->>'valor', ''), coalesce((x->>'sugerido')::boolean, false), v_user
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'respostas')) x;
  e := p_linhas->'medidas';
  INSERT INTO negocio_medidas AS m (organization_id, negocio_id, pav, par, ptf, ptq, pts, pcs, necessidades, slot, fotos_total, fotos_exterior, fotos_interior, fotos_area, fechada, visitas)
  VALUES (p_org, p_negocio_id, coalesce((e->>'pav')::numeric, 0), coalesce((e->>'par')::numeric, 0), coalesce((e->>'ptf')::numeric, 0), coalesce((e->>'ptq')::numeric, 0),
    coalesce((e->>'pts')::numeric, 0), coalesce((e->>'pcs')::numeric, 0), ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(e->'necessidades'))), e->>'slot',
    coalesce((e->>'fotos_total')::smallint, 0), coalesce((e->>'fotos_exterior')::smallint, 0), coalesce((e->>'fotos_interior')::smallint, 0),
    coalesce((e->>'fotos_area')::smallint, 0), coalesce((e->>'fechada')::boolean, false),
    ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'visitas'))::smallint))
  ON CONFLICT (negocio_id) DO UPDATE SET pav = EXCLUDED.pav, par = EXCLUDED.par, ptf = EXCLUDED.ptf, ptq = EXCLUDED.ptq, pts = EXCLUDED.pts, pcs = EXCLUDED.pcs,
    necessidades = EXCLUDED.necessidades, slot = EXCLUDED.slot, fotos_total = EXCLUDED.fotos_total, fotos_exterior = EXCLUDED.fotos_exterior,
    fotos_interior = EXCLUDED.fotos_interior, fotos_area = EXCLUDED.fotos_area, fechada = EXCLUDED.fechada, visitas = EXCLUDED.visitas;
  DELETE FROM negocio_servicos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_servicos (organization_id, negocio_id, servico_id, inclusao, quantidade, mantem, cliente_compra, ordem)
  SELECT p_org, p_negocio_id, (x->>'servico')::uuid, x->>'inclusao', (x->>'quantidade')::numeric, (x->>'mantem')::boolean, x->>'cliente_compra', coalesce((x->>'ordem')::int, 0)
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'servicos')) x;
  DELETE FROM negocio_produtos WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_produtos (organization_id, negocio_id, produto_id, quantidade, cliente_fornece, servico_id, sem_instalacao, ordem, nome, unidade, custo_un, pvp_un, categoria_id, fator)
  SELECT p_org, p_negocio_id, (x->>'produto')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid,
    coalesce((x->>'sem_instalacao')::boolean, false), (x->>'ordem')::int, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
    (x->>'categoria')::uuid, (x->>'fator')::numeric
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'produtos')) x;
  DELETE FROM negocio_partes_fora WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_partes_fora (organization_id, negocio_id, parte)
  SELECT DISTINCT p_org, p_negocio_id, x FROM jsonb_array_elements_text(public.fn_neg_lista(p_linhas->'partes_fora')) x;
  -- 20270125030000 início (auditoria 19/11): o histórico só cresce. O que já está na base não se apaga nem muda; do JSON entram só
  --   as entradas que a base ainda não tem, à frente das outras (fn_neg_historico_acrescentar).
  PERFORM public.fn_neg_historico_acrescentar(p_org, p_negocio_id, public.fn_neg_lista(p_linhas->'historico'));
  -- 20270125030000 fim

  -- orçamentos (quotes), uma linha por versão
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'orcamentos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id INTO v_q FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND versao = (o->>'versao')::smallint;
    IF v_q IS NULL THEN
      INSERT INTO quotes (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, modelo_base, versao, fluxo_emylia, estado)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero || ' · versão ' || (o->>'versao'),
        coalesce(o->>'modelo', ''), (o->>'versao')::smallint, true, 'rascunho')
      RETURNING id INTO v_q;
    END IF;
    -- a decisão do cliente (aceite, recusado) só a escreve o portal: a versão decidida fica como está (só passa a substituída, quando
    -- há versão nova); o JSON não a dá como aceite nem recusada; accepted_at, recusada_em e recusa_* ficam os da base (20261231994000)
    SELECT estado INTO v_q_base FROM quotes WHERE id = v_q;
    v_estado := o->>'estado';
    IF v_q_base IN ('aceite', 'rejeitado', 'recusado') THEN
      IF v_estado IS DISTINCT FROM 'substituido' THEN v_estado := v_q_base; END IF;
    ELSIF v_estado IN ('aceite', 'recusado', 'rejeitado') THEN
      v_avisos := v_avisos || format('Orçamento versão %s: a decisão do cliente só se regista no portal (ficou %s).', o->>'versao', coalesce(v_q_base, 'rascunho'));
      v_estado := coalesce(v_q_base, 'rascunho');
    END IF;
    UPDATE quotes SET modelo_base = coalesce(o->>'modelo', ''), estado = v_estado, desconto_fracao = (o->>'desconto')::numeric,
      desconto_global_percent = round(coalesce((o->>'desconto')::numeric, 0) * 100, 2), venda_direta = coalesce((o->>'venda_direta')::boolean, false),
      inicio_obra = (o->>'inicio_obra')::date, equipa = (o->>'equipa')::smallint,
      verificado_em = CASE WHEN coalesce((o->>'verificado')::boolean, false) THEN coalesce(verificado_em, now()) END,
      aprovacao = o->>'aprovacao', motivos_versao = ARRAY(SELECT jsonb_array_elements_text(public.fn_neg_lista(o->'motivos_versao'))), nota_versao = o->>'nota_versao',
      onde_refeita = o->>'onde_refeita',
      pedido_cliente_motivos = CASE WHEN o->'pedido_cliente' IS NOT NULL AND jsonb_typeof(o->'pedido_cliente') = 'object' THEN ARRAY(SELECT jsonb_array_elements_text(o->'pedido_cliente'->'motivos')) END,
      pedido_cliente_nota = o->'pedido_cliente'->>'nota', pedido_cliente_em = (o->'pedido_cliente'->>'em')::timestamptz,
      enviado_em = (o->>'enviado_em')::timestamptz, substituido_em = (o->>'substituido_em')::timestamptz,
      aceite_antes_em = (o->>'aceite_antes_em')::timestamptz, preco_final = (o->>'preco_final')::numeric, total_com_iva = (o->>'total_com_iva')::numeric,
      subtotal = coalesce((o->>'preco_final')::numeric, subtotal), total = coalesce((o->>'total_com_iva')::numeric, total),
      prestacoes_por_fases = coalesce((o->>'prestacoes_por_fases')::boolean, false), sem_demolicao = coalesce((o->>'sem_demolicao')::boolean, false), updated_at = now()
    WHERE id = v_q;
    IF v_estado <> 'substituido' THEN v_atual := v_q; END IF;
    IF v_estado = 'aceite' THEN v_aceite := v_q; END IF;

    -- as linhas de uma versão aceite, assinada, com a encomenda emitida ou já usadas (encomenda a fornecedor, tarefa da obra) não se
    -- apagam nem se reescrevem: os ids ficam; se o JSON divergir, avisa-se (20261231994000)
    v_fixo := v_q_base = 'aceite'
      OR EXISTS (SELECT 1 FROM client_contracts c WHERE c.quote_id = v_q AND c.deleted_at IS NULL
                 AND (c.status IN ('signed', 'assinado', 'active') OR c.ec_emitida_em IS NOT NULL))
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN purchase_order_items pi ON pi.quote_line_id = ql.id WHERE ql.quote_id = v_q)
      OR EXISTS (SELECT 1 FROM quote_lines ql JOIN ops_obra_tarefa t ON t.orcamento_linha_id = ql.id WHERE ql.quote_id = v_q);
    IF v_fixo THEN
      IF (SELECT count(*) FROM quote_lines WHERE quote_id = v_q) <> jsonb_array_length(public.fn_neg_lista(o->'linhas'))
         OR (SELECT coalesce(sum(total_sem_iva), 0) FROM quote_lines WHERE quote_id = v_q)
            <> (SELECT coalesce(sum(round((x->>'quantidade')::numeric * (x->>'preco_un')::numeric, 2)), 0) FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) x) THEN
        v_avisos := v_avisos || format('Orçamento versão %s: já está aceite ou em curso, as linhas ficaram como estavam.', o->>'versao');
      END IF;
    ELSE
    -- linhas (substituem-se; as filhas vão com elas) e zonas
    DELETE FROM quote_lines WHERE quote_id = v_q;
    DELETE FROM quote_zonas WHERE quote_id = v_q;
    i := 0;
    FOR k IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'zonas')) LOOP
      i := i + 1;
      INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome) VALUES (p_org, v_q, i, k #>> '{}');
    END LOOP;
    -- as zonas que as linhas usam e não estão na lista (as versões anteriores não guardam a lista): criam-se pela ordem em que aparecem
    INSERT INTO quote_zonas (organization_id, quote_id, ordem, nome)
    SELECT p_org, v_q, (SELECT coalesce(max(ordem), 0) FROM quote_zonas WHERE quote_id = v_q) + row_number() OVER (ORDER BY min(x.pos)), x.nome
    FROM (SELECT z.v->>'zona' AS nome, ln.n * 1000 + z.n AS pos
          FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) WITH ORDINALITY ln(v, n),
               jsonb_array_elements(public.fn_neg_lista(ln.v->'zonas')) WITH ORDINALITY z(v, n)) x
    WHERE NOT EXISTS (SELECT 1 FROM quote_zonas q2 WHERE q2.quote_id = v_q AND lower(btrim(q2.nome)) = lower(btrim(x.nome)))
    GROUP BY x.nome;
    FOR l IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(o->'linhas')) LOOP
      v_iva := coalesce((l->>'taxa_iva')::numeric, CASE WHEN l->>'parte_iva' = 'mao_obra' THEN 6 ELSE 23 END);
      v_tot := round((l->>'quantidade')::numeric * (l->>'preco_un')::numeric, 2);
      INSERT INTO quote_lines (quote_id, categoria, descricao_snapshot, qt, quantidade_exata, retail_price_unit, preco_un_exato, cost_price, custo_un_exato,
        iva_percent, iva_explicita, total_sem_iva, total_com_iva, total_com_desconto, ordem, service_id, product_id, unidade, section_name, tipo_emylia, custo_manual, fornecedor,
        qtd_origem, preco_un_origem, custo_un_origem, custo_mao_obra_unit, custo_material_unit, margem_percent)
      VALUES (v_q, CASE WHEN l->>'tipo' = 'servico' THEN 'Serviços' ELSE 'Materiais' END,
        coalesce((SELECT s.name FROM services s WHERE s.id = (l->>'servico')::uuid), l->>'descricao', ''),
        -- uma linha de produto guarda o total (quantidade 1); qt e o preço unitário do CRM ficam com a quantidade real do produto, para a
        -- reserva e o pedido ao fornecedor da encomenda de cliente o verem (20261231980000)
        CASE WHEN l->>'tipo' = 'produto' AND l->>'qtd_origem' IS NOT NULL THEN round((l->>'qtd_origem')::numeric, 2) ELSE round((l->>'quantidade')::numeric, 2) END,
        (l->>'quantidade')::numeric,
        CASE WHEN l->>'tipo' = 'produto' AND l->>'preco_un_origem' IS NOT NULL THEN round((l->>'preco_un_origem')::numeric, 2) ELSE round((l->>'preco_un')::numeric, 2) END,
        (l->>'preco_un')::numeric,
        (l->'custo'->>'custo_un')::numeric, (l->'custo'->>'custo_un')::numeric, v_iva, l->>'taxa_iva' IS NOT NULL,
        v_tot, round(v_tot * (1 + v_iva / 100), 2), v_tot, (l->>'ordem')::int, (l->>'servico')::uuid, (l->>'produto')::uuid, l->>'unidade',
        coalesce(l->'zonas'->0->>'zona', 'Geral'), l->>'tipo', coalesce((l->'custo'->>'manual')::boolean, false), l->>'fornecedor',
        (l->>'qtd_origem')::numeric, (l->>'preco_un_origem')::numeric, (l->>'custo_un_origem')::numeric,
        CASE WHEN l->>'tipo' = 'servico' THEN round((l->'custo'->>'custo_un')::numeric, 2) ELSE 0 END,
        CASE WHEN l->>'tipo' = 'servico' THEN 0 ELSE round((l->'custo'->>'custo_un')::numeric, 2) END, 0)
      RETURNING id INTO v_l;
      k := l->'custo';
      INSERT INTO quote_line_custos (organization_id, quote_line_id, congelado, congelado_em, horas_un, mao_obra_un, equipamentos_un, consumiveis_un, estrutura_hora, estrutura_un, ajuste_un)
      VALUES (p_org, v_l, coalesce((k->>'congelado')::boolean, false), (k->>'congelado_em')::timestamptz, coalesce((k->>'horas_un')::numeric, 0),
        coalesce((k->>'mao_obra_un')::numeric, 0), coalesce((k->>'equipamentos_un')::numeric, 0), coalesce((k->>'consumiveis_un')::numeric, 0),
        coalesce((k->>'estrutura_hora')::numeric, 0), coalesce((k->>'estrutura_un')::numeric, 0), coalesce((k->>'ajuste_un')::numeric, 0));
      INSERT INTO quote_line_oficios (organization_id, quote_line_id, ordem, perfil_chave, nome, horas_un, custo_hora, tecnicos)
      SELECT p_org, v_l, (x.n - 1)::smallint, x.v->>'perfil_chave', x.v->>'nome', (x.v->>'horas_un')::numeric, (x.v->>'custo_hora')::numeric,
        CASE WHEN jsonb_typeof(x.v->'tecnicos') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(x.v->'tecnicos')) END
      FROM jsonb_array_elements(public.fn_neg_lista(k->'oficios')) WITH ORDINALITY x(v, n);
      INSERT INTO quote_line_zonas (organization_id, quote_line_id, zona_id, ordem, quantidade, valor)
      SELECT p_org, v_l, z.id, (x.n - 1)::smallint, (x.v->>'quantidade')::numeric, (x.v->>'valor')::numeric
      FROM jsonb_array_elements(public.fn_neg_lista(l->'zonas')) WITH ORDINALITY x(v, n)
      JOIN quote_zonas z ON z.quote_id = v_q AND lower(btrim(z.nome)) = lower(btrim(x.v->>'zona'));
    END LOOP;
    -- uma linha com zonas cujo nome não está na lista de zonas do orçamento: a zona cria-se (a Emylia deixa)
    -- (não acontece nos dados da Emylia: as zonas das linhas vêm da lista; fica a nota)
    END IF;

    DELETE FROM quote_prazo WHERE quote_id = v_q;
    INSERT INTO quote_prazo (organization_id, quote_id, tarefa, dias)
    SELECT p_org, v_q, x->>'tarefa', (x->>'dias')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'prazo')) x;
    -- prestações: as faturas apontam para elas, por isso atualizam-se pela ordem em vez de se apagarem
    INSERT INTO quote_prestacoes AS qp (organization_id, quote_id, ordem, rotulo, pct, marco, fase)
    SELECT p_org, v_q, (x->>'ordem')::smallint, x->>'rotulo', (x->>'pct')::numeric, x->>'marco', (x->>'fase')::smallint
    FROM jsonb_array_elements(public.fn_neg_lista(o->'prestacoes')) x
    ON CONFLICT (quote_id, ordem) DO UPDATE SET rotulo = EXCLUDED.rotulo, pct = EXCLUDED.pct, marco = EXCLUDED.marco, fase = EXCLUDED.fase;
    DELETE FROM quote_prestacoes p WHERE p.quote_id = v_q
      AND p.ordem > jsonb_array_length(public.fn_neg_lista(o->'prestacoes'))
      AND NOT EXISTS (SELECT 1 FROM faturas f WHERE f.quote_prestacao_id = p.id);
    DELETE FROM quote_avisos_vistos WHERE quote_id = v_q;
    INSERT INTO quote_avisos_vistos (organization_id, quote_id, chave) SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'avisos')) x;
    DELETE FROM quote_precos_manuais WHERE quote_id = v_q;
    INSERT INTO quote_precos_manuais (organization_id, quote_id, descricao, preco)
    SELECT p_org, v_q, x->>'descricao', (x->>'preco')::numeric FROM jsonb_array_elements(public.fn_neg_lista(o->'precos_manuais')) x;
    DELETE FROM quote_versao_produtos WHERE quote_id = v_q;
    INSERT INTO quote_versao_produtos (organization_id, quote_id, ordem, produto_id, nome, unidade, custo_un, pvp_un, categoria_id, quantidade, cliente_fornece, servico_id, fator, sem_instalacao)
    SELECT p_org, v_q, (x->>'ordem')::int, (x->>'produto')::uuid, x->>'nome', x->>'unidade', (x->>'custo_un')::numeric, (x->>'pvp_un')::numeric,
      (x->>'categoria')::uuid, (x->>'quantidade')::numeric, coalesce((x->>'cliente_fornece')::boolean, false), (x->>'servico')::uuid, (x->>'fator')::numeric,
      coalesce((x->>'sem_instalacao')::boolean, false)
    FROM jsonb_array_elements(public.fn_neg_lista(o->'produtos')) x;
    DELETE FROM quote_versao_partes WHERE quote_id = v_q;
    INSERT INTO quote_versao_partes (organization_id, quote_id, parte)
    SELECT DISTINCT p_org, v_q, x FROM jsonb_array_elements_text(public.fn_neg_lista(o->'partes_fora')) x;
  END LOOP;

  -- a proposta (uma por negócio): nasce no primeiro envio; a versão atual liga-se a ela, as anteriores desligam-se
  SELECT id INTO v_prop FROM proposals WHERE negocio_id = p_negocio_id AND coalesce(is_deleted, false) = false ORDER BY created_at LIMIT 1;
  IF v_prop IS NULL AND EXISTS (SELECT 1 FROM quotes WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND enviado_em IS NOT NULL) THEN
    INSERT INTO proposals (organization_id, root_organization_id, entity_id, negocio_id, created_by, title, value, status)
    VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'Proposta ' || v_neg.numero, 0, 'draft')
    RETURNING id INTO v_prop;
  END IF;
  IF v_prop IS NOT NULL THEN
    UPDATE quotes SET proposal_id = CASE WHEN id = v_atual THEN v_prop END
    WHERE negocio_id = p_negocio_id AND fluxo_emylia AND deleted_at IS NULL AND proposal_id IS DISTINCT FROM CASE WHEN id = v_atual THEN v_prop END;
    -- o estado só se sincroniza entre rascunho e enviada; aceite e recusada são do portal (e accepted_at, rejected_at e rejection_notes
    -- também) (20261231994000)
    SELECT CASE q.estado WHEN 'enviado' THEN 'sent' WHEN 'rascunho' THEN 'draft' END INTO v_status
    FROM quotes q WHERE q.id = v_atual;
    UPDATE proposals p SET status = v_status, sent_at = coalesce(q.enviado_em, p.sent_at),
      value = coalesce(q.preco_final, p.value), value_sem_iva = coalesce(q.preco_final, p.value_sem_iva), updated_at = now()
    FROM quotes q WHERE p.id = v_prop AND q.id = v_atual AND v_status IS NOT NULL AND p.status IN ('draft', 'sent', 'viewed')
      AND p.status IS DISTINCT FROM v_status;
  END IF;

  -- contratos (client_contracts), uma linha por versão; a anterior fica substituída pela seguinte
  v_c_ant := NULL;
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'contratos')) ORDER BY (value->>'versao')::int LOOP
    SELECT id, status INTO v_c, v_c_base FROM client_contracts WHERE negocio_id = p_negocio_id AND versao = (o->>'versao')::smallint AND deleted_at IS NULL;
    IF v_c IS NULL THEN
      -- depois de uma versão assinada no portal não nasce outra: escondia a assinada (20261231994000)
      IF v_c_ant IS NOT NULL AND EXISTS (SELECT 1 FROM client_contracts WHERE id = v_c_ant AND status IN ('signed', 'assinado', 'active')) THEN
        v_avisos := v_avisos || format('O contrato já está assinado no portal: a versão %s não foi criada.', o->>'versao');
        EXIT;
      END IF;
      INSERT INTO client_contracts (organization_id, root_organization_id, entity_id, negocio_id, created_by, status, versao, quote_id, proposal_id, replaces_contract_id)
      VALUES (p_org, v_neg.root_organization_id, v_neg.entity_id, p_negocio_id, v_user, 'draft', (o->>'versao')::smallint, coalesce(v_aceite, v_atual), v_prop, v_c_ant)
      RETURNING id, status INTO v_c, v_c_base;
    END IF;
    IF v_c_ant IS NOT NULL THEN
      UPDATE client_contracts SET replaced_by_contract_id = v_c, status = 'cancelled', cancelled_at = coalesce(cancelled_at, (o->>'substituido_em')::timestamptz, now())
      WHERE id = v_c_ant AND replaced_by_contract_id IS DISTINCT FROM v_c AND status NOT IN ('signed', 'assinado', 'active', 'rejected', 'cancelled');
    END IF;
    -- um contrato assinado, recusado ou cancelado não se mexe; a assinatura (signature_*, signed_by_name, signature_date) e o estado
    -- assinado só os escreve o portal: "assinado" no JSON ignora-se, com aviso (20261231994000)
    IF v_c_base IN ('signed', 'assinado', 'active', 'rejected', 'cancelled') THEN
      v_c_ant := v_c;
      CONTINUE;
    END IF;
    IF o->>'estado' = 'assinado' THEN v_avisos := v_avisos || 'A assinatura só se faz no portal do cliente.'::text; END IF;
    v_status := CASE o->>'estado' WHEN 'enviado' THEN 'pending_signature' WHEN 'alteracoes_pedidas' THEN 'changes_requested'
                  WHEN 'substituido' THEN 'cancelled' WHEN 'assinado' THEN v_c_base ELSE 'draft' END;
    UPDATE client_contracts SET revisto_por = o->>'revisto_por', revisto_em = (o->>'revisto_em')::timestamptz,
      quote_id = coalesce(quote_id, v_aceite, v_atual), proposal_id = coalesce(proposal_id, v_prop), updated_at = now()
    WHERE id = v_c;
    -- o estado à parte, para os gatilhos do CRM verem a passagem
    UPDATE client_contracts SET status = v_status, status_changed_by = v_user, status_changed_at = now()
    -- a versão substituída só muda de estado quando se liga à seguinte (no mesmo UPDATE): cancelada sem substituta seria perda
    WHERE id = v_c AND status IS DISTINCT FROM v_status AND replaced_by_contract_id IS NULL AND o->>'estado' <> 'substituido';
    DELETE FROM client_contract_pedidos WHERE contract_id = v_c;
    INSERT INTO client_contract_pedidos (organization_id, contract_id, ordem, clausula, nota, pedido_em)
    SELECT p_org, v_c, (x.n - 1)::smallint, x.v->>'clausula', x.v->>'nota', coalesce((x.v->>'pedido_em')::timestamptz, now())
    FROM jsonb_array_elements(public.fn_neg_lista(o->'pedidos')) WITH ORDINALITY x(v, n);
    DELETE FROM client_contract_clausulas WHERE contract_id = v_c;
    INSERT INTO client_contract_clausulas (organization_id, contract_id, titulo, texto)
    SELECT p_org, v_c, x->>'titulo', x->>'texto' FROM jsonb_array_elements(public.fn_neg_lista(o->'clausulas')) x;
    v_c_ant := v_c;
  END LOOP;

  -- a encomenda de cliente nasce no servidor (fn_neg_emitir_ec_se_pronta: fatura registada e pagamento validado): a do JSON ignora-se
  -- (20261231999700)
  IF jsonb_typeof(p_linhas->'ec') = 'object' AND public.fn_neg_fase_minima(p_negocio_id) < 5 THEN
    v_ignorado := true;
  END IF;

  -- as faturas, os pagamentos e os recibos são do Financeiro (neg_registar_fatura, neg_validar_pagamento): do JSON só o PDF de uma
  -- fatura que já existe; uma fatura nova ou um pagamento por validar ficam de fora, com aviso (20261231999700)
  FOR o IN SELECT * FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'faturas')) LOOP
    SELECT id INTO v_f FROM faturas WHERE negocio_id = p_negocio_id AND chave = o->>'chave';
    IF v_f IS NULL THEN v_ignorado := true; CONTINUE; END IF;
    UPDATE faturas SET pdf_caminho = coalesce(o->>'pdf_caminho', pdf_caminho) WHERE id = v_f;
    IF jsonb_typeof(o->'pagamento') = 'object'
       AND NOT EXISTS (SELECT 1 FROM pagamentos WHERE fatura_id = v_f AND validado_em IS NOT NULL) THEN
      v_ignorado := true;
    END IF;
  END LOOP;

  -- as adendas (20261231990000); os avisos delas juntam-se aos do negócio (20261231994000)
  v_avisos := v_avisos || public.fn_neg_guardar_adendas(p_org, p_negocio_id, p_linhas->'adendas', v_user);

  -- as visitas com dia e hora vão para a agenda do CRM (20261231970000)
  v_avisos := v_avisos || public.fn_neg_sincronizar_visitas(p_org, p_negocio_id, p_linhas->'respostas', p_linhas->'visitas');

  IF v_ignorado THEN
    v_avisos := v_avisos || 'A fatura, o pagamento, o recibo, a encomenda de cliente e a anulação só se registam no Financeiro: ficou o que está na base.'::text;
  END IF;

  -- 20270102210000: o que mudou de verdade pede a permissão de cada parte (a exceção desfaz a gravação toda)
  v_depois := public.fn_neg_marcas_permissoes(p_negocio_id);
  IF (v_depois->'orc') IS DISTINCT FROM (v_antes->'orc') AND NOT public.fn_cat_pode(p_org, 'negocios.orcamento.editar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.orcamento.editar): não pode mudar o orçamento (linhas, preços, custos, desconto, versões ou adendas).' USING ERRCODE = 'CT001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(v_depois->'aprov') d WHERE d.value <> 'pedida' AND d.value IS DISTINCT FROM (v_antes->'aprov'->>d.key))
     AND NOT public.fn_cat_pode(p_org, 'negocios.margem.aprovar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.margem.aprovar): não pode aprovar a margem do orçamento (é da Direção).' USING ERRCODE = 'CT001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each_text(v_depois->'envio') d WHERE d.value = 'enviado' AND (v_antes->'envio'->>d.key) IS DISTINCT FROM 'enviado')
     AND NOT public.fn_cat_pode(p_org, 'negocios.proposta.enviar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.proposta.enviar): não pode enviar a proposta ao cliente.' USING ERRCODE = 'CT001';
  END IF;
  IF (v_depois->'contrato') IS DISTINCT FROM (v_antes->'contrato') AND NOT public.fn_cat_pode(p_org, 'negocios.contrato.editar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.contrato.editar): não pode mudar o contrato (estado, cláusulas, pedidos do cliente ou revisão).' USING ERRCODE = 'CT001';
  END IF;
  -- 20270105200000: a passagem de fase dada pelo ecrã (0 a 3; a que não é dada pelo servidor) divide-se: entre Por contactar (0) e
  --   Contacto (1) é do contacto; a que chega à Visita (2) ou ao Negócio (3) é da visita (0→2 pede as duas).
  -- o contacto: o resultado da chamada, as tentativas, o voltar a ligar e a passagem a Contacto
  IF ((v_depois->'contacto') IS DISTINCT FROM (v_antes->'contacto')
      OR (v_min = 0 AND v_neg.anulado_em IS NULL AND coalesce(v_neg.fase, 0) <> v_fase AND greatest(coalesce(v_neg.fase, 0), v_fase) <= 3
          AND least(coalesce(v_neg.fase, 0), v_fase) = 0))
     AND NOT public.fn_cat_pode(p_org, 'negocios.contacto.registar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.contacto.registar): não pode registar o contacto nem passar o negócio a Contacto.' USING ERRCODE = 'CT001';
  END IF;
  -- a visita e o diagnóstico no local (marcar/cancelar/apagar visitas, medidas, fotografias, serviços e produtos da visita, fechar ou
  --   reabrir o levantamento) e a passagem à Visita ou ao Negócio
  -- 20270114320000: a agenda (marcar, remarcar, cancelar) e a passagem do Contacto à Visita pedem negocios.visita.gerir
  IF ((v_depois->'visita') IS DISTINCT FROM (v_antes->'visita')
      OR (v_min = 0 AND v_neg.anulado_em IS NULL AND coalesce(v_neg.fase, 0) <> v_fase AND greatest(coalesce(v_neg.fase, 0), v_fase) BETWEEN 2 AND 3
          AND least(coalesce(v_neg.fase, 0), v_fase) < 2))
     AND NOT public.fn_cat_pode(p_org, 'negocios.visita.gerir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode marcar, remarcar nem cancelar as visitas.' USING ERRCODE = 'CT001';
  END IF;
  -- 20270114320000: preencher a visita (medidas, fotografias, necessidades, serviços e produtos, diagnóstico, o combinado) e fechar ou
  --   reabrir o levantamento (a passagem da Visita ao Negócio, e de volta) pedem negocios.visita.preencher
  IF ((v_depois->'diagnostico') IS DISTINCT FROM (v_antes->'diagnostico')
      OR (v_min = 0 AND v_neg.anulado_em IS NULL AND coalesce(v_neg.fase, 0) <> v_fase AND greatest(coalesce(v_neg.fase, 0), v_fase) = 3))
     AND NOT public.fn_cat_pode(p_org, 'negocios.visita.preencher') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.preencher): não pode preencher a visita nem fechar o levantamento.' USING ERRCODE = 'CT001';
  END IF;
  -- 20270113110000 (F3): aceitar as medidas retificadas (ou voltar a retificar, ou mudar as medidas, as notas ou a planta da retificação)
  --   pede negocios.obra.planear, como o passo no ecrã (PERM_DO_PASSO.abrirRetificacao, A.retificarMedidas). Antes bastava pessoas.edit.
  IF (v_depois->'retif') IS DISTINCT FROM (v_antes->'retif') AND NOT public.fn_cat_pode(p_org, 'negocios.obra.planear') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode aceitar nem mudar as medidas retificadas.' USING ERRCODE = 'CT001';
  END IF;
  -- 20270125600000 início (auditoria 20/11): o acerto do valor e quem vai medir pedem a permissão do passo no ecrã (PERM_DO_PASSO).
  --   Só o que muda de verdade; vazio conta como sem valor.
  DECLARE
    v_ac_a jsonb := coalesce(v_antes->'acerto', '{}'::jsonb);
    v_ac_d jsonb := coalesce(v_depois->'acerto', '{}'::jsonb);
    v_val_a text := nullif(v_ac_a->>'acerto_valor', '');            v_val_d text := nullif(v_ac_d->>'acerto_valor', '');
    v_nc_a text := nullif(v_ac_a->>'nota_credito', '');             v_nc_d text := nullif(v_ac_d->>'nota_credito', '');
    v_apr_a text := nullif(v_ac_a->>'acerto_sem_adenda_aprov', ''); v_apr_d text := nullif(v_ac_d->>'acerto_sem_adenda_aprov', '');
    v_por_a text := nullif(v_ac_a->>'acerto_sem_adenda_por', '');   v_por_d text := nullif(v_ac_d->>'acerto_sem_adenda_por', '');
    v_sup_a text := nullif(v_ac_a->>'supervisor_medidas', '');      v_sup_d text := nullif(v_ac_d->>'supervisor_medidas', '');
  BEGIN
    -- a nota de crédito (registarNotaCredito): o número e o acerto a entrar ou a sair de «nota de crédito»
    IF (v_nc_d IS DISTINCT FROM v_nc_a
        OR (v_val_d IS DISTINCT FROM v_val_a AND (coalesce(v_val_a, '') = 'nota de crédito' OR coalesce(v_val_d, '') = 'nota de crédito')))
       AND NOT public.fn_cat_pode(p_org, 'negocios.registar_fatura') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.registar_fatura): não pode registar a nota de crédito do acerto do valor.' USING ERRCODE = 'CT001';
    END IF;
    -- o resto do acerto (seguir sem adenda, a adenda do acerto, limpar), salvo a aprovação da Direção (pedida -> ok, abaixo)
    IF v_val_d IS DISTINCT FROM v_val_a
       AND coalesce(v_val_a, '') <> 'nota de crédito' AND coalesce(v_val_d, '') <> 'nota de crédito'
       AND NOT (coalesce(v_val_d, '') = 'sem adenda' AND coalesce(v_apr_a, '') = 'pedida' AND coalesce(v_apr_d, '') = 'ok')
       AND NOT public.fn_cat_pode(p_org, 'negocios.orcamento.editar') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.orcamento.editar): não pode decidir o acerto do valor (seguir sem adenda ou a adenda do acerto).' USING ERRCODE = 'CT001';
    END IF;
    -- seguir sem adenda com a margem abaixo do mínimo: pedir é de quem edita o orçamento; aprovar ou recusar é da Direção
    IF v_apr_d IS DISTINCT FROM v_apr_a THEN
      IF v_apr_a IS NULL AND coalesce(v_apr_d, '') = 'pedida' THEN
        IF NOT public.fn_cat_pode(p_org, 'negocios.orcamento.editar') THEN
          RAISE EXCEPTION 'Sem permissão (negocios.orcamento.editar): não pode pedir à Direção para seguir sem adenda.' USING ERRCODE = 'CT001';
        END IF;
      ELSIF NOT public.fn_cat_pode(p_org, 'negocios.margem.aprovar') THEN
        RAISE EXCEPTION 'Sem permissão (negocios.margem.aprovar): não pode aprovar nem recusar seguir sem adenda (é da Direção).' USING ERRCODE = 'CT001';
      END IF;
    END IF;
    IF v_por_d IS DISTINCT FROM v_por_a
       AND NOT (public.fn_cat_pode(p_org, 'negocios.orcamento.editar') OR public.fn_cat_pode(p_org, 'negocios.margem.aprovar')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.orcamento.editar): não pode mudar quem decidiu seguir sem adenda.' USING ERRCODE = 'CT001';
    END IF;
    -- quem vai medir ao local (supervisorMedidas)
    IF v_sup_d IS DISTINCT FROM v_sup_a AND NOT public.fn_cat_pode(p_org, 'negocios.obra.planear') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode escolher quem vai medir ao local.' USING ERRCODE = 'CT001';
    END IF;
  END;
  -- 20270125600000 fim
  -- 20270117830000 (12/11, Rúben: «as medidas e o plano da obra só depois do Financeiro»; a mesma regra do ecrã, medidasEPlanoAbertos
  --   em src/emylia/motor.ts): sem o pagamento da 1.ª prestação validado (ou a encomenda emitida, ou uma venda direta aceite) as medidas
  --   retificadas não mudam (aceitar, voltar a retificar, as medidas, as notas, a planta) e o contrato principal não se prepara nem se
  --   envia (estado, cláusulas, pedidos do cliente, revisão, versões). Só o que muda de verdade: gravar o que já está na base passa sempre.
  --   Os contratos das adendas (chaves a<n>.<v>) ficam de fora: a adenda tem o seu pagamento, depois do contrato.
  IF NOT v_abertos AND (v_depois->'retif') IS DISTINCT FROM (v_antes->'retif') THEN
    RAISE EXCEPTION 'As medidas só se retificam depois de o Financeiro validar o pagamento.' USING ERRCODE = 'NE013';
  END IF;
  -- 20270117960000: o contrato principal gera-se e assina-se ANTES do pagamento (o fluxo de 16/11); o bloqueio de 20270117830000 saiu.
  -- 20270105200000: registar a decisão do cliente: um pedido de alterações novo (ou mudado) numa versão (limpar não pede nada: é o que a
  --   versão nova faz), ou uma adenda a passar a aceite, assinada ou recusada (ou o motivo da recusa). O que o cliente respondeu no portal
  --   (negocio_respostas_cliente da adenda) passa sem ela: é o espelho do que já está na base.
  IF (EXISTS (SELECT 1 FROM jsonb_each(v_depois->'decisao'->'pedidos') d
              WHERE d.value IS DISTINCT FROM (v_antes->'decisao'->'pedidos'->d.key)
                AND NOT EXISTS (SELECT 1 FROM adendas a JOIN negocio_respostas_cliente r ON r.negocio_id = a.negocio_id AND r.ref = a.referencia
                                WHERE a.negocio_id = p_negocio_id AND d.key LIKE 'a' || a.numero || '.%'
                                  AND r.tipo IN ('adenda_alterar', 'adenda_contrato_alterar')))
      OR EXISTS (SELECT 1 FROM jsonb_each(v_depois->'decisao'->'adendas') d
                 WHERE (((d.value->>'estado') IN ('aceite', 'assinada', 'recusada')
                         AND (d.value->>'estado') IS DISTINCT FROM (v_antes->'decisao'->'adendas'->d.key->>'estado'))
                        OR ((d.value->>'recusa') IS NOT NULL AND (d.value->>'recusa') IS DISTINCT FROM (v_antes->'decisao'->'adendas'->d.key->>'recusa')))
                   AND NOT EXISTS (SELECT 1 FROM negocio_respostas_cliente r
                                   WHERE r.negocio_id = p_negocio_id AND r.ref = d.value->>'referencia'
                                     AND r.tipo = CASE d.value->>'estado' WHEN 'aceite' THEN 'adenda_aceitar' WHEN 'assinada' THEN 'adenda_assinar'
                                                                          ELSE 'adenda_recusar' END)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.proposta.decidir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.proposta.decidir): não pode registar a aceitação, a recusa nem o pedido de alterações do cliente.' USING ERRCODE = 'CT001';
  END IF;

  -- 20270106040000: a decisão do cliente sobre a proposta PRINCIPAL (as versões do orçamento sem adenda e a proposta do negócio)
  --   também pede negocios.proposta.decidir: uma versão a entrar ou a sair de aceite/rejeitado/recusado (salvo a passagem normal
  --   recusada -> substituída, ao fazer a versão seguinte), a data "aceite antes" de uma versão, ou a proposta a entrar ou a sair de
  --   accepted/rejected. (Hoje o JSON não consegue aceitar nem recusar - fica o da base, com aviso -, mas consegue desfazer uma
  --   aceitação passando a versão a substituída, e escrever aceite_antes_em: isso passa a pedir a permissão.)
  v_dec_depois := public.fn_neg_marcas_decisao_principal(p_negocio_id);
  IF (EXISTS (SELECT 1 FROM jsonb_each(v_dec_depois->'versoes') d
              LEFT JOIN LATERAL (SELECT v_dec_antes->'versoes'->d.key AS a) x ON true
              WHERE ((d.value->>'estado') IS DISTINCT FROM (x.a->>'estado')
                     AND ((d.value->>'estado') IN ('aceite', 'rejeitado', 'recusado')
                          OR ((x.a->>'estado') IN ('aceite', 'rejeitado', 'recusado')
                              AND NOT ((x.a->>'estado') IN ('rejeitado', 'recusado') AND (d.value->>'estado') = 'substituido'))))
                 OR (d.value->'aceite_antes') IS DISTINCT FROM (x.a->'aceite_antes'))
      OR EXISTS (SELECT 1 FROM jsonb_each_text(v_dec_depois->'propostas') d
                 WHERE d.value IS DISTINCT FROM (v_dec_antes->'propostas'->>d.key)
                   AND (d.value IN ('accepted', 'rejected') OR (v_dec_antes->'propostas'->>d.key) IN ('accepted', 'rejected'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.proposta.decidir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.proposta.decidir): não pode registar nem desfazer a aceitação ou a recusa da proposta.' USING ERRCODE = 'CT001';
  END IF;

  -- 20270113130000: em Contacto, sem negocios.contacto.registar, os dados do Contacto (a linha, o serviço pedido, a morada da obra, o
  --   título e as respostas que não são da visita nem sugestões) ficam como estavam
  IF v_so_visita AND public.fn_neg_dados_contacto(p_negocio_id) IS DISTINCT FROM v_cont_antes THEN
    RAISE EXCEPTION 'Sem permissão (negocios.contacto.registar): não pode mudar os dados do Contacto (o que o cliente quer, a morada, a qualificação).' USING ERRCODE = 'CT001';
  END IF;

  -- 20270114320000: na Visita, sem negocios.visita.preencher, os outros dados do negócio (o que o cliente quer, a morada, as respostas que não
  --   são da agenda) ficam como estavam
  IF v_so_agenda AND public.fn_neg_dados_contacto(p_negocio_id) IS DISTINCT FROM v_agenda_antes THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.preencher): na Visita só pode marcar, remarcar ou cancelar a visita.' USING ERRCODE = 'CT001';
  END IF;

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual, 'avisos', to_jsonb(v_avisos));
END $function$;

CREATE OR REPLACE FUNCTION public.neg_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ver boolean := public.fn_quote_custos_pode(p_org); -- 20270102210000: sem ele, o custo dos produtos vem a null (20270110200000: a regra única)
  -- 20270110400000: o âmbito de pessoas.view (dono = assigned_to/created_by). Vê tudo: admin, quem entra só pelo Papel no Negócio ou
  -- tem um Papel no Negócio que dá pessoas.view (fn_neg_ambito_tudo). Mais: as obras onde a pessoa tem tarefas.
  v_tudo boolean; v_chaves text[]; v_tarefas uuid[];
  v_ids uuid[]; -- 20270111100000
  v_edita boolean; -- 20270125600000
BEGIN
  -- 20270111100000: sem pessoas.view (perfil, papel ou admin) mas com negocios.obra.executar: só os negócios onde trabalha, sem dinheiro.
  -- Com pessoas.view, tudo como antes; sem nenhuma das duas, o mesmo erro.
  IF public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    v_ids := public.fn_neg_ids_do_tecnico(p_org);
    SELECT coalesce(jsonb_agg(x.j ORDER BY x.numero), '[]') INTO r FROM (
      SELECT n.numero, jsonb_build_object(
        'negocio', jsonb_build_object('id', n.id, 'entity_id', n.entity_id, 'numero', n.numero, 'titulo', n.titulo,
          'telefone', coalesce(nullif(btrim(e.phone), ''), (SELECT ep.phone_number FROM anew_entity_phones ep WHERE ep.entity_id = e.id
                       ORDER BY ep.is_primary DESC NULLS LAST, ep.created_at DESC LIMIT 1), ''),
          'email', '',
          'fase', CASE WHEN n.anulado_em IS NULL THEN greatest(coalesce(n.fase, 0), public.fn_neg_fase_minima(n.id)) ELSE coalesce(n.fase, 0) END, 'linha', coalesce(n.linha, 'geral'), 'linha_por_definir', n.linha_por_definir, 'servico_pedido', coalesce(n.servico_pedido, ''),
          'morada_obra', coalesce(n.morada_obra, ''), 'origem', '', 'pedido_em', n.pedido_em, 'dono_papel', coalesce(n.dono_papel, 'comercial'),
          'estado', CASE WHEN n.estado = 'perdido' THEN 'perdido' ELSE 'aberto' END, 'estado_crm', n.estado, 'motivo_perda', NULL,
          'anulado_em', n.anulado_em, 'anulado_por', NULL, 'anulado_motivo', NULL, 'anulado_origem', NULL,
          'fatura_numero', NULL, 'fatura_em', NULL, 'fatura_paga', NULL, 'recibo_numero', NULL, 'recibo_em', NULL,
          'fluxo_emylia', n.fluxo_emylia, 'docs_crm', public.fn_neg_docs_crm(n.id),
          'pode_gravar', false), -- 20270125600000: só execução não grava (neg_guardar_negocio)
        -- só as respostas do terreno (morada, acesso, o imóvel, as escolhas de produto, o diagnóstico); fora: pagamento, NIF, orçamentos, concorrência
        'respostas', coalesce((SELECT jsonb_agg(jsonb_build_object('campo_chave', r.campo_chave, 'valor', r.valor, 'sugerido', r.sugerido) ORDER BY r.campo_chave)
                      FROM negocio_respostas r WHERE r.negocio_id = n.id AND r.divisao = '' AND public.fn_neg_resposta_do_terreno(r.campo_chave)), '[]'),
        'visitas', to_jsonb(coalesce(m.visitas, '{}')),
        'medidas', jsonb_build_object('pav', coalesce(m.pav, 0), 'par', coalesce(m.par, 0), 'pts', coalesce(m.pts, 0), 'pcs', coalesce(m.pcs, 0),
          'ptf', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptf END, 'ptq', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptq END,
          'necessidades', to_jsonb(coalesce(m.necessidades, '{}')), 'slot', coalesce(m.slot, ''), 'fotos_total', coalesce(m.fotos_total, 0),
          'fotos_exterior', NULLIF(m.fotos_exterior, 0), 'fotos_interior', NULLIF(m.fotos_interior, 0), 'fotos_area', NULLIF(m.fotos_area, 0), 'fechada', coalesce(m.fechada, false)),
        'servicos', coalesce((SELECT jsonb_agg(jsonb_build_object('servico', s.servico_id, 'inclusao', s.inclusao, 'quantidade', s.quantidade, 'mantem', s.mantem,
                      'cliente_compra', s.cliente_compra, 'ordem', s.ordem) ORDER BY s.ordem) FROM negocio_servicos s WHERE s.negocio_id = n.id), '[]'),
        'produtos', NULL,
        'partes_fora', (SELECT jsonb_agg(pf.parte ORDER BY pf.parte) FROM negocio_partes_fora pf WHERE pf.negocio_id = n.id),
        'orcamentos', '[]'::jsonb, 'contratos', '[]'::jsonb, 'faturas', NULL,
        -- a encomenda de cliente (sem valores: o contrato, o número e quando) liga os materiais da obra ao Inventário
        'ec', public.fn_neg_ler_ec(n.id),
        'adendas', '[]'::jsonb, 'historico', '[]'::jsonb
      ) j
      FROM negocios n
      LEFT JOIN anew_entities e ON e.id = n.entity_id
      LEFT JOIN negocio_medidas m ON m.negocio_id = n.id
      WHERE n.organization_id = p_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL AND n.id = ANY (v_ids)
    ) x;
    RETURN r;
  END IF;
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  v_edita := coalesce(public.fn_cat_pode(p_org, 'pessoas.edit'), false); -- 20270125600000
  v_tudo := public.fn_neg_ambito_tudo(p_org, 'pessoas.view');
  IF NOT v_tudo THEN
    v_chaves := public.crm_scope_keys('pessoas.view');
    v_tarefas := public.fn_neg_ids_com_tarefa(p_org);
  END IF;
  SELECT coalesce(jsonb_agg(x.j ORDER BY x.numero), '[]') INTO r FROM (
    SELECT n.numero, jsonb_build_object(
      'negocio', jsonb_build_object('id', n.id, 'entity_id', n.entity_id, 'numero', n.numero, 'titulo', n.titulo,
        'telefone', coalesce(nullif(btrim(e.phone), ''), (SELECT ep.phone_number FROM anew_entity_phones ep WHERE ep.entity_id = e.id
                     ORDER BY ep.is_primary DESC NULLS LAST, ep.created_at DESC LIMIT 1), ''), -- 20270101390000
        'email', COALESCE(NULLIF(btrim(e.email), ''),
                   (SELECT em.email FROM public.anew_entity_emails em
                    WHERE em.entity_id = n.entity_id
                    ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC LIMIT 1), ''),
        'fase', CASE WHEN n.anulado_em IS NULL THEN greatest(coalesce(n.fase, 0), public.fn_neg_fase_minima(n.id)) ELSE coalesce(n.fase, 0) END, 'linha', coalesce(n.linha, 'geral'), 'linha_por_definir', n.linha_por_definir, 'servico_pedido', coalesce(n.servico_pedido, ''),
        'morada_obra', coalesce(n.morada_obra, ''), 'origem', coalesce(n.origem, ''), 'pedido_em', n.pedido_em, 'dono_papel', coalesce(n.dono_papel, 'comercial'),
        'estado', CASE WHEN n.estado = 'perdido' THEN 'perdido' ELSE 'aberto' END, 'estado_crm', n.estado, 'motivo_perda', n.motivo_perda,
        'anulado_em', n.anulado_em, 'anulado_por', n.anulado_por, 'anulado_motivo', n.anulado_motivo, 'anulado_origem', n.anulado_origem,
        'fatura_numero', n.fatura_numero, 'fatura_em', n.fatura_em, 'fatura_paga', n.fatura_paga, 'recibo_numero', n.recibo_numero, 'recibo_em', n.recibo_em,
        'fluxo_emylia', n.fluxo_emylia,
        -- tem documentos do CRM: o ecrã da Emylia abre-o só de leitura (20261231994000)
        'docs_crm', public.fn_neg_docs_crm(n.id),
        -- 20270125600000: pode gravar este negócio (a regra de neg_guardar_negocio sem o filtro da fase: fn_neg_pode_gravar)
        'pode_gravar', v_edita AND public.fn_neg_pode_gravar(n)),
      'respostas', coalesce((SELECT jsonb_agg(jsonb_build_object('campo_chave', r.campo_chave, 'valor', r.valor, 'sugerido', r.sugerido) ORDER BY r.campo_chave)
                    FROM negocio_respostas r WHERE r.negocio_id = n.id AND r.divisao = ''), '[]'),
      'visitas', to_jsonb(coalesce(m.visitas, '{}')),
      'medidas', jsonb_build_object('pav', coalesce(m.pav, 0), 'par', coalesce(m.par, 0), 'pts', coalesce(m.pts, 0), 'pcs', coalesce(m.pcs, 0),
        'ptf', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptf END, 'ptq', CASE WHEN m.ptf > 0 OR m.ptq > 0 THEN m.ptq END,
        'necessidades', to_jsonb(coalesce(m.necessidades, '{}')), 'slot', coalesce(m.slot, ''), 'fotos_total', coalesce(m.fotos_total, 0),
        'fotos_exterior', NULLIF(m.fotos_exterior, 0), 'fotos_interior', NULLIF(m.fotos_interior, 0), 'fotos_area', NULLIF(m.fotos_area, 0), 'fechada', coalesce(m.fechada, false)),
      'servicos', coalesce((SELECT jsonb_agg(jsonb_build_object('servico', s.servico_id, 'inclusao', s.inclusao, 'quantidade', s.quantidade, 'mantem', s.mantem,
                    'cliente_compra', s.cliente_compra, 'ordem', s.ordem) ORDER BY s.ordem) FROM negocio_servicos s WHERE s.negocio_id = n.id), '[]'),
      'produtos', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'produto', p.produto_id, 'nome', p.nome, 'unidade', p.unidade, 'custo_un', CASE WHEN v_ver THEN p.custo_un END,
                    'pvp_un', p.pvp_un, 'categoria', p.categoria_id, 'quantidade', p.quantidade, 'cliente_fornece', p.cliente_fornece, 'servico', p.servico_id,
                    'fator', p.fator, 'sem_instalacao', p.sem_instalacao) ORDER BY p.ordem) FROM negocio_produtos p WHERE p.negocio_id = n.id),
      'partes_fora', (SELECT jsonb_agg(pf.parte ORDER BY pf.parte) FROM negocio_partes_fora pf WHERE pf.negocio_id = n.id),
      'orcamentos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_orcamento(q.id) ORDER BY q.versao) FROM quotes q
                    WHERE q.negocio_id = n.id AND q.fluxo_emylia AND q.deleted_at IS NULL), '[]'),
      'contratos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_contrato(c.id) ORDER BY c.versao) FROM client_contracts c
                    WHERE c.negocio_id = n.id AND c.versao IS NOT NULL AND c.deleted_at IS NULL), '[]'),
      'faturas', (SELECT jsonb_agg(jsonb_build_object('chave', f.chave, 'numero', f.numero, 'emitida_em', f.emitida_em, 'total', f.total,
                    'prestacao_ordem', qp.ordem, 'pdf_caminho', f.pdf_caminho,
                    'pagamento', (SELECT jsonb_build_object('validado_em', pg.validado_em, 'conta_destino', coalesce(pg.conta_destino, ''), 'referencia', coalesce(pg.referencia, ''))
                                  FROM pagamentos pg WHERE pg.fatura_id = f.id ORDER BY pg.comunicado_em LIMIT 1),
                    'recibo', (SELECT rc.numero FROM recibos rc JOIN pagamentos pg ON pg.id = rc.pagamento_id WHERE pg.fatura_id = f.id LIMIT 1))
                    ORDER BY f.emitida_em, f.numero)
                    FROM faturas f LEFT JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id WHERE f.negocio_id = n.id AND f.chave IS NOT NULL
                      AND NOT EXISTS (SELECT 1 FROM quotes qa WHERE qa.id = qp.quote_id AND qa.adenda_id IS NOT NULL)),
      -- a encomenda de cliente emitida no servidor (o contrato em vigor ou, na venda direta, o de suporte) e as das adendas (20261231999700)
      'ec', public.fn_neg_ler_ec(n.id),
      -- as adendas (20261231990000)
      'adendas', public.fn_neg_ler_adendas(n.id),
      'historico', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', h.ordem, 'texto', h.texto, 'tipo', h.tipo, 'ocorrido_em', h.ocorrido_em) ORDER BY h.ordem)
                    FROM negocio_historico h WHERE h.negocio_id = n.id), '[]')
    ) j
    FROM negocios n
    LEFT JOIN anew_entities e ON e.id = n.entity_id
    LEFT JOIN negocio_medidas m ON m.negocio_id = n.id
    WHERE n.organization_id = p_org AND n.deleted_at IS NULL AND n.numero IS NOT NULL
      AND (v_tudo OR public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR n.id = ANY (v_tarefas)) -- 20270110400000
  ) x;
  RETURN r;
END $function$;
