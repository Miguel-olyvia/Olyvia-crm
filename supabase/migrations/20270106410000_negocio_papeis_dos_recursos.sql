-- Negócio (4/11/2026, Rúben): ao marcar a visita, depois do dia, aparecem os comerciais que podem ir; sem nenhum livre, sugerem-se os técnicos.
-- Para isso o ecrã precisa de saber o papel de cada pessoa da agenda (recurso do tipo utilizador).
--
-- O que muda (a base só cresce; nada se apaga):
--   neg_papeis_dos_recursos(p_org): para cada recurso de agenda ativo da organização ligado a um utilizador, os papéis do Negócio da pessoa do
--   RH dessa conta (pessoas_papeis_negocio) e «tecnico» se tem cargo técnico (fn_rh_pessoa_tecnica), com as mesmas regras de fn_neg_papeis
--   (20270101340000): conta ativa e não revogada nesta organização, pessoa não apagada e sem saída passada.
--   Só para quem vê os negócios da organização (fn_cat_exigir 'pessoas.view'). Não devolve nada da pessoa além do papel.
-- No ecrã (MarcarVisitaNegocio): sem esta função (por colar), «Quem vai» mostra toda a gente, como antes.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_rh_pessoa_tecnica(uuid,uuid)') IS NULL OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_rh_pessoa_tecnica (20261231998000) ou fn_cat_exigir.';
  END IF;
  IF to_regclass('public.pessoas_papeis_negocio') IS NULL OR to_regclass('public.pessoas_contas') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam pessoas_papeis_negocio ou pessoas_contas (20270101340000).';
  END IF;
END $guarda$;

CREATE OR REPLACE FUNCTION public.neg_papeis_dos_recursos(p_org uuid)
RETURNS TABLE(resource_id uuid, papeis text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN QUERY
    WITH contas AS (
      SELECT DISTINCT ON (r.id) r.id AS recurso, pc.pessoa_id AS pessoa
        FROM schedule_resources r
        JOIN pessoas_contas pc ON pc.anew_user_id = r.user_id AND pc.organization_id = p_org AND pc.estado = 'activa' AND pc.revogada_em IS NULL
        JOIN pessoas p ON p.id = pc.pessoa_id AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)
       WHERE r.organization_id = p_org AND r.resource_type = 'user' AND r.user_id IS NOT NULL AND r.is_active IS NOT FALSE
       ORDER BY r.id, pc.ligada_em DESC NULLS LAST
    )
    SELECT c.recurso, coalesce((
      SELECT array_agg(DISTINCT x ORDER BY x) FROM (
        SELECT pp.papel AS x FROM pessoas_papeis_negocio pp WHERE pp.pessoa_id = c.pessoa AND pp.organization_id = p_org
        UNION
        SELECT 'tecnico' WHERE public.fn_rh_pessoa_tecnica(p_org, c.pessoa)
      ) s), '{}')
      FROM contas c;
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_papeis_dos_recursos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_papeis_dos_recursos(uuid) TO authenticated, service_role;
