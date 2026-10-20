-- ============================================================
-- 20261225150000_neg_pessoas_campos_lista_ficha
-- ============================================================
-- O que faz: a página Pessoas passa a receber da base a informação que já
--   existe e hoje não chega à UI, e a Lista ganha pesquisa e filtros no
--   servidor. Só leitura: nada é escrito.
--   - neg_resumo_pessoas (Lista): RETORNO NOVO e PARÂMETROS NOVOS. A antiga
--     (8 parâmetros) é largada (DROP) e a nova criada nesta mesma transacção:
--     o PostgREST fica só com uma. Os 8 parâmetros antigos ficam iguais e na
--     mesma ordem; as colunas antigas ficam iguais e na mesma ordem.
--     Parâmetros novos, todos opcionais e com omissão NULL (sem eles, a Lista
--     devolve as mesmas pessoas, pela mesma ordem e com as mesmas chaves):
--       p_atribuido_a uuid      COALESCE(cliente.assigned_to, lead.assigned_to),
--                               o mesmo que a coluna assigned_to. «Só as minhas»
--                               é este parâmetro com o anew_users.id da sessão.
--       p_formulario_id uuid    o formulário da campanha da lead mostrada (a
--                               coluna formulario_id). Como o filtro de
--                               campanha das Leads (AnewLeads.tsx:347, igualdade
--                               a campaign_id): só um valor; uma lead sem
--                               campanha, ou com a campanha sem formulário,
--                               não aparece com o filtro ligado. Não há opção
--                               «Manual» (as Leads também não têm).
--       p_ultimo_resultado text a coluna ultimo_resultado: os cinco valores
--                               de neg_registar_contacto, ou 'semContacto'
--                               (nenhum contacto em NENHUMA das duas fontes);
--                               outro valor dá NG009. Um resultado de outro
--                               tipo (ids de lead_contact_results, «answered»,
--                               «whatsapp_sent») só aparece sem este filtro.
--       p_voltou boolean        a coluna voltou_a_contactar (true ou false).
--       p_atrasada boolean      a coluna atrasada (true ou false).
--     Os filtros calculam-se UMA vez por chamada, como conjunto de pessoas da
--     organização (como já fazia p_etapa), com a mesma lead e o mesmo cliente
--     que a linha mostra e as mesmas expressões das colunas; a paginação
--     continua por chave estável (recentes: list_sort_at e entity_id; nome:
--     nome e entity_id).
--     OTIMIZAÇÃO A+B (decisão do utilizador, 20/10):
--     A. sem «atrasada», o conjunto vem da auxiliar NOVA fn_neg_filtro_pessoas
--        (abaixo), sem a RLS por linha, com as mesmas regras de acesso; se a
--        auxiliar não se aplicar (devolve NULL: administrador de sistema, sem
--        chaves de âmbito, organização não visível, erro) o conjunto calcula-se
--        como antes, pela RLS. «atrasada» usa sempre o caminho pela RLS.
--     B. com um conjunto de até 200 pessoas, a Lista parte desse conjunto (uma
--        sonda por pessoa) em vez de percorrer as leads e os clientes da
--        organização; as mesmas condições, ordem e chave de página.
--     Igualdade medida a 20/10 (nike, só leitura): a Lista de antes (sem A+B)
--     e a de agora dão as mesmas linhas, pela mesma ordem e com a mesma chave,
--     em 10 combinações de filtros x 2 ordens x 3 páginas de 10, para três
--     utilizadores (âmbito de organização, de equipa e só os seus): 0
--     diferenças em 60 casos; e o conjunto da auxiliar igual ao da RLS em 143
--     combinações de filtros para cinco utilizadores: 0 a mais, 0 a menos.
--     PESQUISA (p_pesquisa, 2 a 200 caracteres): além do nome, passa a
--     encontrar o email (contém, sem maiúsculas), o telefone (só quando a
--     pesquisa é um número com 7 ou mais algarismos: um número termina no
--     outro, a regra de find_entity_matches). A localidade NÃO entra
--     (decisão do utilizador, 20/10). O nome, o email e o telefone
--     procuram-se UMA vez por chamada, pela auxiliar NOVA
--     fn_neg_pesquisa_pessoas (abaixo), com o âmbito da página. Sem acentos:
--     como hoje, a pesquisa distingue «Évora» de «Evora».
--     Colunas novas, no fim:
--       criado_em            LEAST(min(created_at) das leads vivas, created_at
--                            do cliente mostrado): a regra de 'desde' da ficha
--       qualificacao_tipo    anew_leads.qualification_type (mql | sql | null)
--       ultima_atividade_em  anew_leads.last_activity_at
--       ultimo_contacto_lead_em anew_leads.last_contact_at
--       voltou_a_contactar   a regra de hasUnansweredReturn das Leads
--                            (LeadTableRow.tsx:64-75): last_activity_at
--                            mais recente do que o último contacto, ou
--                            ninguém contactou; o último contacto é o MAIOR
--                            entre last_contact_at e a última chamada
--                            registada (ultimo_contacto_em, entity_interactions
--                            'call', onde escreve neg_registar_contacto). Assim
--                            o aviso apaga-se ao registar o contacto em Pessoas.
--       origem, origem_detalhe anew_leads.source e anew_leads.origin
--       campanha_id, campanha  anew_leads.campaign_id e campaigns.name
--       formulario_id, formulario forms (pela campanha), como na ficha
--       ultimo_resultado     o resultado do contacto MAIS RECENTE entre duas
--                            fontes: a última chamada registada
--                            (entity_interactions 'call', funções neg_*) e o
--                            último contacto guardado na lead mostrada pela
--                            página de Leads (last_contact_at e
--                            last_contact_result: LeadTableRow.tsx:190-219,
--                            AnewLeads.tsx:4739); em empate, a chamada. O
--                            valor é o que a fonte guarda (nas Leads, o id de
--                            lead_contact_results ou um texto livre): fora dos
--                            cinco de neg_registar_contacto, a UI mostra
--                            «outro». «Sem contacto» = ultimo_contacto_em e
--                            ultimo_contacto_lead_em ambos nulos. A ficha
--                            (agregados.ultimo_resultado) não muda.
--       atrasada             a regra do protótipo (src/components/pessoas/
--                            etapaPessoa.ts:196-202, estaAtrasadaRegistos):
--                            uma LEAD (sem cliente) não encerrada cujo próximo
--                            contacto é anterior a hoje (dia civil de Lisboa);
--                            o próximo contacto é o mais cedo entre a chamada
--                            agendada (fn_neg_proximo_contacto, a regra da
--                            ficha e do Quadro) e a visita por fazer mais
--                            antiga ainda por ligar a um negócio. Um CLIENTE
--                            nunca está atrasado: no protótipo depende do
--                            prazo de um negócio aberto, que não tem fonte
--                            (D20). «Perdida» também não tem fonte (D6).
--     NÃO entram telefone nem email: lidos pela RLS custam cerca de 0,75 ms
--     por pessoa cada um (medido na nike), cerca de 150 ms por página de 100.
--     Ficam na ficha (pessoa.contacto), como hoje, e a UI lê-os por página.
--     Todos os campos da lead vêm da MESMA lead que a linha já mostra (lead_id:
--     a viva mais recente por created_at, desempate por id), e os do cliente
--     do MESMO cliente (o vivo mais antigo, desempate por id); os desempates
--     são novos nesta migration, na Lista e na ficha, para as duas escolherem
--     sempre a mesma linha.
--   - neg_ficha_pessoa: CREATE OR REPLACE, mesma assinatura e retorno jsonb.
--     Chaves novas em 'pessoa': qualificacao_tipo, ultima_atividade_em,
--     ultimo_contacto_lead_em, voltou_a_contactar (a mesma regra), tipo
--     (anew_entities.type), empresa_nome (display_name quando o tipo é
--     organization) e tem_nif (só leitura: há uma ligação fiscal PRINCIPAL em
--     vigor, is_primary e valid_to nulo ou futuro). O NIF NUNCA é devolvido
--     ('nif' continua null), nem o id da entidade fiscal. Em
--     'pessoa.origem': campanha_id e formulario_id. 'qualificacao' (as
--     respostas da aba Qualificação) fica como está.
--     Chaves novas em 'agregados' (ADITIVAS: ultimo_contacto_em e
--     ultimo_resultado continuam a ser só das chamadas, como antes):
--     ultimo_contacto_efetivo_em e ultimo_resultado_efetivo, a mesma regra
--     da coluna ultimo_resultado da Lista (o mais recente entre a última
--     chamada e o last_contact_at/last_contact_result da lead mostrada; em
--     empate, a chamada).
--   PARA A UI DO LOTE C: a ficha usa as chaves EFECTIVAS (data e resultado
--     do último contacto, aviso «sem contacto há N dias»); na Lista, os
--     «dias sem contacto» e o «Sem contacto» usam o MAIOR entre
--     ultimo_contacto_em e ultimo_contacto_lead_em, e o selo usa
--     ultimo_resultado. Assim lista e ficha mostram o mesmo.
--   - fn_neg_ambito_pessoas (NOVA, PRIVADA): o âmbito de leitura das pessoas
--     de uma organização para a sessão. INVOKER e sem EXECUTE para ninguém:
--     só a chamam as auxiliares da pesquisa e dos filtros.
--   - fn_neg_pesquisa_pessoas (NOVA, auxiliar da Lista): as pessoas cuja
--     pesquisa coincide no nome, no email ou no telefone; só ids. SECURITY
--     DEFINER, justificado e limitado no comentário da função: a RLS dos
--     contactos custa milissegundos por linha e a pesquisa passa por todas
--     as pessoas da organização; o âmbito calcula-se uma vez e só devolve
--     pessoas que a RLS da página já mostra. EXECUTE só para authenticated.
--   - fn_neg_filtro_pessoas (NOVA, auxiliar da Lista, A): o conjunto dos
--     filtros «atribuído a», «formulário», «resultado» e «voltou», só ids, ou
--     NULL para usar o caminho pela RLS. SECURITY DEFINER, com as regras das
--     políticas de leitura aplicadas à mão (comentário da função); a Lista lê
--     sempre as leads e os clientes pela RLS, por isso um id a mais nunca
--     aparece. EXECUTE só para authenticated.
--   A localidade e o distrito NÃO entram na Lista (decisão do utilizador,
--     20/10): ficam só na ficha (pessoa.morada), como antes.
--   As duas funções da página continuam STABLE, SECURITY INVOKER (a RLS de cada tabela decide; um
--   campo de uma tabela-satélite escondida vem null), search_path fixo e
--   statement_timeout de 5 s. Sem linha em negocio_workflow_config: a Lista
--   devolve vazio e a ficha dá NG008, como antes.
-- PESSOAS LIGADAS A OUTRA ORGANIZAÇÃO (anew_entity_org_links com mais do que
--   esta): a Lista e a ficha não mudam por isso; os campos da lead e do
--   cliente são sempre os desta organização, e o tipo, o nome, a morada e a
--   ligação fiscal são os da entidade, que é partilhada (o que outra
--   organização gravar aparece aqui).
-- SÓ ALTERA objectos NOSSOS (estas duas funções; cria três auxiliares novas). Nenhuma tabela, índice,
--   política, trigger ou função partilhada é alterada (as regras de acesso de
--   anew_leads e anew_clients ficam como estão). Não bloqueia tabelas.
-- PERMISSÕES: neg_resumo_pessoas, neg_ficha_pessoa e as auxiliares DEFINER da
--   pesquisa e dos filtros ficam com EXECUTE só para authenticated (sem PUBLIC, anon nem
--   service_role); fn_neg_ambito_pessoas sem EXECUTE para ninguém. Antes,
--   neg_resumo_pessoas também dava a service_role; nenhuma Edge Function a
--   chama (procurado em supabase/functions).
-- DESEMPENHO (20/10, nike: 244 pessoas e 333 leads; só leitura, utilizador de
--   teste, página de 100, 20 repetições; corpos emulados em SQL com as
--   variáveis escondidas do planeador; auxiliares emuladas com os privilégios
--   do dono). Execução em ms, mediana / p95.
--   Contra a função que está hoje no remoto (sem colunas novas nem filtros):
--     recentes 273/295 -> 319/346; nome 312/329 -> 348/370;
--     pesquisa por email 186/204 -> 166/178; por telefone 187/204 -> 183/197.
--   Filtros, antes (conjunto pela RLS e percorrer a organização) -> com A+B,
--   cada par medido na mesma transacção com a ordem alternada:
--     sem filtros 298/324 -> 300/327; só as minhas (77) 327/343 -> 264/271;
--     sem contacto (233) 357/374 -> 303/314; formulário (19) 262/278 -> 182/200;
--     resultado (1) 174/185 -> 62/68; voltou (4) 176/190 -> 71/77;
--     não voltou (240) 362/381 -> 308/329; atrasada (9, caminho pela RLS)
--     261/286 -> 235/257.
--   Partes (mediana): conjunto dos filtros pela RLS 67 a 73 ms, pela auxiliar
--   11 a 15 ms; «atrasada» pela RLS 126 ms; pesquisa 12 a 26 ms. O plano (que a
--   função guarda em cache por sessão) acrescenta cerca de 75 ms à nova e 45 ms
--   à de hoje.
--   Todos os cenários cumprem o critério (p95 até base +25 % e até 400 ms) na
--   execução; com o plano incluído, recentes e nome passam os 400 ms (427 e 449),
--   como já passava a versão anterior desta migration.
--   LIMIAR DE B (200 pessoas): com o caminho pelo conjunto FORÇADO a 233 e 240
--   pessoas, a Lista custou mais 7 a 12 ms (mediana; p95 +23 e +12) do que
--   percorrer as 333 leads da nike; a 77, 19, 9, 4 e 1 pessoas, partir do
--   conjunto custou menos. 200 fica abaixo do cruzamento medido na nike; numa
--   organização maior, percorrer cresce com a organização e o conjunto não,
--   por isso o cruzamento sobe.
--   EXTRAPOLAÇÃO (ESTIMATIVA, linear por pessoa, sem medição numa organização
--   grande): conjunto dos filtros pela RLS cerca de 0,29 ms por pessoa (1,4 s a
--   5000 pessoas, 2,9 s a 10000); pela auxiliar cerca de 0,06 ms por pessoa
--   (0,3 s e 0,6 s); percorrer a organização com um conjunto pequeno cerca de
--   0,15 ms por lead (0,7 s e 1,5 s), que B evita abaixo do limiar. Antes de
--   A+B, um filtro pequeno numa organização de 10000 pessoas ficava perto dos
--   5 s do statement_timeout (cerca de 4,4 s); com A+B, cerca de 0,7 s
--   (estimativa).
--   RISCO por medir: «atrasada» continua pela RLS e chama
--   fn_neg_proximo_contacto por pessoa (cerca de 0,3 a 0,5 ms por pessoa): numa
--   organização de 8000 pessoas seriam 2 a 4 s, perto do statement_timeout de
--   5 s. A Mudelar não usa este fluxo (sem configuração da página Pessoas).
-- PRECISA DE CÓDIGO: nenhum para continuar a funcionar (o hook chama os 8
--   parâmetros antigos por nome e ignora colunas a mais); para mostrar os
--   campos e usar os filtros, o Lote C da UI. Regenerar os tipos do Supabase.
-- Reversão: fora da pasta das migrations (não aplicar sem decisão).
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- Pré-condição: as versões a substituir são as lidas no remoto a 19/10.
DO $$
DECLARE
  v_txt text;
BEGIN
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.neg_resumo_pessoas(uuid,text,text,text,text,text,uuid,integer)', '141d2b4ae10a28271f226da3a5754fca'),
              ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])',              '8f58800c454c54554eb12b4aba9a9c5d')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: mudaram desde 19/10: %; nada feito.', v_txt;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
             WHERE s.nspname = 'public'
               AND p.proname IN ('fn_neg_localidade_pessoas', 'fn_neg_pesquisa_pessoas', 'fn_neg_ambito_pessoas',
                                 'fn_neg_filtro_pessoas')) THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: uma das auxiliares novas já existe; nada feito.';
  END IF;
  -- Nada depende do retorno de neg_resumo_pessoas (vistas ou funções SQL).
  IF EXISTS (SELECT 1 FROM pg_depend d
             WHERE d.refclassid = 'pg_proc'::regclass
               AND d.refobjid = to_regprocedure('public.neg_resumo_pessoas(uuid,text,text,text,text,text,uuid,integer)')
               AND d.deptype::text = 'n') THEN
    RAISE EXCEPTION 'PRÉ-CONDIÇÃO: há objectos que dependem de neg_resumo_pessoas; nada feito.';
  END IF;
END;
$$;

-- Âmbito de leitura das pessoas de UMA organização, para quem está na sessão.
-- PRIVADA: SECURITY INVOKER e sem EXECUTE para ninguém (nem authenticated, nem
-- service_role): só a chamam as auxiliares DEFINER da pesquisa e dos filtros,
-- abaixo, que correm com os privilégios do dono.
-- Devolve as chaves de âmbito de leads.view e clients.view (as de
-- crm_scope_keys, mas calculadas só para esta organização: crm_scope_keys
-- percorre todas as organizações do utilizador, 27 ms por chamada para um
-- utilizador com 21, medido na nike), pelo mesmo resolve_lead_access_context;
-- uma organização sem a permissão não dá chaves. E se é administrador de
-- sistema. Sem sessão, organização que não é do utilizador, sem configuração
-- da página Pessoas, ou sem pessoas.view nesta organização: chaves vazias.
CREATE FUNCTION public.fn_neg_ambito_pessoas(
  p_organization_id uuid,
  OUT chaves_lead text[],
  OUT chaves_cliente text[],
  OUT admin boolean)
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_chaves text[];
  v_cod    text;
  v_scope  text;
  v_user   uuid;
  v_auth   uuid;
  v_team   uuid[];
BEGIN
  chaves_lead := ARRAY[]::text[];
  chaves_cliente := ARRAY[]::text[];
  admin := false;
  IF v_uid IS NULL OR p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_crm_org_ids(v_uid)))
     OR NOT EXISTS (SELECT 1 FROM public.negocio_workflow_config c
                    WHERE c.organization_id = p_organization_id) THEN
    RETURN;
  END IF;

  FOREACH v_cod IN ARRAY ARRAY['pessoas.view', 'leads.view', 'clients.view'] LOOP
    v_chaves := ARRAY[]::text[];
    v_scope := NULL;
    v_user := NULL;
    v_auth := NULL;
    v_team := NULL;
    IF public.has_anew_permission(v_uid, v_cod) THEN
      BEGIN
        SELECT r.applied_scope, r.anew_user_id, r.auth_user_id, r.team_user_ids
          INTO v_scope, v_user, v_auth, v_team
        FROM public.resolve_lead_access_context(p_organization_id, 'ORG', v_cod) r;
        IF v_scope = 'ORG' THEN
          v_chaves := ARRAY[p_organization_id::text || ':*'];
        ELSE
          v_chaves := ARRAY(
            SELECT DISTINCT p_organization_id::text || ':' || o.dono::text
            FROM unnest(CASE WHEN v_scope = 'TEAM' THEN COALESCE(v_team, ARRAY[]::uuid[])
                             ELSE ARRAY[]::uuid[] END || ARRAY[v_user, v_auth]) AS o(dono)
            WHERE o.dono IS NOT NULL);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- Como crm_scope_keys: sem a permissão nesta organização, sem chaves.
        v_chaves := ARRAY[]::text[];
      END;
    END IF;
    IF v_cod = 'pessoas.view' THEN
      IF cardinality(v_chaves) = 0 THEN
        RETURN;
      END IF;
    ELSIF v_cod = 'leads.view' THEN
      chaves_lead := v_chaves;
    ELSE
      chaves_cliente := v_chaves;
    END IF;
  END LOOP;
  admin := public.is_system_admin(v_uid);
END;
$function$;

-- Pesquisa da Lista: as pessoas cujo nome, email ou telefone coincidem,
-- calculadas UMA vez por chamada.
-- SECURITY DEFINER porque os emails e os telefones têm RLS por linha
-- (is_entity_contact_in_owner_scope, cerca de 0,75 ms por pessoa em cada um,
-- medido na nike), e a pesquisa tem de passar por TODAS as pessoas da organização, não
-- só por uma página. O nome também vem para aqui: na Lista, o nome em «OU»
-- com o resto deixava de ser uma junção e passava a uma subconsulta por lead
-- com a RLS de anew_entities (cerca de +100 ms por chamada na nike).
-- Regra de âmbito: a de fn_neg_ambito_pessoas: só devolve pessoas que quem chama já vê pela RLS
-- da página (lead viva no âmbito leads.view ou cliente vivo no âmbito
-- clients.view, desta organização; administrador de sistema só com papel da
-- pessoa numa organização visível, o ramo de system_admin_pii_default_deny).
-- Nunca devolve mais do que a RLS devolveria; pode devolver menos. Privilégio
-- que usa: ler anew_entities, anew_entity_emails, anew_entity_phones,
-- anew_leads, anew_clients e anew_entity_roles sem RLS. Devolve só ids de
-- pessoas; nunca o nome, o email ou o telefone.
--   - nome: contém a pesquisa, sem maiúsculas (anew_entities.display_name,
--     como a Lista fazia);
--   - email: contém a pesquisa, sem maiúsculas (qualquer email da pessoa);
--   - telefone: só quando a pesquisa é um número (algarismos, espaços, +, -,
--     parênteses e pontos) com 7 ou mais algarismos; coincide quando um dos
--     números, só com algarismos, termina no outro (a regra de
--     find_entity_matches: sufixo, mínimo 7).
CREATE FUNCTION public.fn_neg_pesquisa_pessoas(p_organization_id uuid, p_pesquisa text)
  RETURNS TABLE (entity_id uuid)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid       uuid := auth.uid();
  v_q         text := NULLIF(btrim(p_pesquisa), '');
  v_padrao    text;
  v_digitos   text;
  v_keys_lead text[];
  v_keys_cli  text[];
  v_admin     boolean;
BEGIN
  IF char_length(v_q) < 2 OR char_length(v_q) > 200 THEN
    RAISE EXCEPTION 'Valor inválido: pesquisa (2 a 200 caracteres).' USING ERRCODE = 'NG009';
  END IF;
  IF v_q IS NULL THEN
    RETURN;
  END IF;
  SELECT a.chaves_lead, a.chaves_cliente, a.admin
    INTO v_keys_lead, v_keys_cli, v_admin
  FROM public.fn_neg_ambito_pessoas(p_organization_id) a;
  IF cardinality(v_keys_lead) + cardinality(v_keys_cli) = 0 THEN
    RETURN;
  END IF;

  v_padrao := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  IF v_q ~ '^[0-9 +().-]+$' THEN
    v_digitos := regexp_replace(v_q, '\D', '', 'g');
    IF char_length(v_digitos) < 7 THEN
      v_digitos := NULL;
    END IF;
  END IF;

  RETURN QUERY
  SELECT p.ent
  FROM (
    SELECT l.entity_id AS ent
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
      AND (l.organization_id::text || ':*' = ANY (v_keys_lead)
           OR l.organization_id::text || ':' || l.assigned_to::text = ANY (v_keys_lead)
           OR l.organization_id::text || ':' || l.created_by::text = ANY (v_keys_lead))
    UNION
    SELECT c.entity_id
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
      AND (c.organization_id::text || ':*' = ANY (v_keys_cli)
           OR c.organization_id::text || ':' || c.assigned_to::text = ANY (v_keys_cli)
           OR c.organization_id::text || ':' || c.created_by::text = ANY (v_keys_cli))
  ) p
  WHERE (NOT v_admin
         OR EXISTS (SELECT 1 FROM public.anew_entity_roles er
                    WHERE er.entity_id = p.ent AND er.deleted_at IS NULL
                      AND er.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))))
    AND (EXISTS (SELECT 1 FROM public.anew_entities e
                 WHERE e.id = p.ent AND e.display_name ILIKE v_padrao ESCAPE '\')
         OR EXISTS (SELECT 1 FROM public.anew_entity_emails em
                    WHERE em.entity_id = p.ent AND em.email ILIKE v_padrao ESCAPE '\')
         OR (v_digitos IS NOT NULL AND EXISTS (
               SELECT 1
               FROM public.anew_entity_phones ph
               CROSS JOIN LATERAL (SELECT regexp_replace(ph.phone_number, '\D', '', 'g') AS d) x
               WHERE ph.entity_id = p.ent AND char_length(x.d) >= 7
                 AND (x.d LIKE '%' || v_digitos OR v_digitos LIKE '%' || x.d))));
END;
$function$;

-- Filtros da Lista (A): o conjunto das pessoas que passam «atribuído a»,
-- «formulário», «resultado do último contacto» e «voltou a contactar»,
-- calculado UMA vez por chamada e sem a RLS por linha (que custava cerca de
-- 70 ms por chamada na nike, por pessoa da organização).
-- Devolve só ids. NULL quer dizer «não sei, usa o caminho normal pela RLS»
-- (neg_resumo_pessoas recalcula então o conjunto como antes); nunca é usado
-- para mostrar alguém: a Lista lê sempre as leads e os clientes pela RLS de
-- quem chama, por isso um id a mais aqui não aparece, só um a menos é que
-- esconderia alguém. Devolve NULL (falha fechada no caminho rápido) sem
-- sessão, fora das organizações do utilizador ou das visíveis, sem chaves de
-- âmbito, para um administrador de sistema, ou com qualquer erro.
-- SECURITY DEFINER: lê sem RLS anew_leads, anew_clients, entity_interactions,
-- campaigns e forms, mas aplica À MÃO as mesmas regras das políticas de
-- leitura, para cada linha:
--   - anew_leads e anew_clients: as chaves de âmbito de leads.view e
--     clients.view desta organização (fn_neg_ambito_pessoas: o mesmo
--     resolve_lead_access_context de crm_scope_keys) contra organização,
--     assigned_to e created_by, como anew_leads_select e anew_clients_select;
--     a lead e o cliente mostrados escolhem-se só entre os visíveis;
--   - entity_interactions, campaigns e forms: organização visível
--     (get_user_visible_org_ids), como as suas políticas.
-- As expressões dos filtros são as da Lista, à letra. «atrasada» NÃO entra:
-- lê schedule_items e negocios, que têm âmbitos próprios (agenda e
-- pessoas.view por dono) que esta função não reproduz; com p_atrasada a Lista
-- usa sempre o caminho pela RLS.
CREATE FUNCTION public.fn_neg_filtro_pessoas(
  p_organization_id uuid,
  p_atribuido_a uuid,
  p_formulario_id uuid,
  p_ultimo_resultado text,
  p_voltou boolean)
  RETURNS uuid[]
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_keys_lead text[];
  v_keys_cli  text[];
  v_admin     boolean;
  v_visiveis  uuid[];
BEGIN
  IF v_uid IS NULL OR p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT a.chaves_lead, a.chaves_cliente, a.admin
    INTO v_keys_lead, v_keys_cli, v_admin
  FROM public.fn_neg_ambito_pessoas(p_organization_id) a;
  IF v_admin IS NOT FALSE OR cardinality(v_keys_lead) + cardinality(v_keys_cli) = 0 THEN
    RETURN NULL;
  END IF;
  v_visiveis := ARRAY(SELECT public.get_user_visible_org_ids(v_uid));
  IF NOT (p_organization_id = ANY (v_visiveis)) THEN
    RETURN NULL;
  END IF;

  RETURN ARRAY(
    SELECT b.ent
    FROM (
      SELECT COALESCE(ld.ent, cl.ent) AS ent, ld.lassigned, ld.lcamp, ld.lativ, ld.lcontacto, ld.lresultado,
             cl.cassigned
      FROM (
        SELECT DISTINCT ON (l.entity_id)
               l.entity_id AS ent, l.assigned_to AS lassigned, l.campaign_id AS lcamp,
               l.last_activity_at AS lativ, l.last_contact_at AS lcontacto, l.last_contact_result AS lresultado
        FROM public.anew_leads l
        WHERE l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
          AND (l.organization_id::text || ':*' = ANY (v_keys_lead)
               OR l.organization_id::text || ':' || l.assigned_to::text = ANY (v_keys_lead)
               OR l.organization_id::text || ':' || l.created_by::text = ANY (v_keys_lead))
        ORDER BY l.entity_id, l.created_at DESC, l.id DESC
      ) ld
      FULL JOIN (
        SELECT DISTINCT ON (c.entity_id)
               c.entity_id AS ent, c.assigned_to AS cassigned
        FROM public.anew_clients c
        WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL AND c.entity_id IS NOT NULL
          AND (c.organization_id::text || ':*' = ANY (v_keys_cli)
               OR c.organization_id::text || ':' || c.assigned_to::text = ANY (v_keys_cli)
               OR c.organization_id::text || ':' || c.created_by::text = ANY (v_keys_cli))
        ORDER BY c.entity_id, c.created_at ASC, c.id ASC
      ) cl ON cl.ent = ld.ent
    ) b
    LEFT JOIN (
      SELECT i.entity_id AS ent, max(i.interaction_at) AS ultimo,
             (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
      FROM public.entity_interactions i
      WHERE (p_ultimo_resultado IS NOT NULL OR p_voltou IS NOT NULL)
        AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
      GROUP BY i.entity_id
    ) ct ON ct.ent = b.ent
    LEFT JOIN LATERAL (
      SELECT f.id AS fid
      FROM public.campaigns ca
      JOIN public.forms f ON f.id = ca.form_id
      WHERE p_formulario_id IS NOT NULL AND ca.id = b.lcamp
        AND ca.organization_id = ANY (v_visiveis) AND f.organization_id = ANY (v_visiveis)
    ) fm ON true
    WHERE (p_atribuido_a IS NULL OR COALESCE(b.cassigned, b.lassigned) = p_atribuido_a)
      AND (p_formulario_id IS NULL OR fm.fid = p_formulario_id)
      AND (p_ultimo_resultado IS NULL
           OR (CASE WHEN ct.ultimo IS NULL AND b.lcontacto IS NULL THEN 'semContacto'
                    WHEN b.lcontacto IS NULL OR ct.ultimo >= b.lcontacto THEN ct.resultado
                    ELSE b.lresultado::text END) = p_ultimo_resultado)
      AND (p_voltou IS NULL
           OR (b.lativ IS NOT NULL
               AND (GREATEST(b.lcontacto, ct.ultimo) IS NULL
                    OR b.lativ > GREATEST(b.lcontacto, ct.ultimo))) = p_voltou));
EXCEPTION WHEN OTHERS THEN
  -- falha fechada no caminho rápido: a Lista usa o caminho normal, pela RLS
  RETURN NULL;
END;
$function$;

DROP FUNCTION public.neg_resumo_pessoas(uuid, text, text, text, text, text, uuid, integer);

CREATE FUNCTION public.neg_resumo_pessoas(
  p_organization_id uuid,
  p_papel text DEFAULT NULL,
  p_etapa text DEFAULT NULL,
  p_pesquisa text DEFAULT NULL,
  p_ordem text DEFAULT 'recentes',
  p_depois_de_chave text DEFAULT NULL,
  p_depois_de_id uuid DEFAULT NULL,
  p_limite integer DEFAULT 50,
  p_atribuido_a uuid DEFAULT NULL,
  p_formulario_id uuid DEFAULT NULL,
  p_ultimo_resultado text DEFAULT NULL,
  p_voltou boolean DEFAULT NULL,
  p_atrasada boolean DEFAULT NULL)
  RETURNS TABLE (
    entity_id uuid,
    nome text,
    papel text,
    lead_id uuid,
    client_id uuid,
    assigned_to uuid,
    lead_status text,
    closure_result text,
    etapa text,
    negocios_abertos integer,
    negocios_ganhos integer,
    negocios_perdidos integer,
    fase_mais_avancada text,
    pronto_a_ganhar boolean,
    valor_em_jogo numeric,
    ultimo_contacto_em timestamptz,
    proxima_visita_em timestamptz,
    ultima_visita_feita_em timestamptz,
    ultimo_negocio_em timestamptz,
    por_ligar_contactos integer,
    por_ligar_visitas integer,
    por_ligar_levantamentos integer,
    chave_ordem text,
    ha_mais boolean,
    criado_em timestamptz,
    qualificacao_tipo text,
    ultima_atividade_em timestamptz,
    ultimo_contacto_lead_em timestamptz,
    voltou_a_contactar boolean,
    origem text,
    origem_detalhe text,
    campanha_id uuid,
    campanha text,
    formulario_id uuid,
    formulario text,
    ultimo_resultado text,
    atrasada boolean)
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
AS $function$
#variable_conflict use_column
DECLARE
  v_ordem    text := COALESCE(p_ordem, 'recentes');
  v_pesquisa text := NULLIF(btrim(p_pesquisa), '');
  v_padrao   text;
  v_depois   timestamptz;
  v_momento  text;
  v_ents     uuid[];
  v_pesq     uuid[];
  v_filtro   uuid[];
  v_filtrar  boolean;
  v_conjunto boolean;
  v_pequeno  boolean;
  -- «hoje» da regra de atraso: o dia civil de Lisboa
  v_hoje     date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
BEGIN
  IF p_organization_id IS NULL
     OR v_ordem NOT IN ('recentes', 'nome')
     OR (p_papel IS NOT NULL AND p_papel NOT IN ('lead', 'cliente'))
     OR (p_etapa IS NOT NULL AND p_etapa NOT IN ('nova', 'emContacto', 'visitaMarcada', 'qualificada', 'cliente'))
     OR p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_depois_de_chave IS NULL) <> (p_depois_de_id IS NULL)
     OR char_length(v_pesquisa) < 2 OR char_length(v_pesquisa) > 200
     OR (p_ultimo_resultado IS NOT NULL AND p_ultimo_resultado NOT IN
           ('atendeuInteressado', 'atendeuMaisTarde', 'naoAtendeu', 'semInteresse', 'numeroErrado', 'semContacto')) THEN
    RAISE EXCEPTION 'Valor inválido: organização, ordem, papel, etapa, limite (1 a 100), página, pesquisa (2 a 200 caracteres) ou resultado.'
      USING ERRCODE = 'NG009';
  END IF;

  -- D1: sem linha de configuração visível, lista vazia.
  SELECT c.momento_ganho INTO v_momento
  FROM public.negocio_workflow_config c
  WHERE c.organization_id = p_organization_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_pesquisa IS NOT NULL THEN
    v_padrao := '%' || replace(replace(replace(v_pesquisa, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    -- nome, email e telefone: uma vez, pela auxiliar
    -- (fn_neg_pesquisa_pessoas explica porque o nome também vai para lá)
    v_pesq := ARRAY(SELECT x.entity_id FROM public.fn_neg_pesquisa_pessoas(p_organization_id, v_pesquisa) x);
  END IF;
  IF v_ordem = 'recentes' AND p_depois_de_chave IS NOT NULL THEN
    BEGIN
      v_depois := p_depois_de_chave::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Valor inválido: chave da página.' USING ERRCODE = 'NG009';
    END;
  END IF;

  -- Filtro de etapa: uma vez, por conjunto, para a organização.
  IF p_etapa IS NOT NULL THEN
    v_ents := ARRAY(
      SELECT b.ent
      FROM (
        SELECT x.ent, bool_or(x.cliente) AS cliente
        FROM (
          SELECT l.entity_id AS ent, false AS cliente
          FROM public.anew_leads l
          WHERE l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
          UNION ALL
          SELECT c.entity_id, true
          FROM public.anew_clients c
          WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
        ) x
        GROUP BY x.ent
      ) b
      LEFT JOIN (
        SELECT DISTINCT n.entity_id AS ent
        FROM public.negocios n
        WHERE n.organization_id = p_organization_id AND n.estado = 'aberto' AND n.deleted_at IS NULL
      ) na ON na.ent = b.ent
      LEFT JOIN (
        SELECT DISTINCT l.entity_id AS ent
        FROM public.schedule_items s
        JOIN public.anew_leads l ON l.id = s.lead_id
        WHERE l.organization_id = p_organization_id AND s.organization_id = p_organization_id
          AND s.status <> 'cancelled'::public.schedule_item_status
          AND s.time_off_type IS NULL AND s.vacation_id IS NULL
      ) vi ON vi.ent = b.ent
      LEFT JOIN (
        SELECT DISTINCT i.entity_id AS ent
        FROM public.entity_interactions i
        WHERE i.organization_id = p_organization_id AND i.interaction_type = 'call'
      ) co ON co.ent = b.ent
      WHERE CASE
              WHEN b.cliente THEN 'cliente'
              WHEN na.ent IS NOT NULL THEN 'qualificada'
              WHEN vi.ent IS NOT NULL THEN 'visitaMarcada'
              WHEN co.ent IS NOT NULL THEN 'emContacto'
              ELSE 'nova'
            END = p_etapa);
  END IF;

  -- Filtros novos (20261225150000): um conjunto, calculado uma vez para a
  -- organização, com a MESMA lead e o MESMO cliente que a linha mostra e as
  -- MESMAS expressões das colunas assigned_to, formulario_id,
  -- ultimo_resultado, voltou_a_contactar e atrasada (abaixo). Cada parte só
  -- corre se o seu filtro vier preenchido.
  v_filtrar := p_atribuido_a IS NOT NULL OR p_formulario_id IS NOT NULL OR p_ultimo_resultado IS NOT NULL
               OR p_voltou IS NOT NULL OR p_atrasada IS NOT NULL;
  IF v_filtrar THEN
    -- A: sem «atrasada», o conjunto vem da auxiliar, sem a RLS por linha e com
    -- as mesmas regras de acesso (fn_neg_filtro_pessoas explica). NULL: a
    -- auxiliar não se aplica e o conjunto calcula-se aqui, pela RLS, como antes.
    IF p_atrasada IS NULL THEN
      v_filtro := public.fn_neg_filtro_pessoas(p_organization_id, p_atribuido_a, p_formulario_id,
                                               p_ultimo_resultado, p_voltou);
    END IF;
    IF v_filtro IS NULL THEN
    v_filtro := ARRAY(
      SELECT b.ent
      FROM (
        -- uma só passagem pelas leads e pelos clientes da organização: por
        -- pessoa, a lead mostrada (a viva mais recente por created_at, desempate
        -- por id) e o cliente mostrado (o vivo mais antigo, desempate por id)
        SELECT COALESCE(ld.ent, cl.ent) AS ent, ld.lid, ld.lassigned, ld.lcamp, ld.lclosure, ld.lativ,
               ld.lcontacto, ld.lresultado, cl.cid, cl.cassigned
        FROM (
          SELECT DISTINCT ON (l.entity_id)
                 l.entity_id AS ent, l.id AS lid, l.assigned_to AS lassigned, l.campaign_id AS lcamp,
                 l.closure_result AS lclosure, l.last_activity_at AS lativ, l.last_contact_at AS lcontacto,
                 l.last_contact_result AS lresultado
          FROM public.anew_leads l
          WHERE l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
          ORDER BY l.entity_id, l.created_at DESC, l.id DESC
        ) ld
        FULL JOIN (
          SELECT DISTINCT ON (c.entity_id)
                 c.entity_id AS ent, c.id AS cid, c.assigned_to AS cassigned
          FROM public.anew_clients c
          WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL AND c.entity_id IS NOT NULL
          ORDER BY c.entity_id, c.created_at ASC, c.id ASC
        ) cl ON cl.ent = ld.ent
      ) b
      LEFT JOIN (
        -- chamadas: uma passagem agrupada pelas da organização
        SELECT i.entity_id AS ent, max(i.interaction_at) AS ultimo,
               (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
        FROM public.entity_interactions i
        WHERE (p_ultimo_resultado IS NOT NULL OR p_voltou IS NOT NULL)
          AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
        GROUP BY i.entity_id
      ) ct ON ct.ent = b.ent
      LEFT JOIN LATERAL (
        SELECT f.id AS fid
        FROM public.campaigns ca
        JOIN public.forms f ON f.id = ca.form_id
        WHERE p_formulario_id IS NOT NULL AND ca.id = b.lcamp
      ) fm ON true
      LEFT JOIN (
        -- a visita por fazer mais antiga ainda por ligar a um negócio, por
        -- pessoa: as mesmas visitas que a coluna atrasada lê em vs (pelas
        -- leads da pessoa nesta organização, todas), numa passagem agrupada
        SELECT l.entity_id AS ent, min(si.start_datetime) AS por_fazer_desde
        FROM public.schedule_items si
        JOIN public.anew_leads l ON l.id = si.lead_id
        LEFT JOIN (
          SELECT n.entity_id AS ent, max(n.created_at) AS ultimo_em
          FROM public.negocios n
          WHERE p_atrasada IS NOT NULL AND n.organization_id = p_organization_id AND n.deleted_at IS NULL
          GROUP BY n.entity_id
        ) un ON un.ent = l.entity_id
        WHERE p_atrasada IS NOT NULL
          AND l.organization_id = p_organization_id AND si.organization_id = p_organization_id
          AND si.time_off_type IS NULL AND si.vacation_id IS NULL
          AND si.negocio_id IS NULL
          AND si.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
          AND si.start_datetime > COALESCE(un.ultimo_em, '-infinity'::timestamptz)
        GROUP BY l.entity_id
      ) vf ON vf.ent = b.ent
      WHERE (p_atribuido_a IS NULL OR COALESCE(b.cassigned, b.lassigned) = p_atribuido_a)
        AND (p_formulario_id IS NULL OR fm.fid = p_formulario_id)
        AND (p_ultimo_resultado IS NULL
             OR (CASE WHEN ct.ultimo IS NULL AND b.lcontacto IS NULL THEN 'semContacto'
                      WHEN b.lcontacto IS NULL OR ct.ultimo >= b.lcontacto THEN ct.resultado
                      ELSE b.lresultado::text END) = p_ultimo_resultado)
        AND (p_voltou IS NULL
             OR (b.lativ IS NOT NULL
                 AND (GREATEST(b.lcontacto, ct.ultimo) IS NULL
                      OR b.lativ > GREATEST(b.lcontacto, ct.ultimo))) = p_voltou)
        AND (p_atrasada IS NULL
             OR COALESCE(CASE WHEN b.cid IS NULL AND b.lid IS NOT NULL AND b.lclosure IS NULL THEN
                           (LEAST(public.fn_neg_proximo_contacto(p_organization_id, b.ent), vf.por_fazer_desde)
                            AT TIME ZONE 'Europe/Lisbon')::date < v_hoje END, false) = p_atrasada));
    END IF;
    v_ents := CASE WHEN p_etapa IS NULL THEN v_filtro
                   ELSE ARRAY(SELECT unnest(v_ents) INTERSECT SELECT unnest(v_filtro)) END;
  END IF;
  v_conjunto := p_etapa IS NOT NULL OR v_filtrar;
  -- B: com um conjunto pequeno, a Lista parte dele (uma sonda por pessoa, pelo
  -- índice de entity_id) em vez de percorrer as leads e os clientes da
  -- organização; as mesmas condições, a mesma ordem e a mesma chave de página.
  -- Limiar de 200 pessoas: ver DESEMPENHO no cabeçalho.
  v_pequeno := v_conjunto AND cardinality(v_ents) <= 200;

  RETURN QUERY
  WITH cand_leads_org AS (
    -- recentes: a lead mais recente de cada pessoa (a chave da pessoa), pelo
    -- índice (organization_id, list_sort_at DESC), com LIMIT antes de juntar.
    SELECT l.entity_id AS ent, l.list_sort_at AS k
    FROM public.anew_leads l
    WHERE v_ordem = 'recentes'
      AND l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.anew_leads l2
                      WHERE l2.entity_id = l.entity_id AND l2.organization_id = p_organization_id
                        AND l2.deleted_at IS NULL
                        AND (l2.list_sort_at, l2.id) > (l.list_sort_at, l.id))
      AND NOT EXISTS (SELECT 1 FROM public.anew_clients c2
                      WHERE c2.entity_id = l.entity_id AND c2.organization_id = p_organization_id
                        AND c2.deleted_at IS NULL
                        AND COALESCE(c2.updated_at, c2.created_at) > l.list_sort_at)
      AND (p_papel IS NULL
           OR (p_papel = 'cliente') = EXISTS (SELECT 1 FROM public.anew_clients c3
                                             WHERE c3.entity_id = l.entity_id
                                               AND c3.organization_id = p_organization_id
                                               AND c3.deleted_at IS NULL))
      AND NOT v_pequeno AND (NOT v_conjunto OR l.entity_id IN (SELECT unnest(v_ents)))
      AND (v_padrao IS NULL OR l.entity_id IN (SELECT unnest(v_pesq)))
      AND (p_depois_de_id IS NULL OR (l.list_sort_at, l.entity_id) < (v_depois, p_depois_de_id))
    ORDER BY l.list_sort_at DESC, l.entity_id DESC
    LIMIT p_limite + 1
  ), cand_leads_conj AS (
    -- B: o mesmo, a partir do conjunto pequeno.
    SELECT l.entity_id AS ent, l.list_sort_at AS k
    FROM (SELECT DISTINCT u.ent FROM unnest(v_ents) AS u(ent)) s
    JOIN public.anew_leads l ON l.entity_id = s.ent
    WHERE v_pequeno AND v_ordem = 'recentes'
      AND l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.anew_leads l2
                      WHERE l2.entity_id = l.entity_id AND l2.organization_id = p_organization_id
                        AND l2.deleted_at IS NULL
                        AND (l2.list_sort_at, l2.id) > (l.list_sort_at, l.id))
      AND NOT EXISTS (SELECT 1 FROM public.anew_clients c2
                      WHERE c2.entity_id = l.entity_id AND c2.organization_id = p_organization_id
                        AND c2.deleted_at IS NULL
                        AND COALESCE(c2.updated_at, c2.created_at) > l.list_sort_at)
      AND (p_papel IS NULL
           OR (p_papel = 'cliente') = EXISTS (SELECT 1 FROM public.anew_clients c3
                                             WHERE c3.entity_id = l.entity_id
                                               AND c3.organization_id = p_organization_id
                                               AND c3.deleted_at IS NULL))
      AND (v_padrao IS NULL OR l.entity_id IN (SELECT unnest(v_pesq)))
      AND (p_depois_de_id IS NULL OR (l.list_sort_at, l.entity_id) < (v_depois, p_depois_de_id))
    ORDER BY l.list_sort_at DESC, l.entity_id DESC
    LIMIT p_limite + 1
  ), cand_leads AS (
    SELECT * FROM cand_leads_org UNION ALL SELECT * FROM cand_leads_conj
  ), cand_clientes_org AS (
    -- recentes: pessoas cuja chave vem do cliente (mais recente do que todas as leads).
    SELECT c.entity_id AS ent, COALESCE(c.updated_at, c.created_at) AS k
    FROM public.anew_clients c
    WHERE v_ordem = 'recentes' AND p_papel IS DISTINCT FROM 'lead'
      AND c.organization_id = p_organization_id AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.anew_clients c2
                      WHERE c2.entity_id = c.entity_id AND c2.organization_id = p_organization_id
                        AND c2.deleted_at IS NULL
                        AND (COALESCE(c2.updated_at, c2.created_at), c2.id)
                            > (COALESCE(c.updated_at, c.created_at), c.id))
      AND NOT EXISTS (SELECT 1 FROM public.anew_leads l2
                      WHERE l2.entity_id = c.entity_id AND l2.organization_id = p_organization_id
                        AND l2.deleted_at IS NULL
                        AND l2.list_sort_at >= COALESCE(c.updated_at, c.created_at))
      AND NOT v_pequeno AND (NOT v_conjunto OR c.entity_id IN (SELECT unnest(v_ents)))
      AND (v_padrao IS NULL OR c.entity_id IN (SELECT unnest(v_pesq)))
      AND (p_depois_de_id IS NULL
           OR (COALESCE(c.updated_at, c.created_at), c.entity_id) < (v_depois, p_depois_de_id))
    ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.entity_id DESC
    LIMIT p_limite + 1
  ), cand_clientes_conj AS (
    -- B: o mesmo, a partir do conjunto pequeno.
    SELECT c.entity_id AS ent, COALESCE(c.updated_at, c.created_at) AS k
    FROM (SELECT DISTINCT u.ent FROM unnest(v_ents) AS u(ent)) s
    JOIN public.anew_clients c ON c.entity_id = s.ent
    WHERE v_pequeno AND v_ordem = 'recentes' AND p_papel IS DISTINCT FROM 'lead'
      AND c.organization_id = p_organization_id AND c.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.anew_clients c2
                      WHERE c2.entity_id = c.entity_id AND c2.organization_id = p_organization_id
                        AND c2.deleted_at IS NULL
                        AND (COALESCE(c2.updated_at, c2.created_at), c2.id)
                            > (COALESCE(c.updated_at, c.created_at), c.id))
      AND NOT EXISTS (SELECT 1 FROM public.anew_leads l2
                      WHERE l2.entity_id = c.entity_id AND l2.organization_id = p_organization_id
                        AND l2.deleted_at IS NULL
                        AND l2.list_sort_at >= COALESCE(c.updated_at, c.created_at))
      AND (v_padrao IS NULL OR c.entity_id IN (SELECT unnest(v_pesq)))
      AND (p_depois_de_id IS NULL
           OR (COALESCE(c.updated_at, c.created_at), c.entity_id) < (v_depois, p_depois_de_id))
    ORDER BY COALESCE(c.updated_at, c.created_at) DESC, c.entity_id DESC
    LIMIT p_limite + 1
  ), cand_clientes AS (
    SELECT * FROM cand_clientes_org UNION ALL SELECT * FROM cand_clientes_conj
  ), cand_nome AS (
    -- nome: pessoas (leads e clientes vivos) pelo nome, com LIMIT antes dos agregados.
    SELECT x.ent, COALESCE(lower(e.display_name), '') AS nm
    FROM (
      SELECT l.entity_id AS ent
      FROM public.anew_leads l
      WHERE v_ordem = 'nome' AND p_papel IS DISTINCT FROM 'cliente' AND NOT v_pequeno
        AND l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
        AND (p_papel IS NULL OR NOT EXISTS (SELECT 1 FROM public.anew_clients c3
                                            WHERE c3.entity_id = l.entity_id
                                              AND c3.organization_id = p_organization_id
                                              AND c3.deleted_at IS NULL))
      UNION
      SELECT c.entity_id
      FROM public.anew_clients c
      WHERE v_ordem = 'nome' AND p_papel IS DISTINCT FROM 'lead' AND NOT v_pequeno
        AND c.organization_id = p_organization_id AND c.deleted_at IS NULL
      UNION
      -- B: as mesmas leads, a partir do conjunto pequeno
      SELECT l.entity_id
      FROM (SELECT DISTINCT u.ent FROM unnest(v_ents) AS u(ent)) s
      JOIN public.anew_leads l ON l.entity_id = s.ent
      WHERE v_pequeno AND v_ordem = 'nome' AND p_papel IS DISTINCT FROM 'cliente'
        AND l.organization_id = p_organization_id AND l.deleted_at IS NULL AND l.entity_id IS NOT NULL
        AND (p_papel IS NULL OR NOT EXISTS (SELECT 1 FROM public.anew_clients c3
                                            WHERE c3.entity_id = l.entity_id
                                              AND c3.organization_id = p_organization_id
                                              AND c3.deleted_at IS NULL))
      UNION
      -- B: os mesmos clientes, a partir do conjunto pequeno
      SELECT c.entity_id
      FROM (SELECT DISTINCT u.ent FROM unnest(v_ents) AS u(ent)) s
      JOIN public.anew_clients c ON c.entity_id = s.ent
      WHERE v_pequeno AND v_ordem = 'nome' AND p_papel IS DISTINCT FROM 'lead'
        AND c.organization_id = p_organization_id AND c.deleted_at IS NULL
    ) x
    LEFT JOIN public.anew_entities e ON e.id = x.ent
    WHERE (NOT v_conjunto OR x.ent IN (SELECT unnest(v_ents)))
      AND (v_padrao IS NULL OR x.ent IN (SELECT unnest(v_pesq)))
      AND (p_depois_de_id IS NULL
           OR (COALESCE(lower(e.display_name), ''), x.ent) > (p_depois_de_chave, p_depois_de_id))
    ORDER BY COALESCE(lower(e.display_name), ''), x.ent
    LIMIT p_limite + 1
  ), candidatos AS (
    SELECT u.ent, u.k, NULL::text AS nm
    FROM (SELECT * FROM cand_leads UNION ALL SELECT * FROM cand_clientes) u
    UNION ALL
    SELECT n.ent, NULL::timestamptz, n.nm FROM cand_nome n
  ), pagina AS (
    SELECT cd.ent, cd.k, cd.nm,
           row_number() OVER (ORDER BY
             CASE WHEN v_ordem = 'recentes' THEN cd.k END DESC,
             CASE WHEN v_ordem = 'recentes' THEN cd.ent END DESC,
             CASE WHEN v_ordem = 'nome' THEN cd.nm END ASC,
             CASE WHEN v_ordem = 'nome' THEN cd.ent END ASC) AS rn,
           count(*) OVER () AS lidas
    FROM candidatos cd
  )
  SELECT
    pg.ent::uuid,
    e2.display_name::text,
    (CASE WHEN cl.cid IS NOT NULL THEN 'cliente' ELSE 'lead' END)::text,
    ld.lid::uuid,
    cl.cid::uuid,
    COALESCE(cl.cassigned, ld.lassigned)::uuid,
    ld.lstatus::text,
    ld.lclosure::text,
    (CASE
       WHEN cl.cid IS NOT NULL THEN 'cliente'
       WHEN COALESCE(ng.abertos, 0) > 0 THEN 'qualificada'
       WHEN COALESCE(vs.visitas_lead, 0) > 0 THEN 'visitaMarcada'
       WHEN ct.ultimo IS NOT NULL THEN 'emContacto'
       ELSE 'nova'
     END)::text,
    COALESCE(ng.abertos, 0)::integer,
    COALESCE(ng.ganhos, 0)::integer,
    COALESCE(ng.perdidos, 0)::integer,
    fs.fase::text,
    COALESCE(vl.pronto, false)::boolean,
    vl.valor::numeric,
    ct.ultimo::timestamptz,
    vs.proxima::timestamptz,
    vs.ultima_feita::timestamptz,
    ng.ultimo_em::timestamptz,
    COALESCE(ct.por_ligar, 0)::integer,
    COALESCE(vs.por_ligar, 0)::integer,
    COALESCE(lv.por_ligar, 0)::integer,
    (CASE WHEN v_ordem = 'nome' THEN COALESCE(pg.nm, '')
          ELSE to_char(pg.k AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END)::text,
    (pg.lidas > p_limite)::boolean,
    -- 20261225150000: campos novos (todos da lead mostrada, ld, salvo criado_em)
    LEAST(lds.criado_min, cl.ccriado)::timestamptz,
    ld.lqualif::text,
    ld.lativ::timestamptz,
    ld.lcontacto::timestamptz,
    (ld.lativ IS NOT NULL
     AND (GREATEST(ld.lcontacto, ct.ultimo) IS NULL
          OR ld.lativ > GREATEST(ld.lcontacto, ct.ultimo)))::boolean,
    ld.lsource::text,
    ld.lorigin::text,
    ld.lcamp::uuid,
    cp.cnome::text,
    cp.fid::uuid,
    cp.fnome::text,
    -- resultado do contacto mais recente entre as DUAS fontes: a última chamada
    -- registada (entity_interactions 'call', funções neg_*) e o último contacto
    -- guardado na lead mostrada pela página de Leads (last_contact_at e
    -- last_contact_result); em empate ganha a chamada. Nulo sem contacto em
    -- nenhuma das duas (a UI diz «Sem contacto» quando ultimo_contacto_em e
    -- ultimo_contacto_lead_em são ambos nulos) ou com um contacto sem resultado.
    (CASE WHEN ct.ultimo IS NULL AND ld.lcontacto IS NULL THEN NULL
          WHEN ld.lcontacto IS NULL OR ct.ultimo >= ld.lcontacto THEN ct.resultado
          ELSE ld.lresultado::text END)::text,
    -- atrasada: a regra do protótipo (etapaPessoa.ts, estaAtrasadaRegistos):
    -- lead não encerrada cujo próximo contacto (a chamada agendada,
    -- fn_neg_proximo_contacto, ou a visita por fazer mais antiga ainda por
    -- ligar) é anterior a hoje em Lisboa. Cliente: nunca, até haver prazo de
    -- negócio (D20).
    COALESCE(CASE WHEN cl.cid IS NULL AND ld.lid IS NOT NULL AND ld.lclosure IS NULL THEN
               (LEAST(public.fn_neg_proximo_contacto(p_organization_id, pg.ent), vs.por_fazer_desde)
                AT TIME ZONE 'Europe/Lisbon')::date < v_hoje END, false)::boolean
  FROM pagina pg
  LEFT JOIN public.anew_entities e2 ON e2.id = pg.ent
  LEFT JOIN LATERAL (
    SELECT l.id AS lid, l.status::text AS lstatus, l.closure_result AS lclosure, l.assigned_to AS lassigned,
           l.qualification_type AS lqualif, l.last_activity_at AS lativ, l.last_contact_at AS lcontacto,
           l.last_contact_result AS lresultado,
           l.source AS lsource, l.origin AS lorigin, l.campaign_id AS lcamp
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = pg.ent AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 1
  ) ld ON true
  LEFT JOIN LATERAL (
    SELECT c.id AS cid, c.assigned_to AS cassigned, c.created_at AS ccriado
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.entity_id = pg.ent AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1
  ) cl ON true
  LEFT JOIN LATERAL (
    -- ids de todas as leads da pessoa (sondas por índice nas visitas)
    SELECT COALESCE(array_agg(l.id), ARRAY[]::uuid[]) AS ids,
           min(l.created_at) FILTER (WHERE l.deleted_at IS NULL) AS criado_min
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = pg.ent
  ) lds ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE n.estado = 'aberto')  AS abertos,
           count(*) FILTER (WHERE n.estado = 'ganho')   AS ganhos,
           count(*) FILTER (WHERE n.estado = 'perdido') AS perdidos,
           max(n.created_at) AS ultimo_em
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent AND n.deleted_at IS NULL
  ) ng ON true
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM public.client_contracts cc JOIN public.negocios n ON n.id = cc.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL AND cc.deleted_at IS NULL) THEN 'contrato'
      WHEN EXISTS (SELECT 1 FROM public.proposals pr JOIN public.negocios n ON n.id = pr.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL
                     AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE) THEN 'proposta'
      WHEN EXISTS (SELECT 1 FROM public.quotes q JOIN public.negocios n ON n.id = q.negocio_id
                   WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
                     AND n.estado = 'aberto' AND n.deleted_at IS NULL AND q.deleted_at IS NULL) THEN 'orcamento'
    END AS fase
  ) fs ON true
  LEFT JOIN LATERAL (
    SELECT sum(public.fn_neg_valor_negocio(n.id)) AS valor,
           bool_or(CASE
             WHEN v_momento = 'proposta_aceite' THEN EXISTS (
               SELECT 1 FROM public.proposals pr
               WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                 AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
             WHEN v_momento = 'contrato_assinado' THEN EXISTS (
               SELECT 1 FROM public.client_contracts cc
               WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado') AND cc.deleted_at IS NULL)
             ELSE false
           END) AS pronto
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = pg.ent
      AND n.estado = 'aberto' AND n.deleted_at IS NULL
  ) vl ON true
  LEFT JOIN LATERAL (
    SELECT max(i.interaction_at) AS ultimo,
           count(*) FILTER (WHERE i.negocio_id IS NULL
                              AND i.interaction_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           (array_agg(i.result ORDER BY i.interaction_at DESC, i.id DESC))[1] AS resultado
    FROM public.entity_interactions i
    WHERE i.entity_id = pg.ent AND i.organization_id = p_organization_id AND i.interaction_type = 'call'
  ) ct ON true
  LEFT JOIN LATERAL (
    SELECT min(s.start_datetime) FILTER (
             WHERE s.start_datetime >= now()
               AND s.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(s.start_datetime) FILTER (WHERE s.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE s.lead_id IS NOT NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           min(s.start_datetime) FILTER (
             WHERE s.negocio_id IS NULL
               AND s.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)
               AND s.start_datetime > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)) AS por_fazer_desde
    FROM (
      -- dois ramos por índice, sem OR sobre subconsulta: pelas leads e pelo cliente
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE si.lead_id = ANY (lds.ids)
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
      UNION ALL
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE cl.cid IS NOT NULL AND si.client_id = cl.cid
        AND (si.lead_id IS NULL OR si.lead_id <> ALL (lds.ids))
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
    ) s
  ) vs ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS por_ligar
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = pg.ent
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(ng.ultimo_em, '-infinity'::timestamptz)
  ) lv ON true
  LEFT JOIN LATERAL (
    -- origem da lead mostrada: campanha e formulário, como na ficha
    SELECT ca.name AS cnome, f.id AS fid, f.name AS fnome
    FROM public.campaigns ca
    LEFT JOIN public.forms f ON f.id = ca.form_id
    WHERE ca.id = ld.lcamp
  ) cp ON true
  WHERE pg.rn <= p_limite
  ORDER BY pg.rn;
END;
$function$;

CREATE OR REPLACE FUNCTION public.neg_ficha_pessoa(
  p_organization_id uuid,
  p_entity_id uuid,
  p_limite integer DEFAULT 30,
  p_depois jsonb DEFAULT NULL,
  p_partes text[] DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_temp
  SET statement_timeout = '5s'
AS $function$
DECLARE
  v_momento   text;
  v_base      boolean;
  v_lead      public.anew_leads;
  v_cli       public.anew_clients;
  v_lds       uuid[];
  v_pessoa    jsonb;
  v_lead_j    jsonb;
  v_abertas   jsonb;
  v_agreg     jsonb;
  v_perm      jsonb;
  v_negocios  jsonb;
  v_docs      jsonb;
  v_ng        record;
  v_ct        record;
  v_vs        record;
  v_lv_por    bigint;
  v_etapa     text;
  v_res       jsonb;
BEGIN
  -- 1. Valores
  IF p_limite IS NULL OR p_limite < 1 OR p_limite > 100
     OR (p_partes IS NOT NULL AND (cardinality(p_partes) = 0 OR EXISTS (
           SELECT 1 FROM unnest(p_partes) AS x(parte)
           WHERE x.parte IS NULL
              OR x.parte NOT IN ('base', 'contactos', 'visitas', 'levantamentos', 'atividade'))))
     OR (p_depois IS NOT NULL AND jsonb_typeof(p_depois) NOT IN ('object', 'null')) THEN
    RAISE EXCEPTION 'Valor inválido: limite (1 a 100), partes ou páginas.' USING ERRCODE = 'NG009';
  END IF;
  IF jsonb_typeof(p_depois) = 'object' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_depois) AS k(chave)
               WHERE k.chave NOT IN ('contactos', 'visitas', 'levantamentos', 'atividade')) THEN
      RAISE EXCEPTION 'Valor inválido: páginas.' USING ERRCODE = 'NG009';
    END IF;
  END IF;

  -- 2. Guardas, antes de qualquer leitura de registos; as secções não as
  --    repetem para esta organização e pessoa nesta transacção.
  v_momento := public.fn_neg_exigir_config(p_organization_id);
  PERFORM public.fn_neg_exigir_pessoa(p_organization_id, p_entity_id);
  PERFORM set_config('app.neg_ficha_verificada',
                     p_organization_id::text || ':' || p_entity_id::text, true);

  v_base := p_partes IS NULL OR 'base' = ANY (p_partes);

  IF v_base THEN
    -- A lead (a mais recente viva) e o cliente (o mais antigo vivo), como no resumo.
    SELECT l.* INTO v_lead
    FROM public.anew_leads l
    WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id AND l.deleted_at IS NULL
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 1;
    SELECT c.* INTO v_cli
    FROM public.anew_clients c
    WHERE c.organization_id = p_organization_id AND c.entity_id = p_entity_id AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT 1;
    v_lds := ARRAY(SELECT l.id FROM public.anew_leads l
                   WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                     AND l.deleted_at IS NULL);

    -- Agregados: os mesmos predicados de neg_resumo_pessoas.
    SELECT count(*) FILTER (WHERE n.estado = 'aberto')  AS abertos,
           count(*) FILTER (WHERE n.estado = 'ganho')   AS ganhos,
           count(*) FILTER (WHERE n.estado = 'perdido') AS perdidos,
           count(*) AS total,
           max(n.created_at) AS ultimo_em
      INTO v_ng
    FROM public.negocios n
    WHERE n.organization_id = p_organization_id AND n.entity_id = p_entity_id AND n.deleted_at IS NULL;

    SELECT max(i.interaction_at) AS ultimo,
           count(*) FILTER (WHERE i.negocio_id IS NULL
                              AND i.interaction_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar,
           count(*) AS total
      INTO v_ct
    FROM public.entity_interactions i
    WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id AND i.interaction_type = 'call';

    SELECT min(s.start_datetime) FILTER (
             WHERE s.start_datetime >= now()
               AND s.status NOT IN ('cancelled'::public.schedule_item_status, 'completed'::public.schedule_item_status)) AS proxima,
           max(s.start_datetime) FILTER (WHERE s.status = 'completed'::public.schedule_item_status) AS ultima_feita,
           count(*) FILTER (WHERE s.lead_id IS NOT NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status) AS visitas_lead,
           count(*) FILTER (WHERE s.negocio_id IS NULL
                              AND s.status <> 'cancelled'::public.schedule_item_status
                              AND s.start_datetime > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz)) AS por_ligar
      INTO v_vs
    FROM (
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE si.lead_id = ANY (v_lds)
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
      UNION ALL
      SELECT si.start_datetime, si.status, si.lead_id, si.negocio_id
      FROM public.schedule_items si
      WHERE v_cli.id IS NOT NULL AND si.client_id = v_cli.id
        AND (si.lead_id IS NULL OR si.lead_id <> ALL (v_lds))
        AND si.organization_id = p_organization_id
        AND si.time_off_type IS NULL AND si.vacation_id IS NULL
    ) s;

    SELECT count(*) INTO v_lv_por
    FROM public.levantamentos lt
    WHERE lt.organization_id = p_organization_id AND lt.entity_id = p_entity_id
      AND lt.negocio_id IS NULL AND lt.deleted_at IS NULL
      AND lt.created_at > COALESCE(v_ng.ultimo_em, '-infinity'::timestamptz);

    v_etapa := CASE
      WHEN v_cli.id IS NOT NULL THEN 'cliente'
      WHEN v_ng.abertos > 0 THEN 'qualificada'
      WHEN v_vs.visitas_lead > 0 THEN 'visitaMarcada'
      WHEN v_ct.ultimo IS NOT NULL THEN 'emContacto'
      ELSE 'nova'
    END;

    v_agreg := jsonb_build_object(
      'ultimo_contacto_em', v_ct.ultimo,
      'ultimo_resultado', (SELECT i.result FROM public.entity_interactions i
                           WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
                             AND i.interaction_type = 'call'
                           ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1),
      'proximo_contacto_em', public.fn_neg_proximo_contacto(p_organization_id, p_entity_id),
      -- 20261225150000: o contacto EFECTIVO, a regra da Lista (ultimo_resultado):
      -- o mais recente entre a última chamada (acima) e o último contacto
      -- guardado na lead mostrada pela página de Leads (last_contact_at e
      -- last_contact_result); em empate ganha a chamada. É o que a UI deve usar.
      'ultimo_contacto_efetivo_em', GREATEST(v_ct.ultimo, v_lead.last_contact_at),
      'ultimo_resultado_efetivo', CASE
         WHEN v_ct.ultimo IS NULL AND v_lead.last_contact_at IS NULL THEN NULL
         WHEN v_lead.last_contact_at IS NULL OR v_ct.ultimo >= v_lead.last_contact_at THEN
           (SELECT i.result FROM public.entity_interactions i
            WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
              AND i.interaction_type = 'call'
            ORDER BY i.interaction_at DESC, i.id DESC LIMIT 1)
         ELSE v_lead.last_contact_result::text END,
      'ultima_visita_feita_em', v_vs.ultima_feita,
      'proxima_visita_em', v_vs.proxima,
      'por_ligar', jsonb_build_object('contactos', v_ct.por_ligar, 'visitas', v_vs.por_ligar,
                                      'levantamentos', v_lv_por),
      'negocios', jsonb_build_object('abertos', v_ng.abertos, 'ganhos', v_ng.ganhos,
                                     'perdidos', v_ng.perdidos),
      'total_contactos', v_ct.total,
      'total_visitas', (SELECT count(*)
                        FROM (SELECT si.id FROM public.schedule_items si
                              WHERE si.lead_id = ANY (v_lds) AND si.organization_id = p_organization_id
                              UNION
                              SELECT si.id FROM public.schedule_items si
                              WHERE si.organization_id = p_organization_id
                                AND si.client_id IN (SELECT c.id FROM public.anew_clients c
                                                     WHERE c.organization_id = p_organization_id
                                                       AND c.entity_id = p_entity_id
                                                       AND c.deleted_at IS NULL)) ids
                        JOIN public.schedule_items s ON s.id = ids.id
                        LEFT JOIN public.schedule_boards b ON b.id = s.board_id
                        WHERE s.time_off_type IS NULL AND s.vacation_id IS NULL
                          AND s.status <> 'cancelled'::public.schedule_item_status
                          AND (b.board_type IS NULL OR b.board_type NOT IN ('time_off', 'fleet'))),
      'total_levantamentos', (SELECT count(*) FROM public.levantamentos lt
                              WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
                                AND lt.deleted_at IS NULL),
      'total_atividade', (SELECT count(*) FROM public.entity_interactions i
                          WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id));

    -- Pessoa
    SELECT jsonb_build_object(
      'id', p_entity_id,
      'nome', e.display_name,
      'papel', CASE WHEN v_cli.id IS NOT NULL THEN 'cliente' ELSE 'lead' END,
      'lead_id', v_lead.id,
      'client_id', v_cli.id,
      'responsavel_id', COALESCE(v_cli.assigned_to, v_lead.assigned_to),
      'responsavel_nome', (SELECT u.name FROM public.anew_users u
                           WHERE u.id = COALESCE(v_cli.assigned_to, v_lead.assigned_to)),
      'etapa', v_etapa,
      'desde', LEAST((SELECT min(l.created_at) FROM public.anew_leads l
                      WHERE l.organization_id = p_organization_id AND l.entity_id = p_entity_id
                        AND l.deleted_at IS NULL),
                     v_cli.created_at),
      'contacto', jsonb_build_object(
        'telefone', (SELECT ph.phone_number FROM public.anew_entity_phones ph
                     WHERE ph.entity_id = p_entity_id
                     ORDER BY ph.is_primary IS TRUE DESC, ph.created_at DESC, ph.id DESC LIMIT 1),
        'email', (SELECT em.email FROM public.anew_entity_emails em
                  WHERE em.entity_id = p_entity_id
                  ORDER BY em.is_primary IS TRUE DESC, em.created_at DESC, em.id DESC LIMIT 1)),
      'morada', (SELECT jsonb_build_object(
                          'rua', NULLIF(btrim(concat_ws(' ', a.street, a.number)), ''),
                          'codigo_postal', a.postal_code, 'localidade', a.city,
                          'andar', a.floor, 'distrito', a.district)
                 FROM public.anew_entity_addresses ea
                 JOIN public.anew_addresses a ON a.id = ea.address_id
                 WHERE ea.entity_id = p_entity_id
                   AND (ea.valid_to IS NULL OR ea.valid_to > now())
                 ORDER BY ea.is_primary IS TRUE DESC, ea.created_at DESC, ea.id DESC
                 LIMIT 1),
      -- As respostas da aba Qualificação do levantamento vivo mais recente que as tenha.
      'qualificacao', (SELECT jsonb_object_agg(lr.pergunta, lr.resposta)
                       FROM public.levantamento_respostas lr
                       WHERE lr.seccao = 'qualificacao'
                         AND lr.levantamento_id = (
                           SELECT lt.id FROM public.levantamentos lt
                           WHERE lt.entity_id = p_entity_id AND lt.organization_id = p_organization_id
                             AND lt.deleted_at IS NULL
                             AND EXISTS (SELECT 1 FROM public.levantamento_respostas q
                                         WHERE q.levantamento_id = lt.id AND q.seccao = 'qualificacao')
                           ORDER BY lt.data_levantamento DESC, lt.created_at DESC, lt.id DESC
                           LIMIT 1)),
      'origem', CASE WHEN v_lead.id IS NULL THEN NULL ELSE jsonb_build_object(
                  'origin', v_lead.origin,
                  'source', v_lead.source,
                  'campanha_id', v_lead.campaign_id,
                  'campanha', (SELECT ca.name FROM public.campaigns ca WHERE ca.id = v_lead.campaign_id),
                  'formulario_id', (SELECT f.id FROM public.campaigns ca
                                    JOIN public.forms f ON f.id = ca.form_id
                                    WHERE ca.id = v_lead.campaign_id),
                  'formulario', (SELECT f.name FROM public.campaigns ca
                                 JOIN public.forms f ON f.id = ca.form_id
                                 WHERE ca.id = v_lead.campaign_id)) END,
      'nif', NULL,
      'empresa', NULL,
      -- 20261225150000: MQL/SQL da lead mostrada (v_lead); as respostas da aba
      -- Qualificação continuam na chave 'qualificacao', acima.
      'qualificacao_tipo', v_lead.qualification_type,
      -- «Voltou a contactar»: a regra da página de Leads, contando também as
      -- chamadas registadas (entity_interactions 'call', onde escreve
      -- neg_registar_contacto).
      'ultima_atividade_em', v_lead.last_activity_at,
      'ultimo_contacto_lead_em', v_lead.last_contact_at,
      'voltou_a_contactar', (v_lead.last_activity_at IS NOT NULL
                             AND (GREATEST(v_lead.last_contact_at, v_ct.ultimo) IS NULL
                                  OR v_lead.last_activity_at > GREATEST(v_lead.last_contact_at, v_ct.ultimo))),
      -- Identidade: tipo da entidade, nome da empresa (organização) e se há
      -- NIF, só em leitura. O NIF nunca sai daqui, nem o id da entidade
      -- fiscal: só se há uma ligação fiscal PRINCIPAL em vigor.
      'tipo', e.type,
      'empresa_nome', CASE WHEN e.type = 'organization' THEN e.display_name END,
      'tem_nif', fe.fid IS NOT NULL)
      INTO v_pessoa
    FROM (SELECT 1) AS um
    LEFT JOIN public.anew_entities e ON e.id = p_entity_id
    LEFT JOIN LATERAL (
      SELECT aef.fiscal_entity_id AS fid
      FROM public.anew_entity_fiscal_entities aef
      WHERE aef.entity_id = p_entity_id AND aef.is_primary IS TRUE
        AND (aef.valid_to IS NULL OR aef.valid_to > now())
      ORDER BY aef.created_at DESC, aef.id DESC
      LIMIT 1
    ) fe ON true;

    -- Lead e encerramento (a nota 'Abordagem encerrada' mais recente).
    IF v_lead.id IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id', v_lead.id,
        'estado', v_lead.status,
        'aberta', public.fn_neg_lead_aberta(v_lead.status::text) AND v_lead.closure_result IS NULL,
        'encerramento', CASE WHEN v_lead.closure_result IS NULL THEN NULL ELSE jsonb_build_object(
          'resultado', v_lead.closure_result,
          'motivo', nt.result,
          'motivo_outro', CASE WHEN nt.result = 'outro' THEN nt.notes END,
          'em', nt.interaction_at) END)
        INTO v_lead_j
      FROM (SELECT 1) AS um
      LEFT JOIN LATERAL (
        SELECT i.result, i.notes, i.interaction_at
        FROM public.entity_interactions i
        WHERE i.entity_id = p_entity_id AND i.organization_id = p_organization_id
          AND i.interaction_type = 'note' AND i.subject = 'Abordagem encerrada'
        ORDER BY i.interaction_at DESC, i.id DESC
        LIMIT 1
      ) nt ON true;
    END IF;

    v_abertas := (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                           'id', l.id, 'status', l.status, 'created_at', l.created_at,
                           'closure_result', l.closure_result) ORDER BY l.created_at DESC, l.id DESC), '[]'::jsonb)
                  FROM (SELECT l1.* FROM public.anew_leads l1
                        WHERE l1.organization_id = p_organization_id AND l1.entity_id = p_entity_id
                          AND l1.deleted_at IS NULL AND public.fn_neg_lead_aberta(l1.status::text)
                        ORDER BY l1.created_at DESC, l1.id DESC
                        LIMIT 20) l);

    v_perm := jsonb_build_object(
      'editar', public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.edit'),
      'criar',  public.fn_neg_tem_permissao_org(p_organization_id, 'pessoas.create'));

    -- Negócios (até 50, recentes primeiro), com documentos e os últimos 10 eventos.
    v_negocios := jsonb_build_object(
      'total', v_ng.total,
      'itens', (SELECT COALESCE(jsonb_agg(x.item ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)
                FROM (
                  SELECT n.id, n.created_at,
                    jsonb_build_object(
                      'id', n.id, 'titulo', n.titulo, 'notas', n.notas, 'estado', n.estado,
                      'criado_em', n.created_at, 'ganho_em', n.ganho_em, 'perdido_em', n.perdido_em,
                      'fase_perda', n.fase_perda, 'motivo_perda', n.motivo_perda,
                      'responsavel_id', n.assigned_to,
                      'responsavel_nome', (SELECT u.name FROM public.anew_users u WHERE u.id = n.assigned_to),
                      'valor', public.fn_neg_valor_negocio(n.id),
                      'pronto_a_ganhar', n.estado = 'aberto' AND CASE
                        WHEN v_momento = 'proposta_aceite' THEN EXISTS (
                          SELECT 1 FROM public.proposals pr
                          WHERE pr.negocio_id = n.id AND pr.status = 'accepted'
                            AND pr.deleted_at IS NULL AND pr.is_deleted IS NOT TRUE)
                        WHEN v_momento = 'contrato_assinado' THEN EXISTS (
                          SELECT 1 FROM public.client_contracts cc
                          WHERE cc.negocio_id = n.id AND cc.status IN ('signed', 'assinado')
                            AND cc.deleted_at IS NULL)
                        ELSE false END,
                      'parado_desde', CASE WHEN n.estado = 'aberto'
                                           THEN public.fn_neg_parado_desde(n.id) END,
                      'levantamento_id', (SELECT lt.id FROM public.levantamentos lt
                                          WHERE lt.negocio_id = n.id AND lt.deleted_at IS NULL LIMIT 1),
                      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                                       'total', q.total, 'criado_em', q.created_at)
                                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                                     FROM public.quotes q
                                     WHERE q.negocio_id = n.id AND q.deleted_at IS NULL),
                      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                                      'criado_em', pr.created_at)
                                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                                    FROM public.proposals pr
                                    WHERE pr.negocio_id = n.id AND pr.deleted_at IS NULL
                                      AND pr.is_deleted IS NOT TRUE),
                      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                                      'criado_em', cc.created_at,
                                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                                    FROM public.client_contracts cc
                                    WHERE cc.negocio_id = n.id AND cc.deleted_at IS NULL),
                      'eventos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                    'id', ev.id, 'tipo', ev.tipo, 'fase', ev.fase, 'motivo', ev.motivo,
                                    'motivo_reabertura', ev.motivo_reabertura, 'criado_em', ev.created_at,
                                    'criado_por_nome', (SELECT u.name FROM public.anew_users u
                                                        WHERE u.id = ev.created_by))
                                    ORDER BY ev.created_at DESC, ev.id DESC), '[]'::jsonb)
                                  FROM (SELECT e1.* FROM public.negocio_eventos e1
                                        WHERE e1.negocio_id = n.id
                                        ORDER BY e1.created_at DESC, e1.id DESC
                                        LIMIT 10) ev)
                    ) AS item
                  FROM (SELECT n1.* FROM public.negocios n1
                        WHERE n1.organization_id = p_organization_id AND n1.entity_id = p_entity_id
                          AND n1.deleted_at IS NULL
                        ORDER BY n1.created_at DESC, n1.id DESC
                        LIMIT 50) n
                ) x));

    -- Documentos da pessoa ainda sem negócio (até 50 de cada).
    v_docs := jsonb_build_object(
      'orcamentos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id', q.id, 'numero', q.quote_number, 'estado', q.estado,
                       'total', q.total, 'criado_em', q.created_at)
                       ORDER BY q.created_at DESC, q.id DESC), '[]'::jsonb)
                     FROM (SELECT q1.* FROM public.quotes q1
                           WHERE q1.entity_id = p_entity_id AND q1.organization_id = p_organization_id
                             AND q1.deleted_at IS NULL AND q1.negocio_id IS NULL
                           ORDER BY q1.created_at DESC, q1.id DESC LIMIT 50) q),
      'propostas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', pr.id, 'numero', pr.proposal_number, 'titulo', pr.title,
                      'status', pr.status, 'valor', pr.value, 'valid_until', pr.valid_until,
                      'terms', pr.terms, 'enviada_em', pr.sent_at, 'aceite_em', pr.accepted_at,
                      'criado_em', pr.created_at)
                      ORDER BY pr.created_at DESC, pr.id DESC), '[]'::jsonb)
                    FROM (SELECT p1.* FROM public.proposals p1
                          WHERE p1.entity_id = p_entity_id AND p1.organization_id = p_organization_id
                            AND p1.deleted_at IS NULL AND p1.is_deleted IS NOT TRUE AND p1.negocio_id IS NULL
                          ORDER BY p1.created_at DESC, p1.id DESC LIMIT 50) pr),
      'contratos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                      'id', cc.id, 'numero', cc.contract_number, 'status', cc.status,
                      'valor', cc.total_value, 'assinado_em', cc.signature_date,
                      'criado_em', cc.created_at,
                      'tem_base', cc.quote_id IS NOT NULL OR cc.proposal_id IS NOT NULL)
                      ORDER BY cc.created_at DESC, cc.id DESC), '[]'::jsonb)
                    FROM (SELECT c1.* FROM public.client_contracts c1
                          WHERE c1.entity_id = p_entity_id AND c1.organization_id = p_organization_id
                            AND c1.deleted_at IS NULL AND c1.negocio_id IS NULL
                          ORDER BY c1.created_at DESC, c1.id DESC LIMIT 50) cc));
  END IF;

  v_res := jsonb_build_object(
    'pessoa', v_pessoa,
    'lead', v_lead_j,
    'leads_abertas', v_abertas,
    'agregados', v_agreg,
    'permissoes', v_perm,
    'negocios', v_negocios,
    'documentos_por_ligar', v_docs,
    'contactos', CASE WHEN p_partes IS NULL OR 'contactos' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'contactos', p_limite,
                                              p_depois -> 'contactos') END,
    'visitas', CASE WHEN p_partes IS NULL OR 'visitas' = ANY (p_partes) THEN
                 public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'visitas', p_limite,
                                            p_depois -> 'visitas') END,
    'levantamentos', CASE WHEN p_partes IS NULL OR 'levantamentos' = ANY (p_partes) THEN
                       public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'levantamentos', p_limite,
                                                  p_depois -> 'levantamentos') END,
    'atividade', CASE WHEN p_partes IS NULL OR 'atividade' = ANY (p_partes) THEN
                   public.fn_neg_ficha_seccao(p_organization_id, p_entity_id, 'atividade', p_limite,
                                              p_depois -> 'atividade') END);

  -- Repõe a marca: as guardas só ficam dispensadas durante esta chamada.
  PERFORM set_config('app.neg_ficha_verificada', '', true);
  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.neg_resumo_pessoas(uuid, text, text, text, text, text, uuid, integer, uuid, uuid, text, boolean, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.neg_ficha_pessoa(uuid, uuid, integer, jsonb, text[]) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_ambito_pessoas(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_neg_pesquisa_pessoas(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_pesquisa_pessoas(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_neg_filtro_pessoas(uuid, uuid, uuid, text, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_neg_filtro_pessoas(uuid, uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_resumo_pessoas(uuid, text, text, text, text, text, uuid, integer, uuid, uuid, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.neg_ficha_pessoa(uuid, uuid, integer, jsonb, text[]) TO authenticated;

-- CONFERIR
DO $$
DECLARE
  v_txt text;
BEGIN
  -- 1. as duas funções: uma só de cada, INVOKER, STABLE, search_path e
  --    statement_timeout fixos, EXECUTE só para authenticated
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
      WHERE s.nspname = 'public' AND p.proname IN ('neg_resumo_pessoas', 'neg_ficha_pessoa')) <> 2 THEN
    RAISE EXCEPTION 'CONFERIR (1. sobrecargas de neg_resumo_pessoas ou neg_ficha_pessoa)';
  END IF;
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.neg_resumo_pessoas(uuid,text,text,text,text,text,uuid,integer,uuid,uuid,text,boolean,boolean)'),
              ('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])')
            ) AS e(sig)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR p.prosecdef
               OR p.provolatile::text <> 's'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp,statement_timeout=5s'
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
               OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS x
                          WHERE x.grantee = 0));
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (1. atributos ou permissões): %', v_txt;
  END IF;

  -- 1a. as auxiliares DEFINER (pesquisa e filtros): STABLE, search_path e statement_timeout fixos, só authenticated
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_pesquisa_pessoas(uuid,text)',     'TABLE(entity_id uuid)'),
              ('public.fn_neg_filtro_pessoas(uuid,uuid,uuid,text,boolean)', 'uuid[]')
            ) AS e(sig, res)
            LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.sig)
            WHERE p.oid IS NULL
               OR NOT p.prosecdef
               OR p.provolatile::text <> 's'
               OR array_to_string(p.proconfig, ',') IS DISTINCT FROM 'search_path=public, pg_temp,statement_timeout=5s'
               OR pg_get_function_result(p.oid) <> e.res
               OR has_function_privilege('anon', p.oid, 'EXECUTE')
               OR has_function_privilege('service_role', p.oid, 'EXECUTE')
               OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
               OR EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS x
                          WHERE x.grantee = 0));
  IF v_txt IS NOT NULL
     OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
         WHERE s.nspname = 'public'
           AND p.proname IN ('fn_neg_localidade_pessoas', 'fn_neg_pesquisa_pessoas', 'fn_neg_ambito_pessoas',
                             'fn_neg_filtro_pessoas')) <> 3 THEN
    RAISE EXCEPTION 'CONFERIR (1a. auxiliares): %', COALESCE(v_txt, 'sobrecargas');
  END IF;

  -- 1c. a privada: INVOKER, STABLE, search_path fixo, sem EXECUTE para ninguém
  IF NOT EXISTS (SELECT 1 FROM pg_proc p
                 WHERE p.oid = to_regprocedure('public.fn_neg_ambito_pessoas(uuid)')
                   AND NOT p.prosecdef AND p.provolatile::text = 's'
                   AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
                   AND pg_get_function_result(p.oid) = 'record'
                   AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
                   AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
                   AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS x
                                   WHERE x.grantee = 0)) THEN
    RAISE EXCEPTION 'CONFERIR (1c. fn_neg_ambito_pessoas)';
  END IF;

  -- 1b. o retorno novo do resumo (colunas antigas na mesma ordem, novas no fim)
  --     e as chaves novas da ficha
  IF to_regprocedure('public.neg_resumo_pessoas(uuid,text,text,text,text,text,uuid,integer)') IS NOT NULL
     OR pg_get_function_result(to_regprocedure('public.neg_resumo_pessoas(uuid,text,text,text,text,text,uuid,integer,uuid,uuid,text,boolean,boolean)'))
     NOT LIKE 'TABLE(entity_id uuid, nome text, papel text, lead_id uuid, client_id uuid, assigned_to uuid, lead_status text, closure_result text, etapa text, negocios_abertos integer, negocios_ganhos integer, negocios_perdidos integer, fase_mais_avancada text, pronto_a_ganhar boolean, valor_em_jogo numeric, ultimo_contacto_em timestamp with time zone, proxima_visita_em timestamp with time zone, ultima_visita_feita_em timestamp with time zone, ultimo_negocio_em timestamp with time zone, por_ligar_contactos integer, por_ligar_visitas integer, por_ligar_levantamentos integer, chave_ordem text, ha_mais boolean, criado_em timestamp with time zone, qualificacao_tipo text, ultima_atividade_em timestamp with time zone, ultimo_contacto_lead_em timestamp with time zone, voltou_a_contactar boolean, origem text, origem_detalhe text, campanha_id uuid, campanha text, formulario_id uuid, formulario text, ultimo_resultado text, atrasada boolean)'
     OR NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure('public.neg_ficha_pessoa(uuid,uuid,integer,jsonb,text[])')
                      AND p.prosrc NOT LIKE '%''fiscal_entity_id''%'
                      AND p.prosrc LIKE '%qualificacao_tipo%' AND p.prosrc LIKE '%voltou_a_contactar%'
                      AND p.prosrc LIKE '%tem_nif%' AND p.prosrc LIKE '%''nif'', NULL%'
                      AND p.prosrc LIKE '%''ultimo_contacto_efetivo_em'', GREATEST(v_ct.ultimo, v_lead.last_contact_at)%'
                      AND p.prosrc LIKE '%''ultimo_resultado_efetivo''%'
                      AND p.prosrc LIKE '%''ultimo_resultado'', (SELECT i.result%'
                      AND p.prosrc LIKE '%''ultimo_contacto_em'', v_ct.ultimo,%') THEN
    RAISE EXCEPTION 'CONFERIR (1b. retorno do resumo ou chaves da ficha)';
  END IF;

  -- 2. funções de que dependem, iguais (md5 lidos no remoto a 19/10)
  v_txt := (SELECT string_agg(e.sig, ',')
            FROM (VALUES
              ('public.fn_neg_valor_negocio(uuid)',              '2d3b4bc5cdbdb147b6638a2411506298'),
              ('public.fn_neg_exigir_config(uuid)',              '566f127b4f3cea295f04c916e366cd5d'),
              ('public.fn_neg_exigir_pessoa(uuid,uuid)',         '4dbbe481640899b70e05dc3d5ea2f4c5'),
              ('public.fn_neg_ficha_seccao(uuid,uuid,text,integer,jsonb)', 'd0d0aaa314790c12c0d3b09bd266645e'),
              ('public.fn_neg_proximo_contacto(uuid,uuid)',      'acd81b813493fbe56749ddad84707415'),
              ('public.fn_neg_lead_aberta(text)',                'cb988326544ed75840624bfb78e55b7f'),
              ('public.fn_neg_tem_permissao_org(uuid,text)',     '05943a6cfb0382a07322870262170c8d'),
              ('public.fn_neg_parado_desde(uuid)',               '6880ca16d273c18b58416e657626886f'),
              ('public.get_user_crm_org_ids(uuid)',              '29782031244dd3b0842ca43b271e2bf1'),
              ('public.get_user_visible_org_ids(uuid)',          '5e7a5637345b1f527487d6193b60d52d'),
              ('public.has_anew_permission(uuid,text)',          '8f69ed134c7d20e080d8c5a4161a3151'),
              ('public.resolve_lead_access_context(uuid,text,text)', '52cdb3e4bf1f3fa927270e178d9a2fe6'),
              ('public.is_system_admin(uuid)',                   '159035010036f0045b091808cf9f77ef')
            ) AS e(sig, h)
            WHERE to_regprocedure(e.sig) IS NULL
               OR md5(pg_get_functiondef(to_regprocedure(e.sig))) <> e.h);
  IF v_txt IS NOT NULL THEN
    RAISE EXCEPTION 'CONFERIR (2. funções de que dependem mudaram): %', v_txt;
  END IF;

  -- 3. colunas novas lidas, com o tipo esperado
  IF (SELECT count(*)
      FROM (VALUES
        ('anew_leads', 'qualification_type', 'text'),
        ('anew_leads', 'last_activity_at', 'timestamp with time zone'),
        ('anew_leads', 'last_contact_at', 'timestamp with time zone'),
        ('anew_leads', 'source', 'character varying'),
        ('anew_leads', 'origin', 'text'),
        ('anew_leads', 'campaign_id', 'uuid'),
        ('campaigns', 'name', 'text'),
        ('campaigns', 'form_id', 'uuid'),
        ('forms', 'name', 'text'),
        ('anew_entity_addresses', 'valid_to', 'timestamp with time zone'),
        ('anew_entity_addresses', 'is_primary', 'boolean'),
        ('anew_addresses', 'city', 'text'),
        ('anew_addresses', 'district', 'text'),
        ('anew_leads', 'created_by', 'uuid'),
        ('anew_clients', 'created_by', 'uuid'),
        ('anew_entity_roles', 'deleted_at', 'timestamp with time zone'),
        ('anew_entities', 'type', 'text'),
        ('anew_entity_fiscal_entities', 'fiscal_entity_id', 'uuid'),
        ('anew_entity_fiscal_entities', 'valid_to', 'timestamp with time zone'),
        ('anew_entity_emails', 'email', 'text'),
        ('anew_entity_phones', 'phone_number', 'text'),
        ('entity_interactions', 'result', 'text'),
        ('anew_leads', 'assigned_to', 'uuid'),
        ('anew_clients', 'assigned_to', 'uuid'),
        ('anew_leads', 'last_contact_result', 'character varying')
      ) AS e(t, c, ty)
      JOIN pg_attribute a ON a.attrelid = to_regclass('public.' || e.t)
                         AND a.attname::text = e.c AND NOT a.attisdropped
                         AND format_type(a.atttypid, a.atttypmod) = e.ty) <> 25 THEN
    RAISE EXCEPTION 'CONFERIR (3. colunas lidas)';
  END IF;
END;
$$;

COMMIT;
