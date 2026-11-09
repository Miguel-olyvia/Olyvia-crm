-- Visita do negócio (9/11/2026): as fotografias tiradas na visita passam a ser fotografias a sério.
--
-- Até aqui o botão «Tirar foto» de cada etapa (exterior, interior, área de intervenção) só somava um número (negocio_medidas.fotos_*).
-- Pedido do Rúben: no telemóvel, tirar a fotografia com a câmara e guardá-la no negócio.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Tabela negocio_visita_fotos: uma linha por fotografia, com a etapa e os bytes (bytea, até 1,5 MB; JPEG, PNG ou WebP).
--      RLS activa e SEM políticas, sem privilégios para anon nem authenticated: só as funções abaixo lêem e escrevem (como as fotografias
--      da conversa, 20270105400000). Não se usa o Storage.
--   2. Funções (por organização e número do negócio, como a conversa):
--      · neg_visita_fotos_ler(organização, número): a lista [{id, etapa, em}] pela ordem em que foram tiradas. pessoas.view.
--      · neg_visita_foto(organização, foto): uma fotografia {id, mime, b64}. pessoas.view.
--      · neg_visita_foto_juntar(organização, número, etapa, {mime, b64}): grava e devolve {id, etapa, em}. pessoas.edit ou negocios.visita.gerir.
--      · neg_visita_foto_apagar(organização, foto): apaga uma fotografia. pessoas.edit ou negocios.visita.gerir.
--   Limites: até 1,5 MB cada (a app reduz a 1600 px antes de enviar); até 60 por negócio.
--   Os números de sempre (fotos_total, fotos_exterior, …) continuam a ser gravados pela app com o negócio: é o que conta para fechar a visita.
--
-- Reutiliza fn_neg_msg_foto_bytes (20270105400000) para validar os bytes, fn_neg_msg_negocio (20270101430000) e fn_cat_exigir_uma
-- (20270101340000). O que muda para a Mudelar: nada. Esta migration só se aplica à RH.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_neg_msg_foto_bytes(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta fn_neg_msg_foto_bytes (migration 20270105400000_negocio_mensagens_fotos.sql).';
  END IF;
  IF to_regprocedure('public.fn_neg_msg_negocio(uuid,integer)') IS NULL OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_neg_msg_negocio, fn_cat_exigir ou fn_cat_exigir_uma.';
  END IF;
END
$guarda$;

-- 1. A tabela ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negocio_visita_fotos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  negocio_id      uuid        NOT NULL,
  etapa           text        NOT NULL CHECK (etapa IN ('exterior', 'interior', 'area')),
  mime            text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  dados           bytea       NOT NULL CHECK (octet_length(dados) BETWEEN 100 AND 1572864),
  created_by      uuid        DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT negocio_visita_fotos_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS negocio_visita_fotos_negocio_idx ON public.negocio_visita_fotos (negocio_id, created_at);
ALTER TABLE public.negocio_visita_fotos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_visita_fotos FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_visita_fotos IS 'Negócio: as fotografias da visita por etapa (exterior, interior, area). Sem políticas: só as funções neg_visita_foto*. 20270110400000.';

-- 2. Ler a lista -----------------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_visita_fotos_ler(p_organization_id uuid, p_numero integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_neg uuid;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.view');
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'etapa', f.etapa, 'em', f.created_at) ORDER BY f.created_at, f.id)
                     FROM public.negocio_visita_fotos f WHERE f.negocio_id = v_neg), '[]'::jsonb);
END;
$function$;

-- 3. Ler uma fotografia ----------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_visita_foto(p_organization_id uuid, p_foto_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.negocio_visita_fotos;
BEGIN
  IF p_organization_id IS NULL OR p_foto_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.view');
  SELECT x.* INTO f FROM public.negocio_visita_fotos x
    JOIN public.negocios n ON n.id = x.negocio_id AND n.deleted_at IS NULL
   WHERE x.id = p_foto_id AND x.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN jsonb_build_object('id', f.id, 'mime', f.mime, 'b64', translate(encode(f.dados, 'base64'), E'\n\r', ''));
END;
$function$;

-- 4. Juntar uma fotografia -------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_visita_foto_juntar(p_organization_id uuid, p_numero integer, p_etapa text, p_foto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_neg uuid; v_b bytea; v_id uuid; v_em timestamptz;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir_uma(p_organization_id, ARRAY['pessoas.edit', 'negocios.visita.gerir']);
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir).' USING ERRCODE = 'CT001';
  END IF;
  IF p_etapa IS NULL OR p_etapa NOT IN ('exterior', 'interior', 'area') THEN
    RAISE EXCEPTION 'Dados inválidos: a etapa da fotografia é exterior, interior ou area.' USING ERRCODE = 'NE006';
  END IF;
  IF (SELECT count(*) FROM public.negocio_visita_fotos WHERE negocio_id = v_neg) >= 60 THEN
    RAISE EXCEPTION 'Este negócio já tem 60 fotografias da visita. Apague alguma antes de juntar outra.' USING ERRCODE = 'NE006';
  END IF;
  v_b := public.fn_neg_msg_foto_bytes(p_foto);
  INSERT INTO public.negocio_visita_fotos (organization_id, negocio_id, etapa, mime, dados)
  VALUES (p_organization_id, v_neg, p_etapa, p_foto->>'mime', v_b)
  RETURNING id, created_at INTO v_id, v_em;
  RETURN jsonb_build_object('id', v_id, 'etapa', p_etapa, 'em', v_em);
END;
$function$;

-- 5. Apagar uma fotografia -------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_visita_foto_apagar(p_organization_id uuid, p_foto_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_organization_id IS NULL OR p_foto_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (negocios.visita.gerir).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir_uma(p_organization_id, ARRAY['pessoas.edit', 'negocios.visita.gerir']);
  DELETE FROM public.negocio_visita_fotos WHERE id = p_foto_id AND organization_id = p_organization_id;
  RETURN FOUND;
END;
$function$;

-- 6. Privilégios: só utilizadores com sessão; nunca anon ------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.neg_visita_fotos_ler(uuid, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_visita_foto(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_visita_foto_juntar(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_visita_foto_apagar(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_visita_fotos_ler(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_visita_foto(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_visita_foto_juntar(uuid, integer, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_visita_foto_apagar(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.neg_visita_fotos_ler(uuid, integer) IS 'Negócio: as fotografias da visita [{id, etapa, em}]. pessoas.view. 20270110400000.';
COMMENT ON FUNCTION public.neg_visita_foto(uuid, uuid) IS 'Negócio: uma fotografia da visita {id, mime, b64}. pessoas.view. 20270110400000.';
COMMENT ON FUNCTION public.neg_visita_foto_juntar(uuid, integer, text, jsonb) IS 'Negócio: junta uma fotografia ({mime, b64}) a uma etapa da visita. pessoas.edit ou negocios.visita.gerir. 20270110400000.';
COMMENT ON FUNCTION public.neg_visita_foto_apagar(uuid, uuid) IS 'Negócio: apaga uma fotografia da visita. pessoas.edit ou negocios.visita.gerir. 20270110400000.';

-- 7. Verificação final ------------------------------------------------------------------------------------------------------------------------
DO $verifica$
BEGIN
  IF to_regclass('public.negocio_visita_fotos') IS NULL THEN RAISE EXCEPTION 'Verificação: a tabela negocio_visita_fotos não ficou criada.'; END IF;
  IF has_function_privilege('anon', 'public.neg_visita_foto_juntar(uuid,integer,text,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.neg_visita_foto_juntar(uuid,integer,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Verificação: os privilégios de neg_visita_foto_juntar não ficaram certos.';
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
