-- Um contrato deixa de mudar porque alguem editou a minuta.
--
-- O problema, medido no remoto a 04/09
-- ------------------------------------
-- Um contrato aponta para uma minuta partilhada (client_contract_templates).
-- Dela vem o aspecto -- cores, logotipo, cabecalho, rodape, margens -- e, nos
-- contratos que nao tem texto proprio, vem o PROPRIO TEXTO.
--
-- Na Mudelar, a organizacao que usa isto a serio: 101 contratos, 73 assinados
-- ou em vigor. Sao 7 as minutas em uso, editadas entre Marco e 24 de Agosto.
-- Comparando a data de cada edicao com a data da assinatura:
--
--    32 assinados cuja minuta NAO foi mexida desde entao
--    35 assinados cuja minuta JA foi editada depois de assinados
--     6 sem minuta ligada
--
-- Metade dos contratos assinados ja mudou por baixo de quem os assinou.
--
-- Porque o mecanismo que existia nao chegava
-- ------------------------------------------
-- A 20261116160000 congela o documento MONTADO (contract_body_frozen_html) na
-- primeira leitura depois de assinado. Duas fraquezas, ambas confirmadas:
--
--   * so dispara ao descarregar o PDF -- e o resultado e que, dois dias
--     depois, ha 0 contratos congelados em 101 assinados. A 04/09 as 09:32:08
--     um cliente assinou o CC-2026-0098 e as 09:32:23 o download rebentou: o
--     contrato ficou assinado e por congelar.
--   * no portal do cliente a escrita nao passa a seguranca da base (o
--     utilizador do portal so tem leitura), e um UPDATE que nao casa linhas
--     devolve zero linhas SEM erro. Falharia em silencio.
--
-- O que esta migracao faz
-- -----------------------
-- Congela a ENTRADA em vez da saida: guarda dentro do contrato a copia da
-- minuta que ele usou. Mesma ideia de proposals.template_snapshot
-- (20261116170000). Vantagens sobre congelar a saida: e a base que congela,
-- nao depende de ninguem abrir um PDF, nao falha em silencio no portal, e
-- pode ser aplicado de uma vez a todos os contratos que ja existem.
--
-- QUANDO congela: na criacao, e outra vez em cada alteracao explicita --
-- editar o corpo, regenerar, mudar de minuta, assinar (de cada lado), enviar,
-- mudar de estado. NUNCA por alguem abrir ou ler o contrato.

ALTER TABLE public.client_contracts
  ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

COMMENT ON COLUMN public.client_contracts.template_snapshot IS
  'Copia congelada da linha de client_contract_templates que este contrato '
  'usou. Escrita pelo trigger trg_contracts_freeze_template na criacao e em '
  'cada alteracao explicita -- nunca quando alguem apenas abre o contrato. '
  'E ela que manda no documento; a minuta viva so e consultada quando esta a '
  'NULL.';

-- ============================================================
-- Resolver: qual e a minuta deste contrato, agora
-- ============================================================
-- Mesma prioridade que resolveContractDocument() usa hoje:
--   contract_template_id, senao template_id, senao a minuta por omissao da
--   organizacao (que so entra quando o contrato nao tem texto proprio).
CREATE OR REPLACE FUNCTION public.resolve_contract_template_snapshot(
  p_contract_template_id uuid,
  p_template_id uuid,
  p_organization_id uuid,
  p_tem_corpo_proprio boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT snapshot FROM (
    SELECT to_jsonb(t.*) AS snapshot, 1 AS prioridade
    FROM public.client_contract_templates t
    WHERE COALESCE(p_contract_template_id, p_template_id) IS NOT NULL
      AND t.id = COALESCE(p_contract_template_id, p_template_id)
      AND t.organization_id = p_organization_id
    UNION ALL
    -- So quando o contrato nao tem texto proprio: e o unico caso em que
    -- resolveContractDocument cai na minuta por omissao.
    SELECT to_jsonb(t.*) AS snapshot, 2 AS prioridade
    FROM public.client_contract_templates t
    WHERE COALESCE(p_contract_template_id, p_template_id) IS NULL
      AND p_tem_corpo_proprio IS NOT TRUE
      AND t.organization_id = p_organization_id
      AND t.is_default = true
      AND t.is_active = true
  ) candidatos
  ORDER BY prioridade
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.resolve_contract_template_snapshot(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_contract_template_snapshot(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_contract_template_snapshot(uuid, uuid, uuid, boolean) TO service_role;

-- ============================================================
-- Trigger: congelar na criacao e em cada alteracao explicita
-- ============================================================
CREATE OR REPLACE FUNCTION public.contract_freeze_template_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.template_snapshot IS NULL THEN
      NEW.template_snapshot := public.resolve_contract_template_snapshot(
        NEW.contract_template_id, NEW.template_id, NEW.organization_id,
        NEW.contract_body_html IS NOT NULL AND length(NEW.contract_body_html) > 0
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Quem manda uma copia propria manda.
  IF NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot THEN
    RETURN NEW;
  END IF;

  -- Alteracoes EXPLICITAS -- alguem mexeu mesmo no contrato.
  -- Abrir, ler ou descarregar nao esta aqui, de proposito.
  IF NEW.contract_body_html      IS DISTINCT FROM OLD.contract_body_html
  OR NEW.contract_template_id    IS DISTINCT FROM OLD.contract_template_id
  OR NEW.template_id             IS DISTINCT FROM OLD.template_id
  OR NEW.status                  IS DISTINCT FROM OLD.status
  OR NEW.signature_date          IS DISTINCT FROM OLD.signature_date
  OR NEW.company_signature_date  IS DISTINCT FROM OLD.company_signature_date
  OR NEW.total_value             IS DISTINCT FROM OLD.total_value
  OR NEW.start_date              IS DISTINCT FROM OLD.start_date
  OR NEW.end_date                IS DISTINCT FROM OLD.end_date
  OR NEW.payment_terms           IS DISTINCT FROM OLD.payment_terms
  OR NEW.prompt_values           IS DISTINCT FROM OLD.prompt_values
  THEN
    NEW.template_snapshot := public.resolve_contract_template_snapshot(
      NEW.contract_template_id, NEW.template_id, NEW.organization_id,
      NEW.contract_body_html IS NOT NULL AND length(NEW.contract_body_html) > 0
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.contract_freeze_template_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_freeze_template_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_freeze_template_snapshot() TO service_role;

DROP TRIGGER IF EXISTS trg_contracts_freeze_template ON public.client_contracts;
CREATE TRIGGER trg_contracts_freeze_template
  BEFORE INSERT OR UPDATE ON public.client_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.contract_freeze_template_snapshot();

-- ============================================================
-- Congelar os que ja existem
-- ============================================================
-- Pedido explicitamente: congelar TODOS, mesmo sabendo que em 35 dos
-- assinados da Mudelar a minuta ja foi editada depois da assinatura -- nesses,
-- o que fica preso e a versao de hoje, nao a que a pessoa assinou. Nao ha
-- historico de versoes das minutas, portanto a original nao e recuperavel. A
-- alternativa era deixa-los a mudar indefinidamente, que e pior.
UPDATE public.client_contracts c
SET template_snapshot = public.resolve_contract_template_snapshot(
      c.contract_template_id, c.template_id, c.organization_id,
      c.contract_body_html IS NOT NULL AND length(c.contract_body_html) > 0
    )
WHERE c.template_snapshot IS NULL;
