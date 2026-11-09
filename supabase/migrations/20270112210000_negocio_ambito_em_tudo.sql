-- ============================================================
-- 20270112210000 negocio_ambito_em_tudo (correções do bloco B da auditoria de permissões, B2 / Negócios F4, F7, F8)
-- ============================================================
-- Problema: o âmbito «só os seus» (pessoas.view / pessoas.edit OWNED ou TEAM) só era aplicado em neg_ler_negocios e na gravação.
--   Prova (ramo RH, 9/11/2026, m_comercial.sql): o comercial com âmbito OWNED vê 0 negócios em neg_ler_negocios, mas
--   * lê diretamente 1805 linhas de negocio_respostas (pagamento, NIF, concorrência) e 382 de negocio_historico (as policies só
--     pedem pessoas.view na organização);
--   * neg_avisos_cliente_registar / neg_avisos_cliente_resultado aceitam um negócio de outro (o técnico gravou «audit-x» num
--     negócio onde não trabalha);
--   * lê e envia mensagens ao cliente e publica a vista do cliente num negócio fora do âmbito (fn_neg_msg_negocio só procura o
--     negócio pelo número; neg_vista_cliente_guardar só verifica que o negócio é da organização).
-- Correção (o mesmo critério de neg_ler_negocios):
--   * fn_neg_negocio_no_ambito(org, negócio, permissão): só-executar (sem pessoas.view, com negocios.obra.executar) -> só as obras
--     onde trabalha (fn_neg_ids_do_tecnico); outros -> fn_neg_no_ambito(negócio, permissão) (tudo para administrador, Papel no
--     Negócio e back-office; senão dono = assigned_to/created_by, mais as obras com tarefa sua).
--   * fn_neg_ids_legiveis(): os negócios que o utilizador lê (como neg_ler_negocios), uma vez por consulta, para as policies.
--   * negocio_respostas_ler / negocio_historico_ler: o que já pediam (administrador de sistema, ou pessoas.view na organização da
--     linha) E o negócio da linha é legível. Nunca alarga: quem não lia continua sem ler.
--   * fn_neg_msg_negocio: só devolve o negócio legível (pessoas.view) -> neg_mensagens_ler e as fotografias da visita
--     (neg_visita_fotos_ler / neg_visita_foto_juntar) recusam fora do âmbito, com a mensagem que já davam.
--   * neg_mensagem_enviar / neg_mensagens_marcar_lidas: e o âmbito de pessoas.edit.
--   * neg_avisos_cliente_registar / neg_avisos_cliente_resultado / neg_vista_cliente_guardar: o âmbito de pessoas.edit (só-executar:
--     as obras onde trabalha).
-- Partiu das definições vivas no ramo RH (uetjghdkwbywbftedtth, 9/11/2026); aborta se alguma mudou. Grants, SECURITY DEFINER e
-- search_path iguais. Sem tabelas nem colunas novas.
-- Reversão (só como migration nova): repor as 6 funções e as 2 policies com o texto de antes; DROP das 2 funções novas.
-- ============================================================
SET lock_timeout = '5s';

DO $g$ BEGIN
  IF md5(pg_get_functiondef('public.fn_neg_msg_negocio(uuid,integer)'::regprocedure)) <> '91cfe5873ace45947c6e93b472d88e85'
     OR md5(pg_get_functiondef('public.neg_mensagem_enviar(uuid,integer,text)'::regprocedure)) <> '0d237ad108207651d9dfedb5dda0e6a0'
     OR md5(pg_get_functiondef('public.neg_mensagens_marcar_lidas(uuid,integer)'::regprocedure)) <> '7ce8de718c3f66c4789fca50c1404502'
     OR md5(pg_get_functiondef('public.neg_avisos_cliente_registar(uuid,uuid,jsonb)'::regprocedure)) <> '60af171ef6a6f942a08c43f93ae07ab1'
     OR md5(pg_get_functiondef('public.neg_avisos_cliente_resultado(uuid,uuid,text,boolean,text)'::regprocedure)) <> 'e1b50dbfb0f9a3499cc959dd8d007b40'
     OR md5(pg_get_functiondef('public.neg_vista_cliente_guardar(uuid,uuid,jsonb)'::regprocedure)) <> '945ad863f3d14fa75e4c3045e4821cc9' THEN
    RAISE EXCEPTION 'Uma das 6 funções mudou desde a leitura (9/11/2026); rever antes de aplicar';
  END IF;
  -- o critério copiado de neg_ler_negocios
  IF md5(pg_get_functiondef('public.neg_ler_negocios(uuid)'::regprocedure)) <> '17e37e654423d324e80328b47e8f698d'
     OR md5(pg_get_functiondef('public.fn_neg_no_ambito(negocios,text)'::regprocedure)) <> 'a9d1d27ea24da84675f5a7194cd2f5a2'
     OR md5(pg_get_functiondef('public.fn_neg_so_execucao(uuid,text)'::regprocedure)) <> 'bdde5e5e6021cddb5dc8ade04cb4847e'
     OR md5(pg_get_functiondef('public.fn_neg_ids_do_tecnico(uuid)'::regprocedure)) <> 'fc1df11d065bdce7acd88680cb5f11a0' THEN
    RAISE EXCEPTION 'O critério de leitura de neg_ler_negocios mudou desde a leitura (9/11/2026); rever antes de aplicar';
  END IF;
  IF (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'negocio_respostas' AND policyname = 'negocio_respostas_ler')
       IS DISTINCT FROM '64e34753cae505a7f8fd7563eedb63bc'
     OR (SELECT md5(qual) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'negocio_historico' AND policyname = 'negocio_historico_ler')
       IS DISTINCT FROM '64e34753cae505a7f8fd7563eedb63bc' THEN
    RAISE EXCEPTION 'As policies de negocio_respostas / negocio_historico mudaram desde a leitura (9/11/2026); rever antes de aplicar';
  END IF;
END $g$;

-- ------------------------------------------------------------------ ajudantes
CREATE OR REPLACE FUNCTION public.fn_neg_negocio_no_ambito(p_org uuid, p_negocio uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270112210000: o negócio está no âmbito do utilizador para p_perm, com o critério de neg_ler_negocios:
  -- só-executar (sem pessoas.view, com negocios.obra.executar) -> as obras onde trabalha; senão fn_neg_no_ambito(negócio, p_perm).
  -- Não verifica a permissão em si (quem chama já a exige).
  SELECT p_org IS NOT NULL AND p_negocio IS NOT NULL AND auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.negocios n
    WHERE n.id = p_negocio AND n.organization_id = p_org AND n.deleted_at IS NULL
      AND CASE WHEN public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN n.id = ANY (public.fn_neg_ids_do_tecnico(p_org))
               ELSE public.fn_neg_no_ambito(n, p_perm) END)
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_negocio_no_ambito(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_neg_ids_legiveis()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- 20270112210000: os negócios que o utilizador da sessão lê, com o critério de neg_ler_negocios (para as policies de
-- negocio_respostas / negocio_historico; calculado uma vez por consulta).
DECLARE
  v_org     uuid;
  v_chaves  text[];
  v_tarefas uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  FOR v_org IN SELECT DISTINCT o FROM public.get_user_visible_org_ids(auth.uid()) AS o WHERE o IS NOT NULL LOOP
    IF public.fn_neg_so_execucao(v_org, 'pessoas.view') THEN
      RETURN QUERY SELECT unnest(public.fn_neg_ids_do_tecnico(v_org));
    ELSIF public.fn_cat_pode(v_org, 'pessoas.view') THEN
      IF public.fn_neg_ambito_tudo(v_org, 'pessoas.view') THEN
        RETURN QUERY SELECT n.id FROM public.negocios n WHERE n.organization_id = v_org;
      ELSE
        v_chaves := public.crm_scope_keys('pessoas.view');
        v_tarefas := public.fn_neg_ids_com_tarefa(v_org);
        RETURN QUERY
          SELECT n.id FROM public.negocios n
          WHERE n.organization_id = v_org
            AND (public.fn_ambito_casa(v_chaves, n.organization_id, ARRAY[n.assigned_to, n.created_by])
                 OR n.id = ANY (v_tarefas));
      END IF;
    END IF;
  END LOOP;
END
$function$;

REVOKE ALL ON FUNCTION public.fn_neg_ids_legiveis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_neg_ids_legiveis() TO authenticated, service_role;

-- ------------------------------------------------------------------ funções (texto vivo + a verificação do âmbito)

CREATE OR REPLACE FUNCTION public.fn_neg_msg_negocio(p_organization_id uuid, p_numero integer)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- 20270112210000: só o negócio que o utilizador lê (o critério de neg_ler_negocios: obras do técnico só-executar; senão o âmbito
  -- de pessoas.view). Fora do âmbito devolve null e quem chama recusa (mensagens, fotografias da visita).
  SELECT n.id FROM public.negocios n WHERE n.organization_id = p_organization_id AND n.numero = p_numero AND n.deleted_at IS NULL
    AND public.fn_neg_negocio_no_ambito(p_organization_id, n.id, 'pessoas.view') LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.neg_mensagem_enviar(p_organization_id uuid, p_numero integer, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_neg   uuid;
  v_texto text := btrim(p_texto);
  v_actor uuid;
  v_nome  text;
  v_m     public.negocio_mensagens;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.edit');
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  -- 20270112210000: escrever ao cliente pede o âmbito de pessoas.edit
  IF NOT public.fn_neg_negocio_no_ambito(p_organization_id, v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF v_texto IS NULL OR char_length(v_texto) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Dados inválidos: a mensagem tem de 1 a 2000 caracteres.' USING ERRCODE = 'NE006';
  END IF;
  v_actor := public.current_business_user_id();
  SELECT u.name INTO v_nome FROM public.anew_users u WHERE u.id = v_actor;
  INSERT INTO public.negocio_mensagens (organization_id, negocio_id, autor_tipo, autor_nome, autor_user_id, autor_auth_id, texto)
  VALUES (p_organization_id, v_neg, 'empresa', COALESCE(NULLIF(btrim(v_nome), ''), 'Equipa'), v_actor, auth.uid(), v_texto)
  RETURNING * INTO v_m;
  RETURN public.fn_neg_msg_json(v_m);
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_mensagens_marcar_lidas(p_organization_id uuid, p_numero integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_neg uuid; v_n integer;
BEGIN
  IF p_organization_id IS NULL OR p_numero IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  PERFORM public.fn_cat_exigir(p_organization_id, 'pessoas.edit');
  v_neg := public.fn_neg_msg_negocio(p_organization_id, p_numero);
  IF v_neg IS NULL THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit).' USING ERRCODE = 'CT001';
  END IF;
  -- 20270112210000: marcar como lidas pede o âmbito de pessoas.edit
  IF NOT public.fn_neg_negocio_no_ambito(p_organization_id, v_neg, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  UPDATE public.negocio_mensagens SET lida_em = now() WHERE negocio_id = v_neg AND autor_tipo = 'cliente' AND lida_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

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
  -- 20270112210000: só num negócio do seu âmbito (só-executar: as obras onde trabalha; senão o âmbito de pessoas.edit)
  IF NOT public.fn_neg_negocio_no_ambito(p_org, p_negocio_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
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
  -- 20270112210000: só num negócio do seu âmbito (só-executar: as obras onde trabalha; senão o âmbito de pessoas.edit)
  IF NOT public.fn_neg_negocio_no_ambito(p_org, p_negocio_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
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

CREATE OR REPLACE FUNCTION public.neg_vista_cliente_guardar(p_org uuid, p_negocio_id uuid, p_vista jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_marca text;
  v_n     integer;
  v_velha jsonb;
BEGIN
  -- 20270111100000: a vista do cliente é publicada por quem lê o negócio inteiro; com a leitura reduzida (sem pessoas.view, com
  -- negocios.obra.executar) a vista sairia sem a proposta, o contrato e os pagamentos
  IF p_org IS NOT NULL AND public.fn_neg_so_execucao(p_org, 'pessoas.view') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.view): a vista do cliente é publicada por quem vê o negócio inteiro.' USING ERRCODE = 'CT001';
  END IF;
  IF p_org IS NULL OR p_negocio_id IS NULL
     OR NOT (public.fn_cat_pode(p_org, 'pessoas.edit') OR public.fn_cat_pode(p_org, 'negocios.obra.planear') OR public.fn_cat_pode(p_org, 'negocios.obra.executar')) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.negocios n WHERE n.id = p_negocio_id AND n.organization_id = p_org AND n.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra).' USING ERRCODE = 'CT001';
  END IF;
  -- 20270112210000: só num negócio do seu âmbito (só-executar: as obras onde trabalha; senão o âmbito de pessoas.edit)
  IF NOT public.fn_neg_negocio_no_ambito(p_org, p_negocio_id, 'pessoas.edit') THEN
    RAISE EXCEPTION 'Sem permissão (pessoas.edit ou negocios.obra): este negócio está fora do seu âmbito.' USING ERRCODE = 'CT001';
  END IF;
  IF p_vista IS NULL OR jsonb_typeof(p_vista) IS DISTINCT FROM 'object' OR jsonb_typeof(p_vista -> 'd') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente tem de ter o negócio (d).' USING ERRCODE = 'NE006';
  END IF;
  -- sem o estado dos materiais (quem gravou não tinha as encomendas carregadas): fica o da vista gravada, se for a mesma encomenda
  IF NOT (p_vista ? 'ec') THEN
    SELECT x.vista INTO v_velha FROM public.negocio_vista_cliente x WHERE x.negocio_id = p_negocio_id AND x.organization_id = p_org;
    IF v_velha ? 'ec' AND (v_velha #>> '{d,obra,ec,ref}') IS NOT NULL AND (v_velha #>> '{d,obra,ec,ref}') = (p_vista #>> '{d,obra,ec,ref}') THEN
      p_vista := p_vista || jsonb_build_object('ec', v_velha -> 'ec');
    END IF;
  END IF;
  IF octet_length(p_vista::text) > 6 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Dados inválidos: a vista do cliente passa de 6 MB.' USING ERRCODE = 'NE006';
  END IF;
  v_marca := md5(p_vista::text);
  INSERT INTO public.negocio_vista_cliente AS x (negocio_id, organization_id, vista, marca, atualizada_em, atualizada_por)
  VALUES (p_negocio_id, p_org, p_vista, v_marca, now(), public.current_business_user_id())
  ON CONFLICT (negocio_id) DO UPDATE
     SET vista = EXCLUDED.vista, marca = EXCLUDED.marca, atualizada_em = now(), atualizada_por = EXCLUDED.atualizada_por
   WHERE x.marca IS DISTINCT FROM EXCLUDED.marca AND x.organization_id = EXCLUDED.organization_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('gravada', v_n > 0, 'marca', v_marca);
END;
$function$;

-- ------------------------------------------------------------------ policies (o que já pediam E o negócio é legível)
-- O negócio legível vem primeiro: é uma só consulta (hashed) e poupa a verificação por linha de has_anew_permission_in_org
-- nas linhas de negócios fora do âmbito.
DROP POLICY IF EXISTS negocio_respostas_ler ON public.negocio_respostas;
CREATE POLICY negocio_respostas_ler ON public.negocio_respostas
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (negocio_id IN (SELECT public.fn_neg_ids_legiveis())
        AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id)));

DROP POLICY IF EXISTS negocio_historico_ler ON public.negocio_historico;
CREATE POLICY negocio_historico_ler ON public.negocio_historico
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (negocio_id IN (SELECT public.fn_neg_ids_legiveis())
        AND public.has_anew_permission_in_org((SELECT auth.uid()), 'pessoas.view', organization_id)));
