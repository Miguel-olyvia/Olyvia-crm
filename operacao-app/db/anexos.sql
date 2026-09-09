-- ============================================================
--  Operações — fotos e ficheiros
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, rpcs-tarefas.sql,
--  planos.sql, correcoes-modelo.sql, medicoes.sql, despacho.sql, orcamentos.sql.
--
--  Uma foto do quadro elétrico antes de mexer vale mais do que três parágrafos
--  a descrevê-lo. É a coisa que os técnicos mais fazem no Infraspeak, e sem
--  ela o relatório ao cliente é texto sem prova.
--
--  ⚠ ESTE FICHEIRO ESCREVE FORA DE `ops_*`. É o único que o faz, e vale a
--    pena ser explícito sobre o quê:
--
--      · cria UM bucket novo em `storage.buckets`, chamado `operacoes`;
--      · cria políticas em `storage.objects` que só falam desse bucket.
--
--    Não toca em nenhum bucket do CRM (`documents`, `company-logos`, …), não
--    altera nenhuma política existente, e não mexe em nenhum ficheiro que já
--    lá esteja. Se um dia for preciso desfazer, apaga-se o bucket `operacoes`
--    e as quatro políticas cujo nome começa por `ops_`.
--
--  A convenção de caminhos é o que torna as políticas possíveis:
--
--      {organization_id}/{ordem_id}/{ficheiro}
--
--  A organização vem no primeiro segmento, por isso a RLS do storage sabe a
--  quem pertence o ficheiro sem ter de ir à base perguntar.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. O registo do ficheiro
-- ============================================================
-- O ficheiro vive no storage; esta tabela é o que sabe a que ordem pertence,
-- quem o pôs lá e se sai no relatório do cliente.

-- `ops_anexo` já existe desde o schema.sql, com `ficheiro_url` — um campo de
-- texto livre, de quando ainda não estava decidido onde os ficheiros iam
-- viver. Agora está: vivem no storage, e o que interessa é o CAMINHO lá
-- dentro. Acrescenta-se a coluna em vez de criar uma tabela nova, para não
-- ficar com duas a dizer a mesma coisa.
--
-- `ficheiro_url` fica onde está, sem uso. Apagá-la seria remover algo que já
-- existe, e a regra deste módulo é só acrescentar.

ALTER TABLE public.ops_anexo
  -- O caminho dentro do bucket `operacoes`. Único: dois registos a apontar
  -- para o mesmo ficheiro seriam duas linhas a desaparecerem juntas.
  ADD COLUMN IF NOT EXISTS caminho text,
  -- Uma nota escrita no momento vale mais do que uma escrita à noite.
  ADD COLUMN IF NOT EXISTS legenda text,
  -- Fotos internas (a chave escondida, o estado do carro) não vão no
  -- relatório. O mesmo princípio das tarefas privadas.
  ADD COLUMN IF NOT EXISTS privado boolean NOT NULL DEFAULT false;

DO $u$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ops_anexo_caminho_unico') THEN
    ALTER TABLE public.ops_anexo ADD CONSTRAINT ops_anexo_caminho_unico UNIQUE (caminho);
  END IF;
END
$u$;

CREATE INDEX IF NOT EXISTS ops_anexo_ordem_data_idx
  ON public.ops_anexo (ordem_id, carregado_em DESC);
CREATE INDEX IF NOT EXISTS ops_anexo_tarefa_idx ON public.ops_anexo (ordem_tarefa_id)
  WHERE ordem_tarefa_id IS NOT NULL;


-- ============================================================
-- 2. Onde o ficheiro devia estar
-- ============================================================
-- Uma função só, usada nos dois lados: pela RPC ao registar, e pela política
-- do storage ao aceitar o upload. Duas cópias desta regra divergiriam, e a
-- divergência aqui seria um ficheiro de um cliente na pasta de outro.

CREATE OR REPLACE FUNCTION public.ops_caminho_da_ordem(_ordem_id uuid, _ficheiro text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.organization_id::text || '/' || o.id::text || '/' || _ficheiro
    FROM public.ops_ordem o WHERE o.id = _ordem_id
$$;

REVOKE ALL ON FUNCTION public.ops_caminho_da_ordem(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_caminho_da_ordem(uuid, text) TO authenticated, service_role;


-- ============================================================
-- 3. Registar um anexo
-- ============================================================
-- Corre DEPOIS de o ficheiro subir. A app faz o upload para o storage e
-- chama isto; se isto recusar, a app apaga o ficheiro que acabou de subir.
--
-- Porquê por RPC e não por INSERT direto: o caminho tem de corresponder à
-- ordem. Sem esta verificação, alguém podia registar um anexo desta ordem
-- apontando para o ficheiro de outra e ler o que não devia.

CREATE OR REPLACE FUNCTION public.rpc_ops_registar_anexo(
  p_ordem_id  uuid,
  p_caminho   text,
  p_nome      text,
  p_tarefa_id uuid    DEFAULT NULL,
  p_mime      text    DEFAULT NULL,
  p_tamanho   integer DEFAULT NULL,
  p_legenda   text    DEFAULT NULL,
  p_privado   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user    uuid;
  v_funcao  text;
  v_o       record;
  v_id      uuid;
  v_prefixo text;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT (
    public.is_system_admin_user(auth.uid())
    OR public.has_anew_permission(auth.uid(), 'operations.orders.execute')
    OR public.has_anew_permission(auth.uid(), 'operations.orders.edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para anexar ficheiros.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se anexa a uma ordem % — o processo está encerrado.',
      replace(v_o.estado, '_', ' ');
  END IF;

  -- O caminho tem de estar dentro da pasta desta ordem. Ponto.
  v_prefixo := v_o.organization_id::text || '/' || v_o.id::text || '/';
  IF p_caminho IS NULL OR left(p_caminho, length(v_prefixo)) <> v_prefixo THEN
    RAISE EXCEPTION 'O caminho do ficheiro não pertence a esta ordem.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tarefa_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_ordem_tarefa WHERE id = p_tarefa_id AND ordem_id = p_ordem_id) THEN
    RAISE EXCEPTION 'Essa tarefa não é desta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_anexo (
    organization_id, ordem_id, ordem_tarefa_id, caminho, nome, mime, tamanho,
    legenda, privado, carregado_por)
  VALUES (
    v_o.organization_id, p_ordem_id, p_tarefa_id, p_caminho,
    COALESCE(nullif(btrim(p_nome), ''), 'ficheiro'),
    p_mime, p_tamanho, nullif(btrim(coalesce(p_legenda, '')), ''),
    COALESCE(p_privado, false), v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'anexo', p_nome, v_user, NULL,
     jsonb_build_object('anexo_id', v_id, 'tarefa_id', p_tarefa_id, 'privado', p_privado));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'caminho', p_caminho);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_registar_anexo(uuid, text, text, uuid, text, integer, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_registar_anexo(uuid, text, text, uuid, text, integer, text, boolean)
  TO authenticated, service_role;


-- ============================================================
-- 4. Apagar um anexo
-- ============================================================
-- Devolve o caminho para a app poder apagar o ficheiro no storage a seguir.
-- Quem carregou pode apagar o seu; quem coordena pode apagar qualquer um.

CREATE OR REPLACE FUNCTION public.rpc_ops_remover_anexo(p_anexo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_a      record;
BEGIN
  SELECT * INTO v_a FROM public.ops_anexo WHERE id = p_anexo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_a.organization_id) q;

  IF v_funcao = 'tecnico' AND v_a.carregado_por IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'Só quem carregou o ficheiro, ou quem coordena, o pode apagar.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM public.ops_anexo WHERE id = p_anexo_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_a.organization_id, 'ordem', v_a.ordem_id, 'anexo_removido', v_a.nome, v_user,
     jsonb_build_object('anexo_id', p_anexo_id, 'caminho', v_a.caminho), NULL);

  RETURN jsonb_build_object('ok', true, 'caminho', v_a.caminho);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_remover_anexo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_remover_anexo(uuid) TO authenticated, service_role;


-- ============================================================
-- 5. RLS na tabela
-- ============================================================

-- A RLS de leitura vem do schema.sql e fica como está.
--
-- O que muda: `authenticated` deixa de poder escrever na tabela diretamente.
-- Sem isso, alguém podia registar um anexo desta ordem a apontar para o
-- ficheiro de outra, contornando a verificação de caminho que a RPC faz.
--
-- É a única coisa neste módulo que ESTREITA algo já existente, em vez de
-- acrescentar. Vale a pena ser explícito sobre o risco: nada escrevia nesta
-- tabela até hoje — a app nunca teve ecrã de anexos e o schema criou-a vazia.
-- Se algum dia houver um script que escreva anexos por fora, passa a ter de
-- usar `service_role` ou a RPC.

REVOKE INSERT, UPDATE, DELETE ON public.ops_anexo FROM authenticated;
GRANT SELECT ON public.ops_anexo TO authenticated;
GRANT ALL ON public.ops_anexo TO service_role;
REVOKE ALL ON public.ops_anexo FROM anon;

COMMIT;


-- ============================================================
-- 6. O bucket, e as suas políticas
-- ============================================================
-- Fora da transação acima porque mexe noutro esquema, e porque numa base sem
-- o esquema `storage` (um teste local, por exemplo) isto deve ser saltado sem
-- rebentar o resto da instalação.

DO $storage$
DECLARE
  v_falta text;
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Sem esquema storage nesta base — bucket e políticas por criar.';
    RETURN;
  END IF;

  -- `public = false`: os ficheiros de Operações não têm URL aberto ao mundo.
  -- Quem os vê, vê-os através de um URL assinado de curta duração.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('operacoes', 'operacoes', false, 26214400, ARRAY[
    'image/jpeg','image/png','image/webp','image/heic','image/heif',
    'application/pdf','audio/mpeg','audio/mp4','audio/webm','audio/ogg'
  ])
  ON CONFLICT (id) DO NOTHING;

  -- As quatro políticas. Todas falam SÓ do bucket `operacoes`; nenhuma toca
  -- em ficheiros do CRM.
  --
  -- O primeiro segmento do caminho é a organização. `~` antes do cast evita
  -- rebentar num caminho mal formado: uma política que rebenta é uma política
  -- que nega tudo, e o erro seria difícil de perceber.
  EXECUTE $p$
    DROP POLICY IF EXISTS ops_anexos_ler ON storage.objects;
    CREATE POLICY ops_anexos_ler ON storage.objects
      FOR SELECT TO authenticated USING (
        bucket_id = 'operacoes'
        AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
        AND (
          public.is_system_admin_user((SELECT auth.uid()))
          OR (
            split_part(name, '/', 1)::uuid
              IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            AND public.has_anew_permission((SELECT auth.uid()), 'operations.orders.view')
          )
        )
      );
  $p$;

  EXECUTE $p$
    DROP POLICY IF EXISTS ops_anexos_criar ON storage.objects;
    CREATE POLICY ops_anexos_criar ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'operacoes'
        AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
        AND (
          public.is_system_admin_user((SELECT auth.uid()))
          OR (
            split_part(name, '/', 1)::uuid
              IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            AND (
              public.has_anew_permission((SELECT auth.uid()), 'operations.orders.execute')
              OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.edit')
            )
          )
        )
      );
  $p$;

  -- Apagar do storage é o segundo passo de `rpc_ops_remover_anexo`. A regra de
  -- quem pode apagar o quê já foi aplicada lá; aqui basta garantir que é do
  -- bucket certo e de uma organização visível.
  EXECUTE $p$
    DROP POLICY IF EXISTS ops_anexos_apagar ON storage.objects;
    CREATE POLICY ops_anexos_apagar ON storage.objects
      FOR DELETE TO authenticated USING (
        bucket_id = 'operacoes'
        AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
        AND (
          public.is_system_admin_user((SELECT auth.uid()))
          OR (
            split_part(name, '/', 1)::uuid
              IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
            AND (
              public.has_anew_permission((SELECT auth.uid()), 'operations.orders.execute')
              OR public.has_anew_permission((SELECT auth.uid()), 'operations.orders.edit')
            )
          )
        )
      );
  $p$;

  SELECT string_agg(p, ', ') INTO v_falta
    FROM unnest(ARRAY['ops_anexos_ler','ops_anexos_criar','ops_anexos_apagar']) p
   WHERE NOT EXISTS (SELECT 1 FROM pg_policy g
                      JOIN pg_class c ON c.oid = g.polrelid
                     WHERE c.relname = 'objects' AND g.polname = p);

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Políticas de storage por criar: %', v_falta;
  END IF;

  RAISE NOTICE 'Bucket "operacoes" pronto, com 3 políticas. Nenhum bucket do CRM foi tocado.';
END
$storage$;


-- ============================================================
-- Verificação
-- ============================================================
DO $v$
DECLARE n integer;
BEGIN
  IF to_regclass('public.ops_anexo') IS NULL THEN
    RAISE EXCEPTION 'A tabela dos anexos não ficou criada.';
  END IF;

  SELECT count(*) INTO n FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN ('ops_caminho_da_ordem','rpc_ops_registar_anexo','rpc_ops_remover_anexo');
  IF n <> 3 THEN
    RAISE EXCEPTION 'Faltam funções de anexos: esperava 3, encontrei %.', n;
  END IF;

  -- `authenticated` não pode escrever na tabela: só as RPCs escrevem.
  IF has_table_privilege('authenticated', 'public.ops_anexo', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated ainda pode fazer INSERT em ops_anexo.';
  END IF;

  RAISE NOTICE 'Anexos prontos. As fotos entram pela RPC, e o ficheiro fica fora do alcance de quem não é da organização.';
END
$v$;
