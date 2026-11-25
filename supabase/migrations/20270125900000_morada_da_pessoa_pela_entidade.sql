-- ============================================================================
-- sync_entity_primary_address: a pessoa e da organizacao pela propria entidade
--
-- Visto no testarh a 20/11 (negocio 1015 da Mudelar, org 3242e925-...): uma
-- pessoa criada pelo cartao «Novo negocio» da pagina /negocios (o mesmo
-- caminho da «Nova lead» de Pessoas, gravarNovaLead) e so uma linha em
-- anew_entities com organization_id. Desde 20261228200000 (1.6) a lead e a
-- propria entidade: ja nao ha linha em anew_leads, anew_contacts nem
-- anew_clients. A «Morada de quem pede» chamava esta funcao e ela recusava com
-- «Entity ... nao pertence a organizacao ...», porque so procurava a pertenca
-- nessas tabelas antigas. A mesma recusa acontecia, calada, na morada da
-- «Nova lead» (depoisNovaLead.ts, melhor esforco).
--
-- Muda so a verificacao de pertenca (o resto do corpo e o de
-- 20261113290000, igual): passa a aceitar tambem
--   * a entidade viva desta organizacao (anew_entities.organization_id,
--     deleted_at nulo), o criterio da 1.6 (fn_neg_exigir_pessoa,
--     neg_substituir_contacto);
--   * a ligacao em anew_entity_org_links, como resolve_proposal_address e
--     resolve_quote_address (20261227100000) ja aceitam.
-- O ambito do chamador continua a ser exigido antes (is_entity_in_user_scope,
-- que ja tem o ramo pela organizacao da entidade desde 20261228200000).
--
-- Mesma assinatura, SECURITY DEFINER, search_path, GRANT e comentario.
-- Reverter: correr de novo o CREATE OR REPLACE de 20261113290000.
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
  -- varias organizacoes visiveis). 20270125900000: tambem pela propria
  -- entidade (a lead e a entidade, 1.6) e pela ligacao em anew_entity_org_links.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_entities e
      WHERE e.id = p_entity_id AND e.organization_id = p_organization_id
        AND e.deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM public.anew_entity_org_links ol
      WHERE ol.entity_id = p_entity_id AND ol.organization_id = p_organization_id
    UNION ALL
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
  'Insere-ou-reaproveita a morada (chave lower(concat_ws(''|'', street, postal, city))) e liga-a como morada primaria da entidade, numa unica transacao. SECURITY DEFINER: valida explicitamente que a entidade pertence a organization_id indicada (pela propria entidade viva, por anew_entity_org_links, lead, contacto, cliente ou organizacao; 20270125900000) antes de escrever. Idempotente e sem lixo de preenchimento.';
