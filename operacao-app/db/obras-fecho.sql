-- ============================================================
--  Operações — Obras: fecho da obra no telemóvel
-- ============================================================
--  Correr DEPOIS de: obras.sql e obras-fotos.sql. Pode correr-se outra vez.
--  ⚠ Se voltares a correr obras-fotos.sql, não há nada a refazer aqui (só se
--    acrescentam colunas à tabela das fotos).
--
--  O pedido (06/10/2026): fechar a obra no local, com o cliente.
--    1. Remates: o que ficou por acabar — divisão, descrição, foto,
--       responsável, estado (aberto → resolvido → verificado). Nascem na
--       vistoria do supervisor ou na receção com o cliente.
--    2. Vistoria final por divisão: uma lista curta por tipo de divisão
--       (casa de banho, cozinha, geral), configurável por organização. Um
--       "não está bem" abre um remate sozinho.
--    3. Fotos antes/depois: marca-se uma foto de tarefa como "antes" ou
--       "depois" de uma divisão, e o ecrã põe-nas lado a lado.
--    4. Auto de receção: resumo, assinatura do cliente desenhada no ecrã,
--       nome de quem assina, data/hora, e o PDF guardado na obra.
--    5. Concluir a obra passa a exigir o auto assinado OU uma justificação
--       do gestor (trigger em ops_obra — vale para qualquer caminho).
--
--  Ficheiros no bucket `operacoes` (as políticas de obras-fotos.sql já leem
--  quando o 2.º segmento é uma obra que se vê):
--      <organização>/<obra>/fecho/<ficheiro>     assinatura e PDF do auto
--      <organização>/<obra>/remates/<ficheiro>   fotos dos remates
--
--  Quem: o supervisor DESTA obra, ou admin/gestor. Resolver um remate: também
--  o responsável dele. Justificar o fecho sem auto: só admin/gestor.
--  Escrita só por RPC. Zero escritas e zero FKs para o CRM.
-- ============================================================

BEGIN;

-- ── Tabelas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ops_obra_divisao (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  tipo             text NOT NULL DEFAULT 'geral' CHECK (tipo IN ('casa_banho','cozinha','geral')),
  ordem            integer NOT NULL DEFAULT 0,
  criada_por       uuid,            -- → anew_users.id
  criada_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (obra_id, nome)
);
CREATE INDEX IF NOT EXISTS ops_obra_divisao_obra_idx ON public.ops_obra_divisao (obra_id, ordem);

-- A lista da vistoria, por organização e tipo de divisão. Sem linhas para um
-- tipo, vale a lista de origem (ops_obra_vistoria_padrao).
CREATE TABLE IF NOT EXISTS public.ops_obra_vistoria_item (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  tipo             text NOT NULL CHECK (tipo IN ('casa_banho','cozinha','geral')),
  ordem            integer NOT NULL DEFAULT 0,
  texto            text NOT NULL,
  atualizado_por   uuid,
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tipo, texto)
);

CREATE TABLE IF NOT EXISTS public.ops_obra_remate (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  divisao_id       uuid REFERENCES public.ops_obra_divisao(id) ON DELETE SET NULL,
  descricao        text NOT NULL,
  foto_caminho     text,
  responsavel_id   uuid,            -- → anew_users.id
  estado           text NOT NULL DEFAULT 'aberto' CHECK (estado IN ('aberto','resolvido','verificado')),
  origem           text NOT NULL DEFAULT 'vistoria' CHECK (origem IN ('vistoria','rececao','outro')),
  nota             text,
  criado_por       uuid,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  resolvido_por    uuid,
  resolvido_em     timestamptz,
  verificado_por   uuid,
  verificado_em    timestamptz
);
CREATE INDEX IF NOT EXISTS ops_obra_remate_obra_idx ON public.ops_obra_remate (obra_id, estado);

CREATE TABLE IF NOT EXISTS public.ops_obra_vistoria (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  obra_id          uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  divisao_id       uuid NOT NULL REFERENCES public.ops_obra_divisao(id) ON DELETE CASCADE,
  item             text NOT NULL,
  resultado        text NOT NULL CHECK (resultado IN ('ok','nok','na')),
  nota             text,
  remate_id        uuid REFERENCES public.ops_obra_remate(id) ON DELETE SET NULL,
  respondido_por   uuid,
  respondido_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (divisao_id, item)
);
CREATE INDEX IF NOT EXISTS ops_obra_vistoria_obra_idx ON public.ops_obra_vistoria (obra_id);

-- Uma linha por obra: o auto de receção e/ou a justificação de fecho sem auto.
CREATE TABLE IF NOT EXISTS public.ops_obra_fecho (
  obra_id                  uuid PRIMARY KEY REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  organization_id          uuid NOT NULL,
  auto_assinante           text,
  auto_assinatura_caminho  text,
  auto_pdf_caminho         text,
  auto_observacoes         text,
  auto_resumo              jsonb,
  auto_assinado_em         timestamptz,
  auto_registado_por       uuid,
  justificacao             text,
  justificado_por          uuid,
  justificado_em           timestamptz
);

-- Fotos antes/depois: duas colunas na tabela das fotos das tarefas.
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS momento text;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS divisao_id uuid;
DO $c$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_foto_momento_chk') THEN
    ALTER TABLE public.ops_obra_tarefa_foto
      ADD CONSTRAINT ops_obra_tarefa_foto_momento_chk CHECK (momento IS NULL OR momento IN ('antes','depois'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_obra_tarefa_foto_divisao_fk') THEN
    ALTER TABLE public.ops_obra_tarefa_foto
      ADD CONSTRAINT ops_obra_tarefa_foto_divisao_fk FOREIGN KEY (divisao_id)
      REFERENCES public.ops_obra_divisao(id) ON DELETE SET NULL;
  END IF;
END
$c$;

-- ── RLS: lê quem vê a obra; escreve só a RPC ───────────────────────────────
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ops_obra_divisao','ops_obra_remate','ops_obra_vistoria','ops_obra_fecho'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ler', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.ops_pode_ver_obra(obra_id))',
                   t || '_ler', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END
$rls$;

ALTER TABLE public.ops_obra_vistoria_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_obra_vistoria_item_ler ON public.ops_obra_vistoria_item;
CREATE POLICY ops_obra_vistoria_item_ler ON public.ops_obra_vistoria_item
  FOR SELECT TO authenticated USING (public.ops_pode(organization_id, 'operations.view'));
REVOKE ALL ON public.ops_obra_vistoria_item FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.ops_obra_vistoria_item FROM authenticated;
GRANT SELECT ON public.ops_obra_vistoria_item TO authenticated;
GRANT ALL ON public.ops_obra_vistoria_item TO service_role;


-- ── Lista de origem da vistoria ────────────────────────────────────────────
-- Curta de propósito: é para responder de pé, com o cliente ao lado.
CREATE OR REPLACE FUNCTION public.ops_obra_vistoria_padrao(_tipo text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE _tipo
    WHEN 'casa_banho' THEN ARRAY[
      'Loiça sanitária fixa, sem fissuras nem riscos',
      'Torneiras e misturadora sem fugas',
      'Base de duche / banheira vedada (silicone contínuo)',
      'Escoamento rápido, sem água parada',
      'Revestimento sem peças partidas nem desníveis',
      'Juntas preenchidas e limpas',
      'Autoclismo enche e pára bem',
      'Extração / ventilação a funcionar',
      'Iluminação e tomadas a funcionar',
      'Porta abre e fecha sem tocar',
      'Espelho e acessórios fixos',
      'Limpeza final feita']
    WHEN 'cozinha' THEN ARRAY[
      'Móveis nivelados, portas alinhadas',
      'Gavetas e dobradiças a funcionar',
      'Bancada sem riscos nem fissuras, juntas seladas',
      'Lava-loiça e torneira sem fugas',
      'Escoamento a funcionar',
      'Eletrodomésticos ligados e testados',
      'Exaustor a funcionar',
      'Tomadas da bancada a funcionar',
      'Revestimento sem peças partidas',
      'Iluminação a funcionar',
      'Limpeza final feita']
    ELSE ARRAY[
      'Paredes e tetos sem defeitos de pintura',
      'Pavimento sem riscos nem peças soltas',
      'Rodapés fixos',
      'Portas e janelas a funcionar',
      'Tomadas e interruptores a funcionar',
      'Proteções retiradas e zonas comuns limpas',
      'Entulho retirado']
  END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_vistoria_padrao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_vistoria_padrao(text) TO authenticated, service_role;

-- A lista em vigor para uma organização e um tipo.
CREATE OR REPLACE FUNCTION public.ops_obra_vistoria_itens(_org uuid, _tipo text)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT array_agg(texto ORDER BY ordem, texto) FROM public.ops_obra_vistoria_item
      WHERE organization_id = _org AND tipo = _tipo),
    public.ops_obra_vistoria_padrao(_tipo))
$$;

REVOKE ALL ON FUNCTION public.ops_obra_vistoria_itens(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_obra_vistoria_itens(uuid, text) TO service_role;


-- ── Quem fecha esta obra ───────────────────────────────────────────────────
-- Devolve a obra e quem pergunta; recusa quem não pode. `_aberta`: a obra
-- tem de estar em curso (ou suspensa) — concluída/cancelada fica como está.
CREATE OR REPLACE FUNCTION public.ops_obra_fecho_exigir(
  _obra uuid, _aberta boolean DEFAULT true,
  OUT o_org uuid, OUT o_utilizador uuid, OUT o_funcao text, OUT o_supervisor uuid, OUT o_estado text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  SELECT o.organization_id, o.supervisor_id, o.estado INTO o_org, o_supervisor, o_estado
    FROM public.ops_obra o WHERE o.id = _obra;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(_obra) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT q.utilizador_id, q.funcao INTO o_utilizador, o_funcao FROM public.ops_quem_sou(o_org) q;
  IF NOT (public.ops_pode(o_org, 'operations.orders.execute') OR public.ops_pode(o_org, 'operations.orders.edit')) THEN
    RAISE EXCEPTION 'Sem permissão nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (o_funcao IN ('admin','gestor') OR o_supervisor = o_utilizador) THEN
    RAISE EXCEPTION 'Só o supervisor desta obra (ou o gestor) faz o fecho.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _aberta AND o_estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está % — o fecho já não muda.', replace(o_estado, 'concluida', 'concluída');
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_fecho_exigir(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- Caminho de ficheiro desta obra, numa pasta dada. NULL passa (sem ficheiro).
CREATE OR REPLACE FUNCTION public.ops_obra_fecho_caminho_ok(_org uuid, _obra uuid, _pasta text, _caminho text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _caminho IS NULL OR (
    left(_caminho, length(_org::text || '/' || _obra::text || '/' || _pasta || '/'))
      = _org::text || '/' || _obra::text || '/' || _pasta || '/'
    AND position('..' IN _caminho) = 0)
$$;

REVOKE ALL ON FUNCTION public.ops_obra_fecho_caminho_ok(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;


-- ── Ler tudo de uma vez ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_fecho(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o      record;
  v_eu     uuid;
  v_funcao text;
  v_cli    text;
  v_sug    jsonb := '[]'::jsonb;
  v_txt    text;
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(v_o.organization_id) q;

  IF v_o.cliente_id IS NOT NULL AND to_regclass('public.ops_v_cliente') IS NOT NULL THEN
    EXECUTE 'SELECT nome FROM public.ops_v_cliente WHERE id = $1' INTO v_cli USING v_o.cliente_id;
  END IF;

  -- Divisões sugeridas quando ainda não há nenhuma: do título e do modelo.
  IF NOT EXISTS (SELECT 1 FROM public.ops_obra_divisao WHERE obra_id = p_obra_id) THEN
    v_txt := lower(coalesce(v_o.titulo, '') || ' ' ||
                   coalesce((SELECT m.nome FROM public.ops_obra_modelo m WHERE m.id = v_o.modelo_id), ''));
    IF v_txt LIKE '%cozinha%' THEN
      v_sug := v_sug || jsonb_build_array(jsonb_build_object('nome', 'Cozinha', 'tipo', 'cozinha'));
    END IF;
    IF v_txt LIKE '%banho%' OR v_txt ~ '\mwc\M' THEN
      v_sug := v_sug || jsonb_build_array(jsonb_build_object('nome', 'Casa de banho', 'tipo', 'casa_banho'));
    END IF;
    IF jsonb_array_length(v_sug) = 0 THEN
      v_sug := jsonb_build_array(jsonb_build_object('nome', 'Geral', 'tipo', 'geral'));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'obra', jsonb_build_object(
      'id', v_o.id, 'codigo', v_o.codigo, 'titulo', v_o.titulo, 'estado', v_o.estado,
      'morada', v_o.morada, 'cliente', v_cli, 'supervisor_id', v_o.supervisor_id,
      'data_inicio_prevista', v_o.data_inicio_prevista, 'iniciada_em', v_o.iniciada_em,
      'concluida_em', v_o.concluida_em,
      'inicio_planeado', (SELECT min(inicio_planeado) FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id),
      'fim_planeado', (SELECT max(fim_planeado) FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id),
      'fim_original', (SELECT max(COALESCE(fim_original, fim_planeado)) FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id),
      'n_tarefas', (SELECT count(*) FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id),
      'n_por_validar', (SELECT count(*) FROM public.ops_obra_tarefa WHERE obra_id = p_obra_id AND estado <> 'validada')),
    'pode', jsonb_build_object(
      'fechar', (v_funcao IN ('admin','gestor') OR v_o.supervisor_id = v_eu)
                AND (public.ops_pode(v_o.organization_id, 'operations.orders.execute')
                     OR public.ops_pode(v_o.organization_id, 'operations.orders.edit')),
      'justificar', v_funcao IN ('admin','gestor') AND public.ops_pode(v_o.organization_id, 'operations.orders.edit'),
      'eu', v_eu),
    'divisoes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'tipo', d.tipo,
                                    'itens', to_jsonb(public.ops_obra_vistoria_itens(v_o.organization_id, d.tipo)))
                                  ORDER BY d.ordem, d.criada_em)
                           FROM public.ops_obra_divisao d WHERE d.obra_id = p_obra_id), '[]'::jsonb),
    'sugestoes', v_sug,
    'vistoria', COALESCE((SELECT jsonb_agg(jsonb_build_object('divisao_id', v.divisao_id, 'item', v.item,
                                    'resultado', v.resultado, 'nota', v.nota, 'remate_id', v.remate_id))
                           FROM public.ops_obra_vistoria v WHERE v.obra_id = p_obra_id), '[]'::jsonb),
    'remates', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'divisao_id', r.divisao_id,
                                   'descricao', r.descricao, 'foto_caminho', r.foto_caminho,
                                   'responsavel_id', r.responsavel_id,
                                   'responsavel', (SELECT u.name FROM public.anew_users u WHERE u.id = r.responsavel_id),
                                   'estado', r.estado, 'origem', r.origem, 'nota', r.nota,
                                   'criado_em', r.criado_em, 'resolvido_em', r.resolvido_em,
                                   'verificado_em', r.verificado_em)
                                 ORDER BY (r.estado = 'verificado'), r.criado_em)
                          FROM public.ops_obra_remate r WHERE r.obra_id = p_obra_id), '[]'::jsonb),
    'fotos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'caminho', f.caminho, 'nome', f.nome,
                                 'tarefa', t.nome, 'momento', f.momento, 'divisao_id', f.divisao_id,
                                 'carregado_em', f.carregado_em)
                               ORDER BY f.carregado_em)
                        FROM public.ops_obra_tarefa_foto f
                        JOIN public.ops_obra_tarefa t ON t.id = f.tarefa_id
                       WHERE f.obra_id = p_obra_id), '[]'::jsonb),
    'fecho', (SELECT jsonb_build_object(
                'auto_assinante', f.auto_assinante, 'auto_assinatura_caminho', f.auto_assinatura_caminho,
                'auto_pdf_caminho', f.auto_pdf_caminho, 'auto_observacoes', f.auto_observacoes,
                'auto_assinado_em', f.auto_assinado_em, 'justificacao', f.justificacao,
                'justificado_em', f.justificado_em,
                'justificado_por', (SELECT u.name FROM public.anew_users u WHERE u.id = f.justificado_por))
                FROM public.ops_obra_fecho f WHERE f.obra_id = p_obra_id)
  );
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_fecho(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_fecho(uuid) TO authenticated, service_role;


-- ── Divisões ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_divisao_guardar(p_obra_id uuid, p_nome text, p_tipo text DEFAULT 'geral')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_q    record;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id   uuid;
BEGIN
  SELECT * INTO v_q FROM public.ops_obra_fecho_exigir(p_obra_id);
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Dá um nome à divisão.'; END IF;
  IF coalesce(p_tipo, 'geral') NOT IN ('casa_banho','cozinha','geral') THEN
    RAISE EXCEPTION 'Tipo de divisão desconhecido.';
  END IF;
  INSERT INTO public.ops_obra_divisao (organization_id, obra_id, nome, tipo, ordem, criada_por)
  VALUES (v_q.o_org, p_obra_id, v_nome, coalesce(p_tipo, 'geral'),
          COALESCE((SELECT max(ordem) + 1 FROM public.ops_obra_divisao WHERE obra_id = p_obra_id), 1),
          v_q.o_utilizador)
  ON CONFLICT (obra_id, nome) DO UPDATE SET tipo = EXCLUDED.tipo
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_divisao_guardar(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_divisao_guardar(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_divisao_remover(p_divisao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_obra uuid;
BEGIN
  SELECT obra_id INTO v_obra FROM public.ops_obra_divisao WHERE id = p_divisao_id;
  IF v_obra IS NULL THEN RAISE EXCEPTION 'Divisão não encontrada.' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public.ops_obra_fecho_exigir(v_obra);
  IF EXISTS (SELECT 1 FROM public.ops_obra_remate WHERE divisao_id = p_divisao_id AND estado <> 'verificado') THEN
    RAISE EXCEPTION 'Esta divisão tem remates por fechar — resolve-os primeiro.';
  END IF;
  DELETE FROM public.ops_obra_divisao WHERE id = p_divisao_id;
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_divisao_remover(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_divisao_remover(uuid) TO authenticated, service_role;


-- ── Remates ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_remate_criar(
  p_obra_id        uuid,
  p_descricao      text,
  p_divisao_id     uuid DEFAULT NULL,
  p_origem         text DEFAULT 'vistoria',
  p_responsavel_id uuid DEFAULT NULL,
  p_foto_caminho   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_q    record;
  v_desc text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_id   uuid;
BEGIN
  SELECT * INTO v_q FROM public.ops_obra_fecho_exigir(p_obra_id);
  IF v_desc IS NULL THEN RAISE EXCEPTION 'Descreve o remate.'; END IF;
  IF coalesce(p_origem, 'vistoria') NOT IN ('vistoria','rececao','outro') THEN
    RAISE EXCEPTION 'Origem do remate desconhecida.';
  END IF;
  IF p_divisao_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_obra_divisao WHERE id = p_divisao_id AND obra_id = p_obra_id) THEN
    RAISE EXCEPTION 'Essa divisão não é desta obra.';
  END IF;
  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_utilizador_perfil
        WHERE organization_id = v_q.o_org AND utilizador_id = p_responsavel_id AND ativo) THEN
    RAISE EXCEPTION 'O responsável tem de ser da equipa ativa desta organização.';
  END IF;
  IF NOT public.ops_obra_fecho_caminho_ok(v_q.o_org, p_obra_id, 'remates', p_foto_caminho) THEN
    RAISE EXCEPTION 'A foto não pertence a esta obra.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_obra_remate
    (organization_id, obra_id, divisao_id, descricao, foto_caminho, responsavel_id, origem, criado_por)
  VALUES (v_q.o_org, p_obra_id, p_divisao_id, v_desc, p_foto_caminho, p_responsavel_id,
          coalesce(p_origem, 'vistoria'), v_q.o_utilizador)
  RETURNING id INTO v_id;

  PERFORM public.ops_obra_evento(v_q.o_org, p_obra_id, 'remate', v_desc, v_q.o_utilizador,
    jsonb_build_object('remate_id', v_id, 'origem', coalesce(p_origem, 'vistoria')));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_remate_criar(uuid, text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_remate_criar(uuid, text, uuid, text, uuid, text) TO authenticated, service_role;

-- aberto → resolvido (o responsável, o supervisor ou o gestor);
-- resolvido → verificado (supervisor/gestor); qualquer → aberto (reabrir:
-- supervisor/gestor). Verificar sem passar por resolvido também se aceita
-- (o supervisor resolveu-o ele próprio).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_remate_estado(p_remate_id uuid, p_estado text, p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_r      record;
  v_o      record;
  v_eu     uuid;
  v_funcao text;
  v_coord  boolean;
BEGIN
  SELECT * INTO v_r FROM public.ops_obra_remate WHERE id = p_remate_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(v_r.obra_id) THEN
    RAISE EXCEPTION 'Remate não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT organization_id, supervisor_id, estado INTO v_o FROM public.ops_obra WHERE id = v_r.obra_id;
  IF v_o.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está % — os remates já não mudam.', replace(v_o.estado, 'concluida', 'concluída');
  END IF;
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(v_o.organization_id) q;
  IF NOT (public.ops_pode(v_o.organization_id, 'operations.orders.execute') OR public.ops_pode(v_o.organization_id, 'operations.orders.edit')) THEN
    RAISE EXCEPTION 'Sem permissão nesta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_coord := v_funcao IN ('admin','gestor') OR v_o.supervisor_id = v_eu;

  IF p_estado NOT IN ('aberto','resolvido','verificado') THEN
    RAISE EXCEPTION 'Estado de remate desconhecido.';
  END IF;
  IF p_estado = 'resolvido' AND NOT (v_coord OR v_r.responsavel_id = v_eu) THEN
    RAISE EXCEPTION 'Só o responsável do remate (ou o supervisor) o dá por resolvido.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_estado IN ('verificado','aberto') AND NOT v_coord THEN
    RAISE EXCEPTION 'Só o supervisor desta obra (ou o gestor) verifica ou reabre um remate.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.ops_obra_remate
     SET estado = p_estado,
         nota = COALESCE(nullif(btrim(coalesce(p_nota, '')), ''), nota),
         resolvido_por = CASE WHEN p_estado = 'resolvido' THEN v_eu WHEN p_estado = 'aberto' THEN NULL ELSE resolvido_por END,
         resolvido_em  = CASE WHEN p_estado = 'resolvido' THEN now() WHEN p_estado = 'aberto' THEN NULL ELSE resolvido_em END,
         verificado_por = CASE WHEN p_estado = 'verificado' THEN v_eu ELSE NULL END,
         verificado_em  = CASE WHEN p_estado = 'verificado' THEN now() ELSE NULL END
   WHERE id = p_remate_id;
  RETURN jsonb_build_object('ok', true, 'estado', p_estado);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_remate_estado(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_remate_estado(uuid, text, text) TO authenticated, service_role;


-- ── Vistoria ───────────────────────────────────────────────────────────────
-- Responder a um item. "nok" abre um remate (uma vez); voltar a "ok"/"na"
-- não apaga o remate — fica para se verificar.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_vistoria_responder(
  p_divisao_id uuid, p_item text, p_resultado text, p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_d      record;
  v_q      record;
  v_ant    record;
  v_remate uuid;
  v_item   text := nullif(btrim(coalesce(p_item, '')), '');
  v_nota   text := nullif(btrim(coalesce(p_nota, '')), '');
BEGIN
  SELECT * INTO v_d FROM public.ops_obra_divisao WHERE id = p_divisao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Divisão não encontrada.' USING ERRCODE = 'no_data_found'; END IF;
  SELECT * INTO v_q FROM public.ops_obra_fecho_exigir(v_d.obra_id);
  IF v_item IS NULL THEN RAISE EXCEPTION 'Item em falta.'; END IF;
  IF p_resultado NOT IN ('ok','nok','na') THEN RAISE EXCEPTION 'Resposta desconhecida.'; END IF;

  SELECT * INTO v_ant FROM public.ops_obra_vistoria WHERE divisao_id = p_divisao_id AND item = v_item;
  v_remate := v_ant.remate_id;

  IF p_resultado = 'nok' AND v_remate IS NULL THEN
    INSERT INTO public.ops_obra_remate (organization_id, obra_id, divisao_id, descricao, origem, criado_por)
    VALUES (v_q.o_org, v_d.obra_id, p_divisao_id,
            v_item || COALESCE(' — ' || v_nota, ''), 'vistoria', v_q.o_utilizador)
    RETURNING id INTO v_remate;
  END IF;

  INSERT INTO public.ops_obra_vistoria
    (organization_id, obra_id, divisao_id, item, resultado, nota, remate_id, respondido_por)
  VALUES (v_q.o_org, v_d.obra_id, p_divisao_id, v_item, p_resultado, v_nota, v_remate, v_q.o_utilizador)
  ON CONFLICT (divisao_id, item) DO UPDATE
     SET resultado = EXCLUDED.resultado, nota = EXCLUDED.nota, remate_id = EXCLUDED.remate_id,
         respondido_por = EXCLUDED.respondido_por, respondido_em = now();

  RETURN jsonb_build_object('ok', true, 'remate_id', v_remate);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_vistoria_responder(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_vistoria_responder(uuid, text, text, text) TO authenticated, service_role;

-- Mudar a lista de um tipo (gestor/admin). Lista vazia = voltar à de origem.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_vistoria_configurar(p_org uuid, p_tipo text, p_itens text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quem record;
BEGIN
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    p_org, 'operations.orders.edit', ARRAY['gestor'], 'Só o gestor muda a lista da vistoria.');
  IF p_tipo NOT IN ('casa_banho','cozinha','geral') THEN RAISE EXCEPTION 'Tipo de divisão desconhecido.'; END IF;

  DELETE FROM public.ops_obra_vistoria_item WHERE organization_id = p_org AND tipo = p_tipo;
  INSERT INTO public.ops_obra_vistoria_item (organization_id, tipo, ordem, texto, atualizado_por)
  SELECT p_org, p_tipo, min(k)::int, t, v_quem.o_utilizador
    FROM unnest(COALESCE(p_itens, '{}')) WITH ORDINALITY AS x(texto, k)
    CROSS JOIN LATERAL (SELECT nullif(btrim(x.texto), '') AS t) y
   WHERE y.t IS NOT NULL
   GROUP BY t;
  RETURN jsonb_build_object('ok', true,
    'itens', to_jsonb(public.ops_obra_vistoria_itens(p_org, p_tipo)));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_vistoria_configurar(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_vistoria_configurar(uuid, text, text[]) TO authenticated, service_role;


-- ── Fotos antes/depois ─────────────────────────────────────────────────────
-- p_momento NULL desmarca. Marca quem fecha a obra ou quem tirou a foto.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_foto_marcar(p_foto_id uuid, p_momento text, p_divisao_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_f      record;
  v_o      record;
  v_eu     uuid;
  v_funcao text;
BEGIN
  SELECT * INTO v_f FROM public.ops_obra_tarefa_foto WHERE id = p_foto_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(v_f.obra_id) THEN
    RAISE EXCEPTION 'Foto não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT organization_id, supervisor_id, estado INTO v_o FROM public.ops_obra WHERE id = v_f.obra_id;
  SELECT q.utilizador_id, q.funcao INTO v_eu, v_funcao FROM public.ops_quem_sou(v_o.organization_id) q;
  IF NOT (v_funcao IN ('admin','gestor') OR v_o.supervisor_id = v_eu OR v_f.carregado_por = v_eu) THEN
    RAISE EXCEPTION 'Só quem tirou a foto, o supervisor ou o gestor a marca.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_o.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra está fechada — as fotos ficam como estão.';
  END IF;
  IF p_momento IS NOT NULL AND p_momento NOT IN ('antes','depois') THEN
    RAISE EXCEPTION 'Marca "antes" ou "depois".';
  END IF;
  IF p_divisao_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.ops_obra_divisao WHERE id = p_divisao_id AND obra_id = v_f.obra_id) THEN
    RAISE EXCEPTION 'Essa divisão não é desta obra.';
  END IF;

  UPDATE public.ops_obra_tarefa_foto
     SET momento = p_momento,
         divisao_id = CASE WHEN p_momento IS NULL THEN NULL ELSE p_divisao_id END
   WHERE id = p_foto_id;
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_foto_marcar(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_foto_marcar(uuid, text, uuid) TO authenticated, service_role;


-- ── Auto de receção ────────────────────────────────────────────────────────
-- A app já subiu a assinatura (PNG/JPEG) e o PDF para <org>/<obra>/fecho/.
-- Assinado uma vez; refazer só o gestor (fica no histórico de eventos).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_auto_registar(
  p_obra_id             uuid,
  p_assinante           text,
  p_assinatura_caminho  text,
  p_pdf_caminho         text,
  p_observacoes         text DEFAULT NULL,
  p_resumo              jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_q    record;
  v_nome text := nullif(btrim(coalesce(p_assinante, '')), '');
  v_ant  record;
BEGIN
  SELECT * INTO v_q FROM public.ops_obra_fecho_exigir(p_obra_id);
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Escreve o nome de quem assina.'; END IF;
  IF p_assinatura_caminho IS NULL OR p_pdf_caminho IS NULL THEN
    RAISE EXCEPTION 'Faltam a assinatura e o PDF do auto.';
  END IF;
  IF NOT public.ops_obra_fecho_caminho_ok(v_q.o_org, p_obra_id, 'fecho', p_assinatura_caminho)
     OR NOT public.ops_obra_fecho_caminho_ok(v_q.o_org, p_obra_id, 'fecho', p_pdf_caminho) THEN
    RAISE EXCEPTION 'Os ficheiros do auto não pertencem a esta obra.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_ant FROM public.ops_obra_fecho WHERE obra_id = p_obra_id;
  IF v_ant.auto_assinado_em IS NOT NULL AND v_q.o_funcao NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'O auto já foi assinado a %. Só o gestor o refaz.',
      to_char(v_ant.auto_assinado_em AT TIME ZONE 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI');
  END IF;

  INSERT INTO public.ops_obra_fecho (obra_id, organization_id, auto_assinante, auto_assinatura_caminho,
                                     auto_pdf_caminho, auto_observacoes, auto_resumo, auto_assinado_em,
                                     auto_registado_por)
  VALUES (p_obra_id, v_q.o_org, v_nome, p_assinatura_caminho, p_pdf_caminho,
          nullif(btrim(coalesce(p_observacoes, '')), ''), p_resumo, now(), v_q.o_utilizador)
  ON CONFLICT (obra_id) DO UPDATE
     SET auto_assinante = EXCLUDED.auto_assinante,
         auto_assinatura_caminho = EXCLUDED.auto_assinatura_caminho,
         auto_pdf_caminho = EXCLUDED.auto_pdf_caminho,
         auto_observacoes = EXCLUDED.auto_observacoes,
         auto_resumo = EXCLUDED.auto_resumo,
         auto_assinado_em = EXCLUDED.auto_assinado_em,
         auto_registado_por = EXCLUDED.auto_registado_por;

  PERFORM public.ops_obra_evento(v_q.o_org, p_obra_id, 'auto_rececao', 'Auto de receção assinado por ' || v_nome,
    v_q.o_utilizador, jsonb_build_object('pdf', p_pdf_caminho,
      'anterior', CASE WHEN v_ant.auto_assinado_em IS NOT NULL
                       THEN jsonb_build_object('assinante', v_ant.auto_assinante, 'pdf', v_ant.auto_pdf_caminho,
                                               'em', v_ant.auto_assinado_em) END));
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_auto_registar(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_auto_registar(uuid, text, text, text, text, jsonb) TO authenticated, service_role;

-- Concluir sem auto: o gestor justifica (o cliente não esteve, recusou
-- assinar…). Só regista; quem conclui é rpc_ops_obra_mudar_estado.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_fecho_justificar(p_obra_id uuid, p_justificacao text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
  v_txt  text := nullif(btrim(coalesce(p_justificacao, '')), '');
BEGIN
  SELECT * INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_quem FROM public.ops_obra_exigir(
    v_o.organization_id, 'operations.orders.edit', ARRAY['gestor'],
    'Só o gestor conclui uma obra sem o auto de receção.');
  IF v_o.estado IN ('concluida','cancelada') THEN
    RAISE EXCEPTION 'A obra já está %.', replace(v_o.estado, 'concluida', 'concluída');
  END IF;
  IF v_txt IS NULL OR length(v_txt) < 10 THEN
    RAISE EXCEPTION 'Explica porque não há auto assinado (pelo menos uma frase).';
  END IF;

  INSERT INTO public.ops_obra_fecho (obra_id, organization_id, justificacao, justificado_por, justificado_em)
  VALUES (p_obra_id, v_o.organization_id, v_txt, v_quem.o_utilizador, now())
  ON CONFLICT (obra_id) DO UPDATE
     SET justificacao = EXCLUDED.justificacao, justificado_por = EXCLUDED.justificado_por,
         justificado_em = EXCLUDED.justificado_em;

  PERFORM public.ops_obra_evento(v_o.organization_id, p_obra_id, 'fecho_sem_auto', v_txt, v_quem.o_utilizador, NULL);
  RETURN jsonb_build_object('ok', true);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_fecho_justificar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_fecho_justificar(uuid, text) TO authenticated, service_role;


-- ── A regra do fecho, em qualquer caminho ──────────────────────────────────
-- Um trigger e não uma mudança em rpc_ops_obra_mudar_estado: correr outra
-- vez o obras.sql (que recria a RPC) não desfaz a regra.
CREATE OR REPLACE FUNCTION public.ops_obra_fecho_regra()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.estado = 'concluida' AND OLD.estado IS DISTINCT FROM 'concluida'
     AND NOT EXISTS (SELECT 1 FROM public.ops_obra_fecho f
                      WHERE f.obra_id = NEW.id
                        AND (f.auto_assinado_em IS NOT NULL OR f.justificacao IS NOT NULL)) THEN
    RAISE EXCEPTION 'Para concluir a obra falta o auto de receção assinado pelo cliente (ou a justificação do gestor). Vê o separador "Fecho".';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_fecho_regra() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ops_obra_fecho_regra_trg ON public.ops_obra;
CREATE TRIGGER ops_obra_fecho_regra_trg
  BEFORE UPDATE OF estado ON public.ops_obra
  FOR EACH ROW EXECUTE FUNCTION public.ops_obra_fecho_regra();

COMMIT;
