-- ============================================================================
-- Orçamento: morada fiscal (do cliente/lead) e morada de entrega (da obra).
--
-- O construtor de orçamentos passa a mostrar, ao escolher a lead/cliente:
--   • Morada fiscal — só leitura, é a morada principal da ENTIDADE do
--     orçamento (anew_entity_addresses ativa, não 'delivery', is_primary
--     primeiro). Uma lead e o cliente em que se converte partilham a mesma
--     entidade, por isso a morada é a mesma antes e depois da conversão. A
--     morada que a lead traz nos field_values já é copiada para a entidade
--     quando a lead é criada/editada (syncEntityPrimaryAddressFromLead →
--     sync_entity_primary_address), não se volta a ler daí.
--   • Morada de entrega — uma das moradas de entrega da entidade
--     (rpc_list_entity_delivery_addresses), gravada no orçamento.
--
-- Onde fica a de entrega: quotes.site_address_id (já existia, uuid sem FK e
-- sem uso na aplicação) passa a apontar para anew_addresses(id); e
-- quotes.obra_endereco (texto, lido pelo PDF, pela duplicação e pelas
-- Operações) passa a levar o texto formatado dessa morada, com andar e fração
-- (o mesmo formato de formatDeliveryAddress no front).
--
-- rpc_save_quote NÃO é alterada (não escreve nenhuma destas colunas): o
-- construtor chama rpc_set_quote_morada_entrega logo a seguir à gravação.
--
-- Funções novas:
--   rpc_get_morada_fiscal(p_entity_id, p_quote_id)  — leitura
--   rpc_set_quote_morada_entrega(p_quote_id, p_address_id) — escrita
-- ============================================================================

-- ─── 1. FK de quotes.site_address_id ─────────────────────────────────────────
-- NOT VALID: não verifica as linhas antigas (a coluna nunca foi escrita pela
-- aplicação; a duplicação só copia o valor de outro orçamento). ON DELETE SET
-- NULL: o texto em obra_endereco fica como registo do que foi orçamentado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotes_site_address_id_fkey'
      AND conrelid = 'public.quotes'::regclass
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_site_address_id_fkey
      FOREIGN KEY (site_address_id) REFERENCES public.anew_addresses(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotes_site_address_id
  ON public.quotes (site_address_id)
  WHERE site_address_id IS NOT NULL;

COMMENT ON COLUMN public.quotes.site_address_id IS
  'Morada de entrega/da obra do orçamento (anew_addresses.id, uma das moradas '
  'de entrega da entidade). Gravada por rpc_set_quote_morada_entrega, que '
  'também escreve o texto formatado em obra_endereco.';

-- ─── 2. Texto de uma morada (igual a formatDeliveryAddress no front) ────────
-- "Rua X, 12, 3º Esq, 1000-001 Lisboa"
CREATE OR REPLACE FUNCTION public.fn_quote_morada_texto(p_address_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT nullif(concat_ws(', ',
           nullif(btrim(a.street), ''),
           nullif(btrim(a.number), ''),
           nullif(concat_ws(' ', nullif(btrim(a.floor), ''), nullif(btrim(a.unit), '')), ''),
           nullif(concat_ws(' ', nullif(btrim(a.postal_code), ''), nullif(btrim(a.city), '')), '')
         ), '')
  FROM public.anew_addresses a
  WHERE a.id = p_address_id;
$function$;

REVOKE ALL ON FUNCTION public.fn_quote_morada_texto(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_quote_morada_texto(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_quote_morada_texto(uuid) FROM authenticated;

-- ─── 3. Leitura da morada fiscal ────────────────────────────────────────────
-- Dois modos:
--   • p_quote_id dado  → a entidade é a do orçamento (como resolve_quote_contact)
--     e a permissão é a de VER o orçamento (mesmo predicado). Serve o detalhe
--     do orçamento a quem o vê mas não é dono da lead.
--   • só p_entity_id   → permissão de ver a ficha da entidade (a mesma das
--     moradas de entrega: fn_entity_delivery_address_access 'view'). Serve o
--     construtor ao escolher a lead/cliente (orçamento ainda por gravar).
-- Sem morada → 0 linhas. Sem permissão → erro 42501.
CREATE OR REPLACE FUNCTION public.rpc_get_morada_fiscal(
  p_entity_id uuid DEFAULT NULL,
  p_quote_id  uuid DEFAULT NULL
)
RETURNS TABLE(
  entity_id         uuid,
  entity_address_id uuid,
  address_id        uuid,
  street            text,
  number            text,
  floor             text,
  unit              text,
  postal_code       text,
  city              text,
  formatted         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_entity uuid;
BEGIN
  IF p_quote_id IS NOT NULL THEN
    SELECT COALESCE(
             qt.entity_id,
             (SELECT c.entity_id FROM public.anew_clients c WHERE c.id = qt.cliente_id),
             (SELECT d.entity_id FROM public.deals d WHERE d.id = qt.deal_id),
             (SELECT al.entity_id FROM public.anew_leads al
                WHERE al.id = (SELECT d2.lead_id FROM public.deals d2 WHERE d2.id = qt.deal_id))
           )
      INTO v_entity
    FROM public.quotes qt
    WHERE qt.id = p_quote_id
      AND public.has_anew_permission(v_uid, 'quotes.view')
      AND qt.organization_id IN (SELECT public.get_user_crm_org_ids(v_uid));

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sem permissão para ver este orçamento' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    IF p_entity_id IS NULL THEN
      RAISE EXCEPTION 'entity_id ou quote_id é obrigatório' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.fn_entity_delivery_address_access(p_entity_id, 'view') THEN
      RAISE EXCEPTION 'Sem permissão para ver as moradas deste cliente' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_entity := p_entity_id;
  END IF;

  IF v_entity IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_entity,
    ea.id,
    a.id,
    a.street,
    a.number,
    a.floor,
    a.unit,
    a.postal_code,
    a.city,
    public.fn_quote_morada_texto(a.id)
  FROM public.anew_entity_addresses ea
  JOIN public.anew_addresses a ON a.id = ea.address_id
  WHERE ea.entity_id = v_entity
    AND coalesce(ea.address_type, '') <> 'delivery'
    AND (ea.valid_to IS NULL OR ea.valid_to > now())
  ORDER BY ea.is_primary DESC NULLS LAST, ea.is_fiscal DESC NULLS LAST, ea.created_at, ea.id
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_morada_fiscal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_morada_fiscal(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_morada_fiscal(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_get_morada_fiscal(uuid, uuid) IS
  'Morada fiscal (principal) da entidade de um orçamento ou de uma lead/cliente. '
  'Com p_quote_id: permissão de ver o orçamento. Só com p_entity_id: permissão '
  'de ver a ficha (fn_entity_delivery_address_access view).';

-- ─── 4. Gravar a morada de entrega no orçamento ─────────────────────────────
-- p_address_id = anew_addresses.id de uma morada de entrega ATIVA da entidade
-- do orçamento (ou a que o orçamento já tem, mesmo que entretanto tenha sido
-- removida/editada na ficha — não se perde a morada orçamentada ao regravar).
-- NULL limpa site_address_id e obra_endereco.
-- Permissão: a mesma da política quotes_update_policy (20261119090000):
-- organização CRM do utilizador, quotes.edit e âmbito de dono (quotes.view).
CREATE OR REPLACE FUNCTION public.rpc_set_quote_morada_entrega(
  p_quote_id   uuid,
  p_address_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_quote  public.quotes;
  v_entity uuid;
  v_texto  text;
BEGIN
  IF p_quote_id IS NULL THEN
    RAISE EXCEPTION 'quote_id é obrigatório' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_quote FROM public.quotes q WHERE q.id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR v_quote.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Orçamento não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_uid IS NULL
     OR v_quote.organization_id IS NULL
     OR v_quote.organization_id NOT IN (SELECT public.get_user_crm_org_ids(v_uid))
     OR NOT public.has_anew_permission(v_uid, 'quotes.edit')
     OR NOT EXISTS (
       SELECT 1 FROM unnest((SELECT public.crm_scope_keys('quotes.view'::text))) AS k(scope_key)
       WHERE k.scope_key = v_quote.organization_id::text || ':*'
          OR k.scope_key = v_quote.organization_id::text || ':' || v_quote.assigned_to::text
          OR k.scope_key = v_quote.organization_id::text || ':' || v_quote.created_by::text
     ) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este orçamento' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_address_id IS NULL THEN
    UPDATE public.quotes
       SET site_address_id = NULL,
           obra_endereco   = NULL
     WHERE id = p_quote_id;
    RETURN jsonb_build_object('quote_id', p_quote_id, 'site_address_id', NULL, 'obra_endereco', NULL);
  END IF;

  v_entity := COALESCE(
    v_quote.entity_id,
    (SELECT c.entity_id FROM public.anew_clients c WHERE c.id = v_quote.cliente_id),
    (SELECT d.entity_id FROM public.deals d WHERE d.id = v_quote.deal_id)
  );

  IF p_address_id IS DISTINCT FROM v_quote.site_address_id THEN
    IF v_entity IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.anew_entity_addresses ea
      WHERE ea.entity_id = v_entity
        AND ea.address_id = p_address_id
        AND ea.address_type = 'delivery'
        AND (ea.valid_to IS NULL OR ea.valid_to > now())
    ) THEN
      RAISE EXCEPTION 'A morada de entrega não pertence ao cliente deste orçamento' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_texto := left(public.fn_quote_morada_texto(p_address_id), 500);

  UPDATE public.quotes
     SET site_address_id = p_address_id,
         obra_endereco   = v_texto
   WHERE id = p_quote_id;

  RETURN jsonb_build_object('quote_id', p_quote_id, 'site_address_id', p_address_id, 'obra_endereco', v_texto);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_set_quote_morada_entrega(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_set_quote_morada_entrega(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_quote_morada_entrega(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_set_quote_morada_entrega(uuid, uuid) IS
  'Grava a morada de entrega de um orçamento: site_address_id (anew_addresses) '
  'e obra_endereco (texto formatado com andar e fração). A morada tem de ser '
  'uma morada de entrega ativa da entidade do orçamento. NULL limpa as duas.';
