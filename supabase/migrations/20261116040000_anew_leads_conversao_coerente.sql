-- Coerência entre conversão e estado nas leads (anew_leads).
--
-- Problema: a tabela aceita hoje um estado internamente contraditório — uma
-- lead com `converted_to_client_id` preenchido (ou seja, o cliente já foi
-- criado a partir dela) mas com `status` diferente de 'converted'. Para a
-- aplicação, essa linha é ao mesmo tempo "já convertida" (há cliente) e "ainda
-- no funil" (o estado diz outra coisa), pelo que entra em contagens
-- incompatíveis consoante o painel use uma coluna ou a outra.
--
-- Como apareceu: quatro leads da organização Mudelar ficaram nesse estado entre
-- 4 e 6 de Agosto de 2026 e só foram descobertas quase um mês depois, por
-- acaso, porque dois números do painel não batiam certo. Já foram corrigidas.
--
-- Porque não chega uma guarda no código: há pelo menos quatro sítios na
-- aplicação que escrevem no `status` de uma lead sem verificar se ela já foi
-- convertida. Uma guarda em cada um é remendo — esquece-se um, e o quinto sítio
-- que for escrito amanhã não a terá. Pior: há escrita directa à base, por fora
-- da aplicação (já apanhada três vezes nesta organização), que não passa por
-- guarda nenhuma. O único sítio onde a invariante se pode garantir para todas
-- as origens de escrita é a própria base de dados.
--
-- Porquê NOT VALID: existem hoje 2 leads na organização "teste" (dados de
-- demonstração, com status = 'new') que violam a regra, e a decisão foi
-- deixá-las como estão. Com NOT VALID a regra é imposta a tudo o que for
-- inserido ou actualizado de agora em diante, mas as linhas já existentes não
-- são verificadas. Deliberadamente NÃO se corre VALIDATE CONSTRAINT.
--
-- Verificado por leitura contra o remoto antes de escrever esta migration:
-- 6559 leads no total, 65 com `converted_to_client_id` preenchido, e apenas
-- essas 2 linhas da org "teste" violam a regra. Nenhuma outra organização tem
-- casos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'anew_leads_conversao_coerente'
      AND conrelid = 'public.anew_leads'::regclass
  ) THEN
    ALTER TABLE public.anew_leads
      ADD CONSTRAINT anew_leads_conversao_coerente
      CHECK (converted_to_client_id IS NULL OR status = 'converted')
      NOT VALID;
  END IF;
END
$$;

COMMENT ON CONSTRAINT anew_leads_conversao_coerente ON public.anew_leads IS
  'Uma lead com cliente criado (converted_to_client_id preenchido) tem de ter status = ''converted''. NOT VALID: 2 linhas de demonstração pré-existentes na org "teste" ficam por validar de propósito.';
