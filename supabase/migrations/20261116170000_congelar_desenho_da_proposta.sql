-- Congela o DESENHO da proposta (proposals.template_snapshot), e volta a
-- congelar sempre que a proposta e editada ou muda de estado.
--
-- O problema que isto resolve
-- ---------------------------
-- Uma proposta aponta para um modelo partilhado (proposal_templates). Editar
-- esse modelo mudava o aspecto de propostas ja feitas e enviadas: quem as
-- recebeu reabria o PDF e via coisa diferente da que lhe foi mandada.
--
-- A coluna proposals.template_snapshot (20261111280000) existe justamente para
-- isso -- guarda uma copia completa da linha do modelo. Mas so UM dos onze
-- caminhos que criam propostas a preenchia (ProposalCreateDialog, via payload
-- da rpc_create_proposal). Os outros dez nao: o ecra principal de Propostas, a
-- ficha do cliente, tres accoes do execute-workflow, a ferramenta do
-- assistente, o trigger que cria proposta ao aceitar um orcamento, e a
-- duplicacao. Medido no remoto a 04/09: 128 propostas vivas criadas desde
-- 07/08 com modelo escolhido e o desenho por congelar.
--
-- Porque um trigger e nao um helper em TypeScript
-- -----------------------------------------------
-- Cinco dos onze caminhos correm fora do browser (Edge Functions em Deno, uma
-- ferramenta do assistente, um trigger de base de dados e uma RPC de
-- duplicacao). Um helper partilhado no frontend nao chega la, e obrigava a
-- reescrever a mesma resolucao em Deno e em SQL. Aqui apanha os onze de uma
-- vez, e qualquer caminho futuro por construcao.
--
-- QUANDO congela
-- --------------
-- Na criacao, e outra vez sempre que a proposta e EDITADA ou MUDA DE ESTADO.
-- A ideia: o que se quer travar e a proposta mudar SOZINHA porque alguem mexeu
-- no modelo partilhado. Se a propria proposta foi mexida, e legitimo que
-- apanhe o desenho actual -- um rascunho parado dias apanha assim a correccao
-- ao logotipo ou ao rodape, em vez de sair com o desenho velho.
--
-- Conta como "mexida": qualquer coluna de negocio (as mesmas que
-- compute_proposal_business_hash ja usa), o estado, a fase, a data de envio e
-- a data de publicacao no portal. A publicacao entra porque e o momento em que
-- o cliente passa mesmo a ver o documento: 97 das 128 propostas afectadas
-- foram publicadas no portal sem NUNCA terem data de envio.
--
-- NAO conta como mexida, e por isso nao volta a congelar:
--   * abrir a proposta -- view_count, viewed_at, last_viewed_at. Sem esta
--     exclusao repetia-se o defeito que os contratos ja tiveram: o documento
--     mudava porque alguem o abriu.
--   * o cliente ACEITAR ou REJEITAR. Nesse instante quem mexeu foi o cliente,
--     nao a organizacao; refrescar ai fazia o documento aceite passar a ter o
--     desenho de hoje em vez do que ele viu quando aceitou.
--   * uma escrita que ja traga um template_snapshot proprio -- respeita-se
--     quem o passou (e o caso do ProposalCreateDialog, que continua a mandar).
--
-- Nao mexe em dados existentes: nenhuma das 128 propostas ja criadas e tocada
-- aqui. Esse backfill fica para uma migration propria, por decidir.

-- ============================================================
-- Resolver: qual e o modelo desta proposta, agora
-- ============================================================
-- Mesma prioridade que loadTemplate() no portal, resolveTemplateSnapshot() no
-- dialogo, e o backfill da 20261111280000: modelo escolhido, senao o modelo por
-- omissao activo da organizacao, senao nenhum.
--
-- Limitado a organizacao da propria proposta. A funcao e SECURITY DEFINER e
-- portanto ignora RLS: sem este limite, um template_id de outra organizacao
-- passado a mao era copiado para dentro da proposta. Confirmado no remoto que
-- nao restringe nada de legitimo -- 508 de 508 propostas com modelo escolhido
-- usam um modelo da propria organizacao.
CREATE OR REPLACE FUNCTION public.resolve_proposal_template_snapshot(
  p_template_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT snapshot FROM (
    SELECT to_jsonb(pt.*) AS snapshot, 1 AS prioridade
    FROM public.proposal_templates pt
    WHERE p_template_id IS NOT NULL
      AND pt.id = p_template_id
      AND pt.organization_id = p_organization_id
    UNION ALL
    SELECT to_jsonb(pt.*) AS snapshot, 2 AS prioridade
    FROM public.proposal_templates pt
    WHERE p_template_id IS NULL
      AND p_organization_id IS NOT NULL
      AND pt.organization_id = p_organization_id
      AND pt.template_type = 'proposal'
      AND pt.is_default = true
      AND pt.is_active = true
  ) candidatos
  ORDER BY prioridade
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.resolve_proposal_template_snapshot(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_proposal_template_snapshot(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_proposal_template_snapshot(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.resolve_proposal_template_snapshot(uuid, uuid) IS
  'Resolve o modelo de uma proposta e devolve a linha inteira como jsonb, para '
  'ser congelada em proposals.template_snapshot. Prioridade: modelo escolhido, '
  'senao o default activo da organizacao, senao NULL. Sempre dentro da '
  'organizacao indicada.';

-- ============================================================
-- Trigger: congelar na criacao, recongelar quando a proposta muda
-- ============================================================
CREATE OR REPLACE FUNCTION public.proposal_freeze_template_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Quem ja mandou uma copia manda -- nao se re-resolve por cima dela.
    IF NEW.template_snapshot IS NULL THEN
      NEW.template_snapshot := public.resolve_proposal_template_snapshot(
        NEW.template_id, NEW.organization_id
      );
    END IF;
    RETURN NEW;
  END IF;

  -- A partir daqui: UPDATE.

  -- A escrita traz uma copia propria (ou apaga-a de proposito): respeita-se.
  IF NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot THEN
    RETURN NEW;
  END IF;

  -- A decisao e do cliente, nao da organizacao: o documento fica como ele o viu.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('accepted', 'rejected') THEN
    RETURN NEW;
  END IF;

  -- Foi mesmo mexida? (abrir a proposta nao conta -- ver cabecalho)
  IF NEW.title             IS DISTINCT FROM OLD.title
  OR NEW.description       IS DISTINCT FROM OLD.description
  OR NEW.value             IS DISTINCT FROM OLD.value
  OR NEW.valid_until       IS DISTINCT FROM OLD.valid_until
  OR NEW.notes             IS DISTINCT FROM OLD.notes
  OR NEW.currency          IS DISTINCT FROM OLD.currency
  OR NEW.client_id         IS DISTINCT FROM OLD.client_id
  OR NEW.entity_id         IS DISTINCT FROM OLD.entity_id
  OR NEW.deal_id           IS DISTINCT FROM OLD.deal_id
  OR NEW.template_id       IS DISTINCT FROM OLD.template_id
  OR NEW.status            IS DISTINCT FROM OLD.status
  OR NEW.stage_id          IS DISTINCT FROM OLD.stage_id
  OR NEW.sent_at           IS DISTINCT FROM OLD.sent_at
  OR NEW.published_at      IS DISTINCT FROM OLD.published_at
  THEN
    NEW.template_snapshot := public.resolve_proposal_template_snapshot(
      NEW.template_id, NEW.organization_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.proposal_freeze_template_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proposal_freeze_template_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.proposal_freeze_template_snapshot() TO service_role;

DROP TRIGGER IF EXISTS trg_proposals_freeze_template_snapshot ON public.proposals;
CREATE TRIGGER trg_proposals_freeze_template_snapshot
  BEFORE INSERT OR UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.proposal_freeze_template_snapshot();

COMMENT ON COLUMN public.proposals.template_snapshot IS
  'Copia congelada da linha de proposal_templates usada por esta proposta. '
  'Escrita pelo trigger trg_proposals_freeze_template_snapshot na criacao e '
  'sempre que a proposta e editada ou muda de estado -- nunca quando alguem '
  'apenas a abre, e nunca quando o cliente aceita ou rejeita. E ela que manda '
  'no PDF, no portal e nos emails; o modelo vivo so e consultado quando esta '
  'a NULL.';
