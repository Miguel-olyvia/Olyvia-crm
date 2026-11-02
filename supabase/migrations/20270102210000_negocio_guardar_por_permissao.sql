-- ============================================================
-- 20270102210000_negocio_guardar_por_permissao
-- ============================================================
-- O que faz: neg_guardar_negocio deixa de dar tudo a quem tem pessoas.edit, e a leitura do negócio esconde os custos a quem não os pode ver.
--   1. pessoas.edit continua a ser a porta (e grava o comum: lead, visita, levantamento, serviços, histórico, respostas). Comparando a
--      base antes e depois da gravação (fn_neg_marcas_permissoes: a mesma leitura, sem ids nem datas de sistema), pede ainda:
--        · negocios.orcamento.editar  se mudaram linhas, preços, custos, ofícios, zonas, desconto, prazos, prestações, versões ou adendas;
--        · negocios.margem.aprovar    se a aprovação de uma versão passou a outra coisa que não «pedida» (aprovada, recusada);
--        · negocios.proposta.enviar   se uma versão (do orçamento ou de uma adenda) passou a enviada;
--        · negocios.contrato.editar   se mudou o estado, as cláusulas, os pedidos do cliente ou a revisão de um contrato (ou de adenda).
--      Todas pelo fn_cat_pode (admin do sistema, perfil da Olyvia ou Papel no Negócio). Gravar o negócio sem mudanças passa sempre:
--      a comparação é feita na base, depois dos mesmos arredondamentos, e não no JSON.
--   2. Quem não tem quotes.view_costs grava com os custos da base (fn_neg_repor_custos: a leitura deu-lhos a null e o ecrã devolve-os
--      a 0); quem não tem negocios.orcamento.editar grava com o preço final e o total com IVA da base (fn_neg_repor_totais: são contas
--      do ecrã, refeitas a cada gravação).
--   3. fn_neg_ler_orcamento, fn_neg_ler_adendas e neg_ler_negocios: sem quotes.view_costs, os custos das linhas (custo_un, mão de obra,
--      equipamentos, consumíveis, estrutura, ajuste, custo de origem), o custo/hora dos ofícios e o custo dos produtos vêm a null.
-- Não muda: fn_neg_guardar_adendas (a comparação cobre as adendas), as recusas que já havia (fase ≥ 4, fatura, pagamento, recibo, EC,
--   assinatura) e a porta pessoas.edit.
-- Origem: pg_get_functiondef das versões vivas na base RH a 2/11/2026 (guardas md5 abaixo).
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> 'ec25f9be524abe3757b6f186423c61e4'
     OR md5(pg_get_functiondef('public.fn_neg_ler_orcamento(uuid)'::regprocedure)) <> '7f2a19286d4251bc4fd5f7ca24b87db0'
     OR md5(pg_get_functiondef('public.fn_neg_ler_adendas(uuid)'::regprocedure)) <> '6876b32de82d987ece54f85b3bf53dea'
     OR md5(pg_get_functiondef('public.neg_ler_negocios(uuid)'::regprocedure)) <> '1b995c07f9455d38d9330d719a95fb13' THEN
    RAISE EXCEPTION 'Guarda: neg_guardar_negocio, fn_neg_ler_orcamento, fn_neg_ler_adendas ou neg_ler_negocios mudou desde 2/11. Rever esta migration antes de a aplicar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'negocios.orcamento.editar') THEN
    RAISE EXCEPTION 'Guarda: falta a 20270102200000 (permissões finas no catálogo).';
  END IF;
END $do$;

-- ------------------------------------------------------------------ 1. a fotografia do que cada permissão protege
-- Lida da base antes e depois da gravação (as mesmas tabelas, depois dos mesmos arredondamentos), por isso uma gravação sem mudanças dá
-- a mesma fotografia. Sem ids nem datas de sistema; os valores que a leitura (fn_neg_ler_orcamento, fn_neg_ler_adendas) devolve com
-- coalesce entram com o mesmo coalesce, para uma linha antiga gravada de novo sem mudanças não parecer mudada.
--   orc:      o orçamento e as adendas (versões, linhas, preços, custos, ofícios, zonas, desconto, prazos, prestações)
--   aprov:    a aprovação da margem de cada versão
--   envio:    o estado de cada versão (para ver a passagem a enviado)
--   contrato: o estado, as cláusulas, os pedidos do cliente e a revisão de cada contrato
CREATE OR REPLACE FUNCTION public.fn_neg_marcas_permissoes(p_negocio uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    )) FROM c), '{}'::jsonb)
  )
$$;
REVOKE ALL ON FUNCTION public.fn_neg_marcas_permissoes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_marcas_permissoes(uuid) TO service_role;

-- ------------------------------------------------------------------ 2. quem não vê custos não os apaga
-- Sem quotes.view_costs a leitura devolve os custos a null (o ecrã mostra 0) e o JSON que volta traz esses zeros: aqui, antes de
-- gravar, cada linha que já existia (a mesma versão, a mesma ordem e o mesmo serviço/produto) fica com os custos da base. Uma linha
-- nova fica como vem.
CREATE OR REPLACE FUNCTION public.fn_neg_repor_custos_versao(p_quote uuid, o jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_quote IS NULL OR jsonb_typeof(o) <> 'object' THEN o ELSE
    o || CASE WHEN jsonb_typeof(o->'linhas') = 'array' THEN jsonb_build_object('linhas', (
        SELECT coalesce(jsonb_agg(CASE WHEN s.id IS NULL THEN x.v ELSE
          x.v || jsonb_build_object('custo_un_origem', s.custo_un_origem, 'custo',
            CASE WHEN jsonb_typeof(x.v->'custo') = 'object' THEN x.v->'custo' ELSE '{}'::jsonb END || jsonb_build_object(
              'custo_un', coalesce(s.custo_un_exato, s.cost_price, 0), 'mao_obra_un', coalesce(cu.mao_obra_un, 0),
              'equipamentos_un', coalesce(cu.equipamentos_un, 0), 'consumiveis_un', coalesce(cu.consumiveis_un, 0),
              'estrutura_hora', coalesce(cu.estrutura_hora, 0), 'estrutura_un', coalesce(cu.estrutura_un, 0), 'ajuste_un', coalesce(cu.ajuste_un, 0),
              'oficios', (SELECT coalesce(jsonb_agg(CASE WHEN so.quote_line_id IS NULL THEN f.v ELSE f.v || jsonb_build_object('custo_hora', so.custo_hora) END ORDER BY f.n), '[]')
                          FROM jsonb_array_elements(public.fn_neg_lista(x.v->'custo'->'oficios')) WITH ORDINALITY f(v, n)
                          LEFT JOIN quote_line_oficios so ON so.quote_line_id = s.id AND so.ordem = f.n - 1
                                                         AND so.perfil_chave IS NOT DISTINCT FROM f.v->>'perfil_chave')))
          END ORDER BY x.n), '[]')
        FROM jsonb_array_elements(o->'linhas') WITH ORDINALITY x(v, n)
        LEFT JOIN LATERAL (SELECT l.* FROM quote_lines l WHERE l.quote_id = p_quote AND l.ordem IS NOT DISTINCT FROM (x.v->>'ordem')::int
                             AND l.tipo_emylia IS NOT DISTINCT FROM x.v->>'tipo' AND l.service_id IS NOT DISTINCT FROM (x.v->>'servico')::uuid
                             AND l.product_id IS NOT DISTINCT FROM (x.v->>'produto')::uuid ORDER BY l.id LIMIT 1) s ON true
        LEFT JOIN quote_line_custos cu ON cu.quote_line_id = s.id)) ELSE '{}'::jsonb END
      || CASE WHEN jsonb_typeof(o->'produtos') = 'array' THEN jsonb_build_object('produtos', (
        SELECT coalesce(jsonb_agg(CASE WHEN p.quote_id IS NULL THEN x.v ELSE x.v || jsonb_build_object('custo_un', p.custo_un) END ORDER BY x.n), '[]')
        FROM jsonb_array_elements(o->'produtos') WITH ORDINALITY x(v, n)
        LEFT JOIN LATERAL (SELECT vp.* FROM quote_versao_produtos vp WHERE vp.quote_id = p_quote AND vp.ordem IS NOT DISTINCT FROM (x.v->>'ordem')::int
                             AND vp.produto_id IS NOT DISTINCT FROM (x.v->>'produto')::uuid LIMIT 1) p ON true)) ELSE '{}'::jsonb END
  END
$$;
REVOKE ALL ON FUNCTION public.fn_neg_repor_custos_versao(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_repor_custos_versao(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_neg_repor_custos(p_negocio uuid, p_linhas jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := p_linhas;
BEGIN
  IF jsonb_typeof(r) <> 'object' THEN RETURN r; END IF;
  -- as versões do orçamento
  IF jsonb_typeof(r->'orcamentos') = 'array' THEN
    r := jsonb_set(r, '{orcamentos}', (
      SELECT coalesce(jsonb_agg(public.fn_neg_repor_custos_versao(
               (SELECT q.id FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.deleted_at IS NULL
                  AND q.versao = (o.v->>'versao')::smallint LIMIT 1), o.v) ORDER BY o.n), '[]')
      FROM jsonb_array_elements(r->'orcamentos') WITH ORDINALITY o(v, n)));
  END IF;
  -- os produtos da visita (negocio_produtos)
  IF jsonb_typeof(r->'produtos') = 'array' THEN
    r := jsonb_set(r, '{produtos}', (
      SELECT coalesce(jsonb_agg(CASE WHEN p.id IS NULL THEN x.v ELSE x.v || jsonb_build_object('custo_un', p.custo_un) END ORDER BY x.n), '[]')
      FROM jsonb_array_elements(r->'produtos') WITH ORDINALITY x(v, n)
      LEFT JOIN LATERAL (SELECT np.* FROM negocio_produtos np WHERE np.negocio_id = p_negocio AND np.ordem IS NOT DISTINCT FROM (x.v->>'ordem')::int
                           AND np.produto_id IS NOT DISTINCT FROM (x.v->>'produto')::uuid ORDER BY np.id LIMIT 1) p ON true));
  END IF;
  -- as linhas das adendas (custo_un e mao_obra_un, pela ordem e pela chave da linha)
  IF jsonb_typeof(r->'adendas') = 'array' THEN
    r := jsonb_set(r, '{adendas}', (
      SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(a.v->'versoes') <> 'array' THEN a.v ELSE
        jsonb_set(a.v, '{versoes}', (
          SELECT coalesce(jsonb_agg(CASE WHEN qa.id IS NULL OR jsonb_typeof(o.v->'linhas') <> 'array' THEN o.v ELSE
            jsonb_set(o.v, '{linhas}', (
              SELECT coalesce(jsonb_agg(CASE WHEN s.id IS NULL THEN x.v ELSE
                x.v || jsonb_build_object('custo_un', CASE WHEN cu.congelado THEN s.custo_un_exato END, 'mao_obra_un', s.mao_obra_congelada) END ORDER BY x.n), '[]')
              FROM jsonb_array_elements(o.v->'linhas') WITH ORDINALITY x(v, n)
              LEFT JOIN LATERAL (SELECT l.* FROM quote_lines l WHERE l.quote_id = qa.id AND l.ordem IS NOT DISTINCT FROM (x.v->>'ordem')::int
                                   AND l.chave_emylia IS NOT DISTINCT FROM x.v->>'chave' ORDER BY l.id LIMIT 1) s ON true
              LEFT JOIN quote_line_custos cu ON cu.quote_line_id = s.id)) END ORDER BY o.n), '[]')
          FROM jsonb_array_elements(a.v->'versoes') WITH ORDINALITY o(v, n)
          LEFT JOIN LATERAL (SELECT q.id FROM quotes q JOIN adendas ad ON ad.id = q.adenda_id
                             WHERE ad.negocio_id = p_negocio AND ad.numero = (a.v->>'numero')::smallint AND q.versao = (o.v->>'versao')::smallint
                               AND q.deleted_at IS NULL LIMIT 1) qa ON true)) END ORDER BY a.n), '[]')
      FROM jsonb_array_elements(r->'adendas') WITH ORDINALITY a(v, n)));
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_repor_custos(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_repor_custos(uuid, jsonb) TO service_role;

-- ------------------------------------------------------------------ 3. quem não edita o orçamento não muda os totais
-- O preço final e o total com IVA de cada versão (e de cada adenda) são contas do ecrã, refeitas a cada gravação: quem não tem
-- negocios.orcamento.editar grava com os da base (uma diferença de arredondamento não o impede de gravar o resto, e não os muda).
CREATE OR REPLACE FUNCTION public.fn_neg_repor_totais(p_negocio uuid, p_linhas jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb := p_linhas;
BEGIN
  IF jsonb_typeof(r) <> 'object' THEN RETURN r; END IF;
  IF jsonb_typeof(r->'orcamentos') = 'array' THEN
    r := jsonb_set(r, '{orcamentos}', (
      SELECT coalesce(jsonb_agg(CASE WHEN q.id IS NULL OR jsonb_typeof(o.v) <> 'object' THEN o.v
                                     ELSE o.v || jsonb_build_object('preco_final', q.preco_final, 'total_com_iva', q.total_com_iva) END ORDER BY o.n), '[]')
      FROM jsonb_array_elements(r->'orcamentos') WITH ORDINALITY o(v, n)
      LEFT JOIN LATERAL (SELECT q.* FROM quotes q WHERE q.negocio_id = p_negocio AND q.fluxo_emylia AND q.deleted_at IS NULL
                           AND q.versao = (o.v->>'versao')::smallint LIMIT 1) q ON true));
  END IF;
  IF jsonb_typeof(r->'adendas') = 'array' THEN
    r := jsonb_set(r, '{adendas}', (
      SELECT coalesce(jsonb_agg(CASE WHEN ad.id IS NULL OR jsonb_typeof(a.v) <> 'object' THEN a.v ELSE
        a.v || jsonb_build_object('total', ad.total, 'total_com_iva', ad.total_com_iva)
            || CASE WHEN jsonb_typeof(a.v->'versoes') = 'array' THEN jsonb_build_object('versoes', (
                 SELECT coalesce(jsonb_agg(CASE WHEN q.id IS NULL OR jsonb_typeof(o.v) <> 'object' THEN o.v
                                                ELSE o.v || jsonb_build_object('total', q.preco_final, 'total_com_iva', q.total_com_iva) END ORDER BY o.n), '[]')
                 FROM jsonb_array_elements(a.v->'versoes') WITH ORDINALITY o(v, n)
                 LEFT JOIN LATERAL (SELECT q.* FROM quotes q WHERE q.adenda_id = ad.id AND q.versao = (o.v->>'versao')::smallint
                                      AND q.deleted_at IS NULL LIMIT 1) q ON true)) ELSE '{}'::jsonb END
        END ORDER BY a.n), '[]')
      FROM jsonb_array_elements(r->'adendas') WITH ORDINALITY a(v, n)
      LEFT JOIN LATERAL (SELECT x.* FROM adendas x WHERE x.negocio_id = p_negocio AND x.numero = (a.v->>'numero')::smallint LIMIT 1) ad ON true));
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.fn_neg_repor_totais(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_repor_totais(uuid, jsonb) TO service_role;

-- ------------------------------------------------------------------ 4. neg_guardar_negocio
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
  IF NOT public.fn_cat_pode(p_org, 'quotes.view_costs') THEN p_linhas := public.fn_neg_repor_custos(p_negocio_id, p_linhas); END IF;
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

  RETURN jsonb_build_object('negocio_id', p_negocio_id, 'proposta_id', v_prop, 'orcamento_atual_id', v_atual, 'avisos', to_jsonb(v_avisos));
END $function$
;

-- ------------------------------------------------------------------ 5. as leituras: os custos só para quem os pode ver
CREATE OR REPLACE FUNCTION public.fn_neg_ler_orcamento(p_quote uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20261231994000: o portal recusa com "rejeitado"; a Emylia chama-lhe "recusado"
  -- 20270102210000: sem quotes.view_costs (perfil ou Papel no Negócio) os custos, os custos/hora dos ofícios e os custos dos produtos vêm a null
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
  ) FROM quotes q CROSS JOIN LATERAL (SELECT public.fn_cat_pode(q.organization_id, 'quotes.view_costs') AS ver) k WHERE q.id = p_quote
$function$
;

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
  CROSS JOIN LATERAL (SELECT public.fn_cat_pode(a.organization_id, 'quotes.view_costs') AS ver) k
  WHERE a.negocio_id = p_negocio
$function$
;

CREATE OR REPLACE FUNCTION public.neg_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ver boolean := public.fn_cat_pode(p_org, 'quotes.view_costs'); -- 20270102210000: sem ele, o custo dos produtos vem a null
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
END $function$
;
