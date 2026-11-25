-- =============================================================================
-- Nome unico da ficha, parte 2 de 2 (base PRINCIPAL): preenchimento de
-- company_name e os dois gatilhos. Depende de 20261229910000 (coluna e funcoes).
--
-- Decisao D2: NENHUM display_name existente muda nesta migration, nem por
-- causa dela. So daqui para a frente fica bem, e de forma conservadora.
--
-- 1. Preenchimento de company_name (sem LOCK TABLE: UPDATE normal, bloqueios
--    de linha). So onde:
--      * company_name ainda e NULL;
--      * todas as leads vivas da ficha que tem empresa concordam numa so;
--      * o display_name actual e EXACTAMENTE essa empresa (normalizada);
--      * a ficha nao e partilhada com outra organizacao-raiz (ver 2).
--    A guarda e linha a linha, sobre as linhas que ESTE UPDATE tocou (que
--    ficam bloqueadas ate ao commit): cada uma tem display_name igual ao lido
--    antes e igual a empresa. Edicoes concorrentes noutras fichas nao a fazem
--    falhar. A linha e re-verificada no proprio UPDATE (display_name igual ao
--    lido), por isso uma ficha editada entretanto e simplesmente saltada.
--
-- 2. fn_entity_shared_outside_root(ficha, raiz): true se a ficha e de um
--    utilizador, de uma organizacao da plataforma, ou aparece em leads,
--    clientes, contactos, ligacoes a organizacoes ou papeis de OUTRA raiz.
--
-- 3. Gatilho BEFORE da ficha, trg_anew_entities_0_display_name (o «0» corre
--    antes de trg_anew_entities_search_text). Guarda-livros, nao reescritor:
--      INSERT: so preenche o display_name quando vem vazio; um display_name
--              fornecido nunca e sobrescrito.
--      UPDATE (so dispara em UPDATE OF first_name, last_name): recompoe SO se
--        (a) o UPDATE nao mudou o proprio display_name, E
--        (b) a ficha estava em sincronia: o display_name antigo, normalizado,
--            era a composicao das colunas antigas, E
--        (c) a composicao das colunas novas difere do display_name antigo.
--      Uma ficha fora de sincronia (nome concatenado, empresa com nome/apelido
--      diferentes, nome editado a mao, importado) nunca e tocada: o ecra e que
--      escreve o display_name explicitamente.
--      Um UPDATE so de company_name ou type NAO recompoe nada (o gatilho nem
--      dispara): o display_name nao muda e por isso o search_text, que so
--      escuta display_name/first_name/last_name, continua certo.
--
-- 4. Gatilho AFTER da lead, trg_anew_leads_sync_entity_company: NUNCA renomeia.
--    So regista company_name (metadado); o UPDATE da ficha so tem company_name
--    no SET, e por isso o gatilho do nome (UPDATE OF first_name, last_name) nem
--    dispara.
--      INSERT da lead (ou mudanca de ficha): so preenche quando company_name da
--        ficha e NULL e o display_name ja e exactamente essa empresa;
--      UPDATE da lead com a empresa a mudar para um valor nao vazio: regista-a
--        SO se a ficha ainda nao tem empresa, ou se a que tem e a empresa
--        ANTIGA desta lead (OLD.field_values) -- um passo 2 de um formulario
--        publico nunca troca a empresa ja registada de um cliente;
--      um valor vazio nunca apaga; fichas partilhadas com outra raiz: nada.
--    Um visitante do formulario publico nao consegue renomear a ficha de um
--    cliente: o display_name nunca e escrito a partir da lead.
--
-- Editar a lead (rpc_update_lead, versao 20261130140000, lida): actualiza a
-- lead PRIMEIRO (este gatilho regista a empresa) e so depois a ficha, com
-- display_name = p_display_name explicito (o ecra manda a empresa, ou nome +
-- apelido). Se o valor muda, (a) respeita-o; se e igual, nada a fazer.
-- Editar o cliente (rpc_update_client, versao 20261229500000, lida): grava
-- display_name = p_display_name explicito com first/last; idem.
-- Auditoria: nao se mexe. Num UPDATE em que o gatilho recompoe, o valor
-- registado pelas RPCs e o enviado (p_display_name), nao o final -- so
-- acontece quando a RPC manda o mesmo display_name e muda nome/apelido.
--
-- SUPOSICAO (so migrations lidas, nao o catalogo do remoto): nenhum destes
-- gatilhos/funcoes existe la; o db push corre o ficheiro numa transaccao (o
-- SET LOCAL depende disso).
-- Reversao: fora da pasta das migrations.
-- =============================================================================

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- 2. Ficha partilhada com outra organizacao-raiz? -------------------------------
CREATE FUNCTION public.fn_entity_shared_outside_root(p_entity_id uuid, p_root uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_root IS NULL
      OR EXISTS (SELECT 1 FROM public.anew_users u WHERE u.entity_id = p_entity_id)
      OR EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id)
      OR EXISTS (SELECT 1 FROM public.anew_leads l
                  WHERE l.entity_id = p_entity_id AND l.root_organization_id IS DISTINCT FROM p_root)
      OR EXISTS (SELECT 1 FROM public.anew_clients c
                  WHERE c.entity_id = p_entity_id AND c.root_organization_id IS DISTINCT FROM p_root)
      OR EXISTS (SELECT 1 FROM public.anew_contacts ct
                  WHERE ct.entity_id = p_entity_id AND ct.root_organization_id IS DISTINCT FROM p_root)
      OR EXISTS (SELECT 1 FROM public.anew_entity_org_links ol
                  WHERE ol.entity_id = p_entity_id
                    AND public.resolve_root_organization_id(ol.organization_id) IS DISTINCT FROM p_root)
      OR EXISTS (SELECT 1 FROM public.anew_entity_roles r
                  WHERE r.entity_id = p_entity_id
                    AND public.resolve_root_organization_id(r.organization_id) IS DISTINCT FROM p_root);
$$;

COMMENT ON FUNCTION public.fn_entity_shared_outside_root(uuid, uuid) IS
  'true se a ficha e de um utilizador/organizacao da plataforma ou aparece noutra organizacao-raiz (leads, clientes, contactos, ligacoes, papeis).';

REVOKE ALL ON FUNCTION public.fn_entity_shared_outside_root(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_entity_shared_outside_root(uuid, uuid) TO service_role;

-- 1. Preenchimento de company_name, com guarda linha a linha --------------------
DO $$
DECLARE
  v_filled bigint;
  v_bad    bigint;
BEGIN
  -- A auditoria fica em silencio so neste passo (metadado, nada visivel muda).
  PERFORM set_config('app.audit_bypass', 'on', true);

  WITH lead_company AS (
    SELECT l.entity_id,
           l.root_organization_id,
           nullif(btrim(regexp_replace(
             coalesce(public.fn_lead_company_from_field_values(l.field_values), ''),
             '[\s\u00a0]+', ' ', 'g'), ' '), '') AS company
      FROM public.anew_leads l
     WHERE l.entity_id IS NOT NULL
       AND l.deleted_at IS NULL
  ),
  agreed AS (
    SELECT lc.entity_id,
           min(lc.company) AS company,
           min(lc.root_organization_id::text)::uuid AS root
      FROM lead_company lc
     WHERE lc.company IS NOT NULL
     GROUP BY lc.entity_id
    HAVING count(DISTINCT lc.company) = 1
  ),
  candidates AS (
    SELECT e.id, e.display_name AS display_before, a.company
      FROM public.anew_entities e
      JOIN agreed a ON a.entity_id = e.id
     WHERE e.company_name IS NULL
       AND e.display_name = a.company
       AND NOT public.fn_entity_shared_outside_root(e.id, a.root)
  ),
  upd AS (
    UPDATE public.anew_entities e
       SET company_name = c.company
      FROM candidates c
     WHERE e.id = c.id
       AND e.company_name IS NULL
       AND e.display_name = c.display_before
    RETURNING e.id, e.display_name, e.company_name, c.display_before
  )
  SELECT count(DISTINCT upd.id),
         count(DISTINCT upd.id) FILTER (
           WHERE upd.display_name IS DISTINCT FROM upd.display_before
              OR upd.display_name IS DISTINCT FROM upd.company_name)
    INTO v_filled, v_bad
    FROM upd;

  PERFORM set_config('app.audit_bypass', '', true);

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'GUARDA: % fichas preenchidas com display_name diferente do lido ou da empresa', v_bad;
  END IF;

  RAISE NOTICE 'nome unico: % fichas com company_name preenchida; 0 display_name alterados', v_filled;
END $$;

-- 3. Gatilho da ficha ----------------------------------------------------------------
-- SECURITY DEFINER so para chamar a funcao pura (revogada a anon/authenticated);
-- nao le nem escreve nenhuma tabela, so mexe no NEW.
CREATE FUNCTION public.fn_anew_entities_display_name_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_norm text;
  v_old_comp text;
  v_new_comp text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF btrim(regexp_replace(coalesce(NEW.display_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ') = '' THEN
      NEW.display_name := coalesce(
        public.fn_entity_display_name(NEW.type, NEW.first_name, NEW.last_name, NEW.company_name),
        NEW.display_name);
    END IF;
    RETURN NEW;
  END IF;

  -- (a) display_name explicito no UPDATE: respeitado.
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    RETURN NEW;
  END IF;
  IF NEW.first_name IS NOT DISTINCT FROM OLD.first_name
     AND NEW.last_name IS NOT DISTINCT FROM OLD.last_name THEN
    RETURN NEW;
  END IF;

  -- (b) a ficha estava em sincronia?
  v_old_norm := btrim(regexp_replace(coalesce(OLD.display_name, ''), '[\s\u00a0]+', ' ', 'g'), ' ');
  v_old_comp := public.fn_entity_display_name(OLD.type, OLD.first_name, OLD.last_name, OLD.company_name);
  IF v_old_comp IS NULL OR v_old_comp <> v_old_norm THEN
    RETURN NEW;
  END IF;

  -- (c) a composicao nova difere do nome antigo?
  v_new_comp := public.fn_entity_display_name(NEW.type, NEW.first_name, NEW.last_name, NEW.company_name);
  IF v_new_comp IS NOT NULL AND v_new_comp <> v_old_norm THEN
    NEW.display_name := v_new_comp;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_anew_entities_display_name_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anew_entities_display_name_trigger() TO service_role;

CREATE TRIGGER trg_anew_entities_0_display_name
  BEFORE INSERT OR UPDATE OF first_name, last_name
  ON public.anew_entities
  FOR EACH ROW EXECUTE FUNCTION public.fn_anew_entities_display_name_trigger();

-- 4. Gatilho da lead -------------------------------------------------------------------
-- SECURITY DEFINER porque a ficha tem RLS propria; por isso as guardas entre
-- organizacoes-raiz. So escreve company_name.
CREATE FUNCTION public.fn_anew_leads_sync_entity_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company   text;
  v_old_lead  text;
  v_cur_comp  text;
  v_cur_name  text;
  v_is_new    boolean;
BEGIN
  IF NEW.entity_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  v_company := nullif(btrim(regexp_replace(
                 coalesce(public.fn_lead_company_from_field_values(NEW.field_values), ''),
                 '[\s\u00a0]+', ' ', 'g'), ' '), '');
  IF v_company IS NULL THEN
    RETURN NULL; -- sem empresa, ou vazia: nunca apaga
  END IF;

  v_is_new := TG_OP = 'INSERT' OR NEW.entity_id IS DISTINCT FROM OLD.entity_id;

  IF NOT v_is_new THEN
    v_old_lead := nullif(btrim(regexp_replace(
                    coalesce(public.fn_lead_company_from_field_values(OLD.field_values), ''),
                    '[\s\u00a0]+', ' ', 'g'), ' '), '');
    IF v_old_lead IS NOT DISTINCT FROM v_company THEN
      RETURN NULL; -- a empresa desta lead nao mudou
    END IF;
  END IF;

  SELECT e.company_name, e.display_name INTO v_cur_comp, v_cur_name
    FROM public.anew_entities e
   WHERE e.id = NEW.entity_id;
  IF NOT FOUND OR v_cur_comp IS NOT DISTINCT FROM v_company THEN
    RETURN NULL;
  END IF;

  -- Lead nova (ou ficha trocada): so preenche o que ja e verdade no nome.
  IF v_is_new AND (v_cur_comp IS NOT NULL OR v_cur_name IS DISTINCT FROM v_company) THEN
    RETURN NULL;
  END IF;

  -- Lead que ja existia: so escreve sobre uma empresa por registar, ou sobre
  -- a empresa que veio DESTA lead (a antiga). Nunca sobrescreve a empresa de
  -- um cliente com o que outro passo/formulario trouxe.
  IF NOT v_is_new AND v_cur_comp IS NOT NULL AND v_cur_comp IS DISTINCT FROM v_old_lead THEN
    RETURN NULL;
  END IF;

  IF public.fn_entity_shared_outside_root(NEW.entity_id, NEW.root_organization_id) THEN
    RETURN NULL;
  END IF;

  UPDATE public.anew_entities
     SET company_name = v_company
   WHERE id = NEW.entity_id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_anew_leads_sync_entity_company() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anew_leads_sync_entity_company() TO service_role;

CREATE TRIGGER trg_anew_leads_sync_entity_company
  AFTER INSERT OR UPDATE OF field_values, entity_id
  ON public.anew_leads
  FOR EACH ROW
  WHEN (NEW.entity_id IS NOT NULL)
  EXECUTE FUNCTION public.fn_anew_leads_sync_entity_company();

-- 5. Conferir ---------------------------------------------------------------------------
DO $$
DECLARE
  v_txt text;
BEGIN
  SELECT string_agg(t.tgname::text, ',' ORDER BY t.tgname::text COLLATE "C") INTO v_txt
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname::text = 'public' AND c.relname::text = 'anew_entities'
     AND NOT t.tgisinternal
     AND t.tgname::text IN ('trg_anew_entities_0_display_name', 'trg_anew_entities_search_text');
  IF v_txt IS DISTINCT FROM 'trg_anew_entities_0_display_name,trg_anew_entities_search_text' THEN
    RAISE EXCEPTION 'CONFERIR: gatilhos BEFORE da ficha fora de ordem ou em falta: %', coalesce(v_txt, '(nenhum)');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname::text = 'public' AND c.relname::text = 'anew_leads'
       AND t.tgname::text = 'trg_anew_leads_sync_entity_company'
  ) THEN
    RAISE EXCEPTION 'CONFERIR: trg_anew_leads_sync_entity_company em falta';
  END IF;

  SELECT string_agg(p.proname::text || '/' || p.pronargs::text || '/' || p.prosecdef::text, ','
                    ORDER BY p.proname::text COLLATE "C") INTO v_txt
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname::text = 'public'
     AND p.proname::text IN ('fn_entity_shared_outside_root', 'fn_anew_entities_display_name_trigger',
                             'fn_anew_leads_sync_entity_company')
     AND p.proconfig IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p.proconfig) AS cfg WHERE cfg LIKE 'search\_path=%');
  IF v_txt IS DISTINCT FROM 'fn_anew_entities_display_name_trigger/0/true,fn_anew_leads_sync_entity_company/0/true,fn_entity_shared_outside_root/2/false' THEN
    RAISE EXCEPTION 'CONFERIR: funcoes novas em falta, duplicadas ou sem search_path: %', coalesce(v_txt, '(nenhuma)');
  END IF;

  IF has_function_privilege('anon', 'public.fn_entity_shared_outside_root(uuid, uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_entity_shared_outside_root(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'CONFERIR: fn_entity_shared_outside_root aberta a anon/authenticated';
  END IF;
END $$;
