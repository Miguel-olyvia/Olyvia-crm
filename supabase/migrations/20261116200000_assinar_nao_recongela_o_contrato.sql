-- Assinar nao muda o documento -- acrescenta-lhe uma assinatura.
--
-- Porque isto muda
-- ----------------
-- A 20261116190000 poe o contrato a guardar dentro de si a copia da minuta que
-- usou (template_snapshot), e manda recongelar essa copia sempre que alguem
-- "mexe no contrato". Na lista do que conta como mexer entraram tres colunas
-- que nao mexem em nada: status, signature_date e company_signature_date.
--
-- O pedido, na palavra de quem usa isto:
--
--   "digamos que congelou e enviaram pro portal, e a minuta mudou, se o cliente
--    assinar nao muda pro que a minuta tem, tem a versao congelada e atualiza
--    em cima dessa"
--
-- Ou seja: entre o envio e a assinatura passa tempo -- dias, semanas -- e nesse
-- intervalo a minuta partilhada pode ser editada por outra pessoa, para outro
-- contrato qualquer. O cliente le no portal a versao que lhe foi enviada, e
-- carrega em assinar. Com a lista anterior, esse carregar no botao era lido
-- como uma alteracao ao contrato e trocava a copia congelada pela minuta de
-- hoje: a pessoa assinava um documento e ficava presa a outro. O mesmo valia
-- para enviar, para aceitar, para cancelar -- qualquer passagem de estado.
--
-- Medido no remoto a 04/09, na Mudelar, a organizacao que usa isto a serio:
-- 101 contratos -- 70 assinados, 26 rascunhos, 5 cancelados. Sao 39 os que
-- ainda nao tem assinatura, e 16 desses tem minuta ligada. Sao 16 contratos
-- vivos que, no dia em que forem assinados, mudavam por baixo de quem assina.
-- As 8 minutas da organizacao foram editadas entre 09 de Junho e 24 de Agosto,
-- portanto o intervalo entre enviar e assinar apanha edicoes reais.
--
-- O que fica a recongelar
-- ----------------------
-- So o que altera mesmo o conteudo do contrato: escrever ou regenerar o corpo
-- (contract_body_html), trocar deliberadamente de minuta (contract_template_id,
-- template_id), e os valores que o documento imprime -- total_value,
-- start_date, end_date, payment_terms, prompt_values.
--
-- Tudo o resto fica igual a 20261116190000: no INSERT congela na mesma; quem
-- escreve o seu proprio template_snapshot continua a mandar; e abrir ou ler o
-- contrato continua a nunca recongelar.

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

  -- Alteracoes ao CONTEUDO do contrato -- as unicas que justificam ir buscar a
  -- minuta outra vez. Assinar, enviar e mudar de estado nao estao aqui, de
  -- proposito: nao mudam o documento. Abrir e ler tambem nao, como antes.
  IF NEW.contract_body_html      IS DISTINCT FROM OLD.contract_body_html
  OR NEW.contract_template_id    IS DISTINCT FROM OLD.contract_template_id
  OR NEW.template_id             IS DISTINCT FROM OLD.template_id
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

COMMENT ON COLUMN public.client_contracts.template_snapshot IS
  'Copia congelada da linha de client_contract_templates que este contrato '
  'usou. Escrita pelo trigger trg_contracts_freeze_template na criacao e '
  'sempre que muda o CONTEUDO do contrato -- corpo, minuta escolhida, valores, '
  'datas, condicoes de pagamento. Nunca quando alguem apenas abre o contrato, '
  'o envia, o assina ou lhe muda o estado. E ela que manda no documento; a '
  'minuta viva so e consultada quando esta a NULL.';
