-- ==============================================================================
-- 20261210420000_hr_admissao_processo_e_eventos.sql
--
-- V2 DA ADMISSAO (etapa E2): o convite passa a ser um PROCESSO de admissao, com
-- estado proprio, historico de eventos imutavel, uma criacao que recusa um
-- segundo processo aberto, e as duas accoes minimas do RH sobre um processo
-- aberto: cancelar e prolongar.
--
-- POR APLICAR. Ordem na dev: 20261210390000 (V0, so da dev) ->
-- 20261210400000 (V1) -> 20261210410000 (so da dev) -> ESTA.
-- 20261210390000 e 20261210410000 vivem SO na vault
-- (vault/ficheiros/recursos-humanos/so-na-base-de-dev): depois do push tem de
-- continuar na pasta de trabalho local de onde se faz o push, como as outras
-- quatro so da dev, senao o "migration list" passa a mostra-las so no remoto.
-- A guarda recusa-se a correr enquanto houver um rascunho fora da lista branca
-- (hoje ha um, com NISS: e a V0 que o apaga).
--
--
-- -- CODIGO QUE TEM DE ENTRAR COM ESTA MIGRATION ---------------------------------
--
-- A Edge convite-admissao tem de ser PUBLICADA IMEDIATAMENTE a seguir ao push:
-- entre o push e a Edge nova NINGUEM CONSEGUE CONVIDAR (a _criar passa a exigir
-- um p_actor com permissao e recusa o resto).
-- 1. Edge convite-admissao, accao "criar": valida o JWT, deriva p_actor do JWT
--    (nunca do corpo do pedido), confirma que a organizacao da pessoa e a
--    activeCompany, GERA o token e o hash, e chama a RPC com a chave de servico.
--    Mapeia os codigos novos (abaixo) e deixa de esperar rascunho_herdado = true.
-- 2. Edge convite-admissao, accoes NOVAS "cancelar" e "prolongar": com o JWT do
--    utilizador (cliente do utilizador, nao a chave de servico), passando a
--    activeCompany em p_organization_id.
-- 3. Edge convite-admissao, accao "rascunho": RETIRAR niss, iban e
--    conta_numero (e qualquer chave fora da lista branca) ANTES de chamar a RPC,
--    e VALIDAR POR FORMATO cada chave (um IBAN escrito num campo de texto
--    permitido nao se trava em SQL: a base so garante chaves, tipos e tamanhos).
--    Sem isto, o primeiro rascunho com NISS ou IBAN e recusado por inteiro
--    (23514) e a pessoa perde tudo o que escreveu desde a ultima gravacao.
-- 4. O email do convite usa a validade devolvida pelo resumo (valid_until), e
--    nao os 7 dias fixos: a validade passa a vir de portal_validade_dias.
-- 5. src/hooks/useConviteAdmissaoResumo.ts e src/types/hr.ts: 'estado' com os
--    11 estados da admissao mais 'terminado' (mascara), 'estado_portal', as
--    datas novas, 'bloqueado', e o erro nao_encontrado (HRA31). O tipo
--    PessoaConviteAdmissao (src/types/hr.ts), que declara revoked_at e as
--    colunas da tabela, deixa de corresponder a uma leitura possivel.
-- 6. src/components/hr/PessoaConviteAdmissaoEstado.tsx e o teste dele: a
--    etiqueta da admissao e a do portal lado a lado, os textos dos codigos novos,
--    e as accoes cancelar e prolongar.
--    OS PONTOS 5 E 6 ENTRAM NO MESMO PUSH: com o frontend antigo, os 11 estados
--    novos caem em 'desconhecido' na ficha.
-- 6b. tests/integration/rh/e2-convite-criar.test.ts (linha ~158) le a tabela
--    directamente e passa a receber permission denied: ajusta-se no mesmo envio.
-- 7. A Edge NUNCA devolve ao cliente nem regista (logs, Sentry) o error.details
--    de um erro do PostgREST: a mensagem de um CHECK violado traz a LINHA
--    INTEIRA (token_hash, email, rascunho). Nao se consegue impedir em SQL.
-- 8. A Edge so escreve nos metadados dos eventos valores de um enum fixo (tipo,
--    motivo_codigo, erro_codigo, campos): nunca texto vindo do utilizador. A base
--    recusa ainda 11 digitos seguidos e formas de IBAN, mas e uma rede, nao o
--    controlo.
-- O que o utilizador ve: "Convidar" cria o processo; a ficha mostra a etiqueta
-- da admissao (Convidada) e a do portal (Ativo, Expirado, Revogado); convidar
-- quem ja tem processo aberto diz que ja existe um processo aberto; numa
-- organizacao que nao e empregadora a accao e recusada; o RH pode cancelar
-- (com motivo) e prolongar o acesso; um processo cancelado ou rejeitado aparece
-- so como "terminado" a quem nao tem hr.onboarding.restrito.
--
--
-- -- O QUE MUDA ----------------------------------------------------------------
--
-- 1. pessoas_convites_admissao ganha:
--    - estado (11 valores, 'convidada' por omissao) e portal_encerrado_em. O
--      estado do PORTAL nao se guarda: deriva-se (encerrado > revogado >
--      expirado > ativo);
--    - legado (true nas linhas que ja existiam quando esta migration correu,
--      false em todas as novas): separa os convites do fluxo antigo, que a
--      limpeza dos anexos ainda pode tratar, dos processos novos, que nunca;
--    - cancelada_em/_por/_motivo_interno, rejeitada_em/_por,
--      rejeicao_motivo_interno, rejeicao_mensagem, devolucao (jsonb);
--    - sessao_hash, sessao_iniciada_em, sessao_ultima_atividade_em,
--      sessao_falhas (a sessao do portal, decisao 12);
--    - otp_hmac, otp_expira_em, otp_tentativas, otp_pedidos_dia,
--      otp_ultimo_pedido_em (o OTP do portal, enviado para email_destino).
--    Ficam para as etapas proprias: contrato_otp_* (E5) e ativacao_* (E6).
--    Backfill dos convites existentes ANTES dos CHECKs: usado -> concluida (com
--    portal_encerrado_em = used_at); revogado -> cancelada (cancelada_em =
--    revoked_at); os restantes -> convidada. Um convite EXPIRADO e nao usado
--    fica convidada e conta como processo ABERTO: expirar nao termina a admissao
--    (decisao 10); o RH prolonga ou cancela.
--    NOTA PARA PRODUCAO: os convites que a _criar antiga revogou ao reconvidar
--    passam a 'cancelada' SEM autor nem motivo, e passam a aparecer como
--    cancelados em regime restrito (so com hr.onboarding.restrito).
--    CHECKs: estado na lista; revoked_at preenchido SE E SO SE o estado e
--    rejeitada ou cancelada; cancelada/rejeitada com data; tamanhos dos textos;
--    sessao_hash e otp_hmac em hex de 64; contadores >= 0; email_destino so com
--    os caracteres de uma LISTA BRANCA (letras e digitos ASCII e . _ % + - @;
--    sem espacos, barras invertidas, caracteres de controlo nem NBSP) e ate 254
--    caracteres (CHECK NOVO email_sem_especiais, ao lado do email_formato, que
--    nao muda: o email_formato aceita 'a,b@x.pt').
--    RASCUNHO (hr_convite_rascunho_valido): LISTA BRANCA de 45 chaves de topo
--    (a uniao das chaves do ecra, RASCUNHO_CONVITE_VAZIO em
--    src/lib/hr/conviteAdmissaoPayload.ts menos 'aceite', com as 38 de
--    CAMPOS_CONVITE da Edge; menos niss, iban e conta_numero); cada VALOR so
--    texto (ate 500 caracteres), numero, booleano ou nulo -- nada de objectos nem
--    listas aninhados; no maximo 20 000 bytes no total. DESVIO A PROPOSTA B2: o
--    BIC (conta_bic, conta_swift) fica PERMITIDO -- identifica o banco e nao a
--    conta (a propria submissao o trata como nao sensivel), e sem ele a pessoa
--    perdia o BIC ja escrito em cada gravacao. Dados de saude: o rascunho de hoje
--    nao tem nenhuma chave de saude, logo a lista branca ja os exclui.
--    email_destino, pessoa_id, organization_id e created_at ficam IMUTAVEIS
--    (trigger): o OTP vai sempre para o email com que o processo foi criado.
--    UNIQUE (id, organization_id), para a FK composta dos eventos. Indices nas
--    FK cancelada_por e rejeitada_por.
-- 2. UM PROCESSO ABERTO POR PESSOA, decidido pelo ESTADO: DROP INDEX
--    idx_pessoas_convites_admissao_um_vivo (que decidia por used_at/revoked_at)
--    e CREATE UNIQUE INDEX idx_pessoas_convites_admissao_processo_aberto
--    (pessoa_id) WHERE hr_convite_estado_aberto(estado). E o UNICO DROP desta
--    migration, sobre um indice, e sem ele o desenho fica incoerente (um
--    processo concluido sem revoked_at bloquearia para sempre uma readmissao).
--    hr_convite_estado_aberto e a definicao UNICA de "aberto".
-- 3. Trigger TRANSITORIO (larga-se na V3a): quando a submissao do portal ANTIGO
--    escreve used_at, o processo passa a concluida, portal_encerrado_em = now()
--    e fica o evento 'submetido'.
-- 4. MUDANCA DE COMPORTAMENTO: FECHA-SE TODO O SELECT DIRECTO de anon e
--    authenticated em pessoas_convites_admissao, coluna a coluna (REVOKE de cada
--    coluna existente). Ate aqui quem tinha hr.pessoas.view lia por PostgREST
--    email_destino, created_at, valid_until, attempts, email_erro,
--    ultima_recusa_*, revoked_at...; isso contornava a mascara da _resumo
--    (desenho seccao 5: o desfecho de um processo cancelado ou rejeitado e da
--    consulta restrita). Passa a ler-se SO pela _resumo (o hook ja o faz).
--    Confirmado por grep: nenhum codigo em src nem em supabase/functions le a
--    tabela directamente; so o teste de integracao do ponto 6b. A politica de
--    SELECT existente fica, sem efeito pratico (sem privilegio de coluna).
--    O bloco de conferir exige que anon e authenticated NAO tenham SELECT em
--    nenhuma coluna, e falha se uma coluna ficar legivel -- MAS SO no momento em
--    que esta migration corre. A V4 e a V5, que acrescentam colunas, tem de
--    repetir este bloco (uma coluna nova so ganha SELECT se alguem lho der).
-- 5. NOVA pessoas_convites_admissao_eventos: o historico do processo.
--    RLS nas 4 operacoes, sem grant nenhum a anon/authenticated (le-se so por
--    RPC SECURITY DEFINER, a partir da E3); imutavel perante UPDATE, DELETE e
--    TRUNCATE (triggers que recusam, tambem para service_role); FK composta
--    (convite_id, organization_id) ON DELETE RESTRICT, sem CASCADE; acao numa
--    lista fechada; metadados validados por hr_convite_evento_metadados_validos
--    (chaves, tipos, formatos, sem 11 digitos seguidos nem formas de IBAN, ate
--    2000 bytes).
--    DOIS ESPACOS DE IDENTIDADE: eventos.ator_id e o auth.users.id (o auth.uid()
--    nas RPCs com JWT; o p_actor na _criar), sem FK; created_by, cancelada_por e
--    rejeitada_por sao anew_users.id (FK ON DELETE SET NULL). Juntar os dois e
--    por anew_users.auth_user_id.
--    CONSEQUENCIA DA FK RESTRICT: um processo com eventos nunca mais se apaga (e
--    a pessoa e a organizacao dele tambem nao, de vez). Isto vale para os de
--    TESTE: os testes de integracao devem REUTILIZAR a mesma pessoa de teste da
--    nike e CANCELAR o processo no fim, em vez de criar pessoas novas.
-- 6. rpc_hr_convite_admissao_criar: MESMA assinatura (5 argumentos), MESMO
--    retorno TABLE(convite_id uuid, rascunho_herdado boolean), e continua SO
--    service_role: o token e o email nao podem ser escolhidos pelo cliente (um RH
--    que chamasse a RPC directamente conhecia o token e ficava com o link e o
--    OTP). A RPC valida por dentro, sobre p_actor (auth.uid() e nulo sob
--    service_role): p_actor tem de ser um utilizador da aplicacao, com
--    hr.pessoas.convite.enviar na organizacao da pessoa, que tem de ser work
--    organization activa. Valida p_token_hash (hex de 64) e p_email. Pessoa
--    inexistente, apagada ou sem permissao: o mesmo nao_encontrado. Recusa
--    processo_aberto. NAO revoga nem herda nada; rascunho_herdado e sempre
--    false. valid_until = now() + portal_validade_dias (7 sem linha);
--    p_valid_until e IGNORADO. Grava estado 'convidada' e o evento 'criado' com
--    email_escolhido = true (o email e escolhido pelo RH) e email_igual_ficha
--    (o email do convite e igual ao pessoas.email_pessoal da ficha, comparados
--    em minusculas e sem espacos). O endereco fica so em email_destino, nunca
--    nos metadados.
-- 7. NOVAS rpc_hr_convite_admissao_cancelar(uuid, uuid, text) e
--    rpc_hr_convite_admissao_prolongar(uuid, uuid, integer), so authenticated,
--    com o JWT (nao envolvem segredos). Recebem p_organization_id (a
--    activeCompany) e comparam-no com a organizacao da LINHA; diferente,
--    inexistente ou sem hr.pessoas.convite.enviar: o mesmo nao_encontrado.
--    Cancelar: exige motivo; so num processo aberto; a partir de 'aprovada'
--    exige tambem hr.onboarding.approve; NAO exige work organization (uma
--    organizacao que deixou de ser empregadora tem de poder cancelar); preenche
--    revoked_at e cancelada_*, apaga a sessao e o OTP.
--    Prolongar: 1 a 90 dias (3, 7, 14 e 30 incluidos); so nos estados que ja
--    existem e sao abertos (convidada, em_preenchimento, devolvida), portal nao
--    revogado nem encerrado; exige work organization; soma a max(valid_until,
--    now()) e TECTO ACUMULADO: o resultado nunca passa de now() + 90 dias
--    (prazo_excedido). Escolhido now() + 90 e nao created_at + 90: o tecto limita
--    a janela de exposicao do link a partir de cada momento, sem condenar um
--    processo longo (uma devolucao tardia) a nao poder voltar a ser aberto.
--    Cancelar e prolongar marcam legado = false: um convite antigo em que o RH
--    toca passa ao regime novo (a limpeza dos anexos deixa de lhe tocar). So
--    importa em producao; na dev nao ha convites legado depois da V0.
--    LIMITE POR ACTOR: como sao chamaveis por PostgREST, saltam o limite da Edge.
--    Cada uma recusa com limite_excedido (HRA41) se o actor ja tem 60 eventos na
--    ultima hora (todos os eventos com ator_id = auth.uid(), incluindo os
--    'criado'). Conta com o indice idx_pessoas_convites_admissao_eventos_ator
--    (ator_id, criado_em). So conta chamadas que deram certo: as que falham
--    (nao_encontrado, por exemplo) nao gravam evento e nao contam.
--    As outras accoes (aprovar, devolver, rejeitar, regenerar, sessao, OTP)
--    ficam para a E3.
-- 8. rpc_hr_convite_admissao_resumo: mesma assinatura e retorno (jsonb), so
--    authenticated. 'estado' passa a ser o ESTADO DA ADMISSAO; novas:
--    'estado_portal', 'portal_encerrado_em', 'cancelada_em', 'rejeitada_em',
--    'bloqueado'. Um processo cancelado ou rejeitado, a quem nao tem
--    hr.onboarding.restrito, sai so como {existe, convite_id, estado:
--    'terminado', estado_portal: 'revogado'}: sem datas, autor, email nem
--    recusas. Ficha inexistente e ficha sem acesso: o mesmo nao_encontrado.
-- 9. FUNCOES EXISTENTES ALTERADAS (mesma assinatura e retorno):
--    - hr_convites_admissao_limpar(): deixa de apagar o RASCUNHO (contrariava a
--      decisao 10, "expirar nao apaga dados"; a limpeza do rascunho so volta com
--      prazos validados juridicamente) e continua a apagar o registo da ultima
--      recusa (ultima_recusa_campos e ultima_recusa_conflitos, ids de fichas de
--      terceiros: RGPD), agora tambem nos processos terminados. O cron
--      'hr-convites-admissao-limpar' (jobid 9 na dev, 03:40) MANTEM-SE. Passa a
--      devolver o numero de RECUSAS limpas, e nao o de rascunhos (o cron ignora
--      o valor).
--    - hr_convite_anexos_limpar(integer, integer): o passo (a), que apagava os
--      anexos de convites nao usados expirados ou revogados ha 7 dias, so se
--      aplica a convites LEGADO. Nenhum processo novo e apanhado. Continua a
--      limpar os pendentes com mais de 3 h (uploads abandonados), a devolver o
--      que a Edge tem de remover do Storage, e a repetir as promocoes falhadas.
--
--
-- -- CODIGOS DE ERRO (MESSAGE = codigo) ------------------------------------------
--
--   HRA31 nao_encontrado              HRA32 processo_aberto
--   HRA33 organizacao_nao_empregadora HRA34 token_invalido
--   HRA35 email_invalido              HRA36 token_repetido (sem DETAIL)
--   HRA37 motivo_invalido             HRA38 estado_invalido
--   HRA39 dias_invalidos              HRA40 prazo_excedido
--   HRA41 limite_excedido (_cancelar e _prolongar: 60 eventos/hora por actor)
--   HRA10 pedido_invalido: a _criar devolve-o numa violacao de unicidade que nao
--         seja a do processo aberto nem a do token (sem DETAIL).
--   42501 insufficient_privilege: sem sessao (_cancelar, _prolongar), p_actor
--         nulo ou desconhecido (_criar), ou cancelar desde 'aprovada' sem
--         hr.onboarding.approve.
-- pessoa_nao_encontrada (HRA30) e validade_invalida (22023) deixam de sair da
-- _criar; HRA30 e 42501 deixam de sair da _resumo (passa a nao_encontrado).
--
--
-- -- DECISOES PENDENTES E NOTAS -------------------------------------------------
--
-- - RETENCAO: o tempo de conservacao do rascunho e dos anexos dos processos
--   novos e decisao pendente (RGPD, validacao juridica). Enquanto nao houver
--   politica, nada destes processos se apaga automaticamente.
-- - hr.onboarding.restrito so esta atribuido na dev (20261210410000, so da
--   vault). Em producao, ate ser atribuido a um papel, TODOS veriam os
--   processos cancelados e rejeitados so como 'terminado'.
-- - has_anew_permission_in_org e executavel por authenticated com qualquer uid
--   (oraculo de permissoes): ja era assim antes desta migration e fica fora do
--   ambito dela.
--
--
-- -- IMPACTO NUMA PUBLICACAO FUTURA (PRODUCAO / MUDELAR) -----------------------
--
-- Muda funcoes partilhadas com a admissao da Mudelar (_criar, _resumo e as duas
-- de limpeza) e a tabela de convites. Sem a Edge nova, a Mudelar deixaria de
-- conseguir convidar. Os convites existentes recebem estado por backfill e
-- legado = true; um rascunho em curso fora da lista branca faz esta migration
-- ABORTAR (guarda) ate ser tratado; quem tiver um convite expirado por usar fica
-- com um processo aberto (o RH prolonga ou cancela); os revogados ao reconvidar
-- passam a cancelados sem autor. Publicar precisa de autorizacao explicita.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao: repor a _criar de
-- 20261210070000, a _resumo e a hr_convites_admissao_limpar de 20261210030000 e
-- a hr_convite_anexos_limpar de 20261210070000; largar _cancelar e _prolongar;
-- repor o indice um_vivo (depois de largar o processo_aberto). Os eventos ficam
-- (sao historico). As colunas e os CHECKs podem ficar ou largar-se por nome.
--
--
-- Prerequisitos:
--   20261124120000  pessoas_convites_admissao
--   20261210030000  rpc_hr_convite_admissao_resumo, hr_convites_admissao_limpar (versoes vigentes)
--   20261210070000  rpc_hr_convite_admissao_criar, hr_convite_anexos_limpar (versoes vigentes)
--   20261210400000  organization_admissao_settings.portal_validade_dias
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.pessoas_convites_admissao') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_convites_admissao nao existe. Aplicar 20261124120000 primeiro.';
  END IF;
  IF to_regclass('public.pessoas_convites_admissao_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'public.pessoas_convites_admissao_eventos ja existe: esta migration nao a recria. Investigar.';
  END IF;
  IF to_regprocedure('public.hr_convite_admissao_imutaveis()') IS NOT NULL
     OR to_regprocedure('public.hr_convite_eventos_imutavel()') IS NOT NULL
     OR to_regprocedure('public.hr_convite_admissao_used_at_transitorio()') IS NOT NULL
     OR to_regprocedure('public.hr_convite_estado_aberto(text)') IS NOT NULL
     OR to_regprocedure('public.hr_convite_evento_metadados_validos(jsonb)') IS NOT NULL
     OR to_regprocedure('public.hr_convite_rascunho_valido(jsonb)') IS NOT NULL
     OR to_regprocedure('public.hr_organizacao_empregadora(uuid)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_admissao_cancelar(uuid, uuid, text)') IS NOT NULL
     OR to_regprocedure('public.rpc_hr_convite_admissao_prolongar(uuid, uuid, integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Uma das funcoes novas desta migration ja existe. Investigar.';
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname IN ('rpc_hr_convite_admissao_cancelar', 'rpc_hr_convite_admissao_prolongar');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'Ja existem % funcao(oes) _cancelar/_prolongar com outra assinatura. Investigar.', v_n;
  END IF;

  -- As versoes vigentes, com a assinatura e o retorno exactos.
  IF to_regprocedure('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_criar (5 argumentos) nao existe. Aplicar 20261210070000 primeiro.';
  END IF;
  IF pg_get_function_result('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)'::regprocedure)
     IS DISTINCT FROM 'TABLE(convite_id uuid, rascunho_herdado boolean)' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_criar devolve %, esperava-se TABLE(convite_id uuid, rascunho_herdado boolean).',
      pg_get_function_result('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)'::regprocedure);
  END IF;
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('rpc_hr_convite_admissao_criar', 'rpc_hr_convite_admissao_resumo',
                       'hr_convites_admissao_limpar', 'hr_convite_anexos_limpar');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Esperava-se uma so versao de _criar, _resumo e das duas limpezas; ha % funcoes com esses nomes.', v_n;
  END IF;
  IF to_regprocedure('public.rpc_hr_convite_admissao_resumo(uuid)') IS NULL
     OR pg_get_function_result('public.rpc_hr_convite_admissao_resumo(uuid)'::regprocedure) IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'rpc_hr_convite_admissao_resumo(uuid) RETURNS jsonb nao existe. Aplicar 20261210030000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_convites_admissao_limpar()') IS NULL
     OR pg_get_function_result('public.hr_convites_admissao_limpar()'::regprocedure) IS DISTINCT FROM 'integer' THEN
    RAISE EXCEPTION 'hr_convites_admissao_limpar() RETURNS integer nao existe. Aplicar 20261210030000 primeiro.';
  END IF;
  IF to_regprocedure('public.hr_convite_anexos_limpar(integer, integer)') IS NULL
     OR pg_get_function_result('public.hr_convite_anexos_limpar(integer, integer)'::regprocedure)
        IS DISTINCT FROM 'TABLE(anexo_id uuid, bucket text, caminho text, caminho_quarentena text, caminhos_finais text[], tentativas integer)' THEN
    RAISE EXCEPTION 'hr_convite_anexos_limpar(integer, integer) com o retorno de 20261210070000 nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = to_regclass('public.organization_admissao_settings')
       AND attname = 'portal_validade_dias' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'organization_admissao_settings.portal_validade_dias nao existe. Aplicar 20261210400000 primeiro.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.anew_organizations')
     AND attname IN ('is_work_org', 'status', 'deleted_at') AND NOT attisdropped;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'anew_organizations nao tem is_work_org, status e deleted_at (encontradas %).', v_n;
  END IF;

  -- Os emails existentes tem de caber no CHECK novo.
  SELECT count(*) INTO v_n FROM public.pessoas_convites_admissao
   WHERE email_destino !~ '^[A-Za-z0-9._%+@-]+$' OR length(email_destino) > 254;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTAR: % convite(s) com email_destino com caracteres fora da lista branca ou mais de 254 caracteres.', v_n;
  END IF;

  -- O indice antigo tem de ser o que se conhece (decidia por used_at/revoked_at).
  IF to_regclass('public.idx_pessoas_convites_admissao_um_vivo') IS NULL THEN
    RAISE EXCEPTION 'O indice idx_pessoas_convites_admissao_um_vivo nao existe: o estado da base nao e o esperado.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 0. Funcoes de apoio (novas). Todas com search_path fixo e sem EXECUTE para
--    anon/authenticated. As que entram em CHECK ou no indice tem EXECUTE para
--    service_role (que escreve na tabela com privilegio de tabela); as RPCs
--    correm como dono.
-- ==============================================================================

-- A definicao UNICA de "processo aberto". IMMUTABLE porque o indice parcial a
-- usa: mudar esta funcao obriga a recriar idx_pessoas_convites_admissao_processo_aberto.
CREATE FUNCTION public.hr_convite_estado_aberto(p_estado text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_estado NOT IN ('concluida', 'rejeitada', 'cancelada')
$$;

REVOKE ALL ON FUNCTION public.hr_convite_estado_aberto(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_estado_aberto(text) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_estado_aberto(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_estado_aberto(text) TO service_role;

COMMENT ON FUNCTION public.hr_convite_estado_aberto(text) IS
'Definicao unica de processo de admissao ABERTO: estado diferente de concluida, rejeitada e cancelada. Usada pelo indice unico idx_pessoas_convites_admissao_processo_aberto, pelas RPCs e pelas limpezas; mudar esta funcao obriga a recriar o indice. Desde 20261210420000.';

-- A organizacao e work organization activa (decisao 13).
CREATE FUNCTION public.hr_organizacao_empregadora(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT coalesce((
    SELECT o.is_work_org IS TRUE AND o.status = 'active' AND o.deleted_at IS NULL
      FROM public.anew_organizations o
     WHERE o.id = p_organization_id), false)
$$;

REVOKE ALL ON FUNCTION public.hr_organizacao_empregadora(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_organizacao_empregadora(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_organizacao_empregadora(uuid) FROM authenticated;

COMMENT ON FUNCTION public.hr_organizacao_empregadora(uuid) IS
'INTERNA (sem GRANT): true se a organizacao e work organization (is_work_org), activa e nao apagada. O criterio e is_work_org, nunca o tipo. Chamada pelas RPCs da admissao. Desde 20261210420000.';

-- O rascunho: so chaves da lista branca, e cada valor escalar e curto.
CREATE FUNCTION public.hr_convite_rascunho_valido(p jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_total_max  constant integer := 20000;
  c_texto_max  constant integer := 500;
  c_numero_max constant integer := 40;
  c_chaves constant text[] := ARRAY[
    'assinatura_nome', 'carta_conducao_categorias', 'carta_conducao_numero',
    'carta_conducao_validade', 'codigo_postal', 'conjuge_situacao_profissional',
    'conta_banco', 'conta_bic', 'conta_formato', 'conta_swift', 'conta_titular',
    'data_nascimento', 'dependentes', 'dependentes_deficientes', 'distrito',
    'email_pessoal', 'estado_civil', 'genero', 'habilitacao_academica',
    'habilitacao_data_conclusao', 'linha1', 'linha2', 'localidade',
    'morada_codigo_postal', 'morada_distrito', 'morada_linha1', 'morada_linha2',
    'morada_localidade', 'morada_pais', 'nacionalidade', 'naturalidade_concelho',
    'naturalidade_freguesia', 'naturalidade_pais', 'nif', 'numero_documento',
    'pais', 'tamanho_baixo', 'tamanho_baixo_detalhe', 'tamanho_calcado',
    'tamanho_calcado_detalhe', 'tamanho_cima', 'tamanho_cima_detalhe',
    'telefone_pessoal', 'tipo_documento', 'validade_documento'];
  v_chave text;
  v_valor jsonb;
BEGIN
  IF p IS NULL THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text) > c_total_max THEN
    RETURN false;
  END IF;

  FOR v_chave, v_valor IN SELECT e.key, e.value FROM jsonb_each(p) AS e LOOP
    IF NOT (v_chave = ANY (c_chaves)) THEN
      RETURN false;
    END IF;
    CASE jsonb_typeof(v_valor)
      WHEN 'string' THEN
        IF length(v_valor #>> '{}') > c_texto_max THEN
          RETURN false;
        END IF;
      WHEN 'number' THEN
        IF length(v_valor::text) > c_numero_max THEN
          RETURN false;
        END IF;
      WHEN 'boolean', 'null' THEN
        NULL;
      ELSE
        -- objectos e listas aninhados
        RETURN false;
    END CASE;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_rascunho_valido(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_rascunho_valido(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_rascunho_valido(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_rascunho_valido(jsonb) TO service_role;

COMMENT ON FUNCTION public.hr_convite_rascunho_valido(jsonb) IS
'CHECK do rascunho do convite: objecto ate 20000 bytes, so com as 45 chaves da lista branca (sem niss, iban nem conta_numero; o BIC e permitido), e cada valor texto ate 500 caracteres, numero, booleano ou nulo (nada aninhado). Nao detecta um IBAN escrito num campo de texto permitido: isso e validado por formato na Edge. Desde 20261210420000.';

-- Os rascunhos existentes tem de caber na lista branca nova.
DO $guarda_rascunho$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.pessoas_convites_admissao
   WHERE NOT public.hr_convite_rascunho_valido(rascunho);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'ABORTAR: % convite(s) tem rascunho com NISS, IBAN, chave fora da lista branca ou valor nao escalar/longo. Na dev, aplicar antes 20261210390000 (V0); noutra base, tratar esses convites antes.', v_n;
  END IF;
END;
$guarda_rascunho$;

-- Os metadados de um evento: so chaves conhecidas, cada uma com o seu tipo.
CREATE FUNCTION public.hr_convite_evento_metadados_validos(p jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_codigo constant text := '^[a-z_0-9]{1,40}$';
  c_uuid   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_data   constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+Z-]{8,25}$';
  -- Rede contra dados pessoais disfarcados de codigo: 11 digitos seguidos
  -- (NISS) e a forma de um IBAN (duas letras, dois digitos, 11+ alfanumericos),
  -- em qualquer caixa.
  c_niss   constant text := '[0-9]{11}';
  c_iban   constant text := '[a-z]{2}[0-9]{2}[a-z0-9]{11,}';
  v_chave  text;
  v_valor  jsonb;
  v_elem   jsonb;
  v_texto  text;
  v_num    numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text) > 2000 THEN
    RETURN false;
  END IF;

  FOR v_chave, v_valor IN SELECT e.key, e.value FROM jsonb_each(p) AS e LOOP
    CASE v_chave
      WHEN 'valid_until', 'valid_until_anterior' THEN
        IF jsonb_typeof(v_valor) <> 'string' OR NOT ((v_valor #>> '{}') ~ c_data) THEN
          RETURN false;
        END IF;
      WHEN 'dias', 'tentativas' THEN
        IF jsonb_typeof(v_valor) <> 'number' THEN
          RETURN false;
        END IF;
        v_num := (v_valor #>> '{}')::numeric;
        IF v_num <> trunc(v_num) OR v_num < 0 OR v_num > 1000 THEN
          RETURN false;
        END IF;
      WHEN 'motivo_codigo', 'tipo', 'erro_codigo' THEN
        IF jsonb_typeof(v_valor) <> 'string' THEN
          RETURN false;
        END IF;
        v_texto := v_valor #>> '{}';
        IF NOT (v_texto ~ c_codigo) OR v_texto ~ c_niss OR v_texto ~* c_iban THEN
          RETURN false;
        END IF;
      WHEN 'documento_id', 'anexo_id' THEN
        IF jsonb_typeof(v_valor) <> 'string' OR NOT ((v_valor #>> '{}') ~ c_uuid) THEN
          RETURN false;
        END IF;
      WHEN 'conteudo_sha256' THEN
        IF jsonb_typeof(v_valor) <> 'string' OR NOT ((v_valor #>> '{}') ~ '^[0-9a-f]{64}$') THEN
          RETURN false;
        END IF;
      WHEN 'email_enviado', 'email_escolhido', 'email_igual_ficha' THEN
        IF jsonb_typeof(v_valor) <> 'boolean' THEN
          RETURN false;
        END IF;
      WHEN 'campos', 'documentos' THEN
        IF jsonb_typeof(v_valor) <> 'array' OR jsonb_array_length(v_valor) > 60 THEN
          RETURN false;
        END IF;
        FOR v_elem IN SELECT a.value FROM jsonb_array_elements(v_valor) AS a LOOP
          IF jsonb_typeof(v_elem) <> 'string' THEN
            RETURN false;
          END IF;
          v_texto := v_elem #>> '{}';
          IF NOT (v_texto ~ c_codigo) OR v_texto ~ c_niss OR v_texto ~* c_iban THEN
            RETURN false;
          END IF;
        END LOOP;
      ELSE
        RETURN false;
    END CASE;
  END LOOP;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_evento_metadados_validos(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_evento_metadados_validos(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_evento_metadados_validos(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_evento_metadados_validos(jsonb) TO service_role;

COMMENT ON FUNCTION public.hr_convite_evento_metadados_validos(jsonb) IS
'CHECK dos metadados de pessoas_convites_admissao_eventos: objecto ate 2000 bytes, so com as chaves valid_until e valid_until_anterior (data ISO), dias e tentativas (inteiro 0..1000), motivo_codigo, tipo e erro_codigo (codigo [a-z_0-9]{1,40}), documento_id e anexo_id (uuid), conteudo_sha256 (hex 64), email_enviado, email_escolhido e email_igual_ficha (boolean), campos e documentos (ate 60 codigos). Os codigos recusam 11 digitos seguidos e a forma de um IBAN, em qualquer caixa. A Edge so escreve valores de enum fixo; isto e uma rede. Desde 20261210420000.';

-- ==============================================================================
-- 1. Colunas novas do processo
-- ==============================================================================
ALTER TABLE public.pessoas_convites_admissao
  ADD COLUMN IF NOT EXISTS estado                     text NOT NULL DEFAULT 'convidada',
  ADD COLUMN IF NOT EXISTS portal_encerrado_em        timestamptz,
  -- true nas linhas que ja existem; o default passa a false logo a seguir.
  ADD COLUMN IF NOT EXISTS legado                     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cancelada_em               timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_por              uuid,
  ADD COLUMN IF NOT EXISTS cancelada_motivo_interno   text,
  ADD COLUMN IF NOT EXISTS rejeitada_em               timestamptz,
  ADD COLUMN IF NOT EXISTS rejeitada_por              uuid,
  ADD COLUMN IF NOT EXISTS rejeicao_motivo_interno    text,
  ADD COLUMN IF NOT EXISTS rejeicao_mensagem          text,
  ADD COLUMN IF NOT EXISTS devolucao                  jsonb,
  ADD COLUMN IF NOT EXISTS sessao_hash                text,
  ADD COLUMN IF NOT EXISTS sessao_iniciada_em         timestamptz,
  ADD COLUMN IF NOT EXISTS sessao_ultima_atividade_em timestamptz,
  ADD COLUMN IF NOT EXISTS sessao_falhas              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_hmac                   text,
  ADD COLUMN IF NOT EXISTS otp_expira_em              timestamptz,
  ADD COLUMN IF NOT EXISTS otp_tentativas             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_pedidos_dia            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS otp_ultimo_pedido_em       timestamptz;

ALTER TABLE public.pessoas_convites_admissao
  ALTER COLUMN legado SET DEFAULT false;

COMMENT ON COLUMN public.pessoas_convites_admissao.legado IS
'true = convite do fluxo antigo, que ja existia quando 20261210420000 correu; false = processo novo. A limpeza dos anexos (hr_convite_anexos_limpar, passo a) so toca nos legado. Sem SELECT para authenticated.';

-- Backfill (na dev, depois da V0, nao ha linhas): usado -> concluida, revogado
-- -> cancelada (sem autor nem motivo), o resto fica convidada (expirado
-- incluido: continua aberto).
UPDATE public.pessoas_convites_admissao
   SET estado = 'concluida',
       portal_encerrado_em = coalesce(portal_encerrado_em, used_at)
 WHERE used_at IS NOT NULL AND revoked_at IS NULL;

UPDATE public.pessoas_convites_admissao
   SET estado = 'cancelada',
       cancelada_em = coalesce(cancelada_em, revoked_at)
 WHERE revoked_at IS NOT NULL;

-- ==============================================================================
-- 2. Um processo aberto por pessoa, decidido pelo estado
-- ==============================================================================
DROP INDEX IF EXISTS public.idx_pessoas_convites_admissao_um_vivo;

CREATE UNIQUE INDEX idx_pessoas_convites_admissao_processo_aberto
  ON public.pessoas_convites_admissao (pessoa_id)
  WHERE public.hr_convite_estado_aberto(estado);

COMMENT ON INDEX public.idx_pessoas_convites_admissao_processo_aberto IS
'Um so processo de admissao ABERTO por pessoa (hr_convite_estado_aberto). Substitui idx_pessoas_convites_admissao_um_vivo desde 20261210420000.';

-- ---- Restricoes ----------------------------------------------------------------
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_id_org_key') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_id_org_key UNIQUE (id, organization_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_cancelada_por_fkey') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_cancelada_por_fkey
      FOREIGN KEY (cancelada_por) REFERENCES public.anew_users (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_rejeitada_por_fkey') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_rejeitada_por_fkey
      FOREIGN KEY (rejeitada_por) REFERENCES public.anew_users (id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_estado_valido') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_estado_valido
      CHECK (estado IN ('convidada', 'em_preenchimento', 'submetida', 'devolvida', 'aprovada',
                        'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao',
                        'concluida', 'rejeitada', 'cancelada'));
  END IF;

  -- O portal so fica revogado nos estados terminais de recusa, e nesses fica
  -- sempre revogado.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_revogado_so_terminal') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_revogado_so_terminal
      CHECK ((revoked_at IS NOT NULL) = (estado IN ('rejeitada', 'cancelada')));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_terminal_com_data') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_terminal_com_data
      CHECK ((estado <> 'cancelada' OR cancelada_em IS NOT NULL)
         AND (estado <> 'rejeitada' OR rejeitada_em IS NOT NULL));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_textos_tamanho') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_textos_tamanho
      CHECK ((cancelada_motivo_interno IS NULL OR length(cancelada_motivo_interno) <= 2000)
         AND (rejeicao_motivo_interno IS NULL OR length(rejeicao_motivo_interno) <= 2000)
         AND (rejeicao_mensagem IS NULL OR length(rejeicao_mensagem) <= 2000));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_devolucao_formato') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_devolucao_formato
      CHECK (devolucao IS NULL
             OR (jsonb_typeof(devolucao) = 'object' AND octet_length(devolucao::text) <= 20000));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_hashes_formato') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_hashes_formato
      CHECK ((sessao_hash IS NULL OR sessao_hash ~ '^[0-9a-f]{64}$')
         AND (otp_hmac IS NULL OR otp_hmac ~ '^[0-9a-f]{64}$'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_contadores_nao_negativos') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_contadores_nao_negativos
      CHECK (sessao_falhas >= 0 AND otp_tentativas >= 0 AND otp_pedidos_dia >= 0);
  END IF;

  -- Ao lado de email_formato (que nao muda): LISTA BRANCA de caracteres (letras
  -- e digitos ASCII e . _ % + - @), logo sem espacos, separadores, barras,
  -- controlo nem NBSP; e o tecto de um endereco.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_email_sem_especiais') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_email_sem_especiais
      CHECK (email_destino ~ '^[A-Za-z0-9._%+@-]+$' AND length(email_destino) <= 254);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
                    AND conname = 'pessoas_convites_admissao_rascunho_lista_branca') THEN
    ALTER TABLE public.pessoas_convites_admissao
      ADD CONSTRAINT pessoas_convites_admissao_rascunho_lista_branca
      CHECK (rascunho IS NULL OR public.hr_convite_rascunho_valido(rascunho));
  END IF;
END;
$chk$;

-- A sessao procura-se pelo hash (uma por processo); as FK de autor com indice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_convites_admissao_sessao_hash
  ON public.pessoas_convites_admissao (sessao_hash)
  WHERE sessao_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pessoas_convites_admissao_cancelada_por
  ON public.pessoas_convites_admissao (cancelada_por)
  WHERE cancelada_por IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pessoas_convites_admissao_rejeitada_por
  ON public.pessoas_convites_admissao (rejeitada_por)
  WHERE rejeitada_por IS NOT NULL;

COMMENT ON COLUMN public.pessoas_convites_admissao.estado IS
'Estado da ADMISSAO (nao do portal): convidada, em_preenchimento, submetida, devolvida, aprovada, a_aguardar_assinaturas, assinaturas_concluidas, a_aguardar_ativacao, concluida, rejeitada, cancelada. O estado do portal deriva-se: encerrado (portal_encerrado_em), revogado (revoked_at, so em rejeitada/cancelada), expirado (valid_until passou), ativo. Sem SELECT para authenticated: le-se pela _resumo, que mascara cancelada/rejeitada. Desde 20261210420000.';
COMMENT ON COLUMN public.pessoas_convites_admissao.portal_encerrado_em IS
'Quando o portal temporario fechou de vez (conta activada; ou, ate a V3a, submissao pelo portal antigo). Depois disto o link deixa de funcionar.';
COMMENT ON COLUMN public.pessoas_convites_admissao.cancelada_por IS
'anew_users.id de quem cancelou (o espaco de identidade de created_by; os eventos usam auth.users.id). Sem SELECT para authenticated.';
COMMENT ON COLUMN public.pessoas_convites_admissao.cancelada_motivo_interno IS
'Motivo interno do cancelamento. Sem SELECT para authenticated: so a consulta restrita (hr.onboarding.restrito) o le.';
COMMENT ON COLUMN public.pessoas_convites_admissao.rejeitada_por IS
'anew_users.id de quem rejeitou (o espaco de identidade de created_by; os eventos usam auth.users.id). Sem SELECT para authenticated.';
COMMENT ON COLUMN public.pessoas_convites_admissao.rejeicao_motivo_interno IS
'Motivo interno da rejeicao. Sem SELECT para authenticated: so a consulta restrita (hr.onboarding.restrito) o le. Nunca vai para a pessoa.';
COMMENT ON COLUMN public.pessoas_convites_admissao.rejeicao_mensagem IS
'Mensagem verdadeira enviada a pessoa na rejeicao, sem notas internas. Sem SELECT para authenticated.';
COMMENT ON COLUMN public.pessoas_convites_admissao.devolucao IS
'O que o RH pediu para corrigir (campos, documentos, observacoes). Objecto, ate 20000 bytes. Sem SELECT para authenticated.';
COMMENT ON COLUMN public.pessoas_convites_admissao.sessao_hash IS
'SHA-256 hex (256 bits) da sessao temporaria do portal. Uma por processo. Nunca com GRANT.';
COMMENT ON COLUMN public.pessoas_convites_admissao.otp_hmac IS
'HMAC-SHA256 hex do OTP do portal, calculado na Edge com um pepper. Nunca com GRANT. O OTP vai sempre para email_destino, que e imutavel.';
COMMENT ON COLUMN public.pessoas_convites_admissao.rascunho IS
'Estado do preenchimento antes da submissao. Sem SELECT para authenticated. Desde 20261210420000 o CHECK hr_convite_rascunho_valido so aceita as 45 chaves da lista branca, valores escalares curtos e ate 20000 bytes.';

-- ==============================================================================
-- 3. Triggers do convite
-- ==============================================================================

-- O processo nao muda de pessoa, de organizacao nem de email.
CREATE FUNCTION public.hr_convite_admissao_imutaveis()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.pessoa_id          IS DISTINCT FROM OLD.pessoa_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.email_destino   IS DISTINCT FROM OLD.email_destino
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'convite_campo_imutavel' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_admissao_imutaveis() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_admissao_imutaveis() FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_admissao_imutaveis() FROM authenticated;

COMMENT ON FUNCTION public.hr_convite_admissao_imutaveis() IS
'Trigger: pessoa_id, organization_id, email_destino e created_at de um processo de admissao nao mudam. O OTP do portal vai sempre para o email com que o processo foi criado. Desde 20261210420000.';

CREATE TRIGGER trg_pessoas_convites_admissao_imutaveis
  BEFORE UPDATE ON public.pessoas_convites_admissao
  FOR EACH ROW EXECUTE FUNCTION public.hr_convite_admissao_imutaveis();

-- TRANSITORIO (larga-se na V3a): a submissao do portal antigo conclui o processo.
CREATE FUNCTION public.hr_convite_admissao_used_at_transitorio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.used_at IS NULL AND NEW.used_at IS NOT NULL
     AND public.hr_convite_estado_aberto(NEW.estado) THEN
    INSERT INTO public.pessoas_convites_admissao_eventos
      (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
    VALUES
      (NEW.id, NEW.organization_id, 'submetido', 'pessoa', NULL, NEW.estado, 'concluida', '{}'::jsonb);
    NEW.estado := 'concluida';
    NEW.portal_encerrado_em := coalesce(NEW.portal_encerrado_em, now());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_admissao_used_at_transitorio() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_admissao_used_at_transitorio() FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_admissao_used_at_transitorio() FROM authenticated;

COMMENT ON FUNCTION public.hr_convite_admissao_used_at_transitorio() IS
'TRANSITORIO, larga-se na V3a: quando a submissao do portal antigo escreve used_at num processo aberto, o processo passa a concluida, portal_encerrado_em = now() e fica o evento submetido. Desde 20261210420000.';

-- ==============================================================================
-- 4. Sem leitura directa: fecha-se TODO o SELECT de anon e authenticated
-- ==============================================================================
-- A tabela nao tem grant de tabela para authenticated/anon (20261124120000); os
-- grants eram por coluna. Revogam-se TODOS, coluna a coluna, para todas as
-- colunas que existem agora. A leitura passa a ser so pela _resumo, que mascara
-- os processos cancelados e rejeitados.
REVOKE SELECT ON TABLE public.pessoas_convites_admissao FROM anon, authenticated;

DO $revogar$
DECLARE
  v_col text;
BEGIN
  FOR v_col IN
    SELECT a.attname::text FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_convites_admissao')
       AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON TABLE public.pessoas_convites_admissao FROM anon, authenticated', v_col);
  END LOOP;
END;
$revogar$;

COMMENT ON TABLE public.pessoas_convites_admissao IS
'Processo de admissao (um por linha, mesmo token do principio ao fim). token_hash e o SHA-256 do codigo; o codigo em claro NUNCA e guardado. Desde 20261210420000 anon e authenticated NAO tem SELECT em nenhuma coluna: le-se pela rpc_hr_convite_admissao_resumo (que mascara cancelados e rejeitados sem hr.onboarding.restrito) e escreve-se so pelas RPCs SECURITY DEFINER. Estado da admissao em estado; historico em pessoas_convites_admissao_eventos.';

-- ==============================================================================
-- 5. pessoas_convites_admissao_eventos
-- ==============================================================================
CREATE TABLE public.pessoas_convites_admissao_eventos (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  convite_id       uuid NOT NULL,
  organization_id  uuid NOT NULL,
  acao             text NOT NULL,
  ator_tipo        text NOT NULL,
  ator_id          uuid,
  estado_anterior  text,
  estado_posterior text,
  metadados        jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pessoas_convites_admissao_eventos_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_convites_admissao_eventos_convite_fkey
    FOREIGN KEY (convite_id, organization_id)
    REFERENCES public.pessoas_convites_admissao (id, organization_id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT pessoas_convites_admissao_eventos_acao_valida
    CHECK (acao IN (
      'criado', 'email_enviado', 'email_falhou', 'reenviado', 'portal_aberto',
      'otp_pedido', 'otp_validado', 'otp_falhado', 'sessao_iniciada', 'sessao_substituida',
      'submetido', 'devolvido', 'corrigido', 'aprovado', 'rejeitado', 'cancelado',
      'expirado', 'prolongado', 'link_regenerado',
      'documento_carregado', 'documento_removido', 'documento_validado',
      'contrato_disponibilizado', 'contrato_assinado_empresa', 'contrato_assinado_pessoa',
      'contrato_substituido', 'assinatura_falhada',
      'acesso_enviado', 'conta_ativada', 'portal_encerrado')),
  CONSTRAINT pessoas_convites_admissao_eventos_ator_valido
    CHECK (ator_tipo IN ('rh', 'pessoa', 'sistema')
           AND ((ator_tipo = 'rh') = (ator_id IS NOT NULL))),
  CONSTRAINT pessoas_convites_admissao_eventos_estados_validos
    CHECK ((estado_anterior IS NULL OR estado_anterior IN (
              'convidada', 'em_preenchimento', 'submetida', 'devolvida', 'aprovada',
              'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao',
              'concluida', 'rejeitada', 'cancelada'))
       AND (estado_posterior IS NULL OR estado_posterior IN (
              'convidada', 'em_preenchimento', 'submetida', 'devolvida', 'aprovada',
              'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao',
              'concluida', 'rejeitada', 'cancelada'))),
  CONSTRAINT pessoas_convites_admissao_eventos_metadados_validos
    CHECK (public.hr_convite_evento_metadados_validos(metadados))
);

COMMENT ON TABLE public.pessoas_convites_admissao_eventos IS
'Historico de um processo de admissao (pessoas_convites_admissao). Imutavel: UPDATE, DELETE e TRUNCATE recusados por trigger, tambem para service_role. Sem grant para anon/authenticated: le-se por RPC SECURITY DEFINER. ator_id e auth.users.id (sem FK); created_by/cancelada_por/rejeitada_por do convite sao anew_users.id. pessoa e sistema sem ator_id. metadados validados por hr_convite_evento_metadados_validos. A FK RESTRICT torna permanentes os processos com eventos, os de teste incluidos. Desde 20261210420000.';
COMMENT ON COLUMN public.pessoas_convites_admissao_eventos.ator_id IS
'auth.users.id do RH (auth.uid() nas RPCs com JWT; p_actor na _criar). NAO e anew_users.id: para juntar com created_by usar anew_users.auth_user_id.';

CREATE INDEX idx_pessoas_convites_admissao_eventos_convite
  ON public.pessoas_convites_admissao_eventos (convite_id, criado_em);
CREATE INDEX idx_pessoas_convites_admissao_eventos_org
  ON public.pessoas_convites_admissao_eventos (organization_id, criado_em);
-- O limite por actor de _cancelar e _prolongar conta por aqui.
CREATE INDEX idx_pessoas_convites_admissao_eventos_ator
  ON public.pessoas_convites_admissao_eventos (ator_id, criado_em)
  WHERE ator_id IS NOT NULL;

CREATE FUNCTION public.hr_convite_eventos_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RAISE EXCEPTION 'evento_imutavel' USING ERRCODE = '42501',
    DETAIL = 'Os eventos de admissao nao se alteram nem se apagam (' || TG_OP || ').';
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_eventos_imutavel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_eventos_imutavel() FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_eventos_imutavel() FROM authenticated;

COMMENT ON FUNCTION public.hr_convite_eventos_imutavel() IS
'Trigger: recusa UPDATE, DELETE e TRUNCATE em pessoas_convites_admissao_eventos. Desde 20261210420000.';

CREATE TRIGGER trg_pessoas_convites_admissao_eventos_sem_alterar
  BEFORE UPDATE OR DELETE ON public.pessoas_convites_admissao_eventos
  FOR EACH ROW EXECUTE FUNCTION public.hr_convite_eventos_imutavel();

CREATE TRIGGER trg_pessoas_convites_admissao_eventos_sem_truncate
  BEFORE TRUNCATE ON public.pessoas_convites_admissao_eventos
  FOR EACH STATEMENT EXECUTE FUNCTION public.hr_convite_eventos_imutavel();

REVOKE ALL ON TABLE public.pessoas_convites_admissao_eventos FROM PUBLIC;
REVOKE ALL ON TABLE public.pessoas_convites_admissao_eventos FROM anon;
REVOKE ALL ON TABLE public.pessoas_convites_admissao_eventos FROM authenticated;
REVOKE ALL ON TABLE public.pessoas_convites_admissao_eventos FROM service_role;
GRANT SELECT, INSERT ON TABLE public.pessoas_convites_admissao_eventos TO service_role;

ALTER TABLE public.pessoas_convites_admissao_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY pessoas_convites_admissao_eventos_block_select ON public.pessoas_convites_admissao_eventos
  AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY pessoas_convites_admissao_eventos_block_insert ON public.pessoas_convites_admissao_eventos
  AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY pessoas_convites_admissao_eventos_block_update ON public.pessoas_convites_admissao_eventos
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY pessoas_convites_admissao_eventos_block_delete ON public.pessoas_convites_admissao_eventos
  AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (false);

-- O trigger transitorio escreve eventos: cria-se depois da tabela.
CREATE TRIGGER trg_pessoas_convites_admissao_used_at_transitorio
  BEFORE UPDATE OF used_at ON public.pessoas_convites_admissao
  FOR EACH ROW EXECUTE FUNCTION public.hr_convite_admissao_used_at_transitorio();

-- ==============================================================================
-- 6. rpc_hr_convite_admissao_criar: abre um processo, nao substitui o anterior
--    MESMA assinatura, MESMO retorno e MESMOS grants (so service_role) da versao
--    de 20261210070000. A validacao e toda sobre p_actor.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_criar(
  p_pessoa_id   uuid,
  p_token_hash  text,
  p_valid_until timestamptz,
  p_email       text,
  p_actor       uuid
)
RETURNS TABLE (convite_id uuid, rascunho_herdado boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_validade_omissao constant integer := 7;
  c_email_max        constant integer := 254;
  v_email     text := btrim(p_email);
  v_email_ficha text;
  v_org       uuid;
  v_dias      integer;
  v_valid     timestamptz;
  v_anew      uuid;
  v_id        uuid;
  v_restricao text;
BEGIN
  -- Sob service_role auth.uid() e nulo: o actor e o p_actor que a Edge derivou
  -- do JWT. Tem de ser um utilizador da aplicacao.
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;
  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = p_actor LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'token_invalido' USING ERRCODE = 'HRA34';
  END IF;

  -- O criterio do CHECK email_formato, mais a lista branca do email_sem_especiais.
  IF v_email IS NULL OR length(v_email) > c_email_max
     OR v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR v_email !~ '^[A-Za-z0-9._%+@-]+$' THEN
    RAISE EXCEPTION 'email_invalido' USING ERRCODE = 'HRA35';
  END IF;

  SELECT p.organization_id, p.email_pessoal INTO v_org, v_email_ficha
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  -- Pessoa inexistente, apagada, ou numa organizacao onde o actor nao convida:
  -- a mesma resposta, para nao revelar fichas de outras organizacoes.
  IF v_org IS NULL
     OR NOT public.has_anew_permission_in_org(p_actor, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_organizacao_empregadora(v_org) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  -- Um processo aberto nao se substitui: o RH prolonga ou cancela.
  IF EXISTS (
    SELECT 1 FROM public.pessoas_convites_admissao c
     WHERE c.pessoa_id = p_pessoa_id
       AND public.hr_convite_estado_aberto(c.estado)
  ) THEN
    RAISE EXCEPTION 'processo_aberto' USING ERRCODE = 'HRA32';
  END IF;

  -- A validade decide-se no servidor; p_valid_until fica so pela assinatura.
  SELECT s.portal_validade_dias INTO v_dias
    FROM public.organization_admissao_settings s
   WHERE s.organization_id = v_org;
  v_dias  := coalesce(v_dias, c_validade_omissao);
  v_valid := now() + make_interval(days => v_dias);

  BEGIN
    INSERT INTO public.pessoas_convites_admissao
      (pessoa_id, organization_id, token_hash, email_destino, valid_until, created_by, estado)
    VALUES
      (p_pessoa_id, v_org, p_token_hash, v_email, v_valid, v_anew, 'convidada')
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Nunca se re-lanca o erro original: o DETAIL dele traz os valores da chave.
    GET STACKED DIAGNOSTICS v_restricao = CONSTRAINT_NAME;
    IF v_restricao = 'idx_pessoas_convites_admissao_processo_aberto' THEN
      RAISE EXCEPTION 'processo_aberto' USING ERRCODE = 'HRA32';
    ELSIF v_restricao = 'pessoas_convites_admissao_token_hash_unica' THEN
      RAISE EXCEPTION 'token_repetido' USING ERRCODE = 'HRA36';
    END IF;
    RAISE EXCEPTION 'pedido_invalido' USING ERRCODE = 'HRA10';
  END;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_id, v_org, 'criado', 'rh', p_actor, NULL, 'convidada',
     jsonb_build_object(
       'valid_until', v_valid,
       'dias', v_dias,
       'email_escolhido', true,
       -- So o resultado da comparacao; o endereco nunca vai para os metadados.
       'email_igual_ficha', coalesce(
         lower(regexp_replace(v_email, '[[:space:]]', '', 'g'))
           = lower(regexp_replace(v_email_ficha, '[[:space:]]', '', 'g')),
         false)));

  RETURN QUERY SELECT v_id, false;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid) IS
'Abre um processo de admissao (estado convidada) e grava o evento criado. SO service_role: chamada pela Edge convite-admissao, que valida o JWT, deriva p_actor (auth.users.id) e gera o token; o token e o email nunca sao escolhidos pelo cliente. A RPC valida por dentro sobre p_actor: utilizador da aplicacao (senao 42501), hr.pessoas.convite.enviar na organizacao da pessoa e work organization activa. Recusas: token_invalido (HRA34), email_invalido (HRA35), nao_encontrado (HRA31: pessoa inexistente, apagada ou sem permissao), organizacao_nao_empregadora (HRA33), processo_aberto (HRA32), token_repetido (HRA36), pedido_invalido (HRA10). Nao revoga nem herda nada; rascunho_herdado e sempre false. Validade = now() + portal_validade_dias (7 sem linha); p_valid_until e ignorado. Desde 20261210420000.';

-- ==============================================================================
-- 7. rpc_hr_convite_admissao_cancelar e rpc_hr_convite_admissao_prolongar (novas)
-- ==============================================================================
CREATE FUNCTION public.rpc_hr_convite_admissao_cancelar(
  p_convite_id      uuid,
  p_organization_id uuid,
  p_motivo          text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_motivo_max  constant integer := 2000;
  c_limite_hora constant integer := 60;
  v_uid    uuid := auth.uid();
  v_motivo text := btrim(p_motivo);
  v_org    uuid;
  v_c      record;
  v_anew   uuid;
  v_n      integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Chamavel por PostgREST, salta o limite da Edge: no maximo 60 eventos do
  -- actor na ultima hora (idx_pessoas_convites_admissao_eventos_ator).
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_limite_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- A organizacao vem da LINHA e tem de ser a activeCompany; sem permissao
  -- nela, o processo "nao existe".
  SELECT c.organization_id INTO v_org
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF v_org IS NULL
     OR p_organization_id IS NULL
     OR v_org <> p_organization_id
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- Sem guarda de work organization: uma organizacao que deixou de ser
  -- empregadora tem de poder cancelar o que ficou aberto.

  IF v_motivo IS NULL OR v_motivo = '' OR length(v_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'motivo_invalido' USING ERRCODE = 'HRA37';
  END IF;

  SELECT c.id, c.estado INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_convite_estado_aberto(v_c.estado) THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  -- Depois da aprovacao, cancelar e desfazer uma decisao de aprovacao.
  IF v_c.estado IN ('aprovada', 'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao')
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.onboarding.approve', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  UPDATE public.pessoas_convites_admissao
     SET estado                     = 'cancelada',
         legado                     = false,
         revoked_at                 = now(),
         cancelada_em               = now(),
         cancelada_por              = v_anew,
         cancelada_motivo_interno   = v_motivo,
         sessao_hash                = NULL,
         sessao_iniciada_em         = NULL,
         sessao_ultima_atividade_em = NULL,
         otp_hmac                   = NULL,
         otp_expira_em              = NULL
   WHERE id = v_c.id;

  -- O motivo e interno: fica so na coluna, nunca nos metadados.
  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_org, 'cancelado', 'rh', v_uid, v_c.estado, 'cancelada', '{}'::jsonb);

  RETURN jsonb_build_object('convite_id', v_c.id, 'estado', 'cancelada', 'estado_portal', 'revogado');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_cancelar(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_cancelar(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_cancelar(uuid, uuid, text) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_cancelar(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_cancelar(uuid, uuid, text) IS
'Cancela um processo de admissao aberto (nao e rejeicao): estado cancelada, portal revogado, motivo interno, autor (anew_users.id) e data; apaga a sessao e o OTP; nao apaga dados nem anexos (decisao 10). JWT do RH; p_organization_id (activeCompany) tem de ser a organizacao do processo; hr.pessoas.convite.enviar nela, e desde aprovada tambem hr.onboarding.approve (42501). Nao exige work organization. Recusas: nao_encontrado (HRA31: inexistente, outra organizacao ou sem permissao), motivo_invalido (HRA37), estado_invalido (HRA38), limite_excedido (HRA41: 60 eventos do actor na ultima hora). Marca legado = false. Evento cancelado, sem o motivo. Desde 20261210420000.';

CREATE FUNCTION public.rpc_hr_convite_admissao_prolongar(
  p_convite_id      uuid,
  p_organization_id uuid,
  p_dias            integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto       constant interval := interval '90 days';
  c_limite_hora constant integer  := 60;
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_c    record;
  v_novo timestamptz;
  v_n    integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Chamavel por PostgREST, salta o limite da Edge: no maximo 60 eventos do
  -- actor na ultima hora (idx_pessoas_convites_admissao_eventos_ator).
  SELECT count(*) INTO v_n
    FROM public.pessoas_convites_admissao_eventos e
   WHERE e.ator_id = v_uid AND e.criado_em > now() - interval '1 hour';
  IF v_n >= c_limite_hora THEN
    RAISE EXCEPTION 'limite_excedido' USING ERRCODE = 'HRA41';
  END IF;

  -- 3, 7, 14 ou 30 no ecra; qualquer inteiro entre 1 e 90, como portal_validade_dias.
  IF p_dias IS NULL OR p_dias < 1 OR p_dias > 90 THEN
    RAISE EXCEPTION 'dias_invalidos' USING ERRCODE = 'HRA39';
  END IF;

  SELECT c.organization_id INTO v_org
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id;
  IF v_org IS NULL
     OR p_organization_id IS NULL
     OR v_org <> p_organization_id
     OR NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.convite.enviar', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  IF NOT public.hr_organizacao_empregadora(v_org) THEN
    RAISE EXCEPTION 'organizacao_nao_empregadora' USING ERRCODE = 'HRA33';
  END IF;

  SELECT c.id, c.estado, c.valid_until, c.revoked_at, c.portal_encerrado_em INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.id = p_convite_id AND c.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  -- So os estados abertos que ja existem (a E3 e seguintes alargam a lista);
  -- nunca reactiva concluido, rejeitado, cancelado, revogado ou encerrado. Um
  -- portal so expirado reabre.
  IF v_c.estado NOT IN ('convidada', 'em_preenchimento', 'devolvida')
     OR v_c.revoked_at IS NOT NULL
     OR v_c.portal_encerrado_em IS NOT NULL THEN
    RAISE EXCEPTION 'estado_invalido' USING ERRCODE = 'HRA38';
  END IF;

  v_novo := greatest(v_c.valid_until, now()) + make_interval(days => p_dias);

  -- Tecto acumulado: o link nunca fica valido mais de 90 dias a partir de agora.
  IF v_novo > now() + c_tecto THEN
    RAISE EXCEPTION 'prazo_excedido' USING ERRCODE = 'HRA40';
  END IF;

  UPDATE public.pessoas_convites_admissao
     SET valid_until = v_novo,
         legado      = false
   WHERE id = v_c.id;

  INSERT INTO public.pessoas_convites_admissao_eventos
    (convite_id, organization_id, acao, ator_tipo, ator_id, estado_anterior, estado_posterior, metadados)
  VALUES
    (v_c.id, v_org, 'prolongado', 'rh', v_uid, v_c.estado, v_c.estado,
     jsonb_build_object('valid_until_anterior', v_c.valid_until, 'valid_until', v_novo, 'dias', p_dias));

  RETURN jsonb_build_object('convite_id', v_c.id, 'valid_until', v_novo, 'estado', v_c.estado, 'estado_portal', 'ativo');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_prolongar(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_prolongar(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_prolongar(uuid, uuid, integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_prolongar(uuid, uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_prolongar(uuid, uuid, integer) IS
'Prolonga o acesso ao portal: valid_until = max(valid_until, now()) + p_dias (1 a 90), nunca mais de now() + 90 dias. Mantem o link e o estado, nao apaga nada; reabre um portal so expirado; so nos estados convidada, em_preenchimento e devolvida. JWT do RH; p_organization_id (activeCompany) tem de ser a organizacao do processo; hr.pessoas.convite.enviar nela; work organization. Recusas: dias_invalidos (HRA39), nao_encontrado (HRA31), organizacao_nao_empregadora (HRA33), estado_invalido (HRA38), prazo_excedido (HRA40), limite_excedido (HRA41: 60 eventos do actor na ultima hora). Marca legado = false. Evento prolongado. Desde 20261210420000.';

-- ==============================================================================
-- 8. rpc_hr_convite_admissao_resumo: o estado da admissao e o do portal
--    Corpo de 20261210030000 com as mesmas mascaras; muda o significado de
--    'estado', acrescenta estado_portal, datas e bloqueado, mascara cancelada e
--    rejeitada sem hr.onboarding.restrito, e da o mesmo erro para ficha
--    inexistente e ficha sem acesso.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_convite_admissao_resumo(p_pessoa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_tecto constant integer := 10;
  v_org    uuid;
  v_c      record;
  v_portal text;
  v_ident  boolean;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.pessoas p
  WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;

  -- Ficha inexistente, apagada, ou sem hr.pessoas.view: a mesma resposta.
  IF v_org IS NULL
     OR NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.view', v_org) THEN
    RAISE EXCEPTION 'nao_encontrado' USING ERRCODE = 'HRA31';
  END IF;

  SELECT c.id, c.estado, c.email_destino, c.created_at, c.valid_until, c.used_at, c.revoked_at,
         c.portal_encerrado_em, c.cancelada_em, c.rejeitada_em,
         c.attempts, c.email_enviado, c.email_enviado_em, c.email_erro,
         c.assinatura_nome, (c.rascunho IS NOT NULL) AS tem_rascunho,
         c.ultima_recusa_codigo, c.ultima_recusa_em, c.ultima_recusa_campos,
         (coalesce(jsonb_array_length(c.ultima_recusa_conflitos), 0) > 0) AS tem_conflitos
    INTO v_c
    FROM public.pessoas_convites_admissao c
   WHERE c.pessoa_id = p_pessoa_id
     AND c.organization_id = v_org
   ORDER BY c.created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('existe', false);
  END IF;

  -- Desenho seccao 5: o desfecho de um processo cancelado ou rejeitado so o ve
  -- quem tem hr.onboarding.restrito. Os outros sabem so que terminou.
  IF v_c.estado IN ('cancelada', 'rejeitada')
     AND NOT public.has_anew_permission_in_org(auth.uid(), 'hr.onboarding.restrito', v_org) THEN
    RETURN jsonb_build_object(
      'existe',        true,
      'convite_id',    v_c.id,
      'estado',        'terminado',
      'estado_portal', 'revogado');
  END IF;

  -- Revelar que o NIF/NISS coincide com o de outra ficha e dado de
  -- identificacao: so com hr.pessoas.identificacao.view.
  v_ident := public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.identificacao.view', v_org);

  v_portal := CASE
    WHEN v_c.portal_encerrado_em IS NOT NULL THEN 'encerrado'
    WHEN v_c.revoked_at IS NOT NULL          THEN 'revogado'
    WHEN v_c.valid_until <= now()            THEN 'expirado'
    ELSE 'ativo'
  END;

  -- NUNCA token_hash, rascunho (so se existe), assinatura_ip, user_agent,
  -- motivos internos, mensagem de rejeicao, devolucao, sessao nem OTP.
  RETURN jsonb_build_object(
    'existe',              true,
    'convite_id',          v_c.id,
    'estado',              v_c.estado,
    'estado_portal',       v_portal,
    'email_destino',       v_c.email_destino,
    'criado_em',           v_c.created_at,
    'valid_until',         v_c.valid_until,
    'portal_encerrado_em', v_c.portal_encerrado_em,
    'cancelada_em',        v_c.cancelada_em,
    'rejeitada_em',        v_c.rejeitada_em,
    'email_enviado',       v_c.email_enviado,
    'email_enviado_em',    v_c.email_enviado_em,
    'email_erro',          v_c.email_erro,
    'aberturas_falhadas',  v_c.attempts,
    'bloqueado',           (v_c.attempts >= c_tecto),
    'usado_em',            v_c.used_at,
    'assinatura_nome',     v_c.assinatura_nome,
    'tem_rascunho',        v_c.tem_rascunho,
    'ultima_recusa',       CASE
                             WHEN v_c.ultima_recusa_codigo IS NULL THEN NULL
                             ELSE jsonb_build_object(
                                    'codigo', CASE
                                                WHEN NOT v_ident
                                                 AND v_c.ultima_recusa_codigo IN ('nif_ja_existe', 'niss_ja_existe')
                                                THEN NULL
                                                ELSE v_c.ultima_recusa_codigo
                                              END,
                                    'em',     v_c.ultima_recusa_em,
                                    'campos', to_jsonb(CASE
                                                WHEN v_ident
                                                THEN coalesce(v_c.ultima_recusa_campos, ARRAY[]::text[])
                                                ELSE ARRAY(
                                                       SELECT u.campo
                                                         FROM unnest(coalesce(v_c.ultima_recusa_campos, ARRAY[]::text[])) AS u(campo)
                                                        WHERE u.campo NOT IN ('nif', 'niss'))
                                              END))
                           END,
    'tem_conflitos',       (v_ident AND v_c.tem_conflitos)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_hr_convite_admissao_resumo(uuid) IS
'O processo de admissao mais recente da pessoa, para o RH (so authenticated). estado = estado da ADMISSAO; estado_portal = encerrado, revogado, expirado ou ativo (derivado); bloqueado = aberturas falhadas >= 10. Um processo cancelado ou rejeitado, sem hr.onboarding.restrito, sai so como estado terminado e portal revogado, sem datas, autor, email nem recusas. Ficha inexistente, apagada ou sem hr.pessoas.view: nao_encontrado (HRA31). Sem hr.pessoas.identificacao.view: ultima_recusa.codigo vem null nas recusas por NIF/NISS duplicado, ultima_recusa.campos omite nif e niss, e tem_conflitos e sempre false. Nunca devolve token_hash, rascunho, IP, user-agent, motivos internos, devolucao, sessao nem OTP. Desde 20261210420000.';

-- ==============================================================================
-- 9. As limpezas existentes (mesma assinatura, mesmo retorno, mesmos grants)
-- ==============================================================================

-- 9.1 hr_convites_admissao_limpar: so o registo da ultima recusa (RGPD). O
--     rascunho ja nao se apaga (decisao 10). O cron hr-convites-admissao-limpar
--     mantem-se e passa a correr isto.
CREATE OR REPLACE FUNCTION public.hr_convites_admissao_limpar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_carencia constant interval := interval '7 days';
  v_n integer;
BEGIN
  -- RGPD: o registo da ultima recusa (campos em falta e ids das fichas em
  -- conflito) nao fica para sempre: apaga-se quando o processo terminou ou foi
  -- usado, ou quando o portal expirou ou foi revogado ha mais de 7 dias.
  -- O RASCUNHO NAO se apaga aqui desde 20261210420000 ("expirar nao apaga
  -- dados"); a limpeza dele so volta com prazos validados juridicamente.
  UPDATE public.pessoas_convites_admissao
     SET ultima_recusa_campos    = NULL,
         ultima_recusa_conflitos = NULL
   WHERE (ultima_recusa_campos IS NOT NULL OR ultima_recusa_conflitos IS NOT NULL)
     AND (used_at IS NOT NULL
          OR NOT public.hr_convite_estado_aberto(estado)
          OR valid_until < now() - c_carencia
          OR (revoked_at IS NOT NULL AND revoked_at < now() - c_carencia));

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convites_admissao_limpar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convites_admissao_limpar() FROM anon;
REVOKE ALL ON FUNCTION public.hr_convites_admissao_limpar() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convites_admissao_limpar() TO service_role;

COMMENT ON FUNCTION public.hr_convites_admissao_limpar() IS
'Apaga o registo da ultima recusa (ultima_recusa_campos e ultima_recusa_conflitos) dos processos terminados ou usados, e dos que expiraram ou foram revogados ha mais de 7 dias. Devolve quantos limpou. Desde 20261210420000 NAO apaga o rascunho (decisao 10). Corre todos os dias as 03:40 por pg_cron (job hr-convites-admissao-limpar). SO service_role.';

-- 9.2 hr_convite_anexos_limpar: corpo de 20261210070000 (igual ao vigente na
--     dev), com UMA mudanca: o passo (a) so se aplica a convites LEGADO.
CREATE OR REPLACE FUNCTION public.hr_convite_anexos_limpar(p_dias_tolerancia integer DEFAULT 7, p_limite integer DEFAULT 200)
RETURNS TABLE(anexo_id uuid, bucket text, caminho text, caminho_quarentena text, caminhos_finais text[], tentativas integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  -- O URL de upload assinado vale 2 horas. Ate 3 horas depois de criada, uma
  -- linha ainda pode receber o objecto: nao se lhe apaga o objecto antes disso.
  c_pendente_max constant interval := interval '3 hours';
  v_tolerancia   interval := make_interval(days => greatest(coalesce(p_dias_tolerancia, 7), 0));
  v_limite       integer  := least(greatest(coalesce(p_limite, 200), 1), 1000);
  v_convite      uuid;
BEGIN
  -- (a) SO CONVITES LEGADO (desde 20261210420000): convites do fluxo antigo nao
  --     usados que expiraram ou foram revogados ha mais de a tolerancia: os
  --     anexos activos passam a apagado. Num processo novo (legado = false)
  --     expirar nao apaga nada (decisao 10).
  UPDATE public.pessoas_anexos a
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = CASE WHEN c.revoked_at IS NOT NULL
                               THEN 'convite_revogado' ELSE 'convite_expirado' END
    FROM public.pessoas_convites_admissao c
   WHERE a.convite_id = c.id
     AND c.legado
     AND a.estado IN ('pendente', 'ligado')
     AND c.used_at IS NULL
     AND (c.valid_until < now() - v_tolerancia
          OR (c.revoked_at IS NOT NULL AND c.revoked_at < now() - v_tolerancia));

  -- (b) Pendentes que nunca foram confirmados.
  UPDATE public.pessoas_anexos
     SET estado         = 'apagado',
         apagado_em     = now(),
         apagado_motivo = 'upload_abandonado'
   WHERE estado = 'pendente'
     AND criado_em < now() - c_pendente_max;

  -- (c) O que a Edge Function tem de apagar do Storage. A regra das 3 horas
  --     aplica-se a TODAS as linhas devolvidas: o mesmo URL assinado pode ser
  --     reutilizado ate expirar, por isso um objecto carregado depois de a
  --     linha ser marcada apagada e removido na volta seguinte.
  --
  --     Uma linha entra no lote por UM de dois motivos (ou os dois):
  --       1. esta apagada e o seu objecto ainda nao foi removido
  --          (objecto_removido_em nulo): bucket e caminho dizem onde esta;
  --       2. tem a copia da quarentena por remover (caminho_quarentena preenchido,
  --          quarentena_removida_em nulo) e ja nao esta pendente -- ligada,
  --          promovida ou apagada. Apanha o que a Edge nao conseguiu apagar logo
  --          a seguir a ligar e fecha o URL de upload reutilizavel.
  --     Para as linhas apagadas que NUNCA foram ligadas, caminhos_finais traz os
  --     tres caminhos finais possiveis (pdf, png, jpg) em hr-documentos: a Edge
  --     pode ter copiado o ficheiro para la e morrer antes de ligar, e a linha so
  --     conhece o caminho da quarentena. Remover um caminho que nao existe e inofensivo.
  --
  --     A ordem e por limpeza_tentativas (as linhas que falham sempre ficam para o
  --     fim) e o lote incrementa limpeza_tentativas das linhas que devolve: 200
  --     linhas teimosas nao bloqueiam as seguintes. FOR UPDATE SKIP LOCKED: duas
  --     voltas em simultaneo nao devolvem as mesmas linhas.
  RETURN QUERY
  WITH escolhidas AS (
    SELECT a.id
      FROM public.pessoas_anexos a
     WHERE a.criado_em < now() - c_pendente_max
       AND (
             (a.estado = 'apagado' AND a.objecto_removido_em IS NULL)
          OR (a.estado <> 'pendente' AND a.caminho_quarentena IS NOT NULL AND a.quarentena_removida_em IS NULL)
       )
     ORDER BY a.limpeza_tentativas, coalesce(a.apagado_em, a.criado_em), a.id
     LIMIT v_limite
     FOR UPDATE OF a SKIP LOCKED
  ),
  marcadas AS (
    UPDATE public.pessoas_anexos a
       SET limpeza_tentativas = a.limpeza_tentativas + 1
      FROM escolhidas e
     WHERE a.id = e.id
    RETURNING a.id, a.estado, a.bucket, a.caminho, a.caminho_quarentena,
              a.quarentena_removida_em, a.objecto_removido_em, a.ligado_em,
              a.organization_id, a.pessoa_id, a.limpeza_tentativas
  )
  SELECT m.id,
         CASE WHEN m.estado = 'apagado' AND m.objecto_removido_em IS NULL THEN m.bucket END,
         CASE WHEN m.estado = 'apagado' AND m.objecto_removido_em IS NULL THEN m.caminho END,
         -- Quando o objecto da linha ja E a copia da quarentena (apagado sem nunca
         -- ligar), nao se repete no segundo campo.
         CASE WHEN m.caminho_quarentena IS NOT NULL
                   AND m.quarentena_removida_em IS NULL
                   AND NOT (m.estado = 'apagado' AND m.objecto_removido_em IS NULL
                            AND m.caminho = m.caminho_quarentena)
              THEN m.caminho_quarentena END,
         CASE WHEN m.estado = 'apagado' AND m.objecto_removido_em IS NULL AND m.ligado_em IS NULL
              THEN ARRAY[
                     m.organization_id::text || '/' || m.pessoa_id::text || '/admissao/' || m.id::text || '.pdf',
                     m.organization_id::text || '/' || m.pessoa_id::text || '/admissao/' || m.id::text || '.png',
                     m.organization_id::text || '/' || m.pessoa_id::text || '/admissao/' || m.id::text || '.jpg'
                   ]
         END,
         m.limpeza_tentativas
    FROM marcadas m
   ORDER BY m.limpeza_tentativas, m.id;

  -- (d) Promocoes que falharam. hr_convite_anexos_promover nunca parte a admissao:
  --     em falha deixa os anexos em `ligado`, ligados a um convite JA USADO (uma
  --     ligacao nova num convite usado e recusada, por isso so isto os produz).
  --     Volta a tenta-los; e idempotente e, se continuar a falhar, so regista outro
  --     aviso. No maximo 50 convites por volta.
  FOR v_convite IN
    SELECT DISTINCT a.convite_id
      FROM public.pessoas_anexos a
      JOIN public.pessoas_convites_admissao c ON c.id = a.convite_id
     WHERE a.estado = 'ligado'
       AND c.used_at IS NOT NULL
     LIMIT 50
  LOOP
    PERFORM public.hr_convite_anexos_promover(v_convite);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) TO service_role;

COMMENT ON FUNCTION public.hr_convite_anexos_limpar(integer, integer) IS
'Limpeza dos anexos de admissao, chamada pela Edge convite-admissao-limpeza. (a) So convites LEGADO (fluxo antigo, legado = true) nao usados, expirados ou revogados ha mais de p_dias_tolerancia: anexos activos passam a apagado; nos processos novos expirar nao apaga nada (decisao 10, desde 20261210420000). (b) pendentes com mais de 3 h passam a apagado (upload_abandonado). (c) devolve ate p_limite linhas cujo objecto ou copia de quarentena a Edge tem de remover do Storage. (d) repete as promocoes falhadas. SO service_role.';

-- ==============================================================================
-- Conferir (vale no momento em que esta migration corre; a V4 e a V5 repetem-no)
-- ==============================================================================
DO $conferir$
DECLARE
  v_estados text[] := ARRAY['convidada', 'em_preenchimento', 'submetida', 'devolvida', 'aprovada',
                            'a_aguardar_assinaturas', 'assinaturas_concluidas', 'a_aguardar_ativacao',
                            'concluida', 'rejeitada', 'cancelada'];
  -- O conjunto esperado da lista branca do rascunho, escrito aqui de forma
  -- independente da funcao: confere-se por comportamento, chave a chave.
  v_lista_branca text[] := ARRAY[
    'assinatura_nome', 'carta_conducao_categorias', 'carta_conducao_numero',
    'carta_conducao_validade', 'codigo_postal', 'conjuge_situacao_profissional',
    'conta_banco', 'conta_bic', 'conta_formato', 'conta_swift', 'conta_titular',
    'data_nascimento', 'dependentes', 'dependentes_deficientes', 'distrito',
    'email_pessoal', 'estado_civil', 'genero', 'habilitacao_academica',
    'habilitacao_data_conclusao', 'linha1', 'linha2', 'localidade',
    'morada_codigo_postal', 'morada_distrito', 'morada_linha1', 'morada_linha2',
    'morada_localidade', 'morada_pais', 'nacionalidade', 'naturalidade_concelho',
    'naturalidade_freguesia', 'naturalidade_pais', 'nif', 'numero_documento',
    'pais', 'tamanho_baixo', 'tamanho_baixo_detalhe', 'tamanho_calcado',
    'tamanho_calcado_detalhe', 'tamanho_cima', 'tamanho_cima_detalhe',
    'telefone_pessoal', 'tipo_documento', 'validade_documento'];
  v_so_authenticated text[] := ARRAY['public.rpc_hr_convite_admissao_cancelar(uuid, uuid, text)',
                                     'public.rpc_hr_convite_admissao_prolongar(uuid, uuid, integer)',
                                     'public.rpc_hr_convite_admissao_resumo(uuid)'];
  v_so_service text[] := ARRAY['public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)',
                               'public.hr_convites_admissao_limpar()',
                               'public.hr_convite_anexos_limpar(integer, integer)'];
  v_internas text[] := ARRAY['public.hr_convite_admissao_imutaveis()',
                             'public.hr_convite_admissao_used_at_transitorio()',
                             'public.hr_convite_eventos_imutavel()',
                             'public.hr_organizacao_empregadora(uuid)',
                             'public.hr_convite_estado_aberto(text)',
                             'public.hr_convite_rascunho_valido(jsonb)',
                             'public.hr_convite_evento_metadados_validos(jsonb)'];
  v_col     text;
  v_fn      text;
  v_chave   text;
  v_tudo    jsonb := '{}'::jsonb;
  v_lidos   text[];
  v_n       integer;
  v_papel   text;
BEGIN
  -- 1. Sem leitura directa: nem anon nem authenticated tem SELECT em NENHUMA
  --    coluna (nem de tabela). Uma coluna legivel faz falhar o push.
  FOR v_col IN
    SELECT a.attname::text FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_convites_admissao')
       AND a.attnum > 0 AND NOT a.attisdropped
  LOOP
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_column_privilege(v_papel, 'public.pessoas_convites_admissao', v_col, 'SELECT') THEN
        RAISE EXCEPTION '% consegue ler pessoas_convites_admissao.%; a tabela le-se so pela _resumo.', v_papel, v_col;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_any_column_privilege(v_papel, 'public.pessoas_convites_admissao', 'SELECT') THEN
      RAISE EXCEPTION '% ainda tem SELECT em alguma coluna de pessoas_convites_admissao.', v_papel;
    END IF;
  END LOOP;

  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'INSERT')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'UPDATE')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'DELETE')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao', 'TRUNCATE') THEN
      RAISE EXCEPTION '% tem escrita de tabela em pessoas_convites_admissao.', v_papel;
    END IF;
  END LOOP;

  -- 2. O CHECK do estado aceita exactamente os 11 estados (por conjunto de
  --    literais, nao por texto da definicao).
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_lidos
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g') AS m
   WHERE c.conrelid = to_regclass('public.pessoas_convites_admissao')
     AND c.conname = 'pessoas_convites_admissao_estado_valido'
     AND c.contype::text = 'c';
  IF v_lidos IS DISTINCT FROM (SELECT array_agg(e ORDER BY e) FROM unnest(v_estados) e) THEN
    RAISE EXCEPTION 'O CHECK do estado nao aceita exactamente os 11 estados: %.', v_lidos;
  END IF;

  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE conrelid = to_regclass('public.pessoas_convites_admissao')
     AND contype::text IN ('c', 'u', 'f')
     AND conname IN ('pessoas_convites_admissao_id_org_key',
                     'pessoas_convites_admissao_cancelada_por_fkey',
                     'pessoas_convites_admissao_rejeitada_por_fkey',
                     'pessoas_convites_admissao_estado_valido',
                     'pessoas_convites_admissao_revogado_so_terminal',
                     'pessoas_convites_admissao_terminal_com_data',
                     'pessoas_convites_admissao_textos_tamanho',
                     'pessoas_convites_admissao_devolucao_formato',
                     'pessoas_convites_admissao_hashes_formato',
                     'pessoas_convites_admissao_contadores_nao_negativos',
                     'pessoas_convites_admissao_email_sem_especiais',
                     'pessoas_convites_admissao_rascunho_lista_branca');
  IF v_n <> 12 THEN
    RAISE EXCEPTION 'Esperavam-se 12 restricoes novas em pessoas_convites_admissao; ha %.', v_n;
  END IF;

  -- 3. A lista branca do rascunho, por comportamento: as 45 chaves aceites uma a
  --    uma e todas juntas; as proibidas, uma chave desconhecida, um valor
  --    aninhado e um texto de 501 caracteres recusados.
  IF cardinality(v_lista_branca) <> 45 THEN
    RAISE EXCEPTION 'A lista branca esperada devia ter 45 chaves; tem %.', cardinality(v_lista_branca);
  END IF;
  FOREACH v_chave IN ARRAY v_lista_branca LOOP
    IF NOT public.hr_convite_rascunho_valido(jsonb_build_object(v_chave, 'x')) THEN
      RAISE EXCEPTION 'A chave % devia ser aceite no rascunho.', v_chave;
    END IF;
    v_tudo := v_tudo || jsonb_build_object(v_chave, 'x');
  END LOOP;
  IF NOT public.hr_convite_rascunho_valido(v_tudo) THEN
    RAISE EXCEPTION 'O rascunho com as 45 chaves devia ser aceite.';
  END IF;
  -- Uma 46.a chave, inventada, faz recusar o rascunho inteiro: a lista branca
  -- tem exactamente estas 45 e nao mais.
  IF public.hr_convite_rascunho_valido(v_tudo || jsonb_build_object('chave_46_inventada', 'x')) THEN
    RAISE EXCEPTION 'O rascunho com as 45 chaves e uma 46.a inventada devia ser recusado.';
  END IF;
  FOREACH v_chave IN ARRAY ARRAY['niss', 'iban', 'conta_numero', 'aceite', 'chave_desconhecida'] LOOP
    IF public.hr_convite_rascunho_valido(jsonb_build_object(v_chave, 'x')) THEN
      RAISE EXCEPTION 'A chave % devia ser recusada no rascunho.', v_chave;
    END IF;
  END LOOP;
  IF public.hr_convite_rascunho_valido('{"nif": {"a": 1}}'::jsonb)
     OR public.hr_convite_rascunho_valido('{"nif": ["a"]}'::jsonb)
     OR public.hr_convite_rascunho_valido(jsonb_build_object('linha1', repeat('a', 501)))
     OR NOT public.hr_convite_rascunho_valido('{"dependentes": 2}'::jsonb)
     OR NOT public.hr_convite_rascunho_valido('{"nif": null, "conta_bic": true}'::jsonb) THEN
    RAISE EXCEPTION 'hr_convite_rascunho_valido nao valida os valores como esperado.';
  END IF;

  -- 4. O indice de um processo aberto: existe, e unico, e o antigo ja nao existe.
  IF to_regclass('public.idx_pessoas_convites_admissao_um_vivo') IS NOT NULL THEN
    RAISE EXCEPTION 'O indice antigo idx_pessoas_convites_admissao_um_vivo continua a existir.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i
                  WHERE i.indexrelid = to_regclass('public.idx_pessoas_convites_admissao_processo_aberto')
                    AND i.indisunique AND i.indpred IS NOT NULL) THEN
    RAISE EXCEPTION 'O indice unico parcial idx_pessoas_convites_admissao_processo_aberto nao existe.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = to_regclass('public.pessoas_convites_admissao')
     AND tgname IN ('trg_pessoas_convites_admissao_imutaveis',
                    'trg_pessoas_convites_admissao_used_at_transitorio')
     AND tgenabled::text <> 'D';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Os dois triggers do convite nao estao activos (%).', v_n;
  END IF;

  -- As linhas novas nascem legado = false.
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a
                   JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                  WHERE a.attrelid = to_regclass('public.pessoas_convites_admissao')
                    AND a.attname = 'legado'
                    AND pg_get_expr(d.adbin, d.adrelid) = 'false') THEN
    RAISE EXCEPTION 'A coluna legado devia ter DEFAULT false.';
  END IF;

  -- 5. Eventos: RLS, 4 politicas, nenhum grant de fora, triggers activos, FK RESTRICT.
  IF NOT EXISTS (SELECT 1 FROM pg_class
                  WHERE oid = to_regclass('public.pessoas_convites_admissao_eventos')
                    AND relrowsecurity) THEN
    RAISE EXCEPTION 'pessoas_convites_admissao_eventos sem RLS.';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_convites_admissao_eventos';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas nos eventos; ha %.', v_n;
  END IF;
  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(v_papel, 'public.pessoas_convites_admissao_eventos', 'SELECT')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao_eventos', 'INSERT')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao_eventos', 'UPDATE')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao_eventos', 'DELETE')
       OR has_table_privilege(v_papel, 'public.pessoas_convites_admissao_eventos', 'TRUNCATE') THEN
      RAISE EXCEPTION '% tem privilegios em pessoas_convites_admissao_eventos.', v_papel;
    END IF;
  END LOOP;
  IF has_table_privilege('service_role', 'public.pessoas_convites_admissao_eventos', 'UPDATE')
     OR has_table_privilege('service_role', 'public.pessoas_convites_admissao_eventos', 'DELETE')
     OR has_table_privilege('service_role', 'public.pessoas_convites_admissao_eventos', 'TRUNCATE') THEN
    RAISE EXCEPTION 'service_role tem UPDATE, DELETE ou TRUNCATE nos eventos.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_trigger
   WHERE tgrelid = to_regclass('public.pessoas_convites_admissao_eventos')
     AND tgname IN ('trg_pessoas_convites_admissao_eventos_sem_alterar',
                    'trg_pessoas_convites_admissao_eventos_sem_truncate')
     AND tgenabled::text <> 'D';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Os dois triggers de imutabilidade dos eventos nao estao activos (%).', v_n;
  END IF;

  IF to_regclass('public.idx_pessoas_convites_admissao_eventos_ator') IS NULL THEN
    RAISE EXCEPTION 'Falta o indice idx_pessoas_convites_admissao_eventos_ator (limite por actor).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_convites_admissao_eventos')
                    AND conname = 'pessoas_convites_admissao_eventos_convite_fkey'
                    AND contype::text = 'f'
                    AND confdeltype::text = 'r') THEN
    RAISE EXCEPTION 'A FK dos eventos ao convite nao e ON DELETE RESTRICT.';
  END IF;

  -- Os metadados: o validador aceita o que as RPCs gravam e recusa o resto.
  IF NOT public.hr_convite_evento_metadados_validos(
           jsonb_build_object('valid_until', now(), 'dias', 7, 'email_escolhido', true, 'email_igual_ficha', false))
     OR public.hr_convite_evento_metadados_validos('{"email_igual_ficha": "sim"}'::jsonb)
     OR NOT public.hr_convite_evento_metadados_validos(
           jsonb_build_object('valid_until_anterior', now(), 'valid_until', now(), 'dias', 30))
     OR NOT public.hr_convite_evento_metadados_validos('{"campos": ["nif", "linha1"], "erro_codigo": "nif_invalido"}'::jsonb)
     OR public.hr_convite_evento_metadados_validos('{"email": "a@b.pt"}'::jsonb)
     OR public.hr_convite_evento_metadados_validos('{"dias": "7"}'::jsonb)
     OR public.hr_convite_evento_metadados_validos('{"erro_codigo": "Texto Livre"}'::jsonb)
     OR public.hr_convite_evento_metadados_validos('{"erro_codigo": "x12345678901"}'::jsonb)
     OR public.hr_convite_evento_metadados_validos('{"tipo": "pt50000201231234567890154"}'::jsonb)
     OR public.hr_convite_evento_metadados_validos('{"campos": ["pt50000201231234567890154"]}'::jsonb)
     OR public.hr_convite_evento_metadados_validos('{"motivo_codigo": "a12345678901b"}'::jsonb) THEN
    RAISE EXCEPTION 'hr_convite_evento_metadados_validos nao valida como esperado.';
  END IF;

  -- 6. Funcoes: uma so versao de cada; grants por papel; search_path fixo.
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('rpc_hr_convite_admissao_criar', 'rpc_hr_convite_admissao_resumo',
                       'rpc_hr_convite_admissao_cancelar', 'rpc_hr_convite_admissao_prolongar',
                       'hr_convites_admissao_limpar', 'hr_convite_anexos_limpar');
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Esperava-se uma so versao de cada uma das 6 funcoes; ha %.', v_n;
  END IF;
  IF pg_get_function_result('public.rpc_hr_convite_admissao_criar(uuid, text, timestamptz, text, uuid)'::regprocedure)
     IS DISTINCT FROM 'TABLE(convite_id uuid, rascunho_herdado boolean)' THEN
    RAISE EXCEPTION 'O retorno de _criar mudou.';
  END IF;

  FOREACH v_fn IN ARRAY v_so_authenticated LOOP
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% tem de ser so authenticated.', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY v_so_service LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE')
       OR has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% tem de ser so service_role.', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY (v_so_authenticated || v_so_service) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)
                      AND p.prosecdef
                      AND p.proconfig::text LIKE '%search_path=public, pg_temp%') THEN
      RAISE EXCEPTION '% tem de ser SECURITY DEFINER com search_path fixo.', v_fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY v_internas LOOP
    FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(v_papel, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '% pode executar a funcao interna %.', v_papel, v_fn;
      END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p
                    WHERE p.oid = to_regprocedure(v_fn)
                      AND p.proconfig::text LIKE '%search_path=public, pg_temp%') THEN
      RAISE EXCEPTION '% tem de ter search_path fixo.', v_fn;
    END IF;
  END LOOP;

  -- 7. O cron das recusas continua agendado (agora so limpa as recusas).
  IF to_regclass('cron.job') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'hr-convites-admissao-limpar') THEN
      RAISE WARNING 'PENDENCIA: o cron hr-convites-admissao-limpar nao existe nesta base; o registo das recusas nao se limpa.';
    END IF;
  END IF;

  RAISE NOTICE 'OK: processo com estado e 12 restricoes, rascunho com lista branca de 45 chaves, um processo aberto por pessoa decidido pelo estado, nenhuma coluna legivel por anon/authenticated, eventos imutaveis com metadados validados, _criar so service_role, _cancelar/_prolongar/_resumo so authenticated, limpezas sem tocar em processos novos.';
END;
$conferir$;
