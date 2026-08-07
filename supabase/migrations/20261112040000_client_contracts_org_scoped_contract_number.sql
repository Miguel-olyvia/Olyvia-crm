-- Regista em migration a alteracao ja aplicada diretamente na base de dados:
-- o numero de contrato (contract_number) passou a ser unico por organizacao,
-- em vez de unico globalmente. A constraint global impedia que duas
-- organizacoes tivessem, cada uma, um contrato com o mesmo numero (ex.: "2024/001"),
-- o que bloqueou 29 contratos da Mudelar que colidiam com contratos de outras
-- organizacoes (nike, Gromicho.lda).
--
-- Idempotente: remove a constraint antiga apenas se existir, cria a nova
-- apenas se ainda nao existir. Nao altera dados.

BEGIN;

ALTER TABLE public.client_contracts
  DROP CONSTRAINT IF EXISTS client_contracts_contract_number_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.client_contracts'::regclass
      AND conname = 'client_contracts_org_number_unique'
  ) THEN
    ALTER TABLE public.client_contracts
      ADD CONSTRAINT client_contracts_org_number_unique
      UNIQUE (organization_id, contract_number);
  END IF;
END $$;

COMMIT;
