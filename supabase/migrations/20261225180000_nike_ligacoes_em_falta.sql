-- ============================================================
-- 20261225180000_nike_ligacoes_em_falta
-- ============================================================
-- Liga à nike as pessoas da nike que têm lead ou cliente vivos e ainda não têm linha em anew_entity_org_links.
--
-- Porquê: a ficha e as escritas do novo fluxo (fn_neg_exigir_pessoa) exigem esta ligação. Medido na nike a 20/10
-- (só leitura, pelo CLI ligado): 244 pessoas com lead ou cliente vivo, 60 sem ligação à nike; nenhuma lead ou
-- cliente vivo da nike sem entity_id. O formulário público já cria a ligação hoje (verificado na nike com uma
-- submissão de teste), por isso isto corrige dados antigos e não um defeito atual.
--
-- O que faz: uma linha por pessoa, só da organização nike, e só de pessoas que:
--   - têm entity_id (linhas sem entidade não contam);
--   - não aparecem em NENHUMA outra organização: nem ligação em anew_entity_org_links, nem lead viva, cliente
--     vivo ou papel vivo (anew_entity_roles) noutra organização, nem linha (viva, nas que têm deleted_at) noutra
--     organização numa das 14 outras tabelas com chave estrangeira entity_id para anew_entities: anew_contacts,
--     client_contracts, client_portal_users, contact_tags, data_erasure_requests, deals, direct_sales,
--     entity_interactions, form_submissions (entity_id e conflicting_entity_id), levantamentos, negocios,
--     organization_counted_entities, proposals e quotes. É a mesma lista de 20261225160000 e 20261225170000
--     (uma entidade por organização: nunca cria partilhas). Medido a 20/10: 0 das 60 aparecem noutra organização;
--   - não têm email que pertença já a outra pessoa ligada à nike, nem email partilhado com outra das pessoas por
--     ligar. O trigger AFTER trg_check_email_unique_on_org_link (fn_check_email_unique_within_org: compara
--     lower(btrim(email)), ignora vazios, em todas as organizações a que a entidade está ligada) corre no fim do
--     INSERT e já vê as linhas novas: duas candidatas com o mesmo email fariam abortar a migration inteira.
--     Medido a 20/10: 1 pessoa com email de outra pessoa ligada (uma lead de 30 de julho, entidade
--     6328142e-410f-4421-a544-5558ab754cfb, com o email de 1cc0c467-fb33-4c02-8180-fb31fa6977ca; fica por
--     decidir à parte); 0 pares de candidatas com o mesmo email.
--   - não são a ficha de um utilizador do sistema (anew_users, não apagado) nem de uma organização
--     (anew_organizations): as escritas (20261225160000, 20261225170000) já recusam estas fichas com NG003, e
--     ligá-las só as expunha na ficha da página Pessoas. Medido a 20/10: 1 das 60 é ficha de utilizador
--     (entidade 58ee1e3c...), 0 de organização.
--   Resultado esperado a 20/10 (medido com o critério final): 244 pessoas, 60 por ligar, 58 ligações novas,
--   2 pessoas ficam sem ligação (a 6328142e, pelo email, e a 58ee1e3c, ficha de utilizador).
-- Triggers de anew_entity_org_links (lidos a 20/10, só estes dois, ambos activos): BEFORE INSERT OR UPDATE
--   trg_anew_entity_org_links_single_primary (recusa uma segunda ligação principal à MESMA organização e repõe
--   updated_at; as candidatas não têm ligação à nike) e AFTER INSERT trg_check_email_unique_on_org_link (acima).
-- Idempotente: voltar a correr não acrescenta nada. is_primary = true quando a pessoa não tem outra ligação principal.
-- created_at fixo em 2026-12-25 13:00:00+00 (a marca do nome antigo desta migration, mantida de propósito: a
-- reversão apaga exatamente as linhas com esse created_at). O updated_at é reposto a now() pelo trigger
-- trg_anew_entity_org_links_single_primary.
--
-- Não altera nenhuma tabela nem função, só acrescenta linhas, e só para a nike. A Mudelar não é tocada.
-- Reversão: fora da pasta das migrations (R_20261225180000_nike_ligacoes_em_falta.sql; não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

WITH pessoas AS (
  SELECT entity_id FROM public.anew_leads
   WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33' AND deleted_at IS NULL AND entity_id IS NOT NULL
  UNION
  SELECT entity_id FROM public.anew_clients
   WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33' AND deleted_at IS NULL AND entity_id IS NOT NULL
),
por_ligar AS (
  SELECT p.entity_id
    FROM pessoas p
   WHERE NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                      WHERE l.entity_id = p.entity_id AND l.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33')
),
candidatas AS (
  SELECT c.entity_id
    FROM por_ligar c
   -- nada noutra organização: ligação, lead viva, cliente vivo ou papel vivo
   WHERE NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33')
     AND NOT EXISTS (SELECT 1 FROM public.anew_leads o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.anew_clients o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.anew_entity_roles o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     -- nem linha viva noutra organização numa tabela com chave estrangeira para anew_entities
     -- (a mesma lista de 20261225160000 e 20261225170000)
     AND NOT EXISTS (SELECT 1 FROM public.anew_contacts o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.client_contracts o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.client_portal_users o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33')
     AND NOT EXISTS (SELECT 1 FROM public.contact_tags o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33')
     AND NOT EXISTS (SELECT 1 FROM public.data_erasure_requests o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33')
     AND NOT EXISTS (SELECT 1 FROM public.deals o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.direct_sales o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.entity_interactions o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33')
     AND NOT EXISTS (SELECT 1 FROM public.form_submissions o
                      WHERE (o.entity_id = c.entity_id OR o.conflicting_entity_id = c.entity_id)
                        AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.levantamentos o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.negocios o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.organization_counted_entities o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33')
     AND NOT EXISTS (SELECT 1 FROM public.proposals o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.quotes o
                      WHERE o.entity_id = c.entity_id AND o.organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33'
                        AND o.deleted_at IS NULL)
     -- nem ficha de um utilizador do sistema nem de uma organização (as escritas já as recusam)
     AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.entity_id = c.entity_id AND u.deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.anew_organizations g WHERE g.entity_id = c.entity_id)
     -- email de outra pessoa já ligada à nike
     AND NOT EXISTS (SELECT 1
                       FROM public.anew_entity_emails x
                       JOIN public.anew_entity_emails y
                         ON lower(btrim(y.email)) = lower(btrim(x.email)) AND y.entity_id <> x.entity_id
                       JOIN public.anew_entity_org_links ly
                         ON ly.entity_id = y.entity_id AND ly.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
                      WHERE x.entity_id = c.entity_id AND btrim(x.email) <> '')
     -- email partilhado com outra pessoa por ligar (as duas ficam de fora)
     AND NOT EXISTS (SELECT 1
                       FROM public.anew_entity_emails x
                       JOIN public.anew_entity_emails y
                         ON lower(btrim(y.email)) = lower(btrim(x.email)) AND y.entity_id <> x.entity_id
                       JOIN por_ligar py ON py.entity_id = y.entity_id
                      WHERE x.entity_id = c.entity_id AND btrim(x.email) <> '')
)
INSERT INTO public.anew_entity_org_links (entity_id, organization_id, is_primary, created_at, updated_at)
SELECT c.entity_id, 'b6ffce4f-f630-4933-833a-008649757a33'::uuid,
       NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links p WHERE p.entity_id = c.entity_id AND p.is_primary),
       TIMESTAMPTZ '2026-12-25 13:00:00+00', TIMESTAMPTZ '2026-12-25 13:00:00+00'
  FROM candidatas c;

-- CONFERIR: nada foi ligado a outra organização, nenhuma pessoa ligada aparece noutra organização, e as pessoas que ficam sem ligação são só as excluídas de propósito
-- (medido a 20/10: 2).
DO $conferir$
DECLARE
  v_fora_da_nike integer;
  v_sem_ligacao  integer;
  v_partilhadas  integer;
BEGIN
  SELECT count(*) INTO v_fora_da_nike
    FROM public.anew_entity_org_links
   WHERE created_at = TIMESTAMPTZ '2026-12-25 13:00:00+00' AND organization_id <> 'b6ffce4f-f630-4933-833a-008649757a33';
  IF v_fora_da_nike <> 0 THEN
    RAISE EXCEPTION 'A migration ligou % pessoas a outra organização.', v_fora_da_nike;
  END IF;

  -- nenhuma pessoa ligada por esta migration aparece noutra organização (o mesmo critério das candidatas)
  SELECT count(*) INTO v_partilhadas
    FROM public.anew_entity_org_links n
   WHERE n.created_at = TIMESTAMPTZ '2026-12-25 13:00:00+00'
     AND n.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33'
     AND (EXISTS (SELECT 1 FROM public.anew_entity_org_links o
                   WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id)
          OR EXISTS (SELECT 1 FROM public.anew_leads o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.anew_clients o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.anew_entity_roles o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.anew_contacts o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.client_contracts o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.client_portal_users o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id)
          OR EXISTS (SELECT 1 FROM public.contact_tags o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id)
          OR EXISTS (SELECT 1 FROM public.data_erasure_requests o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id)
          OR EXISTS (SELECT 1 FROM public.deals o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.direct_sales o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.entity_interactions o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id)
          OR EXISTS (SELECT 1 FROM public.form_submissions o
                      WHERE (o.entity_id = n.entity_id OR o.conflicting_entity_id = n.entity_id)
                        AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.levantamentos o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.negocios o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.organization_counted_entities o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id)
          OR EXISTS (SELECT 1 FROM public.proposals o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.quotes o
                      WHERE o.entity_id = n.entity_id AND o.organization_id <> n.organization_id AND o.deleted_at IS NULL));
  IF v_partilhadas <> 0 THEN
    RAISE EXCEPTION 'A migration ligou à nike % pessoas que aparecem noutra organização.', v_partilhadas;
  END IF;

  SELECT count(*) INTO v_sem_ligacao
    FROM (SELECT entity_id FROM public.anew_leads
           WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33' AND deleted_at IS NULL AND entity_id IS NOT NULL
          UNION
          SELECT entity_id FROM public.anew_clients
           WHERE organization_id = 'b6ffce4f-f630-4933-833a-008649757a33' AND deleted_at IS NULL AND entity_id IS NOT NULL) e
   WHERE NOT EXISTS (SELECT 1 FROM public.anew_entity_org_links l
                      WHERE l.entity_id = e.entity_id AND l.organization_id = 'b6ffce4f-f630-4933-833a-008649757a33');
  IF v_sem_ligacao > 2 THEN
    RAISE EXCEPTION 'Ficaram % pessoas da nike sem ligação (esperado: no máximo 2, as excluídas de propósito a 20/10).', v_sem_ligacao;
  END IF;
END
$conferir$;

COMMIT;
