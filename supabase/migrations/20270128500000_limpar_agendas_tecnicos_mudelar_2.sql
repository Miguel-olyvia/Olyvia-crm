-- 27/11/2026, 2.ª vez (Rúben: «no fim, limpa todas as obras quanto aos técnicos», depois do arranque dos 31 importados). 1.ª: «preciso que limpes todas as agendas dos técnicos, porque agora um gestor de obra vai realmente gerir e criar equipas
-- e associar às obras»; escolheu «Tudo, incluindo feitas»): na Mudelar do testarh, todas as tarefas de todas as obras ficam sem técnico
-- (no estado da Emylia, plano.tasks[i].tec = null) e saem as ligações às pessoas (ops_obra_tarefa_rh). O gestor junta as equipas no
-- Estúdio da obra («Juntar uma equipa»).
-- Antes, uma cópia no esquema «copias» (fora da API): copias.agendas_obra_20261127b e copias.tarefa_rh_20261127b.
-- Reversão: UPDATE ops_obra o SET estado_emylia = c.estado_emylia FROM copias.agendas_obra_20261127b c WHERE c.id = o.id;
--           INSERT INTO ops_obra_tarefa_rh SELECT * FROM copias.tarefa_rh_20261127b ON CONFLICT DO NOTHING;
-- Só para o testarh (uetjgh), organização Mudelar.

SET lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS copias;
REVOKE ALL ON SCHEMA copias FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS copias.agendas_obra_20261127b AS
  SELECT o.id, o.negocio_id, o.estado_emylia, now() AS copiado_em
  FROM public.ops_obra o WHERE o.organization_id = '3242e925-da26-459a-8258-be04d904e355';

CREATE TABLE IF NOT EXISTS copias.tarefa_rh_20261127b AS
  SELECT r.* FROM public.ops_obra_tarefa_rh r
  JOIN public.ops_obra_tarefa t ON t.id = r.tarefa_id
  JOIN public.ops_obra o ON o.id = t.obra_id
  WHERE o.organization_id = '3242e925-da26-459a-8258-be04d904e355';

UPDATE public.ops_obra o
SET estado_emylia = jsonb_set(o.estado_emylia, '{plano,tasks}',
      (SELECT coalesce(jsonb_agg(jsonb_set(x, '{tec}', 'null'::jsonb) ORDER BY i), '[]'::jsonb)
       FROM jsonb_array_elements(o.estado_emylia->'plano'->'tasks') WITH ORDINALITY AS a(x, i))),
    atualizada_em = now()
WHERE o.organization_id = '3242e925-da26-459a-8258-be04d904e355'
  AND jsonb_typeof(o.estado_emylia->'plano'->'tasks') = 'array';

DELETE FROM public.ops_obra_tarefa_rh r
USING public.ops_obra_tarefa t, public.ops_obra o
WHERE r.tarefa_id = t.id AND t.obra_id = o.id AND o.organization_id = '3242e925-da26-459a-8258-be04d904e355';

SELECT
  (SELECT count(*) FROM copias.agendas_obra_20261127b) AS obras_copiadas,
  (SELECT count(*) FROM copias.tarefa_rh_20261127b) AS ligacoes_copiadas,
  (SELECT count(*) FROM public.ops_obra o, jsonb_array_elements(o.estado_emylia->'plano'->'tasks') x
     WHERE o.organization_id = '3242e925-da26-459a-8258-be04d904e355' AND x->>'tec' IS NOT NULL) AS tarefas_com_tecnico_agora,
  (SELECT count(*) FROM public.ops_obra_tarefa_rh r JOIN public.ops_obra_tarefa t ON t.id = r.tarefa_id JOIN public.ops_obra o ON o.id = t.obra_id
     WHERE o.organization_id = '3242e925-da26-459a-8258-be04d904e355') AS ligacoes_agora;
