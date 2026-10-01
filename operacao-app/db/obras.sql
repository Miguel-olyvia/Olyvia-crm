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

-- Espalha as tarefas pelo calendário, uma a seguir à outra, pela ordem
-- (fase, tarefa), com `minutos_por_dia` de capacidade. É o plano de partida;
-- o gestor arrasta depois no Gantt. Espelho de `planearSequencial()`.
CREATE OR REPLACE FUNCTION public.ops_obra_replanear_impl(_obra_id uuid, _inicio date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mpd    integer;
  v_cursor bigint := 0;
  v_n      integer := 0;
  r        record;
BEGIN
  SELECT minutos_por_dia INTO v_mpd FROM public.ops_obra WHERE id = _obra_id;

  FOR r IN
    SELECT t.id, t.minutos_previstos
      FROM public.ops_obra_tarefa t
      JOIN public.ops_obra_fase f ON f.id = t.fase_id
     WHERE t.obra_id = _obra_id
     ORDER BY f.ordem, t.ordem, t.criada_em
  LOOP
    UPDATE public.ops_obra_tarefa
       SET inicio_planeado = public.ops_obra_somar_dias_uteis(_inicio, (v_cursor / v_mpd)::integer),
           fim_planeado    = public.ops_obra_somar_dias_uteis(
                               _inicio, ((v_cursor + GREATEST(r.minutos_previstos, 1) - 1) / v_mpd)::integer),
           atualizada_em   = now()
     WHERE id = r.id;
    v_cursor := v_cursor + GREATEST(r.minutos_previstos, 1);
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.ops_obra SET data_inicio_prevista = _inicio, atualizada_em = now()
   WHERE id = _obra_id;
  RETURN v_n;
END
$$;

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
-- 7. Criar uma obra
-- ============================================================
-- Três portas: de um orçamento aceite, de um contrato assinado, ou em branco.
-- Em todas, a organização tem de bater certo com a fonte — um orçamento de
-- outra organização seria uma fuga de dados.

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
  _supervisor_id uuid
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
  f        record;
BEGIN
  v_codigo := public.ops_proximo_codigo_interno(_org, 'OB');

  INSERT INTO public.ops_obra (
    organization_id, codigo, cliente_id, orcamento_id, contrato_id, modelo_id,
    titulo, morada, data_inicio_prevista, gestor_id, supervisor_id, criada_por)
  VALUES (
    _org, v_codigo, _cliente_id, _orcamento_id, _contrato_id, _modelo_id,
    _titulo, nullif(btrim(coalesce(_morada,'')), ''), v_inicio,
    COALESCE(_gestor_id, _autor), _supervisor_id, _autor)
  RETURNING id INTO v_id;

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
  ELSE
    -- Em branco: as quatro fases por defeito. 3 e 4 a confirmar.
    INSERT INTO public.ops_obra_fase (organization_id, obra_id, ordem, nome)
    VALUES (_org, v_id, 1, 'Preparação e demolições'),
           (_org, v_id, 2, 'Instalações técnicas'),
           (_org, v_id, 3, 'Acabamentos'),
           (_org, v_id, 4, 'Limpeza e entrega');
  END IF;

  v_n := public.ops_obra_replanear_impl(v_id, v_inicio);

  PERFORM public.ops_obra_evento(_org, v_id, 'criada', _titulo, _autor,
    jsonb_build_object('codigo', v_codigo, 'orcamento_id', _orcamento_id,
                       'contrato_id', _contrato_id, 'modelo_id', _modelo_id, 'tarefas', v_n));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_codigo, 'tarefas', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_criar_impl(uuid, uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

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
  p_supervisor_id uuid    DEFAULT NULL
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
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.create', ARRAY['gestor'],
    'Só quem planeia abre obras.');

  -- Do contrato assinado.
  IF p_contrato_id IS NOT NULL THEN
    SELECT c.id, c.organization_id, c.client_id, c.contract_number, c.status,
           c.quote_id, c.notes
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
    v_titulo := COALESCE(v_titulo, 'Obra — contrato ' || COALESCE(v_c.contract_number, 's/ número'));
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
                          'Obra — orçamento ' || COALESCE(v_q.quote_number, ''));
    v_morada  := COALESCE(nullif(btrim(coalesce(v_morada,'')), ''), v_q.obra_endereco);
  END IF;

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Uma obra precisa de um título.';
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

  RETURN public.ops_obra_criar_impl(
    p_org, v_quem.o_utilizador, v_titulo, v_cliente, p_modelo_id, p_data_inicio,
    v_orc, p_contrato_id, v_morada, p_gestor_id, p_supervisor_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_criar(uuid, text, uuid, uuid, date, uuid, uuid, text, uuid, uuid)
  TO authenticated, service_role;


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
    'Só quem planeia mexe nas datas.');
  IF p_data_inicio IS NULL THEN
    RAISE EXCEPTION 'Falta a data de início.';
  END IF;
  v_n := public.ops_obra_replanear_impl(p_obra_id, public.ops_obra_somar_dias_uteis(p_data_inicio, 0));
  RETURN jsonb_build_object('ok', true, 'tarefas', v_n);
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

  IF v_t.depende_de IS NOT NULL THEN
    SELECT nome, estado INTO v_dep FROM public.ops_obra_tarefa WHERE id = v_t.depende_de;
    IF v_dep.estado NOT IN ('feita','validada') THEN
      RAISE EXCEPTION 'Esta tarefa depende de "%", que ainda não está feita.', v_dep.nome;
    END IF;
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
  COALESCE(p.pessoas, ARRAY[]::uuid[]) AS pessoas
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
) p ON true;

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
  COALESCE(e.n_extras, 0)::integer        AS n_extras
FROM public.ops_obra o
LEFT JOIN LATERAL (
  SELECT count(*) AS n_tarefas,
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
) e ON true;

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

-- Choques de agenda visíveis a quem consulta (para o Gantt).
CREATE OR REPLACE VIEW public.ops_v_obra_conflito
WITH (security_invoker = true) AS
SELECT
  tp.tarefa_id, tp.utilizador_id, t.obra_id, t.organization_id,
  t2.id AS outra_tarefa_id, t2.nome AS outra_tarefa, o2.codigo AS outra_obra,
  t2.inicio_planeado AS outro_inicio, t2.fim_planeado AS outro_fim
FROM public.ops_obra_tarefa_pessoa tp
JOIN public.ops_obra_tarefa t ON t.id = tp.tarefa_id
JOIN public.ops_obra_tarefa_pessoa tp2 ON tp2.utilizador_id = tp.utilizador_id AND tp2.tarefa_id <> tp.tarefa_id
JOIN public.ops_obra_tarefa t2 ON t2.id = tp2.tarefa_id
JOIN public.ops_obra o2 ON o2.id = t2.obra_id
WHERE t2.obra_id <> t.obra_id
  AND t.estado IN ('por_fazer','em_curso','rejeitada')
  AND t2.estado IN ('por_fazer','em_curso','rejeitada')
  AND o2.estado IN ('planeada','em_curso')
  AND t.inicio_planeado IS NOT NULL AND t2.inicio_planeado IS NOT NULL
  AND daterange(t.inicio_planeado, COALESCE(t.fim_planeado, t.inicio_planeado), '[]')
   && daterange(t2.inicio_planeado, COALESCE(t2.fim_planeado, t2.inicio_planeado), '[]');

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
BEGIN
  IF to_regclass('public.client_contracts') IS NULL THEN
    RAISE NOTICE 'client_contracts não existe: ops_v_contrato fica por criar.';
    RETURN;
  END IF;

  EXECUTE $v$
    CREATE OR REPLACE VIEW public.ops_v_contrato
    WITH (security_invoker = true) AS
    SELECT
      c.id,
      c.organization_id,
      c.client_id                                           AS cliente_id,
      COALESCE(c.contract_number, '—')                      AS numero,
      c.status                                              AS estado,
      c.quote_id                                            AS orcamento_id,
      COALESCE(nullif(btrim(q.title), ''), 'Contrato ' || COALESCE(c.contract_number, '')) AS titulo,
      q.obra_endereco,
      COALESCE(c.signature_date, c.company_signature_date, c.accepted_at) AS assinado_em,
      c.total_value                                         AS valor,
      c.currency                                            AS moeda,
      EXISTS (SELECT 1 FROM public.ops_obra o
               WHERE o.contrato_id = c.id AND o.estado <> 'cancelada') AS tem_obra
    FROM public.client_contracts c
    LEFT JOIN public.quotes q ON q.id = c.quote_id AND q.deleted_at IS NULL
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

DROP POLICY IF EXISTS ops_obra_select ON public.ops_obra;
CREATE POLICY ops_obra_select ON public.ops_obra
  FOR SELECT TO authenticated USING (public.ops_pode_ver_obra(id));

DO $pol$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_obra_fase','ops_obra_tarefa','ops_obra_tarefa_pessoa',
                           'ops_obra_registo','ops_obra_extra']
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
                           'ops_obra_modelo_fase','ops_obra_modelo_tarefa']
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
  SELECT count(*) INTO n FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'ops\_obra%';
  IF n <> 9 THEN
    RAISE EXCEPTION 'Obras: esperadas 9 tabelas ops_obra*, encontradas %.', n;
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

  -- Vistas sem security_invoker contornariam a RLS.
  SELECT count(*) INTO n FROM pg_class c
   WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'v'
     AND c.relname IN ('ops_v_obra_tarefa','ops_v_obra_resumo','ops_v_obra_alerta',
                       'ops_v_obra_conflito','ops_v_contrato')
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

  RAISE NOTICE 'Obras prontas: 9 tabelas com RLS, escrita só por RPC, nada escrito no CRM.';
END
$v$;
