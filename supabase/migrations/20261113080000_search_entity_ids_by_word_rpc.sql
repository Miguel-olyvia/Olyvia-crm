-- ============================================================================
-- search_entity_ids_by_word(): substitui as tres queries ilike com
-- .limit(200) e SEM ORDER BY que src/lib/clientSearch.ts (searchEntityIds)
-- fazia por cada palavra do termo de pesquisa.
--
-- DEFEITO MEDIDO (dados reais). Sem ORDER BY, quais 200 linhas o Postgres
-- devolve e arbitrario. Contra 25 clientes reais com nome de 2+ palavras,
-- reproduzindo o algoritmo exato, 4 nao eram encontrados ao pesquisar pelo
-- proprio nome ("ana isabel", "ana luisa", "ana morgado", "ulisses silva"):
-- a interseccao AND-entre-palavras caia porque uma das palavras (ex. "ana",
-- "silva") tinha mais de 200 correspondencias reais e o proprio cliente
-- ficava de fora das 200 devolvidas.
--   mar   -> 802 correspondencias reais, so 200 chegavam ao cliente
--   silva -> 287 correspondencias reais, so 200 chegavam ao cliente
--
-- FIX: uma unica RPC por palavra, SEM limit arbitrario, SECURITY INVOKER.
-- AND entre palavras e a interseccao dos conjuntos (feita em TS, inalterada);
-- OR entre nome/email/telefone passa a ser um UNION em SQL em vez de tres
-- pedidos HTTP. O NIF continua a resolver-se pela Edge Function
-- search-entities (nao mexido) e a uniao com estes ids continua em TS.
--
-- SECURITY INVOKER (omisso, de proposito) e NAO SECURITY DEFINER: as tres
-- tabelas (anew_entities, anew_entity_emails, anew_entity_phones) sao lidas
-- pelo cliente sob RLS hoje. Com privilegio elevado esta RPC devolveria
-- entidades que o utilizador nao pode ver -- exactamente o raciocinio ja
-- documentado em 20261113040000 (get_entity_contact_summary) para as mesmas
-- duas tabelas de PII (emails/telefones).
--
-- ORDER BY entity_id: apenas para tornar a lista determinista entre chamadas
-- (idempotencia/testes) -- a ordenacao que importa para a UI (updated_at,
-- id) continua a ser aplicada depois, na query a anew_clients.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_entity_ids_by_word(p_word text)
RETURNS TABLE (entity_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'extensions'
AS $function$
  WITH pattern AS (
    SELECT '%' || p_word || '%' AS pat
    WHERE p_word IS NOT NULL AND length(trim(p_word)) > 0
  )
  SELECT e.id AS entity_id
  FROM public.anew_entities e, pattern
  WHERE e.display_name ILIKE pattern.pat
     OR e.first_name ILIKE pattern.pat
     OR e.last_name ILIKE pattern.pat
  UNION
  SELECT em.entity_id
  FROM public.anew_entity_emails em, pattern
  WHERE em.entity_id IS NOT NULL
    AND em.email ILIKE pattern.pat
  UNION
  SELECT ph.entity_id
  FROM public.anew_entity_phones ph, pattern
  WHERE ph.entity_id IS NOT NULL
    AND ph.phone_number ILIKE pattern.pat
  ORDER BY 1
$function$;

COMMENT ON FUNCTION public.search_entity_ids_by_word(text) IS
  'Ids de entidade cujo nome, email ou telefone contem p_word (ILIKE, '
  'escape default \). Sem LIMIT -- ao contrario das tres queries que '
  'substitui, nao trunca correspondencias. SECURITY INVOKER de proposito: '
  'o RLS de anew_entity_emails/anew_entity_phones (PII) tem de continuar a '
  'aplicar-se. p_word e esperado ja sanitizado pelo chamador (sanitizeWord '
  'em src/lib/clientSearch.ts escapa %, _, \\ e remove , ( ) *).';

REVOKE ALL ON FUNCTION public.search_entity_ids_by_word(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_entity_ids_by_word(text) TO authenticated, service_role;
