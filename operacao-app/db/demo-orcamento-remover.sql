-- =============================================================================
-- Operações — tirar a obra orçamentada de demonstração
--
-- Remove tudo o que o `demo-orcamento.sql` criou, e nada mais. Só toca em
-- linhas com o prefixo `DEMO-ORC`.
--
-- As tarefas, os custos e as linhas do previsto saem em cascata com a ordem —
-- é o que as chaves estrangeiras de `ops_*` para `ops_*` fazem.
-- =============================================================================

BEGIN;

DELETE FROM public.ops_ordem WHERE codigo = 'DEMO-ORC-OT1';
DELETE FROM public.ops_local WHERE codigo = 'DEMO-ORC-L1';

COMMIT;

-- Confirmar que não ficou nada:
--   SELECT codigo FROM public.ops_ordem WHERE codigo LIKE 'DEMO-ORC%';
--   SELECT codigo FROM public.ops_local WHERE codigo LIKE 'DEMO-ORC%';
