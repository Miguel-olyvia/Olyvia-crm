-- Repoe as moradas que existem no field_values das leads e nunca chegaram a
-- entidade. Causa: a copia para anew_addresses/anew_entity_addresses so corre
-- no fluxo de CRIACAO da lead; editar uma lead depois para lhe acrescentar a
-- morada nao a dispara, e no caminho da edicao a gravacao ainda falha por RLS.
-- Confirmado na auditoria: o utilizador que editou uma dessas leads a 19/08
-- nao criou nenhuma morada nesse dia, apesar de ter criado 851 no total.
--
-- Alcance: SO entidades que hoje nao tem morada nenhuma, e SO leads cuja rua
-- e real (exclui '-', '--' e vazio). As ~1064 leads com a rua a traco ficam de
-- fora -- nao tem morada em lado nenhum, nao ha nada a repor. Verificado chave
-- a chave numa amostra: po_morada, po_codigo_postal e po_localidade todos '-'.
-- Codigo postal e localidade invalidos entram vazios em vez do lixo.
-- Uma morada por entidade, a da lead mais recente. Reutiliza a morada
-- existente quando a address_key ja existe (nao ha indice unico nessa coluna).
--
-- Rollback (aplicada a 2026-08-26 ~18:10 UTC):
--   delete from anew_entity_addresses where created_at >= '2026-08-26 18:00';
--   delete from anew_addresses a where a.created_at >= '2026-08-26 18:00'
--     and not exists (select 1 from anew_entity_addresses e where e.address_id = a.id);
WITH alvo AS (
  SELECT DISTINCT ON (l.entity_id)
    l.entity_id,
    trim(l.field_values->>'po_morada') AS street,
    CASE WHEN (l.field_values->>'po_codigo_postal') ~ '^[0-9]{4}-[0-9]{3}$'
         THEN l.field_values->>'po_codigo_postal' ELSE '' END AS cp,
    COALESCE(NULLIF(NULLIF(trim(l.field_values->>'po_localidade'), '-'), '--'), '') AS city
  FROM public.anew_leads l
  WHERE l.organization_id = '3242e925-da26-459a-8258-be04d904e355'
    AND l.deleted_at IS NULL
    -- Ha leads sem entidade associada; sem entity_id nao ha a quem ligar a morada.
    AND l.entity_id IS NOT NULL
    AND trim(COALESCE(l.field_values->>'po_morada', '')) NOT IN ('', '-', '--')
    AND NOT EXISTS (
      SELECT 1 FROM public.anew_entity_addresses ea WHERE ea.entity_id = l.entity_id
    )
  ORDER BY l.entity_id, l.updated_at DESC
),
com_chave AS (
  SELECT alvo.*, lower(concat_ws('|', street, cp, city)) AS chave FROM alvo
),
inseridas AS (
  INSERT INTO public.anew_addresses (street, number, postal_code, city, country, address_key)
  SELECT c.street, '', c.cp, c.city, 'PT', c.chave
  FROM com_chave c
  WHERE NOT EXISTS (SELECT 1 FROM public.anew_addresses a WHERE a.address_key = c.chave)
  RETURNING id, address_key
),
todas AS (
  SELECT c.entity_id,
         COALESCE(i.id, (SELECT a.id FROM public.anew_addresses a WHERE a.address_key = c.chave LIMIT 1)) AS address_id
  FROM com_chave c
  LEFT JOIN inseridas i ON i.address_key = c.chave
)
INSERT INTO public.anew_entity_addresses (entity_id, address_id, address_type, is_primary)
SELECT t.entity_id, t.address_id, 'primary', true
FROM todas t
WHERE t.address_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.anew_entity_addresses ea WHERE ea.entity_id = t.entity_id
  );
