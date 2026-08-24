-- Reconciliação de histórico: esta migration já estava aplicada na BD remota
-- (aplicada diretamente, fora deste repositório local — o ficheiro nunca
-- tinha chegado a existir aqui) quando se detetou o desfasamento ao tentar
-- fazer push do fix de sincronização de proposals.value. Reconstruída
-- byte-a-byte a partir de `pg_get_functiondef` sobre a função já existente no
-- remoto, apenas para o histórico local voltar a corresponder ao remoto.
-- CREATE OR REPLACE é idempotente — não tem qualquer efeito adicional.
CREATE OR REPLACE FUNCTION public.get_entity_contact_summary(_entity_ids uuid[])
 RETURNS TABLE(entity_id uuid, display_name text, email text, phone_number text, last_interaction_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    e.id AS entity_id,
    e.display_name,
    (
      SELECT em.email
      FROM public.anew_entity_emails em
      WHERE em.entity_id = e.id
        AND em.is_primary = true
      LIMIT 1
    ) AS email,
    (
      SELECT ph.phone_number
      FROM public.anew_entity_phones ph
      WHERE ph.entity_id = e.id
        AND ph.is_primary = true
      LIMIT 1
    ) AS phone_number,
    (
      SELECT i.interaction_at
      FROM public.entity_interactions i
      WHERE i.entity_id = e.id
      ORDER BY i.interaction_at DESC
      LIMIT 1
    ) AS last_interaction_at
  FROM public.anew_entities e
  WHERE e.id = ANY(_entity_ids)
$function$;
