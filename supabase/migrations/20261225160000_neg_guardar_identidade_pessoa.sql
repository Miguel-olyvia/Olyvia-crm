-- ============================================================
-- 20261225160000_neg_guardar_identidade_pessoa
-- ============================================================
-- O que faz: função NOVA neg_guardar_identidade_pessoa, para a página Pessoas
--   guardar o TIPO da entidade (person | organization) e o NOME DA EMPRESA de
--   uma pessoa, também quando ela é só lead (rpc_update_client, o modelo, só
--   serve clientes e pede clients.edit).
--   Decisão do utilizador (19/10, opção A): esta função NÃO toca no NIF. O NIF
--   continua a gravar-se como hoje, nos clientes (rpc_update_client pelo
--   nif-write-proxy); um desenho próprio tratará dele mais tarde. Por isso não
--   há parâmetros de NIF, nem leitura ou escrita de fiscal_entities,
--   anew_entity_fiscal_entities ou fiscal_entity_nif_tokens.
--   Parâmetros:
--     p_tipo          'person' | 'organization'; NULL mantém o actual.
--     p_nome_empresa  só com tipo organization; passa a ser o nome da entidade
--                     (display_name = nome da empresa, first_name e last_name
--                     a NULL), como o separador «Empresa» de Clientes
--                     (AnewClients.tsx:1416-1424; ClientDetailsDialog.tsx:1335-1344
--                     e rpc_update_client). NULL mantém o nome de uma
--                     empresa. Mudar para organization sem nome dá NG009; um
--                     nome de empresa com tipo person dá NG009. Até 200
--                     caracteres, sem caracteres de controlo.
--     p_nome_proprio, p_apelido  só com tipo person. Ao passar de organization
--                     para person são OBRIGATÓRIOS os dois (como o separador
--                     «Pessoa» de Clientes, «Nome *» e «Apelido *») e repõem o
--                     nome: first_name e last_name normalizados e display_name
--                     composto, com as mesmas regras de
--                     src/utils/composeDisplayName.ts (normalizeFirstLast e
--                     composeDisplayName: aparar, juntar espaços, desdobrar
--                     «Ana Silva»/«Ana Silva», não repetir o nome). Numa pessoa
--                     que já é pessoa, ou vêm os dois (muda o nome) ou nenhum
--                     (mantém). Até 100 caracteres cada, sem caracteres de
--                     controlo. Com tipo organization dão NG009.
--   Idempotente: repetir o mesmo pedido não escreve nada (mudou = false).
--   Devolve {tipo, nome, empresa_nome, mudou} (empresa_nome só numa empresa). Se ter NIF interessa, a ficha
--   (neg_ficha_pessoa, pessoa.tem_nif) já o diz, só em leitura.
-- Guardas, por esta ordem: valores (NG009); sessão (42501); organização do
--   utilizador com pessoas.view e configuração (NG008, fn_neg_exigir_config);
--   pessoa ligada à organização com lead ou cliente vivo (NG003,
--   fn_neg_exigir_pessoa), visível no âmbito leads.view ou clients.view
--   (NG003) e que não é a ficha de uma organização do sistema
--   (anew_organizations, NG003); pessoas.edit na organização e âmbito de
--   edição (leads.edit ou clients.edit) sobre a lead ou o cliente (42501);
--   entidade que aparece noutra organização (NG003; ver PARTILHADA).
--   Mensagens genéricas: «não existe», «não se vê» e «é partilhada» dão a
--   mesma resposta NG003 «Pessoa indisponível.».
-- PESSOA PARTILHADA: o tipo e o nome pertencem à entidade, não à organização.
--   Uma entidade que aparece noutra organização é recusada: mudar-lhe o nome
--   mudava o que a outra organização vê. O critério é o de
--   neg_substituir_contacto (20261225170000) ALARGADO às tabelas com chave
--   estrangeira para anew_entities (ver PARTILHADA). Na nike, a 19/10,
--   nenhuma entidade está ligada a outra organização (lido no remoto).
--   É também recusada a entidade que é a ficha de um utilizador do sistema
--   (anew_users.entity_id, utilizador não apagado), com a mesma NG003.
-- RENOMEAR UMA PESSOA com cliente (ou mudar o tipo) dispara os triggers de
--   anew_entities que sincronizam o search_text em anew_leads, anew_clients e
--   quotes; isso actualiza o updated_at do cliente, e na ordem «recentes» da
--   Lista (cand_clientes ordena por COALESCE(updated_at, created_at)) a pessoa
--   sobe para o topo. Aceite (revisão de 20/10).
-- SECURITY DEFINER, e porquê (o único privilégio que continua a ser preciso):
--   - a recusa de entidade partilhada tem de ver as ligações a organizações
--     que quem chama NÃO vê: a política de anew_entity_org_links só mostra
--     organizações visíveis (get_user_visible_org_ids). Em INVOKER, uma
--     entidade ligada a uma organização invisível passava como «só desta» e
--     o nome mudava também lá. A pergunta devolve só sim ou não, com a mesma
--     NG003 genérica.
--   Os privilégios que a versão com NIF pedia (tokens do NIF, entidades
--   fiscais de outras organizações) deixaram de existir com a opção A.
--   Dentro de DEFINER, fn_neg_exigir_config e fn_neg_exigir_pessoa correm sem
--   RLS: por isso a organização (pessoas.view) e a visibilidade da pessoa são
--   verificadas explicitamente com as chaves de âmbito (crm_scope_keys), e a
--   edição com as chaves de edição, como em neg_substituir_contacto. A
--   escrita é UMA actualização de anew_entities, da pessoa já verificada; os
--   triggers da tabela (search_text e a auditoria fn_generic_entity_audit)
--   correm como sempre. search_path fixo; EXECUTE só para authenticated.
-- Só cria um objecto NOSSO. Não altera tabelas, políticas, triggers nem
--   funções partilhadas (rpc_update_client fica como está). Nada da Mudelar:
--   sem configuração dá NG008 (só a nike tem linha em negocio_workflow_config).
-- A UI precisa de: chamar directamente (supabase.rpc), sem o nif-write-proxy.
--   Regenerar os tipos.
-- PARTILHADA = a entidade aparece noutra organização por QUALQUER via: ligação
--   em anew_entity_org_links, lead viva em anew_leads, cliente vivo em
--   anew_clients, ou papel vivo em anew_entity_roles (a tabela dos papéis: é
--   onde _fn_leads_creation_critical_writes, chamada por
--   rpc_create_lead_manual, grava o papel 'lead'; create_lead_entity_for_org
--   grava a ligação em anew_entity_org_links). Decisão do utilizador (20/10):
--   uma entidade por organização; alterar uma entidade numa organização nunca
--   altera o que outra vê. Contado na nike a 20/10 (só agregados, pelo CLI
--   ligado, sem RLS): 243 pessoas com lead ou cliente vivo (162 com lead, 87
--   com cliente; é o universo da página Pessoas), das quais 183 têm ligação
--   própria em anew_entity_org_links e 60 não têm; 422 entidades ligadas à
--   nike. Pessoas e entidades ligadas juntas: 0 aparecem noutra organização
--   por qualquer via. Ficha de um utilizador do sistema (anew_users): 30 das
--   entidades da nike, das quais 1 é também uma das 243 pessoas (essa passa a
--   ser recusada).
--   Alargado a 20/10 (revisão final): lido em pg_constraint, além de ligações,
--   leads e clientes, têm chave estrangeira entity_id para anew_entities, todas
--   com organization_id: anew_contacts, client_contracts, client_portal_users,
--   contact_tags, data_erasure_requests, deals, direct_sales,
--   entity_interactions, form_submissions (entity_id e conflicting_entity_id),
--   levantamentos, negocios, organization_counted_entities, proposals e quotes.
--   Todas mostram (ou contam) a entidade na sua organização, por isso uma linha
--   noutra organização torna-a PARTILHADA; nas que têm deleted_at conta só a
--   linha viva, como em leads e clientes. Medido na nike a 20/10: 0 das 244
--   pessoas e 0 das 483 entidades ligadas ou pessoas aparecem noutra
--   organização em qualquer destas tabelas (a recusa não muda nada hoje; é
--   guarda). Custo: são tabelas pequenas (a maior, entity_interactions, ~21 mil
--   linhas) e todas têm índice por entity_id salvo client_portal_users e
--   organization_counted_entities (<1000 linhas); a função corre num clique.
--   anew_entity_roles não tem chave estrangeira mas já está coberta.
--   NÃO cobertas, de propósito: tabelas com entity_id sem chave estrangeira para
--   anew_entities e que são registos técnicos ou polimórficos (email_logs,
--   sms_logs, scheduled_emails, scheduled_sms, notifications, documents,
--   client_portal_documents, entity_audit_log, fleet_activity_log,
--   _migration_contacts_to_leads_map), e as que não têm organização
--   (emails, telefones, moradas, relações, histórico da entidade).
--   neg_substituir_contacto (20261225170000) usa este mesmo critério alargado
--   (a mesma lista de tabelas), e 20261225180000 também o usa nas candidatas.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: as funções chamadas são as lidas no remoto a 19/10, e esta ainda não existe.
DO $$
DECLARE
  v_txt text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
             WHERE s.nspname = 'public' AND p.proname = 'neg_guardar_identidade_pessoa') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_guardar_identidade_pessoa já existe; nada feito.';
  END IF;
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',     '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_tem_permissao_org(uuid,text)', '05943a6cfb0382a07322870262170c8d'),
              ('public.crm_scope_keys(text)',                '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',      '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',          '29782031244dd3b0842ca43b271e2bf1')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 19/10: %; nada feito.', v_txt;
  END IF;
END;
$$;

CREATE FUNCTION public.neg_guardar_identidade_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_tipo text DEFAULT NULL,
  p_nome_empresa text DEFAULT NULL,
  p_nome_proprio text DEFAULT NULL,
  p_apelido text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_nome       text := NULLIF(btrim(p_nome_empresa), '');
  v_keys_pes   text[];
  v_keys_lead  text[];
  v_keys_cli   text[];
  v_ent        public.anew_entities;
  v_tipo       text;
  v_mudou      boolean := false;
  -- como .trim().replace(/\s+/g, " ") do ecrã: primeiro junta todo o espaço
  -- (tabulações, quebras de linha e o espaço inseparável U+00A0, que o \s do
  -- Postgres também apanha), depois apara.
  v_f          text := NULLIF(btrim(regexp_replace(p_nome_proprio, '\s+', ' ', 'g')), '');
  v_l          text := NULLIF(btrim(regexp_replace(p_apelido, '\s+', ' ', 'g')), '');
  v_disp       text;
  v_first      text;
  v_last       text;
BEGIN
  -- 1. Valores
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR (p_tipo IS NOT NULL AND p_tipo NOT IN ('person', 'organization'))
     OR char_length(v_nome) > 200
     OR v_nome ~ '[[:cntrl:]]'
     OR char_length(v_f) > 100 OR char_length(v_l) > 100
     OR v_f ~ '[[:cntrl:]]' OR v_l ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Valor inválido: organização, pessoa, tipo, nome da empresa (até 200 caracteres) ou nome e apelido (até 100).'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. Organização do utilizador, com pessoas.view e com configuração (D1).
  v_keys_pes := public.crm_scope_keys('pessoas.view');
  IF NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT public.has_anew_permission(v_uid, 'pessoas.view')
     OR NOT EXISTS (SELECT 1 FROM unnest(v_keys_pes) AS k(scope_key)
                    WHERE starts_with(k.scope_key, p_organization_id::text || ':')) THEN
    RAISE EXCEPTION 'Organização sem a página Pessoas activa.' USING ERRCODE = 'NG008';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);

  -- 4. Pessoa ligada, com lead ou cliente vivo, visível no âmbito de leitura,
  --    e que não é a ficha de uma organização do sistema.
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  v_keys_lead := CASE WHEN public.has_anew_permission(v_uid, 'leads.view')
                      THEN public.crm_scope_keys('leads.view') ELSE ARRAY[]::text[] END;
  v_keys_cli  := CASE WHEN public.has_anew_permission(v_uid, 'clients.view')
                      THEN public.crm_scope_keys('clients.view') ELSE ARRAY[]::text[] END;
  IF NOT (EXISTS (SELECT 1 FROM public.anew_leads l
                  WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                    AND l.deleted_at IS NULL
                    AND (l.organization_id::text || ':*' = ANY (v_keys_lead)
                         OR l.organization_id::text || ':' || l.assigned_to::text = ANY (v_keys_lead)
                         OR l.organization_id::text || ':' || l.created_by::text = ANY (v_keys_lead)))
          OR EXISTS (SELECT 1 FROM public.anew_clients c
                     WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
                       AND c.deleted_at IS NULL
                       AND (c.organization_id::text || ':*' = ANY (v_keys_cli)
                            OR c.organization_id::text || ':' || c.assigned_to::text = ANY (v_keys_cli)
                            OR c.organization_id::text || ':' || c.created_by::text = ANY (v_keys_cli))))
     OR EXISTS (SELECT 1 FROM public.anew_organizations o WHERE o.entity_id = p_entity_id) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 5. Editar: pessoas.edit na organização e âmbito de edição sobre a lead ou o cliente.
  v_keys_lead := CASE WHEN public.has_anew_permission(v_uid, 'leads.edit')
                      THEN public.crm_scope_keys('leads.edit') ELSE ARRAY[]::text[] END;
  v_keys_cli  := CASE WHEN public.has_anew_permission(v_uid, 'clients.edit')
                      THEN public.crm_scope_keys('clients.edit') ELSE ARRAY[]::text[] END;
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit')
     OR NOT (EXISTS (SELECT 1 FROM public.anew_leads l
                     WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                       AND l.deleted_at IS NULL
                       AND (l.organization_id::text || ':*' = ANY (v_keys_lead)
                            OR l.organization_id::text || ':' || l.assigned_to::text = ANY (v_keys_lead)
                            OR l.organization_id::text || ':' || l.created_by::text = ANY (v_keys_lead)))
             OR EXISTS (SELECT 1 FROM public.anew_clients c
                        WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
                          AND c.deleted_at IS NULL
                          AND (c.organization_id::text || ':*' = ANY (v_keys_cli)
                               OR c.organization_id::text || ':' || c.assigned_to::text = ANY (v_keys_cli)
                               OR c.organization_id::text || ':' || c.created_by::text = ANY (v_keys_cli)))) THEN
    RAISE EXCEPTION 'Sem permissão para editar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 5b. Não muda o tipo nem o nome de uma entidade que aparece noutra organização
  --     (ligação, lead viva, cliente vivo, papel vivo, ou linha viva de uma tabela
  --     com chave estrangeira para anew_entities; ver PARTILHADA).
  IF EXISTS (SELECT 1 FROM public.anew_entity_org_links lk
             WHERE lk.entity_id = p_entity_id AND lk.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.anew_leads l
                WHERE l.entity_id = p_entity_id AND l.organization_id <> p_organization_id
                  AND l.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_clients c
                WHERE c.entity_id = p_entity_id AND c.organization_id <> p_organization_id
                  AND c.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_entity_roles er
                WHERE er.entity_id = p_entity_id AND er.organization_id <> p_organization_id
                  AND er.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.anew_contacts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_contracts t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.client_portal_users t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.contact_tags t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.data_erasure_requests t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.deals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.direct_sales t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.entity_interactions t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.form_submissions t
                WHERE (t.entity_id = p_entity_id OR t.conflicting_entity_id = p_entity_id)
                  AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.levantamentos t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.negocios t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.organization_counted_entities t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id)
     OR EXISTS (SELECT 1 FROM public.proposals t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.quotes t
                WHERE t.entity_id = p_entity_id AND t.organization_id <> p_organization_id
                  AND t.deleted_at IS NULL)
     -- a ficha de um utilizador do sistema não é uma pessoa da página
     OR EXISTS (SELECT 1 FROM public.anew_users u
                WHERE u.entity_id = p_entity_id AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 6. Bloqueio: uma alteração de cada vez por pessoa.
  SELECT e.* INTO v_ent FROM public.anew_entities e WHERE e.id = p_entity_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  -- 7. Tipo e nome (só escreve se alguma coisa muda).
  v_tipo := COALESCE(p_tipo, v_ent.type);
  IF v_tipo = 'organization' THEN
    -- Empresa: o nome visível é o da empresa; nome próprio e apelido a NULL.
    IF v_f IS NOT NULL OR v_l IS NOT NULL
       OR (v_ent.type IS DISTINCT FROM 'organization' AND v_nome IS NULL) THEN
      RAISE EXCEPTION 'Valor inválido: uma empresa tem só o nome da empresa (obrigatório ao mudar para empresa).'
        USING ERRCODE = 'NG009';
    END IF;
    v_disp  := COALESCE(v_nome, v_ent.display_name);
    v_first := NULL;
    v_last  := NULL;
  ELSE
    -- Pessoa: nome próprio e apelido (os dois, ou nenhum se já era pessoa).
    IF v_nome IS NOT NULL
       OR ((v_f IS NULL) <> (v_l IS NULL))
       OR (v_ent.type IS DISTINCT FROM 'person' AND (v_f IS NULL OR v_l IS NULL)) THEN
      RAISE EXCEPTION 'Valor inválido: uma pessoa tem nome próprio e apelido (obrigatórios ao mudar para pessoa).'
        USING ERRCODE = 'NG009';
    END IF;
    IF v_f IS NULL THEN
      v_disp  := v_ent.display_name;
      v_first := v_ent.first_name;
      v_last  := v_ent.last_name;
    ELSE
      -- normalizeFirstLast (src/utils/composeDisplayName.ts:19-30)
      IF lower(v_f) = lower(v_l) AND position(' ' IN v_f) > 0 THEN
        v_first := split_part(v_f, ' ', 1);
        v_last  := substr(v_f, position(' ' IN v_f) + 1);
      ELSE
        v_first := v_f;
        v_last  := v_l;
      END IF;
      -- composeDisplayName (src/utils/composeDisplayName.ts:8-17)
      v_disp := CASE
        WHEN v_first IS NULL THEN COALESCE(v_last, '')
        WHEN v_last IS NULL THEN v_first
        WHEN lower(v_first) = lower(v_last) THEN v_first
        WHEN starts_with(lower(v_last), lower(v_first) || ' ') THEN v_last
        WHEN right(lower(v_first), char_length(v_last) + 1) = ' ' || lower(v_last) THEN v_first
        ELSE v_first || ' ' || v_last
      END;
    END IF;
  END IF;
  IF v_tipo IS DISTINCT FROM v_ent.type
     OR v_disp IS DISTINCT FROM v_ent.display_name
     OR v_first IS DISTINCT FROM v_ent.first_name
     OR v_last IS DISTINCT FROM v_ent.last_name THEN
    UPDATE public.anew_entities e
    SET type         = v_tipo,
        display_name = v_disp,
        first_name   = v_first,
        last_name    = v_last,
        updated_at   = now()
    WHERE e.id = p_entity_id;
    v_mudou := true;
  END IF;

  RETURN jsonb_build_object(
    'tipo', v_tipo,
    'nome', v_disp,
    'empresa_nome', CASE WHEN v_tipo = 'organization' THEN v_disp END,
    'mudou', v_mudou);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_guardar_identidade_pessoa(uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.neg_guardar_identidade_pessoa(uuid, uuid, text, text, text, text)
  TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. a função: uma só, DEFINER, VOLATILE, search_path fixo, só authenticated
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.neg_guardar_identidade_pessoa(uuid,uuid,text,text,text,text)')
                   AND p.prosecdef AND p.provolatile::text = 'v'
                   AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
                   AND pg_get_function_result(p.oid) = 'jsonb'
                   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
                   AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS x
                                   WHERE x.grantee = 0)
                   AND p.prosrc NOT LIKE '%fiscal%' AND p.prosrc NOT LIKE '%nif%')
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
         WHERE s.nspname = 'public' AND p.proname = 'neg_guardar_identidade_pessoa') <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (1. neg_guardar_identidade_pessoa)';
  END IF;

  -- 2. funções chamadas, iguais (md5 lidos no remoto a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',     '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_tem_permissao_org(uuid,text)', '05943a6cfb0382a07322870262170c8d'),
              ('public.crm_scope_keys(text)',                '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',      '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',          '29782031244dd3b0842ca43b271e2bf1')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções chamadas mudaram): %', v_txt;
  END IF;

  -- 3. as colunas lidas e escritas, com o tipo esperado
  IF (SELECT count(*)
      FROM (VALUES
        ('anew_entities', 'type', 'text'), ('anew_entities', 'display_name', 'text'),
        ('anew_entities', 'first_name', 'text'), ('anew_entities', 'last_name', 'text'),
        ('anew_entities', 'updated_at', 'timestamp with time zone'),
        ('anew_entity_org_links', 'entity_id', 'uuid'),
        ('anew_entity_org_links', 'organization_id', 'uuid'),
        ('anew_organizations', 'entity_id', 'uuid'),
        ('anew_leads', 'deleted_at', 'timestamp with time zone'),
        ('anew_clients', 'deleted_at', 'timestamp with time zone'),
        ('anew_entity_roles', 'entity_id', 'uuid'),
        ('anew_entity_roles', 'organization_id', 'uuid'),
        ('anew_entity_roles', 'deleted_at', 'timestamp with time zone'),
        ('anew_users', 'entity_id', 'uuid'),
        ('anew_users', 'deleted_at', 'timestamp with time zone'),
        -- 5b alargado: 38 colunas das tabelas com chave estrangeira para anew_entities
        ('anew_contacts', 'entity_id', 'uuid'), ('anew_contacts', 'organization_id', 'uuid'),
        ('anew_contacts', 'deleted_at', 'timestamp with time zone'),
        ('client_contracts', 'entity_id', 'uuid'), ('client_contracts', 'organization_id', 'uuid'),
        ('client_contracts', 'deleted_at', 'timestamp with time zone'),
        ('client_portal_users', 'entity_id', 'uuid'), ('client_portal_users', 'organization_id', 'uuid'),
        ('contact_tags', 'entity_id', 'uuid'), ('contact_tags', 'organization_id', 'uuid'),
        ('data_erasure_requests', 'entity_id', 'uuid'), ('data_erasure_requests', 'organization_id', 'uuid'),
        ('deals', 'entity_id', 'uuid'), ('deals', 'organization_id', 'uuid'),
        ('deals', 'deleted_at', 'timestamp with time zone'),
        ('direct_sales', 'entity_id', 'uuid'), ('direct_sales', 'organization_id', 'uuid'),
        ('direct_sales', 'deleted_at', 'timestamp with time zone'),
        ('entity_interactions', 'entity_id', 'uuid'), ('entity_interactions', 'organization_id', 'uuid'),
        ('form_submissions', 'entity_id', 'uuid'), ('form_submissions', 'conflicting_entity_id', 'uuid'),
        ('form_submissions', 'organization_id', 'uuid'),
        ('form_submissions', 'deleted_at', 'timestamp with time zone'),
        ('levantamentos', 'entity_id', 'uuid'), ('levantamentos', 'organization_id', 'uuid'),
        ('levantamentos', 'deleted_at', 'timestamp with time zone'),
        ('negocios', 'entity_id', 'uuid'), ('negocios', 'organization_id', 'uuid'),
        ('negocios', 'deleted_at', 'timestamp with time zone'),
        ('organization_counted_entities', 'entity_id', 'uuid'),
        ('organization_counted_entities', 'organization_id', 'uuid'),
        ('proposals', 'entity_id', 'uuid'), ('proposals', 'organization_id', 'uuid'),
        ('proposals', 'deleted_at', 'timestamp with time zone'),
        ('quotes', 'entity_id', 'uuid'), ('quotes', 'organization_id', 'uuid'),
        ('quotes', 'deleted_at', 'timestamp with time zone')
      ) AS e(t, c, ty)
      JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.t)
                         AND a.attname::text = e.c AND NOT a.attisdropped
                         AND format_type(a.atttypid, a.atttypmod) = e.ty) <> 53 THEN
    RAISE EXCEPTION 'CONFERIR (3. colunas)';
  END IF;
END;
$$;

COMMIT;
