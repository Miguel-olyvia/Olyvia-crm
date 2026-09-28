-- Fase "Encomendas Clientes manuais" (1/3) — marcador de orçamento interno.
--
-- Contexto
-- --------
-- Uma "Encomenda Cliente" (ClientOrders.tsx) não tem tabela própria: é
-- derivada em tempo real de client_contracts (status signed/assinado) via
-- client_contracts.quote_id -> quote_lines. Para permitir criar uma encomenda
-- manualmente (sem passar pelo fluxo de orçamento → proposta → contrato
-- assinado por template), a via mais barata e menos invasiva é criar também
-- um `quotes` + `quote_lines` sintético "por baixo", ligado ao contrato
-- manual pelo mesmo `quote_id` que o resto do sistema já sabe ler — sem
-- tocar em rpc_list_client_order_documents / rpc_get_client_order_document
-- nem nos gatilhos de dedução de stock e pedido a fornecedor (já resolvem
-- tudo a partir de client_contracts.quote_id).
--
-- Problema a resolver aqui: esse orçamento sintético não pode aparecer na
-- listagem normal de Orçamentos (Quotes.tsx) nem ser sugerido como orçamento
-- para anexar a uma Proposta (Proposals.tsx, secção "orçamentos sugeridos"
-- por deal_id/entity_id). As duas telas filtram sempre
-- `.is("deleted_at", null)` — marcar o orçamento sintético como
-- soft-deleted (deleted_at preenchido) resolveria a listagem normal, mas
-- introduz um problema pior: a Lixeira (src/pages/Trash.tsx, tab "quotes",
-- BUSINESS_KINDS) lista precisamente `quotes` com `deleted_at IS NOT NULL` e
-- permite RESTAURAR — o orçamento sintético apareceria lá como se tivesse
-- sido eliminado, e um "Restaurar" acidental fá-lo-ia aparecer em Quotes.tsx
-- como um rascunho real, com dados que não fazem sentido nesse ecrã. Abusar
-- de deleted_at para isto foi por isso descartado.
--
-- Não há nenhuma coluna/estado já existente em `quotes` que sirva este fim
-- (confirmado: sem CHECK constraints, sem coluna "source"/"tipo" — ver
-- pg_get_functiondef/information_schema consultados ao vivo antes desta
-- migration). Daí a nova coluna, mínima e sem efeitos colaterais:
--
--   quotes.is_internal boolean NOT NULL DEFAULT false
--
-- default `false` não muda o comportamento de nenhum orçamento existente
-- nem de nenhuma query atual (nenhuma delas filtra por esta coluna ainda).
--
-- PENDENTE (fora do âmbito desta tarefa, que é só desenho de backend — a
-- aplicar juntamente com o ecrã de criação manual de Encomendas Clientes):
--   - src/pages/Quotes.tsx: acrescentar `.eq("is_internal", false)` às
--     queries de listagem/contagem que hoje só filtram
--     `.is("deleted_at", null)` (fetchQuotes ~L437-465, contagem ~L612-626,
--     ~L753-798).
--   - src/pages/Proposals.tsx: mesmo filtro nas queries de "orçamentos
--     sugeridos"/"orçamentos ligáveis" a uma proposta (~L434, ~L504, ~L561,
--     ~L591, ~L1462), para o orçamento sintético nunca aparecer como
--     sugestão de anexação.
-- Sem estas duas alterações de frontend, a coluna existe mas o orçamento
-- sintético continuaria visível nessas duas listas — por isso não pode ser
-- considerado concluído sozinho.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.quotes.is_internal IS
  'true para orçamentos sintéticos criados por processos internos (ex.: rpc_create_manual_client_order) para servir de suporte a um client_contracts manual — nunca deve aparecer em Quotes.tsx nem ser sugerido em Proposals.tsx. Nunca fica com deleted_at preenchido (não é um "eliminado"), por isso nunca aparece também na Lixeira.';
