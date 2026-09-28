-- O gatilho do orçamento deixa de criar a proposta por si, e passa a chamar o
-- motor de automações.
--
-- Porquê
-- ------
-- `trg_auto_proposal_from_quote` (20260618200000) criava a proposta directamente,
-- em SQL, sempre que um orçamento passava a `aceite`. Fazia-o:
--
--   * sem ler configuração nenhuma — desligar a acção no ecrã "Pipeline
--     Comercial — Automações" não o travava;
--   * com a cadeia fixa "orçamento → proposta", quando o pipeline pode ser
--     reordenado para 24 ordens diferentes, e o motor já executa as 18 acções
--     que essas ordens exigem;
--   * engolindo qualquer erro (`EXCEPTION WHEN OTHERS ... RETURN NEW`), pelo que
--     uma falha era invisível.
--
-- Reimplementar a cadeia em PL/pgSQL para o corrigir seria escrever as cinco
-- criações duas vezes — uma em TypeScript, outra aqui — mantidas iguais à mão.
-- A migration dos contratos admite fazer exactamente isso, e avisa que divergirá
-- em silêncio se um dos lados mudar.
--
-- O que este gatilho passa a fazer
-- --------------------------------
-- Entrega o acontecimento ao motor e sai. Uma só implementação, a do motor:
-- lê `quote_stage_actions`, respeita o que lá está configurado, e sabe executar
-- qualquer uma das acções da cadeia — criar Pedido, Orçamento, Proposta,
-- Contrato ou converter em Cliente.
--
-- O que continua a cobrir, e o que não
-- ------------------------------------
-- COBRE: qualquer caminho que mude `quotes.estado` sem chamar o motor —
-- importações, SQL directo, código futuro que se esqueça. Hoje só o ecrã dos
-- orçamentos chama o motor; qualquer outro caminho ficaria sem automação.
--
-- NÃO COBRE: o motor estar em baixo. Nesse caso falham os dois. Dizer o
-- contrário seria vender uma rede que não existe — a protecção é contra o
-- esquecimento, não contra a indisponibilidade.
--
-- Chamar duas vezes é inofensivo: o motor tem guarda de idempotência no
-- `create_proposal` desde 2026-08-31, e nenhuma ordem de execução produz duas
-- propostas para o mesmo orçamento.

CREATE OR REPLACE FUNCTION public.auto_create_proposal_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_chave    text;
  v_projecto text;
  v_url      text;
BEGIN
  -- Só quando o estado muda de facto.
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  -- Credencial dedicada a este uso, nao a chave-mestra do projecto.
  --
  -- Um gatilho nao tem sessao de utilizador, logo precisa de uma credencial
  -- guardada na base. Guardar ai a chave de servico daria, a quem leia o Vault,
  -- acesso a tudo. `workflow_trigger_secret` faz uma coisa so: autoriza entregar
  -- um acontecimento ao motor -- que depois so age se houver accao configurada.
  --
  -- O valor e criado fora do repositorio, e tem de ser o mesmo que a edge
  -- function tem em `WORKFLOW_TRIGGER_SECRET`.
  SELECT decrypted_secret INTO v_chave
  FROM vault.decrypted_secrets
  WHERE name = 'workflow_trigger_secret'
  LIMIT 1;

  IF v_chave IS NULL THEN
    RAISE WARNING 'auto_create_proposal_from_quote: segredo workflow_trigger_secret ausente no Vault; o motor nao foi chamado para o orcamento %', NEW.id;
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_projecto
  FROM vault.decrypted_secrets
  WHERE name = 'project_functions_url'
  LIMIT 1;

  v_url := COALESCE(v_projecto, 'https://tzbfgwpckrfbqcolqxtm.supabase.co/functions/v1/') || 'execute-workflow';

  -- Entrega o acontecimento e sai. `net.http_post` e assincrono: nao segura a
  -- transaccao do orcamento a espera do motor.
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_chave,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'source_entity', 'quote',
      'entity_id', NEW.id,
      'new_stage_id', NEW.estado,
      'old_stage_id', COALESCE(OLD.estado, 'desconhecido'),
      'organization_id', NEW.organization_id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloquear a mudanca de estado do orcamento por uma falha da automacao.
  -- Mas gritar: a versao anterior engolia isto sem deixar rasto.
  RAISE WARNING 'auto_create_proposal_from_quote: falha ao chamar o motor para o orcamento %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_create_proposal_from_quote() IS
  'Entrega ao motor de automacoes a mudanca de estado de um orcamento. Nao decide nada: quem le a configuracao e executa a accao e o execute-workflow. Rede para caminhos que mudem quotes.estado sem chamar o motor.';

-- O gatilho passa a interessar-se por qualquer mudanca de estado, nao so por
-- "aceite": a accao configurada pode estar noutra fase, e quem decide isso e o
-- motor, nao este ficheiro.
DROP TRIGGER IF EXISTS trg_auto_proposal_from_quote ON public.quotes;

CREATE TRIGGER trg_auto_proposal_from_quote
  AFTER UPDATE OF estado ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_proposal_from_quote();
