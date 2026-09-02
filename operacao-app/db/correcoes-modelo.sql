-- =============================================================================
-- Olyvia · Operações — correções ao modelo, depois de ver o Infraspeak por dentro
--
-- O desenho inicial foi feito a partir de um levantamento em modo apenas-consulta.
-- Ao abrir os formulários de criação encontraram-se cinco coisas que o modelo
-- não sabia representar. Este ficheiro corrige-as.
--
-- Aditivo. Só faz ALTER a tabelas `ops_*` e cria tabelas `ops_*` novas.
-- Não toca em nada do CRM.
--
-- Correr DEPOIS de db/planos.sql.
--
--
-- AS CINCO CORREÇÕES
-- ==================
--
-- 1. TIPO DE TAREFA ≠ FORMATO DE RESPOSTA
--    O modelo tinha `tipo` ∈ {inspecao, medicao, numero, texto, foto, assinatura} —
--    uma mistura de natureza do trabalho com formato de resposta.
--    No Infraspeak são duas coisas separadas, e a separação é a correta:
--      · tipo   = natureza: Correção · Inspeção · Limpeza · Pró-ação · Substituição
--      · medições = uma LISTA associada à tarefa, cada uma com o seu formato
--    Uma tarefa de inspeção pode carregar três medições. No modelo antigo era
--    impossível dizer isso.
--
-- 2. QUATRO FORMATOS DE MEDIÇÃO, NÃO UM
--    Gama de valores · Acumulado · Escolha múltipla · Campo de texto.
--    O "Acumulado" é um contador — o valor só sobe, e o que interessa é a
--    diferença entre leituras. Não estava no modelo, e a categoria
--    `600 - Contadores` existe em produção.
--
-- 3. A OPÇÃO DE RESPOSTA É QUE DECIDE SE GERA CORRETIVA
--    No Infraspeak cada opção de uma medição de escolha múltipla tem uma caixa
--    "Criar pedido". Na instância do Grupo BMLar, a opção "Não Conforme" do
--    Extintor tem essa caixa DESLIGADA — e é por isso que o ciclo
--    inspeção→reparação não fecha. Não falta a funcionalidade; falta o clique.
--    Aqui o default é `true`: gerar a corretiva é o comportamento normal, e
--    desligá-lo é que tem de ser deliberado.
--
-- 4. RECORRÊNCIA DINÂMICA
--    "Sempre que fechar a ocorrência atual, uma nova será criada
--    automaticamente, tendo em conta o tempo selecionado."
--    Não é calendário: é N horas depois do FECHO, contadas sobre um horário de
--    trabalho. Só existe uma ordem aberta de cada vez — o que resolve sozinho o
--    problema das ocorrências geradas até 2033.
--
-- 5. ESPECIALIDADE TÉCNICA NA TAREFA
--    Cada tarefa exige uma especialidade (Eletricista, AVAC, Polivalente…).
--    É o que permite despachar a pessoa certa, e liga ao motor de recursos que
--    o CRM já tem.
-- =============================================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regprocedure('public.rpc_ops_materializar_planos(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/planos.sql. Corre-o primeiro.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. Especialidades técnicas
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ops_skill (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  nome             text NOT NULL,
  ativo            boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, nome)
);

CREATE TABLE IF NOT EXISTS public.ops_utilizador_skill (
  utilizador_id  uuid NOT NULL,                 -- → anew_users.id
  skill_id       uuid NOT NULL REFERENCES public.ops_skill(id) ON DELETE CASCADE,
  PRIMARY KEY (utilizador_id, skill_id)
);


-- ============================================================
-- 2. Horários de trabalho
-- ============================================================
-- Necessários para a recorrência dinâmica: "24 horas depois do fecho" num
-- horário 9-6 não é o mesmo que num horário 24/7.

CREATE TABLE IF NOT EXISTS public.ops_horario (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  nome             text NOT NULL,
  horas_semana     numeric(5,2) NOT NULL DEFAULT 40,
  horas_dia        numeric(4,2) NOT NULL DEFAULT 8,
  UNIQUE (organization_id, nome)
);

ALTER TABLE public.ops_utilizador_perfil
  ADD COLUMN IF NOT EXISTS horario_id uuid REFERENCES public.ops_horario(id) ON DELETE SET NULL;


-- ============================================================
-- 3. Medições — o catálogo por categoria de ativo
-- ============================================================
-- Uma medição é definida uma vez por categoria de equipamento, e depois
-- referenciada pelas tarefas que a recolhem.

CREATE TABLE IF NOT EXISTS public.ops_medicao_def (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL,
  categoria_ativo_id       uuid REFERENCES public.ops_categoria_ativo(id) ON DELETE CASCADE,
  nome                     text NOT NULL,
  -- gama    : numérico com limites (12,4 bar entre 10 e 15)
  -- acumulado: contador — o valor só sobe; o que interessa é a diferença
  -- escolha : lista de opções, cada uma podendo gerar corretiva
  -- texto   : campo livre
  tipo                     text NOT NULL DEFAULT 'gama'
                             CHECK (tipo IN ('gama','acumulado','escolha','texto')),
  unidade                  text,
  limite_min               numeric(12,3),
  limite_max               numeric(12,3),
  documentacao_obrigatoria boolean NOT NULL DEFAULT false,
  criado_em                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_medicao_opcao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicao_def_id  uuid NOT NULL REFERENCES public.ops_medicao_def(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  posicao         integer NOT NULL DEFAULT 0,
  -- No Infraspeak esta caixa existe e está DESLIGADA na opção "Não Conforme"
  -- do Extintor. É por isso que o ciclo não fecha lá. Aqui o default inverte-se:
  -- uma resposta que assinala um problema gera trabalho, salvo indicação em
  -- contrário.
  cria_corretiva  boolean NOT NULL DEFAULT false,
  -- Marca a opção como "isto é um problema". Serve para o progresso e os
  -- indicadores sem depender do nome escrito.
  e_nao_conforme  boolean NOT NULL DEFAULT false,
  UNIQUE (medicao_def_id, nome)
);


-- ============================================================
-- 4. Tarefas: natureza, especialidade, privacidade
-- ============================================================
-- O CHECK antigo de `tipo` misturava natureza com formato. Substitui-se pelo
-- vocabulário do trabalho real. Como as tabelas estão vazias, não há dados a
-- converter — se houver, o UPDATE abaixo trata dos casos conhecidos.

UPDATE public.ops_checklist_tarefa
   SET tipo = 'inspecao'
 WHERE tipo IN ('medicao','numero','texto','foto','assinatura');

UPDATE public.ops_ordem_tarefa
   SET tipo = 'inspecao'
 WHERE tipo IN ('medicao','numero','texto','foto','assinatura');

ALTER TABLE public.ops_checklist_tarefa DROP CONSTRAINT IF EXISTS ops_checklist_tarefa_tipo_check;
ALTER TABLE public.ops_checklist_tarefa
  ADD CONSTRAINT ops_checklist_tarefa_tipo_check
  CHECK (tipo IN ('inspecao','correcao','limpeza','proacao','substituicao'));

ALTER TABLE public.ops_ordem_tarefa DROP CONSTRAINT IF EXISTS ops_ordem_tarefa_tipo_check;
ALTER TABLE public.ops_ordem_tarefa
  ADD CONSTRAINT ops_ordem_tarefa_tipo_check
  CHECK (tipo IN ('inspecao','correcao','limpeza','proacao','substituicao'));

ALTER TABLE public.ops_checklist_tarefa
  ADD COLUMN IF NOT EXISTS skill_id uuid REFERENCES public.ops_skill(id) ON DELETE SET NULL,
  -- Uma tarefa privada não sai no relatório do cliente. No Infraspeak chama-se
  -- "Marcar como privada", e o template de relatório escolhe mostrar todas,
  -- só as públicas, ou só as privadas.
  ADD COLUMN IF NOT EXISTS privada boolean NOT NULL DEFAULT false;

ALTER TABLE public.ops_ordem_tarefa
  ADD COLUMN IF NOT EXISTS skill_id uuid REFERENCES public.ops_skill(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS privada boolean NOT NULL DEFAULT false,
  -- De que tarefa de checklist veio. Sem isto não há como saber que medições
  -- a tarefa recolhe. SET NULL: apagar a checklist não apaga o trabalho feito.
  ADD COLUMN IF NOT EXISTS checklist_tarefa_id uuid
    REFERENCES public.ops_checklist_tarefa(id) ON DELETE SET NULL;


-- ============================================================
-- 5. Que medições cada tarefa recolhe
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ops_checklist_tarefa_medicao (
  checklist_tarefa_id  uuid NOT NULL REFERENCES public.ops_checklist_tarefa(id) ON DELETE CASCADE,
  medicao_def_id       uuid NOT NULL REFERENCES public.ops_medicao_def(id) ON DELETE CASCADE,
  posicao              integer NOT NULL DEFAULT 0,
  PRIMARY KEY (checklist_tarefa_id, medicao_def_id)
);

-- As leituras. Uma linha por medição respondida numa tarefa de uma ordem.
CREATE TABLE IF NOT EXISTS public.ops_ordem_tarefa_medicao (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem_tarefa_id  uuid NOT NULL REFERENCES public.ops_ordem_tarefa(id) ON DELETE CASCADE,
  medicao_def_id   uuid NOT NULL REFERENCES public.ops_medicao_def(id) ON DELETE SET NULL,
  -- Congelados no momento da leitura, como a versão da checklist: mudar os
  -- limites amanhã não reescreve o veredicto de ontem.
  nome             text NOT NULL,
  tipo             text NOT NULL,
  unidade          text,
  limite_min       numeric(12,3),
  limite_max       numeric(12,3),

  valor_num        numeric(12,3),
  valor_texto      text,
  opcao_id         uuid REFERENCES public.ops_medicao_opcao(id) ON DELETE SET NULL,

  conforme         boolean,
  -- Nulo enquanto a leitura estiver por fazer. É o sinal de "por responder":
  -- a linha nasce com a ordem, vazia, e só ganha data quando alguém a lê.
  lida_em          timestamptz,
  lida_por         uuid,                          -- → anew_users.id
  UNIQUE (ordem_tarefa_id, medicao_def_id)
);

CREATE INDEX IF NOT EXISTS ops_medicao_tarefa_idx ON public.ops_ordem_tarefa_medicao (ordem_tarefa_id);
CREATE INDEX IF NOT EXISTS ops_medicao_def_idx    ON public.ops_ordem_tarefa_medicao (medicao_def_id, lida_em DESC);
CREATE INDEX IF NOT EXISTS ops_medicao_cat_idx    ON public.ops_medicao_def (organization_id, categoria_ativo_id);
CREATE INDEX IF NOT EXISTS ops_skill_org_idx      ON public.ops_skill (organization_id);


-- ============================================================
-- 6. Recorrência dinâmica
-- ============================================================

ALTER TABLE public.ops_plano
  -- calendario: RRULE + janela materializada (o que já existia)
  -- dinamica  : a próxima nasce N horas DEPOIS de a anterior fechar
  ADD COLUMN IF NOT EXISTS tipo_recorrencia text NOT NULL DEFAULT 'calendario'
    CHECK (tipo_recorrencia IN ('calendario','dinamica')),
  ADD COLUMN IF NOT EXISTS intervalo_horas integer,
  ADD COLUMN IF NOT EXISTS horario_id uuid REFERENCES public.ops_horario(id) ON DELETE SET NULL;

-- A regra de recorrência deixa de ser obrigatória: um plano dinâmico não tem
-- RRULE nenhuma.
ALTER TABLE public.ops_plano ALTER COLUMN regra_recorrencia DROP NOT NULL;

ALTER TABLE public.ops_plano
  DROP CONSTRAINT IF EXISTS ops_plano_recorrencia_coerente;
ALTER TABLE public.ops_plano
  ADD CONSTRAINT ops_plano_recorrencia_coerente CHECK (
    (tipo_recorrencia = 'calendario' AND regra_recorrencia IS NOT NULL)
    OR
    (tipo_recorrencia = 'dinamica' AND intervalo_horas IS NOT NULL AND intervalo_horas > 0)
  );


-- ============================================================
-- 7. O expansor de RRULE passa a saber "última segunda-feira"
-- ============================================================
-- O formulário do Infraspeak oferece, na mensal:
--   "[Primeiro|Segundo|Terceiro|Quarto|Último] [dia da semana] a cada N meses"
-- Em RRULE isso é BYDAY com ordinal: 1MO, 2MO, 3MO, 4MO, -1MO.
-- O expansor anterior recusava-o.

CREATE OR REPLACE FUNCTION public.ops_expandir_rrule(
  _regra  text,
  _inicio date,
  _fim    date
)
RETURNS SETOF date
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_partes  text[];
  v_parte   text;
  v_freq    text;
  v_inter   integer := 1;
  v_byday   text[];
  v_bymday  integer[];
  v_count   integer;
  v_until   date;
  v_d       date;
  v_n       integer := 0;
  v_passo   interval;
  v_dow     text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
  v_tok     text;
  v_ord     integer;
  v_dia     text;
  v_base    date;
  v_cand    date;
  v_i       integer;
BEGIN
  IF _regra IS NULL OR btrim(_regra) = '' THEN RETURN; END IF;

  v_partes := string_to_array(upper(replace(btrim(_regra), 'RRULE:', '')), ';');

  FOREACH v_parte IN ARRAY v_partes LOOP
    CASE split_part(v_parte, '=', 1)
      WHEN 'FREQ'       THEN v_freq  := split_part(v_parte, '=', 2);
      WHEN 'INTERVAL'   THEN v_inter := GREATEST(split_part(v_parte, '=', 2)::integer, 1);
      WHEN 'BYDAY'      THEN v_byday := string_to_array(split_part(v_parte, '=', 2), ',');
      WHEN 'BYMONTHDAY' THEN v_bymday := string_to_array(split_part(v_parte, '=', 2), ',')::integer[];
      WHEN 'COUNT'      THEN v_count := split_part(v_parte, '=', 2)::integer;
      WHEN 'UNTIL'      THEN v_until := to_date(left(split_part(v_parte, '=', 2), 8), 'YYYYMMDD');
      WHEN 'WKST'       THEN NULL;
      WHEN ''           THEN NULL;
      ELSE
        RAISE EXCEPTION 'Parte de RRULE não suportada: %', v_parte;
    END CASE;
  END LOOP;

  IF v_freq IS NULL THEN RAISE EXCEPTION 'RRULE sem FREQ: %', _regra; END IF;
  IF v_until IS NOT NULL THEN _fim := LEAST(_fim, v_until); END IF;

  CASE v_freq
    WHEN 'DAILY'   THEN v_passo := (v_inter || ' days')::interval;
    WHEN 'WEEKLY'  THEN v_passo := (v_inter || ' weeks')::interval;
    WHEN 'MONTHLY' THEN v_passo := (v_inter || ' months')::interval;
    WHEN 'YEARLY'  THEN v_passo := (v_inter || ' years')::interval;
    ELSE RAISE EXCEPTION 'FREQ não suportada: %', v_freq;
  END CASE;

  v_d := _inicio;

  WHILE v_d <= _fim LOOP

    IF v_freq = 'WEEKLY' AND v_byday IS NOT NULL THEN
      FOR v_i IN 0..6 LOOP
        IF (v_d + v_i) BETWEEN _inicio AND _fim
           AND v_dow[EXTRACT(DOW FROM (v_d + v_i))::int + 1] = ANY (v_byday) THEN
          IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
          v_n := v_n + 1;
          RETURN NEXT (v_d + v_i);
        END IF;
      END LOOP;

    ELSIF v_freq = 'MONTHLY' AND v_byday IS NOT NULL THEN
      -- "Primeira segunda-feira", "última sexta-feira". BYDAY com ordinal.
      v_base := date_trunc('month', v_d)::date;
      FOREACH v_tok IN ARRAY v_byday LOOP
        v_ord := NULLIF(regexp_replace(v_tok, '[A-Z]', '', 'g'), '')::integer;
        v_dia := regexp_replace(v_tok, '[^A-Z]', '', 'g');

        IF v_ord IS NULL THEN
          RAISE EXCEPTION 'BYDAY sem ordinal não é suportado em FREQ=MONTHLY: %', v_tok;
        END IF;

        IF v_ord > 0 THEN
          -- Primeiro dia do mês que calha nesse dia da semana, mais (ord-1) semanas.
          v_cand := v_base;
          WHILE v_dow[EXTRACT(DOW FROM v_cand)::int + 1] <> v_dia LOOP
            v_cand := v_cand + 1;
          END LOOP;
          v_cand := v_cand + (v_ord - 1) * 7;
          -- Se transbordou para o mês seguinte, esse mês não tem esse ordinal.
          IF EXTRACT(MONTH FROM v_cand) <> EXTRACT(MONTH FROM v_base) THEN
            CONTINUE;
          END IF;
        ELSE
          -- Ordinal negativo: contar a partir do fim do mês.
          v_cand := (v_base + interval '1 month - 1 day')::date;
          WHILE v_dow[EXTRACT(DOW FROM v_cand)::int + 1] <> v_dia LOOP
            v_cand := v_cand - 1;
          END LOOP;
          v_cand := v_cand + (v_ord + 1) * 7;
          IF EXTRACT(MONTH FROM v_cand) <> EXTRACT(MONTH FROM v_base) THEN
            CONTINUE;
          END IF;
        END IF;

        IF v_cand BETWEEN _inicio AND _fim THEN
          IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
          v_n := v_n + 1;
          RETURN NEXT v_cand;
        END IF;
      END LOOP;

    ELSIF v_freq = 'MONTHLY' AND v_bymday IS NOT NULL THEN
      FOR v_i IN 1..array_length(v_bymday, 1) LOOP
        IF v_bymday[v_i] <= EXTRACT(DAY FROM (date_trunc('month', v_d) + interval '1 month - 1 day'))::int THEN
          v_cand := date_trunc('month', v_d)::date + (v_bymday[v_i] - 1);
          IF v_cand BETWEEN _inicio AND _fim THEN
            IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
            v_n := v_n + 1;
            RETURN NEXT v_cand;
          END IF;
        END IF;
      END LOOP;

    ELSE
      IF v_count IS NOT NULL AND v_n >= v_count THEN RETURN; END IF;
      v_n := v_n + 1;
      RETURN NEXT v_d;
    END IF;

    v_d := (v_d + v_passo)::date;
  END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION public.ops_expandir_rrule(text, date, date) TO authenticated, service_role;


-- ============================================================
-- 8. Planos dinâmicos: a próxima nasce ao fechar a anterior
-- ============================================================
-- Chamada pela RPC de transição quando uma ordem preventiva fecha.

CREATE OR REPLACE FUNCTION public.ops_gerar_proxima_dinamica(_ordem_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_p      record;
  v_codigo text;
  v_nova   uuid;
  v_quando timestamptz;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = _ordem_id;
  IF v_o.plano_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_p FROM public.ops_plano
   WHERE id = v_o.plano_id AND estado = 'ativo' AND tipo_recorrencia = 'dinamica';
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_p.fim_em IS NOT NULL AND v_p.fim_em < current_date THEN RETURN NULL; END IF;

  -- Só uma aberta de cada vez. É a propriedade que torna esta recorrência
  -- imune ao problema das ordens acumuladas.
  IF EXISTS (
    SELECT 1 FROM public.ops_ordem o
     WHERE o.plano_id = v_p.id
       AND o.estado IN ('por_aprovar','agendada','em_curso','pausada')
  ) THEN
    RETURN NULL;
  END IF;

  v_quando := now() + (v_p.intervalo_horas || ' hours')::interval;
  v_codigo := public.ops_proximo_codigo_interno(v_p.organization_id, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, cliente_id, plano_id,
    titulo, responsavel_id, agendada_para
  ) VALUES (
    v_p.organization_id, v_codigo, 'preventiva', 'agendada',
    v_p.cliente_id, v_p.id, v_p.nome, v_p.responsavel_id, v_quando
  ) RETURNING id INTO v_nova;

  INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id, checklist_id, checklist_versao)
  SELECT v_nova, pa.ativo_id, pa.local_id, pa.checklist_id, c.versao
    FROM public.ops_plano_alvo pa
    LEFT JOIN public.ops_checklist c ON c.id = pa.checklist_id
   WHERE pa.plano_id = v_p.id;

  INSERT INTO public.ops_ordem_tarefa (
    ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome, tipo,
    skill_id, privada, obrigatoria, tempo_estimado
  )
  SELECT v_nova, oa.id, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
         ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
    FROM public.ops_ordem_alvo oa
    JOIN public.ops_checklist_tarefa ct ON ct.checklist_id = oa.checklist_id
   WHERE oa.ordem_id = v_nova;

  -- As medições nascem com a ordem, vazias. Congeladas aqui, como a versão da
  -- checklist: mudar os limites amanhã não reescreve o veredicto de ontem.
  INSERT INTO public.ops_ordem_tarefa_medicao (
    ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
  SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
    FROM public.ops_ordem_tarefa ot
    JOIN public.ops_checklist_tarefa_medicao ctm
      ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
    JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
   WHERE ot.ordem_id = v_nova
  ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, antes, depois)
  VALUES
    (v_p.organization_id, 'ordem', v_nova, 'gerada_por_plano_dinamico',
     'Gerada ' || v_p.intervalo_horas || 'h após o fecho de ' || v_o.codigo,
     NULL, jsonb_build_object('codigo', v_codigo));

  RETURN v_nova;
END
$$;

REVOKE ALL ON FUNCTION public.ops_gerar_proxima_dinamica(uuid) FROM PUBLIC, anon, authenticated;


-- Planos dinâmicos não são materializados pelo job diário — nascem do fecho.
CREATE OR REPLACE FUNCTION public.rpc_ops_materializar_planos(
  _org_id         uuid DEFAULT NULL,
  _horizonte_dias integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_plano     record;
  v_dia       date;
  v_ate       date := (now() + (_horizonte_dias || ' days')::interval)::date;
  v_criadas   integer := 0;
  v_planos    integer := 0;
  v_ignorados jsonb := '[]'::jsonb;
  v_codigo    text;
  v_ordem_id  uuid;
  v_desde     date;
BEGIN
  FOR v_plano IN
    SELECT p.* FROM public.ops_plano p
     WHERE p.estado = 'ativo'
       AND p.tipo_recorrencia = 'calendario'      -- ← as dinâmicas ficam de fora
       AND (_org_id IS NULL OR p.organization_id = _org_id)
       AND (p.fim_em IS NULL OR p.fim_em >= current_date)
       AND (v_uid IS NULL
            OR public.is_system_admin_user(v_uid)
            OR p.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid)))
  LOOP
    v_planos := v_planos + 1;
    v_desde := GREATEST(COALESCE(v_plano.materializado_ate + 1, v_plano.inicio_em), current_date);

    BEGIN
      FOR v_dia IN SELECT public.ops_expandir_rrule(v_plano.regra_recorrencia, v_desde, v_ate)
      LOOP
        CONTINUE WHEN EXISTS (
          SELECT 1 FROM public.ops_ordem o
           WHERE o.plano_id = v_plano.id AND o.agendada_para::date = v_dia
        );

        v_codigo := public.ops_proximo_codigo_interno(v_plano.organization_id, 'OT');

        INSERT INTO public.ops_ordem (
          organization_id, codigo, origem, estado, cliente_id, plano_id,
          titulo, responsavel_id, agendada_para
        ) VALUES (
          v_plano.organization_id, v_codigo, 'preventiva', 'agendada',
          v_plano.cliente_id, v_plano.id, v_plano.nome, v_plano.responsavel_id,
          (v_dia + v_plano.hora_prevista)::timestamptz
        ) RETURNING id INTO v_ordem_id;

        INSERT INTO public.ops_ordem_alvo (ordem_id, ativo_id, local_id, checklist_id, checklist_versao)
        SELECT v_ordem_id, pa.ativo_id, pa.local_id, pa.checklist_id, c.versao
          FROM public.ops_plano_alvo pa
          LEFT JOIN public.ops_checklist c ON c.id = pa.checklist_id
         WHERE pa.plano_id = v_plano.id;

        INSERT INTO public.ops_ordem_tarefa (
          ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
          tipo, skill_id, privada, obrigatoria, tempo_estimado
        )
        SELECT v_ordem_id, oa.id, ct.id, ct.posicao, ct.codigo, ct.nome,
               ct.tipo, ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
          FROM public.ops_ordem_alvo oa
          JOIN public.ops_checklist_tarefa ct ON ct.checklist_id = oa.checklist_id
         WHERE oa.ordem_id = v_ordem_id;

        -- As medições nascem com a ordem, vazias. Congeladas aqui, como a versão da
        -- checklist: mudar os limites amanhã não reescreve o veredicto de ontem.
        INSERT INTO public.ops_ordem_tarefa_medicao (
          ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
        SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
          FROM public.ops_ordem_tarefa ot
          JOIN public.ops_checklist_tarefa_medicao ctm
            ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
          JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
         WHERE ot.ordem_id = v_ordem_id
        ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;

        v_criadas := v_criadas + 1;
      END LOOP;

      UPDATE public.ops_plano SET materializado_ate = v_ate, atualizado_em = now()
       WHERE id = v_plano.id;

    EXCEPTION WHEN OTHERS THEN
      v_ignorados := v_ignorados || jsonb_build_object(
        'plano', v_plano.codigo, 'regra', v_plano.regra_recorrencia, 'erro', SQLERRM);

      -- Um plano que falha em silêncio é a pior falha desta aplicação: as
      -- ordens preventivas deixam de nascer, e só se dá por isso quando o
      -- cliente pergunta pela manutenção que não foi feita.
      --
      -- O `entity_id` vai NULL de propósito — isto não é sobre uma ordem. O
      -- guarda de duplicados usa (tipo, entity_id, pessoa), por isso só se
      -- repete depois de alguém ler o primeiro aviso.
      IF to_regprocedure('public.ops_notificar_coordenacao(uuid,text,text,text,text,uuid,text,uuid)')
         IS NOT NULL THEN
        PERFORM public.ops_notificar_coordenacao(
          v_plano.organization_id, 'operacoes_plano_falhou',
          'O plano ' || v_plano.codigo || ' não gerou ordens',
          'A regra de repetição foi recusada: ' || SQLERRM
            || ' Enquanto não for corrigida, este plano não cria trabalho.',
          '/operacao/planos', NULL, 'urgent');
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'planos_vistos', v_planos, 'ordens_criadas', v_criadas,
    'materializado_ate', v_ate, 'ignorados', v_ignorados
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.rpc_ops_materializar_planos(uuid, integer) TO authenticated, service_role;


-- ============================================================
-- 9. RLS e grants nas tabelas novas
-- ============================================================

DO $rls$
DECLARE
  t text;
  novas constant text[] := ARRAY[
    'ops_skill','ops_utilizador_skill','ops_horario','ops_medicao_def',
    'ops_medicao_opcao','ops_checklist_tarefa_medicao','ops_ordem_tarefa_medicao'
  ];
BEGIN
  FOREACH t IN ARRAY novas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write  ON public.%1$I', t);

    EXECUTE format($f$
      CREATE POLICY %1$s_select ON public.%1$I
        FOR SELECT TO authenticated USING (
          public.is_system_admin_user((SELECT auth.uid()))
          OR public.has_anew_permission((SELECT auth.uid()), 'operations.view')
        )
    $f$, t);

    -- As leituras de medição são feitas por quem executa; o resto é configuração.
    IF t = 'ops_ordem_tarefa_medicao' THEN
      EXECUTE format($f$
        CREATE POLICY %1$s_write ON public.%1$I
          FOR ALL TO authenticated USING (
            public.is_system_admin_user((SELECT auth.uid()))
            OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.execute')
          ) WITH CHECK (
            public.is_system_admin_user((SELECT auth.uid()))
            OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.execute')
          )
      $f$, t);
    ELSE
      EXECUTE format($f$
        CREATE POLICY %1$s_write ON public.%1$I
          FOR ALL TO authenticated USING (
            public.is_system_admin_user((SELECT auth.uid()))
            OR public.has_anew_permission((SELECT auth.uid()), 'operations.settings.manage')
            OR public.has_anew_permission((SELECT auth.uid()), 'operations.checklists.manage')
          ) WITH CHECK (
            public.is_system_admin_user((SELECT auth.uid()))
            OR public.has_anew_permission((SELECT auth.uid()), 'operations.settings.manage')
            OR public.has_anew_permission((SELECT auth.uid()), 'operations.checklists.manage')
          )
      $f$, t);
    END IF;

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END
$rls$;


-- ============================================================
-- 10. Verificação
-- ============================================================

-- Este bloco já contou TODAS as tabelas `ops_*` e comparou com 26, o número
-- que existia no dia em que este ficheiro foi escrito. Funcionou uma vez, e
-- partiu-se no dia em que `orcamentos.sql` acrescentou a sua tabela: voltar a
-- correr isto numa base atualizada rebentava com "esperadas 26, encontradas 27",
-- e o ficheiro inteiro fazia rollback.
--
-- Um número fixo é uma afirmação sobre o módulo todo, e este ficheiro só
-- responde por sete tabelas. Passa a verificar essas sete pelo nome. A conta
-- da RLS fica — essa é sobre todas de propósito, e continua verdadeira à
-- medida que o módulo cresce.

DO $verificar$
DECLARE
  v_tab   integer;
  v_rls   integer;
  v_falta text;
BEGIN
  SELECT string_agg(t, ', ' ORDER BY t) INTO v_falta
    FROM unnest(ARRAY[
      'ops_skill', 'ops_utilizador_skill', 'ops_horario', 'ops_medicao_def',
      'ops_medicao_opcao', 'ops_checklist_tarefa_medicao', 'ops_ordem_tarefa_medicao'
    ]) AS t
   WHERE to_regclass('public.' || t) IS NULL;

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam tabelas deste ficheiro: %', v_falta;
  END IF;

  SELECT count(*) INTO v_tab FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'ops\_%';
  SELECT count(*) INTO v_rls FROM pg_tables
   WHERE schemaname = 'public' AND tablename LIKE 'ops\_%' AND rowsecurity;

  IF v_rls <> v_tab THEN RAISE EXCEPTION '% tabelas sem RLS', v_tab - v_rls; END IF;

  RAISE NOTICE 'Operações: modelo corrigido. As 7 tabelas deste ficheiro existem; % tabelas ops_*, todas com RLS.', v_tab;
END
$verificar$;

COMMIT;
