-- ============================================================
--  Operações — tipo de trabalho, centro de custo, fornecedor
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql.
--
--  Três campos que a operação real usa e que faltavam, mais o fecho
--  automático. Levantados na instância do Infraspeak, em 31 de agosto de 2026.
--
--  ⚠ TIPO DE TRABALHO NÃO É A ORIGEM
--
--  `ops_ordem.origem` (preventiva/corretiva/obra) **decide comportamento**: um
--  plano gera preventiva, uma não conformidade gera corretiva, um orçamento
--  aceite gera obra. É do sistema, e são três.
--
--  `tipo_trabalho` é o que a casa lhe chama — Rotina, Ponto zero, Melhoria.
--  É de quem preenche, e são tantos quantos fizerem falta. São dimensões
--  diferentes, e juntá-las obrigaria a escolher entre perder a automação e
--  perder o vocabulário da empresa.
--
--  ⚠ O CÓDIGO É POR ORGANIZAÇÃO E NÃO É CHAVE
--
--  Na instância observada, `PMP` é o código de três tipos ao mesmo tempo —
--  Preventiva, Ponto zero e Remodelação. Quem agrupar relatórios por código
--  junta três coisas diferentes. Aqui o código serve para ler, e o id é que
--  identifica.
--
--  ⚠ FORNECEDOR: LÊ-SE, NÃO SE ESCREVE
--
--  Os fornecedores são do CRM. Guarda-se o id sem chave estrangeira, como se
--  faz com clientes e utilizadores. Criar um fornecedor novo é no CRM — este
--  módulo não escreve em tabelas de negócio dele.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regclass('public.ops_ordem') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql. Corre-o primeiro.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. Tipos de trabalho
-- ============================================================
-- `fecha_automatico` vive aqui e não só na ordem: é uma política da casa
-- ("uma rotina fecha-se sozinha, uma obra não"), e não uma decisão a repetir
-- em cada ordem. A ordem herda-o e pode contrariá-lo.

CREATE TABLE IF NOT EXISTS public.ops_tipo_trabalho (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  codigo           text NOT NULL,
  nome             text NOT NULL,
  posicao          integer NOT NULL DEFAULT 0,
  fecha_automatico boolean NOT NULL DEFAULT false,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  -- Pelo NOME, e não pelo código: o código repete-se de propósito lá, e
  -- repetir o nome é que seria um erro de quem escreve.
  UNIQUE (organization_id, nome)
);

COMMENT ON COLUMN public.ops_tipo_trabalho.codigo IS
  'Para ler e reconhecer. NÃO identifica: na instância observada PMP era o código de três tipos.';


-- ============================================================
-- 2. Centros de custo
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ops_centro_custo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  codigo           text NOT NULL,
  nome             text NOT NULL,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, codigo)
);


-- ============================================================
-- 3. Os campos novos
-- ============================================================
-- Sem chave estrangeira para o fornecedor: é do CRM, e a regra do módulo é
-- não amarrar nada a tabelas de fora. Se um fornecedor desaparecer lá, a
-- ordem fica com um id órfão em vez de impedir o apagamento — que é o
-- comportamento certo para dados históricos.

ALTER TABLE public.ops_ordem
  ADD COLUMN IF NOT EXISTS tipo_trabalho_id uuid
    REFERENCES public.ops_tipo_trabalho(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS centro_custo_id  uuid
    REFERENCES public.ops_centro_custo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fornecedor_id    uuid,   -- → suppliers.id, sem FK
  ADD COLUMN IF NOT EXISTS fecha_automatico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ops_ordem.fornecedor_id IS
  'suppliers.id do CRM. Sem FK de propósito: o módulo não amarra nada a tabelas de fora.';

-- O centro de custo do equipamento é o que a ordem herda. No Infraspeak a
-- coluna existe nos ativos e estava vazia em todas as linhas observadas —
-- aqui só existe porque a herança lhe dá uso.
ALTER TABLE public.ops_ativo
  ADD COLUMN IF NOT EXISTS centro_custo_id uuid
    REFERENCES public.ops_centro_custo(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_ordem_tipo_trabalho_idx
  ON public.ops_ordem (organization_id, tipo_trabalho_id);
CREATE INDEX IF NOT EXISTS ops_ordem_centro_custo_idx
  ON public.ops_ordem (organization_id, centro_custo_id);


-- ============================================================
-- 4. RLS e acessos
-- ============================================================

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_tipo_trabalho', 'ops_centro_custo'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_ler ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_ler ON public.%I FOR SELECT TO authenticated
         USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))))',
      t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END
$rls$;


-- ============================================================
-- 5. Semear os tipos, uma vez por organização
-- ============================================================
-- Os nove da instância observada. Um ecrã em branco no primeiro dia é a
-- maneira mais rápida de ninguém usar isto.
--
-- Só semeia quem não tem nenhum. Quem já mexeu na lista fica com a sua — e
-- por isso o ficheiro pode voltar a correr sem desfazer trabalho de ninguém.

CREATE OR REPLACE FUNCTION public.ops_semear_tipos_trabalho(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.ops_tipo_trabalho WHERE organization_id = _org_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.ops_tipo_trabalho
    (organization_id, codigo, nome, posicao, fecha_automatico)
  VALUES
    -- `fecha_automatico` ligado só onde o trabalho é repetitivo e curto: uma
    -- rotina cumprida é uma rotina fechada. Uma obra não.
    (_org_id, 'PMP',       'Preventiva',             1, false),
    (_org_id, 'ROT',       'Rotina',                 2, true),
    (_org_id, 'PMP',       'Ponto zero',             3, false),
    (_org_id, 'AUDIT',     'Auditoria',              4, false),
    (_org_id, 'MELHORIA',  'Melhoria',               5, false),
    (_org_id, 'INST',      'Instalação',             6, false),
    (_org_id, 'SPECIAL',   'Obra',                   7, false),
    (_org_id, 'PMP',       'Remodelação',            8, false),
    (_org_id, 'ACOMP.EXT', 'Acompanhamento Externo', 9, false);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END
$$;

REVOKE ALL ON FUNCTION public.ops_semear_tipos_trabalho(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_semear_tipos_trabalho(uuid) TO authenticated;


-- ============================================================
-- 6. Gerir as listas
-- ============================================================

CREATE OR REPLACE FUNCTION public.ops_exige_gestao(_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do teu alcance.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = _org_id AND ativo;

  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Só quem gere é que mexe nestas listas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_user;
END
$$;

REVOKE ALL ON FUNCTION public.ops_exige_gestao(uuid) FROM PUBLIC, anon;


CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_tipo_trabalho(
  p_org_id           uuid,
  p_nome             text,
  p_codigo           text DEFAULT NULL,
  p_fecha_automatico boolean DEFAULT false,
  p_id               uuid DEFAULT NULL,
  p_ativo            boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um tipo de trabalho precisa de nome.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_tipo_trabalho
      (organization_id, codigo, nome, fecha_automatico, ativo,
       posicao)
    VALUES
      (p_org_id, COALESCE(nullif(btrim(p_codigo), ''), ''), v_nome,
       COALESCE(p_fecha_automatico, false), COALESCE(p_ativo, true),
       COALESCE((SELECT max(posicao) + 1 FROM public.ops_tipo_trabalho
                  WHERE organization_id = p_org_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_tipo_trabalho
       SET nome = v_nome,
           codigo = COALESCE(nullif(btrim(p_codigo), ''), codigo),
           fecha_automatico = COALESCE(p_fecha_automatico, fecha_automatico),
           ativo = COALESCE(p_ativo, ativo),
           atualizado_em = now()
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Esse tipo de trabalho não existe nesta organização.';
    END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'tipo_trabalho', v_id,
     CASE WHEN p_id IS NULL THEN 'criado' ELSE 'alterado' END,
     v_nome, v_user,
     jsonb_build_object('nome', v_nome, 'fecha_automatico', p_fecha_automatico));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_tipo_trabalho(uuid, text, text, boolean, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_tipo_trabalho(uuid, text, text, boolean, uuid, boolean)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_centro_custo(
  p_org_id uuid,
  p_codigo text,
  p_nome   text,
  p_id     uuid DEFAULT NULL,
  p_ativo  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid := public.ops_exige_gestao(p_org_id);
  v_id     uuid;
  v_codigo text := nullif(btrim(coalesce(p_codigo, '')), '');
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF v_codigo IS NULL OR v_nome IS NULL THEN
    RAISE EXCEPTION 'Um centro de custo precisa de código e de nome.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_centro_custo (organization_id, codigo, nome, ativo)
    VALUES (p_org_id, v_codigo, v_nome, COALESCE(p_ativo, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_centro_custo
       SET codigo = v_codigo, nome = v_nome,
           ativo = COALESCE(p_ativo, ativo), atualizado_em = now()
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Esse centro de custo não existe nesta organização.';
    END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'centro_custo', v_id,
     CASE WHEN p_id IS NULL THEN 'criado' ELSE 'alterado' END,
     v_codigo || ' · ' || v_nome, v_user,
     jsonb_build_object('codigo', v_codigo, 'nome', v_nome));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_centro_custo(uuid, text, text, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_centro_custo(uuid, text, text, uuid, boolean)
  TO authenticated;


-- ============================================================
-- 7. Herdar o centro de custo do equipamento
-- ============================================================
-- Uma ordem sobre um equipamento herda o centro de custo dele, se ainda não
-- tiver um. Não sobrepõe uma escolha feita à mão: quem escolheu, escolheu.

CREATE OR REPLACE FUNCTION public.ops_herdar_centro_custo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cc uuid;
BEGIN
  -- `NEW` é o alvo, não a ordem: o centro de custo tem de vir da ordem.
  -- Se ela já tem um, ninguém lhe toca.
  IF EXISTS (SELECT 1 FROM public.ops_ordem
              WHERE id = NEW.ordem_id AND centro_custo_id IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT a.centro_custo_id INTO v_cc
    FROM public.ops_ordem_alvo oa
    JOIN public.ops_ativo a ON a.id = oa.ativo_id
   WHERE oa.ordem_id = NEW.ordem_id
     AND a.centro_custo_id IS NOT NULL
   LIMIT 1;

  IF v_cc IS NOT NULL THEN
    UPDATE public.ops_ordem SET centro_custo_id = v_cc
     WHERE id = NEW.ordem_id AND centro_custo_id IS NULL;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ops_alvo_herda_centro_custo ON public.ops_ordem_alvo;
CREATE TRIGGER ops_alvo_herda_centro_custo
  AFTER INSERT ON public.ops_ordem_alvo
  FOR EACH ROW
  EXECUTE FUNCTION public.ops_herdar_centro_custo();


-- ============================================================
-- 8. Fechar sozinha
-- ============================================================
-- Chamada pela aplicação depois de cada resposta. Não fecha nada por sua
-- conta: exige que a ordem esteja marcada para isso, em curso, e com todas as
-- obrigatórias respondidas. Devolve false — sem levantar erro — em todos os
-- outros casos, porque é chamada a toda a hora e não é um erro não ser altura.
--
-- Passa pela mesma fechadura das outras transições (`ops.transicao`), para não
-- haver dois caminhos a mudar estados.

CREATE OR REPLACE FUNCTION public.rpc_ops_fechar_se_completa(p_ordem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o        record;
  v_por_ler  integer;
  v_user     uuid := public.current_business_user_id();
BEGIN
  SELECT id, organization_id, estado, fecha_automatico
    INTO v_o
    FROM public.ops_ordem
   WHERE id = p_ordem_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('fechou', false, 'porque', 'nao_existe'); END IF;
  IF NOT v_o.fecha_automatico THEN
    RETURN jsonb_build_object('fechou', false, 'porque', 'nao_e_automatica');
  END IF;
  IF v_o.estado <> 'em_curso' THEN
    RETURN jsonb_build_object('fechou', false, 'porque', 'nao_esta_em_curso');
  END IF;

  SELECT count(*) INTO v_por_ler
    FROM public.ops_ordem_tarefa t
   WHERE t.ordem_id = p_ordem_id
     AND t.obrigatoria
     AND t.estado = 'pendente';

  IF v_por_ler > 0 THEN
    RETURN jsonb_build_object('fechou', false, 'porque', 'faltam_tarefas',
                              'faltam', v_por_ler);
  END IF;

  PERFORM set_config('ops.transicao', 'autorizada', true);
  UPDATE public.ops_ordem
     SET estado = 'fechada', fechada_em = now(), atualizada_em = now()
   WHERE id = p_ordem_id;
  PERFORM set_config('ops.transicao', '', true);

  UPDATE public.ops_sessao_trabalho SET fim = now()
   WHERE ordem_id = p_ordem_id AND fim IS NULL;

  IF to_regprocedure('public.ops_recalcular_custo_mao_obra(uuid)') IS NOT NULL THEN
    PERFORM public.ops_recalcular_custo_mao_obra(p_ordem_id);
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'fechar',
     'Fechada sozinha: as tarefas obrigatórias ficaram todas respondidas.',
     v_user,
     jsonb_build_object('estado', 'em_curso'),
     jsonb_build_object('estado', 'fechada', 'automatico', true));

  RETURN jsonb_build_object('fechou', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_fechar_se_completa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_fechar_se_completa(uuid) TO authenticated;


-- ============================================================
-- 9. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v_falta text[] := ARRAY[]::text[];
  v_f     text;
  v_c     text;
BEGIN
  FOREACH v_f IN ARRAY ARRAY[
    'public.ops_semear_tipos_trabalho(uuid)',
    'public.ops_exige_gestao(uuid)',
    'public.rpc_ops_gravar_tipo_trabalho(uuid,text,text,boolean,uuid,boolean)',
    'public.rpc_ops_gravar_centro_custo(uuid,text,text,uuid,boolean)',
    'public.rpc_ops_fechar_se_completa(uuid)'
  ] LOOP
    IF to_regprocedure(v_f) IS NULL THEN v_falta := v_falta || v_f; END IF;
  END LOOP;

  FOREACH v_c IN ARRAY ARRAY[
    'tipo_trabalho_id', 'centro_custo_id', 'fornecedor_id', 'fecha_automatico'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ops_ordem' AND column_name = v_c
    ) THEN
      v_falta := v_falta || ('ops_ordem.' || v_c);
    END IF;
  END LOOP;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION 'Não ficaram criados: %', array_to_string(v_falta, ', ');
  END IF;

  RAISE NOTICE 'Operações: tipo de trabalho, centro de custo e fornecedor prontos.';
  RAISE NOTICE 'Os tipos semeiam-se por organização, ao abrir as Definições.';
END
$verificar$;

COMMIT;
