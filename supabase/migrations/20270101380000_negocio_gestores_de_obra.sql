-- 20270101380000 (30/10/2026): quem é o Gestor de obra, do RH. No protótipo V1 o responsável de obra era fixo ("Filipe Rocha", um telefone
-- de exemplo) no Hoje do técnico ("À espera da validação de…", o telefone do responsável), na obra e no auto de receção. Agora são as
-- pessoas do RH com o papel Gestor de obra (pessoas_papeis_negocio, 20270101340000), com o telefone de trabalho.
-- Lê quem pode ler os negócios (pessoas.view, pelo perfil da Olyvia ou por um papel do Negócio).

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.neg_gestores_obra(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome_completo, 'telefone', p.telefone_trabalho) ORDER BY p.nome_completo)
    FROM pessoas p JOIN pessoas_papeis_negocio pp ON pp.pessoa_id = p.id AND pp.organization_id = p_org AND pp.papel = 'operacoes'
    WHERE p.organization_id = p_org AND p.deleted_at IS NULL AND (p.data_saida IS NULL OR p.data_saida >= current_date)), '[]');
END $$;
REVOKE ALL ON FUNCTION public.neg_gestores_obra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_gestores_obra(uuid) TO authenticated, service_role;
