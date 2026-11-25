-- 20270126210000 — Auditoria de permissões 23/11, C3: leitura direta de negocio_produtos / adenda_linhas / quote_versao_produtos.
--
-- O problema: as políticas de SELECT (negocio_produtos_ler, adenda_linhas_ler, quote_versao_produtos_ler) só pediam pessoas.view na
-- organização. Um .from('negocio_produtos') dava a assistente/financeiro/supervisor/gestor os custos (custo_un) de todos os negócios, e
-- aos comerciais os dos negócios dos outros. As RPCs (neg_ler_negocios → fn_quote_custos_pode) já escondiam bem.
--
-- O que muda (só permissões):
--   1. As linhas: além de pessoas.view na organização, só as dos negócios que a conta lê (fn_neg_ids_legiveis(), o critério de
--      neg_ler_negocios — como negocio_respostas_ler / negocio_historico_ler). adenda_linhas pela adenda (adendas.negocio_id) e
--      quote_versao_produtos pelo orçamento (quotes.negocio_id). O system admin continua a ler tudo, como antes.
--   2. A coluna custo_un deixa de ser legível por authenticated nas três tabelas (REVOKE do SELECT da tabela e GRANT de SELECT a todas
--      as outras colunas). Os custos leem-se só pelas RPCs, que aplicam fn_quote_custos_pode.
-- Quem lê estas tabelas hoje: nenhum ecrã (nenhum .from() no frontend nem nas edge functions) e só funções SECURITY DEFINER do dono
-- postgres (neg_ler_negocios, neg_guardar_negocio, fn_neg_ler_orcamento, fn_neg_marcas_permissoes, fn_neg_repor_custos,
-- fn_neg_repor_custos_versao, cat_retirar_perfil), que não passam pela RLS nem pelos GRANTs de authenticated. service_role não muda.
--
-- Reversão (só como migration nova): GRANT SELECT ON <tabela> TO authenticated; e repor nas políticas o USING anterior:
--   (is_system_admin_user((SELECT auth.uid())) OR has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id))
-- SÓ base RH até à promoção.

ALTER POLICY negocio_produtos_ler ON public.negocio_produtos
  USING (public.is_system_admin_user((SELECT auth.uid()))
         OR (negocio_id IN (SELECT public.fn_neg_ids_legiveis())
             AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id)));

ALTER POLICY adenda_linhas_ler ON public.adenda_linhas
  USING (public.is_system_admin_user((SELECT auth.uid()))
         OR (adenda_id IN (SELECT a.id FROM public.adendas a WHERE a.negocio_id IN (SELECT public.fn_neg_ids_legiveis()))
             AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id)));

ALTER POLICY quote_versao_produtos_ler ON public.quote_versao_produtos
  USING (public.is_system_admin_user((SELECT auth.uid()))
         OR (quote_id IN (SELECT q.id FROM public.quotes q WHERE q.negocio_id IN (SELECT public.fn_neg_ids_legiveis()))
             AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id)));

DO $m$
DECLARE
  t text;
  v_cols text;
BEGIN
  FOREACH t IN ARRAY ARRAY['negocio_produtos', 'adenda_linhas', 'quote_versao_produtos'] LOOP
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = t AND c.column_name <> 'custo_un';
    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated', v_cols, t);
  END LOOP;
END $m$;
