-- RASCUNHO. NÃO SE APLICA SEM ORDEM EXPLÍCITA DO UTILIZADOR.
-- Ordem quando houver ordem: 1) correr os testes contra o remoto da RH (uetjghdkwbywbftedtth) ANTES do push;
-- 2) listar o pendente (migration list --linked); 3) copiar para supabase/migrations e db push --linked.
-- O código da aplicação já está no remoto: a ficha do Negócio avança a fase ao concluir cada passo; esta
-- migration só garante que o negócio criado pelo Pipeline nasce com número e fase e aparece em neg_ler_negocios.
--
-- O que se mediu na RH (só leitura, 28/10):
--   * o número JÁ é dado pelo gatilho trg_negocios_numero (BEFORE INSERT, fn_negocios_numero, migration
--     20261231940000): max(numero) da organização + 1, a partir de 1001, com pg_advisory_xact_lock por organização.
--     neg_criar_negocio faz INSERT em negocios, por isso também passa pelo gatilho.
--   * os 3 negócios sem número (todos da nike, vivos) foram criados a 26/10 12:58-13:00, ANTES de o gatilho
--     existir (migration de 27/10); os 2 criados a 28/10 têm número (1001, 1002). Os 3 têm levantamento,
--     visita e chamada ligados e nenhum orçamento.
--   * restrição de unicidade já existente: negocios_org_numero_key UNIQUE (organization_id, numero) WHERE numero IS NOT NULL.
--
-- O que esta migration faz:
--   A) fn_negocios_numero passa a SECURITY DEFINER (search_path fixo). Hoje corre como quem insere, e a RLS
--      negocios_select esconde-lhe os negócios fora do seu âmbito: um comercial com âmbito «os meus» calcula o
--      máximo só sobre os dele e choca com negocios_org_numero_key (23505). Mesmo mecanismo, mesmo cadeado.
--   B) fn_neg_fase_derivada(negócio, organização): a regra de neg_resumo_quadro, em número de fase:
--      contrato, proposta, orçamento ou levantamento vivo -> 3; visita não cancelada -> 2; chamada -> 1; nada -> 0.
--   C) neg_criar_negocio (mesma assinatura de 11 argumentos, continua SECURITY INVOKER como a versão em vigor e
--      como a guarda de 20261228200000 exige): nasce com fase 0 e, depois de ligar os registos, grava a fase derivada.
--   D) preenchimento único: os negócios vivos sem número, das organizações com o fluxo ligado
--      (negocio_workflow_config, o mesmo interruptor de fn_neg_exigir_config), recebem número pelo mesmo
--      mecanismo e, se a fase for NULL, a fase derivada. Não toca em nenhum que já tenha número.
--   E) guarda final.

SET lock_timeout = '5s';

-- ------------------------------------------------------------------ A) número sem depender da RLS de quem insere
CREATE OR REPLACE FUNCTION public.fn_negocios_numero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.numero IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('negocios_numero:' || NEW.organization_id::text, 0));
    SELECT coalesce(max(numero), 1000) + 1 INTO NEW.numero FROM public.negocios WHERE organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END $function$;

-- ------------------------------------------------------------------ B) a fase pela regra do quadro
CREATE OR REPLACE FUNCTION public.fn_neg_fase_derivada(p_negocio uuid, p_org uuid)
 RETURNS smallint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.client_contracts cc WHERE cc.negocio_id = p_negocio AND cc.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.proposals pr WHERE pr.negocio_id = p_negocio AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
      OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.negocio_id = p_negocio AND q.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.levantamentos lt WHERE lt.negocio_id = p_negocio AND lt.deleted_at IS NULL) THEN 3
    WHEN EXISTS (SELECT 1 FROM public.schedule_items s
                 WHERE s.negocio_id = p_negocio AND s.organization_id = p_org
                   AND s.status <> 'cancelled'::public.schedule_item_status
                   AND s.time_off_type IS NULL AND s.vacation_id IS NULL) THEN 2
    WHEN EXISTS (SELECT 1 FROM public.entity_interactions i
                 WHERE i.negocio_id = p_negocio AND i.organization_id = p_org AND i.interaction_type = 'call') THEN 1
    ELSE 0
  END::smallint
$function$;
REVOKE ALL ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.fn_neg_fase_derivada(uuid, uuid) IS 'A fase do negócio pela regra de neg_resumo_quadro: contrato, proposta, orçamento ou levantamento 3; visita não cancelada 2; chamada 1; senão 0. INVOKER: vê o que a RLS de quem chama deixa ver. 20261231997000.';

-- ------------------------------------------------------------------ C) neg_criar_negocio: nasce com fase
-- Base: a versão em vigor (20261228200000, linha 3596; confirmada igual no catálogo da RH a 28/10).
-- Muda só: fase 0 no INSERT e, depois das ligações, a fase derivada. O resto é igual, letra a letra.
CREATE OR REPLACE FUNCTION public.neg_criar_negocio(p_id uuid, p_organization_id uuid, p_entity_id uuid, p_titulo text, p_notas text DEFAULT NULL::text, p_assigned_to uuid DEFAULT NULL::uuid, p_registos jsonb DEFAULT '[]'::jsonb, p_levantamento_id uuid DEFAULT NULL::uuid, p_lead_id uuid DEFAULT NULL::uuid, p_reabrir_abordagem boolean DEFAULT false, p_fecho text DEFAULT 'contrato'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_titulo     text := btrim(p_titulo);
  v_notas      text := NULLIF(btrim(p_notas), '');
  v_registos   jsonb := COALESCE(p_registos, '[]'::jsonb);
  v_encerrada  text;
  v_existente  public.negocios;
  v_reg        record;
  v_ligados    jsonb := '[]'::jsonb;
  v_recusados  jsonb := '[]'::jsonb;
  v_n          int;
  v_fase       smallint;
BEGIN
  IF p_id IS NULL OR v_titulo IS NULL OR v_titulo = '' OR char_length(v_titulo) > 200
     OR char_length(v_notas) > 5000 THEN
    RAISE EXCEPTION 'Valor inválido: identificador, título (1 a 200) ou notas (até 5000).' USING ERRCODE = 'NG009';
  END IF;
  IF p_fecho IS NULL OR p_fecho NOT IN ('proposta', 'contrato') THEN
    RAISE EXCEPTION 'Valor inválido: tipo de fecho (proposta ou contrato).' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(v_registos) <> 'array' THEN
    RAISE EXCEPTION 'Valor inválido: registos.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_array_length(v_registos) > 100 OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_registos) AS e(valor)
       WHERE jsonb_typeof(e.valor) <> 'object'
          OR (e.valor ->> 'tipo') IS NULL
          OR (e.valor ->> 'tipo') NOT IN ('contacto', 'visita', 'orcamento', 'proposta', 'contrato')
          OR (e.valor ->> 'id') IS NULL
          OR (e.valor ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Valor inválido: registos (até 100; tipo contacto, visita, orcamento, proposta ou contrato; id uuid).'
      USING ERRCODE = 'NG009';
  END IF;

  PERFORM public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);

  -- Reenvio do mesmo id: devolve-o como está, antes de qualquer outra regra.
  SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
  IF FOUND THEN
    IF v_existente.organization_id <> p_organization_id OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- 20261228200000: a abordagem é da entidade (anew_entities.closure_result);
  -- p_lead_id deixa de ser usado (fica na assinatura).
  SELECT e.closure_result INTO v_encerrada
  FROM public.anew_entities e
  WHERE e.id = p_entity_id AND e.organization_id = p_organization_id AND e.deleted_at IS NULL;
  IF v_encerrada IS NOT NULL AND NOT COALESCE(p_reabrir_abordagem, false) THEN
    RAISE EXCEPTION 'A abordagem desta pessoa está encerrada.' USING ERRCODE = 'NG002';
  END IF;

  -- Criar (RLS negocios_insert: pessoas.create na organização, pessoa ligada,
  -- comercial membro activo). Corrida com outro reenvio: devolve-o como está.
  -- 20261231997000: o número dá-o o gatilho trg_negocios_numero; nasce na fase 0.
  INSERT INTO public.negocios (id, organization_id, entity_id, titulo, notas, assigned_to, fecho, fase)
  VALUES (p_id, p_organization_id, p_entity_id, v_titulo, v_notas, p_assigned_to, p_fecho, 0)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    SELECT n.* INTO v_existente FROM public.negocios n WHERE n.id = p_id;
    IF NOT FOUND OR v_existente.organization_id <> p_organization_id
       OR v_existente.entity_id <> p_entity_id THEN
      RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
    END IF;
    RETURN jsonb_build_object('negocio_id', p_id, 'mudou', false, 'ligados', '[]'::jsonb,
                              'recusados', '[]'::jsonb, 'lead_escolhida', NULL);
  END IF;

  -- Ligações (exigem pessoas.edit: NG001 aborta tudo; NG004, NG014, NG023 e
  -- NG024 vão para recusados).
  FOR v_reg IN
    SELECT e.valor ->> 'tipo' AS tipo, (e.valor ->> 'id')::uuid AS id
    FROM jsonb_array_elements(v_registos) AS e(valor)
    UNION ALL
    SELECT 'levantamento', p_levantamento_id WHERE p_levantamento_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.neg_ligar_registo(p_id, v_reg.tipo, v_reg.id);
      v_ligados := v_ligados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    EXCEPTION WHEN SQLSTATE 'NG004' OR SQLSTATE 'NG014' OR SQLSTATE 'NG023' OR SQLSTATE 'NG024' THEN
      v_recusados := v_recusados || jsonb_build_object('tipo', v_reg.tipo, 'id', v_reg.id);
    END;
  END LOOP;

  -- 20261231997000: a fase pelo que ficou ligado (só há ligações com pessoas.edit,
  -- que é o que a RLS negocios_update pede). Sem ligações fica 0.
  IF jsonb_array_length(v_ligados) > 0 THEN
    v_fase := public.fn_neg_fase_derivada(p_id, p_organization_id);
    IF v_fase > 0 THEN
      UPDATE public.negocios SET fase = v_fase WHERE id = p_id AND organization_id = p_organization_id;
    END IF;
  END IF;

  IF v_encerrada IS NOT NULL THEN
    PERFORM public.fn_neg_mudar_abordagem(
      p_organization_id, p_entity_id, NULL, NULL, NULL, 'Reaberta ao criar um negócio');
  END IF;

  RETURN jsonb_build_object('negocio_id', p_id, 'mudou', true, 'ligados', v_ligados,
                            'recusados', v_recusados,
                            'lead_escolhida', NULL);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean, text) TO authenticated;

-- ------------------------------------------------------------------ D) preenchimento único (idempotente)
DO $do$
DECLARE
  v_org uuid;
  v_max integer;
BEGIN
  FOR v_org IN
    SELECT DISTINCT n.organization_id
    FROM public.negocios n
    JOIN public.negocio_workflow_config c ON c.organization_id = n.organization_id
    WHERE n.numero IS NULL AND n.deleted_at IS NULL
    ORDER BY 1
  LOOP
    -- o mesmo cadeado do gatilho: nenhum INSERT concorrente calcula o máximo ao mesmo tempo
    PERFORM pg_advisory_xact_lock(hashtextextended('negocios_numero:' || v_org::text, 0));
    SELECT coalesce(max(numero), 1000) INTO v_max FROM public.negocios WHERE organization_id = v_org;

    UPDATE public.negocios n
       SET numero = v_max + x.ordem,
           fase   = coalesce(n.fase, public.fn_neg_fase_derivada(n.id, n.organization_id))
      FROM (SELECT id, row_number() OVER (ORDER BY created_at, id)::integer AS ordem
              FROM public.negocios
             WHERE organization_id = v_org AND numero IS NULL AND deleted_at IS NULL) x
     WHERE n.id = x.id AND n.numero IS NULL;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------ E) guarda
DO $do$
DECLARE
  v_sem_numero integer;
  v_sem_fase   integer;
  v_duplos     integer;
  v_versoes    integer;
BEGIN
  SELECT count(*) FILTER (WHERE n.numero IS NULL), count(*) FILTER (WHERE n.numero IS NOT NULL AND n.fase IS NULL)
    INTO v_sem_numero, v_sem_fase
  FROM public.negocios n
  JOIN public.negocio_workflow_config c ON c.organization_id = n.organization_id
  WHERE n.deleted_at IS NULL;
  IF v_sem_numero > 0 THEN
    RAISE EXCEPTION 'Guarda: ficaram % negócios vivos sem número em organizações com o fluxo ligado.', v_sem_numero;
  END IF;

  SELECT count(*) INTO v_duplos FROM (
    SELECT organization_id, numero FROM public.negocios WHERE numero IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_duplos > 0 THEN
    RAISE EXCEPTION 'Guarda: % números repetidos na mesma organização.', v_duplos;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'negocios_org_numero_key') THEN
    RAISE EXCEPTION 'Guarda: falta o índice único negocios_org_numero_key.';
  END IF;

  SELECT count(*) INTO v_versoes FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'neg_criar_negocio';
  IF v_versoes <> 1 OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'neg_criar_negocio'
         AND p.pronargs = 11 AND NOT p.prosecdef
         AND p.proconfig::text[] @> ARRAY['search_path=public, pg_temp']) THEN
    RAISE EXCEPTION 'Guarda: neg_criar_negocio tem de ser uma só, com 11 argumentos, INVOKER e search_path fixo (há %).', v_versoes;
  END IF;
  IF has_function_privilege('anon', 'public.neg_criar_negocio(uuid, uuid, uuid, text, text, uuid, jsonb, uuid, uuid, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Guarda: anon não pode executar neg_criar_negocio.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'fn_negocios_numero'
                   AND p.prosecdef AND p.proconfig::text[] @> ARRAY['search_path=public, pg_temp']) THEN
    RAISE EXCEPTION 'Guarda: fn_negocios_numero tem de ser SECURITY DEFINER com search_path fixo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_negocios_numero'
                   AND tgrelid = 'public.negocios'::regclass AND tgenabled::text = 'O') THEN
    RAISE EXCEPTION 'Guarda: o gatilho trg_negocios_numero não está ativo.';
  END IF;

  RAISE NOTICE 'Guarda: sem negócios por numerar; % com número e fase NULL (não tocados).', v_sem_fase;
END $do$;
