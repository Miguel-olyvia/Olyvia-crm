-- ============================================================
--  Operações — Obras: fotos nas tarefas
-- ============================================================
--  Correr DEPOIS de: obras.sql (e de seguranca.sql).
--
--  ⚠ Se voltares a correr seguranca.sql, corre este a seguir: o seguranca.sql
--    recria a política de leitura do bucket `operacoes` só para as ordens, e
--    é este ficheiro que lhe junta as obras.
--
--  O pedido: o executor tira fotos da tarefa (antes, durante, feito) e o
--  supervisor vê-as na fila "Validar" antes de validar ou rejeitar.
--
--  Mesmo bucket das ordens (`operacoes`), outra convenção de caminho:
--      <organização>/<obra>/<tarefa>/<ficheiro>
--  O segundo segmento é a OBRA. A política de leitura passa a aceitar o
--  segundo segmento como ordem que se vê OU como obra que se vê.
--
--  Regras:
--   · regista quem está na tarefa, ou quem planeia (admin/gestor), ou o
--     supervisor da obra; nunca numa tarefa já validada ou numa obra
--     concluída/cancelada;
--   · apaga quem a tirou (enquanto a tarefa não estiver validada), ou
--     admin/gestor;
--   · lê quem vê a obra (ops_pode_ver_obra);
--   · escrita só por RPC. Zero escritas e zero FKs para o CRM.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_obra_tarefa_foto (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  tarefa_id        uuid NOT NULL REFERENCES public.ops_obra_tarefa(id) ON DELETE CASCADE,
  caminho          text NOT NULL UNIQUE,
  nome             text NOT NULL,
  mime             text,
  tamanho          integer,
  legenda          text,
  carregado_por    uuid,            -- → anew_users.id
  carregado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_obra_tarefa_foto_tarefa_idx
  ON public.ops_obra_tarefa_foto (tarefa_id, carregado_em);

ALTER TABLE public.ops_obra_tarefa_foto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_obra_tarefa_foto_ler ON public.ops_obra_tarefa_foto;
CREATE POLICY ops_obra_tarefa_foto_ler ON public.ops_obra_tarefa_foto
  FOR SELECT TO authenticated
  USING (public.ops_pode_ver_obra(obra_id));

REVOKE ALL ON public.ops_obra_tarefa_foto FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ops_obra_tarefa_foto FROM authenticated;
GRANT SELECT ON public.ops_obra_tarefa_foto TO authenticated;
GRANT ALL ON public.ops_obra_tarefa_foto TO service_role;


-- ── Registar uma foto (o ficheiro já subiu para o storage) ─────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_registar_foto(
  p_tarefa_id uuid,
  p_caminho   text,
  p_nome      text,
  p_mime      text    DEFAULT NULL,
  p_tamanho   integer DEFAULT NULL,
  p_legenda   text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_t       record;
  v_user    uuid;
  v_funcao  text;
  v_prefixo text;
  v_id      uuid;
BEGIN
  SELECT t.id, t.obra_id, t.estado, o.organization_id, o.estado AS obra_estado, o.supervisor_id
    INTO v_t
    FROM public.ops_obra_tarefa t
    JOIN public.ops_obra o ON o.id = t.obra_id
   WHERE t.id = p_tarefa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_t.organization_id) q;

  IF NOT (
    public.ops_pode(v_t.organization_id, 'operations.orders.execute')
    OR public.ops_pode(v_t.organization_id, 'operations.orders.edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para tirar fotos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT (
    v_funcao IN ('admin','gestor')
    OR v_t.supervisor_id = v_user
    OR EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                WHERE tp.tarefa_id = p_tarefa_id AND tp.utilizador_id = v_user)
  ) THEN
    RAISE EXCEPTION 'Só quem está na tarefa lhe junta fotos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_t.estado = 'validada' THEN
    RAISE EXCEPTION 'A tarefa já está validada — não se juntam fotos.';
  END IF;
  IF v_t.obra_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está % — não se juntam fotos.', replace(v_t.obra_estado, 'concluida', 'concluída');
  END IF;

  v_prefixo := v_t.organization_id::text || '/' || v_t.obra_id::text || '/' || v_t.id::text || '/';
  IF p_caminho IS NULL OR left(p_caminho, length(v_prefixo)) <> v_prefixo
     OR position('..' IN p_caminho) > 0 THEN
    RAISE EXCEPTION 'O caminho do ficheiro não pertence a esta tarefa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_obra_tarefa_foto
    (organization_id, obra_id, tarefa_id, caminho, nome, mime, tamanho, legenda, carregado_por)
  VALUES
    (v_t.organization_id, v_t.obra_id, v_t.id, p_caminho,
     COALESCE(nullif(btrim(p_nome), ''), 'foto'),
     p_mime, p_tamanho, nullif(btrim(coalesce(p_legenda, '')), ''), v_user)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'caminho', p_caminho);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_registar_foto(uuid, text, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_foto(uuid, text, text, text, integer, text) TO authenticated, service_role;


-- ── Apagar uma foto (devolve o caminho, para a app o tirar do storage) ─────
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_remover_foto(p_foto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_f      record;
  v_user   uuid;
  v_funcao text;
BEGIN
  SELECT f.*, t.estado AS tarefa_estado
    INTO v_f
    FROM public.ops_obra_tarefa_foto f
    JOIN public.ops_obra_tarefa t ON t.id = f.tarefa_id
   WHERE f.id = p_foto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foto não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_f.organization_id) q;

  IF v_funcao NOT IN ('admin','gestor') THEN
    IF v_f.carregado_por IS DISTINCT FROM v_user THEN
      RAISE EXCEPTION 'Só quem tirou a foto a apaga.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_f.tarefa_estado = 'validada' THEN
      RAISE EXCEPTION 'A tarefa já está validada — a foto fica.';
    END IF;
  END IF;

  DELETE FROM public.ops_obra_tarefa_foto WHERE id = p_foto_id;
  RETURN jsonb_build_object('ok', true, 'caminho', v_f.caminho);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_remover_foto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_remover_foto(uuid) TO authenticated, service_role;

COMMIT;


-- ── Storage: ler também as fotos das obras que se veem ─────────────────────
-- A mesma política que seguranca.sql cria, com mais um ramo: o segundo
-- segmento do caminho pode ser uma OBRA que quem lê vê.
DO $storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Sem esquema storage nesta base — política do bucket por recriar.';
    RETURN;
  END IF;

  EXECUTE $p$
    DROP POLICY IF EXISTS ops_anexos_ler ON storage.objects;
    CREATE POLICY ops_anexos_ler ON storage.objects
      FOR SELECT TO authenticated USING (
        bucket_id = 'operacoes'
        AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
        AND split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$'
        AND public.ops_pode(split_part(name, '/', 1)::uuid, 'operations.orders.view')
        AND (
          public.ops_pode_ver_ordem((SELECT auth.uid()), split_part(name, '/', 2)::uuid)
          OR public.ops_pode_ver_obra(split_part(name, '/', 2)::uuid)
        )
      );
  $p$;
END
$storage$;
