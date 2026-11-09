-- =============================================================================
-- 20270110200000 — permissões no servidor, correções 06/11 (aprovado: 4 correções em funções)
-- =============================================================================
-- Só CREATE OR REPLACE FUNCTION, a partir do texto VIVO (pg_get_functiondef) da base RH. Sem tabelas/colunas, sem dados,
-- sem políticas. SECURITY DEFINER, search_path, dono e GRANTs ficam como estavam (CREATE OR REPLACE não os mexe).
--
-- 1. hr_pessoa_do_utilizador: a ficha da conta só com ligação ativa NÃO revogada (pc.revogada_em IS NULL) a uma pessoa
--    não apagada (p.deleted_at IS NULL), como fn_neg_pessoa_da_conta. A data de saída fica de fora de propósito: a
--    função alimenta as políticas *.view.own e quem já saiu continua a ver a sua ficha/recibos/documentos.
-- 2. rpc_hr_picar: sem pessoa indicada ou com a própria ficha = picar o próprio cartão. Conta sem ficha nesta organização
--    → 'conta_sem_ficha_rh' (depois de verificar hr.assiduidade.picar). Picar por outra pessoa fica igual.
-- 3. purge_business_entity (Lixo): deals.delete na organização do documento ou acima (has_anew_permission_in_org_or_ancestor),
--    como purge_entity_facet (20270108100000). Antes bastava deals.delete em qualquer organização.
-- 4. Custos, uma só regra: fn_quote_custos_pode (admin de sistema; quotes.view_costs OU quotes.manage na organização ou
--    acima; ou pelo Papel no Negócio) — já usada por rpc_quote_lines_custos, fn_quote_custo_previsto e pela auditoria
--    (fn_audit_orgs_com_custo). Passam a usá-la fn_neg_ler_adendas, fn_neg_ler_orcamento, neg_ler_negocios (leitura) e
--    neg_guardar_negocio (quem vê custos grava-os; quem não vê fica com os da base), que usavam
--    fn_cat_pode(org, 'quotes.view_costs') — sem quotes.manage. A exigência de quotes.view para ver as LINHAS em
--    rpc_quote_lines_custos não muda.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. hr_pessoa_do_utilizador
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hr_pessoa_do_utilizador(_auth_uid uuid, _organization_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270110200000: só a ligação ativa e não revogada a uma ficha que não foi apagada (como fn_neg_pessoa_da_conta). A data
  --   de saída NÃO entra aqui: esta função alimenta as políticas *.view.own (a pessoa vê a sua ficha, recibos, documentos),
  --   e quem já saiu continua a ver o que é seu enquanto a ligação estiver ativa.
  SELECT pc.pessoa_id
  FROM public.pessoas_contas pc
  JOIN public.anew_users au ON au.id = pc.anew_user_id
  JOIN public.pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL
  WHERE au.auth_user_id = _auth_uid
    AND pc.organization_id = _organization_id
    AND pc.estado = 'activa'
    AND pc.revogada_em IS NULL
  LIMIT 1
$function$;

-- -----------------------------------------------------------------------------
-- 2. rpc_hr_picar
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_picar(_organization_id uuid, _pessoa_id uuid, _sentido text, _momento timestamp with time zone DEFAULT now(), _local_id uuid DEFAULT NULL::uuid, _latitude numeric DEFAULT NULL::numeric, _longitude numeric DEFAULT NULL::numeric, _precisao_metros integer DEFAULT NULL::integer, _origem text DEFAULT 'web'::text, _vinculo_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_auth      uuid := auth.uid();
  v_anew      uuid;
  v_eu        uuid;
  v_tz        text;
  v_data      date;
  v_hora      time;
  v_planeado  uuid;
  v_id        uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'picagem_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _sentido NOT IN ('entrada','saida') THEN
    RAISE EXCEPTION 'picagem_sentido_invalido: o sentido e entrada ou saida (recebido "%").', _sentido
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_eu := public.hr_pessoa_do_utilizador(v_auth, _organization_id);

  -- Picar o proprio cartao e uma permissao; picar por outro e outra. E a razao
  -- de hr.assiduidade.picar existir: ate agora o unico caminho exigia
  -- hr.pessoas.horario_realizado.edit, que serve para escrever as horas de
  -- qualquer pessoa.
  --
  -- 20270110200000: sem pessoa indicada (NULL) ou com a propria ficha e picar o proprio cartao. Uma conta sem ficha ligada
  -- nesta organizacao (hr_pessoa_do_utilizador NULL) recebe conta_sem_ficha_rh, depois da verificacao de hr.assiduidade.picar;
  -- antes caia no ramo de "outra pessoa" e a mensagem falava de picar.outros / pessoa invalida. Picar por OUTRA pessoa
  -- (alvo indicado e diferente da propria ficha) fica igual.
  IF _pessoa_id IS NULL OR (v_eu IS NOT NULL AND v_eu = _pessoa_id) THEN
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar', _organization_id) THEN
      RAISE EXCEPTION 'picagem_sem_permissao: falta hr.assiduidade.picar nesta organizacao.' USING ERRCODE = '42501';
    END IF;
    IF v_eu IS NULL THEN
      RAISE EXCEPTION 'conta_sem_ficha_rh: Esta conta não está ligada a nenhuma ficha de RH nesta organização.'
        USING ERRCODE = 'P0001';
    END IF;
    _pessoa_id := v_eu;
  ELSE
    IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar.outros', _organization_id) THEN
      RAISE EXCEPTION
        'picagem_sem_permissao: picar na ficha de outra pessoa exige hr.assiduidade.picar.outros nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas p
     WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'picagem_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '23503';
  END IF;

  -- O fuso da organizacao, resolvido UMA VEZ e gravado. Ver o cabecalho de
  -- 20261207003700 sobre porque data_local nao e uma coluna gerada.
  SELECT s.timezone INTO v_tz
    FROM public.schedule_settings s
   WHERE s.organization_id = _organization_id
   LIMIT 1;

  v_tz := coalesce(nullif(btrim(v_tz), ''), 'Europe/Lisbon');

  v_data := (_momento AT TIME ZONE v_tz)::date;
  v_hora := (_momento AT TIME ZONE v_tz)::time;

  -- O intervalo planeado que contem esta hora, se houver. E uma ligacao, nao um
  -- calculo: nulo e normal (horas extraordinarias, turno trocado, pessoa sem
  -- horario registado).
  SELECT hp.id INTO v_planeado
    FROM public.pessoas_horario_planeado hp
   WHERE hp.pessoa_id = _pessoa_id
     AND hp.organization_id = _organization_id
     AND hp.deleted_at IS NULL
     AND v_hora >= hp.hora_inicio AND v_hora < hp.hora_fim
   ORDER BY hp.hora_inicio
   LIMIT 1;

  INSERT INTO public.pessoas_picagens (
    pessoa_id, organization_id, momento, data_local, hora_local, sentido,
    local_id, vinculo_id, planeado_id, origem,
    latitude, longitude, precisao_metros,
    registado_por_anew_user_id, registado_por_pessoa_id, created_by
  ) VALUES (
    _pessoa_id, _organization_id, _momento, v_data, v_hora, _sentido,
    _local_id, _vinculo_id, v_planeado, coalesce(_origem, 'web'),
    _latitude, _longitude, _precisao_metros,
    v_anew, v_eu, v_anew
  )
  RETURNING id INTO v_id;

  PERFORM public.hr_picagens_consolidar(_pessoa_id, _organization_id, v_data);

  RETURN v_id;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3. purge_business_entity
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_business_entity(p_kind text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_id uuid;
  v_org_id uuid;
  v_actor uuid := auth.uid();
  v_live_count int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Autenticacao necessaria' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('deal','quote','proposal','contract') THEN
    RAISE EXCEPTION 'Invalid kind: %', p_kind;
  END IF;

  -- Determine organization of the target row BEFORE acting.
  IF p_kind = 'deal' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.deals WHERE id = p_id;
  ELSIF p_kind = 'quote' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.quotes WHERE id = p_id;
  ELSIF p_kind = 'proposal' THEN
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.proposals WHERE id = p_id;
  ELSE
    SELECT entity_id, organization_id INTO v_entity_id, v_org_id FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (v_org_id IN (SELECT public.get_user_visible_org_ids(v_actor))) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_anew_permission(v_actor, 'deals.delete') THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 20270110200000: deals.delete nesta organização ou acima (a administração desce, não sobe), como purge_entity_facet
  --   (20270108100000). Antes bastava a permissão em qualquer organização e esta ser visível (as de cima também são).
  IF NOT public.has_anew_permission_in_org_or_ancestor(v_actor, 'deals.delete', v_org_id) THEN
    RAISE EXCEPTION 'Sem permissao' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_kind = 'deal' THEN
    -- bloqueio: não permitir purge se houver quotes/proposals vivos ligados
    SELECT count(*) INTO v_live_count FROM public.quotes WHERE deal_id = p_id AND deleted_at IS NULL;
    IF v_live_count > 0 THEN
      RAISE EXCEPTION 'Não é possível eliminar definitivamente: existem % orçamento(s) vivos ligados. Apague-os primeiro.', v_live_count;
    END IF;
    SELECT count(*) INTO v_live_count FROM public.proposals WHERE deal_id = p_id AND deleted_at IS NULL;
    IF v_live_count > 0 THEN
      RAISE EXCEPTION 'Não é possível eliminar definitivamente: existem % proposta(s) vivas ligadas. Apague-as primeiro.', v_live_count;
    END IF;

    -- purge filhos soft-deleted explicitamente (CASCADE trataria, mas queremos limpar tudo)
    UPDATE public.client_contracts SET proposal_id = NULL WHERE proposal_id IN (SELECT id FROM public.proposals WHERE deal_id = p_id);
    DELETE FROM public.proposals WHERE deal_id = p_id; -- CASCADE em proposal_*
    DELETE FROM public.quotes WHERE deal_id = p_id;    -- CASCADE em quote_*
    DELETE FROM public.deals WHERE id = p_id;

  ELSIF p_kind = 'quote' THEN
    -- quote_lines, quote_fees, quote_documents já têm ON DELETE CASCADE
    DELETE FROM public.quote_sends WHERE quote_id = p_id;
    DELETE FROM public.quotes WHERE id = p_id;

  ELSIF p_kind = 'proposal' THEN
    -- proposal_items, proposal_sends, proposal_access_tokens, proposal_deliveries, proposal_verification_codes têm CASCADE
    UPDATE public.client_contracts SET proposal_id = NULL WHERE proposal_id = p_id;
    DELETE FROM public.proposals WHERE id = p_id;

  ELSE -- contract
    -- contract_sends, client_contract_*, contract_documents têm CASCADE
    DELETE FROM public.client_contracts WHERE id = p_id;
  END IF;

  IF v_entity_id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.anew_entity_history(entity_id, change_type, field_name, old_value, new_value, changed_by, metadata)
      VALUES (v_entity_id, 'purged', p_kind, p_id::text, NULL, v_actor,
              jsonb_build_object('kind', p_kind, 'id', p_id, 'organization_id', v_org_id));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN TRUE;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4a. fn_neg_ler_adendas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_ler_adendas(p_negocio uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'numero', a.numero, 'referencia', a.referencia, 'estado', a.estado, 'motivo', a.motivo, 'criada_em', a.criada_em, 'enviada_em', a.enviada_em,
    'aceite_em', a.aceite_em, 'assinada_em', a.assinada_em, 'recusada_em', a.recusada_em, 'recusa', a.recusa_motivo, 'vista', a.vista,
    'total', a.total, 'total_com_iva', a.total_com_iva,
    'origem', CASE WHEN a.imprevisto_ref IS NOT NULL THEN
      jsonb_build_object('imprevisto', a.imprevisto_ref, 'texto', coalesce(a.origem_texto, ''), 'onde', coalesce(a.origem_onde, ''), 'foto', a.origem_foto) END,
    'versoes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'versao', q.versao, 'estado', q.estado, 'desconto', coalesce(q.desconto_fracao, 0), 'verificado', q.verificado_em IS NOT NULL, 'aprovacao', q.aprovacao,
        'motivos', to_jsonb(coalesce(q.motivos_versao, '{}')), 'nota', q.nota_versao,
        'pedido_cliente', CASE WHEN q.pedido_cliente_em IS NOT NULL OR q.pedido_cliente_motivos IS NOT NULL THEN
          jsonb_build_object('motivos', to_jsonb(coalesce(q.pedido_cliente_motivos, '{}')), 'nota', q.pedido_cliente_nota, 'em', q.pedido_cliente_em) END,
        'enviado_em', q.enviado_em, 'aceite_em', q.accepted_at, 'substituido_em', q.substituido_em, 'total', q.preco_final, 'total_com_iva', q.total_com_iva,
        'linhas', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'ordem', l.ordem, 'servico', l.service_id, 'chave', l.chave_emylia, 'livre', l.tipo_emylia = 'livre', 'descricao', l.descricao_snapshot,
            'unidade', coalesce(l.unidade, ''), 'quantidade', coalesce(l.quantidade_exata, l.qt), 'preco_un', coalesce(l.preco_un_exato, l.retail_price_unit, 0),
            'horas_un', coalesce(c.horas_un, 0), 'perfil', coalesce(l.perfil_nome, ''), 'perfil_chave', l.perfil_chave,
            'custo_un', CASE WHEN c.congelado AND k.ver THEN l.custo_un_exato END, 'mao_obra_un', CASE WHEN k.ver THEN l.mao_obra_congelada END,
            'materiais', (SELECT jsonb_agg(jsonb_build_object('nome', m.nome, 'quantidade', m.quantidade, 'unidade', m.unidade, 'preco', m.preco,
                           'fornecedor', m.fornecedor) ORDER BY m.ordem) FROM quote_line_materiais m WHERE m.quote_line_id = l.id)
          ) ORDER BY l.ordem) FROM quote_lines l LEFT JOIN quote_line_custos c ON c.quote_line_id = l.id WHERE l.quote_id = q.id), '[]')
      ) ORDER BY q.versao) FROM quotes q WHERE q.adenda_id = a.id AND q.deleted_at IS NULL), '[]'),
    'contratos', coalesce((SELECT jsonb_agg(public.fn_neg_ler_contrato(c.id) ORDER BY c.versao) FROM client_contracts c
                  WHERE c.adenda_id = a.id AND c.versao IS NOT NULL AND c.deleted_at IS NULL), '[]'),
    'faturas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'chave', f.chave, 'numero', f.numero, 'emitida_em', f.emitida_em, 'total', f.total, 'parcela', qp.ordem, 'rotulo', qp.rotulo, 'pct', qp.pct,
        'recibo', (SELECT jsonb_build_object('numero', rc.numero, 'em', rc.emitido_em) FROM recibos rc JOIN pagamentos pg ON pg.id = rc.pagamento_id
                   WHERE pg.fatura_id = f.id LIMIT 1),
        'aviso', coalesce((SELECT jsonb_agg(jsonb_build_object('campo', v.campo, 'valor', v.valor) ORDER BY v.campo) FROM fatura_avisos_cliente v
                   WHERE v.fatura_id = f.id), '[]')
      ) ORDER BY qp.ordem, f.emitida_em) FROM faturas f JOIN quote_prestacoes qp ON qp.id = f.quote_prestacao_id JOIN quotes q ON q.id = qp.quote_id
      WHERE q.adenda_id = a.id AND f.chave IS NOT NULL), '[]')
  ) ORDER BY a.numero), '[]') FROM adendas a
  -- 20270102210000: sem quotes.view_costs o custo e a mão de obra das linhas vêm a null
  -- 20270110200000: a mesma regra de rpc_quote_lines_custos (fn_quote_custos_pode: quotes.view_costs OU quotes.manage)
  CROSS JOIN LATERAL (SELECT public.fn_quote_custos_pode(a.organization_id) AS ver) k
  WHERE a.negocio_id = p_negocio
$function$;

-- -----------------------------------------------------------------------------
-- 4b. fn_neg_ler_orcamento
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_neg_ler_orcamento(p_quote uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261231994000: o portal recusa com "rejeitado"; a Emylia chama-lhe "recusado"
  -- 20270102210000: sem quotes.view_costs (perfil ou Papel no Negócio) os custos, os custos/hora dos ofícios e os custos dos produtos vêm a null
  -- 20270110200000: a mesma regra de rpc_quote_lines_custos (fn_quote_custos_pode: quotes.view_costs OU quotes.manage)
  SELECT jsonb_build_object(
    'versao', q.versao, 'estado', CASE WHEN q.estado IN ('rejeitado', 'rejected') THEN 'recusado' ELSE q.estado END, 'modelo', q.modelo_base,
    'desconto', coalesce(q.desconto_fracao, 0), 'venda_direta', q.venda_direta,
    'inicio_obra', q.inicio_obra, 'equipa', q.equipa, 'verificado', q.verificado_em IS NOT NULL, 'aprovacao', q.aprovacao,
    'motivos_versao', to_jsonb(coalesce(q.motivos_versao, '{}')), 'nota_versao', q.nota_versao, 'onde_refeita', q.onde_refeita,
    'pedido_cliente', CASE WHEN q.pedido_cliente_em IS NOT NULL OR q.pedido_cliente_motivos IS NOT NULL THEN
      jsonb_build_object('motivos', to_jsonb(coalesce(q.pedido_cliente_motivos, '{}')), 'nota', q.pedido_cliente_nota, 'em', q.pedido_cliente_em) END,
    'recusa', CASE WHEN q.recusada_em IS NOT NULL OR q.recusa_motivos IS NOT NULL THEN
      jsonb_build_object('motivos', to_jsonb(coalesce(q.recusa_motivos, '{}')), 'nota', q.recusa_nota, 'em', q.recusada_em) END,
    'enviado_em', q.enviado_em, 'aceite_em', q.accepted_at, 'substituido_em', q.substituido_em, 'aceite_antes_em', q.aceite_antes_em,
    'preco_final', q.preco_final, 'total_com_iva', q.total_com_iva, 'prestacoes_por_fases', q.prestacoes_por_fases, 'sem_demolicao', q.sem_demolicao,
    'linhas', (SELECT jsonb_agg(jsonb_build_object(
        'ordem', l.ordem, 'tipo', l.tipo_emylia, 'servico', l.service_id, 'descricao', l.descricao_snapshot, 'unidade', l.unidade,
        'quantidade', coalesce(l.quantidade_exata, l.qt), 'preco_un', coalesce(l.preco_un_exato, l.retail_price_unit, 0),
        'parte_iva', CASE WHEN l.tipo_emylia = 'servico' THEN 'mao_obra' ELSE 'materiais' END,
        'taxa_iva', CASE WHEN l.iva_explicita THEN l.iva_percent END, 'fornecedor', l.fornecedor,
        'qtd_origem', l.qtd_origem, 'preco_un_origem', l.preco_un_origem, 'custo_un_origem', CASE WHEN k.ver THEN l.custo_un_origem END,
        'custo', jsonb_build_object('custo_un', CASE WHEN k.ver THEN coalesce(l.custo_un_exato, l.cost_price, 0) END, 'manual', l.custo_manual, 'congelado', coalesce(c.congelado, false),
          'horas_un', coalesce(c.horas_un, 0), 'mao_obra_un', CASE WHEN k.ver THEN coalesce(c.mao_obra_un, 0) END, 'equipamentos_un', CASE WHEN k.ver THEN coalesce(c.equipamentos_un, 0) END,
          'consumiveis_un', CASE WHEN k.ver THEN coalesce(c.consumiveis_un, 0) END, 'estrutura_hora', CASE WHEN k.ver THEN coalesce(c.estrutura_hora, 0) END, 'estrutura_un', CASE WHEN k.ver THEN coalesce(c.estrutura_un, 0) END,
          'ajuste_un', CASE WHEN k.ver THEN coalesce(c.ajuste_un, 0) END, 'congelado_em', c.congelado_em,
          'oficios', coalesce((SELECT jsonb_agg(jsonb_build_object('perfil_chave', o.perfil_chave, 'nome', o.nome, 'horas_un', o.horas_un, 'custo_hora', CASE WHEN k.ver THEN o.custo_hora END,
                     'tecnicos', o.tecnicos) ORDER BY o.ordem) FROM quote_line_oficios o WHERE o.quote_line_id = l.id), '[]')),
        'zonas', (SELECT jsonb_agg(jsonb_build_object('zona', z.nome, 'quantidade', lz.quantidade, 'valor', lz.valor) ORDER BY lz.ordem)
                  FROM quote_line_zonas lz JOIN quote_zonas z ON z.id = lz.zona_id WHERE lz.quote_line_id = l.id)
      ) ORDER BY l.ordem) FROM quote_lines l LEFT JOIN quote_line_custos c ON c.quote_line_id = l.id WHERE l.quote_id = q.id),
    'zonas', (SELECT jsonb_agg(z.nome ORDER BY z.ordem) FROM quote_zonas z WHERE z.quote_id = q.id),
    'prazo', coalesce((SELECT jsonb_agg(jsonb_build_object('tarefa', p.tarefa, 'dias', p.dias) ORDER BY p.tarefa) FROM quote_prazo p WHERE p.quote_id = q.id), '[]'),
    'prestacoes', coalesce((SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'rotulo', p.rotulo, 'pct', p.pct, 'marco', p.marco, 'fase', p.fase) ORDER BY p.ordem)
                  FROM quote_prestacoes p WHERE p.quote_id = q.id), '[]'),
    'avisos', coalesce((SELECT jsonb_agg(a.chave ORDER BY a.chave) FROM quote_avisos_vistos a WHERE a.quote_id = q.id), '[]'),
    'precos_manuais', (SELECT jsonb_agg(jsonb_build_object('descricao', p.descricao, 'preco', p.preco) ORDER BY p.descricao) FROM quote_precos_manuais p WHERE p.quote_id = q.id),
    'produtos', (SELECT jsonb_agg(jsonb_build_object('ordem', p.ordem, 'produto', p.produto_id, 'nome', p.nome, 'unidade', p.unidade, 'custo_un', CASE WHEN k.ver THEN p.custo_un END,
                  'pvp_un', p.pvp_un, 'categoria', p.categoria_id, 'quantidade', p.quantidade, 'cliente_fornece', p.cliente_fornece, 'servico', p.servico_id,
                  'fator', p.fator, 'sem_instalacao', p.sem_instalacao) ORDER BY p.ordem) FROM quote_versao_produtos p WHERE p.quote_id = q.id),
    'partes_fora', (SELECT jsonb_agg(p.parte ORDER BY p.parte) FROM quote_versao_partes p WHERE p.quote_id = q.id)
  ) FROM quotes q CROSS JOIN LATERAL (SELECT public.fn_quote_custos_pode(q.organization_id) AS ver) k WHERE q.id = p_quote
$function$;

-- -----------------------------------------------------------------------------
-- 4c. neg_ler_negocios
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ver boolean := public.fn_quote_custos_pode(p_org); -- 20270102210000: sem ele, o custo dos produtos vem a null (20270110200000: a regra única)
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
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
        'docs_crm', public.fn_neg_docs_crm(n.id)),
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
  ) x;
  RETURN r;
END $function$;

-- -----------------------------------------------------------------------------
-- 4d. neg_guardar_negocio
-- -----------------------------------------------------------------------------
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
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;

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
  DELETE FROM negocio_historico WHERE negocio_id = p_negocio_id;
  INSERT INTO negocio_historico (organization_id, negocio_id, ordem, ocorrido_em, texto, tipo, autor)
  SELECT p_org, p_negocio_id, (x->>'ordem')::int, coalesce((x->>'ocorrido_em')::timestamptz, now()), x->>'texto', x->>'tipo', NULL
  FROM jsonb_array_elements(public.fn_neg_lista(p_linhas->'historico')) x;

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
  IF ((v_depois->'visita') IS DISTINCT FROM (v_antes->'visita')
      OR (v_min = 0 AND v_neg.anulado_em IS NULL AND coalesce(v_neg.fase, 0) <> v_fase AND greatest(coalesce(v_neg.fase, 0), v_fase) BETWEEN 2 AND 3))
     AND NOT public.fn_cat_pode(p_org, 'negocios.visita.gerir') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir): não pode gerir as visitas nem o diagnóstico no local.' USING ERRCODE = 'CT001';
  END IF;
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

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual, 'avisos', to_jsonb(v_avisos));
END $function$;
