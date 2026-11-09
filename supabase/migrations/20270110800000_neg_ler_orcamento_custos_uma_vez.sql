-- 09/11/2026: neg_ler_negocios passava os 8 s (statement timeout) para quem nao ve custos (ex.: o tecnico de obra).
-- Em fn_neg_ler_orcamento o planner desdobrava o LATERAL e chamava fn_quote_custos_pode em cada campo de custo de cada linha.
-- OFFSET 0 impede o desdobramento: a verificacao corre uma vez por orcamento. Mesmo resultado; 16 s -> 0,34 s (medido no ramo RH).
-- Partiu da definicao viva (md5 e6f03d470545170a6af65546aef8bf3f); aborta se mudou entretanto.
DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.fn_neg_ler_orcamento(uuid)'::regprocedure)) <> 'e6f03d470545170a6af65546aef8bf3f' THEN
    RAISE EXCEPTION 'fn_neg_ler_orcamento mudou desde a leitura; rever antes de aplicar';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_neg_ler_orcamento(p_quote uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261231994000: o portal recusa com "rejeitado"; a Emylia chama-lhe "recusado"
  -- 20270102210000: sem quotes.view_costs (perfil ou Papel no NegÃ³cio) os custos, os custos/hora dos ofÃ­cios e os custos dos produtos vÃªm a null
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
  ) FROM quotes q CROSS JOIN LATERAL (SELECT public.fn_quote_custos_pode(q.organization_id) AS ver OFFSET 0) k WHERE q.id = p_quote
$function$;
