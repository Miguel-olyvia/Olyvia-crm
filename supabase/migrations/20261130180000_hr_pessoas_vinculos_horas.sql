-- ==============================================================================
-- pessoas_vinculos_horas: horas contratadas, versionadas por intervalo. No
-- molde EXACTO de pessoas_retribuicoes (valido_de/valido_ate, indice unico da
-- versao em aberto, trigger de nao-sobreposicao com daterange, soft delete,
-- registo em pessoas_acessos_sensiveis). pessoas_vinculos.horas_periodo e
-- horas_frequencia passam a ser o valor em VIGOR, derivado por trigger.
--
-- POR APLICAR.
--
-- ##############################################################################
-- # CODIGO: HA UM QUARTO CAMINHO DE ESCRITA -- MUDAR DOIS FICHEIROS ANTES DO   #
-- # db push (4a REVISAO)                                                      #
-- ##############################################################################
-- #                                                                            #
-- # Esta migracao BLOQUEIA escrita directa (INSERT e UPDATE -- achado 1 da 3a  #
-- # revisao) a pessoas_vinculos.horas_periodo e horas_frequencia (trigger      #
-- # trg_pessoas_vinculos_horas_e_derivado, seccao "Guarda em pessoas_          #
-- # vinculos"). A 3a revisao desta migracao AFIRMOU aqui ter confirmado, "por  #
-- # leitura DIRECTA e actual", TODOS os caminhos de escrita, e listou tres     #
-- # ficheiros -- essa afirmacao era FALSA: havia um QUARTO caminho, que essa   #
-- # revisao nao abriu (so leu src/lib e src/hooks; faltou src/components).     #
-- # Corrigido aqui na 4a revisao. Os quatro, confirmados por leitura directa   #
-- # NESTA revisao:                                                            #
-- #                                                                            #
-- #   1. src/components/hr/PessoaContratoTab.tsx (~linhas 429-447): NAO mete   #
-- #      horas_periodo/horas_frequencia no patch de onGuardarVinculo -- o      #
-- #      proprio comentario no ficheiro (~linha 447) diz que ficam de fora     #
-- #      "desde 20261130120000" (o timestamp com que esta migracao nasceu;     #
-- #      ficou desactualizado por esta ter mudado de carimbo desde entao       #
-- #      (agora 20261130180000, ver a 6a revisao mais abaixo) --               #
-- #      achado 3 da 4a revisao -- e nao se corrige aqui: fora de scope, so    #
-- #      a migracao).                                                         #
-- #   2. src/hooks/usePessoa.ts, funcao saveVinculo (~linhas 469-507): ja      #
-- #      destrutura horas_periodo/horas_frequencia PARA FORA do patch antes   #
-- #      de qualquer INSERT ou UPDATE em pessoas_vinculos, nos dois ramos      #
-- #      (criacao e edicao). Este e o ecra de EDICAO de uma pessoa existente.  #
-- #   3. src/hooks/usePessoaVinculoHoras.ts existe e e o unico caminho de      #
-- #      escrita PENSADO para isto: INSERT/UPDATE directo em pessoas_          #
-- #      vinculos_horas, usado por src/components/hr/PessoaVinculoHorasCard.  #
-- #      tsx.                                                                 #
-- #   4. QUARTO CAMINHO, NUNCA MENCIONADO ANTES DESTA REVISAO: src/lib/hr/     #
-- #      novaPessoa.ts (~linhas 217-218 e 658-660) constroi payload.vinculo    #
-- #      com horas_periodo E horas_frequencia -- esta ultima SEMPRE           #
-- #      preenchida (o formulario arranca com 'semanal' por omissao, linha    #
-- #      218). src/hooks/usePessoas.ts (~linha 377) faz INSERT directo em      #
-- #      pessoas_vinculos com esse payload tal e qual. E o ASSISTENTE DE       #
-- #      ADMISSAO de pessoa nova -- diferente do ecra de edicao (caminho 2).  #
-- #                                                                            #
-- # SEM MUDAR NADA, aplicar esta migracao PARTE TODA A ADMISSAO COM CONTRATO:  #
-- # o INSERT do caminho 4 traz sempre horas_frequencia preenchida, e a guarda  #
-- # nova (achado 1 da 3a revisao, agora tambem em INSERT) recusa-o com        #
-- # HR010. NAO SE ALTERA src/ NESTA MIGRACAO (fora de scope: so o ficheiro     #
-- # .sql) -- a decisao, tomada aqui e nao aplicada em codigo, e MUDAR o        #
-- # caminho 4 para deixar de escrever horas directamente, no MESMO padrao do   #
-- # caminho 3 (o unico pensado para isto). Antes do db push desta migracao,    #
-- # alguem tem de:                                                            #
-- #                                                                            #
-- #   a. src/lib/hr/novaPessoa.ts, dentro do payload.vinculo (~linhas 658-     #
-- #      660): tirar horas_periodo e horas_frequencia dai, e devolve-las       #
-- #      separadas (ex.: um campo novo payload.horasVinculo com                #
-- #      horas_periodo, horas_frequencia e valido_de), no mesmo espirito com   #
-- #      que retribuicao ja e um bloco a parte de vinculo neste ficheiro.      #
-- #   b. src/hooks/usePessoas.ts (~linha 377, a seguir ao INSERT de            #
-- #      pessoas_vinculos e a obtencao de vinculoId): acrescentar um INSERT    #
-- #      em pessoas_vinculos_horas com esse payload.horasVinculo (pessoa_id,   #
-- #      organization_id, vinculo_id: vinculoId, valido_de = data_inicio do    #
-- #      vinculo) -- o MESMO padrao que ja existe logo a seguir para          #
-- #      payload.retribuicao neste ficheiro (INSERT dependente de vinculoId). #
-- #                                                                            #
-- # Ate essas duas alteracoes serem feitas e CONFIRMADAS AO VIVO (criar uma    #
-- # pessoa nova com contrato, pelo assistente de admissao, e ver que grava     #
-- # sem excepcao crua), esta migracao NAO DEVE ir a db push -- travaria a      #
-- # admissao de toda a gente com contrato, em producao.                       #
-- ##############################################################################
--
--
-- -- A TENTATIVA ANTERIOR ESTAVA ERRADA NA PREMISSA -----------------------------
--
-- Um ficheiro anterior (vault/.../20261130070000_hr_pessoas_vinculos_horas.sql,
-- nunca aplicado) versionava pessoas_vinculos.horas_semanais e a sua guarda
-- procurava a constraint pessoas_vinculos_horas_validas (dominio 0..80 sobre a
-- coluna crua). Essa coluna e essa constraint JA NAO EXISTEM:
-- 20261120190000 renomeou horas_semanais para horas_periodo, LARGOU
-- pessoas_vinculos_horas_validas de proposito, e passou o unico tecto (<=80)
-- para uma coluna GERADA, horas_semanais_equivalentes, que converte
-- horas_periodo (na unidade declarada em horas_frequencia: diaria, semanal,
-- mensal ou anual) para uma grandeza comparavel. Escrever contra o modelo
-- antigo teria ressuscitado uma constraint que foi removida de proposito, pela
-- mesma razao que ja aconteceu nesta base com uma funcao de assinatura
-- trocada: confirmar sempre o estado MAIS RECENTE do que se referencia, nunca
-- a migracao onde a coisa nasceu.
--
--
-- -- O QUE SE VERSIONA: A QUANTIDADE DECLARADA, NAO SO O EQUIVALENTE -----------
--
-- Uma coluna GERADA nao se versiona sozinha -- deriva do que a alimenta. Se
-- esta tabela guardasse so o equivalente semanal, "quantas horas tinha
-- contratadas a 12 de Marco" responder-se-ia com um numero sem unidade legivel
-- (39,92 h/semana quando o contrato real e "173h/mes") -- a mesma perda de
-- informacao que a coluna crua tinha antes de 20261120190000 a corrigir.
--
-- Por isso versionam-se AS DUAS coisas juntas, na mesma linha:
--   horas_periodo + horas_frequencia   -- o que foi ACORDADO (a quantidade,
--                                         na unidade em que foi escrita)
--   horas_semanais_equivalentes        -- GERADA, STORED, nesta tabela
--                                         tambem -- a mesma grandeza numa
--                                         unidade comparavel
--
-- A equivalente vive na propria linha (nao se recalcula por fora) porque
-- "quantas horas tinha contratadas a 12 de Marco" tem de responder-se lendo
-- UMA linha, sem reconstruir nada: nem repetir o CASE de conversao num
-- SELECT, nem ir comparar contra pessoas_vinculos (que so guarda o EM VIGOR).
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Tabela satelite, copia estrutural de pessoas_retribuicoes: mesma FK composta
-- (pessoa_id, organization_id) -> pessoas, mesma FK composta de vinculo_id
-- contra pessoas_vinculos (id, pessoa_id, organization_id), mesmo indice unico
-- parcial de versao aberta (POR PESSOA, nao por vinculo -- e o que o molde diz
-- e o que faz sentido: horas contratadas sao um facto da pessoa, tal como a
-- retribuicao), mesmo trigger de nao-sobreposicao por daterange, mesmo soft
-- delete, e -- ao contrario da tentativa anterior, que a tinha recusado --
-- mesma auditoria em pessoas_acessos_sensiveis a cada INSERT/UPDATE
-- (campo='horas_contratadas', accao='alterar'). O molde pedido para esta
-- ronda inclui essa auditoria explicitamente; nao se discute aqui.
--
-- documento_id (FK simples contra pessoas_documentos, no mesmo padrao de
-- pessoas_vinculos_alteracoes.documento_id em 20261123050000) liga a versao ao
-- aditamento assinado que a origina, quando existir um.
--
-- pessoas_vinculos.horas_periodo e horas_frequencia PASSAM A SER DERIVADOS: um
-- trigger AFTER em pessoas_vinculos_horas escreve os dois na versao em aberto
-- da pessoa no vinculo EM VIGOR (estado IN ('activo','suspenso'), o mesmo par
-- de estados que idx_pessoas_vinculos_um_em_vigor ja trata como "um so por
-- pessoa" desde 20261122100000); um trigger BEFORE em pessoas_vinculos bloqueia
-- qualquer UPDATE directo a essas duas colunas fora desse mecanismo (GUC
-- hr.sync_horas_periodo, mesmo padrao do local_id em 20261130060000).
-- horas_semanais_equivalentes de pessoas_vinculos continua gerada A PARTIR
-- DESSAS DUAS (20261120190000) -- nao se toca nela, actualiza-se sozinha.
--
-- Se a pessoa nao tiver nenhuma versao em aberto (ainda nao migrada, ou o
-- vinculo em vigor legitimamente nao tem horas fixas -- ex.: prestacao de
-- servicos), o trigger escreve NULL nas duas colunas, que e o estado actual
-- para essas pessoas e continua a ser um valor legitimo.
--
--
-- -- CORRECCAO POS-REVISAO: horas_frequencia PASSA A ACEITAR NULL -------------
--
-- A versao anterior desta migracao assumia, sem confirmar, que as duas
-- colunas aceitavam NULL. horas_periodo sim (nunca teve NOT NULL, desde que
-- nasceu como horas_semanais em 20261120060000). horas_frequencia NAO: e NOT
-- NULL DEFAULT 'semanal' desde 20261120140000 (linha 265), e nem
-- 20261120190000 (que mexeu no dominio do CHECK, nao na nulidade) nem nenhuma
-- migracao posterior alterou isso -- confirmado por leitura directa dos tres
-- ficheiros, nao por suposicao.
--
-- Isto tornava a tabela inutilizavel logo apos aplicar: o UNICO caminho para
-- versionar horas e fechar a versao em aberto antes de abrir a seguinte (o
-- trigger de nao-sobreposicao recusa duas versoes vivas), e ficar sem versao
-- em aberto por um instante (ou para sempre, nas pessoas sem horas fixas) e
-- estado legitimo. Nesse instante hr_vinculos_horas_manter_valor_em_vigor()
-- escrevia NULL em horas_frequencia e o UPDATE rebentava com 23502.
--
-- DECISAO (reafirmada e agora CUMPRIDA na 3a revisao -- achado 5): largar o
-- NOT NULL de pessoas_vinculos.horas_frequencia (seccao 2.5, mais abaixo) E
-- largar tambem o DEFAULT 'semanal'. Manter o DEFAULT escreveria uma
-- frequencia FALSA sempre que a pessoa fica sem versao em aberto: 'semanal'
-- quando na verdade nao ha horas nenhumas declaradas, contradizendo o
-- paragrafo logo acima (NULL nas duas colunas juntas e o estado legitimo de
-- quem nao tem horas fixas). As DUAS revisoes anteriores escreveram esta
-- decisao aqui e nunca a aplicaram no SQL (a seccao 2.5 largava so o NOT
-- NULL, e o COMMENT ON COLUMN dizia o oposto -- "o DEFAULT mantem-se") --
-- contradicao apanhada na 3a revisao. A seccao 2.5 agora larga os dois, e o
-- COMMENT ON COLUMN foi reescrito para dizer o mesmo que este paragrafo. Com
-- esta correccao as duas colunas voltam a andar sempre a par, que e a propria
-- regra que esta migracao estabelece.
--
-- CONSEQUENCIA DE LARGAR UM NOT NULL NUMA COLUNA COM DADOS, por extenso: como
-- a coluna nunca aceitou NULL ate agora, nenhuma linha existente fica ilegal
-- -- o efeito e so passar a permitir, dai em diante, o par (NULL, NULL) que o
-- proprio DEFAULT 'semanal' impedia de existir. Nenhum CHECK depende da
-- nulidade (pessoas_vinculos_frequencia_tem_factor so exige o equivalente
-- preenchido QUANDO horas_periodo nao e NULL). Nao ha reversao automatica: por
-- NOT NULL de volta exigiria primeiro decidir o que fazer as linhas que,
-- entretanto, tenham ficado com NULL -- repor 'semanal' nelas seria inventar
-- um dado que a base deixou de ter.
--
--
-- -- ALTERACAO != CORRECCAO, REAPROVEITANDO O QUE JA EXISTE ---------------------
--
-- ALTERACAO reaproveita hr.pessoas.vinculos.edit -- a mesma autoridade que ja
-- edita o vinculo em si; nao se duplica. CORRECCAO usa
-- hr.pessoas.vinculos.horas.corrigir, que JA ESTA no catalogo desde
-- 20261130050000 (ja atribuida ao super_admin nessa migracao) precisamente
-- para esta tabela -- nao se cria permissao nenhuma aqui. A distincao usa
-- public.hr_periodo_decorrido(), criada em 20261130060000 e reaproveitada
-- tal e qual, sem reescrever outra igual.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se cria vista nem RPC de leitura consolidada.
-- - Nao se mexe em 20261120190000 nem em nenhuma migracao ja aplicada: o CASE
--   de conversao repete-se aqui numa funcao IMMUTABLE partilhavel
--   (hr_horas_periodo_para_semana), e nao por preguica -- a coluna gerada de
--   pessoas_vinculos ja esta criada com o CASE inline, e o Postgres nao deixa
--   trocar a expressao de uma coluna gerada existente sem a recriar (e essa
--   tabela nao se recria por causa de RLS/grants que se perderiam). A funcao
--   nova serve esta tabela e qualquer satelite futuro que precise da mesma
--   conversao.
-- - Nao se toca no tecto de 80h/semana equivalentes: reaplica-se aqui,
--   verbatim, para a mesma grandeza.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER IF EXISTS trg_pessoas_vinculos_sincronizar_ao_entrar_em_vigor ON public.pessoas_vinculos;
--   DROP FUNCTION IF EXISTS public.hr_pessoas_vinculos_sincronizar_ao_entrar_em_vigor();
--   DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_e_derivado ON public.pessoas_vinculos;
--   DROP FUNCTION IF EXISTS public.hr_pessoas_vinculos_horas_e_derivado();
--   DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_manter_em_vigor ON public.pessoas_vinculos_horas;
--   DROP FUNCTION IF EXISTS public.hr_vinculos_horas_manter_valor_em_vigor();
--   DROP FUNCTION IF EXISTS public.hr_vinculos_horas_sincronizar(uuid, uuid);
--   DROP TABLE IF EXISTS public.pessoas_vinculos_horas;
--   DROP FUNCTION IF EXISTS public.hr_vinculos_horas_sem_sobreposicao();
--   DROP FUNCTION IF EXISTS public.hr_vinculos_horas_auditar();
--   DROP FUNCTION IF EXISTS public.hr_horas_periodo_para_semana(numeric, text);
-- Isto apaga historico de horas contratadas e congela
-- pessoas_vinculos.horas_periodo/horas_frequencia no ultimo valor que tinham.
-- Reverter a extensao do CHECK de pessoas_acessos_sensiveis.campo NAO se faz:
-- ja podem existir linhas de auditoria com campo='horas_contratadas', e um
-- registo append-only nao se torna ilegal (mesma razao de 20261127020000).
-- Repor o NOT NULL e o DEFAULT 'semanal' de pessoas_vinculos.horas_frequencia
-- (seccao 2.5) TAMBEM NAO se faz as cegas: se entretanto alguma linha tiver
-- ficado com NULL (o proposito desta migracao), um ALTER COLUMN ... SET NOT
-- NULL rebenta contra essa linha. Decidir primeiro o que fazer a essas linhas
-- -- nao inventar 'semanal' nelas so para o SET NOT NULL passar.
--
--
-- -- CORRECCAO DA 3a REVISAO: DOIS BLOQUEANTES E CINCO ACHADOS MENORES -------
--
-- (achado 1, BLOQUEANTE) A guarda so cobria UPDATE OF horas_periodo,
-- horas_frequencia -- um INSERT em pessoas_vinculos com essas duas colunas
-- preenchidas passava em silencio, sem trigger nenhum a ver. Corrigido: o
-- trigger passa a BEFORE INSERT OR UPDATE OF ..., e hr_pessoas_vinculos_
-- horas_e_derivado() ganhou um ramo para TG_OP = 'INSERT' que recusa
-- qualquer INSERT com uma das duas colunas nao-nula, salvo com a GUC
-- hr.sync_horas_periodo ligada (o mesmo mecanismo que ja protegia o UPDATE).
--
-- (achado 2, BLOQUEANTE) A sincronizacao so disparava em pessoas_vinculos_
-- horas -- terminar o vinculo A e abrir o B (o caminho normal da aplicacao)
-- deixava B com o que viesse no seu proprio INSERT, podendo contradizer a
-- versao em aberto da pessoa, sem forma de o corrigir a mao (o UPDATE directo
-- fica bloqueado pelo achado 1). Corrigido: o nucleo da sincronizacao foi
-- extraido para public.hr_vinculos_horas_sincronizar(pessoa_id,
-- organization_id), chamado agora dos DOIS lados -- pelo trigger existente em
-- pessoas_vinculos_horas (quando a versao de horas muda) e por um trigger
-- NOVO em pessoas_vinculos (quando um vinculo ENTRA em vigor: nasce ja
-- activo/suspenso, ou transita estado/deleted_at para isso). Ver a seccao
-- "Lado 2 da sincronizacao", mais abaixo.
--
-- (achado 3, ALTO) O bloco de conferir fazia RAISE EXCEPTION se a organizacao
-- nike (b6ffce4f-...) nao existisse -- abortava numa base reconstruida do
-- zero, num ramo novo, ou na integracao continua. Corrigido: o teste ao vivo
-- cria a sua PROPRIA organizacao descartavel ("name" e a unica coluna NOT
-- NULL sem DEFAULT em anew_organizations; nenhuma FK obriga a nike existir) e
-- a sua propria pessoa/vinculos, tudo dentro do mesmo bloco aninhado com
-- EXCEPTION que ja desfazia os dados de teste -- nada disto fica na base, em
-- nenhum dos dois ambientes (falha ou sucesso).
--
-- (achado 4, ALTO) O marcador de sucesso usava SQLSTATE P0001, o mesmo de
-- qualquer RAISE EXCEPTION do projecto (incluindo os dois triggers desta
-- propria migracao) -- um WHEN SQLSTATE 'P0001' apanhava esses erros reais
-- como se fossem o teste a passar, e o WHEN OTHERS deitava fora o SQLSTATE
-- original. Corrigido: os triggers desta migracao agora levantam com
-- SQLSTATE proprio (HR010), o marcador de sucesso do teste usa outro (HR900,
-- nunca reaproveitado para um erro real), e o WHEN OTHERS do bloco de
-- conferir reporta SQLSTATE e SQLERRM originais em vez de os esconder atras
-- de uma frase generica.
--
-- (achado 5, MEDIO) Ver o paragrafo "DECISAO", acima: cabecalho e COMMENT
-- contradiziam-se sobre o DEFAULT 'semanal', e o SQL nunca o largava. A
-- seccao 2.5 agora larga os dois (NOT NULL e DEFAULT), e o COMMENT ON COLUMN
-- diz o mesmo que o cabecalho.
--
-- (achado 6, MEDIO) A semente (seccao 3) escrevia uma linha de auditoria por
-- pessoa, em TODAS as organizacoes, para uma alteracao que ninguem fez -- so
-- copiava para a tabela nova um valor que ja existia em pessoas_vinculos.
-- Corrigido: hr_vinculos_horas_auditar() ganhou a GUC hr.skip_horas_
-- auditoria, ligada SO a volta do INSERT da semente (seccao 3) -- qualquer
-- ALTERACAO ou CORRECCAO feita por um utilizador real continua a ser
-- registada normalmente.
--
-- (achado 7, BAIXO) O primeiro ramo da guarda de idx_pessoas_vinculos_um_
-- em_vigor procurava o nome em pg_constraint -- mas e um indice unico simples
-- (CREATE UNIQUE INDEX), nunca uma constraint, e esse ramo nunca media nada.
-- Removido; fica so a verificacao contra pg_indexes, que e a que conta.
--
-- -- CORRECCAO DA 4a REVISAO: UM BLOQUEANTE DE TESTE, UM BLOQUEANTE DE CODIGO,
-- -- UM CARIMBO FORA DE ORDEM E UMA VERSAO PENDURADA NO VINCULO ERRADO --------
--
-- (achado 1, BLOQUEANTE) O bloco de conferir fazia UPDATE pessoas_vinculos
-- SET estado = 'terminado' num vinculo sem data_fim -- rebentava contra
-- pessoas_vinculos_terminado_tem_data_fim (20261122100000), o WHEN OTHERS
-- convertia-o num RAISE EXCEPTION generico, e a migracao inteira falhava a
-- meio do proprio teste que devia prova-la. NUNCA tinha sido aplicada por
-- causa disto. Corrigido: o UPDATE agora preenche data_fim (>= data_inicio,
-- respeitando tambem pessoas_vinculos_fim_depois_inicio).
--
-- (achado 2, BLOQUEANTE) O cabecalho afirmava, em maiuscula, ter confirmado
-- "por leitura DIRECTA e actual" TODOS os caminhos de escrita, e listava tres
-- ficheiros -- afirmacao falsa: existe um QUARTO, em src/lib/hr/novaPessoa.ts
-- + src/hooks/usePessoas.ts (o assistente de admissao de pessoa nova), que
-- escreve horas_periodo/horas_frequencia directamente num INSERT em
-- pessoas_vinculos. Sem corrigir, aplicar esta migracao partia TODA A
-- ADMISSAO com contrato (horas_frequencia vai sempre preenchida, por
-- omissao). Corrigido: o banner do topo do ficheiro deixa de afirmar
-- confirmacao total, nomeia o quarto caminho, e diz exactamente que
-- ficheiros/linhas mudar e para que via de escrita (o mesmo padrao do
-- caminho 3, ja pensado para isto) -- NAO SE ALTERA src/ aqui, por estar fora
-- do scope desta migracao.
--
-- (achado 3, ALTO) O carimbo (20261130120000) ja tinha 20261130130000 e
-- 20261130140000 a frente na fila de supabase/migrations/ -- um db push
-- recusaria sem --include-all. "Corrigido" nesta revisao renumerando para
-- 20261130150000 -- SO OLHANDO PARA OS DOIS FICHEIROS QUE MOTIVARAM A
-- RENUMERACAO E PARANDO AI. Esse carimbo, por sua vez, ESTAVA OCUPADO (e o
-- de 20261130150000_hr_sindicalizacao_facultativa_na_admissao.sql, ja
-- aplicado neste worktree) -- trocou um carimbo fora de ordem por um
-- DUPLICADO. So apanhado na 5a revisao (achado 1, abaixo); ver ai a
-- correccao real e o que ela obrigou a mudar.
--
-- (achado 4, ALTO) A versao de horas em aberto ficava pendurada no vinculo
-- ERRADO depois de terminar A e abrir B: os VALORES propagavam-se para B
-- (hr_vinculos_horas_sincronizar ja fazia isso), mas
-- pessoas_vinculos_horas.vinculo_id continuava a apontar para A, ja
-- terminado -- uma versao EM ABERTO a documentar um contrato que acabou.
-- DECISAO: RE-APONTAR (nao fechar-e-abrir uma versao nova): a versao em
-- aberto representa as horas ACORDADAS da pessoa, nao um facto do vinculo em
-- si -- o proprio desenho desta migracao ja trata "por pessoa, nao por
-- vinculo" como a granularidade certa (o indice unico da versao aberta e por
-- pessoa_id). Fechar e abrir uma versao nova, so por o vinculo ter mudado,
-- inventaria uma alteracao de horas que ninguem fez e geraria auditoria
-- espuria (o mesmo problema que a GUC hr.skip_horas_auditoria existe para
-- evitar na semente). Corrigido em hr_vinculos_horas_sincronizar(): depois de
-- propagar os valores, re-aponta vinculo_id da versao em aberto para o
-- vinculo realmente em vigor, so quando muda (IS DISTINCT FROM, idempotente e
-- sem recursao indefinida -- a segunda passagem, disparada pelo proprio
-- trigger da tabela, encontra tudo ja igual e para). O bloco de conferir
-- ganhou o cenario que o teria apanhado: depois de terminar A e abrir B,
-- confirma que a versao em aberto ficou com vinculo_id = B, nao A.
--
-- -- DOIS ACHADOS DA 3a REVISAO QUE NAO SE CORRIGEM AQUI -----------------------
--
-- - public.hr_vinculos_registar_alteracao() (20261123050000, ~linha 214,
--   array v_campos) ainda lista 'horas_semanais' -- coluna que deixou de
--   existir desde 20261120190000 -- e nao lista 'horas_periodo'. Defeito
--   PRE-EXISTENTE (nao introduzido por esta migracao) que esta migracao
--   torna corrente: a partir de agora ha DUAS colunas de horas com esse
--   problema (horas_periodo E horas_frequencia, se se quiser incluir esta
--   ultima). Precisa de migracao propria para corrigir o array. (NOTA da 6a
--   revisao: isto e um problema DIFERENTE do achado "MEDIO" corrigido nessa
--   revisao. Ali o array estar certo sobre horas_frequencia e o que causava
--   a auditoria espuria -- corrigido com uma GUC, nao mexendo no array. Este
--   ponto continua por corrigir: o array continua com 'horas_semanais' e sem
--   'horas_periodo'.)
-- - src/types/hr.ts (~linha 443) declara `horas_frequencia: HorasFrequencia`
--   (nao-nulo), com o comentario "Nunca nulo na base (default 'semanal')".
--   Ambos deixam de ser verdade com a seccao 2.5 desta migracao (NOT NULL e
--   DEFAULT largados): o tipo devia passar a `HorasFrequencia | null` e o
--   comentario reescrito. NAO se altera aqui -- fora de scope (so a
--   migracao) -- mas fica registado para nao se perder.
--
--
-- -- CORRECCAO DA 5a REVISAO: CARIMBO DUPLICADO (NAO SO FORA DE ORDEM) E -------
-- -- AUDITORIA ESPURIA NO RE-APONTAMENTO -------------------------------------
--
-- (achado 1, BLOQUEANTE) A renumeracao da 4a revisao (achado 3, acima) so
-- olhou para 20261130130000 e 20261130140000 -- os dois ficheiros que a
-- motivaram -- e parou ai, escolhendo 20261130150000. Mas a seguir a essas
-- duas ja existiam OUTRAS DUAS migracoes aplicadas neste worktree:
-- 20261130150000_hr_sindicalizacao_facultativa_na_admissao.sql (OCUPADO --
-- exactamente o carimbo escolhido) e 20261130160000_hr_locais_trabalho_
-- contacto.sql (tambem ocupado). Confirmado por "ls supabase/migrations/"
-- nesta revisao, nao por suposicao: o primeiro carimbo livre e
-- 20261130170000. Renumerado outra vez, agora para esse -- e, ao contrario
-- da renumeracao anterior, o carimbo NAO estava so no nome do ficheiro: uma
-- migracao de dados persistentes leva-o para dentro da base, e todos esses
-- sitios tinham de mudar tambem, nao so o nome:
--   - o COMMENT ON COLUMN de pessoas_vinculos.horas_frequencia (seccao 2.5)
--   - o motivo de cada linha semeada de pessoas_vinculos_horas (seccao 3) --
--     este e o mais grave dos seis: fica GRAVADO EM DADOS, nao so no ficheiro
--     .sql, e por isso sobrevive a esta propria correccao se nao for mudado
--     aqui
--   - o nome da organizacao e da pessoa de teste no bloco de conferir
--   - a mensagem do RAISE de sucesso (SQLSTATE HR900) no bloco de conferir
--   - as tres mencoes no proprio cabecalho (achados 3 e 4 da 4a revisao,
--     acima)
-- Os nove pontos foram substituidos por uma unica passagem de texto (sed
-- sobre o ficheiro inteiro, verificado por grep a seguir a nao sobrar nenhum
-- "20261130150000" e a ficheiro continuar em LF puro por contagem de bytes
-- 0x0D, nao por grep) -- nenhum deles ficou a apontar para o carimbo antigo.
-- A alinea 1 da lista ANTES DO db push (mais abaixo) tambem mudou: pedia so
-- para confirmar que nao havia 20261130150000 "ja aplicado SEM ficheiro
-- local" -- a situacao real era a inversa (um ficheiro local com um carimbo
-- que OUTRA migracao ja tinha aplicado) e essa redaccao nunca a apanharia.
-- Agora pede as duas coisas: nenhum ficheiro local com o mesmo carimbo de
-- outra migracao ja em supabase/migrations/, E nenhum carimbo aplicado no
-- remoto sem ficheiro local correspondente.
--
-- (achado 2, ALTO) hr_vinculos_horas_sincronizar() re-aponta vinculo_id da
-- versao em aberto (achado 4 da 4a revisao) com um UPDATE simples em
-- pessoas_vinculos_horas -- e essa tabela tem trg_pessoas_vinculos_horas_
-- auditar AFTER INSERT OR UPDATE, SEM WHEN e SEM lista de colunas: dispara
-- em QUALQUER UPDATE da linha, incluindo um que so muda vinculo_id. A GUC
-- hr.skip_horas_auditoria so estava ligada a volta da semente (seccao 3);
-- em tempo de execucao normal fica 'off'. Resultado: o caminho normal da
-- aplicacao -- terminar o vinculo A e abrir o B -- escrevia uma linha
-- 'horas_contratadas / alterar' em pessoas_acessos_sensiveis, atribuida a
-- quem apenas renovou o contrato, sem ninguem ter tocado em horas nenhumas.
-- Isto contradizia literalmente a propria justificacao escrita no achado 4
-- da 4a revisao ("nao inventar uma alteracao de horas nem gerar auditoria
-- espuria") e a frase final do RAISE NOTICE de sucesso ("sem auditoria
-- espuria"). Corrigido: a GUC hr.skip_horas_auditoria passa a ligar-se
-- tambem a volta do UPDATE de re-apontamento dentro de hr_vinculos_horas_
-- sincronizar() -- e correcto faze-lo ali (nao no trigger, com um WHEN)
-- porque esse UPDATE, por definicao, NUNCA muda horas_periodo/horas_
-- frequencia/valido_de/valido_ate -- so vinculo_id; qualquer OUTRO UPDATE ou
-- INSERT na tabela (uma alteracao ou correccao real, feita por um
-- utilizador) continua a passar pelo trigger com a GUC 'off' e a ser
-- registado normalmente. O bloco de conferir ganhou a asserencia que faltava
-- (nao apanhada pelo cenario da 4a revisao, que so verificava o
-- re-apontamento, nunca a auditoria): conta as linhas de pessoas_acessos_
-- sensiveis da pessoa de teste antes e depois de terminar A e abrir B, e
-- exige que nao aumentem.
--
--
-- -- CORRECCAO DA 6a REVISAO (REVISAO ADVERSARIAL, RONDA 2): UM BLOQUEANTE DE
-- -- SEGURANCA, UM BLOQUEANTE DE CORRECCAO, UM CARIMBO OUTRA VEZ OCUPADO,
-- -- AUDITORIA ESPURIA NO OUTRO REGISTO E UM 23514 CRU ------------------------
--
-- (achado SEGURANCA, BLOQUEANTE) public.hr_vinculos_horas_sincronizar(uuid,
-- uuid) e SECURITY DEFINER, RETURNS void, no schema public -- e nao tinha
-- NENHUM REVOKE. Ficava com EXECUTE de PUBLIC, logo de authenticated, e
-- exposta como RPC do PostgREST (/rest/v1/rpc/hr_vinculos_horas_sincronizar):
-- qualquer utilizador autenticado de QUALQUER organizacao podia chama-la com
-- o pessoa_id/organization_id de OUTRA e provocar escritas la dentro (UPDATE
-- a horas_periodo/horas_frequencia, UPDATE a vinculo_id, linhas em
-- pessoas_vinculos_alteracoes atribuidas ao chamador) sem RLS nenhuma, e era
-- tambem a UNICA forma de ligar a GUC hr.sync_horas_periodo a partir de fora
-- -- contornando a propria guarda que esta migracao existe para impor. E a
-- primeira funcao CHAMAVEL definer desta serie de RH sem REVOKE: o molde que
-- copia, hr_registar_acesso_sensivel (20261120040000), revoga de PUBLIC/anon/
-- authenticated e concede so a service_role -- hr_periodo_decorrido nao e
-- definer, por isso nao ha molde a seguir ali. Corrigido: REVOKE ALL de
-- PUBLIC/anon/authenticated + GRANT EXECUTE a service_role, logo apos a
-- funcao. Os dois triggers que a chamam (hr_vinculos_horas_manter_valor_em_
-- vigor, hr_pessoas_vinculos_sincronizar_ao_entrar_em_vigor) sao eles
-- proprios SECURITY DEFINER, por isso continuam a alcanca-la sem GRANT
-- nenhum a authenticated. O bloco de conferir ganhou tres assercoes com
-- has_function_privilege (mede o GRANT real, nao suposicao).
--
-- (achado CORRECCAO, BLOQUEANTE) O "valor EM VIGOR" era derivado da versao
-- EM ABERTO (valido_ate IS NULL), nao da versao valida HOJE -- as duas
-- coincidem na maior parte do tempo, mas o caminho de escrita desta
-- funcionalidade (alterar(), em src/hooks/usePessoaVinculoHoras.ts, linhas
-- 117-148) produz os dois casos em que divergem: uma dataEfeito FUTURA (um
-- aditamento assinado hoje, com efeito no mes seguinte -- o caso normal)
-- fecha a versao actual nessa data e abre a nova com valido_de nessa mesma
-- data; so filtrar "valido_ate IS NULL" apanhava a versao NOVA, ainda por
-- vigorar, e escrevia as horas futuras em pessoas_vinculos desde ja. No
-- sentido inverso, fechar a versao aberta com um valido_ate futuro (sem
-- abrir logo a seguinte) fazia as duas colunas ficarem NULL de imediato,
-- embora as horas antigas ainda vigorassem ate essa data. Nao ha cron nem
-- trigger temporal nesta migracao (nem esta correccao o inventa): o valor so
-- fica certo, na data de efeito, na proxima escrita que dispare esta
-- sincronizacao -- limitacao pre-existente do desenho "sincroniza por
-- trigger", nao alargada aqui. Corrigido: o SELECT da versao em vigor passa
-- a filtrar valido_de <= CURRENT_DATE AND (valido_ate IS NULL OR valido_ate
-- > CURRENT_DATE) -- a versao cujo intervalo [valido_de, valido_ate) contem
-- hoje, o mesmo desenho de intervalo meio-aberto que hr_vinculos_horas_sem_
-- sobreposicao ja usa com daterange(..., '[)'). O bloco de conferir ganhou
-- os dois cenarios (directo e reverso), com datas relativas a CURRENT_DATE
-- -- os cenarios anteriores usavam so datas de 2020, que nunca apanhavam
-- nenhum dos dois sentidos.
--
-- (achado MEDIO) trg_pessoas_vinculos_registar_alteracao (20261123050000,
-- AFTER UPDATE ON pessoas_vinculos, SEM lista de colunas) tem 'horas_
-- frequencia' no seu array v_campos -- o UPDATE principal desta sincronizacao
-- (SET horas_periodo, horas_frequencia) disparava-o na mesma, escrevendo uma
-- linha 'horas_frequencia: NULL -> semanal' em pessoas_vinculos_alteracoes
-- atribuida a quem apenas terminou um vinculo e abriu outro -- o mesmo
-- problema que o achado 2 da 5a revisao ja tinha corrigido para pessoas_
-- acessos_sensiveis, so que no OUTRO registo de auditoria, que a GUC hr.
-- skip_horas_auditoria (so ligada a volta do re-apontamento de vinculo_id)
-- nao cobria. Corrigido: a GUC passa a ligar-se tambem a volta do UPDATE
-- principal, e hr_vinculos_registar_alteracao() e recriada (CREATE OR
-- REPLACE, seccao "6a revisao: auditoria em pessoas_vinculos_alteracoes",
-- mais abaixo -- NAO se edita 20261123050000, ja aplicada) a saltar SO o
-- campo horas_frequencia quando a GUC estiver ligada. Nao se corrige aqui o
-- defeito PRE-EXISTENTE e DIFERENTE, ja documentado acima (o array listar
-- 'horas_semanais' e nao listar 'horas_periodo') -- fora de scope, precisa de
-- migracao propria. O bloco de conferir ganhou a assercao equivalente a do
-- achado 2 da 5a revisao, agora contra pessoas_vinculos_alteracoes.
--
-- (achado BAIXO/MEDIO) Uma versao de horas acima do maximo declarado no
-- vinculo (pessoas_vinculos_maximo_acima_do_contratado, 20261120190000 -- um
-- CHECK da propria tabela pessoas_vinculos, nao um trigger: a frase "trigger
-- AFTER" que estava aqui ate a 6a revisao era prosa incorrecta, corrigida na
-- 7a, achado BAIXO) fazia o UPDATE desta sincronizacao rebentar com um 23514
-- cru -- tabela DIFERENTE daquela em que quem registou as horas escreveu --
-- incompreensivel para quem so viu o formulario de horas. Recusar esta
-- certo; so a mensagem mudou: o UPDATE principal passa a correr dentro de um
-- BEGIN...EXCEPTION que apanha especificamente check_violation e levanta
-- HR011 (SQLSTATE proprio, nunca P0001) com uma frase compreensivel -- e,
-- desde a 7a revisao, so quando a constraint violada e mesmo
-- pessoas_vinculos_maximo_acima_do_contratado (por nome, via GET STACKED
-- DIAGNOSTICS): qualquer outro 23514 desta tabela sobe tal como veio, em vez
-- de ficar sempre mascarado atras da mensagem do tecto de horas. O bloco de
-- conferir ganhou um cenario proprio (pessoa e vinculo dedicados, para nao
-- interferir com as versoes de horas ja abertas dos cenarios anteriores).
--
-- (achado de CARIMBO, nao um achado do revisor -- confirmado por "ls
-- supabase/migrations/" nesta revisao, nao por suposicao) O carimbo
-- 20261130170000, escolhido na 5a revisao, ja nao estava livre neste
-- worktree: supabase/migrations/20261130170000_hr_pessoa_duplicados_
-- candidatos_travao_enumeracao.sql -- uma migracao de OUTRA tarefa, sem
-- relacao nenhuma com horas, ainda por commitar mas ja presente na pasta --
-- passou a ocupa-lo entretanto. Como esta migracao so vivia no vault (nunca
-- tinha chegado a supabase/migrations/), nao havia colisao de ficheiros
-- ainda, mas copia-la para la com esse nome colidiria assim que ambas
-- fossem commitadas. Renumerado para 20261130180000 (primeiro carimbo livre,
-- confirmado da mesma forma) em todos os sitios que ficam gravados em dados
-- ou repetidos no ficheiro -- mesmos seis pontos da 5a revisao, mesmo
-- metodo de verificacao (LF puro por contagem de bytes 0x0D, nao por grep;
-- grep a seguir a nao sobrar nenhum "20261130170000" como auto-referencia).
-- A alinea 1 da lista ANTES DO db push tambem mudou: passa a pedir
-- confirmacao de que 20261130170000 (a migracao de duplicados, nao
-- relacionada) tambem ja esta aplicada ou vai no mesmo push, antes desta.
--
--
-- -- CORRECCAO DA 7a REVISAO: UM BLOQUEANTE INTRODUZIDO PELA PROPRIA 6a
-- -- REVISAO, UM ALTO NO RE-APONTAMENTO, E DOIS ACHADOS BAIXOS DE MENSAGEM --
--
-- (achado BLOQUEANTE, introduzido pela propria "CORRECAO" da 6a revisao) A
-- semente (seccao 3) grava valido_de = data_inicio do vinculo. Desde a 6a
-- revisao, hr_vinculos_horas_sincronizar() so encontra a versao valida HOJE
-- (valido_de <= CURRENT_DATE). Um vinculo 'activo' ou 'suspenso' com
-- data_inicio NO FUTURO -- alcancavel: nada no schema liga estado a
-- data_inicio, e o assistente de admissao (src/lib/hr/novaPessoa.ts, ~linha
-- 677) grava sempre estado 'activo' com a data que vier do formulario --
-- produzia uma versao semeada que a sincronizacao nunca encontrava: o
-- trigger AFTER da propria semente disparava, nao via nenhuma versao valida
-- hoje, e escrevia horas_periodo = NULL, horas_frequencia = NULL no vinculo
-- -- apagando as horas contratadas que la estavam antes desta migracao. A
-- propria assercao "v_seed_valida" (bloco de conferir) ja apanhava isto e
-- fazia o db push falhar -- mas so DEPOIS de a semente ja ter escrito o
-- NULL, e sem a assercao a explicacao seria uma perda de dados silenciosa.
-- Das tres alternativas consideradas -- least(data_inicio, CURRENT_DATE); a
-- semente ignorar vinculos com inicio futuro; a sincronizacao recuar para a
-- versao mais proxima quando nenhuma contem hoje -- escolhida a primeira:
-- ignorar esses vinculos partiria a propria assercao "v_por_semear" (exige
-- versao aberta para TODO vinculo em vigor com horas declaradas) e deixaria
-- um valor cru sem versao a sustenta-lo; recuar na sincronizacao reabriria
-- exactamente o problema que a "CORRECAO" da 6a revisao fechou para o
-- aditamento com data de efeito futura (voltaria a mostrar-se cedo demais).
-- least() nunca adianta a data -- so a capa a hoje -- por isso nao muda nada
-- para os vinculos com inicio hoje ou no passado (a esmagadora maioria).
-- Corrigido na semente (seccao 3). O bloco de conferir ganhou o cenario que
-- o teria apanhado: um vinculo activo com data_inicio no futuro, exercitado
-- com a mesma expressao da semente.
--
-- (achado ALTO) O re-apontamento de vinculo_id (dentro de hr_vinculos_horas_
-- sincronizar(), no fim) reaproveitava v_horas_id -- que desde a "CORRECAO"
-- da 6a revisao passou a ser a versao valida HOJE, ja NAO a versao EM
-- ABERTO que o proprio COMMENT ON FUNCTION sempre afirmou ser o alvo. No
-- caso normal desta funcionalidade (um aditamento assinado hoje, com efeito
-- daqui a um mes) a versao em aberto e a FUTURA e v_horas_id e a versao
-- actual, ja fechada. Se o vinculo mudar nesse intervalo (terminar A, abrir
-- B), reapontar v_horas_id reapontava a versao HISTORICA e fechada -- e
-- deixava a versao em aberto pendurada no vinculo terminado, exactamente o
-- defeito que o achado 4 da 4a revisao existia para fechar, reintroduzido
-- pela propria correccao da 6a. Corrigido: consulta propria
-- (v_horas_aberta_id, filtrando so por valido_ate IS NULL) para o
-- re-apontamento, nunca reaproveitando v_horas_id. O bloco de conferir
-- ganhou o cenario que o teria apanhado -- inexistente antes desta revisao:
-- no cenario de re-apontamento ja existente so havia versao em aberto (as
-- duas coincidiam), e nos cenarios de datas futuras o vinculo nunca mudava.
-- O novo cenario cria, na mesma pessoa de teste, uma versao FECHADA valida
-- hoje e uma versao EM ABERTO futura -- as duas ainda apontadas para o
-- mesmo vinculo -- muda o vinculo outra vez, e confirma que so a versao EM
-- ABERTO se move; a fechada, historica, fica no vinculo onde vigorou.
--
-- (achado BAIXO) O WHEN check_violation a volta do UPDATE principal apanhava
-- QUALQUER 23514 de pessoas_vinculos e assumia sempre que era o tecto de
-- horas (pessoas_vinculos_maximo_acima_do_contratado) -- hoje os outros
-- CHECK dessa tabela sao barrados a montante por outras guardas, mas a
-- mensagem podia passar a mentir se isso deixasse de ser verdade. Corrigido:
-- confirma pelo NOME da constraint (GET STACKED DIAGNOSTICS ... =
-- CONSTRAINT_NAME) antes de reescrever a mensagem para HR011; qualquer outro
-- 23514 sobe tal como veio (RAISE sem argumentos, dentro do handler).
--
-- (achado BAIXO, de prosa) O cabecalho e o bloco de conferir diziam que o
-- 23514 do tecto de horas era "levantado por um trigger AFTER sobre
-- pessoas_vinculos" -- e um CHECK de tabela (pessoas_vinculos_maximo_acima_
-- do_contratado, ADD CONSTRAINT em 20261120190000, linha 294), nunca um
-- trigger. Corrigida a prosa nos tres sitios onde aparecia.
--
--
-- Prerequisitos:
--   20261120040000  pessoas_acessos_sensiveis, hr_registar_acesso_sensivel(),
--                   hr_satelite_ancora_imutavel()
--   20261120060000  pessoas_vinculos, pessoas_vinculos_id_pessoa_org_key
--   20261120190000  horas_periodo, horas_frequencia, horas_semanais_equivalentes
--   20261122100000  idx_pessoas_vinculos_um_em_vigor (activo OU suspenso)
--   20261123030000  pessoas_documentos (para documento_id)
--   20261123050000  pessoas_vinculos_alteracoes, hr_vinculos_registar_alteracao()
--                   -- prerequisito NOVO da 6a revisao: esta migracao passa a
--                   -- fazer CREATE OR REPLACE nessa mesma funcao (achado
--                   -- "MEDIO"), e o bloco de conferir le a tabela
--   20261127020000  pessoas_acessos_sensiveis_campo_valido, estado mais recente
--   20261130050000  catalogo hr.pessoas.vinculos.horas.corrigir, ja ao super_admin
--   20261130060000  public.hr_periodo_decorrido(date)
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_gerada text;
BEGIN
  IF to_regclass('public.pessoas_vinculos') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_constraint
        WHERE conname = 'pessoas_vinculos_id_pessoa_org_key'
          AND conrelid = to_regclass('public.pessoas_vinculos')
     ) THEN
    RAISE EXCEPTION 'pessoas_vinculos ou a sua unique (id, pessoa_id, organization_id) nao existem.';
  END IF;

  -- O modelo tem de ser o de 20261120190000 (horas_periodo + horas_frequencia
  -- + equivalente gerada), NAO o antigo horas_semanais. Confirmar pelo estado
  -- REAL das colunas, nao pela leitura de qual migracao "devia" ter corrido.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_semanais'
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos ainda tem horas_semanais (nome antigo). 20261120190000 (rename para horas_periodo) tem de ir a frente na fila -- esta migracao assume o modelo novo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_periodo'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_vinculos'
       AND column_name = 'horas_frequencia'
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos.horas_periodo ou horas_frequencia nao existem. Aplicar 20261120140000 e 20261120190000 primeiro.';
  END IF;

  SELECT a.attgenerated INTO v_gerada
    FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.pessoas_vinculos')
     AND a.attname = 'horas_semanais_equivalentes';

  IF v_gerada IS DISTINCT FROM 's' THEN
    RAISE EXCEPTION
      'pessoas_vinculos.horas_semanais_equivalentes nao existe ou nao e uma coluna gerada STORED (attgenerated = %). Aplicar 20261120190000 primeiro -- esta migracao depende do modelo de unidade canonica que ela introduziu.',
      coalesce(v_gerada, '(ausente)');
  END IF;

  -- O dominio 0..80 sobre a coluna CRUA foi largado de proposito por
  -- 20261120190000. Se ainda existir, o estado da base nao e o assumido por
  -- esta migracao -- e exactamente o engano da tentativa anterior.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_vinculos_horas_validas'
       AND conrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION
      'pessoas_vinculos_horas_validas ainda existe. Essa constraint devia ter sido largada por 20261120190000. Investigar o estado da base antes de aplicar -- nao assumir que uma migracao posterior fez o que o seu ficheiro diz.';
  END IF;

  -- E um indice unico simples (CREATE UNIQUE INDEX), nao uma constraint --
  -- nunca aparece em pg_constraint. So o pg_indexes mede alguma coisa aqui
  -- (achado 7 da 3a revisao: o ramo pg_constraint que existia antes nunca
  -- podia dar EXISTS, e por isso nunca protegia nada).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_pessoas_vinculos_um_em_vigor'
  ) THEN
    RAISE EXCEPTION
      'idx_pessoas_vinculos_um_em_vigor nao existe. Aplicar 20261122100000 primeiro -- e o que garante um so vinculo activo-ou-suspenso por pessoa, base do trigger de sincronizacao desta migracao.';
  END IF;

  IF to_regclass('public.pessoas_documentos') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_documentos nao existe. Aplicar 20261123030000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_periodo_decorrido' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'public.hr_periodo_decorrido(date) nao existe. Aplicar 20261130060000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_satelite_ancora_imutavel'
  ) THEN
    RAISE EXCEPTION 'hr_satelite_ancora_imutavel() nao existe.';
  END IF;

  IF to_regclass('public.pessoas_acessos_sensiveis') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_acessos_sensiveis nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_registar_acesso_sensivel' AND p.pronargs = 4
  ) THEN
    RAISE EXCEPTION 'public.hr_registar_acesso_sensivel(uuid,uuid,text,text) nao existe. Aplicar 20261120040000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_acessos_sensiveis_accao_valida'
       AND conrelid = to_regclass('public.pessoas_acessos_sensiveis')
       AND pg_get_constraintdef(oid) LIKE '%alterar%'
  ) THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis_accao_valida nao aceita "alterar". Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.view') THEN
    RAISE EXCEPTION 'hr.pessoas.vinculos.view nao esta no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.vinculos.edit nao esta no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.horas.corrigir') THEN
    RAISE EXCEPTION 'hr.pessoas.vinculos.horas.corrigir nao esta no catalogo. Aplicar 20261130050000 primeiro.';
  END IF;

  -- Prerequisito NOVO da 6a revisao (achado "MEDIO"): esta migracao passa a
  -- fazer CREATE OR REPLACE em hr_vinculos_registar_alteracao(), criada por
  -- 20261123050000, e o bloco de conferir le pessoas_vinculos_alteracoes.
  IF to_regclass('public.pessoas_vinculos_alteracoes') IS NULL THEN
    RAISE EXCEPTION
      'public.pessoas_vinculos_alteracoes nao existe. Aplicar 20261123050000 primeiro (esta migracao faz CREATE OR REPLACE em hr_vinculos_registar_alteracao(), definida ali).';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_vinculos_registar_alteracao' AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION
      'public.hr_vinculos_registar_alteracao() nao existe. Aplicar 20261123050000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_vinculos_horas') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'pessoas_vinculos_horas_pessoa_fkey'
         AND conrelid = to_regclass('public.pessoas_vinculos_horas')
    ) THEN
      RAISE EXCEPTION 'Ja existe public.pessoas_vinculos_horas sem a FK esperada -- colisao de nome.';
    END IF;
    RAISE NOTICE 'public.pessoas_vinculos_horas ja existe; migracao idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 0. Estender pessoas_acessos_sensiveis.campo para aceitar 'horas_contratadas'
--
-- Segue a lista COMPLETA, nao so o valor novo -- esta constraint ja perdeu um
-- valor duas vezes por essa razao (ver COMMENT em 20261127020000). Estado mais
-- recente confirmado por leitura em 20261127020000: niss, iban,
-- conta_bancaria, incapacidade, retribuicao, documento, sindicalizacao.
-- ==============================================================================
DO $campo_horas$
DECLARE
  v_lista text[] := ARRAY[
    'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
    'documento', 'sindicalizacao', 'horas_contratadas'
  ];
  v_fora text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
       AND conrelid = to_regclass('public.pessoas_acessos_sensiveis')
       AND pg_get_constraintdef(oid) LIKE '%horas_contratadas%'
  ) THEN
    RAISE NOTICE 'pessoas_acessos_sensiveis_campo_valido ja aceita horas_contratadas; nada a fazer.';
    RETURN;
  END IF;

  -- Nenhuma linha existente pode ficar ilegal: a lista nova e um superconjunto
  -- da actual.
  SELECT string_agg(DISTINCT campo, ', ' ORDER BY campo) INTO v_fora
    FROM public.pessoas_acessos_sensiveis
   WHERE campo <> ALL (v_lista);

  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION
      'Ha linhas com campo fora da lista nova: %. Acrescentar esses valores a lista desta migracao antes de aplicar.',
      v_fora;
  END IF;

  ALTER TABLE public.pessoas_acessos_sensiveis
    DROP CONSTRAINT pessoas_acessos_sensiveis_campo_valido;

  ALTER TABLE public.pessoas_acessos_sensiveis
    ADD CONSTRAINT pessoas_acessos_sensiveis_campo_valido
    CHECK (campo = ANY (ARRAY[
      'niss', 'iban', 'conta_bancaria', 'incapacidade', 'retribuicao',
      'documento', 'sindicalizacao', 'horas_contratadas'
    ]));

  RAISE NOTICE 'CHECK reposto com os 8 valores, incluindo horas_contratadas.';
END;
$campo_horas$;

COMMENT ON CONSTRAINT pessoas_acessos_sensiveis_campo_valido ON public.pessoas_acessos_sensiveis IS
'Os campos cujo acesso se regista. ATENCAO a quem acrescentar um valor novo: esta constraint ja perdeu "conta_bancaria" duas vezes porque uma migracao anterior reescreveu a lista de cor em vez de acrescentar a que la estava. Acrescentar sempre a lista COMPLETA, e conferir todos os valores.';

-- ==============================================================================
-- 1. Funcao partilhada de conversao para unidade canonica (semana)
--
-- Repete, de proposito, o CASE ja inline na coluna gerada de pessoas_vinculos
-- (20261120190000): essa coluna existe e nao se recria so para passar a
-- chamar esta funcao (perderia RLS/grants a reaplicar a mao, sem ganho). Esta
-- funcao serve pessoas_vinculos_horas e qualquer satelite futuro que precise
-- da mesma conversao, para nao cada um inventar os seus factores.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_horas_periodo_para_semana(
  _horas_periodo numeric,
  _horas_frequencia text
)
RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE _horas_frequencia
    WHEN 'diaria'  THEN _horas_periodo * 5
    WHEN 'semanal' THEN _horas_periodo
    WHEN 'mensal'  THEN _horas_periodo * 3 / 13
    WHEN 'anual'   THEN _horas_periodo / 52
  END
$$;

COMMENT ON FUNCTION public.hr_horas_periodo_para_semana(numeric, text) IS
'Converte uma quantidade de horas (na unidade declarada em horas_frequencia: diaria, semanal, mensal ou anual) para horas por SEMANA. Mesmos factores, e pela mesma razao, da coluna gerada pessoas_vinculos.horas_semanais_equivalentes (20261120190000): diaria x5, semanal x1, mensal x3/13 (=12/52), anual /52 -- CONVENCOES, nao medicoes. Usada pela coluna gerada de pessoas_vinculos_horas. IMMUTABLE: obrigatorio para uma coluna GENERATED ALWAYS ... STORED.';

-- ==============================================================================
-- 2. pessoas_vinculos_horas
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pessoas_vinculos_horas (
  id                            uuid NOT NULL DEFAULT gen_random_uuid(),
  pessoa_id                     uuid NOT NULL,
  organization_id               uuid NOT NULL,
  vinculo_id                    uuid,

  horas_periodo                 numeric(8,2) NOT NULL,
  horas_frequencia              text NOT NULL,
  horas_semanais_equivalentes   numeric
    GENERATED ALWAYS AS (public.hr_horas_periodo_para_semana(horas_periodo, horas_frequencia)) STORED,

  valido_de                     date NOT NULL,
  valido_ate                    date,
  motivo                        text,
  documento_id                  uuid,

  deleted_at                    timestamptz,
  deleted_by                    uuid,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  created_by                    uuid,
  updated_by                    uuid,

  CONSTRAINT pessoas_vinculos_horas_pkey PRIMARY KEY (id),

  CONSTRAINT pessoas_vinculos_horas_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  -- FK COMPOSTA, mesmo motivo de pessoas_retribuicoes_vinculo_fkey: uma FK
  -- simples so contra pessoas_vinculos(id) nao impediria esta versao de horas
  -- apontar para o vinculo de OUTRA pessoa da mesma organizacao.
  CONSTRAINT pessoas_vinculos_horas_vinculo_fkey
    FOREIGN KEY (vinculo_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_vinculos (id, pessoa_id, organization_id)
    ON DELETE SET NULL (vinculo_id),

  -- FK simples, no mesmo padrao de pessoas_vinculos_alteracoes.documento_id
  -- (20261123050000): liga o aditamento assinado a versao de horas que ele
  -- origina.
  CONSTRAINT pessoas_vinculos_horas_documento_fkey
    FOREIGN KEY (documento_id) REFERENCES public.pessoas_documentos (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_vinculos_horas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_vinculos_horas_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_vinculos_horas_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_vinculos_horas_frequencia_valida
    CHECK (horas_frequencia IN ('diaria','semanal','mensal','anual')),
  -- So o piso -- mesmo desenho de pessoas_vinculos: o tecto vive no
  -- equivalente semanal, uma unidade acima, nao na quantidade crua.
  CONSTRAINT pessoas_vinculos_horas_periodo_nao_negativa
    CHECK (horas_periodo >= 0),
  -- Guarda contra o buraco silencioso: se horas_frequencia for alargada sem
  -- acrescentar o factor a hr_horas_periodo_para_semana, o CASE devolve NULL e
  -- o tecto de 80h passaria em vazio. Assim rebenta ao primeiro INSERT.
  CONSTRAINT pessoas_vinculos_horas_frequencia_tem_factor
    CHECK (horas_semanais_equivalentes IS NOT NULL),
  -- O UNICO tecto de horas desta tabela -- implica diaria <= 16, semanal <=
  -- 80, mensal <= 346,67, anual <= 4160, sem ninguem escrever esses numeros.
  CONSTRAINT pessoas_vinculos_horas_equivalentes_validas
    CHECK (horas_semanais_equivalentes <= 80),
  CONSTRAINT pessoas_vinculos_horas_ate_depois_de
    CHECK (valido_ate IS NULL OR valido_ate >= valido_de)
);

COMMENT ON TABLE public.pessoas_vinculos_horas IS
'Versoes de horas contratadas, validas por intervalo de datas -- copia estrutural de pessoas_retribuicoes (mesma FK composta, mesmo indice de versao aberta POR PESSOA, mesmo trigger de nao-sobreposicao, mesma auditoria em pessoas_acessos_sensiveis). Versiona-se a quantidade DECLARADA (horas_periodo + horas_frequencia) e o seu equivalente semanal (gerado, nesta linha) juntos: uma coluna gerada nao se versiona sozinha, e "quantas horas tinha contratadas nesta data" tem de responder-se lendo uma linha, sem reconstruir nada. pessoas_vinculos.horas_periodo/horas_frequencia passam a ser o valor em VIGOR, derivado daqui por trigger -- ver hr_vinculos_horas_manter_valor_em_vigor().';

COMMENT ON COLUMN public.pessoas_vinculos_horas.horas_periodo IS
'A quantidade de horas na unidade declarada em horas_frequencia -- mesmo desenho e mesmo nome de pessoas_vinculos.horas_periodo (20261120190000). Nao comparar directamente com outra linha de frequencia diferente: comparar sempre horas_semanais_equivalentes.';

COMMENT ON COLUMN public.pessoas_vinculos_horas.horas_semanais_equivalentes IS
'horas_periodo convertida para horas por SEMANA via hr_horas_periodo_para_semana(), os mesmos factores de pessoas_vinculos.horas_semanais_equivalentes. GENERATED ALWAYS ... STORED: nao se escreve, e derivada. E o unico tecto da tabela (<=80).';

COMMENT ON COLUMN public.pessoas_vinculos_horas.valido_ate IS
'NULL = versao em aberto (as horas contratadas actuais). Uma so em aberto por PESSOA (nao por vinculo), garantido por indice unico parcial -- mesmo desenho de pessoas_retribuicoes.';

COMMENT ON COLUMN public.pessoas_vinculos_horas.documento_id IS
'Liga esta versao ao aditamento assinado que a origina, quando existir um. FK simples contra pessoas_documentos, no mesmo padrao de pessoas_vinculos_alteracoes.documento_id.';

CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_horas_pessoa_id
  ON public.pessoas_vinculos_horas (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_horas_organization_id
  ON public.pessoas_vinculos_horas (organization_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_horas_pessoa_periodo
  ON public.pessoas_vinculos_horas (pessoa_id, valido_de DESC);
CREATE INDEX IF NOT EXISTS idx_pessoas_vinculos_horas_documento_id
  ON public.pessoas_vinculos_horas (documento_id) WHERE documento_id IS NOT NULL;

-- Camada 1 da nao-sobreposicao: uma so versao EM ABERTO por pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pessoas_vinculos_horas_aberta
  ON public.pessoas_vinculos_horas (pessoa_id)
  WHERE valido_ate IS NULL AND deleted_at IS NULL;

-- ==============================================================================
-- 2.5. pessoas_vinculos.horas_frequencia passa a aceitar NULL
--
-- Ver a seccao "CORRECCAO POS-REVISAO" no cabecalho: sem isto,
-- hr_vinculos_horas_manter_valor_em_vigor() (mais abaixo) rebenta com 23502 de
-- cada vez que uma pessoa fica sem versao em aberto -- estado legitimo, e o
-- unico caminho para fechar uma versao antes de abrir a seguinte, dado o
-- trigger de nao-sobreposicao. Idempotente por natureza: DROP NOT NULL e DROP
-- DEFAULT nao falham numa coluna que ja aceite NULL / ja nao tenha DEFAULT.
--
-- Larga-se tambem o DEFAULT 'semanal' aqui (achado 5 da 3a revisao -- ver o
-- paragrafo "DECISAO" no cabecalho): mante-lo escreveria uma frequencia FALSA
-- em todo INSERT que nao passe as duas colunas explicitamente, contradizendo
-- o par (NULL, NULL) como estado legitimo. As revisoes anteriores escreviam
-- esta decisao no cabecalho e nunca a aplicavam aqui.
-- ==============================================================================
ALTER TABLE public.pessoas_vinculos
  ALTER COLUMN horas_frequencia DROP NOT NULL,
  ALTER COLUMN horas_frequencia DROP DEFAULT;

COMMENT ON COLUMN public.pessoas_vinculos.horas_frequencia IS
'A unidade de horas_periodo: diaria, semanal, mensal ou anual. Desde 20261120190000 aceita as quatro. Desde 20261130180000 aceita tambem NULL, a par com horas_periodo (que ja era nullable): o par (NULL, NULL) e o valor derivado e legitimo de uma pessoa sem versao em aberto em pessoas_vinculos_horas -- ver hr_vinculos_horas_manter_valor_em_vigor(). O DEFAULT ''semanal'' de 20261120140000 foi LARGADO (nao mantido): escrevia uma frequencia falsa em todo INSERT que nao passasse as duas colunas explicitamente. Quem insere um vinculo sem horas fica, correctamente, com as duas colunas NULL ate a pessoa ter uma versao em pessoas_vinculos_horas.';

-- ---- Camada 2: trigger de nao-sobreposicao, no molde exacto de
-- hr_retribuicoes_sem_sobreposicao (20261120060000) ---------------------------
-- SECURITY DEFINER pelo mesmo motivo: sob RLS de invocador, quem tem
-- vinculos.edit sem vinculos.view nao veria as linhas existentes e a
-- verificacao passaria por nao encontrar nada.
CREATE OR REPLACE FUNCTION public.hr_vinculos_horas_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.valido_de, h.valido_ate INTO v_conflito
    FROM public.pessoas_vinculos_horas h
   WHERE h.pessoa_id = NEW.pessoa_id
     AND h.deleted_at IS NULL
     AND h.id <> NEW.id
     AND daterange(h.valido_de, h.valido_ate, '[)')
         && daterange(NEW.valido_de, NEW.valido_ate, '[)')
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    RAISE EXCEPTION
      'horas_contratadas_sobrepostas: o intervalo % a % cruza-se com a versao % (% a %). Fechar a versao anterior (valido_ate) antes de criar a nova.',
      NEW.valido_de, coalesce(NEW.valido_ate::text, 'sem fim'),
      v_conflito.id, v_conflito.valido_de, coalesce(v_conflito.valido_ate::text, 'sem fim');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_horas_sem_sobreposicao() IS
'Impede duas versoes vivas de horas contratadas da mesma pessoa com intervalos que se cruzem. SECURITY DEFINER pelo mesmo motivo de hr_retribuicoes_sem_sobreposicao.';

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_sem_sobreposicao ON public.pessoas_vinculos_horas;
CREATE TRIGGER trg_pessoas_vinculos_horas_sem_sobreposicao
  BEFORE INSERT OR UPDATE ON public.pessoas_vinculos_horas
  FOR EACH ROW EXECUTE FUNCTION public.hr_vinculos_horas_sem_sobreposicao();

-- ---- Auditoria, no molde exacto de hr_retribuicoes_auditar (20261120060000) --
-- SECURITY DEFINER: hr_registar_acesso_sensivel nao esta ao alcance de
-- authenticated.
CREATE OR REPLACE FUNCTION public.hr_vinculos_horas_auditar()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- GUC hr.skip_horas_auditoria (achado 6 da 3a revisao): ligada SO pela
  -- semente desta migracao (seccao 3, mais abaixo). A semente nao regista uma
  -- alteracao de ninguem -- copia para esta tabela um valor que ja existia em
  -- pessoas_vinculos, sem nenhum utilizador ter tocado em nada. Sem esta
  -- guarda, aplicar esta migracao numa base com muitas pessoas escrevia uma
  -- linha de auditoria por pessoa, em TODAS as organizacoes, para uma
  -- alteracao que nunca aconteceu.
  IF coalesce(current_setting('hr.skip_horas_auditoria', true), 'off') = 'on' THEN
    RETURN NULL;
  END IF;

  PERFORM public.hr_registar_acesso_sensivel(
    NEW.pessoa_id, NEW.organization_id, 'horas_contratadas', 'alterar'
  );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_horas_auditar() IS
'Registra em pessoas_acessos_sensiveis (campo=horas_contratadas) cada criacao ou alteracao de horas contratadas versionadas feita por um utilizador. SECURITY DEFINER porque hr_registar_acesso_sensivel nao e chamavel por authenticated. Mesmo molde de hr_retribuicoes_auditar, mais a GUC hr.skip_horas_auditoria (achado 6 da 3a revisao): NAO regista quando ligada -- so a semente desta migracao a liga, porque copiar um valor ja existente nao e uma alteracao.';

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_auditar ON public.pessoas_vinculos_horas;
CREATE TRIGGER trg_pessoas_vinculos_horas_auditar
  AFTER INSERT OR UPDATE ON public.pessoas_vinculos_horas
  FOR EACH ROW EXECUTE FUNCTION public.hr_vinculos_horas_auditar();

-- ---- Nucleo partilhado da sincronizacao (achado 2 da 3a revisao, bloqueante)
-- ------------------------------------------------------------------------------
-- Le a versao em aberto de horas da pessoa e escreve-a no(s) vinculo(s) EM
-- VIGOR (estado IN ('activo','suspenso'), o par que idx_pessoas_vinculos_um_em_vigor
-- ja garante ser um so por pessoa desde 20261122100000). Antes desta revisao
-- so um trigger chamava esta logica, disparado em pessoas_vinculos_horas --
-- nunca disparava quando era o VINCULO que mudava (terminar A e abrir B, ou
-- uma pessoa passar de "futuro" a "activo"). Nesses casos o vinculo que
-- passava a estar em vigor ficava com o que viesse no seu proprio INSERT
-- (NULL, com a guarda desta migracao), podendo contradizer a versao aberta ja
-- existente, e sem forma de corrigir a mao (o UPDATE directo esta bloqueado).
-- Extraido para funcao propria para ser chamado dos DOIS lados -- ver "Lado 1"
-- e "Lado 2", mais abaixo. SECURITY DEFINER e GUC hr.sync_horas_periodo,
-- mesmo padrao do local_id (20261130060000).
CREATE OR REPLACE FUNCTION public.hr_vinculos_horas_sincronizar(
  _pessoa_id uuid,
  _organization_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_horas_id          uuid;
  v_novo_periodo      numeric(8,2);
  v_nova_freq         text;
  v_vinculo_em_vigor  uuid;
  v_horas_aberta_id   uuid;
  v_constraint_violada text;
BEGIN
  -- Achado "CORRECAO" da 6a revisao (bloqueante): o valor EM VIGOR e o da
  -- versao valida HOJE, nao o da versao EM ABERTO (valido_ate IS NULL). As
  -- duas coincidem na maior parte do tempo, mas divergem nos dois sentidos
  -- que o caminho de escrita desta funcionalidade (alterar(), em
  -- src/hooks/usePessoaVinculoHoras.ts) produz ao vivo:
  --   - abrir uma versao com valido_de FUTURO (um aditamento assinado hoje,
  --     com efeito no mes seguinte) fecha a versao actual com valido_ate =
  --     essa mesma data futura. So filtrar "valido_ate IS NULL" apanhava a
  --     versao NOVA -- ainda por vigorar -- e escrevia as horas futuras em
  --     pessoas_vinculos desde ja, meses antes de entrarem em vigor.
  --   - fechar a versao aberta com um valido_ate FUTURO (sem abrir logo a
  --     seguinte) deixava de haver qualquer linha com valido_ate IS NULL, e
  --     esta funcao punha as duas colunas a NULL de imediato, apesar de as
  --     horas antigas ainda vigorarem ate essa data.
  -- Corrigido: filtra pela versao cujo intervalo [valido_de, valido_ate)
  -- contem a data de hoje -- valido_de <= CURRENT_DATE E (valido_ate IS NULL
  -- OU valido_ate > CURRENT_DATE), o mesmo desenho de intervalo meio-aberto
  -- que hr_vinculos_horas_sem_sobreposicao ja usa com daterange(..., '[)').
  -- Isto nao inventa um recalculo automatico na propria data de efeito (nao
  -- ha cron nem trigger temporal nesta migracao, e nao e este o defeito
  -- reportado) -- so deixa de escrever um valor futuro cedo demais, ou de
  -- apagar um valor que ainda vigora. Quando a data de efeito chegar, o
  -- valor so fica certo na proxima escrita que dispare esta sincronizacao
  -- (uma nova versao de horas, ou um vinculo a entrar/sair de vigor) --
  -- limitacao pre-existente do desenho "sincroniza por trigger", nao
  -- introduzida nem alargada por esta correccao.
  SELECT h.id, h.horas_periodo, h.horas_frequencia
    INTO v_horas_id, v_novo_periodo, v_nova_freq
    FROM public.pessoas_vinculos_horas h
   WHERE h.pessoa_id = _pessoa_id
     AND h.deleted_at IS NULL
     AND h.valido_de <= CURRENT_DATE
     AND (h.valido_ate IS NULL OR h.valido_ate > CURRENT_DATE)
   ORDER BY h.valido_de DESC, h.created_at DESC
   LIMIT 1;

  -- idx_pessoas_vinculos_um_em_vigor (20261122100000) garante no maximo um
  -- vinculo activo-ou-suspenso por pessoa -- o LIMIT 1 e so defensivo.
  SELECT v.id INTO v_vinculo_em_vigor
    FROM public.pessoas_vinculos v
   WHERE v.pessoa_id = _pessoa_id
     AND v.organization_id = _organization_id
     AND v.estado IN ('activo', 'suspenso')
     AND v.deleted_at IS NULL
   LIMIT 1;

  -- Achado ALTO desta revisao (7a): consulta PROPRIA para o re-apontamento
  -- de vinculo_id, mais abaixo -- NAO reaproveitar v_horas_id. Desde a
  -- "CORRECAO" da 6a revisao, v_horas_id e a versao valida HOJE, que so
  -- coincide com a versao EM ABERTO (valido_ate IS NULL) quando nao ha
  -- nenhum aditamento agendado para o futuro. No caso normal desta
  -- funcionalidade -- um aditamento assinado hoje com efeito daqui a um mes
  -- -- a versao em aberto e a FUTURA e v_horas_id e a versao actual, ja
  -- fechada (valido_ate = a data de efeito). Se o vinculo mudar nesse
  -- intervalo (terminar A, abrir B), reapontar v_horas_id reapontaria a
  -- versao HISTORICA e fechada, e deixaria a versao em aberto pendurada no
  -- vinculo terminado -- exactamente o defeito que o achado 4 da 4a revisao
  -- existia para fechar, reintroduzido pela propria correccao da 6a.
  -- idx_pessoas_vinculos_horas_aberta garante no maximo uma versao aberta
  -- por pessoa -- o LIMIT 1 e so defensivo.
  SELECT h.id INTO v_horas_aberta_id
    FROM public.pessoas_vinculos_horas h
   WHERE h.pessoa_id = _pessoa_id
     AND h.deleted_at IS NULL
     AND h.valido_ate IS NULL
   LIMIT 1;

  -- GUC hr.skip_horas_auditoria tambem a volta DESTE UPDATE (achado "MEDIO"
  -- da 6a revisao): pessoas_vinculos tem trg_pessoas_vinculos_registar_
  -- alteracao (20261123050000), SEM lista de colunas, cujo array v_campos
  -- inclui 'horas_frequencia' -- disparava aqui e escrevia uma linha em
  -- pessoas_vinculos_alteracoes atribuida a quem apenas terminou um vinculo
  -- e abriu outro, sem ninguem ter tocado em horas. hr_vinculos_registar_
  -- alteracao() e recriada mais abaixo (seccao "6a revisao: auditoria em
  -- pessoas_vinculos_alteracoes") a saltar 'horas_frequencia' quando esta GUC
  -- estiver ligada -- os outros 17 campos desse array continuam auditados
  -- normalmente, ligados ou nao, porque esta funcao nunca lhes toca.
  PERFORM set_config('hr.sync_horas_periodo', 'on', true);
  PERFORM set_config('hr.skip_horas_auditoria', 'on', true);
  BEGIN
    UPDATE public.pessoas_vinculos v
       SET horas_periodo = v_novo_periodo,
           horas_frequencia = v_nova_freq
     WHERE v.pessoa_id = _pessoa_id
       AND v.organization_id = _organization_id
       AND v.estado IN ('activo', 'suspenso')
       AND v.deleted_at IS NULL
       AND (v.horas_periodo IS DISTINCT FROM v_novo_periodo
            OR v.horas_frequencia IS DISTINCT FROM v_nova_freq);
  EXCEPTION
    -- Achado "BAIXO/MEDIO" da 6a revisao: sem isto, uma versao de horas
    -- acima do tecto declarado no vinculo (pessoas_vinculos_maximo_acima_
    -- do_contratado, 20261120190000 -- um CHECK da propria tabela
    -- pessoas_vinculos, nao um trigger: corrigida a prosa nesta revisao,
    -- achado BAIXO) rebentava aqui com um 23514 cru -- incompreensivel para
    -- quem so viu o formulario de horas. Recusar a escrita continua
    -- correcto; so a mensagem muda, com SQLSTATE proprio (HR011, nunca
    -- P0001) para nao se confundir com outro RAISE do projecto.
    --
    -- Achado BAIXO desta revisao (7a): este WHEN check_violation apanhava
    -- QUALQUER 23514 desta tabela e assumia sempre a mensagem do tecto de
    -- horas -- hoje os outros CHECK de pessoas_vinculos (data_fim, etc.) sao
    -- barrados a montante por outras guardas, mas a mensagem podia mentir se
    -- isso deixar de ser verdade. Corrigido: confirma pelo NOME da
    -- constraint (GET STACKED DIAGNOSTICS) que e mesmo
    -- pessoas_vinculos_maximo_acima_do_contratado antes de reescrever a
    -- mensagem -- qualquer outro 23514 sobe tal como veio (RAISE sem
    -- argumentos, dentro do handler, relanca a excepcao original).
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_violada = CONSTRAINT_NAME;
      IF v_constraint_violada = 'pessoas_vinculos_maximo_acima_do_contratado' THEN
        RAISE EXCEPTION
          'hr_horas_acima_do_maximo_do_vinculo: as horas contratadas (% por %, equivalente semanal) excedem horas_semanais_maximas do vinculo em vigor. Reduza as horas nesta versao ou aumente o maximo do vinculo antes de a registar.',
          v_novo_periodo, v_nova_freq
          USING ERRCODE = 'HR011';
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM set_config('hr.skip_horas_auditoria', 'off', true);
  PERFORM set_config('hr.sync_horas_periodo', 'off', true);

  -- Achado 4 (4a revisao): a versao EM ABERTO tem de ficar apontada para o
  -- vinculo REALMENTE em vigor, senao fica pendurada num vinculo ja
  -- terminado -- terminar A e abrir B propaga os VALORES para B (acima), mas
  -- sem esta linha vinculo_id continuava a apontar para A. So RE-APONTA (nao
  -- fecha nem abre nenhuma versao): fechar ou abrir uma versao de horas e
  -- decisao de quem as regista, nao desta sincronizacao automatica -- aqui
  -- so se corrige a que ficha a versao EM ABERTO documenta -- por isso usa
  -- v_horas_aberta_id (achado ALTO desta revisao, 7a), NUNCA v_horas_id: ver
  -- o comentario junto da consulta de v_horas_aberta_id, mais acima, sobre
  -- porque reaproveitar v_horas_id aqui reapontava a versao ERRADA sempre
  -- que houvesse um aditamento futuro em aberto. Idempotente: o IS DISTINCT
  -- FROM evita disparar os triggers de pessoas_vinculos_horas (auditoria e
  -- este mesmo sync) quando o vinculo_id ja esta certo -- e quando dispara,
  -- a segunda passagem encontra tudo ja igual e nao repete.
  --
  -- GUC hr.skip_horas_auditoria ligada a volta deste UPDATE (achado 2 da 5a
  -- revisao, ALTO): trg_pessoas_vinculos_horas_auditar e AFTER INSERT OR
  -- UPDATE, sem WHEN e sem lista de colunas -- disparava tambem aqui, e
  -- terminar um vinculo e abrir outro (o caminho normal da aplicacao) gerava
  -- uma linha 'horas_contratadas / alterar' em pessoas_acessos_sensiveis sem
  -- ninguem ter tocado em horas nenhumas. Correcto ligar a GUC aqui (nao um
  -- WHEN no trigger): este UPDATE, por definicao, so muda vinculo_id -- nunca
  -- horas_periodo/horas_frequencia/valido_de/valido_ate -- por isso nunca e
  -- uma alteracao real de horas a registar. Qualquer outro INSERT/UPDATE
  -- nesta tabela (fora deste UPDATE especifico) continua com a GUC 'off' e e
  -- auditado normalmente.
  IF v_horas_aberta_id IS NOT NULL AND v_vinculo_em_vigor IS NOT NULL THEN
    PERFORM set_config('hr.skip_horas_auditoria', 'on', true);
    UPDATE public.pessoas_vinculos_horas
       SET vinculo_id = v_vinculo_em_vigor
     WHERE id = v_horas_aberta_id
       AND vinculo_id IS DISTINCT FROM v_vinculo_em_vigor;
    PERFORM set_config('hr.skip_horas_auditoria', 'off', true);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_vinculos_horas_sincronizar(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_vinculos_horas_sincronizar(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_vinculos_horas_sincronizar(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hr_vinculos_horas_sincronizar(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.hr_vinculos_horas_sincronizar(uuid, uuid) IS
'Nucleo partilhado (achado 2 da 3a revisao): le a versao valida HOJE (nao so a em aberto -- achado "CORRECAO" da 6a revisao) de pessoas_vinculos_horas da pessoa e escreve-a no(s) vinculo(s) EM VIGOR (activo/suspenso) dessa pessoa+organizacao. Chamado por DOIS triggers -- um quando a versao de horas muda (pessoas_vinculos_horas), outro quando um VINCULO entra em vigor (pessoas_vinculos, INSERT ou estado/deleted_at a transitar para isso) -- para a derivacao se manter dos dois lados. Tambem RE-APONTA vinculo_id da versao EM ABERTO (nao a versao valida HOJE que a "CORRECAO" da 6a revisao passou a ler acima -- corrigido na 7a revisao, achado ALTO: entre a 4a e a 6a revisoes o codigo reapontava a versao errada sempre que houvesse um aditamento futuro em aberto) para o vinculo em vigor (achado 4 da 4a revisao), com hr.skip_horas_auditoria ligada a volta desse UPDATE e a volta do UPDATE principal em pessoas_vinculos (achados 2 da 5a e "MEDIO" da 6a revisao): sem isto, terminar um vinculo e abrir outro deixava a versao aberta a documentar um contrato ja terminado, OU gerava linhas de auditoria espurias em pessoas_acessos_sensiveis e em pessoas_vinculos_alteracoes para uma alteracao de horas que ninguem fez. SECURITY DEFINER + GUC hr.sync_horas_periodo, unico caminho autorizado a escrever horas_periodo/horas_frequencia em pessoas_vinculos. REVOKE de PUBLIC/anon/authenticated, GRANT so a service_role (achado "SEGURANCA" da 6a revisao, bloqueante): sem isto era chamavel por RPC do PostgREST por qualquer utilizador autenticado de QUALQUER organizacao, com o pessoa_id/organization_id de outra, escrevendo la dentro sem RLS nenhuma -- e era tambem a unica forma de ligar hr.sync_horas_periodo a partir de fora, contornando a propria guarda que esta migracao existe para impor. Mesmo molde de hr_registar_acesso_sensivel (20261120040000); os dois triggers que chamam esta funcao (hr_vinculos_horas_manter_valor_em_vigor e hr_pessoas_vinculos_sincronizar_ao_entrar_em_vigor) sao eles proprios SECURITY DEFINER, por isso continuam a alcanca-la sem GRANT nenhum a authenticated.';

-- ---- Lado 1: dispara quando a versao de horas da pessoa muda ---------------
CREATE OR REPLACE FUNCTION public.hr_vinculos_horas_manter_valor_em_vigor()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.hr_vinculos_horas_sincronizar(
    coalesce(NEW.pessoa_id, OLD.pessoa_id),
    coalesce(NEW.organization_id, OLD.organization_id)
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_horas_manter_valor_em_vigor() IS
'Lado 1 da sincronizacao (dispara em pessoas_vinculos_horas): chama hr_vinculos_horas_sincronizar sempre que a versao de horas em aberto de uma pessoa muda (nova versao, fecho, correccao). Ver hr_pessoas_vinculos_sincronizar_ao_entrar_em_vigor() para o lado 2.';

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_manter_em_vigor ON public.pessoas_vinculos_horas;
CREATE TRIGGER trg_pessoas_vinculos_horas_manter_em_vigor
  AFTER INSERT OR UPDATE ON public.pessoas_vinculos_horas
  FOR EACH ROW EXECUTE FUNCTION public.hr_vinculos_horas_manter_valor_em_vigor();

-- ---- Guarda em pessoas_vinculos: as duas colunas so pelo sync acima --------
-- Cobre agora INSERT (achado 1 da 3a revisao, bloqueante) e UPDATE OF, com
-- SQLSTATE proprio (HR010, nunca P0001 -- achado 4) para nao se confundir com
-- nenhum outro RAISE EXCEPTION do projecto.
CREATE OR REPLACE FUNCTION public.hr_pessoas_vinculos_horas_e_derivado()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF coalesce(current_setting('hr.sync_horas_periodo', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  -- BEFORE INSERT: nao ha OLD para comparar -- o unico jeito de "escrever por
  -- fora" e o proprio INSERT trazer um valor nao-nulo nestas colunas. Um
  -- INSERT liso, sem as passar, fica com NULL/NULL (a seccao 2.5 largou o
  -- DEFAULT de horas_frequencia), o que e legitimo e nao bloqueia nada.
  IF TG_OP = 'INSERT' THEN
    IF NEW.horas_periodo IS NOT NULL OR NEW.horas_frequencia IS NOT NULL THEN
      RAISE EXCEPTION
        'pessoas_vinculos_horas_e_derivado: horas_periodo e horas_frequencia passaram a ser derivados da versao em aberto de pessoas_vinculos_horas. Nao se escrevem directamente num INSERT -- criar o vinculo sem essas colunas e depois uma linha em pessoas_vinculos_horas.'
        USING ERRCODE = 'HR010';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: so bloqueia quando o valor realmente muda.
  IF NEW.horas_periodo IS DISTINCT FROM OLD.horas_periodo
     OR NEW.horas_frequencia IS DISTINCT FROM OLD.horas_frequencia THEN
    RAISE EXCEPTION
      'pessoas_vinculos_horas_e_derivado: horas_periodo e horas_frequencia passaram a ser derivados da versao em aberto de pessoas_vinculos_horas. Nao se editam directamente -- criar, fechar ou corrigir uma linha em pessoas_vinculos_horas.'
      USING ERRCODE = 'HR010';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_vinculos_horas_e_derivado() IS
'Bloqueia escrita directa (INSERT ou UPDATE) a pessoas_vinculos.horas_periodo/horas_frequencia fora do trigger de sincronizacao de pessoas_vinculos_horas. Corrigido na 3a revisao (achado 1, bloqueante): a versao anterior so cobria UPDATE, e um INSERT com estas colunas preenchidas passava em silencio. SQLSTATE proprio (HR010, nao P0001 -- achado 4) para nao se confundir com nenhum outro RAISE EXCEPTION do projecto.';

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_e_derivado ON public.pessoas_vinculos;
CREATE TRIGGER trg_pessoas_vinculos_horas_e_derivado
  BEFORE INSERT OR UPDATE OF horas_periodo, horas_frequencia ON public.pessoas_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_vinculos_horas_e_derivado();

-- ---- Lado 2: dispara quando um VINCULO entra em vigor (achado 2) ----------
-- AFTER INSERT (o vinculo nasce ja activo/suspenso) OU UPDATE de estado/
-- deleted_at (uma transicao: terminar A e abrir B, ou futuro -> activo). Nao
-- reage a mudanca de horas_periodo/horas_frequencia -- essas so mudam pela
-- propria sincronizacao (GUC ligada haveria de evitar recursao de qualquer
-- forma, mas a lista de colunas do UPDATE OF abaixo nem as inclui, por isso
-- nem chega a ser tentada).
CREATE OR REPLACE FUNCTION public.hr_pessoas_vinculos_sincronizar_ao_entrar_em_vigor()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.estado IN ('activo', 'suspenso') AND NEW.deleted_at IS NULL THEN
    PERFORM public.hr_vinculos_horas_sincronizar(NEW.pessoa_id, NEW.organization_id);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_vinculos_sincronizar_ao_entrar_em_vigor() IS
'Lado 2 da sincronizacao (achado 2 da 3a revisao, bloqueante): quando um vinculo passa a estar EM VIGOR (nasce assim, ou transita estado/deleted_at para isso), busca a versao em aberto de horas da pessoa e escreve-a nesse vinculo. Sem isto, terminar um vinculo e abrir outro (o caminho normal da aplicacao) deixava o novo com o que viesse no seu proprio INSERT em vez do valor real em vigor -- e ja sem forma de o corrigir a mao, pela guarda de escrita directa.';

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_sincronizar_ao_entrar_em_vigor ON public.pessoas_vinculos;
CREATE TRIGGER trg_pessoas_vinculos_sincronizar_ao_entrar_em_vigor
  AFTER INSERT OR UPDATE OF estado, deleted_at ON public.pessoas_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_vinculos_sincronizar_ao_entrar_em_vigor();

-- ---- 6a revisao: auditoria em pessoas_vinculos_alteracoes ------------------
-- Achado "MEDIO" (6a revisao): o UPDATE principal de hr_vinculos_horas_
-- sincronizar() em pessoas_vinculos (SET horas_periodo, horas_frequencia)
-- dispara trg_pessoas_vinculos_registar_alteracao (20261123050000, AFTER
-- UPDATE ON pessoas_vinculos, SEM lista de colunas) -- e o array v_campos
-- dessa funcao inclui 'horas_frequencia'. Terminar o vinculo A e abrir o B
-- (exactamente o cenario que o achado 2 da 5a revisao ja tinha corrigido
-- para pessoas_acessos_sensiveis) continuava a gravar uma linha
-- 'horas_frequencia: NULL -> semanal' em pessoas_vinculos_alteracoes,
-- atribuida a quem apenas renovou o contrato -- nao a quem alterou horas
-- nenhumas, porque ninguem alterou.
--
-- hr_vinculos_registar_alteracao() (20261123050000) NAO SE EDITA -- ja esta
-- aplicada. Corrige-se PARA A FRENTE: CREATE OR REPLACE na mesma funcao,
-- aqui, a saltar SO o campo 'horas_frequencia' quando a GUC hr.skip_horas_
-- auditoria estiver ligada (o UPDATE de sincronizacao acima ja a liga a
-- volta desse UPDATE especifico). Os outros 17 campos do array continuam
-- comparados e auditados sempre, ligada ou nao a GUC -- esta funcao nunca
-- lhes toca, por isso nunca ha nada a saltar neles.
--
-- Corpo identico ao de 20261123050000 excepto a linha do IF, marcada abaixo.
-- Nao se corrige aqui o defeito PRE-EXISTENTE, ja documentado na seccao
-- "DOIS ACHADOS DA 3a REVISAO QUE NAO SE CORRIGEM AQUI" (acima): o array
-- ainda lista 'horas_semanais' (coluna que ja nao existe) e nao lista
-- 'horas_periodo' -- fora de scope desta migracao, precisa de migracao
-- propria.
CREATE OR REPLACE FUNCTION public.hr_vinculos_registar_alteracao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_campos text[] := ARRAY[
    'tipo_contrato', 'regime', 'horas_semanais', 'data_inicio', 'data_fim',
    'motivo_termo', 'periodo_experimental_ate', 'entidade_legal_org_id',
    'estado', 'tipo_trabalho', 'horas_frequencia', 'tempo_trabalho_pct',
    'dias_uteis', 'politica_feriados', 'horas_anuais_maximas',
    'horas_semanais_maximas', 'periodo_experimental_dias',
    'categoria_funcao', 'periodo_experimental_origem'
  ];
  v_old  jsonb := to_jsonb(OLD);
  v_new  jsonb := to_jsonb(NEW);
  v_campo text;
  v_criado_por uuid;
BEGIN
  -- Marcar como apagado (soft delete) nao e uma alteracao de negocio.
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT au.id INTO v_criado_por FROM public.anew_users au WHERE au.auth_user_id = auth.uid() LIMIT 1;

  FOREACH v_campo IN ARRAY v_campos
  LOOP
    -- LINHA NOVA (6a revisao): 'horas_frequencia' e o UNICO campo que
    -- hr_vinculos_horas_sincronizar() escreve nesta tabela -- salta-lo so
    -- quando a GUC estiver ligada nao esconde nenhuma alteracao real, feita
    -- por um utilizador, dos outros 17 campos.
    IF v_campo = 'horas_frequencia'
       AND coalesce(current_setting('hr.skip_horas_auditoria', true), 'off') = 'on' THEN
      CONTINUE;
    END IF;

    IF v_old ->> v_campo IS DISTINCT FROM v_new ->> v_campo THEN
      INSERT INTO public.pessoas_vinculos_alteracoes
        (vinculo_id, pessoa_id, organization_id, campo, valor_antes, valor_depois, created_by)
      VALUES
        (NEW.id, NEW.pessoa_id, NEW.organization_id, v_campo, v_old ->> v_campo, v_new ->> v_campo, v_criado_por);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_vinculos_registar_alteracao() IS
'Escreve uma linha em pessoas_vinculos_alteracoes por CADA campo de negocio que mudou num UPDATE de pessoas_vinculos. Nao regista quando a unica mudanca e marcar deleted_at (soft delete). Comparacao feita via to_jsonb(OLD/NEW) ->> campo, por isso dias_uteis (array) fica gravado na sua representacao JSON. Desde 20261130180000 (achado "MEDIO" da 6a revisao): salta o campo horas_frequencia quando hr.skip_horas_auditoria estiver ligada -- essa GUC so fica ligada a volta do UPDATE de hr_vinculos_horas_sincronizar(), o unico escritor automatico desta coluna; qualquer alteracao feita por um utilizador continua auditada normalmente. O array v_campos ainda lista horas_semanais (coluna ja inexistente) e nao lista horas_periodo -- defeito PRE-EXISTENTE a 20261123050000, fora de scope aqui.';

-- O trigger ja existe (20261123050000); so a funcao mudou (CREATE OR
-- REPLACE, acima). Sem novo DROP/CREATE TRIGGER: continua ligado ao mesmo
-- nome, mesma tabela, mesmo evento.

-- ---- Triggers de padrao ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_updated_at ON public.pessoas_vinculos_horas;
CREATE TRIGGER trg_pessoas_vinculos_horas_updated_at
  BEFORE UPDATE ON public.pessoas_vinculos_horas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pessoas_vinculos_horas_ancora ON public.pessoas_vinculos_horas;
CREATE TRIGGER trg_pessoas_vinculos_horas_ancora
  BEFORE UPDATE ON public.pessoas_vinculos_horas
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants -------------------------------------------------------------------
REVOKE ALL ON TABLE public.pessoas_vinculos_horas FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.pessoas_vinculos_horas TO authenticated;
GRANT ALL ON TABLE public.pessoas_vinculos_horas TO service_role;

-- ---- RLS ------------------------------------------------------------------
ALTER TABLE public.pessoas_vinculos_horas ENABLE ROW LEVEL SECURITY;

-- Sem ramo de ficha-propria, igual ao molde de pessoas_vinculos e
-- pessoas_retribuicoes: so hr.pessoas.vinculos.view.
DROP POLICY IF EXISTS pessoas_vinculos_horas_select ON public.pessoas_vinculos_horas;
CREATE POLICY pessoas_vinculos_horas_select ON public.pessoas_vinculos_horas
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.view', organization_id))
  );

-- ALTERACAO vs CORRECCAO: o WITH CHECK de um INSERT nao tem linha "antiga" a
-- avaliar, por isso decide-se pelo valido_ate da propria linha nova -- mesmo
-- padrao de pessoas_afectacoes_insert.
DROP POLICY IF EXISTS pessoas_vinculos_horas_insert ON public.pessoas_vinculos_horas;
CREATE POLICY pessoas_vinculos_horas_insert ON public.pessoas_vinculos_horas
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (
      (
        NOT public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.edit', organization_id))
      )
      OR (
        public.hr_periodo_decorrido(valido_ate)
        AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.horas.corrigir', organization_id))
      )
    )
  );

-- O USING avalia a linha ANTIGA num UPDATE: decide ai se esta linha, tal como
-- estava, e uma ALTERACAO (nao decorrida) ou uma CORRECCAO (ja decorrida).
DROP POLICY IF EXISTS pessoas_vinculos_horas_update ON public.pessoas_vinculos_horas;
CREATE POLICY pessoas_vinculos_horas_update ON public.pessoas_vinculos_horas
  FOR UPDATE TO authenticated
  USING (
    (
      NOT public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.edit', organization_id))
    )
    OR (
      public.hr_periodo_decorrido(valido_ate)
      AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.horas.corrigir', organization_id))
    )
  )
  WITH CHECK (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.edit', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.pessoas.vinculos.horas.corrigir', organization_id))
  );

DROP POLICY IF EXISTS pessoas_vinculos_horas_block_delete ON public.pessoas_vinculos_horas;
CREATE POLICY pessoas_vinculos_horas_block_delete ON public.pessoas_vinculos_horas
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_vinculos_horas_insert ON public.pessoas_vinculos_horas IS
'ALTERACAO (hr.pessoas.vinculos.edit, reaproveitada): a linha nao decorreu. CORRECCAO (hr.pessoas.vinculos.horas.corrigir, perigosa, ja no catalogo desde 20261130050000): a linha ja decorreu -- inserir uma versao puramente historica.';
COMMENT ON POLICY pessoas_vinculos_horas_update ON public.pessoas_vinculos_horas IS
'O USING decide pela linha ANTIGA: se ainda nao decorreu, exige .edit (ALTERACAO); se ja decorreu, exige .corrigir (CORRECCAO, perigosa). Mesma logica de pessoas_afectacoes_update.';

-- ==============================================================================
-- 3. Semente: uma versao em aberto por pessoa, a partir do que ja esta em
-- pessoas_vinculos -- para nenhuma pessoa com horas fixas hoje ficar sem
-- versao em aberto.
--
-- So semeia quem tem vinculo EM VIGOR com horas_periodo/horas_frequencia
-- preenchidos (ha tipos de contrato, ex. prestacao_servicos, sem horas
-- fixas -- NULL continua legitimo e nao se inventa um valor). valido_de =
-- data_inicio do vinculo: e a melhor aproximacao disponivel de desde quando
-- aquelas horas vigoram, sem inventar uma data que a base nao tem.
-- ==============================================================================
-- GUC hr.skip_horas_auditoria ligada SO a volta desta semente (achado 6 da 3a
-- revisao): copiar um valor que ja existia em pessoas_vinculos nao e uma
-- alteracao de ninguem -- ver o comentario de hr_vinculos_horas_auditar().
SELECT set_config('hr.skip_horas_auditoria', 'on', true);

-- Achado BLOQUEANTE desta revisao (7a): valido_de = data_inicio, sem mais,
-- deixava esta linha sem efeito quando data_inicio e no FUTURO -- alcancavel,
-- porque o assistente de admissao (src/lib/hr/novaPessoa.ts, ~linha 677)
-- grava sempre estado 'activo' com a data que vier do formulario, sem
-- nenhuma relacao entre estado e data_inicio imposta pelo schema. Nesse caso
-- a versao semeada tem valido_de no futuro; hr_vinculos_horas_sincronizar()
-- (mais acima) so encontra a versao valida HOJE (valido_de <= CURRENT_DATE);
-- o trigger AFTER da propria semente disparava, nao encontrava nenhuma
-- versao, e escrevia horas_periodo = NULL, horas_frequencia = NULL no
-- vinculo -- APAGANDO as horas contratadas que la estavam antes desta
-- migracao. A propria assercao "v_seed_valida" (bloco de conferir, mais
-- abaixo) apanhava isto e fazia o db push falhar.
--
-- Corrigido com least(data_inicio, CURRENT_DATE), e nao das outras duas
-- formas consideradas:
--   - a semente IGNORAR vinculos com inicio futuro fica mais simples, mas
--     parte a propria assercao "v_por_semear" (mais abaixo), que EXIGE uma
--     versao aberta para todo vinculo em vigor com horas declaradas -- e
--     deixa esse vinculo para sempre com um valor CRU em pessoas_vinculos,
--     sem nenhuma versao a sustenta-lo, ate alguem tocar nas horas a mao.
--   - a sincronizacao RECUAR para a versao mais proxima quando nenhuma
--     contem hoje reabriria exactamente o problema que a "CORRECAO" da 6a
--     revisao fechou para o caso normal (o aditamento com data de efeito
--     futura passaria a mostrar-se cedo demais) -- essa funcao ja esta
--     correcta para esse fluxo e nao se mexe nela por causa de um problema
--     que e so da SEMENTE.
-- least() nunca ADIANTA a data (so a capa a hoje, no maximo), por isso nao
-- muda nada para os vinculos cujo data_inicio ja e hoje ou passado -- a
-- grande maioria -- e preserva exactamente o valor que pessoas_vinculos ja
-- mostrava antes desta migracao para os de inicio futuro, sem inventar
-- nenhuma data que a base nao tem.
INSERT INTO public.pessoas_vinculos_horas
  (pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia, valido_de, motivo)
SELECT
  v.pessoa_id, v.organization_id, v.id, v.horas_periodo, v.horas_frequencia,
  least(v.data_inicio, CURRENT_DATE),
  'Semente a partir de pessoas_vinculos (20261130180000): valido_de = data_inicio do vinculo em vigor, capado a CURRENT_DATE quando o inicio e no futuro (achado bloqueante da 7a revisao) -- a melhor aproximacao disponivel que continua visivel a hr_vinculos_horas_sincronizar().'
FROM public.pessoas_vinculos v
WHERE v.estado IN ('activo', 'suspenso')
  AND v.deleted_at IS NULL
  -- So horas_periodo -- e o sinal real de "tem horas fixas declaradas", e ja
  -- era nullable antes desta migracao. horas_frequencia NAO discrimina nada
  -- aqui (achado da revisao): ate a seccao 2.5 acima correr, TODA a pessoa em
  -- pessoas_vinculos tem horas_frequencia preenchida -- era NOT NULL DEFAULT
  -- 'semanal' desde 20261120140000, e esta semente le o estado ANTERIOR ao
  -- trigger novo comecar a poder gravar NULL nela. Um segundo
  -- "AND ... IS NOT NULL" sobre horas_frequencia nunca filtrava uma linha a
  -- mais nesta query.
  AND v.horas_periodo IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.pessoas_vinculos_horas h
     WHERE h.pessoa_id = v.pessoa_id
       AND h.deleted_at IS NULL
       AND h.valido_ate IS NULL
  );

SELECT set_config('hr.skip_horas_auditoria', 'off', true);

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls          boolean;
  v_politicas    integer;
  v_campo_def    text;
  v_por_semear   integer;
  v_seed_valida  boolean;
BEGIN
  IF to_regclass('public.pessoas_vinculos_horas') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_vinculos_horas nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'pessoas_vinculos_horas';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.pessoas_vinculos_horas ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_vinculos_horas';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_pessoas_vinculos_horas_aberta'
  ) THEN
    RAISE EXCEPTION 'O indice unico parcial da versao aberta (por pessoa) nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_horas_sem_sobreposicao' AND tgrelid = to_regclass('public.pessoas_vinculos_horas')
  ) THEN
    RAISE EXCEPTION 'O trigger de nao-sobreposicao nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_horas_auditar' AND tgrelid = to_regclass('public.pessoas_vinculos_horas')
  ) THEN
    RAISE EXCEPTION 'O trigger de auditoria (pessoas_acessos_sensiveis) nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_horas_manter_em_vigor' AND tgrelid = to_regclass('public.pessoas_vinculos_horas')
  ) THEN
    RAISE EXCEPTION 'O trigger que mantem pessoas_vinculos.horas_periodo/horas_frequencia nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_horas_e_derivado' AND tgrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION 'O guarda de pessoas_vinculos.horas_periodo/horas_frequencia nao ficou criado -- as colunas ficariam escreviveis directamente.';
  END IF;

  -- Lado 2 da sincronizacao (achado 2 da 3a revisao): sem este trigger, um
  -- vinculo que entra em vigor nao herda a versao em aberto de horas da
  -- pessoa.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_vinculos_sincronizar_ao_entrar_em_vigor' AND tgrelid = to_regclass('public.pessoas_vinculos')
  ) THEN
    RAISE EXCEPTION 'O trigger que sincroniza um vinculo ao entrar em vigor nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_vinculos_horas_sincronizar' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'public.hr_vinculos_horas_sincronizar(uuid, uuid) nao ficou criada.';
  END IF;

  -- Achado "SEGURANCA" da 6a revisao (bloqueante): sem o REVOKE, esta funcao
  -- SECURITY DEFINER ficava chamavel via RPC do PostgREST por qualquer
  -- utilizador autenticado, com o pessoa_id/organization_id de OUTRA
  -- organizacao. has_function_privilege mede o GRANT real (pg_proc.proacl),
  -- nao suposicao.
  IF has_function_privilege('authenticated', 'public.hr_vinculos_horas_sincronizar(uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION
      'public.hr_vinculos_horas_sincronizar(uuid, uuid) e chamavel por authenticated -- devia estar revogada de PUBLIC/anon/authenticated e concedida so a service_role.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_vinculos_horas_sincronizar(uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.hr_vinculos_horas_sincronizar(uuid, uuid) e chamavel por anon.';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_vinculos_horas_sincronizar(uuid,uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.hr_vinculos_horas_sincronizar(uuid, uuid) devia continuar chamavel por service_role (os dois triggers que a chamam sao SECURITY DEFINER e alcancam-na de qualquer forma, mas o GRANT explicito confirma a intencao).';
  END IF;

  -- A coluna gerada da tabela nova tem de ser mesmo gerada (STORED), senao
  -- deixa de ser derivada e pode contradizer horas_periodo/horas_frequencia.
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.pessoas_vinculos_horas')
       AND a.attname = 'horas_semanais_equivalentes'
       AND a.attgenerated = 's'
  ) THEN
    RAISE EXCEPTION 'pessoas_vinculos_horas.horas_semanais_equivalentes nao e uma coluna gerada STORED.';
  END IF;

  -- pessoas_acessos_sensiveis.campo tem de aceitar o valor novo.
  SELECT pg_get_constraintdef(oid) INTO v_campo_def
    FROM pg_constraint
   WHERE conname = 'pessoas_acessos_sensiveis_campo_valido'
     AND conrelid = to_regclass('public.pessoas_acessos_sensiveis');

  IF v_campo_def IS NULL OR v_campo_def NOT LIKE '%horas_contratadas%' THEN
    RAISE EXCEPTION
      'pessoas_acessos_sensiveis_campo_valido nao aceita horas_contratadas: %', coalesce(v_campo_def, '(ausente)');
  END IF;
  -- E nao pode ter perdido nenhum valor antigo.
  IF v_campo_def NOT LIKE '%conta_bancaria%' OR v_campo_def NOT LIKE '%sindicalizacao%'
     OR v_campo_def NOT LIKE '%documento%' OR v_campo_def NOT LIKE '%retribuicao%' THEN
    RAISE EXCEPTION 'pessoas_acessos_sensiveis_campo_valido perdeu um valor antigo: %', v_campo_def;
  END IF;

  -- Prova aritmetica dos factores partilhados -- mesma prova de 20261120190000,
  -- agora contra a funcao, para confirmar que a duplicacao ficou fiel.
  IF public.hr_horas_periodo_para_semana(8, 'diaria') <> 40 THEN
    RAISE EXCEPTION 'Factor diario inconsistente em hr_horas_periodo_para_semana.';
  END IF;
  IF round(public.hr_horas_periodo_para_semana(173, 'mensal'), 2) <> 39.92 THEN
    RAISE EXCEPTION 'Factor mensal inconsistente em hr_horas_periodo_para_semana: deu %.',
      round(public.hr_horas_periodo_para_semana(173, 'mensal'), 2);
  END IF;
  IF round(public.hr_horas_periodo_para_semana(2080, 'anual'), 2) <> 40.00 THEN
    RAISE EXCEPTION 'Factor anual inconsistente em hr_horas_periodo_para_semana: deu %.',
      round(public.hr_horas_periodo_para_semana(2080, 'anual'), 2);
  END IF;

  -- Semente: nenhum vinculo em vigor com horas declaradas pode ter ficado sem
  -- versao em aberto correspondente. So horas_periodo -- mesma razao da
  -- semente (seccao 3): horas_frequencia nao discrimina nada aqui.
  SELECT count(*) INTO v_por_semear
    FROM public.pessoas_vinculos v
   WHERE v.estado IN ('activo', 'suspenso')
     AND v.deleted_at IS NULL
     AND v.horas_periodo IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_vinculos_horas h
        WHERE h.pessoa_id = v.pessoa_id AND h.deleted_at IS NULL AND h.valido_ate IS NULL
     );
  IF v_por_semear > 0 THEN
    RAISE EXCEPTION
      '% vinculo(s) em vigor com horas declaradas ficaram sem versao em aberto em pessoas_vinculos_horas.', v_por_semear;
  END IF;

  -- E a semente tem de ter deixado pessoas_vinculos.horas_periodo/frequencia
  -- coerentes com a versao em aberto que acabou de criar -- o trigger de
  -- sincronizacao dispara em cada INSERT da semente.
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.pessoas_vinculos v
      JOIN public.pessoas_vinculos_horas h
        ON h.pessoa_id = v.pessoa_id AND h.deleted_at IS NULL AND h.valido_ate IS NULL
     WHERE v.estado IN ('activo', 'suspenso')
       AND v.deleted_at IS NULL
       AND (v.horas_periodo IS DISTINCT FROM h.horas_periodo
            OR v.horas_frequencia IS DISTINCT FROM h.horas_frequencia)
  ) INTO v_seed_valida;

  IF NOT v_seed_valida THEN
    RAISE EXCEPTION
      'Ha vinculo(s) em vigor cujo horas_periodo/horas_frequencia nao coincide com a versao em aberto da pessoa -- o trigger de sincronizacao nao correu ou nao correu bem durante a semente.';
  END IF;

  -- ---- EXERCITAR os achados 1 e 2 da 3a revisao, com dados PROPRIOS -------
  -- Licao aplicada nesta revisao: um bloco de conferir tem de exercitar o que
  -- verifica, nao so olhar para o catalogo -- mas SEM depender de nenhuma
  -- organizacao, pessoa ou vinculo pre-existir, senao aborta numa base
  -- reconstruida do zero, num ramo novo, ou na integracao continua (achado 3
  -- da 3a revisao: a versao anterior fazia RAISE se a organizacao nike nao
  -- existisse). Cria-se aqui a propria organizacao de teste -- "name" e a
  -- unica coluna NOT NULL sem DEFAULT em anew_organizations, nenhuma FK
  -- obriga a nike (ou nenhuma outra) existir.
  --
  -- Tudo -- organizacao, pessoa, vinculos, versoes de horas -- vive dentro de
  -- UM bloco aninhado com EXCEPTION que TERMINA sempre a levantar uma
  -- excepcao propria (nunca P0001 -- achado 4 da 3a revisao: esse SQLSTATE e
  -- o mesmo de qualquer RAISE EXCEPTION do projecto, incluindo os triggers
  -- que esta migracao cria, e um WHEN SQLSTATE 'P0001' apanhava-os como se
  -- fossem sucesso). PL/pgSQL nao tem SAVEPOINT/ROLLBACK TO explicitos; o
  -- bloco aninhado com EXCEPTION e a subtransacao implicita que o Postgres
  -- desfaz sozinho, com sucesso ou falha -- por isso a organizacao e todos os
  -- dados de teste nunca ficam na base, em nenhum dos dois casos.
  DECLARE
    v_org_teste     uuid;
    v_pessoa_teste  uuid;
    v_vinculo_a     uuid;
    v_vinculo_b     uuid;
    v_horas_pos     numeric(8,2);
    v_freq_pos      text;
    v_vinculo_horas_pos uuid;
    v_bloqueado     boolean;
    v_acessos_antes integer;
    v_acessos_depois integer;
    v_alteracoes_antes  integer;
    v_alteracoes_depois integer;
    v_bloqueado_maximo  boolean;
    v_sqlstate_maximo   text;
    v_pessoa_teste2     uuid;
    v_vinculo_c         uuid;
    v_pessoa_teste3     uuid;
    v_vinculo_d         uuid;
    v_vinculo_novo      uuid;
    v_horas_aberta_vinculo_pos  uuid;
    v_horas_fechada_vinculo_pos uuid;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261130180000 (descartavel)')
    RETURNING id INTO v_org_teste;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_teste, 'Teste Migracao', 'Horas 20261130180000')
    RETURNING id INTO v_pessoa_teste;

    -- Vinculo A, em vigor, sem horas: INSERT liso, sem passar horas_periodo/
    -- horas_frequencia -- ficam NULL/NULL, ja sem DEFAULT nenhum a inventar
    -- 'semanal' (achado 5).
    INSERT INTO public.pessoas_vinculos
      (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
    VALUES
      (v_pessoa_teste, v_org_teste, 'sem_termo', '2020-01-01', 'activo')
    RETURNING id INTO v_vinculo_a;

    -- ---- Achado 1 (bloqueante): um INSERT directo em pessoas_vinculos com
    -- horas_periodo/horas_frequencia preenchidos tem de ser recusado -- antes
    -- desta revisao so o UPDATE estava coberto, e este INSERT passava em
    -- silencio.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_vinculos
        (pessoa_id, organization_id, tipo_contrato, data_inicio, estado,
         horas_periodo, horas_frequencia)
      VALUES
        (v_pessoa_teste, v_org_teste, 'sem_termo', '2020-06-01', 'futuro',
         40, 'semanal');
    EXCEPTION
      WHEN SQLSTATE 'HR010' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION
        'Achado 1 da 3a revisao nao ficou corrigido: um INSERT em pessoas_vinculos com horas_periodo/horas_frequencia preenchidos nao foi recusado.';
    END IF;

    -- ---- Abre a versao de horas da pessoa: 40h/semana. Deve propagar-se
    -- para o vinculo A (o em vigor).
    INSERT INTO public.pessoas_vinculos_horas
      (pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia, valido_de)
    VALUES
      (v_pessoa_teste, v_org_teste, v_vinculo_a, 40, 'semanal', '2020-01-01');

    SELECT v.horas_periodo, v.horas_frequencia INTO v_horas_pos, v_freq_pos
      FROM public.pessoas_vinculos v WHERE v.id = v_vinculo_a;
    IF v_horas_pos IS DISTINCT FROM 40 OR v_freq_pos IS DISTINCT FROM 'semanal' THEN
      RAISE EXCEPTION
        'A sincronizacao pessoas_vinculos_horas -> pessoas_vinculos (lado 1) nao propagou a versao aberta para o vinculo em vigor (ficou %, %).',
        v_horas_pos, v_freq_pos;
    END IF;

    -- ---- Achado 2 (bloqueante): terminar A e abrir B -- o caminho normal da
    -- aplicacao -- tem de deixar B com a versao em aberto da PESSOA, sem se
    -- escrever nada em pessoas_vinculos_horas outra vez. Antes desta revisao,
    -- B ficava com o que viesse no seu proprio INSERT (NULL), podendo
    -- contradizer a versao aberta, e sem forma de o corrigir a mao (a guarda
    -- do achado 1 bloqueia o UPDATE directo).
    --
    -- Conta as linhas de auditoria da pessoa de teste ANTES de terminar A e
    -- abrir B (achado 2 da 5a revisao): terminar um vinculo e abrir outro nao
    -- e uma alteracao de horas -- so um re-apontamento de vinculo_id -- e por
    -- isso NAO PODE gerar nenhuma linha nova em pessoas_acessos_sensiveis.
    SELECT count(*) INTO v_acessos_antes
      FROM public.pessoas_acessos_sensiveis WHERE pessoa_id = v_pessoa_teste;
    -- Achado "MEDIO" da 6a revisao: pelo mesmo motivo, tambem NAO PODE gerar
    -- nenhuma linha nova em pessoas_vinculos_alteracoes para o campo
    -- horas_frequencia -- o UPDATE de sincronizacao em pessoas_vinculos
    -- (SET horas_periodo, horas_frequencia) dispara trg_pessoas_vinculos_
    -- registar_alteracao (20261123050000), cujo v_campos inclui esse campo.
    SELECT count(*) INTO v_alteracoes_antes
      FROM public.pessoas_vinculos_alteracoes
     WHERE pessoa_id = v_pessoa_teste AND campo = 'horas_frequencia';
    --
    -- data_fim preenchida e >= data_inicio (2020-01-01): sem isto o UPDATE
    -- rebenta com 23514 contra pessoas_vinculos_terminado_tem_data_fim
    -- (20261122100000) -- o proprio erro que a 4a revisao encontrou (achado
    -- 1 desta revisao) a impedir o db push de terminar por aqui.
    UPDATE public.pessoas_vinculos
       SET estado = 'terminado', data_fim = '2020-12-31'
     WHERE id = v_vinculo_a;

    INSERT INTO public.pessoas_vinculos
      (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
    VALUES
      (v_pessoa_teste, v_org_teste, 'sem_termo', '2021-01-01', 'activo')
    RETURNING id INTO v_vinculo_b;

    SELECT v.horas_periodo, v.horas_frequencia INTO v_horas_pos, v_freq_pos
      FROM public.pessoas_vinculos v WHERE v.id = v_vinculo_b;
    IF v_horas_pos IS DISTINCT FROM 40 OR v_freq_pos IS DISTINCT FROM 'semanal' THEN
      RAISE EXCEPTION
        'Achado 2 da 3a revisao nao ficou corrigido: o vinculo B, ao entrar em vigor (terminar A e abrir B), nao herdou a versao em aberto de horas da pessoa (ficou %, %, esperava-se 40, semanal).',
        v_horas_pos, v_freq_pos;
    END IF;

    -- ---- Achado 4 (4a revisao, ALTO): a versao em aberto NAO PODE ficar
    -- pendurada no vinculo A, ja terminado -- tem de ficar re-apontada para
    -- B, o que entrou em vigor. Este e exactamente o cenario que a 3a
    -- revisao nao tinha testado (o teste so olhava para os VALORES
    -- propagados, nunca para vinculo_id da linha de origem).
    SELECT h.vinculo_id INTO v_vinculo_horas_pos
      FROM public.pessoas_vinculos_horas h
     WHERE h.pessoa_id = v_pessoa_teste AND h.deleted_at IS NULL AND h.valido_ate IS NULL;
    IF v_vinculo_horas_pos IS DISTINCT FROM v_vinculo_b THEN
      RAISE EXCEPTION
        'Achado 4 da 4a revisao nao ficou corrigido: a versao em aberto de horas devia ter ficado re-apontada para o vinculo B (%) e ficou apontada para % -- documenta um contrato ja terminado.',
        v_vinculo_b, v_vinculo_horas_pos;
    END IF;

    -- ---- Achado 2 da 5a revisao (ALTO): o re-apontamento de vinculo_id
    -- acima NAO PODE ter gerado nenhuma linha nova em pessoas_acessos_
    -- sensiveis -- nem uma alteracao de horas foi feita (so o vinculo_id da
    -- versao em aberto mudou). Sem a GUC hr.skip_horas_auditoria a volta
    -- desse UPDATE em hr_vinculos_horas_sincronizar(), trg_pessoas_vinculos_
    -- horas_auditar (AFTER INSERT OR UPDATE, sem WHEN) disparava aqui na
    -- mesma, escrevendo 'horas_contratadas / alterar' para uma renovacao de
    -- contrato que ninguem tocou nas horas.
    SELECT count(*) INTO v_acessos_depois
      FROM public.pessoas_acessos_sensiveis WHERE pessoa_id = v_pessoa_teste;
    IF v_acessos_depois <> v_acessos_antes THEN
      RAISE EXCEPTION
        'Achado 2 da 5a revisao nao ficou corrigido: terminar o vinculo A e abrir o B gerou % linha(s) nova(s) em pessoas_acessos_sensiveis (tinha %, ficou com %) so pelo re-apontamento de vinculo_id -- auditoria espuria para uma alteracao de horas que ninguem fez.',
        v_acessos_depois - v_acessos_antes, v_acessos_antes, v_acessos_depois;
    END IF;

    SELECT count(*) INTO v_alteracoes_depois
      FROM public.pessoas_vinculos_alteracoes
     WHERE pessoa_id = v_pessoa_teste AND campo = 'horas_frequencia';
    IF v_alteracoes_depois <> v_alteracoes_antes THEN
      RAISE EXCEPTION
        'Achado "MEDIO" da 6a revisao nao ficou corrigido: terminar o vinculo A e abrir o B gerou % linha(s) nova(s) em pessoas_vinculos_alteracoes para o campo horas_frequencia (tinha %, ficou com %) so pelo re-apontamento -- auditoria espuria atribuida a quem apenas renovou o contrato.',
        v_alteracoes_depois - v_alteracoes_antes, v_alteracoes_antes, v_alteracoes_depois;
    END IF;

    -- ---- Sem versao em aberto, as duas colunas ficam NULL (achado da 2a
    -- revisao, mantido): fecha-se a unica versao aberta (por pessoa_id, nao
    -- por vinculo_id -- que o achado 4, logo acima, acabou de re-apontar
    -- para B) e confirma-se que B -- o vinculo em vigor agora -- fica
    -- NULL/NULL.
    UPDATE public.pessoas_vinculos_horas
       SET valido_ate = '2020-12-31'
     WHERE pessoa_id = v_pessoa_teste AND deleted_at IS NULL AND valido_ate IS NULL;

    SELECT v.horas_periodo, v.horas_frequencia INTO v_horas_pos, v_freq_pos
      FROM public.pessoas_vinculos v WHERE v.id = v_vinculo_b;
    IF v_horas_pos IS NOT NULL OR v_freq_pos IS NOT NULL THEN
      RAISE EXCEPTION
        'Com a pessoa sem versao em aberto, pessoas_vinculos.horas_periodo/horas_frequencia deviam ter ficado NULL no vinculo em vigor e ficaram (%, %).',
        v_horas_pos, v_freq_pos;
    END IF;

    -- ---- Achado "CORRECCAO" da 6a revisao (bloqueante), sentido REVERSO:
    -- abre-se uma versao valida DESDE HOJE (30h/semana) para B -- sincroniza
    -- normalmente, e fica-a fechar com um valido_ate FUTURO (30 dias). Uma
    -- versao fechada nao deixa de vigorar antes do seu valido_ate: B tem de
    -- CONTINUAR com 30h/semanal, nao NULL/NULL, ate essa data chegar. Antes
    -- desta correccao, filtrar so por "valido_ate IS NULL" fazia esta funcao
    -- nao encontrar nenhuma versao (a unica existente ja tem valido_ate
    -- preenchido, mesmo sendo futuro) e pos as colunas a NULL de imediato.
    INSERT INTO public.pessoas_vinculos_horas
      (pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia, valido_de)
    VALUES
      (v_pessoa_teste, v_org_teste, v_vinculo_b, 30, 'semanal', CURRENT_DATE);

    SELECT v.horas_periodo, v.horas_frequencia INTO v_horas_pos, v_freq_pos
      FROM public.pessoas_vinculos v WHERE v.id = v_vinculo_b;
    IF v_horas_pos IS DISTINCT FROM 30 OR v_freq_pos IS DISTINCT FROM 'semanal' THEN
      RAISE EXCEPTION
        'Reabrir uma versao de horas valida desde hoje devia ter sincronizado 30/semanal para o vinculo em vigor e ficou (%, %).',
        v_horas_pos, v_freq_pos;
    END IF;

    UPDATE public.pessoas_vinculos_horas
       SET valido_ate = CURRENT_DATE + 30
     WHERE pessoa_id = v_pessoa_teste AND deleted_at IS NULL AND valido_ate IS NULL;

    SELECT v.horas_periodo, v.horas_frequencia INTO v_horas_pos, v_freq_pos
      FROM public.pessoas_vinculos v WHERE v.id = v_vinculo_b;
    IF v_horas_pos IS DISTINCT FROM 30 OR v_freq_pos IS DISTINCT FROM 'semanal' THEN
      RAISE EXCEPTION
        'Achado "CORRECCAO" da 6a revisao nao ficou corrigido (sentido reverso): fechar a versao aberta com um valido_ate FUTURO (%) apagou as horas em pessoas_vinculos (ficou %, %) quando deviam continuar em vigor (30, semanal) ate essa data.',
        CURRENT_DATE + 30, v_horas_pos, v_freq_pos;
    END IF;

    -- ---- Achado "CORRECCAO" da 6a revisao (bloqueante), sentido DIRECTO:
    -- abre-se agora uma SEGUNDA versao com valido_de FUTURO (a mesma data em
    -- que a anterior fecha, sem sobreposicao) -- um aditamento assinado hoje
    -- com efeito daqui a 30 dias. B tem de CONTINUAR a mostrar a versao
    -- ainda em vigor (30/semanal), nao a futura (35/semanal), ate essa data
    -- chegar. Antes desta correccao, filtrar so por "valido_ate IS NULL"
    -- apanhava esta versao nova (a unica sem fim) e escrevia os valores
    -- futuros de imediato.
    INSERT INTO public.pessoas_vinculos_horas
      (pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia, valido_de)
    VALUES
      (v_pessoa_teste, v_org_teste, v_vinculo_b, 35, 'semanal', CURRENT_DATE + 30);

    SELECT v.horas_periodo, v.horas_frequencia INTO v_horas_pos, v_freq_pos
      FROM public.pessoas_vinculos v WHERE v.id = v_vinculo_b;
    IF v_horas_pos IS DISTINCT FROM 30 OR v_freq_pos IS DISTINCT FROM 'semanal' THEN
      RAISE EXCEPTION
        'Achado "CORRECCAO" da 6a revisao nao ficou corrigido (sentido directo): abrir uma versao de horas com valido_de FUTURO escreveu-a de imediato em pessoas_vinculos (ficou %, %) quando devia continuar a mostrar a versao ainda em vigor (30, semanal) ate a data de efeito chegar.',
        v_horas_pos, v_freq_pos;
    END IF;

    -- ---- Achado ALTO desta revisao (7a): neste ponto a pessoa de teste tem
    -- DUAS versoes de horas vivas, as duas ainda apontadas para o vinculo B
    -- (v_vinculo_b) -- exactamente a situacao que o achado descreve:
    --   - a versao FECHADA valida HOJE (30/semanal, valido_ate = hoje+30);
    --   - a versao EM ABERTO, futura (35/semanal, valido_de = hoje+30).
    -- Muda-se agora o vinculo outra vez -- termina-se B e abre-se um vinculo
    -- novo, em vigor desde hoje -- e verifica-se qual das duas o
    -- re-apontamento move. Com o defeito (reaproveitar v_horas_id, a versao
    -- valida HOJE), seria a linha FECHADA e historica que ficava reapontada
    -- para o vinculo novo -- corrompendo o historico -- e a versao EM
    -- ABERTO ficava para sempre pendurada em B, ja terminado (o proprio
    -- defeito que o achado 4 da 4a revisao existia para fechar). Corrigido:
    -- so a versao EM ABERTO (v_horas_aberta_id) e re-apontada.
    UPDATE public.pessoas_vinculos
       SET estado = 'terminado', data_fim = CURRENT_DATE
     WHERE id = v_vinculo_b;

    INSERT INTO public.pessoas_vinculos
      (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
    VALUES
      (v_pessoa_teste, v_org_teste, 'sem_termo', CURRENT_DATE, 'activo')
    RETURNING id INTO v_vinculo_novo;

    SELECT h.vinculo_id INTO v_horas_aberta_vinculo_pos
      FROM public.pessoas_vinculos_horas h
     WHERE h.pessoa_id = v_pessoa_teste AND h.deleted_at IS NULL AND h.valido_ate IS NULL;
    SELECT h.vinculo_id INTO v_horas_fechada_vinculo_pos
      FROM public.pessoas_vinculos_horas h
     WHERE h.pessoa_id = v_pessoa_teste AND h.deleted_at IS NULL
       AND h.horas_periodo = 30 AND h.valido_ate = CURRENT_DATE + 30;

    IF v_horas_aberta_vinculo_pos IS DISTINCT FROM v_vinculo_novo THEN
      RAISE EXCEPTION
        'Achado ALTO desta revisao nao ficou corrigido: a versao EM ABERTO de horas devia ter ficado re-apontada para o vinculo novo (%) e ficou apontada para % -- o re-apontamento moveu a versao errada.',
        v_vinculo_novo, v_horas_aberta_vinculo_pos;
    END IF;
    IF v_horas_fechada_vinculo_pos IS DISTINCT FROM v_vinculo_b THEN
      RAISE EXCEPTION
        'Achado ALTO desta revisao nao ficou corrigido: a versao FECHADA e historica de horas (valida ate hoje+30) devia ter continuado apontada para o vinculo B (%) -- a que estava em vigor quando ela vigorou -- e ficou apontada para % em vez disso, corrompendo o historico.',
        v_vinculo_b, v_horas_fechada_vinculo_pos;
    END IF;

    -- ---- Achado "BAIXO/MEDIO" da 6a revisao: uma versao de horas acima do
    -- maximo declarado no vinculo (pessoas_vinculos_maximo_acima_do_
    -- contratado, 20261120190000 -- um CHECK da propria tabela
    -- pessoas_vinculos, nao um trigger) tem de ser recusada com uma mensagem
    -- compreensivel (HR011), e so quando for mesmo essa constraint a violada
    -- (achado BAIXO da 7a revisao -- ver o GET STACKED DIAGNOSTICS em
    -- hr_vinculos_horas_sincronizar()). PESSOA/VINCULO
    -- PROPRIOS (nao v_pessoa_teste/v_vinculo_b): assim nao ha nenhuma versao
    -- de horas ja aberta a evitar, e o unico erro possivel no INSERT abaixo e
    -- mesmo o CHECK que se quer exercitar.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_teste, 'Teste Migracao', 'Tecto 20261130180000')
    RETURNING id INTO v_pessoa_teste2;

    INSERT INTO public.pessoas_vinculos
      (pessoa_id, organization_id, tipo_contrato, data_inicio, estado, horas_semanais_maximas)
    VALUES
      (v_pessoa_teste2, v_org_teste, 'sem_termo', '2020-01-01', 'activo', 10)
    RETURNING id INTO v_vinculo_c;

    v_bloqueado_maximo := false;
    v_sqlstate_maximo := NULL;
    BEGIN
      INSERT INTO public.pessoas_vinculos_horas
        (pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia, valido_de)
      VALUES
        (v_pessoa_teste2, v_org_teste, v_vinculo_c, 40, 'semanal', '2020-01-01');
    EXCEPTION
      WHEN SQLSTATE 'HR011' THEN
        v_bloqueado_maximo := true;
      WHEN OTHERS THEN
        v_sqlstate_maximo := SQLSTATE;
    END;
    IF v_sqlstate_maximo IS NOT NULL THEN
      RAISE EXCEPTION
        'Achado "BAIXO/MEDIO" da 6a revisao nao ficou corrigido: uma versao de horas acima do maximo do vinculo devia falhar com HR011 e falhou com SQLSTATE % em vez disso.',
        v_sqlstate_maximo;
    END IF;
    IF NOT v_bloqueado_maximo THEN
      RAISE EXCEPTION
        'Achado "BAIXO/MEDIO" da 6a revisao nao ficou corrigido: uma versao de horas (40/semanal) acima do maximo do vinculo (10) devia ter sido recusada e nao foi.';
    END IF;

    -- ---- Achado BLOQUEANTE desta revisao (7a): reproduz o cenario da
    -- SEMENTE (seccao 3) para um vinculo 'activo' com data_inicio no FUTURO
    -- -- alcancavel, porque o assistente de admissao grava sempre estado
    -- 'activo' com a data que vier do formulario (src/lib/hr/novaPessoa.ts,
    -- ~linha 677), sem nenhuma relacao entre estado e data_inicio imposta
    -- pelo schema. PESSOA/VINCULO PROPRIOS, para nao interferir com nenhuma
    -- versao de horas ja aberta dos cenarios anteriores.
    --
    -- O vinculo nasce SEM horas (INSERT liso, NULL/NULL) -- e o unico estado
    -- alcancavel aqui: este bloco corre DEPOIS dos triggers desta migracao ja
    -- existirem, e um vinculo 'activo' recem-criado dispara de imediato o
    -- Lado 2 (trg_pessoas_vinculos_sincronizar_ao_entrar_em_vigor), que
    -- sincronizaria qualquer valor escrito directamente antes de se chegar
    -- a simular a semente -- ao contrario de uma base REAL, onde as linhas
    -- de pessoas_vinculos ja tinham horas_periodo/horas_frequencia muito
    -- antes de estes triggers serem criados por esta mesma migracao. Por
    -- isso o valor "ja existente antes da migracao" (25/semanal) entra aqui
    -- como literal na semente de teste, tal como a semente real (seccao 3)
    -- o teria lido de uma linha nunca tocada por nenhum trigger novo.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_teste, 'Teste Migracao', 'Inicio Futuro 20261130180000')
    RETURNING id INTO v_pessoa_teste3;

    INSERT INTO public.pessoas_vinculos
      (pessoa_id, organization_id, tipo_contrato, data_inicio, estado)
    VALUES
      (v_pessoa_teste3, v_org_teste, 'sem_termo', CURRENT_DATE + 30, 'activo')
    RETURNING id INTO v_vinculo_d;

    -- Mesma expressao da semente corrigida (seccao 3): valido_de =
    -- least(data_inicio, CURRENT_DATE). Com o defeito (valido_de =
    -- data_inicio, sem mais), esta linha ficaria com valido_de no futuro, o
    -- trigger AFTER da propria linha (trg_pessoas_vinculos_horas_manter_em_
    -- vigor) chamaria a sincronizacao, esta nao encontraria nenhuma versao
    -- valida HOJE, e apagaria (mantiveria a NULL) as horas que a semente
    -- real estava precisamente a tentar preservar.
    INSERT INTO public.pessoas_vinculos_horas
      (pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia, valido_de, motivo)
    SELECT v.pessoa_id, v.organization_id, v.id, 25, 'semanal',
           least(v.data_inicio, CURRENT_DATE),
           'Semente de teste (cenario de vinculo com inicio futuro, achado bloqueante da 7a revisao).'
    FROM public.pessoas_vinculos v
    WHERE v.id = v_vinculo_d;

    SELECT v.horas_periodo, v.horas_frequencia INTO v_horas_pos, v_freq_pos
      FROM public.pessoas_vinculos v WHERE v.id = v_vinculo_d;
    IF v_horas_pos IS DISTINCT FROM 25 OR v_freq_pos IS DISTINCT FROM 'semanal' THEN
      RAISE EXCEPTION
        'Achado BLOQUEANTE desta revisao nao ficou corrigido: semear a versao de horas de um vinculo activo com data_inicio no futuro apagou as horas contratadas (ficou %, %, esperava-se 25, semanal) -- valido_de da semente tem de ficar capado a CURRENT_DATE.',
        v_horas_pos, v_freq_pos;
    END IF;

    -- Todas as assercoes passaram: forcar o desfazer da organizacao, pessoa,
    -- vinculos e versoes de horas de teste, com um SQLSTATE proprio (HR900)
    -- que nao colide com nenhum RAISE EXCEPTION real do projecto (achado 4).
    RAISE EXCEPTION 'teste_horas_20261130180000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: todas as assercoes passaram, dados de teste desfeitos pela subtransacao implicita
    WHEN OTHERS THEN
      -- Reporta o SQLSTATE e a mensagem originais em vez de os esconder atras
      -- de uma frase generica (achado 4 da 3a revisao).
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migracao (achados 1 e 2 da 3a revisao) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE
    'OK: pessoas_vinculos_horas criada (RLS, 4 politicas, alteracao vs correccao), nao-sobreposicao e auditoria por trigger, pessoas_vinculos.horas_periodo/horas_frequencia agora derivados e protegidos dos dois lados (INSERT e UPDATE bloqueados fora do mecanismo, sincronizacao a disparar tanto de pessoas_vinculos_horas como de pessoas_vinculos -- testado ao vivo, com dados proprios, sem depender de organizacao nenhuma pre-existir), o valor em vigor deriva da versao valida HOJE (nao so da em aberto, testado nos dois sentidos com datas futuras), a semente preserva as horas de um vinculo activo com inicio no futuro (achado bloqueante da 7a revisao), o re-apontamento de vinculo_id move so a versao EM ABERTO e nunca a valida-hoje quando as duas divergem (achado alto da 7a revisao), pessoas_acessos_sensiveis.campo aceita horas_contratadas, semente aplicada e coerente sem auditoria espuria em pessoas_acessos_sensiveis NEM em pessoas_vinculos_alteracoes, um tecto de horas acima do vinculo falha com mensagem compreensivel (HR011, so quando a constraint violada e mesmo a do tecto), e hr_vinculos_horas_sincronizar() nao e chamavel por authenticated nem anon.';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. Correr "supabase migration list" contra o remoto e confirmar que
--    20261120190000, 20261122100000, 20261123030000, 20261127020000,
--    20261130050000 e 20261130060000 ja estao aplicadas; que 20261130130000,
--    20261130140000, 20261130150000, 20261130160000 e 20261130170000 (as que
--    ja ocupavam a fila neste worktree -- achado 1 da 5a revisao, alargado na
--    6a: a renumeracao da 4a revisao so tinha olhado para as duas primeiras e
--    colidiu com a terceira; a da 5a parou em 20261130170000 sem reparar que
--    esse carimbo, entretanto, tinha passado a ser usado por OUTRA migracao
--    deste mesmo worktree, sem relacao nenhuma com horas -- ver a 6a revisao,
--    abaixo) tambem ja estao aplicadas ou vao no mesmo push, ANTES desta na
--    fila; e as DUAS verificacoes seguintes, NAS DUAS DIRECCOES -- confirmar
--    que nao ha nenhum FICHEIRO LOCAL em supabase/migrations/ com o timestamp
--    20261130180000 que nao seja este (colisao de carimbo, o proprio defeito
--    corrigido nas 5a e 6a revisoes), E que nao ha nenhum timestamp
--    20261130180000 JA APLICADO no remoto sem este ficheiro local (a
--    verificacao anterior, sozinha, so olhava para este segundo caso e nunca
--    apanharia o primeiro).
--
-- 2. OBRIGATORIO ANTES DESTE PUSH -- ver o banner logo apos "POR APLICAR." no
--    topo do ficheiro (achado 2 da 4a revisao): ha um QUARTO caminho de
--    escrita directa de horas_periodo/horas_frequencia em pessoas_vinculos,
--    em src/lib/hr/novaPessoa.ts + src/hooks/usePessoas.ts (o assistente de
--    admissao de pessoa nova), que a 3a revisao nao tinha detectado. Sem
--    mudar esses dois ficheiros para passarem a escrever em
--    public.pessoas_vinculos_horas (mesmo padrao do caminho 3, ja pensado
--    para isto -- ver o banner para os ficheiros/linhas exactos), este push
--    PARTE toda a admissao de pessoa com contrato. Os outros tres caminhos
--    (src/components/hr/PessoaContratoTab.tsx, src/hooks/usePessoa.ts
--    saveVinculo, src/hooks/usePessoaVinculoHoras.ts) foram confirmados por
--    leitura directa nesta revisao -- ja NAO escrevem horas via
--    pessoas_vinculos, nada a mudar neles. CONFIRMAR AO VIVO depois do push
--    (leitura de codigo nao substitui confirmacao empirica) que tanto o ecra
--    de edicao da pessoa como o assistente de admissao continuam a gravar
--    contrato e horas sem excepcao crua.
--
-- 3. Correr os testes ANTES do push, contra o remoto ainda por corrigir -- e
--    ai que o defeito (sem historico de horas) ainda existe legitimamente.
--    Depois de aplicada, nao se volta atras para demonstrar: a base e
--    partilhada por organizacoes com dados reais.
-- ==============================================================================
