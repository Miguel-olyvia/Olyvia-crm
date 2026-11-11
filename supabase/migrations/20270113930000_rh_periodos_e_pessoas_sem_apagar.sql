-- 11/11/2026 — Correções da auditoria «campos sem permissão» (Área 6, RH).
--  1. pessoas_afectacoes_update e 2. pessoas_colocacao_organograma_update: o USING já escolhia a permissão pelo período da
--     linha ANTIGA (em vigor → .edit; decorrido → .corrigir), mas o WITH CHECK aceitava .edit OU .corrigir sem olhar ao
--     período NOVO. Passa a ser o mesmo par do USING, avaliado na linha nova (como já fazem as políticas de INSERT):
--       • reabrir/alongar uma linha decorrida (fim → NULL ou futuro) passa a pedir também .edit;
--       • fechar/recuar uma linha em vigor para uma data já passada passa a pedir também .corrigir.
--     Quem tem as duas permissões (hoje: Super Admin) não sente diferença; fechar com data de hoje ou futura continua só com .edit.
--  3. pessoas: authenticated deixa de poder escrever deleted_at, deleted_by e estado_registo por UPDATE direto (não há
--     permissão nem ecrã para apagar/arquivar uma pessoa; pessoas_delete_bloqueado já recusa o DELETE). As outras 24 colunas
--     continuam com UPDATE, exatamente como antes; INSERT e SELECT não mudam. As RPCs SECURITY DEFINER não são afetadas.
-- Partiu das políticas e grants vivos (md5 abaixo); aborta se mudaram entretanto.
DO $g$
DECLARE
  v_md5 text;
BEGIN
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_afectacoes' AND policyname = 'pessoas_afectacoes_update';
  IF v_md5 IS DISTINCT FROM '0e28f01e5452e7b95c53724b124e74c2' THEN
    RAISE EXCEPTION 'pessoas_afectacoes_update mudou desde a leitura; rever antes de aplicar';
  END IF;
  SELECT md5(coalesce(qual, '') || '|' || coalesce(with_check, '')) INTO v_md5 FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'pessoas_colocacao_organograma' AND policyname = 'pessoas_colocacao_organograma_update';
  IF v_md5 IS DISTINCT FROM '8fa81e6ec6abe95c04a22595c85dc76d' THEN
    RAISE EXCEPTION 'pessoas_colocacao_organograma_update mudou desde a leitura; rever antes de aplicar';
  END IF;
  IF (SELECT relacl::text FROM pg_class WHERE oid = 'public.pessoas'::regclass)
     IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}' THEN
    RAISE EXCEPTION 'Os grants de public.pessoas mudaram desde a leitura; rever antes de aplicar';
  END IF;
END $g$;

-- 1. Afectações a centros
ALTER POLICY pessoas_afectacoes_update ON public.pessoas_afectacoes
  WITH CHECK (((NOT hr_periodo_decorrido(valido_ate)) AND ( SELECT has_anew_permission_in_org(( SELECT auth.uid() AS uid), 'hr.pessoas.afectacoes.edit'::text, pessoas_afectacoes.organization_id) AS has_anew_permission_in_org))
           OR (hr_periodo_decorrido(valido_ate) AND ( SELECT has_anew_permission_in_org(( SELECT auth.uid() AS uid), 'hr.pessoas.afectacoes.corrigir'::text, pessoas_afectacoes.organization_id) AS has_anew_permission_in_org)));

-- 2. Colocação no organograma
ALTER POLICY pessoas_colocacao_organograma_update ON public.pessoas_colocacao_organograma
  WITH CHECK (((NOT hr_periodo_decorrido(valido_ate)) AND ( SELECT has_anew_permission_in_org(( SELECT auth.uid() AS uid), 'hr.pessoas.colocacao.edit'::text, pessoas_colocacao_organograma.organization_id) AS has_anew_permission_in_org))
           OR (hr_periodo_decorrido(valido_ate) AND ( SELECT has_anew_permission_in_org(( SELECT auth.uid() AS uid), 'hr.pessoas.colocacao.corrigir'::text, pessoas_colocacao_organograma.organization_id) AS has_anew_permission_in_org)));

-- 3. Pessoas: sem UPDATE direto de deleted_at, deleted_by e estado_registo
REVOKE UPDATE ON public.pessoas FROM authenticated;
GRANT UPDATE (id, organization_id, numero_interno, primeiro_nome, apelido, nome_completo, email_trabalho, email_pessoal,
              telefone_trabalho, cargo, local_trabalho, entidade_legal_org_id, reporta_a_pessoa_id, data_admissao,
              data_antiguidade, data_saida, notas, created_at, updated_at, created_by, updated_by, local_id, cargo_id,
              fotografia_anexo_id)
  ON public.pessoas TO authenticated;
