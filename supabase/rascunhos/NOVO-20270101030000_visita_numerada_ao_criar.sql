-- RASCUNHO, NADA APLICADO. Base RH (uetjghdkwbywbftedtth). Não é uma migration até ser revista (ecc:database-reviewer e ecc:security-reviewer)
-- e copiada para supabase/migrations com o nome 20270101030000_visita_numerada_ao_criar.sql.
--
-- Negócio: a visita marcada no CRM pelo passo Visitas recebe logo o número de visita do negócio (schedule_items.visita_numero), para a
-- sincronização do Ben (fn_neg_sincronizar_visitas, que corre em cada gravação do negócio) a encontrar pelo número e só a actualizar, em vez
-- de inserir uma segunda linha na agenda (origin 'auto', sem recursos). Decisão do utilizador: numerar ao criar; a função do Ben não muda.
--
-- Porque é uma RPC: a política de UPDATE de schedule_items exige scheduling.items.edit; quem só tem pessoas.edit faria um UPDATE de 0 linhas,
-- sem erro. Esta função é SECURITY DEFINER e só escreve visita_numero (updated_at vem do gatilho update_schedule_items_updated_at).
--
-- O QUE NÃO MUDA: neg_guardar_negocio, fn_neg_sincronizar_visitas, neg_guardar_visita e as políticas de schedule_items ficam como estão.
-- Para a Mudelar: nada, enquanto o código não chamar esta função (é nova; ninguém a chama hoje).
--
-- SUBSTITUI o rascunho NOVO-20270101010000_visitas_adotar_do_crm.sql (que mudava fn_neg_sincronizar_visitas): não aplicar os dois.
--
-- ORDEM OBRIGATÓRIA (migration e código juntos):
--   1. Testes contra o remoto ANTES do push (o vermelho é agora: a função não existe e a visita do passo Visitas fica duplicada na agenda).
--   2. supabase.cmd migration list --linked: o pendente é SÓ este ficheiro (última aplicada: 20270101000000; 20270101020000 é outro rascunho).
--   3. supabase.cmd db push --linked --dry-run; depois supabase.cmd db push --linked.
--   4. Publicar o código que chama neg_numerar_visita logo a seguir a neg_guardar_visita e escreve v<n>_* e n em «visitas» no espelho
--      ANTES da próxima gravação do negócio (ver o DESENHO: sem n na lista de visitas, a sincronização cancela a visita do CRM).
--   5. Ver ao vivo na nike: marcar uma visita, gravar o negócio, confirmar UMA só linha na agenda, com os recursos. Nunca na Mudelar.
--
-- Contrato: public.neg_numerar_visita(p_negocio_id uuid, p_visita_id uuid) RETURNS integer
--   sessão (insufficient_privilege / no_data_found, como neg_guardar_visita);
--   negócio inexistente, apagado, de outra organização, fora do âmbito pessoas.edit ou sem pessoas.edit: NG001 'Negócio indisponível.';
--   negócio do CRM (sem fluxo_emylia e com documentos do CRM): NE005, a mesma regra e mensagem de neg_guardar_negocio;
--   visita inexistente, de outro negócio ou de outra organização: NG001 'Visita indisponível neste negócio.';
--   visita já numerada: devolve o número (idempotente, sem escrever);
--   senão: o menor n >= 1 que não está usado na agenda deste negócio (todas as linhas com número, canceladas incluídas, como o índice
--   schedule_items_negocio_visita_key) NEM na lista de visitas do espelho já gravada (negocio_medidas.visitas); grava-o e devolve-o.

-- -----------------------------------------------------------------------------
-- 0. Guarda de partida (só catálogo; nada de ::regclass sobre o que pode não existir)
-- -----------------------------------------------------------------------------
DO $guarda$
DECLARE
  v_n integer;
BEGIN
  -- A função nova não existe (ou é desta migration: re-execução).
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_numerar_visita'
    AND position('20270101030000' IN coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '')) = 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Guarda: já existe public.neg_numerar_visita que não é desta migration.';
  END IF;

  -- Dependências com a assinatura que a função usa.
  IF to_regprocedure('public.fn_neg_docs_crm(uuid)') IS NULL
     OR to_regprocedure('public.crm_scope_keys(text)') IS NULL
     OR to_regprocedure('public.has_anew_permission(uuid, text)') IS NULL
     OR to_regprocedure('public.current_business_user_id()') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta uma das funções de que neg_numerar_visita depende.';
  END IF;

  -- Colunas e índice único.
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  WHERE c.relnamespace = 'public'::regnamespace AND NOT a.attisdropped
    AND ((c.relname::text = 'schedule_items' AND a.attname::text = 'visita_numero' AND a.atttypid = 'smallint'::regtype)
      OR (c.relname::text = 'schedule_items' AND a.attname::text = 'negocio_id' AND a.atttypid = 'uuid'::regtype)
      OR (c.relname::text = 'negocios' AND a.attname::text = 'fluxo_emylia' AND a.atttypid = 'boolean'::regtype)
      OR (c.relname::text = 'negocio_medidas' AND a.attname::text = 'visitas' AND a.atttypid = 'smallint[]'::regtype));
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Guarda: colunas esperadas em schedule_items, negocios ou negocio_medidas em falta ou com outro tipo (% de 4).', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM pg_catalog.pg_class i
  JOIN pg_catalog.pg_index x ON x.indexrelid = i.oid
  WHERE i.relnamespace = 'public'::regnamespace AND i.relname::text = 'schedule_items_negocio_visita_key' AND x.indisunique;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Guarda: falta o índice único schedule_items_negocio_visita_key.';
  END IF;
END
$guarda$;

-- -----------------------------------------------------------------------------
-- 1. A função
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_numerar_visita(p_negocio_id uuid, p_visita_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_numero CONSTANT integer := 32767;  -- visita_numero é smallint
  v_uid     uuid := auth.uid();
  v_actor   uuid;
  v_neg     public.negocios;
  v_vis_org uuid;
  v_vis_num smallint;
  v_espelho smallint[];
  v_max     integer;
  v_n       integer;
BEGIN
  -- 1. Sessão e actor (como neg_guardar_visita)
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF p_negocio_id IS NULL OR p_visita_id IS NULL THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  -- 2. Negócio vivo, com pessoas.edit e no âmbito (o teste de neg_guardar_visita, passo 6, sem exigir «aberto»: a sincronização também
  --    corre em negócios fechados). Inexistente, de outra organização ou sem permissão: a mesma mensagem. Bloqueia a linha do negócio,
  --    o mesmo recurso que neg_guardar_negocio (UPDATE negocios) e neg_guardar_visita (FOR NO KEY UPDATE) tomam: duas chamadas não se cruzam.
  IF public.has_anew_permission(v_uid, 'pessoas.edit') THEN
    SELECT n.* INTO v_neg
    FROM public.negocios n
    WHERE n.id = p_negocio_id
      AND n.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM unnest(public.crm_scope_keys('pessoas.edit')) AS k(scope_key)
                  WHERE k.scope_key = n.organization_id::text || ':*'
                     OR k.scope_key = n.organization_id::text || ':' || n.assigned_to::text
                     OR k.scope_key = n.organization_id::text || ':' || n.created_by::text)
    FOR UPDATE;
  END IF;
  IF v_neg.id IS NULL THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'NG001';
  END IF;

  -- 3. Negócio do CRM: a mesma regra de neg_guardar_negocio (NE005). Lá a gravação é recusada e a sincronização nunca corre; numerar aqui
  --    não teria efeito e faria o código escrever um espelho que nunca é gravado.
  IF NOT coalesce(v_neg.fluxo_emylia, false) AND public.fn_neg_docs_crm(p_negocio_id) THEN
    RAISE EXCEPTION 'Este negócio é do CRM: abra-o em Contratos/Propostas.' USING ERRCODE = 'NE005';
  END IF;

  -- 4. A visita: deste negócio e da mesma organização. Bloqueada para o teste e a escrita verem a mesma linha.
  SELECT s.organization_id, s.visita_numero INTO v_vis_org, v_vis_num
  FROM public.schedule_items s
  WHERE s.id = p_visita_id AND s.negocio_id = p_negocio_id AND s.organization_id = v_neg.organization_id
  FOR UPDATE;
  IF v_vis_org IS NULL THEN
    RAISE EXCEPTION 'Visita indisponível neste negócio.' USING ERRCODE = 'NG001';
  END IF;

  -- 5. Já numerada: devolve o número, sem escrever (idempotente).
  IF v_vis_num IS NOT NULL THEN
    RETURN v_vis_num;
  END IF;

  -- 6. O menor número livre: nem na agenda deste negócio (todas as linhas com número, canceladas incluídas, como o índice único),
  --    nem na lista de visitas do espelho já gravada (uma visita da Emylia sem dia nem hora tem número e não tem linha na agenda).
  SELECT m.visitas INTO v_espelho FROM public.negocio_medidas m WHERE m.negocio_id = p_negocio_id;
  v_espelho := array_remove(coalesce(v_espelho, ARRAY[]::smallint[]), NULL);  -- um NULL na lista anulava o «= ANY» abaixo
  SELECT greatest(
           coalesce((SELECT max(s.visita_numero) FROM public.schedule_items s
                     WHERE s.negocio_id = p_negocio_id AND s.visita_numero IS NOT NULL), 0),
           coalesce((SELECT max(e.x) FROM unnest(v_espelho) AS e(x)), 0))::integer
    INTO v_max;
  SELECT min(g.n) INTO v_n
  FROM generate_series(1, v_max + 1) AS g(n)
  WHERE NOT (g.n = ANY (v_espelho::integer[]))
    AND NOT EXISTS (SELECT 1 FROM public.schedule_items s
                    WHERE s.negocio_id = p_negocio_id AND s.visita_numero = g.n);
  IF v_n IS NULL OR v_n > c_max_numero THEN
    RAISE EXCEPTION 'Valor inválido: o negócio já não tem números de visita livres.' USING ERRCODE = 'NG009';
  END IF;

  -- 7. Grava só o número (updated_at pelo gatilho; a auditoria genérica regista a mudança).
  PERFORM set_config('app.audit_bypass', 'off', true);
  UPDATE public.schedule_items s
  SET visita_numero = v_n::smallint
  WHERE s.id = p_visita_id AND s.visita_numero IS NULL;

  RETURN v_n;
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_numerar_visita(p_negocio_id uuid, p_visita_id uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_numerar_visita(p_negocio_id uuid, p_visita_id uuid) TO authenticated;
COMMENT ON FUNCTION public.neg_numerar_visita(p_negocio_id uuid, p_visita_id uuid) IS 'Negócio: dá à visita do CRM (passo Visitas) o número de visita do negócio, para fn_neg_sincronizar_visitas a actualizar em vez de a duplicar. pessoas.edit no âmbito; NE005 em negócios do CRM; idempotente; só escreve visita_numero. 20270101030000.';

-- -----------------------------------------------------------------------------
-- 2. Conferir o resultado (falha = tudo se desfaz). Só catálogo.
-- -----------------------------------------------------------------------------
DO $conferir$
DECLARE
  v_oid regprocedure;
  v_n   integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname::text = 'neg_numerar_visita';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: public.neg_numerar_visita tem % assinaturas (esperava 1).', v_n;
  END IF;
  v_oid := to_regprocedure('public.neg_numerar_visita(uuid, uuid)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'Conferir: public.neg_numerar_visita(uuid, uuid) não existe.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_catalog.pg_proc p
  WHERE p.oid = v_oid
    AND p.prosecdef
    AND p.prorettype = 'integer'::regtype
    AND p.proconfig::text = '{"search_path=public, pg_temp"}';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Conferir: neg_numerar_visita sem SECURITY DEFINER, sem search_path fixo ou com outro tipo de retorno.';
  END IF;

  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('service_role', v_oid, 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                WHERE p.oid = v_oid AND a.grantee = 0 AND a.privilege_type::text = 'EXECUTE') THEN
    RAISE EXCEPTION 'Conferir: neg_numerar_visita com permissões trocadas (só authenticated executa).';
  END IF;
END
$conferir$;
