-- ============================================================
--  Operações — Obras: o cliente acompanha a SUA obra
-- ============================================================
--  Correr DEPOIS de: obras.sql e obras-fotos.sql. Idempotente.
--
--  A "variante mais barata" de docs/portal-do-cliente.md: só leitura. O
--  cliente não pede nada — vê o que já foi combinado, e deixa de telefonar
--  a perguntar "quando é que vêm?".
--
--  Acesso: um LINK PRIVADO por obra, com token aleatório (~244 bits),
--  revogável e com validade. A base guarda só o hash (sha256) do token —
--  quem lê a tabela não consegue reconstruir o link. Gerar um link novo
--  revoga o anterior.
--
--  O que o cliente vê (e só isto): empresa, obra (código, título, morada,
--  estado), progresso, fases com datas, fase atual e próxima, as fotos
--  MARCADAS como visíveis ao cliente (por defeito nenhuma é), os atrasos já
--  COMUNICADOS ao cliente (cliente_avisado), e o contacto do supervisor.
--  Nunca: custos, tempos, nomes da equipa, notas internas, contexto dos
--  atrasos, fotos não marcadas.
--
--  Quem gere o link e marca as fotos: admin/gestor (operations.orders.edit)
--  ou o supervisor desta obra (operations.orders.confirm) — a mesma regra do
--  "cliente avisado".
--
--  Fotos: o bucket é privado. Uma política de leitura acrescentada deixa
--  assinar (createSignedUrl) só as fotos marcadas de obras com link ativo —
--  a partir daí, os URLs são temporários (1 h), como no resto do módulo.
--  Zero escritas no CRM.
-- ============================================================

BEGIN;

-- ── Fotos: visível ao cliente? ─────────────────────────────────────────────
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS visivel_cliente boolean NOT NULL DEFAULT false;
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS visivel_cliente_por uuid;          -- → anew_users.id
ALTER TABLE public.ops_obra_tarefa_foto ADD COLUMN IF NOT EXISTS visivel_cliente_em timestamptz;

CREATE INDEX IF NOT EXISTS ops_obra_tarefa_foto_cliente_idx
  ON public.ops_obra_tarefa_foto (obra_id) WHERE visivel_cliente;

-- ── Links de partilha ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ops_obra_partilha (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL,
  obra_id           uuid NOT NULL REFERENCES public.ops_obra(id) ON DELETE CASCADE,
  token_hash        text NOT NULL UNIQUE,
  criada_por        uuid,            -- → anew_users.id
  criada_em         timestamptz NOT NULL DEFAULT now(),
  expira_em         timestamptz NOT NULL,
  revogada_em       timestamptz,
  revogada_por      uuid,            -- → anew_users.id
  acessos           integer NOT NULL DEFAULT 0,
  ultimo_acesso_em  timestamptz
);

CREATE INDEX IF NOT EXISTS ops_obra_partilha_obra_idx ON public.ops_obra_partilha (obra_id, criada_em DESC);

ALTER TABLE public.ops_obra_partilha ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só as RPCs abaixo lhe tocam.
REVOKE ALL ON public.ops_obra_partilha FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ops_obra_partilha TO service_role;

CREATE OR REPLACE FUNCTION public.ops_obra_token_hash(_token text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT encode(sha256(convert_to(COALESCE(_token, ''), 'UTF8')), 'hex')
$$;

REVOKE ALL ON FUNCTION public.ops_obra_token_hash(text) FROM PUBLIC, anon, authenticated;

-- Quem gere o link e as fotos do cliente nesta obra.
CREATE OR REPLACE FUNCTION public.ops_obra_pode_partilhar(_obra uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o    record;
  v_quem record;
BEGIN
  SELECT id, organization_id, supervisor_id INTO v_o FROM public.ops_obra WHERE id = _obra;
  IF NOT FOUND THEN RETURN false; END IF;
  BEGIN
    SELECT q.utilizador_id, q.funcao INTO v_quem FROM public.ops_quem_sou(v_o.organization_id) q;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN false;
  END;
  RETURN (v_quem.funcao IN ('admin','gestor') AND public.ops_pode(v_o.organization_id, 'operations.orders.edit'))
      OR (v_o.supervisor_id = v_quem.utilizador_id AND public.ops_pode(v_o.organization_id, 'operations.orders.confirm'));
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_pode_partilhar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_obra_pode_partilhar(uuid) TO authenticated, service_role;

-- ── O que o cliente vê (uma só fonte, para o link e para a pré-visualização) ──
CREATE OR REPLACE FUNCTION public.ops_obra_acompanhamento_dados(_obra uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o        record;
  v_empresa  jsonb := '{}'::jsonb;
  v_sup      jsonb := NULL;
  v_fases    jsonb;
  v_prog     record;
  v_fotos    jsonb;
  v_atrasos  jsonb;
  v_atual    jsonb;
  v_proxima  jsonb;
BEGIN
  SELECT o.id, o.organization_id, o.codigo, o.titulo, o.morada, o.estado, o.supervisor_id,
         o.data_inicio_prevista, o.iniciada_em, o.concluida_em
    INTO v_o FROM public.ops_obra o WHERE o.id = _obra;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Empresa: nome (e logótipo/telefone, se o CRM os tiver).
  IF public.ops_obra_crm_tem('anew_organizations', ARRAY['id','name','logo_url','phone']) THEN
    EXECUTE 'SELECT jsonb_build_object(''nome'', name, ''logo_url'', logo_url, ''telefone'', phone)
               FROM public.anew_organizations WHERE id = $1'
       INTO v_empresa USING v_o.organization_id;
  ELSIF public.ops_obra_crm_tem('anew_organizations', ARRAY['id','name']) THEN
    EXECUTE 'SELECT jsonb_build_object(''nome'', name) FROM public.anew_organizations WHERE id = $1'
       INTO v_empresa USING v_o.organization_id;
  END IF;

  -- Supervisor: nome e contactos (é a única pessoa da equipa que aparece).
  IF v_o.supervisor_id IS NOT NULL AND public.ops_obra_crm_tem('anew_users', ARRAY['id','name','email','phone']) THEN
    EXECUTE 'SELECT jsonb_build_object(''nome'', name, ''email'', NULLIF(email, ''''), ''telefone'', NULLIF(phone, ''''))
               FROM public.anew_users WHERE id = $1'
       INTO v_sup USING v_o.supervisor_id;
  ELSIF v_o.supervisor_id IS NOT NULL AND public.ops_obra_crm_tem('anew_users', ARRAY['id','name']) THEN
    EXECUTE 'SELECT jsonb_build_object(''nome'', name) FROM public.anew_users WHERE id = $1'
       INTO v_sup USING v_o.supervisor_id;
  END IF;
  -- Contas de demonstração e afins: o email técnico não serve ao cliente.
  IF v_sup ? 'email' AND (v_sup->>'email') ILIKE '%.invalid' THEN
    v_sup := v_sup - 'email';
  END IF;

  -- Progresso, pesado pelo tempo previsto (uma tarefa de 2 dias pesa mais
  -- do que uma de 1 hora).
  SELECT count(*)::int AS n,
         count(*) FILTER (WHERE t.estado IN ('feita','validada'))::int AS feitas,
         COALESCE(sum(t.minutos_previstos), 0)::bigint AS min_total,
         COALESCE(sum(t.minutos_previstos) FILTER (WHERE t.estado IN ('feita','validada')), 0)::bigint AS min_feitos,
         min(t.inicio_planeado) AS inicio,
         max(t.fim_planeado) AS fim,
         max(COALESCE(t.fim_original, t.fim_planeado)) AS fim_original
    INTO v_prog
    FROM public.ops_obra_tarefa t WHERE t.obra_id = _obra;

  -- Fases, pela ordem, com datas e estado.
  SELECT COALESCE(jsonb_agg(x.fj ORDER BY (x.fj->>'ordem')::int), '[]'::jsonb) INTO v_fases
    FROM (
      SELECT jsonb_build_object(
               'ordem', fa.ordem,
               'nome', fa.nome,
               'inicio', min(t.inicio_planeado),
               'fim', max(t.fim_planeado),
               'n', count(t.id),
               'feitas', count(t.id) FILTER (WHERE t.estado IN ('feita','validada')),
               'estado', CASE
                 WHEN count(t.id) > 0 AND count(t.id) = count(t.id) FILTER (WHERE t.estado IN ('feita','validada')) THEN 'concluida'
                 WHEN count(t.id) FILTER (WHERE t.estado IN ('feita','validada','em_curso')) > 0 THEN 'em_curso'
                 ELSE 'por_fazer' END) AS fj
        FROM public.ops_obra_fase fa
        LEFT JOIN public.ops_obra_tarefa t ON t.fase_id = fa.id
       WHERE fa.obra_id = _obra
       GROUP BY fa.id, fa.ordem, fa.nome
      HAVING count(t.id) > 0
    ) x;

  SELECT e.v INTO v_atual FROM jsonb_array_elements(v_fases) AS e(v)
   WHERE e.v->>'estado' <> 'concluida' ORDER BY (e.v->>'ordem')::int LIMIT 1;
  IF v_atual IS NOT NULL THEN
    SELECT e.v INTO v_proxima FROM jsonb_array_elements(v_fases) AS e(v)
     WHERE (e.v->>'ordem')::int > (v_atual->>'ordem')::int ORDER BY (e.v->>'ordem')::int LIMIT 1;
  END IF;

  -- Fotos marcadas para o cliente: as mais recentes primeiro.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', ft.id, 'caminho', ft.caminho, 'legenda', ft.legenda,
           'data', ft.carregado_em, 'tarefa', t.nome, 'fase', fa.nome)
         ORDER BY ft.carregado_em DESC), '[]'::jsonb)
    INTO v_fotos
    FROM (SELECT * FROM public.ops_obra_tarefa_foto
           WHERE obra_id = _obra AND visivel_cliente
           ORDER BY carregado_em DESC LIMIT 60) ft
    JOIN public.ops_obra_tarefa t ON t.id = ft.tarefa_id
    LEFT JOIN public.ops_obra_fase fa ON fa.id = t.fase_id;

  -- Atrasos JÁ comunicados ao cliente: motivo (rótulo), a nota que lhe foi
  -- dada e a nova data. O "contexto" é interno e não sai.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'motivo', public.ops_obra_rotulo_atraso(a.motivo),
           'nota', NULLIF(btrim(COALESCE(a.nota_cliente, '')), ''),
           'novo_fim', a.novo_fim,
           'fim_anterior', a.fim_anterior,
           'fase', fa.nome,
           'data', COALESCE(a.cliente_avisado_em, a.registado_em))
         ORDER BY COALESCE(a.cliente_avisado_em, a.registado_em) DESC), '[]'::jsonb)
    INTO v_atrasos
    FROM public.ops_obra_tarefa_atraso a
    JOIN public.ops_obra_tarefa t ON t.id = a.tarefa_id
    LEFT JOIN public.ops_obra_fase fa ON fa.id = t.fase_id
   WHERE a.obra_id = _obra AND a.cliente_avisado;

  RETURN jsonb_build_object(
    'empresa', COALESCE(v_empresa, '{}'::jsonb),
    'obra', jsonb_build_object(
      'codigo', v_o.codigo, 'titulo', v_o.titulo, 'morada', v_o.morada, 'estado', v_o.estado,
      'inicio', COALESCE(v_prog.inicio, v_o.data_inicio_prevista),
      'fim', v_prog.fim, 'fim_original', v_prog.fim_original,
      'iniciada_em', v_o.iniciada_em, 'concluida_em', v_o.concluida_em),
    'progresso', jsonb_build_object(
      'percentagem', CASE WHEN v_o.estado = 'concluida' THEN 100
                          WHEN v_prog.min_total > 0 THEN round(100.0 * v_prog.min_feitos / v_prog.min_total)::int
                          ELSE 0 END,
      'tarefas', v_prog.n, 'feitas', v_prog.feitas),
    'fases', v_fases,
    'fase_atual', v_atual,
    'proxima_fase', v_proxima,
    'fotos', v_fotos,
    'atrasos', v_atrasos,
    'supervisor', v_sup,
    'gerado_em', now());
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_acompanhamento_dados(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_obra_acompanhamento_dados(uuid) TO service_role;

-- ── Para o cliente: entrar pelo link ───────────────────────────────────────
-- Sem sessão (anon). Mesma mensagem para "não existe" e "revogado" — não se
-- confirma a ninguém que um token existiu. Conta o acesso.
CREATE OR REPLACE FUNCTION public.rpc_ops_acompanhar(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_p record;
  v_estado text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 OR length(p_token) > 200 THEN
    RAISE EXCEPTION 'Link inválido ou desativado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT p.* INTO v_p FROM public.ops_obra_partilha p
   WHERE p.token_hash = public.ops_obra_token_hash(p_token);
  IF NOT FOUND OR v_p.revogada_em IS NOT NULL THEN
    RAISE EXCEPTION 'Link inválido ou desativado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_p.expira_em <= now() THEN
    RAISE EXCEPTION 'Este link expirou. Peça um novo à equipa da obra.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT estado INTO v_estado FROM public.ops_obra WHERE id = v_p.obra_id;
  IF v_estado IS NULL OR v_estado = 'cancelada' THEN
    RAISE EXCEPTION 'Link inválido ou desativado.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.ops_obra_partilha
     SET acessos = acessos + 1, ultimo_acesso_em = now()
   WHERE id = v_p.id;

  RETURN public.ops_obra_acompanhamento_dados(v_p.obra_id)
         || jsonb_build_object('link_expira_em', v_p.expira_em);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_acompanhar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_ops_acompanhar(text) TO anon, authenticated, service_role;

-- ── Para a equipa ──────────────────────────────────────────────────────────
-- Pré-visualizar "o que o cliente vê": quem vê a obra.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_acompanhamento_previa(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  RETURN public.ops_obra_acompanhamento_dados(p_obra_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_acompanhamento_previa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_acompanhamento_previa(uuid) TO authenticated, service_role;

-- O link ativo (sem o token — esse só se vê ao gerar).
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_partilha_estado(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_p record;
BEGIN
  IF NOT public.ops_pode_ver_obra(p_obra_id) THEN
    RAISE EXCEPTION 'Obra não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT p.criada_em, p.expira_em, p.acessos, p.ultimo_acesso_em, u.name AS criada_por
    INTO v_p
    FROM public.ops_obra_partilha p
    LEFT JOIN public.anew_users u ON u.id = p.criada_por
   WHERE p.obra_id = p_obra_id AND p.revogada_em IS NULL AND p.expira_em > now()
   ORDER BY p.criada_em DESC LIMIT 1;

  RETURN jsonb_build_object(
    'ativa', FOUND,
    'criada_em', v_p.criada_em, 'expira_em', v_p.expira_em,
    'acessos', COALESCE(v_p.acessos, 0), 'ultimo_acesso_em', v_p.ultimo_acesso_em,
    'criada_por', v_p.criada_por,
    'fotos_visiveis', (SELECT count(*) FROM public.ops_obra_tarefa_foto f WHERE f.obra_id = p_obra_id AND f.visivel_cliente),
    'pode_gerir', public.ops_obra_pode_partilhar(p_obra_id));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_partilha_estado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_partilha_estado(uuid) TO authenticated, service_role;

-- Gerar um link novo (revoga o anterior). Devolve o token UMA vez.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_partilha_criar(p_obra_id uuid, p_dias integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o     record;
  v_eu    uuid;
  v_token text;
  v_exp   timestamptz;
BEGIN
  SELECT id, organization_id, estado INTO v_o FROM public.ops_obra WHERE id = p_obra_id;
  IF NOT FOUND OR NOT public.ops_obra_pode_partilhar(p_obra_id) THEN
    RAISE EXCEPTION 'Só o supervisor da obra ou o gestor partilham a obra com o cliente.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_o.estado = 'cancelada' THEN
    RAISE EXCEPTION 'Uma obra cancelada não se partilha.';
  END IF;

  v_eu := public.current_business_user_id();
  v_exp := now() + make_interval(days => LEAST(GREATEST(COALESCE(p_dias, 90), 1), 365));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.ops_obra_partilha
     SET revogada_em = now(), revogada_por = v_eu
   WHERE obra_id = p_obra_id AND revogada_em IS NULL;

  INSERT INTO public.ops_obra_partilha (organization_id, obra_id, token_hash, criada_por, expira_em)
  VALUES (v_o.organization_id, p_obra_id, public.ops_obra_token_hash(v_token), v_eu, v_exp);

  RETURN jsonb_build_object('token', v_token, 'expira_em', v_exp);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_partilha_criar(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_partilha_criar(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_ops_obra_partilha_revogar(p_obra_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n integer;
BEGIN
  IF NOT public.ops_obra_pode_partilhar(p_obra_id) THEN
    RAISE EXCEPTION 'Só o supervisor da obra ou o gestor desativam o link do cliente.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.ops_obra_partilha
     SET revogada_em = now(), revogada_por = public.current_business_user_id()
   WHERE obra_id = p_obra_id AND revogada_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'revogados', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_partilha_revogar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_partilha_revogar(uuid) TO authenticated, service_role;

-- Marcar (ou desmarcar) uma foto como visível ao cliente.
CREATE OR REPLACE FUNCTION public.rpc_ops_obra_foto_cliente(p_foto_id uuid, p_visivel boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_f record;
BEGIN
  SELECT id, obra_id INTO v_f FROM public.ops_obra_tarefa_foto WHERE id = p_foto_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Foto não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public.ops_obra_pode_partilhar(v_f.obra_id) THEN
    RAISE EXCEPTION 'Só o supervisor da obra ou o gestor escolhem as fotos que o cliente vê.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.ops_obra_tarefa_foto
     SET visivel_cliente = COALESCE(p_visivel, false),
         visivel_cliente_por = public.current_business_user_id(),
         visivel_cliente_em = now()
   WHERE id = p_foto_id;
  RETURN jsonb_build_object('ok', true, 'visivel_cliente', COALESCE(p_visivel, false));
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_obra_foto_cliente(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_obra_foto_cliente(uuid, boolean) TO authenticated, service_role;

-- ── Storage: assinar só as fotos marcadas de obras com link ativo ─────────
CREATE OR REPLACE FUNCTION public.ops_obra_foto_partilhada(_caminho text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ops_obra_tarefa_foto f
      JOIN public.ops_obra_partilha p ON p.obra_id = f.obra_id
     WHERE f.caminho = _caminho AND f.visivel_cliente
       AND p.revogada_em IS NULL AND p.expira_em > now())
$$;

REVOKE ALL ON FUNCTION public.ops_obra_foto_partilhada(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ops_obra_foto_partilhada(text) TO anon, authenticated, service_role;

DO $storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Sem esquema storage nesta base — política das fotos do cliente por criar.';
    RETURN;
  END IF;
  EXECUTE $p$
    DROP POLICY IF EXISTS ops_acompanhar_fotos_ler ON storage.objects;
    CREATE POLICY ops_acompanhar_fotos_ler ON storage.objects
      FOR SELECT TO anon, authenticated USING (
        bucket_id = 'operacoes'
        AND public.ops_obra_foto_partilhada(name)
      );
  $p$;
END
$storage$;

COMMIT;
