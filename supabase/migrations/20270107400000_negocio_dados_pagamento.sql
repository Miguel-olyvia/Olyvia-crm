-- Negócio (4/11/2026, Rúben): os dados para o cliente pagar passam a ser os da empresa, e não um exemplo no código.
--
-- Até aqui, o passo «Pagamento» do Financeiro e o portal do cliente mostravam uma entidade Multibanco e um IBAN de exemplo
-- («Mudelar, Lda.», src/emylia/pagamentoCliente.ts). Cada organização tem agora os seus:
--   negocio_dados_pagamento (uma linha por organização): titular, IBAN, entidade Multibanco, número MB Way e identificador de credor SEPA.
--   neg_dados_pagamento_ler(p_org): para o CRM (pessoas.view).
--   neg_dados_pagamento_guardar(p_org, p_dados): grava (pessoas.config, como os campos das fases). Valores vazios ficam nulos.
--   portal_neg_dados_pagamento(p_negocio_id): para o portal, só para o cliente desse negócio (fn_portal_msg_negocio, como portal_neg_vista).
-- No ecrã: no Workflow de Pessoas, separador «Pagamentos». Sem dados, o portal diz que a empresa ainda não indicou os dados, em vez de
-- mostrar um IBAN que não é o dela.
--
-- A base só cresce: nada se apaga nem muda noutras tabelas. Só para a base RH.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.negocio_dados_pagamento (
  organization_id uuid PRIMARY KEY REFERENCES public.anew_organizations(id) ON DELETE CASCADE,
  titular         text CHECK (titular IS NULL OR char_length(titular) <= 200),
  iban            text CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  mb_entidade     text CHECK (mb_entidade IS NULL OR mb_entidade ~ '^[0-9]{5}$'),
  mbway           text CHECK (mbway IS NULL OR mbway ~ '^\+?[0-9]{9,15}$'),
  sepa_credor     text CHECK (sepa_credor IS NULL OR sepa_credor ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$'),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_por  uuid REFERENCES public.anew_users(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.negocio_dados_pagamento IS 'Os dados da empresa para o cliente pagar (20270107400000). Escreve-a só neg_dados_pagamento_guardar.';

ALTER TABLE public.negocio_dados_pagamento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.negocio_dados_pagamento FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_neg_dados_pagamento_json(p public.negocio_dados_pagamento)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p.organization_id IS NULL THEN NULL ELSE jsonb_build_object(
    'titular', p.titular, 'iban', p.iban, 'mb_entidade', p.mb_entidade, 'mbway', p.mbway, 'sepa_credor', p.sepa_credor,
    'atualizado_em', p.atualizado_em) END
$$;
REVOKE ALL ON FUNCTION public.fn_neg_dados_pagamento_json(public.negocio_dados_pagamento) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.neg_dados_pagamento_ler(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_org IS NULL OR NOT public.fn_cat_pode(p_org, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN (SELECT public.fn_neg_dados_pagamento_json(p) FROM public.negocio_dados_pagamento p WHERE p.organization_id = p_org);
END $$;
REVOKE ALL ON FUNCTION public.neg_dados_pagamento_ler(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_dados_pagamento_ler(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.neg_dados_pagamento_guardar(p_org uuid, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  v_titular text; v_iban text; v_ent text; v_mbway text; v_sepa text;
BEGIN
  IF p_org IS NULL OR p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' OR octet_length(p_dados::text) > 4096 THEN
    RAISE EXCEPTION 'Dados de pagamento inválidos.' USING ERRCODE = 'NG009';
  END IF;
  v_user := public.fn_cat_exigir(p_org, 'pessoas.config');

  v_titular := NULLIF(btrim(p_dados ->> 'titular'), '');
  v_iban    := NULLIF(upper(regexp_replace(coalesce(p_dados ->> 'iban', ''), '\s', '', 'g')), '');
  v_ent     := NULLIF(regexp_replace(coalesce(p_dados ->> 'mb_entidade', ''), '\s', '', 'g'), '');
  v_mbway   := NULLIF(regexp_replace(coalesce(p_dados ->> 'mbway', ''), '[\s-]', '', 'g'), '');
  v_sepa    := NULLIF(upper(regexp_replace(coalesce(p_dados ->> 'sepa_credor', ''), '\s', '', 'g')), '');

  BEGIN
    INSERT INTO public.negocio_dados_pagamento AS p (organization_id, titular, iban, mb_entidade, mbway, sepa_credor, atualizado_em, atualizado_por)
    VALUES (p_org, v_titular, v_iban, v_ent, v_mbway, v_sepa, now(), v_user)
    ON CONFLICT (organization_id) DO UPDATE
      SET titular = EXCLUDED.titular, iban = EXCLUDED.iban, mb_entidade = EXCLUDED.mb_entidade, mbway = EXCLUDED.mbway,
          sepa_credor = EXCLUDED.sepa_credor, atualizado_em = now(), atualizado_por = v_user;
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION 'Um dos dados de pagamento não é válido.' USING ERRCODE = 'NG009';
  END;

  RETURN public.neg_dados_pagamento_ler(p_org);
END $$;
REVOKE ALL ON FUNCTION public.neg_dados_pagamento_guardar(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_dados_pagamento_guardar(uuid, jsonb) TO authenticated;

-- O portal: só o cliente do negócio (fn_portal_msg_negocio lança se não for).
CREATE OR REPLACE FUNCTION public.portal_neg_dados_pagamento(p_negocio_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_neg public.negocios;
BEGIN
  v_neg := public.fn_portal_msg_negocio(p_negocio_id);
  RETURN (SELECT public.fn_neg_dados_pagamento_json(p) FROM public.negocio_dados_pagamento p WHERE p.organization_id = v_neg.organization_id);
END $$;
REVOKE ALL ON FUNCTION public.portal_neg_dados_pagamento(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_neg_dados_pagamento(uuid) TO authenticated;
