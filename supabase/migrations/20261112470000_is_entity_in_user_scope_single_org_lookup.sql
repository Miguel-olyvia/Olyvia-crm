-- ============================================================================
-- Performance: is_entity_in_user_scope() passa a resolver
-- get_user_visible_org_ids() UMA vez por chamada em vez de quatro.
--
-- CONTEXTO MEDIDO. As policies de SELECT de anew_entity_emails e
-- anew_entity_phones sao ambas is_entity_in_user_scope(entity_id, auth.uid()).
-- Na pagina de Propostas da maior organizacao, com utilizador real:
--   anew_entity_emails   1270 ms  (1177 ms de espera no servidor, 40 kB)
--   anew_entity_phones   1209 ms  (1097 ms de espera no servidor, 37 kB)
-- O custo e processamento, nao transferencia.
--
-- A definicao anterior era SQL e repetia
--   (SELECT get_user_visible_org_ids(_auth_uid))
-- em QUATRO subqueries independentes (anew_contacts, anew_leads,
-- anew_clients, anew_organizations). Como a funcao e SECURITY DEFINER, o
-- planeador nao a pode inline, pelo que corre como caixa negra por cada
-- linha -- e dentro dela a travessia de organizacoes repete-se 4x.
--
-- Esta versao passa a plpgsql e guarda o resultado numa variavel local,
-- reduzindo a travessia a uma unica execucao por chamada.
--
-- SEMANTICA PRESERVADA. Mantem-se:
--   - SECURITY DEFINER (essencial: os EXISTS internos leem anew_contacts,
--     anew_leads, anew_clients e anew_organizations com privilegio elevado,
--     contornando o RLS dessas tabelas. Sem isto o resultado mudava e podia
--     haver recursao entre policies. NAO se inline esta logica dentro de uma
--     policy, precisamente por esta razao.)
--   - STABLE, e o SET search_path = public
--   - os CINCO ramos, com as MESMAS condicoes, incluindo a comparacao
--     `e.created_by = _auth_uid` exatamente como estava. Essa comparacao poe
--     em confronto um business user id com um auth user id e provavelmente
--     nunca acerta, mas o ramo seguinte (join a anew_users por auth_user_id)
--     e que cobre o caso do criador. NAO se corrige aqui: seria alteracao de
--     comportamento a coberto de uma migration de performance.
--
-- A cadeia e um OR puro, pelo que a ordem dos ramos nao altera o resultado.
-- Os ramos por organizacao vem primeiro por serem os que efetivamente
-- acertam: das 438 entidades referidas pelas propostas da maior organizacao,
-- 407 tem lead e 386 tem contacto.
--
-- Verificacao: contagem de linhas visiveis em anew_entity_emails e
-- anew_entity_phones, para dois utilizadores reais, antes e depois -- tem de
-- ser identica.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_entity_in_user_scope(_entity_id uuid, _auth_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visible uuid[];
BEGIN
  IF _entity_id IS NULL OR _auth_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Uma unica travessia de organizacoes por chamada (antes: quatro).
  SELECT ARRAY(SELECT public.get_user_visible_org_ids(_auth_uid))
  INTO v_visible;

  IF EXISTS (
    SELECT 1 FROM public.anew_contacts c
    WHERE c.entity_id = _entity_id
      AND c.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_leads l
    WHERE l.entity_id = _entity_id
      AND l.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_clients cl
    WHERE cl.entity_id = _entity_id
      AND cl.organization_id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_organizations o
    WHERE o.entity_id = _entity_id
      AND o.id = ANY(COALESCE(v_visible, ARRAY[]::uuid[]))
  ) THEN
    RETURN true;
  END IF;

  -- Ramo do criador, mantido palavra por palavra (ver nota acima sobre
  -- `e.created_by = _auth_uid`).
  IF EXISTS (
    SELECT 1 FROM public.anew_entities e
    WHERE e.id = _entity_id
      AND (
        e.created_by = _auth_uid
        OR EXISTS (
          SELECT 1 FROM public.anew_users au
          WHERE au.auth_user_id = _auth_uid
            AND e.created_by = au.id
        )
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
