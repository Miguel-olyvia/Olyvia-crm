-- Negócio (2/11/2026): os avisos ao cliente por email (reunião de 2/11: "não recebi informação nenhuma, nem de início de obra, nem
-- que tenho uma fatura para pagar").
--
-- O CRM sabe o que mudou quando grava a vista do cliente (20270103800000). Cada aviso tem uma chave estável que diz o estado
-- (ex.: 'fatura:<id>', 'servico-inicio', 'fase:2', 'auto:AR 2026/1014'). Esta tabela guarda as chaves já avisadas, para cada aviso
-- sair uma só vez, mesmo com vários utilizadores do CRM a abrir o negócio ao mesmo tempo.
--
-- O que muda (a base só cresce; nada se apaga):
--   1. Tabela negocio_avisos_cliente: uma linha por (negócio, chave). Sem políticas: só as funções lêem e escrevem.
--   2. neg_avisos_cliente_registar(org, negocio, avisos): do CRM (as mesmas permissões de neg_vista_cliente_guardar). Recebe a lista
--      de chaves do estado atual e devolve só as novas (as que ninguém registou antes). Na primeira vez de um negócio, regista todas
--      como base e não devolve nenhuma: um negócio antigo não recebe de uma vez os avisos do que já aconteceu.
--   3. neg_avisos_cliente_resultado(org, negocio, chave, enviado, erro): do CRM, depois de tentar o email. Um aviso que falhou fica
--      pendente e volta a sair numa gravação seguinte, 10 minutos depois da última tentativa (até 5; depois fica como falhado).
--      Os 10 minutos também impedem dois utilizadores de enviarem o mesmo aviso ao mesmo tempo.
-- O que muda para a Mudelar: nada. Só se aplica à RH.
SET lock_timeout = '5s';

DO $guarda$
BEGIN
  IF to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: falta fn_cat_pode (20270101340000).';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'negocios_id_org_key') THEN
    RAISE EXCEPTION 'Guarda: falta a chave única negocios (id, organization_id).';
  END IF;
END
$guarda$;

-- 1. A tabela ------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.negocio_avisos_cliente (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id      uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  chave           text        NOT NULL CHECK (char_length(chave) BETWEEN 1 AND 200),
  -- 'base' (já existia na primeira vez), 'pendente' (a enviar), 'enviado', 'falhado' (5 tentativas)
  estado          text        NOT NULL DEFAULT 'pendente' CHECK (estado IN ('base', 'pendente', 'enviado', 'falhado')),
  tentativas      integer     NOT NULL DEFAULT 0,
  erro            text        CHECK (erro IS NULL OR char_length(erro) <= 500),
  criado_em       timestamptz NOT NULL DEFAULT now(),
  enviado_em      timestamptz,
  tentado_em      timestamptz,
  criado_por      uuid,
  CONSTRAINT negocio_avisos_cliente_unico UNIQUE (negocio_id, chave),
  CONSTRAINT negocio_avisos_cliente_negocio_fkey FOREIGN KEY (negocio_id, organization_id) REFERENCES public.negocios (id, organization_id) ON DELETE CASCADE
);
ALTER TABLE public.negocio_avisos_cliente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.negocio_avisos_cliente FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.negocio_avisos_cliente IS 'Negócio: os avisos por email já enviados ao cliente (um por chave de estado). Sem políticas: só neg_avisos_cliente_*. 20270104000000.';

-- 2. Registar as chaves do estado atual e devolver as novas ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_avisos_cliente_registar(p_org uuid, p_negocio_id uuid, p_chaves jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_primeira boolean;
  v_novas    jsonb;
BEGIN
  IF p_org IS NULL OR p_negocio_id IS NULL
     OR NOT (public.fn_cat_pode(p_org, 'pessoas.edit') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = p_negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF p_chaves IS NULL OR jsonb_typeof(p_chaves) IS DISTINCT FROM 'array' OR jsonb_array_length(p_chaves) > 200 THEN
    RAISE EXCEPTION 'Dados inválidos: as chaves dos avisos são uma lista (até 200).' USING ERRCODE = 'NE006';
  END IF;

  -- um negócio de cada vez (dois utilizadores a gravar ao mesmo tempo não enviam o mesmo aviso duas vezes)
  PERFORM pg_advisory_xact_lock(hashtextextended('neg_avisos_cliente:' || p_negocio_id::text, 0));

  v_primeira := NOT EXISTS (SELECT 1 FROM public.negocio_avisos_cliente a WHERE a.negocio_id = p_negocio_id);

  INSERT INTO public.negocio_avisos_cliente (negocio_id, organization_id, chave, estado, criado_por)
  SELECT DISTINCT p_negocio_id, p_org, btrim(c), CASE WHEN v_primeira THEN 'base' ELSE 'pendente' END, public.current_business_user_id()
    FROM jsonb_array_elements_text(p_chaves) AS c
   WHERE char_length(btrim(c)) BETWEEN 1 AND 200
  ON CONFLICT (negocio_id, chave) DO NOTHING;

  -- as novas e as que falharam há mais de 10 minutos, desde que ainda façam parte do estado atual
  WITH sai AS (
    UPDATE public.negocio_avisos_cliente a
       SET tentado_em = now()
     WHERE a.negocio_id = p_negocio_id AND a.organization_id = p_org AND a.estado = 'pendente'
       AND (a.tentado_em IS NULL OR a.tentado_em < now() - interval '10 minutes')
       AND a.chave IN (SELECT btrim(c) FROM jsonb_array_elements_text(p_chaves) AS c)
    RETURNING a.chave
  )
  SELECT COALESCE(jsonb_agg(sai.chave ORDER BY sai.chave), '[]'::jsonb) INTO v_novas FROM sai;

  RETURN jsonb_build_object('primeira', v_primeira, 'novas', v_novas);
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_avisos_cliente_registar(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_avisos_cliente_registar(uuid, uuid, jsonb) TO authenticated;

-- 3. O resultado do envio ------------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neg_avisos_cliente_resultado(p_org uuid, p_negocio_id uuid, p_chave text, p_enviado boolean, p_erro text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_t integer;
BEGIN
  IF p_org IS NULL OR p_negocio_id IS NULL
     OR NOT (public.fn_cat_pode(p_org, 'pessoas.edit') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF p_enviado THEN
    UPDATE public.negocio_avisos_cliente
       SET estado = 'enviado', enviado_em = now(), tentativas = tentativas + 1, erro = NULL
     WHERE negocio_id = p_negocio_id AND organization_id = p_org AND chave = p_chave AND estado = 'pendente';
    RETURN;
  END IF;
  UPDATE public.negocio_avisos_cliente
     SET tentativas = tentativas + 1, erro = left(p_erro, 500)
   WHERE negocio_id = p_negocio_id AND organization_id = p_org AND chave = p_chave AND estado = 'pendente'
  RETURNING tentativas INTO v_t;
  IF v_t >= 5 THEN
    UPDATE public.negocio_avisos_cliente SET estado = 'falhado'
     WHERE negocio_id = p_negocio_id AND organization_id = p_org AND chave = p_chave;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.neg_avisos_cliente_resultado(uuid, uuid, text, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.neg_avisos_cliente_resultado(uuid, uuid, text, boolean, text) TO authenticated;
