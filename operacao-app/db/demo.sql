-- =============================================================================
-- Operações — dados de demonstração
--
-- Serve para ver os quatro ecrãs com trabalho lá dentro em vez de estados
-- vazios. Escreve EXCLUSIVAMENTE em tabelas `ops_*` — não cria clientes, não
-- cria utilizadores, não toca em nada do CRM. Usa um cliente que já existe.
--
-- Tudo o que cria leva o prefixo `DEMO-`, por isso remove-se com um comando
-- (ver o fim do ficheiro, ou `npm run supabase:demo-remover`).
--
-- Idempotente: correr duas vezes não duplica nada.
--
-- ⚠ Isto são dados inventados. Não correr numa base que já tenha operação real
--   a sério sem perceber que ficam ordens de demonstração à mistura na lista.
-- =============================================================================

BEGIN;

-- Escolhe a primeira organização que já tenha clientes, e o primeiro cliente
-- dela. Nada é criado — só referenciado.
CREATE TEMP TABLE _ctx AS
SELECT c.organization_id AS org_id, c.id AS cliente_id
  FROM public.anew_clients c
 WHERE c.deleted_at IS NULL
 ORDER BY c.created_at NULLS LAST
 LIMIT 1;

DO $guarda$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _ctx) THEN
    RAISE EXCEPTION 'Não há nenhum cliente no CRM. Cria um cliente primeiro — a demo não inventa clientes.';
  END IF;
END
$guarda$;


-- ── Locais: quatro níveis, como na manutenção a sério ──────────────────
-- Cliente › Torre › Piso › Espaço. O mesmo modelo serve a obra com dois
-- níveis (Cliente › Morada), sem código diferente.

INSERT INTO public.ops_local (organization_id, cliente_id, parent_id, codigo, nome, tipo, cidade, zona)
SELECT org_id, cliente_id, NULL, 'DEMO-TSG', 'Torre S. Gabriel', 'edificio', 'Lisboa', 'Lisboa centro' FROM _ctx
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_local (organization_id, cliente_id, parent_id, codigo, nome, tipo, cidade, zona)
SELECT c.org_id, c.cliente_id, l.id, 'DEMO-TSG-P0', 'Piso 0', 'piso', 'Lisboa', 'Lisboa centro'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-TSG'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_local (organization_id, cliente_id, parent_id, codigo, nome, tipo, cidade, zona)
SELECT c.org_id, c.cliente_id, l.id, 'DEMO-TSG-P2', 'Piso -2', 'piso', 'Lisboa', 'Lisboa centro'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-TSG'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_local (organization_id, cliente_id, parent_id, codigo, nome, tipo, cidade, zona)
SELECT c.org_id, c.cliente_id, l.id, 'DEMO-TSG-GAR', 'Garagem', 'espaco', 'Lisboa', 'Lisboa centro'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-P2'
ON CONFLICT (organization_id, codigo) DO NOTHING;

-- E uma morada isolada, para mostrar os dois níveis da obra.
INSERT INTO public.ops_local (organization_id, cliente_id, parent_id, codigo, nome, tipo, cidade, zona)
SELECT org_id, cliente_id, NULL, 'DEMO-RUAX', 'Rua X, 12, 3.º E', 'morada', 'Sintra', 'Sintra' FROM _ctx
ON CONFLICT (organization_id, codigo) DO NOTHING;


-- ── Categorias e ativos ───────────────────────────────────────────────

INSERT INTO public.ops_categoria_ativo (organization_id, parent_id, codigo, nome)
SELECT org_id, NULL, 'DEMO-100', 'Sistemas de combate a incêndios' FROM _ctx
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_categoria_ativo (organization_id, parent_id, codigo, nome)
SELECT c.org_id, k.id, 'DEMO-107', 'Extintor'
  FROM _ctx c JOIN public.ops_categoria_ativo k ON k.codigo = 'DEMO-100'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_ativo (organization_id, local_id, categoria_id, codigo, nome, marca, modelo, criticidade)
SELECT c.org_id, l.id, k.id, 'DEMO-100.107.0042', 'Extintor da entrada sul', 'Sicli', 'PA-6', 'alta'
  FROM _ctx c
  JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-GAR'
  LEFT JOIN public.ops_categoria_ativo k ON k.codigo = 'DEMO-107'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_ativo (organization_id, local_id, categoria_id, codigo, nome, marca, modelo, criticidade)
SELECT c.org_id, l.id, k.id, 'DEMO-100.107.0009', 'Central de incêndio', 'Notifier', 'NF-3000', 'critica'
  FROM _ctx c
  JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-P0'
  LEFT JOIN public.ops_categoria_ativo k ON k.codigo = 'DEMO-107'
ON CONFLICT (organization_id, codigo) DO NOTHING;


-- ── Ordens ────────────────────────────────────────────────────────────
-- Cinco ordens, escolhidas para que cada ecrã tenha alguma coisa a dizer:
-- uma atrasada e em curso, uma por aprovar, uma fechada por confirmar, uma
-- pausada com a retoma já ultrapassada, e a corretiva que nasceu de uma
-- tarefa não conforme.

INSERT INTO public.ops_ordem
  (organization_id, codigo, origem, estado, prioridade, area, tipo, cliente_id, local_id,
   titulo, descricao, contacto_nome, contacto_telefone, janela_inicio, janela_fim,
   agendada_para, iniciada_em, criada_em, atualizada_em)
SELECT c.org_id, 'OT-DEMO-001', 'corretiva', 'em_curso', 'alta', 'Incêndios', 'Avaria',
       c.cliente_id, l.id,
       'Extintor sem selo de inspeção',
       E'Selo de inspeção fora de validade no extintor da entrada sul.\nO condomínio pediu resolução antes da vistoria.',
       'Sr. Costa', '912 000 000',
       now() - interval '2 days', now() - interval '2 days' + interval '3 hours',
       now() - interval '2 days', now() - interval '2 days',
       now() - interval '3 days', now() - interval '2 days'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-GAR'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_ordem
  (organization_id, codigo, origem, estado, prioridade, area, tipo, cliente_id, local_id,
   titulo, descricao, criada_em, atualizada_em)
SELECT c.org_id, 'OT-DEMO-002', 'corretiva', 'por_aprovar', 'normal', 'Hidráulica', 'Avaria',
       c.cliente_id, l.id,
       'Fuga de água na garagem',
       'Reportado pelo condomínio: mancha húmida junto ao pilar central.',
       now() - interval '4 days', now() - interval '4 days'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-GAR'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_ordem
  (organization_id, codigo, origem, estado, prioridade, area, tipo, cliente_id, local_id,
   titulo, agendada_para, iniciada_em, fechada_em, criada_em, atualizada_em)
SELECT c.org_id, 'OT-DEMO-003', 'preventiva', 'fechada', 'normal', 'Incêndios', 'Inspeção',
       c.cliente_id, l.id,
       'Verificação trimestral da central de incêndio',
       now() - interval '6 days', now() - interval '6 days',
       now() - interval '6 days' + interval '2 hours',
       now() - interval '10 days', now() - interval '6 days'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-P0'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_ordem
  (organization_id, codigo, origem, estado, prioridade, area, tipo, cliente_id, local_id,
   titulo, descricao, pausa_motivo, pausa_retoma_prevista,
   agendada_para, iniciada_em, criada_em, atualizada_em)
SELECT c.org_id, 'OT-DEMO-004', 'obra', 'pausada', 'normal', 'Remodelação', 'Execução',
       c.cliente_id, l.id,
       'Remodelação da casa de banho',
       'Substituição de louças e revestimento. Cliente aprovou o orçamento.',
       'À espera de material — a base do polibã não chegou',
       now() - interval '3 days',
       now() - interval '12 days', now() - interval '12 days',
       now() - interval '20 days', now() - interval '9 days'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-RUAX'
ON CONFLICT (organization_id, codigo) DO NOTHING;

INSERT INTO public.ops_ordem
  (organization_id, codigo, origem, estado, prioridade, area, tipo, cliente_id, local_id,
   titulo, descricao, criada_em, atualizada_em)
SELECT c.org_id, 'OT-DEMO-005', 'corretiva', 'agendada', 'alta', 'Incêndios', 'Avaria',
       c.cliente_id, l.id,
       'Estado do suporte — Extintor da entrada sul — Garagem',
       E'Não conformidade detetada em "Estado do suporte".\nObservações do técnico: suporte solto, com corrosão na base.',
       now() - interval '2 days', now() - interval '2 days'
  FROM _ctx c JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-GAR'
ON CONFLICT (organization_id, codigo) DO NOTHING;


-- ── Alvos e tarefas da OT-DEMO-001 ────────────────────────────────────

INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id, posicao)
SELECT o.id, a.id, l.id, 0
  FROM public.ops_ordem o
  JOIN public.ops_ativo a ON a.codigo = 'DEMO-100.107.0042'
  JOIN public.ops_local l ON l.codigo = 'DEMO-TSG-GAR'
 WHERE o.codigo = 'OT-DEMO-001'
   AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_alvo x WHERE x.ordem_id = o.id);

INSERT INTO public.ops_ordem_tarefa
  (ordem_id, ordem_alvo_id, posicao, nome, tipo, estado, valor_num, unidade,
   limite_min, limite_max, obrigatoria, observacoes)
SELECT o.id, al.id, t.posicao, t.nome, t.tipo, t.estado, t.valor_num, t.unidade,
       t.limite_min, t.limite_max, t.obrigatoria, t.observacoes
  FROM public.ops_ordem o
  JOIN public.ops_ordem_alvo al ON al.ordem_id = o.id
  CROSS JOIN (VALUES
    (0, 'Verificação de pressão',      'inspecao', 'feita',        12.4, 'bar', 10.0, 15.0, true,  NULL),
    (1, 'Verificação do selo',         'inspecao', 'nao_conforme', NULL, NULL,  NULL, NULL, true,  'Selo com validade expirada em maio.'),
    (2, 'Estado do suporte',           'inspecao', 'nao_conforme', NULL, NULL,  NULL, NULL, true,  'Suporte solto, com corrosão na base.'),
    (3, 'Sinalética visível',          'inspecao', 'feita',        NULL, NULL,  NULL, NULL, true,  NULL),
    (4, 'Foto do conjunto',            'inspecao', 'pendente',     NULL, NULL,  NULL, NULL, true,  NULL),
    (5, 'Acesso desobstruído',         'inspecao', 'pendente',     NULL, NULL,  NULL, NULL, false, NULL)
  ) AS t(posicao, nome, tipo, estado, valor_num, unidade, limite_min, limite_max, obrigatoria, observacoes)
 WHERE o.codigo = 'OT-DEMO-001'
   AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_tarefa x WHERE x.ordem_id = o.id);

-- A corretiva que a não conformidade gerou — o ciclo inspeção→reparação a
-- fechar-se, que é o que o Infraspeak não faz.
UPDATE public.ops_ordem nova
   SET gerada_por_tarefa_id = t.id
  FROM public.ops_ordem_tarefa t
  JOIN public.ops_ordem velha ON velha.id = t.ordem_id
 WHERE nova.codigo = 'OT-DEMO-005'
   AND velha.codigo = 'OT-DEMO-001'
   AND t.nome = 'Estado do suporte'
   AND nova.gerada_por_tarefa_id IS NULL;


-- ── Sessões de trabalho ───────────────────────────────────────────────
-- 47m + 2h00 = 2h47m. É daqui que sai o custo de mão de obra — no Infraspeak
-- este número é um cronómetro que corre também de noite, e o custo dá 0,00 €.

INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, fim, origem)
SELECT o.id, p.utilizador_id,
       now() - interval '2 days' + interval '9 hours 14 minutes',
       now() - interval '2 days' + interval '10 hours 1 minute',
       'web'
  FROM public.ops_ordem o
  JOIN public.ops_utilizador_perfil p ON p.organization_id = o.organization_id
 WHERE o.codigo = 'OT-DEMO-001'
   AND NOT EXISTS (SELECT 1 FROM public.ops_sessao_trabalho s WHERE s.ordem_id = o.id)
 LIMIT 1;

INSERT INTO public.ops_sessao_trabalho (ordem_id, utilizador_id, inicio, fim, origem)
SELECT o.id, p.utilizador_id,
       now() - interval '2 days' + interval '10 hours 30 minutes',
       now() - interval '2 days' + interval '12 hours 30 minutes',
       'web'
  FROM public.ops_ordem o
  JOIN public.ops_utilizador_perfil p ON p.organization_id = o.organization_id
 WHERE o.codigo = 'OT-DEMO-001'
   AND (SELECT count(*) FROM public.ops_sessao_trabalho s WHERE s.ordem_id = o.id) = 1
 LIMIT 1;


-- ── Relatório ─────────────────────────────────────────────────────────

DO $relatorio$
DECLARE
  v_locais  integer;
  v_ativos  integer;
  v_ordens  integer;
  v_tarefas integer;
  v_sessoes integer;
BEGIN
  SELECT count(*) INTO v_locais FROM public.ops_local  WHERE codigo LIKE 'DEMO-%';
  SELECT count(*) INTO v_ativos FROM public.ops_ativo  WHERE codigo LIKE 'DEMO-%';
  SELECT count(*) INTO v_ordens FROM public.ops_ordem  WHERE codigo LIKE 'OT-DEMO-%';
  SELECT count(*) INTO v_tarefas FROM public.ops_ordem_tarefa t
    JOIN public.ops_ordem o ON o.id = t.ordem_id WHERE o.codigo LIKE 'OT-DEMO-%';
  SELECT count(*) INTO v_sessoes FROM public.ops_sessao_trabalho s
    JOIN public.ops_ordem o ON o.id = s.ordem_id WHERE o.codigo LIKE 'OT-DEMO-%';

  RAISE NOTICE 'Demo: % locais, % ativos, % ordens, % tarefas, % sessões.',
    v_locais, v_ativos, v_ordens, v_tarefas, v_sessoes;

  IF v_sessoes = 0 THEN
    RAISE WARNING 'Sem sessões de trabalho: não há nenhum perfil em ops_utilizador_perfil. Corre db/pos-instalacao.sql primeiro.';
  END IF;
END
$relatorio$;

DROP TABLE _ctx;

COMMIT;
