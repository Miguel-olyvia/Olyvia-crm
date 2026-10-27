-- ==============================================================================
-- Migration B: pessoas_justificacoes_dia -- onde a "justificacao do dia" passa a
-- ficar guardada, e as cinco RPCs que a leem, registam e decidem.
--
-- RASCUNHO. NAO APLICADO. Vive em supabase/rascunhos/ e so passa para
-- supabase/migrations/ depois de revisto e de corrido o teste
-- (supabase/rascunhos/TESTE-justificacao-do-dia.sql).
-- Desenho: supabase/rascunhos/DESENHO-justificacao-dia.md (com as correccoes
-- da revisao de 27/10, ver "O QUE MUDOU DO DESENHO" abaixo).
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A pessoa justifica um atraso ou uma falta SUGERIDA (ainda nao ha falta
-- marcada) e o RH aceita (paga / nao paga) ou recusa com motivo. Aceitar ja
-- escrevia uma falta real, mas o pedido em si -- o texto da pessoa, o estado,
-- a recusa, o "quem leu" -- vivia so em memoria no browser e perdia-se ao
-- recarregar. O RH real so tinha justificacoes de uma falta que JA existe
-- (pessoas_faltas_justificacoes, falta_id NOT NULL) e de um pedido de ausencia.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma linha = UM ENVIO da pessoa para um dia e um periodo. Append-only: sem
-- deleted_at e sem DELETE; reenviar depois de uma recusa e uma linha nova.
--
-- Estados: pendente -> aceite_paga | aceite_nao_paga | recusada.
--          aceite_* -> sem_efeito, quando a falta que a aceitacao criou e
--          anulada ou corrigida (gatilho em pessoas_faltas, ver abaixo).
-- Uma activa (pendente ou aceite) por pessoa, dia e hora de inicio; recusada e
-- sem_efeito nao impedem o reenvio.
--
-- ACEITAR E UMA SO CHAMADA, numa so transaccao, que usa as RPCs de faltas que
-- ja existem, SEM AS ALTERAR:
--   rpc_hr_falta_marcar (ou reaproveita a falta activa do mesmo dia e hora),
--   rpc_hr_falta_registar_justificacao (declaracao_propria),
--   rpc_hr_falta_decidir_justificacao ('justificada').
-- Se qualquer passo falhar (sobreposicao, ausencia aprovada, horas
-- trabalhadas, permissao) nada fica escrito. Acaba o estado "falta marcada mas
-- justificacao por decidir" que o ecra tinha de gerir com tres chamadas.
--
-- O TEXTO DA PESSOA (motivo) e protegido como o NISS, o IBAN e o atestado:
--   * coluna sem GRANT de leitura -- ninguem a le pela tabela;
--   * a propria pessoa recebe o seu motivo por rpc_hr_justificacao_dia_listar;
--   * o RH recebe o motivo de transporte / assunto pessoal / outro pelo _listar;
--   * o motivo de CONSULTA MEDICA so sai por rpc_hr_justificacao_dia_ver_texto,
--     que exige hr.assiduidade.justificacao.view (is_dangerous) e regista o
--     acesso em pessoas_acessos_sensiveis ('justificacao_dia') ANTES de devolver;
--   * ao aceitar uma consulta medica, a falta recebe um texto NEUTRO, e nao o
--     motivo: pessoas_faltas_justificacoes le-se sem rasto por quem tem a
--     permissao, e copiar o texto para la desfazia a proteccao.
--
-- MES FECHADO (hr_periodos_processamento.estado = 'fechado', valores lidos no
-- catalogo: 'aberto' | 'fechado'): aceitar num mes fechado exige
-- _confirmar_mes_fechado = true. Sem ele, a RPC recusa ANTES de escrever
-- (justificacao_dia_mes_fechado, 55000) e o ecra pede confirmacao. Recusar nao
-- mexe em faltas e nao pede confirmacao. A fotografia fica em
-- mes_fechado_na_decisao.
--
--
-- -- O QUE MUDOU DO DESENHO (revisao de 27/10, achados HIGH) -------------------
--
-- 1. Consulta medica: a falta recebe texto neutro + documento_ref
--    'justificacao-dia:<id>'; o motivo fica so aqui.
-- 2. Estado 'sem_efeito' + coluna sem_efeito_em + gatilho AFTER UPDATE OF
--    estado em pessoas_faltas: anular ou corrigir a falta liberta o periodo
--    (sem isto o indice parcial bloqueava o reenvio para sempre).
-- 3. Ramo idempotente: so reaproveita uma falta cuja justificacao esteja
--    'sem_justificacao' ou 'pendente_documento'; uma ja decidida da
--    justificacao_dia_falta_ja_decidida (rpc_hr_falta_decidir_justificacao nao
--    o verifica e reescreveria a decisao anterior em silencio). Uma falta
--    activa que CRUZE o periodo sem comecar a mesma hora da
--    justificacao_dia_falta_sobreposta, antes de tentar marcar. Faltas
--    'corrigida' estao fora de circulacao: so a correctora (activa) conta.
-- 4. Mes fechado: _confirmar_mes_fechado, verificado ANTES de escrever.
--
--
-- -- O QUE MUDOU NA SEGUNDA REVISAO (27/10, achados HIGH) ---------------------
--
-- 5. Ninguem decide a sua propria justificacao. _decidir recusa com
--    justificacao_dia_propria_decisao (42501), em aceitar e em recusar, quando
--    a justificacao e da pessoa ligada a quem decide -- o mesmo padrao de
--    rpc_hr_ausencia_cancelar / ausencia_historico_proprio (v_eu =
--    hr_pessoa_do_utilizador; antes da verificacao de permissao, para a
--    mensagem dizer "e a sua" e nao "falta-lhe a permissao"). Lido no
--    catalogo a 27/10: nenhuma das RPCs de faltas que a aceitacao chama tem
--    esta guarda, por isso tem de estar aqui. _registar: quem tem
--    justificacao.edit NAO usa os poderes do RH sobre a propria ficha (registar
--    fora do prazo); para si e so a pessoa (picar, dentro do prazo).
-- 6. Ambito do RH: ver "AMBITO DO RH" abaixo. Fica org-inteira, como as
--    tabelas de faltas que reutiliza; decisao registada em POR DECIDIR.
--
--
-- -- AMBITO DO RH (lido no catalogo da base RH a 27/10) ------------------------
--
-- pessoas_faltas_justificacoes_select: justificacao.view na ORGANIZACAO, ou a
-- propria pessoa. pessoas_faltas_select: faltas.view na ORGANIZACAO, a propria
-- pessoa, ou equipa.view + hr_ausencias_pessoa_na_minha_cadeia (so a chefia).
-- As RPCs de faltas (marcar, registar/decidir justificacao, ver_justificacao)
-- verificam so has_anew_permission_in_org. Nao existe na base RH nenhuma
-- funcao de ambito do RH (centro, departamento): o RH ve a organizacao toda.
-- Esta tabela segue o mesmo predicado -- nem mais aberta nem mais fechada do
-- que a que reutiliza. Restringir por ambito e decisao de produto por tomar
-- (vault/registo-trabalho.md, POR DECIDIR), e teria de mudar as tres tabelas
-- de uma vez, senao a falta criada pela aceitacao ficava mais aberta do que o
-- pedido que a originou.
--
--
-- -- DECISOES POR CONFIRMAR COM O UTILIZADOR (assumidas aqui, faceis de mudar) --
--
--   a) a pessoa envia a sua com hr.assiduidade.picar (recomendado no desenho);
--   b) prazo de 5 dias uteis (seg-sex, sem feriados), constante na base, igual
--      a somarDiasUteis do ecra. Aplica-se a PESSOA; o RH
--      (hr.assiduidade.justificacao.edit) pode registar em nome da pessoa fora
--      do prazo -- e o caminho de saida depois de uma falta anulada;
--   c) uma activa por pessoa, dia e HORA DE INICIO;
--   d) mes fechado: pede confirmacao (nao so avisa, nao bloqueia);
--   e) "quem leu" aproximado: acessos 'justificacao_dia' da pessoa desde a
--      criacao da justificacao (pessoas_acessos_sensiveis nao tem referencia
--      ao registo).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Anexos: so nomes (text[], ate 4); nao se envia ficheiro -- o bucket
--   continua fechado ao cliente (20261207004300).
-- - Confirmar o periodo contra hr_assiduidade_desvios (desenho 6.4): custo por
--   medir na nike; fica de fora. O RH ve o periodo antes de aceitar.
-- - Horas extra: nao existe tabela nem funcao na base RH; desenho a parte.
-- - Nenhuma RPC de faltas e alterada. pessoas_faltas ganha UM gatilho AFTER
--   (so escreve nesta tabela nova).
--
--
-- -- PRECISA DE CODIGO NOVO? ---------------------------------------------------
--
-- Nao parte nada sozinha (so acrescenta). Mas so serve com o codigo novo, que
-- vai NO MESMO ENVIO PARA O MAIN: lojaJustificacaoDia / accoesJustificacaoDia
-- passam a ler de _listar e escrever por _registar / _decidir / _ver_texto /
-- _acessos; AceitarComFaltaReal passa a UMA chamada (_decidir devolve o
-- falta_id); os exemplos p-ines / p-andre / p-beatriz saem do caminho real;
-- mesFechado passa a vir da base; o erro justificacao_dia_mes_fechado abre a
-- confirmacao no ecra.
--
--
-- -- ORDEM DE PUBLICACAO -------------------------------------------------------
--
-- 1. Ler o remoto (base RH uetjghdkwbywbftedtth, a partir do worktree
--    rh-pessoas; confirmar supabase/.temp/project-ref): migration list
--    --linked; a ultima aplicada a 27/10 era 20261231600000 (897). Confirmar
--    que pessoas_justificacoes_dia e rpc_hr_justificacao_dia_* NAO existem.
-- 2. Migration A (20261231790000): CHECK de pessoas_acessos_sensiveis.campo,
--    reproduzindo antes o defeito na nike. Esta migration B recusa aplicar sem
--    ela (guarda G6).
-- 3. Correr o teste (BEGIN; A; B; teste; ROLLBACK) contra o remoto ANTES do
--    push, so com autorizacao para escritas revertidas na nike.
-- 4. Listar o pendente imediatamente antes; db push --linked.
-- 5. Codigo no mesmo envio para o main; abrir o calendario da pessoa (mes) e a
--    fila do RH na nike: enviar, recarregar, aceitar paga, recarregar, recusar,
--    "Ver texto" e ver o registo.
-- Nada disto toca na Mudelar (base RH).
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP TRIGGER trg_pessoas_faltas_justificacao_dia_sem_efeito ON public.pessoas_faltas;
--   DROP FUNCTION public.hr_justificacao_dia_falta_sem_efeito();
--   DROP FUNCTION public.rpc_hr_justificacao_dia_acessos(uuid);
--   DROP FUNCTION public.rpc_hr_justificacao_dia_ver_texto(uuid);
--   DROP FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean);
--   DROP FUNCTION public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean);
--   DROP FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]);
--   DROP TABLE public.pessoas_justificacoes_dia;
--   DROP FUNCTION public.hr_justificacao_dia_anexos_validos(text[]);
--   DROP FUNCTION public.hr_justificacao_dia_prazo(date);
-- (As faltas que a aceitacao criou ficam: sao faltas normais.)
--
-- Prerequisitos:
--   20261207004100  pessoas_faltas e rpc_hr_falta_marcar
--   20261207004200  pessoas_faltas_justificacoes e as RPCs de justificacao
--   20261207020400  hr_periodos_processamento
--   20261231790000  'justificacao_dia' no CHECK de pessoas_acessos_sensiveis
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_def     text;
  v_valores text[];
  v_cod     text;
BEGIN
  -- G1. A tabela nao existe: esta migration cria-a de raiz. Se ja existir, foi
  --     criada por outro caminho e ha que ler o que la esta antes de continuar.
  IF to_regclass('public.pessoas_justificacoes_dia') IS NOT NULL THEN
    RAISE EXCEPTION 'G1: public.pessoas_justificacoes_dia ja existe. Ler o que la esta antes de aplicar.';
  END IF;

  -- G2. As ancoras das FKs compostas.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas')
                    AND conname = 'pessoas_id_org_key') THEN
    RAISE EXCEPTION 'G2: a unique pessoas_id_org_key nao existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = to_regclass('public.pessoas_faltas')
                    AND conname = 'pessoas_faltas_id_pessoa_org_key'
                    AND cardinality(conkey) = 3) THEN
    RAISE EXCEPTION 'G2: a unique (id, pessoa_id, organization_id) de pessoas_faltas nao existe.';
  END IF;
  IF to_regclass('public.pessoas_faltas_justificacoes') IS NULL THEN
    RAISE EXCEPTION 'G2: pessoas_faltas_justificacoes nao existe. Aplicar 20261207004200.';
  END IF;

  -- G3. As RPCs de faltas que a aceitacao chama, com a assinatura E o corpo
  --     lidos no remoto a 27/10. O desenho assenta no comportamento delas
  --     (decidir NAO verifica se a justificacao ja foi decidida; registar passa
  --     sem_justificacao a pendente_documento). Se o corpo mudou, reler antes.
  IF to_regprocedure('public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean)') IS NULL
     OR to_regprocedure('public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint)') IS NULL
     OR to_regprocedure('public.rpc_hr_falta_decidir_justificacao(uuid, text, text)') IS NULL
     OR to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'G3: falta uma das RPCs de faltas (ou hr_registar_acesso_sensivel) com a assinatura esperada.';
  END IF;

  IF (SELECT md5(p.prosrc) FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.rpc_hr_falta_marcar(uuid, uuid, date, time, time, text, uuid, boolean, boolean)')::oid)
       IS DISTINCT FROM '4d95d5abc92d09ec0f95582fe147e0d6'
  OR (SELECT md5(p.prosrc) FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.rpc_hr_falta_registar_justificacao(uuid, text, text, text, text, date, smallint)')::oid)
       IS DISTINCT FROM '3185851d8b52a1fd29620ab81fc5818e'
  OR (SELECT md5(p.prosrc) FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.rpc_hr_falta_decidir_justificacao(uuid, text, text)')::oid)
       IS DISTINCT FROM 'fc84fb7f4da53f6a8adde2480043a58c'
  OR (SELECT md5(p.prosrc) FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.hr_registar_acesso_sensivel(uuid, uuid, text, text)')::oid)
       IS DISTINCT FROM '9452cfdadae1c51b80f98594706b94bf' THEN
    RAISE EXCEPTION
      'G3: o corpo de uma das RPCs de faltas (ou de hr_registar_acesso_sensivel) mudou desde 27/10. Reler a versao actual e confirmar o desenho antes de aplicar.';
  END IF;

  -- G4. Os codigos de permissao, todos existentes; justificacao.view perigosa.
  FOREACH v_cod IN ARRAY ARRAY['hr.assiduidade.picar', 'hr.assiduidade.view.own',
                               'hr.assiduidade.justificacao.edit', 'hr.assiduidade.justificacao.view',
                               'hr.assiduidade.faltas.edit']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code = v_cod) THEN
      RAISE EXCEPTION 'G4: o codigo % nao esta no catalogo.', v_cod;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions ap
                  WHERE ap.code = 'hr.assiduidade.justificacao.view' AND ap.is_dangerous = true) THEN
    RAISE EXCEPTION 'G4: hr.assiduidade.justificacao.view nao esta marcada is_dangerous. Revela dados de saude.';
  END IF;

  -- G5. O fecho do mes: os valores de estado que esta migration le.
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.hr_periodos_processamento')
     AND c.conname = 'hr_periodos_processamento_estado_valido';
  IF v_def IS NULL OR v_def NOT LIKE '%''fechado''%' THEN
    RAISE EXCEPTION 'G5: hr_periodos_processamento.estado nao tem o valor ''fechado'' (definicao: %).', coalesce(v_def, 'ausente');
  END IF;

  -- G6. A migration A (20261231790000) esta aplicada: o CHECK aceita
  --     'justificacao_dia'. Conjunto extraido, nao LIKE.
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname = 'pessoas_acessos_sensiveis_campo_valido';
  SELECT coalesce(array_agg(m[1]), '{}'::text[]) INTO v_valores
    FROM regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''::text', 'g') AS m;
  IF NOT ('justificacao_dia' = ANY (v_valores)) THEN
    RAISE EXCEPTION
      'G6: o CHECK de pessoas_acessos_sensiveis.campo nao aceita ''justificacao_dia''. Aplicar 20261231790000 primeiro: sem isso "Ver texto" falha sempre.';
  END IF;

  -- G7. Os valores de pessoas_faltas em que esta migration se apoia.
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_faltas')
     AND c.conname = 'pessoas_faltas_estado_valido';
  IF v_def IS NULL OR v_def NOT LIKE '%''activa''%' OR v_def NOT LIKE '%''anulada''%' OR v_def NOT LIKE '%''corrigida''%' THEN
    RAISE EXCEPTION 'G7: pessoas_faltas.estado ja nao e activa/corrigida/anulada (definicao: %).', coalesce(v_def, 'ausente');
  END IF;
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_faltas')
     AND c.conname = 'pessoas_faltas_motivo_codigo_valido';
  IF v_def IS NULL OR v_def NOT LIKE '%''doenca''%' OR v_def NOT LIKE '%''assuntos_pessoais''%'
     OR v_def NOT LIKE '%''atraso''%' OR v_def NOT LIKE '%''outro''%' THEN
    RAISE EXCEPTION 'G7: pessoas_faltas.motivo_codigo ja nao aceita os codigos do mapa da aceitacao (definicao: %).', coalesce(v_def, 'ausente');
  END IF;
END;
$guardas$;


-- ---- Funcoes auxiliares (antes da tabela: o CHECK usa uma delas) -----------

-- O prazo: 5 dias uteis (segunda a sexta, sem feriados) depois do dia. A mesma
-- regra de somarDiasUteis(data, 5) do ecra. Aritmetica de date + integer, por
-- isso e de facto IMMUTABLE (nao depende do fuso da sessao).
CREATE OR REPLACE FUNCTION public.hr_justificacao_dia_prazo(_data date)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT _data + g.i
    FROM generate_series(1, 14) AS g(i)
   WHERE extract(isodow FROM (_data + g.i)) < 6
   ORDER BY g.i
  OFFSET 4   -- o 5.o dia util
   LIMIT 1
$$;

COMMENT ON FUNCTION public.hr_justificacao_dia_prazo(date) IS
'Ultimo dia para a pessoa justificar o dia _data: 5 dias uteis depois (seg-sex, sem feriados), a mesma regra de somarDiasUteis(data, 5) do ecra. Constante na base: tornar configuravel por organizacao e decisao por tomar.';

CREATE OR REPLACE FUNCTION public.hr_justificacao_dia_anexos_validos(_nomes text[])
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT _nomes IS NOT NULL
     AND (array_ndims(_nomes) IS NULL OR array_ndims(_nomes) = 1)
     AND cardinality(_nomes) <= 4
     AND NOT EXISTS (
       SELECT 1 FROM unnest(_nomes) AS n(nome)
        WHERE n.nome IS NULL OR btrim(n.nome) = '' OR char_length(n.nome) > 255
     )
$$;

COMMENT ON FUNCTION public.hr_justificacao_dia_anexos_validos(text[]) IS
'Os nomes dos anexos de uma justificacao do dia: no maximo 4, nenhum vazio nem com mais de 255 caracteres. So nomes: nada e enviado enquanto o bucket estiver fechado ao cliente.';

REVOKE ALL ON FUNCTION public.hr_justificacao_dia_prazo(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_justificacao_dia_prazo(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_prazo(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_prazo(date) TO service_role;

REVOKE ALL ON FUNCTION public.hr_justificacao_dia_anexos_validos(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_justificacao_dia_anexos_validos(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_anexos_validos(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hr_justificacao_dia_anexos_validos(text[]) TO service_role;


-- ---- A tabela --------------------------------------------------------------
CREATE TABLE public.pessoas_justificacoes_dia (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL,
  pessoa_id               uuid NOT NULL,

  data                    date NOT NULL,
  tipo                    text NOT NULL,
  de_atraso               boolean NOT NULL,
  periodo_inicio          time NOT NULL,
  periodo_fim             time NOT NULL,
  -- Copia literal da expressao de pessoas_faltas.minutos: uma so fonte.
  minutos                 integer GENERATED ALWAYS AS
                            ((EXTRACT(epoch FROM (periodo_fim - periodo_inicio)) / 60)::integer) STORED,
  hora_real               time,

  -- O texto da pessoa. SEM GRANT de leitura: sai so pelas RPCs.
  motivo                  text NOT NULL,
  anexos_nomes            text[] NOT NULL DEFAULT '{}'::text[],

  estado                  text NOT NULL DEFAULT 'pendente',
  decidida_por            uuid,
  decidida_em             timestamptz,
  motivo_recusa           text,
  falta_id                uuid,
  mes_fechado_na_decisao  boolean NOT NULL DEFAULT false,
  sem_efeito_em           timestamptz,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid,
  updated_by              uuid,
  -- SEM deleted_at: append-only.

  CONSTRAINT pessoas_justificacoes_dia_pkey PRIMARY KEY (id),
  CONSTRAINT pessoas_justificacoes_dia_id_org_key UNIQUE (id, organization_id),
  CONSTRAINT pessoas_justificacoes_dia_id_pessoa_org_key UNIQUE (id, pessoa_id, organization_id),

  CONSTRAINT pessoas_justificacoes_dia_pessoa_fkey
    FOREIGN KEY (pessoa_id, organization_id)
    REFERENCES public.pessoas (id, organization_id) ON DELETE CASCADE,

  -- NO ACTION (e nao RESTRICT): ao apagar a pessoa, as faltas e estas linhas
  -- caem na mesma instrucao em cascata, e NO ACTION so verifica no fim dela.
  CONSTRAINT pessoas_justificacoes_dia_falta_fkey
    FOREIGN KEY (falta_id, pessoa_id, organization_id)
    REFERENCES public.pessoas_faltas (id, pessoa_id, organization_id) ON DELETE NO ACTION,

  CONSTRAINT pessoas_justificacoes_dia_decidida_por_fkey
    FOREIGN KEY (decidida_por) REFERENCES public.anew_users (id) ON DELETE NO ACTION,
  CONSTRAINT pessoas_justificacoes_dia_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT pessoas_justificacoes_dia_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT pessoas_justificacoes_dia_tipo_valido
    CHECK (tipo IN ('consulta_medica','transporte','assunto_pessoal','outro')),

  -- A mesma regra da meia-noite de pessoas_faltas: duas linhas, em duas datas.
  CONSTRAINT pessoas_justificacoes_dia_fim_depois_inicio
    CHECK (periodo_fim > periodo_inicio),

  CONSTRAINT pessoas_justificacoes_dia_motivo_valido
    CHECK (char_length(btrim(motivo)) >= 3 AND char_length(motivo) <= 4000),

  CONSTRAINT pessoas_justificacoes_dia_anexos_validos
    CHECK (public.hr_justificacao_dia_anexos_validos(anexos_nomes)),

  CONSTRAINT pessoas_justificacoes_dia_estado_valido
    CHECK (estado IN ('pendente','aceite_paga','aceite_nao_paga','recusada','sem_efeito')),

  -- Pendente: nada decidido.
  CONSTRAINT pessoas_justificacoes_dia_pendente_coerente
    CHECK (estado <> 'pendente'
           OR (decidida_por IS NULL AND decidida_em IS NULL AND motivo_recusa IS NULL
               AND falta_id IS NULL AND sem_efeito_em IS NULL)),

  -- Uma decisao sem autor e sem data nao e uma decisao.
  CONSTRAINT pessoas_justificacoes_dia_decisao_coerente
    CHECK (estado = 'pendente' OR (decidida_por IS NOT NULL AND decidida_em IS NOT NULL)),

  -- Recusada: com motivo escrito e sem falta. So a recusada tem motivo de recusa.
  CONSTRAINT pessoas_justificacoes_dia_recusa_coerente
    CHECK (
      (estado = 'recusada' AND motivo_recusa IS NOT NULL AND char_length(btrim(motivo_recusa)) >= 3
       AND falta_id IS NULL)
      OR (estado <> 'recusada' AND motivo_recusa IS NULL)
    ),

  -- Aceite (e a aceite que ficou sem efeito): aponta para a falta que criou.
  CONSTRAINT pessoas_justificacoes_dia_aceite_coerente
    CHECK (estado NOT IN ('aceite_paga','aceite_nao_paga','sem_efeito') OR falta_id IS NOT NULL),

  CONSTRAINT pessoas_justificacoes_dia_sem_efeito_coerente
    CHECK ((estado = 'sem_efeito') = (sem_efeito_em IS NOT NULL))
);

-- Uma activa (pendente ou aceite) por pessoa, dia e hora de inicio. Recusada e
-- sem_efeito nao impedem o reenvio. O nome e lido pela RPC de registar.
CREATE UNIQUE INDEX uq_pessoas_justificacoes_dia_activa
  ON public.pessoas_justificacoes_dia (pessoa_id, data, periodo_inicio)
  WHERE estado IN ('pendente','aceite_paga','aceite_nao_paga');

-- A fila do RH e o contador do separador.
CREATE INDEX idx_pessoas_justificacoes_dia_fila
  ON public.pessoas_justificacoes_dia (organization_id, created_at)
  WHERE estado = 'pendente';

-- O calendario da pessoa (mes).
CREATE INDEX idx_pessoas_justificacoes_dia_pessoa_data
  ON public.pessoas_justificacoes_dia (pessoa_id, data DESC);

-- Listagens por intervalo de toda a organizacao.
CREATE INDEX idx_pessoas_justificacoes_dia_org_data
  ON public.pessoas_justificacoes_dia (organization_id, data);

-- Da falta a justificacao que a originou (e o gatilho de sem_efeito).
CREATE INDEX idx_pessoas_justificacoes_dia_falta
  ON public.pessoas_justificacoes_dia (falta_id) WHERE falta_id IS NOT NULL;

COMMENT ON TABLE public.pessoas_justificacoes_dia IS
'A justificacao do DIA: a pessoa justifica um atraso ou uma falta SUGERIDA antes de existir falta marcada, e o RH aceita (paga / nao paga) ou recusa com motivo. Uma linha = um envio; append-only, sem deleted_at; reenviar depois de recusada e uma linha nova.

Aceitar cria (ou reaproveita) a falta pelas RPCs de faltas, na mesma transaccao (rpc_hr_justificacao_dia_decidir), e guarda falta_id. Se essa falta for anulada ou corrigida, a linha passa a sem_efeito (gatilho em pessoas_faltas) e o periodo fica livre.

O motivo (texto da pessoa) NAO tem GRANT de leitura: sai so por rpc_hr_justificacao_dia_listar (a propria pessoa; o RH quando nao e consulta medica) e por rpc_hr_justificacao_dia_ver_texto (hr.assiduidade.justificacao.view, com registo em pessoas_acessos_sensiveis). A chefia nao le esta tabela.';

COMMENT ON COLUMN public.pessoas_justificacoes_dia.motivo IS
'O texto da pessoa. Pode ser dado de saude (consulta_medica). Sem GRANT de leitura a authenticated: le-se so pelas RPCs. Ao aceitar uma consulta medica, a falta recebe um texto neutro e NAO este.';

COMMENT ON COLUMN public.pessoas_justificacoes_dia.mes_fechado_na_decisao IS
'Fotografia de hr_periodos_processamento no momento da decisao: o mes ja estava fechado. Aceitar nesse caso exigiu confirmacao explicita (_confirmar_mes_fechado).';

COMMENT ON COLUMN public.pessoas_justificacoes_dia.sem_efeito_em IS
'Quando a falta criada pela aceitacao foi anulada ou corrigida. A linha passa a sem_efeito e deixa de bloquear um novo envio para o mesmo periodo.';

-- ---- Triggers de padrao ----------------------------------------------------
CREATE TRIGGER trg_pessoas_justificacoes_dia_updated_at
  BEFORE UPDATE ON public.pessoas_justificacoes_dia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_pessoas_justificacoes_dia_ancora
  BEFORE UPDATE ON public.pessoas_justificacoes_dia
  FOR EACH ROW EXECUTE FUNCTION public.hr_satelite_ancora_imutavel();

-- ---- Grants: SELECT por coluna, sem motivo ---------------------------------
-- NUNCA GRANT SELECT de tabela: cobriria motivo, e as colunas futuras.
REVOKE ALL ON TABLE public.pessoas_justificacoes_dia FROM PUBLIC;
REVOKE ALL ON TABLE public.pessoas_justificacoes_dia FROM anon;
REVOKE ALL ON TABLE public.pessoas_justificacoes_dia FROM authenticated;
GRANT SELECT (
  id, organization_id, pessoa_id, data, tipo, de_atraso, periodo_inicio, periodo_fim,
  minutos, hora_real, anexos_nomes, estado, decidida_por, decidida_em, motivo_recusa,
  falta_id, mes_fechado_na_decisao, sem_efeito_em, created_at, updated_at, created_by, updated_by
) ON public.pessoas_justificacoes_dia TO authenticated;
GRANT ALL ON TABLE public.pessoas_justificacoes_dia TO service_role;

-- ---- RLS: as quatro operacoes ----------------------------------------------
ALTER TABLE public.pessoas_justificacoes_dia ENABLE ROW LEVEL SECURITY;

CREATE POLICY pessoas_justificacoes_dia_select ON public.pessoas_justificacoes_dia
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.justificacao.edit', organization_id))
    OR (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.justificacao.view', organization_id))
    OR (
      (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.assiduidade.view.own', organization_id))
      AND pessoa_id = (SELECT public.hr_pessoa_do_utilizador((SELECT auth.uid()), organization_id))
    )
  );

CREATE POLICY pessoas_justificacoes_dia_block_insert ON public.pessoas_justificacoes_dia
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY pessoas_justificacoes_dia_block_update ON public.pessoas_justificacoes_dia
  AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY pessoas_justificacoes_dia_block_delete ON public.pessoas_justificacoes_dia
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY pessoas_justificacoes_dia_select ON public.pessoas_justificacoes_dia IS
'Quem decide (hr.assiduidade.justificacao.edit), quem le justificacoes (hr.assiduidade.justificacao.view) e a propria pessoa (hr.assiduidade.view.own). Sem ramo de chefia: a chefia ve a falta quando existir, nao o pedido. O motivo nao se le por aqui nem com permissao: a coluna nao tem GRANT. Ambito do RH: a organizacao inteira, o mesmo predicado de pessoas_faltas_justificacoes_select (nao existe funcao de ambito do RH na base); restringir e decisao por tomar.';

COMMENT ON POLICY pessoas_justificacoes_dia_block_insert ON public.pessoas_justificacoes_dia IS
'Escrita fechada. Registar valida prazo, falta existente e unicidade; decidir cria a falta na mesma transaccao. Nada disso cabe num WITH CHECK: so pelas RPCs SECURITY DEFINER.';


-- ==============================================================================
-- As RPCs
-- ==============================================================================

-- ---- 1. Registar -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_justificacao_dia_registar(
  _organization_id uuid,
  _pessoa_id uuid,
  _data date,
  _tipo text,
  _de_atraso boolean,
  _periodo_inicio time,
  _periodo_fim time,
  _motivo text,
  _hora_real time DEFAULT NULL,
  _anexos_nomes text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth       uuid := auth.uid();
  v_anew       uuid;
  v_rh         boolean;
  v_eu         uuid;
  v_hoje       date := (now() AT TIME ZONE 'Europe/Lisbon')::date;
  v_anexos     text[] := coalesce(_anexos_nomes, '{}'::text[]);
  v_conflito   record;
  v_id         uuid;
  v_constraint text;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _organization_id IS NULL OR _pessoa_id IS NULL OR _data IS NULL OR _tipo IS NULL
     OR _de_atraso IS NULL OR _periodo_inicio IS NULL OR _periodo_fim IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_dados_em_falta: organizacao, pessoa, dia, tipo, atraso e periodo sao obrigatorios.'
      USING ERRCODE = '23502';
  END IF;

  -- Quem: o RH (em nome da pessoa) ou a propria pessoa, com picar.
  v_rh := public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', _organization_id);
  v_eu := public.hr_pessoa_do_utilizador(v_auth, _organization_id);
  -- Sobre a propria ficha, quem e do RH e so a pessoa: sem registar fora do
  -- prazo nem sem picar. O bloqueio de decidir a propria esta em _decidir.
  IF v_rh AND v_eu IS NOT NULL AND v_eu = _pessoa_id THEN
    v_rh := false;
  END IF;
  IF NOT v_rh THEN
    IF NOT (public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.picar', _organization_id)
            AND _pessoa_id IS NOT DISTINCT FROM v_eu) THEN
      RAISE EXCEPTION
        'justificacao_dia_sem_permissao: so a propria pessoa (hr.assiduidade.picar) ou o RH (hr.assiduidade.justificacao.edit) registam uma justificacao do dia.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas p
     WHERE p.id = _pessoa_id AND p.organization_id = _organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'justificacao_dia_pessoa_invalida: a pessoa nao existe nesta organizacao.' USING ERRCODE = '23503';
  END IF;

  IF _tipo NOT IN ('consulta_medica','transporte','assunto_pessoal','outro') THEN
    RAISE EXCEPTION 'justificacao_dia_tipo_invalido: tipo "%" nao existe.', _tipo USING ERRCODE = '23514';
  END IF;

  IF _periodo_fim <= _periodo_inicio THEN
    RAISE EXCEPTION
      'justificacao_dia_periodo_invalido: o fim tem de ser depois do inicio. Um periodo que atravesse a meia-noite sao duas justificacoes, em dois dias.'
      USING ERRCODE = '23514';
  END IF;

  IF char_length(btrim(coalesce(_motivo, ''))) < 3 OR char_length(_motivo) > 4000 THEN
    RAISE EXCEPTION 'justificacao_dia_motivo_invalido: o motivo tem de ter entre 3 e 4000 caracteres.' USING ERRCODE = '23514';
  END IF;

  IF NOT public.hr_justificacao_dia_anexos_validos(v_anexos) THEN
    RAISE EXCEPTION 'justificacao_dia_anexos_invalidos: no maximo 4 anexos, cada nome com 1 a 255 caracteres.' USING ERRCODE = '23514';
  END IF;

  IF _data > v_hoje THEN
    RAISE EXCEPTION 'justificacao_dia_data_futura: nao se justifica um dia que ainda nao aconteceu (%).', _data USING ERRCODE = '23514';
  END IF;

  -- O prazo e da PESSOA. O RH pode registar em nome dela depois do prazo.
  IF NOT v_rh AND v_hoje > public.hr_justificacao_dia_prazo(_data) THEN
    RAISE EXCEPTION
      'justificacao_dia_fora_do_prazo: o prazo para justificar % acabou a %.', _data, public.hr_justificacao_dia_prazo(_data)
      USING ERRCODE = '23514';
  END IF;

  -- Se ja ha falta marcada a cruzar o periodo, justifica-se pela falta.
  -- Comparacao SEMI-ABERTA, a de hr_faltas_sem_sobreposicao.
  SELECT f.id, f.hora_inicio, f.hora_fim INTO v_conflito
    FROM public.pessoas_faltas f
   WHERE f.pessoa_id = _pessoa_id
     AND f.organization_id = _organization_id
     AND f.data = _data
     AND f.estado = 'activa'
     AND _periodo_inicio < f.hora_fim
     AND f.hora_inicio < _periodo_fim
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'justificacao_dia_ja_ha_falta: ja ha uma falta marcada de % a % neste dia; a justificacao faz-se pela falta.',
      v_conflito.hora_inicio, v_conflito.hora_fim
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  BEGIN
    INSERT INTO public.pessoas_justificacoes_dia (
      organization_id, pessoa_id, data, tipo, de_atraso,
      periodo_inicio, periodo_fim, hora_real, motivo, anexos_nomes,
      created_by, updated_by
    ) VALUES (
      _organization_id, _pessoa_id, _data, _tipo, _de_atraso,
      _periodo_inicio, _periodo_fim, _hora_real, btrim(_motivo), v_anexos,
      v_anew, v_anew
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_pessoas_justificacoes_dia_activa' THEN
      RAISE EXCEPTION
        'justificacao_dia_ja_enviada: ja ha uma justificacao pendente ou aceite para este dia e esta hora.'
        USING ERRCODE = '23505';
    END IF;
    RAISE;
  END;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[]) IS
'Regista uma justificacao do dia. A propria pessoa com hr.assiduidade.picar, dentro do prazo de 5 dias uteis; o RH (hr.assiduidade.justificacao.edit) em nome de OUTRA pessoa, tambem fora do prazo (sobre a propria ficha, o RH e so a pessoa). Recusa dia futuro, periodo ja coberto por falta activa (justifica-se pela falta) e segunda justificacao activa para o mesmo dia e hora (justificacao_dia_ja_enviada).';


-- ---- 2. Listar -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_justificacao_dia_listar(
  _organization_id uuid,
  _pessoa_id uuid DEFAULT NULL,
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL,
  _so_pendentes boolean DEFAULT false
)
RETURNS TABLE (
  id                     uuid,
  pessoa_id              uuid,
  pessoa_nome            text,
  data                   date,
  tipo                   text,
  de_atraso              boolean,
  periodo_inicio         time,
  periodo_fim            time,
  minutos                integer,
  hora_real              time,
  motivo                 text,
  texto_sensivel         boolean,
  anexos_nomes           text[],
  estado                 text,
  enviada_em             timestamptz,
  decidida_por           uuid,
  decidida_por_nome      text,
  decidida_em            timestamptz,
  motivo_recusa          text,
  falta_id               uuid,
  mes_fechado_na_decisao boolean,
  sem_efeito_em          timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_auth   uuid := auth.uid();
  v_rh     boolean;
  v_minha  uuid;
  v_pessoa uuid := _pessoa_id;
  v_pend   boolean := coalesce(_so_pendentes, false);
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_dados_em_falta: a organizacao e obrigatoria.' USING ERRCODE = '23502';
  END IF;

  v_rh := public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', _organization_id)
       OR public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.view', _organization_id);
  v_minha := public.hr_pessoa_do_utilizador(v_auth, _organization_id);

  -- Sem permissao de RH: so as da propria pessoa.
  IF NOT v_rh THEN
    IF v_minha IS NULL
       OR NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.view.own', _organization_id) THEN
      RAISE EXCEPTION 'justificacao_dia_sem_permissao: sem permissao para ver justificacoes do dia nesta organizacao.'
        USING ERRCODE = '42501';
    END IF;
    IF v_pessoa IS NOT NULL AND v_pessoa <> v_minha THEN
      RAISE EXCEPTION 'justificacao_dia_sem_permissao: so pode ver as suas justificacoes.' USING ERRCODE = '42501';
    END IF;
    v_pessoa := v_minha;
  END IF;

  IF _de IS NOT NULL AND _ate IS NOT NULL AND _ate < _de THEN
    RAISE EXCEPTION 'justificacao_dia_intervalo_invalido: o fim do intervalo e anterior ao inicio.' USING ERRCODE = '22023';
  END IF;

  -- Nada de varrer a organizacao inteira: a fila (so pendentes), uma pessoa,
  -- ou um intervalo de ate um ano.
  IF v_pessoa IS NULL AND NOT v_pend
     AND (_de IS NULL OR _ate IS NULL OR _ate - _de > 366) THEN
    RAISE EXCEPTION
      'justificacao_dia_intervalo_obrigatorio: para toda a organizacao, pedir so pendentes ou um intervalo de ate 366 dias.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT j.id,
         j.pessoa_id,
         p.nome_completo,
         j.data,
         j.tipo,
         j.de_atraso,
         j.periodo_inicio,
         j.periodo_fim,
         j.minutos,
         j.hora_real,
         CASE WHEN j.tipo <> 'consulta_medica' OR j.pessoa_id = v_minha THEN j.motivo END,
         (j.tipo = 'consulta_medica' AND j.pessoa_id IS DISTINCT FROM v_minha),
         j.anexos_nomes,
         j.estado,
         j.created_at,
         j.decidida_por,
         u.name,
         j.decidida_em,
         j.motivo_recusa,
         j.falta_id,
         j.mes_fechado_na_decisao,
         j.sem_efeito_em
    FROM public.pessoas_justificacoes_dia j
    JOIN public.pessoas p
      ON p.id = j.pessoa_id AND p.organization_id = j.organization_id
    LEFT JOIN public.anew_users u
      ON u.id = j.decidida_por
   WHERE j.organization_id = _organization_id
     AND (v_pessoa IS NULL OR j.pessoa_id = v_pessoa)
     AND (_de IS NULL OR j.data >= _de)
     AND (_ate IS NULL OR j.data <= _ate)
     AND (NOT v_pend OR j.estado = 'pendente')
   ORDER BY j.data DESC, j.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean) IS
'Lista justificacoes do dia. RH (justificacao.edit ou .view): a organizacao, por pessoa, intervalo ou so pendentes. Sem permissao de RH: so as da propria pessoa (hr.assiduidade.view.own). O motivo vem NULL com texto_sensivel = true quando e consulta medica e quem pede nao e a propria pessoa: le-se com rpc_hr_justificacao_dia_ver_texto, que regista o acesso.';


-- ---- 3. Decidir ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_justificacao_dia_decidir(
  _justificacao_id uuid,
  _decisao text,
  _motivo text DEFAULT NULL,
  _confirmar_mes_fechado boolean DEFAULT false
)
RETURNS TABLE (falta_id uuid, mes_fechado boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  -- O que fica escrito na justificacao da FALTA quando o motivo e de saude: a
  -- tabela da falta le-se sem rasto, por isso o texto da pessoa nao vai para la.
  k_texto_neutro constant text :=
    'Consulta medica declarada pela pessoa na justificacao do dia. O texto le-se na justificacao do dia, com registo de acesso.';
  v_auth        uuid := auth.uid();
  v_anew        uuid;
  v_eu          uuid;
  v_j           public.pessoas_justificacoes_dia;
  v_f           public.pessoas_faltas;
  v_conflito    record;
  v_mes_fechado boolean;
  v_remunerada  boolean;
  v_motivo_cod  text;
  v_falta       uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _decisao IS NULL OR _decisao NOT IN ('aceitar_paga','aceitar_nao_paga','recusar') THEN
    RAISE EXCEPTION
      'justificacao_dia_decisao_invalida: a decisao e aceitar_paga, aceitar_nao_paga ou recusar (recebido "%").', _decisao
      USING ERRCODE = '23514';
  END IF;

  -- FOR UPDATE: duas pessoas do RH a carregar ao mesmo tempo nao criam duas faltas.
  SELECT j.* INTO v_j
    FROM public.pessoas_justificacoes_dia j
   WHERE j.id = _justificacao_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'justificacao_dia_inexistente: a justificacao % nao existe.', _justificacao_id USING ERRCODE = '23503';
  END IF;

  -- Ninguem decide a sua propria justificacao, mesmo tendo a permissao: aceitar
  -- tornava a falta justificada (e paga) por decisao do proprio. Em aceitar E em
  -- recusar. Antes da verificacao de permissao de proposito (o padrao de
  -- rpc_hr_ausencia_cancelar): a mensagem diz "e a sua", que e o verdadeiro.
  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_j.organization_id);
  IF v_eu IS NOT NULL AND v_eu = v_j.pessoa_id THEN
    RAISE EXCEPTION
      'justificacao_dia_propria_decisao: nao pode decidir uma justificacao sua, mesmo tendo hr.assiduidade.justificacao.edit. Outra pessoa do RH decide-a.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.edit', v_j.organization_id) THEN
    RAISE EXCEPTION
      'justificacao_dia_sem_permissao: decidir uma justificacao do dia exige hr.assiduidade.justificacao.edit nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;
  IF _decisao <> 'recusar'
     AND NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.faltas.edit', v_j.organization_id) THEN
    RAISE EXCEPTION
      'justificacao_dia_sem_permissao: aceitar cria uma falta e exige tambem hr.assiduidade.faltas.edit.'
      USING ERRCODE = '42501';
  END IF;

  IF v_j.estado <> 'pendente' THEN
    RAISE EXCEPTION 'justificacao_dia_ja_decidida: a justificacao % ja esta "%".', v_j.id, v_j.estado USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  IF v_anew IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_utilizador: a sessao nao corresponde a nenhum utilizador.' USING ERRCODE = '42501';
  END IF;

  v_mes_fechado := EXISTS (
    SELECT 1 FROM public.hr_periodos_processamento pp
     WHERE pp.organization_id = v_j.organization_id
       AND pp.ano = extract(year FROM v_j.data)::int
       AND pp.mes = extract(month FROM v_j.data)::int
       AND pp.estado = 'fechado'
  );

  -- ---- Recusar: nao mexe em faltas -----------------------------------------
  IF _decisao = 'recusar' THEN
    IF char_length(btrim(coalesce(_motivo, ''))) < 3 THEN
      RAISE EXCEPTION
        'justificacao_dia_recusa_sem_motivo: recusar exige motivo escrito (pelo menos 3 caracteres). Uma recusa sem razao e o que gera a disputa.'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.pessoas_justificacoes_dia j
       SET estado = 'recusada',
           decidida_por = v_anew,
           decidida_em = now(),
           motivo_recusa = btrim(_motivo),
           mes_fechado_na_decisao = v_mes_fechado,
           updated_by = v_anew
     WHERE j.id = v_j.id;

    RETURN QUERY SELECT NULL::uuid, v_mes_fechado;
    RETURN;
  END IF;

  -- ---- Aceitar -------------------------------------------------------------
  -- Mes fechado: so com confirmacao explicita, e ANTES de escrever o que quer que seja.
  IF v_mes_fechado AND NOT coalesce(_confirmar_mes_fechado, false) THEN
    RAISE EXCEPTION
      'justificacao_dia_mes_fechado: o processamento de %/% ja esta fechado e os recibos congelados. Confirmar para aceitar na mesma.',
      extract(month FROM v_j.data)::int, extract(year FROM v_j.data)::int
      USING ERRCODE = '55000';
  END IF;

  v_remunerada := (_decisao = 'aceitar_paga');

  -- A falta activa do mesmo dia e hora de inicio (um recarregar, ou o RH que a
  -- marcou a mao entretanto). As 'corrigida' estao fora de circulacao.
  SELECT f.* INTO v_f
    FROM public.pessoas_faltas f
   WHERE f.pessoa_id = v_j.pessoa_id
     AND f.organization_id = v_j.organization_id
     AND f.data = v_j.data
     AND f.estado = 'activa'
     AND f.hora_inicio = v_j.periodo_inicio
   LIMIT 1
     FOR UPDATE;

  IF FOUND THEN
    IF v_f.hora_fim IS DISTINCT FROM v_j.periodo_fim OR v_f.remunerada IS DISTINCT FROM v_remunerada THEN
      RAISE EXCEPTION
        'justificacao_dia_falta_divergente: ja ha uma falta de % a % (remunerada: %) e a decisao pede % a % (remunerada: %). Corrigir a falta ou decidir em conformidade.',
        v_f.hora_inicio, v_f.hora_fim, v_f.remunerada, v_j.periodo_inicio, v_j.periodo_fim, v_remunerada
        USING ERRCODE = '23514';
    END IF;
    -- rpc_hr_falta_decidir_justificacao nao o verifica: sem isto, aceitar
    -- reescrevia em silencio uma recusa (ou aceitacao) anterior da falta.
    IF v_f.justificacao_estado NOT IN ('sem_justificacao','pendente_documento') THEN
      RAISE EXCEPTION
        'justificacao_dia_falta_ja_decidida: a falta deste periodo ja tem a justificacao "%"; decidir pela falta.',
        v_f.justificacao_estado
        USING ERRCODE = '23514';
    END IF;
    v_falta := v_f.id;
  ELSE
    -- Uma falta activa que cruza o periodo sem comecar a mesma hora: o trigger
    -- de sobreposicao recusaria a nova; diz-se aqui, com as horas.
    SELECT f.id, f.hora_inicio, f.hora_fim INTO v_conflito
      FROM public.pessoas_faltas f
     WHERE f.pessoa_id = v_j.pessoa_id
       AND f.organization_id = v_j.organization_id
       AND f.data = v_j.data
       AND f.estado = 'activa'
       AND v_j.periodo_inicio < f.hora_fim
       AND f.hora_inicio < v_j.periodo_fim
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION
        'justificacao_dia_falta_sobreposta: ja ha uma falta de % a % que cruza o periodo % a %. Corrigir ou anular essa falta primeiro.',
        v_conflito.hora_inicio, v_conflito.hora_fim, v_j.periodo_inicio, v_j.periodo_fim
        USING ERRCODE = '23514';
    END IF;

    -- O mapa de MOTIVO_DA_FALTA do ecra (lib/faltaDaAceitacao.ts).
    v_motivo_cod := CASE
      WHEN v_j.de_atraso THEN 'atraso'
      WHEN v_j.tipo = 'consulta_medica' THEN 'doenca'
      WHEN v_j.tipo = 'assunto_pessoal' THEN 'assuntos_pessoais'
      ELSE 'outro'
    END;

    -- A RPC existente, tal como esta: volta a verificar hr.assiduidade.faltas.edit
    -- com o auth.uid() de quem decide, e corre os triggers de coerencia.
    v_falta := public.rpc_hr_falta_marcar(
      v_j.organization_id, v_j.pessoa_id, v_j.data,
      v_j.periodo_inicio, v_j.periodo_fim, v_motivo_cod,
      NULL::uuid, v_remunerada, false
    );
  END IF;

  -- O papel da falta: so se ainda nao tiver uma justificacao em vigor.
  IF NOT EXISTS (
    SELECT 1 FROM public.pessoas_faltas_justificacoes fj
     WHERE fj.falta_id = v_falta AND fj.anulado_em IS NULL
  ) THEN
    PERFORM public.rpc_hr_falta_registar_justificacao(
      v_falta,
      'declaracao_propria',
      'justificacao-dia:' || v_j.id::text,
      CASE WHEN v_j.tipo = 'consulta_medica' THEN k_texto_neutro ELSE v_j.motivo END,
      NULL::text,
      (v_j.created_at AT TIME ZONE 'Europe/Lisbon')::date,
      NULL::smallint
    );
  END IF;

  PERFORM public.rpc_hr_falta_decidir_justificacao(v_falta, 'justificada', NULL::text);

  UPDATE public.pessoas_justificacoes_dia j
     SET estado = CASE WHEN v_remunerada THEN 'aceite_paga' ELSE 'aceite_nao_paga' END,
         decidida_por = v_anew,
         decidida_em = now(),
         falta_id = v_falta,
         mes_fechado_na_decisao = v_mes_fechado,
         updated_by = v_anew
   WHERE j.id = v_j.id;

  RETURN QUERY SELECT v_falta, v_mes_fechado;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean) IS
'Decide uma justificacao do dia pendente, numa so transaccao. Ninguem decide a sua propria (justificacao_dia_propria_decisao, 42501). Recusar exige motivo e nao mexe em faltas. Aceitar (paga / nao paga) exige tambem hr.assiduidade.faltas.edit e: reaproveita a falta activa do mesmo dia e hora de inicio (se coincidir em fim e remunerada, e se a justificacao dela ainda nao estiver decidida) ou marca-a com rpc_hr_falta_marcar; regista a declaracao (texto neutro se for consulta medica) e decide-a como justificada. Num mes fechado, aceitar exige _confirmar_mes_fechado = true (senao justificacao_dia_mes_fechado, 55000, sem escrever nada). Devolve falta_id e mes_fechado.';


-- ---- 4. Ver texto ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_justificacao_dia_ver_texto(_justificacao_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_j    public.pessoas_justificacoes_dia;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT j.* INTO v_j FROM public.pessoas_justificacoes_dia j WHERE j.id = _justificacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'justificacao_dia_inexistente: a justificacao % nao existe.', _justificacao_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.view', v_j.organization_id) THEN
    RAISE EXCEPTION
      'justificacao_dia_sem_permissao: ler o texto exige hr.assiduidade.justificacao.view nesta organizacao. Decidir a justificacao nao da acesso ao texto de saude.'
      USING ERRCODE = '42501';
  END IF;

  -- O rasto, ANTES de devolver.
  PERFORM public.hr_registar_acesso_sensivel(v_j.pessoa_id, v_j.organization_id, 'justificacao_dia', 'revelar');

  RETURN v_j.motivo;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_ver_texto(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_ver_texto(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_ver_texto(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_ver_texto(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_justificacao_dia_ver_texto(uuid) IS
'Revela o texto de uma justificacao do dia, exigindo hr.assiduidade.justificacao.view e registando a revelacao em pessoas_acessos_sensiveis (campo justificacao_dia) antes de devolver -- o padrao do NISS, do IBAN e do atestado da falta.';


-- ---- 5. Quem leu -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_hr_justificacao_dia_acessos(_justificacao_id uuid)
RETURNS TABLE (quem text, quando timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
#variable_conflict use_column
DECLARE
  v_auth uuid := auth.uid();
  v_j    public.pessoas_justificacoes_dia;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'justificacao_dia_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT j.* INTO v_j FROM public.pessoas_justificacoes_dia j WHERE j.id = _justificacao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'justificacao_dia_inexistente: a justificacao % nao existe.', _justificacao_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.assiduidade.justificacao.view', v_j.organization_id) THEN
    RAISE EXCEPTION 'justificacao_dia_sem_permissao: ver quem leu exige hr.assiduidade.justificacao.view.' USING ERRCODE = '42501';
  END IF;

  -- APROXIMADO: pessoas_acessos_sensiveis nao referencia o registo. Devolve as
  -- leituras 'justificacao_dia' desta pessoa desde que esta justificacao foi
  -- criada; se a pessoa tiver duas justificacoes medicas, uma leitura aparece
  -- nas duas. A versao exacta e decisao por tomar.
  RETURN QUERY
  SELECT coalesce(u.name, CASE WHEN a.origem = 'service_role' THEN 'Sistema' ELSE 'Utilizador removido' END),
         a.created_at
    FROM public.pessoas_acessos_sensiveis a
    LEFT JOIN public.anew_users u ON u.id = a.anew_user_id
   WHERE a.pessoa_id = v_j.pessoa_id
     AND a.organization_id = v_j.organization_id
     AND a.campo = 'justificacao_dia'
     AND a.accao = 'revelar'
     AND a.created_at >= v_j.created_at
   ORDER BY a.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_acessos(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_justificacao_dia_acessos(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_acessos(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_justificacao_dia_acessos(uuid) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_justificacao_dia_acessos(uuid) IS
'Quem leu o texto de uma justificacao do dia e quando. Exige hr.assiduidade.justificacao.view. APROXIMADO: devolve as leituras justificacao_dia da pessoa desde a criacao desta justificacao (a tabela de acessos nao referencia o registo).';


-- ==============================================================================
-- O gatilho em pessoas_faltas: falta anulada ou corrigida -> sem_efeito
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_justificacao_dia_falta_sem_efeito()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.pessoas_justificacoes_dia j
     SET estado = 'sem_efeito',
         sem_efeito_em = now(),
         updated_by = NEW.updated_by
   WHERE j.falta_id = NEW.id
     AND j.estado IN ('aceite_paga','aceite_nao_paga');
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_justificacao_dia_falta_sem_efeito() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_justificacao_dia_falta_sem_efeito() FROM anon;
REVOKE ALL ON FUNCTION public.hr_justificacao_dia_falta_sem_efeito() FROM authenticated;

COMMENT ON FUNCTION public.hr_justificacao_dia_falta_sem_efeito() IS
'Quando a falta criada pela aceitacao de uma justificacao do dia sai de circulacao (anulada, ou corrigida por outra), a justificacao passa a sem_efeito e o periodo fica livre para um novo envio. Sem isto, o indice uq_pessoas_justificacoes_dia_activa bloqueava esse dia para sempre. SECURITY DEFINER: escreve numa tabela com escrita fechada a authenticated.';

DROP TRIGGER IF EXISTS trg_pessoas_faltas_justificacao_dia_sem_efeito ON public.pessoas_faltas;
CREATE TRIGGER trg_pessoas_faltas_justificacao_dia_sem_efeito
  AFTER UPDATE OF estado ON public.pessoas_faltas
  FOR EACH ROW
  WHEN (OLD.estado = 'activa' AND NEW.estado IN ('anulada','corrigida'))
  EXECUTE FUNCTION public.hr_justificacao_dia_falta_sem_efeito();


-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  k_tab     constant text := 'public.pessoas_justificacoes_dia';
  v_rls     boolean;
  v_pol     integer;
  v_restr   integer;
  v_qual    text;
  v_gerada  text;
  v_dif     text;
  v_assin   text;
  v_def     text;
  v_valores text[];
  v_cfg     text;
  v_secdef  boolean;
BEGIN
  IF to_regclass(k_tab) IS NULL THEN
    RAISE EXCEPTION 'pessoas_justificacoes_dia nao ficou criada.';
  END IF;

  -- RLS e as quatro politicas.
  SELECT c.relrowsecurity INTO v_rls FROM pg_class c WHERE c.oid = to_regclass(k_tab);
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A tabela ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_justificacoes_dia';
  IF v_pol <> 4 THEN
    RAISE EXCEPTION 'Esperavam-se 4 politicas, encontraram-se %.', v_pol;
  END IF;

  SELECT count(*) INTO v_restr FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_justificacoes_dia'
     AND permissive = 'RESTRICTIVE'
     AND cmd IN ('INSERT','UPDATE','DELETE');
  IF v_restr <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 politicas RESTRICTIVE de escrita (INSERT, UPDATE, DELETE), encontraram-se %.', v_restr;
  END IF;

  SELECT coalesce(qual, '') INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_justificacoes_dia'
     AND policyname = 'pessoas_justificacoes_dia_select' AND cmd = 'SELECT';
  IF v_qual IS NULL OR v_qual = '' THEN
    RAISE EXCEPTION 'A politica de SELECT nao existe ou esta vazia.';
  END IF;
  IF v_qual NOT LIKE '%hr.assiduidade.justificacao.edit%'
     OR v_qual NOT LIKE '%hr.assiduidade.justificacao.view%'
     OR v_qual NOT LIKE '%hr.assiduidade.view.own%'
     OR v_qual NOT LIKE '%hr_pessoa_do_utilizador%' THEN
    RAISE EXCEPTION 'A politica de SELECT perdeu um dos tres ramos (edit, view, propria pessoa).';
  END IF;
  IF v_qual LIKE '%pessoa_na_minha_cadeia%' OR v_qual LIKE '%equipa.view%' THEN
    RAISE EXCEPTION 'A politica ganhou o ramo da chefia. A chefia nao le o pedido nem o motivo.';
  END IF;
  IF v_qual LIKE '%hr.assiduidade.faltas.view%' THEN
    RAISE EXCEPTION 'A politica passou a aceitar hr.assiduidade.faltas.view.';
  END IF;
  IF v_qual LIKE '%get_user_visible_org_ids%' THEN
    RAISE EXCEPTION 'A politica usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;
  IF v_qual ~ 'has_anew_permission\([^_]' THEN
    RAISE EXCEPTION 'A politica usa has_anew_permission (global) em vez de has_anew_permission_in_org.';
  END IF;

  -- GRANTs: nada de tabela para anon e authenticated; motivo sem leitura;
  -- todas as OUTRAS colunas com leitura (concessao por coluna nao cobre colunas
  -- futuras: esta comparacao falha quando aparecer uma coluna nova).
  IF has_table_privilege('authenticated', k_tab, 'SELECT')
     OR has_table_privilege('authenticated', k_tab, 'INSERT')
     OR has_table_privilege('authenticated', k_tab, 'UPDATE')
     OR has_table_privilege('authenticated', k_tab, 'DELETE')
     OR has_table_privilege('authenticated', k_tab, 'TRUNCATE')
     OR has_any_column_privilege('authenticated', k_tab, 'INSERT')
     OR has_any_column_privilege('authenticated', k_tab, 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated tem privilegio de tabela ou de escrita. Esta tabela e SELECT por coluna e mais nada.';
  END IF;
  IF has_any_column_privilege('anon', k_tab, 'SELECT')
     OR has_any_column_privilege('anon', k_tab, 'INSERT')
     OR has_any_column_privilege('anon', k_tab, 'UPDATE') THEN
    RAISE EXCEPTION 'anon tem algum privilegio na tabela.';
  END IF;
  IF has_column_privilege('authenticated', k_tab, 'motivo', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated le a coluna motivo. O texto da pessoa so sai pelas RPCs.';
  END IF;

  SELECT string_agg(c.column_name::text, ', ' ORDER BY c.column_name::text) INTO v_dif
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'pessoas_justificacoes_dia'
     AND c.column_name::text <> 'motivo'
     AND NOT has_column_privilege('authenticated', k_tab, c.column_name::text, 'SELECT');
  IF v_dif IS NOT NULL THEN
    RAISE EXCEPTION 'Colunas sem GRANT de leitura a authenticated (so motivo pode ficar de fora): %.', v_dif;
  END IF;

  -- minutos GERADA; sem deleted_at.
  SELECT c.is_generated::text INTO v_gerada FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'pessoas_justificacoes_dia' AND c.column_name = 'minutos';
  IF v_gerada IS DISTINCT FROM 'ALWAYS' THEN
    RAISE EXCEPTION 'minutos nao e GENERATED ALWAYS (e "%").', coalesce(v_gerada, 'ausente');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns c
              WHERE c.table_schema = 'public' AND c.table_name = 'pessoas_justificacoes_dia'
                AND c.column_name = 'deleted_at') THEN
    RAISE EXCEPTION 'A tabela ganhou deleted_at. E append-only.';
  END IF;

  -- O indice parcial que a RPC de registar traduz.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND tablename = 'pessoas_justificacoes_dia'
                    AND indexname = 'uq_pessoas_justificacoes_dia_activa'
                    AND indexdef LIKE 'CREATE UNIQUE INDEX%'
                    AND indexdef LIKE '%pendente%' AND indexdef NOT LIKE '%recusada%'
                    AND indexdef NOT LIKE '%sem_efeito%') THEN
    RAISE EXCEPTION 'O indice uq_pessoas_justificacoes_dia_activa nao existe, nao e unico, ou o predicado mudou.';
  END IF;

  -- As cinco RPCs: SECURITY DEFINER, search_path fixo, EXECUTE so a
  -- authenticated e service_role.
  FOREACH v_assin IN ARRAY ARRAY[
    'public.rpc_hr_justificacao_dia_registar(uuid, uuid, date, text, boolean, time, time, text, time, text[])',
    'public.rpc_hr_justificacao_dia_listar(uuid, uuid, date, date, boolean)',
    'public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean)',
    'public.rpc_hr_justificacao_dia_ver_texto(uuid)',
    'public.rpc_hr_justificacao_dia_acessos(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_assin) IS NULL THEN
      RAISE EXCEPTION 'A RPC % nao ficou criada.', v_assin;
    END IF;
    SELECT p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') INTO v_secdef, v_cfg
      FROM pg_proc p WHERE p.oid = to_regprocedure(v_assin)::oid;
    IF v_secdef IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'A RPC % nao e SECURITY DEFINER.', v_assin;
    END IF;
    IF v_cfg NOT LIKE '%search_path=public, pg_temp%' THEN
      RAISE EXCEPTION 'A RPC % nao tem search_path fixo (public, pg_temp): "%".', v_assin, v_cfg;
    END IF;
    IF has_function_privilege('anon', v_assin, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon executa %.', v_assin;
    END IF;
    IF NOT has_function_privilege('authenticated', v_assin, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_assin, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated ou service_role nao executam %.', v_assin;
    END IF;
  END LOOP;

  IF has_function_privilege('authenticated', 'public.hr_justificacao_dia_falta_sem_efeito()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.hr_justificacao_dia_falta_sem_efeito()', 'EXECUTE') THEN
    RAISE EXCEPTION 'A funcao do gatilho e executavel por authenticated ou anon.';
  END IF;

  -- Ninguem decide a sua propria justificacao.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_decidir(uuid, text, text, boolean)')::oid
       AND p.prosrc LIKE '%justificacao_dia_propria_decisao%'
       AND p.prosrc LIKE '%hr_pessoa_do_utilizador%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_justificacao_dia_decidir perdeu a guarda de decidir a propria justificacao.';
  END IF;

  -- "Ver texto" TEM de registar o acesso, com o campo que o CHECK aceita.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.rpc_hr_justificacao_dia_ver_texto(uuid)')::oid
       AND p.prosrc LIKE '%hr_registar_acesso_sensivel%'
       AND p.prosrc LIKE '%''justificacao_dia''%'
  ) THEN
    RAISE EXCEPTION 'rpc_hr_justificacao_dia_ver_texto nao chama hr_registar_acesso_sensivel com justificacao_dia.';
  END IF;

  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
   WHERE c.conrelid = to_regclass('public.pessoas_acessos_sensiveis')
     AND c.conname = 'pessoas_acessos_sensiveis_campo_valido';
  SELECT coalesce(array_agg(m[1]), '{}'::text[]) INTO v_valores
    FROM regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''::text', 'g') AS m;
  IF NOT ('justificacao_dia' = ANY (v_valores)) THEN
    RAISE EXCEPTION 'O CHECK de pessoas_acessos_sensiveis.campo nao aceita justificacao_dia: Ver texto falharia sempre.';
  END IF;

  -- O gatilho de sem_efeito em pessoas_faltas.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid = to_regclass('public.pessoas_faltas')
                    AND t.tgname = 'trg_pessoas_faltas_justificacao_dia_sem_efeito'
                    AND NOT t.tgisinternal
                    AND t.tgenabled::text <> 'D') THEN
    RAISE EXCEPTION 'O gatilho trg_pessoas_faltas_justificacao_dia_sem_efeito nao ficou criado (ou esta desligado).';
  END IF;

  -- O prazo bate com somarDiasUteis(data, 5): sexta -> sexta seguinte,
  -- segunda -> segunda seguinte, sabado -> sexta seguinte.
  IF public.hr_justificacao_dia_prazo(DATE '2026-10-23') IS DISTINCT FROM DATE '2026-10-30'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-26') IS DISTINCT FROM DATE '2026-11-02'
     OR public.hr_justificacao_dia_prazo(DATE '2026-10-24') IS DISTINCT FROM DATE '2026-10-30' THEN
    RAISE EXCEPTION 'hr_justificacao_dia_prazo nao bate com somarDiasUteis(data, 5).';
  END IF;

  IF public.hr_justificacao_dia_anexos_validos(ARRAY['a','b','c','d','e'])
     OR public.hr_justificacao_dia_anexos_validos(ARRAY[' '])
     OR public.hr_justificacao_dia_anexos_validos(ARRAY[NULL::text])
     OR public.hr_justificacao_dia_anexos_validos(ARRAY[repeat('x', 256)])
     OR NOT public.hr_justificacao_dia_anexos_validos('{}'::text[])
     OR NOT public.hr_justificacao_dia_anexos_validos(ARRAY['atestado.pdf']) THEN
    RAISE EXCEPTION 'hr_justificacao_dia_anexos_validos nao aplica a regra (ate 4, nenhum vazio, ate 255).';
  END IF;

  RAISE NOTICE 'Conferido: justificacao do dia com escrita fechada, motivo sem GRANT, revelacao registada, e aceitacao pelas RPCs de faltas.';
END;
$conferir$;
