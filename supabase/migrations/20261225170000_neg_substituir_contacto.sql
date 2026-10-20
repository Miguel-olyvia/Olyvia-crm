-- ============================================================
-- 20261225170000_neg_substituir_contacto
-- ============================================================
-- SÓ SE APLICA COM A APROVAÇÃO DO UTILIZADOR (decisão do P7, secção 10).
-- O que faz: função NOVA neg_substituir_contacto, para o «Atualizar dados» da
--   nova lead em Pessoas: substitui o email e/ou o telefone PRINCIPAL de uma
--   pessoa numa só transacção. Uma pessoa tem um só email e um só telefone:
--   no fim fica exactamente UMA linha principal de cada tipo pedido e nenhuma
--   linha repetida com o mesmo valor; nunca se acrescenta um secundário. Os
--   secundários com outros valores ficam como estão.
--   - email: comparado em minúsculas e sem espaços nas pontas; formato
--     simples (algo@algo.algo, até 254).
--   - telefone: comparado só pelos dígitos (7 a 15); guarda-se o texto
--     escrito, aparado. Coincide com o de outra pessoa como em
--     find_entity_matches: só dígitos, mínimo 7, um é sufixo do outro.
--   - Recusa (NG019) um valor que pertença a OUTRA pessoa ligada à
--     organização, sem dizer qual. O trigger de unicidade de emails
--     (fn_trg_check_email_unique_on_email_write) levanta unique_violation com
--     ids na mensagem; é o bloco de excepção DESTA função que o apanha e o
--     converte no mesmo NG019, sem ids.
--   - Se a pessoa JÁ tem esse valor (email igual em minúsculas e sem espaços
--     nas pontas; telefone com os mesmos dígitos), não há verificação de
--     NG019 para esse valor, mesmo que outra pessoa tenha um duplicado
--     antigo: o valor já era dela. Se já é o único principal, nada muda
--     (email_mudou / telefone_mudou = false). Se existe mas como secundário ou
--     repetido, essa linha passa a ser a única principal SEM reescrever o
--     texto (assim o trigger de unicidade não volta a disparar), e as outras
--     principais e repetidas saem.
--   - Idempotente: o mesmo pedido outra vez não muda nada (mudou = false).
--   - Telefone novo: guarda o country_code do telefone principal anterior
--     (o pedido não o traz); sem principal anterior fica nulo, como
--     linkEntityPhone. Se o valor já existia na pessoa, a linha mantém o seu.
--   - Pessoa partilhada: se a entidade aparece noutra organização (ver
--     PARTILHADA abaixo), a função recusa com o NG003 genérico
--     («Pessoa indisponível.»), o mesmo de uma pessoa que não se vê: não
--     escreve em contactos que outra organização também usa.
--   Devolve {email_antes, email_depois, telefone_antes, telefone_depois,
--   email_mudou, telefone_mudou, mudou} (o principal mais recente antes e o
--   que fica depois; quem chama pode editar a pessoa, por isso já os vê).
-- PORQUE É PRECISA (políticas actuais, lidas no remoto a 19/10, iguais às
--   migrations: baseline 20260615130000 ~24600 e 20261119030000:244-300):
--   anew_entity_emails e anew_entity_phones têm INSERT com
--   is_entity_in_user_scope (basta ver a organização), UPDATE com
--   leads.edit/clients.edit no âmbito de dono, e DELETE com
--   leads.delete/clients.delete no âmbito de dono. linkEntityEmail e
--   linkEntityPhone (src/utils/entityContactSync.ts:49-96) apagam o principal
--   e depois inserem o novo, em dois pedidos: para quem não tem
--   leads.delete/clients.delete o DELETE não apaga nada e não dá erro (a RLS
--   filtra), e o INSERT acrescenta um SEGUNDO principal; e, não sendo
--   atómico, uma falha entre os dois deixa a pessoa sem contacto. Não há
--   índice único que o impeça.
-- Guardas, por esta ordem: valores (NG009); sessão; organização do
--   utilizador com pessoas.view e configuração (NG008, fn_neg_exigir_config);
--   pessoa ligada com lead ou cliente vivo (NG003, fn_neg_exigir_pessoa),
--   visível no âmbito leads.view ou clients.view (NG003) e que não é a ficha
--   de uma organização do sistema (NG003); pessoas.edit na organização e
--   âmbito de edição (leads.edit ou clients.edit) sobre a lead ou o cliente
--   (42501); entidade que aparece noutra organização (NG003; ver
--   PARTILHADA); valor de outra
--   pessoa (NG019). Mensagens genéricas.
-- Bloqueios: a linha da pessoa (anew_entities FOR NO KEY UPDATE) e, por
--   valor, um advisory lock da transacção (email: organização + email;
--   telefone: organização + últimos 7 dígitos, o que dois números que
--   coincidem por sufixo têm sempre em comum), para dois pedidos simultâneos
--   não darem o mesmo valor a duas pessoas.
--   É também recusada a entidade que é a ficha de um utilizador do sistema
--   (anew_users.entity_id, utilizador não apagado), com a mesma NG003.
-- SECURITY DEFINER, e porquê (cada privilégio):
--   - apagar e actualizar contactos da pessoa com pessoas.edit e âmbito de
--     edição, sem exigir leads.delete/clients.delete (o defeito acima);
--   - ler os emails e telefones das OUTRAS pessoas da organização para
--     recusar um valor que já é de alguém (a RLS de leitura tem âmbito de
--     dono: um comercial não veria o contacto de uma pessoa de outro, e o
--     duplicado passava). Só sai um sim/não, com mensagem genérica.
--   Dentro de DEFINER, fn_neg_exigir_config e fn_neg_exigir_pessoa correm sem
--   RLS: por isso a organização (pessoas.view) e a visibilidade da pessoa são
--   verificadas explicitamente com as chaves de âmbito (crm_scope_keys).
--   search_path fixo; EXECUTE só para authenticated.
-- Erro novo: NG019 (contacto de outra pessoa). A UI acrescenta-o a errosNeg.ts.
--   O NG019 revela que o valor já existe noutra pessoa da organização (sem
--   dizer qual): é aceite, porque o «Atualizar dados» precisa de o dizer e
--   find_entity_matches já o revela. A limitação de tentativas (rate limit)
--   fica a cargo do proxy / da camada de chamada, não desta função.
-- Só cria um objecto NOSSO. Não altera tabelas, políticas, triggers nem
--   funções partilhadas. Nada da Mudelar: sem configuração dá NG008.
-- A UI precisa de: chamar esta função no «Atualizar dados» em vez de
--   linkEntityEmail/linkEntityPhone; traduzir NG019; regenerar os tipos.
-- PARTILHADA = a entidade aparece noutra organização por QUALQUER via: ligação
--   em anew_entity_org_links, lead viva em anew_leads, cliente vivo em
--   anew_clients, ou papel vivo em anew_entity_roles (a tabela dos papéis: é
--   onde _fn_leads_creation_critical_writes, chamada por
--   rpc_create_lead_manual, grava o papel 'lead'; create_lead_entity_for_org
--   grava a ligação em anew_entity_org_links). Decisão do utilizador (20/10):
--   uma entidade por organização; alterar uma entidade numa organização nunca
--   altera o que outra vê. Contado na nike a 20/10 (só agregados, pelo CLI
--   ligado, sem RLS): 244 pessoas com lead ou cliente vivo (163 com lead, 87
--   com cliente; é o universo da página Pessoas), das quais 184 têm ligação
--   própria em anew_entity_org_links e 60 não têm; 423 entidades ligadas à
--   nike. Ficha de um utilizador do sistema (anew_users, não apagado): 29 das
--   entidades ligadas à nike, e 1 das 244 pessoas (essa passa a ser recusada).
--   Alargado a 20/10 (alinhado com 20261225160000, a mesma lista): além de
--   ligações, leads, clientes e papéis, conta uma linha noutra organização em
--   qualquer tabela com chave estrangeira entity_id para anew_entities (lido
--   em pg_constraint a 20/10: 17 tabelas, todas com organization_id):
--   anew_contacts, client_contracts, client_portal_users, contact_tags,
--   data_erasure_requests, deals, direct_sales, entity_interactions,
--   form_submissions (entity_id e conflicting_entity_id), levantamentos,
--   negocios, organization_counted_entities, proposals e quotes. Nas que têm
--   deleted_at conta só a linha viva; client_portal_users, contact_tags,
--   data_erasure_requests, entity_interactions e organization_counted_entities
--   não têm deleted_at e contam todas. anew_entity_roles não tem chave
--   estrangeira mas está coberta. Recusa com a mesma NG003 genérica. Medido na
--   nike a 20/10: 0 das 483 entidades (pessoas e entidades ligadas juntas)
--   aparecem noutra organização por qualquer destas vias (hoje a recusa não
--   muda nada; é guarda). NÃO cobertas, de propósito, as mesmas que em
--   20261225160000: tabelas com entity_id sem chave estrangeira (registos
--   técnicos ou polimórficos) e as que não têm organização.
-- NOTAS DA REVISÃO DE SEGURANÇA (20/10), aceites:
--   - o NG019 («esse contacto já é de outra pessoa») pode ser sondado em
--     volume por quem tem pessoas.edit: é um oráculo inerente à detecção de
--     duplicados e fica aceite. A UI chama a função directamente, sem proxy,
--     por isso não há limite de pedidos com dono: FICA POR TRATAR.
--   - 60 das 244 pessoas da nike não têm ligação própria em
--     anew_entity_org_links (20261225180000 liga 59 delas): o NG019 procura os
--     contactos das pessoas LIGADAS à organização e não vê os delas, e a
--     recusa por ligação não as apanha por essa via (as outras vias da
--     PARTILHADA continuam a valer).
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: as funções e triggers de que depende são os lidos no remoto a 19/10.
DO $$
DECLARE
  v_txt text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
             WHERE s.nspname = 'public' AND p.proname = 'neg_substituir_contacto') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: neg_substituir_contacto já existe; nada feito.';
  END IF;
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',     '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_tem_permissao_org(uuid,text)', '05943a6cfb0382a07322870262170c8d'),
              ('public.crm_scope_keys(text)',                '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',      '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',          '29782031244dd3b0842ca43b271e2bf1'),
              ('public.current_business_user_id()',          '7e60101f074e4ff526559140be6618bb'),
              ('public.fn_trg_check_email_unique_on_email_write()', '1766ed2f4444eb876d85e4adaf6fe20c'),
              ('public.fn_normalize_entity_email()',         'e9d004875e3716f1deea7430244cfa11')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 19/10: %; nada feito.', v_txt;
  END IF;
END;
$$;

CREATE FUNCTION public.neg_substituir_contacto(
  p_organization_id uuid,
  p_entity_id uuid,
  p_email text DEFAULT NULL,
  p_telefone text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_actor       uuid;
  v_email       text := lower(NULLIF(btrim(p_email), ''));
  v_tel         text := NULLIF(btrim(p_telefone), '');
  v_dig         text;
  v_keys_pes    text[];
  v_keys_lead   text[];
  v_keys_cli    text[];
  v_email_antes text;
  v_tel_antes   text;
  v_tel_cc      text;
  v_email_ja    boolean := false;
  v_tel_ja      boolean := false;
  v_email_mudou boolean := false;
  v_tel_mudou   boolean := false;
  v_manter      uuid;
  v_n_prim      int;
  v_n_iguais    int;
  v_n           int;
BEGIN
  -- 1. Valores
  v_dig := regexp_replace(COALESCE(v_tel, ''), '\D', '', 'g');
  IF p_organization_id IS NULL OR p_entity_id IS NULL
     OR (v_email IS NULL AND v_tel IS NULL)
     OR (v_email IS NOT NULL AND (char_length(v_email) > 254
                                  OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
     OR (v_tel IS NOT NULL AND (char_length(v_tel) > 30
                                OR v_tel !~ '^\+?[0-9 ().-]+$'
                                OR char_length(v_dig) NOT BETWEEN 7 AND 15)) THEN
    RAISE EXCEPTION 'Valor inválido: organização, pessoa, email ou telefone (7 a 15 dígitos).'
      USING ERRCODE = 'NG009';
  END IF;

  -- 2. Sessão
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := public.current_business_user_id();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Perfil de utilizador não encontrado' USING ERRCODE = 'no_data_found';
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

  -- 5b. Não escreve em contactos de uma entidade que aparece noutra organização
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

  -- 6. Bloqueios: a pessoa, depois cada valor (sempre email antes de telefone).
  PERFORM 1 FROM public.anew_entities e WHERE e.id = p_entity_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('neg_contacto_email:' || p_organization_id::text || ':' || v_email, 0));
  END IF;
  IF v_tel IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('neg_contacto_tel:' || p_organization_id::text || ':' || right(v_dig, 7), 0));
  END IF;

  -- 7. Valor de outra pessoa da organização: recusa sem dizer de quem. Um valor
  --    que a pessoa já tem não se verifica (era dela; um duplicado antigo de
  --    outra pessoa não a impede de o manter).
  IF v_email IS NOT NULL THEN
    v_email_ja := EXISTS (SELECT 1 FROM public.anew_entity_emails em
                          WHERE em.entity_id = p_entity_id AND lower(btrim(em.email)) = v_email);
  END IF;
  IF v_tel IS NOT NULL THEN
    v_tel_ja := EXISTS (SELECT 1 FROM public.anew_entity_phones ph
                        WHERE ph.entity_id = p_entity_id
                          AND regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig);
  END IF;
  IF v_email IS NOT NULL AND NOT v_email_ja AND EXISTS (
       SELECT 1 FROM public.anew_entity_emails em
       JOIN public.anew_entity_org_links lk ON lk.entity_id = em.entity_id
       WHERE lk.organization_id = p_organization_id
         AND em.entity_id <> p_entity_id
         AND lower(btrim(em.email)) = v_email) THEN
    RAISE EXCEPTION 'Contacto indisponível: pertence a outra pessoa.' USING ERRCODE = 'NG019';
  END IF;
  IF v_tel IS NOT NULL AND NOT v_tel_ja AND EXISTS (
       SELECT 1 FROM public.anew_entity_phones ph
       JOIN public.anew_entity_org_links lk ON lk.entity_id = ph.entity_id
       WHERE lk.organization_id = p_organization_id
         AND ph.entity_id <> p_entity_id
         AND char_length(regexp_replace(ph.phone_number, '\D', '', 'g')) >= 7
         AND (regexp_replace(ph.phone_number, '\D', '', 'g') LIKE '%' || v_dig
              OR v_dig LIKE '%' || regexp_replace(ph.phone_number, '\D', '', 'g'))) THEN
    RAISE EXCEPTION 'Contacto indisponível: pertence a outra pessoa.' USING ERRCODE = 'NG019';
  END IF;

  -- 8. Email: uma só linha principal, nenhuma repetida.
  SELECT em.email INTO v_email_antes
  FROM public.anew_entity_emails em
  WHERE em.entity_id = p_entity_id AND em.is_primary IS TRUE
  ORDER BY em.created_at DESC, em.id DESC
  LIMIT 1;
  IF v_email IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE em.is_primary IS TRUE),
           count(*) FILTER (WHERE lower(btrim(em.email)) = v_email)
      INTO v_n_prim, v_n_iguais
    FROM public.anew_entity_emails em
    WHERE em.entity_id = p_entity_id;
    SELECT em.id INTO v_manter
    FROM public.anew_entity_emails em
    WHERE em.entity_id = p_entity_id AND lower(btrim(em.email)) = v_email
    ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC
    LIMIT 1;

    IF NOT (v_n_prim = 1 AND v_n_iguais = 1 AND EXISTS (
              SELECT 1 FROM public.anew_entity_emails em
              WHERE em.id = v_manter AND em.is_primary IS TRUE)) THEN
      BEGIN
        DELETE FROM public.anew_entity_emails em
        WHERE em.entity_id = p_entity_id
          AND em.id IS DISTINCT FROM v_manter
          AND (em.is_primary IS TRUE OR lower(btrim(em.email)) = v_email);
        IF v_manter IS NOT NULL THEN
          -- sem reescrever o texto: o trigger de unicidade só dispara se o email mudar
          UPDATE public.anew_entity_emails em
          SET is_primary = true
          WHERE em.id = v_manter AND em.is_primary IS NOT TRUE;
        ELSE
          INSERT INTO public.anew_entity_emails (entity_id, email, email_type, is_primary, created_by)
          VALUES (p_entity_id, v_email, 'personal', true, v_actor);
        END IF;
      EXCEPTION WHEN unique_violation THEN
        -- o trigger de unicidade (também nas outras organizações da pessoa)
        RAISE EXCEPTION 'Contacto indisponível: pertence a outra pessoa.' USING ERRCODE = 'NG019';
      END;
      v_email_mudou := true;
    END IF;
  END IF;

  -- 9. Telefone: uma só linha principal, nenhuma repetida (pelos dígitos).
  v_manter := NULL;
  SELECT ph.phone_number, ph.country_code INTO v_tel_antes, v_tel_cc
  FROM public.anew_entity_phones ph
  WHERE ph.entity_id = p_entity_id AND ph.is_primary IS TRUE
  ORDER BY ph.created_at DESC, ph.id DESC
  LIMIT 1;
  IF v_tel IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE ph.is_primary IS TRUE),
           count(*) FILTER (WHERE regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig)
      INTO v_n_prim, v_n_iguais
    FROM public.anew_entity_phones ph
    WHERE ph.entity_id = p_entity_id;
    SELECT ph.id INTO v_manter
    FROM public.anew_entity_phones ph
    WHERE ph.entity_id = p_entity_id
      AND regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig
    ORDER BY ph.is_primary IS TRUE DESC, ph.created_at DESC, ph.id DESC
    LIMIT 1;

    IF NOT (v_n_prim = 1 AND v_n_iguais = 1 AND EXISTS (
              SELECT 1 FROM public.anew_entity_phones ph
              WHERE ph.id = v_manter AND ph.is_primary IS TRUE)) THEN
      DELETE FROM public.anew_entity_phones ph
      WHERE ph.entity_id = p_entity_id
        AND ph.id IS DISTINCT FROM v_manter
        AND (ph.is_primary IS TRUE
             OR regexp_replace(ph.phone_number, '\D', '', 'g') = v_dig);
      IF v_manter IS NOT NULL THEN
        UPDATE public.anew_entity_phones ph
        SET is_primary = true
        WHERE ph.id = v_manter AND ph.is_primary IS NOT TRUE;
      ELSE
        INSERT INTO public.anew_entity_phones
          (entity_id, phone_number, country_code, phone_type, is_primary, created_by)
        VALUES (p_entity_id, v_tel, v_tel_cc, 'mobile', true, v_actor);
      END IF;
      v_tel_mudou := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'email_antes', v_email_antes,
    'email_depois', (SELECT em.email FROM public.anew_entity_emails em
                     WHERE em.entity_id = p_entity_id AND em.is_primary IS TRUE
                     ORDER BY em.created_at DESC, em.id DESC LIMIT 1),
    'telefone_antes', v_tel_antes,
    'telefone_depois', (SELECT ph.phone_number FROM public.anew_entity_phones ph
                        WHERE ph.entity_id = p_entity_id AND ph.is_primary IS TRUE
                        ORDER BY ph.created_at DESC, ph.id DESC LIMIT 1),
    'email_mudou', v_email_mudou,
    'telefone_mudou', v_tel_mudou,
    'mudou', v_email_mudou OR v_tel_mudou);
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_substituir_contacto(uuid, uuid, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.neg_substituir_contacto(uuid, uuid, text, text) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. a função: uma só, DEFINER, VOLATILE, search_path fixo, só authenticated
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.neg_substituir_contacto(uuid,uuid,text,text)')
                   AND p.prosecdef AND p.provolatile::text = 'v'
                   AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
                   AND pg_get_function_result(p.oid) = 'jsonb'
                   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
                   AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS x
                                   WHERE x.grantee = 0))
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
         WHERE s.nspname = 'public' AND p.proname = 'neg_substituir_contacto') <> 1 THEN
    RAISE EXCEPTION 'CONFERIR (1. neg_substituir_contacto)';
  END IF;

  -- 2. funções chamadas e triggers dos emails, iguais (md5 lidos no remoto a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_exigir_config(uuid)',          '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',     '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_tem_permissao_org(uuid,text)', '05943a6cfb0382a07322870262170c8d'),
              ('public.crm_scope_keys(text)',                '6abb12e1d7a3db943630e8f8d7e15ca8'),
              ('public.has_anew_permission(uuid,text)',      '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.get_user_crm_org_ids(uuid)',          '29782031244dd3b0842ca43b271e2bf1'),
              ('public.current_business_user_id()',          '7e60101f074e4ff526559140be6618bb'),
              ('public.fn_trg_check_email_unique_on_email_write()', '1766ed2f4444eb876d85e4adaf6fe20c'),
              ('public.fn_normalize_entity_email()',         'e9d004875e3716f1deea7430244cfa11')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções chamadas mudaram): %', v_txt;
  END IF;
  IF (SELECT count(*) FROM pg_trigger t
      WHERE t.tgrelid = to_regclass('public.anew_entity_emails') AND NOT t.tgisinternal
        AND t.tgname::text IN ('trg_check_email_unique_on_email_write', 'trg_normalize_entity_email')
        AND t.tgenabled::text = 'O') <> 2 THEN
    RAISE EXCEPTION 'CONFERIR (2b. triggers de anew_entity_emails)';
  END IF;

  -- 3. colunas lidas e escritas, com o tipo esperado
  IF (SELECT count(*)
      FROM (VALUES
        ('anew_entity_emails', 'email', 'text'), ('anew_entity_emails', 'is_primary', 'boolean'),
        ('anew_entity_emails', 'email_type', 'text'), ('anew_entity_emails', 'created_by', 'uuid'),
        ('anew_entity_phones', 'phone_number', 'text'), ('anew_entity_phones', 'is_primary', 'boolean'),
        ('anew_entity_phones', 'phone_type', 'text'), ('anew_entity_phones', 'created_by', 'uuid'),
        ('anew_entity_phones', 'country_code', 'text'),
        ('anew_entity_org_links', 'organization_id', 'uuid'), ('anew_organizations', 'entity_id', 'uuid'),
        ('anew_leads', 'deleted_at', 'timestamp with time zone'),
        ('anew_clients', 'deleted_at', 'timestamp with time zone'),
        ('anew_entity_roles', 'entity_id', 'uuid'), ('anew_entity_roles', 'organization_id', 'uuid'),
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
                         AND format_type(a.atttypid, a.atttypmod) = e.ty) <> 56 THEN
    RAISE EXCEPTION 'CONFERIR (3. colunas lidas e escritas)';
  END IF;
  -- 4. phone_number é NOT NULL (a comparação por dígitos não usa COALESCE)
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                 WHERE a.attrelid = to_regclass('public.anew_entity_phones')
                   AND a.attname::text = 'phone_number' AND a.attnotnull) THEN
    RAISE EXCEPTION 'CONFERIR (4. anew_entity_phones.phone_number NOT NULL)';
  END IF;
END;
$$;

COMMIT;
