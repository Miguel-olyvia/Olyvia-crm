-- ============================================================
--  Operações — isolamento entre organizações (auditoria 01/10/2026)
-- ============================================================
--  Correr DEPOIS de: cliente-crm.sql (fim da sequência funcional).
--  Correr ANTES de:  tempos.sql, obras.sql.
--
--  ⚠ Se voltares a correr um ficheiro ANTERIOR a este (schema.sql, config.sql,
--    despacho.sql, …), volta a correr este a seguir. Os ficheiros antigos
--    recriam as policies e as RPCs com a verificação global, e este é o que
--    as põe outra vez no sítio.
--
--  O defeito de base: `has_anew_permission()` é global — devolve true se o
--  utilizador tiver a permissão em QUALQUER organização. Usada sozinha numa
--  policy ou numa RPC, deixa passar dados entre tenants: quem é gestor na
--  organização A e técnico na B tinha, na B, os poderes de gestor da A.
--
--  `ops_pode(org, permissão)` junta as condições que têm de valer ao mesmo
--  tempo: vê a organização, tem a permissão — dada pelo papel da membership
--  NESSA organização, quando a tem lá —, e tem perfil ativo de Operações
--  NESSA organização. Para as duas permissões perigosas (gerir a equipa e ver
--  custos) exige ainda que a função NESSA organização seja admin ou gestor.
--
--  O que este ficheiro faz:
--
--   1. Função 'supervisor' — entre gestor e operador. Vê o âmbito todo e
--      valida trabalho (confirma ou reabre ordens fechadas — ver tempos.sql),
--      não mexe em definições nem em custos.
--   2. `ops_pode`, `ops_nivel_funcao`, `ops_funcao_atual`, e as funções de
--      âmbito (`ops_pode_ver_ordem`, `ops_clientes_no_ambito`) que deixam de
--      servir para sondar outros utilizadores.
--   3. Todas as policies de `ops_*` reescritas com `ops_pode`.
--   4. Escritas diretas fechadas onde a app já só escreve por RPC: ordens,
--      filhos de ordem, custos, previsto, perfis, leituras e eventos.
--   5. As RPCs que verificavam a permissão globalmente passam a verificá-la
--      na organização certa. A gestão da equipa exige ainda a função certa
--      NESSA organização, e ninguém dá uma função acima da sua.
--   6. Funções internas que estavam ao alcance de `authenticated` deixam de
--      estar (`ops_recalcular_custo_mao_obra`, `ops_conflitos_de_agenda`).
--
--  Escreve fora de `ops_*`? NÃO. As políticas do bucket `operacoes` em
--  `storage.objects` são as do próprio módulo, e só são recriadas se o
--  esquema storage existir.
-- ============================================================

BEGIN;

DO $guarda$
BEGIN
  IF to_regprocedure('public.rpc_ops_criar_local(uuid,text,text,uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/cliente-crm.sql (e os anteriores). Este ficheiro corre no fim da sequência.';
  END IF;
END
$guarda$;


-- ============================================================
-- 1. A função 'supervisor'
-- ============================================================
-- A hierarquia, de cima para baixo:
--   admin › gestor › supervisor › operador › tecnico
-- Espelhada em `FUNCOES` (src/domain/tipos.ts), pela mesma ordem.

ALTER TABLE public.ops_utilizador_perfil
  DROP CONSTRAINT IF EXISTS ops_utilizador_perfil_funcao_check;
ALTER TABLE public.ops_utilizador_perfil
  ADD CONSTRAINT ops_utilizador_perfil_funcao_check
  CHECK (funcao IN ('admin','gestor','supervisor','operador','tecnico'));

-- 0 é o topo. Uma função desconhecida fica no fundo, nunca no topo: errar
-- para o lado de dar menos.
CREATE OR REPLACE FUNCTION public.ops_nivel_funcao(_funcao text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _funcao
    WHEN 'admin'      THEN 0
    WHEN 'gestor'     THEN 1
    WHEN 'supervisor' THEN 2
    WHEN 'operador'   THEN 3
    WHEN 'tecnico'    THEN 4
    ELSE 99
  END
$$;

-- A função de quem chama, NESTA organização. NULL se não tiver perfil ativo
-- (ou não vir a organização). O admin de sistema conta como admin.
CREATE OR REPLACE FUNCTION public.ops_funcao_atual(_org_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT p.funcao
       FROM public.ops_utilizador_perfil p
      WHERE p.organization_id = _org_id
        AND p.utilizador_id = public.current_business_user_id()
        AND p.ativo
        AND _org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))),
    CASE WHEN public.is_system_admin_user((SELECT auth.uid())) THEN 'admin' END)
$$;

REVOKE ALL ON FUNCTION public.ops_nivel_funcao(text)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_funcao_atual(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_nivel_funcao(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_funcao_atual(uuid) TO authenticated, service_role;


-- ============================================================
-- 2. A pergunta certa: "pode, NESTA organização?"
-- ============================================================

-- Quatro condições, todas sobre a MESMA organização:
--
--   1. vê-a (`get_user_visible_org_ids`);
--   2. tem a permissão segundo o CRM (`has_anew_permission`, global);
--   3. se tem membership NESTA organização, é o papel DESSA membership que
--      tem de ter a permissão. É isto que fecha "gestor na A, técnico na B":
--      na B vale o papel de técnico, não o de gestor.
--      Sem membership aqui (a organização vê-se por herança, de uma
--      organização-mãe), fica a regra do CRM — não se inventa outra;
--   4. tem perfil ativo de Operações aqui. Para gerir a equipa e ver custos,
--      a função aqui tem de ser admin ou gestor.
CREATE OR REPLACE FUNCTION public.ops_pode(_org_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_system_admin_user((SELECT auth.uid()))
    OR (
      _org_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND public.has_anew_permission((SELECT auth.uid()), _perm)
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.anew_memberships m
           WHERE m.user_id = public.current_business_user_id()
             AND m.organization_id = _org_id
             AND m.status = 'active')
        OR EXISTS (
          SELECT 1 FROM public.anew_memberships m
            JOIN public.anew_role_permissions rp
              ON rp.role_id = m.role_id AND rp.permission_code = _perm
           WHERE m.user_id = public.current_business_user_id()
             AND m.organization_id = _org_id
             AND m.status = 'active')
      )
      AND EXISTS (
        SELECT 1 FROM public.ops_utilizador_perfil p
         WHERE p.organization_id = _org_id
           AND p.utilizador_id = public.current_business_user_id()
           AND p.ativo
           -- A permissão do CRM é global; a função é por organização. Para
           -- as duas que mexem em gente e em dinheiro, é a função NESTA
           -- organização que decide.
           AND (_perm NOT IN ('operations.settings.manage','operations.costs.view')
                OR p.funcao IN ('admin','gestor'))
      )
    )
$$;

REVOKE ALL ON FUNCTION public.ops_pode(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_pode(uuid, text) TO authenticated, service_role;


-- ============================================================
-- 3. Funções de âmbito que não servem para sondar terceiros
-- ============================================================
-- As duas recebem `_auth_uid` porque as policies lhes passam `auth.uid()`.
-- Têm de continuar dadas a `authenticated` (é quem avalia as policies), por
-- isso em vez de as revogar ignoram o parâmetro quando não é quem chama:
-- perguntar "e o fulano, vê esta ordem?" devolve sempre não.
--
-- Sem sessão (`auth.uid()` nulo — service_role, jobs) o parâmetro vale.

CREATE OR REPLACE FUNCTION public.ops_clientes_no_ambito(_auth_uid uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT uc.cliente_id
    FROM public.ops_utilizador_cliente uc
    JOIN public.anew_users au ON au.id = uc.utilizador_id
   WHERE au.auth_user_id = _auth_uid
     AND ((SELECT auth.uid()) IS NULL OR _auth_uid = (SELECT auth.uid()))
$$;

-- Uma ordem é visível se quem chama:
--   · tem `orders.view_all` NESSA organização; ou
--   · é supervisor ou acima NESSA organização (é a definição de supervisor:
--     vê tudo o que está no seu âmbito para o poder validar); ou
--   · está na ordem (responsável ou equipa).
CREATE OR REPLACE FUNCTION public.ops_pode_ver_ordem(_auth_uid uuid, _ordem_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ((SELECT auth.uid()) IS NULL OR _auth_uid = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
        FROM public.ops_ordem o
       WHERE o.id = _ordem_id
         AND (
           public.ops_pode(o.organization_id, 'operations.orders.view_all')
           OR public.ops_nivel_funcao(public.ops_funcao_atual(o.organization_id))
                <= public.ops_nivel_funcao('supervisor')
           OR EXISTS (
             SELECT 1 FROM public.anew_users au
              WHERE au.auth_user_id = _auth_uid
                AND (o.responsavel_id = au.id
                     OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa op
                                 WHERE op.ordem_id = o.id AND op.utilizador_id = au.id)))
         )
    )
$$;

REVOKE ALL ON FUNCTION public.ops_clientes_no_ambito(uuid)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_pode_ver_ordem(uuid, uuid)    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_clientes_no_ambito(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ops_pode_ver_ordem(uuid, uuid) TO authenticated, service_role;

-- O caminho de um anexo revela a organização da ordem. Só a quem a vê.
CREATE OR REPLACE FUNCTION public.ops_caminho_da_ordem(_ordem_id uuid, _ficheiro text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.organization_id::text || '/' || o.id::text || '/' || _ficheiro
    FROM public.ops_ordem o
   WHERE o.id = _ordem_id
     AND ((SELECT auth.uid()) IS NULL
          OR public.ops_pode_ver_ordem((SELECT auth.uid()), o.id))
$$;


-- ============================================================
-- 4. Policies — tabelas com organization_id
-- ============================================================
-- Ler com a permissão de ver, escrever com a de gerir — as duas NESTA
-- organização. Os nomes das policies são os de sempre, para que este
-- ficheiro as substitua em vez de somar outras (as policies somam-se com OR,
-- e uma antiga esquecida anularia a nova).

DO $policies$
DECLARE
  regras constant text[][] := ARRAY[
    -- tabela,               ver,                           gerir (expressão)
    ARRAY['ops_local',           'operations.locations.view', 'public.ops_pode(organization_id, ''operations.locations.manage'')'],
    ARRAY['ops_ativo',           'operations.locations.view', 'public.ops_pode(organization_id, ''operations.locations.manage'')'],
    ARRAY['ops_categoria_ativo', 'operations.locations.view', 'public.ops_pode(organization_id, ''operations.locations.manage'')'],
    ARRAY['ops_checklist',       'operations.view',           'public.ops_pode(organization_id, ''operations.checklists.manage'')'],
    ARRAY['ops_plano',           'operations.view',           'public.ops_pode(organization_id, ''operations.plans.manage'')'],
    ARRAY['ops_skill',           'operations.view',           'public.ops_pode(organization_id, ''operations.settings.manage'')'],
    ARRAY['ops_horario',         'operations.view',           'public.ops_pode(organization_id, ''operations.settings.manage'')'],
    ARRAY['ops_medicao_def',     'operations.view',           '(public.ops_pode(organization_id, ''operations.checklists.manage'') OR public.ops_pode(organization_id, ''operations.settings.manage''))']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(regras, 1) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', regras[i][1]);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write  ON public.%1$I', regras[i][1]);

    EXECUTE format($f$
      CREATE POLICY %1$s_select ON public.%1$I
        FOR SELECT TO authenticated USING (public.ops_pode(organization_id, %2$L))
    $f$, regras[i][1], regras[i][2]);

    EXECUTE format($f$
      CREATE POLICY %1$s_write ON public.%1$I
        FOR ALL TO authenticated USING (%2$s) WITH CHECK (%2$s)
    $f$, regras[i][1], regras[i][3]);
  END LOOP;
END
$policies$;

-- ── Anexos: ver a organização não chega, é preciso ver a ordem ───────────
DROP POLICY IF EXISTS ops_anexo_select ON public.ops_anexo;
CREATE POLICY ops_anexo_select ON public.ops_anexo
  FOR SELECT TO authenticated USING (
    public.ops_pode(organization_id, 'operations.view')
    AND (ordem_id IS NULL OR public.ops_pode_ver_ordem((SELECT auth.uid()), ordem_id))
  );

DROP POLICY IF EXISTS ops_anexo_write ON public.ops_anexo;
CREATE POLICY ops_anexo_write ON public.ops_anexo
  FOR ALL TO authenticated
  USING (public.ops_pode(organization_id, 'operations.orders.execute'))
  WITH CHECK (public.ops_pode(organization_id, 'operations.orders.execute'));

-- ── Histórico: lê-se o que se vê; escreve-se só em nome próprio ──────────
-- O INSERT direto deixa de existir (ver secção 8): o histórico é escrito
-- pelas RPCs. A policy fica como segunda linha de defesa — se alguém voltar
-- a dar o INSERT, o autor é sempre quem escreve, nunca outro.
DROP POLICY IF EXISTS ops_evento_select ON public.ops_evento;
CREATE POLICY ops_evento_select ON public.ops_evento
  FOR SELECT TO authenticated USING (
    public.ops_pode(organization_id, 'operations.view')
    AND (
      entidade NOT IN ('ordem','tarefa')
      OR (entidade = 'ordem'  AND public.ops_pode_ver_ordem((SELECT auth.uid()), entidade_id))
      OR (entidade = 'tarefa' AND EXISTS (SELECT 1 FROM public.ops_ordem_tarefa t
                                          WHERE t.id = ops_evento.entidade_id))
    )
  );

DROP POLICY IF EXISTS ops_evento_write ON public.ops_evento;
CREATE POLICY ops_evento_write ON public.ops_evento
  FOR INSERT TO authenticated WITH CHECK (
    public.ops_pode(organization_id, 'operations.view')
    AND autor_id = public.current_business_user_id()
  );


-- ============================================================
-- 5. Policies — ordens e o que pende delas
-- ============================================================

DROP POLICY IF EXISTS ops_ordem_select ON public.ops_ordem;
CREATE POLICY ops_ordem_select ON public.ops_ordem
  FOR SELECT TO authenticated USING (
    public.ops_pode(organization_id, 'operations.orders.view')
    AND public.ops_pode_ver_ordem((SELECT auth.uid()), id)
  );

DROP POLICY IF EXISTS ops_ordem_insert ON public.ops_ordem;
CREATE POLICY ops_ordem_insert ON public.ops_ordem
  FOR INSERT TO authenticated WITH CHECK (
    public.ops_pode(organization_id, 'operations.orders.create')
  );

DROP POLICY IF EXISTS ops_ordem_update ON public.ops_ordem;
CREATE POLICY ops_ordem_update ON public.ops_ordem
  FOR UPDATE TO authenticated USING (
    (public.ops_pode(organization_id, 'operations.orders.edit')
     OR public.ops_pode(organization_id, 'operations.orders.execute'))
    AND public.ops_pode_ver_ordem((SELECT auth.uid()), id)
  ) WITH CHECK (
    public.ops_pode(organization_id, 'operations.orders.edit')
    OR public.ops_pode(organization_id, 'operations.orders.execute')
  );

DROP POLICY IF EXISTS ops_ordem_delete ON public.ops_ordem;
CREATE POLICY ops_ordem_delete ON public.ops_ordem
  FOR DELETE TO authenticated USING (
    public.ops_pode(organization_id, 'operations.orders.cancel')
  );

-- Os filhos herdam a visibilidade da ordem (o EXISTS corre com a RLS de
-- `ops_ordem`), e a escrita exige executar NA ORGANIZAÇÃO DA ORDEM — antes
-- bastava ter a permissão em qualquer sítio, e um técnico metia-se na equipa
-- de uma ordem de outra organização.
DO $policies$
DECLARE
  t text;
  tabelas constant text[] := ARRAY[
    'ops_ordem_alvo', 'ops_ordem_tarefa', 'ops_ordem_pessoa',
    'ops_sessao_trabalho', 'ops_mensagem'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write  ON public.%1$I', t);
    EXECUTE format($f$
      CREATE POLICY %1$s_select ON public.%1$I
        FOR SELECT TO authenticated USING (
          EXISTS (SELECT 1 FROM public.ops_ordem o WHERE o.id = %1$I.ordem_id)
        );
      CREATE POLICY %1$s_write ON public.%1$I
        FOR ALL TO authenticated USING (
          EXISTS (SELECT 1 FROM public.ops_ordem o
                   WHERE o.id = %1$I.ordem_id
                     AND public.ops_pode(o.organization_id, 'operations.orders.execute'))
        ) WITH CHECK (
          EXISTS (SELECT 1 FROM public.ops_ordem o
                   WHERE o.id = %1$I.ordem_id
                     AND public.ops_pode(o.organization_id, 'operations.orders.execute'))
        );
    $f$, t);
  END LOOP;
END
$policies$;

-- ── Custos — o técnico não vê dinheiro, e ninguém vê o de outra casa ─────
DROP POLICY IF EXISTS ops_custo_select ON public.ops_custo;
CREATE POLICY ops_custo_select ON public.ops_custo
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_custo.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.costs.view'))
  );

DROP POLICY IF EXISTS ops_custo_write ON public.ops_custo;
CREATE POLICY ops_custo_write ON public.ops_custo
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_custo.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.costs.view'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_custo.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.costs.view'))
  );

-- ── O previsto é dinheiro também ─────────────────────────────────────────
DROP POLICY IF EXISTS ops_ordem_previsto_select ON public.ops_ordem_previsto;
CREATE POLICY ops_ordem_previsto_select ON public.ops_ordem_previsto
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_ordem_previsto.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.costs.view'))
  );

-- Uma por comando, e não FOR ALL — ver a nota em orcamentos.sql.
DROP POLICY IF EXISTS ops_ordem_previsto_insert ON public.ops_ordem_previsto;
CREATE POLICY ops_ordem_previsto_insert ON public.ops_ordem_previsto
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_ordem_previsto.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.orders.edit'))
  );

DROP POLICY IF EXISTS ops_ordem_previsto_update ON public.ops_ordem_previsto;
CREATE POLICY ops_ordem_previsto_update ON public.ops_ordem_previsto
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_ordem_previsto.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.orders.edit'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_ordem_previsto.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.orders.edit'))
  );

DROP POLICY IF EXISTS ops_ordem_previsto_delete ON public.ops_ordem_previsto;
CREATE POLICY ops_ordem_previsto_delete ON public.ops_ordem_previsto
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_ordem o
             WHERE o.id = ops_ordem_previsto.ordem_id
               AND public.ops_pode(o.organization_id, 'operations.orders.edit'))
  );

-- ── Leituras de medição ──────────────────────────────────────────────────
DROP POLICY IF EXISTS ops_ordem_tarefa_medicao_select ON public.ops_ordem_tarefa_medicao;
CREATE POLICY ops_ordem_tarefa_medicao_select ON public.ops_ordem_tarefa_medicao
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_ordem_tarefa t
             WHERE t.id = ops_ordem_tarefa_medicao.ordem_tarefa_id)
  );

DROP POLICY IF EXISTS ops_ordem_tarefa_medicao_write ON public.ops_ordem_tarefa_medicao;
CREATE POLICY ops_ordem_tarefa_medicao_write ON public.ops_ordem_tarefa_medicao
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ops_ordem_tarefa t
              JOIN public.ops_ordem o ON o.id = t.ordem_id
             WHERE t.id = ops_ordem_tarefa_medicao.ordem_tarefa_id
               AND public.ops_pode(o.organization_id, 'operations.orders.execute'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.ops_ordem_tarefa t
              JOIN public.ops_ordem o ON o.id = t.ordem_id
             WHERE t.id = ops_ordem_tarefa_medicao.ordem_tarefa_id
               AND public.ops_pode(o.organization_id, 'operations.orders.execute'))
  );


-- ============================================================
-- 6. Policies — tabelas sem organization_id (vai-se buscá-la ao pai)
-- ============================================================

-- ── Perfis ───────────────────────────────────────────────────────────────
-- A linha do próprio lê-se sempre (a app precisa da função); as dos outros
-- só com custos NESTA organização — e `ops_pode` já exige admin/gestor para
-- isso. A app lê `ops_v_equipa`, que nem tem a coluna custo_hora.
DROP POLICY IF EXISTS ops_utilizador_perfil_select ON public.ops_utilizador_perfil;
CREATE POLICY ops_utilizador_perfil_select ON public.ops_utilizador_perfil
  FOR SELECT TO authenticated USING (
    public.ops_pode(organization_id, 'operations.costs.view')
    OR (
      organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid())))
      AND utilizador_id = public.current_business_user_id()
    )
  );

DROP POLICY IF EXISTS ops_utilizador_perfil_write ON public.ops_utilizador_perfil;
CREATE POLICY ops_utilizador_perfil_write ON public.ops_utilizador_perfil
  FOR ALL TO authenticated
  USING (public.ops_pode(organization_id, 'operations.settings.manage'))
  WITH CHECK (public.ops_pode(organization_id, 'operations.settings.manage'));

-- ── Âmbito por cliente: a organização é a do cliente ─────────────────────
DROP POLICY IF EXISTS ops_utilizador_cliente_select ON public.ops_utilizador_cliente;
CREATE POLICY ops_utilizador_cliente_select ON public.ops_utilizador_cliente
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.anew_clients c
             WHERE c.id = ops_utilizador_cliente.cliente_id
               AND public.ops_pode(c.organization_id, 'operations.view'))
  );

DROP POLICY IF EXISTS ops_utilizador_cliente_write ON public.ops_utilizador_cliente;
CREATE POLICY ops_utilizador_cliente_write ON public.ops_utilizador_cliente
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.anew_clients c
             WHERE c.id = ops_utilizador_cliente.cliente_id
               AND public.ops_pode(c.organization_id, 'operations.settings.manage'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.anew_clients c
             WHERE c.id = ops_utilizador_cliente.cliente_id
               AND public.ops_pode(c.organization_id, 'operations.settings.manage'))
  );

-- ── Filhos de configuração ───────────────────────────────────────────────
-- Leitura herdada do pai (o EXISTS corre com a RLS dele); escrita com a
-- permissão de gerir NA ORGANIZAÇÃO DO PAI.
DO $policies$
DECLARE
  regras constant text[][] := ARRAY[
    -- tabela, existe-pai (leitura), existe-pai-com-permissão (escrita)
    ARRAY['ops_checklist_tarefa',
      'SELECT 1 FROM public.ops_checklist c WHERE c.id = ops_checklist_tarefa.checklist_id',
      'SELECT 1 FROM public.ops_checklist c WHERE c.id = ops_checklist_tarefa.checklist_id
          AND public.ops_pode(c.organization_id, ''operations.checklists.manage'')'],
    ARRAY['ops_plano_alvo',
      'SELECT 1 FROM public.ops_plano p WHERE p.id = ops_plano_alvo.plano_id',
      'SELECT 1 FROM public.ops_plano p WHERE p.id = ops_plano_alvo.plano_id
          AND public.ops_pode(p.organization_id, ''operations.plans.manage'')'],
    ARRAY['ops_utilizador_skill',
      'SELECT 1 FROM public.ops_skill s WHERE s.id = ops_utilizador_skill.skill_id',
      'SELECT 1 FROM public.ops_skill s WHERE s.id = ops_utilizador_skill.skill_id
          AND public.ops_pode(s.organization_id, ''operations.settings.manage'')'],
    ARRAY['ops_medicao_opcao',
      'SELECT 1 FROM public.ops_medicao_def d WHERE d.id = ops_medicao_opcao.medicao_def_id',
      'SELECT 1 FROM public.ops_medicao_def d WHERE d.id = ops_medicao_opcao.medicao_def_id
          AND (public.ops_pode(d.organization_id, ''operations.checklists.manage'')
               OR public.ops_pode(d.organization_id, ''operations.settings.manage''))'],
    ARRAY['ops_checklist_tarefa_medicao',
      'SELECT 1 FROM public.ops_checklist_tarefa ct WHERE ct.id = ops_checklist_tarefa_medicao.checklist_tarefa_id',
      'SELECT 1 FROM public.ops_checklist_tarefa ct
          JOIN public.ops_checklist c ON c.id = ct.checklist_id
         WHERE ct.id = ops_checklist_tarefa_medicao.checklist_tarefa_id
           AND public.ops_pode(c.organization_id, ''operations.checklists.manage'')']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(regras, 1) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', regras[i][1]);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_write  ON public.%1$I', regras[i][1]);
    EXECUTE format($f$
      CREATE POLICY %1$s_select ON public.%1$I
        FOR SELECT TO authenticated USING (EXISTS (%2$s))
    $f$, regras[i][1], regras[i][2]);
    EXECUTE format($f$
      CREATE POLICY %1$s_write ON public.%1$I
        FOR ALL TO authenticated USING (EXISTS (%2$s)) WITH CHECK (EXISTS (%2$s))
    $f$, regras[i][1], regras[i][3]);
  END LOOP;
END
$policies$;


-- ============================================================
-- 7. Storage: o bucket `operacoes`, por organização a sério
-- ============================================================
-- O primeiro segmento do caminho é a organização, o segundo a ordem.

DO $storage$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'Sem esquema storage nesta base — políticas do bucket por recriar.';
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
        AND public.ops_pode_ver_ordem((SELECT auth.uid()), split_part(name, '/', 2)::uuid)
      );
  $p$;

  EXECUTE $p$
    DROP POLICY IF EXISTS ops_anexos_criar ON storage.objects;
    CREATE POLICY ops_anexos_criar ON storage.objects
      FOR INSERT TO authenticated WITH CHECK (
        bucket_id = 'operacoes'
        AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
        AND (public.ops_pode(split_part(name, '/', 1)::uuid, 'operations.orders.execute')
             OR public.ops_pode(split_part(name, '/', 1)::uuid, 'operations.orders.edit'))
      );
  $p$;

  EXECUTE $p$
    DROP POLICY IF EXISTS ops_anexos_apagar ON storage.objects;
    CREATE POLICY ops_anexos_apagar ON storage.objects
      FOR DELETE TO authenticated USING (
        bucket_id = 'operacoes'
        AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
        AND (public.ops_pode(split_part(name, '/', 1)::uuid, 'operations.orders.execute')
             OR public.ops_pode(split_part(name, '/', 1)::uuid, 'operations.orders.edit'))
      );
  $p$;
END
$storage$;


-- ============================================================
-- 8. Escritas diretas: fechadas onde só as RPCs escrevem
-- ============================================================
-- A app não faz INSERT/UPDATE/DELETE direto em nenhuma destas tabelas — tudo
-- passa por RPCs `SECURITY DEFINER` (confirmado em src/: só `ops_local`,
-- `ops_ativo` e `ops_categoria_ativo` são escritas diretamente, e essas
-- ficam com a RLS da secção 4).
--
-- Sem isto, as guardas de estado eram a única coisa entre um técnico e as
-- outras colunas: `responsavel_id`, `cliente_id` e `organization_id` da
-- ordem, ou `obrigatoria` de uma tarefa, mudavam-se com um UPDATE direto.
-- Uma guarda por coluna teria de ser mantida a cada coluna nova; tirar o
-- privilégio fecha tudo de uma vez.
--
-- Fica o SELECT. A RLS de escrita fica também, como segunda linha de defesa
-- para quem um dia voltar a dar o privilégio.

DO $grants$
DECLARE
  t text;
  so_rpc constant text[] := ARRAY[
    'ops_ordem', 'ops_ordem_alvo', 'ops_ordem_tarefa', 'ops_ordem_pessoa',
    'ops_sessao_trabalho', 'ops_mensagem', 'ops_custo', 'ops_ordem_previsto',
    'ops_ordem_tarefa_medicao', 'ops_utilizador_perfil', 'ops_evento', 'ops_anexo'
  ];
BEGIN
  FOREACH t IN ARRAY so_rpc LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END
$grants$;


-- ============================================================
-- 9. Funções internas fora do alcance de `authenticated`
-- ============================================================
-- No Supabase as funções novas nascem com EXECUTE para `authenticated` (por
-- default privileges). `REVOKE ... FROM PUBLIC, anon` não lhe toca. Estas
-- duas ficaram assim:
--
--  · ops_recalcular_custo_mao_obra — SECURITY DEFINER, sem verificação
--    nenhuma: apagava e reescrevia a mão de obra de qualquer ordem;
--  · ops_conflitos_de_agenda — dizia onde está qualquer pessoa, de qualquer
--    organização, a qualquer hora.
--
-- As duas só são chamadas de dentro de RPCs, que correm como o dono.

REVOKE ALL ON FUNCTION public.ops_recalcular_custo_mao_obra(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_recalcular_custo_mao_obra(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ops_conflitos_de_agenda(uuid, timestamptz, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_conflitos_de_agenda(uuid, timestamptz, timestamptz, uuid)
  TO service_role;

-- Por coerência: as outras peças internas, outra vez, de forma explícita.
REVOKE ALL ON FUNCTION public.ops_proximo_codigo_interno(uuid, text)   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_criar_corretiva(uuid, text, uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ops_gerar_proxima_dinamica(uuid)         FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 10. RPCs: a permissão verificada NA organização certa
-- ============================================================
-- Cada uma destas é a versão de sempre com UMA diferença: onde estava
--   has_anew_permission(auth.uid(), 'x')
-- está agora
--   ops_pode(<organização do objeto>, 'x').
-- Os corpos são copiados por inteiro porque o Postgres não deixa trocar só
-- uma linha de uma função. Os ficheiros de origem ficam com a versão antiga
-- — por isso este ficheiro tem de correr depois deles (ver o cabeçalho).

-- ── 10.1 Numeração para a app (schema.sql) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_proximo_codigo(_org_id uuid, _prefixo text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chave text;
  v_valor integer;
  v_ano   text := to_char(now(), 'YYYY');
BEGIN
  IF NOT public.ops_pode(_org_id, 'operations.orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens nesta organização'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_chave := _prefixo || '-' || v_ano;

  INSERT INTO public.ops_sequencia (organization_id, chave, valor)
  VALUES (_org_id, v_chave, 1)
  ON CONFLICT (organization_id, chave)
  DO UPDATE SET valor = public.ops_sequencia.valor + 1
  RETURNING valor INTO v_valor;

  RETURN _prefixo || '-' || v_ano || '-' || lpad(v_valor::text, 5, '0');
END
$$;

-- ── 10.2 Criar uma ordem (despacho.sql) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_criar_ordem_impl(
  p_titulo            text,
  p_cliente_id        uuid,
  p_origem            text    DEFAULT 'corretiva',
  p_prioridade        text    DEFAULT 'normal',
  p_descricao         text    DEFAULT NULL,
  p_local_id          uuid    DEFAULT NULL,
  p_ativo_id          uuid    DEFAULT NULL,
  p_checklist_id      uuid    DEFAULT NULL,
  p_area              text    DEFAULT NULL,
  p_tipo              text    DEFAULT NULL,
  p_contacto_nome     text    DEFAULT NULL,
  p_contacto_telefone text    DEFAULT NULL,
  p_agendada_para     timestamptz DEFAULT NULL,
  p_responsavel_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_org      uuid;
  v_titulo   text := nullif(btrim(coalesce(p_titulo, '')), '');
  v_codigo   text;
  v_estado   text;
  v_id       uuid;
  v_alvo     uuid;
  v_versao   integer;
  v_local    uuid := p_local_id;
BEGIN
  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Uma ordem precisa de um título. É o que aparece na lista.';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Uma ordem precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT public.ops_pode(v_org, 'operations.orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_origem NOT IN ('preventiva','corretiva','obra') THEN
    RAISE EXCEPTION 'Origem inválida: %. Vale preventiva, corretiva ou obra.', p_origem;
  END IF;
  IF p_prioridade NOT IN ('baixa','normal','alta','urgente') THEN
    RAISE EXCEPTION 'Prioridade inválida: %.', p_prioridade;
  END IF;

  IF p_local_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local WHERE id = p_local_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Esse local não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ativo_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.ops_ativo
                    WHERE id = p_ativo_id AND organization_id = v_org) THEN
      RAISE EXCEPTION 'Esse ativo não é desta organização.' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_local IS NULL THEN
      SELECT local_id INTO v_local FROM public.ops_ativo WHERE id = p_ativo_id;
    END IF;
  END IF;

  IF p_checklist_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_checklist
     WHERE id = p_checklist_id AND organization_id = v_org AND estado = 'publicada') THEN
    RAISE EXCEPTION 'Essa checklist não existe, não é desta organização, ou não está publicada.';
  END IF;

  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_responsavel_id AND organization_id = v_org AND ativo) THEN
    RAISE EXCEPTION 'Essa pessoa não está ativa em Operações nesta organização.';
  END IF;

  v_estado := CASE WHEN v_funcao = 'tecnico' THEN 'por_aprovar' ELSE 'agendada' END;
  v_codigo := public.ops_proximo_codigo_interno(v_org, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade, area, tipo,
    cliente_id, local_id, titulo, descricao,
    contacto_nome, contacto_telefone, agendada_para, responsavel_id, criada_por
  ) VALUES (
    v_org, v_codigo, p_origem, v_estado, p_prioridade, p_area, p_tipo,
    p_cliente_id, v_local, v_titulo, nullif(btrim(coalesce(p_descricao,'')), ''),
    nullif(btrim(coalesce(p_contacto_nome,'')), ''),
    nullif(btrim(coalesce(p_contacto_telefone,'')), ''),
    p_agendada_para, p_responsavel_id, v_user
  ) RETURNING id INTO v_id;

  IF p_ativo_id IS NOT NULL OR v_local IS NOT NULL OR p_checklist_id IS NOT NULL THEN
    SELECT versao INTO v_versao FROM public.ops_checklist WHERE id = p_checklist_id;

    INSERT INTO public.ops_ordem_alvo
      (ordem_id, ativo_id, local_id, checklist_id, checklist_versao, posicao)
    VALUES (v_id, p_ativo_id, v_local, p_checklist_id, v_versao, 0)
    RETURNING id INTO v_alvo;

    IF p_checklist_id IS NOT NULL THEN
      INSERT INTO public.ops_ordem_tarefa (
        ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
        tipo, skill_id, privada, obrigatoria, tempo_estimado
      )
      SELECT v_id, v_alvo, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
             ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
        FROM public.ops_checklist_tarefa ct
       WHERE ct.checklist_id = p_checklist_id
       ORDER BY ct.posicao;

      INSERT INTO public.ops_ordem_tarefa_medicao (
        ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
      SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
        FROM public.ops_ordem_tarefa ot
        JOIN public.ops_checklist_tarefa_medicao ctm
          ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
        JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
       WHERE ot.ordem_id = v_id
      ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;
    END IF;
  END IF;

  IF p_responsavel_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
    VALUES (v_id, p_responsavel_id, 'responsavel')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'ordem', v_id, 'criada', v_titulo, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'estado', v_estado, 'origem', p_origem));

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'codigo', v_codigo,
    'estado', v_estado,
    'tarefas', (SELECT count(*) FROM public.ops_ordem_tarefa WHERE ordem_id = v_id)
  );
END
$$;

REVOKE ALL ON FUNCTION public.ops_criar_ordem_impl(
  text, uuid, text, text, text, uuid, uuid, uuid, text, text, text, text, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── 10.3 Atribuir (despacho.sql) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_atribuir_ordem(
  p_ordem_id       uuid,
  p_responsavel_id uuid,
  p_equipa         uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_o      record;
  v_antes  uuid;
  v_equipa uuid[];
  v_mau    uuid;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF v_funcao = 'tecnico' THEN
    RAISE EXCEPTION 'Só quem coordena distribui o trabalho.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('fechada','confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se atribui uma ordem % — o trabalho já acabou.',
      replace(v_o.estado, '_', ' ');
  END IF;

  v_equipa := COALESCE(p_equipa, ARRAY[]::uuid[]);
  IF p_responsavel_id IS NOT NULL AND NOT (p_responsavel_id = ANY (v_equipa)) THEN
    v_equipa := v_equipa || p_responsavel_id;
  END IF;

  SELECT u INTO v_mau FROM unnest(v_equipa) AS u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.ops_utilizador_perfil
      WHERE utilizador_id = u AND organization_id = v_o.organization_id AND ativo)
   LIMIT 1;

  IF v_mau IS NOT NULL THEN
    RAISE EXCEPTION '% não está ativo em Operações nesta organização.',
      COALESCE((SELECT name FROM public.anew_users WHERE id = v_mau), 'Essa pessoa');
  END IF;

  v_antes := v_o.responsavel_id;

  UPDATE public.ops_ordem
     SET responsavel_id = p_responsavel_id, atualizada_em = now()
   WHERE id = p_ordem_id;

  DELETE FROM public.ops_ordem_pessoa
   WHERE ordem_id = p_ordem_id AND NOT (utilizador_id = ANY (v_equipa));

  INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
  SELECT p_ordem_id, u,
         CASE WHEN u = p_responsavel_id THEN 'responsavel' ELSE 'executante' END
    FROM unnest(v_equipa) AS u
  ON CONFLICT (ordem_id, utilizador_id) DO UPDATE
    SET papel = EXCLUDED.papel;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'atribuida',
     COALESCE((SELECT name FROM public.anew_users WHERE id = p_responsavel_id),
              'sem responsável'),
     v_user,
     jsonb_build_object('responsavel_id', v_antes),
     jsonb_build_object('responsavel_id', p_responsavel_id,
                        'equipa', to_jsonb(v_equipa)));

  RETURN jsonb_build_object(
    'ok', true,
    'responsavel_id', p_responsavel_id,
    'equipa', (SELECT count(*) FROM public.ops_ordem_pessoa WHERE ordem_id = p_ordem_id)
  );
END
$$;

-- ── 10.4 Agendar (despacho.sql) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_agendar_ordem(
  p_ordem_id      uuid,
  p_agendada_para timestamptz,
  p_janela_inicio timestamptz DEFAULT NULL,
  p_janela_fim    timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user      uuid;
  v_funcao    text;
  v_o         record;
  v_conflitos jsonb := '[]'::jsonb;
  v_ini       timestamptz;
  v_fim       timestamptz;
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF v_funcao = 'tecnico' THEN
    RAISE EXCEPTION 'Só quem coordena marca as datas.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.orders.edit') THEN
    RAISE EXCEPTION 'Sem permissão para editar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('fechada','confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se agenda uma ordem % — o trabalho já acabou.',
      replace(v_o.estado, '_', ' ');
  END IF;

  IF p_agendada_para IS NULL THEN
    RAISE EXCEPTION 'Falta a data.';
  END IF;

  IF p_janela_inicio IS NOT NULL AND p_janela_fim IS NOT NULL
     AND p_janela_fim <= p_janela_inicio THEN
    RAISE EXCEPTION 'A janela de visita acaba antes de começar.';
  END IF;

  v_ini := COALESCE(p_janela_inicio, p_agendada_para);
  v_fim := COALESCE(p_janela_fim, v_ini + interval '1 hour');

  UPDATE public.ops_ordem
     SET agendada_para = p_agendada_para,
         janela_inicio = p_janela_inicio,
         janela_fim    = p_janela_fim,
         atualizada_em = now()
   WHERE id = p_ordem_id;

  -- Os conflitos só se procuram dentro desta organização: a agenda de uma
  -- pessoa noutra empresa não é da conta de quem marca aqui.
  IF v_o.responsavel_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'codigo', c.codigo, 'titulo', c.titulo, 'agendada_para', c.agendada_para)), '[]'::jsonb)
      INTO v_conflitos
      FROM public.ops_conflitos_de_agenda(v_o.responsavel_id, v_ini, v_fim, p_ordem_id) c
      JOIN public.ops_ordem x ON x.id = c.ordem_id
     WHERE x.organization_id = v_o.organization_id;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'agendada',
     to_char(p_agendada_para, 'YYYY-MM-DD HH24:MI'), v_user,
     jsonb_build_object('agendada_para', v_o.agendada_para),
     jsonb_build_object('agendada_para', p_agendada_para,
                        'janela_inicio', p_janela_inicio,
                        'janela_fim', p_janela_fim,
                        'conflitos', jsonb_array_length(v_conflitos)));

  RETURN jsonb_build_object(
    'ok', true,
    'agendada_para', p_agendada_para,
    'conflitos', v_conflitos
  );
END
$$;

-- ── 10.5 Checklists e medições (config.sql) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_checklist(
  p_checklist_id uuid,
  p_nome         text,
  p_org_id       uuid,
  p_tarefas      jsonb DEFAULT '[]'::jsonb,
  p_publicar     boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id       uuid := p_checklist_id;
  v_codigo   text;
  v_versao   integer := 1;
  v_estado   text;
  v_t        jsonb;
  v_tid      uuid;
  v_pos      integer := 0;
  v_n        integer := 0;
  v_nova     boolean := false;
  v_med      jsonb;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma checklist precisa de um nome.';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT public.ops_pode(p_org_id, 'operations.checklists.manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir checklists.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_id IS NULL THEN
    v_codigo := public.ops_proximo_codigo_interno(p_org_id, 'CL');
    v_nova := true;
  ELSE
    SELECT codigo, versao, estado INTO v_codigo, v_versao, v_estado
      FROM public.ops_checklist WHERE id = v_id AND organization_id = p_org_id;

    IF v_codigo IS NULL THEN
      RAISE EXCEPTION 'Checklist não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_estado = 'publicada' THEN
      UPDATE public.ops_checklist SET estado = 'arquivada' WHERE id = v_id;
      v_versao := v_versao + 1;
      v_id := NULL;
      v_nova := true;
    END IF;
  END IF;

  IF v_nova THEN
    INSERT INTO public.ops_checklist (organization_id, codigo, nome, versao, estado, publicada_em)
    VALUES (p_org_id, v_codigo, v_nome, v_versao,
            CASE WHEN p_publicar THEN 'publicada' ELSE 'rascunho' END,
            CASE WHEN p_publicar THEN now() END)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_checklist SET
      nome         = v_nome,
      estado       = CASE WHEN p_publicar THEN 'publicada' ELSE estado END,
      publicada_em = CASE WHEN p_publicar THEN now() ELSE publicada_em END
    WHERE id = v_id;
  END IF;

  DELETE FROM public.ops_checklist_tarefa WHERE checklist_id = v_id;

  FOR v_t IN SELECT * FROM jsonb_array_elements(COALESCE(p_tarefas, '[]'::jsonb)) LOOP
    IF nullif(btrim(coalesce(v_t->>'nome', '')), '') IS NULL THEN
      RAISE EXCEPTION 'A tarefa na posição % não tem nome.', v_pos + 1;
    END IF;

    IF COALESCE(v_t->>'tipo', 'inspecao')
       NOT IN ('inspecao','correcao','limpeza','proacao','substituicao') THEN
      RAISE EXCEPTION 'Tipo de tarefa inválido: %.', v_t->>'tipo';
    END IF;

    -- Um tempo estimado negativo não quer dizer nada; recusa-se em vez de
    -- deixar o "real contra estimado" mentir.
    IF COALESCE((v_t->>'tempo_estimado')::integer, 0) < 0 THEN
      RAISE EXCEPTION 'O tempo estimado da tarefa "%" não pode ser negativo.', btrim(v_t->>'nome');
    END IF;

    INSERT INTO public.ops_checklist_tarefa (
      checklist_id, posicao, nome, descricao, tipo, obrigatoria, privada,
      foto_obrigatoria, tempo_estimado)
    VALUES (
      v_id, v_pos, btrim(v_t->>'nome'),
      nullif(btrim(coalesce(v_t->>'descricao', '')), ''),
      COALESCE(v_t->>'tipo', 'inspecao'),
      COALESCE((v_t->>'obrigatoria')::boolean, true),
      COALESCE((v_t->>'privada')::boolean, false),
      COALESCE((v_t->>'foto_obrigatoria')::boolean, false),
      COALESCE((v_t->>'tempo_estimado')::integer, 0))
    RETURNING id INTO v_tid;

    FOR v_med IN SELECT * FROM jsonb_array_elements(COALESCE(v_t->'medicoes', '[]'::jsonb)) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.ops_medicao_def
                      WHERE id = (v_med#>>'{}')::uuid AND organization_id = p_org_id) THEN
        RAISE EXCEPTION 'Uma das medições não existe nesta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id, posicao)
      VALUES (v_tid, (v_med#>>'{}')::uuid, 0)
      ON CONFLICT DO NOTHING;
    END LOOP;

    v_pos := v_pos + 1;
    v_n := v_n + 1;
  END LOOP;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (p_org_id, 'checklist', v_id,
     CASE WHEN p_publicar THEN 'publicada' ELSE 'gravada' END, v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'versao', v_versao, 'tarefas', v_n));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'versao', v_versao,
    'tarefas', v_n, 'publicada', p_publicar);
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_medicao(
  p_medicao_id  uuid,
  p_org_id      uuid,
  p_nome        text,
  p_tipo        text,
  p_categoria_id uuid    DEFAULT NULL,
  p_unidade     text     DEFAULT NULL,
  p_limite_min  numeric  DEFAULT NULL,
  p_limite_max  numeric  DEFAULT NULL,
  p_opcoes      jsonb    DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid;
  v_funcao text;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_id   uuid := p_medicao_id;
  v_o    jsonb;
  v_pos  integer := 0;
  v_n    integer := 0;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Uma medição precisa de um nome.';
  END IF;

  IF p_tipo NOT IN ('gama','acumulado','escolha','texto') THEN
    RAISE EXCEPTION 'Tipo de medição inválido: %.', p_tipo;
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT (
    public.ops_pode(p_org_id, 'operations.checklists.manage')
    OR public.ops_pode(p_org_id, 'operations.settings.manage')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerir medições.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo = 'escolha' AND jsonb_array_length(COALESCE(p_opcoes, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION
      'Uma medição de escolha precisa de pelo menos uma opção — senão é uma pergunta sem respostas.';
  END IF;

  IF p_tipo = 'gama' AND p_limite_min IS NULL AND p_limite_max IS NULL THEN
    RAISE EXCEPTION
      'Uma gama sem limites nunca dá veredicto nenhum. Põe um mínimo, um máximo, ou os dois.';
  END IF;

  IF p_limite_min IS NOT NULL AND p_limite_max IS NOT NULL AND p_limite_min > p_limite_max THEN
    RAISE EXCEPTION 'O mínimo (%) é maior do que o máximo (%).', p_limite_min, p_limite_max;
  END IF;

  IF p_categoria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_categoria_ativo
     WHERE id = p_categoria_id AND organization_id = p_org_id) THEN
    RAISE EXCEPTION 'Essa categoria não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.ops_medicao_def (
      organization_id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES (p_org_id, p_categoria_id, v_nome, p_tipo, nullif(btrim(coalesce(p_unidade,'')), ''),
            p_limite_min, p_limite_max)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ops_medicao_def SET
      categoria_ativo_id = p_categoria_id,
      nome       = v_nome,
      tipo       = p_tipo,
      unidade    = nullif(btrim(coalesce(p_unidade,'')), ''),
      limite_min = p_limite_min,
      limite_max = p_limite_max
    WHERE id = v_id AND organization_id = p_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Medição não encontrada nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  DELETE FROM public.ops_medicao_opcao o
   WHERE o.medicao_def_id = v_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(p_opcoes, '[]'::jsonb)) x
        WHERE btrim(x->>'nome') = o.nome);

  FOR v_o IN SELECT * FROM jsonb_array_elements(COALESCE(p_opcoes, '[]'::jsonb)) LOOP
    INSERT INTO public.ops_medicao_opcao
      (medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva)
    VALUES (
      v_id, btrim(v_o->>'nome'), v_pos,
      COALESCE((v_o->>'e_nao_conforme')::boolean, false),
      COALESCE((v_o->>'cria_corretiva')::boolean, false))
    ON CONFLICT (medicao_def_id, nome) DO UPDATE SET
      posicao        = EXCLUDED.posicao,
      e_nao_conforme = EXCLUDED.e_nao_conforme,
      cria_corretiva = EXCLUDED.cria_corretiva;
    v_pos := v_pos + 1;
    v_n := v_n + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'opcoes', v_n);
END
$$;

-- ── 10.6 A equipa (config.sql) ───────────────────────────────────────────
-- O cenário que isto fecha: gestora na organização A e técnica na B. A
-- permissão `settings.manage` vem-lhe do papel na A, mas `has_anew_permission`
-- não sabe de organizações — e na B ela promovia-se a admin.
--
-- Três regras, todas NESTA organização:
--   · só um admin ou gestor daqui gere a equipa daqui;
--   · ninguém dá uma função acima da sua (um gestor não cria admins);
--   · ninguém mexe no perfil de quem está acima de si.
CREATE OR REPLACE FUNCTION public.rpc_ops_gravar_perfil(
  p_org_id     uuid,
  p_utilizador uuid,
  p_funcao     text,
  p_custo_hora numeric DEFAULT NULL,
  p_ativo      boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user    uuid;
  v_funcao  text;
  v_sistema boolean := public.is_system_admin_user(auth.uid());
  v_antes   record;
BEGIN
  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(p_org_id) q;

  IF NOT v_sistema AND v_funcao NOT IN ('admin','gestor') THEN
    RAISE EXCEPTION 'Só um administrador ou gestor desta organização gere a equipa.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.ops_pode(p_org_id, 'operations.settings.manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir a equipa.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_funcao NOT IN ('admin','gestor','supervisor','operador','tecnico') THEN
    RAISE EXCEPTION 'Função inválida: %.', p_funcao;
  END IF;

  IF NOT v_sistema
     AND public.ops_nivel_funcao(p_funcao) < public.ops_nivel_funcao(v_funcao) THEN
    RAISE EXCEPTION 'Não podes dar uma função acima da tua (%).', v_funcao
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_custo_hora IS NOT NULL AND p_custo_hora < 0 THEN
    RAISE EXCEPTION 'O custo à hora não pode ser negativo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.anew_memberships
     WHERE user_id = p_utilizador AND organization_id = p_org_id AND status = 'active') THEN
    RAISE EXCEPTION 'Essa pessoa não tem acesso ativo a esta organização no Olyvia.';
  END IF;

  IF p_utilizador = v_user AND v_funcao IN ('admin','gestor')
     AND (p_funcao NOT IN ('admin','gestor') OR NOT p_ativo) THEN
    RAISE EXCEPTION
      'Não te podes tirar a ti próprio a gestão. Pede a outra pessoa com acesso.';
  END IF;

  SELECT funcao, custo_hora, ativo INTO v_antes
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = p_utilizador AND organization_id = p_org_id;

  IF NOT v_sistema AND v_antes.funcao IS NOT NULL
     AND public.ops_nivel_funcao(v_antes.funcao) < public.ops_nivel_funcao(v_funcao) THEN
    RAISE EXCEPTION 'Não podes alterar o perfil de quem está acima de ti.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.ops_utilizador_perfil
    (organization_id, utilizador_id, funcao, custo_hora, ativo)
  VALUES (p_org_id, p_utilizador, p_funcao, p_custo_hora, COALESCE(p_ativo, true))
  ON CONFLICT (organization_id, utilizador_id) DO UPDATE SET
    funcao     = EXCLUDED.funcao,
    custo_hora = EXCLUDED.custo_hora,
    ativo      = EXCLUDED.ativo;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (p_org_id, 'perfil', p_utilizador, 'perfil_alterado',
     COALESCE((SELECT name FROM public.anew_users WHERE id = p_utilizador), '—'), v_user,
     CASE WHEN v_antes.funcao IS NULL THEN NULL
          ELSE jsonb_build_object('funcao', v_antes.funcao,
                                  'custo_hora', v_antes.custo_hora,
                                  'ativo', v_antes.ativo) END,
     jsonb_build_object('funcao', p_funcao, 'custo_hora', p_custo_hora, 'ativo', p_ativo));

  RETURN jsonb_build_object('ok', true, 'utilizador_id', p_utilizador);
END
$$;

-- ── 10.7 Custos (custos.sql) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_lancar_custo(
  p_ordem_id        uuid,
  p_tipo            text,
  p_descricao       text,
  p_quantidade      numeric DEFAULT 1,
  p_valor_unit      numeric DEFAULT 0,
  p_unidade         text    DEFAULT NULL,
  p_catalog_item_id uuid    DEFAULT NULL,
  p_compra_linha_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_o      record;
  v_desc   text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_qt     numeric(12,3) := COALESCE(p_quantidade, 1);
  v_unit   numeric(12,2) := COALESCE(p_valor_unit, 0);
  v_origem text := 'manual';
  v_id     uuid;
  v_livre  numeric(12,3);
BEGIN
  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.costs.view') THEN
    RAISE EXCEPTION 'Sem permissão para mexer em custos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se lançam custos numa ordem % — o processo está encerrado.',
      replace(v_o.estado, '_', ' ');
  END IF;

  IF p_tipo = 'mao_obra' THEN
    RAISE EXCEPTION
      'A mão de obra sai das sessões de trabalho e do custo/hora de cada pessoa. Não se lança à mão.';
  END IF;

  IF p_tipo NOT IN ('material','servico','outro') THEN
    RAISE EXCEPTION 'Tipo de custo inválido: %. Vale material, servico ou outro.', p_tipo;
  END IF;

  IF v_qt <= 0 THEN
    RAISE EXCEPTION 'A quantidade tem de ser maior do que zero.';
  END IF;

  IF p_catalog_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.catalog_items
       WHERE id = p_catalog_item_id AND organization_id = v_o.organization_id) THEN
      RAISE EXCEPTION 'Esse item de catálogo não é desta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_origem := 'catalogo';

    IF v_desc IS NULL THEN
      SELECT nullif(btrim(descricao), '') INTO v_desc
        FROM public.catalog_items WHERE id = p_catalog_item_id;
    END IF;

    IF p_valor_unit IS NULL THEN
      SELECT COALESCE(custo_material, 0) + COALESCE(custo_mao_obra, 0) INTO v_unit
        FROM public.catalog_items WHERE id = p_catalog_item_id;
    END IF;
  END IF;

  IF p_compra_linha_id IS NOT NULL THEN
    SELECT (l.quantidade - l.ja_atribuido) INTO v_livre
      FROM public.ops_v_compra_linha l
     WHERE l.id = p_compra_linha_id AND l.organization_id = v_o.organization_id;

    IF v_livre IS NULL THEN
      RAISE EXCEPTION 'Essa linha de compra não existe nesta organização.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_qt > v_livre THEN
      RAISE EXCEPTION
        'Dessa compra só sobram % por atribuir, e estás a lançar %.', v_livre, v_qt;
    END IF;

    v_origem := 'compra';

    IF v_desc IS NULL THEN
      SELECT descricao INTO v_desc FROM public.ops_v_compra_linha WHERE id = p_compra_linha_id;
    END IF;

    IF p_valor_unit IS NULL THEN
      SELECT preco_unit INTO v_unit FROM public.ops_v_compra_linha WHERE id = p_compra_linha_id;
    END IF;
  END IF;

  IF v_desc IS NULL THEN
    RAISE EXCEPTION 'Um custo precisa de uma descrição. É o que aparece no mapa de custos.';
  END IF;

  INSERT INTO public.ops_custo (
    ordem_id, tipo, descricao, quantidade, valor_unit, total, unidade,
    origem, catalog_item_id, compra_linha_id, criado_por)
  VALUES (
    p_ordem_id, p_tipo, v_desc, v_qt, v_unit, (v_qt * v_unit)::numeric(12,2),
    nullif(btrim(coalesce(p_unidade, '')), ''),
    v_origem, p_catalog_item_id, p_compra_linha_id, v_user)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id, 'custo_lancado', v_desc, v_user, NULL,
     jsonb_build_object('custo_id', v_id, 'tipo', p_tipo, 'origem', v_origem,
                        'total', (v_qt * v_unit)));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'total', (v_qt * v_unit)::numeric(12,2), 'origem', v_origem);
END
$$;

CREATE OR REPLACE FUNCTION public.rpc_ops_remover_custo(p_custo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_c      record;
  v_o      record;
BEGIN
  SELECT * INTO v_c FROM public.ops_custo WHERE id = p_custo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Custo não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = v_c.ordem_id;
  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_o.organization_id) q;

  IF NOT public.ops_pode(v_o.organization_id, 'operations.costs.view') THEN
    RAISE EXCEPTION 'Sem permissão para mexer em custos.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_c.origem = 'calculado' THEN
    RAISE EXCEPTION
      'Esse custo é calculado das sessões de trabalho. Para o mudar, corrige as sessões ou o custo/hora da pessoa.';
  END IF;

  DELETE FROM public.ops_custo WHERE id = p_custo_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', v_c.ordem_id, 'custo_removido', v_c.descricao, v_user,
     jsonb_build_object('total', v_c.total, 'tipo', v_c.tipo), NULL);

  RETURN jsonb_build_object('ok', true);
END
$$;

-- ── 10.8 Anexos (anexos.sql) ─────────────────────────────────────────────
-- Além da permissão na organização certa: um técnico só anexa às ordens em
-- que está — antes anexava a qualquer ordem da organização cujo id soubesse.
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
    public.ops_pode(v_o.organization_id, 'operations.orders.execute')
    OR public.ops_pode(v_o.organization_id, 'operations.orders.edit')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para anexar ficheiros.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_funcao = 'tecnico' AND NOT (
       COALESCE(v_o.responsavel_id = v_user, false)
       OR EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                   WHERE ordem_id = p_ordem_id AND utilizador_id = v_user)) THEN
    RAISE EXCEPTION 'Só quem está na ordem lhe anexa ficheiros.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado IN ('confirmada','cancelada') THEN
    RAISE EXCEPTION 'Não se anexa a uma ordem % — o processo está encerrado.',
      replace(v_o.estado, '_', ' ');
  END IF;

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

-- ── 10.9 Planos (planos-crud.sql) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_gravar_plano_impl(
  p_plano_id         uuid,
  p_nome             text,
  p_cliente_id       uuid,
  p_tipo_recorrencia text        DEFAULT 'calendario',
  p_regra            text        DEFAULT NULL,
  p_intervalo_horas  integer     DEFAULT NULL,
  p_hora_prevista    time        DEFAULT '09:00',
  p_inicio_em        date        DEFAULT NULL,
  p_fim_em           date        DEFAULT NULL,
  p_responsavel_id   uuid        DEFAULT NULL,
  p_estado           text        DEFAULT 'ativo',
  p_duracao          integer     DEFAULT 0,
  p_alvos            jsonb       DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_org    uuid;
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
  v_codigo text;
  v_id     uuid := p_plano_id;
  v_teste  date;
  v_alvo   jsonb;
  v_n      integer := 0;
  v_criado boolean := (p_plano_id IS NULL);
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um plano precisa de um nome. É por ele que se encontra na lista.';
  END IF;

  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Um plano precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT public.ops_pode(v_org, 'operations.plans.manage') THEN
    RAISE EXCEPTION 'Sem permissão para gerir planos preventivos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo_recorrencia NOT IN ('calendario','dinamica') THEN
    RAISE EXCEPTION 'Tipo de recorrência inválido: %.', p_tipo_recorrencia;
  END IF;

  IF p_estado NOT IN ('ativo','suspenso','terminado') THEN
    RAISE EXCEPTION 'Estado de plano inválido: %.', p_estado;
  END IF;

  IF p_tipo_recorrencia = 'calendario' THEN
    IF nullif(btrim(coalesce(p_regra, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Um plano de calendário precisa de uma regra de recorrência.';
    END IF;

    BEGIN
      SELECT d INTO v_teste
        FROM public.ops_expandir_rrule(
               p_regra,
               COALESCE(p_inicio_em, CURRENT_DATE),
               COALESCE(p_inicio_em, CURRENT_DATE) + 365) d
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Essa regra não é suportada: %', SQLERRM;
    END;

    IF v_teste IS NULL THEN
      RAISE EXCEPTION
        'Essa regra não gera nenhuma data no próximo ano. Confirma o dia e a frequência.';
    END IF;

  ELSE
    IF p_intervalo_horas IS NULL OR p_intervalo_horas <= 0 THEN
      RAISE EXCEPTION 'Um plano dinâmico precisa de um intervalo em horas maior do que zero.';
    END IF;
  END IF;

  IF p_fim_em IS NOT NULL AND p_fim_em < COALESCE(p_inicio_em, CURRENT_DATE) THEN
    RAISE EXCEPTION 'O plano acaba antes de começar.';
  END IF;

  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil
     WHERE utilizador_id = p_responsavel_id AND organization_id = v_org AND ativo) THEN
    RAISE EXCEPTION 'Essa pessoa não está ativa em Operações nesta organização.';
  END IF;

  IF v_criado THEN
    v_codigo := public.ops_proximo_codigo_interno(v_org, 'PLN');

    INSERT INTO public.ops_plano (
      organization_id, codigo, nome, cliente_id, estado, tipo_recorrencia,
      regra_recorrencia, intervalo_horas, hora_prevista, duracao_estimada,
      responsavel_id, inicio_em, fim_em)
    VALUES (
      v_org, v_codigo, v_nome, p_cliente_id, p_estado, p_tipo_recorrencia,
      CASE WHEN p_tipo_recorrencia = 'calendario' THEN p_regra END,
      CASE WHEN p_tipo_recorrencia = 'dinamica' THEN p_intervalo_horas END,
      COALESCE(p_hora_prevista, '09:00'), COALESCE(p_duracao, 0),
      p_responsavel_id, COALESCE(p_inicio_em, CURRENT_DATE), p_fim_em)
    RETURNING id INTO v_id;
  ELSE
    SELECT codigo INTO v_codigo FROM public.ops_plano
     WHERE id = v_id AND organization_id = v_org;
    IF v_codigo IS NULL THEN
      RAISE EXCEPTION 'Plano não encontrado nesta organização.' USING ERRCODE = 'no_data_found';
    END IF;

    UPDATE public.ops_plano SET
      nome              = v_nome,
      cliente_id        = p_cliente_id,
      estado            = p_estado,
      tipo_recorrencia  = p_tipo_recorrencia,
      regra_recorrencia = CASE WHEN p_tipo_recorrencia = 'calendario' THEN p_regra END,
      intervalo_horas   = CASE WHEN p_tipo_recorrencia = 'dinamica' THEN p_intervalo_horas END,
      hora_prevista     = COALESCE(p_hora_prevista, '09:00'),
      duracao_estimada  = COALESCE(p_duracao, 0),
      responsavel_id    = p_responsavel_id,
      inicio_em         = COALESCE(p_inicio_em, inicio_em),
      fim_em            = p_fim_em,
      materializado_ate = NULL,
      atualizado_em     = now()
    WHERE id = v_id;
  END IF;

  IF p_alvos IS NOT NULL THEN
    DELETE FROM public.ops_plano_alvo WHERE plano_id = v_id;

    FOR v_alvo IN SELECT * FROM jsonb_array_elements(p_alvos) LOOP
      IF (v_alvo->>'local_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_local
         WHERE id = (v_alvo->>'local_id')::uuid AND organization_id = v_org) THEN
        RAISE EXCEPTION 'Um dos locais não é desta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF (v_alvo->>'ativo_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_ativo
         WHERE id = (v_alvo->>'ativo_id')::uuid AND organization_id = v_org) THEN
        RAISE EXCEPTION 'Um dos ativos não é desta organização.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      IF (v_alvo->>'checklist_id') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ops_checklist
         WHERE id = (v_alvo->>'checklist_id')::uuid AND organization_id = v_org
           AND estado = 'publicada') THEN
        RAISE EXCEPTION 'Uma das checklists não existe aqui, ou não está publicada.';
      END IF;

      INSERT INTO public.ops_plano_alvo (plano_id, ativo_id, local_id, checklist_id)
      VALUES (
        v_id,
        (v_alvo->>'ativo_id')::uuid,
        (v_alvo->>'local_id')::uuid,
        (v_alvo->>'checklist_id')::uuid);
      v_n := v_n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'plano', v_id, CASE WHEN v_criado THEN 'criado' ELSE 'editado' END,
     v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'tipo', p_tipo_recorrencia,
                        'regra', p_regra, 'alvos', v_n));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'criado', v_criado, 'alvos', v_n);
END
$$;

REVOKE ALL ON FUNCTION public.ops_gravar_plano_impl(
  uuid, text, uuid, text, text, integer, time, date, date, uuid, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ── 10.10 Do orçamento à obra (orcamentos.sql) ───────────────────────────
-- A ordem das verificações mudou. Antes, "Esse orçamento já tem obra: OT-…"
-- vinha ANTES de saber se quem pergunta é da organização — e qualquer pessoa
-- com o id de um orçamento alheio ficava a saber o código da obra.
CREATE OR REPLACE FUNCTION public.ops_obra_de_orcamento_impl(
  p_orcamento_id   uuid,
  p_local_id       uuid        DEFAULT NULL,
  p_checklist_id   uuid        DEFAULT NULL,
  p_agendada_para  timestamptz DEFAULT NULL,
  p_responsavel_id uuid        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid;
  v_funcao   text;
  v_q        record;
  v_codigo   text;
  v_id       uuid;
  v_alvo     uuid;
  v_versao   integer;
  v_linhas   integer := 0;
  v_previsto numeric(12,2) := 0;
BEGIN
  SELECT q.id, q.organization_id, q.cliente_id, q.quote_number, q.title,
         q.obra_endereco, q.obra_notas, q.estado, q.total
    INTO v_q
    FROM public.quotes q
   WHERE q.id = p_orcamento_id AND q.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  -- PRIMEIRO quem és e o que podes, NESTA organização. Só depois se diz
  -- alguma coisa sobre o orçamento.
  SELECT z.utilizador_id, z.funcao INTO v_user, v_funcao
    FROM public.ops_quem_sou(v_q.organization_id) z;

  IF NOT public.ops_pode(v_q.organization_id, 'operations.orders.create') THEN
    RAISE EXCEPTION 'Sem permissão para criar ordens.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_q.estado NOT IN ('aceite','finalizado') THEN
    RAISE EXCEPTION 'Só se põe a andar um orçamento aceite (este está "%").', v_q.estado;
  END IF;

  IF v_q.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Esse orçamento não tem cliente. Sem cliente não há obra a quem entregar.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ops_ordem WHERE orcamento_id = p_orcamento_id) THEN
    RAISE EXCEPTION 'Esse orçamento já tem obra: %.',
      (SELECT codigo FROM public.ops_ordem WHERE orcamento_id = p_orcamento_id LIMIT 1);
  END IF;

  IF p_local_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local
     WHERE id = p_local_id AND organization_id = v_q.organization_id) THEN
    RAISE EXCEPTION 'Esse local não é desta organização.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_codigo := public.ops_proximo_codigo_interno(v_q.organization_id, 'OT');

  INSERT INTO public.ops_ordem (
    organization_id, codigo, origem, estado, prioridade,
    cliente_id, local_id, titulo, descricao,
    agendada_para, responsavel_id, orcamento_id, criada_por
  ) VALUES (
    v_q.organization_id, v_codigo, 'obra',
    CASE WHEN v_funcao = 'tecnico' THEN 'por_aprovar' ELSE 'agendada' END,
    'normal',
    v_q.cliente_id, p_local_id,
    COALESCE(nullif(btrim(v_q.title), ''), 'Obra ' || COALESCE(v_q.quote_number, '')),
    nullif(btrim(concat_ws(E'\n',
      CASE WHEN v_q.quote_number IS NOT NULL THEN 'Orçamento ' || v_q.quote_number END,
      nullif(btrim(coalesce(v_q.obra_endereco, '')), ''),
      nullif(btrim(coalesce(v_q.obra_notas, '')), '')
    )), ''),
    p_agendada_para, p_responsavel_id, p_orcamento_id, v_user
  ) RETURNING id INTO v_id;

  INSERT INTO public.ops_ordem_previsto (
    ordem_id, quote_line_id, catalog_item_id, posicao, categoria, descricao,
    unidade, quantidade, custo_material, custo_mao_obra, total_sem_iva)
  SELECT
    v_id, l.id, l.catalog_item_id, COALESCE(l.ordem, 0), l.categoria,
    COALESCE(nullif(btrim(l.item_description), ''),
             nullif(btrim(l.descricao_snapshot), ''),
             'Linha sem descrição'),
    l.unidade,
    COALESCE(l.qt, 1),
    COALESCE(l.custo_material_unit, 0),
    COALESCE(l.custo_mao_obra_unit, 0),
    ((COALESCE(l.custo_material_unit, 0) + COALESCE(l.custo_mao_obra_unit, 0))
     * COALESCE(l.qt, 1))::numeric(12,2)
    FROM public.quote_lines l
   WHERE l.quote_id = p_orcamento_id
   ORDER BY COALESCE(l.ordem, 0);

  GET DIAGNOSTICS v_linhas = ROW_COUNT;

  SELECT COALESCE(sum(total_sem_iva), 0) INTO v_previsto
    FROM public.ops_ordem_previsto WHERE ordem_id = v_id;

  IF p_local_id IS NOT NULL OR p_checklist_id IS NOT NULL THEN
    SELECT versao INTO v_versao FROM public.ops_checklist WHERE id = p_checklist_id;

    INSERT INTO public.ops_ordem_alvo
      (ordem_id, local_id, checklist_id, checklist_versao, posicao)
    VALUES (v_id, p_local_id, p_checklist_id, v_versao, 0)
    RETURNING id INTO v_alvo;

    IF p_checklist_id IS NOT NULL THEN
      INSERT INTO public.ops_ordem_tarefa (
        ordem_id, ordem_alvo_id, checklist_tarefa_id, posicao, codigo, nome,
        tipo, skill_id, privada, obrigatoria, tempo_estimado)
      SELECT v_id, v_alvo, ct.id, ct.posicao, ct.codigo, ct.nome, ct.tipo,
             ct.skill_id, ct.privada, ct.obrigatoria, ct.tempo_estimado
        FROM public.ops_checklist_tarefa ct
       WHERE ct.checklist_id = p_checklist_id
       ORDER BY ct.posicao;

      INSERT INTO public.ops_ordem_tarefa_medicao (
        ordem_tarefa_id, medicao_def_id, nome, tipo, unidade, limite_min, limite_max)
      SELECT ot.id, md.id, md.nome, md.tipo, md.unidade, md.limite_min, md.limite_max
        FROM public.ops_ordem_tarefa ot
        JOIN public.ops_checklist_tarefa_medicao ctm
          ON ctm.checklist_tarefa_id = ot.checklist_tarefa_id
        JOIN public.ops_medicao_def md ON md.id = ctm.medicao_def_id
       WHERE ot.ordem_id = v_id
      ON CONFLICT (ordem_tarefa_id, medicao_def_id) DO NOTHING;
    END IF;
  END IF;

  IF p_responsavel_id IS NOT NULL THEN
    INSERT INTO public.ops_ordem_pessoa (ordem_id, utilizador_id, papel)
    VALUES (v_id, p_responsavel_id, 'responsavel')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_q.organization_id, 'ordem', v_id, 'criada_de_orcamento',
     'Orçamento ' || COALESCE(v_q.quote_number, '—'), v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'orcamento_id', p_orcamento_id,
                        'linhas', v_linhas, 'custo_previsto', v_previsto));

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'codigo', v_codigo,
    'linhas', v_linhas,
    'custo_previsto', v_previsto
  );
END
$$;

REVOKE ALL ON FUNCTION public.ops_obra_de_orcamento_impl(uuid, uuid, uuid, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated;

-- ── 10.11 Locais (cliente-crm.sql) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_ops_criar_local(
  p_cliente_id uuid,
  p_nome       text    DEFAULT NULL,
  p_tipo       text    DEFAULT 'morada',
  p_parent_id  uuid    DEFAULT NULL,
  p_address_id uuid    DEFAULT NULL,
  p_morada     text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid;
  v_funcao text;
  v_org    uuid;
  v_nome   text := nullif(btrim(coalesce(p_nome, '')), '');
  v_codigo text;
  v_id     uuid;
  v_m      record;
  v_morada text := nullif(btrim(coalesce(p_morada, '')), '');
  v_cidade text;
  v_cp     text;
BEGIN
  IF p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Um local precisa de um cliente.';
  END IF;

  SELECT organization_id INTO v_org FROM public.anew_clients WHERE id = p_cliente_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT q.utilizador_id, q.funcao INTO v_user, v_funcao FROM public.ops_quem_sou(v_org) q;

  IF NOT public.ops_pode(v_org, 'operations.locations.manage') THEN
    RAISE EXCEPTION 'Sem permissão para criar locais.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_tipo NOT IN ('morada','edificio','piso','espaco') THEN
    RAISE EXCEPTION 'Tipo de local inválido: %.', p_tipo;
  END IF;

  IF p_parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ops_local WHERE id = p_parent_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Esse local-pai não é desta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_address_id IS NOT NULL THEN
    SELECT * INTO v_m FROM public.ops_v_morada_cliente
     WHERE address_id = p_address_id AND cliente_id = p_cliente_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Essa morada não é deste cliente.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_m.ja_e_local THEN
      SELECT id, codigo, nome INTO v_id, v_codigo, v_nome
        FROM public.ops_local
       WHERE address_id = p_address_id AND cliente_id = p_cliente_id
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true, 'id', v_id, 'codigo', v_codigo, 'nome', v_nome, 'ja_existia', true);
    END IF;

    IF v_nome IS NULL THEN
      v_nome := COALESCE(
        nullif(btrim(concat_ws(' ', v_m.street, v_m.number,
                               nullif(v_m.floor, ''), nullif(v_m.unit, ''))), ''),
        v_m.morada,
        'Local sem nome');
    END IF;

    v_morada := COALESCE(v_morada, v_m.morada);
    v_cidade := v_m.city;
    v_cp     := v_m.postal_code;
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Um local precisa de um nome. É por ele que se encontra na lista.';
  END IF;

  v_codigo := public.ops_proximo_codigo_interno(v_org, 'LOC');

  INSERT INTO public.ops_local (
    organization_id, cliente_id, parent_id, codigo, nome, tipo,
    morada, cidade, cod_postal, address_id)
  VALUES (
    v_org, p_cliente_id, p_parent_id, v_codigo, v_nome, p_tipo,
    v_morada, v_cidade, v_cp, p_address_id)
  RETURNING id INTO v_id;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_org, 'local', v_id, 'criado', v_nome, v_user, NULL,
     jsonb_build_object('codigo', v_codigo, 'tipo', p_tipo,
                        'da_morada_do_crm', p_address_id IS NOT NULL));

  RETURN jsonb_build_object(
    'ok', true, 'id', v_id, 'codigo', v_codigo, 'nome', v_nome, 'ja_existia', false);
END
$$;


-- ============================================================
-- 11. Verificação
-- ============================================================
-- Nenhuma policy destas tabelas pode voltar a usar `has_anew_permission`
-- sozinha: tudo passa por `ops_pode`. As tabelas de outros ficheiros mais
-- recentes (obras.sql) têm o seu próprio validador.

DO $verificar$
DECLARE
  v_mas    text;
  v_n      integer;
  v_tabelas constant text[] := ARRAY[
    'ops_utilizador_perfil','ops_utilizador_cliente','ops_local','ops_categoria_ativo',
    'ops_ativo','ops_checklist','ops_checklist_tarefa','ops_plano','ops_plano_alvo',
    'ops_ordem','ops_ordem_alvo','ops_ordem_tarefa','ops_ordem_pessoa',
    'ops_sessao_trabalho','ops_custo','ops_anexo','ops_mensagem','ops_evento',
    'ops_skill','ops_utilizador_skill','ops_horario','ops_medicao_def',
    'ops_medicao_opcao','ops_checklist_tarefa_medicao','ops_ordem_tarefa_medicao',
    'ops_ordem_previsto'];
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_mas
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = ANY (v_tabelas)
     AND (coalesce(qual, '') LIKE '%has_anew_permission%'
          OR coalesce(with_check, '') LIKE '%has_anew_permission%');
  IF v_mas IS NOT NULL THEN
    RAISE EXCEPTION 'Policies ainda com has_anew_permission global: %', v_mas;
  END IF;

  SELECT count(*) INTO v_n FROM unnest(v_tabelas) t
   WHERE has_table_privilege('authenticated', 'public.' || t, 'INSERT')
     AND t IN ('ops_ordem','ops_ordem_pessoa','ops_custo','ops_utilizador_perfil','ops_evento');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'authenticated ainda escreve diretamente em % tabela(s) que só as RPCs escrevem.', v_n;
  END IF;

  IF has_function_privilege('authenticated', 'public.ops_recalcular_custo_mao_obra(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated',
          'public.ops_conflitos_de_agenda(uuid,timestamptz,timestamptz,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Funções internas continuam ao alcance de authenticated.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ops_utilizador_perfil_funcao_check'
       AND pg_get_constraintdef(oid) LIKE '%supervisor%') THEN
    RAISE EXCEPTION 'A função supervisor não ficou aceite em ops_utilizador_perfil.';
  END IF;

  RAISE NOTICE 'Segurança: policies e RPCs por organização, escritas diretas fechadas, supervisor aceite.';
END
$verificar$;

COMMIT;
