-- ============================================================
--  Operações — Arranque da obra (pós-contrato, Frente B)
-- ============================================================
--  Correr DEPOIS de: obras.sql (e financeiro-obra.sql, se houver).
--  Especificação: docs/melhorias-v2-2026-10-13/pos-contrato-especificacao.md
--  e fluxo-encomendas.md, secção 1.1 (as 3 validações do Planeador).
--
--  Com o contrato assinado, a obra só arranca com 3 validações:
--
--   1. Encomenda Cliente validada        (tabelas da Frente A)
--   2. Encomenda a fornecedor aprovada,   (tabelas da Frente A)
--      ou "não necessária"
--   3. Plano da obra aprovado             (aqui)
--
--  O que este ficheiro acrescenta:
--
--   · ops_obra.plano_aprovado_por / plano_aprovado_em, e
--     rpc_ops_obra_aprovar_plano(p_obra_id);
--   · mexer no plano depois de aprovado (tarefas, datas, equipa,
--     dependências, supervisor) repõe "por aprovar" e regista o evento
--     'plano_por_aprovar' — só enquanto a obra não arrancou;
--   · rpc_ops_obra_arranque(p_obra_id) → { encomenda_cliente, fornecedor,
--     plano, pode_arrancar, falta[] }. As tabelas da Frente A
--     (obra_encomenda_cliente, nota_encomenda_fornecedor) só se leem se
--     existirem (to_regclass); sem elas, os passos 1 e 2 ficam "por
--     instalar" e NÃO bloqueiam (senão nenhuma obra arrancava até lá);
--   · "Arrancar" (rpc_ops_obra_mudar_estado, em obras.sql) recusa enquanto
--     pode_arrancar = false, e diz o que falta;
--   · material_chega_em das tarefas a partir das notas de encomenda
--     (nota_encomenda_fornecedor.prazo_previsto, ou
--     purchase_orders.expected_delivery da encomenda criada ao aprovar) para
--     as tarefas que usam esses produtos; aviso quando a tarefa começa antes.
--
--  Obras que já arrancaram (iniciada_em, ou em curso/concluída): o plano
--  fica aprovado de uma vez (sem autor, evento com 'automatico': true). As
--  planeadas ficam "por aprovar".
--
--  Escreve fora de `ops_*`? Não. Lê as tabelas da Frente A, `purchase_orders`,
--  `service_materials` e `anew_users` (nomes), nunca lhes escreve.
--  Permissões: as de sempre (operations.orders.edit para aprovar o plano,
--  ver a obra para ler o checklist). Nenhum código novo no catálogo.
--  Idempotente: corre duas vezes sem erro e sem duplicar nada.
-- ============================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.ops_obra') IS NULL THEN
    RAISE EXCEPTION 'Falta ops_obra. Corre db/obras.sql antes de db/obra-arranque.sql.';
  END IF;
  IF to_regprocedure('public.ops_obra_exigir(uuid,text,text[],text)') IS NULL THEN
    RAISE EXCEPTION 'Falta ops_obra_exigir(). Corre db/obras.sql antes de db/obra-arranque.sql.';
  END IF;
  IF to_regclass('public.obra_encomenda_cliente') IS NULL THEN
    RAISE NOTICE 'obra_encomenda_cliente não existe (Frente A por aplicar): Encomenda Cliente e fornecedor ficam "por instalar" e não bloqueiam o arranque.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. A aprovação do plano
-- ============================================================
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS plano_aprovado_por uuid;        -- → anew_users.id
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS plano_aprovado_em  timestamptz;

-- Obras que já arrancaram: o "Arrancar" de antes fazia de aprovação. Ficam
-- aprovadas (uma vez — depois disto já não são NULL), com um evento.
WITH aprovadas AS (
  UPDATE public.ops_obra o
     SET plano_aprovado_em = COALESCE(o.iniciada_em, o.atualizada_em, o.criada_em)
   WHERE o.plano_aprovado_em IS NULL
     AND (o.iniciada_em IS NOT NULL OR o.estado IN ('em_curso','concluida'))
  RETURNING o.id, o.organization_id, o.plano_aprovado_em
)
INSERT INTO public.ops_evento (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
SELECT a.organization_id, 'obra', a.id, 'plano_aprovado',
       'Plano considerado aprovado (a obra já tinha arrancado)', NULL, NULL,
       jsonb_build_object('automatico', true, 'aprovado_em', a.plano_aprovado_em)
  FROM aprovadas a;


-- ============================================================
-- 2. Mexer no plano aprovado → volta a "por aprovar"
-- ============================================================
-- Só enquanto a obra não arrancou (iniciada_em NULL): depois disso, os
-- replaneamentos por atraso não "desaprovam" nada. `_o_que` vai no evento.
CREATE OR REPLACE FUNCTION public.ops_obra_plano_mexeu(_obra uuid, _o_que text, _tarefa uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o     record;
  v_autor uuid;
BEGIN
  -- O caminho rápido (quase sempre): não há plano aprovado a desfazer.
  IF _obra IS NULL OR NOT EXISTS (SELECT 1 FROM public.ops_obra
                                   WHERE id = _obra AND plano_aprovado_em IS NOT NULL
                                     AND iniciada_em IS NULL AND estado IN ('planeada','suspensa')) THEN
    RETURN;
  END IF;

  UPDATE public.ops_obra o
     SET plano_aprovado_por = NULL, plano_aprovado_em = NULL
   WHERE o.id = _obra AND o.plano_aprovado_em IS NOT NULL
  RETURNING o.organization_id, o.id INTO v_o;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  BEGIN
    v_autor := public.current_business_user_id();
  EXCEPTION WHEN OTHERS THEN
    v_autor := NULL;
  END;

  PERFORM public.ops_obra_evento(v_o.organization_id, _obra, 'plano_por_aprovar',
    'O plano mudou depois de aprovado (' || COALESCE(_o_que, 'alteração') || '): volta a estar por aprovar.',
    v_autor, jsonb_build_object('o_que', _o_que, 'tarefa_id', _tarefa));
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_plano_mexeu(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_obra_tg_plano_tarefa()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.ops_obra_plano_mexeu(OLD.obra_id, 'tarefa apagada', OLD.id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM public.ops_obra_plano_mexeu(NEW.obra_id, 'tarefa nova', NEW.id);
  ELSIF OLD.inicio_planeado IS DISTINCT FROM NEW.inicio_planeado
        OR OLD.fim_planeado IS DISTINCT FROM NEW.fim_planeado THEN
    PERFORM public.ops_obra_plano_mexeu(NEW.obra_id, 'datas', NEW.id);
  ELSE
    PERFORM public.ops_obra_plano_mexeu(NEW.obra_id, 'tarefa', NEW.id);
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_tg_plano_tarefa() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_obra_plano_tarefa_ins_del ON public.ops_obra_tarefa;
CREATE TRIGGER ops_obra_plano_tarefa_ins_del
  AFTER INSERT OR DELETE ON public.ops_obra_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_tg_plano_tarefa();
DROP TRIGGER IF EXISTS ops_obra_plano_tarefa_upd ON public.ops_obra_tarefa;
CREATE TRIGGER ops_obra_plano_tarefa_upd
  AFTER UPDATE ON public.ops_obra_tarefa
  FOR EACH ROW
  WHEN (OLD.inicio_planeado   IS DISTINCT FROM NEW.inicio_planeado
     OR OLD.fim_planeado      IS DISTINCT FROM NEW.fim_planeado
     OR OLD.nome              IS DISTINCT FROM NEW.nome
     OR OLD.fase_id           IS DISTINCT FROM NEW.fase_id
     OR OLD.minutos_previstos IS DISTINCT FROM NEW.minutos_previstos
     OR OLD.pessoas_previstas IS DISTINCT FROM NEW.pessoas_previstas
     OR OLD.skill_id          IS DISTINCT FROM NEW.skill_id)
  EXECUTE FUNCTION public.ops_obra_tg_plano_tarefa();

-- Equipa (quem está em cada tarefa) e dependências.
CREATE OR REPLACE FUNCTION public.ops_obra_tg_plano_ligacao()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_r record;
BEGIN
  IF TG_OP = 'DELETE' THEN v_r := OLD; ELSE v_r := NEW; END IF;
  PERFORM public.ops_obra_plano_mexeu(v_r.obra_id, TG_ARGV[0], v_r.tarefa_id);
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_tg_plano_ligacao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_obra_plano_pessoa ON public.ops_obra_tarefa_pessoa;
CREATE TRIGGER ops_obra_plano_pessoa
  AFTER INSERT OR DELETE ON public.ops_obra_tarefa_pessoa
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_tg_plano_ligacao('equipa');
DROP TRIGGER IF EXISTS ops_obra_plano_dependencia ON public.ops_obra_tarefa_dependencia;
CREATE TRIGGER ops_obra_plano_dependencia
  AFTER INSERT OR DELETE ON public.ops_obra_tarefa_dependencia
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_tg_plano_ligacao('dependências');

-- O supervisor também é equipa. BEFORE: a própria linha deixa de estar aprovada.
CREATE OR REPLACE FUNCTION public.ops_obra_tg_plano_supervisor()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_autor uuid;
BEGIN
  IF OLD.plano_aprovado_em IS NOT NULL
     AND NEW.plano_aprovado_em IS NOT DISTINCT FROM OLD.plano_aprovado_em
     AND NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id
     AND NEW.iniciada_em IS NULL AND NEW.estado IN ('planeada','suspensa') THEN
    NEW.plano_aprovado_por := NULL;
    NEW.plano_aprovado_em := NULL;
    BEGIN
      v_autor := public.current_business_user_id();
    EXCEPTION WHEN OTHERS THEN
      v_autor := NULL;
    END;
    PERFORM public.ops_obra_evento(NEW.organization_id, NEW.id, 'plano_por_aprovar',
      'O plano mudou depois de aprovado (supervisor): volta a estar por aprovar.',
      v_autor, jsonb_build_object('o_que', 'supervisor'));
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_tg_plano_supervisor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_obra_plano_supervisor ON public.ops_obra;
CREATE TRIGGER ops_obra_plano_supervisor
  BEFORE UPDATE OF supervisor_id ON public.ops_obra
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_tg_plano_supervisor();


-- ============================================================
-- 3. Quando chega o material (das notas de encomenda da Frente A)
-- ============================================================
-- Para cada produto das notas de encomenda a fornecedor da obra (propostas
-- ou aprovadas, não rejeitadas): a data prevista = a da encomenda criada ao
-- aprovar (purchase_orders.expected_delivery), senão o prazo da nota
-- (prazo_previsto). Uma tarefa usa um produto se ele está:
--   · nos seus materiais ligados (materiais_crm);
--   · na ficha de materiais do seu serviço (service_materials);
--   · numa linha da Encomenda Cliente da mesma linha do orçamento (o
--     conjunto) ou do mesmo serviço.
-- A data da tarefa é a mais tardia. Só tarefas por fazer; uma data dita à
-- mão ('manual') não se pisa. NÃO mexe nas datas do plano: o arranque
-- avisa quando a tarefa começa antes. Devolve quantas tarefas mudaram.
-- Sem as tabelas da Frente A: 0.
CREATE OR REPLACE FUNCTION public.ops_obra_material_frente_a_impl(_obra uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_encs   uuid[];
  v_fk     text;
  v_po_e   text := 'NULL::date';
  v_po_j   text := '';
  v_datas  jsonb;
  v_tar    jsonb;
  v_ficha  text := '';
  v_linha  text := '';
  v_n      integer := 0;
BEGIN
  IF to_regclass('public.obra_encomenda_cliente') IS NULL
     OR NOT public.ops_obra_crm_tem('nota_encomenda_fornecedor', ARRAY['id','encomenda_cliente_id','estado','prazo_previsto'])
     OR NOT public.ops_obra_crm_tem('nota_encomenda_fornecedor_linha', ARRAY['product_id']) THEN
    RETURN 0;
  END IF;

  SELECT o.id, o.organization_id, o.contrato_id INTO v_o FROM public.ops_obra o WHERE o.id = _obra;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  EXECUTE 'SELECT array_agg(e.id) FROM public.obra_encomenda_cliente e
            WHERE e.organization_id = $1 AND (e.obra_id = $2 OR e.contract_id = $3)
              AND e.estado <> ''anulada'''
     INTO v_encs USING v_o.organization_id, v_o.id, v_o.contrato_id;
  IF v_encs IS NULL THEN
    RETURN 0;
  END IF;

  -- A ligação linha → nota (o nome fica do lado da Frente A).
  SELECT c INTO v_fk FROM unnest(ARRAY['nota_id','nota_encomenda_id','nota_encomenda_fornecedor_id']) c
   WHERE public.ops_obra_crm_tem('nota_encomenda_fornecedor_linha', ARRAY[c]) LIMIT 1;
  IF v_fk IS NULL THEN
    RAISE NOTICE 'nota_encomenda_fornecedor_linha sem coluna de ligação à nota: datas do material por ler.';
    RETURN 0;
  END IF;

  IF public.ops_obra_crm_tem('nota_encomenda_fornecedor', ARRAY['purchase_order_id'])
     AND public.ops_obra_crm_tem('purchase_orders', ARRAY['id','expected_delivery']) THEN
    v_po_e := 'po.expected_delivery';
    v_po_j := 'LEFT JOIN public.purchase_orders po ON po.id = n.purchase_order_id';
  END IF;

  EXECUTE format($q$
    SELECT COALESCE(jsonb_object_agg(x.pid, x.d), '{}'::jsonb)
      FROM (SELECT nl.product_id::text AS pid, max(COALESCE(%s, n.prazo_previsto)) AS d
              FROM public.nota_encomenda_fornecedor n
              JOIN public.nota_encomenda_fornecedor_linha nl ON nl.%I = n.id
              %s
             WHERE n.encomenda_cliente_id = ANY ($1) AND n.estado IN ('proposta','aprovada')
               AND nl.product_id IS NOT NULL
             GROUP BY nl.product_id) x
     WHERE x.d IS NOT NULL $q$, v_po_e, v_fk, v_po_j)
    INTO v_datas USING v_encs;
  IF v_datas = '{}'::jsonb THEN
    RETURN 0;
  END IF;

  IF public.ops_obra_crm_tem('service_materials', ARRAY['service_id','product_id','deleted_at']) THEN
    v_ficha := 'UNION
      SELECT t.id, sm.product_id::text FROM public.ops_obra_tarefa t
        JOIN public.service_materials sm ON sm.service_id = t.servico_id AND sm.deleted_at IS NULL
       WHERE t.obra_id = $1';
  END IF;
  IF public.ops_obra_crm_tem('obra_encomenda_cliente_linha',
       ARRAY['encomenda_id','product_id','quote_line_id','service_id','tipo']) THEN
    v_linha := 'UNION
      SELECT t.id, el.product_id::text FROM public.ops_obra_tarefa t
        JOIN public.obra_encomenda_cliente_linha el
          ON el.encomenda_id = ANY ($2) AND el.product_id IS NOT NULL AND el.tipo <> ''mao_obra''
         AND ((el.quote_line_id IS NOT NULL AND el.quote_line_id = t.orcamento_linha_id)
              OR (el.service_id IS NOT NULL AND el.service_id = t.servico_id))
       WHERE t.obra_id = $1';
  END IF;

  EXECUTE format($q$
    WITH tp AS (
      SELECT t.id, m->>'produto_id' AS pid FROM public.ops_obra_tarefa t
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.materiais_crm, '[]'::jsonb)) m
       WHERE t.obra_id = $1 AND nullif(m->>'produto_id', '') IS NOT NULL
      %s
      %s
    )
    SELECT COALESCE(jsonb_object_agg(z.id, z.d), '{}'::jsonb)
      FROM (SELECT tp.id::text AS id, max(($3->>lower(tp.pid))::date) AS d
              FROM tp WHERE $3 ? lower(tp.pid) GROUP BY tp.id) z $q$, v_ficha, v_linha)
    INTO v_tar USING _obra, v_encs, v_datas;

  WITH mud AS (
    UPDATE public.ops_obra_tarefa t
       SET material_chega_em     = (x.value #>> '{}')::date,
           material_chega_origem = 'crm',
           material_chega_nota   = 'Nota de encomenda a fornecedor: chegada prevista a '
                                   || to_char((x.value #>> '{}')::date, 'DD/MM/YYYY'),
           atualizada_em         = now()
      FROM jsonb_each(v_tar) x
     WHERE t.id = x.key::uuid AND t.obra_id = _obra AND t.estado = 'por_fazer'
       AND COALESCE(t.material_chega_origem, 'crm') <> 'manual'
       AND t.material_chega_em IS DISTINCT FROM (x.value #>> '{}')::date
    RETURNING 1)
  SELECT count(*) INTO v_n FROM mud;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_material_frente_a_impl(uuid) FROM PUBLIC, anon, authenticated;

-- "Atualizar as datas do material" (o ecrã de Arranque). Gestor/admin.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_material_sincronizar(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
  v_n    integer;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia atualiza as datas do material.');
  v_n := public.ops_obra_material_frente_a_impl(p_obra_id);
  RETURN jsonb_build_object('ok', true, 'tarefas', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_material_sincronizar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_material_sincronizar(uuid) TO authenticated, service_role;


-- ============================================================
-- 4. O checklist de arranque
-- ============================================================
-- Estados (os mesmos nomes que o ecrã mostra):
--   encomenda_cliente.estado: por_instalar | nao_aplicavel (obra sem
--     contrato) | por_gerar | rascunho | validada
--   fornecedor.estado: por_instalar | nao_aplicavel | por_validar (a
--     Encomenda Cliente ainda não está validada) | por_gerar | por_aprovar |
--     parcial | aprovada | nao_necessaria
--   plano.estado: por_aprovar | aprovado
-- `ok` = este passo não impede o arranque. "por instalar" e "não aplicável"
-- não impedem. Se a Encomenda Cliente foi validada DEPOIS de o plano ser
-- aprovado, o plano volta a "por aprovar" (as datas podem já não bater).
-- Interna: sem verificação de quem chama (rpc_ops_obra_arranque e
-- rpc_ops_obra_mudar_estado verificam).
CREATE OR REPLACE FUNCTION public.ops_obra_arranque_impl(_obra uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o        record;
  v_inst     boolean := to_regclass('public.obra_encomenda_cliente') IS NOT NULL;
  v_enc      jsonb;
  v_notas    jsonb := NULL;
  v_ec       jsonb;
  v_fo       jsonb;
  v_pl       jsonb;
  v_ec_est   text;
  v_fo_est   text;
  v_pl_est   text;
  v_pl_mot   text;
  v_validada timestamptz;
  v_falta    text[] := '{}';
  v_avisos   text[] := '{}';
  v_mat      jsonb;
  v_n        integer;
  v_sem_dt   integer;
  v_sem_p    integer;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = _obra;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- ── 1. Encomenda Cliente ────────────────────────────────────────────
  IF NOT v_inst THEN
    v_ec_est := 'por_instalar';
  ELSE
    EXECUTE $q$
      SELECT to_jsonb(e) FROM public.obra_encomenda_cliente e
       WHERE e.organization_id = $1 AND (e.obra_id = $2 OR ($3 IS NOT NULL AND e.contract_id = $3))
         AND e.estado <> 'anulada'
       ORDER BY (e.obra_id = $2) DESC NULLS LAST, to_jsonb(e)->>'criada_em' DESC NULLS LAST
       LIMIT 1 $q$
      INTO v_enc USING v_o.organization_id, v_o.id, v_o.contrato_id;
    IF v_enc IS NULL THEN
      v_ec_est := CASE WHEN v_o.contrato_id IS NULL THEN 'nao_aplicavel' ELSE 'por_gerar' END;
    ELSE
      v_ec_est := CASE WHEN v_enc->>'estado' = 'validada' THEN 'validada' ELSE 'rascunho' END;
      v_validada := (v_enc->>'validada_em')::timestamptz;
    END IF;
  END IF;

  v_ec := jsonb_build_object(
    'estado', v_ec_est,
    'ok', v_ec_est IN ('validada','nao_aplicavel','por_instalar'),
    'id', v_enc->>'id',
    'contrato_id', v_o.contrato_id,
    'versao', v_enc->'versao',
    'validada_por', v_enc->>'validada_por',
    'validada_por_nome', (SELECT u.name FROM public.anew_users u WHERE u.id::text = v_enc->>'validada_por'),
    'validada_em', v_validada);
  IF NOT (v_ec->>'ok')::boolean THEN
    v_falta := v_falta || CASE v_ec_est WHEN 'por_gerar' THEN 'gerar e validar a Encomenda Cliente'
                                        ELSE 'validar a Encomenda Cliente' END;
  END IF;

  -- ── 2. Encomenda a fornecedor ───────────────────────────────────────
  IF NOT v_inst THEN
    v_fo_est := 'por_instalar';
  ELSIF v_ec_est = 'nao_aplicavel' THEN
    v_fo_est := 'nao_aplicavel';
  ELSIF v_ec_est <> 'validada' THEN
    v_fo_est := 'por_validar';
  ELSE
    v_fo_est := COALESCE(nullif(v_enc->>'fornecedor_estado', ''), 'por_gerar');
    IF v_fo_est NOT IN ('por_gerar','nao_necessaria','por_aprovar','aprovada','parcial') THEN
      v_fo_est := 'por_aprovar';
    END IF;
  END IF;

  IF v_enc IS NOT NULL
     AND public.ops_obra_crm_tem('nota_encomenda_fornecedor', ARRAY['encomenda_cliente_id','estado']) THEN
    EXECUTE $q$
      SELECT jsonb_build_object(
               'total', count(*),
               'propostas', count(*) FILTER (WHERE to_jsonb(n)->>'estado' = 'proposta'),
               'aprovadas', count(*) FILTER (WHERE to_jsonb(n)->>'estado' = 'aprovada'),
               'rejeitadas', count(*) FILTER (WHERE to_jsonb(n)->>'estado' = 'rejeitada'),
               'sem_fornecedor', count(*) FILTER (WHERE to_jsonb(n)->>'supplier_id' IS NULL
                                                    AND to_jsonb(n)->>'estado' = 'proposta'),
               'prazo_previsto', max((to_jsonb(n)->>'prazo_previsto')::date)
                                   FILTER (WHERE to_jsonb(n)->>'estado' <> 'rejeitada'))
        FROM public.nota_encomenda_fornecedor n
       WHERE n.encomenda_cliente_id = $1 $q$
      INTO v_notas USING (v_enc->>'id')::uuid;
  END IF;

  v_fo := jsonb_build_object(
    'estado', v_fo_est,
    'ok', v_fo_est IN ('aprovada','nao_necessaria','nao_aplicavel','por_instalar'),
    'notas', v_notas);
  IF NOT (v_fo->>'ok')::boolean THEN
    v_falta := v_falta || CASE v_fo_est
      WHEN 'por_validar' THEN 'a encomenda a fornecedor (depois de validar a Encomenda Cliente)'
      WHEN 'por_gerar'   THEN 'gerar as notas de encomenda a fornecedor'
      WHEN 'parcial'     THEN 'aprovar as notas de encomenda a fornecedor que faltam'
      ELSE 'aprovar a encomenda a fornecedor' END;
  END IF;

  -- ── 3. Plano ────────────────────────────────────────────────────────
  SELECT count(*), count(*) FILTER (WHERE t.inicio_planeado IS NULL),
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id))
    INTO v_n, v_sem_dt, v_sem_p
    FROM public.ops_obra_tarefa t WHERE t.obra_id = _obra;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'tarefa_id', t.id, 'nome', t.nome, 'inicio', t.inicio_planeado,
           'material_chega_em', t.material_chega_em, 'nota', t.material_chega_nota)
           ORDER BY t.inicio_planeado, t.ordem), '[]'::jsonb)
    INTO v_mat
    FROM public.ops_obra_tarefa t
   WHERE t.obra_id = _obra AND t.estado = 'por_fazer'
     AND t.material_chega_em IS NOT NULL AND t.inicio_planeado IS NOT NULL
     AND t.inicio_planeado < t.material_chega_em;

  IF v_o.plano_aprovado_em IS NULL THEN
    v_pl_est := 'por_aprovar';
  ELSIF v_validada IS NOT NULL AND v_validada > v_o.plano_aprovado_em AND v_o.iniciada_em IS NULL THEN
    v_pl_est := 'por_aprovar';
    v_pl_mot := 'a Encomenda Cliente foi validada depois de o plano ser aprovado';
  ELSE
    v_pl_est := 'aprovado';
  END IF;

  IF v_n = 0 THEN
    v_avisos := v_avisos || 'a obra ainda não tem tarefas'::text;
  END IF;
  IF v_sem_dt > 0 THEN
    v_avisos := v_avisos || (v_sem_dt || ' tarefa(s) sem datas');
  END IF;
  IF v_sem_p > 0 THEN
    v_avisos := v_avisos || (v_sem_p || ' tarefa(s) sem ninguém atribuído');
  END IF;
  IF v_o.supervisor_id IS NULL THEN
    v_avisos := v_avisos || 'sem supervisor'::text;
  END IF;
  IF jsonb_array_length(v_mat) > 0 THEN
    v_avisos := v_avisos || (jsonb_array_length(v_mat) || ' tarefa(s) começam antes de o material chegar');
  END IF;

  v_pl := jsonb_build_object(
    'estado', v_pl_est,
    'ok', v_pl_est = 'aprovado',
    'motivo', v_pl_mot,
    'aprovado_por', v_o.plano_aprovado_por,
    'aprovado_por_nome', (SELECT u.name FROM public.anew_users u WHERE u.id = v_o.plano_aprovado_por),
    'aprovado_em', v_o.plano_aprovado_em,
    'tarefas', v_n,
    'sem_datas', v_sem_dt,
    'sem_pessoas', v_sem_p,
    'material_antes', v_mat,
    'avisos', to_jsonb(v_avisos));
  IF v_pl_est <> 'aprovado' THEN
    v_falta := v_falta || CASE WHEN v_pl_mot IS NOT NULL
                               THEN 'aprovar outra vez o plano (' || v_pl_mot || ')'
                               ELSE 'aprovar o plano da obra' END;
  END IF;

  RETURN jsonb_build_object(
    'obra_id', v_o.id,
    'estado_obra', v_o.estado,
    'arrancou', v_o.iniciada_em IS NOT NULL,
    'frente_a_instalada', v_inst,
    'encomenda_cliente', v_ec,
    'fornecedor', v_fo,
    'plano', v_pl,
    'pode_arrancar', (v_ec->>'ok')::boolean AND (v_fo->>'ok')::boolean AND (v_pl->>'ok')::boolean,
    'falta', to_jsonb(v_falta));
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_arranque_impl(uuid) FROM PUBLIC, anon, authenticated;

-- O checklist, para o separador "Arranque". Quem vê a obra.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_arranque(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada, ou sem permissão para a ver.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.ops_obra_arranque_impl(p_obra_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_arranque(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_arranque(uuid) TO authenticated, service_role;


-- ============================================================
-- 5. Aprovar o plano
-- ============================================================
-- Gestor/admin (operations.orders.edit). Só antes de a obra arrancar. Tem de
-- haver tarefas e todas com datas. Primeiro põe em dia as datas do material
-- (notas de encomenda); o que não bate fica em `avisos` (não bloqueia).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_aprovar_plano(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
  v_n    integer;
  v_sem  integer;
  v_arr  jsonb;
  v_em   timestamptz := now();
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia aprova o plano.');

  IF v_o.iniciada_em IS NOT NULL OR v_o.estado NOT IN ('planeada','suspensa') THEN
    RAISE EXCEPTION 'A obra já arrancou (ou está %): o plano já não se aprova.', replace(v_o.estado, '_', ' ');
  END IF;

  SELECT count(*), count(*) FILTER (WHERE inicio_planeado IS NULL OR fim_planeado IS NULL)
    INTO v_n, v_sem FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'A obra não tem tarefas: não há plano para aprovar.';
  END IF;
  IF v_sem > 0 THEN
    RAISE EXCEPTION 'Há % tarefa(s) sem datas. Replaneia antes de aprovar.', v_sem;
  END IF;

  PERFORM public.ops_obra_material_frente_a_impl(p_obra_id);

  UPDATE public.ops_obra
     SET plano_aprovado_por = v_quem.o_utilizador, plano_aprovado_em = v_em
   WHERE id = p_obra_id;

  v_arr := public.ops_obra_arranque_impl(p_obra_id);

  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'plano_aprovado', NULL,
    v_quem.o_utilizador,
    jsonb_build_object('tarefas', v_n, 'avisos', v_arr->'plano'->'avisos'));

  RETURN jsonb_build_object(
    'ok', true,
    'aprovado_em', v_em,
    'aprovado_por', v_quem.o_utilizador,
    'avisos', COALESCE(v_arr->'plano'->'avisos', '[]'::jsonb),
    'pode_arrancar', v_arr->'pode_arrancar',
    'falta', v_arr->'falta');
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_aprovar_plano(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_aprovar_plano(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_ops_obra_arranque(uuid) IS
  'Operações: checklist de arranque da obra (Encomenda Cliente, encomenda a fornecedor, plano) e pode_arrancar.';
COMMENT ON FUNCTION public.rpc_ops_obra_aprovar_plano(uuid) IS
  'Operações: aprova o plano da obra (quem/quando). Mexer no plano depois repõe "por aprovar". Exige operations.orders.edit.';

COMMIT;
