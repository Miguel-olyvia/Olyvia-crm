-- ============================================================
--  Operações — motivos de pausa, áreas e tipos
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, campos-ordem.sql.
--
--  As duas coisas em que o Infraspeak estava claramente à frente, levantadas
--  na instância em 31 de agosto de 2026.
--
--  ⚠ PORQUE É QUE TEXTO LIVRE NÃO CHEGA
--
--  `pausa_motivo`, `area` e `tipo` eram texto escrito à mão. O resultado é
--  sempre o mesmo: oito maneiras de escrever "à espera de material", e nenhum
--  relatório as consegue somar. Lá são listas geridas — e a de pausas diz
--  ainda que funções a podem usar.
--
--  O texto livre NÃO desaparece. `pausa_motivo` continua lá e passa a servir
--  para o detalhe ("à espera de material — falta o regulador"), que é
--  exatamente o que um motivo chamado "Outro" precisa de ter ao lado.
--
--  ⚠ AS ÁREAS SEMEADAS SÃO AS QUE SE VIRAM
--
--  Dez, tiradas da instância. A lista de lá pode ter mais numa página que não
--  se abriu — por isso o ecrã deixa acrescentar, e não se finge que estão
--  todas.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regprocedure('public.ops_exige_gestao(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/campos-ordem.sql — é ele que traz ops_exige_gestao.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. Motivos de pausa
-- ============================================================
-- `funcoes` diz quem o pode usar. Um técnico não devia poder pausar uma ordem
-- com "A Aguardar Aprovação Superior" — essa é uma decisão de quem gere, e
-- deixá-la a toda a gente é como não ter motivo nenhum.

CREATE TABLE IF NOT EXISTS public.ops_motivo_pausa (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  nome             text NOT NULL,
  posicao          integer NOT NULL DEFAULT 0,
  -- Quem o pode escolher. Vazio = toda a gente.
  funcoes          text[] NOT NULL DEFAULT ARRAY['admin','gestor','operador','tecnico'],
  /* Um motivo que exige data de retoma obriga a dizer "até quando". É o que
     impede uma ordem de ficar pausada para sempre — o defeito que se vê na
     instância observada, onde há pausas de meses sem ninguém dar por elas. */
  exige_retoma     boolean NOT NULL DEFAULT true,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, nome)
);


-- ============================================================
-- 2. Áreas e tipos
-- ============================================================
-- Dois níveis, como lá: a área é o domínio (Electricidade), o tipo é o que
-- aconteceu dentro dela. Serve para classificar, para somar em relatórios, e
-- um dia para escolher quem atende.

CREATE TABLE IF NOT EXISTS public.ops_area (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  nome             text NOT NULL,
  posicao          integer NOT NULL DEFAULT 0,
  ativo            boolean NOT NULL DEFAULT true,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, nome)
);

CREATE TABLE IF NOT EXISTS public.ops_area_tipo (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id   uuid NOT NULL REFERENCES public.ops_area(id) ON DELETE CASCADE,
  nome      text NOT NULL,
  posicao   integer NOT NULL DEFAULT 0,
  ativo     boolean NOT NULL DEFAULT true,
  UNIQUE (area_id, nome)
);


-- ============================================================
-- 3. Os campos na ordem
-- ============================================================
-- As colunas de texto ficam. Renomear ou apagar partiria o que já lá está, e
-- `pausa_motivo` passa a ter uma função nova: o detalhe ao lado do motivo.

ALTER TABLE public.ops_ordem
  ADD COLUMN IF NOT EXISTS pausa_motivo_id uuid
    REFERENCES public.ops_motivo_pausa(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_id uuid
    REFERENCES public.ops_area(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_tipo_id uuid
    REFERENCES public.ops_area_tipo(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.ops_ordem.pausa_motivo IS
  'O detalhe ao lado do motivo escolhido. Um motivo chamado Outro sem isto nao diz nada.';

CREATE INDEX IF NOT EXISTS ops_ordem_area_idx
  ON public.ops_ordem (organization_id, area_id);


-- ============================================================
-- 4. RLS e acessos
-- ============================================================

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_motivo_pausa', 'ops_area'] LOOP
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

-- Os tipos herdam o alcance da área a que pertencem.
ALTER TABLE public.ops_area_tipo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_area_tipo_ler ON public.ops_area_tipo;
CREATE POLICY ops_area_tipo_ler ON public.ops_area_tipo
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ops_area a
     WHERE a.id = ops_area_tipo.area_id
       AND a.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  ));
GRANT SELECT ON public.ops_area_tipo TO authenticated;
REVOKE ALL ON public.ops_area_tipo FROM anon;


-- ============================================================
-- 5. Semear
-- ============================================================

CREATE OR REPLACE FUNCTION public.ops_semear_listas(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pausas integer := 0;
  v_areas  integer := 0;
BEGIN
  -- Os oito da instância, com as funções que lá têm. Três deles são decisões
  -- de quem gere, e por isso não ficam à mão do técnico.
  IF NOT EXISTS (SELECT 1 FROM public.ops_motivo_pausa WHERE organization_id = _org_id) THEN
    INSERT INTO public.ops_motivo_pausa (organization_id, nome, posicao, funcoes, exige_retoma)
    VALUES
      (_org_id, 'A aguardar material',            1, ARRAY['admin','gestor','operador','tecnico'], true),
      (_org_id, 'A aguardar visita técnica',      2, ARRAY['admin','gestor','operador','tecnico'], true),
      (_org_id, 'A resolver na próxima visita',   3, ARRAY['admin','gestor','operador','tecnico'], true),
      (_org_id, 'A aguardar orçamento',           4, ARRAY['admin','gestor','operador'],           true),
      (_org_id, 'A aguardar adjudicação',         5, ARRAY['admin','gestor','operador'],           true),
      (_org_id, 'A aguardar aprovação superior',  6, ARRAY['admin','gestor'],                      true),
      (_org_id, 'Em lista de espera',             7, ARRAY['admin','gestor','operador'],           true),
      (_org_id, 'Outro',                          8, ARRAY['admin','gestor','operador','tecnico'], true);
    GET DIAGNOSTICS v_pausas = ROW_COUNT;
  END IF;

  -- As dez áreas que se viram. Podem faltar: o ecrã deixa acrescentar.
  IF NOT EXISTS (SELECT 1 FROM public.ops_area WHERE organization_id = _org_id) THEN
    INSERT INTO public.ops_area (organization_id, nome, posicao)
    SELECT _org_id, nome, ordinality
      FROM unnest(ARRAY[
        'Acompanhamento', 'Águas e esgotos', 'Alarme e deteção', 'Ar condicionado',
        'Climatização', 'Cobertura', 'Computadores e telemóveis', 'Decoração',
        'Eletricidade', 'Elevadores'
      ]) WITH ORDINALITY AS t(nome, ordinality);
    GET DIAGNOSTICS v_areas = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('pausas', v_pausas, 'areas', v_areas);
END
$$;

REVOKE ALL ON FUNCTION public.ops_semear_listas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_semear_listas(uuid) TO authenticated;


-- ============================================================
-- 6. Gerir as listas
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_motivo_pausa(
  p_org_id       uuid,
  p_nome         text,
  p_funcoes      text[] DEFAULT NULL,
  p_exige_retoma boolean DEFAULT true,
  p_id           uuid DEFAULT NULL,
  p_ativo        boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_f    text[] := COALESCE(p_funcoes, ARRAY['admin','gestor','operador','tecnico']);
BEGIN
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Um motivo de pausa precisa de nome.'; END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_f) f
              WHERE f NOT IN ('admin','gestor','operador','tecnico')) THEN
    RAISE EXCEPTION 'Função desconhecida na lista.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_motivo_pausa
      (organization_id, nome, funcoes, exige_retoma, ativo, posicao)
    VALUES
      (p_org_id, v_nome, v_f, COALESCE(p_exige_retoma, true), COALESCE(p_ativo, true),
       COALESCE((SELECT max(posicao) + 1 FROM public.ops_motivo_pausa
                  WHERE organization_id = p_org_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_motivo_pausa
       SET nome = v_nome, funcoes = v_f,
           exige_retoma = COALESCE(p_exige_retoma, exige_retoma),
           ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Esse motivo não existe nesta organização.'; END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'motivo_pausa', v_id,
     CASE WHEN p_id IS NULL THEN 'criado' ELSE 'alterado' END,
     v_nome, v_user, jsonb_build_object('nome', v_nome, 'funcoes', v_f));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_motivo_pausa(uuid, text, text[], boolean, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_motivo_pausa(uuid, text, text[], boolean, uuid, boolean)
  TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_area(
  p_org_id uuid,
  p_nome   text,
  p_id     uuid DEFAULT NULL,
  p_ativo  boolean DEFAULT true
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
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Uma área precisa de nome.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_area (organization_id, nome, ativo, posicao)
    VALUES (p_org_id, v_nome, COALESCE(p_ativo, true),
            COALESCE((SELECT max(posicao) + 1 FROM public.ops_area
                       WHERE organization_id = p_org_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_area
       SET nome = v_nome, ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND organization_id = p_org_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Essa área não existe nesta organização.'; END IF;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
  VALUES
    (p_org_id, 'area', v_id, CASE WHEN p_id IS NULL THEN 'criada' ELSE 'alterada' END,
     v_nome, v_user, jsonb_build_object('nome', v_nome));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_area(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_area(uuid, text, uuid, boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_area_tipo(
  p_area_id uuid,
  p_nome    text,
  p_id      uuid DEFAULT NULL,
  p_ativo   boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org  uuid;
  v_user uuid;
  v_id   uuid;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  SELECT organization_id INTO v_org FROM public.ops_area WHERE id = p_area_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Essa área não existe.'; END IF;
  v_user := public.ops_exige_gestao(v_org);

  IF v_nome IS NULL THEN RAISE EXCEPTION 'Um tipo precisa de nome.'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.ops_area_tipo (area_id, nome, ativo, posicao)
    VALUES (p_area_id, v_nome, COALESCE(p_ativo, true),
            COALESCE((SELECT max(posicao) + 1 FROM public.ops_area_tipo
                       WHERE area_id = p_area_id), 1))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_area_tipo
       SET nome = v_nome, ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND area_id = p_area_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Esse tipo não existe nessa área.'; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_area_tipo(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_area_tipo(uuid, text, uuid, boolean) TO authenticated;


-- ============================================================
-- 7. Os motivos que ESTA pessoa pode usar
-- ============================================================
-- É o que o ecrã de pausa mostra. Filtrar no cliente daria uma lista completa
-- ao alcance de quem abrisse as ferramentas do browser.

CREATE OR REPLACE FUNCTION public.rpc_ops_motivos_de_pausa(_org_id uuid)
RETURNS TABLE (id uuid, nome text, exige_retoma boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  IF _org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN RETURN; END IF;

  SELECT p.funcao INTO v_funcao
    FROM public.ops_utilizador_perfil p
   WHERE p.utilizador_id = v_user AND p.organization_id = _org_id AND p.ativo;

  RETURN QUERY
    SELECT m.id, m.nome, m.exige_retoma
      FROM public.ops_motivo_pausa m
     WHERE m.organization_id = _org_id
       AND m.ativo
       AND COALESCE(v_funcao, '') = ANY (m.funcoes)
     ORDER BY m.posicao;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_motivos_de_pausa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_motivos_de_pausa(uuid) TO authenticated;


-- ============================================================
-- 8. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v_falta text[] := ARRAY[]::text[];
  v_f     text;
BEGIN
  FOREACH v_f IN ARRAY ARRAY[
    'public.ops_semear_listas(uuid)',
    'public.rpc_ops_gravar_motivo_pausa(uuid,text,text[],boolean,uuid,boolean)',
    'public.rpc_ops_gravar_area(uuid,text,uuid,boolean)',
    'public.rpc_ops_gravar_area_tipo(uuid,text,uuid,boolean)',
    'public.rpc_ops_motivos_de_pausa(uuid)'
  ] LOOP
    IF to_regprocedure(v_f) IS NULL THEN v_falta := v_falta || v_f; END IF;
  END LOOP;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION 'Não ficaram criadas: %', array_to_string(v_falta, ', ');
  END IF;

  RAISE NOTICE 'Operações: motivos de pausa, áreas e tipos, com listas geridas.';
END
$verificar$;

COMMIT;
