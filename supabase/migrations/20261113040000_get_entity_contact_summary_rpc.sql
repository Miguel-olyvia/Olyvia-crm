-- ============================================================================
-- get_entity_contact_summary(): substitui as quatro queries de enriquecimento
-- da listagem de Propostas por uma so.
--
-- PROBLEMA MEDIDO. src/pages/Proposals.tsx faz quatro pedidos em paralelo:
--   anew_entities        .select('id, display_name')        .in('id', ids)
--   anew_entity_emails   .select('entity_id, email')        .in('entity_id', ids).eq('is_primary', true)
--   anew_entity_phones   .select('entity_id, phone_number') .in('entity_id', ids).eq('is_primary', true)
--   entity_interactions  .select('entity_id, interaction_at').in('entity_id', ids).order(desc)
--
-- Na maior organizacao `ids` tem 438 UUIDs, o que da cerca de 17 kB de query
-- string por pedido -- 68 kB no total, quatro vezes o mesmo conteudo para o
-- PostgREST parsear. Medido: a soma dos tempos de servidor era 1244 ms e a
-- vaga em paralelo 1020 ms, ou seja METADE do tempo da vaga nunca foi base de
-- dados. Era transporte.
--
-- Uma RPC e um POST: os ids seguem no CORPO, nao no URL. Passa-se de quatro
-- pedidos com 17 kB de URL cada para um pedido com um array no corpo.
--
-- PORQUE SO AGORA. Esta mesma consolidacao foi medida antes de
-- 20261112500000/20261112520000 e dava 1126 ms -- PIOR do que a vaga em
-- paralelo. Juntar quatro queries num plano serializa o trabalho, e nessa
-- altura os 509 ms do RLS de anew_entity_emails dominavam a soma. Com o
-- atalho indexado ja aplicado, a mesma query combinada mede 409 ms. A ordem
-- era o que faltava: baixar o custo por linha primeiro, consolidar depois.
--
-- CONTRATO. Devolve exatamente o que o cliente guarda -- ele constroi quatro
-- mapas por entity_id: nome, email primario, telefone primario e a ULTIMA
-- interacao (o codigo pedia todas as interacoes por ordem decrescente e ficava
-- com a primeira de cada entidade). Aqui a ultima e resolvida no servidor, o
-- que tambem corta o payload: eram 1489 linhas / 106 kB de interacoes para
-- ficar com uma data por entidade.
--
-- SECURITY INVOKER (o valor por omissao) DE PROPOSITO, e nao SECURITY
-- DEFINER: as quatro tabelas eram lidas pelo cliente com a chave anonima, cada
-- uma sujeita ao seu RLS -- incluindo o de anew_entity_emails e
-- anew_entity_phones, que protege dados pessoais. Com SECURITY DEFINER esta
-- funcao devolveria emails e telefones de entidades que o utilizador nao pode
-- ver. Mantendo invoker rights, o conjunto devolvido e identico ao das quatro
-- queries que substitui.
--
-- STABLE: apenas le. Sem efeitos laterais.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_entity_contact_summary(_entity_ids uuid[])
RETURNS TABLE (
  entity_id uuid,
  display_name text,
  email text,
  phone_number text,
  last_interaction_at timestamptz
)
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

COMMENT ON FUNCTION public.get_entity_contact_summary(uuid[]) IS
  'Nome, email primario, telefone primario e ultima interacao por entidade, '
  'numa chamada em vez de quatro. Os ids seguem no corpo do POST e nao no URL, '
  'que era onde estava metade do tempo da vaga de enriquecimento. '
  'SECURITY INVOKER de proposito: o RLS de cada tabela tem de continuar a '
  'aplicar-se, sobretudo o de emails e telefones.';

GRANT EXECUTE ON FUNCTION public.get_entity_contact_summary(uuid[]) TO authenticated;
