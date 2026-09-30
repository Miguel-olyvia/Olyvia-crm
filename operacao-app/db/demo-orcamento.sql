-- =============================================================================
-- Operações — uma obra orçamentada, para ver como fica
--
-- Serve para responder a "para que serve isto?" olhando para o ecrã em vez de
-- para uma explicação. Cria **uma obra que veio de um orçamento**, com o
-- previsto congelado ao lado e o gasto real por cima — que é a metade que
-- interessa e a que não se consegue imaginar de cabeça.
--
-- ⚠ ESCREVE EXCLUSIVAMENTE EM `ops_*`. Não cria orçamentos no CRM, não toca em
--   `quotes` nem em `quote_lines`, não cria clientes nem utilizadores. Usa um
--   cliente que já existe.
--
--   Por isso o ecrã `/orcamentos` **continua vazio** depois de correr isto: essa
--   lista lê os orçamentos aceites do CRM, e um orçamento a sério tem de nascer
--   lá. O que esta demo mostra é o passo seguinte — a obra já criada, e a
--   comparação. Ver a nota no fim.
--
-- Tudo o que cria leva o prefixo `DEMO-ORC`, e remove-se com um comando.
--
-- Idempotente: correr duas vezes não duplica nada.
-- =============================================================================

BEGIN;

-- O contexto: a primeira organização com clientes, e o primeiro cliente dela.
-- Nada é criado — só referenciado.
--
-- O `DROP` antes é para o caso de se correr isto duas vezes na mesma sessão
-- (acontece no editor de SQL, e no validador): uma tabela temporária sobrevive
-- à transação, e a segunda tentativa rebentava com "já existe".
DROP TABLE IF EXISTS _ctx;
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


-- ── O sítio da obra ──────────────────────────────────────────────────────
INSERT INTO public.ops_local (organization_id, cliente_id, codigo, nome, tipo, morada, cidade)
SELECT org_id, cliente_id, 'DEMO-ORC-L1', 'Loja da Baixa — remodelação', 'morada',
       'Rua Augusta 100', 'Lisboa'
  FROM _ctx
 WHERE NOT EXISTS (SELECT 1 FROM public.ops_local WHERE codigo = 'DEMO-ORC-L1');


-- ── A obra ───────────────────────────────────────────────────────────────
-- `orcamento_id` leva um id inventado de propósito: a coluna não tem chave
-- estrangeira para `quotes` (o CRM apaga a sério, e uma FK partiria isso), e
-- é ele que faz a ordem contar como "vinda de um orçamento".
INSERT INTO public.ops_ordem
  (organization_id, codigo, origem, estado, prioridade, cliente_id, local_id,
   titulo, descricao, orcamento_id, agendada_para, criada_em)
SELECT
  x.org_id, 'DEMO-ORC-OT1', 'obra', 'em_curso', 'normal', x.cliente_id, l.id,
  'Remodelação da loja — orçamento ORC-2026-014',
  E'Obra criada a partir de um orçamento aceite.\n'
    || 'O previsto ficou congelado no momento em que se disse "sim"; '
    || 'o gasto real vai sendo lançado à medida que o trabalho acontece.',
  '00000000-0000-4000-8000-0000000000ac'::uuid,
  now() - interval '3 days',
  now() - interval '5 days'
  FROM _ctx x
  JOIN public.ops_local l ON l.codigo = 'DEMO-ORC-L1'
 WHERE NOT EXISTS (SELECT 1 FROM public.ops_ordem WHERE codigo = 'DEMO-ORC-OT1');


-- ── O previsto, congelado ────────────────────────────────────────────────
-- Uma cópia das linhas do orçamento no momento em que a obra nasceu. Cópia, e
-- não leitura ao vivo: o orçamento pode ser revisto depois, e comparar o gasto
-- contra um orçamento que mudou entretanto não responde a pergunta nenhuma.
--
-- Os valores são o CUSTO (material + mão de obra), nunca o preço de venda. O
-- preço leva margem e IVA lá dentro, e compará-lo com o custo real daria um
-- desvio bonito e falso.
INSERT INTO public.ops_ordem_previsto
  (ordem_id, posicao, categoria, descricao, unidade, quantidade,
   custo_material, custo_mao_obra, total_sem_iva)
SELECT o.id, v.posicao, v.categoria, v.descricao, v.unidade, v.quantidade,
       v.material, v.mao_obra, v.total
  FROM public.ops_ordem o
  CROSS JOIN (VALUES
    (1, 'Alvenarias',    'Demolição da parede interior',        'm²',  18.000,  90.00,  360.00,  450.00),
    (2, 'Eletricidade',  'Novo quadro elétrico e circuitos',    'un',   1.000, 320.00,  280.00,  600.00),
    (3, 'Canalização',   'Passagem de águas para a copa',       'ml',  12.000, 168.00,  240.00,  408.00),
    (4, 'Pinturas',      'Pintura geral, duas demãos',          'm²',  95.000, 190.00,  475.00,  665.00),
    (5, 'Carpintaria',   'Balcão de atendimento por medida',    'un',   1.000, 540.00,  360.00,  900.00)
  ) AS v(posicao, categoria, descricao, unidade, quantidade, material, mao_obra, total)
 WHERE o.codigo = 'DEMO-ORC-OT1'
   AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_previsto p WHERE p.ordem_id = o.id);


-- ── O gasto real ─────────────────────────────────────────────────────────
-- De propósito **acima** do previsto em alguns pontos e abaixo noutros: um
-- desvio de zero não mostra nada, e um desvio só para cima parece castigo.
--
-- A alvenaria e as pinturas correram bem; a eletricidade encontrou um quadro
-- em pior estado do que se pensava. É a história que a barra vermelha conta
-- sem ninguém a escrever.
INSERT INTO public.ops_custo (ordem_id, tipo, descricao, quantidade, valor_unit, total, origem)
SELECT o.id, v.tipo, v.descricao, v.qt, v.unit, v.total, 'manual'
  FROM public.ops_ordem o
  CROSS JOIN (VALUES
    ('material', 'Sacos de argamassa e rede',                 14.000,   6.50,    91.00),
    ('material', 'Quadro elétrico + disjuntores (imprevisto)',  1.000, 465.00,   465.00),
    ('material', 'Tubagem e acessórios',                       12.000,  14.20,   170.40),
    ('material', 'Tinta e primário',                            9.000,  21.50,   193.50),
    ('material', 'Balcão em MDF lacado',                        1.000, 575.00,   575.00),
    ('mao_obra', 'Equipa de dois — 3 dias',                    48.000,  22.00,  1056.00),
    ('servico',  'Contentor de entulho',                        1.000, 180.00,   180.00)
  ) AS v(tipo, descricao, qt, unit, total)
 WHERE o.codigo = 'DEMO-ORC-OT1'
   AND NOT EXISTS (SELECT 1 FROM public.ops_custo c WHERE c.ordem_id = o.id);


-- ── Duas tarefas, para a obra não parecer uma folha de cálculo ───────────
INSERT INTO public.ops_ordem_tarefa (ordem_id, posicao, nome, tipo, estado, obrigatoria)
SELECT o.id, v.posicao, v.nome, v.tipo, v.estado, true
  FROM public.ops_ordem o
  CROSS JOIN (VALUES
    (1, 'Estado da loja à chegada', 'inspecao', 'feita'),
    (2, 'Receção final com o cliente', 'inspecao', 'pendente')
  ) AS v(posicao, nome, tipo, estado)
 WHERE o.codigo = 'DEMO-ORC-OT1'
   AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_tarefa t WHERE t.ordem_id = o.id);


DROP TABLE IF EXISTS _ctx;

COMMIT;


-- ============================================================
--  O que fazer a seguir
-- ============================================================
--
--  1. Abrir `/ordens` e procurar **DEMO-ORC-OT1**.
--  2. Na ficha, o cartão **"Orçamentado contra gasto"**:
--
--       previsto   3 023,00 €
--       gasto      2 730,90 €
--       desvio       −292,10 €  (−9,7 %)
--
--     e, linha a linha, onde é que se ganhou e onde é que se perdeu.
--
--  3. O ecrã `/orcamentos` **continua vazio** — e é suposto. Essa lista mostra
--     os orçamentos ACEITES no CRM que ainda não viraram obra, e esta demo não
--     escreve no CRM. Para o ver com dados, é preciso um orçamento aceite a
--     sério em `/quotes`, com custo preenchido nas linhas.
--
--  Para remover tudo o que isto criou:
--
--      npm run supabase:demo-orcamento-remover
--
--  ou, à mão:
--
--      DELETE FROM public.ops_ordem WHERE codigo = 'DEMO-ORC-OT1';
--      DELETE FROM public.ops_local WHERE codigo = 'DEMO-ORC-L1';
--
--  (as tarefas, os custos e o previsto saem em cascata com a ordem)
-- ============================================================
