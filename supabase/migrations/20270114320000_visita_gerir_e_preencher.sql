-- ============================================================
-- 20270114320000 visita_gerir_e_preencher
-- ============================================================
-- Decisão do utilizador (11/11): a visita do negócio passa a ter duas permissões.
--   negocios.visita.gerir («Gerir visitas», já existia): SÓ marcar, remarcar e cancelar a visita (quem vai, dia e hora, tipo, morada).
--     Marcar leva o negócio a Visita e passa a lead e o negócio ao comercial escolhido (20270114310000).
--   negocios.visita.preencher («Preencher a visita», NOVA): exterior, interior, Estúdio, medidas, fotografias, necessidades, serviços e
--     produtos da visita, diagnóstico (diag_…, div_<d>_diag_…), o combinado (v<n>_combinado), dar resultado à visita, o levantamento e
--     fechar/reabrir o levantamento (Visita <-> Negócio). Na fase Visita, mudar os outros dados do negócio também a pede.
-- O que muda no servidor (corpos a partir de pg_get_functiondef VIVO de 11/11/2026, guarda md5):
--   fn_neg_marcas_permissoes: a fotografia 'visita' fica só com a agenda; o resto passa à nova 'diagnostico'.
--   neg_guardar_negocio: a agenda e Contacto -> Visita pedem visita.gerir; 'diagnostico' e Visita <-> Negócio pedem visita.preencher; na
--     fase Visita o portão aceita uma das duas, e quem só tem visita.gerir não muda os dados do negócio (fn_neg_dados_contacto).
--   neg_resultado_visita, neg_guardar_levantamento, fn_levantamentos_validar_ligacoes: visita.gerir -> visita.preencher.
--   neg_visita_foto_juntar / neg_visita_foto_apagar: pediam pessoas.edit OU visita.gerir; passam a pedir visita.preencher.
--   Ficam com visita.gerir: neg_guardar_visita, neg_alterar_visita / neg_cancelar_visita (fn_neg_visita_editavel) e
--     fn_neg_responsavel_pela_visita.
-- Ninguém perde nada no dia: todos os perfis (anew_role_permissions) e papéis no Negócio (neg_papeis_permissoes) que têm visita.gerir
--   recebem visita.preencher, EXCETO o perfil «Assistente Comercial» da nike (dbc1b868-…), que fica só a agendar. As fotografias deixam
--   de aceitar pessoas.edit sem uma permissão da visita (pedido: o «Gestor de obra» não mexe na visita).
-- Sem tabelas nem colunas novas: uma linha em anew_permissions e as concessões.
-- Reversão (só como migration nova): repor os corpos (visita.gerir) e apagar as linhas de negocios.visita.preencher.
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.fn_neg_marcas_permissoes(uuid)'::regprocedure)) <> '0a086633c76e75bc6f66a1833a62e43f' THEN
    RAISE EXCEPTION 'fn_neg_marcas_permissoes mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> '73031f30823f89bc01c33617ee4f84d1' THEN
    RAISE EXCEPTION 'neg_guardar_negocio mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.neg_resultado_visita(uuid,text,boolean)'::regprocedure)) <> 'b4105b0cd67886f83526522217b3cd40' THEN
    RAISE EXCEPTION 'neg_resultado_visita mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.neg_guardar_levantamento(uuid,uuid,uuid,jsonb,jsonb,jsonb,uuid)'::regprocedure)) <> 'cd3247417e42dc56132b73ebabf11037' THEN
    RAISE EXCEPTION 'neg_guardar_levantamento mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.fn_levantamentos_validar_ligacoes(uuid,uuid,uuid,uuid,uuid)'::regprocedure)) <> '287ea0449407ed52542d9c3dc37e9979' THEN
    RAISE EXCEPTION 'fn_levantamentos_validar_ligacoes mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.neg_visita_foto_juntar(uuid,integer,text,jsonb)'::regprocedure)) <> 'f91aa6e1c66272f5ae2294e93b2f82f5' THEN
    RAISE EXCEPTION 'neg_visita_foto_juntar mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF md5(pg_get_functiondef('public.neg_visita_foto_apagar(uuid,uuid)'::regprocedure)) <> '6c75b8dda0b1685b675f9418c9bb740c' THEN
    RAISE EXCEPTION 'neg_visita_foto_apagar mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_roles r JOIN public.anew_organizations o ON o.id = r.organization_id
                 WHERE r.id = 'dbc1b868-e389-4d1b-9e1d-e126a002fd40' AND r.code = 'assistente_comercial' AND o.name = 'nike') THEN
    RAISE EXCEPTION 'o perfil assistente_comercial da nike não é o esperado (dbc1b868-…)';
  END IF;
END $g$;

-- ---- 1. catálogo: a nova e o texto da que já existia (fica só a agenda)
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('negocios.visita.preencher', 'Preencher a visita',
   'Preencher a visita do negócio: exterior, interior, Estúdio, medidas, fotografias, necessidades e diagnóstico; dar resultado à visita e fechar o levantamento.',
   'pessoas', NULL, 22, false, 'organization', false)
ON CONFLICT (code) DO NOTHING;
UPDATE public.anew_permissions
SET name = 'Gerir visitas',
    description = 'Marcar, remarcar e cancelar as visitas do negócio: quem vai, o dia e a hora, o tipo e a morada. Marcar passa o negócio a Visita e ao comercial escolhido.',
    updated_at = now()
WHERE code = 'negocios.visita.gerir';

-- ---- 2. ninguém perde nada: quem tem visita.gerir recebe visita.preencher (menos a Assistente Comercial da nike)
DO $c$
DECLARE v_prev text; v_n int; v_p int;
BEGIN
  v_prev := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
  SELECT rp.role_id, 'negocios.visita.preencher', NULL::uuid
  FROM public.anew_role_permissions rp
  JOIN public.anew_roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
  WHERE rp.permission_code = 'negocios.visita.gerir'
    AND rp.role_id <> 'dbc1b868-e389-4d1b-9e1d-e126a002fd40'
  ON CONFLICT (role_id, permission_code) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('request.jwt.claims', CASE WHEN coalesce(v_prev, '') = '' THEN '{}' ELSE v_prev END, true);
  INSERT INTO public.neg_papeis_permissoes (papel, permission_code)
  SELECT pp.papel, 'negocios.visita.preencher' FROM public.neg_papeis_permissoes pp WHERE pp.permission_code = 'negocios.visita.gerir'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_p = ROW_COUNT;
  RAISE NOTICE 'visita.preencher: % perfis, % papéis no Negócio.', v_n, v_p;
  IF EXISTS (SELECT 1 FROM public.anew_role_permissions rp JOIN public.anew_roles r ON r.id = rp.role_id AND r.deleted_at IS NULL
             WHERE rp.permission_code = 'negocios.visita.gerir' AND rp.role_id <> 'dbc1b868-e389-4d1b-9e1d-e126a002fd40'
               AND NOT EXISTS (SELECT 1 FROM public.anew_role_permissions x WHERE x.role_id = rp.role_id AND x.permission_code = 'negocios.visita.preencher'))
     OR EXISTS (SELECT 1 FROM public.neg_papeis_permissoes pp WHERE pp.permission_code = 'negocios.visita.gerir'
               AND NOT EXISTS (SELECT 1 FROM public.neg_papeis_permissoes x WHERE x.papel = pp.papel AND x.permission_code = 'negocios.visita.preencher')) THEN
    RAISE EXCEPTION 'CONFERIR: há quem tenha visita.gerir sem visita.preencher';
  END IF;
END $c$;

-- ---- 3. a fotografia das permissões
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
$function$
;

-- ---- 4. gravar o negócio
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

  -- 20270113130000 (cada fase pede a sua permissão; substitui a regra da 20270113120000, que fica como um caso desta): gravar o negócio
  --   pede, além de pessoas.edit, uma permissão da fase em que ele está na base (a gravada ou a dada pelo servidor), por perfil, Papel
  --   no Negócio ou admin (fn_cat_pode). O mapa (o mesmo de PERMS_DA_FASE, src/emylia/permissoes.ts):
  --     Por contactar / Contacto (0, 1)        negocios.contacto.registar
  --     Contacto «passado ao comercial» e Visita (1 com contacto_concluido, 2)   negocios.visita.gerir
  --     Negócio (3)   negocios.orcamento.editar, negocios.margem.aprovar, negocios.proposta.enviar, negocios.proposta.decidir,
  --                   negocios.contrato.editar e negocios.obra.planear (as medidas e o plano antes do contrato)
  --     Financeiro (4) sem permissão de fase (fica pessoas.edit, como antes; não foi pedido e tiraria a fatura a quem a regista)
  --     Obra (5)      as negocios.obra.* e as do Negócio (as adendas)
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
                               'negocios.contrato.editar', 'negocios.obra.planear']
      WHEN v_fb = 4 THEN NULL
      ELSE ARRAY['negocios.obra.planear', 'negocios.obra.executar', 'negocios.obra.materiais', 'negocios.obra.imprevistos', 'negocios.obra.fechar',
                 'negocios.obra.tecnico', 'negocios.orcamento.editar', 'negocios.margem.aprovar', 'negocios.proposta.enviar',
                 'negocios.proposta.decidir', 'negocios.contrato.editar']
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
END $function$
;

-- ---- 5. dar resultado à visita
CREATE OR REPLACE FUNCTION public.neg_resultado_visita(p_visita_id uuid, p_resultado text, p_feita boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vis      record;
  v_entity   uuid;
  v_cliente  boolean;
  v_feita    boolean := COALESCE(p_feita, false);
  v_concluir boolean;
  v_mudou    boolean := false;
  v_motivo   text;
  v_n        int;
BEGIN
  -- 20270105700000: quem só tem o Papel no Negócio entra pelo invólucro DEFINER
  IF coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_visita_so_papel(p_visita_id) THEN
    RETURN public.fn_neg_papel_resultado_visita(p_visita_id, p_resultado, p_feita);
  END IF;
  IF p_visita_id IS NULL
     OR (p_resultado IS NULL AND NOT v_feita)
     OR p_resultado NOT IN ('interessado', 'aPensar', 'semInteresse', 'obraInviavel') THEN
    RAISE EXCEPTION 'Valor inválido: resultado da visita.' USING ERRCODE = 'NG009';
  END IF;

  SELECT s.organization_id, s.negocio_id, s.entity_id, s.visit_outcome, s.status,
         s.start_datetime, s.created_by, s.user_id
    INTO v_vis
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.time_off_type IS NULL AND s.vacation_id IS NULL;
  -- "Não existe", "não se vê" e "organização sem a página Pessoas": a mesma resposta.
  IF NOT FOUND
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = v_vis.organization_id) THEN
    RAISE EXCEPTION 'Visita indisponível.' USING ERRCODE = 'NG004';
  END IF;

  -- pessoas.edit com âmbito sobre a visita (org:*, criador ou utilizador).
  IF NOT ((public.has_anew_permission(auth.uid(), 'pessoas.edit')
          AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                      WHERE k.scope_key = v_vis.organization_id::text || ':*'
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.created_by::text
                         OR k.scope_key = v_vis.organization_id::text || ':' || v_vis.user_id::text))
          -- 20270105700000: ou o Papel no Negócio (só a entrar pelo invólucro, re-verificado)
          OR (v_vis.negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND public.fn_neg_papel_conta(v_vis.negocio_id))) THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 20270105200000: a visita de um negócio pede também uma permissão da visita; 20270114320000: dar resultado é preencher a visita
  IF v_vis.negocio_id IS NOT NULL AND NOT public.fn_cat_pode(v_vis.organization_id, 'negocios.visita.preencher') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.preencher): não pode dar resultado às visitas do negócio.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Uma visita cancelada não se dá como feita nem recebe resultado (com e sem resultado).
  IF v_vis.status = 'cancelled'::public.schedule_item_status THEN
    RAISE EXCEPTION 'A visita foi cancelada: não recebe resultado.' USING ERRCODE = 'NG018';
  END IF;

  IF v_feita AND v_vis.start_datetime > now() THEN
    RAISE EXCEPTION 'Valor inválido: uma visita no futuro não pode ser dada como feita.' USING ERRCODE = 'NG009';
  END IF;

  -- status só entra no UPDATE quando muda (o trigger dos feriados corre em UPDATE OF status).
  v_concluir := v_feita AND v_vis.status <> 'completed'::public.schedule_item_status;

  IF p_resultado IS NULL THEN
    -- Só "feita": não toca no resultado nem na abordagem.
    IF v_concluir THEN
      UPDATE public.schedule_items s
      SET status = 'completed'::public.schedule_item_status
      WHERE s.id = p_visita_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
      END IF;
      v_mudou := true;
    END IF;
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  IF v_concluir THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado, status = 'completed'::public.schedule_item_status
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF v_vis.visit_outcome IS DISTINCT FROM p_resultado THEN
    UPDATE public.schedule_items s
    SET visit_outcome = p_resultado
    WHERE s.id = p_visita_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    v_n := -1;
  END IF;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Sem permissão para alterar a visita.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_mudou := v_n = 1;

  IF p_resultado NOT IN ('semInteresse', 'obraInviavel') THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', NULL);
  END IF;

  -- 20261228200000: a pessoa é a entidade viva da visita, na mesma
  -- organização; a abordagem é a dela (anew_entities.closure_result). Só uma
  -- entidade lead (client_since nulo) se encerra: um cliente dá 'sem_lead'.
  SELECT e.id, e.client_since IS NOT NULL INTO v_entity, v_cliente
  FROM public.anew_entities e
  WHERE e.id = v_vis.entity_id AND e.organization_id = v_vis.organization_id
    AND e.deleted_at IS NULL;

  IF v_vis.negocio_id IS NOT NULL THEN
    v_motivo := 'visita_de_negocio';
  ELSIF v_entity IS NULL THEN
    v_motivo := 'sem_pessoa';
  ELSIF public.fn_neg_tem_negocio_aberto(v_vis.organization_id, v_entity) THEN
    v_motivo := 'negocios_abertos';
  ELSIF v_cliente THEN
    v_motivo := 'sem_lead';
  END IF;

  IF v_motivo IS NOT NULL THEN
    RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', false,
                              'motivo_nao_encerrada', v_motivo);
  END IF;

  v_mudou := (public.fn_neg_mudar_abordagem(
    v_vis.organization_id, v_entity, NULL, p_resultado, NULL, 'Resultado da visita')
    ->> 'mudou')::boolean OR v_mudou;

  RETURN jsonb_build_object('mudou', v_mudou, 'abordagem_encerrada', true,
                            'motivo_nao_encerrada', NULL);
END;
$function$
;

-- ---- 6. o levantamento
CREATE OR REPLACE FUNCTION public.neg_guardar_levantamento(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_dados jsonb, p_linhas jsonb, p_respostas jsonb, p_negocio_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_neg       public.negocios;
  v_lev       public.levantamentos;
  v_dados     jsonb := COALESCE(p_dados, '{}'::jsonb);
  v_linhas    jsonb := COALESCE(p_linhas, '[]'::jsonb);
  v_respostas jsonb := COALESCE(p_respostas, '{}'::jsonb);
  v_data      date;
  v_visita    uuid;
  v_feito_por uuid;
  v_criado    boolean;
  v_ligado    uuid;
  v_n         int;
  -- 20261226090000: questionário configurável.
  v_versao    integer;
  v_versao_cl integer;
  v_res       jsonb;
  v_erro      text;
  -- 20261231100000: morada da obra e a sua origem.
  v_rua       text;
  v_cp        text;
  v_loc       text;
  v_andar     text;
  v_origem_cl text;
  v_origem    text;
  v_igual_ent boolean;
  -- 20270105700000: a entrar pelo invólucro do Papel no Negócio (re-verificado aqui)
  v_papel     boolean := p_negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') = 'on' AND public.fn_neg_papel_conta(p_negocio_id);
BEGIN
  IF p_negocio_id IS NOT NULL AND coalesce(current_setting('app.neg_via_papel', true), '') <> 'on' AND public.fn_neg_negocio_so_papel(p_negocio_id) THEN
    RETURN public.fn_neg_papel_guardar_levantamento(p_id, p_organization_id, p_entity_id, p_dados, p_linhas, p_respostas, p_negocio_id);
  END IF;
  IF p_id IS NULL
     OR jsonb_typeof(v_dados) <> 'object'
     OR jsonb_typeof(v_linhas) <> 'array'
     OR jsonb_typeof(v_respostas) <> 'object' THEN
    RAISE EXCEPTION 'Valor inválido: identificador, dados, linhas ou respostas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_linhas) > 200
     OR (SELECT count(*) FROM jsonb_object_keys(v_respostas)) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: até 200 linhas e 200 respostas.' USING ERRCODE = 'NG009';
  END IF;
  BEGIN
    v_data      := (v_dados ->> 'data_levantamento')::date;
    v_visita    := (v_dados ->> 'visita_id')::uuid;
    v_feito_por := (v_dados ->> 'feito_por')::uuid;
    v_versao_cl := (v_dados ->> 'versao_questionario')::integer;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow
              OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: data, visita, autor ou versão do questionário.' USING ERRCODE = 'NG009';
  END;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: falta a data do levantamento.' USING ERRCODE = 'NG009';
  END IF;

  -- 20261231100000: morada da obra; a origem pode vir do ecrã ('entidade',
  -- 'manual' ou 'localizacao'); 'entidade' ou nada é a base que decide (abaixo).
  v_rua       := NULLIF(btrim(v_dados ->> 'morada_rua'), '');
  v_cp        := NULLIF(btrim(v_dados ->> 'morada_codigo_postal'), '');
  v_loc       := NULLIF(btrim(v_dados ->> 'morada_localidade'), '');
  v_andar     := NULLIF(btrim(v_dados ->> 'morada_andar'), '');
  v_origem_cl := NULLIF(btrim(v_dados ->> 'morada_origem'), '');
  IF v_origem_cl IS NOT NULL AND v_origem_cl NOT IN ('entidade', 'manual', 'localizacao') THEN
    RAISE EXCEPTION 'Valor inválido: origem da morada (entidade, manual ou localizacao).' USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 20261226090000: o questionário da organização. Bloqueio PARTILHADO, o mesmo
  -- que neg_guardar_questionario toma em exclusivo: as respostas validam-se e
  -- gravam-se contra uma configuração que não muda a meio (e o tipo de uma
  -- pergunta não muda enquanto se grava uma resposta a ela).
  PERFORM pg_advisory_xact_lock_shared(
    hashtextextended('levantamento_questionario:' || p_organization_id::text, 0));
  SELECT q.versao INTO v_versao
  FROM public.levantamento_questionario q
  WHERE q.organization_id = p_organization_id;
  IF v_versao IS NULL AND v_respostas <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;

  -- Validação e snapshot das respostas (sob RLS), ANTES de escrever.
  -- 20261231100000: pelo helper e só a aba 'visita'; uma resposta a uma pergunta
  -- da aba Qualificação é NG009 (a Qualificação grava-se no negócio, por
  -- neg_guardar_qualificacao).
  v_res := public.fn_neg_validar_respostas(p_organization_id, v_respostas, 'visita');

  -- Ordem de bloqueio: negócio primeiro (ligação feita no fim).
  IF p_negocio_id IS NOT NULL THEN
    SELECT * INTO v_neg FROM public.fn_neg_negocio_editavel(p_negocio_id, ARRAY['aberto']);
    IF v_neg.organization_id <> p_organization_id OR v_neg.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF EXISTS (SELECT 1 FROM public.levantamentos o
               WHERE o.negocio_id = p_negocio_id AND o.id <> p_id) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.' USING ERRCODE = 'NG013';
    END IF;
    -- 20270105200000: o levantamento (diagnóstico no local) de um negócio pede também uma permissão da visita; 20270114320000: a de preencher
    IF NOT public.fn_cat_pode(p_organization_id, 'negocios.visita.preencher') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.visita.preencher): não pode gravar o levantamento do negócio.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT v_papel THEN
    PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  END IF;

  -- 20261231100000: origem da morada. Sem morada: NULL. 'manual' ou
  -- 'localizacao' enviados pelo ecrã ficam como vieram. Senão (nada ou
  -- 'entidade'), derivação pura: 'entidade' se os 4 campos forem iguais à
  -- morada principal em vigor da pessoa (como a ficha a mostra), senão 'manual'.
  IF v_rua IS NULL AND v_cp IS NULL AND v_loc IS NULL AND v_andar IS NULL THEN
    v_origem := NULL;
  ELSIF v_origem_cl IN ('manual', 'localizacao') THEN
    v_origem := v_origem_cl;
  ELSE
    v_igual_ent := EXISTS (
      SELECT 1
      FROM (SELECT NULLIF(btrim(concat_ws(' ', a.street, a.number)), '') AS rua,
                   NULLIF(btrim(a.postal_code), '') AS cp,
                   NULLIF(btrim(a.city), '') AS loc,
                   NULLIF(btrim(a.floor), '') AS andar
            FROM public.anew_entity_addresses ea
            JOIN public.anew_addresses a ON a.id = ea.address_id
            WHERE ea.entity_id = p_entity_id
              AND (ea.valid_to IS NULL OR ea.valid_to > now())
            ORDER BY ea.is_primary IS TRUE DESC, ea.created_at DESC, ea.id DESC
            LIMIT 1) m
      WHERE m.rua IS NOT DISTINCT FROM v_rua AND m.cp IS NOT DISTINCT FROM v_cp
        AND m.loc IS NOT DISTINCT FROM v_loc AND m.andar IS NOT DISTINCT FROM v_andar);
    v_origem := CASE WHEN v_igual_ent THEN 'entidade' ELSE 'manual' END;
  END IF;

  -- 1. CRIAR (sem negocio_id) ou alterar o existente.
  INSERT INTO public.levantamentos
    (id, organization_id, entity_id, visita_id, feito_por, data_levantamento, estado, notas,
     morada_rua, morada_codigo_postal, morada_localidade, morada_andar, morada_origem)
  VALUES
    (p_id, p_organization_id, p_entity_id, v_visita, v_feito_por, v_data,
     COALESCE(NULLIF(v_dados ->> 'estado', ''), 'por_fazer'),
     NULLIF(btrim(v_dados ->> 'notas'), ''),
     v_rua, v_cp, v_loc, v_andar, v_origem)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_criado := v_n > 0;

  IF NOT v_criado THEN
    SELECT lv.* INTO v_lev FROM public.levantamentos lv WHERE lv.id = p_id;
    IF NOT FOUND OR v_lev.organization_id <> p_organization_id OR v_lev.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Registo indisponível para ligar.' USING ERRCODE = 'NG004';
    END IF;
    IF v_lev.negocio_id IS NOT NULL THEN
      IF v_lev.negocio_id = p_negocio_id THEN
        RETURN jsonb_build_object('levantamento_id', p_id, 'criado', false, 'mudou', false,
                                  'ligado_a', v_lev.negocio_id,
                                  'versao_questionario', v_versao,
                                  'questionario_mudou', v_versao_cl IS NOT NULL
                                                        AND v_versao_cl IS DISTINCT FROM v_versao);
      END IF;
      RAISE EXCEPTION 'Este levantamento já está ligado a um negócio e não se altera; registe um novo.'
        USING ERRCODE = 'NG005';
    END IF;

    UPDATE public.levantamentos lv
    SET visita_id            = v_visita,
        feito_por            = COALESCE(v_feito_por, lv.feito_por),
        data_levantamento    = v_data,
        estado               = COALESCE(NULLIF(v_dados ->> 'estado', ''), lv.estado),
        notas                = NULLIF(btrim(v_dados ->> 'notas'), ''),
        morada_rua           = v_rua,
        morada_codigo_postal = v_cp,
        morada_localidade    = v_loc,
        morada_andar         = v_andar,
        -- a morada não mudou e o ecrã não mandou origem: mantém a guardada
        -- (assim um levantamento 'localizacao' não passa a 'manual' só por se
        -- gravarem as notas); origem explícita ganha sempre.
        morada_origem        = CASE
          WHEN v_origem IS NULL THEN NULL
          WHEN v_origem_cl IS NULL
               AND lv.morada_origem IS NOT NULL
               AND lv.morada_rua IS NOT DISTINCT FROM v_rua
               AND lv.morada_codigo_postal IS NOT DISTINCT FROM v_cp
               AND lv.morada_localidade IS NOT DISTINCT FROM v_loc
               AND lv.morada_andar IS NOT DISTINCT FROM v_andar THEN lv.morada_origem
          ELSE v_origem END
    WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Sem permissão para alterar o levantamento.' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 2. PREENCHER: linhas por substituição completa, na ordem recebida.
  DELETE FROM public.levantamento_linhas ll WHERE ll.levantamento_id = p_id;
  BEGIN
    INSERT INTO public.levantamento_linhas
      (levantamento_id, organization_id, divisao, trabalho, trabalho_outro, medida, unidade,
       observacoes, ordem)
    SELECT p_id, p_organization_id,
           e.valor ->> 'divisao',
           e.valor ->> 'trabalho',
           NULLIF(btrim(e.valor ->> 'trabalho_outro'), ''),
           (e.valor ->> 'medida')::numeric,
           COALESCE(NULLIF(e.valor ->> 'unidade', ''), 'm2'),
           NULLIF(btrim(e.valor ->> 'observacoes'), ''),
           (e.posicao - 1)::int
    FROM jsonb_array_elements(v_linhas) WITH ORDINALITY AS e(valor, posicao);
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Valor inválido: medida de uma linha do levantamento.' USING ERRCODE = 'NG009';
  END;

  -- Respostas: as enviadas (upsert, sem id no payload) e apagar as que deixaram de vir.
  -- 20261226090000: validadas acima; o snapshot (tipo, textos, secção, ordem) só
  -- se escreve quando a resposta é nova ou o valor mudou, para que mudar a
  -- configuração não altere o que já foi respondido.
  INSERT INTO public.levantamento_respostas AS lr
    (levantamento_id, organization_id, seccao, pergunta, resposta, tipo, pergunta_texto,
     seccao_titulo, bloco, ordem, escolhas, escolhas_texto, valor_texto, valor_numero)
  SELECT p_id, p_organization_id, x.seccao, x.pergunta, x.resposta, x.tipo, x.pergunta_texto,
         x.seccao_titulo, x.bloco, x.ordem, x.escolhas, x.escolhas_texto, x.valor_texto, x.valor_numero
  FROM jsonb_to_recordset(v_res) AS x(pergunta text, seccao text, resposta text, tipo text,
         pergunta_texto text, seccao_titulo text, bloco text, ordem integer, escolhas text[],
         escolhas_texto text[], valor_texto text, valor_numero numeric)
  LEFT JOIN public.levantamento_respostas a
    ON a.levantamento_id = p_id AND a.pergunta = x.pergunta
  WHERE a.id IS NULL
     OR a.tipo IS DISTINCT FROM x.tipo
     OR a.resposta IS DISTINCT FROM x.resposta
     OR a.valor_texto IS DISTINCT FROM x.valor_texto
     OR a.valor_numero IS DISTINCT FROM x.valor_numero
     OR ARRAY(SELECT u.c FROM unnest(a.escolhas) AS u(c) ORDER BY u.c)
        IS DISTINCT FROM ARRAY(SELECT u.c FROM unnest(x.escolhas) AS u(c) ORDER BY u.c)
  ON CONFLICT (levantamento_id, pergunta)
  DO UPDATE SET seccao = EXCLUDED.seccao, resposta = EXCLUDED.resposta, tipo = EXCLUDED.tipo,
                pergunta_texto = EXCLUDED.pergunta_texto, seccao_titulo = EXCLUDED.seccao_titulo,
                bloco = EXCLUDED.bloco, ordem = EXCLUDED.ordem, escolhas = EXCLUDED.escolhas,
                escolhas_texto = EXCLUDED.escolhas_texto, valor_texto = EXCLUDED.valor_texto,
                valor_numero = EXCLUDED.valor_numero;

  DELETE FROM public.levantamento_respostas lr
  WHERE lr.levantamento_id = p_id
    AND NOT (v_respostas ? lr.pergunta);

  -- 3. LIGAR (o trigger valida um por negócio e a permissão).
  IF p_negocio_id IS NOT NULL THEN
    UPDATE public.levantamentos lv SET negocio_id = p_negocio_id WHERE lv.id = p_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 1 THEN
      v_ligado := p_negocio_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('levantamento_id', p_id, 'criado', v_criado, 'mudou', true,
                            'ligado_a', v_ligado,
                            'versao_questionario', v_versao,
                            'questionario_mudou', v_versao_cl IS NOT NULL
                                                  AND v_versao_cl IS DISTINCT FROM v_versao);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_levantamentos_validar_ligacoes(p_organization_id uuid, p_entity_id uuid, p_feito_por uuid, p_visita_id uuid, p_negocio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_visita record;
BEGIN
  -- Guarda de organização antes de qualquer leitura (mensagem genérica).
  PERFORM public.fn_levantamentos_exigir_organizacao(p_organization_id);

  IF p_feito_por IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_memberships m
    WHERE m.user_id = p_feito_por
      AND m.organization_id = p_organization_id
      AND m.status = 'active'
      AND m.role_is_client IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Quem fez o levantamento tem de ser membro activo da organização.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_visita_id IS NOT NULL THEN
    SELECT s.organization_id, s.entity_id, s.contact_id, s.deal_id,
           s.time_off_type, s.vacation_id
      INTO v_visita
    FROM public.schedule_items s
    WHERE s.id = p_visita_id;

    IF NOT FOUND OR v_visita.organization_id IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'A visita indicada não existe nesta organização.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_visita.entity_id IS NOT NULL THEN
      -- A visita liga à entidade (20261228200000): tem de ser a pessoa do
      -- levantamento, e nunca uma ausência ou umas férias.
      IF v_visita.entity_id IS DISTINCT FROM p_entity_id
         OR v_visita.time_off_type IS NOT NULL
         OR v_visita.vacation_id IS NOT NULL THEN
        RAISE EXCEPTION 'A visita indicada é de outra pessoa.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_visita.contact_id IS NOT NULL
       OR v_visita.deal_id IS NOT NULL
       OR v_visita.time_off_type IS NOT NULL
       OR v_visita.vacation_id IS NOT NULL THEN
      -- D5: sem pessoa só se aceita uma visita "solta" (sem contacto, negócio,
      -- ausência nem férias): nunca uma folga, umas férias ou uma reunião de
      -- outra pessoa.
      RAISE EXCEPTION 'A visita indicada é de outra pessoa ou não é uma visita.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_negocio_id IS NOT NULL THEN
    -- Negócio vivo, da mesma organização e pessoa e, com sessão, com
    -- pessoas.edit de quem liga sobre esse negócio (espelha negocios_update:
    -- chave org:*, org:assigned_to ou org:created_by). Uma só mensagem para
    -- "não existe", "é de outra pessoa", "está no lixo" e "sem acesso".
    IF NOT EXISTS (
      SELECT 1 FROM public.negocios n
      WHERE n.id = p_negocio_id
        AND n.organization_id = p_organization_id
        AND n.entity_id = p_entity_id
        AND n.deleted_at IS NULL
        AND (
          v_uid IS NULL
          -- 20270105700000: ou o Papel no Negócio, num negócio onde conta (fn_neg_papel_conta)
          OR public.fn_neg_papel_conta(n.id)
          OR (
            public.has_anew_permission(v_uid, 'pessoas.edit')
            AND EXISTS (
              SELECT 1
              FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
              WHERE k.scope_key = n.organization_id::text || ':*'
                 OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                 OR k.scope_key = n.organization_id::text || ':' || n.created_by::text
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'O negócio indicado não está disponível para ligar a este levantamento.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- 20270106020000: ligar um levantamento a um negócio é o diagnóstico no local desse negócio: com sessão, pede também
    -- negocios.visita.gerir na organização (fn_cat_pode: permissão do papel na organização, Papel no Negócio ou system admin),
    -- como neg_guardar_levantamento já pede. Fecha o UPDATE direto (pessoas.edit) e neg_ligar_registo('levantamento').
    -- 20270114320000: o diagnóstico no local é preencher a visita
    IF v_uid IS NOT NULL AND NOT public.fn_cat_pode(p_organization_id, 'negocios.visita.preencher') THEN
      RAISE EXCEPTION 'Sem permissão (negocios.visita.preencher): não pode ligar o levantamento ao negócio.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Serializa as ligações ao mesmo negócio: a segunda espera pelo fim da
    -- primeira e, com um snapshot novo, vê-a. Assim "já tem levantamento"
    -- dá esta mensagem e não o erro 23505 do UNIQUE (que mostraria o uuid).
    PERFORM pg_advisory_xact_lock(
      hashtextextended('levantamentos.negocio_id:' || p_negocio_id::text, 0));
    IF EXISTS (
      SELECT 1 FROM public.levantamentos l
      WHERE l.negocio_id = p_negocio_id
    ) THEN
      RAISE EXCEPTION 'Este negócio já tem um levantamento ligado.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$function$
;

-- ---- 7. as fotografias da visita
CREATE OR REPLACE FUNCTION public.neg_visita_foto_juntar(p_organization_id uuid, p_numero integer, p_etapa text, p_foto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_neg uuid; v_b bytea; v_id uuid; v_em timestamptz;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permiss�o (negocios.visita.gerir).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir_uma(p_organization_id, ARRAY['negocios.visita.preencher']); -- 20270114320000: as fotografias são preencher a visita
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permiss�o (negocios.visita.gerir).' USING ERRCODE = 'CT001';
  END IF;
  IF p_etapa IS NULL OR p_etapa NOT IN ('exterior', 'interior', 'area') THEN
    RAISE EXCEPTION 'Dados inv�lidos: a etapa da fotografia � exterior, interior ou area.' USING ERRCODE = 'NE006';
  END IF;
  IF (SELECT count(*) FROM public.negocio_visita_fotos WHERE negocio_id = v_neg) >= 60 THEN
    RAISE EXCEPTION 'Este neg�cio j� tem 60 fotografias da visita. Apague alguma antes de juntar outra.' USING ERRCODE = 'NE006';
  END IF;
  v_b := public.fn_neg_msg_foto_bytes(p_foto);
  INSERT INTO public.negocio_visita_fotos (organization_id, negocio_id, etapa, mime, dados)
  VALUES (p_organization_id, v_neg, p_etapa, p_foto->>'mime', v_b)
  RETURNING id, created_at INTO v_id, v_em;
  RETURN jsonb_build_object('id', v_id, 'etapa', p_etapa, 'em', v_em);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.neg_visita_foto_apagar(p_organization_id uuid, p_foto_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_organization_id IS NULL OR p_foto_id IS NULL THEN
    RAISE EXCEPTION 'Sem permiss�o (negocios.visita.gerir).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir_uma(p_organization_id, ARRAY['negocios.visita.preencher']); -- 20270114320000: as fotografias são preencher a visita
  DELETE FROM public.negocio_visita_fotos WHERE id = p_foto_id AND organization_id = p_organization_id;
  RETURN FOUND;
END;
$function$
;

RESET lock_timeout;
