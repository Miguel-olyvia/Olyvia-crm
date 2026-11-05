-- ============================================================
-- 20270107200000_pessoa_apagar_ligacoes_e_lixo
-- ============================================================
-- O que faz (aprovado pelo utilizador, 05/11/2026): apagar uma lead ou um cliente quando há um engano, com aviso do que
-- está ligado, e restaurar no Lixo (separador «Pessoas»). Só funções de LEITURA novas; a escrita continua a ser
-- neg_apagar_pessoa (20261228200000, 1.6.9), que NÃO se toca: soft delete, NG011 com negócios abertos, restaura com
-- p_apagar=false. A base não recusa por haver contratos, encomendas, faturas ou propostas aceites: o ecrã avisa.
--
-- A) neg_pessoa_ligacoes(org, pessoa): contagens do que está ligado à pessoa, para o aviso antes de apagar.
--    Mesmas verificações de neg_apagar_pessoa (sessão, pessoas.delete, organização com Pessoas ativa, âmbito 'delete'
--    de fn_neg_pessoa_no_ambito, que pede leads.delete ou clients.delete conforme client_since; NG003 sem âmbito).
--    Tabelas (confirmadas no texto vivo a 05/11/2026):
--      contratos   client_contracts.entity_id, status signed/active, sem deleted_at nem cancelled_at
--      encomendas  client_contracts com order_number (a EC), sem deleted_at nem cancelled_at
--      faturas     faturas.negocio_id -> negocios.entity_id, estado <> 'anulada'
--      pagamentos  pagamentos.fatura_id -> faturas acima, sem recusado_motivo
--      propostas   proposals.entity_id, status 'accepted', sem deleted_at e is_deleted false
--      negócios    negocios.entity_id, sem deleted_at, por estado (aberto, ganho, perdido)
--      visitas     schedule_items (entity_id da pessoa ou negocio_id de um negócio dela), início >= now(),
--                  status fora de cancelled/completed
--      portal      client_portal_users.entity_id
--
-- B) neg_pessoas_apagadas(org): as anew_entities apagadas da organização que o utilizador pode restaurar (o mesmo âmbito
--    'delete'). A policy anew_entities_ligada_select não filtra deleted_at nem segue o âmbito de delete, por isso a lista
--    não se lê da tabela. Sem pessoas.delete devolve lista vazia (o Lixo mostra-se a quem tem trash.view).
--
-- Sem tabelas, colunas, policies ou alterações a funções existentes.
-- Reversão (só como migration nova): DROP FUNCTION public.neg_pessoa_ligacoes(uuid, uuid);
--                                    DROP FUNCTION public.neg_pessoas_apagadas(uuid);
-- ============================================================

SET lock_timeout = '5s';

-- A) O que está ligado à pessoa
CREATE OR REPLACE FUNCTION public.neg_pessoa_ligacoes(p_organization_id uuid, p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: organização ou pessoa.' USING ERRCODE = 'NG009';
  END IF;
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.delete') THEN
    RAISE EXCEPTION 'Sem permissão para apagar esta pessoa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.fn_neg_exigir_config(p_organization_id);
  IF NOT public.fn_neg_pessoa_no_ambito(p_organization_id, p_entity_id, 'delete') THEN
    RAISE EXCEPTION 'Pessoa indisponível.' USING ERRCODE = 'NG003';
  END IF;

  WITH neg AS (
    SELECT n.id, n.estado, n.deleted_at
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id
  ), fat AS (
    SELECT f.id
    FROM public.faturas f
    WHERE f.organization_id = p_organization_id
      AND f.negocio_id IN (SELECT neg.id FROM neg)
      AND f.estado <> 'anulada'
  )
  SELECT jsonb_build_object(
    'contratos', (SELECT count(*) FROM public.client_contracts c
                  WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
                    AND c.deleted_at IS NULL AND c.cancelled_at IS NULL AND c.status IN ('signed', 'active')),
    'encomendas', (SELECT count(*) FROM public.client_contracts c
                   WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id
                     AND c.deleted_at IS NULL AND c.cancelled_at IS NULL AND c.order_number IS NOT NULL),
    'faturas', (SELECT count(*) FROM fat),
    'pagamentos', (SELECT count(*) FROM public.pagamentos pg
                   WHERE pg.organization_id = p_organization_id AND pg.fatura_id IN (SELECT fat.id FROM fat)
                     AND pg.recusado_motivo IS NULL),
    'propostas_aceites', (SELECT count(*) FROM public.proposals p
                          WHERE p.organization_id = p_organization_id AND p.entity_id = p_entity_id
                            AND p.status = 'accepted' AND p.deleted_at IS NULL AND p.is_deleted IS NOT TRUE),
    'negocios_abertos', (SELECT count(*) FROM neg WHERE neg.estado = 'aberto' AND neg.deleted_at IS NULL),
    'negocios_ganhos', (SELECT count(*) FROM neg WHERE neg.estado = 'ganho' AND neg.deleted_at IS NULL),
    'negocios_perdidos', (SELECT count(*) FROM neg WHERE neg.estado = 'perdido' AND neg.deleted_at IS NULL),
    'visitas_futuras', (SELECT count(*) FROM public.schedule_items s
                        WHERE s.organization_id = p_organization_id
                          AND (s.entity_id = p_entity_id OR s.negocio_id IN (SELECT neg.id FROM neg))
                          AND s.start_datetime >= now()
                          AND s.status NOT IN ('cancelled', 'completed')),
    'portal', (SELECT count(*) FROM public.client_portal_users u
               WHERE u.organization_id = p_organization_id AND u.entity_id = p_entity_id)
  ) INTO v_res;

  RETURN v_res;
END;
$function$;

COMMENT ON FUNCTION public.neg_pessoa_ligacoes(uuid, uuid) IS
  'Leitura: contagens do que está ligado a uma pessoa (contratos, encomendas, faturas, pagamentos, propostas aceites, negócios, visitas futuras, portal), para o aviso antes de apagar. Mesmas verificações de neg_apagar_pessoa.';

REVOKE ALL ON FUNCTION public.neg_pessoa_ligacoes(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_pessoa_ligacoes(uuid, uuid) TO authenticated;

-- B) As pessoas apagadas que o utilizador pode restaurar
CREATE OR REPLACE FUNCTION public.neg_pessoas_apagadas(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão sem utilizador.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Valor inválido: organização.' USING ERRCODE = 'NG009';
  END IF;
  -- Quem não pode apagar também não restaura: a lista fica vazia (sem erro, o Lixo mostra-se a quem tem trash.view).
  IF NOT public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.delete') THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', e.id,
             'nome', COALESCE(NULLIF(btrim(e.display_name), ''), NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), '')),
             'cliente', e.client_since IS NOT NULL,
             'apagada_em', e.deleted_at,
             'apagada_por', u.name
           ) ORDER BY e.deleted_at DESC, e.id)
    FROM (
      SELECT x.*
      FROM public.anew_entities x
      WHERE x.organization_id = p_organization_id
        AND x.deleted_at IS NOT NULL
        AND public.fn_neg_pessoa_no_ambito(p_organization_id, x.id, 'delete')
      ORDER BY x.deleted_at DESC, x.id
      LIMIT 500
    ) e
    LEFT JOIN public.anew_users u ON u.id = e.deleted_by
  ), '[]'::jsonb);
END;
$function$;

COMMENT ON FUNCTION public.neg_pessoas_apagadas(uuid) IS
  'Leitura: as pessoas (anew_entities) apagadas da organização que o utilizador pode restaurar (âmbito delete de fn_neg_pessoa_no_ambito), as mais recentes primeiro, até 500. Sem pessoas.delete devolve [].';

REVOKE ALL ON FUNCTION public.neg_pessoas_apagadas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neg_pessoas_apagadas(uuid) TO authenticated;
