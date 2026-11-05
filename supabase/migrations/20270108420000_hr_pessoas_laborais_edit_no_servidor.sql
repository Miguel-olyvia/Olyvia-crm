-- ==============================================================================
-- P2 (auditoria de permissões 05/11/2026, RH B2 #63): separador Laborais.
--
-- O ecrã mostra o «Guardar» de Laborais com hr.pessoas.laborais.edit
-- (useContextoFicha.ts: podeEditarLaborais), mas grava com UPDATE em pessoas,
-- cuja RLS só aceitava hr.pessoas.edit. Com laborais.edit e sem pessoas.edit:
-- 0 linhas, sem erro.
--
-- Agora a policy de UPDATE aceita também hr.pessoas.laborais.edit, e um gatilho
-- limita quem só tem laborais.edit aos campos do separador:
--   email_trabalho, telefone_trabalho, numero_interno, cargo, data_admissao,
--   data_antiguidade, data_saida, reporta_a_pessoa_id (+ updated_at/updated_by).
-- Qualquer outra coluna -> 42501. Quem tem hr.pessoas.edit fica exatamente como
-- estava. O gatilho só atua no acesso direto com sessão (current_user =
-- authenticated); RPCs definer e service_role não passam aqui.
-- Hoje nenhum papel tem laborais.edit sem pessoas.edit (super_admin,
-- system_admin e Teste RH - Gestão têm as duas): ninguém muda de comportamento.
-- ==============================================================================

ALTER POLICY pessoas_update_policy ON public.pessoas
  USING (
    (deleted_at IS NULL)
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.edit'::text, pessoas.organization_id))
      OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit'::text, pessoas.organization_id))
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.edit'::text, pessoas.organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.laborais.edit'::text, pessoas.organization_id))
  );

CREATE OR REPLACE FUNCTION public.hr_pessoas_laborais_so_campos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Campos do separador + colunas de sistema. nome_completo é coluna gerada
  -- (primeiro_nome/apelido, que continuam comparados): num BEFORE vem por calcular.
  v_livres text[] := ARRAY[
    'email_trabalho', 'telefone_trabalho', 'numero_interno', 'cargo',
    'data_admissao', 'data_antiguidade', 'data_saida', 'reporta_a_pessoa_id',
    'updated_at', 'updated_by', 'nome_completo'
  ];
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.edit', OLD.organization_id) THEN
    RETURN NEW;
  END IF;

  -- Só chega aqui quem entrou pela policy com hr.pessoas.laborais.edit.
  IF (to_jsonb(NEW) - v_livres) IS DISTINCT FROM (to_jsonb(OLD) - v_livres) THEN
    RAISE EXCEPTION
      'pessoas_laborais_so_campos: com hr.pessoas.laborais.edit (sem hr.pessoas.edit) so se mudam os campos do separador Laborais.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_pessoas_laborais_so_campos
  BEFORE UPDATE ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_laborais_so_campos();
