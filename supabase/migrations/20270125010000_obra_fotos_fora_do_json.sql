-- ============================================================
-- 20270125010000 obra_fotos_fora_do_json
-- ============================================================
-- Auditoria de 19/11/2026 (Lote 3, dados, achado 1): as fotografias da obra iam em base64 dentro do JSON da obra.
--
-- O problema: cada fotografia tirada na obra (o registo do técnico, «dar por feita», os imprevistos, o Estúdio da obra) era reduzida a
-- 480 px e guardada como data URL dentro de ops_obra.estado_emylia. A mesma imagem ficava até três vezes (exec.fotos, envios[].fotos e o
-- diário), o ecrã deitava fora as mais antigas sem avisar (.slice(-4)) e a obra relê-se de 20 em 20 segundos com as fotografias dentro.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Tabela negocio_obra_fotos: uma linha por fotografia da obra, com os bytes (bytea, até 1,5 MB; JPEG, PNG ou WebP). É o mesmo
--      caminho das fotografias da visita (20270110400000) e da conversa (20270105400000): RLS activa e SEM políticas, sem privilégios
--      para anon nem authenticated; só as funções abaixo lêem e escrevem. Não se usa o Storage (o projeto não o usa para as fotografias
--      do negócio: as da visita e da conversa também vivem em tabelas, pelas funções).
--      No JSON da obra fica só a referência «obrafoto:<id>» (45 caracteres em vez de ~40 KB).
--   2. Funções (por organização e número do negócio, como a visita):
--      · neg_obra_foto_juntar(organização, número, {mime, b64}) → {id, ref, em}. Quem grava a obra: pessoas.edit, negocios.obra.planear
--        ou negocios.obra.executar, no âmbito de pessoas.edit (o técnico só-executar: só as obras onde trabalha, fn_neg_negocio_no_ambito).
--      · neg_obra_foto(organização, foto) → {id, mime, b64}. Quem lê a obra: pessoas.view, ou o técnico só-executar nas obras dele.
--      · neg_obra_foto_apagar(organização, foto): só quem a juntou, e só enquanto a obra gravada não a usa (a fotografia escolhida e tirada
--        antes de enviar o registo). Uma fotografia já registada na obra é prova e não se apaga por aqui.
--      · portal_neg_obra_foto(foto) → {id, mime, b64}: o cliente lê uma fotografia de um negócio dele, só se a vista do cliente publicada
--        (negocio_vista_cliente) a mostrar (as correções e as notas internas não vão para a vista).
--   Limites: até 1,5 MB cada (a app reduz a 1600 px antes de enviar: é prova para o auto de receção); até 500 por negócio, com uma
--   mensagem clara quando se chega lá. Sem limite escondido de 4.
--   As fotografias antigas (data URL dentro do JSON) continuam a ver-se: a app mostra-as como estão; só as novas vão para a tabela.
--
-- Reutiliza fn_neg_msg_foto_bytes (20270105400000), fn_neg_msg_negocio e fn_neg_negocio_no_ambito (20270112210000),
-- fn_neg_so_execucao (20270111100000), fn_portal_msg_negocio (20270101430000), fn_cat_exigir e fn_cat_exigir_uma.
-- Não mexe em obra_guardar_negocio, obra_ler_negocios nem neg_vista_cliente_guardar.
--
-- Reversão (só como migration nova; as obras gravadas depois disto ficam com referências que a app antiga não sabe mostrar):
--   DROP FUNCTION public.portal_neg_obra_foto(uuid), public.neg_obra_foto_apagar(uuid, uuid), public.neg_obra_foto(uuid, uuid),
--     public.neg_obra_foto_juntar(uuid, integer, jsonb); DROP TABLE public.negocio_obra_fotos;
-- ============================================================
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_neg_msg_foto_bytes(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta fn_neg_msg_foto_bytes (migration 20270105400000_negocio_mensagens_fotos.sql).';
  END IF;
  IF to_regprocedure('public.fn_neg_msg_negocio(uuid,integer)') IS NULL OR to_regprocedure('public.fn_neg_negocio_no_ambito(uuid,uuid,text)') IS NULL
     OR to_regprocedure('public.fn_neg_so_execucao(uuid,text)') IS NULL OR to_regprocedure('public.fn_portal_msg_negocio(uuid)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL OR to_regprocedure('public.fn_cat_exigir_uma(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_neg_msg_negocio, fn_neg_negocio_no_ambito, fn_neg_so_execucao, fn_portal_msg_negocio, fn_cat_exigir ou fn_cat_exigir_uma.';
  END IF;
  IF to_regclass('public.ops_obra') IS NULL OR to_regclass('public.negocio_vista_cliente') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam as tabelas ops_obra ou negocio_vista_cliente.';
  END IF;
END
$guarda$;

-- 1. A tabela ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negocio_obra_fotos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL,
  negocio_id      uuid        NOT NULL,
  mime            text        NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  dados           bytea       NOT NULL CHECK (octet_length(dados) BETWEEN 100 AND 1572864),
  created_by      uuid        DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT negocio_obra_fotos_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS negocio_obra_fotos_negocio_idx ON public.negocio_obra_fotos (negocio_id, created_at);
ALTER TABLE public.negocio_obra_fotos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_obra_fotos FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_obra_fotos IS 'Negócio: as fotografias da obra (registos, imprevistos, Estúdio da obra). No JSON da obra fica só «obrafoto:<id>». Sem políticas: só as funções neg_obra_foto* e portal_neg_obra_foto. 20270125010000.';

-- 2. Juntar uma fotografia -------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_obra_foto_juntar(p_organization_id uuid, p_numero integer, p_foto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_neg uuid; v_b bytea; v_id uuid; v_em timestamptz;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.executar).' USING ERRCODE = 'CT001';
  END IF;
  -- quem grava a obra (obra_guardar_negocio): pessoas.edit, o Gestor de obra ou o técnico
  PERFORM public.fn_cat_exigir_uma(p_organization_id, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  -- o negócio que lê (o técnico só-executar: as obras onde trabalha) e no âmbito de quem grava
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL OR NOT public.fn_neg_negocio_no_ambito(p_organization_id, v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.executar): esta obra está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF (SELECT count(*) FROM public.negocio_obra_fotos WHERE negocio_id = v_neg) >= 500 THEN
    RAISE EXCEPTION 'Esta obra já tem 500 fotografias guardadas. Fale com o Gestor de obra antes de juntar mais.' USING ERRCODE = 'NE006';
  END IF;
  v_b := public.fn_neg_msg_foto_bytes(p_foto);
  INSERT INTO public.negocio_obra_fotos (organization_id, negocio_id, mime, dados)
  VALUES (p_organization_id, v_neg, p_foto->>'mime', v_b)
  RETURNING id, created_at INTO v_id, v_em;
  RETURN jsonb_build_object('id', v_id, 'ref', 'obrafoto:' || v_id::text, 'em', v_em);
END;
$function$;

-- 3. Ler uma fotografia (a equipa) -----------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_obra_foto(p_organization_id uuid, p_foto_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.negocio_obra_fotos;
BEGIN
  IF p_organization_id IS NULL OR p_foto_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  -- quem lê a obra (obra_ler_negocios): pessoas.view, ou o técnico só-executar (só as obras onde trabalha, abaixo)
  IF NOT public.fn_neg_so_execucao(p_organization_id, 'pessoas.view') THEN
    PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.view');
  END IF;
  SELECT x.* INTO f FROM public.negocio_obra_fotos x
    JOIN public.negocios n ON n.id = x.negocio_id AND n.deleted_at IS NULL
   WHERE x.id = p_foto_id AND x.organization_id = p_organization_id;
  IF NOT FOUND OR NOT public.fn_neg_negocio_no_ambito(p_organization_id, f.negocio_id, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view).' USING ERRCODE = 'CT001';
  END IF;
  RETURN jsonb_build_object('id', f.id, 'mime', f.mime, 'b64', translate(encode(f.dados, 'base64'), E'\n\r', ''));
END;
$function$;

-- 4. Apagar uma fotografia ainda por registar ------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_obra_foto_apagar(p_organization_id uuid, p_foto_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.negocio_obra_fotos;
BEGIN
  IF p_organization_id IS NULL OR p_foto_id IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (negocios.obra.executar).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir_uma(p_organization_id, ARRAY['pessoas.edit', 'negocios.obra.planear', 'negocios.obra.executar']);
  SELECT * INTO f FROM public.negocio_obra_fotos WHERE id = p_foto_id AND organization_id = p_organization_id FOR UPDATE;
  -- só quem a juntou (a pré-visualização tirada antes de enviar o registo)
  IF NOT FOUND OR f.created_by IS DISTINCT FROM auth.uid() THEN
    RETURN false;
  END IF;
  -- já registada na obra (ou mostrada ao cliente): é prova, fica
  IF EXISTS (SELECT 1 FROM public.ops_obra o WHERE o.negocio_id = f.negocio_id AND position(('obrafoto:' || f.id::text) IN o.estado_emylia::text) > 0)
     OR EXISTS (SELECT 1 FROM public.negocio_vista_cliente v WHERE v.negocio_id = f.negocio_id AND position(('obrafoto:' || f.id::text) IN v.vista::text) > 0) THEN
    RETURN false;
  END IF;
  DELETE FROM public.negocio_obra_fotos WHERE id = f.id;
  RETURN true;
END;
$function$;

-- 5. Ler uma fotografia (o cliente, no portal) -----------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_neg_obra_foto(p_foto_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f public.negocio_obra_fotos;
BEGIN
  SELECT * INTO f FROM public.negocio_obra_fotos WHERE id = p_foto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'CT001';
  END IF;
  -- o negócio é do cliente da sessão (a conta do portal)
  PERFORM public.fn_portal_msg_negocio(f.negocio_id);
  -- e a fotografia está na vista que a equipa publicou para ele
  IF NOT EXISTS (SELECT 1 FROM public.negocio_vista_cliente v
                  WHERE v.negocio_id = f.negocio_id AND position(('obrafoto:' || f.id::text) IN v.vista::text) > 0) THEN
    RAISE EXCEPTION 'Negócio indisponível.' USING ERRCODE = 'CT001';
  END IF;
  RETURN jsonb_build_object('id', f.id, 'mime', f.mime, 'b64', translate(encode(f.dados, 'base64'), E'\n\r', ''));
END;
$function$;

-- 6. Privilégios: só utilizadores com sessão; nunca anon ------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.neg_obra_foto_juntar(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_obra_foto(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neg_obra_foto_apagar(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_neg_obra_foto(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_obra_foto_juntar(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_obra_foto(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_obra_foto_apagar(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_neg_obra_foto(uuid) TO authenticated;

COMMENT ON FUNCTION public.neg_obra_foto_juntar(uuid, integer, jsonb) IS 'Obra: junta uma fotografia ({mime, b64}) e devolve {id, ref, em}; no JSON da obra fica a ref «obrafoto:<id>». pessoas.edit, negocios.obra.planear ou negocios.obra.executar, no âmbito. 20270125010000.';
COMMENT ON FUNCTION public.neg_obra_foto(uuid, uuid) IS 'Obra: uma fotografia {id, mime, b64}. pessoas.view, ou o técnico nas obras onde trabalha. 20270125010000.';
COMMENT ON FUNCTION public.neg_obra_foto_apagar(uuid, uuid) IS 'Obra: apaga uma fotografia que quem chama juntou e que a obra gravada ainda não usa. 20270125010000.';
COMMENT ON FUNCTION public.portal_neg_obra_foto(uuid) IS 'Portal: uma fotografia da obra {id, mime, b64}, de um negócio da conta e mostrada na vista do cliente publicada. 20270125010000.';

-- 7. Verificação final ------------------------------------------------------------------------------------------------------------------------
DO $verifica$
DECLARE v_n integer;
BEGIN
  IF to_regclass('public.negocio_obra_fotos') IS NULL THEN RAISE EXCEPTION 'Verificação: a tabela negocio_obra_fotos não ficou criada.'; END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.negocio_obra_fotos'::regclass) THEN
    RAISE EXCEPTION 'Verificação: negocio_obra_fotos ficou sem RLS.';
  END IF;
  IF has_table_privilege('anon', 'public.negocio_obra_fotos', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public.negocio_obra_fotos', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Verificação: negocio_obra_fotos ficou com privilégios directos para anon ou authenticated.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('neg_obra_foto_juntar', 'neg_obra_foto', 'neg_obra_foto_apagar', 'portal_neg_obra_foto')
     AND p.prosecdef AND has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Verificação: as funções das fotografias da obra não ficaram só para authenticated (esperadas 4, certas %).', v_n;
  END IF;
END
$verifica$;

NOTIFY pgrst, 'reload schema';
