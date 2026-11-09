-- ============================================================
-- 20270111100000 — O técnico de obra vê o que as permissões dele dizem (aprovado pelo utilizador, 09/11/2026)
--
-- Antes: o papel 'tecnico' (cargo técnico de obra no RH ou o perfil «Ser técnico de obra») dava pessoas.view e services.view escondidas
-- (neg_papeis_permissoes); quem entra só pelo papel tem o âmbito todo e neg_ler_negocios / obra_ler_negocios devolviam todos os negócios
-- da organização, com orçamentos, contratos, faturas e custos.
--
-- Agora (só permissões; sem tabelas nem colunas novas):
--   1. O papel 'tecnico' deixa de dar pessoas.view e services.view (ficam negocios.obra.executar e negocios.obra.materiais).
--   Leitura reduzida = sem pessoas.view (services.view no Catálogo) por perfil, papel ou admin, mas com negocios.obra.executar
--   (fn_neg_so_execucao). Quem tem pessoas.view recebe exatamente o de antes; quem não tem nenhuma das duas, o mesmo erro.
--   neg_ler_negocios      só os negócios onde trabalha (fn_neg_ids_do_tecnico: tarefas da obra + visitas da agenda onde vai). Vão:
--                         nome, telefone do cliente, morada, serviço, fase, estado, EC sem valores, respostas do terreno, visitas,
--                         medidas, serviços e partes fora. Vazios/null: email, origem, motivo da perda, quem anulou e porquê,
--                         fatura/recibo, produtos, orçamentos, contratos, faturas, adendas e histórico.
--   obra_ler_negocios     as mesmas obras; o estado da Emylia sem real, realFases, ec, preco dos materiais e ch (€/h) dos registos.
--   obra_guardar_negocio  com a leitura reduzida: só as obras que recebe, só pelo ramo da execução, e o que a leitura tirou volta da base
--                         antes de tudo (fn_obra_emylia_repor_valores). Nada se apaga.
--   neg_guardar_negocio   recusa a leitura reduzida (gravar o que leu apagava orçamentos e contratos).
--   neg_vista_cliente_guardar recusa a leitura reduzida (a vista do cliente sairia sem proposta, contrato e pagamentos).
--   neg_historico_autores nada; neg_respostas_ler '[]'; neg_rececoes_ler só as dos negócios dele; neg_gestores_obra passa a responder
--                         (o responsável de obra do Hoje do técnico).
--   cat_ler_catalogo      sem services.view mas com executar: sem dinheiro (ver o comentário na função).
--
-- Cada CREATE OR REPLACE parte do pg_get_functiondef vivo de 9/11/2026 (guarda md5 abaixo).
-- Reversão (só como migration nova): repor as 10 funções com o texto vivo de 9/11 (md5 na guarda), DROP das 7 funções novas e voltar a
--   inserir ('tecnico','pessoas.view') e ('tecnico','services.view') em neg_papeis_permissoes.
-- ============================================================
SET lock_timeout = '5s';

DO $do$
BEGIN
  IF md5(pg_get_functiondef('public.neg_ler_negocios(uuid)'::regprocedure)) <> '91b62db79c73716904477d41eff6cd37'
     OR md5(pg_get_functiondef('public.obra_ler_negocios(uuid)'::regprocedure)) <> '2af7c4804c5ac28599ed738c0445e647'
     OR md5(pg_get_functiondef('public.obra_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> '97b27ee5c5013ed244a5070c5b3f80a6'
     OR md5(pg_get_functiondef('public.neg_guardar_negocio(uuid,uuid,jsonb)'::regprocedure)) <> '4f03be4d7688cced93e1263a258f062e'
     OR md5(pg_get_functiondef('public.cat_ler_catalogo(uuid)'::regprocedure)) <> '7ba17b9c177c128811ea4c74f9ea8ebb'
     OR md5(pg_get_functiondef('public.neg_historico_autores(uuid)'::regprocedure)) <> 'a1009e2fdc063aa4cd7369ad5a2a377c'
     OR md5(pg_get_functiondef('public.neg_gestores_obra(uuid)'::regprocedure)) <> 'b0b64d4f587cc99efd647fdc333241e0'
     OR md5(pg_get_functiondef('public.neg_rececoes_ler(uuid)'::regprocedure)) <> '61af8060992c606e08be3ba12db0edc3'
     OR md5(pg_get_functiondef('public.neg_respostas_ler(uuid)'::regprocedure)) <> '1fd6d0b3189c2adcea4ff2af9d6ef00b'
     OR md5(pg_get_functiondef('public.neg_vista_cliente_guardar(uuid,uuid,jsonb)'::regprocedure)) <> '83fb000617fc86555a7ed4ca1ea8107f'
     OR md5(pg_get_functiondef('public.fn_neg_ids_com_tarefa(uuid)'::regprocedure)) <> '26e9e896d7645ebee2a495df34248b60'
     OR md5(pg_get_functiondef('public.fn_cat_pode(uuid,text)'::regprocedure)) <> '9f6721f58c246917921db6c5a98a3613'
     OR md5(pg_get_functiondef('public.fn_neg_papeis(uuid)'::regprocedure)) <> 'e36bfafb23e7335ae4f3aefc8a8080b3' THEN
    RAISE EXCEPTION 'Guarda: uma das funções mudou desde 9/11/2026. Rever esta migration (refazer a partir do pg_get_functiondef vivo).';
  END IF;
  IF to_regprocedure('public.fn_neg_so_execucao(uuid,text)') IS NOT NULL
     OR to_regprocedure('public.fn_neg_ids_do_tecnico(uuid)') IS NOT NULL
     OR to_regprocedure('public.fn_neg_resposta_do_terreno(text)') IS NOT NULL
     OR to_regprocedure('public.fn_obra_tarefa_sem_valores(jsonb)') IS NOT NULL
     OR to_regprocedure('public.fn_obra_emylia_sem_valores(jsonb)') IS NOT NULL
     OR to_regprocedure('public.fn_obra_tarefa_repor_valores(jsonb,jsonb)') IS NOT NULL
     OR to_regprocedure('public.fn_obra_emylia_repor_valores(jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Guarda: as funções novas já existem. Rever esta migration.';
  END IF;
END $do$;

-- 1. O papel 'tecnico' sem as permissões escondidas
DELETE FROM public.neg_papeis_permissoes WHERE papel = 'tecnico' AND permission_code IN ('pessoas.view', 'services.view');

-- 2. NOVA fn_neg_so_execucao(org, perm): quem chama não tem `perm` (fn_cat_pode: perfil, papel do Negócio ou admin) mas tem
--    negocios.obra.executar. É quem recebe a leitura reduzida. Sem auth.uid() (service_role) dá false: nada muda.
CREATE OR REPLACE FUNCTION public.fn_neg_so_execucao(p_org uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_org IS NOT NULL AND auth.uid() IS NOT NULL
    AND NOT coalesce(public.fn_cat_pode(p_org, p_perm), false)
    AND coalesce(public.fn_cat_pode(p_org, 'negocios.obra.executar'), false)
$function$;

-- 3. NOVA fn_neg_ids_do_tecnico(org): os negócios onde quem chama trabalha: as obras com tarefas dele (fn_neg_ids_com_tarefa:
--    ops_obra_tarefa_rh e tasks[].tec da pessoa do RH ligada à conta) e as visitas da agenda onde vai (schedule_items.negocio_id,
--    schedule_item_assignees → schedule_resources.user_id = a conta dele).
CREATE OR REPLACE FUNCTION public.fn_neg_ids_do_tecnico(p_org uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(array_agg(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL), '{}'::uuid[]) FROM (
    SELECT unnest(public.fn_neg_ids_com_tarefa(p_org)) AS id WHERE p_org IS NOT NULL
    UNION
    SELECT si.negocio_id FROM schedule_items si
      JOIN schedule_item_assignees a ON a.item_id = si.id
      JOIN schedule_resources r ON r.id = a.resource_id
      JOIN anew_users u ON u.id = r.user_id AND u.auth_user_id = auth.uid()
     WHERE p_org IS NOT NULL AND auth.uid() IS NOT NULL AND si.organization_id = p_org AND si.negocio_id IS NOT NULL
  ) s
$function$;

-- 4. NOVA fn_neg_resposta_do_terreno(chave): as respostas do levantamento que vão na leitura reduzida (morada e acesso, o imóvel,
--    escolhas de produto pc_*, diagnóstico diag_*/div_*, configuração técnica cfg_*). Lista fechada: pagamento, NIF, orçamento do
--    cliente, concorrência, decisor, etc. não vão.
CREATE OR REPLACE FUNCTION public.fn_neg_resposta_do_terreno(p_chave text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_chave IS NOT NULL AND (
    p_chave = ANY (ARRAY['morada', 'localidade', 'cp', 'concelho', 'andar', 'fracao', 'gps', 'gps_precisao', 'acesso', 'chaves',
      'contacto_local', 'estacionamento', 'zona_estacionamento', 'tem_elevador', 'n_elevadores', 'n_andares', 'n_fracoes_por_andar',
      'condominio', 'horario', 'animais', 'habitada_durante_obra', 'mobilidade_reduzida', 'protecoes', 'espaco_contentor', 'contentor',
      'dist_entulho', 'amianto', 'imovel', 'tipo_espaco', 'tipologia', 'ano_construcao', 'area_util_m2', 'n_casas_banho', 'n_divisoes',
      'estado_atual', 'canalizacao', 'eletrica', 'gas', 'quadro_diferencial', 'pavimento', 'materiais_cliente', 'notas_interior',
      'obs_medidas', 'idioma', 'cor_estilo', 'planta'])
    OR p_chave LIKE 'pc\_%' OR p_chave LIKE 'diag\_%' OR p_chave LIKE 'div\_%' OR p_chave LIKE 'cfg\_%')
$function$;

-- 5. NOVA fn_obra_tarefa_sem_valores / fn_obra_emylia_sem_valores: o estado da Emylia da obra sem dinheiro. Fora: real (custo real),
--    realFases (custos, preços e margens por fase), ec (a cópia da encomenda com valor e custo: o ecrã usa a do servidor, neg_ler_negocios
--    › ec); em cada tarefa, o preco dos mats/encomendado e o ch (€/h) do exec e de cada registo (envios).
CREATE OR REPLACE FUNCTION public.fn_obra_tarefa_sem_valores(t jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb := t; k text; e jsonb;
BEGIN
  IF jsonb_typeof(t) IS DISTINCT FROM 'object' THEN RETURN t; END IF;
  FOREACH k IN ARRAY ARRAY['mats', 'encomendado'] LOOP
    IF jsonb_typeof(r->k) = 'array' THEN
      r := jsonb_set(r, ARRAY[k], (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(m) = 'object' THEN m - 'preco' ELSE m END ORDER BY i), '[]'::jsonb)
                                   FROM jsonb_array_elements(r->k) WITH ORDINALITY y(m, i)));
    END IF;
  END LOOP;
  IF jsonb_typeof(r->'exec') = 'object' THEN
    e := (r->'exec') - 'ch';
    IF jsonb_typeof(e->'envios') = 'array' THEN
      e := jsonb_set(e, '{envios}', (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x) = 'object' THEN x - 'ch' ELSE x END ORDER BY i), '[]'::jsonb)
                                     FROM jsonb_array_elements(e->'envios') WITH ORDINALITY y(x, i)));
    END IF;
    r := jsonb_set(r, '{exec}', e);
  END IF;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_obra_emylia_sem_valores(e jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' THEN RETURN e; END IF;
  r := e - ARRAY['real', 'realFases', 'ec'];
  IF jsonb_typeof(r->'plano') = 'object' AND jsonb_typeof(r->'plano'->'tasks') = 'array' THEN
    r := jsonb_set(r, '{plano,tasks}', (SELECT coalesce(jsonb_agg(public.fn_obra_tarefa_sem_valores(t) ORDER BY i), '[]'::jsonb)
                                         FROM jsonb_array_elements(r->'plano'->'tasks') WITH ORDINALITY y(t, i)));
  END IF;
  RETURN r;
END $function$;

-- 6. NOVA fn_obra_tarefa_repor_valores / fn_obra_emylia_repor_valores(base, novo): o inverso, ao gravar o técnico só técnico. real,
--    realFases e ec ficam os da base (ele não os pode mudar). Numa tarefa com o mesmo nome no mesmo lugar, cada preco e ch em falta volta da
--    base só se o elemento for o mesmo da base sem ele (mats/encomendado/envios no mesmo índice); os registos novos dele ficam como vieram.
--    Gravar o que leu sem mudar nada dá exatamente a base.
CREATE OR REPLACE FUNCTION public.fn_obra_tarefa_repor_valores(ta jsonb, td jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb := td; k text; j int; a jsonb; x jsonb; ea jsonb; ed jsonb;
BEGIN
  IF jsonb_typeof(ta) IS DISTINCT FROM 'object' OR jsonb_typeof(td) IS DISTINCT FROM 'object' THEN RETURN td; END IF;
  FOREACH k IN ARRAY ARRAY['mats', 'encomendado'] LOOP
    IF jsonb_typeof(ta->k) = 'array' AND jsonb_typeof(r->k) = 'array' THEN
      FOR j IN 0 .. least(jsonb_array_length(ta->k), jsonb_array_length(r->k)) - 1 LOOP
        a := ta->k->j; x := r->k->j;
        IF jsonb_typeof(a) = 'object' AND jsonb_typeof(x) = 'object' AND a ? 'preco' AND NOT x ? 'preco' AND (a - 'preco') = x THEN
          r := jsonb_set(r, ARRAY[k, j::text], a);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  IF jsonb_typeof(ta->'exec') = 'object' AND jsonb_typeof(r->'exec') = 'object' THEN
    ea := ta->'exec'; ed := r->'exec';
    IF ea ? 'ch' AND NOT ed ? 'ch' THEN ed := ed || jsonb_build_object('ch', ea->'ch'); END IF;
    IF jsonb_typeof(ea->'envios') = 'array' AND jsonb_typeof(ed->'envios') = 'array' THEN
      FOR j IN 0 .. least(jsonb_array_length(ea->'envios'), jsonb_array_length(ed->'envios')) - 1 LOOP
        a := ea->'envios'->j; x := ed->'envios'->j;
        IF jsonb_typeof(a) = 'object' AND jsonb_typeof(x) = 'object' AND a ? 'ch' AND NOT x ? 'ch' AND (a - 'ch') = x THEN
          ed := jsonb_set(ed, ARRAY['envios', j::text], a);
        END IF;
      END LOOP;
    END IF;
    r := jsonb_set(r, '{exec}', ed);
  END IF;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_obra_emylia_repor_valores(p_base jsonb, p_novo jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE d jsonb := p_novo; k text; i int; ta jsonb; td jsonb;
BEGIN
  IF jsonb_typeof(p_base) IS DISTINCT FROM 'object' OR jsonb_typeof(p_novo) IS DISTINCT FROM 'object' THEN RETURN p_novo; END IF;
  FOREACH k IN ARRAY ARRAY['real', 'realFases', 'ec'] LOOP
    d := CASE WHEN p_base ? k THEN jsonb_set(d, ARRAY[k], p_base->k) ELSE d - k END;
  END LOOP;
  IF jsonb_typeof(p_base->'plano') = 'object' AND jsonb_typeof(p_base->'plano'->'tasks') = 'array'
     AND jsonb_typeof(d->'plano') = 'object' AND jsonb_typeof(d->'plano'->'tasks') = 'array' THEN
    FOR i IN 0 .. least(jsonb_array_length(p_base->'plano'->'tasks'), jsonb_array_length(d->'plano'->'tasks')) - 1 LOOP
      ta := p_base->'plano'->'tasks'->i; td := d->'plano'->'tasks'->i;
      CONTINUE WHEN jsonb_typeof(ta) IS DISTINCT FROM 'object' OR jsonb_typeof(td) IS DISTINCT FROM 'object' OR (ta->'nome') IS DISTINCT FROM (td->'nome');
      d := jsonb_set(d, ARRAY['plano', 'tasks', i::text], public.fn_obra_tarefa_repor_valores(ta, td));
    END LOOP;
  END IF;
  RETURN d;
END $function$;


REVOKE ALL ON FUNCTION public.fn_neg_so_execucao(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_neg_ids_do_tecnico(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_neg_resposta_do_terreno(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_tarefa_sem_valores(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_emylia_sem_valores(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_tarefa_repor_valores(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_obra_emylia_repor_valores(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_so_execucao(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_ids_do_tecnico(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_resposta_do_terreno(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_tarefa_sem_valores(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_emylia_sem_valores(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_tarefa_repor_valores(jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_obra_emylia_repor_valores(jsonb,jsonb) TO service_role;

-- 8. neg_ler_negocios
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
          'fluxo_emylia', n.fluxo_emylia, 'docs_crm', public.fn_neg_docs_crm(n.id)),
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
      AND (v_tudo OR public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR n.id = ANY (v_tarefas)) -- 20270110400000
  ) x;
  RETURN r;
END $function$;

-- 9. obra_ler_negocios
CREATE OR REPLACE FUNCTION public.obra_ler_negocios(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270110400000: as mesmas obras que neg_ler_negocios (o âmbito de pessoas.view sobre o negócio)
  v_tudo boolean; v_chaves text[]; v_tarefas uuid[];
  v_ids uuid[]; -- 20270111100000
BEGIN
  -- 20270111100000: sem pessoas.view mas com negocios.obra.executar: só as obras onde trabalha, com o estado da Emylia sem valores
  -- (fn_obra_emylia_sem_valores); ao gravar, obra_guardar_negocio repõe-nos da base (fn_obra_emylia_repor_valores)
  IF public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    v_ids := public.fn_neg_ids_do_tecnico(p_org);
    RETURN coalesce((
      SELECT jsonb_agg(jsonb_build_object('negocio_id', o.negocio_id, 'obra_id', o.id, 'codigo', o.codigo, 'estado', o.estado,
                                          'emylia', public.fn_obra_emylia_sem_valores(o.estado_emylia)) ORDER BY o.criada_em)
      FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL
      WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL AND n.id = ANY (v_ids)), '[]'::jsonb);
  END IF;
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  v_tudo := public.fn_neg_ambito_tudo(p_org, 'pessoas.view');
  IF NOT v_tudo THEN
    v_chaves := public.crm_scope_keys('pessoas.view');
    v_tarefas := public.fn_neg_ids_com_tarefa(p_org);
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('negocio_id', o.negocio_id, 'obra_id', o.id, 'codigo', o.codigo, 'estado', o.estado,
                                        'emylia', o.estado_emylia) ORDER BY o.criada_em)
    FROM ops_obra o JOIN negocios n ON n.id = o.negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL
    WHERE o.organization_id = p_org AND o.negocio_id IS NOT NULL
      AND (v_tudo OR public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
           OR n.id = ANY (v_tarefas))), '[]'::jsonb); -- 20270110400000
END $function$;

-- 10. obra_guardar_negocio
CREATE OR REPLACE FUNCTION public.obra_guardar_negocio(p_org uuid, p_negocio_id uuid, p_obra jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- 20270102220000: o código antigo do papel da obra deu lugar a negocios.obra.planear (o Gestor de obra) e negocios.obra.executar (o técnico)
  v_user uuid := public.fn_cat_exigir_uma(p_org, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  v_existe boolean; v_planear boolean; v_executar boolean; v_eu uuid; v_porque text; s record;
  v_neg negocios; v_obra ops_obra; v_codigo text; v_estado text; v_plano boolean; v_inicio date;
  t jsonb; v_chave text; v_nome text; v_fase uuid; v_tar uuid; v_skill uuid; v_skill_nome text; v_pessoa uuid; v_tarestado text; v_pessoas smallint;
  v_chaves text[] := '{}'; v_avisos text[] := '{}';
  v_imp_a jsonb; v_imp_d jsonb; v_auto_a jsonb; v_auto_d jsonb; -- 20270105200000
  v_so boolean; -- 20270111100000
BEGIN
  SELECT * INTO v_neg FROM negocios WHERE id = p_negocio_id AND organization_id = p_org AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negócio não encontrado nesta organização.' USING ERRCODE = 'NE003'; END IF;
  -- 20270110400000: o âmbito de pessoas.edit sobre o negócio (dono = assigned_to/created_by; TEAM/ORG pelas chaves). Mantêm o acesso
  -- de antes: admin, quem entra sem pessoas.edit no perfil (Papel no Negócio, obra.planear/executar) ou tem um Papel no Negócio
  -- que dá pessoas.edit, e quem tem tarefas na obra deste negócio (fn_neg_no_ambito).
  IF NOT public.fn_neg_no_ambito(v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF p_obra IS NULL OR jsonb_typeof(p_obra) <> 'object' THEN RAISE EXCEPTION 'A obra tem de ser um objeto.' USING ERRCODE = 'CT002'; END IF;
  v_plano := coalesce(jsonb_typeof(p_obra->'tarefas') = 'array', false);
  v_estado := coalesce(nullif(p_obra->>'estado', ''), 'planeada');
  IF v_estado NOT IN ('planeada', 'em_curso', 'suspensa', 'concluida', 'cancelada') THEN
    RAISE EXCEPTION 'Estado da obra inválido: %.', v_estado USING ERRCODE = 'CT002';
  END IF;
  BEGIN
    v_inicio := nullif(p_obra->>'inicio', '')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Data de início inválida: %.', p_obra->>'inicio' USING ERRCODE = 'CT002';
  END;

  SELECT * INTO v_obra FROM ops_obra WHERE negocio_id = p_negocio_id AND organization_id = p_org FOR UPDATE;
  v_existe := FOUND;
  -- 20270111100000: quem lê as obras reduzidas (sem pessoas.view, com negocios.obra.executar) só grava as obras que recebe
  -- (fn_neg_ids_do_tecnico), só como execução (nunca pelo ramo de planear: a leitura dele não tem o orçamento) e com o que a leitura
  -- tirou reposto da base antes de tudo (custos reais, a cópia da encomenda, preços dos materiais, €/h dos registos gravados).
  v_so := public.fn_neg_so_execucao(p_org, 'pessoas.view');
  IF v_so THEN
    IF NOT (p_negocio_id = ANY (public.fn_neg_ids_do_tecnico(p_org))) THEN
      RAISE EXCEPTION 'Sem permissão (pessoas.view): esta obra não tem tarefas nem visitas suas.' USING ERRCODE = 'CT001';
    END IF;
    IF v_existe AND jsonb_typeof(p_obra->'emylia') = 'object' THEN
      p_obra := jsonb_set(p_obra, '{emylia}', public.fn_obra_emylia_repor_valores(v_obra.estado_emylia, p_obra->'emylia'));
    END IF;
  END IF;

  -- 20270102220000: sem negocios.obra.planear, compara-se a obra gravada com a nova e só passa o que é de quem executa: as tarefas
  -- atribuídas a ele (ops_obra_tarefa_rh; no estado da Emylia, tasks[i].tec), marcadas em curso ou feitas, com os registos, as
  -- fotografias, as notas e os imprevistos delas (fn_obra_execucao_permitida). Gravar sem mudanças passa sempre. O plano, o estado da
  -- obra, o cancelamento, a atribuição dos técnicos, a validação e as tarefas novas ou apagadas são do Gestor de obra.
  v_planear := public.fn_cat_pode(p_org, 'negocios.obra.planear') AND NOT v_so; -- 20270111100000
  IF NOT v_planear AND NOT v_existe THEN
    -- a obra nasce do orçamento (o plano gerado, por aprovar, sem nada feito): quem grava o negócio pode criá-la
    IF v_plano AND (v_estado <> 'planeada' OR NOT public.fn_cat_pode(p_org, 'pessoas.edit')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_obra->'tarefas') x WHERE coalesce(nullif(x->>'estado', ''), 'por_fazer') <> 'por_fazer')) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): só o Gestor de obra cria uma obra que já não está só planeada.' USING ERRCODE = 'CT001';
    END IF;
  ELSIF NOT v_planear THEN
    v_executar := public.fn_cat_pode(p_org, 'negocios.obra.executar');
    v_eu := CASE WHEN v_executar THEN public.fn_neg_pessoa_da_conta(p_org) END;
    IF NOT v_plano OR v_estado IS DISTINCT FROM v_obra.estado THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o estado da obra nem cancelá-la.' USING ERRCODE = 'CT001';
    END IF;
    IF (SELECT coalesce(array_agg(t.chave ORDER BY t.chave), '{}') FROM ops_obra_tarefa t WHERE t.obra_id = v_obra.id)
       IS DISTINCT FROM (SELECT coalesce(array_agg(btrim(x->>'chave') ORDER BY btrim(x->>'chave')), '{}') FROM jsonb_array_elements(p_obra->'tarefas') x) THEN
      RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode juntar nem tirar tarefas do plano.' USING ERRCODE = 'CT001';
    END IF;
    FOR s IN SELECT t.chave, t.nome, t.estado, (SELECT r.pessoa_id FROM ops_obra_tarefa_rh r WHERE r.tarefa_id = t.id LIMIT 1) AS pessoa,
                    CASE WHEN coalesce(nullif(x->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(x->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo,
                    CASE WHEN coalesce(x->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (x->>'pessoa')::uuid END AS nova_pessoa
             FROM ops_obra_tarefa t JOIN jsonb_array_elements(p_obra->'tarefas') x ON btrim(x->>'chave') = t.chave
             WHERE t.obra_id = v_obra.id LOOP
      IF s.nova_pessoa IS DISTINCT FROM s.pessoa THEN
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): não pode mudar o técnico da tarefa %.', s.nome USING ERRCODE = 'CT001';
      END IF;
      IF s.novo IS DISTINCT FROM s.estado AND NOT (v_eu IS NOT NULL AND s.pessoa = v_eu AND s.estado <> 'validada' AND s.novo IN ('em_curso', 'feita')) THEN
        -- 20270105500000: sem negocios.obra.executar a falta é essa (não a do Gestor de obra); a regra não muda, só a mensagem
        IF NOT coalesce(v_executar, false) THEN
          RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): não pode marcar a tarefa % em curso ou feita.', s.nome
            USING ERRCODE = 'CT001';
        END IF;
        RAISE EXCEPTION 'Sem permissão (negocios.obra.planear): na tarefa % só quem a tem atribuída a marca em curso ou feita; validar e pedir correção é do Gestor de obra.', s.nome
          USING ERRCODE = 'CT001';
      END IF;
    END LOOP;
    v_porque := public.fn_obra_execucao_permitida(v_obra.estado_emylia, p_obra->'emylia', v_eu);
    IF v_porque IS NOT NULL THEN
      -- 20270105700000: sem negocios.obra.executar o que falta é ela (não planear)
      RAISE EXCEPTION 'Sem permissão (%): não pode mudar %; só regista a execução das tarefas atribuídas a si.',
        CASE WHEN v_executar THEN 'negocios.obra.planear' ELSE 'negocios.obra.executar' END, v_porque USING ERRCODE = 'CT001';
    END IF;
    -- grava só a execução: o estado da Emylia e o estado das tarefas dele; o resto da projeção (datas, nomes, técnicos) fica o da base
    UPDATE ops_obra SET estado_emylia = p_obra->'emylia', atualizada_em = now()
    WHERE id = v_obra.id AND estado_emylia IS DISTINCT FROM p_obra->'emylia';
    UPDATE ops_obra_tarefa t SET estado = x.novo, atualizada_em = now()
    FROM (SELECT btrim(y->>'chave') AS chave, CASE WHEN coalesce(nullif(y->>'estado', ''), 'por_fazer') IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada')
                         THEN coalesce(nullif(y->>'estado', ''), 'por_fazer') ELSE 'por_fazer' END AS novo FROM jsonb_array_elements(p_obra->'tarefas') y) x
    WHERE t.obra_id = v_obra.id AND t.chave = x.chave AND t.estado IS DISTINCT FROM x.novo;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- 20270105200000: daqui para baixo grava quem planeia (ou quem cria a obra só planeada). Por cima disso:
  --   negocios.obra.imprevistos  mudar ou tirar um imprevisto já gravado (propor ao cliente, decidir, fechar). Registar um novo (no fim da
  --                              lista) não a pede: é da execução (fn_obra_execucao_permitida) ou do planeamento.
  --   negocios.obra.fechar       a obra passar a concluída, ou o auto de receção mudar (enviá-lo). A assinatura do auto que o cliente fez no
  --                              portal (negocio_rececao_cliente com o mesmo número) passa sem ela: é o espelho do que já está na base.
  v_imp_a := public.fn_neg_lista(CASE WHEN v_existe THEN v_obra.estado_emylia->'imprevistos' END);
  v_imp_d := public.fn_neg_lista(p_obra->'emylia'->'imprevistos');
  IF (jsonb_array_length(v_imp_d) < jsonb_array_length(v_imp_a)
      OR EXISTS (SELECT 1 FROM generate_series(0, jsonb_array_length(v_imp_a) - 1) i WHERE (v_imp_d->i) IS DISTINCT FROM (v_imp_a->i)))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.imprevistos') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.imprevistos): não pode propor nem decidir os imprevistos da obra.' USING ERRCODE = 'CT001';
  END IF;
  v_auto_a := CASE WHEN v_existe AND jsonb_typeof(v_obra.estado_emylia->'auto') = 'object' THEN v_obra.estado_emylia->'auto' END;
  v_auto_d := CASE WHEN jsonb_typeof(p_obra->'emylia'->'auto') = 'object' THEN p_obra->'emylia'->'auto' END;
  IF ((v_estado = 'concluida' AND (NOT v_existe OR v_obra.estado IS DISTINCT FROM 'concluida'))
      OR (v_auto_d IS DISTINCT FROM v_auto_a
          AND NOT (v_auto_a->>'estado' = 'por assinar' AND v_auto_d->>'estado' = 'assinado' AND v_auto_d->>'n' = v_auto_a->>'n'
                   AND (v_auto_d - ARRAY['estado', 'assinado', 'assinatura', 'reservas']) = (v_auto_a - ARRAY['estado', 'assinado', 'assinatura', 'reservas'])
                   AND EXISTS (SELECT 1 FROM negocio_rececao_cliente r WHERE r.negocio_id = p_negocio_id AND r.auto_n = v_auto_d->>'n'))))
     AND NOT public.fn_cat_pode(p_org, 'negocios.obra.fechar') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.fechar): não pode encerrar a obra nem enviar o auto de receção.' USING ERRCODE = 'CT001';
  END IF;

  IF NOT v_existe THEN
    IF NOT v_plano THEN RETURN jsonb_build_object('obra_id', NULL, 'codigo', NULL, 'avisos', '[]'::jsonb); END IF;
    v_codigo := 'OB-' || coalesce(v_neg.numero::text, left(p_negocio_id::text, 8));
    IF EXISTS (SELECT 1 FROM ops_obra WHERE organization_id = p_org AND codigo = v_codigo) THEN
      v_codigo := v_codigo || '-' || left(replace(gen_random_uuid()::text, '-', ''), 4);
    END IF;
    INSERT INTO ops_obra (organization_id, codigo, negocio_id, titulo, morada, estado, data_inicio_prevista, criada_por, estado_emylia,
                          iniciada_em, concluida_em)
    VALUES (p_org, v_codigo, p_negocio_id,
            coalesce(nullif(btrim(p_obra->>'titulo'), ''), nullif(btrim(v_neg.titulo), ''), 'Obra ' || v_codigo),
            nullif(btrim(coalesce(p_obra->>'morada', '')), ''), v_estado, v_inicio, v_user, p_obra->'emylia',
            CASE WHEN v_estado IN ('em_curso', 'concluida') THEN now() END, CASE WHEN v_estado = 'concluida' THEN now() END)
    RETURNING * INTO v_obra;
  ELSE
    UPDATE ops_obra SET
      titulo = coalesce(nullif(btrim(p_obra->>'titulo'), ''), titulo),
      morada = coalesce(nullif(btrim(coalesce(p_obra->>'morada', '')), ''), morada),
      estado = CASE WHEN v_plano THEN v_estado ELSE 'cancelada' END,
      data_inicio_prevista = coalesce(v_inicio, data_inicio_prevista),
      iniciada_em = CASE WHEN v_estado IN ('em_curso', 'concluida') THEN coalesce(iniciada_em, now()) ELSE iniciada_em END,
      concluida_em = CASE WHEN v_estado = 'concluida' THEN coalesce(concluida_em, now()) ELSE concluida_em END,
      estado_emylia = p_obra->'emylia',
      atualizada_em = now()
    WHERE id = v_obra.id
    RETURNING * INTO v_obra;
  END IF;

  IF NOT v_plano THEN
    DELETE FROM ops_obra_tarefa_rh WHERE obra_id = v_obra.id;
    RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', '[]'::jsonb);
  END IF;

  -- as fases: as que o motor manda e as que as tarefas usam
  INSERT INTO ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT p_org, v_obra.id, f.ordem, coalesce(max(f.nome), 'Fase ' || f.ordem)
  FROM (
    SELECT (x->>'ordem')::smallint AS ordem, nullif(btrim(x->>'nome'), '') AS nome
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_obra->'fases') = 'array' THEN p_obra->'fases' ELSE '[]'::jsonb END) x
    UNION ALL
    SELECT coalesce((x->>'fase')::smallint, 0), NULL FROM jsonb_array_elements(p_obra->'tarefas') x
  ) f
  GROUP BY f.ordem
  ON CONFLICT (obra_id, ordem) DO UPDATE SET nome = EXCLUDED.nome WHERE ops_obra_fase.nome IS DISTINCT FROM EXCLUDED.nome;

  FOR t IN SELECT x FROM jsonb_array_elements(p_obra->'tarefas') x LOOP
    v_chave := nullif(btrim(coalesce(t->>'chave', '')), '');
    v_nome := nullif(btrim(coalesce(t->>'nome', '')), '');
    IF v_chave IS NULL OR v_nome IS NULL THEN RAISE EXCEPTION 'Cada tarefa precisa de chave e nome.' USING ERRCODE = 'CT002'; END IF;
    IF v_chave = ANY (v_chaves) THEN RAISE EXCEPTION 'Tarefa repetida: %.', v_chave USING ERRCODE = 'CT002'; END IF;
    v_chaves := v_chaves || v_chave;

    v_skill := NULL; v_skill_nome := NULL;
    IF nullif(t->>'perfil', '') IS NOT NULL THEN
      SELECT k.id, k.nome INTO v_skill, v_skill_nome FROM ops_skill k
      WHERE k.organization_id = p_org AND (k.chave = t->>'perfil' OR k.id::text = t->>'perfil') LIMIT 1;
    END IF;
    SELECT id INTO v_fase FROM ops_obra_fase WHERE obra_id = v_obra.id AND ordem = coalesce((t->>'fase')::smallint, 0);
    v_tarestado := coalesce(nullif(t->>'estado', ''), 'por_fazer');
    IF v_tarestado NOT IN ('por_fazer', 'em_curso', 'feita', 'validada', 'rejeitada') THEN v_tarestado := 'por_fazer'; END IF;
    v_pessoas := least(20, greatest(1, coalesce((t->>'pessoas')::int, 1)));

    v_tar := NULL;
    SELECT id INTO v_tar FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND chave = v_chave;
    IF v_tar IS NULL THEN
      INSERT INTO ops_obra_tarefa (organization_id, obra_id, fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado,
                                   estado, skill_id, chave, pessoas_previstas)
      VALUES (p_org, v_obra.id, v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
              nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_chave, v_pessoas)
      RETURNING id INTO v_tar;
    ELSE
      UPDATE ops_obra_tarefa SET fase_id = v_fase, ordem = coalesce((t->>'ordem')::int, 0), nome = v_nome,
        minutos_previstos = greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
        inicio_planeado = nullif(t->>'inicio', '')::date, fim_planeado = nullif(t->>'fim', '')::date,
        estado = v_tarestado, skill_id = v_skill, pessoas_previstas = v_pessoas, atualizada_em = now()
      WHERE id = v_tar
        AND (fase_id, ordem, nome, minutos_previstos, inicio_planeado, fim_planeado, estado, skill_id, pessoas_previstas) IS DISTINCT FROM
            (v_fase, coalesce((t->>'ordem')::int, 0), v_nome, greatest(1, coalesce(round((t->>'minutos')::numeric), 60))::int,
             nullif(t->>'inicio', '')::date, nullif(t->>'fim', '')::date, v_tarestado, v_skill, v_pessoas);
    END IF;

    -- quem a faz: só uma pessoa do RH desta organização
    v_pessoa := NULL;
    IF coalesce(t->>'pessoa', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT p.id INTO v_pessoa FROM pessoas p WHERE p.id = (t->>'pessoa')::uuid AND p.organization_id = p_org AND p.deleted_at IS NULL;
      IF v_pessoa IS NULL THEN
        v_avisos := v_avisos || format('%s: o técnico não é uma pessoa do RH desta organização. Ficou por atribuir.', v_nome);
      ELSIF NOT public.fn_rh_pessoa_tecnico_obra(p_org, v_pessoa) THEN -- 20270110600000: cargo ou perfil
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem cargo técnico de obra no RH nem o perfil de técnico de obra.', v_nome);
      ELSIF v_skill IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fn_rh_oficios_efetivos(p_org, v_pessoa) o WHERE o.skill_id = v_skill) THEN
        v_avisos := v_avisos || format('%s: a pessoa atribuída não tem o ofício %s no RH.', v_nome, v_skill_nome);
      END IF;
    END IF;
    DELETE FROM ops_obra_tarefa_rh WHERE tarefa_id = v_tar AND pessoa_id IS DISTINCT FROM v_pessoa;
    IF v_pessoa IS NOT NULL THEN
      INSERT INTO ops_obra_tarefa_rh (organization_id, obra_id, tarefa_id, pessoa_id, atribuida_por)
      VALUES (p_org, v_obra.id, v_tar, v_pessoa, v_user)
      ON CONFLICT (tarefa_id, pessoa_id) DO NOTHING;
    END IF;
  END LOOP;

  -- o que saiu do plano sai da projeção (as fases só se nenhuma tarefa as usar)
  DELETE FROM ops_obra_tarefa WHERE obra_id = v_obra.id AND (chave IS NULL OR NOT (chave = ANY (v_chaves)));
  DELETE FROM ops_obra_fase f WHERE f.obra_id = v_obra.id AND NOT EXISTS (SELECT 1 FROM ops_obra_tarefa x WHERE x.fase_id = f.id);

  RETURN jsonb_build_object('obra_id', v_obra.id, 'codigo', v_obra.codigo, 'avisos', to_jsonb(v_avisos));
END $function$;

-- 11. neg_guardar_negocio
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

-- 12. neg_vista_cliente_guardar
CREATE OR REPLACE FUNCTION public.neg_vista_cliente_guardar(p_org uuid, p_negocio_id uuid, p_vista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marca text;
  v_n     integer;
  v_velha jsonb;
BEGIN
  -- 20270111100000: a vista do cliente é publicada por quem lê o negócio inteiro; com a leitura reduzida (sem pessoas.view, com
  -- negocios.obra.executar) a vista sairia sem a proposta, o contrato e os pagamentos
  IF p_org IS NOT NULL AND public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view): a vista do cliente é publicada por quem vê o negócio inteiro.' USING ERRCODE = 'CT001';
  END IF;
  IF p_org IS NULL OR p_negocio_id IS NULL
     OR NOT (public.fn_cat_pode(p_org, 'pessoas.edit') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = p_negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF p_vista IS NULL OR jsonb_typeof(p_vista) IS DISTINCT FROM 'object' OR jsonb_typeof(p_vista -> 'd') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente tem de ter o negócio (d).' USING ERRCODE = 'NE006';
  END IF;
  -- sem o estado dos materiais (quem gravou não tinha as encomendas carregadas): fica o da vista gravada, se for a mesma encomenda
  IF NOT (p_vista ? 'ec') THEN
    SELECT x.vista INTO v_velha FROM public.negocio_vista_cliente x WHERE x.negocio_id = p_negocio_id AND x.organization_id = p_org;
    IF v_velha ? 'ec' AND (v_velha #>> '{d,obra,ec,ref}') IS NOT NULL AND (v_velha #>> '{d,obra,ec,ref}') = (p_vista #>> '{d,obra,ec,ref}') THEN
      p_vista := p_vista || jsonb_build_object('ec', v_velha -> 'ec');
    END IF;
  END IF;
  IF octet_length(p_vista::text) > 6 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente passa de 6 MB.' USING ERRCODE = 'NE006';
  END IF;
  v_marca := md5(p_vista::text);
  INSERT INTO public.negocio_vista_cliente AS x (negocio_id, organization_id, vista, marca, atualizada_em, atualizada_por)
  VALUES (p_negocio_id, p_org, p_vista, v_marca, now(), public.current_business_user_id())
  ON CONFLICT (negocio_id) DO UPDATE
     SET vista = EXCLUDED.vista, marca = EXCLUDED.marca, atualizada_em = now(), atualizada_por = EXCLUDED.atualizada_por
   WHERE x.marca IS DISTINCT FROM EXCLUDED.marca AND x.organization_id = EXCLUDED.organization_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('gravada', v_n > 0, 'marca', v_marca);
END;
$function$;

-- 13. neg_historico_autores
CREATE OR REPLACE FUNCTION public.neg_historico_autores(p_org uuid)
 RETURNS TABLE(negocio_id uuid, ordem integer, quem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 20270111100000: a leitura reduzida (sem pessoas.view, com negocios.obra.executar) não tem histórico
  IF public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN RETURN; END IF;
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN QUERY
    SELECT h.negocio_id, h.ordem, u.name
      FROM public.negocio_historico h
      JOIN public.anew_users u ON u.id = h.autor
     WHERE h.organization_id = p_org;
END $function$;

-- 14. neg_gestores_obra
CREATE OR REPLACE FUNCTION public.neg_gestores_obra(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 20270111100000: o técnico (negocios.obra.executar, sem pessoas.view) também: é o responsável que o Hoje do técnico mostra
  IF NOT public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome_completo, 'telefone', p.telefone_trabalho) ORDER BY p.nome_completo)
    FROM pessoas p JOIN pessoas_papeis_negocio pp ON pp.pessoa_id = p.id AND pp.organization_id = p_org AND pp.papel = 'operacoes'
    WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)), '[]');
END $function$;

-- 15. neg_rececoes_ler
CREATE OR REPLACE FUNCTION public.neg_rececoes_ler(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_org IS NULL OR NOT (public.fn_cat_pode(p_org, 'pessoas.view') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  RETURN COALESCE((SELECT jsonb_object_agg(r.negocio_id::text, public.fn_neg_rececao_json(r))
                     FROM public.negocio_rececao_cliente r WHERE r.organization_id = p_org
                      -- 20270111100000: sem pessoas.view (técnico, gestor só pelo perfil), só as dos negócios onde trabalha
                      AND (public.fn_cat_pode(p_org, 'pessoas.view') OR r.negocio_id = ANY (public.fn_neg_ids_do_tecnico(p_org)))), '{}'::jsonb);
END;
$function$;

-- 16. neg_respostas_ler
CREATE OR REPLACE FUNCTION public.neg_respostas_ler(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 20270111100000: a leitura reduzida (sem pessoas.view, com negocios.obra.executar) não aplica respostas do cliente: nenhuma
  IF p_org IS NOT NULL AND public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN RETURN '[]'::jsonb; END IF;
  IF p_org IS NULL OR NOT public.fn_cat_pode(p_org, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(public.fn_neg_resposta_json(r) ORDER BY r.criada_em)
                     FROM public.negocio_respostas_cliente r WHERE r.organization_id = p_org AND r.aplicada_em IS NULL), '[]'::jsonb);
END;
$function$;

-- 17. cat_ler_catalogo
CREATE OR REPLACE FUNCTION public.cat_ler_catalogo(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_ret boolean;
  v_tec boolean; v_mat boolean; -- 20270111100000
BEGIN
  -- 20270111100000: sem services.view (perfil, papel ou admin) mas com negocios.obra.executar: o Catálogo sem dinheiro. Ficam técnicos,
  -- ofícios (sem custo/hora nem salário), categorias, serviços (sem margem nem justificação do preço), passos, equipamentos (sem compra,
  -- residual e manutenção) e os seus usos; os produtos e os consumos só com negocios.obra.materiais. Fora: parâmetros, margens,
  -- estrutura, preços de serviço e de produto e fornecedores.
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec THEN
    PERFORM public.fn_cat_exigir(p_org, 'services.view');
  END IF;
  v_mat := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  -- 20261231998000: o custo/hora de cada técnico só vai a quem vê as retribuições; a média por ofício (perfis) vai sempre
  v_ret := public.is_system_admin_user(auth.uid()) OR public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.retribuicao.view', p_org);
  WITH svc AS (SELECT * FROM services WHERE organization_id = p_org AND no_catalogo AND NOT is_deleted),
       prod AS (SELECT * FROM products WHERE organization_id = p_org AND tipo_catalogo IS NOT NULL AND NOT is_deleted),
       -- as pessoas técnicas (cargo técnico de obra, sem saída passada) e os ofícios efetivos (do cargo e extras)
       -- 20270110600000: entram também as do perfil de técnico de obra (negocios.obra.tecnico), mesmo sem ofícios (perfis vazio);
       --   as de cargo técnico sem ofícios continuam de fora
       rh AS (SELECT p.id, p.nome_completo,
                     coalesce(array_agg(e.skill_id ORDER BY e.skill_id) FILTER (WHERE e.skill_id IS NOT NULL), '{}') AS perfis FROM pessoas p
              LEFT JOIN LATERAL public.fn_rh_oficios_efetivos(p_org, p.id) e ON true
              WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
                AND (e.skill_id IS NOT NULL OR public.fn_rh_pessoa_tecnico_por_perfil(p_org, p.id))
              GROUP BY p.id, p.nome_completo)
  SELECT jsonb_build_object(
    'parametros', CASE WHEN v_tec THEN NULL ELSE (SELECT to_jsonb(x) FROM (SELECT meses, tsu, seguros_ano, horas_ano, horas_mes, meses_desatualizado, margem_minima, margem_alvo
                    FROM cat_parametros WHERE organization_id = p_org) x) END,
    'margemLinha', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT linha, margem_minima FROM cat_margem_linha WHERE organization_id = p_org) x), '[]') END,
    'categorias', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, parent_id, sort_order FROM service_categories
                    WHERE organization_id = p_org AND NOT is_deleted) x), '[]'),
    'perfis', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT s.id, s.chave, s.nome, CASE WHEN v_tec THEN NULL ELSE s.salario_referencia END AS salario_referencia, s.ativo,
                    CASE WHEN v_tec THEN NULL ELSE d.custo_hora END AS custo_hora, d.fonte, d.n, d.nomes, d.cargos
                    FROM ops_skill s CROSS JOIN LATERAL public.fn_cat_custo_hora_oficio_det(p_org, s.id) d WHERE s.organization_id = p_org) x), '[]'),
    'equipamentos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, CASE WHEN v_tec THEN NULL ELSE compra END AS compra, vida_anos, vida_horas,
                    CASE WHEN v_tec THEN NULL ELSE residual END AS residual, CASE WHEN v_tec THEN NULL ELSE manutencao_ano END AS manutencao_ano, uso_ano_horas, ativo
                    FROM cat_equipamentos WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]'),
    'estrutura', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, nome, categoria, mensal, ativo, ordem FROM cat_estrutura
                    WHERE organization_id = p_org AND apagado_em IS NULL) x), '[]') END,
    'servicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, chave, name, sku, unidade, service_category_id, service_subcategory_id, linhas, medida,
                    modo_preco, CASE WHEN v_tec THEN NULL ELSE margem END AS margem, CASE WHEN v_tec THEN NULL ELSE justificacao_preco END AS justificacao_preco, fases, receita_origem, icone, exige_produto_categoria_id, exige_produto_medida,
                    exige_produto_fator, exige_produto_arredondar, pergunta_manter, entulho_modo, entulho_m3, entulho_kg FROM svc) x), '[]'),
    'precosServico', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT sp.service_id, sp.price, sp.valid_from, sp.nota, sp.vat_rate, sp.created_at
                    FROM service_prices sp JOIN svc ON svc.id = sp.service_id WHERE sp.price_type = 'retail') x), '[]') END,
    'passos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT t.servico_id, t.ordem, t.nome, t.minutos_por_unidade, t.minutos_fixos, t.skill_id, t.fase
                    FROM ops_obra_servico_tarefa t JOIN svc ON svc.id = t.servico_id WHERE t.organization_id = p_org) x), '[]'),
    'usosEquip', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT service_id, equipamento_id, horas, ordem FROM cat_servico_equipamentos
                    WHERE organization_id = p_org) x), '[]'),
    'usosCons', CASE WHEN NOT v_mat THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT m.service_id, m.product_id, coalesce(m.quantidade_exata, m.quantity) AS quantity, m.opcional, m.sort_order
                    FROM service_materials m JOIN svc ON svc.id = m.service_id WHERE m.deleted_at IS NULL) x), '[]') END,
    'produtos', CASE WHEN NOT v_mat THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id, name, sku, tipo_catalogo, unidade, catalogo_categoria_id, servico_id, fator_servico,
                    entulho_m3, entulho_kg, short_description, marca_livre, fornecedor_livre, image_urls FROM prod) x), '[]') END,
    'precosProduto', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT pp.product_id, pp.price_type::text AS price_type, coalesce(pp.preco_exato, pp.price) AS price, pp.valid_from
                    FROM product_prices pp JOIN prod ON prod.id = pp.product_id) x), '[]') END,
    'fornecedores', CASE WHEN v_tec THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT v.product_id, v.purchase_price, v.preco_data, v.ligacao, su.name AS fornecedor
                    FROM cat_v_produto_fornecedor v LEFT JOIN suppliers su ON su.id = v.supplier_id WHERE v.organization_id = p_org) x), '[]') END,
    -- os técnicos vêm só do RH (sai ops_utilizador_perfil); o custo/hora de cada um só com retribuicao.view
    'tecnicos', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
                    SELECT rh.id, rh.nome_completo AS nome, CASE WHEN v_ret THEN public.fn_rh_custo_hora_pessoa(p_org, rh.id) END AS custo_hora,
                    rh.perfis FROM rh) x), '[]'),
    've_custo_tecnicos', v_ret
  ) INTO r;
  RETURN r;
END $function$;
