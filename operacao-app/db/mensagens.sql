-- ============================================================
--  Operações — a conversa dentro da ordem
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, notificacoes.sql.
--
--  ⚠ A TABELA EXISTIA, MAS COM AS POLÍTICAS ERRADAS PARA UMA CONVERSA
--
--  `ops_mensagem` foi criada no primeiro dia e apanhou as políticas genéricas
--  que o `schema.sql` põe em tudo o que pende de uma ordem: uma de leitura e
--  uma `FOR ALL` — que inclui UPDATE e DELETE. Nunca teve ecrã, por isso
--  ninguém deu por isso.
--
--  Para uma tabela de tarefas, `FOR ALL` está certo. Para uma conversa, não:
--  uma mensagem que se pode reescrever depois de lida não serve para
--  esclarecer nada, e a discussão sobre "quem disse o quê" é exatamente o que
--  isto vem resolver. Aqui trocam-se essas políticas por leitura + escrita, e
--  tira-se o privilégio de UPDATE e DELETE à tabela.
--
--  ⚠ SÓ CANAL INTERNO
--
--  A tabela prevê `canal = 'cliente'`, para um portal que não existe e que foi
--  explicitamente deixado de fora. Enquanto não existir, a base recusa esse
--  canal: uma mensagem escrita a pensar que o cliente a lê, e que ninguém lhe
--  mostra, é pior do que não a poder escrever.
--
--  Escreve fora de `ops_*`? Só o aviso no sino, pelo `ops_notificar` que já
--  existe — a mesma exceção de sempre.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regclass('public.ops_mensagem') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. Quem lê e quem escreve
-- ============================================================
-- Pelo alcance da ORDEM, e não por um `organization_id` próprio: a mensagem
-- não existe sozinha, e duplicar a coluna era arranjar maneira de os dois
-- valores divergirem.

ALTER TABLE public.ops_mensagem ENABLE ROW LEVEL SECURITY;

/* As duas genéricas do `schema.sql` saem. A `_write` é `FOR ALL` e deixava
   reescrever e apagar; a `_select` não confere a organização — só confere que
   a ordem existe, e a RLS da própria `ops_ordem` é que fazia o resto. Aqui a
   conta faz-se no sítio. */
DROP POLICY IF EXISTS ops_mensagem_write  ON public.ops_mensagem;
DROP POLICY IF EXISTS ops_mensagem_select ON public.ops_mensagem;

DROP POLICY IF EXISTS ops_mensagem_ler ON public.ops_mensagem;
CREATE POLICY ops_mensagem_ler ON public.ops_mensagem
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ops_ordem o
     WHERE o.id = ops_mensagem.ordem_id
       AND (
         public.is_system_admin_user((SELECT auth.uid()))
         OR o.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
       )
  ));

-- Escrever é para quem executa. Um técnico que está no local é precisamente
-- quem mais tem para dizer.
DROP POLICY IF EXISTS ops_mensagem_escrever ON public.ops_mensagem;
CREATE POLICY ops_mensagem_escrever ON public.ops_mensagem
  FOR INSERT TO authenticated
  WITH CHECK (
    canal = 'interno'
    AND EXISTS (
      SELECT 1 FROM public.ops_ordem o
       WHERE o.id = ops_mensagem.ordem_id
         AND o.organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
    )
  );

/* Não há política de UPDATE nem de DELETE, de propósito — nem sequer o
   privilégio, que o `schema.sql` dá a todas as tabelas `ops_*`. São as duas
   coisas: a política e o GRANT. Se algum dia se voltar a correr o
   `schema.sql`, o GRANT volta — e este ficheiro tem de ser corrido a seguir. */

GRANT SELECT, INSERT ON public.ops_mensagem TO authenticated;
REVOKE UPDATE, DELETE ON public.ops_mensagem FROM authenticated;
REVOKE ALL ON public.ops_mensagem FROM anon;

CREATE INDEX IF NOT EXISTS ops_mensagem_ordem_idx
  ON public.ops_mensagem (ordem_id, criada_em);


-- ============================================================
-- 2. Escrever, e avisar quem tem de saber
-- ============================================================
-- Uma mensagem que ninguém lê não serve para nada. Avisa-se quem está na
-- ordem — o responsável e a equipa — e nunca quem escreveu.

CREATE OR REPLACE FUNCTION public.rpc_ops_escrever_mensagem(
  p_ordem_id uuid,
  p_texto    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user  uuid := public.current_business_user_id();
  v_o     record;
  v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
  v_id    uuid;
  v_nome  text;
  r       record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_texto IS NULL THEN
    RAISE EXCEPTION 'A mensagem está vazia.';
  END IF;

  SELECT id, organization_id, codigo, titulo, responsavel_id
    INTO v_o
    FROM public.ops_ordem
   WHERE id = p_ordem_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Essa ordem não existe.'; END IF;

  IF v_o.organization_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Essa ordem é de outra organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_mensagem (ordem_id, canal, autor_id, texto)
  VALUES (p_ordem_id, 'interno', v_user, v_texto)
  RETURNING id INTO v_id;

  SELECT name INTO v_nome FROM public.anew_users WHERE id = v_user;

  -- O responsável e a equipa, sem repetições e sem quem escreveu.
  IF to_regprocedure('public.ops_notificar(uuid,uuid,text,text,text,text,uuid,text)')
     IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT p AS quem
        FROM (
          SELECT v_o.responsavel_id AS p
          UNION
          SELECT op.utilizador_id FROM public.ops_ordem_pessoa op
           WHERE op.ordem_id = p_ordem_id
        ) t(p)
       WHERE p IS NOT NULL AND p <> v_user
    LOOP
      PERFORM public.ops_notificar(
        v_o.organization_id, r.quem, 'operacoes_mensagem',
        v_o.codigo || ': mensagem nova',
        COALESCE(v_nome, 'Alguém') || ' — ' || left(v_texto, 120),
        '/operacao/ordens/' || v_o.codigo,
        p_ordem_id, 'medium'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_escrever_mensagem(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_escrever_mensagem(uuid, text) TO authenticated;


-- ============================================================
-- 3. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v_n integer;
BEGIN
  IF to_regprocedure('public.rpc_ops_escrever_mensagem(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'A RPC das mensagens não ficou criada.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'ops_mensagem';
  IF v_n < 2 THEN
    RAISE EXCEPTION 'As políticas das mensagens não ficaram criadas (encontradas %).', v_n;
  END IF;

  -- 'ALL' conta: é uma política de UPDATE e de DELETE com outro nome.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'ops_mensagem'
       AND cmd IN ('ALL', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'Uma conversa não se reescreve: não pode haver política de UPDATE, DELETE ou ALL.';
  END IF;

  IF has_table_privilege('authenticated', 'public.ops_mensagem', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.ops_mensagem', 'DELETE') THEN
    RAISE EXCEPTION 'Uma conversa não se reescreve: o privilégio de UPDATE/DELETE não saiu.';
  END IF;

  RAISE NOTICE 'Operações: a conversa dentro da ordem está aberta.';
END
$verificar$;

COMMIT;
