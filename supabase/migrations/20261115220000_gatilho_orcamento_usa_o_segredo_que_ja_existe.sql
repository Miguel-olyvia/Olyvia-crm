-- O gatilho do orçamento passa a usar o segredo que já existe, em vez de um novo.
--
-- O erro que isto corrige
-- -----------------------
-- A migration 20261115180000 pôs o gatilho a chamar o motor de automações — o
-- que está certo — mas com um segredo inventado de raiz,
-- `workflow_trigger_secret`, que nunca chegou a ser criado em produção. Com o
-- Vault a não ter esse nome, o gatilho avisa nos registos e não chama ninguém:
-- deixou de haver rede para qualquer caminho que aceite um orçamento sem passar
-- pela aplicação.
--
-- Pior do que a falha: o segredo era desnecessário. Já existia o
-- `CRON_SHARED_SECRET` para exactamente este fim — a base de dados a chamar uma
-- edge function sem sessão de utilizador. Está no runtime das funções e no
-- Vault, guardado (confusamente) com o nome `cron_service_role_key`, e é o que
-- `requireServiceRoleOrCronSecret` aceita desde a correcção dos crons.
--
-- Dois segredos a fazer a mesma coisa são mais um para rodar, mais um para
-- esquecer, e mais um para desalinhar — que é precisamente a doença que deixou
-- `auto-schedule` e `pipeline-automation` a devolver 401 durante semanas.
--
-- Continua a NÃO usar a chave de serviço: essa é a chave-mestra do projecto, e
-- guardá-la no Vault daria, a quem o lesse, acesso a tudo. Este segredo autoriza
-- uma coisa só — pedir ao motor que reavalie uma mudança de fase — e mesmo essa
-- não faz nada se não houver acção configurada.

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

  -- O mesmo segredo que os crons usam. O nome no Vault diz
  -- `cron_service_role_key`, mas o valor e o CRON_SHARED_SECRET -- nao e uma
  -- chave de servico. O nome ficou de uma tentativa anterior e mantem-se para
  -- nao partir os crons que ja lhe apontam.
  SELECT decrypted_secret INTO v_chave
  FROM vault.decrypted_secrets
  WHERE name = 'cron_service_role_key'
  LIMIT 1;

  IF v_chave IS NULL THEN
    RAISE WARNING 'auto_create_proposal_from_quote: segredo cron_service_role_key ausente no Vault; o motor nao foi chamado para o orcamento %', NEW.id;
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
  -- Mas gritar: a versao de Junho engolia isto sem deixar rasto.
  RAISE WARNING 'auto_create_proposal_from_quote: falha ao chamar o motor para o orcamento %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_create_proposal_from_quote() IS
  'Entrega ao motor de automacoes a mudanca de estado de um orcamento, autenticando-se com o CRON_SHARED_SECRET (guardado no Vault como cron_service_role_key). Nao decide nada: quem le a configuracao e executa a accao e o execute-workflow.';
