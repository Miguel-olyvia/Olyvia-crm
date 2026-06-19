-- client_contracts.created_by stores public.anew_users.id, not auth.users.id.
-- Keep organization and permission checks intact while aligning the identity
-- comparison with the business-user boundary used by the application.

DROP POLICY IF EXISTS client_contracts_insert ON public.client_contracts;

CREATE POLICY client_contracts_insert
ON public.client_contracts
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = public.current_business_user_id()
  AND organization_id IN (
    SELECT public.get_user_visible_org_ids((SELECT auth.uid()))
  )
  AND public.has_anew_permission(
    (SELECT auth.uid()),
    'client_contracts.create'
  )
);

-- The contract number is globally unique. The previous invoker-security
-- function calculated MAX() through the caller's RLS visibility, so an
-- organization with no visible contracts could regenerate CC-YYYY-0001.
-- SECURITY DEFINER makes the global sequence calculation consistent, while
-- the transaction-level advisory lock prevents concurrent duplicate numbers.
CREATE OR REPLACE FUNCTION public.generate_client_contract_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  year_part text;
  sequence_num integer;
BEGIN
  year_part := EXTRACT(YEAR FROM CURRENT_DATE)::text;

  PERFORM pg_advisory_xact_lock(
    hashtext('client_contracts_number_' || year_part)
  );

  SELECT COALESCE(MAX(
    CASE
      WHEN contract_number ~ '^CC-[0-9]{4}-[0-9]+$'
      THEN (regexp_match(
        contract_number,
        '^CC-[0-9]{4}-([0-9]+)$'
      ))[1]::integer
      ELSE 0
    END
  ), 0) + 1
  INTO sequence_num
  FROM public.client_contracts
  WHERE contract_number LIKE 'CC-' || year_part || '-%';

  RETURN 'CC-' || year_part || '-' || lpad(sequence_num::text, 4, '0');
END;
$function$;
