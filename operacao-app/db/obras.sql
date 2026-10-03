-- ============================================================
--  Operações — Obras: fases, tarefas, Gantt, supervisão
-- ============================================================
--  Correr DEPOIS de: seguranca.sql, tempos.sql.
--
--  O pedido da reunião de 01/10/2026, em quatro frases:
--
--   · uma obra tem 4 fases, cada fase tem tarefas com tempo previsto (que
--     vem de um MODELO por tipo de trabalho), e a duração da fase é a soma
--     das suas tarefas — espalhada por vários dias úteis, dá o Gantt;
--   · o gestor planeia (fases, tarefas, datas, pessoas), o executor
--     (técnico/operador — inclui empreiteiros e subempreiteiros) inicia e
--     termina cada tarefa com um toque, o supervisor valida ou rejeita;
--   · o tempo real conta-se por pessoa e por tarefa; acima do previsto mais
--     uma tolerância, terminar a tarefa EXIGE justificação ("senão não há
--     controlo");
--   · o que se descobre em obra (tubagem podre, parede oca) regista-se como
--     trabalho extra, para o comercial orçamentar.
--
--  Regras de desenho, as mesmas do resto do módulo:
--
--   · Escreve fora de `ops_*`? NÃO. Lê `quotes`, `quote_lines` e
--     `client_contracts`, nunca lhes escreve. Zero chaves estrangeiras para
--     o CRM: `cliente_id`, `orcamento_id` e `contrato_id` são uuid soltos.
--   · RLS ligada em todas as tabelas, com leitura por `ops_pode()` (filtra a
--     organização — ver seguranca.sql). NÃO há policies de escrita: tudo o
--     que muda passa por uma RPC SECURITY DEFINER que começa por
--     `ops_quem_sou(org)` e verifica a função de quem chama.
--   · custo/hora nunca sai daqui para quem não tem `operations.costs.view`.
--   · Idempotente: corre duas vezes sem erro e sem duplicar nada.
--
--  Permissões: reutiliza códigos que já existem (permissoes.sql). Nenhum
--  código novo no catálogo.
--     ver                  operations.orders.view / view_all
--     criar obra           operations.orders.create   + função gestor/admin
--     planear              operations.orders.edit     + função gestor/admin
--     executar             operations.orders.execute  + estar na tarefa
--     validar / rejeitar   operations.orders.confirm  + supervisor/gestor/admin
--     decidir extras       operations.orders.approve  + gestor/admin
--     gerir modelos        operations.checklists.manage + gestor/admin
--     custos               operations.costs.view
-- ============================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regclass('public.ops_ordem') IS NULL THEN
    RAISE EXCEPTION 'As tabelas de Operações não existem. Corre db/schema.sql primeiro.';
  END IF;
  IF to_regprocedure('public.ops_pode(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta ops_pode(). Corre db/seguranca.sql antes de db/obras.sql.';
  END IF;
  IF to_regprocedure('public.ops_quem_sou(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta ops_quem_sou(). Corre db/despacho.sql antes de db/obras.sql.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Modelos — de onde vêm as tarefas e os tempos default
-- ============================================================
-- Um modelo por tipo de trabalho ("Remodelação casa de banho"). Ao criar a
-- obra, as fases e tarefas do modelo COPIAM-SE: mudar o modelo amanhã não
-- muda uma obra que já está a andar. A obra guarda de que tarefa-modelo veio
-- cada tarefa — é isso que deixa responder "o default está errado?".

CREATE TABLE IF NOT EXISTS public.ops_obra_modelo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  nome             text NOT NULL,
  descricao        text,
  tipo_servico     text,
  -- → catalog_items.id (o serviço do orçamento), sem FK.
  catalog_item_id  uuid,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, nome)
);

CREATE TABLE IF NOT EXISTS public.ops_obra_modelo_fase (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  modelo_id        uuid NOT NULL REFERENCES public.ops_obra_modelo(id) ON DELETE CASCADE,
  ordem            smallint NOT NULL CHECK (ordem BETWEEN 1 AND 9),
  nome             text NOT NULL,
  UNIQUE (modelo_id, ordem)
);

CREATE TABLE IF NOT EXISTS public.ops_obra_modelo_tarefa (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  modelo_id         uuid NOT NULL REFERENCES public.ops_obra_modelo(id) ON DELETE CASCADE,
  modelo_fase_id    uuid NOT NULL REFERENCES public.ops_obra_modelo_fase(id) ON DELETE CASCADE,
  ordem             integer NOT NULL DEFAULT 0,
  nome              text NOT NULL,
  procedimento      text,
  materiais         text,
  ferramentas       text,
  minutos_previstos integer NOT NULL DEFAULT 60 CHECK (minutos_previstos > 0)
);

CREATE INDEX IF NOT EXISTS ops_obra_modelo_tarefa_idx
  ON public.ops_obra_modelo_tarefa (modelo_id, modelo_fase_id, ordem);

-- Um tipo de obra pode ser o "por defeito": é o que vem escolhido quando a
-- obra nasce de um contrato (traz as tarefas que existem em qualquer obra:
-- arranque, proteção, limpeza final, entrega).
ALTER TABLE public.ops_obra_modelo ADD COLUMN IF NOT EXISTS por_defeito boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_modelo_defeito_uidx
  ON public.ops_obra_modelo (organization_id) WHERE por_defeito;

-- Modelo de tarefas por SERVIÇO do CRM: como se executa cada serviço vendido.
-- Ao criar a obra a partir de um contrato, cada linha do orçamento expande-se
-- nas tarefas do modelo do seu serviço, com o tempo × quantidade.
--   minutos da tarefa = minutos_fixos + minutos_por_unidade × qt   (pessoa × tempo)
--   depende_ordem     = outra tarefa do MESMO serviço (ex.: fechar roços
--                       depois do ensaio)
-- `servico_id` → services.id, SEM FK (o CRM apaga a sério). Escrita só por RPC.
CREATE TABLE IF NOT EXISTS public.ops_obra_servico_tarefa (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  servico_id          uuid NOT NULL,
  ordem               integer NOT NULL,
  nome                text NOT NULL,
  fase                smallint NOT NULL DEFAULT 3 CHECK (fase BETWEEN 1 AND 9),
  minutos_por_unidade numeric(10,2) NOT NULL DEFAULT 0 CHECK (minutos_por_unidade >= 0),
  minutos_fixos       integer NOT NULL DEFAULT 0 CHECK (minutos_fixos >= 0),
  pessoas             smallint NOT NULL DEFAULT 1 CHECK (pessoas BETWEEN 1 AND 20),
  skill_id            uuid REFERENCES public.ops_skill(id) ON DELETE SET NULL,
  depende_ordem       integer,
  procedimento        text,
  materiais           text,
  ferramentas         text,
  -- 'sugerida' = gerada pela biblioteca; 'manual' = alguém a gravou.
  origem              text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','sugerida')),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_por      uuid,
  UNIQUE (organization_id, servico_id, ordem),
  CHECK (minutos_por_unidade > 0 OR minutos_fixos > 0),
  CHECK (depende_ordem IS NULL OR depende_ordem <> ordem)
);


-- ============================================================
-- 2. A obra, as fases, as tarefas
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ops_obra (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL,
  codigo               text NOT NULL,
  -- Ligações ao CRM: SEM FK, de propósito. O CRM apaga a sério, e uma FK
  -- partiria esse apagamento. Servem para rastrear, não para integridade.
  cliente_id           uuid,            -- → anew_clients.id
  orcamento_id         uuid,            -- → quotes.id
  contrato_id          uuid,            -- → client_contracts.id
  modelo_id            uuid REFERENCES public.ops_obra_modelo(id) ON DELETE SET NULL,
  titulo               text NOT NULL,
  morada               text,
  notas                text,
  estado               text NOT NULL DEFAULT 'planeada'
                         CHECK (estado IN ('planeada','em_curso','suspensa','concluida','cancelada')),
  data_inicio_prevista date,
  iniciada_em          timestamptz,
  concluida_em         timestamptz,
  motivo_estado        text,
  gestor_id            uuid,            -- → anew_users.id
  supervisor_id        uuid,            -- → anew_users.id
  -- Acima de previsto × (1 + tolerância), terminar exige justificação.
  tolerancia_percent   integer NOT NULL DEFAULT 10 CHECK (tolerancia_percent BETWEEN 0 AND 100),
  -- Um dia de trabalho, para espalhar as tarefas pelo calendário.
  minutos_por_dia      integer NOT NULL DEFAULT 480 CHECK (minutos_por_dia BETWEEN 60 AND 1440),
  criada_por           uuid,
  criada_em            timestamptz NOT NULL DEFAULT now(),
  atualizada_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo)
);

-- Um orçamento (ou um contrato) gera UMA obra viva. Carregar duas vezes no
-- botão não abre duas; cancelar a obra liberta o orçamento.
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_orcamento_uidx
  ON public.ops_obra (orcamento_id) WHERE orcamento_id IS NOT NULL AND estado <> 'cancelada';
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_contrato_uidx
  ON public.ops_obra (contrato_id) WHERE contrato_id IS NOT NULL AND estado <> 'cancelada';
CREATE INDEX IF NOT EXISTS ops_obra_org_idx ON public.ops_obra (organization_id, estado);

CREATE TABLE IF NOT EXISTS public.ops_obra_fase (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  ordem            smallint NOT NULL CHECK (ordem BETWEEN 1 AND 9),
  nome             text NOT NULL,
  UNIQUE (obra_id, ordem)
);

CREATE TABLE IF NOT EXISTS public.ops_obra_tarefa (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  obra_id           uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  fase_id           uuid NOT NULL REFERENCES public.ops_obra_fase(id) ON DELETE CASCADE,
  modelo_tarefa_id  uuid REFERENCES public.ops_obra_modelo_tarefa(id) ON DELETE SET NULL,
  ordem             integer NOT NULL DEFAULT 0,
  nome              text NOT NULL,
  procedimento      text,
  materiais         text,
  ferramentas       text,
  minutos_previstos integer NOT NULL DEFAULT 60 CHECK (minutos_previstos > 0),
  inicio_planeado   date,
  fim_planeado      date,
  -- Precedência simples: "não pinta antes de secar". Iniciar recusa enquanto
  -- a tarefa de que depende não estiver feita.
  depende_de        uuid REFERENCES public.ops_obra_tarefa(id) ON DELETE SET NULL,
  estado            text NOT NULL DEFAULT 'por_fazer'
                      CHECK (estado IN ('por_fazer','em_curso','feita','validada','rejeitada')),
  iniciada_em       timestamptz,
  terminada_em      timestamptz,
  motivo_desvio     text CHECK (motivo_desvio IS NULL OR motivo_desvio IN
                      ('secagem','condicoes_edificio','material_em_falta',
                       'trabalho_imprevisto','acesso_cliente','outro')),
  nota_desvio       text,
  validada_por      uuid,
  validada_em       timestamptz,
  motivo_rejeicao   text,
  rejeitada_em      timestamptz,
  criada_em         timestamptz NOT NULL DEFAULT now(),
  atualizada_em     timestamptz NOT NULL DEFAULT now(),
  CHECK (fim_planeado IS NULL OR inicio_planeado IS NULL OR fim_planeado >= inicio_planeado),
  CHECK (depende_de IS NULL OR depende_de <> id)
);

CREATE INDEX IF NOT EXISTS ops_obra_tarefa_obra_idx  ON public.ops_obra_tarefa (obra_id, fase_id, ordem);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_datas_idx ON public.ops_obra_tarefa (organization_id, inicio_planeado, fim_planeado);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_modelo_idx ON public.ops_obra_tarefa (modelo_tarefa_id) WHERE modelo_tarefa_id IS NOT NULL;

-- Tarefas que nasceram de uma linha do orçamento (serviço com ficha técnica).
-- SEM FK, como as outras ligações ao CRM.
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS orcamento_linha_id uuid;  -- → quote_lines.id
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS servico_id uuid;          -- → services.id
-- Quantas pessoas a tarefa leva (da ficha técnica). `minutos_previstos` é
-- pessoa × tempo; no calendário, a tarefa dura minutos ÷ pessoas.
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS pessoas_previstas smallint NOT NULL DEFAULT 1
  CHECK (pessoas_previstas BETWEEN 1 AND 20);
-- A especialidade que a tarefa pede, e o passo do modelo de serviço de onde veio.
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS skill_id uuid
  REFERENCES public.ops_skill(id) ON DELETE SET NULL;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS servico_tarefa_id uuid
  REFERENCES public.ops_obra_servico_tarefa(id) ON DELETE SET NULL;
-- Materiais do CRM ligados à tarefa no passo "Serviços do contrato" da Nova
-- obra: [{produto_id, nome, quantidade, unidade, disponivel, origem: 'ficha'|'contrato'|'stock'}]. Cópia,
-- SEM FK (products é do CRM). `materiais` continua a ser o texto legível.
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS materiais_crm jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Quem está numa tarefa. `obra_id` vai repetido para a policy não precisar
-- de um join por linha.
CREATE TABLE IF NOT EXISTS public.ops_obra_tarefa_pessoa (
  tarefa_id        uuid NOT NULL REFERENCES public.ops_obra_tarefa(id) ON DELETE CASCADE,
  utilizador_id    uuid NOT NULL,       -- → anew_users.id
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  atribuida_em     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, utilizador_id)
);

CREATE INDEX IF NOT EXISTS ops_obra_tarefa_pessoa_util_idx
  ON public.ops_obra_tarefa_pessoa (organization_id, utilizador_id);

-- Dependências entre tarefas: VÁRIAS por tarefa ("micro", tarefa a tarefa —
-- não fase a fase). A tarefa só começa quando TODAS estão feitas, e o plano
-- automático só a põe depois de todas acabarem. Sem ciclos (trigger abaixo).
-- `ops_obra_tarefa.depende_de` fica por compatibilidade: é sempre uma destas
-- linhas (sincronizada por trigger), a "primeira".
CREATE TABLE IF NOT EXISTS public.ops_obra_tarefa_dependencia (
  tarefa_id        uuid NOT NULL REFERENCES public.ops_obra_tarefa(id) ON DELETE CASCADE,
  depende_de_id    uuid NOT NULL REFERENCES public.ops_obra_tarefa(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  criada_em        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tarefa_id, depende_de_id),
  CHECK (tarefa_id <> depende_de_id)
);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_dependencia_dep_idx
  ON public.ops_obra_tarefa_dependencia (depende_de_id);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_dependencia_obra_idx
  ON public.ops_obra_tarefa_dependencia (obra_id);

-- Guarda: as duas tarefas são da mesma obra, e a ligação não fecha um ciclo
-- (A depois de B depois de … depois de A nunca começaria).
CREATE OR REPLACE FUNCTION public.ops_obra_dependencia_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_obra  uuid;
  v_org   uuid;
  v_obra2 uuid;
  v_nome  text;
  v_dnome text;
BEGIN
  SELECT obra_id, organization_id, nome INTO v_obra, v_org, v_nome
    FROM public.ops_obra_tarefa WHERE id = NEW.tarefa_id;
  SELECT obra_id, nome INTO v_obra2, v_dnome FROM public.ops_obra_tarefa WHERE id = NEW.depende_de_id;
  IF v_obra IS NULL OR v_obra2 IS DISTINCT FROM v_obra THEN
    RAISE EXCEPTION 'Uma tarefa só pode depender de outra da mesma obra.';
  END IF;
  NEW.obra_id := v_obra;
  NEW.organization_id := v_org;

  IF EXISTS (
    WITH RECURSIVE r(id) AS (
      SELECT NEW.depende_de_id
      UNION
      SELECT d.depende_de_id FROM public.ops_obra_tarefa_dependencia d JOIN r ON d.tarefa_id = r.id
    )
    SELECT 1 FROM r WHERE r.id = NEW.tarefa_id) THEN
    RAISE EXCEPTION '"%" depois de "%" fecharia um ciclo de dependências: nenhuma das duas poderia começar.',
      v_nome, v_dnome;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_dependencia_guarda() FROM PUBLIC, anon, authenticated;

-- A coluna antiga `depende_de` → a tabela (quem ainda escreve na coluna —
-- "Gravar tarefa", a demo — continua a funcionar).
CREATE OR REPLACE FUNCTION public.ops_obra_tarefa_dep_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.depende_de IS NOT NULL AND OLD.depende_de IS DISTINCT FROM NEW.depende_de THEN
      DELETE FROM public.ops_obra_tarefa_dependencia
       WHERE tarefa_id = NEW.id AND depende_de_id = OLD.depende_de;
    END IF;
  END IF;
  IF NEW.depende_de IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_obra_tarefa_dependencia
        WHERE tarefa_id = NEW.id AND depende_de_id = NEW.depende_de) THEN
    INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
    VALUES (NEW.id, NEW.depende_de, NEW.organization_id, NEW.obra_id);
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_tarefa_dep_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_obra_dependencia_guarda ON public.ops_obra_tarefa_dependencia;
CREATE TRIGGER ops_obra_dependencia_guarda
  BEFORE INSERT OR UPDATE ON public.ops_obra_tarefa_dependencia
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_dependencia_guarda();

-- Migrar o que já existe (uma vez; ligações que fechariam um ciclo — só
-- possíveis em dados antigos — ficam de fora, com aviso).
DO $migra$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.id, t.depende_de, t.organization_id, t.obra_id
      FROM public.ops_obra_tarefa t
     WHERE t.depende_de IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x
                        WHERE x.tarefa_id = t.id AND x.depende_de_id = t.depende_de)
  LOOP
    BEGIN
      INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
      VALUES (r.id, r.depende_de, r.organization_id, r.obra_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Dependência % → % não migrada: %', r.id, r.depende_de, SQLERRM;
    END;
  END LOOP;
END
$migra$;

DROP TRIGGER IF EXISTS ops_obra_tarefa_dep_sync ON public.ops_obra_tarefa;
CREATE TRIGGER ops_obra_tarefa_dep_sync
  AFTER INSERT OR UPDATE OF depende_de ON public.ops_obra_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_tarefa_dep_sync();

-- O tempo real: uma linha por pessoa de cada vez que carrega em Iniciar.
-- Por pessoa e não por equipa — duas pessoas 1 h cada são 2 h de mão de obra.
CREATE TABLE IF NOT EXISTS public.ops_obra_registo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  tarefa_id        uuid NOT NULL REFERENCES public.ops_obra_tarefa(id) ON DELETE CASCADE,
  utilizador_id    uuid NOT NULL,       -- → anew_users.id
  inicio           timestamptz NOT NULL DEFAULT now(),
  fim              timestamptz,
  CHECK (fim IS NULL OR fim >= inicio)
);

-- Uma pessoa não está em duas tarefas ao mesmo tempo.
CREATE UNIQUE INDEX IF NOT EXISTS ops_obra_registo_aberto_uidx
  ON public.ops_obra_registo (utilizador_id) WHERE fim IS NULL;
CREATE INDEX IF NOT EXISTS ops_obra_registo_tarefa_idx ON public.ops_obra_registo (tarefa_id, utilizador_id);

-- Trabalhos extra: o que se descobre em obra. Fica em Operações; o comercial
-- é que faz o orçamento adicional no CRM. Operações NÃO escreve no CRM.
CREATE TABLE IF NOT EXISTS public.ops_obra_extra (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  tarefa_id        uuid REFERENCES public.ops_obra_tarefa(id) ON DELETE SET NULL,
  descricao        text NOT NULL,
  valor_estimado   numeric(12,2) CHECK (valor_estimado IS NULL OR valor_estimado >= 0),
  -- Caminhos no storage (bucket de anexos). Opcional.
  fotos            text[] NOT NULL DEFAULT '{}',
  estado           text NOT NULL DEFAULT 'registado'
                     CHECK (estado IN ('registado','aprovado','enviado','recusado')),
  motivo_recusa    text,
  registado_por    uuid,
  registado_em     timestamptz NOT NULL DEFAULT now(),
  decidido_por     uuid,
  decidido_em      timestamptz,
  enviado_em       timestamptz
);

CREATE INDEX IF NOT EXISTS ops_obra_extra_obra_idx ON public.ops_obra_extra (obra_id, estado);

-- Atrasos — "vai demorar mais" ANTES de demorar (pedido do supervisor):
--   · o plano ORIGINAL (baseline) fica guardado na 1.ª vez que a tarefa é
--     atrasada ou replaneada com a obra em curso — nunca mais se sobrescreve
--     (trigger ops_obra_tarefa_baseline, mais abaixo). É contra ele que o
--     Gantt desenha a sombra e a ficha diz "+N dias";
--   · `minutos_estimativa` = a estimativa final de mão de obra (pessoa × min)
--     depois dos atrasos. NULL = igual ao previsto. `minutos_previstos` NÃO
--     muda: as métricas comparam o real com o que se previu;
--   · cada atraso fica registado com motivo + contexto, e com o "cliente
--     avisado" (quem, quando, o que se disse) — o supervisor vê o que falta.
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS inicio_original date;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS fim_original date;
ALTER TABLE public.ops_obra_tarefa ADD COLUMN IF NOT EXISTS minutos_estimativa integer
  CHECK (minutos_estimativa IS NULL OR minutos_estimativa > 0);
-- A hora a que o dia de obra começa (Europe/Lisbon). Uma tarefa por fazer
-- conta como "não iniciada a tempo" 60 min depois desta hora no dia de início.
ALTER TABLE public.ops_obra ADD COLUMN IF NOT EXISTS hora_inicio_dia time NOT NULL DEFAULT '08:00';

CREATE TABLE IF NOT EXISTS public.ops_obra_tarefa_atraso (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  obra_id             uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  tarefa_id           uuid NOT NULL REFERENCES public.ops_obra_tarefa(id) ON DELETE CASCADE,
  motivo              text NOT NULL CHECK (motivo IN
                        ('secagem','condicoes_edificio','material_em_falta','trabalho_imprevisto',
                         'acesso_cliente','meteorologia','equipa','outro')),
  contexto            text NOT NULL CHECK (length(btrim(contexto)) >= 5),
  minutos_extra       integer CHECK (minutos_extra IS NULL OR minutos_extra > 0),
  novo_fim            date,
  fim_anterior        date,
  registado_por       uuid,            -- → anew_users.id
  registado_em        timestamptz NOT NULL DEFAULT now(),
  cliente_avisado     boolean NOT NULL DEFAULT false,
  cliente_avisado_em  timestamptz,
  cliente_avisado_por uuid,            -- → anew_users.id
  nota_cliente        text
);

CREATE INDEX IF NOT EXISTS ops_obra_tarefa_atraso_tarefa_idx
  ON public.ops_obra_tarefa_atraso (tarefa_id, registado_em DESC);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_atraso_avisar_idx
  ON public.ops_obra_tarefa_atraso (organization_id, obra_id) WHERE NOT cliente_avisado;

-- O plano original, guardado UMA vez: na 1.ª mudança de datas com a obra em
-- curso (arrastar no Gantt, replanear, gravar a tarefa) — o registo de um
-- atraso guarda-o ele próprio, em qualquer estado da obra. Depois de
-- guardado, nunca mais muda (nem por engano de uma RPC).
CREATE OR REPLACE FUNCTION public.ops_obra_tarefa_baseline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.inicio_original IS NOT NULL OR OLD.fim_original IS NOT NULL THEN
    NEW.inicio_original := OLD.inicio_original;
    NEW.fim_original := OLD.fim_original;
  ELSIF NEW.inicio_original IS NULL AND NEW.fim_original IS NULL
    AND (NEW.inicio_planeado IS DISTINCT FROM OLD.inicio_planeado
         OR NEW.fim_planeado IS DISTINCT FROM OLD.fim_planeado)
    AND (OLD.inicio_planeado IS NOT NULL OR OLD.fim_planeado IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.ops_obra o WHERE o.id = NEW.obra_id AND o.estado = 'em_curso') THEN
    NEW.inicio_original := OLD.inicio_planeado;
    NEW.fim_original := OLD.fim_planeado;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_tarefa_baseline() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_obra_tarefa_baseline ON public.ops_obra_tarefa;
CREATE TRIGGER ops_obra_tarefa_baseline
  BEFORE UPDATE ON public.ops_obra_tarefa
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_tarefa_baseline();


-- ============================================================
-- 2b. O orçamento de um contrato — pelos MESMOS caminhos que o CRM
-- ============================================================
-- Um contrato que nasceu de uma proposta muitas vezes não tem `quote_id`.
-- O CRM (src/components/contracts/contractDocument.ts) chega ao orçamento por:
--   1. client_contracts.quote_id;
--   2. a seleção da proposta (proposal_quote_selections, selected);
--   3. o orçamento com quotes.proposal_id (o aceite mais recente);
--   4. pipeline_links (proposal_id → quote_id).
-- Ler só o 1.º deixava esses contratos "sem serviços". Só leitura; cada
-- caminho só é tentado se a tabela/coluna existir nesta base.
CREATE OR REPLACE FUNCTION public.ops_contrato_orcamento(_contrato_id uuid)
RETURNS uuid
-- INVOKER de propósito: lê com os direitos de quem chama (a RLS do CRM manda),
-- tal como a vista ops_v_contrato; dentro das RPCs corre com os delas.
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_quote    uuid;
  v_proposta uuid;
BEGIN
  IF _contrato_id IS NULL OR to_regclass('public.client_contracts') IS NULL THEN
    RETURN NULL;
  END IF;

  EXECUTE 'SELECT quote_id, ' ||
          CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                             WHERE table_schema = 'public' AND table_name = 'client_contracts'
                               AND column_name = 'proposal_id')
               THEN 'proposal_id' ELSE 'NULL::uuid' END ||
          ' FROM public.client_contracts WHERE id = $1'
     INTO v_quote, v_proposta USING _contrato_id;

  IF v_quote IS NOT NULL OR v_proposta IS NULL THEN
    RETURN v_quote;
  END IF;

  IF to_regclass('public.proposal_quote_selections') IS NOT NULL THEN
    EXECUTE 'SELECT quote_id FROM public.proposal_quote_selections
              WHERE proposal_id = $1 AND selected AND quote_id IS NOT NULL LIMIT 1'
       INTO v_quote USING v_proposta;
    IF v_quote IS NOT NULL THEN RETURN v_quote; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'proposal_id') THEN
    EXECUTE 'SELECT id FROM public.quotes WHERE proposal_id = $1
              ORDER BY accepted_at DESC NULLS LAST, created_at DESC LIMIT 1'
       INTO v_quote USING v_proposta;
    IF v_quote IS NOT NULL THEN RETURN v_quote; END IF;
  END IF;

  IF to_regclass('public.pipeline_links') IS NOT NULL THEN
    EXECUTE 'SELECT q.id FROM public.pipeline_links pl JOIN public.quotes q ON q.id = pl.quote_id
              WHERE pl.proposal_id = $1 ORDER BY q.created_at DESC LIMIT 1'
       INTO v_quote USING v_proposta;
  END IF;

  RETURN v_quote;
END
$$;

REVOKE ALL ON FUNCTION public.ops_contrato_orcamento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_contrato_orcamento(uuid) TO authenticated, service_role;


-- ============================================================
-- 3. Quem vê uma obra
-- ============================================================
-- Vê tudo quem tem `view_all` NESTA organização. Os outros veem as obras em
-- que são gestor, supervisor, ou estão em pelo menos uma tarefa.

CREATE OR REPLACE FUNCTION public.ops_pode_ver_obra(_obra_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ops_obra o
     WHERE o.id = _obra_id
       AND (
         public.ops_pode(o.organization_id, 'operations.orders.view_all')
         OR (
           public.ops_pode(o.organization_id, 'operations.orders.view')
           AND (
             o.gestor_id = public.current_business_user_id()
             OR o.supervisor_id = public.current_business_user_id()
             OR EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                         WHERE tp.obra_id = o.id
                           AND tp.utilizador_id = public.current_business_user_id())
           )
         )
       )
  )
$$;

REVOKE ALL ON FUNCTION public.ops_pode_ver_obra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_pode_ver_obra(uuid) TO authenticated, service_role;


-- ============================================================
-- 4. Auxiliares internas (não dadas a `authenticated`)
-- ============================================================

-- Quem chama, com a função certa e a permissão certa NESTA organização.
-- `admin` passa sempre a verificação de função (não a de permissão).
CREATE OR REPLACE FUNCTION public.ops_obra_exigir(
  _org uuid, _perm text, _funcoes text[], _mensagem text,
  OUT o_utilizador uuid, OUT o_funcao text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT q.utilizador_id, q.funcao INTO o_utilizador, o_funcao
    FROM public.ops_quem_sou(_org) q;

  IF _funcoes IS NOT NULL AND o_funcao <> 'admin' AND NOT (o_funcao = ANY (_funcoes)) THEN
    RAISE EXCEPTION '%', _mensagem USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(_org, _perm) THEN
    RAISE EXCEPTION 'Sem permissão (%) nesta organização.', _perm
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_exigir(uuid, text, text[], text)
  FROM PUBLIC, anon, authenticated;

-- Dias úteis (seg–sex). `_n = 0` devolve o próprio dia, ou o próximo útil.
-- Feriados não contam (limitação conhecida — ver docs/obras.md).
-- Espelho de `somarDiasUteis()` em src/domain/obras.ts.
CREATE OR REPLACE FUNCTION public.ops_obra_somar_dias_uteis(_d date, _n integer)
RETURNS date
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v date := _d;
  k integer := 0;
BEGIN
  WHILE extract(isodow FROM v) > 5 LOOP v := v + 1; END LOOP;
  WHILE k < GREATEST(_n, 0) LOOP
    v := v + 1;
    IF extract(isodow FROM v) <= 5 THEN k := k + 1; END IF;
  END LOOP;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_somar_dias_uteis(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_somar_dias_uteis(date, integer) TO authenticated, service_role;

-- O plano de partida, por DEPENDÊNCIAS (tarefa a tarefa, não fase a fase):
--   · cada tarefa começa assim que (a) TODAS as tarefas de que depende
--     (ops_obra_tarefa_dependencia) acabaram e (b) há pessoas livres — a
--     equipa da obra tem tantas "vagas" quantos os técnicos/operadores
--     ativos (de 1 a 4). Uma tarefa da fase 3 pode começar antes de outra da
--     fase 2 acabar, se não depender dela;
--   · agendamento topológico com capacidade: de entre as tarefas prontas,
--     vai primeiro a que pode começar mais cedo; empate → fase, ordem;
--   · uma tarefa de k pessoas ocupa k vagas durante minutos ÷ k;
--   · `minutos_por_dia` de trabalho por dia útil.
-- A ordem "fase a fase" de antes continua a sair quando as dependências a
-- pedem (ver ops_obra_dependencias_defeito_impl: as tarefas do tipo de obra
-- dependem de tudo o que vem antes). Um ciclo (só em dados antigos) não
-- bloqueia: a tarefa entra pela ordem fase/ordem.
-- O gestor arrasta depois no Gantt. (O plano em série do domínio,
-- `planearSequencial()`, é o caso de 1 vaga sem dependências.)
CREATE OR REPLACE FUNCTION public.ops_obra_replanear_impl(_obra_id uuid, _inicio date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org     uuid;
  v_mpd     integer;
  v_cap     integer;
  v_livre   bigint[];       -- minuto em que cada vaga fica livre
  v_ids     uuid[];         -- tarefas pela ordem fase/ordem (o índice é a prioridade)
  v_min     integer[];
  v_kk      integer[];
  v_pos     jsonb;          -- id → índice
  v_et      integer[];      -- arestas: tarefa (índice) …
  v_ed      integer[];      -- … depende de (índice), ordenadas por esta
  v_falta   integer[];      -- dependências ainda por planear
  v_cedo    bigint[];       -- o mais cedo que cada tarefa pode começar
  v_feito   boolean[];
  v_rini    integer[];      -- onde começam, em v_et, as dependentes de cada tarefa
  v_rcnt    integer[];
  v_n       integer;
  v_m       integer;
  v_k       integer;
  v_dur     bigint;
  v_ini     bigint;
  v_fim     bigint;
  v_escolha integer[];
  v_best    integer;
  v_slot    integer;
  s         integer;
  i         integer;
  j         integer;
BEGIN
  SELECT organization_id, minutos_por_dia INTO v_org, v_mpd FROM public.ops_obra WHERE id = _obra_id;

  SELECT LEAST(4, GREATEST(1, count(*)))::integer INTO v_cap
    FROM public.ops_utilizador_perfil
   WHERE organization_id = v_org AND ativo AND funcao IN ('tecnico','operador');
  v_livre := array_fill(0::bigint, ARRAY[v_cap]);

  SELECT array_agg(x.id ORDER BY x.fo, x.ordem, x.criada_em, x.id),
         array_agg(x.minutos_previstos ORDER BY x.fo, x.ordem, x.criada_em, x.id),
         array_agg(LEAST(GREATEST(x.pessoas_previstas, 1), v_cap) ORDER BY x.fo, x.ordem, x.criada_em, x.id)
    INTO v_ids, v_min, v_kk
    FROM (SELECT t.id, f.ordem AS fo, t.ordem, t.criada_em, t.minutos_previstos, t.pessoas_previstas
            FROM public.ops_obra_tarefa t JOIN public.ops_obra_fase f ON f.id = t.fase_id
           WHERE t.obra_id = _obra_id) x;
  v_n := COALESCE(array_length(v_ids, 1), 0);

  IF v_n > 0 THEN
    SELECT jsonb_object_agg(u.id::text, u.pos) INTO v_pos
      FROM unnest(v_ids) WITH ORDINALITY AS u(id, pos);

    SELECT array_agg(e.ti ORDER BY e.di, e.ti), array_agg(e.di ORDER BY e.di, e.ti)
      INTO v_et, v_ed
      FROM (SELECT (v_pos->>d.tarefa_id::text)::integer AS ti, (v_pos->>d.depende_de_id::text)::integer AS di
              FROM public.ops_obra_tarefa_dependencia d
             WHERE d.obra_id = _obra_id
               AND v_pos ? d.tarefa_id::text AND v_pos ? d.depende_de_id::text) e;
    v_m := COALESCE(array_length(v_et, 1), 0);

    v_falta := array_fill(0, ARRAY[v_n]);
    v_rcnt  := array_fill(0, ARRAY[v_n]);
    v_rini  := array_fill(0, ARRAY[v_n]);
    v_cedo  := array_fill(0::bigint, ARRAY[v_n]);
    v_feito := array_fill(false, ARRAY[v_n]);
    FOR j IN 1..v_m LOOP
      v_falta[v_et[j]] := v_falta[v_et[j]] + 1;
      v_rcnt[v_ed[j]] := v_rcnt[v_ed[j]] + 1;
      IF v_rini[v_ed[j]] = 0 THEN v_rini[v_ed[j]] := j; END IF;
    END LOOP;

    FOR s IN 1..v_n LOOP
      -- A tarefa pronta que pode começar mais cedo (empate: fase, ordem).
      v_best := NULL;
      FOR i IN 1..v_n LOOP
        IF NOT v_feito[i] AND v_falta[i] = 0
           AND (v_best IS NULL OR v_cedo[i] < v_cedo[v_best]) THEN
          v_best := i;
        END IF;
      END LOOP;
      IF v_best IS NULL THEN
        -- Só com um ciclo: a primeira que falta, pela ordem fase/ordem.
        FOR i IN 1..v_n LOOP
          IF NOT v_feito[i] THEN v_best := i; EXIT; END IF;
        END LOOP;
      END IF;

      v_k := v_kk[v_best];
      v_dur := GREATEST(1, ceil(v_min[v_best]::numeric / v_k))::bigint;

      -- As k vagas que ficam livres mais cedo.
      v_escolha := '{}';
      FOR j IN 1..v_k LOOP
        v_slot := NULL;
        FOR i IN 1..v_cap LOOP
          IF NOT (i = ANY (v_escolha)) AND (v_slot IS NULL OR v_livre[i] < v_livre[v_slot]) THEN
            v_slot := i;
          END IF;
        END LOOP;
        v_escolha := v_escolha || v_slot;
      END LOOP;

      v_ini := v_cedo[v_best];
      FOREACH i IN ARRAY v_escolha LOOP
        v_ini := GREATEST(v_ini, v_livre[i]);
      END LOOP;
      v_fim := v_ini + v_dur;
      FOREACH i IN ARRAY v_escolha LOOP
        v_livre[i] := v_fim;
      END LOOP;

      v_feito[v_best] := true;
      IF v_rcnt[v_best] > 0 THEN
        FOR j IN v_rini[v_best] .. v_rini[v_best] + v_rcnt[v_best] - 1 LOOP
          v_falta[v_et[j]] := v_falta[v_et[j]] - 1;
          v_cedo[v_et[j]] := GREATEST(v_cedo[v_et[j]], v_fim);
        END LOOP;
      END IF;

      UPDATE public.ops_obra_tarefa
         SET inicio_planeado = public.ops_obra_somar_dias_uteis(_inicio, (v_ini / v_mpd)::integer),
             fim_planeado    = public.ops_obra_somar_dias_uteis(_inicio, ((v_fim - 1) / v_mpd)::integer),
             atualizada_em   = now()
       WHERE id = v_ids[v_best];
    END LOOP;
  END IF;

  UPDATE public.ops_obra SET data_inicio_prevista = _inicio, atualizada_em = now()
   WHERE id = _obra_id;
  RETURN v_n;
END
$$;

-- As dependências por defeito de uma obra acabada de nascer (só onde a
-- tarefa ainda não tem nenhuma). A regra, por esta ordem:
--   1. Dentro do serviço: o "depois de" do modelo do serviço (já ligado ao
--      criar — não passa por aqui).
--   2. Tarefa de um serviço (linha do orçamento) sem dependência: depende
--      das tarefas da MESMA linha na fase anterior mais próxima (as últimas
--      dessa fase: as de que nenhuma outra dessa fase depende). Se a linha
--      não tem nada antes, das tarefas da fase anterior mais próxima que
--      partilham a ESPECIALIDADE ou o SERVIÇO (outra linha do mesmo serviço).
--      Se não houver relação nenhuma, fica em paralelo.
--   3. E, sempre, das tarefas do TIPO DE OBRA da fase anterior mais próxima
--      que as tenha (arranque e proteção vêm antes de tudo o que é de fase
--      seguinte).
--   4. Tarefa do tipo de obra (sem serviço): depende de TUDO o que está em
--      fases anteriores (as últimas), porque é sobre a obra inteira (limpeza
--      final, vistoria e entrega). Num modelo só com tarefas do tipo, isto
--      dá a ordem fase a fase de sempre.
-- `_inferir_servicos` = false: só 3 e 4 (as tarefas dos serviços vieram já
-- com as dependências escolhidas pelo gestor no passo "Serviços do contrato").
CREATE OR REPLACE FUNCTION public.ops_obra_dependencias_defeito_impl(_obra_id uuid, _inferir_servicos boolean)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t       record;
  v_n     integer := 0;
  v_fase  smallint;
BEGIN
  FOR t IN
    SELECT ta.id, ta.organization_id, f.ordem AS fase, ta.orcamento_linha_id AS linha,
           ta.servico_id, ta.skill_id,
           (ta.orcamento_linha_id IS NULL AND ta.servico_id IS NULL) AS do_tipo
      FROM public.ops_obra_tarefa ta JOIN public.ops_obra_fase f ON f.id = ta.fase_id
     WHERE ta.obra_id = _obra_id
     ORDER BY f.ordem, ta.ordem, ta.criada_em
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia WHERE tarefa_id = t.id);

    IF t.do_tipo THEN
      -- 4. Tudo o que vem antes (as últimas de cada cadeia).
      INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
      SELECT t.id, a.id, t.organization_id, _obra_id
        FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
       WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
         AND NOT EXISTS (
           SELECT 1 FROM public.ops_obra_tarefa_dependencia x
             JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
             JOIN public.ops_obra_fase fb ON fb.id = b.fase_id
            WHERE x.depende_de_id = a.id AND b.obra_id = _obra_id AND fb.ordem < t.fase)
      ON CONFLICT DO NOTHING;
    ELSE
      IF _inferir_servicos THEN
        -- 2a. A mesma linha do orçamento, na fase anterior mais próxima.
        SELECT max(fa.ordem) INTO v_fase
          FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
         WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
           AND t.linha IS NOT NULL AND a.orcamento_linha_id = t.linha;
        IF v_fase IS NOT NULL THEN
          INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
          SELECT t.id, a.id, t.organization_id, _obra_id
            FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
           WHERE a.obra_id = _obra_id AND fa.ordem = v_fase AND a.orcamento_linha_id = t.linha
             AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x
                               JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
                              WHERE x.depende_de_id = a.id AND b.fase_id = a.fase_id
                                AND b.orcamento_linha_id = t.linha)
          ON CONFLICT DO NOTHING;
        ELSE
          -- 2b. A mesma especialidade ou o mesmo serviço, na fase anterior mais próxima.
          SELECT max(fa.ordem) INTO v_fase
            FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
           WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
             AND ((t.skill_id IS NOT NULL AND a.skill_id = t.skill_id)
                  OR (t.servico_id IS NOT NULL AND a.servico_id = t.servico_id));
          IF v_fase IS NOT NULL THEN
            INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
            SELECT t.id, a.id, t.organization_id, _obra_id
              FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
             WHERE a.obra_id = _obra_id AND fa.ordem = v_fase
               AND ((t.skill_id IS NOT NULL AND a.skill_id = t.skill_id)
                    OR (t.servico_id IS NOT NULL AND a.servico_id = t.servico_id))
               AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x
                                 JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
                                WHERE x.depende_de_id = a.id AND b.fase_id = a.fase_id
                                  AND ((t.skill_id IS NOT NULL AND b.skill_id = t.skill_id)
                                       OR (t.servico_id IS NOT NULL AND b.servico_id = t.servico_id)))
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;
      END IF;

      -- 3. As tarefas do tipo de obra da fase anterior mais próxima.
      SELECT max(fa.ordem) INTO v_fase
        FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
       WHERE a.obra_id = _obra_id AND fa.ordem < t.fase
         AND a.orcamento_linha_id IS NULL AND a.servico_id IS NULL;
      IF v_fase IS NOT NULL THEN
        INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
        SELECT t.id, a.id, t.organization_id, _obra_id
          FROM public.ops_obra_tarefa a JOIN public.ops_obra_fase fa ON fa.id = a.fase_id
         WHERE a.obra_id = _obra_id AND fa.ordem = v_fase
           AND a.orcamento_linha_id IS NULL AND a.servico_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x
                             JOIN public.ops_obra_tarefa b ON b.id = x.tarefa_id
                            WHERE x.depende_de_id = a.id AND b.fase_id = a.fase_id
                              AND b.orcamento_linha_id IS NULL AND b.servico_id IS NULL)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia WHERE tarefa_id = t.id) THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;

  -- A coluna antiga fica com a "primeira" (a que acaba mais tarde no modelo:
  -- a de fase/ordem maior), para quem ainda só lê depende_de.
  UPDATE public.ops_obra_tarefa ta
     SET depende_de = (SELECT x.depende_de_id
                         FROM public.ops_obra_tarefa_dependencia x
                         JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id
                         JOIN public.ops_obra_fase fd ON fd.id = d.fase_id
                        WHERE x.tarefa_id = ta.id
                        ORDER BY fd.ordem DESC, d.ordem DESC, d.id LIMIT 1)
   WHERE ta.obra_id = _obra_id AND ta.depende_de IS NULL
     AND EXISTS (SELECT 1 FROM public.ops_obra_tarefa_dependencia x WHERE x.tarefa_id = ta.id);

  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_dependencias_defeito_impl(uuid, boolean) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.ops_obra_replanear_impl(uuid, date) FROM PUBLIC, anon, authenticated;

-- Choques de agenda de quem está numa tarefa: a mesma pessoa noutra OBRA
-- com dias sobrepostos. Dentro da mesma obra, duas tarefas no mesmo dia são
-- o normal (2 h + 3 h), e a sobrecarga diária vê-se no ecrã (domínio).
-- AVISA, não impede — como em despacho.sql.
CREATE OR REPLACE FUNCTION public.ops_obra_conflitos_impl(_tarefa_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'utilizador_id', tp.utilizador_id,
           'nome', COALESCE(u.name, 'Sem nome'),
           'tarefa_id', o2.id,
           'tarefa', o2.nome,
           'obra_codigo', ob.codigo,
           'inicio', o2.inicio_planeado,
           'fim', o2.fim_planeado) ORDER BY o2.inicio_planeado), '[]'::jsonb)
    FROM public.ops_obra_tarefa t
    JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
    JOIN public.ops_obra_tarefa_pessoa tp2
      ON tp2.utilizador_id = tp.utilizador_id AND tp2.tarefa_id <> t.id
    JOIN public.ops_obra_tarefa o2 ON o2.id = tp2.tarefa_id
    JOIN public.ops_obra ob ON ob.id = o2.obra_id
    LEFT JOIN public.anew_users u ON u.id = tp.utilizador_id
   WHERE t.id = _tarefa_id
     AND o2.organization_id = t.organization_id
     AND o2.obra_id <> t.obra_id
     AND o2.estado IN ('por_fazer','em_curso','rejeitada')
     AND ob.estado IN ('planeada','em_curso')
     AND t.inicio_planeado IS NOT NULL AND o2.inicio_planeado IS NOT NULL
     AND daterange(t.inicio_planeado, COALESCE(t.fim_planeado, t.inicio_planeado), '[]')
      && daterange(o2.inicio_planeado, COALESCE(o2.fim_planeado, o2.inicio_planeado), '[]')
$$;

REVOKE ALL ON FUNCTION public.ops_obra_conflitos_impl(uuid) FROM PUBLIC, anon, authenticated;

-- Minutos reais de uma tarefa: a soma, por pessoa, do que esteve a correr.
-- Um registo aberto conta até agora.
CREATE OR REPLACE FUNCTION public.ops_obra_minutos_reais(_tarefa_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(round(sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0, 1), 0)
    FROM public.ops_obra_registo r WHERE r.tarefa_id = _tarefa_id
$$;

REVOKE ALL ON FUNCTION public.ops_obra_minutos_reais(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_obra_evento(
  _org uuid, _obra_id uuid, _tipo text, _descricao text, _autor uuid, _depois jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES (_org, 'obra', _obra_id, _tipo, _descricao, _autor, NULL, _depois)
$$;

REVOKE ALL ON FUNCTION public.ops_obra_evento(uuid, uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 5. Modelo de exemplo — "Remodelação casa de banho"
-- ============================================================
-- Só entra por RPC (ou pela demo), NUNCA ao correr este ficheiro: dados de
-- uma organização não nascem de um script de esquema.
-- As fases 3 e 4 não foram nomeadas na reunião: "Acabamentos" e "Limpeza e
-- entrega" são um default editável, A CONFIRMAR.

CREATE OR REPLACE FUNCTION public.ops_obra_semear_exemplo_impl(_org uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_modelo uuid;
  v_fase   uuid;
  f        record;
  t        record;
BEGIN
  SELECT id INTO v_modelo FROM public.ops_obra_modelo
   WHERE organization_id = _org AND nome = 'Remodelação casa de banho';
  IF v_modelo IS NOT NULL THEN
    RETURN v_modelo;
  END IF;

  INSERT INTO public.ops_obra_modelo (organization_id, nome, descricao, tipo_servico)
  VALUES (_org, 'Remodelação casa de banho',
          'Remodelação completa de uma casa de banho até 6 m²: demolição, redes novas, revestimentos e louças.',
          'remodelacao')
  RETURNING id INTO v_modelo;

  FOR f IN
    SELECT * FROM (VALUES
      (1, 'Preparação e demolições'),
      (2, 'Instalações técnicas'),
      (3, 'Acabamentos'),
      (4, 'Limpeza e entrega')) AS x(ordem, nome)
  LOOP
    INSERT INTO public.ops_obra_modelo_fase (organization_id, modelo_id, ordem, nome)
    VALUES (_org, v_modelo, f.ordem, f.nome)
    RETURNING id INTO v_fase;

    FOR t IN
      SELECT * FROM (VALUES
        (1, 1, 'Proteção de acessos e zonas comuns', 60,
         'Forrar chão do percurso com cartão e plástico; fita nos aros; avisar condomínio.',
         'Cartão canelado, plástico de proteção, fita de pintor', 'X-ato, fita métrica'),
        (1, 2, 'Desmontagem de louças, móveis e acessórios', 90,
         'Fechar água e cortar o circuito; desligar e retirar louças sem partir tubagem embutida; tamponar esgotos.',
         'Tampões de esgoto, sacos de entulho', 'Chaves de grifos, chave inglesa, berbequim'),
        (1, 3, 'Demolição de revestimentos (paredes e chão)', 300,
         'Picar azulejo e pavimento até ao reboco/betonilha; verificar tubagem antiga e registar extras se houver.',
         'Sacos de entulho, discos de corte', 'Martelo demolidor, rebarbadora, EPI (óculos, máscara FFP2)'),
        (1, 4, 'Remoção de entulho', 120,
         'Ensacar e descer por escada/elevador protegido; contentor ou saco big-bag.',
         'Big-bag, sacos de entulho', 'Carrinho de mão'),
        (2, 1, 'Canalização — redes de água e esgoto', 360,
         'Abrir roços, instalar multicamada/PPR e esgoto PVC conforme projeto; pendente mínima 1 %.',
         'Tubo multicamada 16/20, acessórios, PVC 40/50/110, abraçadeiras', 'Prensa de multicamada, serra de copo, nível'),
        (2, 2, 'Eletricidade — circuitos, tomadas e iluminação', 240,
         'Circuito dedicado com diferencial 30 mA; tomadas fora dos volumes 0–2; caixas estanques IP44.',
         'Tubo VD, cabo H07V-U 2,5 mm², caixas, aparelhagem IP44', 'Detetor de tensão, multímetro, roçadeira'),
        (2, 3, 'Impermeabilização da base de duche', 120,
         'Primário + membrana líquida em 2 demãos com banda nos cantos; respeitar tempo de secagem entre demãos.',
         'Membrana impermeabilizante, banda de reforço, primário', 'Trincha, rolo, espátula'),
        (2, 4, 'Ensaio de pressão e estanquidade', 60,
         'Pressurizar a rede a 10 bar durante 30 min; registar leitura inicial e final; testar esgoto com água.',
         'Fita de teflon', 'Bomba de ensaio com manómetro'),
        (3, 1, 'Regularização de paredes e betonilha', 240,
         'Fechar roços, regularizar paredes e fazer betonilha com pendente para o ralo. Secagem mínima 24 h.',
         'Argamassa de regularização, cimento-cola, malha de fibra', 'Talocha, régua de alumínio, misturador'),
        (3, 2, 'Assentamento do pavimento cerâmico', 300,
         'Cimento-cola C2 em dupla colagem; juntas de 2 mm com cunhas; verificar pendente para o ralo.',
         'Cerâmico, cimento-cola C2, cunhas niveladoras', 'Talocha dentada, cortador de cerâmico, nível'),
        (3, 3, 'Assentamento do revestimento de paredes', 420,
         'Arrancar da 2.ª fiada com régua de apoio; esquadria nas esquinas; recortes à volta das saídas de água.',
         'Azulejo, cimento-cola C2, perfis de esquina', 'Talocha dentada, cortador, rebarbadora com disco diamantado'),
        (3, 4, 'Betumação de juntas e silicone', 120,
         'Betume epóxi na zona de duche, cimentício no resto; silicone sanitário nas juntas de canto.',
         'Betume de juntas, silicone sanitário', 'Talocha de borracha, esponja, pistola de silicone'),
        (3, 5, 'Pintura do teto', 120,
         'Primário + 2 demãos de tinta anti-fungos; ventilar entre demãos.',
         'Tinta anti-fungos, primário', 'Rolo, trincha, escadote'),
        (4, 1, 'Montagem de louças, base de duche e torneiras', 240,
         'Fixar sanita e lavatório com bucha química; montar misturadoras; testar fugas com a rede em carga.',
         'Louças, misturadoras, flexíveis, bucha química', 'Berbequim, chave de grifos, nível'),
        (4, 2, 'Montagem de móvel, espelho e acessórios', 120,
         'Marcar alturas com o cliente; fixar móvel e espelho; acessórios a 1,10 m.',
         'Buchas, parafusos inox', 'Berbequim, nível laser'),
        (4, 3, 'Limpeza final', 90,
         'Retirar proteções, limpar restos de cimento-cola e betume; aspirar e lavar.',
         'Detergente desincrustante, panos', 'Aspirador de obra, balde'),
        (4, 4, 'Vistoria com o cliente e entrega', 45,
         'Percorrer a lista de verificação com o cliente; registar reparos; tirar fotografias finais.',
         NULL, 'Telemóvel (fotografias)')
      ) AS y(fase, ordem, nome, minutos, procedimento, materiais, ferramentas)
      WHERE y.fase = f.ordem
    LOOP
      INSERT INTO public.ops_obra_modelo_tarefa
        (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento,
         materiais, ferramentas, minutos_previstos)
      VALUES (_org, v_modelo, v_fase, t.ordem, t.nome, t.procedimento,
              t.materiais, t.ferramentas, t.minutos);
    END LOOP;
  END LOOP;

  RETURN v_modelo;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_semear_exemplo_impl(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_semear_modelo_exemplo(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem record;
  v_id   uuid;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.checklists.manage', ARRAY['gestor'],
    'Só quem planeia gere os modelos de obra.');
  v_id := public.ops_obra_semear_exemplo_impl(p_org);
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_semear_modelo_exemplo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_semear_modelo_exemplo(uuid) TO authenticated, service_role;


-- ============================================================
-- 6. Gravar um modelo (fases + tarefas, de uma vez)
-- ============================================================
-- `p_fases`: [{"ordem":1,"nome":"…","tarefas":[{"id"?,"nome","procedimento",
-- "materiais","ferramentas","minutos_previstos"}]}]
-- Uma tarefa que traz `id` é ATUALIZADA, não recriada — é isso que mantém as
-- métricas "previsto vs real" ligadas ao mesmo default ao longo do tempo.

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_modelo(
  p_org          uuid,
  p_modelo_id    uuid,
  p_nome         text,
  p_descricao    text,
  p_tipo_servico text,
  p_fases        jsonb,
  p_ativo        boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem    record;
  v_id      uuid := p_modelo_id;
  v_nome    text := nullif(btrim(coalesce(p_nome, '')), '');
  v_fase    jsonb;
  v_tarefa  jsonb;
  v_fase_id uuid;
  v_tid     uuid;
  v_ordens  smallint[] := '{}';
  v_manter  uuid[] := '{}';
  v_pos     integer;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.checklists.manage', ARRAY['gestor'],
    'Só quem planeia gere os modelos de obra.');

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um modelo precisa de nome.';
  END IF;
  IF p_fases IS NULL OR jsonb_typeof(p_fases) <> 'array' OR jsonb_array_length(p_fases) = 0 THEN
    RAISE EXCEPTION 'Um modelo precisa de pelo menos uma fase.';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ops_obra_modelo (organization_id, nome, descricao, tipo_servico, ativo)
    VALUES (p_org, v_nome, nullif(btrim(coalesce(p_descricao,'')), ''),
            nullif(btrim(coalesce(p_tipo_servico,'')), ''), COALESCE(p_ativo, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_obra_modelo
       SET nome = v_nome,
           descricao = nullif(btrim(coalesce(p_descricao,'')), ''),
           tipo_servico = nullif(btrim(coalesce(p_tipo_servico,'')), ''),
           ativo = COALESCE(p_ativo, true),
           atualizado_em = now()
     WHERE id = v_id AND organization_id = p_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Modelo não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  FOR v_fase IN SELECT * FROM jsonb_array_elements(p_fases) LOOP
    IF nullif(btrim(coalesce(v_fase->>'nome','')), '') IS NULL THEN
      RAISE EXCEPTION 'Há uma fase sem nome.';
    END IF;

    INSERT INTO public.ops_obra_modelo_fase (organization_id, modelo_id, ordem, nome)
    VALUES (p_org, v_id, (v_fase->>'ordem')::smallint, btrim(v_fase->>'nome'))
    ON CONFLICT (modelo_id, ordem) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id INTO v_fase_id;

    v_ordens := v_ordens || (v_fase->>'ordem')::smallint;
    v_pos := 0;

    FOR v_tarefa IN SELECT * FROM jsonb_array_elements(COALESCE(v_fase->'tarefas', '[]'::jsonb)) LOOP
      v_pos := v_pos + 1;
      IF nullif(btrim(coalesce(v_tarefa->>'nome','')), '') IS NULL THEN
        RAISE EXCEPTION 'Há uma tarefa sem nome na fase "%".', v_fase->>'nome';
      END IF;
      IF COALESCE((v_tarefa->>'minutos_previstos')::integer, 0) <= 0 THEN
        RAISE EXCEPTION 'A tarefa "%" precisa de um tempo previsto maior que zero.', v_tarefa->>'nome';
      END IF;

      v_tid := NULL;
      IF v_tarefa ? 'id' AND nullif(v_tarefa->>'id','') IS NOT NULL THEN
        UPDATE public.ops_obra_modelo_tarefa
           SET modelo_fase_id = v_fase_id, ordem = v_pos,
               nome = btrim(v_tarefa->>'nome'),
               procedimento = nullif(btrim(coalesce(v_tarefa->>'procedimento','')), ''),
               materiais = nullif(btrim(coalesce(v_tarefa->>'materiais','')), ''),
               ferramentas = nullif(btrim(coalesce(v_tarefa->>'ferramentas','')), ''),
               minutos_previstos = (v_tarefa->>'minutos_previstos')::integer
         WHERE id = (v_tarefa->>'id')::uuid AND modelo_id = v_id
        RETURNING id INTO v_tid;
      END IF;

      IF v_tid IS NULL THEN
        INSERT INTO public.ops_obra_modelo_tarefa
          (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento,
           materiais, ferramentas, minutos_previstos)
        VALUES (p_org, v_id, v_fase_id, v_pos, btrim(v_tarefa->>'nome'),
                nullif(btrim(coalesce(v_tarefa->>'procedimento','')), ''),
                nullif(btrim(coalesce(v_tarefa->>'materiais','')), ''),
                nullif(btrim(coalesce(v_tarefa->>'ferramentas','')), ''),
                (v_tarefa->>'minutos_previstos')::integer)
        RETURNING id INTO v_tid;
      END IF;

      v_manter := v_manter || v_tid;
    END LOOP;
  END LOOP;

  DELETE FROM public.ops_obra_modelo_tarefa
   WHERE modelo_id = v_id AND NOT (id = ANY (v_manter));
  DELETE FROM public.ops_obra_modelo_fase
   WHERE modelo_id = v_id AND NOT (ordem = ANY (v_ordens));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id,
    'tarefas', (SELECT count(*) FROM public.ops_obra_modelo_tarefa WHERE modelo_id = v_id));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_modelo(uuid, uuid, text, text, text, jsonb, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_modelo(uuid, uuid, text, text, text, jsonb, boolean)
  TO authenticated, service_role;


-- ============================================================
-- 6b. Tarefas a partir do orçamento (os serviços vendidos)
-- ============================================================
-- Uma tarefa por linha do orçamento que seja um SERVIÇO. Produtos (louças,
-- material) não são trabalho e ficam de fora.
--
--   · minutos previstos = qt × horas × pessoas da ficha técnica × 60
--     (é a mesma conta que o CRM usa para o custo de mão de obra: preço/hora
--     × pessoas × horas, por unidade). Sem horas na ficha → 60 min e
--     `sem_ficha`, para se ver o que falta preencher no CRM;
--   · procedimento = "descrição da mão de obra" da ficha;
--   · materiais = os materiais da ficha × qt;
--   · fase por palavras-chave na categoria/nome do serviço/secção:
--     demolição/preparação → 1, instalações → 2, limpeza/entrega → 4,
--     o resto → 3. É um ponto de partida; o gestor muda no Gantt.
--
-- Só lê o CRM. Se a base não tiver as tabelas de serviços, devolve vazio
-- (a obra nasce com as 4 fases vazias, como antes).

-- (DROP: a lista de colunas devolvidas mudou ao longo das versões.)
DROP FUNCTION IF EXISTS public.ops_obra_tarefas_do_orcamento(uuid);
CREATE FUNCTION public.ops_obra_tarefas_do_orcamento(_orc uuid)
RETURNS TABLE (
  fase               smallint,
  ordem              integer,
  nome               text,
  procedimento       text,
  materiais          text,
  ferramentas        text,
  minutos            integer,
  pessoas            smallint,
  skill_id           uuid,
  sem_ficha          boolean,
  com_modelo         boolean,
  orcamento_linha_id uuid,
  servico_id         uuid,
  servico_tarefa_id  uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_org   uuid;
  v_ordem integer := 0;
  l       record;
  st      record;
BEGIN
  IF _orc IS NULL
     OR to_regclass('public.services') IS NULL
     OR to_regclass('public.service_categories') IS NULL
     OR to_regclass('public.service_materials') IS NULL
     OR to_regclass('public.products') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'quote_lines'
                       AND column_name = 'service_id') THEN
    RETURN;
  END IF;

  SELECT q.organization_id INTO v_org FROM public.quotes q WHERE q.id = _orc;

  -- Dinâmico para o ficheiro instalar numa base sem as tabelas de serviços.
  FOR l IN EXECUTE $q$
    SELECT l.id, COALESCE(l.qt, 1) AS qt, l.service_id,
           COALESCE(nullif(btrim(s.name), ''), nullif(btrim(l.descricao_snapshot), ''), 'Serviço') AS nome,
           nullif(btrim(s.technical_sheet_labor_description), '') AS proc,
           s.technical_sheet_labor_hours AS horas,
           s.technical_sheet_labor_people_count AS pessoas,
           (CASE
              WHEN lower(concat_ws(' ', c.name, s.name, l.section_name)) ~ '(demol|prepara|remoç|remoc|retirad|desmont|proteç|protec|estaleiro)' THEN 1
              WHEN lower(concat_ws(' ', c.name, s.name, l.section_name)) ~ '(eletric|elétric|electric|canaliz|água|agua|esgot|gás|gas |avac|climatiz|ar condicionado|instalaç|instalac|tubag|quadro|rede )' THEN 2
              WHEN lower(concat_ws(' ', c.name, s.name, l.section_name)) ~ '(limpez|entrega)' THEN 4
              ELSE 3
            END)::smallint AS fase,
           (SELECT string_agg(p.name || ' × ' || trim_scale(round((sm.quantity * COALESCE(l.qt, 1))::numeric, 2))::text,
                              '; ' ORDER BY sm.sort_order NULLS LAST, p.name)
              FROM public.service_materials sm
              JOIN public.products p ON p.id = sm.product_id
             WHERE sm.service_id = l.service_id AND sm.deleted_at IS NULL) AS materiais
      FROM public.quote_lines l
      JOIN public.services s ON s.id = l.service_id
      LEFT JOIN public.service_categories c ON c.id = s.service_category_id
     WHERE l.quote_id = $1
     ORDER BY l.ordem NULLS LAST, l.id
  $q$ USING _orc
  LOOP
    IF EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa x
                WHERE x.organization_id = v_org AND x.servico_id = l.service_id) THEN
      -- O serviço tem modelo: uma tarefa por passo, tempo × quantidade.
      FOR st IN
        SELECT x.* FROM public.ops_obra_servico_tarefa x
         WHERE x.organization_id = v_org AND x.servico_id = l.service_id
         ORDER BY x.ordem
      LOOP
        v_ordem := v_ordem + 1;
        fase := st.fase;
        ordem := v_ordem;
        nome := l.nome || ': ' || st.nome;
        procedimento := st.procedimento;
        materiais := st.materiais;
        ferramentas := st.ferramentas;
        minutos := GREATEST(1, round(st.minutos_fixos + st.minutos_por_unidade * l.qt))::integer;
        pessoas := st.pessoas;
        skill_id := st.skill_id;
        sem_ficha := false;
        com_modelo := true;
        orcamento_linha_id := l.id;
        servico_id := l.service_id;
        servico_tarefa_id := st.id;
        RETURN NEXT;
      END LOOP;
    ELSE
      -- Sem modelo: uma tarefa só, com o tempo da ficha técnica
      -- (qt × horas × pessoas; sem horas → 60 min e `sem_ficha`).
      v_ordem := v_ordem + 1;
      fase := l.fase;
      ordem := v_ordem;
      nome := l.nome;
      procedimento := l.proc;
      materiais := l.materiais;
      ferramentas := NULL;
      minutos := (CASE WHEN COALESCE(l.horas, 0) > 0
                       THEN GREATEST(1, round(60 * l.qt * l.horas * COALESCE(nullif(l.pessoas, 0), 1)))
                       ELSE 60 END)::integer;
      pessoas := LEAST(20, GREATEST(1, COALESCE(round(l.pessoas), 1)))::smallint;
      skill_id := NULL;
      sem_ficha := COALESCE(l.horas, 0) <= 0;
      com_modelo := false;
      orcamento_linha_id := l.id;
      servico_id := l.service_id;
      servico_tarefa_id := NULL;
      RETURN NEXT;
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_tarefas_do_orcamento(uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 6c. Modelos por serviço — gestão e sugestão automática
-- ============================================================
-- Quem gere: o gestor/admin de Operações (checklists.manage) OU o comercial
-- (quem pode editar serviços no CRM, `services.edit`, nesta organização).

CREATE OR REPLACE FUNCTION public.ops_obra_pode_gerir_modelos(_org uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := public.current_business_user_id();
BEGIN
  RETURN public.is_system_admin_user((SELECT auth.uid()))
    OR (public.ops_pode(_org, 'operations.checklists.manage')
        AND EXISTS (SELECT 1 FROM public.ops_utilizador_perfil p
                     WHERE p.organization_id = _org AND p.utilizador_id = v_user
                       AND p.ativo AND p.funcao IN ('admin','gestor')))
    OR EXISTS (SELECT 1 FROM public.anew_memberships m
                 JOIN public.anew_role_permissions rp
                   ON rp.role_id = m.role_id AND rp.permission_code = 'services.edit'
                WHERE m.user_id = v_user AND m.organization_id = _org AND m.status = 'active');
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_pode_gerir_modelos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_pode_gerir_modelos(uuid) TO authenticated, service_role;

-- Ver os modelos: quem vê Operações, ou quem os pode gerir.
CREATE OR REPLACE FUNCTION public.ops_obra_pode_ver_modelos(_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.ops_pode(_org, 'operations.view') OR public.ops_obra_pode_gerir_modelos(_org)
$$;

REVOKE ALL ON FUNCTION public.ops_obra_pode_ver_modelos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_pode_ver_modelos(uuid) TO authenticated, service_role;

-- O serviço é desta organização (dono, ou partilhado com ela)?
CREATE OR REPLACE FUNCTION public.ops_obra_servico_da_org(_org uuid, _servico uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v boolean;
BEGIN
  IF to_regclass('public.services') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.services s WHERE s.id = $2
             AND NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
             AND (s.organization_id = $1'
       || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
               THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                                  WHERE so.service_id = s.id AND so.organization_id = $1)'
               ELSE '' END
       || '))'
    INTO v USING _org, _servico;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_servico_da_org(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- A biblioteca de partida: como se executa, em geral, cada família de
-- serviço. São valores RAZOÁVEIS, não medidos — servem para a obra nascer
-- planeada; as métricas (real vs previsto) dizem depois o que corrigir.
--   re = palavras na categoria/nome do serviço (a primeira família que bate)
--   mu = minutos (pessoa × tempo) por unidade, se a ficha não tiver horas
--   t  = passos: n nome, fase, p fração do tempo por unidade, x minutos fixos,
--        k pessoas (null = as da ficha), d depende do passo n.º
CREATE OR REPLACE FUNCTION public.ops_obra_biblioteca()
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT $j$[
  {"familia":"Demolições","re":"demol|remoç|remoc|picar|retirad|desmont|arranc","skill":"Demolições","mu":30,"t":[
    {"n":"Proteger zona e acessos","fase":1,"x":45,"p":0,"k":1},
    {"n":"Demolir e remover","fase":1,"p":0.8,"k":2,"d":1},
    {"n":"Retirar entulho","fase":1,"p":0.2,"k":1,"d":2}]},
  {"familia":"AVAC","re":"climatiz|ar condicionado|avac|ventila|bomba de calor|split","skill":"AVAC","mu":240,"t":[
    {"n":"Furação e suportes","fase":2,"p":0.3,"k":1},
    {"n":"Instalar unidades e tubagem","fase":2,"p":0.5,"k":2,"d":1},
    {"n":"Vácuo, carga e teste","fase":2,"x":30,"p":0.2,"k":1,"d":2}]},
  {"familia":"Canalização","re":"canaliz|água|agua|esgot|sanit|duche|banheira|autoclism|torneira|lavatór|lavator|termoacumul|esquentador","skill":"Canalização","mu":120,"t":[
    {"n":"Marcar traçado","fase":2,"x":30,"p":0,"k":1},
    {"n":"Abrir roços","fase":2,"p":0.25,"k":1,"d":1},
    {"n":"Instalar tubagem e equipamento","fase":2,"p":0.5,"k":null,"d":2},
    {"n":"Ensaio de estanquidade","fase":2,"x":30,"p":0,"k":1,"d":3},
    {"n":"Fechar roços","fase":2,"p":0.25,"k":1,"d":4}]},
  {"familia":"Eletricidade","re":"eletric|elétric|electric|quadro|tomada|interruptor|iluminaç|ilumina|luminár|cabo|ited","skill":"Eletricidade","mu":90,"t":[
    {"n":"Marcar traçado","fase":2,"x":30,"p":0,"k":1},
    {"n":"Abrir roços e caixas","fase":2,"p":0.3,"k":1,"d":1},
    {"n":"Passar cabos e ligar","fase":2,"p":0.5,"k":null,"d":2},
    {"n":"Fechar roços","fase":2,"p":0.2,"k":1,"d":3},
    {"n":"Ensaio e verificação","fase":2,"x":30,"p":0,"k":1,"d":4}]},
  {"familia":"Pladur e tetos","re":"pladur|gesso cartonado|teto falso|tecto falso|divisór|divisor","skill":"Pladur","mu":40,"t":[
    {"n":"Montar estrutura","fase":3,"p":0.4,"k":null},
    {"n":"Aplicar placas","fase":3,"p":0.35,"k":null,"d":1},
    {"n":"Tratar juntas","fase":3,"p":0.25,"k":1,"d":2}]},
  {"familia":"Revestimentos","re":"azulej|cerâm|ceram|revestim|mosaic|pavimento|ladrilh|porcelan|soalho|flutuante|vinil","skill":"Revestimentos","mu":45,"t":[
    {"n":"Regularizar base","fase":3,"p":0.25,"k":1},
    {"n":"Assentar","fase":3,"p":0.55,"k":null,"d":1},
    {"n":"Betumar juntas e rematar","fase":3,"p":0.15,"k":1,"d":2},
    {"n":"Limpar","fase":3,"p":0.05,"k":1,"d":3}]},
  {"familia":"Pintura","re":"pintur|tinta|esmalt|verniz|estuque|reboco","skill":"Pintura","mu":15,"t":[
    {"n":"Proteger e mascarar","fase":3,"x":30,"p":0,"k":1},
    {"n":"Preparar superfície","fase":3,"p":0.35,"k":1,"d":1},
    {"n":"Aplicar primário","fase":3,"p":0.2,"k":1,"d":2},
    {"n":"1.ª demão","fase":3,"p":0.225,"k":1,"d":3},
    {"n":"2.ª demão","fase":3,"p":0.225,"k":1,"d":4}]},
  {"familia":"Carpintaria","re":"carpint|porta|roupeiro|armário|armario|móvel|movel|cozinha|bancada|rodapé|rodape","skill":"Carpintaria","mu":120,"t":[
    {"n":"Medir e preparar","fase":3,"x":30,"p":0.1,"k":1},
    {"n":"Montar","fase":3,"p":0.75,"k":null,"d":1},
    {"n":"Afinar e rematar","fase":3,"p":0.15,"k":1,"d":2}]},
  {"familia":"Limpeza","re":"limpez","skill":null,"mu":60,"t":[
    {"n":"Limpeza","fase":4,"p":1,"k":null}]}
]$j$::jsonb $$;

REVOKE ALL ON FUNCTION public.ops_obra_biblioteca() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_biblioteca() TO authenticated, service_role;

-- Gera (substitui) o modelo de um serviço a partir da biblioteca e da ficha
-- técnica. Devolve o n.º de tarefas.
CREATE OR REPLACE FUNCTION public.ops_obra_servico_sugerir_impl(_org uuid, _servico uuid, _autor uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_s      record;
  v_chave  text;
  v_fam    jsonb;
  v_fase   smallint;
  v_total  numeric;
  v_ficha_pessoas integer;
  v_skill  uuid;
  v_mats   text;
  v_maxp   numeric;
  v_n      integer := 0;
  t        jsonb;
  i        integer;
BEGIN
  EXECUTE 'SELECT s.name, c.name AS categoria, s.technical_sheet_labor_hours AS horas,
                  s.technical_sheet_labor_people_count AS pessoas,
                  nullif(btrim(s.technical_sheet_labor_description), '''') AS descricao
             FROM public.services s LEFT JOIN public.service_categories c ON c.id = s.service_category_id
            WHERE s.id = $1'
     INTO v_s USING _servico;
  IF v_s.name IS NULL THEN
    RETURN 0;
  END IF;

  v_chave := lower(concat_ws(' ', v_s.categoria, v_s.name));
  SELECT f INTO v_fam
    FROM jsonb_array_elements(public.ops_obra_biblioteca()) WITH ORDINALITY AS x(f, pos)
   WHERE v_chave ~ (f->>'re')
   ORDER BY pos LIMIT 1;

  IF v_fam IS NULL THEN
    -- Genérico: preparar / executar / arrumar, na fase que o nome sugere.
    v_fase := CASE
      WHEN v_chave ~ '(demol|prepara|remoç|remoc|retirad|desmont|proteç|protec|estaleiro)' THEN 1
      WHEN v_chave ~ '(instalaç|instalac|tubag|rede |gás|gas )' THEN 2
      WHEN v_chave ~ '(limpez|entrega)' THEN 4
      ELSE 3 END;
    v_fam := jsonb_build_object('familia', 'Genérico', 'skill', NULL, 'mu', 60, 't', jsonb_build_array(
      jsonb_build_object('n', 'Preparar', 'fase', v_fase, 'x', 15, 'p', 0.1, 'k', 1),
      jsonb_build_object('n', 'Executar', 'fase', v_fase, 'p', 0.8, 'k', NULL, 'd', 1),
      jsonb_build_object('n', 'Arrumar e limpar', 'fase', v_fase, 'p', 0.1, 'k', 1, 'd', 2)));
  END IF;

  v_ficha_pessoas := GREATEST(1, COALESCE(round(v_s.pessoas), 1))::integer;
  v_total := CASE WHEN COALESCE(v_s.horas, 0) > 0
                  THEN v_s.horas * v_ficha_pessoas * 60
                  ELSE (v_fam->>'mu')::numeric END;

  IF v_fam->>'skill' IS NOT NULL THEN
    INSERT INTO public.ops_skill (organization_id, nome) VALUES (_org, v_fam->>'skill')
    ON CONFLICT (organization_id, nome) DO NOTHING;
    SELECT id INTO v_skill FROM public.ops_skill WHERE organization_id = _org AND nome = v_fam->>'skill';
  END IF;

  -- Materiais da ficha, por unidade, no passo principal (o de maior fração).
  EXECUTE 'SELECT string_agg(p.name || '' × '' || trim_scale(round(sm.quantity::numeric, 2))::text || '' /un'',
                             ''; '' ORDER BY sm.sort_order NULLS LAST, p.name)
             FROM public.service_materials sm JOIN public.products p ON p.id = sm.product_id
            WHERE sm.service_id = $1 AND sm.deleted_at IS NULL'
     INTO v_mats USING _servico;
  SELECT max(COALESCE((x->>'p')::numeric, 0)) INTO v_maxp FROM jsonb_array_elements(v_fam->'t') x;

  DELETE FROM public.ops_obra_servico_tarefa WHERE organization_id = _org AND servico_id = _servico;

  i := 0;
  FOR t IN SELECT x FROM jsonb_array_elements(v_fam->'t') x LOOP
    i := i + 1;
    INSERT INTO public.ops_obra_servico_tarefa (
      organization_id, servico_id, ordem, nome, fase, minutos_por_unidade, minutos_fixos,
      pessoas, skill_id, depende_ordem, procedimento, materiais, origem, atualizado_por)
    VALUES (
      _org, _servico, i, t->>'n', (t->>'fase')::smallint,
      round(v_total * COALESCE((t->>'p')::numeric, 0), 2),
      COALESCE((t->>'x')::integer, 0),
      -- k da biblioteca; sem k, as pessoas da ficha.
      LEAST(20, COALESCE((t->>'k')::integer, v_ficha_pessoas)),
      v_skill,
      (t->>'d')::integer,
      CASE WHEN COALESCE((t->>'p')::numeric, 0) = v_maxp THEN v_s.descricao END,
      CASE WHEN COALESCE((t->>'p')::numeric, 0) = v_maxp THEN v_mats END,
      'sugerida', _autor);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_servico_sugerir_impl(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- O tipo de obra "Obra geral", por defeito, com as tarefas que existem sempre.
CREATE OR REPLACE FUNCTION public.ops_obra_semear_tipo_geral_impl(_org uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_f  uuid;
BEGIN
  SELECT id INTO v_id FROM public.ops_obra_modelo WHERE organization_id = _org AND por_defeito;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  SELECT id INTO v_id FROM public.ops_obra_modelo WHERE organization_id = _org AND nome = 'Obra geral';
  IF v_id IS NOT NULL THEN
    UPDATE public.ops_obra_modelo SET por_defeito = true, atualizado_em = now() WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.ops_obra_modelo (organization_id, nome, descricao, tipo_servico, por_defeito)
  VALUES (_org, 'Obra geral',
          'O que existe em qualquer obra. Os serviços do contrato juntam-se a estas tarefas.',
          'geral', true)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_obra_modelo_fase (organization_id, modelo_id, ordem, nome)
  VALUES (_org, v_id, 1, 'Preparação e demolições'), (_org, v_id, 2, 'Instalações técnicas'),
         (_org, v_id, 3, 'Acabamentos'), (_org, v_id, 4, 'Limpeza e entrega');

  SELECT id INTO v_f FROM public.ops_obra_modelo_fase WHERE modelo_id = v_id AND ordem = 1;
  INSERT INTO public.ops_obra_modelo_tarefa (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento, minutos_previstos)
  VALUES (_org, v_id, v_f, 1, 'Reunião de arranque com o cliente', 'Confirmar acessos, horários, zonas a proteger e contactos.', 30),
         (_org, v_id, v_f, 2, 'Proteger acessos e zonas comuns', 'Cartão/plástico no chão, fita nas portas, proteção de elevador.', 60);
  SELECT id INTO v_f FROM public.ops_obra_modelo_fase WHERE modelo_id = v_id AND ordem = 4;
  INSERT INTO public.ops_obra_modelo_tarefa (organization_id, modelo_id, modelo_fase_id, ordem, nome, procedimento, minutos_previstos)
  VALUES (_org, v_id, v_f, 1, 'Limpeza final', 'Retirar proteções, aspirar, lavar superfícies.', 120),
         (_org, v_id, v_f, 2, 'Vistoria e entrega ao cliente', 'Percorrer a obra com o cliente, anotar remates, recolher assinatura.', 60);
  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_semear_tipo_geral_impl(uuid) FROM PUBLIC, anon, authenticated;

-- "Gerar sugestões": um serviço (p_servico_id) ou todos os da organização.
-- Sem p_substituir, só gera onde não há modelo; com p_substituir, refaz os
-- sugeridos (nunca apaga um modelo que alguém gravou à mão, exceto se for o
-- serviço indicado). Garante também o tipo "Obra geral".
CREATE OR REPLACE FUNCTION public.rpc_ops_servico_modelo_sugerir(
  p_org         uuid,
  p_servico_id  uuid    DEFAULT NULL,
  p_substituir  boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid := public.current_business_user_id();
  v_servicos integer := 0;
  v_tarefas  integer := 0;
  v_k        integer;
  v_id       uuid;
BEGIN
  IF NOT public.ops_obra_pode_gerir_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir modelos nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF to_regclass('public.services') IS NULL THEN
    RAISE EXCEPTION 'Esta base não tem o catálogo de serviços do CRM.';
  END IF;

  IF p_servico_id IS NOT NULL THEN
    IF NOT public.ops_obra_servico_da_org(p_org, p_servico_id) THEN
      RAISE EXCEPTION 'Serviço não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    IF NOT p_substituir AND EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa
                                     WHERE organization_id = p_org AND servico_id = p_servico_id) THEN
      RAISE EXCEPTION 'Esse serviço já tem modelo. Para o refazer, confirma a substituição.';
    END IF;
    v_tarefas := public.ops_obra_servico_sugerir_impl(p_org, p_servico_id, v_user);
    v_servicos := 1;
  ELSE
    FOR v_id IN EXECUTE
      'SELECT s.id FROM public.services s
        WHERE NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
          AND (s.organization_id = $1'
      || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
              THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                                 WHERE so.service_id = s.id AND so.organization_id = $1)'
              ELSE '' END
      || ')' USING p_org
    LOOP
      IF NOT EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa
                      WHERE organization_id = p_org AND servico_id = v_id)
         OR (p_substituir AND NOT EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa
                                           WHERE organization_id = p_org AND servico_id = v_id
                                             AND origem = 'manual')) THEN
        v_k := public.ops_obra_servico_sugerir_impl(p_org, v_id, v_user);
        v_tarefas := v_tarefas + v_k;
        v_servicos := v_servicos + 1;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.ops_obra_semear_tipo_geral_impl(p_org);
  RETURN jsonb_build_object('ok', true, 'servicos', v_servicos, 'tarefas', v_tarefas);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_servico_modelo_sugerir(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_servico_modelo_sugerir(uuid, uuid, boolean) TO authenticated, service_role;

-- Gravar o modelo de um serviço (substitui todas as tarefas). p_tarefas é um
-- array [{nome, fase, minutos_por_unidade, minutos_fixos, pessoas, skill_id,
-- depende_ordem, procedimento, materiais, ferramentas}] pela ordem.
CREATE OR REPLACE FUNCTION public.rpc_ops_servico_modelo_gravar(
  p_org        uuid,
  p_servico_id uuid,
  p_tarefas    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := public.current_business_user_id();
  v_n    integer := COALESCE(jsonb_array_length(p_tarefas), 0);
  t      jsonb;
  i      integer := 0;
  v_dep  integer;
  v_mpu  numeric;
  v_fix  integer;
BEGIN
  IF NOT public.ops_obra_pode_gerir_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir modelos nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.ops_obra_servico_da_org(p_org, p_servico_id) THEN
    RAISE EXCEPTION 'Serviço não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
  END IF;
  IF jsonb_typeof(COALESCE(p_tarefas, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'As tarefas têm de vir numa lista.';
  END IF;

  -- Validar tudo antes de apagar o que lá está.
  FOR t IN SELECT x FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) x LOOP
    i := i + 1;
    IF nullif(btrim(t->>'nome'), '') IS NULL THEN
      RAISE EXCEPTION 'A tarefa n.º % não tem nome.', i;
    END IF;
    IF COALESCE((t->>'fase')::integer, 0) NOT BETWEEN 1 AND 9 THEN
      RAISE EXCEPTION '"%": a fase tem de ser de 1 a 9.', t->>'nome';
    END IF;
    v_mpu := COALESCE((t->>'minutos_por_unidade')::numeric, 0);
    v_fix := COALESCE((t->>'minutos_fixos')::integer, 0);
    IF v_mpu < 0 OR v_fix < 0 OR (v_mpu = 0 AND v_fix = 0) THEN
      RAISE EXCEPTION '"%": precisa de tempo (por unidade ou fixo).', t->>'nome';
    END IF;
    IF COALESCE((t->>'pessoas')::integer, 1) NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION '"%": de 1 a 20 pessoas.', t->>'nome';
    END IF;
    v_dep := (t->>'depende_ordem')::integer;
    IF v_dep IS NOT NULL AND (v_dep = i OR v_dep < 1 OR v_dep > v_n) THEN
      RAISE EXCEPTION '"%": só pode depender de outra tarefa deste serviço.', t->>'nome';
    END IF;
    IF nullif(t->>'skill_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.ops_skill WHERE id = (t->>'skill_id')::uuid AND organization_id = p_org) THEN
      RAISE EXCEPTION '"%": essa especialidade não é desta organização.', t->>'nome';
    END IF;
  END LOOP;

  -- Sem ciclos (2 depois de 3, 3 depois de 2): nenhuma das duas começaria.
  IF EXISTS (
    WITH RECURSIVE ar(a, b) AS (
      SELECT x.pos::integer, (x.t->>'depende_ordem')::integer
        FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) WITH ORDINALITY AS x(t, pos)
       WHERE nullif(x.t->>'depende_ordem', '') IS NOT NULL
    ), r(ini, cur) AS (
      SELECT a, b FROM ar
      UNION
      SELECT r.ini, ar.b FROM r JOIN ar ON ar.a = r.cur
    )
    SELECT 1 FROM r WHERE r.ini = r.cur) THEN
    RAISE EXCEPTION 'As dependências deste serviço fecham um ciclo: nenhuma dessas tarefas poderia começar.';
  END IF;

  DELETE FROM public.ops_obra_servico_tarefa WHERE organization_id = p_org AND servico_id = p_servico_id;

  INSERT INTO public.ops_obra_servico_tarefa (
    organization_id, servico_id, ordem, nome, fase, minutos_por_unidade, minutos_fixos, pessoas,
    skill_id, depende_ordem, procedimento, materiais, ferramentas, origem, atualizado_por)
  SELECT p_org, p_servico_id, x.pos::integer, btrim(x.t->>'nome'), (x.t->>'fase')::smallint,
         COALESCE((x.t->>'minutos_por_unidade')::numeric, 0), COALESCE((x.t->>'minutos_fixos')::integer, 0),
         COALESCE((x.t->>'pessoas')::smallint, 1), nullif(x.t->>'skill_id', '')::uuid,
         (x.t->>'depende_ordem')::integer,
         nullif(btrim(x.t->>'procedimento'), ''), nullif(btrim(x.t->>'materiais'), ''),
         nullif(btrim(x.t->>'ferramentas'), ''), 'manual', v_user
    FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) WITH ORDINALITY AS x(t, pos);

  RETURN jsonb_build_object('ok', true, 'tarefas', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_servico_modelo_gravar(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_servico_modelo_gravar(uuid, uuid, jsonb) TO authenticated, service_role;

-- Lista de serviços da organização, com a ficha e o estado do modelo. Por
-- RPC (e não vista) para não depender das permissões do CRM sobre `services`.
CREATE OR REPLACE FUNCTION public.rpc_ops_servicos_com_modelo(p_org uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.ops_obra_pode_ver_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF to_regclass('public.services') IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;
  EXECUTE
    'SELECT COALESCE(jsonb_agg(jsonb_build_object(
        ''servico_id'', s.id, ''nome'', s.name, ''sku'', s.sku, ''categoria'', c.name,
        ''horas'', s.technical_sheet_labor_hours, ''pessoas'', s.technical_sheet_labor_people_count,
        ''descricao_mao_obra'', s.technical_sheet_labor_description,
        ''tarefas'', COALESCE(m.tarefas, ''[]''::jsonb),
        ''editado'', COALESCE(m.editado, false)) ORDER BY c.name NULLS LAST, s.name), ''[]''::jsonb)
       FROM public.services s
       LEFT JOIN public.service_categories c ON c.id = s.service_category_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  ''id'', x.id, ''ordem'', x.ordem, ''nome'', x.nome, ''fase'', x.fase,
                  ''minutos_por_unidade'', x.minutos_por_unidade, ''minutos_fixos'', x.minutos_fixos,
                  ''pessoas'', x.pessoas, ''skill_id'', x.skill_id, ''depende_ordem'', x.depende_ordem,
                  ''procedimento'', x.procedimento, ''materiais'', x.materiais, ''ferramentas'', x.ferramentas,
                  ''origem'', x.origem) ORDER BY x.ordem) AS tarefas,
                bool_or(x.origem = ''manual'') AS editado
           FROM public.ops_obra_servico_tarefa x
          WHERE x.organization_id = $1 AND x.servico_id = s.id) m ON true
      WHERE NOT COALESCE(s.is_deleted, false) AND s.deleted_at IS NULL
        AND (s.organization_id = $1'
    || CASE WHEN to_regclass('public.service_organizations') IS NOT NULL
            THEN ' OR EXISTS (SELECT 1 FROM public.service_organizations so
                               WHERE so.service_id = s.id AND so.organization_id = $1)'
            ELSE '' END
    || ')'
    INTO v USING p_org;
  RETURN v;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_servicos_com_modelo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_servicos_com_modelo(uuid) TO authenticated, service_role;

-- O tipo de obra por defeito (um por organização).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_modelo_por_defeito(p_modelo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_obra_modelo WHERE id = p_modelo_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Tipo de obra não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.ops_obra_pode_gerir_modelos(v_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir modelos nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.ops_obra_modelo SET por_defeito = false WHERE organization_id = v_org AND por_defeito AND id <> p_modelo_id;
  UPDATE public.ops_obra_modelo SET por_defeito = true, ativo = true, atualizado_em = now() WHERE id = p_modelo_id;
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_modelo_por_defeito(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_modelo_por_defeito(uuid) TO authenticated, service_role;

-- Especialidades: criar uma, e dizer quem as tem (com a zona base), para a
-- distribuição automática escolher bem.
CREATE OR REPLACE FUNCTION public.rpc_ops_skill_criar(p_org uuid, p_nome text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF NOT public.ops_obra_pode_gerir_modelos(p_org) THEN
    RAISE EXCEPTION 'Sem permissão para gerir especialidades nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma especialidade precisa de nome.';
  END IF;
  INSERT INTO public.ops_skill (organization_id, nome) VALUES (p_org, v_nome)
  ON CONFLICT (organization_id, nome) DO UPDATE SET ativo = true
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_skill_criar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_skill_criar(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_pessoa_planeamento(
  p_org        uuid,
  p_utilizador uuid,
  p_zona       text,
  p_skills     uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem record;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.settings.manage', ARRAY['gestor'],
    'Só o gestor muda a zona e as especialidades da equipa.');
  IF NOT EXISTS (SELECT 1 FROM public.ops_utilizador_perfil
                  WHERE organization_id = p_org AND utilizador_id = p_utilizador) THEN
    RAISE EXCEPTION 'Essa pessoa não está em Operações nesta organização.';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_skills, '{}')) s
              WHERE NOT EXISTS (SELECT 1 FROM public.ops_skill k WHERE k.id = s AND k.organization_id = p_org)) THEN
    RAISE EXCEPTION 'Há uma especialidade que não é desta organização.';
  END IF;

  UPDATE public.ops_utilizador_perfil
     SET zona_base = nullif(btrim(coalesce(p_zona, '')), ''), atualizado_em = now()
   WHERE organization_id = p_org AND utilizador_id = p_utilizador;

  DELETE FROM public.ops_utilizador_skill us
   USING public.ops_skill k
   WHERE k.id = us.skill_id AND k.organization_id = p_org AND us.utilizador_id = p_utilizador
     AND NOT (us.skill_id = ANY (COALESCE(p_skills, '{}')));
  INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id)
  SELECT p_utilizador, s FROM unnest(COALESCE(p_skills, '{}')) s
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_pessoa_planeamento(uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_pessoa_planeamento(uuid, uuid, text, uuid[]) TO authenticated, service_role;


-- Morada da obra quando o orçamento não a tem escrita: a morada de obra do
-- orçamento (site_address_id) e, senão, a do cliente (a principal primeiro).
-- Só lê o CRM; dinâmico para instalar numa base sem estas tabelas.
CREATE OR REPLACE FUNCTION public.ops_obra_morada_do_crm(_cliente uuid, _orc uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v text;
  fmt CONSTANT text := $f$btrim(concat_ws(', ',
      nullif(btrim(concat_ws(' ', a.street, a.number)), ''),
      nullif(btrim(concat_ws(' ', nullif(a.floor, ''), nullif(a.unit, ''))), ''),
      nullif(btrim(concat_ws(' ', a.postal_code, a.city)), '')))$f$;
BEGIN
  IF to_regclass('public.anew_addresses') IS NULL THEN
    RETURN NULL;
  END IF;

  IF _orc IS NOT NULL AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'site_address_id') THEN
    EXECUTE 'SELECT ' || fmt || ' FROM public.quotes q JOIN public.anew_addresses a ON a.id = q.site_address_id
              WHERE q.id = $1' INTO v USING _orc;
  END IF;

  IF nullif(v, '') IS NULL AND _cliente IS NOT NULL
     AND to_regclass('public.anew_entity_addresses') IS NOT NULL THEN
    EXECUTE 'SELECT ' || fmt || '
               FROM public.anew_clients cl
               JOIN public.anew_entity_addresses ea ON ea.entity_id = cl.entity_id
               JOIN public.anew_addresses a ON a.id = ea.address_id
              WHERE cl.id = $1 AND (ea.valid_to IS NULL OR ea.valid_to > now())
              ORDER BY COALESCE(ea.is_primary, false) DESC, (ea.address_type = ''obra'') DESC NULLS LAST
              LIMIT 1' INTO v USING _cliente;
  END IF;

  RETURN nullif(v, '');
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_morada_do_crm(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- A morada que a obra vai ter, para o ecrã preencher o campo antes de criar:
-- a do orçamento (escrita ou site) ou a do cliente.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_morada_sugerida(
  p_org          uuid,
  p_cliente_id   uuid DEFAULT NULL,
  p_orcamento_id uuid DEFAULT NULL,
  p_contrato_id  uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem    record;
  v_cliente uuid := p_cliente_id;
  v_orc     uuid := p_orcamento_id;
  v_org     uuid;
  v_texto   text;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'], 'Só quem planeia abre obras.');

  IF p_contrato_id IS NOT NULL AND to_regclass('public.client_contracts') IS NOT NULL THEN
    EXECUTE 'SELECT organization_id, public.ops_contrato_orcamento(id), client_id FROM public.client_contracts
              WHERE id = $1 AND deleted_at IS NULL'
       INTO v_org, v_orc, v_cliente USING p_contrato_id;
    IF v_org IS DISTINCT FROM p_org THEN RETURN NULL; END IF;
  END IF;

  IF v_orc IS NOT NULL THEN
    SELECT q.organization_id, COALESCE(v_cliente, q.cliente_id), nullif(btrim(q.obra_endereco), '')
      INTO v_org, v_cliente, v_texto
      FROM public.quotes q WHERE q.id = v_orc AND q.deleted_at IS NULL;
    IF v_org IS DISTINCT FROM p_org THEN RETURN NULL; END IF;
  END IF;

  IF v_cliente IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.anew_clients WHERE id = v_cliente AND organization_id = p_org) THEN
    RETURN NULL;
  END IF;

  RETURN COALESCE(v_texto, public.ops_obra_morada_do_crm(v_cliente, v_orc));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_morada_sugerida(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_morada_sugerida(uuid, uuid, uuid, uuid) TO authenticated, service_role;


-- ============================================================
-- 7. Criar uma obra
-- ============================================================
-- Três portas: de um orçamento aceite, de um contrato assinado, ou em branco.
-- Em todas, a organização tem de bater certo com a fonte — um orçamento de
-- outra organização seria uma fuga de dados.

-- `_tarefas` (opcional): as tarefas dos serviços, já revistas pelo gestor no
-- passo "Serviços do contrato" (validadas antes, em ops_obra_validar_tarefas).
-- NULL = como sempre: cada linha vendida expande-se pelo modelo do serviço.
-- (DROP: a assinatura antiga, de 11 argumentos, ficava como sobrecarga.)
DROP FUNCTION IF EXISTS public.ops_obra_criar_impl(uuid, uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.ops_obra_criar_impl(
  _org          uuid,
  _autor        uuid,
  _titulo       text,
  _cliente_id   uuid,
  _modelo_id    uuid,
  _inicio       date,
  _orcamento_id uuid,
  _contrato_id  uuid,
  _morada       text,
  _gestor_id    uuid,
  _supervisor_id uuid,
  _tarefas      jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id     uuid;
  v_codigo text;
  v_inicio date := public.ops_obra_somar_dias_uteis(COALESCE(_inicio, current_date), 0);
  v_n      integer := 0;
  v_sup    uuid := _supervisor_id;
  v_ini    date;
  v_fim    date;
  v_fixas  uuid[] := '{}';
  f        record;
BEGIN
  v_codigo := public.ops_proximo_codigo_interno(_org, 'OB');

  INSERT INTO public.ops_obra (
    organization_id, codigo, cliente_id, orcamento_id, contrato_id, modelo_id,
    titulo, morada, data_inicio_prevista, gestor_id, supervisor_id, criada_por)
  VALUES (
    _org, v_codigo, _cliente_id, _orcamento_id, _contrato_id, _modelo_id,
    _titulo, nullif(btrim(coalesce(_morada,'')), ''), v_inicio,
    COALESCE(_gestor_id, _autor), NULL, _autor)
  RETURNING id INTO v_id;

  -- 1. O tipo de obra (modelo): as fases e as tarefas que existem sempre.
  IF _modelo_id IS NOT NULL THEN
    FOR f IN
      SELECT mf.id, mf.ordem, mf.nome FROM public.ops_obra_modelo_fase mf
       WHERE mf.modelo_id = _modelo_id ORDER BY mf.ordem
    LOOP
      WITH nova AS (
        INSERT INTO public.ops_obra_fase (organization_id, obra_id, ordem, nome)
        VALUES (_org, v_id, f.ordem, f.nome) RETURNING id
      )
      INSERT INTO public.ops_obra_tarefa (
        organization_id, obra_id, fase_id, modelo_tarefa_id, ordem, nome,
        procedimento, materiais, ferramentas, minutos_previstos)
      SELECT _org, v_id, nova.id, mt.id, mt.ordem, mt.nome,
             mt.procedimento, mt.materiais, mt.ferramentas, mt.minutos_previstos
        FROM nova, public.ops_obra_modelo_tarefa mt
       WHERE mt.modelo_fase_id = f.id;
    END LOOP;
  END IF;

  -- As quatro fases por defeito, se o tipo não as trouxe. 3 e 4 a confirmar.
  INSERT INTO public.ops_obra_fase (organization_id, obra_id, ordem, nome)
  SELECT _org, v_id, x.o, x.n
    FROM (VALUES (1, 'Preparação e demolições'), (2, 'Instalações técnicas'),
                 (3, 'Acabamentos'), (4, 'Limpeza e entrega')) x(o, n)
   WHERE NOT EXISTS (SELECT 1 FROM public.ops_obra_fase WHERE obra_id = v_id AND ordem = x.o);

  -- 2. O que foi vendido: cada serviço do orçamento/contrato, pelo seu modelo
  --    (ou pela ficha técnica). Ficam depois das tarefas do tipo, na fase.
  IF _tarefas IS NULL THEN
    INSERT INTO public.ops_obra_tarefa (
      organization_id, obra_id, fase_id, ordem, nome, procedimento, materiais, ferramentas,
      minutos_previstos, pessoas_previstas, skill_id, orcamento_linha_id, servico_id, servico_tarefa_id)
    SELECT _org, v_id, fa.id, 1000 + t.ordem, t.nome, t.procedimento, t.materiais, t.ferramentas,
           t.minutos, t.pessoas, t.skill_id, t.orcamento_linha_id, t.servico_id, t.servico_tarefa_id
      FROM public.ops_obra_tarefas_do_orcamento(_orcamento_id) t
      JOIN public.ops_obra_fase fa ON fa.obra_id = v_id AND fa.ordem = t.fase;

    -- Dependências dentro de cada serviço (ex.: fechar roços depois do ensaio).
    UPDATE public.ops_obra_tarefa t
       SET depende_de = d.id
      FROM public.ops_obra_servico_tarefa st,
           public.ops_obra_tarefa d,
           public.ops_obra_servico_tarefa sd
     WHERE t.obra_id = v_id
       AND st.id = t.servico_tarefa_id AND st.depende_ordem IS NOT NULL
       AND d.obra_id = v_id AND d.orcamento_linha_id = t.orcamento_linha_id
       AND sd.id = d.servico_tarefa_id AND sd.servico_id = st.servico_id AND sd.ordem = st.depende_ordem;
  ELSE
    -- As tarefas do passo "Serviços do contrato", exatamente como vieram.
    -- Fases 5..9 que o tipo não trouxe nascem com um nome genérico.
    INSERT INTO public.ops_obra_fase (organization_id, obra_id, ordem, nome)
    SELECT DISTINCT _org, v_id, (e->>'fase')::smallint, 'Fase ' || (e->>'fase')
      FROM jsonb_array_elements(_tarefas) e
     WHERE NOT EXISTS (SELECT 1 FROM public.ops_obra_fase
                        WHERE obra_id = v_id AND ordem = (e->>'fase')::smallint);

    -- Especialidade pelo nome (a sugestão da biblioteca ainda não gravada).
    INSERT INTO public.ops_skill (organization_id, nome)
    SELECT DISTINCT _org, btrim(e->>'skill_nome')
      FROM jsonb_array_elements(_tarefas) e
     WHERE nullif(e->>'skill_id', '') IS NULL AND nullif(btrim(e->>'skill_nome'), '') IS NOT NULL
    ON CONFLICT (organization_id, nome) DO NOTHING;

    INSERT INTO public.ops_obra_tarefa (
      organization_id, obra_id, fase_id, ordem, nome, procedimento, materiais, ferramentas,
      minutos_previstos, pessoas_previstas, skill_id, orcamento_linha_id, servico_id,
      servico_tarefa_id, materiais_crm)
    SELECT _org, v_id, fa.id, 1000 + x.pos::integer, btrim(x.e->>'nome'),
           nullif(btrim(x.e->>'procedimento'), ''), nullif(btrim(x.e->>'materiais'), ''),
           nullif(btrim(x.e->>'ferramentas'), ''),
           (x.e->>'minutos')::integer,
           LEAST(20, GREATEST(COALESCE((x.e->>'pessoas_previstas')::integer, 1),
                              COALESCE(jsonb_array_length(x.e->'pessoas'), 0), 1))::smallint,
           COALESCE(nullif(x.e->>'skill_id', '')::uuid,
                    (SELECT k.id FROM public.ops_skill k
                      WHERE k.organization_id = _org AND k.nome = btrim(x.e->>'skill_nome'))),
           nullif(x.e->>'orcamento_linha_id', '')::uuid,
           nullif(x.e->>'servico_id', '')::uuid,
           nullif(x.e->>'servico_tarefa_id', '')::uuid,
           COALESCE((SELECT jsonb_agg(jsonb_build_object(
                       'produto_id', nullif(m->>'produto_id', '')::uuid,
                       'nome', left(btrim(m->>'nome'), 200),
                       'quantidade', (m->>'quantidade')::numeric,
                       'unidade', nullif(left(btrim(COALESCE(m->>'unidade', '')), 20), ''),
                       -- O disponível no momento (stock − reservas), se o ecrã o mandar: retrato, não reserva.
                       'disponivel', (m->>'disponivel')::numeric,
                       'origem', CASE WHEN m->>'origem' IN ('contrato','stock') THEN m->>'origem' ELSE 'ficha' END))
                       FROM jsonb_array_elements(COALESCE(x.e->'materiais_crm', '[]'::jsonb)) m), '[]'::jsonb)
      FROM jsonb_array_elements(_tarefas) WITH ORDINALITY AS x(e, pos)
      JOIN public.ops_obra_fase fa ON fa.obra_id = v_id AND fa.ordem = (x.e->>'fase')::smallint;

    -- "Depois de": as posições (1..n) de outras tarefas da lista — uma ou
    -- várias (número ou lista de números).
    INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
    SELECT DISTINCT t.id, d.id, _org, v_id
      FROM jsonb_array_elements(_tarefas) WITH ORDINALITY AS x(e, pos)
      JOIN public.ops_obra_tarefa t ON t.obra_id = v_id AND t.ordem = 1000 + x.pos::integer
     CROSS JOIN LATERAL jsonb_array_elements_text(
             CASE jsonb_typeof(x.e->'depende')
               WHEN 'array'  THEN x.e->'depende'
               WHEN 'number' THEN jsonb_build_array(x.e->'depende')
               WHEN 'string' THEN jsonb_build_array(x.e->'depende')
               ELSE '[]'::jsonb END) dp(v)
      JOIN public.ops_obra_tarefa d ON d.obra_id = v_id AND d.ordem = 1000 + dp.v::integer
    ON CONFLICT DO NOTHING;

    -- As pessoas escolhidas ficam; as tarefas sem ninguém distribuem-se.
    INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
    SELECT DISTINCT t.id, u.v::uuid, _org, v_id
      FROM jsonb_array_elements(_tarefas) WITH ORDINALITY AS x(e, pos)
      JOIN public.ops_obra_tarefa t ON t.obra_id = v_id AND t.ordem = 1000 + x.pos::integer
     CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(x.e->'pessoas', '[]'::jsonb)) u(v)
    ON CONFLICT (tarefa_id, utilizador_id) DO NOTHING;

    SELECT COALESCE(array_agg(DISTINCT tp.tarefa_id), '{}') INTO v_fixas
      FROM public.ops_obra_tarefa_pessoa tp WHERE tp.obra_id = v_id;
  END IF;

  -- Dependências por defeito, tarefa a tarefa (ver a regra na função). Com
  -- `_tarefas`, as dos serviços são as que o gestor escolheu; só se juntam
  -- as do tipo de obra.
  PERFORM public.ops_obra_dependencias_defeito_impl(v_id, _tarefas IS NULL);

  -- 3. Datas (em paralelo dentro da fase) e equipa. Sem data indicada, a
  --    primeira em que a equipa está livre (a partir de amanhã). As tarefas
  --    com pessoas escolhidas à mão mantêm-nas.
  IF _inicio IS NULL THEN
    v_inicio := public.ops_obra_planear_auto_impl(v_id, current_date + 1, v_fixas);
  ELSE
    PERFORM public.ops_obra_replanear_impl(v_id, v_inicio);
  END IF;
  SELECT count(*) INTO v_n FROM public.ops_obra_tarefa WHERE obra_id = v_id;

  SELECT min(inicio_planeado), max(fim_planeado) INTO v_ini, v_fim
    FROM public.ops_obra_tarefa WHERE obra_id = v_id;

  -- Supervisor: o escolhido; senão o supervisor (depois o gestor) com menos
  -- obras nesses dias, e depois com menos obras abertas.
  IF v_sup IS NULL THEN
    SELECT p.utilizador_id INTO v_sup
      FROM public.ops_utilizador_perfil p
     WHERE p.organization_id = _org AND p.ativo AND p.funcao IN ('supervisor','gestor')
     ORDER BY (p.funcao = 'supervisor') DESC,
              (SELECT count(*) FROM public.ops_obra o
                WHERE o.supervisor_id = p.utilizador_id AND o.id <> v_id
                  AND o.estado IN ('planeada','em_curso')
                  AND v_ini IS NOT NULL
                  AND EXISTS (SELECT 1 FROM public.ops_obra_tarefa t2
                               WHERE t2.obra_id = o.id AND t2.inicio_planeado IS NOT NULL
                                 AND daterange(t2.inicio_planeado, COALESCE(t2.fim_planeado, t2.inicio_planeado), '[]')
                                  && daterange(v_ini, COALESCE(v_fim, v_ini), '[]'))),
              (SELECT count(*) FROM public.ops_obra o
                WHERE o.supervisor_id = p.utilizador_id AND o.estado IN ('planeada','em_curso','suspensa')),
              p.utilizador_id
     LIMIT 1;
  END IF;
  UPDATE public.ops_obra SET supervisor_id = v_sup WHERE id = v_id;

  PERFORM public.ops_obra_distribuir_impl(v_id);

  PERFORM public.ops_obra_evento(_org, v_id, 'criada', _titulo, _autor,
    jsonb_build_object('codigo', v_codigo, 'orcamento_id', _orcamento_id,
                       'contrato_id', _contrato_id, 'modelo_id', _modelo_id, 'tarefas', v_n,
                       'revistas', _tarefas IS NOT NULL));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo, 'tarefas', v_n,
                            'inicio', v_inicio);
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_criar_impl(uuid, uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- Valida as tarefas do passo "Serviços do contrato" ANTES de criar seja o que
-- for. Formato de cada elemento (pela ordem; "depende" é a posição 1..n de
-- outra tarefa da lista):
--   { nome, fase 1..9, minutos > 0, pessoas_previstas 1..20, pessoas [uuid],
--     skill_id | skill_nome, orcamento_linha_id, servico_id, servico_tarefa_id,
--     depende, procedimento, materiais, ferramentas,
--     materiais_crm [{produto_id, nome, quantidade, origem}] }
CREATE OR REPLACE FUNCTION public.ops_obra_validar_tarefas(_org uuid, _orc uuid, _tarefas jsonb)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n    integer;
  e      jsonb;
  i      integer := 0;
  v_nome text;
  v_num  numeric;
  v_dep  integer;
  v_u    text;
  v_lin  uuid;
  v_ok   boolean;
BEGIN
  IF jsonb_typeof(_tarefas) <> 'array' THEN
    RAISE EXCEPTION 'As tarefas têm de vir numa lista.';
  END IF;
  v_n := jsonb_array_length(_tarefas);
  IF v_n > 500 THEN
    RAISE EXCEPTION 'Demasiadas tarefas (%). O máximo é 500.', v_n;
  END IF;

  FOR e IN SELECT x FROM jsonb_array_elements(_tarefas) x LOOP
    i := i + 1;
    IF jsonb_typeof(e) <> 'object' THEN
      RAISE EXCEPTION 'A tarefa n.º % não é válida.', i;
    END IF;
    v_nome := nullif(btrim(e->>'nome'), '');
    IF v_nome IS NULL THEN
      RAISE EXCEPTION 'A tarefa n.º % não tem nome.', i;
    END IF;
    IF length(v_nome) > 300 OR length(COALESCE(e->>'procedimento', '')) > 4000
       OR length(COALESCE(e->>'materiais', '')) > 4000 OR length(COALESCE(e->>'ferramentas', '')) > 4000 THEN
      RAISE EXCEPTION '"%": texto demasiado comprido.', left(v_nome, 60);
    END IF;

    -- Números: a mensagem certa em vez de um erro de conversão.
    IF (CASE WHEN COALESCE(e->>'fase', '') ~ '^\d{1,2}$' THEN (e->>'fase')::integer END)
       NOT BETWEEN 1 AND 9 IS NOT FALSE THEN
      RAISE EXCEPTION '"%": a fase tem de ser de 1 a 9.', v_nome;
    END IF;
    IF (CASE WHEN COALESCE(e->>'minutos', '') ~ '^\d{1,6}$' THEN (e->>'minutos')::integer END)
       > 0 IS NOT TRUE THEN
      RAISE EXCEPTION '"%": os minutos previstos têm de ser um número inteiro maior que 0.', v_nome;
    END IF;
    IF nullif(e->>'pessoas_previstas', '') IS NOT NULL
       AND (CASE WHEN e->>'pessoas_previstas' ~ '^\d{1,2}$' THEN (e->>'pessoas_previstas')::integer END)
           BETWEEN 1 AND 20 IS NOT TRUE THEN
      RAISE EXCEPTION '"%": de 1 a 20 pessoas.', v_nome;
    END IF;
    -- "Depois de": posição(ões) 1..n de OUTRAS tarefas da lista.
    IF jsonb_typeof(e->'depende') NOT IN ('array', 'number', 'string', 'null') THEN
      RAISE EXCEPTION '"%": "depois de" inválido.', v_nome;
    END IF;
    FOR v_u IN SELECT jsonb_array_elements_text(
                 CASE jsonb_typeof(e->'depende') WHEN 'array' THEN e->'depende'
                      WHEN 'number' THEN jsonb_build_array(e->'depende')
                      WHEN 'string' THEN jsonb_build_array(e->'depende')
                      ELSE '[]'::jsonb END) LOOP
      IF v_u !~ '^\d{1,4}$' THEN
        RAISE EXCEPTION '"%": "depois de" inválido.', v_nome;
      END IF;
      v_dep := v_u::integer;
      IF v_dep = i OR v_dep < 1 OR v_dep > v_n THEN
        RAISE EXCEPTION '"%": só pode depender de outra tarefa da lista.', v_nome;
      END IF;
    END LOOP;

    -- Pessoas: perfil ATIVO em Operações nesta organização.
    IF e ? 'pessoas' AND jsonb_typeof(e->'pessoas') NOT IN ('array', 'null') THEN
      RAISE EXCEPTION '"%": as pessoas têm de vir numa lista.', v_nome;
    END IF;
    IF jsonb_typeof(e->'pessoas') = 'array' THEN
      IF jsonb_array_length(e->'pessoas') > 20 THEN
        RAISE EXCEPTION '"%": no máximo 20 pessoas.', v_nome;
      END IF;
      FOR v_u IN SELECT jsonb_array_elements_text(e->'pessoas') LOOP
        IF NOT EXISTS (SELECT 1 FROM public.ops_utilizador_perfil p
                        WHERE p.organization_id = _org AND p.utilizador_id::text = lower(v_u) AND p.ativo) THEN
          RAISE EXCEPTION '"%": há uma pessoa que não está ativa em Operações nesta organização.', v_nome
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END LOOP;
    END IF;

    IF nullif(e->>'skill_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.ops_skill k
          WHERE k.id::text = e->>'skill_id' AND k.organization_id = _org) THEN
      RAISE EXCEPTION '"%": essa especialidade não é desta organização.', v_nome;
    END IF;
    IF length(COALESCE(e->>'skill_nome', '')) > 80 THEN
      RAISE EXCEPTION '"%": nome de especialidade demasiado comprido.', v_nome;
    END IF;

    -- Linha do orçamento: tem de ser DESTE orçamento (só lê o CRM).
    IF nullif(e->>'orcamento_linha_id', '') IS NOT NULL THEN
      IF _orc IS NULL OR e->>'orcamento_linha_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION '"%": essa linha não é do orçamento desta obra.', v_nome;
      END IF;
      v_lin := (e->>'orcamento_linha_id')::uuid;
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.quote_lines WHERE id = $1 AND quote_id = $2)'
         INTO v_ok USING v_lin, _orc;
      IF NOT v_ok THEN
        RAISE EXCEPTION '"%": essa linha não é do orçamento desta obra.', v_nome;
      END IF;
    END IF;
    IF nullif(e->>'servico_id', '') IS NOT NULL THEN
      IF e->>'servico_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION '"%": esse serviço não é desta organização.', v_nome;
      END IF;
      IF NOT public.ops_obra_servico_da_org(_org, (e->>'servico_id')::uuid) THEN
        RAISE EXCEPTION '"%": esse serviço não é desta organização.', v_nome;
      END IF;
    END IF;
    IF nullif(e->>'servico_tarefa_id', '') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.ops_obra_servico_tarefa st
          WHERE st.id::text = e->>'servico_tarefa_id' AND st.organization_id = _org) THEN
      RAISE EXCEPTION '"%": esse passo de modelo não é desta organização.', v_nome;
    END IF;

    -- Materiais do CRM: só a forma (é uma cópia, sem FK).
    IF e ? 'materiais_crm' AND jsonb_typeof(e->'materiais_crm') NOT IN ('array', 'null') THEN
      RAISE EXCEPTION '"%": os materiais ligados têm de vir numa lista.', v_nome;
    END IF;
    IF jsonb_typeof(e->'materiais_crm') = 'array' THEN
      IF jsonb_array_length(e->'materiais_crm') > 100 THEN
        RAISE EXCEPTION '"%": demasiados materiais ligados.', v_nome;
      END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(e->'materiais_crm') m
                  WHERE jsonb_typeof(m) <> 'object'
                     OR nullif(btrim(m->>'nome'), '') IS NULL
                     OR (nullif(m->>'produto_id', '') IS NOT NULL
                         AND m->>'produto_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
                     OR (nullif(m->>'quantidade', '') IS NOT NULL
                         AND m->>'quantidade' !~ '^\d{1,9}(\.\d{1,4})?$')
                     OR (nullif(m->>'disponivel', '') IS NOT NULL
                         AND m->>'disponivel' !~ '^-?\d{1,9}(\.\d{1,4})?$')) THEN
        RAISE EXCEPTION '"%": há um material ligado inválido.', v_nome;
      END IF;
    END IF;
  END LOOP;

  -- Sem ciclos nas dependências da lista.
  SELECT x.e->>'nome' INTO v_nome
    FROM (
      WITH RECURSIVE arestas(a, b) AS (
        SELECT x.pos::integer, dp.v::integer
          FROM jsonb_array_elements(_tarefas) WITH ORDINALITY AS x(e, pos)
         CROSS JOIN LATERAL jsonb_array_elements_text(
                 CASE jsonb_typeof(x.e->'depende') WHEN 'array' THEN x.e->'depende'
                      WHEN 'number' THEN jsonb_build_array(x.e->'depende')
                      WHEN 'string' THEN jsonb_build_array(x.e->'depende')
                      ELSE '[]'::jsonb END) dp(v)
      ),
      r(ini, cur) AS (
        SELECT a, b FROM arestas
        UNION
        SELECT r.ini, ar.b FROM r JOIN arestas ar ON ar.a = r.cur
      )
      SELECT min(ini) AS pos FROM r WHERE r.ini = r.cur
    ) c
    JOIN jsonb_array_elements(_tarefas) WITH ORDINALITY AS x(e, pos) ON x.pos = c.pos;
  IF v_nome IS NOT NULL THEN
    RAISE EXCEPTION '"%": as dependências fecham um ciclo (nenhuma tarefa do ciclo poderia começar).', v_nome;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_validar_tarefas(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- `p_tarefas` (novo, opcional): as tarefas dos serviços revistas no passo
-- "Serviços do contrato" (formato em ops_obra_validar_tarefas). NULL = o
-- comportamento de sempre. A obra nasce com EXATAMENTE essas tarefas e
-- pessoas; as datas continuam automáticas (em paralelo dentro da fase).
-- (DROP: a assinatura antiga, de 10 argumentos, ficava como sobrecarga e o
-- PostgREST não saberia qual chamar.)
DROP FUNCTION IF EXISTS public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid);
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_criar(
  p_org           uuid,
  p_titulo        text    DEFAULT NULL,
  p_cliente_id    uuid    DEFAULT NULL,
  p_modelo_id     uuid    DEFAULT NULL,
  p_data_inicio   date    DEFAULT NULL,
  p_orcamento_id  uuid    DEFAULT NULL,
  p_contrato_id   uuid    DEFAULT NULL,
  p_morada        text    DEFAULT NULL,
  p_gestor_id     uuid    DEFAULT NULL,
  p_supervisor_id uuid    DEFAULT NULL,
  p_tarefas       jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem     record;
  v_titulo   text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_cliente  uuid := p_cliente_id;
  v_orc      uuid := p_orcamento_id;
  v_morada   text := p_morada;
  v_q        record;
  v_c        record;
  v_existe   text;
  v_ctr_num  text;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'],
    'Só quem planeia abre obras.');

  -- Do contrato assinado.
  IF p_contrato_id IS NOT NULL THEN
    SELECT c.id, c.organization_id, c.client_id, c.contract_number, c.status,
           public.ops_contrato_orcamento(c.id) AS quote_id, c.notes
      INTO v_c
      FROM public.client_contracts c
     WHERE c.id = p_contrato_id AND c.deleted_at IS NULL;
    IF NOT FOUND OR v_c.organization_id <> p_org THEN
      RAISE EXCEPTION 'Contrato não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_c.status NOT IN ('signed','assinado','active') THEN
      RAISE EXCEPTION 'Só um contrato assinado vira obra (este está "%").', v_c.status;
    END IF;
    SELECT codigo INTO v_existe FROM public.ops_obra
     WHERE contrato_id = p_contrato_id AND estado <> 'cancelada' LIMIT 1;
    IF v_existe IS NOT NULL THEN
      RAISE EXCEPTION 'Esse contrato já tem obra: %.', v_existe;
    END IF;
    IF v_orc IS NOT NULL AND v_c.quote_id IS DISTINCT FROM v_orc THEN
      RAISE EXCEPTION 'Esse contrato não é desse orçamento.';
    END IF;
    v_orc := COALESCE(v_orc, v_c.quote_id);
    v_cliente := COALESCE(v_cliente, v_c.client_id);
    v_ctr_num := COALESCE(v_c.contract_number, 's/ número');
    -- Com orçamento, o título vem dele (mais legível); senão, o número do contrato.
    IF v_orc IS NULL THEN
      v_titulo := COALESCE(v_titulo, 'Obra — contrato ' || v_ctr_num);
    END IF;
  END IF;

  -- Do orçamento aceite (ou do orçamento do contrato).
  IF v_orc IS NOT NULL THEN
    SELECT q.id, q.organization_id, q.cliente_id, q.quote_number, q.title,
           q.obra_endereco, q.estado
      INTO v_q
      FROM public.quotes q
     WHERE q.id = v_orc AND q.deleted_at IS NULL;
    IF NOT FOUND OR v_q.organization_id <> p_org THEN
      RAISE EXCEPTION 'Orçamento não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    -- Vindo de contrato assinado, o estado do orçamento já não interessa.
    IF p_contrato_id IS NULL AND v_q.estado NOT IN ('aceite','finalizado') THEN
      RAISE EXCEPTION 'Só um orçamento aceite vira obra (este está "%").', v_q.estado;
    END IF;
    SELECT codigo INTO v_existe FROM public.ops_obra
     WHERE orcamento_id = v_orc AND estado <> 'cancelada' LIMIT 1;
    IF v_existe IS NOT NULL THEN
      RAISE EXCEPTION 'Esse orçamento já tem obra: %.', v_existe;
    END IF;
    v_cliente := COALESCE(v_cliente, v_q.cliente_id);
    v_titulo  := COALESCE(v_titulo, nullif(btrim(v_q.title), ''),
                          CASE WHEN p_contrato_id IS NOT NULL
                               THEN 'Obra — contrato ' || v_ctr_num
                               ELSE 'Obra — orçamento ' || COALESCE(v_q.quote_number, '') END);
    v_morada  := COALESCE(nullif(btrim(coalesce(v_morada,'')), ''), v_q.obra_endereco);
  END IF;

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Uma obra precisa de um título.';
  END IF;

  -- Sem morada escrita: a do orçamento (site) ou a do cliente.
  IF nullif(btrim(coalesce(v_morada, '')), '') IS NULL THEN
    v_morada := public.ops_obra_morada_do_crm(v_cliente, v_orc);
  END IF;

  IF v_cliente IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.anew_clients WHERE id = v_cliente AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Esse cliente não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_modelo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_obra_modelo WHERE id = p_modelo_id AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Esse modelo não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_gestor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_gestor_id AND organization_id = p_org AND ativo) THEN
    RAISE EXCEPTION 'O gestor indicado não está ativo em Operações nesta organização.';
  END IF;
  IF p_supervisor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_supervisor_id AND organization_id = p_org AND ativo) THEN
    RAISE EXCEPTION 'O supervisor indicado não está ativo em Operações nesta organização.';
  END IF;

  IF p_tarefas IS NOT NULL THEN
    PERFORM public.ops_obra_validar_tarefas(p_org, v_orc, p_tarefas);
  END IF;

  -- Sem supervisor escolhido, ops_obra_criar_impl escolhe um livre nessas datas.
  RETURN public.ops_obra_criar_impl(
    p_org, v_quem.o_utilizador, v_titulo, v_cliente, p_modelo_id, p_data_inicio,
    v_orc, p_contrato_id, v_morada, p_gestor_id, p_supervisor_id, p_tarefas);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid, jsonb)
  TO authenticated, service_role;

-- O que `rpc_ops_obra_criar` SEM modelo vai gerar a partir do orçamento (ou
-- do orçamento do contrato) — para o ecrã mostrar antes de criar.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_previsao_orcamento(
  p_org          uuid,
  p_orcamento_id uuid DEFAULT NULL,
  p_contrato_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem record;
  v_orc  uuid := p_orcamento_id;
  v_org  uuid;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'],
    'Só quem planeia abre obras.');

  IF p_contrato_id IS NOT NULL THEN
    SELECT public.ops_contrato_orcamento(c.id), c.organization_id INTO v_orc, v_org
      FROM public.client_contracts c
     WHERE c.id = p_contrato_id AND c.deleted_at IS NULL;
    IF v_org IS DISTINCT FROM p_org THEN
      RAISE EXCEPTION 'Contrato não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  IF v_orc IS NULL THEN
    RETURN jsonb_build_object('tarefas', '[]'::jsonb, 'minutos', 0, 'sem_ficha', 0, 'orcamento_id', NULL);
  END IF;

  SELECT q.organization_id INTO v_org FROM public.quotes q WHERE q.id = v_orc AND q.deleted_at IS NULL;
  IF v_org IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'Orçamento não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'orcamento_id', v_orc,
      'tarefas', COALESCE(jsonb_agg(jsonb_build_object(
                   'fase', t.fase, 'nome', t.nome, 'minutos', t.minutos, 'pessoas', t.pessoas,
                   'sem_ficha', t.sem_ficha, 'materiais', t.materiais)
                   ORDER BY t.fase, t.ordem), '[]'::jsonb),
      'minutos', COALESCE(sum(t.minutos), 0),
      'sem_ficha', count(*) FILTER (WHERE t.sem_ficha))
      FROM public.ops_obra_tarefas_do_orcamento(v_orc) t);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_previsao_orcamento(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_previsao_orcamento(uuid, uuid, uuid) TO authenticated, service_role;

-- O passo 2 da Nova obra, "Serviços do contrato": para cada serviço vendido,
-- as tarefas que a obra vai ter, com tempo × quantidade, fase, especialidade,
-- datas e as PESSOAS sugeridas — e quem está livre nesses dias.
--
-- Como: cria a obra A SÉRIO, numa subtransação, e desfaz tudo no fim
-- (RAISE com o SQLSTATE próprio 'OPSPV', apanhado logo a seguir). Assim a
-- pré-visualização é, por construção, igual ao que "Abrir obra" vai fazer:
-- o mesmo plano em paralelo, a mesma distribuição (sem choque, especialidade,
-- zona, menos carga). Nada fica gravado — nem a obra, nem o código OB-…, nem
-- os modelos sugeridos.
--
-- Serviço sem modelo: a sugestão da biblioteca é gerada AUTOMATICAMENTE
-- dentro da subtransação (ops_obra_servico_sugerir_impl) e desfeita com o
-- resto; o gestor não tem de ir a Modelos. Como o passo do modelo deixa de
-- existir, essas tarefas vêm com `servico_tarefa_id` null; a especialidade
-- vem pelo nome (`skill_nome`) e é criada só ao abrir a obra.
--
-- `p_tarefas` (opcional, o formato de rpc_ops_obra_criar): "Recalcular" —
-- simula com as tarefas já editadas, para refazer datas e pessoas.
--
-- Materiais: os da ficha técnica do serviço (service_materials × qt) e os
-- produtos vendidos no contrato (linhas com product_id). Só lê o CRM.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_previsao_contrato(
  p_org          uuid,
  p_contrato_id  uuid  DEFAULT NULL,
  p_orcamento_id uuid  DEFAULT NULL,
  p_modelo_id    uuid  DEFAULT NULL,
  p_data_inicio  date  DEFAULT NULL,
  p_morada       text  DEFAULT NULL,
  p_tarefas      jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem     record;
  v_orc      uuid := p_orcamento_id;
  v_org      uuid;
  v_sim      jsonb;
  v_obra     uuid;
  v_inicio   date;
  v_tarefas  jsonb := '[]'::jsonb;
  v_sug      uuid[] := '{}';
  v_s        uuid;
  v_servicos jsonb := '[]'::jsonb;
  v_produtos jsonb := '[]'::jsonb;
  v_crm      boolean;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'],
    'Só quem planeia abre obras.');

  IF p_contrato_id IS NOT NULL THEN
    IF to_regclass('public.client_contracts') IS NULL THEN
      RAISE EXCEPTION 'Contrato não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    EXECUTE 'SELECT public.ops_contrato_orcamento(id), organization_id FROM public.client_contracts
              WHERE id = $1 AND deleted_at IS NULL'
       INTO v_orc, v_org USING p_contrato_id;
    IF v_org IS DISTINCT FROM p_org THEN
      RAISE EXCEPTION 'Contrato não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
    IF p_orcamento_id IS NOT NULL AND v_orc IS DISTINCT FROM p_orcamento_id THEN
      RAISE EXCEPTION 'Esse contrato não é desse orçamento.';
    END IF;
  END IF;

  IF v_orc IS NULL THEN
    RETURN jsonb_build_object('orcamento_id', NULL, 'inicio', NULL, 'minutos', 0,
                              'servicos', '[]'::jsonb, 'produtos', '[]'::jsonb, 'outras', '[]'::jsonb);
  END IF;

  SELECT q.organization_id INTO v_org FROM public.quotes q WHERE q.id = v_orc AND q.deleted_at IS NULL;
  IF v_org IS DISTINCT FROM p_org THEN
    RAISE EXCEPTION 'Orçamento não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
  END IF;

  v_crm := to_regclass('public.services') IS NOT NULL
       AND to_regclass('public.service_categories') IS NOT NULL
       AND to_regclass('public.service_materials') IS NOT NULL
       AND to_regclass('public.products') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'quote_lines'
                      AND column_name = 'service_id');

  -- ── A simulação: criar e desfazer ─────────────────────────────────────
  BEGIN
    IF p_tarefas IS NULL AND v_crm THEN
      FOR v_s IN EXECUTE
        'SELECT DISTINCT l.service_id FROM public.quote_lines l
          WHERE l.quote_id = $1 AND l.service_id IS NOT NULL' USING v_orc
      LOOP
        IF NOT EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa x
                        WHERE x.organization_id = p_org AND x.servico_id = v_s)
           AND public.ops_obra_servico_da_org(p_org, v_s) THEN
          PERFORM public.ops_obra_servico_sugerir_impl(p_org, v_s, v_quem.o_utilizador);
          v_sug := v_sug || v_s;
        END IF;
      END LOOP;
    END IF;

    v_sim := public.rpc_ops_obra_criar(
      p_org          => p_org,
      p_modelo_id    => p_modelo_id,
      p_data_inicio  => p_data_inicio,
      p_orcamento_id => CASE WHEN p_contrato_id IS NULL THEN v_orc END,
      p_contrato_id  => p_contrato_id,
      p_morada       => p_morada,
      p_tarefas      => p_tarefas);
    v_obra := (v_sim->>'id')::uuid;
    v_inicio := (v_sim->>'inicio')::date;

    -- `id` só vale dentro desta resposta (a obra é desfeita): serve de chave
    -- para `depende` (as tarefas de que esta depende, da mesma resposta).
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', t.id,
             'ordem', t.ordem,
             'linha_id', t.orcamento_linha_id,
             'servico_id', t.servico_id,
             'servico_tarefa_id', t.servico_tarefa_id,
             'do_tipo', t.modelo_tarefa_id IS NOT NULL,
             'nome', t.nome,
             'fase', f.ordem,
             'minutos', t.minutos_previstos,
             'pessoas_previstas', t.pessoas_previstas,
             'skill_id', t.skill_id,
             'skill_nome', k.nome,
             'depende', COALESCE((SELECT jsonb_agg(x.depende_de_id ORDER BY x.depende_de_id)
                                    FROM public.ops_obra_tarefa_dependencia x WHERE x.tarefa_id = t.id), '[]'::jsonb),
             'procedimento', t.procedimento,
             'materiais', t.materiais,
             'ferramentas', t.ferramentas,
             'materiais_crm', t.materiais_crm,
             'inicio', t.inicio_planeado,
             'fim', t.fim_planeado,
             'pessoas', COALESCE((SELECT jsonb_agg(tp.utilizador_id ORDER BY tp.atribuida_em, tp.utilizador_id)
                                    FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id), '[]'::jsonb))
             ORDER BY f.ordem, t.ordem), '[]'::jsonb)
      INTO v_tarefas
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra_fase f ON f.id = t.fase_id
      LEFT JOIN public.ops_skill k ON k.id = t.skill_id
     WHERE t.obra_id = v_obra;

    RAISE EXCEPTION 'pré-visualização: desfazer' USING ERRCODE = 'OPSPV';
  EXCEPTION WHEN SQLSTATE 'OPSPV' THEN
    NULL;  -- tudo desfeito; as variáveis ficam.
  END;

  -- O que só existia na simulação (especialidades e passos de modelo
  -- sugeridos) volta a null; e quem está livre nos dias de cada tarefa.
  SELECT COALESCE(jsonb_agg(
           a.x || jsonb_build_object(
             'skill_id', CASE WHEN EXISTS (SELECT 1 FROM public.ops_skill k WHERE k.id::text = a.x->>'skill_id')
                              THEN a.x->'skill_id' END,
             'servico_tarefa_id', CASE WHEN EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa st
                                                     WHERE st.id::text = a.x->>'servico_tarefa_id')
                                       THEN a.x->'servico_tarefa_id' END,
             'livres', COALESCE(lv.livres, '[]'::jsonb),
             -- Quem não está, e porquê ("indisponível: férias").
             'ocupados', COALESCE(lv.ocupados, '[]'::jsonb))
           ORDER BY a.pos), '[]'::jsonb)
    INTO v_tarefas
    FROM jsonb_array_elements(v_tarefas) WITH ORDINALITY AS a(x, pos)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(l.utilizador_id ORDER BY l.minutos_ocupados, l.nome) FILTER (WHERE l.livre) AS livres,
             jsonb_agg(jsonb_build_object('utilizador_id', l.utilizador_id, 'motivo', l.motivo)
                       ORDER BY l.nome) FILTER (WHERE NOT l.livre) AS ocupados
        FROM public.ops_obra_pessoas_livres_impl(p_org, (a.x->>'inicio')::date, (a.x->>'fim')::date, NULL) l
    ) lv ON true;

  IF v_crm THEN
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'linha_id', l.id,
               'servico_id', l.service_id,
               'nome', COALESCE(nullif(btrim(s.name), ''), nullif(btrim(l.descricao_snapshot), ''), 'Serviço'),
               'descricao', nullif(btrim(l.descricao_snapshot), ''),
               'categoria', c.name,
               'quantidade', COALESCE(l.qt, 1),
               'unidade', to_jsonb(l)->>'unidade',
               'sugerido', l.service_id = ANY ($3),
               'com_modelo', EXISTS (SELECT 1 FROM public.ops_obra_servico_tarefa x
                                      WHERE x.organization_id = $2 AND x.servico_id = l.service_id),
               'sem_ficha', COALESCE(s.technical_sheet_labor_hours, 0) <= 0,
               'materiais_ficha', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'produto_id', p.id, 'nome', p.name, 'origem', 'ficha',
                           'quantidade', trim_scale(round((sm.quantity * COALESCE(l.qt, 1))::numeric, 2)))
                           ORDER BY sm.sort_order NULLS LAST, p.name)
                    FROM public.service_materials sm JOIN public.products p ON p.id = sm.product_id
                   WHERE sm.service_id = l.service_id AND sm.deleted_at IS NULL), '[]'::jsonb),
               'tarefas', COALESCE((
                  SELECT jsonb_agg(x ORDER BY (x->>'ordem')::integer)
                    FROM jsonb_array_elements($4) x WHERE x->>'linha_id' = l.id::text), '[]'::jsonb))
               ORDER BY l.ordem NULLS LAST, l.id), '[]'::jsonb)
        FROM public.quote_lines l
        JOIN public.services s ON s.id = l.service_id
        LEFT JOIN public.service_categories c ON c.id = s.service_category_id
       WHERE l.quote_id = $1
    $q$ INTO v_servicos USING v_orc, p_org, v_sug, v_tarefas;

    -- Produtos vendidos no contrato (louças, equipamentos): para ligar às
    -- tarefas. Sem coluna product_id, não há.
    EXECUTE $q$
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'linha_id', l.id,
               'produto_id', to_jsonb(l)->>'product_id',
               'nome', COALESCE((SELECT nullif(btrim(p.name), '') FROM public.products p
                                  WHERE p.id::text = to_jsonb(l)->>'product_id'),
                                nullif(btrim(l.descricao_snapshot), ''),
                                nullif(btrim(to_jsonb(l)->>'item_description'), ''), 'Produto'),
               'quantidade', COALESCE(l.qt, 1),
               'unidade', to_jsonb(l)->>'unidade',
               'origem', 'contrato') ORDER BY l.ordem NULLS LAST, l.id), '[]'::jsonb)
        FROM public.quote_lines l
       WHERE l.quote_id = $1 AND l.service_id IS NULL
         AND nullif(to_jsonb(l)->>'product_id', '') IS NOT NULL
    $q$ INTO v_produtos USING v_orc;
  END IF;

  RETURN jsonb_build_object(
    'orcamento_id', v_orc,
    'inicio', v_inicio,
    'servicos', v_servicos,
    'produtos', v_produtos,
    'outras', COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(v_tarefas) x
                         WHERE x->>'linha_id' IS NULL), '[]'::jsonb),
    'minutos', COALESCE((SELECT sum((x->>'minutos')::integer) FROM jsonb_array_elements(v_tarefas) x
                          WHERE x->>'linha_id' IS NOT NULL), 0));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_previsao_contrato(uuid, uuid, uuid, uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_previsao_contrato(uuid, uuid, uuid, uuid, date, text, jsonb)
  TO authenticated, service_role;

-- Stock dos produtos, para ligar materiais às tarefas no passo "Serviços do
-- contrato". SÓ LÊ o inventário do CRM — não reserva nem escreve nada:
--   stock      = Σ stocks.quantity da organização, em armazéns ativos (linhas
--                não apagadas), na unidade base do produto;
--   reservado  = Σ qty_reserved de fn_client_order_line_reservations (as
--                reservas FIFO das encomendas de cliente de contratos
--                assinados), se essa função existir;
--   disponivel = stock − reservado.
-- Dois modos: `p_produto_ids` (os materiais da ficha e os produtos do
-- contrato) ou `p_pesquisa` (o seletor: nome/SKU, até `p_limite`). Só
-- produtos desta organização, ou usados nas fichas/orçamentos dela. Nunca
-- devolve custos. Base sem inventário → stock null (`com_inventario` false).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_stock(
  p_org         uuid,
  p_produto_ids uuid[]  DEFAULT NULL,
  p_pesquisa    text    DEFAULT NULL,
  p_limite      integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem  record;
  v_ids   uuid[];
  v_inv   boolean;
  v_res   boolean;
  v_txt   text := nullif(btrim(COALESCE(p_pesquisa, '')), '');
  v_out   jsonb;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(p_org) q;
  IF v_quem.funcao IS DISTINCT FROM 'admin' AND v_quem.funcao IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'Só quem planeia vê o stock para a obra.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.ops_pode(p_org, 'operations.orders.edit') OR public.ops_pode(p_org, 'operations.orders.create')) THEN
    RAISE EXCEPTION 'Sem permissão (operations.orders.edit) nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF to_regclass('public.products') IS NULL THEN
    RETURN jsonb_build_object('com_inventario', false, 'produtos', '[]'::jsonb);
  END IF;
  IF COALESCE(array_length(p_produto_ids, 1), 0) > 500 THEN
    RAISE EXCEPTION 'Demasiados produtos de uma vez.';
  END IF;

  -- Que produtos (desta organização, ou das fichas/orçamentos dela).
  IF v_txt IS NOT NULL THEN
    EXECUTE $q$
      SELECT COALESCE(array_agg(p.id), '{}') FROM (
        SELECT p.id FROM public.products p
         WHERE (to_jsonb(p)->>'organization_id') = $1::text
           AND COALESCE((to_jsonb(p)->>'is_deleted')::boolean, false) = false
           AND (to_jsonb(p)->>'deleted_at') IS NULL
           AND (p.name ILIKE '%' || $2 || '%' OR COALESCE(to_jsonb(p)->>'sku', '') ILIKE '%' || $2 || '%')
         ORDER BY (lower(p.name) LIKE lower($2) || '%') DESC, p.name
         LIMIT $3) p
    $q$ INTO v_ids USING p_org, v_txt, LEAST(GREATEST(COALESCE(p_limite, 30), 1), 100);
  ELSE
    EXECUTE format($q$
      SELECT COALESCE(array_agg(p.id), '{}') FROM public.products p
       WHERE p.id = ANY ($2)
         AND ((to_jsonb(p)->>'organization_id') = $1::text
              %s
              OR EXISTS (SELECT 1 FROM public.quote_lines l JOIN public.quotes q ON q.id = l.quote_id
                          WHERE q.organization_id = $1 AND (to_jsonb(l)->>'product_id') = p.id::text))
    $q$,
      CASE WHEN to_regclass('public.service_materials') IS NOT NULL THEN
        'OR EXISTS (SELECT 1 FROM public.service_materials sm
                     WHERE sm.product_id = p.id AND sm.deleted_at IS NULL
                       AND ((to_jsonb(sm)->>''organization_id'') = $1::text
                            OR public.ops_obra_servico_da_org($1, sm.service_id)))'
      ELSE '' END)
    INTO v_ids USING p_org, COALESCE(p_produto_ids, '{}'::uuid[]);
  END IF;

  v_inv := to_regclass('public.stocks') IS NOT NULL AND to_regclass('public.warehouses') IS NOT NULL;
  v_res := to_regprocedure('public.fn_client_order_line_reservations(uuid,uuid[])') IS NOT NULL;

  EXECUTE format($q$
    WITH st AS (
      %2$s
    ), rs AS (
      %3$s
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'produto_id', p.id,
             'nome', p.name,
             'sku', to_jsonb(p)->>'sku',
             'unidade', %1$s,
             'gere_stock', (to_jsonb(p)->>'manages_stock')::boolean,
             'stock', st.qtd,
             'reservado', COALESCE(rs.qtd, 0),
             'disponivel', CASE WHEN $3 THEN COALESCE(st.qtd, 0) - COALESCE(rs.qtd, 0) END)
             ORDER BY (COALESCE(st.qtd, 0) - COALESCE(rs.qtd, 0)) > 0 DESC, p.name), '[]'::jsonb)
      FROM public.products p
      LEFT JOIN st ON st.product_id = p.id
      LEFT JOIN rs ON rs.product_id = p.id
     WHERE p.id = ANY ($2)
  $q$,
    CASE WHEN to_regclass('public.uom') IS NOT NULL
         THEN '(SELECT u.code FROM public.uom u WHERE u.id::text = to_jsonb(p)->>''uom_id'')'
         ELSE 'NULL::text' END,
    CASE WHEN v_inv THEN
      'SELECT s.product_id, sum(s.quantity)::numeric AS qtd
         FROM public.stocks s JOIN public.warehouses w ON w.id = s.warehouse_id
        WHERE s.organization_id = $1 AND s.product_id = ANY ($2)
          AND (to_jsonb(s)->>''deleted_at'') IS NULL
          AND COALESCE((to_jsonb(w)->>''is_active'')::boolean, true)
          AND (to_jsonb(w)->>''deleted_at'') IS NULL
        GROUP BY s.product_id'
    ELSE 'SELECT NULL::uuid AS product_id, NULL::numeric AS qtd WHERE false' END,
    CASE WHEN v_res THEN
      'SELECT r.product_id, sum(COALESCE(r.qty_reserved, 0))::numeric AS qtd
         FROM public.fn_client_order_line_reservations($1, $2) r
        WHERE r.product_id IS NOT NULL GROUP BY r.product_id'
    ELSE 'SELECT NULL::uuid AS product_id, NULL::numeric AS qtd WHERE false' END)
  INTO v_out USING p_org, v_ids, v_inv;

  RETURN jsonb_build_object('com_inventario', v_inv, 'com_reservas', v_res, 'produtos', v_out);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_stock(uuid, uuid[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_stock(uuid, uuid[], text, integer) TO authenticated, service_role;


-- ============================================================
-- 8. Planear: dados da obra, estado, fases, tarefas, datas, pessoas
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_atualizar(
  p_obra_id       uuid,
  p_titulo        text,
  p_morada        text,
  p_gestor_id     uuid,
  p_supervisor_id uuid,
  p_tolerancia    integer DEFAULT NULL,
  p_notas         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia altera a obra.');

  IF nullif(btrim(coalesce(p_titulo,'')), '') IS NULL THEN
    RAISE EXCEPTION 'Uma obra precisa de um título.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[p_gestor_id, p_supervisor_id]) u
     WHERE u IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_utilizador_perfil p
        WHERE p.utilizador_id = u AND p.organization_id = v_o.organization_id AND p.ativo)) THEN
    RAISE EXCEPTION 'O gestor ou o supervisor não está ativo em Operações nesta organização.';
  END IF;

  UPDATE public.ops_obra
     SET titulo = btrim(p_titulo),
         morada = nullif(btrim(coalesce(p_morada,'')), ''),
         gestor_id = p_gestor_id,
         supervisor_id = p_supervisor_id,
         tolerancia_percent = COALESCE(p_tolerancia, tolerancia_percent),
         notas = COALESCE(nullif(btrim(coalesce(p_notas,'')), ''), notas),
         atualizada_em = now()
   WHERE id = p_obra_id;

  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_atualizar(uuid, text, text, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_atualizar(uuid, text, text, uuid, uuid, integer, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_mudar_estado(
  p_obra_id uuid,
  p_estado  text,
  p_motivo  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_quem   record;
  v_falta  integer;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')), '');
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia muda o estado da obra.');

  IF NOT (
       (v_o.estado = 'planeada' AND p_estado IN ('em_curso','suspensa','cancelada'))
    OR (v_o.estado = 'em_curso' AND p_estado IN ('suspensa','concluida','cancelada'))
    OR (v_o.estado = 'suspensa' AND p_estado IN ('em_curso','cancelada'))
  ) THEN
    RAISE EXCEPTION 'Uma obra % não passa a %.', replace(v_o.estado,'_',' '), replace(p_estado,'_',' ');
  END IF;

  IF p_estado IN ('suspensa','cancelada') AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Suspender ou cancelar uma obra exige motivo.';
  END IF;

  IF p_estado = 'concluida' THEN
    SELECT count(*) INTO v_falta FROM public.ops_obra_tarefa
     WHERE obra_id = p_obra_id AND estado <> 'validada';
    IF v_falta > 0 THEN
      RAISE EXCEPTION 'Faltam % tarefa(s) por validar. Uma obra só se conclui com tudo validado.', v_falta;
    END IF;
  END IF;

  -- Suspender pára os relógios de quem estiver a trabalhar nela.
  IF p_estado IN ('suspensa','cancelada') THEN
    UPDATE public.ops_obra_registo SET fim = now()
     WHERE obra_id = p_obra_id AND fim IS NULL;
  END IF;

  UPDATE public.ops_obra
     SET estado = p_estado,
         motivo_estado = COALESCE(v_motivo, motivo_estado),
         iniciada_em = CASE WHEN p_estado = 'em_curso' THEN COALESCE(iniciada_em, now()) ELSE iniciada_em END,
         concluida_em = CASE WHEN p_estado = 'concluida' THEN now() ELSE concluida_em END,
         atualizada_em = now()
   WHERE id = p_obra_id;

  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'estado', v_motivo,
    v_quem.o_utilizador, jsonb_build_object('de', v_o.estado, 'para', p_estado));

  RETURN jsonb_build_object('ok', true, 'estado', p_estado);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_mudar_estado(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_mudar_estado(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_replanear(p_obra_id uuid, p_data_inicio date)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_quem   record;
  v_n      integer;
  v_inicio date;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia mexe nas datas.');
  IF p_data_inicio IS NULL THEN
    -- "Primeira data livre": replaneia e redistribui o que ainda não começou.
    v_inicio := public.ops_obra_planear_auto_impl(p_obra_id, current_date + 1);
    SELECT count(*) INTO v_n FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id;
  ELSE
    v_inicio := public.ops_obra_somar_dias_uteis(p_data_inicio, 0);
    v_n := public.ops_obra_replanear_impl(p_obra_id, v_inicio);
  END IF;
  RETURN jsonb_build_object('ok', true, 'tarefas', v_n, 'inicio', v_inicio);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_replanear(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_replanear(uuid, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_fase(p_fase_id uuid, p_nome text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_f    record;
  v_quem record;
BEGIN
  SELECT * INTO v_f FROM public.ops_obra_fase WHERE id = p_fase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fase não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_f.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia muda as fases.');
  IF nullif(btrim(coalesce(p_nome,'')), '') IS NULL THEN
    RAISE EXCEPTION 'Uma fase precisa de nome.';
  END IF;
  UPDATE public.ops_obra_fase SET nome = btrim(p_nome) WHERE id = p_fase_id;
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_fase(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_fase(uuid, text) TO authenticated, service_role;

-- Criar (p_tarefa_id NULL) ou alterar uma tarefa. Devolve os choques de
-- agenda das pessoas que lá estão, para o ecrã avisar.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_tarefa(
  p_obra_id      uuid,
  p_tarefa_id    uuid,
  p_fase_id      uuid,
  p_nome         text,
  p_minutos      integer,
  p_procedimento text DEFAULT NULL,
  p_materiais    text DEFAULT NULL,
  p_ferramentas  text DEFAULT NULL,
  p_inicio       date DEFAULT NULL,
  p_fim          date DEFAULT NULL,
  p_depende_de   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o     record;
  v_quem  record;
  v_id    uuid := p_tarefa_id;
  v_nome  text := nullif(btrim(coalesce(p_nome,'')), '');
  v_ordem integer;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia cria ou altera tarefas.');

  IF v_o.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_o.estado;
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma tarefa precisa de nome.';
  END IF;
  IF COALESCE(p_minutos, 0) <= 0 THEN
    RAISE EXCEPTION 'O tempo previsto tem de ser maior que zero.';
  END IF;
  IF p_inicio IS NOT NULL AND p_fim IS NOT NULL AND p_fim < p_inicio THEN
    RAISE EXCEPTION 'A tarefa acaba antes de começar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ops_obra_fase WHERE id = p_fase_id AND obra_id = p_obra_id) THEN
    RAISE EXCEPTION 'Essa fase não é desta obra.';
  END IF;
  IF p_depende_de IS NOT NULL AND (p_depende_de = v_id OR NOT EXISTS (
    SELECT 1 FROM public.ops_obra_tarefa WHERE id = p_depende_de AND obra_id = p_obra_id)) THEN
    RAISE EXCEPTION 'A tarefa de que depende tem de ser outra tarefa desta obra.';
  END IF;

  IF v_id IS NULL THEN
    SELECT COALESCE(max(ordem), 0) + 1 INTO v_ordem FROM public.ops_obra_tarefa WHERE fase_id = p_fase_id;
    INSERT INTO public.ops_obra_tarefa (
      organization_id, obra_id, fase_id, ordem, nome, procedimento, materiais,
      ferramentas, minutos_previstos, inicio_planeado, fim_planeado, depende_de)
    VALUES (
      v_o.organization_id, p_obra_id, p_fase_id, v_ordem, v_nome,
      nullif(btrim(coalesce(p_procedimento,'')), ''),
      nullif(btrim(coalesce(p_materiais,'')), ''),
      nullif(btrim(coalesce(p_ferramentas,'')), ''),
      p_minutos, p_inicio, COALESCE(p_fim, p_inicio), p_depende_de)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_obra_tarefa
       SET fase_id = p_fase_id, nome = v_nome,
           procedimento = nullif(btrim(coalesce(p_procedimento,'')), ''),
           materiais = nullif(btrim(coalesce(p_materiais,'')), ''),
           ferramentas = nullif(btrim(coalesce(p_ferramentas,'')), ''),
           minutos_previstos = p_minutos,
           inicio_planeado = p_inicio,
           fim_planeado = COALESCE(p_fim, p_inicio),
           depende_de = p_depende_de,
           atualizada_em = now()
     WHERE id = v_id AND obra_id = p_obra_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tarefa não encontrada nesta obra.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id,
                            'conflitos', public.ops_obra_conflitos_impl(v_id));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_tarefa(uuid, uuid, uuid, text, integer, text, text, text, date, date, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_tarefa(uuid, uuid, uuid, text, integer, text, text, text, date, date, uuid)
  TO authenticated, service_role;

-- Só as datas — é o que o Gantt manda quando se arrasta uma barra.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_planear_tarefa(
  p_tarefa_id uuid,
  p_inicio    date,
  p_fim       date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t    record;
  v_quem record;
BEGIN
  SELECT t.*, o.estado AS obra_estado INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia mexe nas datas.');
  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_t.obra_estado;
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RAISE EXCEPTION 'Datas inválidas: a tarefa tem de começar e acabar, por esta ordem.';
  END IF;

  UPDATE public.ops_obra_tarefa
     SET inicio_planeado = p_inicio, fim_planeado = p_fim, atualizada_em = now()
   WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'conflitos', public.ops_obra_conflitos_impl(p_tarefa_id));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_planear_tarefa(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_planear_tarefa(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_apagar_tarefa(p_tarefa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t    record;
  v_quem record;
BEGIN
  SELECT * INTO v_t FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia apaga tarefas.');
  IF EXISTS (SELECT 1 FROM public.ops_obra_registo WHERE tarefa_id = p_tarefa_id) THEN
    RAISE EXCEPTION 'Esta tarefa já tem tempo registado. Não se apaga trabalho feito.';
  END IF;
  DELETE FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_apagar_tarefa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_apagar_tarefa(uuid) TO authenticated, service_role;

-- Quem faz a tarefa. Substitui a lista inteira. Quem já registou tempo na
-- tarefa pode sair da lista — o tempo dele fica.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_atribuir_tarefa(
  p_tarefa_id uuid,
  p_pessoas   uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t      record;
  v_quem   record;
  v_lista  uuid[] := COALESCE(p_pessoas, ARRAY[]::uuid[]);
  v_mau    uuid;
BEGIN
  SELECT * INTO v_t FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia distribui o trabalho.');

  SELECT u INTO v_mau FROM unnest(v_lista) AS u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.ops_utilizador_perfil p
      WHERE p.utilizador_id = u AND p.organization_id = v_t.organization_id AND p.ativo)
   LIMIT 1;
  IF v_mau IS NOT NULL THEN
    RAISE EXCEPTION '% não está ativo em Operações nesta organização.',
      COALESCE((SELECT name FROM public.anew_users WHERE id = v_mau), 'Essa pessoa');
  END IF;

  DELETE FROM public.ops_obra_tarefa_pessoa
   WHERE tarefa_id = p_tarefa_id AND NOT (utilizador_id = ANY (v_lista));

  INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
  SELECT p_tarefa_id, u, v_t.organization_id, v_t.obra_id FROM (SELECT DISTINCT unnest(v_lista) AS u) x
  ON CONFLICT (tarefa_id, utilizador_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true,
    'pessoas', (SELECT count(*) FROM public.ops_obra_tarefa_pessoa WHERE tarefa_id = p_tarefa_id),
    'conflitos', public.ops_obra_conflitos_impl(p_tarefa_id));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_atribuir_tarefa(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_atribuir_tarefa(uuid, uuid[]) TO authenticated, service_role;

-- "Depois de": as tarefas (da MESMA obra) de que esta depende — substitui a
-- lista toda. Recusa ciclos (trigger ops_obra_dependencia_guarda). A coluna
-- antiga `depende_de` fica com a primeira da lista. Não mexe nas datas: o
-- gestor carrega em "Replanear" se quiser; devolve `antes_de_acabar` — as
-- dependências que, com as datas de agora, ainda não acabaram quando esta
-- começa.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_gravar_dependencias(
  p_tarefa_id  uuid,
  p_depende_de uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t     record;
  v_quem  record;
  v_lista uuid[];
  v_mau   uuid;
BEGIN
  SELECT t.*, o.estado AS obra_estado INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia muda as dependências.');
  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_t.obra_estado;
  END IF;

  -- Sem repetidos, pela ordem dada.
  SELECT COALESCE(array_agg(u ORDER BY pos), '{}') INTO v_lista
    FROM (SELECT u, min(pos) AS pos
            FROM unnest(COALESCE(p_depende_de, '{}'::uuid[])) WITH ORDINALITY AS x(u, pos)
           WHERE u IS NOT NULL GROUP BY u) z;
  IF p_tarefa_id = ANY (v_lista) THEN
    RAISE EXCEPTION 'Uma tarefa não pode depender de si própria.';
  END IF;
  SELECT u INTO v_mau FROM unnest(v_lista) u
   WHERE NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa d WHERE d.id = u AND d.obra_id = v_t.obra_id)
   LIMIT 1;
  IF v_mau IS NOT NULL THEN
    RAISE EXCEPTION 'Uma tarefa só pode depender de outra da mesma obra.';
  END IF;

  -- Primeiro a coluna (o trigger tira a antiga e põe a nova), depois o resto.
  UPDATE public.ops_obra_tarefa SET depende_de = v_lista[1], atualizada_em = now()
   WHERE id = p_tarefa_id AND depende_de IS DISTINCT FROM v_lista[1];
  DELETE FROM public.ops_obra_tarefa_dependencia
   WHERE tarefa_id = p_tarefa_id AND NOT (depende_de_id = ANY (v_lista));
  INSERT INTO public.ops_obra_tarefa_dependencia (tarefa_id, depende_de_id, organization_id, obra_id)
  SELECT p_tarefa_id, u, v_t.organization_id, v_t.obra_id FROM unnest(v_lista) u
  ON CONFLICT DO NOTHING;

  PERFORM public.ops_obra_evento(v_t.organization_id, v_t.obra_id, 'dependencias', v_t.nome,
    v_quem.o_utilizador, jsonb_build_object('tarefa_id', p_tarefa_id, 'depende_de', to_jsonb(v_lista)));

  RETURN jsonb_build_object(
    'ok', true,
    'dependencias', to_jsonb(v_lista),
    'antes_de_acabar', COALESCE((
       SELECT jsonb_agg(d.id) FROM public.ops_obra_tarefa d
        WHERE d.id = ANY (v_lista) AND v_t.inicio_planeado IS NOT NULL
          AND COALESCE(d.fim_planeado, d.inicio_planeado) > v_t.inicio_planeado), '[]'::jsonb));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_gravar_dependencias(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_gravar_dependencias(uuid, uuid[]) TO authenticated, service_role;


-- ============================================================
-- 8b. Distribuir a equipa sozinho — o planeamento sem cliques
-- ============================================================
-- Para cada tarefa por atribuir, pela ordem do plano, escolhe
-- `pessoas_previstas` pessoas entre os técnicos/operadores ativos da
-- organização (se não houver nenhum, entre toda a gente ativa), por esta
-- ordem de preferência:
--   1. sem choque — não estão noutra obra nesses dias;
--   1b. com a especialidade que a tarefa pede (skill);
--   1c. livres nesta obra nesses dias (tarefas em paralelo → pessoas diferentes);
--   2. da zona — a `zona_base` aparece na morada da obra;
--   3. continuidade — já estão nesta obra (a mesma equipa do princípio ao fim);
--   4. menos carga — menos minutos abertos atribuídos, em todas as obras.
-- O gestor corrige depois no Gantt; isto é o ponto de partida.

-- ── Quem não pode, de todo, nesses dias (ausências e feriados) ───────────
-- As pessoas de Operações são as do Olyvia (anew_users) — sem duplicar. Só
-- LÊ, e só se as tabelas existirem (to_regclass + EXECUTE: o ficheiro instala
-- numa base sem elas):
--   · ausência APROVADA em resource_time_off, ligada pelo recurso da agenda
--     (schedule_resources.user_id = anew_users.id);
--   · feriado em schedule_holidays: os da organização e os nacionais (sem
--     organização, país PT); os recorrentes contam pelo dia e mês. Um
--     feriado põe TODA a gente indisponível nesse dia;
--   · dias de ausência APROVADOS do RH (pessoas_ausencias_dias), ligados à
--     conta por pessoas_contas (estado 'activa') — ainda não está em main.
-- Uma linha por pessoa e motivo ('ausência: Férias', 'feriado: Carnaval').
DROP FUNCTION IF EXISTS public.ops_obra_indisponiveis_impl(uuid, date, date);
CREATE FUNCTION public.ops_obra_indisponiveis_impl(_org uuid, _ini date, _fim date)
RETURNS TABLE (utilizador_id uuid, motivo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ini date := COALESCE(_ini, current_date);
  v_fim date := GREATEST(COALESCE(_fim, _ini, current_date), COALESCE(_ini, current_date));
BEGIN
  IF to_regclass('public.resource_time_off') IS NOT NULL AND to_regclass('public.schedule_resources') IS NOT NULL THEN
    RETURN QUERY EXECUTE $q$
      SELECT DISTINCT sr.user_id,
             'ausência: ' || COALESCE(nullif(btrim(o.title), ''), nullif(btrim(o.reason), ''), 'indisponível')
        FROM public.resource_time_off o
        JOIN public.schedule_resources sr ON sr.id = o.resource_id
        JOIN public.ops_utilizador_perfil p ON p.utilizador_id = sr.user_id AND p.organization_id = $1
       WHERE sr.user_id IS NOT NULL
         AND COALESCE(o.approved, false)
         AND o.start_date <= $3 AND o.end_date >= $2
    $q$ USING _org, v_ini, v_fim;
  END IF;

  IF to_regclass('public.schedule_holidays') IS NOT NULL THEN
    RETURN QUERY EXECUTE $q$
      SELECT p.utilizador_id, 'feriado: ' || h.nome
        FROM (SELECT DISTINCT ON (h.name) h.name::text AS nome
                FROM public.schedule_holidays h
                JOIN generate_series($2, $3, interval '1 day') g(d) ON
                     (h.holiday_date = g.d::date
                      OR (h.is_recurring AND extract(month FROM h.holiday_date) = extract(month FROM g.d)
                                         AND extract(day FROM h.holiday_date) = extract(day FROM g.d)))
               WHERE h.organization_id = $1
                  OR (h.organization_id IS NULL AND upper(h.country_code) = 'PT')
               ORDER BY h.name) h
        CROSS JOIN public.ops_utilizador_perfil p
       WHERE p.organization_id = $1 AND p.ativo
    $q$ USING _org, v_ini, v_fim;
  END IF;

  IF to_regclass('public.pessoas_ausencias_dias') IS NOT NULL AND to_regclass('public.pessoas_contas') IS NOT NULL THEN
    RETURN QUERY EXECUTE format($q$
      SELECT DISTINCT pc.anew_user_id, 'ausência: ' || %s
        FROM public.pessoas_ausencias_dias d
        JOIN public.pessoas_contas pc
          ON pc.pessoa_id = d.pessoa_id AND pc.organization_id = d.organization_id AND pc.estado = 'activa'
        %s
       WHERE d.organization_id = $1 AND d.estado = 'aprovado'
         AND d.data BETWEEN $2 AND $3
    $q$,
      CASE WHEN to_regclass('public.hr_ausencias_tipos') IS NOT NULL THEN 'COALESCE(t.nome, ''RH'')' ELSE '''RH''' END,
      CASE WHEN to_regclass('public.hr_ausencias_tipos') IS NOT NULL
           THEN 'LEFT JOIN public.hr_ausencias_tipos t ON t.id = d.tipo_id' ELSE '' END)
    USING _org, v_ini, v_fim;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_indisponiveis_impl(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- ── Quem está livre entre duas datas ─────────────────────────────────────
-- A regra num só sítio (passo "Serviços do contrato" da Nova obra e painel
-- de atribuição da tarefa). Uma pessoa está OCUPADA num dia útil se:
--   · tem ≥ 8 h (480 min) planeadas nesse dia em tarefas abertas de obras
--     planeadas/em curso. Cada tarefa conta, por pessoa e por dia,
--     minutos_previstos ÷ pessoas_previstas ÷ dias úteis da tarefa
--     (é como o plano a espalha); ou
--   · tem uma ordem de trabalho (ops_ordem agendada/em curso/pausada) com
--     `agendada_para` nesse dia (hora de Lisboa), como responsável ou
--     como executante. Uma ordem ocupa o dia: não há duração prevista
--     fiável nas ordens.
--   · ou está indisponível (ops_obra_indisponiveis_impl: ausência aprovada,
--     feriado, ausência do RH).
-- `livre` = nada disto no intervalo; `motivo` diz porquê quando não está
-- ('ausência: Férias', 'feriado: …', 'agenda cheia: OB-2026-00012',
-- 'ordem OT-2026-00042'). `_excluir` tira uma tarefa da conta (a que se está
-- a atribuir). Só dias úteis contam para a agenda cheia, a não ser que o
-- intervalo seja só fim de semana. Devolve TODA a gente ativa da organização
-- (com `livre`), para o ecrã poder mostrar quem já está na tarefa.
-- (DROP: as colunas devolvidas mudaram durante o desenvolvimento.)
DROP FUNCTION IF EXISTS public.rpc_ops_pessoas_livres(uuid, date, date, uuid);
DROP FUNCTION IF EXISTS public.ops_obra_pessoas_livres_impl(uuid, date, date, uuid);
CREATE FUNCTION public.ops_obra_pessoas_livres_impl(
  _org uuid, _ini date, _fim date, _excluir uuid DEFAULT NULL)
RETURNS TABLE (
  utilizador_id    uuid,
  nome             text,
  funcao           text,
  skills           uuid[],
  zona             text,
  minutos_ocupados integer,
  dias_cheios      integer,
  ordens           integer,
  livre            boolean,
  motivo           text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH lim AS (
    SELECT COALESCE(_ini, current_date) AS ini,
           GREATEST(COALESCE(_fim, _ini, current_date), COALESCE(_ini, current_date)) AS fim
  ),
  todos AS (
    SELECT g::date AS dia FROM lim, generate_series(lim.ini, lim.fim, interval '1 day') g
  ),
  dias AS (
    SELECT dia FROM todos
     WHERE extract(isodow FROM dia) <= 5
        OR NOT EXISTS (SELECT 1 FROM todos t2 WHERE extract(isodow FROM t2.dia) <= 5)
  ),
  carga AS (
    SELECT tp.utilizador_id, dd.dia,
           sum(t.minutos_previstos::numeric / GREATEST(t.pessoas_previstas, 1) / nd.n) AS minutos,
           string_agg(DISTINCT o.codigo, ', ') AS obras
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra o ON o.id = t.obra_id AND o.estado IN ('planeada','em_curso')
      JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
      CROSS JOIN LATERAL (
        SELECT GREATEST(1, count(*)) AS n
          FROM generate_series(t.inicio_planeado, COALESCE(t.fim_planeado, t.inicio_planeado), interval '1 day') g
         WHERE extract(isodow FROM g) <= 5) nd
      JOIN dias dd ON dd.dia BETWEEN t.inicio_planeado AND COALESCE(t.fim_planeado, t.inicio_planeado)
     WHERE t.organization_id = _org
       AND t.estado IN ('por_fazer','em_curso','rejeitada')
       AND t.inicio_planeado IS NOT NULL
       AND (_excluir IS NULL OR t.id <> _excluir)
     GROUP BY tp.utilizador_id, dd.dia
  ),
  ordens AS (
    SELECT x.u AS utilizador_id, count(DISTINCT od.id) AS n, min(od.codigo) AS codigo
      FROM public.ops_ordem od
      CROSS JOIN LATERAL (
        SELECT od.responsavel_id AS u WHERE od.responsavel_id IS NOT NULL
        UNION
        SELECT op.utilizador_id FROM public.ops_ordem_pessoa op WHERE op.ordem_id = od.id) x
     WHERE od.organization_id = _org
       AND od.estado IN ('agendada','em_curso','pausada')
       AND od.agendada_para IS NOT NULL
       AND (od.agendada_para AT TIME ZONE 'Europe/Lisbon')::date IN (SELECT dia FROM dias)
     GROUP BY x.u
  ),
  indisp AS (
    SELECT i.utilizador_id, min(i.motivo) AS motivo
      FROM lim, public.ops_obra_indisponiveis_impl(_org, lim.ini, lim.fim) i
     GROUP BY i.utilizador_id
  ),
  cheios AS (
    SELECT c.utilizador_id, count(*) AS n, string_agg(DISTINCT c.obras, ', ') AS obras
      FROM carga c WHERE c.minutos >= 479.5
     GROUP BY c.utilizador_id
  )
  SELECT p.utilizador_id,
         COALESCE(u.name, 'Sem nome')::text,
         p.funcao::text,
         COALESCE((SELECT array_agg(us.skill_id ORDER BY k.nome)
                     FROM public.ops_utilizador_skill us
                     JOIN public.ops_skill k ON k.id = us.skill_id AND k.organization_id = _org
                    WHERE us.utilizador_id = p.utilizador_id), '{}'::uuid[]),
         nullif(btrim(p.zona_base), ''),
         COALESCE(round((SELECT sum(c.minutos) FROM carga c WHERE c.utilizador_id = p.utilizador_id)), 0)::integer,
         COALESCE(ch.n, 0)::integer,
         COALESCE(od.n, 0)::integer,
         (ch.utilizador_id IS NULL AND od.utilizador_id IS NULL AND ix.utilizador_id IS NULL),
         COALESCE(ix.motivo,
                  'agenda cheia: ' || ch.obras,
                  CASE WHEN od.utilizador_id IS NOT NULL THEN 'ordem ' || od.codigo END)
    FROM public.ops_utilizador_perfil p
    LEFT JOIN public.anew_users u ON u.id = p.utilizador_id
    LEFT JOIN cheios ch ON ch.utilizador_id = p.utilizador_id
    LEFT JOIN ordens od ON od.utilizador_id = p.utilizador_id
    LEFT JOIN indisp ix ON ix.utilizador_id = p.utilizador_id
   WHERE p.organization_id = _org AND p.ativo
   ORDER BY 9 DESC, 6, 2
$$;

REVOKE ALL ON FUNCTION public.ops_obra_pessoas_livres_impl(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;

-- A porta para o ecrã. Quem planeia (gestor/admin com orders.create ou
-- orders.edit NESTA organização). Devolve uma linha por pessoa ativa:
--   utilizador_id, nome, funcao, skills (uuid[] de ops_skill), zona,
--   minutos_ocupados (no período, sem a tarefa excluída), dias_cheios,
--   ordens (n.º de ordens agendadas no período), livre (boolean),
--   motivo (text, null quando livre: 'ausência: Férias', 'feriado: …',
--   'agenda cheia: OB-…', 'ordem OT-…').
-- Ordem: livres primeiro, depois menos ocupados, depois nome.
CREATE FUNCTION public.rpc_ops_pessoas_livres(
  p_org             uuid,
  p_inicio          date,
  p_fim             date DEFAULT NULL,
  p_excluir_tarefa  uuid DEFAULT NULL
)
RETURNS TABLE (
  utilizador_id    uuid,
  nome             text,
  funcao           text,
  skills           uuid[],
  zona             text,
  minutos_ocupados integer,
  dias_cheios      integer,
  ordens           integer,
  livre            boolean,
  motivo           text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_quem record;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(p_org) q;
  IF v_quem.funcao IS DISTINCT FROM 'admin' AND v_quem.funcao IS DISTINCT FROM 'gestor' THEN
    RAISE EXCEPTION 'Só quem planeia vê a agenda da equipa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.ops_pode(p_org, 'operations.orders.edit') OR public.ops_pode(p_org, 'operations.orders.create')) THEN
    RAISE EXCEPTION 'Sem permissão (operations.orders.edit) nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_inicio IS NULL THEN
    RAISE EXCEPTION 'Indica a data de início.';
  END IF;
  IF p_fim IS NOT NULL AND p_fim < p_inicio THEN
    RAISE EXCEPTION 'O fim não pode ser antes do início.';
  END IF;
  IF COALESCE(p_fim, p_inicio) - p_inicio > 366 THEN
    RAISE EXCEPTION 'No máximo um ano de cada vez.';
  END IF;
  IF p_excluir_tarefa IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_obra_tarefa WHERE id = p_excluir_tarefa AND organization_id = p_org) THEN
    RAISE EXCEPTION 'Tarefa não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY
    SELECT * FROM public.ops_obra_pessoas_livres_impl(p_org, p_inicio, COALESCE(p_fim, p_inicio), p_excluir_tarefa);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_pessoas_livres(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_pessoas_livres(uuid, date, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ops_obra_distribuir_impl(_obra_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o       record;
  v_funcoes text[];
  v_n       integer := 0;
  v_k       integer;
  v_indisp  uuid[];
  t         record;
BEGIN
  SELECT id, organization_id, COALESCE(morada, '') AS morada INTO v_o
    FROM public.ops_obra WHERE id = _obra_id;

  v_funcoes := CASE WHEN EXISTS (
                      SELECT 1 FROM public.ops_utilizador_perfil
                       WHERE organization_id = v_o.organization_id AND ativo
                         AND funcao IN ('tecnico','operador'))
                    THEN ARRAY['tecnico','operador']
                    ELSE ARRAY['admin','gestor','supervisor','tecnico','operador'] END;

  FOR t IN
    SELECT ta.id, ta.inicio_planeado AS ini, COALESCE(ta.fim_planeado, ta.inicio_planeado) AS fim,
           ta.pessoas_previstas AS n, ta.skill_id AS skill
      FROM public.ops_obra_tarefa ta
      JOIN public.ops_obra_fase fa ON fa.id = ta.fase_id
     WHERE ta.obra_id = _obra_id
       AND ta.estado IN ('por_fazer','rejeitada')
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = ta.id)
     ORDER BY ta.inicio_planeado NULLS LAST, fa.ordem, ta.ordem
  LOOP
    -- Ausências aprovadas, feriados, RH: indisponível nesses dias.
    v_indisp := '{}';
    IF t.ini IS NOT NULL THEN
      SELECT COALESCE(array_agg(DISTINCT i.utilizador_id), '{}') INTO v_indisp
        FROM public.ops_obra_indisponiveis_impl(v_o.organization_id, t.ini, t.fim) i;
    END IF;

    INSERT INTO public.ops_obra_tarefa_pessoa (tarefa_id, utilizador_id, organization_id, obra_id)
    SELECT t.id, c.utilizador_id, v_o.organization_id, _obra_id
      FROM (
        SELECT p.utilizador_id,
               (t.ini IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                    JOIN public.ops_obra_tarefa o2 ON o2.id = tp.tarefa_id
                    JOIN public.ops_obra ob ON ob.id = o2.obra_id
                   WHERE tp.utilizador_id = p.utilizador_id
                     AND o2.obra_id <> _obra_id
                     AND o2.estado IN ('por_fazer','em_curso','rejeitada')
                     AND ob.estado IN ('planeada','em_curso')
                     AND o2.inicio_planeado IS NOT NULL
                     AND daterange(o2.inicio_planeado, COALESCE(o2.fim_planeado, o2.inicio_planeado), '[]')
                      && daterange(t.ini, t.fim, '[]'))
                OR t.ini IS NOT NULL AND EXISTS (
                  -- Uma ordem de trabalho agendada nesses dias também ocupa
                  -- (a mesma regra de ops_obra_pessoas_livres_impl).
                  SELECT 1 FROM public.ops_ordem od
                   WHERE od.organization_id = v_o.organization_id
                     AND od.estado IN ('agendada','em_curso','pausada')
                     AND od.agendada_para IS NOT NULL
                     AND (od.agendada_para AT TIME ZONE 'Europe/Lisbon')::date BETWEEN t.ini AND t.fim
                     AND (od.responsavel_id = p.utilizador_id
                          OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa op
                                      WHERE op.ordem_id = od.id AND op.utilizador_id = p.utilizador_id)))
                OR p.utilizador_id = ANY (v_indisp)) AS choque,
               -- Já tem outra tarefa DESTA obra nesses dias (tarefas em paralelo
               -- vão para pessoas diferentes).
               (t.ini IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                    JOIN public.ops_obra_tarefa o2 ON o2.id = tp.tarefa_id
                   WHERE tp.utilizador_id = p.utilizador_id
                     AND o2.obra_id = _obra_id AND o2.id <> t.id
                     AND o2.inicio_planeado IS NOT NULL
                     AND daterange(o2.inicio_planeado, COALESCE(o2.fim_planeado, o2.inicio_planeado), '[]')
                      && daterange(t.ini, t.fim, '[]'))) AS ocupado,
               (t.skill IS NULL OR EXISTS (
                  SELECT 1 FROM public.ops_utilizador_skill us
                   WHERE us.utilizador_id = p.utilizador_id AND us.skill_id = t.skill)) AS tem_skill,
               (nullif(btrim(p.zona_base), '') IS NOT NULL
                  AND v_o.morada ILIKE '%' || btrim(p.zona_base) || '%') AS na_zona,
               EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                        WHERE tp.obra_id = _obra_id AND tp.utilizador_id = p.utilizador_id) AS na_obra,
               (SELECT COALESCE(sum(o2.minutos_previstos), 0)
                  FROM public.ops_obra_tarefa_pessoa tp
                  JOIN public.ops_obra_tarefa o2 ON o2.id = tp.tarefa_id
                 WHERE tp.utilizador_id = p.utilizador_id
                   AND o2.estado IN ('por_fazer','em_curso','rejeitada')) AS carga
          FROM public.ops_utilizador_perfil p
         WHERE p.organization_id = v_o.organization_id AND p.ativo
           AND p.funcao = ANY (v_funcoes)
         ORDER BY choque, tem_skill DESC, ocupado, na_zona DESC, na_obra DESC, carga, p.utilizador_id
         LIMIT t.n
      ) c
    ON CONFLICT (tarefa_id, utilizador_id) DO NOTHING;
    GET DIAGNOSTICS v_k = ROW_COUNT;
    IF v_k > 0 THEN v_n := v_n + 1; END IF;
  END LOOP;

  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_distribuir_impl(uuid) FROM PUBLIC, anon, authenticated;

-- A data de início automática: o primeiro dia útil, a partir de `_desde`,
-- em que a obra fica planeada e distribuída SEM choques com outras obras.
-- Experimenta dia a dia (até 40 dias úteis): planeia, distribui, conta as
-- tarefas com choque. Se nenhum dia servir, fica o menos mau. As tarefas já
-- começadas (com tempo registado) não perdem as pessoas, nem as tarefas em
-- `_fixas` (pessoas escolhidas à mão no passo "Serviços do contrato").
-- (DROP: a assinatura antiga, de 2 argumentos.)
DROP FUNCTION IF EXISTS public.ops_obra_planear_auto_impl(uuid, date);
CREATE OR REPLACE FUNCTION public.ops_obra_planear_auto_impl(_obra_id uuid, _desde date, _fixas uuid[] DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d       date := public.ops_obra_somar_dias_uteis(_desde, 0);
  v_best  date;
  v_min   integer;
  n       integer;
  i       integer := 0;
  v_fixas uuid[] := COALESCE(_fixas, '{}');
BEGIN
  LOOP
    DELETE FROM public.ops_obra_tarefa_pessoa tp
     USING public.ops_obra_tarefa t
     WHERE t.id = tp.tarefa_id AND t.obra_id = _obra_id
       AND t.estado IN ('por_fazer','rejeitada')
       AND NOT (t.id = ANY (v_fixas))
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id);
    PERFORM public.ops_obra_replanear_impl(_obra_id, d);
    PERFORM public.ops_obra_distribuir_impl(_obra_id);

    SELECT count(*) INTO n FROM public.ops_obra_tarefa t
     WHERE t.obra_id = _obra_id AND public.ops_obra_conflitos_impl(t.id) <> '[]'::jsonb;
    IF n = 0 THEN
      RETURN d;
    END IF;
    IF v_min IS NULL OR n < v_min THEN
      v_min := n;
      v_best := d;
    END IF;

    i := i + 1;
    EXIT WHEN i >= 40;
    d := public.ops_obra_somar_dias_uteis(d, 1);
  END LOOP;

  -- Nenhum dia sem choques: o que tem menos.
  DELETE FROM public.ops_obra_tarefa_pessoa tp
   USING public.ops_obra_tarefa t
   WHERE t.id = tp.tarefa_id AND t.obra_id = _obra_id
     AND t.estado IN ('por_fazer','rejeitada')
     AND NOT (t.id = ANY (v_fixas))
     AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id);
  PERFORM public.ops_obra_replanear_impl(_obra_id, v_best);
  PERFORM public.ops_obra_distribuir_impl(_obra_id);
  RETURN v_best;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_planear_auto_impl(uuid, date, uuid[]) FROM PUBLIC, anon, authenticated;

-- O botão "Distribuir equipa". `p_refazer` tira primeiro as pessoas das
-- tarefas que ainda ninguém começou (por fazer / rejeitadas sem registo).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_distribuir(p_obra_id uuid, p_refazer boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
  v_n    integer;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só quem planeia distribui o trabalho.');
  IF v_o.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se planeia.', v_o.estado;
  END IF;

  IF p_refazer THEN
    DELETE FROM public.ops_obra_tarefa_pessoa tp
     USING public.ops_obra_tarefa t
     WHERE t.id = tp.tarefa_id AND t.obra_id = p_obra_id
       AND t.estado IN ('por_fazer','rejeitada')
       AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = t.id);
  END IF;

  v_n := public.ops_obra_distribuir_impl(p_obra_id);
  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'distribuida', NULL,
    v_quem.o_utilizador, jsonb_build_object('tarefas', v_n, 'refazer', p_refazer));
  RETURN jsonb_build_object('ok', true, 'tarefas', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_distribuir(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_distribuir(uuid, boolean) TO authenticated, service_role;


-- ============================================================
-- 9. Executar: iniciar e terminar, com 1 toque
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_iniciar_tarefa(p_tarefa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t      record;
  v_quem   record;
  v_outra  text;
  v_dep    record;
BEGIN
  SELECT t.*, o.estado AS obra_estado INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.execute', NULL, NULL);

  IF v_quem.o_funcao NOT IN ('admin','gestor') AND NOT EXISTS (
    SELECT 1 FROM public.ops_obra_tarefa_pessoa
     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador) THEN
    RAISE EXCEPTION 'Não estás nesta tarefa. Pede ao gestor para te atribuir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.obra_estado NOT IN ('planeada','em_curso') THEN
    RAISE EXCEPTION 'A obra está %. Não se começa trabalho nela.', v_t.obra_estado;
  END IF;
  IF v_t.estado NOT IN ('por_fazer','em_curso','rejeitada') THEN
    RAISE EXCEPTION 'Esta tarefa já está %.', v_t.estado;
  END IF;

  -- TODAS as dependências (ops_obra_tarefa_dependencia; a coluna depende_de
  -- está lá sincronizada) têm de estar feitas.
  SELECT d.nome, d.estado INTO v_dep
    FROM public.ops_obra_tarefa_dependencia x
    JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id
   WHERE x.tarefa_id = p_tarefa_id AND d.estado NOT IN ('feita','validada')
   ORDER BY d.inicio_planeado NULLS LAST, d.nome
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Esta tarefa depende de "%", que ainda não está feita.', v_dep.nome;
  END IF;

  SELECT t.nome INTO v_outra
    FROM public.ops_obra_registo r JOIN public.ops_obra_tarefa t ON t.id = r.tarefa_id
   WHERE r.utilizador_id = v_quem.o_utilizador AND r.fim IS NULL LIMIT 1;
  IF v_outra IS NOT NULL THEN
    RAISE EXCEPTION 'Já tens "%" a correr. Termina essa primeiro.', v_outra;
  END IF;

  INSERT INTO public.ops_obra_registo (organization_id, obra_id, tarefa_id, utilizador_id)
  VALUES (v_t.organization_id, v_t.obra_id, p_tarefa_id, v_quem.o_utilizador);

  UPDATE public.ops_obra_tarefa
     SET estado = 'em_curso',
         iniciada_em = COALESCE(iniciada_em, now()),
         atualizada_em = now()
   WHERE id = p_tarefa_id;

  -- A primeira tarefa a arrancar põe a obra em curso.
  UPDATE public.ops_obra
     SET estado = 'em_curso', iniciada_em = COALESCE(iniciada_em, now()), atualizada_em = now()
   WHERE id = v_t.obra_id AND estado = 'planeada';

  RETURN jsonb_build_object('ok', true, 'estado', 'em_curso',
    'minutos_reais', public.ops_obra_minutos_reais(p_tarefa_id),
    'minutos_previstos', v_t.minutos_previstos);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_iniciar_tarefa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_iniciar_tarefa(uuid) TO authenticated, service_role;

-- Terminar. `p_concluir = false` pára só o MEU relógio (pausa, almoço, fim do
-- dia). `p_concluir = true` dá a tarefa por feita, fecha os relógios de toda
-- a gente nela e — se o real passou o previsto mais a tolerância — EXIGE um
-- motivo da lista. "Outro" exige também uma nota.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_terminar_tarefa(
  p_tarefa_id uuid,
  p_concluir  boolean DEFAULT true,
  p_motivo    text    DEFAULT NULL,
  p_nota      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t        record;
  v_quem     record;
  v_real     numeric;
  v_limite   numeric;
  v_excedido boolean;
  v_motivo   text := nullif(btrim(coalesce(p_motivo,'')), '');
  v_nota     text := nullif(btrim(coalesce(p_nota,'')), '');
  v_dono     boolean;
BEGIN
  SELECT t.*, o.estado AS obra_estado, o.tolerancia_percent INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.execute', NULL, NULL);

  v_dono := EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa
                     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador);
  IF v_quem.o_funcao NOT IN ('admin','gestor') AND NOT v_dono THEN
    RAISE EXCEPTION 'Não estás nesta tarefa.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_t.estado <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se termina uma tarefa em curso (esta está %).', replace(v_t.estado,'_',' ');
  END IF;

  IF NOT COALESCE(p_concluir, true) THEN
    UPDATE public.ops_obra_registo SET fim = now()
     WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador AND fim IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não tens relógio a correr nesta tarefa.';
    END IF;
    RETURN jsonb_build_object('ok', true, 'estado', 'em_curso',
      'minutos_reais', public.ops_obra_minutos_reais(p_tarefa_id),
      'minutos_previstos', v_t.minutos_previstos);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ops_obra_registo WHERE tarefa_id = p_tarefa_id) THEN
    RAISE EXCEPTION 'Sem tempo registado. Carrega em Iniciar antes de dar a tarefa por feita.';
  END IF;

  -- O real conta-se ANTES de fechar, até agora — é o mesmo número.
  v_real := public.ops_obra_minutos_reais(p_tarefa_id);
  v_limite := v_t.minutos_previstos * (1 + v_t.tolerancia_percent / 100.0);
  v_excedido := v_real > v_limite;

  IF v_excedido THEN
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'Justificação obrigatória: % min reais para % previstos (tolerância de % %%). Escolhe o motivo do desvio.',
        round(v_real), v_t.minutos_previstos, v_t.tolerancia_percent
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF v_motivo IS NOT NULL AND v_motivo NOT IN
     ('secagem','condicoes_edificio','material_em_falta','trabalho_imprevisto','acesso_cliente','outro') THEN
    RAISE EXCEPTION 'Motivo de desvio desconhecido: %.', v_motivo;
  END IF;
  IF v_motivo = 'outro' AND v_nota IS NULL THEN
    RAISE EXCEPTION 'Com o motivo "outro", escreve uma nota a explicar.';
  END IF;

  UPDATE public.ops_obra_registo SET fim = now()
   WHERE tarefa_id = p_tarefa_id AND fim IS NULL;

  UPDATE public.ops_obra_tarefa
     SET estado = 'feita',
         terminada_em = now(),
         motivo_desvio = v_motivo,
         nota_desvio = v_nota,
         atualizada_em = now()
   WHERE id = p_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'estado', 'feita',
    'minutos_reais', v_real, 'minutos_previstos', v_t.minutos_previstos,
    'excedido', v_excedido);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_terminar_tarefa(uuid, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_terminar_tarefa(uuid, boolean, text, text) TO authenticated, service_role;


-- ============================================================
-- 10. Validar — o double check do supervisor
-- ============================================================
-- Quem fez não valida o próprio trabalho: se registou tempo nesta tarefa, não
-- é ele o segundo par de olhos.

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_validar_tarefa(
  p_tarefa_id uuid,
  p_aprovar   boolean,
  p_motivo    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t      record;
  v_quem   record;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')), '');
BEGIN
  SELECT * INTO v_t FROM public.ops_obra_tarefa WHERE id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_t.organization_id, 'operations.orders.confirm', ARRAY['gestor','supervisor'],
    'Só o supervisor ou o gestor validam tarefas.');

  IF v_t.estado <> 'feita' THEN
    RAISE EXCEPTION 'Só se valida uma tarefa feita (esta está %).', replace(v_t.estado,'_',' ');
  END IF;
  IF EXISTS (SELECT 1 FROM public.ops_obra_registo
              WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.o_utilizador) THEN
    RAISE EXCEPTION 'Quem fez a tarefa não a valida. É preciso outro par de olhos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(p_aprovar, false) THEN
    UPDATE public.ops_obra_tarefa
       SET estado = 'validada', validada_por = v_quem.o_utilizador, validada_em = now(),
           motivo_rejeicao = NULL, atualizada_em = now()
     WHERE id = p_tarefa_id;
  ELSE
    IF v_motivo IS NULL THEN
      RAISE EXCEPTION 'Rejeitar exige motivo — é o que a equipa vai ler para corrigir.';
    END IF;
    UPDATE public.ops_obra_tarefa
       SET estado = 'rejeitada', motivo_rejeicao = v_motivo, rejeitada_em = now(),
           validada_por = v_quem.o_utilizador, validada_em = NULL, atualizada_em = now()
     WHERE id = p_tarefa_id;
  END IF;

  PERFORM public.ops_obra_evento(v_t.organization_id, v_t.obra_id,
    CASE WHEN p_aprovar THEN 'tarefa_validada' ELSE 'tarefa_rejeitada' END,
    v_t.nome, v_quem.o_utilizador,
    jsonb_build_object('tarefa_id', p_tarefa_id, 'motivo', v_motivo));

  RETURN jsonb_build_object('ok', true,
    'estado', CASE WHEN p_aprovar THEN 'validada' ELSE 'rejeitada' END);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_validar_tarefa(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_validar_tarefa(uuid, boolean, text) TO authenticated, service_role;


-- ============================================================
-- 11. Trabalhos extra
-- ============================================================
-- registado → aprovado (gestor) → enviado (ao comercial) · ou recusado.
-- "Enviado" é só um estado AQUI: Operações não cria orçamentos no CRM. O
-- comercial vê a lista e faz o orçamento adicional ligado ao contrato.

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_registar_extra(
  p_obra_id   uuid,
  p_descricao text,
  p_valor     numeric DEFAULT NULL,
  p_tarefa_id uuid    DEFAULT NULL,
  p_fotos     text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
  v_id   uuid;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.execute', NULL, NULL);
  IF NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta obra.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF nullif(btrim(coalesce(p_descricao,'')), '') IS NULL THEN
    RAISE EXCEPTION 'Descreve o que se encontrou.';
  END IF;
  IF p_valor IS NOT NULL AND p_valor < 0 THEN
    RAISE EXCEPTION 'O valor estimado não pode ser negativo.';
  END IF;
  IF p_tarefa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_obra_tarefa WHERE id = p_tarefa_id AND obra_id = p_obra_id) THEN
    RAISE EXCEPTION 'Essa tarefa não é desta obra.';
  END IF;

  INSERT INTO public.ops_obra_extra
    (organization_id, obra_id, tarefa_id, descricao, valor_estimado, fotos, registado_por)
  VALUES (v_o.organization_id, p_obra_id, p_tarefa_id, btrim(p_descricao), p_valor,
          COALESCE(p_fotos, '{}'), v_quem.o_utilizador)
  RETURNING id INTO v_id;

  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'extra_registado',
    btrim(p_descricao), v_quem.o_utilizador, jsonb_build_object('extra_id', v_id, 'valor', p_valor));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_registar_extra(uuid, text, numeric, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_extra(uuid, text, numeric, uuid, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_decidir_extra(
  p_extra_id uuid,
  p_acao     text,
  p_motivo   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_e      record;
  v_quem   record;
  v_novo   text;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')), '');
BEGIN
  SELECT * INTO v_e FROM public.ops_obra_extra WHERE id = p_extra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trabalho extra não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_e.organization_id, 'operations.orders.approve', ARRAY['gestor'],
    'Só o gestor decide os trabalhos extra.');

  v_novo := CASE
    WHEN p_acao = 'aprovar' AND v_e.estado = 'registado' THEN 'aprovado'
    WHEN p_acao = 'recusar' AND v_e.estado IN ('registado','aprovado') THEN 'recusado'
    WHEN p_acao = 'enviar'  AND v_e.estado = 'aprovado' THEN 'enviado'
  END;
  IF v_novo IS NULL THEN
    RAISE EXCEPTION 'Não se pode "%" um extra %.', p_acao, v_e.estado;
  END IF;
  IF v_novo = 'recusado' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Recusar exige motivo.';
  END IF;

  UPDATE public.ops_obra_extra
     SET estado = v_novo,
         motivo_recusa = CASE WHEN v_novo = 'recusado' THEN v_motivo ELSE motivo_recusa END,
         decidido_por = v_quem.o_utilizador,
         decidido_em = now(),
         enviado_em = CASE WHEN v_novo = 'enviado' THEN now() ELSE enviado_em END
   WHERE id = p_extra_id;

  PERFORM public.ops_obra_evento(v_e.organization_id, v_e.obra_id, 'extra_' || v_novo,
    v_e.descricao, v_quem.o_utilizador, jsonb_build_object('extra_id', p_extra_id, 'motivo', v_motivo));

  RETURN jsonb_build_object('ok', true, 'estado', v_novo);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_decidir_extra(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_decidir_extra(uuid, text, text) TO authenticated, service_role;


-- ============================================================
-- 11b. Atrasos: registar, avisar o cliente, alertas do supervisor
-- ============================================================
-- O supervisor quer saber ANTES: quem ainda não começou o que devia ter
-- começado, o que já passou do fim, e que atrasos ainda não foram ditos ao
-- cliente. Quem está na tarefa (ou o supervisor, ou o gestor) regista o
-- atraso com contexto e "mais quanto tempo"; o plano original fica guardado,
-- as tarefas que dependem desta (e ainda não começaram) são empurradas em
-- cadeia, e o novo fim da obra sai logo — para avisar o cliente.
-- As notificações ficam DENTRO de Operações (o sino do CRM seria a 1.ª
-- escrita no CRM: decisão pendente).

-- Dias úteis entre duas datas: quantos se somam a `_de` para chegar a `_ate`
-- (o inverso de ops_obra_somar_dias_uteis). 0 se `_ate` <= `_de`.
CREATE OR REPLACE FUNCTION public.ops_obra_dias_uteis_entre(_de date, _ate date)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _de IS NULL OR _ate IS NULL OR _ate <= _de THEN 0
    ELSE (SELECT count(*)::integer
            FROM generate_series((_de + 1)::timestamp, _ate::timestamp, interval '1 day') d
           WHERE extract(isodow FROM d) <= 5) END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_dias_uteis_entre(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_dias_uteis_entre(date, date) TO authenticated, service_role;

-- A regra "não iniciada a tempo": por fazer, e já passaram 60 min da hora de
-- início do dia (ops_obra.hora_inicio_dia, 08:00 por defeito → 09:00) no dia
-- de início planeado — ou o dia já passou. Hora de Lisboa. A MESMA regra na
-- vista (coluna atrasada_inicio, o Gantt) e nos alertas.
CREATE OR REPLACE FUNCTION public.ops_obra_atrasada_inicio(
  _estado text, _inicio date, _hora time, _agora timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    _estado = 'por_fazer' AND _inicio IS NOT NULL
    AND (_agora AT TIME ZONE 'Europe/Lisbon')
        >= (_inicio + COALESCE(_hora, time '08:00')) + interval '60 minutes',
    false)
$$;

REVOKE ALL ON FUNCTION public.ops_obra_atrasada_inicio(text, date, time, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_atrasada_inicio(text, date, time, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ops_obra_rotulo_atraso(_motivo text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _motivo
    WHEN 'secagem' THEN 'Secagem / cura'
    WHEN 'condicoes_edificio' THEN 'Condições do edifício'
    WHEN 'material_em_falta' THEN 'Material em falta'
    WHEN 'trabalho_imprevisto' THEN 'Trabalho imprevisto'
    WHEN 'acesso_cliente' THEN 'Acesso / cliente'
    WHEN 'meteorologia' THEN 'Meteorologia'
    WHEN 'equipa' THEN 'Equipa'
    ELSE 'Outro' END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_rotulo_atraso(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_rotulo_atraso(text) TO authenticated, service_role;

-- Todos os alertas de uma organização (ou de uma obra), SEM filtro de quem
-- vê. SECURITY INVOKER de propósito: na vista ops_v_obra_resumo (contagem)
-- corre com a RLS de quem lê; dentro de rpc_ops_obra_alertas corre com os
-- direitos da RPC, que filtra ela própria por função.
--   gravidade 1  fim_ultrapassado    por fazer / em curso / rejeitada, com fim_planeado < hoje
--   gravidade 2  nao_iniciada        por fazer, ops_obra_atrasada_inicio() — e o fim ainda não passou
--                                    (senão já é fim_ultrapassado, que é pior)
--   gravidade 3  cliente_por_avisar  atraso registado com cliente_avisado = false
-- Só obras planeadas ou em curso (os por avisar: qualquer obra não cancelada).
CREATE OR REPLACE FUNCTION public.ops_obra_alertas_lista(_org uuid, _obra uuid DEFAULT NULL)
RETURNS TABLE (
  tipo           text,
  gravidade      smallint,
  tarefa_id      uuid,
  obra_id        uuid,
  obra_codigo    text,
  obra_titulo    text,
  tarefa_nome    text,
  pessoas        uuid[],
  desde          timestamptz,
  minutos_atraso integer,
  detalhe        text,
  atraso_id      uuid,
  supervisor_id  uuid
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH agora AS (
    SELECT (now() AT TIME ZONE 'Europe/Lisbon') AS ts,
           (now() AT TIME ZONE 'Europe/Lisbon')::date AS hoje
  ),
  ta AS (
    SELECT t.id, t.obra_id, t.nome, t.estado, t.inicio_planeado, t.fim_planeado,
           o.codigo, o.titulo, o.supervisor_id AS sup, COALESCE(o.hora_inicio_dia, time '08:00') AS hora,
           COALESCE((SELECT array_agg(tp.utilizador_id ORDER BY tp.atribuida_em, tp.utilizador_id)
                       FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id), '{}'::uuid[]) AS pessoas
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra o ON o.id = t.obra_id
     WHERE t.organization_id = _org
       AND (_obra IS NULL OR t.obra_id = _obra)
       AND o.estado IN ('planeada','em_curso')
       AND t.estado IN ('por_fazer','em_curso','rejeitada')
  )
  SELECT 'fim_ultrapassado'::text, 1::smallint, ta.id, ta.obra_id, ta.codigo, ta.titulo, ta.nome, ta.pessoas,
         ((ta.fim_planeado + 1)::timestamp AT TIME ZONE 'Europe/Lisbon'),
         GREATEST(0, floor(extract(epoch FROM (ag.ts - (ta.fim_planeado + 1)::timestamp)) / 60))::integer,
         'Devia ter acabado a ' || to_char(ta.fim_planeado, 'DD/MM') ||
           CASE ta.estado WHEN 'por_fazer' THEN ' e ainda nem começou'
                          WHEN 'rejeitada' THEN ' e voltou para refazer'
                          ELSE ' e ainda está em curso' END,
         NULL::uuid, ta.sup
    FROM ta CROSS JOIN agora ag
   WHERE ta.fim_planeado IS NOT NULL AND ta.fim_planeado < ag.hoje
  UNION ALL
  SELECT 'nao_iniciada'::text, 2::smallint, ta.id, ta.obra_id, ta.codigo, ta.titulo, ta.nome, ta.pessoas,
         ((ta.inicio_planeado + ta.hora) AT TIME ZONE 'Europe/Lisbon'),
         GREATEST(0, floor(extract(epoch FROM (ag.ts - (ta.inicio_planeado + ta.hora))) / 60))::integer,
         'Devia ter começado a ' || to_char(ta.inicio_planeado, 'DD/MM') || ' às ' || to_char(ta.hora, 'HH24:MI')
           || CASE WHEN cardinality(ta.pessoas) = 0 THEN ' · ninguém atribuído' ELSE '' END
           || COALESCE(' · à espera de "' || dep.nome || '"', ''),
         NULL::uuid, ta.sup
    FROM ta CROSS JOIN agora ag
    LEFT JOIN LATERAL (
      SELECT d.nome FROM public.ops_obra_tarefa_dependencia x
        JOIN public.ops_obra_tarefa d ON d.id = x.depende_de_id
       WHERE x.tarefa_id = ta.id AND d.estado NOT IN ('feita','validada')
       ORDER BY d.inicio_planeado NULLS LAST, d.nome LIMIT 1
    ) dep ON true
   WHERE public.ops_obra_atrasada_inicio(ta.estado, ta.inicio_planeado, ta.hora)
     AND NOT (ta.fim_planeado IS NOT NULL AND ta.fim_planeado < ag.hoje)
  UNION ALL
  SELECT 'cliente_por_avisar'::text, 3::smallint, a.tarefa_id, a.obra_id, o.codigo, o.titulo, t.nome,
         COALESCE((SELECT array_agg(tp.utilizador_id ORDER BY tp.atribuida_em, tp.utilizador_id)
                     FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = a.tarefa_id), '{}'::uuid[]),
         a.registado_em,
         COALESCE(a.minutos_extra,
                  public.ops_obra_dias_uteis_entre(a.fim_anterior, a.novo_fim) * o.minutos_por_dia)::integer,
         public.ops_obra_rotulo_atraso(a.motivo) || ': ' || a.contexto
           || COALESCE(' · novo fim ' || to_char(a.novo_fim, 'DD/MM'), ''),
         a.id, o.supervisor_id
    FROM public.ops_obra_tarefa_atraso a
    JOIN public.ops_obra o ON o.id = a.obra_id
    JOIN public.ops_obra_tarefa t ON t.id = a.tarefa_id
   WHERE a.organization_id = _org
     AND (_obra IS NULL OR a.obra_id = _obra)
     AND NOT a.cliente_avisado
     AND o.estado <> 'cancelada'
$$;

REVOKE ALL ON FUNCTION public.ops_obra_alertas_lista(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_alertas_lista(uuid, uuid) TO authenticated, service_role;

-- Os alertas que EU devo ver: gestor/admin — todas as obras da organização;
-- o supervisor de uma obra — as dessa obra; os outros — nenhum (lista vazia,
-- não erro: o contador do menu pergunta sem saber a função). Pior primeiro.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_alertas(p_org uuid)
RETURNS TABLE (
  tipo           text,
  gravidade      smallint,
  tarefa_id      uuid,
  obra_id        uuid,
  obra_codigo    text,
  obra_titulo    text,
  tarefa_nome    text,
  pessoas        uuid[],
  pessoas_nomes  text[],
  desde          timestamptz,
  minutos_atraso integer,
  detalhe        text,
  atraso_id      uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_eu     uuid;
  v_funcao text;
BEGIN
  -- Primeiro quem chama (recusa quem não é desta organização), depois o resto.
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(p_org) q;
  IF NOT public.ops_pode(p_org, 'operations.orders.view') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.tipo, a.gravidade, a.tarefa_id, a.obra_id, a.obra_codigo, a.obra_titulo, a.tarefa_nome,
         a.pessoas,
         COALESCE((SELECT array_agg(COALESCE(u.name, 'Sem nome') ORDER BY p.k)
                     FROM unnest(a.pessoas) WITH ORDINALITY AS p(id, k)
                     LEFT JOIN public.anew_users u ON u.id = p.id), '{}'::text[]),
         a.desde, a.minutos_atraso, a.detalhe, a.atraso_id
    FROM public.ops_obra_alertas_lista(p_org, NULL) a
   WHERE v_funcao IN ('admin','gestor') OR a.supervisor_id = v_eu
   ORDER BY a.gravidade, a.minutos_atraso DESC NULLS LAST, a.obra_codigo, a.tarefa_nome;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_alertas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_alertas(uuid) TO authenticated, service_role;

-- Registar um atraso ("vai demorar mais"). Pode: quem está na tarefa
-- (orders.execute), o supervisor DA OBRA (orders.confirm), o gestor/admin
-- (orders.edit). Exige motivo e contexto (≥ 5 letras) e pelo menos um de:
--   · p_minutos_extra — mão de obra a mais (pessoa × min). O calendário
--     anda ceil(min ÷ pessoas ÷ minutos_por_dia) dias úteis: a partir do fim
--     previsto, ou de hoje se o fim já passou (aí conta o dia de hoje);
--   · p_novo_fim — a nova data de fim, dita por quem sabe.
-- Guarda o plano original (se ainda não houver), muda fim_planeado e
-- minutos_estimativa (minutos_previstos fica: é a base das métricas) e, com
-- p_empurrar, empurra EM CADEIA as tarefas que dependem desta e ainda não
-- começaram (por fazer, sem tempo registado) — só o necessário: quem tinha
-- folga não mexe; quem começava no dia seguinte ao fim continua a começar no
-- dia seguinte ao novo fim; a duração (dias úteis) mantém-se.
-- p_simular = true faz tudo e desfaz no fim: é a pré-visualização do ecrã
-- (novo fim da tarefa e da obra), sem gravar nada.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_registar_atraso(
  p_tarefa_id     uuid,
  p_motivo        text,
  p_contexto      text,
  p_minutos_extra integer DEFAULT NULL,
  p_novo_fim      date    DEFAULT NULL,
  p_empurrar      boolean DEFAULT true,
  p_simular       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t         record;
  v_quem      record;
  v_motivo    text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_ctx       text := nullif(btrim(coalesce(p_contexto, '')), '');
  v_simular   boolean := COALESCE(p_simular, false);
  v_hoje      date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_fim_ant   date;
  v_novo      date;
  v_dias      integer;
  v_obra_ant  date;
  v_obra_novo date;
  v_estim     integer;
  v_id        uuid;
  v_fila      uuid[];
  v_atual     uuid;
  v_cfim      date;
  v_cant      date;
  v_antes     jsonb := '{}'::jsonb;   -- tarefa → fim antes de ser empurrada
  v_mexidas   jsonb := '{}'::jsonb;   -- tarefa → {nome, datas antes e depois}
  v_d         record;
  v_req       date;
  v_nf        date;
  v_passos    integer := 0;
  v_res       jsonb;
BEGIN
  SELECT t.*, o.estado AS obra_estado, o.supervisor_id AS obra_supervisor, o.minutos_por_dia AS mpd
    INTO v_t
    FROM public.ops_obra_tarefa t JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(v_t.organization_id) q;
  IF NOT (
       (v_quem.funcao IN ('admin','gestor') AND public.ops_pode(v_t.organization_id, 'operations.orders.edit'))
    OR (v_t.obra_supervisor = v_quem.utilizador_id
        AND public.ops_pode(v_t.organization_id, 'operations.orders.confirm'))
    OR (EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa
                 WHERE tarefa_id = p_tarefa_id AND utilizador_id = v_quem.utilizador_id)
        AND public.ops_pode(v_t.organization_id, 'operations.orders.execute'))
  ) THEN
    RAISE EXCEPTION 'Só quem está na tarefa, o supervisor da obra ou o gestor registam um atraso.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está %; já não se registam atrasos.', v_t.obra_estado;
  END IF;
  IF v_t.estado NOT IN ('por_fazer','em_curso','rejeitada') THEN
    RAISE EXCEPTION 'Esta tarefa já está %. Um atraso regista-se antes de acabar.', replace(v_t.estado, '_', ' ');
  END IF;

  -- Na pré-visualização ainda se está a escrever: só as contas importam.
  IF NOT v_simular THEN
    IF v_motivo IS NULL OR v_motivo NOT IN ('secagem','condicoes_edificio','material_em_falta',
         'trabalho_imprevisto','acesso_cliente','meteorologia','equipa','outro') THEN
      RAISE EXCEPTION 'Escolhe o motivo do atraso.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_ctx IS NULL OR length(v_ctx) < 5 THEN
      RAISE EXCEPTION 'Escreve o contexto do atraso (pelo menos 5 letras): é o que o supervisor e o cliente vão ler.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF p_minutos_extra IS NOT NULL AND p_minutos_extra <= 0 THEN
    RAISE EXCEPTION 'O tempo a mais tem de ser maior que zero.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_minutos_extra IS NULL AND p_novo_fim IS NULL THEN
    RAISE EXCEPTION 'Diz quanto tempo a mais (horas ou dias) ou a nova data de fim.' USING ERRCODE = 'check_violation';
  END IF;

  v_fim_ant := COALESCE(v_t.fim_planeado, v_t.inicio_planeado);
  IF p_novo_fim IS NOT NULL THEN
    IF v_fim_ant IS NOT NULL AND p_novo_fim < v_fim_ant THEN
      RAISE EXCEPTION 'A nova data de fim (%) é antes do fim previsto (%). Um atraso só empurra para a frente.',
        to_char(p_novo_fim, 'DD/MM/YYYY'), to_char(v_fim_ant, 'DD/MM/YYYY') USING ERRCODE = 'check_violation';
    END IF;
    IF p_novo_fim < v_hoje THEN
      RAISE EXCEPTION 'A nova data de fim já passou.' USING ERRCODE = 'check_violation';
    END IF;
    v_novo := p_novo_fim;
  ELSE
    v_dias := ceil(p_minutos_extra::numeric / GREATEST(v_t.pessoas_previstas, 1) / GREATEST(v_t.mpd, 1))::integer;
    IF v_fim_ant IS NULL OR v_fim_ant < v_hoje THEN
      v_novo := public.ops_obra_somar_dias_uteis(v_hoje, GREATEST(v_dias - 1, 0));
    ELSE
      v_novo := public.ops_obra_somar_dias_uteis(v_fim_ant, v_dias);
    END IF;
  END IF;

  SELECT max(COALESCE(fim_planeado, inicio_planeado)) INTO v_obra_ant
    FROM public.ops_obra_tarefa WHERE obra_id = v_t.obra_id;

  BEGIN
    -- A tarefa: plano original (uma vez), novo fim, nova estimativa.
    UPDATE public.ops_obra_tarefa
       SET inicio_original = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                  THEN inicio_planeado ELSE inicio_original END,
           fim_original    = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                  THEN fim_planeado ELSE fim_original END,
           fim_planeado    = v_novo,
           minutos_estimativa = CASE WHEN p_minutos_extra IS NULL THEN minutos_estimativa
                                     ELSE COALESCE(minutos_estimativa, minutos_previstos) + p_minutos_extra END,
           atualizada_em   = now()
     WHERE id = p_tarefa_id
     RETURNING minutos_estimativa INTO v_estim;

    -- As dependentes, em cadeia (sem ciclos: o trigger das dependências não deixa).
    IF COALESCE(p_empurrar, true) THEN
      v_antes := jsonb_build_object(p_tarefa_id::text, v_fim_ant);
      v_fila := ARRAY[p_tarefa_id];
      WHILE COALESCE(array_length(v_fila, 1), 0) > 0 AND v_passos < 5000 LOOP
        v_passos := v_passos + 1;
        v_atual := v_fila[1];
        v_fila := v_fila[2:array_length(v_fila, 1)];
        SELECT COALESCE(fim_planeado, inicio_planeado) INTO v_cfim FROM public.ops_obra_tarefa WHERE id = v_atual;
        CONTINUE WHEN v_cfim IS NULL;
        v_cant := (v_antes ->> v_atual::text)::date;

        FOR v_d IN
          SELECT d.id, d.nome, d.inicio_planeado AS ini, COALESCE(d.fim_planeado, d.inicio_planeado) AS fim
            FROM public.ops_obra_tarefa_dependencia x
            JOIN public.ops_obra_tarefa d ON d.id = x.tarefa_id
           WHERE x.depende_de_id = v_atual
             AND d.estado = 'por_fazer' AND d.inicio_planeado IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.ops_obra_registo r WHERE r.tarefa_id = d.id)
           ORDER BY d.inicio_planeado, d.id
        LOOP
          -- Começava no dia seguinte ao fim da anterior → continua no dia
          -- seguinte ao novo fim; começava no próprio dia → no próprio dia.
          v_req := CASE WHEN v_cant IS NOT NULL AND v_d.ini > v_cant
                        THEN public.ops_obra_somar_dias_uteis(v_cfim, 1)
                        ELSE public.ops_obra_somar_dias_uteis(v_cfim, 0) END;
          CONTINUE WHEN v_d.ini >= v_req;
          v_nf := public.ops_obra_somar_dias_uteis(v_req, public.ops_obra_dias_uteis_entre(v_d.ini, v_d.fim));

          UPDATE public.ops_obra_tarefa
             SET inicio_original = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                        THEN inicio_planeado ELSE inicio_original END,
                 fim_original    = CASE WHEN inicio_original IS NULL AND fim_original IS NULL
                                        THEN fim_planeado ELSE fim_original END,
                 inicio_planeado = v_req,
                 fim_planeado    = v_nf,
                 atualizada_em   = now()
           WHERE id = v_d.id;

          IF NOT (v_mexidas ? v_d.id::text) THEN
            v_mexidas := v_mexidas || jsonb_build_object(v_d.id::text, jsonb_build_object(
              'tarefa_id', v_d.id, 'nome', v_d.nome, 'inicio_anterior', v_d.ini, 'fim_anterior', v_d.fim));
            v_antes := v_antes || jsonb_build_object(v_d.id::text, v_d.fim);
          END IF;
          v_mexidas := jsonb_set(v_mexidas, ARRAY[v_d.id::text, 'novo_inicio'], to_jsonb(v_req));
          v_mexidas := jsonb_set(v_mexidas, ARRAY[v_d.id::text, 'novo_fim'], to_jsonb(v_nf));
          v_fila := v_fila || v_d.id;
        END LOOP;
      END LOOP;
    END IF;

    SELECT max(COALESCE(fim_planeado, inicio_planeado)) INTO v_obra_novo
      FROM public.ops_obra_tarefa WHERE obra_id = v_t.obra_id;

    IF NOT v_simular THEN
      INSERT INTO public.ops_obra_tarefa_atraso
        (organization_id, obra_id, tarefa_id, motivo, contexto, minutos_extra, novo_fim, fim_anterior, registado_por)
      VALUES
        (v_t.organization_id, v_t.obra_id, p_tarefa_id, v_motivo, v_ctx, p_minutos_extra, v_novo,
         v_t.fim_planeado, v_quem.utilizador_id)
      RETURNING id INTO v_id;

      PERFORM public.ops_obra_evento(v_t.organization_id, v_t.obra_id, 'atraso',
        v_t.nome || ': ' || v_ctx, v_quem.utilizador_id,
        jsonb_build_object('tarefa_id', p_tarefa_id, 'atraso_id', v_id, 'motivo', v_motivo,
                           'minutos_extra', p_minutos_extra, 'fim_anterior', v_t.fim_planeado,
                           'novo_fim', v_novo, 'empurradas', (SELECT count(*) FROM jsonb_object_keys(v_mexidas)),
                           'fim_obra_anterior', v_obra_ant, 'fim_obra_novo', v_obra_novo));
    END IF;

    v_res := jsonb_build_object(
      'ok', true,
      'simulado', v_simular,
      'atraso_id', v_id,
      'fim_anterior', v_t.fim_planeado,
      'novo_fim', v_novo,
      'minutos_estimativa', v_estim,
      'empurradas', COALESCE((SELECT jsonb_agg(e.value ORDER BY e.value->>'novo_inicio', e.value->>'nome')
                                FROM jsonb_each(v_mexidas) e), '[]'::jsonb),
      'fim_obra_anterior', v_obra_ant,
      'fim_obra_novo', v_obra_novo);

    IF v_simular THEN
      -- Desfaz tudo o que este bloco mudou; as contas ficam em v_res.
      RAISE EXCEPTION 'simulação' USING ERRCODE = 'OB001';
    END IF;
  EXCEPTION WHEN SQLSTATE 'OB001' THEN
    NULL;
  END;

  RETURN v_res;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_registar_atraso(uuid, text, text, integer, date, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_atraso(uuid, text, text, integer, date, boolean, boolean)
  TO authenticated, service_role;

-- "Cliente avisado" (com o que se lhe disse). Supervisor da obra ou
-- gestor/admin. Marcar outra vez não muda nada (fica quem avisou primeiro).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_cliente_avisado(p_atraso_id uuid, p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_a    record;
  v_quem record;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
BEGIN
  SELECT a.*, o.supervisor_id AS obra_supervisor, o.estado AS obra_estado, t.nome AS tarefa_nome
    INTO v_a
    FROM public.ops_obra_tarefa_atraso a
    JOIN public.ops_obra o ON o.id = a.obra_id
    JOIN public.ops_obra_tarefa t ON t.id = a.tarefa_id
   WHERE a.id = p_atraso_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atraso não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(v_a.organization_id) q;
  IF NOT (
       (v_quem.funcao IN ('admin','gestor') AND public.ops_pode(v_a.organization_id, 'operations.orders.edit'))
    OR (v_a.obra_supervisor = v_quem.utilizador_id
        AND public.ops_pode(v_a.organization_id, 'operations.orders.confirm'))
  ) THEN
    RAISE EXCEPTION 'Só o supervisor da obra ou o gestor marcam o cliente como avisado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_a.cliente_avisado THEN
    RETURN jsonb_build_object('ok', true, 'ja_avisado', true, 'cliente_avisado_em', v_a.cliente_avisado_em);
  END IF;

  UPDATE public.ops_obra_tarefa_atraso
     SET cliente_avisado = true, cliente_avisado_em = now(),
         cliente_avisado_por = v_quem.utilizador_id, nota_cliente = v_nota
   WHERE id = p_atraso_id;

  PERFORM public.ops_obra_evento(v_a.organization_id, v_a.obra_id, 'cliente_avisado',
    v_a.tarefa_nome || COALESCE(': ' || v_nota, ''), v_quem.utilizador_id,
    jsonb_build_object('atraso_id', p_atraso_id, 'tarefa_id', v_a.tarefa_id, 'nota', v_nota));

  RETURN jsonb_build_object('ok', true, 'ja_avisado', false);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_cliente_avisado(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_cliente_avisado(uuid, text) TO authenticated, service_role;


-- ============================================================
-- 12. Previsto contra real — tempo e custo de mão de obra
-- ============================================================
-- Tempo: toda a gente que vê a obra. Custo: só quem tem `costs.view` nesta
-- organização. custo/hora não sai daqui por nenhuma outra porta.
--
-- Custo previsto = minutos previstos × custo/hora médio das pessoas na
-- tarefa (sem ninguém atribuído, a média da organização).
-- Custo real = minutos de cada pessoa × o custo/hora dessa pessoa.
-- Orçado = mão de obra das linhas do orçamento de origem, se houver.

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_custos(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o        record;
  v_custos   boolean;
  v_media    numeric;
  v_r        jsonb;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada, ou sem permissão para a ver.' USING ERRCODE = 'no_data_found';
  END IF;

  v_custos := public.ops_pode(v_o.organization_id, 'operations.costs.view');

  SELECT avg(custo_hora) INTO v_media FROM public.ops_utilizador_perfil
   WHERE organization_id = v_o.organization_id AND ativo AND custo_hora IS NOT NULL;

  WITH tarefas AS (
    SELECT t.id, t.fase_id, t.minutos_previstos,
           public.ops_obra_minutos_reais(t.id) AS minutos_reais,
           (SELECT avg(p.custo_hora) FROM public.ops_obra_tarefa_pessoa tp
              JOIN public.ops_utilizador_perfil p
                ON p.utilizador_id = tp.utilizador_id AND p.organization_id = t.organization_id
             WHERE tp.tarefa_id = t.id) AS custo_hora_medio
      FROM public.ops_obra_tarefa t WHERE t.obra_id = p_obra_id
  ),
  pessoas AS (
    SELECT r.utilizador_id,
           round(sum(EXTRACT(EPOCH FROM (COALESCE(r.fim, now()) - r.inicio))) / 60.0, 1) AS minutos,
           max(p.custo_hora) AS custo_hora
      FROM public.ops_obra_registo r
      LEFT JOIN public.ops_utilizador_perfil p
        ON p.utilizador_id = r.utilizador_id AND p.organization_id = r.organization_id
     WHERE r.obra_id = p_obra_id
     GROUP BY r.utilizador_id
  )
  SELECT jsonb_build_object(
    'obra_id', p_obra_id,
    've_custos', v_custos,
    'minutos_previstos', (SELECT COALESCE(sum(minutos_previstos), 0) FROM tarefas),
    'minutos_reais', (SELECT COALESCE(sum(minutos_reais), 0) FROM tarefas),
    'por_fase', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'fase_id', f.id, 'ordem', f.ordem, 'nome', f.nome,
               'minutos_previstos', COALESCE(x.prev, 0), 'minutos_reais', COALESCE(x.reais, 0))
             ORDER BY f.ordem), '[]'::jsonb)
        FROM public.ops_obra_fase f
        LEFT JOIN (SELECT fase_id, sum(minutos_previstos) prev, sum(minutos_reais) reais
                     FROM tarefas GROUP BY fase_id) x ON x.fase_id = f.id
       WHERE f.obra_id = p_obra_id),
    'por_pessoa', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'utilizador_id', pe.utilizador_id,
               'nome', COALESCE(u.name, 'Sem nome'),
               'minutos', pe.minutos,
               'custo', CASE WHEN v_custos AND pe.custo_hora IS NOT NULL
                             THEN round(pe.minutos / 60.0 * pe.custo_hora, 2) END,
               'sem_tarifa', CASE WHEN v_custos THEN pe.custo_hora IS NULL END)
             ORDER BY pe.minutos DESC), '[]'::jsonb)
        FROM pessoas pe LEFT JOIN public.anew_users u ON u.id = pe.utilizador_id),
    'custo_previsto', CASE WHEN v_custos THEN (
       SELECT round(COALESCE(sum(minutos_previstos / 60.0 * COALESCE(custo_hora_medio, v_media, 0)), 0), 2)
         FROM tarefas) END,
    'custo_real', CASE WHEN v_custos THEN (
       SELECT round(COALESCE(sum(minutos / 60.0 * COALESCE(custo_hora, 0)), 0), 2) FROM pessoas) END,
    'sem_tarifa', CASE WHEN v_custos THEN (
       SELECT count(*) FROM pessoas WHERE custo_hora IS NULL) END,
    'orcado_mao_obra', CASE WHEN v_custos AND v_o.orcamento_id IS NOT NULL THEN (
       SELECT round(COALESCE(sum(COALESCE(l.custo_mao_obra_unit, 0) * COALESCE(l.qt, 1)), 0), 2)
         FROM public.quote_lines l
         JOIN public.quotes q ON q.id = l.quote_id
        WHERE l.quote_id = v_o.orcamento_id AND q.organization_id = v_o.organization_id) END
  ) INTO v_r;

  RETURN v_r;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_custos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_custos(uuid) TO authenticated, service_role;


-- ============================================================
-- 13. Vistas de leitura (security_invoker: a RLS de cima aplica-se)
-- ============================================================

-- Uma linha por tarefa, com a fase, a obra, o tempo real e quem lá está.
CREATE OR REPLACE VIEW public.ops_v_obra_tarefa
WITH (security_invoker = true) AS
SELECT
  t.id, t.organization_id, t.obra_id, t.fase_id, t.modelo_tarefa_id, t.ordem, t.nome,
  t.procedimento, t.materiais, t.ferramentas, t.minutos_previstos,
  t.inicio_planeado, t.fim_planeado, t.depende_de, t.estado,
  t.iniciada_em, t.terminada_em, t.motivo_desvio, t.nota_desvio,
  t.validada_por, t.validada_em, t.motivo_rejeicao,
  f.ordem AS fase_ordem, f.nome AS fase_nome,
  o.codigo AS obra_codigo, o.titulo AS obra_titulo, o.estado AS obra_estado,
  o.morada AS obra_morada, o.tolerancia_percent,
  COALESCE(r.minutos_reais, 0)::numeric(12,1) AS minutos_reais,
  COALESCE(r.a_correr, 0)::integer AS a_correr,
  COALESCE(p.pessoas, ARRAY[]::uuid[]) AS pessoas,
  -- Novas no fim (CREATE OR REPLACE VIEW só acrescenta colunas no fim):
  -- todas as tarefas de que esta depende (setas do Gantt) e os materiais
  -- do CRM ligados no passo "Serviços do contrato".
  COALESCE(dp.dependencias, ARRAY[]::uuid[]) AS dependencias,
  t.materiais_crm,
  -- Atrasos (secção 11b): o plano original, a estimativa final, quantos
  -- atrasos, o último, e "devia ter começado e não começou".
  t.inicio_original, t.fim_original, t.minutos_estimativa,
  COALESCE(atr.n, 0)::integer AS n_atrasos,
  atr.ultimo AS ultimo_atraso,
  public.ops_obra_atrasada_inicio(t.estado, t.inicio_planeado, o.hora_inicio_dia) AS atrasada_inicio,
  -- Para o ecrã do atraso converter "mais 2 h" em mão de obra (pessoa × min).
  t.pessoas_previstas, o.minutos_por_dia
FROM public.ops_obra_tarefa t
JOIN public.ops_obra_fase f ON f.id = t.fase_id
JOIN public.ops_obra o ON o.id = t.obra_id
LEFT JOIN LATERAL (
  SELECT round(sum(EXTRACT(EPOCH FROM (COALESCE(x.fim, now()) - x.inicio))) / 60.0, 1) AS minutos_reais,
         count(*) FILTER (WHERE x.fim IS NULL) AS a_correr
    FROM public.ops_obra_registo x WHERE x.tarefa_id = t.id
) r ON true
LEFT JOIN LATERAL (
  SELECT array_agg(tp.utilizador_id ORDER BY tp.atribuida_em) AS pessoas
    FROM public.ops_obra_tarefa_pessoa tp WHERE tp.tarefa_id = t.id
) p ON true
LEFT JOIN LATERAL (
  SELECT array_agg(d.depende_de_id ORDER BY d.criada_em, d.depende_de_id) AS dependencias
    FROM public.ops_obra_tarefa_dependencia d WHERE d.tarefa_id = t.id
) dp ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n,
         (SELECT jsonb_build_object(
                   'id', a2.id, 'motivo', a2.motivo, 'contexto', a2.contexto,
                   'minutos_extra', a2.minutos_extra, 'novo_fim', a2.novo_fim,
                   'fim_anterior', a2.fim_anterior, 'registado_em', a2.registado_em,
                   'registado_por', a2.registado_por, 'cliente_avisado', a2.cliente_avisado)
            FROM public.ops_obra_tarefa_atraso a2 WHERE a2.tarefa_id = t.id
           ORDER BY a2.registado_em DESC, a2.id DESC LIMIT 1) AS ultimo
    FROM public.ops_obra_tarefa_atraso a WHERE a.tarefa_id = t.id
) atr ON true;

-- Uma linha por obra: o resumo da lista.
CREATE OR REPLACE VIEW public.ops_v_obra_resumo
WITH (security_invoker = true) AS
SELECT
  o.id, o.organization_id, o.codigo, o.titulo, o.estado, o.cliente_id,
  o.orcamento_id, o.contrato_id, o.modelo_id, o.morada,
  o.data_inicio_prevista, o.gestor_id, o.supervisor_id, o.tolerancia_percent,
  o.criada_em,
  COALESCE(x.n_tarefas, 0)::integer       AS n_tarefas,
  COALESCE(x.n_feitas, 0)::integer        AS n_feitas,
  COALESCE(x.n_validadas, 0)::integer     AS n_validadas,
  COALESCE(x.n_por_validar, 0)::integer   AS n_por_validar,
  COALESCE(x.minutos_previstos, 0)::integer AS minutos_previstos,
  COALESCE(x.minutos_reais, 0)::numeric(12,1) AS minutos_reais,
  x.inicio_planeado, x.fim_planeado,
  COALESCE(e.n_extras, 0)::integer        AS n_extras,
  -- Atrasos (secção 11b): o fim do plano ORIGINAL (o maior dos fins
  -- originais, ou o planeado de quem nunca mexeu) e quantos alertas há.
  x.fim_original,
  COALESCE(al.n_alertas, 0)::integer      AS n_alertas
FROM public.ops_obra o
LEFT JOIN LATERAL (
  SELECT count(*) AS n_tarefas,
         max(COALESCE(v.fim_original, v.fim_planeado)) AS fim_original,
         count(*) FILTER (WHERE v.estado IN ('feita','validada')) AS n_feitas,
         count(*) FILTER (WHERE v.estado = 'validada') AS n_validadas,
         count(*) FILTER (WHERE v.estado = 'feita') AS n_por_validar,
         sum(v.minutos_previstos) AS minutos_previstos,
         sum(v.minutos_reais) AS minutos_reais,
         min(v.inicio_planeado) AS inicio_planeado,
         max(v.fim_planeado) AS fim_planeado
    FROM public.ops_v_obra_tarefa v WHERE v.obra_id = o.id
) x ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n_extras FROM public.ops_obra_extra e
   WHERE e.obra_id = o.id AND e.estado IN ('registado','aprovado')
) e ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n_alertas FROM public.ops_obra_alertas_lista(o.organization_id, o.id)
) al ON true;

-- Alertas: tarefas abertas a ≥ 80 % do previsto. Os limiares são os de
-- `nivelDeAlerta()` em src/domain/obras.ts.
CREATE OR REPLACE VIEW public.ops_v_obra_alerta
WITH (security_invoker = true) AS
SELECT
  v.id AS tarefa_id, v.organization_id, v.obra_id, v.obra_codigo, v.nome,
  v.estado, v.minutos_previstos, v.minutos_reais, v.a_correr,
  CASE WHEN v.minutos_reais > v.minutos_previstos THEN 'excedido' ELSE 'aviso' END AS nivel
FROM public.ops_v_obra_tarefa v
WHERE v.estado IN ('por_fazer','em_curso','rejeitada')
  AND v.minutos_reais >= 0.8 * v.minutos_previstos;

-- Choques de agenda (para o Gantt). NÃO é security_invoker, de propósito:
-- como invoker, a RLS das 5 tabelas era avaliada linha a linha ANTES do
-- filtro `obra_id = …` (as policies chamam funções e funcionam como
-- barreira), num cruzamento de todas as atribuições de cada pessoa com
-- todas as outras — milhares de verificações por pedido, até o Postgres o
-- cancelar por tempo e pesar na base inteira. Assim o filtro da obra desce
-- primeiro, e a visibilidade verifica-se nas poucas linhas que sobram:
--   · a linha só existe para quem vê a obra da tarefa (ops_pode_ver_obra);
--   · da OUTRA obra, só se mostra o nome e o código a quem também a vê.
--   · UM choque por tarefa, pessoa e OUTRA obra (a 1.ª tarefa em conflito
--     nessa obra): com a mesma equipa em várias obras, todas as combinações
--     eram milhares de linhas — e o Gantt congelava a desenhá-las.
DROP VIEW IF EXISTS public.ops_v_obra_conflito;
CREATE VIEW public.ops_v_obra_conflito AS
SELECT
  c.tarefa_id, c.utilizador_id, c.obra_id, c.organization_id,
  c.outra_tarefa_id,
  CASE WHEN public.ops_pode_ver_obra(c.outra_obra_id) THEN c.outra_tarefa_nome ELSE 'Tarefa noutra obra' END AS outra_tarefa,
  CASE WHEN public.ops_pode_ver_obra(c.outra_obra_id) THEN c.outra_obra_codigo ELSE 'outra obra' END AS outra_obra,
  c.outro_inicio, c.outro_fim
FROM (
  -- t.obra_id À CABEÇA do DISTINCT ON: só assim o filtro `obra_id = …` de quem
  -- lê a vista desce para dentro do cálculo. Sem isto, calculavam-se os
  -- choques de TODAS as obras a cada pedido (timeout com dezenas de obras).
  SELECT DISTINCT ON (t.obra_id, tp.tarefa_id, tp.utilizador_id, t2.obra_id)
    tp.tarefa_id, tp.utilizador_id, t.obra_id, t.organization_id,
    t2.id AS outra_tarefa_id, t2.nome AS outra_tarefa_nome, t2.obra_id AS outra_obra_id,
    o2.codigo AS outra_obra_codigo, t2.inicio_planeado AS outro_inicio, t2.fim_planeado AS outro_fim
  FROM public.ops_obra_tarefa t
  JOIN public.ops_obra_tarefa_pessoa tp ON tp.tarefa_id = t.id
  JOIN public.ops_obra_tarefa_pessoa tp2 ON tp2.utilizador_id = tp.utilizador_id AND tp2.obra_id <> t.obra_id
  JOIN public.ops_obra_tarefa t2 ON t2.id = tp2.tarefa_id
  JOIN public.ops_obra o2 ON o2.id = t2.obra_id
  WHERE t.estado IN ('por_fazer','em_curso','rejeitada')
    AND t2.estado IN ('por_fazer','em_curso','rejeitada')
    AND o2.estado IN ('planeada','em_curso')
    AND t.inicio_planeado IS NOT NULL AND t2.inicio_planeado IS NOT NULL
    AND daterange(t.inicio_planeado, COALESCE(t.fim_planeado, t.inicio_planeado), '[]')
     && daterange(t2.inicio_planeado, COALESCE(t2.fim_planeado, t2.inicio_planeado), '[]')
    AND public.ops_pode_ver_obra(t.obra_id)
  ORDER BY t.obra_id, tp.tarefa_id, tp.utilizador_id, t2.obra_id, t2.inicio_planeado, t2.id
) c;

-- Os índices que este cruzamento usa.
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_pessoa_tarefa_idx ON public.ops_obra_tarefa_pessoa (tarefa_id);
CREATE INDEX IF NOT EXISTS ops_obra_tarefa_pessoa_obra_idx   ON public.ops_obra_tarefa_pessoa (obra_id);

REVOKE ALL ON public.ops_v_obra_tarefa, public.ops_v_obra_resumo,
              public.ops_v_obra_alerta, public.ops_v_obra_conflito FROM PUBLIC, anon;
GRANT SELECT ON public.ops_v_obra_tarefa, public.ops_v_obra_resumo,
                public.ops_v_obra_alerta, public.ops_v_obra_conflito TO authenticated, service_role;


-- ============================================================
-- 14. Do CRM, só leitura: contratos assinados que podem virar obra
-- ============================================================
-- Igual a `ops_v_orcamento` (orcamentos.sql): security_invoker, para a RLS
-- do CRM continuar a mandar. Criada só se `client_contracts` existir — uma
-- base sem o módulo de contratos instala o resto na mesma.

DO $contratos$
DECLARE
  v_tem_servico boolean;
  v_tem_produto boolean;
  v_servicos    text;
  v_produtos    text;
BEGIN
  IF to_regclass('public.client_contracts') IS NULL THEN
    RAISE NOTICE 'client_contracts não existe: ops_v_contrato fica por criar.';
    RETURN;
  END IF;

  -- As contagens só se as colunas existirem (uma base sem catálogo instala na mesma).
  SELECT bool_or(column_name = 'service_id'), bool_or(column_name = 'product_id')
    INTO v_tem_servico, v_tem_produto
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'quote_lines';
  v_servicos := CASE WHEN v_tem_servico
    THEN '(SELECT count(*)::int FROM public.quote_lines l WHERE l.quote_id = r.orcamento_id AND l.service_id IS NOT NULL)'
    ELSE 'NULL::int' END;
  v_produtos := CASE WHEN v_tem_produto
    THEN '(SELECT count(*)::int FROM public.quote_lines l WHERE l.quote_id = r.orcamento_id'
         || CASE WHEN v_tem_servico THEN ' AND l.service_id IS NULL' ELSE '' END
         || ' AND l.product_id IS NOT NULL)'
    ELSE 'NULL::int' END;

  EXECUTE $v$
    CREATE OR REPLACE VIEW public.ops_v_contrato
    WITH (security_invoker = true) AS
    SELECT
      c.id,
      c.organization_id,
      c.client_id                                           AS cliente_id,
      COALESCE(c.contract_number, '—')                      AS numero,
      c.status                                              AS estado,
      r.orcamento_id                                        AS orcamento_id,
      COALESCE(nullif(btrim(q.title), ''), 'Contrato ' || COALESCE(c.contract_number, '')) AS titulo,
      q.obra_endereco,
      COALESCE(c.signature_date, c.company_signature_date, c.accepted_at) AS assinado_em,
      c.total_value                                         AS valor,
      c.currency                                            AS moeda,
      EXISTS (SELECT 1 FROM public.ops_obra o
               WHERE o.contrato_id = c.id AND o.estado <> 'cancelada') AS tem_obra,
      -- Para destacar na Nova obra quais trazem serviços (viram tarefas) e quais não.
      $v$ || v_servicos || $v$ AS n_servicos,
      $v$ || v_produtos || $v$ AS n_produtos
    FROM public.client_contracts c
    CROSS JOIN LATERAL (SELECT public.ops_contrato_orcamento(c.id) AS orcamento_id) r
    LEFT JOIN public.quotes q ON q.id = r.orcamento_id AND q.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
      AND c.status IN ('signed','assinado','active')
  $v$;

  EXECUTE 'REVOKE ALL ON public.ops_v_contrato FROM PUBLIC, anon';
  EXECUTE 'GRANT SELECT ON public.ops_v_contrato TO authenticated, service_role';
END
$contratos$;


-- ============================================================
-- 15. RLS — leitura por `ops_pode`, escrita só por RPC
-- ============================================================

ALTER TABLE public.ops_obra               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_fase          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_tarefa        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_tarefa_pessoa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_registo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_extra         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_modelo        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_modelo_fase   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_modelo_tarefa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_servico_tarefa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_tarefa_dependencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_obra_tarefa_atraso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_obra_servico_tarefa_select ON public.ops_obra_servico_tarefa;
CREATE POLICY ops_obra_servico_tarefa_select ON public.ops_obra_servico_tarefa
  FOR SELECT TO authenticated USING (public.ops_obra_pode_ver_modelos(organization_id));

DROP POLICY IF EXISTS ops_obra_select ON public.ops_obra;
CREATE POLICY ops_obra_select ON public.ops_obra
  FOR SELECT TO authenticated USING (public.ops_pode_ver_obra(id));

DO $pol$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_obra_fase','ops_obra_tarefa','ops_obra_tarefa_pessoa',
                           'ops_obra_registo','ops_obra_extra','ops_obra_tarefa_dependencia',
                           'ops_obra_tarefa_atraso']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.ops_pode_ver_obra(obra_id))',
      t || '_select', t);
  END LOOP;

  FOREACH t IN ARRAY ARRAY['ops_obra_modelo','ops_obra_modelo_fase','ops_obra_modelo_tarefa']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.ops_pode(organization_id, %L))',
      t || '_select', t, 'operations.view');
  END LOOP;

  -- Escrita direta: nenhuma. Nem policy, nem grant. Se schema.sql voltar a
  -- correr e der os grants de novo, a RLS sem policy de escrita continua a
  -- recusar.
  FOREACH t IN ARRAY ARRAY['ops_obra','ops_obra_fase','ops_obra_tarefa','ops_obra_tarefa_pessoa',
                           'ops_obra_registo','ops_obra_extra','ops_obra_modelo',
                           'ops_obra_modelo_fase','ops_obra_modelo_tarefa','ops_obra_servico_tarefa',
                           'ops_obra_tarefa_dependencia','ops_obra_tarefa_atraso']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$pol$;

COMMIT;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE
  n integer;
BEGIN
  -- As 12 deste ficheiro, pelo nome (outros ficheiros acrescentam as suas
  -- ops_obra_* — ex.: obras-fotos.sql — e este ficheiro tem de poder voltar
  -- a correr depois deles).
  SELECT count(*) INTO n FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename IN ('ops_obra','ops_obra_fase','ops_obra_tarefa','ops_obra_tarefa_pessoa',
                       'ops_obra_registo','ops_obra_extra','ops_obra_modelo','ops_obra_modelo_fase',
                       'ops_obra_modelo_tarefa','ops_obra_servico_tarefa','ops_obra_tarefa_dependencia',
                       'ops_obra_tarefa_atraso');
  IF n <> 12 THEN
    RAISE EXCEPTION 'Obras: esperadas 12 tabelas ops_obra*, encontradas %.', n;
  END IF;

  SELECT count(*) INTO n FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'ops\_obra%' AND NOT rowsecurity;
  IF n > 0 THEN
    RAISE EXCEPTION 'Obras: % tabela(s) sem RLS.', n;
  END IF;

  -- Zero chaves estrangeiras de ops_obra* para fora de ops_*.
  SELECT count(*) INTO n
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class f ON f.oid = c.confrelid
   WHERE c.contype = 'f' AND t.relname LIKE 'ops\_obra%' AND f.relname NOT LIKE 'ops\_%';
  IF n > 0 THEN
    RAISE EXCEPTION 'Obras: % chave(s) estrangeira(s) para o CRM. O CRM apaga a sério.', n;
  END IF;

  -- Nenhuma policy de escrita.
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename LIKE 'ops\_obra%' AND cmd <> 'SELECT';
  IF n > 0 THEN
    RAISE EXCEPTION 'Obras: % policy(ies) de escrita. A escrita é só por RPC.', n;
  END IF;

  -- Vistas sem security_invoker contornariam a RLS. (ops_v_obra_conflito é a
  -- exceção deliberada: filtra a visibilidade ela própria — ver acima.)
  SELECT count(*) INTO n FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
     AND c.relname IN ('ops_v_obra_tarefa','ops_v_obra_resumo','ops_v_obra_alerta',
                       'ops_v_contrato')
     AND NOT ('security_invoker=true' = ANY (COALESCE(c.reloptions, '{}')));
  IF n > 0 THEN
    RAISE EXCEPTION 'Obras: % vista(s) sem security_invoker.', n;
  END IF;

  -- Todas as funções SECURITY DEFINER de obras têm search_path fixo.
  SELECT count(*) INTO n FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND (p.proname LIKE 'rpc\_ops\_obra%' OR p.proname LIKE 'ops\_obra%' OR p.proname = 'ops_pode_ver_obra')
     AND p.prosecdef
     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) cfg WHERE cfg LIKE 'search_path=%');
  IF n > 0 THEN
    RAISE EXCEPTION 'Obras: % função(ões) SECURITY DEFINER sem search_path.', n;
  END IF;

  RAISE NOTICE 'Obras prontas: 12 tabelas com RLS, escrita só por RPC, nada escrito no CRM.';
END
$v$;
