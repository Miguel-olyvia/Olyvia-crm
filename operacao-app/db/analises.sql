-- ============================================================
--  Operações — as duas perguntas que os dados já sabem responder
-- ============================================================
--  Correr DEPOIS de: schema.sql, correcoes-modelo.sql, medicoes.sql.
--
--  Nada aqui guarda seja o que for. São três vistas sobre o que já está
--  gravado — o módulo escreve cada leitura com data e autor desde o
--  princípio, e nunca ninguém as somou.
--
--  As duas perguntas:
--
--   1. «Este equipamento tem dado problemas?» — é o que decide entre
--      reparar outra vez e substituir. Hoje responde-se de cabeça.
--
--   2. «Cumprimos a manutenção deste cliente?» — é o indicador do
--      contrato, e é por ele que um cliente decide se renova. Os números
--      existem: ordens preventivas previstas contra ordens fechadas.
--
--  `security_invoker = true` em todas. Sem isso, uma vista corre com os
--  privilégios de quem a criou e mostra os dados de todas as organizações
--  a toda a gente — a RLS das tabelas por baixo passa a não valer nada.
--
--  Escreve fora de `ops_*`? NÃO. Nem lê nada do CRM.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. A vida de um equipamento
-- ============================================================
-- Uma linha por visita a um ativo. Vem de `ops_ordem_alvo`, que é o que
-- liga uma ordem às coisas que ela foi lá ver.
--
-- `nao_conformidades` conta as tarefas que ficaram mal NESSE alvo, não na
-- ordem inteira: uma ordem que passou por seis extintores e encontrou um
-- problema num deles não pode manchar os outros cinco.

CREATE OR REPLACE VIEW public.ops_v_ativo_intervencao
WITH (security_invoker = true) AS
SELECT
  oa.ativo_id,
  o.organization_id,
  o.cliente_id,
  o.id                AS ordem_id,
  o.codigo,
  o.origem,
  o.estado,
  o.titulo,
  o.prioridade,
  -- A data que interessa é quando o trabalho aconteceu. Numa ordem por
  -- fazer, a única data que existe é a que estava prometida.
  COALESCE(o.fechada_em, o.iniciada_em, o.agendada_para, o.criada_em) AS quando,
  o.fechada_em,
  o.responsavel_id,
  (SELECT count(*) FROM public.ops_ordem_tarefa t
    WHERE t.ordem_alvo_id = oa.id AND t.estado = 'nao_conforme')::int AS nao_conformidades,
  (SELECT count(*) FROM public.ops_ordem_tarefa t
    WHERE t.ordem_alvo_id = oa.id)::int AS tarefas
FROM public.ops_ordem_alvo oa
JOIN public.ops_ordem o ON o.id = oa.ordem_id
WHERE oa.ativo_id IS NOT NULL
  AND o.estado <> 'cancelada';


-- ============================================================
-- 2. A evolução das leituras
-- ============================================================
-- O mesmo valor, lido ao longo do tempo, no mesmo equipamento. É isto que
-- transforma "12 bar" numa linha que desce.
--
-- Só leituras feitas: uma linha em branco à espera não é um ponto no
-- gráfico.

CREATE OR REPLACE VIEW public.ops_v_ativo_leitura
WITH (security_invoker = true) AS
SELECT
  oa.ativo_id,
  o.organization_id,
  o.cliente_id,
  o.id           AS ordem_id,
  o.codigo,
  m.id           AS leitura_id,
  m.medicao_def_id,
  m.nome,
  m.tipo,
  m.unidade,
  m.limite_min,
  m.limite_max,
  m.valor_num,
  m.valor_texto,
  m.conforme,
  m.lida_em,
  m.corretiva_ordem_id,
  t.nome         AS tarefa
FROM public.ops_ordem_tarefa_medicao m
JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
JOIN public.ops_ordem_alvo oa  ON oa.id = t.ordem_alvo_id
JOIN public.ops_ordem o        ON o.id = t.ordem_id
WHERE oa.ativo_id IS NOT NULL
  AND m.lida_em IS NOT NULL;


-- ============================================================
-- 3. PMP — a manutenção preventiva que foi mesmo feita
-- ============================================================
-- Uma linha por ordem preventiva prevista. A percentagem faz-se em cima
-- disto, e quem quiser saber QUAIS falharam tem as ordens à mão — que é a
-- pergunta a seguir, e a que uma percentagem sozinha nunca responde.
--
-- As três colunas, e o que cada uma quer dizer:
--
--  · `cumprida`      — foi fechada ou confirmada pelo cliente;
--  · `a_horas`       — foi fechada até ao dia em que estava prometida;
--  · `em_atraso`     — o dia passou e continua por fechar.
--
-- Canceladas ficam de fora: uma ordem que o cliente mandou cancelar não é
-- manutenção falhada, e contá-la como tal castiga quem fez o que devia.
--
-- Ordens sem `agendada_para` também ficam de fora: sem data prometida não
-- há promessa para cumprir, e inventar uma dava um número bonito e falso.

CREATE OR REPLACE VIEW public.ops_v_pmp
WITH (security_invoker = true) AS
SELECT
  o.id            AS ordem_id,
  o.organization_id,
  o.cliente_id,
  o.codigo,
  o.titulo,
  o.plano_id,
  o.estado,
  o.agendada_para,
  o.fechada_em,
  o.responsavel_id,
  date_trunc('month', o.agendada_para)::date AS mes,
  (o.estado IN ('fechada', 'confirmada'))    AS cumprida,
  (o.estado IN ('fechada', 'confirmada')
     AND o.fechada_em IS NOT NULL
     AND o.fechada_em::date <= o.agendada_para::date) AS a_horas,
  (o.estado NOT IN ('fechada', 'confirmada')
     AND o.agendada_para < now())            AS em_atraso
FROM public.ops_ordem o
WHERE o.origem = 'preventiva'
  AND o.estado <> 'cancelada'
  AND o.agendada_para IS NOT NULL;


-- ============================================================
-- 3b. Todas as leituras, para quem tem de as entregar a alguém
-- ============================================================
-- Um extintor tem uma inspeção obrigatória; uma caldeira tem um registo que a
-- seguradora pede. Quem faz manutenção tem, mais vezes do que se pensa, de
-- entregar leituras a uma entidade de fora.
--
-- Ao contrário de `ops_v_ativo_leitura`, esta não exige que a leitura esteja
-- ligada a um equipamento: uma medição feita a um local — a temperatura de uma
-- câmara frigorífica, o caudal de uma conduta — conta na mesma. Filtrar por
-- ativo deixaria essas de fora, e é exatamente para essas que o regulador
-- costuma escrever.
--
-- Traz o contexto todo numa linha, porque uma folha de cálculo não faz joins:
-- quando, onde, o quê, quanto, e quem leu.

CREATE OR REPLACE VIEW public.ops_v_leitura
WITH (security_invoker = true) AS
SELECT
  m.id             AS leitura_id,
  o.organization_id,
  o.cliente_id,
  o.id             AS ordem_id,
  o.codigo         AS ordem,
  m.medicao_def_id,
  m.nome,
  m.tipo,
  m.unidade,
  m.limite_min,
  m.limite_max,
  m.valor_num,
  m.valor_texto,
  m.conforme,
  m.lida_em,
  m.lida_por,
  t.nome           AS tarefa,
  l.nome           AS local,
  l.codigo         AS local_codigo,
  a.nome           AS ativo,
  a.codigo         AS ativo_codigo
FROM public.ops_ordem_tarefa_medicao m
JOIN public.ops_ordem_tarefa t ON t.id = m.ordem_tarefa_id
JOIN public.ops_ordem o        ON o.id = t.ordem_id
LEFT JOIN public.ops_ordem_alvo oa ON oa.id = t.ordem_alvo_id
LEFT JOIN public.ops_ativo a       ON a.id = oa.ativo_id
LEFT JOIN public.ops_local l       ON l.id = COALESCE(oa.local_id, o.local_id)
WHERE m.lida_em IS NOT NULL
  AND o.estado <> 'cancelada';


-- ============================================================
-- 4. As vistas ficam legíveis a quem tem sessão
-- ============================================================
-- A RLS das tabelas por baixo é que decide o que cada pessoa vê. Estas
-- linhas só dizem que a vista existe para o papel `authenticated`.

GRANT SELECT ON public.ops_v_ativo_intervencao TO authenticated;
GRANT SELECT ON public.ops_v_ativo_leitura     TO authenticated;
GRANT SELECT ON public.ops_v_pmp               TO authenticated;
GRANT SELECT ON public.ops_v_leitura           TO authenticated;

REVOKE ALL ON public.ops_v_ativo_intervencao FROM anon;
REVOKE ALL ON public.ops_v_ativo_leitura     FROM anon;
REVOKE ALL ON public.ops_v_pmp               FROM anon;
REVOKE ALL ON public.ops_v_leitura           FROM anon;


-- ============================================================
-- 5. Provar que nenhuma ficou sem security_invoker
-- ============================================================
-- Um `CREATE OR REPLACE VIEW` sem a opção não dá erro nenhum: a vista
-- fica de pé e mostra tudo a toda a gente. É um erro silencioso, por isso
-- é verificado aqui e não deixado à leitura de quem passar.

DO $prova$
DECLARE
  v integer;
BEGIN
  SELECT count(*) INTO v
    FROM pg_class
   WHERE relname IN ('ops_v_ativo_intervencao', 'ops_v_ativo_leitura',
                     'ops_v_pmp', 'ops_v_leitura')
     AND relkind = 'v'
     AND 'security_invoker=true' = ANY (reloptions);

  IF v <> 4 THEN
    RAISE EXCEPTION
      'Só % das 4 vistas de análise têm security_invoker — as outras mostrariam dados de outras organizações.', v;
  END IF;

  RAISE NOTICE 'Operações: análises prontas (histórico do ativo, leituras, PMP).';
END
$prova$;

COMMIT;
