-- ============================================================
--  Operações — as listas fixas passam a ser da empresa
-- ============================================================
--  Correr DEPOIS de: schema.sql, correcoes-modelo.sql, campos-ordem.sql.
--
--  O PROBLEMA
--
--  Metade das listas do módulo já eram configuráveis: categorias de
--  equipamento, tipos de trabalho, centros de custo, motivos de pausa, áreas.
--  A outra metade estava escrita no código, com o vocabulário de uma empresa
--  de manutenção de edifícios:
--
--    · criticidade   → baixa, normal, alta, crítica
--    · prioridade    → baixa, normal, alta, urgente
--    · tipo de tarefa→ inspeção, correção, limpeza, proação, substituição
--    · tipo de local → morada, edifício, piso, espaço
--    · origem        → preventiva, corretiva, obra
--
--  Uma empresa de limpezas não faz "proação". Uma construtora não tem
--  "criticidade crítica" — tem "para a obra". E uma frota de camiões não tem
--  "pisos".
--
--  ⚠ RENOMEIA-SE, NÃO SE INVENTA
--
--  Cada empresa pode **mudar o nome**, **mudar a ordem** e **esconder** o que
--  não usa. O que NÃO pode é criar um valor novo, e é de propósito: estes
--  cinco códigos não são texto, são o motor. A prioridade ordena a lista de
--  trabalho, a origem escolhe o ícone e o fluxo, o tipo de local desenha a
--  árvore. Deixar inventar valores seria deixar a empresa partir a aplicação
--  a partir das Definições, e a avaria só aparecia semanas depois.
--
--  As listas onde se inventa à vontade — tipos de trabalho, centros de custo,
--  áreas, motivos de pausa, categorias, **especialidades** — são tabelas
--  próprias, e essas aceitam o que a empresa quiser.
--
--  ⚠ ESCONDER NÃO APAGA O PASSADO
--
--  Esconder um valor tira-o das caixas de escolha para trabalho novo. As
--  ordens antigas continuam a mostrá-lo — reescrever o passado para arrumar o
--  presente é a maneira mais fácil de perder um histórico.
--
--  ⚠ ESPECIALIDADES SEM PORTA
--
--  `ops_skill` existe desde o `correcoes-modelo.sql`, a agenda tem filtro por
--  especialidade e as tarefas têm campo — mas **nunca houve forma de criar
--  uma**. Nem ecrã, nem RPC. Ficam aqui as duas RPCs que faltavam.
--
--  Escreve fora de `ops_*`? Não.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regclass('public.ops_skill') IS NULL THEN
    RAISE EXCEPTION 'Falta db/correcoes-modelo.sql.';
  END IF;
  IF to_regprocedure('public.ops_exige_gestao(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/campos-ordem.sql.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. O que cada empresa chama a cada coisa
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ops_rotulo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  -- Qual das listas fixas.
  lista            text NOT NULL
                   CHECK (lista IN ('prioridade','criticidade','tipo_tarefa','tipo_local','origem')),
  -- O código do motor. Nunca muda, e é ele que está gravado nas ordens.
  valor            text NOT NULL,
  -- O que esta empresa lhe chama.
  nome             text NOT NULL CHECK (btrim(nome) <> ''),
  ordem            integer NOT NULL DEFAULT 0,
  -- Esconder tira das caixas de escolha; não toca no que já está gravado.
  ativo            boolean NOT NULL DEFAULT true,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, lista, valor)
);

ALTER TABLE public.ops_rotulo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_rotulo_ler ON public.ops_rotulo;
CREATE POLICY ops_rotulo_ler ON public.ops_rotulo
  FOR SELECT TO authenticated
  USING (
    public.is_system_admin_user((SELECT auth.uid()))
    OR organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
  );

-- Escrever é só pela RPC: é lá que se confere que o valor existe mesmo, e que
-- a lista não fica sem nenhuma opção.
GRANT SELECT ON public.ops_rotulo TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ops_rotulo FROM authenticated;
REVOKE ALL ON public.ops_rotulo FROM anon;

CREATE INDEX IF NOT EXISTS ops_rotulo_org_idx
  ON public.ops_rotulo (organization_id, lista, ordem);


-- ============================================================
-- 2. Os valores que o motor conhece
-- ============================================================
-- Escritos aqui uma vez. Se um dia se acrescentar uma prioridade nova ao
-- código, acrescenta-se aqui — e a RPC deixa de a recusar sozinha.

CREATE OR REPLACE FUNCTION public.ops_valores_da_lista(_lista text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _lista
    WHEN 'prioridade'  THEN ARRAY['baixa','normal','alta','urgente']
    WHEN 'criticidade' THEN ARRAY['baixa','normal','alta','critica']
    WHEN 'tipo_tarefa' THEN ARRAY['inspecao','correcao','limpeza','proacao','substituicao']
    WHEN 'tipo_local'  THEN ARRAY['morada','edificio','piso','espaco']
    WHEN 'origem'      THEN ARRAY['preventiva','corretiva','obra']
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION public.ops_valores_da_lista(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_rotulo(
  p_org_id uuid,
  p_lista  text,
  p_valor  text,
  p_nome   text,
  p_ordem  integer DEFAULT NULL,
  p_ativo  boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid := public.ops_exige_gestao(p_org_id);
  v_valores  text[] := public.ops_valores_da_lista(p_lista);
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
  v_ativo    boolean := COALESCE(p_ativo, true);
  v_sobram   integer;
  v_id       uuid;
BEGIN
  IF v_valores IS NULL THEN
    RAISE EXCEPTION 'A lista "%" não existe.', p_lista;
  END IF;

  -- Um valor inventado aqui partia a aplicação semanas depois, longe daqui.
  IF NOT (p_valor = ANY (v_valores)) THEN
    RAISE EXCEPTION 'A lista "%" não tem o valor "%". Estes nomes mudam-se; os valores não se inventam.',
      p_lista, p_valor;
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'O nome não pode ficar vazio. Para não usar esta opção, esconde-a.';
  END IF;

  -- Uma lista sem nenhuma opção deixa de se poder criar trabalho, e o erro
  -- aparece a quem está no local, não a quem carregou no botão.
  IF NOT v_ativo THEN
    SELECT count(*) INTO v_sobram
      FROM unnest(v_valores) AS t(v)
      LEFT JOIN public.ops_rotulo r
        ON r.organization_id = p_org_id AND r.lista = p_lista AND r.valor = t.v
     WHERE COALESCE(r.ativo, true) AND t.v <> p_valor;

    IF v_sobram = 0 THEN
      RAISE EXCEPTION 'Tem de sobrar pelo menos uma opção em "%".', p_lista;
    END IF;
  END IF;

  INSERT INTO public.ops_rotulo (organization_id, lista, valor, nome, ordem, ativo)
  VALUES (
    p_org_id, p_lista, p_valor, v_nome,
    COALESCE(p_ordem, array_position(v_valores, p_valor)),
    v_ativo
  )
  ON CONFLICT (organization_id, lista, valor) DO UPDATE
     SET nome          = EXCLUDED.nome,
         ordem         = COALESCE(p_ordem, public.ops_rotulo.ordem),
         ativo         = v_ativo,
         atualizado_em = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'por', v_user);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_rotulo(uuid, text, text, text, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_rotulo(uuid, text, text, text, integer, boolean)
  TO authenticated;


/* Voltar ao nome de origem: apaga-se a linha e o código volta a mandar. */
CREATE OR REPLACE FUNCTION public.rpc_ops_repor_rotulos(p_org_id uuid, p_lista text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_n    integer;
BEGIN
  DELETE FROM public.ops_rotulo
   WHERE organization_id = p_org_id
     AND (p_lista IS NULL OR lista = p_lista);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'repostos', v_n, 'por', v_user);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_repor_rotulos(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_repor_rotulos(uuid, text) TO authenticated;


-- ============================================================
-- 3. As especialidades, que nunca tiveram porta
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_skill(
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
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id   uuid;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'A especialidade precisa de nome.';
  END IF;

  IF p_id IS NULL THEN
    -- Repetir o nome não é erro de quem escreve: é uma lista que já lá estava.
    INSERT INTO public.ops_skill (organization_id, nome, ativo)
    VALUES (p_org_id, v_nome, COALESCE(p_ativo, true))
    ON CONFLICT (organization_id, nome) DO UPDATE
       SET ativo = COALESCE(p_ativo, true)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_skill
       SET nome = v_nome, ativo = COALESCE(p_ativo, ativo)
     WHERE id = p_id AND organization_id = p_org_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Essa especialidade não é desta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'por', v_user);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_gravar_skill(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_gravar_skill(uuid, text, uuid, boolean) TO authenticated;


/* Quem tem que especialidade. Substitui a lista toda de uma pessoa: mandar o
   conjunto inteiro evita o estado a meio de "tirei uma, ainda não pus a
   outra", que numa lista de duas linhas ninguém repara e no filtro da agenda
   dá uma pessoa a desaparecer. */
CREATE OR REPLACE FUNCTION public.rpc_ops_skills_do_utilizador(
  p_org_id        uuid,
  p_utilizador_id uuid,
  p_skills        uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := public.ops_exige_gestao(p_org_id);
  v_n    integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE organization_id = p_org_id AND utilizador_id = p_utilizador_id
  ) THEN
    RAISE EXCEPTION 'Essa pessoa não é da equipa desta organização.';
  END IF;

  -- Só as especialidades desta organização, mesmo que venham outras no pedido.
  DELETE FROM public.ops_utilizador_skill us
   USING public.ops_skill s
   WHERE us.skill_id = s.id
     AND s.organization_id = p_org_id
     AND us.utilizador_id = p_utilizador_id;

  IF p_skills IS NOT NULL AND array_length(p_skills, 1) > 0 THEN
    INSERT INTO public.ops_utilizador_skill (utilizador_id, skill_id)
    SELECT p_utilizador_id, s.id
      FROM public.ops_skill s
     WHERE s.id = ANY (p_skills) AND s.organization_id = p_org_id
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('ok', true, 'especialidades', v_n, 'por', v_user);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_skills_do_utilizador(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_skills_do_utilizador(uuid, uuid, uuid[]) TO authenticated;


-- As especialidades já tinham RLS de leitura pelo `permissoes.sql`; o que
-- faltava era não deixar escrever por fora das RPCs.
REVOKE INSERT, UPDATE, DELETE ON public.ops_skill FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ops_utilizador_skill FROM authenticated;


-- ============================================================
-- 4. Verificação
-- ============================================================

DO $verificar$
BEGIN
  IF to_regclass('public.ops_rotulo') IS NULL THEN
    RAISE EXCEPTION 'A tabela dos rótulos não ficou criada.';
  END IF;

  IF to_regprocedure('public.rpc_ops_gravar_rotulo(uuid,text,text,text,integer,boolean)') IS NULL
     OR to_regprocedure('public.rpc_ops_gravar_skill(uuid,text,uuid,boolean)') IS NULL
     OR to_regprocedure('public.rpc_ops_skills_do_utilizador(uuid,uuid,uuid[])') IS NULL THEN
    RAISE EXCEPTION 'Faltam RPCs das listas configuráveis.';
  END IF;

  IF has_table_privilege('authenticated', 'public.ops_rotulo', 'UPDATE') THEN
    RAISE EXCEPTION 'Os rótulos só se mudam por RPC.';
  END IF;

  IF has_table_privilege('authenticated', 'public.ops_skill', 'INSERT') THEN
    RAISE EXCEPTION 'As especialidades só se criam por RPC.';
  END IF;

  RAISE NOTICE 'Operações: as listas fixas passam a ter o nome que a empresa lhes der.';
END
$verificar$;

COMMIT;
