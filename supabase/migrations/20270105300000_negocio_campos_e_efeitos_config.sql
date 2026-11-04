-- Negócio (3/11/2026, Rúben): «permitir customizar os campos das fases no levantamento configurável» e «customizar o impacto dos campos
-- que têm no orçamento».
--
-- Os campos das fases (Lead, Contacto, Necessidades, Proposta, Financeiro, Obra) e as regras do que cada resposta faz ao orçamento estão no
-- código (src/emylia/campos.ts e src/emylia/efeitosLevantamento.ts). O que se guarda aqui são SÓ os ajustes de cada organização:
--   · campos:  { "<título do grupo>": { nome, oculto, ordem, ocultos, obrig, rotulos, opcoes, novos } }  (CfgCampos, campos.ts)
--   · efeitos: { "<regra>": { off, v: { "<parâmetro>": número }, ops: [opções] } }                       (CfgEfeitos, efeitosLevantamento.ts)
-- Sem linha (ou com {}), a organização fica exatamente como hoje. Os campos de que o motor depende só mudam de nome: a app nunca os apaga.
--
-- O que muda (a base só cresce; nada se apaga):
--   · negocio_campos_config: uma linha por organização. RLS ligada: lê quem vê os negócios dessa organização (pessoas.view, também pelo
--     papel do RH); ninguém escreve diretamente.
--   · neg_ler_campos_config(p_org): os dois objetos ({} quando não há linha). Mesma permissão de neg_ler_negocios.
--   · neg_guardar_campos_config(p_org, p_campos, p_efeitos): grava (NULL = fica como está). Só com pessoas.config (o admin do Workflow
--     de Pessoas). Recusa o que não for um objeto ou passar de 256 KB (NG009).
-- O que muda para quem usa: nada, até o admin mudar alguma coisa em Pessoas › Workflow › «Campos das fases» ou «Levantamento».
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.negocio_campos_config (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  campos          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(campos) = 'object'),
  efeitos         jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(efeitos) = 'object'),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES public.anew_users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.negocio_campos_config IS 'Ajustes da organização aos campos das fases do Negócio e às regras do impacto no orçamento (20270105300000). Escreve-a só neg_guardar_campos_config.';
COMMENT ON COLUMN public.negocio_campos_config.campos IS 'CfgCampos (src/emylia/campos.ts): por grupo, nome, ordem, obrigatórios, opções, escondidos e campos novos.';
COMMENT ON COLUMN public.negocio_campos_config.efeitos IS 'CfgEfeitos (src/emylia/efeitosLevantamento.ts): por regra, ligada ou não, os valores e as opções a que se aplica.';

ALTER TABLE public.negocio_campos_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.negocio_campos_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.negocio_campos_config TO authenticated;
GRANT ALL ON public.negocio_campos_config TO service_role;

DROP POLICY IF EXISTS negocio_campos_config_select ON public.negocio_campos_config;
CREATE POLICY negocio_campos_config_select ON public.negocio_campos_config
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.fn_cat_pode(organization_id, 'pessoas.view'));
DROP POLICY IF EXISTS negocio_campos_config_no_insert ON public.negocio_campos_config;
CREATE POLICY negocio_campos_config_no_insert ON public.negocio_campos_config AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS negocio_campos_config_no_update ON public.negocio_campos_config;
CREATE POLICY negocio_campos_config_no_update ON public.negocio_campos_config AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS negocio_campos_config_no_delete ON public.negocio_campos_config;
CREATE POLICY negocio_campos_config_no_delete ON public.negocio_campos_config AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- ler: quem vê os negócios (os ecrãs do Negócio e o editor)
CREATE OR REPLACE FUNCTION public.neg_ler_campos_config(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  PERFORM public.fn_cat_exigir(p_org, 'pessoas.view');
  SELECT jsonb_build_object('campos', c.campos, 'efeitos', c.efeitos, 'atualizado_em', c.atualizado_em)
    INTO r
    FROM public.negocio_campos_config c
   WHERE c.organization_id = p_org;
  RETURN coalesce(r, jsonb_build_object('campos', '{}'::jsonb, 'efeitos', '{}'::jsonb, 'atualizado_em', NULL));
END $$;
REVOKE ALL ON FUNCTION public.neg_ler_campos_config(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_ler_campos_config(uuid) TO authenticated, service_role;

-- gravar: só o admin do Workflow de Pessoas (pessoas.config) da organização
CREATE OR REPLACE FUNCTION public.neg_guardar_campos_config(p_org uuid, p_campos jsonb, p_efeitos jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF p_org IS NULL
     OR (p_campos IS NOT NULL AND (jsonb_typeof(p_campos) <> 'object' OR octet_length(p_campos::text) > 262144))
     OR (p_efeitos IS NOT NULL AND (jsonb_typeof(p_efeitos) <> 'object' OR octet_length(p_efeitos::text) > 262144)) THEN
    RAISE EXCEPTION 'Configuração dos campos inválida.' USING ERRCODE = 'NG009';
  END IF;
  v_user := public.fn_cat_exigir(p_org, 'pessoas.config');

  INSERT INTO public.negocio_campos_config AS c (organization_id, campos, efeitos, atualizado_em, atualizado_por)
  VALUES (p_org, coalesce(p_campos, '{}'::jsonb), coalesce(p_efeitos, '{}'::jsonb), now(), v_user)
  ON CONFLICT (organization_id) DO UPDATE
    SET campos = coalesce(p_campos, c.campos),
        efeitos = coalesce(p_efeitos, c.efeitos),
        atualizado_em = now(),
        atualizado_por = v_user;

  RETURN public.neg_ler_campos_config(p_org);
END $$;
REVOKE ALL ON FUNCTION public.neg_guardar_campos_config(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_guardar_campos_config(uuid, jsonb, jsonb) TO authenticated, service_role;
