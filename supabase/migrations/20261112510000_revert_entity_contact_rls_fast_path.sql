-- ============================================================================
-- REVERSAO de 20261112500000_entity_contact_rls_leads_fast_path.sql.
--
-- Essa migration acrescentou as policies de SELECT de anew_entity_emails e
-- anew_entity_phones um atalho por anew_leads, argumentado como subconjunto
-- estrito do ramo homonimo de is_entity_in_user_scope. A VERIFICACAO EMPIRICA
-- DESMENTIU esse argumento: a contagem de linhas visiveis subiu 10 em cada
-- tabela, para dois utilizadores reais e independentes.
--
--   utilizador A: emails 5685 -> 5695, phones 5595 -> 5605
--   utilizador B: emails 5485 -> 5495, phones 5486 -> 5496
--
-- Sao 10 linhas de dados pessoais (emails e telefones) que passaram a ser
-- visiveis e nao o eram. Independentemente da causa -- ainda por diagnosticar
-- -- isso e um alargamento de acesso, e a policy volta ao estado anterior
-- ate se saber porque.
--
-- Forward-only, conforme a regra do projeto: nao se edita uma migration ja
-- aplicada. Restaura-se a expressao exatamente como estava antes de
-- 20261112500000, incluindo o auth.uid() sem wrap.
-- ============================================================================

ALTER POLICY authenticated_select_anew_entity_emails
  ON public.anew_entity_emails
  USING (is_entity_in_user_scope(entity_id, auth.uid()));

ALTER POLICY authenticated_select_anew_entity_phones
  ON public.anew_entity_phones
  USING (is_entity_in_user_scope(entity_id, auth.uid()));
