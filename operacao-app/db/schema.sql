-- =============================================================================
-- Olyvia · Operações — esquema v1
--
-- Aplicação independente do sistema Olyvia. Partilha o MESMO backend Supabase
-- (mesma base de dados, mesmos utilizadores, mesmos clientes), mas não altera
-- nada do que já lá está. Mesmo molde do `duc-app`.
--
-- Aditivo e idempotente: só cria tabelas novas com prefixo `ops_` e as suas
-- policies. Pode correr-se mais do que uma vez sem estragar nada.
-- =============================================================================
--
--
-- O QUE ESTE ESQUEMA NÃO FAZ
-- ==========================
--   · ALTER TABLE em nenhuma tabela existente
--   · CREATE OR REPLACE de nenhuma função existente
--   · DROP/CREATE de nenhuma policy existente
--   · CREATE TRIGGER em nenhuma tabela existente
--   · FOREIGN KEY de uma tabela nova PARA uma tabela existente   ← ver nota 1
--   · UPDATE ou DELETE de qualquer linha existente
--
-- Insere 15 linhas de catálogo em `anew_permissions` — e só isso. Ver nota 2.
--
--
-- NOTA 1 — Porque não há foreign key para as tabelas do CRM
-- ---------------------------------------------------------
-- `ops_local.cliente_id` aponta para `anew_clients.id`, mas sem FK. Duas razões
-- concretas, ambas verificadas no esquema real:
--
--   (a) `public.purge_entity_facet()` faz `DELETE FROM public.anew_clients` —
--       um hard delete já em produção. Uma FK normal fazia essa função passar a
--       rebentar sempre que o cliente tivesse dados de Operações: uma área que
--       funciona hoje deixava de funcionar. Uma FK com CASCADE era pior —
--       apagava ordens de trabalho em silêncio.
--
--   (b) Quando a integração com o núcleo amadurecer, `cliente` e `utilizador`
--       passam a ser VISTAS. Não há foreign key para uma vista.
--
-- A integridade destas referências é imposta na aplicação e nas RPCs, não no
-- esquema. As FK ENTRE tabelas `ops_*` existem todas e são normais.
--
--
-- NOTA 2 — Porque inserir em `anew_permissions` é inócuo
-- ------------------------------------------------------
-- `public.has_anew_permission()` exige uma linha explícita em
-- `anew_role_permissions` — não há bypass de administrador nem wildcard
-- (lido e confirmado). Inserir códigos novos no catálogo não dá capacidade
-- nenhuma a ninguém enquanto um administrador não os atribuir a um papel na UI
-- de Papéis do CRM. Nenhum papel existente muda de comportamento.
--
--
-- V1 E O QUE FICA PARA DEPOIS
-- ===========================
-- Isto é o ciclo real fechado de ponta a ponta, e nada mais:
--   local › ativo › ordem › tarefa › sessão › custo, com histórico auditável.
--
-- Simplificações deliberadas face ao levantamento do Infraspeak:
--   · área, tipo e prioridade são COLUNAS de texto, não três tabelas de
--     configuração. Viram tabelas quando alguém precisar de as gerir.
--   · a pausa vive em duas colunas da ordem, em vez de tabela própria — no
--     Infraspeak há dois catálogos de motivos de pausa para o mesmo conceito.
--   · um plano tem um só conjunto de alvos (`ops_plano_alvo`), em vez das três
--     tabelas de ligação separadas.
--   · sem agendamentos múltiplos por ordem, sem SLA, sem medições, sem regras
--     de notificação, sem skills nem horários. Todos identificados, nenhum
--     necessário para provar o ciclo.
--
--
-- COMO APLICAR
-- ============
--   Supabase Studio → SQL Editor → colar → Run
--   ou:  psql "$DATABASE_URL" -f db/schema.sql
--
-- Verificação rápida antes de aplicar, sem Docker e sem tocar na base real:
--   npm run validar-schema


-- ============================================================
-- 0. Guarda de pré-requisitos
-- ============================================================

DO $guarda$
BEGIN
  IF to_regclass('public.anew_organizations') IS NULL
     OR to_regclass('public.anew_users') IS NULL
     OR to_regclass('public.anew_clients') IS NULL
     OR to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'Operações: falta o núcleo do CRM (anew_*).';
  END IF;

  IF to_regprocedure('public.get_user_visible_org_ids(uuid)') IS NULL
     OR to_regprocedure('public.has_anew_permission(uuid, text)') IS NULL
     OR to_regprocedure('public.is_system_admin_user(uuid)') IS NULL
     OR to_regprocedure('public.current_business_user_id()') IS NULL THEN
    RAISE EXCEPTION 'Operações: faltam funções de autorização do CRM.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Equipa
-- ============================================================

-- O que Operações sabe sobre um utilizador do CRM que o CRM não guarda.
-- A identidade (nome, email) continua em `anew_users` e não é copiada.
--
-- REGRA DURA: o técnico nunca vê custo/hora, nem o seu nem o de ninguém.
-- Uma policy não esconde colunas — por isso a app lê sempre `ops_v_equipa`,
-- a vista definida mais abaixo, que não tem a coluna.
CREATE TABLE IF NOT EXISTS public.ops_utilizador_perfil (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  utilizador_id    uuid NOT NULL,               -- → anew_users.id
  funcao           text NOT NULL DEFAULT 'tecnico'
                     CHECK (funcao IN ('admin','gestor','operador','tecnico')),
  custo_hora       numeric(8,2),
  zona_base        text,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, utilizador_id)
);

-- Âmbito de visibilidade, com default restritivo. Na instância Infraspeak
-- observada um técnico estava associado a 107 clientes e 225 edifícios — o
-- âmbito existia e não servia para nada.
CREATE TABLE IF NOT EXISTS public.ops_utilizador_cliente (
  utilizador_id  uuid NOT NULL,                 -- → anew_users.id
  cliente_id     uuid NOT NULL,                 -- → anew_clients.id
  PRIMARY KEY (utilizador_id, cliente_id)
);


-- ============================================================
-- 2. Hierarquia física
-- ============================================================
-- `ops_local` é auto-referencial. Serve a obra com 2 níveis
-- (Cliente › Morada) e a manutenção com 4 (Cliente › Torre › Piso › Espaço),
-- sem código diferente. É o que faz desaparecer o conceito "Edifício" — no
-- Infraspeak há centenas de "edifícios" que são apartamentos particulares.

CREATE TABLE IF NOT EXISTS public.ops_local (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  cliente_id       uuid NOT NULL,               -- → anew_clients.id
  parent_id        uuid REFERENCES public.ops_local(id) ON DELETE CASCADE,
  codigo           text NOT NULL,
  nome             text NOT NULL,
  tipo             text NOT NULL DEFAULT 'morada'
                     CHECK (tipo IN ('morada','edificio','piso','espaco')),
  morada           text,
  cidade           text,
  cod_postal       text,
  zona             text,
  notas            text,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo),
  CONSTRAINT ops_local_nao_e_pai_de_si CHECK (parent_id IS NULL OR parent_id <> id)
);

-- Taxonomia pura, dois níveis. Separada de tudo o resto de propósito: no
-- Infraspeak a mesma árvore servia de categoria, de contrato e de plano, e
-- acabou com `C_FICHA DE NOVOS CLIENTES - Comercial` dentro dos equipamentos.
CREATE TABLE IF NOT EXISTS public.ops_categoria_ativo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  parent_id        uuid REFERENCES public.ops_categoria_ativo(id) ON DELETE CASCADE,
  codigo           text NOT NULL,
  nome             text NOT NULL,
  UNIQUE (organization_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.ops_ativo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  local_id         uuid NOT NULL REFERENCES public.ops_local(id) ON DELETE CASCADE,
  categoria_id     uuid REFERENCES public.ops_categoria_ativo(id) ON DELETE SET NULL,
  codigo           text NOT NULL,
  nome             text NOT NULL,
  descricao        text,
  marca            text,
  modelo           text,
  num_serie        text,
  criticidade      text NOT NULL DEFAULT 'normal'
                     CHECK (criticidade IN ('baixa','normal','alta','critica')),
  data_instalacao  date,
  garantia_ate     date,
  foto_url         text,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo)
);


-- ============================================================
-- 3. Checklists
-- ============================================================
-- Versionadas. Ao gerar uma ordem congela-se a versão usada, para que editar
-- uma checklist não reescreva o histórico do que já foi executado.

CREATE TABLE IF NOT EXISTS public.ops_checklist (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  codigo           text NOT NULL,
  nome             text NOT NULL,
  versao           integer NOT NULL DEFAULT 1,
  estado           text NOT NULL DEFAULT 'rascunho'
                     CHECK (estado IN ('rascunho','publicada','arquivada')),
  criada_em        timestamptz NOT NULL DEFAULT now(),
  publicada_em     timestamptz,
  UNIQUE (organization_id, codigo, versao)
);

CREATE TABLE IF NOT EXISTS public.ops_checklist_tarefa (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id      uuid NOT NULL REFERENCES public.ops_checklist(id) ON DELETE CASCADE,
  posicao           integer NOT NULL DEFAULT 0,
  codigo            text,
  nome              text NOT NULL,
  descricao         text,
  tipo              text NOT NULL DEFAULT 'inspecao'
                      CHECK (tipo IN ('inspecao','medicao','numero','texto','foto','assinatura')),
  unidade           text,
  limite_min        numeric(12,3),
  limite_max        numeric(12,3),
  obrigatoria       boolean NOT NULL DEFAULT true,
  foto_obrigatoria  boolean NOT NULL DEFAULT false,
  tempo_estimado    integer NOT NULL DEFAULT 0   -- segundos
);


-- ============================================================
-- 4. Planos
-- ============================================================
-- A regra guardada em RRULE e uma janela materializada. O Infraspeak gera
-- ocorrências até 2033 — ruído permanente nas listas e no calendário.

CREATE TABLE IF NOT EXISTS public.ops_plano (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL,
  codigo             text NOT NULL,
  nome               text NOT NULL,
  cliente_id         uuid NOT NULL,             -- → anew_clients.id
  estado             text NOT NULL DEFAULT 'ativo'
                       CHECK (estado IN ('ativo','suspenso','terminado')),
  regra_recorrencia  text NOT NULL,             -- RRULE (iCal)
  hora_prevista      time NOT NULL DEFAULT '09:00',
  -- Campo próprio. No Infraspeak a duração vive no NOME do plano (`… 4H`).
  duracao_estimada   integer NOT NULL DEFAULT 0, -- segundos
  responsavel_id     uuid,                      -- → anew_users.id
  inicio_em          date NOT NULL DEFAULT CURRENT_DATE,
  fim_em             date,
  materializado_ate  date,                      -- horizonte gerado: hoje + 120 dias
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo)
);

-- Um só conjunto de alvos, em vez de três tabelas de ligação.
CREATE TABLE IF NOT EXISTS public.ops_plano_alvo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plano_id      uuid NOT NULL REFERENCES public.ops_plano(id) ON DELETE CASCADE,
  local_id      uuid REFERENCES public.ops_local(id) ON DELETE CASCADE,
  ativo_id      uuid REFERENCES public.ops_ativo(id) ON DELETE CASCADE,
  checklist_id  uuid REFERENCES public.ops_checklist(id) ON DELETE SET NULL,
  CONSTRAINT ops_plano_alvo_tem_conteudo
    CHECK (local_id IS NOT NULL OR ativo_id IS NOT NULL)
);


-- ============================================================
-- 5. Ordens
-- ============================================================
-- UMA tabela para as três origens. Substitui `/works` + `/scheduled-works`
-- + `/failures` — três ecrãs do Infraspeak para o mesmo objeto, com dois
-- conjuntos de estados e dois catálogos de motivos de pausa.

CREATE TABLE IF NOT EXISTS public.ops_ordem (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL,
  codigo                text NOT NULL,          -- OT-2026-00842, dizível ao telefone
  origem                text NOT NULL
                          CHECK (origem IN ('preventiva','corretiva','obra')),
  -- "Atrasada" não é estado: é um badge derivado de `agendada_para`.
  estado                text NOT NULL DEFAULT 'agendada'
                          CHECK (estado IN ('por_aprovar','agendada','em_curso','pausada',
                                            'fechada','confirmada','cancelada')),
  -- v1: texto simples. Viram tabelas de configuração quando for preciso geri-los.
  prioridade            text NOT NULL DEFAULT 'normal'
                          CHECK (prioridade IN ('baixa','normal','alta','urgente')),
  area                  text,
  tipo                  text,

  plano_id              uuid REFERENCES public.ops_plano(id) ON DELETE SET NULL,
  cliente_id            uuid NOT NULL,          -- → anew_clients.id
  local_id              uuid REFERENCES public.ops_local(id) ON DELETE SET NULL,

  titulo                text NOT NULL,
  descricao             text,

  -- Campos próprios, não texto nas observações. No Infraspeak o contacto e a
  -- janela de visita vão em "Observações", com dados pessoais à mistura e sem
  -- possibilidade de filtrar.
  contacto_nome         text,
  contacto_telefone     text,
  janela_inicio         timestamptz,
  janela_fim            timestamptz,

  responsavel_id        uuid,                   -- → anew_users.id
  agendada_para         timestamptz,
  aprovada_em           timestamptz,
  aprovada_por          uuid,                   -- → anew_users.id
  iniciada_em           timestamptz,
  fechada_em            timestamptz,
  confirmada_em         timestamptz,
  cancelada_em          timestamptz,
  motivo_cancelamento   text,

  -- Pausa em duas colunas, em vez de tabela própria. Pausar exige as duas.
  pausa_motivo          text,
  pausa_retoma_prevista timestamptz,

  -- Corretiva nascida de uma tarefa não conforme: fecha o ciclo
  -- inspeção → reparação e torna-o auditável.
  gerada_por_tarefa_id  uuid,
  criada_por            uuid,                   -- → anew_users.id
  criada_em             timestamptz NOT NULL DEFAULT now(),
  atualizada_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo),

  CONSTRAINT ops_ordem_pausa_completa CHECK (
    estado <> 'pausada'
    OR (pausa_motivo IS NOT NULL AND pausa_retoma_prevista IS NOT NULL)
  )
);

-- Substitui a "Intervenção" do Infraspeak: é a checklist aplicada a um alvo.
-- Menos um nível — ordem › alvo › tarefa, em vez de
-- ordem › ativo › intervenção › tarefa.
CREATE TABLE IF NOT EXISTS public.ops_ordem_alvo (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id          uuid NOT NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  ativo_id          uuid REFERENCES public.ops_ativo(id) ON DELETE SET NULL,
  local_id          uuid REFERENCES public.ops_local(id) ON DELETE SET NULL,
  checklist_id      uuid REFERENCES public.ops_checklist(id) ON DELETE SET NULL,
  checklist_versao  integer,
  posicao           integer NOT NULL DEFAULT 0,
  -- Um alvo é uma coisa, um sítio, ou só um procedimento a cumprir.
  CONSTRAINT ops_ordem_alvo_tem_conteudo
    CHECK (ativo_id IS NOT NULL OR local_id IS NOT NULL OR checklist_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.ops_ordem_tarefa (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id       uuid NOT NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  ordem_alvo_id  uuid REFERENCES public.ops_ordem_alvo(id) ON DELETE CASCADE,
  posicao        integer NOT NULL DEFAULT 0,
  codigo         text,
  nome           text NOT NULL,
  tipo           text NOT NULL DEFAULT 'inspecao'
                   CHECK (tipo IN ('inspecao','medicao','numero','texto','foto','assinatura')),
  estado         text NOT NULL DEFAULT 'pendente'
                   CHECK (estado IN ('pendente','feita','nao_conforme','nao_aplicavel')),
  valor_num      numeric(12,3),
  valor_texto    text,
  unidade        text,
  limite_min     numeric(12,3),
  limite_max     numeric(12,3),
  obrigatoria    boolean NOT NULL DEFAULT true,
  observacoes    text,
  executada_por  uuid,                          -- → anew_users.id
  inicio         timestamptz,
  fim            timestamptz,
  tempo_estimado integer NOT NULL DEFAULT 0
);

ALTER TABLE public.ops_ordem
  DROP CONSTRAINT IF EXISTS ops_ordem_gerada_por_tarefa_fkey;
ALTER TABLE public.ops_ordem
  ADD CONSTRAINT ops_ordem_gerada_por_tarefa_fkey
  FOREIGN KEY (gerada_por_tarefa_id)
  REFERENCES public.ops_ordem_tarefa(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.ops_ordem_pessoa (
  ordem_id       uuid NOT NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  utilizador_id  uuid NOT NULL,                 -- → anew_users.id
  papel          text NOT NULL DEFAULT 'executante',
  PRIMARY KEY (ordem_id, utilizador_id)
);

-- O que faz o custo de mão de obra deixar de ser 0,00 € em todas as ordens.
-- No Infraspeak o cronómetro corre do início ao fecho, noites e fins de semana
-- incluídos: vi `5303:05:34` numa ordem em curso. Um número desses não custeia
-- nada. Aqui o tempo é a soma de sessões reais.
CREATE TABLE IF NOT EXISTS public.ops_sessao_trabalho (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id       uuid NOT NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  utilizador_id  uuid NOT NULL,                 -- → anew_users.id
  inicio         timestamptz NOT NULL,
  fim            timestamptz,
  -- 'whatsapp' já é aceite para que a integração futura não precise de mudar
  -- o esquema.
  origem         text NOT NULL DEFAULT 'web'
                   CHECK (origem IN ('web','app','whatsapp','manual')),
  CONSTRAINT ops_sessao_fim_depois_do_inicio CHECK (fim IS NULL OR fim >= inicio)
);

CREATE TABLE IF NOT EXISTS public.ops_custo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id    uuid NOT NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  tipo        text NOT NULL CHECK (tipo IN ('mao_obra','material','servico','outro')),
  descricao   text NOT NULL,
  quantidade  numeric(12,3) NOT NULL DEFAULT 1,
  valor_unit  numeric(12,2) NOT NULL DEFAULT 0,
  total       numeric(12,2) NOT NULL DEFAULT 0,
  origem      text NOT NULL DEFAULT 'manual'
                CHECK (origem IN ('calculado','manual','inventario')),
  -- Fronteira com Olyvia/Inventário, por decidir. Até lá o material é custo
  -- manual e esta coluna fica NULL. Sem FK a `products`, pela nota 1.
  produto_id  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- Anexos com tipo e ligação à tarefa. Num pedido de obra do Infraspeak contei
-- 47 documentos sem tipologia, listados como `12964`, `13001` — impossível
-- saber o que é cada um.
CREATE TABLE IF NOT EXISTS public.ops_anexo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  ordem_id         uuid REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  ordem_tarefa_id  uuid REFERENCES public.ops_ordem_tarefa(id) ON DELETE CASCADE,
  ativo_id         uuid REFERENCES public.ops_ativo(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  ficheiro_url     text,
  mime             text,
  tamanho          integer,
  carregado_por    uuid,                        -- → anew_users.id
  carregado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_mensagem (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_id   uuid NOT NULL REFERENCES public.ops_ordem(id) ON DELETE CASCADE,
  canal      text NOT NULL DEFAULT 'interno' CHECK (canal IN ('interno','cliente')),
  autor_id   uuid,                              -- → anew_users.id
  texto      text NOT NULL,
  criada_em  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 6. Histórico e sequência
-- ============================================================
-- Tabela de eventos própria. Não escreve em `entity_audit_log` e não instala
-- triggers em tabelas existentes.

CREATE TABLE IF NOT EXISTS public.ops_evento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  entidade         text NOT NULL,
  entidade_id      uuid NOT NULL,
  tipo             text NOT NULL,
  descricao        text,
  autor_id         uuid,                        -- → anew_users.id
  antes            jsonb,
  depois           jsonb,
  criado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_sequencia (
  organization_id  uuid NOT NULL,
  chave            text NOT NULL,
  valor            integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, chave)
);


-- ============================================================
-- 7. Índices
-- ============================================================

CREATE INDEX IF NOT EXISTS ops_ordem_estado_idx      ON public.ops_ordem (organization_id, estado, agendada_para);
CREATE INDEX IF NOT EXISTS ops_ordem_cliente_idx     ON public.ops_ordem (organization_id, cliente_id, estado);
CREATE INDEX IF NOT EXISTS ops_ordem_responsavel_idx ON public.ops_ordem (organization_id, responsavel_id, estado);
CREATE INDEX IF NOT EXISTS ops_ordem_local_idx       ON public.ops_ordem (local_id, estado);
CREATE INDEX IF NOT EXISTS ops_ordem_plano_idx       ON public.ops_ordem (plano_id, agendada_para);
CREATE INDEX IF NOT EXISTS ops_ordem_tarefa_idx      ON public.ops_ordem_tarefa (ordem_id, ordem_alvo_id, posicao);
CREATE INDEX IF NOT EXISTS ops_ordem_alvo_idx        ON public.ops_ordem_alvo (ordem_id, posicao);
CREATE INDEX IF NOT EXISTS ops_sessao_ordem_idx      ON public.ops_sessao_trabalho (ordem_id);
CREATE INDEX IF NOT EXISTS ops_sessao_util_idx       ON public.ops_sessao_trabalho (utilizador_id, inicio);
CREATE INDEX IF NOT EXISTS ops_local_parent_idx      ON public.ops_local (organization_id, parent_id);
CREATE INDEX IF NOT EXISTS ops_local_cliente_idx     ON public.ops_local (organization_id, cliente_id);
CREATE INDEX IF NOT EXISTS ops_ativo_local_idx       ON public.ops_ativo (organization_id, local_id);
CREATE INDEX IF NOT EXISTS ops_custo_ordem_idx       ON public.ops_custo (ordem_id, tipo);
CREATE INDEX IF NOT EXISTS ops_anexo_ordem_idx       ON public.ops_anexo (ordem_id);
CREATE INDEX IF NOT EXISTS ops_evento_entidade_idx   ON public.ops_evento (entidade, entidade_id, criado_em DESC);


-- ============================================================
-- 8. Funções de âmbito
-- ============================================================
-- SECURITY DEFINER para poderem ler as tabelas `ops_*` sem recursão de RLS —
-- a policy de `ops_ordem` chama `ops_pode_ver_ordem`, que lê `ops_ordem`.

CREATE OR REPLACE FUNCTION public.ops_clientes_no_ambito(_auth_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT uc.cliente_id
    FROM public.ops_utilizador_cliente uc
    JOIN public.anew_users au ON au.id = uc.utilizador_id
   WHERE au.auth_user_id = _auth_uid
$$;

-- Uma ordem é visível se o utilizador vê tudo, ou se está nela.
-- "O técnico só vê as ordens em que está."
CREATE OR REPLACE FUNCTION public.ops_pode_ver_ordem(_auth_uid uuid, _ordem_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_anew_permission(_auth_uid, 'operations.orders.view_all')
    OR EXISTS (
      SELECT 1
        FROM public.ops_ordem o
        JOIN public.anew_users au ON au.auth_user_id = _auth_uid
       WHERE o.id = _ordem_id
         AND (
           o.responsavel_id = au.id
           OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa op
                       WHERE op.ordem_id = o.id AND op.utilizador_id = au.id)
         )
    )
$$;

REVOKE ALL ON FUNCTION public.ops_clientes_no_ambito(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_pode_ver_ordem(uuid, uuid)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_clientes_no_ambito(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_pode_ver_ordem(uuid, uuid) TO authenticated, service_role;


-- ============================================================
-- 9. Catálogo de permissões
-- ============================================================
-- Só catálogo. Ver nota 2: nenhum papel existente ganha nada.

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


-- ============================================================
-- 10. Vistas de leitura
-- ============================================================
--
-- `security_invoker = true` é obrigatório nas duas.
-- --------------------------------------------------------
-- Por defeito uma vista corre com os privilégios de QUEM A CRIOU, o que aqui
-- significaria ignorar a RLS de `anew_users` e `anew_clients` e devolver a
-- lista completa a qualquer utilizador autenticado. Com `security_invoker` a
-- vista corre com os privilégios de quem a consulta, e a RLS que o CRM já tem
-- nessas tabelas continua a aplicar-se tal e qual.
--
-- Uma vista não é uma foreign key: consultar `anew_clients` não cria
-- dependência no caminho de DELETE, e apagar um cliente continua a funcionar.

-- A equipa, SEM a coluna custo_hora.
-- A app lê sempre daqui. Uma policy filtra linhas, não colunas — é esta vista
-- que faz a regra dura valer também para quem sabe escrever SQL.
CREATE OR REPLACE VIEW public.ops_v_equipa
WITH (security_invoker = true) AS
  SELECT p.id, p.organization_id, p.utilizador_id, p.funcao, p.zona_base,
         p.ativo, u.name AS nome, u.email
    FROM public.ops_utilizador_perfil p
    JOIN public.anew_users u ON u.id = p.utilizador_id
   WHERE u.deleted_at IS NULL;

-- Clientes, com o nome resolvido.
-- `anew_clients` NÃO tem coluna de nome: o nome vive em
-- `anew_entities.display_name`, alcançável por `anew_clients.entity_id`.
-- Sem esta vista, cada ecrã de Operações teria de repetir esse join e mais
-- cedo ou mais tarde um deles esquecia-se do `deleted_at`.
CREATE OR REPLACE VIEW public.ops_v_cliente
WITH (security_invoker = true) AS
  SELECT c.id, c.organization_id, e.display_name AS nome, c.status
    FROM public.anew_clients c
    JOIN public.anew_entities e ON e.id = c.entity_id
   WHERE c.deleted_at IS NULL;

GRANT SELECT ON public.ops_v_equipa  TO authenticated;
GRANT SELECT ON public.ops_v_cliente TO authenticated;
REVOKE ALL ON public.ops_v_equipa  FROM anon;
REVOKE ALL ON public.ops_v_cliente FROM anon;


-- ============================================================
-- 11. RLS
-- ============================================================

DO $rls$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename LIKE 'ops\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$rls$;


-- ── 11.1 Locais, ativos, categorias, checklists, planos ───────────────────
-- Leitura com a permissão de ver; escrita com a de gerir.

DO $policies$
DECLARE
  r record;
  regras constant text[][] := ARRAY[
    ARRAY['ops_local',            'operations.locations.view',  'operations.locations.manage'],
    ARRAY['ops_ativo',            'operations.locations.view',  'operations.locations.manage'],
    ARRAY['ops_categoria_ativo',  'operations.locations.view',  'operations.locations.manage'],
    ARRAY['ops_checklist',        'operations.view',            'operations.checklists.manage'],
    ARRAY['ops_plano',            'operations.view',            'operations.plans.manage'],
    ARRAY['ops_anexo',            'operations.view',            'operations.orders.execute'],
    ARRAY['ops_evento',           'operations.view',            'operations.view']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(regras, 1) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', regras[i][1]);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write  ON public.%1$I', regras[i][1]);

    EXECUTE format($f$
      CREATE POLICY %1$s_select ON public.%1$I
        FOR SELECT TO authenticated USING (
          public.is_system_admin_user((SELECT auth.uid()))
          OR (
            organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            AND public.has_anew_permission((SELECT auth.uid()), %2$L)
          )
        )
    $f$, regras[i][1], regras[i][2]);

    -- ops_evento é append-only: só INSERT, nunca UPDATE nem DELETE.
    IF regras[i][1] = 'ops_evento' THEN
      EXECUTE format($f$
        CREATE POLICY %1$s_write ON public.%1$I
          FOR INSERT TO authenticated WITH CHECK (
            organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
          )
      $f$, regras[i][1]);
    ELSE
      EXECUTE format($f$
        CREATE POLICY %1$s_write ON public.%1$I
          FOR ALL TO authenticated USING (
            public.is_system_admin_user((SELECT auth.uid()))
            OR (
              organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              AND public.has_anew_permission((SELECT auth.uid()), %2$L)
            )
          ) WITH CHECK (
            public.is_system_admin_user((SELECT auth.uid()))
            OR (
              organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
              AND public.has_anew_permission((SELECT auth.uid()), %2$L)
            )
          )
      $f$, regras[i][1], regras[i][3]);
    END IF;
  END LOOP;
END
$policies$;


-- ── 11.2 Ordens ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS ops_ordem_select ON public.ops_ordem;
CREATE POLICY ops_ordem_select ON public.ops_ordem
  FOR SELECT TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'operations.orders.view')
      AND public.ops_pode_ver_ordem((SELECT auth.uid()), id)
    )
  );

DROP POLICY IF EXISTS ops_ordem_insert ON public.ops_ordem;
CREATE POLICY ops_ordem_insert ON public.ops_ordem
  FOR INSERT TO authenticated WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'operations.orders.create')
    )
  );

DROP POLICY IF EXISTS ops_ordem_update ON public.ops_ordem;
CREATE POLICY ops_ordem_update ON public.ops_ordem
  FOR UPDATE TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        public.has_anew_permission((SELECT auth.uid()), 'operations.orders.edit')
        OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.execute')
      )
      AND public.ops_pode_ver_ordem((SELECT auth.uid()), id)
    )
  ) WITH CHECK (
    organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS ops_ordem_delete ON public.ops_ordem;
CREATE POLICY ops_ordem_delete ON public.ops_ordem
  FOR DELETE TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'operations.orders.cancel')
    )
  );


-- ── 11.3 Tudo o que pende de uma ordem ────────────────────────────────────
-- Visibilidade herdada: se a ordem é visível, o filho é visível — a policy da
-- ordem-mãe já garante que só lá chega quem está nela.

DO $policies$
DECLARE
  t text;
  tabelas constant text[] := ARRAY[
    'ops_ordem_alvo', 'ops_ordem_tarefa', 'ops_ordem_pessoa',
    'ops_sessao_trabalho', 'ops_mensagem'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write  ON public.%1$I', t);
    EXECUTE format($f$
      CREATE POLICY %1$s_select ON public.%1$I
        FOR SELECT TO authenticated USING (
          EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.id = %1$I.ordem_id)
        );
      CREATE POLICY %1$s_write ON public.%1$I
        FOR ALL TO authenticated USING (
          public.is_system_admin_user((SELECT auth.uid()))
          OR (
            public.has_anew_permission((SELECT auth.uid()), 'operations.orders.execute')
            AND EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.id = %1$I.ordem_id)
          )
        ) WITH CHECK (
          public.is_system_admin_user((SELECT auth.uid()))
          OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.execute')
        );
    $f$, t);
  END LOOP;
END
$policies$;


-- ── 11.4 Custos — o técnico não vê dinheiro ───────────────────────────────

DROP POLICY IF EXISTS ops_custo_select ON public.ops_custo;
CREATE POLICY ops_custo_select ON public.ops_custo
  FOR SELECT TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      public.has_anew_permission((SELECT auth.uid()), 'operations.costs.view')
      AND EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.id = ops_custo.ordem_id)
    )
  );

DROP POLICY IF EXISTS ops_custo_write ON public.ops_custo;
CREATE POLICY ops_custo_write ON public.ops_custo
  FOR ALL TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.costs.view')
  ) WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.costs.view')
  );


-- ── 11.5 Perfis e âmbito ──────────────────────────────────────────────────
-- A linha do próprio é sempre legível (a app precisa da função); as dos
-- outros só com `operations.costs.view`. A coluna custo_hora nunca sai por
-- aqui — a app lê `ops_v_equipa`.

DROP POLICY IF EXISTS ops_utilizador_perfil_select ON public.ops_utilizador_perfil;
CREATE POLICY ops_utilizador_perfil_select ON public.ops_utilizador_perfil
  FOR SELECT TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND (
        public.has_anew_permission((SELECT auth.uid()), 'operations.costs.view')
        OR utilizador_id = public.current_business_user_id()
      )
    )
  );

DROP POLICY IF EXISTS ops_utilizador_perfil_write ON public.ops_utilizador_perfil;
CREATE POLICY ops_utilizador_perfil_write ON public.ops_utilizador_perfil
  FOR ALL TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'operations.settings.manage')
    )
  ) WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), 'operations.settings.manage')
    )
  );

DROP POLICY IF EXISTS ops_utilizador_cliente_select ON public.ops_utilizador_cliente;
CREATE POLICY ops_utilizador_cliente_select ON public.ops_utilizador_cliente
  FOR SELECT TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.view')
  );

DROP POLICY IF EXISTS ops_utilizador_cliente_write ON public.ops_utilizador_cliente;
CREATE POLICY ops_utilizador_cliente_write ON public.ops_utilizador_cliente
  FOR ALL TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.settings.manage')
  ) WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.settings.manage')
  );


-- ── 11.6 Filhos de checklist e de plano ───────────────────────────────────

DROP POLICY IF EXISTS ops_checklist_tarefa_select ON public.ops_checklist_tarefa;
CREATE POLICY ops_checklist_tarefa_select ON public.ops_checklist_tarefa
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_checklist c WHERE c.id = ops_checklist_tarefa.checklist_id)
  );

DROP POLICY IF EXISTS ops_checklist_tarefa_write ON public.ops_checklist_tarefa;
CREATE POLICY ops_checklist_tarefa_write ON public.ops_checklist_tarefa
  FOR ALL TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.checklists.manage')
  ) WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.checklists.manage')
  );

DROP POLICY IF EXISTS ops_plano_alvo_select ON public.ops_plano_alvo;
CREATE POLICY ops_plano_alvo_select ON public.ops_plano_alvo
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_plano p WHERE p.id = ops_plano_alvo.plano_id)
  );

DROP POLICY IF EXISTS ops_plano_alvo_write ON public.ops_plano_alvo;
CREATE POLICY ops_plano_alvo_write ON public.ops_plano_alvo
  FOR ALL TO authenticated USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.plans.manage')
  ) WITH CHECK (
    public.is_system_admin_user((SELECT auth.uid()))
    OR public.has_anew_permission((SELECT auth.uid()), 'operations.plans.manage')
  );

-- ops_sequencia fica sem policy nenhuma: RLS ligada e zero policies significa
-- que ninguém lhe acede diretamente. Só a RPC de numeração lá chega.


-- ============================================================
-- 12. Grants
-- ============================================================
-- `anon` fica de fora de tudo.

DO $grants$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename LIKE 'ops\_%'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END
$grants$;


-- ============================================================
-- 13. Numeração — OT-2026-00842
-- ============================================================
-- Sequência por organização e ano. `PMP.3437940.163323715` é impossível de
-- dizer ao telefone; isto não é.

CREATE OR REPLACE FUNCTION public.ops_proximo_codigo(_org_id uuid, _prefixo text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chave text;
  v_valor integer;
  v_ano   text := to_char(now(), 'YYYY');
BEGIN
  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR (
      _org_id IN (SELECT public.get_user_visible_org_ids(auth.uid()))
      AND public.has_anew_permission(auth.uid(), 'operations.orders.create')
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens nesta organização'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_chave := _prefixo || '-' || v_ano;

  INSERT INTO public.ops_sequencia (organization_id, chave, valor)
  VALUES (_org_id, v_chave, 1)
  ON CONFLICT (organization_id, chave)
  DO UPDATE SET valor = public.ops_sequencia.valor + 1
  RETURNING valor INTO v_valor;

  RETURN _prefixo || '-' || v_ano || '-' || lpad(v_valor::text, 5, '0');
END
$$;

REVOKE ALL ON FUNCTION public.ops_proximo_codigo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_proximo_codigo(uuid, text) TO authenticated, service_role;


-- ============================================================
-- 14. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v_tabelas integer;
  v_rls     integer;
  v_perms   integer;
BEGIN
  SELECT count(*) INTO v_tabelas FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'ops\_%';
  SELECT count(*) INTO v_rls FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'ops\_%' AND rowsecurity;
  SELECT count(*) INTO v_perms FROM public.anew_permissions WHERE category = 'operations';

  IF v_tabelas <> 19 THEN
    RAISE EXCEPTION 'Operações: esperadas 19 tabelas, encontradas %', v_tabelas;
  END IF;
  IF v_rls <> v_tabelas THEN
    RAISE EXCEPTION 'Operações: % tabelas sem RLS', v_tabelas - v_rls;
  END IF;
  IF v_perms <> 15 THEN
    RAISE EXCEPTION 'Operações: esperadas 15 permissões, encontradas %', v_perms;
  END IF;

  RAISE NOTICE 'Operações v1: % tabelas, todas com RLS, % permissões.', v_tabelas, v_perms;
END
$verificar$;
