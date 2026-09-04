-- Um contrato assinado deixa de mudar por alguém o abrir.
--
-- Hoje o documento é PRODUZIDO a cada descarga. A cópia guardada em
-- `contract_body_html` tem o texto e a formatação, mas deixa os marcadores
-- `{{...}}` por resolver de propósito, "para reflectir sempre o estado actual"
-- (ver o comentário em src/pages/ClientContracts.tsx). E 11 dos 75 contratos
-- assinados vivos não têm cópia nenhuma: são reconstruídos da minuta viva.
--
-- Consequência: editar uma minuta hoje muda o PDF de contratos assinados há
-- meses. E duas descargas do mesmo contrato assinado podiam dar dois documentos
-- diferentes -- foi o que se viu com a data do cabeçalho, que era a do dia da
-- descarga.
--
-- Descarregar é LER, não produzir. Um documento com valor legal não muda porque
-- alguém o abriu.
--
-- ── Como funciona ────────────────────────────────────────────────────────
-- `contract_body_frozen_html` guarda o documento JÁ RESOLVIDO -- texto, valores,
-- datas, tudo. Existindo, é ele que é servido, tal como está, sem voltar a
-- substituir nada. `contract_frozen_at` diz quando foi congelado, para não haver
-- dúvida sobre a que momento o documento corresponde.
--
-- Regenerar limpa as duas colunas e produz de novo. É a ÚNICA forma de mudar um
-- contrato assinado, e tem de ser pedida por alguém.
--
-- ── A ordem importou ─────────────────────────────────────────────────────
-- A data do cabeçalho passou a ser a de CRIAÇÃO do contrato antes desta
-- migration (20261116150000 e o que se lhe seguiu no ecrã). Congelar primeiro
-- teria gravado para sempre a data de hoje em 65 contratos assinados.
--
-- Nada aqui é destrutivo: duas colunas novas, nulas por omissão. Nenhum
-- documento existente muda ao aplicar esta migration -- o congelamento acontece
-- depois, no código, e a partir do que cada contrato já é.

ALTER TABLE "public"."client_contracts"
  ADD COLUMN IF NOT EXISTS "contract_body_frozen_html" "text";

ALTER TABLE "public"."client_contracts"
  ADD COLUMN IF NOT EXISTS "contract_frozen_at" timestamp with time zone;

COMMENT ON COLUMN "public"."client_contracts"."contract_body_frozen_html" IS
  'Documento do contrato já resolvido — texto, valores e datas substituídos. Quando existe, é servido tal como está, sem nova substituição: descarregar um contrato assinado não pode mudá-lo. Limpo ao regenerar, que é a única forma de o alterar.';

COMMENT ON COLUMN "public"."client_contracts"."contract_frozen_at" IS
  'Momento em que o documento foi congelado. Não é a data de assinatura nem a de criação: é a data a que o texto guardado corresponde. Nos contratos assinados antes de 2026-09-03 é posterior à assinatura, porque foram congelados retroactivamente.';

CREATE INDEX IF NOT EXISTS "idx_client_contracts_frozen"
  ON "public"."client_contracts" ("contract_frozen_at")
  WHERE "contract_frozen_at" IS NOT NULL;
