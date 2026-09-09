-- ============================================================================
-- Leads e clientes: o ambito passa a valer tambem na leitura directa da tabela.
--
-- POR APLICAR. Esta migracao NAO foi empurrada para o remoto quando foi
-- escrita (2026-09-06). Ler a seccao "ANTES DO db push", no fim do ficheiro,
-- antes de a aplicar.
--
--
-- -- A LACUNA -----------------------------------------------------------------
--
-- O ambito (ORG / TEAM / OWNED) das leads e dos clientes ja era aplicado no
-- caminho normal da aplicacao: o ecra chama a RPC get_scoped_leads_base, e la
-- dentro o filtro usa o applied_scope que o SERVIDOR resolve por
-- resolve_lead_access_context -- nao o p_scope que o cliente manda. O ecra de
-- Clientes filtra do lado do cliente (buildContactScopeOrFilter,
-- src/lib/contacts/scope.ts). Ambos estao correctos.
--
-- O que faltava era a LEITURA DIRECTA DA TABELA. As politicas de anew_leads e
-- anew_clients isolavam so por ORGANIZACAO. Medido ao vivo na nike
-- (b6ffce4f-f630-4933-833a-008649757a33) a 2026-09-06, contra o remoto, com as
-- contas de teste teste-scope-*@example.com:
--
--     conta                        anew_leads   anew_clients
--     admin (ORG)                        382            97
--     teste-scope-membro (OWNED)         382            97   <-- devia ver 9 e 2
--     teste-scope-team-leader (TEAM)     382            97
--
-- Ou seja: pela aplicacao um comercial via so as suas fichas; tirando o token
-- da sessao e chamando a API do PostgREST directamente, via as de todos os
-- colegas da mesma empresa. Nao e fuga entre organizacoes diferentes -- e
-- dentro da mesma organizacao, entre comerciais. E nao era so leitura:
-- anew_leads_update e anew_leads_delete isolavam igualmente so por
-- organizacao, portanto com leads.edit editava-se e apagava-se a ficha de um
-- colega.
--
-- O padrao correcto ja existia no projecto para os contactos
-- (anew_contacts_select, 20260619090000) e para as submissoes de formulario
-- (form_submissions_select_org, 20261116090000). As leads e os clientes e que
-- ficaram de fora.
--
--
-- -- PORQUE NAO SE COPIA O PADRAO DE anew_contacts -----------------------------
--
-- anew_contacts_select chama can_access_contact_row(organization_id,
-- created_by, assigned_to, 'contacts.view'). Passar COLUNAS DA LINHA a uma
-- funcao plpgsql obriga o planeador a executa-la uma vez POR LINHA: uma qual
-- de RLS sem qualquer Var (sem referencia a colunas) e pseudoconstante e vira
-- one-time filter; assim que a expressao contem uma coluna, deixa de o ser. E
-- uma funcao plpgsql e uma caixa negra -- nao e inlineavel nem icavel para
-- fora do laco, mesmo declarada STABLE, porque os argumentos mudam de linha
-- para linha. E exactamente o que 20261112470000 ja tinha escrito sobre
-- is_entity_in_user_scope.
--
-- Medido na Mudelar, como admin, mediana de 5 execucoes de um count exact:
--
--     anew_contacts  1644 linhas, COM a funcao por linha .......  2147 ms
--     anew_leads     5983 linhas, SEM ela .....................    833 ms
--     declive: 0,74 ms/linha  contra  0,13 ms/linha
--
-- Colada tal e qual em anew_leads, essa forma acrescentaria cerca de
-- 0,6 ms x 5983 = ~4 segundos a qualquer leitura da tabela inteira na
-- Mudelar. Inaceitavel. (Em anew_clients seria irrelevante -- 179 linhas na
-- maior organizacao -- mas usa-se a mesma forma nas duas, para nao haver dois
-- padroes a manter.)
--
--
-- -- A FORMA QUE SE USA AQUI ---------------------------------------------------
--
-- crm_scope_keys() NAO recebe nada da linha: so o codigo de permissao, que na
-- politica e uma constante. Devolve um text[] com uma chave por par
-- (organizacao, dono) que o chamador pode ver:
--
--     ambito ORG numa organizacao  ->  <org>:*
--     ambito TEAM ou OWNED         ->  <org>:<dono>, um por cada id de dono
--
-- Sendo um subquery escalar SEM correlacao, o PostgreSQL anexa-o como InitPlan
-- no topo do plano: executa UMA vez por consulta, guarda o text[] num Param, e
-- todos os nos abaixo leem o Param ja calculado -- seja qual for o numero de
-- linhas. E o mesmo mecanismo do idioma get_user_crm_org_ids((SELECT
-- auth.uid())) ja usado centenas de vezes neste repositorio.
--
-- O array e referido UMA SO VEZ no texto de cada politica, dentro de um
-- EXISTS sobre unnest(). Isto e deliberado: o PostgreSQL nao faz eliminacao de
-- subexpressoes comuns entre subqueries escalares identicos, portanto escrever
-- "= ANY((SELECT crm_scope_keys(...)))" tres vezes (uma por ramo ORG /
-- assigned_to / created_by) geraria TRES InitPlans e tres resolucoes de
-- contexto por consulta.
--
-- Por linha sobra: tres uuid::text, tres concatenacoes e uma varredura linear
-- de um array pequeno. Ordem de 1-3 us/linha, ~10-20 ms nas 5983 leads da
-- Mudelar.
--
-- E crm_scope_keys custa O(numero de organizacoes do utilizador), nao
-- O(numero de linhas): 671 dos 681 utilizadores com membership activa tem
-- exactamente uma, logo uma resolucao; o maximo medido e 20 organizacoes num
-- unico utilizador, logo 20 resolucoes -- uma vez, por consulta.
--
-- HONESTIDADE SOBRE ESTES NUMEROS: os ~10-20 ms sao previsao, nao medicao.
-- Vem de raciocinio sobre o planeador mais aritmetica a partir do declive
-- medido em anew_contacts. Nao foi corrido EXPLAIN ANALYZE -- nao ha
-- service_role nesta maquina e a base local esta proibida. A medicao decisiva
-- esta no plano de verificacao no fim do ficheiro.
--
--
-- -- CHAVE COMPOSTA "org:dono", E NAO DOIS ARRAYS SEPARADOS --------------------
--
-- Dois arrays (organizacoes com ambito ORG, e ids de dono) juntariam os donos
-- de organizacoes diferentes: quem tem TEAM na org A e OWNED na org B passaria
-- a ver, em B, fichas dos colegas de equipa de A. Medido: 10 dos 671
-- utilizadores com membership activa pertencem a mais de uma organizacao (o
-- maior, a 20). E pouco, mas isto e uma politica de seguranca; a chave
-- composta mantem a exactidao e custa uma concatenacao por linha.
--
--
-- -- RESOLVENTE: resolve_lead_access_context PARA AS DUAS TABELAS -------------
--
-- Com o p_permission_code respectivo ('leads.view', 'clients.view', ...). NAO
-- resolve_contact_access_context: essa ainda valida a organizacao por
-- get_user_visible_org_ids (alargamento hierarquico) e da a super_admin
-- ancestrais e associadas, e foi precisamente isso que 20260927010000 retirou
-- das sete tabelas do CRM ao trocar para get_user_crm_org_ids. Usa-la aqui
-- reintroduziria pela porta das traseiras o alargamento que ja foi fechado.
--
--
-- -- IDS DE DONO: OS DOIS, COMO NA RPC ----------------------------------------
--
-- Emitem-se chaves para anew_users.id E para auth.users.id, como faz
-- get_scoped_leads_base (20260618150000, "Supports legacy rows whose
-- created_by contains auth.users.id"), e ao contrario de
-- can_access_contact_row, que so olha para anew_users.id. Sem isto, uma ficha
-- de legado desaparecia ao proprio dono na leitura directa enquanto continuava
-- a aparecer pela RPC -- duas respostas diferentes para a mesma pergunta.
-- (Contado a 2026-09-06: 0 em 6365 fichas de nike e Mudelar tem um id de auth
-- nestas colunas. O ramo fica pela simetria com a RPC; custa zero.)
--
--
-- -- AS RPCs NAO PAGAM ISTO DUAS VEZES ----------------------------------------
--
-- get_scoped_leads_base, get_lead_dashboard_stats_scoped,
-- rpc_client_contract_stats e rpc_client_origin_distribution sao STABLE
-- SECURITY DEFINER e, como o proprio repositorio documenta em dois sitios
-- independentes -- 20261112470000 ("SECURITY DEFINER ... contornando o RLS
-- dessas tabelas") e 20261112380000 ("SECURITY DEFINER bypasses RLS
-- entirely", que e a razao de essas RPCs re-verificarem tudo a mao) -- o RLS
-- nao se lhes aplica. O ecra de Leads e os dashboards de leads/clientes nao
-- abrandam com esta migracao. O que abranda (uns milissegundos) e passa a
-- filtrar e a leitura directa da tabela, que e exactamente o que se quer
-- travar. As Edge Functions tambem nao mudam: as 26 que tocam
-- anew_leads/anew_clients constroem o cliente com SUPABASE_SERVICE_ROLE_KEY.
--
--
-- -- ALCANCE: SELECT, UPDATE (SO O USING) E DELETE -----------------------------
--
-- O WITH CHECK do UPDATE e a politica de INSERT ficam INTACTOS, de proposito.
-- 2056 das 5983 leads da Mudelar (34%) e 170 das 382 da nike (44%) tem
-- created_by E assigned_to a nulo; por o ambito no WITH CHECK faria um
-- comercial OWNED deixar de poder reatribuir a sua propria ficha a um colega,
-- porque a linha resultante ja nao teria nenhuma chave sua -- partia-se a
-- reatribuicao, que e funcionalidade legitima. O USING sozinho fecha a falha:
-- nao se altera nem se apaga o que nao se ve.
--
-- (ALTER POLICY so com USING nao mexe no WITH CHECK -- e o que 20260927010000
-- fez a anew_clients_update e 20260928010000 depois corrigiu em separado.)
--
--
-- -- O QUE NAO ENTRA NESTA MIGRACAO --------------------------------------------
--
-- deals, proposals, quotes, client_contracts, entity_interactions,
-- proposal_sends e email_logs. Estao igualmente abertas, mas quatro delas nao
-- verificam sequer permissao hoje, portanto fecha-las muda o que veem contas
-- que actualmente veem tudo sem permissao nenhuma -- risco de partir ecras
-- muito superior ao destas duas. Vao numa segunda migracao, depois de esta
-- provar o custo na Mudelar.
--
-- E UM BURACO QUE FICA ABERTO, a assinalar por escrito: anew_entity_emails e
-- anew_entity_phones. As suas politicas sao is_entity_in_user_scope(entity_id,
-- auth.uid()), que e SECURITY DEFINER e da acesso a entidade se QUALQUER
-- lead/cliente/contacto com esse entity_id estiver numa organizacao visivel --
-- sem ambito nenhum. Sendo SECURITY DEFINER, esta migracao nao a estreita.
-- Depois desta correccao o comercial OWNED deixa de ver a ficha da lead do
-- colega, mas continua a poder chegar ao email e ao telefone do contacto dessa
-- lead. Tem de ir na mesma segunda migracao.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- A reversao ja esta escrita, ao lado deste ficheiro, e tambem por aplicar:
--
--     supabase/migrations/20261118040000_reverter_ambito_leads_clientes.sql
--
-- Repoe as seis politicas no texto EXACTO de 20260927010000 e 20260928010000,
-- por migracao para a frente, nunca por edicao desta. Nao apaga
-- crm_scope_keys: fica orfa e inofensiva (STABLE, nao escreve nada, ninguem a
-- chama), e mante-la evita ter de a recriar para voltar a tentar.
--
-- Gatilho decidido de antemao, para nao se discutir no momento: se o count
-- exact em anew_leads na Mudelar, medido logo a seguir ao push com o mesmo
-- metodo da baseline, passar de ~1,5 s. Ou se qualquer conta com ambito ORG
-- deixar de ver alguma linha que via antes -- isso seria bug, nao aperto, e
-- nao se depura em producao.
--
-- Duas mitigacoes mais brandas, a tentar antes da reversao total se o problema
-- for so de velocidade:
--   1. Reverter so anew_leads e deixar anew_clients corrigida. Os clientes sao
--      poucos em todo o lado (maximo 179 numa organizacao); toda a
--      preocupacao de desempenho e das 5983 leads da Mudelar. Salva metade da
--      correccao.
--   2. Se a lentidao vier de crm_scope_keys e nao da comparacao por linha
--      (sintoma: consultas de POUCAS linhas tambem ficam lentas, nao so as
--      contagens completas), o custo esta nas resolucoes por organizacao e a
--      saida e reescrever crm_scope_keys sem o laco, apurando os ambitos de
--      todas as organizacoes num unico conjunto de consultas.
-- ============================================================================


-- -- 1. A funcao de ambito: uma execucao por consulta, nenhuma por linha ------
CREATE OR REPLACE FUNCTION public.crm_scope_keys(p_permission_code text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid      uuid := auth.uid();
  v_org_ids       uuid[];
  v_org_id        uuid;
  v_applied_scope text;
  v_anew_user_id  uuid;
  v_ctx_auth_uid  uuid;
  v_team_user_ids uuid[];
  v_owner         uuid;
  v_keys          text[] := ARRAY[]::text[];
BEGIN
  IF v_auth_uid IS NULL OR p_permission_code IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT o
    FROM public.get_user_crm_org_ids(v_auth_uid) AS o
  )
  INTO v_org_ids;

  FOREACH v_org_id IN ARRAY COALESCE(v_org_ids, ARRAY[]::uuid[])
  LOOP
    v_applied_scope := NULL;
    v_anew_user_id  := NULL;
    v_ctx_auth_uid  := NULL;
    v_team_user_ids := NULL;

    -- resolve_lead_access_context levanta excepcao quando o utilizador nao tem
    -- a permissao nesta organizacao, ou quando a organizacao nao lhe e
    -- visivel. Nesse caso a organizacao simplesmente nao contribui chaves.
    BEGIN
      SELECT r.applied_scope, r.anew_user_id, r.auth_user_id, r.team_user_ids
      INTO   v_applied_scope, v_anew_user_id, v_ctx_auth_uid, v_team_user_ids
      FROM   public.resolve_lead_access_context(v_org_id, 'ORG', p_permission_code) r;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_applied_scope = 'ORG' THEN
      v_keys := v_keys || (v_org_id::text || ':*');
    ELSE
      -- TEAM: a equipa que o utilizador lidera, mais ele proprio.
      -- OWNED: so ele proprio.
      -- Os dois ids (anew_users.id e auth.users.id) entram, tal como em
      -- get_scoped_leads_base, por causa das fichas de legado.
      FOREACH v_owner IN ARRAY (
        CASE
          WHEN v_applied_scope = 'TEAM'
            THEN COALESCE(v_team_user_ids, ARRAY[]::uuid[])
          ELSE ARRAY[]::uuid[]
        END
        || ARRAY[v_anew_user_id, v_ctx_auth_uid]
      )
      LOOP
        IF v_owner IS NOT NULL THEN
          v_keys := v_keys || (v_org_id::text || ':' || v_owner::text);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN ARRAY(SELECT DISTINCT k FROM unnest(v_keys) AS k);
END;
$function$;

COMMENT ON FUNCTION public.crm_scope_keys(text) IS
  'Chaves organizacao:dono (ou organizacao:* quando o ambito e ORG) que o utilizador autenticado pode ver para uma permissao. NAO recebe colunas da linha, de proposito: chamada num subquery escalar dentro de uma politica RLS, e avaliada como InitPlan -- uma vez por consulta, nao uma vez por linha. Espelha get_scoped_leads_base, incluindo os ids de dono de legado.';

REVOKE ALL ON FUNCTION public.crm_scope_keys(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_scope_keys(text) TO authenticated, service_role;


-- -- 2. anew_leads ------------------------------------------------------------
ALTER POLICY anew_leads_select ON public.anew_leads
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'leads.view'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('leads.view'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_leads.organization_id::text || ':*'
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.assigned_to::text
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.created_by::text
    )
  );

ALTER POLICY anew_leads_update ON public.anew_leads
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'leads.edit'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('leads.edit'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_leads.organization_id::text || ':*'
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.assigned_to::text
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.created_by::text
    )
  );
-- WITH CHECK de anew_leads_update deliberadamente NAO alterado (ver cabecalho).

ALTER POLICY anew_leads_delete ON public.anew_leads
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'leads.delete'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('leads.delete'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_leads.organization_id::text || ':*'
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.assigned_to::text
         OR k.scope_key = anew_leads.organization_id::text || ':' || anew_leads.created_by::text
    )
  );

COMMENT ON POLICY anew_leads_select ON public.anew_leads IS
  'Organizacao + permissao leads.view + AMBITO ORG/TEAM/OWNED, resolvido uma vez por consulta via crm_scope_keys. Antes desta politica a leitura directa da tabela devolvia as leads de todos os colegas da organizacao (382 contra as 9 proprias, medido na nike a 2026-09-06).';


-- -- 3. anew_clients ----------------------------------------------------------
ALTER POLICY anew_clients_select ON public.anew_clients
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'clients.view'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('clients.view'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_clients.organization_id::text || ':*'
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.assigned_to::text
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.created_by::text
    )
  );

ALTER POLICY anew_clients_update ON public.anew_clients
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'clients.edit'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('clients.edit'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_clients.organization_id::text || ':*'
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.assigned_to::text
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.created_by::text
    )
  );
-- WITH CHECK de anew_clients_update (20260928010000) deliberadamente NAO alterado.

ALTER POLICY anew_clients_delete ON public.anew_clients
  USING (
    public.has_anew_permission((SELECT auth.uid()), 'clients.delete'::text)
    AND organization_id IN (SELECT public.get_user_crm_org_ids((SELECT auth.uid())))
    AND EXISTS (
      SELECT 1
      FROM unnest((SELECT public.crm_scope_keys('clients.delete'::text))) AS k(scope_key)
      WHERE k.scope_key = anew_clients.organization_id::text || ':*'
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.assigned_to::text
         OR k.scope_key = anew_clients.organization_id::text || ':' || anew_clients.created_by::text
    )
  );

COMMENT ON POLICY anew_clients_select ON public.anew_clients IS
  'Organizacao + permissao clients.view + AMBITO ORG/TEAM/OWNED, resolvido uma vez por consulta via crm_scope_keys. Espelha o filtro que AnewClients.tsx ja aplica do lado do cliente (buildContactScopeOrFilter): a partir daqui o RLS deixa de ser contornavel chamando a API directamente.';


-- ============================================================================
-- ANTES DO db push (por esta ordem, e nenhum destes passos e opcional):
--
-- 1. Confirmar por introspeccao (pg_policies) que as politicas no remoto tem
--    mesmo o texto de 20260927010000 / 20260928010000, e que nao existe
--    nenhuma OUTRA politica PERMISSIVA de SELECT nestas duas tabelas --
--    politicas permissivas somam-se por OR, e uma que nao esteja no
--    repositorio anularia esta correccao sem dar erro nenhum. O CLAUDE.md
--    avisa que ja houve sete migrations aplicadas sem ficheiro.
-- 2. Correr, contra o remoto AINDA POR CORRIGIR, o teste que demonstra a
--    falha: teste-scope-membro@example.com conta 382 leads e 97 clientes na
--    nike. E agora que se colhe o vermelho -- depois do push a oportunidade
--    passou e NAO se volta atras para o demonstrar.
-- 3. Medir a baseline de desempenho na Mudelar como admin: count exact em
--    anew_leads (833 ms de mediana) e em anew_contacts (2147 ms).
-- 4. db push. Repetir 2 e 3. Esperado: o membro passa a 9 leads e 2 clientes
--    (as suas), o admin continua nos 382/97, e o count exact da Mudelar fica
--    abaixo de ~1 s. Acima de ~1,5 s, aplicar a migracao de reversao.
-- 5. Conferir a interaccao com form_submissions_select_org (20261116090000),
--    que tem um EXISTS sobre estas duas tabelas e passa a estar sujeito a
--    estas politicas: o membro OWNED ve hoje 3 de 18 submissoes e tem de
--    continuar a ver 3.
-- 6. A mao, no browser: um utilizador com quotes.view ORG mas leads.view
--    OWNED a abrir um orcamento cuja lead e de outro comercial. Varios sitios
--    (src/utils/quotes/resolveQuoteAssignedTo.ts, src/components/QuoteBuilder.tsx,
--    src/components/contracts/contractDocument.ts, src/utils/emailTemplateVariables.ts)
--    fazem .maybeSingle() sobre a ficha e nao distinguem "nao existe" de "nao
--    posso ver" -- o documento pode ficar sem nome de cliente EM SILENCIO.
-- ============================================================================
