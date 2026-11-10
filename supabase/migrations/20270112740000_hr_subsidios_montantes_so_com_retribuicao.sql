-- ============================================================
-- 20270112740000 — subsídios de férias: montantes só com hr.pessoas.retribuicao.view
-- ============================================================
-- O que faz: pessoas_ausencias_subsidios guarda o subsídio de cada direito de férias (base_calculo, montante_devido,
--   montante_pago, regime, pago_em). A política SELECT deixava ler estas linhas com hr.ausencias.direitos.view ou
--   hr.ausencias.aprovar.chefia (pessoa na cadeia) — quem gere/aprova férias via os montantes sem ter
--   hr.pessoas.retribuicao.view. Os montantes são retribuição.
--
-- Escolha (forma mínima e segura): só a POLÍTICA muda; a vista não.
--   · Política pessoas_ausencias_subsidios_select (ALTER POLICY, mesmo nome, mesmos papéis, PERMISSIVE): os ramos
--     direitos.view e aprovar.chefia passam a exigir TAMBÉM hr.pessoas.retribuicao.view na organização da linha
--     (has_anew_permission_in_org, o helper que a política já usa). O ramo da própria pessoa (hr.ausencias.view.own +
--     hr_pessoa_do_utilizador) fica igual: cada um vê sempre o seu subsídio.
--   · v_hr_ausencias_direito_completo é security_invoker=true e junta o subsídio por LEFT JOIN: com a política nova,
--     quem não tem retribuicao.view continua a ver TODAS as linhas de direitos (dias, saldos), com as colunas subsidio_*
--     a NULL. É o «mascarar colunas sem cortar linhas» sem tocar na vista. Mascarar só na vista (CASE … NULL) não
--     chegava: a tabela lê-se diretamente (authenticated tem SELECT em todas as colunas) e os montantes ficavam
--     expostos por aí. Por isso a vista não muda; a guarda abaixo confirma que continua security_invoker e igual.
--   · Também ficam a NULL, para quem não tem retribuicao.view, as colunas não monetárias do subsídio
--     (regime_pagamento, proporcional, pago_em, lancamento_id). Nenhum ecrã do src/ nem nenhuma função da base lê
--     pessoas_ausencias_subsidios ou v_hr_ausencias_direito_completo (grep e pg_proc em 10/11/2026); em 10/11/2026 a
--     tabela tem 0 linhas.
--   · INSERT/UPDATE (hr.ausencias.direitos.edit) não mudam. Nota: um UPDATE com WHERE/RETURNING também passa pela
--     política SELECT, por isso quem edita subsídios sem retribuicao.view deixa de os conseguir alterar pela tabela
--     (hoje direitos.edit só está em system_admin/super_admin, que têm retribuicao.view, e em teste_rh_gestao, de onde
--     20270112710000 a retira).
--
-- Guarda: a expressão atual da política (md5 de pg_policies.qual = 571484d3d7d175bdafef76026eba84d0, 10/11/2026) e a
--   vista (md5 de pg_get_viewdef = 32c97dad0e2733744447ddd4531fce6c, security_invoker=true).
-- Reversão: ALTER POLICY com a expressão antiga (a de cima sem as duas condições retribuicao.view).
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
DECLARE
  v_qual text;
  v_opts text[];
BEGIN
  SELECT p.qual INTO v_qual
    FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'pessoas_ausencias_subsidios'
     AND p.policyname = 'pessoas_ausencias_subsidios_select' AND p.cmd = 'SELECT'
     AND p.permissive = 'PERMISSIVE' AND p.roles = '{authenticated}'::name[];
  IF v_qual IS NULL OR md5(v_qual) <> '571484d3d7d175bdafef76026eba84d0' THEN
    RAISE EXCEPTION 'Guarda: a política pessoas_ausencias_subsidios_select mudou desde 10/11/2026. Rever esta migration.';
  END IF;

  IF (SELECT count(*) FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = 'pessoas_ausencias_subsidios'
         AND p.cmd IN ('SELECT', 'ALL') AND p.permissive = 'PERMISSIVE') <> 1 THEN
    RAISE EXCEPTION 'Guarda: há outra política permissiva de leitura em pessoas_ausencias_subsidios. Rever esta migration.';
  END IF;

  SELECT c.reloptions INTO v_opts FROM pg_class c WHERE c.oid = 'public.v_hr_ausencias_direito_completo'::regclass;
  IF NOT ('security_invoker=true' = ANY (coalesce(v_opts, '{}'::text[])))
     OR md5(pg_get_viewdef('public.v_hr_ausencias_direito_completo'::regclass)) <> '32c97dad0e2733744447ddd4531fce6c' THEN
    RAISE EXCEPTION 'Guarda: v_hr_ausencias_direito_completo mudou ou deixou de ser security_invoker. Rever esta migration.';
  END IF;
END $guarda$;

ALTER POLICY pessoas_ausencias_subsidios_select ON public.pessoas_ausencias_subsidios
  USING (
    (deleted_at IS NULL)
    AND (
      (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.direitos.view'::text, pessoas_ausencias_subsidios.organization_id))
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.view'::text, pessoas_ausencias_subsidios.organization_id))
      )
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.view.own'::text, pessoas_ausencias_subsidios.organization_id))
        AND (pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), pessoas_ausencias_subsidios.organization_id)))
      )
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.ausencias.aprovar.chefia'::text, pessoas_ausencias_subsidios.organization_id))
        AND (SELECT public.hr_ausencias_pessoa_na_minha_cadeia((SELECT auth.uid()), pessoas_ausencias_subsidios.pessoa_id, pessoas_ausencias_subsidios.organization_id))
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.retribuicao.view'::text, pessoas_ausencias_subsidios.organization_id))
      )
    )
  );

DO $verificar$
DECLARE
  v_qual text;
BEGIN
  SELECT p.qual INTO v_qual FROM pg_policies p
   WHERE p.schemaname = 'public' AND p.tablename = 'pessoas_ausencias_subsidios'
     AND p.policyname = 'pessoas_ausencias_subsidios_select';
  IF v_qual IS NULL
     OR (length(v_qual) - length(replace(v_qual, 'hr.pessoas.retribuicao.view', ''))) / length('hr.pessoas.retribuicao.view') <> 2 THEN
    RAISE EXCEPTION 'Verificação: a política de leitura dos subsídios não ficou com as duas exigências de retribuicao.view.';
  END IF;
END $verificar$;
