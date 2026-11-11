-- ============================================================
-- 20270114300000 assistente_grava_sem_visita_gerir
-- ============================================================
-- Problema (11/11, perfil «Assistente Comercial»: pessoas.view, pessoas.edit, negocios.contacto.registar, sem negocios.visita.gerir):
--   num negócio novo em «Por contactar», gravar «Quem pede» dava «Sem permissão (negocios.visita.gerir): não pode gerir as visitas nem o
--   diagnóstico no local.».
-- Causa: neg_guardar_negocio já só pede visita.gerir quando a fotografia 'visita' de fn_neg_marcas_permissoes muda (antes/depois). Um
--   negócio sem negocio_medidas dá a vaga (slot) NULL; o ecrã envia slot '' (nenhuma vaga) e o INSERT grava ''. A fotografia passava de
--   NULL a '' e contava como mudança da visita. Provado por SELECT com JWT simulado: o mesmo pedido com slot NULL grava.
-- Correção: na fotografia, '' e NULL são a mesma coisa (nullif(m.slot, '')). Só muda a comparação; nada do que se grava muda. Quem muda
--   de facto a vaga, as medidas, os serviços, os produtos, as partes ou as respostas v<n>_/diag_ continua a precisar de visita.gerir.
-- Sem tabelas nem colunas novas. Grants, SECURITY DEFINER, STABLE e search_path iguais (CREATE OR REPLACE mantém o ACL).
-- Texto a partir de pg_get_functiondef VIVO (11/11/2026); a guarda pára se mudou desde a leitura.
-- Reversão (só como migration nova): repor 'slot', m.slot.
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.fn_neg_marcas_permissoes(uuid)'::regprocedure)) <> '30f223d706a1b34ede095758922dc6a6' THEN
    RAISE EXCEPTION 'fn_neg_marcas_permissoes mudou desde a leitura (11/11/2026); rever antes de aplicar';
  END IF;
END $g$;

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
    -- 20270105200000: a visita e o diagnóstico no local (negocios.visita.gerir), com os mesmos coalesce do INSERT de neg_guardar_negocio
    --   (um negócio sem medidas gravadas dá a fotografia de umas medidas vazias, para a primeira gravação não parecer mudança)
    'visita', jsonb_build_object(
      'medidas', (SELECT jsonb_build_object('pav', coalesce(m.pav, 0), 'par', coalesce(m.par, 0), 'ptf', coalesce(m.ptf, 0), 'ptq', coalesce(m.ptq, 0),
                    'pts', coalesce(m.pts, 0), 'pcs', coalesce(m.pcs, 0), 'necessidades', to_jsonb(coalesce(m.necessidades, '{}')), 'slot', nullif(m.slot, ''),
                    'fotos_total', coalesce(m.fotos_total, 0), 'fotos_exterior', coalesce(m.fotos_exterior, 0), 'fotos_interior', coalesce(m.fotos_interior, 0),
                    'fotos_area', coalesce(m.fotos_area, 0), 'fechada', coalesce(m.fechada, false), 'visitas', to_jsonb(coalesce(m.visitas, '{}')))
                  FROM (SELECT 1) u LEFT JOIN negocio_medidas m ON m.negocio_id = p_negocio),
      'servicos', (SELECT jsonb_agg(jsonb_build_object('servico', s.servico_id, 'inclusao', s.inclusao, 'quantidade', s.quantidade, 'mantem', s.mantem,
                     'cliente_compra', s.cliente_compra) ORDER BY s.servico_id, s.inclusao, s.quantidade, s.cliente_compra) FROM negocio_servicos s WHERE s.negocio_id = p_negocio),
      'produtos', (SELECT jsonb_agg(jsonb_build_object('produto', p.produto_id, 'quantidade', p.quantidade, 'cliente_fornece', coalesce(p.cliente_fornece, false),
                     'servico', p.servico_id, 'sem_instalacao', coalesce(p.sem_instalacao, false)) ORDER BY p.produto_id, p.servico_id, p.quantidade)
                   FROM negocio_produtos p WHERE p.negocio_id = p_negocio),
      'partes', (SELECT jsonb_agg(DISTINCT x.parte ORDER BY x.parte) FROM negocio_partes_fora x WHERE x.negocio_id = p_negocio),
      -- das respostas, só as da agenda das visitas (v<n>_…) e as do diagnóstico da área (diag_…, div_<divisão>_diag_…)
      'respostas', (SELECT jsonb_object_agg(r.campo_chave, jsonb_build_object('valor', coalesce(r.valor, ''), 'sugerido', coalesce(r.sugerido, false)))
                    FROM negocio_respostas r WHERE r.negocio_id = p_negocio AND r.campo_chave ~ '^(v[0-9]+_|diag_|div_[a-z0-9]+_diag_)')
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

RESET lock_timeout;
