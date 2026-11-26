-- 26/11/2026 (Rúben: «temos de criar uma base de conhecimento para que o chat com a AI consiga servir informação a partir de qualquer
-- página»). A base de conhecimento da Olyvia: o que o chat (ai-assistant) e a voz (olyvia-comando) leem, em qualquer página.
--
--   · guia    : como funciona a Olyvia (as fases do negócio, os agentes, os Estúdios, a voz…), igual para todos da organização;
--   · resumo  : o dia das obras (quantas decisões à espera, o que os agentes fizeram hoje) — só para quem planeia ou executa obras;
--   · negocio : cada negócio (fase, valor, cliente, estado) — só se a pessoa vê esse negócio (a regra de acesso dos negócios);
--   · obra    : cada obra em curso ou aprovada (o que os agentes propõem, as próximas tarefas, o fim) — idem.
--
-- Quem escreve: os agentes no servidor (Edge Function agentes-obra, de 15 em 15 minutos) e a página dos Negócios de quem planeia obras
-- (de 10 em 10 minutos), pela função olyvia_conhecimento_gravar. Ler é pela tabela, com RLS. Reversão: DROP TABLE + as duas funções.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.olyvia_conhecimento (
  organization_id uuid NOT NULL REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  chave text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('guia', 'resumo', 'negocio', 'obra')),
  numero integer,
  titulo text NOT NULL,
  texto text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, chave)
);
COMMENT ON TABLE public.olyvia_conhecimento IS 'Base de conhecimento da Olyvia (chat e voz em qualquer página): guia, resumo do dia, negócios e obras. Escreve-se por olyvia_conhecimento_gravar. 20270128000000.';
CREATE INDEX IF NOT EXISTS olyvia_conhecimento_org_tipo ON public.olyvia_conhecimento (organization_id, tipo);

ALTER TABLE public.olyvia_conhecimento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.olyvia_conhecimento FROM anon;
GRANT SELECT ON public.olyvia_conhecimento TO authenticated;

DROP POLICY IF EXISTS olyvia_conhecimento_ler ON public.olyvia_conhecimento;
CREATE POLICY olyvia_conhecimento_ler ON public.olyvia_conhecimento FOR SELECT TO authenticated USING (
  organization_id IN (SELECT o FROM public.get_user_visible_org_ids(auth.uid()) AS o)
  AND (
    tipo = 'guia'
    OR (tipo = 'resumo' AND (public.has_anew_permission(auth.uid(), 'negocios.obra.planear') OR public.has_anew_permission(auth.uid(), 'negocios.obra.executar')))
    -- o negócio tem de ser visível pela regra de acesso dos negócios (a RLS de public.negocios aplica-se a quem lê)
    OR (tipo IN ('negocio', 'obra') AND EXISTS (
      SELECT 1 FROM public.negocios n WHERE n.organization_id = olyvia_conhecimento.organization_id AND n.numero = olyvia_conhecimento.numero AND n.deleted_at IS NULL))
  )
);

-- Grava a base de uma organização de uma vez: o que vem fica (upsert); com p_completo, o que não vem sai (negócios perdidos, obras acabadas).
CREATE OR REPLACE FUNCTION public.olyvia_conhecimento_gravar(p_org uuid, p_itens jsonb, p_completo boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_anew_permission(auth.uid(), 'negocios.obra.planear') THEN
    RAISE EXCEPTION 'Sem permissão para atualizar a base de conhecimento' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_org IN (SELECT o FROM public.get_user_visible_org_ids(auth.uid()) AS o)) THEN
    RAISE EXCEPTION 'Organização fora do âmbito' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) > 2000 THEN
    RAISE EXCEPTION 'Itens inválidos' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.olyvia_conhecimento AS k (organization_id, chave, tipo, numero, titulo, texto, dados, atualizado_em)
  SELECT p_org, left(i->>'chave', 120), i->>'tipo', nullif(i->>'numero', '')::integer, left(i->>'titulo', 300), left(i->>'texto', 6000),
         coalesce(i->'dados', '{}'::jsonb), now()
  FROM jsonb_array_elements(p_itens) i
  WHERE i->>'tipo' IN ('guia', 'resumo', 'negocio', 'obra') AND coalesce(i->>'chave', '') <> '' AND coalesce(i->>'titulo', '') <> ''
  ON CONFLICT (organization_id, chave) DO UPDATE
    SET tipo = excluded.tipo, numero = excluded.numero, titulo = excluded.titulo, texto = excluded.texto, dados = excluded.dados, atualizado_em = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF p_completo THEN
    DELETE FROM public.olyvia_conhecimento k
    WHERE k.organization_id = p_org
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_itens) i WHERE i->>'chave' = k.chave);
  END IF;
  RETURN v_n;
END $$;
COMMENT ON FUNCTION public.olyvia_conhecimento_gravar(uuid, jsonb, boolean) IS 'Base de conhecimento da Olyvia: grava os itens de uma organização (quem planeia obras). 20270128000000.';
REVOKE ALL ON FUNCTION public.olyvia_conhecimento_gravar(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olyvia_conhecimento_gravar(uuid, jsonb, boolean) TO authenticated;

-- Para confirmar:
--   SELECT tipo, count(*), max(atualizado_em) FROM public.olyvia_conhecimento GROUP BY tipo;

-- ------------------------------------------------------------------ o aviso ao gestor (plano «Obra Viva», recomendação 5, aceite a 26/11)
-- «Na app sempre, e email só para o que fica à espera mais de meio dia.» Os agentes no servidor chamam isto quando uma obra tem decisões
-- à espera há mais de meio dia: um aviso no sino de quem planeia obras nesta organização, uma vez por conjunto de decisões (a chave).
-- O email fica para quando a organização tiver o envio de emails configurado.
-- 26/11 (teste ao vivo: a 1.ª versão avisava as 12 pessoas que planeiam obras na Mudelar): só o gestor DESTA obra, pelos nomes que a app
-- dá (o «Responsável de obra» e quem mede), entre quem planeia obras na organização. Sem nomes, ninguém.
DROP FUNCTION IF EXISTS public.olyvia_avisar_gestores(uuid, integer, text, text, text);
CREATE OR REPLACE FUNCTION public.olyvia_avisar_gestores(p_org uuid, p_numero integer, p_chave text, p_titulo text, p_mensagem text, p_nomes text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_anew_permission(auth.uid(), 'negocios.obra.planear') THEN
    RAISE EXCEPTION 'Sem permissão para avisar os gestores' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (p_org IN (SELECT o FROM public.get_user_visible_org_ids(auth.uid()) AS o)) THEN
    RAISE EXCEPTION 'Organização fora do âmbito' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF coalesce(p_chave, '') = '' OR coalesce(p_titulo, '') = '' OR coalesce(array_length(p_nomes, 1), 0) = 0 THEN RETURN 0; END IF;
  -- uma vez por chave (o mesmo conjunto de decisões não volta a avisar)
  IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.organization_id = p_org AND n.type = 'agentes_decisoes' AND n.data->>'chave' = p_chave) THEN
    RETURN 0;
  END IF;
  INSERT INTO public.notifications (user_id, type, title, message, link, data, organization_id, priority, kind, is_read, is_dismissed, is_resolved)
  SELECT DISTINCT u.auth_user_id, 'agentes_decisoes', left(p_titulo, 200), left(p_mensagem, 1000),
         '/negocios?vista=operacoes&obra=' || p_numero, jsonb_build_object('chave', p_chave, 'negocio', p_numero, 'modulo', 'obra_viva'),
         p_org, 'normal', 'notification', false, false, false
  FROM public.anew_memberships m
  JOIN public.anew_users u ON u.id = m.user_id AND u.auth_user_id IS NOT NULL
  JOIN public.anew_role_permissions rp ON rp.role_id = m.role_id AND rp.permission_code = 'negocios.obra.planear'
  WHERE m.organization_id = p_org AND m.status = 'active' AND u.auth_user_id <> auth.uid()
    AND lower(trim(u.name)) IN (SELECT lower(trim(x)) FROM unnest(p_nomes) x WHERE coalesce(trim(x), '') <> '');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
COMMENT ON FUNCTION public.olyvia_avisar_gestores(uuid, integer, text, text, text, text[]) IS 'Obra Viva: avisa no sino quem planeia obras quando há decisões dos agentes à espera há mais de meio dia (uma vez por chave). 20270128000000.';
REVOKE ALL ON FUNCTION public.olyvia_avisar_gestores(uuid, integer, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.olyvia_avisar_gestores(uuid, integer, text, text, text, text[]) TO authenticated;
