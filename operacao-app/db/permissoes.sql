-- =============================================================================
-- Olyvia · Operações — permissões no catálogo do CRM
--
-- Separado de `db/schema.sql` DE PROPÓSITO: este é o único ficheiro do módulo
-- que escreve numa tabela que não é `ops_*`.
--
-- Acrescenta 15 linhas a `public.anew_permissions`. Não altera nem apaga
-- nenhuma linha existente (`ON CONFLICT DO NOTHING`), e não dá capacidade
-- nenhuma a ninguém: `has_anew_permission()` exige uma linha explícita em
-- `anew_role_permissions`, sem bypass de administrador nem wildcard.
--
-- O que muda, de visível: passa a existir uma categoria "operations" na UI de
-- Papéis do CRM, com 15 entradas por atribuir. É para isso que serve — para
-- alguém as poder dar a um papel sem escrever SQL.
--
-- Para desfazer:
--   DELETE FROM public.anew_permissions WHERE category = 'operations';
-- =============================================================================

INSERT INTO public.anew_permissions
  (code, name, description, category, scope, supports_scope, is_dangerous)
VALUES
  ('operations.view',             'Aceder a Operações',        'Ver o módulo de Operações',                                'operations', 'organization', false, false),
  ('operations.orders.view',      'Ver ordens',                'Ver as ordens de trabalho em que participa',               'operations', 'organization', false, false),
  ('operations.orders.view_all',  'Ver todas as ordens',       'Ver todas as ordens da organização, não só as próprias',   'operations', 'organization', false, false),
  ('operations.orders.create',    'Criar ordens',              'Abrir ordens corretivas, preventivas e de obra',           'operations', 'organization', false, false),
  ('operations.orders.edit',      'Editar ordens',             'Alterar dados, responsável e agendamento',                 'operations', 'organization', false, false),
  ('operations.orders.approve',   'Aprovar ordens',            'Aprovar ou rejeitar ordens por aprovar',                   'operations', 'organization', false, false),
  ('operations.orders.execute',   'Executar ordens',           'Iniciar, pausar, fechar e responder às tarefas',           'operations', 'organization', false, false),
  ('operations.orders.confirm',   'Confirmar ordens fechadas', 'Dar por boa uma ordem já fechada pelo técnico',            'operations', 'organization', false, false),
  ('operations.orders.cancel',    'Cancelar ordens',           'Cancelar ou reabrir uma ordem, com motivo',                'operations', 'organization', false, true),
  ('operations.locations.view',   'Ver locais e ativos',       'Ver a árvore de locais e as fichas de ativo',              'operations', 'organization', false, false),
  ('operations.locations.manage', 'Gerir locais e ativos',     'Criar e alterar locais, ativos e categorias',              'operations', 'organization', false, false),
  ('operations.checklists.manage','Gerir checklists',          'Criar, versionar e publicar checklists',                   'operations', 'organization', false, false),
  ('operations.plans.manage',     'Gerir planos',              'Criar e alterar planos de manutenção e a recorrência',     'operations', 'organization', false, false),
  ('operations.costs.view',       'Ver custos de Operações',   'Ver custos e custo/hora. Nunca atribuir a técnicos',       'operations', 'organization', false, true),
  ('operations.settings.manage',  'Configurar Operações',      'Gerir a equipa e o âmbito de visibilidade',                'operations', 'organization', false, true)
ON CONFLICT (code) DO NOTHING;

DO $verificar$
DECLARE v integer;
BEGIN
  SELECT count(*) INTO v FROM public.anew_permissions WHERE category = 'operations';
  IF v <> 15 THEN
    RAISE EXCEPTION 'Operações: esperadas 15 permissões no catálogo, encontradas %', v;
  END IF;
  RAISE NOTICE 'Operações: 15 permissões no catálogo. Nenhuma atribuída ainda — faz isso na UI de Papéis.';
END
$verificar$;
