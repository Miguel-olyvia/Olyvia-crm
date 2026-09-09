-- Uma atividade e uma tarefa. Nao tem tipo.
--
-- A coluna `type` e `text NOT NULL` sem valor por omissao, herdada da base
-- inicial: quem gravasse uma tarefa tinha de inventar um tipo, e quem
-- construisse o ecra tinha de perguntar por um. Confirmado no remoto que a
-- restricao morde mesmo:
--
--   null value in column "type" of relation "activities"
--   violates not-null constraint
--
-- Decisao do utilizador: "deixa so tarefa, n tem de ter um tipo especifico".
-- E a decisao certa para o que este modulo e -- a lista do que o comercial vai
-- fazer hoje. Um selector de tipo num formulario destes e um campo que se
-- preenche sempre da mesma maneira e que ninguem le depois.
--
-- Nao se apaga a coluna: as quatro linhas antigas tem tipos reais ('meeting',
-- 'note') que sao historia, e se um dia fizer sentido distinguir tarefas a
-- coluna esta la. O que muda e deixar de ser obrigatorio dize-lo -- passa a
-- 'task' sozinha.
--
-- Nao altera nenhuma linha existente: um DEFAULT so vale para escritas novas.

ALTER TABLE public.activities
  ALTER COLUMN type SET DEFAULT 'task';

COMMENT ON COLUMN public.activities.type IS
  'Fica ''task'' sozinho -- uma atividade e uma tarefa, e o ecra nao pergunta '
  'por tipo nenhum. A coluna existe porque as linhas anteriores a Setembro de '
  '2026 tem tipos reais (meeting, note) e porque distinguir tarefas pode vir a '
  'fazer sentido; obrigar a escolher, nao fazia.';
