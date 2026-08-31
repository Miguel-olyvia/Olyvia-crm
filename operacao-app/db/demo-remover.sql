-- Remove tudo o que `db/demo.sql` criou. Nada mais.
--
-- Toca apenas em tabelas `ops_*`, e só nas linhas com prefixo DEMO-.
-- Os clientes e utilizadores do CRM não são afetados — a demo nunca os criou.

BEGIN;

DELETE FROM public.ops_evento
 WHERE entidade = 'ordem'
   AND entidade_id IN (SELECT id FROM public.ops_ordem WHERE codigo LIKE 'OT-DEMO-%');

-- ops_ordem_tarefa, ops_ordem_alvo, ops_sessao_trabalho, ops_custo,
-- ops_mensagem e ops_anexo saem por CASCADE a partir da ordem.
DELETE FROM public.ops_ordem WHERE codigo LIKE 'OT-DEMO-%';

DELETE FROM public.ops_ativo          WHERE codigo LIKE 'DEMO-%';
DELETE FROM public.ops_local          WHERE codigo LIKE 'DEMO-%';
DELETE FROM public.ops_categoria_ativo WHERE codigo LIKE 'DEMO-%';

DO $r$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM public.ops_ordem WHERE codigo LIKE 'OT-DEMO-%';
  RAISE NOTICE 'Demo removida. Ordens DEMO restantes: %.', v;
END
$r$;

COMMIT;
