-- Remove o que `db/demo-obras.sql` e `db/demo-testes.sql` criaram: as obras
-- OB-DEMO-* e tudo o que lhes
-- pertence (fases, tarefas, pessoas, registos e extras saem por CASCADE).
--
-- O modelo "Remodelação casa de banho" FICA: é um modelo útil, e pode já ter
-- sido usado ou editado. Para o apagar, faz-se na página de Modelos.
--
-- Toca apenas em tabelas `ops_*`. Nada do CRM.

BEGIN;

DELETE FROM public.ops_evento
 WHERE entidade = 'obra'
   AND entidade_id IN (SELECT id FROM public.ops_obra WHERE codigo LIKE 'OB-DEMO-%');

DELETE FROM public.ops_obra WHERE codigo LIKE 'OB-DEMO-%';

-- Os modelos que demo-testes.sql criou (o da casa de banho fica — ver acima).
DELETE FROM public.ops_obra_modelo WHERE nome LIKE '% (demo)';

DO $r$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM public.ops_obra WHERE codigo LIKE 'OB-DEMO-%';
  RAISE NOTICE 'Demo de obras removida. Obras DEMO restantes: %.', v;
END
$r$;

COMMIT;
