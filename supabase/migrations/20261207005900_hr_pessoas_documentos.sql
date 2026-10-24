-- ==============================================================================
-- pessoas_documentos -- contratos, adendas e declaracoes de cada pessoa.
-- Metadados legiveis por SELECT directo; o CORPO fecha-se por GRANT de
-- coluna e so sai por RPC auditada. Toda escrita (emitir, assinar) tambem so
-- por RPC SECURITY DEFINER -- a tabela nao da INSERT nem UPDATE directo a
-- authenticated, nem a quem tem hr.pessoas.documentos.edit.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Um contrato de trabalho ou uma adenda tem de existir como registo -- quem
-- assinou o que, quando, e com que conteudo -- e o conteudo pode conter
-- retribuicao ou outros dados sensiveis. Nao ha ainda upload de ficheiro real
-- nesta ronda (a promocao da quarentena nao existe): o documento e HTML
-- gerado de modelo. ficheiro_caminho nasce e fica sempre NULL.
--
--
-- -- PORQUE NAO HA INSERT/UPDATE DIRECTO, nem para hr.pessoas.documentos.edit --
--
-- As unicas escritas desta ronda sao "emitir" (criar a partir de um modelo) e
-- "assinar" (o proprio, uma vez). As duas tem regras que uma politica de
-- UPDATE/INSERT generica nao consegue expressar em conjunto com a auditoria
-- obrigatoria (toda leitura e toda alteracao de conteudo sensivel tem de
-- gravar em pessoas_acessos_sensiveis ANTES de responder) e com a imutabilidade
-- depois de assinado. Por isso INSERT, UPDATE e DELETE ficam bloqueados por
-- politica RESTRICTIVE a authenticated, e as tres RPCs SECURITY DEFINER
-- (dono da tabela) sao o UNICO caminho de escrita. hr.pessoas.documentos.edit
-- fica no catalogo para a decisao de produto de uma ronda futura (editar
-- metadados de um rascunho antes de emitido) -- nao e usada por politica
-- nenhuma aqui, e isso fica registado, nao escondido.
--
--
-- -- METADADOS vs CONTEUDO -------------------------------------------------------
--
-- Ao contrario do motivo de ausencia (so alguns tipos sao sensiveis), aqui o
-- conteudo de QUALQUER documento e sensivel -- e o caso do NISS, nao o do
-- motivo clinico. REVOKE ALL + GRANT SELECT de uma lista explicita de
-- metadados fecha corpo_html e ficheiro_caminho a authenticated por completo;
-- as RPCs, por serem SECURITY DEFINER e correrem como o dono da tabela, leem-
-- nas sem depender do grant de coluna.
--
--
-- -- IMUTABILIDADE APOS ASSINADO ------------------------------------------------
--
-- Alem da politica de UPDATE bloqueada, um trigger BEFORE UPDATE
-- (hr_documentos_assinado_imutavel) rejeita qualquer alteracao a uma linha
-- com estado='assinado', excepto deleted_at/deleted_by/updated_at/updated_by
-- (soft delete continua possivel). Isto vale mesmo para SECURITY DEFINER e
-- para service_role: uma linha assinada e um facto historico, nao se reescreve
-- nem pela RPC de assinar (que so aceita a_aguardar_assinatura -> assinado).
--
--
-- -- A CADEIA "A MINHA PROPRIA FICHA" --------------------------------------------
--
-- hr_pessoa_do_utilizador(auth.uid(), organization_id), de 20261120090000,
-- resolve o pessoa_id ligado a conta NAQUELA organizacao a partir de
-- pessoas_contas (ligacao curada) -- nao de nada que o cliente envie. E assim
-- que hr.pessoas.documentos.view.own so mostra os documentos da propria
-- pessoa: a condicao esta na LINHA, nao ha forma de pedir o documento de
-- outra pessoa trocando um id no pedido.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Upload de ficheiro real: ficheiro_caminho nasce e fica sempre NULL.
-- - Assinatura externa por link/e-mail (candidato sem conta).
-- - rpc_hr_documento_anular: a permissao hr.pessoas.documentos.anular existe
--   no catalogo (20261123010000) mas nao ha RPC nesta ronda que a use -- e
--   uma porta fechada de proposito, nao uma omissao. Documentos assinados sao
--   imutaveis por trigger (ver acima), por isso anular so faria sentido para
--   rascunhos/a_aguardar_assinatura, e essa RPC fica para quando existir UI
--   para ela.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_documento_assinar(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_hr_documento_ver_conteudo(uuid);
--   DROP FUNCTION IF EXISTS public.rpc_hr_documento_emitir(uuid, uuid[]);
--   DROP TABLE IF EXISTS public.pessoas_documentos;
--   DROP FUNCTION IF EXISTS public.hr_documentos_assinado_imutavel();
-- Isto apaga contratos e adendas emitidos. Exportar antes.
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120040000  hr_satelite_ancora_imutavel(), pessoas_acessos_sensiveis,
--                   hr_registar_acesso_sensivel()
--   20261120060000  pessoas_vinculos (e a unique id_pessoa_org_key)
--   20261120090000  hr_pessoa_do_utilizador
--   20261123010000  catalogo hr.pessoas.documentos.*
--   20261123015000  pessoas_acessos_sensiveis aceita campo='documento'
--   20261123020000  pessoas_documentos_modelos
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.pessoas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_id_org_key' AND conrelid = 'public.pessoas'::regclass
  ) THEN
    RAISE EXCEPTION 'A unique pessoas_id_org_key nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pessoas_vinculos_id_pessoa_org_key' AND conrelid = 'public.pessoas_vinculos'::regclass
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos_id_pessoa_org_key nao existe. Aplicar 20261120060000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_documentos_modelos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_documentos_modelos nao existe. Aplicar 20261123020000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'public.hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.pessoas_acessos_sensiveis'::regclass
       AND c.conname = 'pessoas_acessos_sensiveis_campo_valido'
       AND pg_get_constraintdef(c.oid) LIKE '%documento%'
  ) THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis nao aceita campo=documento ainda. Aplicar 20261123015000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.documentos.view') THEN
    RAISE EXCEPTION 'Catalogo hr.pessoas.documentos.* nao aplicado. Aplicar 20261123010000 primeiro.';
  END IF;

  -- As 8 permissoes tem de existir TODAS: uma politica com codigo ausente
  -- devolve false para todos, em silencio, e ninguem repara.
  IF (SELECT count(*) FROM public.anew_permissions WHERE code LIKE 'hr.pessoas.documentos%') <> 8 THEN
    RAISE EXCEPTION 'Esperavam-se 8 codigos hr.pessoas.documentos.* no catalogo, encontraram-se menos. Aplicar 20261123010000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- pessoas_documentos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_documentos (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id               uuid NOT NULL,
  organization_id         uuid NOT NULL,
  vinculo_id              uuid,
  modelo_id               uuid,

  tipo                    text NOT NULL,
  titulo                  text NOT NULL,
  corpo_html              text NOT NULL,
  ficheiro_caminho        text,

  estado                  text NOT NULL DEFAULT 'rascunho',
  emitido_em              timestamptz,
  emitido_por             uuid,
  assinado_em             timestamptz,
  assinado_por_auth_uid   uuid,
  assinatura_ip           inet,
  assinatura_user_agent   text,
  anulado_em              timestamptz,
  anulado_por             uuid,
  anulado_motivo          text,

  deleted_at              timestamptz,
  deleted_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid,
  updated_by              uuid,

  CONSTRAINT pessoas_documentos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_documentos_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,
  -- FK COMPOSTA, mesmo motivo de pessoas_retribuicoes_vinculo_fkey: uma FK
  -- simples so contra pessoas_vinculos(id) nao impediria este documento
  -- apontar para o vinculo de OUTRA pessoa da mesma organizacao.
  CONSTRAINT pessoas_documentos_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),
  CONSTRAINT pessoas_documentos_modelo_fkey
    FOREIGN KEY (modelo_id) REFERENCES public.pessoas_documentos_modelos (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_emitido_por_fkey
    FOREIGN KEY (emitido_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_anulado_por_fkey
    FOREIGN KEY (anulado_por) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_documentos_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_documentos_tipo_valido CHECK (
    tipo IN ('contrato','adenda','declaracao','recibo','outro')
  ),
  CONSTRAINT pessoas_documentos_estado_valido CHECK (
    estado IN ('rascunho','a_aguardar_assinatura','assinado','anulado')
  ),
  CONSTRAINT pessoas_documentos_assinado_consistente
    CHECK (assinado_em IS NULL OR estado = 'assinado'),
  CONSTRAINT pessoas_documentos_anulado_consistente
    CHECK (anulado_em IS NULL OR estado = 'anulado')
);

COMMENT ON TABLE public.pessoas_documentos IS
'Documentos de RH (contratos, adendas, declaracoes) por pessoa. corpo_html e sensivel em TODAS as linhas (pode conter retribuicao) e fica fechado por GRANT de coluna -- so sai por rpc_hr_documento_ver_conteudo, que audita antes de devolver. INSERT/UPDATE/DELETE directos estao bloqueados a authenticated: a unica escrita e pelas RPCs rpc_hr_documento_emitir e rpc_hr_documento_assinar (SECURITY DEFINER). Uma linha assinada e imutavel por trigger, nao so por politica.';
COMMENT ON COLUMN public.pessoas_documentos.ficheiro_caminho IS
'Sempre NULL nesta ronda: nao ha Edge Function de promocao da quarentena, por isso nao se anexa ficheiro real a um documento de RH. O documento e o corpo_html gerado do modelo. Lacuna assumida, nao ausencia por descuido.';
COMMENT ON COLUMN public.pessoas_documentos.corpo_html IS
'Conteudo do documento, copiado do modelo no momento da emissao (nao referenciado por FK -- alterar o modelo depois nao muda documentos ja emitidos). Fechado por GRANT de coluna: authenticated nao tem SELECT sobre esta coluna. So sai por rpc_hr_documento_ver_conteudo, que audita a leitura.';
COMMENT ON COLUMN public.pessoas_documentos.assinatura_ip IS
'Capturado pela RPC rpc_hr_documento_assinar a partir do cabecalho do pedido (current_setting(''request.headers'', true)), nunca enviado como parametro pelo cliente -- um parametro seria trivialmente falsificavel.';

CREATE INDEX IF NOT EXISTS idx_pessoas_documentos_pessoa_id
  ON public.pessoas_documentos (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_documentos_organization_id
  ON public.pessoas_documentos (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_documentos_pessoa_estado
  ON public.pessoas_documentos (pessoa_id, estado);
CREATE INDEX IF NOT EXISTS idx_pessoas_documentos_vinculo_id
  ON public.pessoas_documentos (vinculo_id) WHERE vinculo_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_pessoas_documentos_updated_at ON public.pessoas_documentos;
CREATE TRIGGER trg_pessoas_documentos_updated_at
  BEFORE UPDATE ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_documentos_ancora ON public.pessoas_documentos;
CREATE TRIGGER trg_pessoas_documentos_ancora
  BEFORE UPDATE ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Imutabilidade apos assinado, mesmo para SECURITY DEFINER --------------
CREATE OR REPLACE FUNCTION public.hr_documentos_assinado_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.estado = 'assinado' THEN
    -- Soft delete continua possivel mesmo assinado: marcar como apagado nao
    -- reescreve o facto historico, so o esconde da listagem normal.
    --
    -- A comparacao e por to_jsonb MENOS as colunas de apagar, e NAO por uma
    -- lista de colunas escrita a mao. A lista deixava de fora quem assinou, o
    -- IP, o agente, o vinculo, o modelo e a anulacao: um UPDATE que mexesse no
    -- deleted_at E ao mesmo tempo reescrevesse quem assinou passava o trigger,
    -- e a prova de assinatura ficava falsificavel. Uma lista a mao tambem nao
    -- cobre colunas futuras; esta forma cobre.
    IF (to_jsonb(NEW) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'updated_by')
       = (to_jsonb(OLD) - 'deleted_at' - 'deleted_by' - 'updated_at' - 'updated_by') THEN
      RETURN NEW;
    END IF;
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'Documento % ja esta assinado: e imutavel. Nenhuma alteracao e permitida, incluindo por service_role -- so soft delete (deleted_at/deleted_by).', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_documentos_assinado_imutavel() IS
'Rejeita qualquer UPDATE a uma linha assinada, excepto soft delete (deleted_at/deleted_by). Vale para authenticated, para service_role e para qualquer RPC SECURITY DEFINER -- um documento assinado e um facto historico, nao se reescreve.';

DROP TRIGGER IF EXISTS trg_pessoas_documentos_assinado_imutavel ON public.pessoas_documentos;
CREATE TRIGGER trg_pessoas_documentos_assinado_imutavel
  BEFORE UPDATE ON public.pessoas_documentos
  FOR EACH ROW EXECUTE FUNCTION public.hr_documentos_assinado_imutavel();

-- ---- Grants: metadados por SELECT, conteudo fechado, escrita so por RPC ----
REVOKE ALL ON TABLE public.pessoas_documentos FROM anon;
REVOKE ALL ON TABLE public.pessoas_documentos FROM authenticated;

GRANT SELECT (
  id, pessoa_id, organization_id, vinculo_id, modelo_id,
  tipo, titulo, ficheiro_caminho,
  estado, emitido_em, emitido_por,
  assinado_em, assinado_por_auth_uid,
  anulado_em, anulado_por, anulado_motivo,
  deleted_at, deleted_by, created_at, updated_at, created_by, updated_by
) ON TABLE public.pessoas_documentos TO authenticated;

GRANT ALL ON TABLE public.pessoas_documentos TO service_role;

ALTER TABLE public.pessoas_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pessoas_documentos_select ON public.pessoas_documentos;
CREATE POLICY pessoas_documentos_select ON public.pessoas_documentos
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.view', organization_id))
      OR (
        (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.documentos.view.own', organization_id))
        AND pessoa_id = public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id)
      )
    )
  );

COMMENT ON POLICY pessoas_documentos_select ON public.pessoas_documentos IS
'Ve quem tem hr.pessoas.documentos.view NAQUELA organizacao, OU quem tem hr.pessoas.documentos.view.own E e a propria pessoa (hr_pessoa_do_utilizador resolvido por pessoas_contas, nunca por um id que o cliente envie). So mostra metadados -- corpo_html nao esta no grant de coluna, este SELECT nunca o devolve.';

DROP POLICY IF EXISTS pessoas_documentos_block_insert ON public.pessoas_documentos;
CREATE POLICY pessoas_documentos_block_insert ON public.pessoas_documentos
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_documentos_block_update ON public.pessoas_documentos;
CREATE POLICY pessoas_documentos_block_update ON public.pessoas_documentos
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS pessoas_documentos_block_delete ON public.pessoas_documentos;
CREATE POLICY pessoas_documentos_block_delete ON public.pessoas_documentos
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_documentos_block_insert ON public.pessoas_documentos IS
'INSERT bloqueado por completo a authenticated, mesmo com hr.pessoas.documentos.edit: a unica forma de criar um documento e rpc_hr_documento_emitir, que copia o corpo do modelo e audita. Um INSERT directo poderia gravar um corpo_html arbitrario sem passar pelo modelo nem pela auditoria.';
COMMENT ON POLICY pessoas_documentos_block_update ON public.pessoas_documentos IS
'UPDATE bloqueado por completo a authenticated. Assinar nao e um UPDATE do cliente: e rpc_hr_documento_assinar, que confirma identidade, estado e audita. As RPCs correm SECURITY DEFINER como o dono da tabela e por isso nao passam por esta politica.';

-- ==============================================================================
-- RPC 1: emitir -- uma ou varias pessoas, a partir de um modelo
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_emitir(
  p_modelo_id uuid,
  p_pessoa_ids uuid[]
)
RETURNS SETOF uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_modelo      public.pessoas_documentos_modelos%ROWTYPE;
  v_auth        uuid := auth.uid();
  v_emitido_por uuid;
  v_pessoa_id   uuid;
  v_pessoa_org  uuid;
  v_novo_id     uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_emitir exige um utilizador autenticado.';
  END IF;

  IF p_pessoa_ids IS NULL OR array_length(p_pessoa_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_pessoa_ids nao pode ser vazio.';
  END IF;

  SELECT * INTO v_modelo
    FROM public.pessoas_documentos_modelos
   WHERE id = p_modelo_id AND deleted_at IS NULL;

  IF v_modelo.id IS NULL THEN
    RAISE EXCEPTION 'Modelo % nao encontrado ou apagado.', p_modelo_id;
  END IF;

  IF NOT v_modelo.activo THEN
    RAISE EXCEPTION 'Modelo % esta desactivado.', p_modelo_id;
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.emitir', v_modelo.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao hr.pessoas.documentos.emitir na organizacao do modelo.';
  END IF;

  SELECT au.id INTO v_emitido_por FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;

  FOREACH v_pessoa_id IN ARRAY p_pessoa_ids
  LOOP
    SELECT p.organization_id INTO v_pessoa_org
      FROM public.pessoas p
     WHERE p.id = v_pessoa_id;

    IF v_pessoa_org IS NULL THEN
      RAISE EXCEPTION 'Pessoa % nao encontrada.', v_pessoa_id;
    END IF;

    IF v_pessoa_org <> v_modelo.organization_id THEN
      RAISE EXCEPTION 'Pessoa % nao pertence a organizacao do modelo (%).', v_pessoa_id, v_modelo.organization_id;
    END IF;

    INSERT INTO public.pessoas_documentos (
      pessoa_id, organization_id, modelo_id,
      tipo, titulo, corpo_html,
      estado, emitido_em, emitido_por,
      created_by, updated_by
    ) VALUES (
      v_pessoa_id, v_modelo.organization_id, v_modelo.id,
      v_modelo.tipo, v_modelo.nome, v_modelo.corpo_html,
      'a_aguardar_assinatura', now(), v_emitido_por,
      v_emitido_por, v_emitido_por
    )
    RETURNING id INTO v_novo_id;

    RETURN NEXT v_novo_id;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_emitir(uuid, uuid[]) IS
'Emite um documento a uma ou varias pessoas a partir de um modelo. Exige hr.pessoas.documentos.emitir na organizacao do modelo. Copia corpo_html do modelo (nao referencia -- alterar o modelo depois nao muda o documento emitido). Rejeita pessoas de outra organizacao. SECURITY DEFINER: escreve em pessoas_documentos apesar de INSERT estar bloqueado a authenticated por politica.';

-- ==============================================================================
-- RPC 2: ver conteudo -- audita ANTES de devolver
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_ver_conteudo(
  p_documento_id uuid
)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_doc       public.pessoas_documentos%ROWTYPE;
  v_e_proprio boolean := false;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_ver_conteudo exige um utilizador autenticado.';
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  END IF;

  IF public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.conteudo.view', v_doc.organization_id) THEN
    NULL;
  ELSIF public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.view.own', v_doc.organization_id)
    AND v_doc.pessoa_id = public.hr_pessoa_do_utilizador(v_auth, v_doc.organization_id) THEN
    v_e_proprio := true;
  ELSE
    RAISE EXCEPTION 'Sem permissao para ver o conteudo deste documento.';
  END IF;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'revelar');

  RETURN v_doc.corpo_html;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_ver_conteudo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_ver_conteudo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_ver_conteudo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_ver_conteudo(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_ver_conteudo(uuid) IS
'Devolve corpo_html de um documento a quem tem hr.pessoas.documentos.conteudo.view NAQUELA organizacao, ou a propria pessoa (hr.pessoas.documentos.view.own + hr_pessoa_do_utilizador). Regista SEMPRE em pessoas_acessos_sensiveis (campo=documento, accao=revelar) ANTES de devolver -- inclui a leitura pela propria pessoa, para que o registo de auditoria seja completo.';

-- ==============================================================================
-- RPC 3: assinar -- so a propria pessoa, uma vez
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_documento_assinar(
  p_documento_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth       uuid := auth.uid();
  v_doc        public.pessoas_documentos%ROWTYPE;
  v_pessoa_do_utilizador uuid;
  v_headers    json;
  v_ip         inet;
  v_user_agent text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_documento_assinar exige um utilizador autenticado.';
  END IF;

  SELECT * INTO v_doc
    FROM public.pessoas_documentos
   WHERE id = p_documento_id AND deleted_at IS NULL
   FOR UPDATE;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Documento % nao encontrado ou apagado.', p_documento_id;
  END IF;

  -- A ficha de quem esta a assinar, NA ORGANIZACAO DO DOCUMENTO.
  --
  -- O teste tem de ser IS DISTINCT FROM e nao <>, e a razao nao e de estilo:
  -- hr_pessoa_do_utilizador devolve NULL quando a conta nao tem ficha ligada
  -- naquela organizacao, e `algo <> NULL` e NULL, nao TRUE. Com `<>`, o IF nao
  -- disparava e a funcao seguia para o UPDATE -- ou seja, QUALQUER utilizador
  -- autenticado sem ficha naquela organizacao assinava o contrato de qualquer
  -- trabalhador, e a linha ficava imutavel para sempre pelo trigger. Esta
  -- funcao e SECURITY DEFINER e recebe um id arbitrario: aqui nao ha rede.
  v_pessoa_do_utilizador := public.hr_pessoa_do_utilizador(v_auth, v_doc.organization_id);

  IF v_pessoa_do_utilizador IS NULL THEN
    RAISE EXCEPTION 'Nao ha ficha ligada a esta conta nesta organizacao; nao ha nada para assinar.';
  END IF;

  IF v_doc.pessoa_id IS DISTINCT FROM v_pessoa_do_utilizador THEN
    RAISE EXCEPTION 'So a propria pessoa pode assinar este documento.';
  END IF;

  -- E a permissao, tambem na organizacao do documento: ser a propria pessoa
  -- nao chega se o papel dela nao inclui ver os proprios documentos.
  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.documentos.view.own', v_doc.organization_id) THEN
    RAISE EXCEPTION 'Sem permissao para assinar documentos proprios.';
  END IF;

  IF v_doc.estado <> 'a_aguardar_assinatura' THEN
    RAISE EXCEPTION 'Documento % nao esta a aguardar assinatura (estado actual: %).', p_documento_id, v_doc.estado;
  END IF;

  BEGIN
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  BEGIN
    v_ip := nullif(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  v_user_agent := v_headers->>'user-agent';

  UPDATE public.pessoas_documentos
     SET estado = 'assinado',
         assinado_em = now(),
         assinado_por_auth_uid = v_auth,
         assinatura_ip = v_ip,
         assinatura_user_agent = v_user_agent,
         updated_by = (SELECT au.id FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1)
   WHERE id = p_documento_id;

  PERFORM public.hr_registar_acesso_sensivel(v_doc.pessoa_id, v_doc.organization_id, 'documento', 'alterar');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_documento_assinar(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_documento_assinar(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_assinar(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_documento_assinar(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_documento_assinar(uuid) IS
'Assina um documento em nome da propria pessoa (hr_pessoa_do_utilizador): confirma identidade, exige estado=a_aguardar_assinatura, grava assinado_em/assinado_por_auth_uid/assinatura_ip/assinatura_user_agent (IP e user-agent lidos do cabecalho do pedido via request.headers, nunca de parametro do cliente) e passa a assinado. Depois desta chamada a linha fica imutavel por trigger (hr_documentos_assinado_imutavel), mesmo para service_role. Audita em pessoas_acessos_sensiveis (campo=documento, accao=alterar).';

-- Este aviso e sobre pessoas_documentos, nao sobre os modelos. Estava posto na
-- tabela errada e apagava a descricao dos modelos, escrita em 20261123020000.
COMMENT ON TABLE public.pessoas_documentos IS
'Dossie documental de cada pessoa. O corpo do documento (corpo_html) NAO tem SELECT para authenticated: le-se por rpc_hr_documento_ver_conteudo, que verifica o acesso e audita. Um documento assinado e imutavel por trigger. ATENCAO a quem escreve a interface: com grants por coluna, um select=* nesta tabela devolve erro de permissao -- pedir sempre colunas explicitas, nunca .select(''*'').';

-- ---- Conferir ---------------------------------------------------------------
DO $conferir$
DECLARE
  v_politicas       integer;
  v_colunas_tabela  text[];
  v_colunas_grant   text[];
  v_esperadas       text[] := ARRAY[
    'id','pessoa_id','organization_id','vinculo_id','modelo_id',
    'tipo','titulo','ficheiro_caminho',
    'estado','emitido_em','emitido_por',
    'assinado_em','assinado_por_auth_uid',
    'anulado_em','anulado_por','anulado_motivo',
    'deleted_at','deleted_by','created_at','updated_at','created_by','updated_by'
  ];
  v_falta           text[];
  v_a_mais          text[];
BEGIN
  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_documentos';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'pessoas_documentos ficou com % politicas, esperavam-se 4.', v_politicas;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.pessoas_documentos'::regclass) THEN
    RAISE EXCEPTION 'RLS nao esta activo em pessoas_documentos.';
  END IF;

  -- Grants de COLUNA para authenticated, medidos por pg_attribute.attacl
  -- (nunca information_schema.column_privileges -- essa vista expande o
  -- grant de TABELA para todas as colunas e mascararia exactamente o que
  -- se quer medir aqui).
  SELECT array_agg(a.attname ORDER BY a.attname) INTO v_colunas_grant
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_documentos')
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attacl IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM unnest(a.attacl) acl
        WHERE acl::text LIKE '%authenticated=r%'
     );

  SELECT array_agg(x ORDER BY x) INTO v_esperadas FROM unnest(v_esperadas) x;

  SELECT array_agg(c) INTO v_falta
    FROM unnest(v_esperadas) c
   WHERE NOT (c = ANY (coalesce(v_colunas_grant, ARRAY[]::text[])));

  SELECT array_agg(c) INTO v_a_mais
    FROM unnest(coalesce(v_colunas_grant, ARRAY[]::text[])) c
   WHERE NOT (c = ANY (v_esperadas));

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'pessoas_documentos: authenticated NAO tem SELECT nas colunas de metadados %. A lista de GRANT diverge da esperada.', v_falta;
  END IF;

  IF v_a_mais IS NOT NULL THEN
    RAISE EXCEPTION 'pessoas_documentos: authenticated tem SELECT a MAIS nas colunas %. Se corpo_html ou ficheiro_caminho aparecerem aqui, o conteudo deixou de estar fechado.', v_a_mais;
  END IF;

  -- corpo_html especificamente NAO pode ter attacl nenhum para authenticated.
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_documentos')
       AND a.attname = 'corpo_html'
       AND a.attacl IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(a.attacl) acl WHERE acl::text LIKE '%authenticated%')
  ) THEN
    RAISE EXCEPTION 'pessoas_documentos.corpo_html tem ALGUM privilegio para authenticated. Deve estar completamente fechado.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_privileges
     WHERE table_schema = 'public' AND table_name = 'pessoas_documentos'
       AND grantee = 'authenticated' AND privilege_type IN ('INSERT','UPDATE','DELETE')
  ) THEN
    RAISE EXCEPTION 'authenticated tem INSERT, UPDATE ou DELETE ao nivel da TABELA em pessoas_documentos -- devia ter zero (so SELECT de coluna).';
  END IF;

  RAISE NOTICE 'Guardas passadas: pessoas_documentos com RLS, 4 politicas, grant de coluna so nos metadados, corpo_html fechado, zero INSERT/UPDATE/DELETE de tabela para authenticated.';
END;
$conferir$;
