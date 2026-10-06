-- =============================================================================
-- Operações — chegada à obra pelo QR da porta (06/10/2026)
--
-- Corre DEPOIS de db/obras.sql. Idempotente (pode correr-se outra vez).
-- Não escreve em tabela nenhuma do CRM.
--
-- O QR colado na porta abre /operacao/obras/<código>?chegada=1. Quem está
-- numa tarefa da obra carrega em "Registar chegada": fica a hora (e, SÓ se a
-- pessoa aceitar, a localização do telemóvel) e o relógio da primeira tarefa
-- do dia começa pela RPC de sempre (rpc_ops_obra_iniciar_tarefa).
--
-- Sem este ficheiro aplicado a app funciona na mesma: regista a chegada só
-- pelo início do relógio, sem a linha de chegada.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_obra_chegada (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  utilizador_id    uuid NOT NULL,                 -- → anew_users.id
  tarefa_id        uuid REFERENCES public.ops_obra_tarefa(id) ON DELETE SET NULL,
  chegou_em        timestamptz NOT NULL DEFAULT now(),
  -- Só com consentimento de quem chega (o browser pergunta; a app também).
  latitude         numeric(9,6),
  longitude        numeric(9,6),
  precisao_m       numeric(8,1),
  CONSTRAINT ops_obra_chegada_coords CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);

CREATE INDEX IF NOT EXISTS ops_obra_chegada_obra_idx ON public.ops_obra_chegada (obra_id, chegou_em DESC);
CREATE INDEX IF NOT EXISTS ops_obra_chegada_pessoa_idx ON public.ops_obra_chegada (utilizador_id, chegou_em DESC);

ALTER TABLE public.ops_obra_chegada ENABLE ROW LEVEL SECURITY;

-- A tabela não se lê nem se escreve diretamente: escrever só pela RPC; ler
-- pela vista ops_v_obra_chegada, que NÃO mostra as coordenadas (só se houve
-- localização). As coordenadas ficam para quem tiver acesso à base.
REVOKE ALL ON public.ops_obra_chegada FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ops_obra_chegada TO service_role;

-- Registar a MINHA chegada a uma obra. Só quem está numa tarefa dela (ou o
-- supervisor/gestor da obra, ou admin/gestor da organização). A localização é
-- opcional e validada. Devolve {id, chegou_em}.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_registar_chegada(
  p_obra_id    uuid,
  p_tarefa_id  uuid    DEFAULT NULL,
  p_latitude   numeric DEFAULT NULL,
  p_longitude  numeric DEFAULT NULL,
  p_precisao_m numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
  v_id   uuid;
  v_em   timestamptz;
BEGIN
  SELECT id, organization_id, estado, gestor_id, supervisor_id INTO v_o
    FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.execute', NULL, NULL);

  IF v_quem.o_funcao NOT IN ('admin','gestor')
     AND v_quem.o_utilizador IS DISTINCT FROM v_o.supervisor_id
     AND v_quem.o_utilizador IS DISTINCT FROM v_o.gestor_id
     AND NOT EXISTS (SELECT 1 FROM public.ops_obra_tarefa_pessoa tp
                      WHERE tp.obra_id = p_obra_id AND tp.utilizador_id = v_quem.o_utilizador) THEN
    RAISE EXCEPTION 'Não estás em nenhuma tarefa desta obra. Pede ao gestor para te atribuir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado NOT IN ('planeada','em_curso') THEN
    RAISE EXCEPTION 'A obra está %. Não se regista chegada.', v_o.estado;
  END IF;

  IF p_tarefa_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_obra_tarefa WHERE id = p_tarefa_id AND obra_id = p_obra_id) THEN
    RAISE EXCEPTION 'Essa tarefa não é desta obra.';
  END IF;

  IF (p_latitude IS NULL) <> (p_longitude IS NULL)
     OR p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Localização inválida.';
  END IF;

  INSERT INTO public.ops_obra_chegada (organization_id, obra_id, utilizador_id, tarefa_id,
                                       latitude, longitude, precisao_m)
  VALUES (v_o.organization_id, p_obra_id, v_quem.o_utilizador, p_tarefa_id,
          round(p_latitude, 6), round(p_longitude, 6),
          CASE WHEN p_latitude IS NULL THEN NULL ELSE round(GREATEST(p_precisao_m, 0), 1) END)
  RETURNING id, chegou_em INTO v_id, v_em;

  RETURN jsonb_build_object('id', v_id, 'chegou_em', v_em);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_registar_chegada(uuid, uuid, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_registar_chegada(uuid, uuid, numeric, numeric, numeric)
  TO authenticated, service_role;

-- As chegadas a uma obra (para a ficha da obra), com o nome e SEM as
-- coordenadas. NÃO é security_invoker, de propósito (a tabela está fechada a
-- authenticated): a visibilidade vai no WHERE — só quem vê a obra.
DROP VIEW IF EXISTS public.ops_v_obra_chegada;
CREATE VIEW public.ops_v_obra_chegada AS
SELECT c.id, c.organization_id, c.obra_id, c.utilizador_id, c.tarefa_id, c.chegou_em,
       (c.latitude IS NOT NULL) AS com_localizacao,
       COALESCE(u.name, 'Sem nome') AS nome
  FROM public.ops_obra_chegada c
  LEFT JOIN public.anew_users u ON u.id = c.utilizador_id
 WHERE public.ops_pode_ver_obra(c.obra_id);

REVOKE ALL ON public.ops_v_obra_chegada FROM PUBLIC, anon;

GRANT SELECT ON public.ops_v_obra_chegada TO authenticated;
