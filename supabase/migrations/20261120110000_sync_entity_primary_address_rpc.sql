-- ============================================================================
-- RPC: sync_entity_primary_address
--
-- Contexto: a morada de uma lead so chegava a anew_addresses/
-- anew_entity_addresses no momento da criacao (via
-- syncEntityPrimaryAddressFromLead, que corre com o client autenticado do
-- browser e nunca encadeia .select() a seguir ao insert). Qualquer edicao
-- posterior passava por linkEntityAddress (src/utils/entityContactSync.ts),
-- que faz `insert(...).select("id").single()`: a policy
-- authenticated_select_anew_addresses so mostra moradas ja ligadas a uma
-- entidade/organizacao, por isso o RETURNING de um insert acabado de fazer
-- e bloqueado por RLS (42501) e a operacao aborta. Provado no remoto, em
-- transacao revertida: o insert sozinho passa (201), o mesmo com RETURNING
-- falha (42501).
--
-- Esta funcao SECURITY DEFINER faz o insert-ou-reaproveita da morada e o
-- link/repoint a entidade numa unica transacao (a propria execucao da
-- funcao), tornando a morada orfa impossivel por construcao e contornando o
-- bloqueio de RLS no RETURNING sem abrir SELECT em anew_addresses para
-- clientes autenticados.
--
-- Isolamento por organizacao: e SECURITY DEFINER, portanto ignora RLS -- o
-- isolamento passa a ser responsabilidade explicita desta funcao. Confirma-se
-- que p_entity_id pertence de facto a p_organization_id (via anew_leads,
-- anew_contacts, anew_clients ou anew_organizations) e que o chamador tem
-- esse entity no seu scope (is_entity_in_user_scope, ja SECURITY DEFINER e
-- usada nas policies existentes) antes de escrever.
--
-- Deduplicacao: chave e lower(concat_ws('|', street, postal, city)) -- igual
-- ao address_key usado por create-lead/index.ts e por
-- create_entity_with_contacts_and_roles. Reaproveita uma morada existente
-- com a mesma chave em vez de criar outra.
--
-- Lixo: reusa a mesma lista de tokens de preenchimento ja validada em
-- src/utils/addressSanitization.ts / supabase/functions/_shared/
-- addressSanitization.ts e em create-lead/index.ts -- "-", "--", "n/a",
-- "na", "null", "none", "s/n", "sn", "0000-000", "0000", vazio.
--
-- Idempotencia: chamar duas vezes com os mesmos dados nao cria uma segunda
-- ligacao -- se ja existe um link primario activo para o mesmo address_id,
-- e um no-op; se aponta para uma morada diferente, fecha o link antigo
-- (valid_to/is_primary=false) e abre um novo, sem nunca deixar dois links
-- primarios activos em simultaneo.
--
-- Semantica de "sempre substituir": mesma filosofia ja adoptada por
-- linkEntityAddress (edicao manual = correccao deliberada, tem de mudar o
-- que os PDFs/contratos leem). Esta funcao nao faz scoring/comparacao de
-- forca entre a morada actual e a nova -- quem decide SE deve chamar (ex.:
-- nao regredir uma morada valida com dados fracos de uma lead recem-criada)
-- continua a ser a logica em syncEntityPrimaryAddressFromLead (TS), que
-- passa a usar esta funcao apenas para persistir, uma vez tomada a decisao.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_entity_primary_address(
  p_entity_id uuid,
  p_organization_id uuid,
  p_street text,
  p_postal_code text,
  p_city text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
)
RETURNS TABLE(address_id uuid, decision text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_street text;
  v_postal text;
  v_city text;
  v_district text;
  v_key text;
  v_address_id uuid;
  v_link_id uuid;
  v_link_address_id uuid;
BEGIN
  IF p_entity_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'entity_id e organization_id sao obrigatorios';
  END IF;

  -- O chamador tem de ter este entity no seu scope de visibilidade...
  IF NOT public.is_entity_in_user_scope(p_entity_id, auth.uid()) THEN
    RAISE EXCEPTION 'Entity % nao acessivel ao utilizador actual', p_entity_id;
  END IF;

  -- ...E o entity tem de pertencer de facto a organization_id indicada
  -- (nunca confiar apenas no scope agregado do chamador, que pode abranger
  -- varias organizacoes visiveis).
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_leads l
      WHERE l.entity_id = p_entity_id AND l.organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.anew_contacts c
      WHERE c.entity_id = p_entity_id AND c.organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.anew_clients cl
      WHERE cl.entity_id = p_entity_id AND cl.organization_id = p_organization_id
    UNION ALL
    SELECT 1 FROM public.anew_organizations o
      WHERE o.entity_id = p_entity_id AND o.id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Entity % nao pertence a organizacao %', p_entity_id, p_organization_id;
  END IF;

  v_street := NULLIF(btrim(COALESCE(p_street, '')), '');
  v_postal := NULLIF(btrim(COALESCE(p_postal_code, '')), '');
  v_city := NULLIF(btrim(COALESCE(p_city, '')), '');
  v_district := NULLIF(btrim(COALESCE(p_district, '')), '');

  IF v_street IS NULL OR v_postal IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'skip_no_valid_source'::text;
    RETURN;
  END IF;

  -- Lixo de preenchimento -- mesma lista de REJECTED_TOKENS do TS.
  IF lower(v_street) IN ('-', '--', 'n/a', 'na', 'null', 'none', 's/n', 'sn')
     OR lower(v_postal) IN ('-', '--', 'n/a', 'na', 'null', 'none', '0000-000', '0000')
     OR v_postal !~ '^[0-9]{4}-[0-9]{3}$'
     OR v_postal = '0000-000'
  THEN
    RETURN QUERY SELECT NULL::uuid, 'skip_filler'::text;
    RETURN;
  END IF;

  v_key := lower(concat_ws('|', v_street, v_postal, COALESCE(v_city, '')));

  -- Reaproveita morada existente com a mesma chave; senao cria.
  SELECT a.id INTO v_address_id
  FROM public.anew_addresses a
  WHERE a.address_key = v_key
  LIMIT 1;

  IF v_address_id IS NULL THEN
    INSERT INTO public.anew_addresses (
      address_key, street, number, postal_code, city, district, country, created_by
    ) VALUES (
      v_key, v_street, '', v_postal, COALESCE(v_city, ''), v_district, 'PT', p_created_by
    )
    RETURNING id INTO v_address_id;
  END IF;

  -- Link primario activo actual (se algum).
  SELECT ea.id, ea.address_id INTO v_link_id, v_link_address_id
  FROM public.anew_entity_addresses ea
  WHERE ea.entity_id = p_entity_id
    AND ea.is_primary = true
    AND ea.valid_to IS NULL
  LIMIT 1;

  IF v_link_id IS NOT NULL AND v_link_address_id = v_address_id THEN
    -- Idempotente: mesma morada ja ligada, nada a fazer.
    RETURN QUERY SELECT v_address_id, 'noop_already_linked'::text;
    RETURN;
  END IF;

  IF v_link_id IS NOT NULL THEN
    UPDATE public.anew_entity_addresses
      SET valid_to = now(), is_primary = false
      WHERE id = v_link_id;
  END IF;

  INSERT INTO public.anew_entity_addresses (
    entity_id, address_id, address_type, is_primary, created_by
  ) VALUES (
    p_entity_id, v_address_id, 'work', true, p_created_by
  );

  RETURN QUERY SELECT v_address_id, (CASE WHEN v_link_id IS NULL THEN 'inserted' ELSE 'repointed' END)::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_entity_primary_address(uuid, uuid, text, text, text, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.sync_entity_primary_address IS
  'Insere-ou-reaproveita a morada (chave lower(concat_ws(''|'', street, postal, city))) e liga-a como morada primaria da entidade, numa unica transacao. SECURITY DEFINER: valida explicitamente que a entidade pertence a organization_id indicada antes de escrever. Idempotente e sem lixo de preenchimento.';
