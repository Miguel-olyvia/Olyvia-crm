-- ==============================================================================
-- O salario base de uma pessoa passa a vir SO do cargo. A retribuicao deixa de
-- se escrever por INSERT directo: so por duas funcoes (mudar o cargo da pessoa
-- e definir subsidio e duodecimos).
--
-- POR APLICAR.
--
-- PRECISA DE CODIGO NOVO NO MESMO COMMIT: o INSERT directo em
-- pessoas_retribuicoes passa a ser recusado a authenticated (o botao Alterar do
-- cartao Retribuicao e o assistente de nova pessoa usavam-no). O codigo novo
-- usa rpc_hr_retribuicao_definir_pessoal e rpc_hr_pessoa_mudar_cargo. Sem o
-- codigo novo, "Alterar retribuicao" e a gravacao da retribuicao na criacao da
-- ficha falham com permissao negada.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- 1. O salario base de uma pessoa e um numero solto por pessoa, que o RH
--    escreve a mao: nada garante que e o do cargo (igualdade salarial por posto
--    de trabalho, obrigacao legal).
-- 2. O trigger de igualdade salarial de 20261202070000 compara a versao com o
--    salario ACTUAL do cargo, nao com o que o cargo pagava na data da versao.
--    Defeito (lido no codigo, ainda nao reproduzido ao vivo): depois de editar
--    o salario de um cargo, FECHAR a versao aberta de uma pessoa desse cargo
--    (um UPDATE que so mexe em valido_ate) era recusado com 23514, porque o
--    valor da versao ja nao coincidia com o novo salario do cargo.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. pessoas_retribuicoes.origem (text NOT NULL DEFAULT 'pessoa', CHECK em
--    pessoa, cargo, subida_cargo): diz porque nasceu cada versao. 'pessoa' =
--    escolha da pessoa (subsidio e duodecimos); 'cargo' = mudanca de cargo;
--    'subida_cargo' = o cargo mudou de salario. Serve para a funcao de refazer
--    saber que versoes futuras pode refazer (as de cargo e subida) e quais sao
--    escolhas a preservar (as de pessoa). Linhas existentes ficam 'pessoa'
--    (ADD COLUMN com DEFAULT constante: sem reescrever a tabela).
--
-- 2. hr_retribuicao_valor_conforme_cargo() e SUBSTITUIDA (mesmo nome, mesmo
--    trigger BEFORE INSERT OR UPDATE):
--      a) salta quando a linha esta apagada, ou num UPDATE que nao mexe em
--         valor, periodicidade, valido_de nem origem e que nao ALARGA valido_ate
--         (fechar uma versao e sempre permitido: era o defeito acima);
--      b) a origem de uma versao nao se altera;
--      c) a pessoa tem de ter cargo na data em que a versao comeca (senao
--         HRC11: sem cargo nao ha salario);
--      d) o valor e a periodicidade tem de ser os do cargo NESSA data (23514,
--         igualdade_salarial, com o nome do cargo e o valor a essa data);
--      e) a versao nao pode atravessar uma mudanca do cargo da pessoa nem uma
--         mudanca de salario do cargo (23514, igualdade_salarial).
--
-- 3. Politica RESTRICTIVE pessoas_retribuicoes_insert_so_por_rpc: INSERT de
--    authenticated recusado. As politicas permissivas de 20261201040000 NAO se
--    apagam: ficam inertes para INSERT. UPDATE (corrigir) continua permitido
--    pelas politicas actuais; o trigger protege o valor.
--
-- 4. hr_retribuicao_refazer_desde(...) (interna): o UNICO sitio que escreve
--    versoes. Refaz as versoes a partir de uma data, em soft delete + reinsercao,
--    cortando onde muda o cargo da pessoa, o salario do cargo ou uma escolha da
--    pessoa. Corre na transaccao de quem chama; o trigger valida cada INSERT
--    (rede de seguranca contra um erro desta funcao).
--
-- 5. rpc_hr_pessoa_mudar_cargo (gate hr.pessoas.laborais.edit, e tambem
--    hr.pessoas.retribuicao.edit se a pessoa ja tem retribuicao -- decisao D2) e
--    rpc_hr_retribuicao_definir_pessoal (gate hr.pessoas.retribuicao.edit).
--
-- DECISAO D3 (datas): a mudanca de cargo de uma pessoa so e de hoje para tras
-- (excepcao: corrigir o cargo de uma admissao futura, no proprio dia de inicio).
-- As subidas do cargo so de hoje para a frente (20261210130000).
--
-- REVISAO (lacunas, escolhas pessoais, seguranca e concorrencia):
--
--  - hr_retribuicao_refazer_desde so cria retribuicao ONDE JA HAVIA. Sem versao
--    a cobrir a data e sem campos novos, comeca na primeira versao posterior (nao
--    em p_desde) e nunca tapa uma lacuna: cada valido_ate sem versao seguinte
--    encostada e uma fronteira "sem retribuicao". Definir subsidio e duodecimos
--    ja nao reabre uma retribuicao fechada: a versao nova acaba onde acabava a
--    que cobria a data.
--  - Uma escolha da pessoa (origem pessoa) agendada nunca se perde: se comeca
--    exactamente na data de refazer, o primeiro troco mantem os campos pessoais
--    (subsidio, modo, duodecimos), a origem e o motivo; created_by e created_at
--    das escolhas pessoais preservam-se nas versoes recriadas.
--  - Um troco igual ao anterior ja nao se junta atravessando o inicio de um
--    periodo do cargo (o trigger recusava-o com um 23514 enganador, por exemplo
--    depois de cancelar uma subida agendada voltando ao valor anterior).
--  - rpc_hr_pessoa_mudar_cargo com data passada que reescreve uma versao em
--    vigor exige tambem hr.pessoas.retribuicao.corrigir (como definir_pessoal), e
--    a condicao "ja tem retribuicao" le-se DEPOIS do lock da pessoa. Pessoa
--    inexistente e falta de permissao dao a mesma resposta (42501). salario_antes
--    e salario_depois so se devolvem a quem tem hr.pessoas.retribuicao.view.
--  - Locks FOR NO KEY UPDATE, e a ordem e sempre cargo antes de pessoa (mudar o
--    cargo de uma pessoa e subir o salario do cargo ja nao se bloqueiam um ao
--    outro).
--  - Limites: motivo ate 500 caracteres; datas entre 10 anos para tras e 5 anos
--    para a frente; mais de 200 cortes lanca HRC13.
--  - Trigger trg_pessoas_retribuicoes_0_escrita_so_por_rpc + politica RESTRICTIVE
--    pessoas_retribuicoes_update_sem_apagar: um INSERT directo de authenticated
--    morre logo no trigger, ANTES do trigger de igualdade (que, sendo definer, daria
--    na mensagem de erro o salario do cargo de qualquer pessoa, de qualquer
--    organizacao: os WITH CHECK da RLS correm DEPOIS dos triggers BEFORE); um
--    UPDATE directo de authenticated
--    ja nao apaga versoes nem muda o que so as funcoes do modulo escrevem (ver 4b).
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nenhuma versao existente e alterada: os valores e as datas ficam como
--   estao (o trigger novo so valida o que for escrito daqui para a frente).
-- - Nao se apagam as politicas permissivas de INSERT/UPDATE de 20261201040000.
-- - Nao ha bloqueio de meses de processamento ja fechados: mudar o cargo com
--   data passada mexe em meses que podem ter sido processados (fluxo 10).
-- - hr_cargos_salarios_divergentes (texto legado) nao muda.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- reverter 20261210130000 e 20261210140000, que dependem desta:
--   DROP POLICY IF EXISTS pessoas_retribuicoes_insert_so_por_rpc ON public.pessoas_retribuicoes;
--   DROP POLICY IF EXISTS pessoas_retribuicoes_update_sem_apagar ON public.pessoas_retribuicoes;
--   DROP TRIGGER IF EXISTS trg_pessoas_retribuicoes_0_escrita_so_por_rpc ON public.pessoas_retribuicoes;
--   DROP FUNCTION IF EXISTS public.hr_retribuicoes_escrita_so_por_rpc();
--   DROP FUNCTION IF EXISTS public.rpc_hr_pessoa_mudar_cargo(uuid, uuid, date, text);
--   DROP FUNCTION IF EXISTS public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text);
--   DROP FUNCTION IF EXISTS public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid);
--   DROP FUNCTION IF EXISTS public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes);
--   e repor hr_retribuicao_valor_conforme_cargo() com o corpo de 20261202070000.
--   A coluna origem pode ficar (inofensiva).
--
--
-- Prerequisitos:
--   20261210100000  hr_cargos_periodos, hr_cargo_salario_em
--   20261210110000  pessoas_cargos, hr_pessoa_cargo_em
--   20261201040000  politicas insert/update de pessoas_retribuicoes
--   20261202070000  hr_retribuicao_valor_conforme_cargo (versao vigente)
--   20261124090000  pessoas_retribuicoes.duodecimos_pct
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF to_regclass('public.hr_cargos_periodos') IS NULL
     OR to_regprocedure('public.hr_cargo_salario_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'hr_cargos_periodos ou hr_cargo_salario_em nao existem. Aplicar 20261210100000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_cargos') IS NULL
     OR to_regprocedure('public.hr_pessoa_cargo_em(uuid,date)') IS NULL THEN
    RAISE EXCEPTION 'pessoas_cargos ou hr_pessoa_cargo_em nao existem. Aplicar 20261210110000 primeiro.';
  END IF;

  IF to_regclass('public.pessoas_retribuicoes') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_retribuicoes nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_retribuicoes' AND column_name = 'duodecimos_pct'
  ) THEN
    RAISE EXCEPTION 'pessoas_retribuicoes.duodecimos_pct nao existe. Aplicar 20261124090000 primeiro.';
  END IF;

  -- As politicas permissivas de INSERT e UPDATE tem de ter a forma de 20261201040000.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_retribuicoes'
       AND policyname = 'pessoas_retribuicoes_insert'
       AND position('hr.pessoas.retribuicao.corrigir' IN coalesce(with_check, '')) > 0
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'pessoas_retribuicoes'
       AND policyname = 'pessoas_retribuicoes_update'
       AND position('hr.pessoas.retribuicao.corrigir' IN coalesce(qual, '')) > 0
  ) THEN
    RAISE EXCEPTION 'As politicas pessoas_retribuicoes_insert/_update nao tem a forma de 20261201040000. Reler antes de continuar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_retribuicoes_igualdade_salarial'
       AND tgrelid = to_regclass('public.pessoas_retribuicoes')
  ) THEN
    RAISE EXCEPTION 'O trigger de igualdade salarial nao existe. Aplicar 20261202070000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.laborais.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.laborais.edit nao esta no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.edit nao esta no catalogo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.retribuicao.corrigir') THEN
    RAISE EXCEPTION 'hr.pessoas.retribuicao.corrigir nao esta no catalogo. Aplicar 20261201040000 primeiro.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. pessoas_retribuicoes.origem. Um so ALTER: a coluna e o CHECK entram juntos
--    (se a coluna ja existe, a clausula inteira e saltada: idempotente).
-- ==============================================================================
ALTER TABLE public.pessoas_retribuicoes
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'pessoa'
  CONSTRAINT pessoas_retribuicoes_origem_valida CHECK (origem IN ('pessoa', 'cargo', 'subida_cargo'));

COMMENT ON COLUMN public.pessoas_retribuicoes.origem IS
'Porque nasceu esta versao: pessoa (escolha da pessoa: subsidio e duodecimos), cargo (mudanca de cargo) ou subida_cargo (o cargo mudou de salario). A funcao de refazer usa-a para saber que versoes futuras pode refazer (cargo e subida_cargo) e quais sao escolhas a preservar (pessoa). NAO se altera depois de criada (trigger de igualdade salarial). Linhas anteriores a 20261210120000 ficam pessoa.';

-- ==============================================================================
-- 2. Os campos "da pessoa" de uma versao (os que o cargo nao decide).
--    Interna, IMMUTABLE; usada pela funcao de refazer.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_retribuicao_campos_da_versao(p_r public.pessoas_retribuicoes)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'vinculo_id',                 p_r.vinculo_id,
    'moeda',                      p_r.moeda,
    'subsidio_alimentacao',       p_r.subsidio_alimentacao,
    'subsidio_alimentacao_modo',  p_r.subsidio_alimentacao_modo,
    'duodecimos_pct',             p_r.duodecimos_pct
  )
$$;

REVOKE ALL ON FUNCTION public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes) FROM anon;
REVOKE ALL ON FUNCTION public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes) FROM service_role;

COMMENT ON FUNCTION public.hr_retribuicao_campos_da_versao(public.pessoas_retribuicoes) IS
'INTERNA. Os campos de uma versao de retribuicao que NAO vem do cargo (vinculo, moeda, subsidio de alimentacao e modo, duodecimos), em jsonb. Usada por hr_retribuicao_refazer_desde para copiar o que a pessoa escolheu de uma versao para a seguinte.';

-- ==============================================================================
-- 3. O trigger de igualdade salarial, SUBSTITUIDO (CREATE OR REPLACE, mesmo
--    nome, o mesmo trigger BEFORE INSERT OR UPDATE continua ligado).
--    Corpo anterior: 20261202070000.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_retribuicao_valor_conforme_cargo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cargo_id   uuid;
  v_cargo_nome text;
  v_sal        numeric;
  v_per        text;
  v_corte      date;
BEGIN
  -- a) uma linha apagada nao e uma versao.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- b) a origem nao se altera.
    IF NEW.origem IS DISTINCT FROM OLD.origem THEN
      RAISE EXCEPTION 'igualdade_salarial: a origem da versao nao se altera.'
        USING ERRCODE = '23514';
    END IF;

    -- a) um UPDATE que nao mexe em valor, periodicidade nem inicio, e que nao
    --    alarga o fim, nao precisa de ser revalidado. E o que deixa FECHAR a
    --    versao aberta depois de uma subida do cargo (ou de uma mudanca de
    --    cargo), e corrigir o subsidio de uma versao antiga.
    IF OLD.deleted_at IS NULL
       AND NEW.valor_base IS NOT DISTINCT FROM OLD.valor_base
       AND NEW.periodicidade IS NOT DISTINCT FROM OLD.periodicidade
       AND NEW.valido_de IS NOT DISTINCT FROM OLD.valido_de
       AND NOT (OLD.valido_ate IS NOT NULL
                AND (NEW.valido_ate IS NULL OR NEW.valido_ate > OLD.valido_ate)) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- c) a pessoa tem de ter cargo na data em que a versao comeca.
  v_cargo_id := public.hr_pessoa_cargo_em(NEW.pessoa_id, NEW.valido_de);
  IF v_cargo_id IS NULL THEN
    RAISE EXCEPTION
      'retribuicao_sem_cargo: a pessoa nao tem cargo em %. Sem cargo nao ha salario base: atribuir primeiro um cargo (separador Laborais da ficha).',
      NEW.valido_de
      USING ERRCODE = 'HRC11';
  END IF;

  -- d) valor e periodicidade tem de ser os do cargo NESSA data.
  SELECT s.salario_base, s.periodicidade INTO v_sal, v_per
    FROM public.hr_cargo_salario_em(v_cargo_id, NEW.valido_de) s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'cargo_nao_encontrado: o cargo da pessoa nao tem nenhum periodo de salario definido.'
      USING ERRCODE = 'HRC02';
  END IF;

  IF NEW.valor_base IS DISTINCT FROM v_sal OR NEW.periodicidade IS DISTINCT FROM v_per THEN
    SELECT c.nome INTO v_cargo_nome FROM public.hr_cargos c WHERE c.id = v_cargo_id;
    RAISE EXCEPTION
      'igualdade_salarial: o cargo "%" paga % (%) em % -- toda a gente com este cargo ganha o mesmo. Esta versao tentava gravar % (%). Para mudar o salario base, muda-se o cargo da pessoa ou o salario do cargo, nao esta versao.',
      v_cargo_nome, v_sal, v_per, NEW.valido_de, NEW.valor_base, NEW.periodicidade
      USING ERRCODE = '23514';
  END IF;

  -- e) a versao nao pode atravessar uma mudanca do cargo da pessoa nem uma
  --    mudanca de salario do cargo. O primeiro periodo do cargo nao conta como
  --    mudanca: vale desde sempre.
  SELECT min(x.d) INTO v_corte
    FROM (
      SELECT c.valido_de AS d
        FROM public.pessoas_cargos c
       WHERE c.pessoa_id = NEW.pessoa_id
         AND c.valido_de > NEW.valido_de
         AND (NEW.valido_ate IS NULL OR c.valido_de < NEW.valido_ate)
      UNION ALL
      SELECT p.valido_de
        FROM public.hr_cargos_periodos p
       WHERE p.cargo_id = v_cargo_id
         AND p.valido_de > NEW.valido_de
         AND (NEW.valido_ate IS NULL OR p.valido_de < NEW.valido_ate)
         AND p.valido_de > (SELECT min(q.valido_de) FROM public.hr_cargos_periodos q WHERE q.cargo_id = v_cargo_id)
    ) x;

  IF v_corte IS NOT NULL THEN
    RAISE EXCEPTION
      'igualdade_salarial: esta versao atravessa uma mudanca do cargo em %. Terminar a versao nessa data e abrir outra a partir dela.',
      v_corte
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_retribuicao_valor_conforme_cargo() IS
'Trigger BEFORE INSERT OR UPDATE em pessoas_retribuicoes (substituido em 20261210120000). O valor_base e a periodicidade de uma versao tem de ser os do cargo que a pessoa tinha NA DATA em que a versao comeca (hr_pessoa_cargo_em + hr_cargo_salario_em); sem cargo nessa data: HRC11. Recusa uma versao que atravesse uma mudanca de cargo ou de salario do cargo. Salta linhas apagadas e UPDATEs que so fecham (ou nao tocam em) valor, periodicidade, inicio e origem. A origem nao se altera. 23514 com mensagem a comecar por igualdade_salarial: para divergencia de valor e para versao que atravessa uma mudanca.';

-- ==============================================================================
-- 4. Fecha o INSERT directo: politica RESTRICTIVE. As permissivas de
--    20261201040000 ficam, mas inertes para INSERT.
-- ==============================================================================
DROP POLICY IF EXISTS pessoas_retribuicoes_insert_so_por_rpc ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_insert_so_por_rpc ON public.pessoas_retribuicoes
  AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

COMMENT ON POLICY pessoas_retribuicoes_insert_so_por_rpc ON public.pessoas_retribuicoes IS
'Desde 20261210120000 nenhuma versao de retribuicao se cria por INSERT directo de authenticated: so por rpc_hr_pessoa_mudar_cargo, rpc_hr_retribuicao_definir_pessoal e rpc_hr_cargo_definir_salario (funcoes definer). A politica permissiva pessoas_retribuicoes_insert (20261201040000) NAO foi apagada mas fica inerte para INSERT: esta RESTRICTIVE vence sempre.';
COMMENT ON POLICY pessoas_retribuicoes_insert ON public.pessoas_retribuicoes IS
'INERTE para INSERT desde 20261210120000: a politica RESTRICTIVE pessoas_retribuicoes_insert_so_por_rpc recusa todo o INSERT de authenticated (as versoes criam-se so pelas funcoes definer). Forma original (20261201040000): ALTERACAO exigia hr.pessoas.retribuicao.edit, CORRECCAO exigia hr.pessoas.retribuicao.corrigir.';

-- ==============================================================================
-- 4b. O INSERT e o UPDATE directos de authenticated deixam de poder escrever o
--     que so as funcoes do modulo escrevem.
--
--     INSERT: com sessao de utilizador e fora das funcoes do modulo, o trigger
--     recusa (42501) ANTES de qualquer outra coisa. A politica RESTRICTIVE de
--     INSERT (4.) recusa-o tambem, mas as politicas WITH CHECK correm DEPOIS dos
--     triggers BEFORE, e o trigger de igualdade salarial e SECURITY DEFINER e
--     diz na mensagem de erro o salario do cargo: sem esta guarda, qualquer
--     utilizador autenticado descobria o salario do cargo de QUALQUER pessoa (de
--     qualquer organizacao) so por tentar inserir uma versao com o uuid dela.
--
--     O que a politica RLS faz: WITH CHECK (deleted_at IS NULL), RESTRICTIVE: o
--     soft delete por acesso directo e recusado. (Nenhum ecra nem hook faz soft
--     delete de retribuicoes: o hook usePessoaRetribuicao so le, chama as RPCs e
--     corrige; a politica pessoas_retribuicoes_update de 20261201040000 nao
--     exigia deleted_at IS NULL no USING por herdar o molde dos horarios.)
--
--     O que so um TRIGGER consegue: uma politica RLS nao ve a linha antiga, por
--     isso nao compara OLD com NEW. O trigger recusa (42501), a quem tem sessao
--     de utilizador e fora das funcoes do modulo (GUC hr.retribuicao_via_rpc):
--       - mudar deleted_at ou deleted_by;
--       - numa versao NAO decorrida (em vigor ou futura): mudar valor, moeda,
--         vinculo, subsidio, modo, duodecimos, valido_de ou valido_ate (so o
--         motivo se corrige) -- encurtar ou apagar o que esta em vigor e coisa
--         das funcoes (que fecham em p_desde e recriam);
--       - numa versao ja decorrida (a CORRECCAO, hr.pessoas.retribuicao.corrigir,
--         o caminho do hook corrigir): continua a poder mudar subsidio, modo,
--         duodecimos, moeda, datas e motivo, mas valido_ate tem de continuar a ser
--         uma data ja passada ou de hoje (nao se reabre nem se alonga para o
--         futuro por aqui).
--     Sem sessao de utilizador (migration, service_role) o trigger nao actua.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_retribuicoes_escrita_so_por_rpc()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR coalesce(current_setting('hr.retribuicao_via_rpc', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  -- INSERT por um utilizador, fora das funcoes do modulo: recusado sem dizer
  -- mais nada (sem valores, sem nomes de cargo, sem saber se a pessoa existe).
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'insufficient_privilege: as versoes de retribuicao criam-se so pelas funcoes do modulo (mudar o cargo da pessoa, definir subsidio e duodecimos, mudar o salario do cargo).'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by THEN
    RAISE EXCEPTION 'insufficient_privilege: uma versao de retribuicao nao se apaga nem se restaura por acesso directo; so as funcoes do modulo o fazem.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.hr_periodo_decorrido(OLD.valido_ate) THEN
    IF ROW(NEW.valor_base, NEW.periodicidade, NEW.moeda, NEW.vinculo_id,
           NEW.subsidio_alimentacao, NEW.subsidio_alimentacao_modo, NEW.duodecimos_pct,
           NEW.valido_de, NEW.valido_ate)
       IS DISTINCT FROM
       ROW(OLD.valor_base, OLD.periodicidade, OLD.moeda, OLD.vinculo_id,
           OLD.subsidio_alimentacao, OLD.subsidio_alimentacao_modo, OLD.duodecimos_pct,
           OLD.valido_de, OLD.valido_ate) THEN
      RAISE EXCEPTION 'insufficient_privilege: uma versao de retribuicao em vigor ou futura so se muda pelas funcoes do modulo (mudar o cargo da pessoa, definir subsidio e duodecimos, mudar o salario do cargo); por acesso directo so se corrige o motivo.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.valido_ate IS NULL OR NEW.valido_ate > current_date THEN
    RAISE EXCEPTION 'insufficient_privilege: uma versao ja decorrida corrige-se, mas nao se reabre nem se alonga para o futuro por acesso directo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_retribuicoes_escrita_so_por_rpc() IS
'BEFORE INSERT OR UPDATE em pessoas_retribuicoes. Para quem tem sessao de utilizador e fora das funcoes do modulo (GUC hr.retribuicao_via_rpc = on): recusa (42501) todo o INSERT, antes do trigger de igualdade (cuja mensagem de erro revelaria o salario do cargo de qualquer pessoa); recusa (42501) mudar deleted_at ou deleted_by; numa versao nao decorrida recusa mudar valor, moeda, vinculo, subsidio, modo, duodecimos, valido_de e valido_ate (so o motivo); numa versao decorrida (a correccao, hr.pessoas.retribuicao.corrigir) deixa corrigir mas nao reabrir nem alongar valido_ate para o futuro. Sem sessao (migration, service_role) nao actua. Existe porque uma politica RLS nao ve a linha antiga.';

-- O "0" no nome e de proposito: os triggers BEFORE disparam por ordem alfabetica,
-- e esta guarda tem de correr ANTES do de igualdade salarial.
DROP TRIGGER IF EXISTS trg_pessoas_retribuicoes_0_escrita_so_por_rpc ON public.pessoas_retribuicoes;
CREATE TRIGGER trg_pessoas_retribuicoes_0_escrita_so_por_rpc
  BEFORE INSERT OR UPDATE ON public.pessoas_retribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.hr_retribuicoes_escrita_so_por_rpc();

DROP POLICY IF EXISTS pessoas_retribuicoes_update_sem_apagar ON public.pessoas_retribuicoes;
CREATE POLICY pessoas_retribuicoes_update_sem_apagar ON public.pessoas_retribuicoes
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (deleted_at IS NULL);

COMMENT ON POLICY pessoas_retribuicoes_update_sem_apagar ON public.pessoas_retribuicoes IS
'RESTRICTIVE: um UPDATE de authenticated nao pode deixar a linha apagada (deleted_at IS NULL). O resto da guarda do UPDATE directo vive no trigger trg_pessoas_retribuicoes_0_escrita_so_por_rpc, porque uma politica RLS nao ve a linha antiga.';

-- ==============================================================================
-- 5. hr_retribuicao_refazer_desde: o UNICO sitio que escreve versoes.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_retribuicao_refazer_desde(
  p_pessoa_id uuid,
  p_desde     date,
  p_campos    jsonb,
  p_origem    text,
  p_motivo    text,
  p_actor     uuid
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_max_cortes   constant integer := 200;
  v_org          uuid;
  v_hoje         date := current_date;
  v_c            public.pessoas_retribuicoes%ROWTYPE;
  v_tem_c        boolean;
  v_primeira     public.pessoas_retribuicoes%ROWTYPE;
  v_tem_primeira boolean;
  v_r0           public.pessoas_retribuicoes%ROWTYPE;
  v_tem_r0       boolean;
  v_com_campos   boolean;
  v_inicio       date;
  v_extra_ate    date;
  v_ponto0       jsonb;
  v_pontos       jsonb;
  v_cobertura    jsonb;
  v_conflito     date;
  v_cortes       date[];
  v_n            integer;
  v_i            integer;
  v_d            date;
  v_cobre        boolean;
  v_neutro       boolean;
  v_cargo        uuid;
  v_sal          numeric;
  v_per          text;
  v_campos       jsonb;
  v_pt           jsonb;
  v_antiga       jsonb;
  v_origem       text;
  v_motivo       text;
  v_pres         boolean;
  v_by           uuid;
  v_at           timestamptz;
  v_tem_p        boolean := false;
  v_p_de         date;
  v_p_cargo      uuid;
  v_p_sal        numeric;
  v_p_per        text;
  v_p_campos     jsonb;
  v_p_origem     text;
  v_p_motivo     text;
  v_p_pres       boolean;
  v_p_by         uuid;
  v_p_at         timestamptz;
  v_criadas      integer := 0;
BEGIN
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data a partir da qual se refaz a retribuicao e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_origem IS NULL OR p_origem NOT IN ('pessoa', 'cargo', 'subida_cargo') THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: a origem da versao tem de ser pessoa, cargo ou subida_cargo.'
      USING ERRCODE = 'HRC03';
  END IF;

  -- 1. A pessoa, com lock (serializa quem refaz a mesma pessoa). NO KEY UPDATE:
  --    nao bloqueia as verificacoes de chave estrangeira de quem escreve em
  --    tabelas que apontam para a pessoa. Ordem de locks do modulo: cargo
  --    ANTES de pessoa (quem chama ja tem o cargo, se o lock do cargo interessa).
  SELECT p.organization_id INTO v_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pessoa_nao_encontrada: a pessoa nao existe ou foi apagada.'
      USING ERRCODE = 'HRC12';
  END IF;

  -- 2. Nao se refaz historico ja em vigor: isso e trabalho de corrigir.
  SELECT min(r.valido_de) INTO v_conflito
    FROM public.pessoas_retribuicoes r
   WHERE r.pessoa_id = p_pessoa_id
     AND r.deleted_at IS NULL
     AND r.valido_de >= p_desde
     AND r.valido_de < v_hoje;
  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION
      'alteracao_posterior_existe: ja ha uma versao de retribuicao em vigor desde %, depois de %. Nao se refaz historico ja em vigor por aqui: isso e corrigir a retribuicao.',
      v_conflito, p_desde
      USING ERRCODE = 'HRC06';
  END IF;

  -- 3. A versao que cobre p_desde e comecou antes (c, pode nao existir), e a
  --    primeira que comeca em p_desde ou depois (pode nao existir).
  SELECT * INTO v_c
    FROM public.pessoas_retribuicoes r
   WHERE r.pessoa_id = p_pessoa_id
     AND r.deleted_at IS NULL
     AND r.valido_de < p_desde
     AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
   ORDER BY r.valido_de DESC
   LIMIT 1;
  v_tem_c := FOUND;

  SELECT * INTO v_primeira
    FROM public.pessoas_retribuicoes r
   WHERE r.pessoa_id = p_pessoa_id
     AND r.deleted_at IS NULL
     AND r.valido_de >= p_desde
   ORDER BY r.valido_de ASC
   LIMIT 1;
  v_tem_primeira := FOUND;

  v_com_campos := p_campos IS NOT NULL AND jsonb_typeof(p_campos) = 'object';

  -- Sem campos (mudar cargo, subida) nao se cria retribuicao a quem nao a tem a
  -- partir desta data.
  IF NOT v_tem_c AND NOT v_com_campos AND NOT v_tem_primeira THEN
    RETURN 0;
  END IF;

  -- Onde comeca o que se refaz. Com versao c, ou a definir o subsidio e os
  -- duodecimos (que e um gesto explicito a partir de p_desde): em p_desde. Sem
  -- c, a refazer por mudanca de cargo ou subida: na PRIMEIRA versao que comeca
  -- depois -- nunca se inventa retribuicao no intervalo em que a pessoa nao a
  -- tinha.
  v_inicio := CASE WHEN v_tem_c OR v_com_campos THEN p_desde ELSE v_primeira.valido_de END;

  -- 4. A cobertura que existe ANTES de apagar nada (c e as versoes que comecam
  --    em p_desde ou depois): so ha versoes onde ja havia. Cada valido_ate sem
  --    versao seguinte encostada e uma fronteira "sem retribuicao".
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'de', r.valido_de, 'ate', r.valido_ate, 'origem', r.origem, 'motivo', r.motivo)), '[]'::jsonb)
    INTO v_cobertura
    FROM public.pessoas_retribuicoes r
   WHERE r.pessoa_id = p_pessoa_id
     AND r.deleted_at IS NULL
     AND (r.valido_de >= p_desde OR (v_tem_c AND r.id = v_c.id));

  -- A definir o subsidio sem versao c, a pessoa passa a ter retribuicao desde
  -- p_desde ate onde ja havia (ou para sempre, se nao havia nenhuma depois).
  v_extra_ate := NULL;
  IF v_com_campos AND NOT v_tem_c THEN
    SELECT coalesce(min(r.valido_de), 'infinity'::date) INTO v_extra_ate
      FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL AND r.valido_de >= p_desde;
  END IF;

  -- 5. Pontos pessoais: o primeiro em v_inicio mais um por cada versao posterior
  --    de origem pessoa (as escolhas da pessoa, agendadas, que nunca se perdem).
  --    Cada ponto leva os campos da pessoa e, se for escolha preservada, o
  --    created_by e o created_at originais.
  v_tem_r0 := false;
  IF NOT v_com_campos THEN
    SELECT * INTO v_r0
      FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL AND r.valido_de = v_inicio
     LIMIT 1;
    v_tem_r0 := FOUND;
  END IF;

  IF v_com_campos THEN
    v_ponto0 := jsonb_build_object(
      'd', v_inicio, 'campos', p_campos, 'motivo', p_motivo,
      'pessoal', false, 'preservar', false);
  ELSIF v_tem_r0 THEN
    -- Substitui uma versao que comeca exactamente aqui: os campos pessoais
    -- (subsidio, modo, duodecimos) sao os dela, e se era escolha da pessoa
    -- mantem tambem a origem, o motivo e quem a criou.
    v_ponto0 := jsonb_build_object(
      'd', v_inicio, 'campos', public.hr_retribuicao_campos_da_versao(v_r0),
      'motivo', CASE WHEN v_r0.origem = 'pessoa' THEN v_r0.motivo ELSE p_motivo END,
      'pessoal', v_r0.origem = 'pessoa', 'preservar', v_r0.origem = 'pessoa',
      'created_by', v_r0.created_by, 'created_at', v_r0.created_at);
  ELSE
    v_ponto0 := jsonb_build_object(
      'd', v_inicio, 'campos', public.hr_retribuicao_campos_da_versao(v_c),
      'motivo', p_motivo, 'pessoal', false, 'preservar', false);
  END IF;

  SELECT coalesce(jsonb_agg(x.p ORDER BY (x.p ->> 'd')::date), '[]'::jsonb)
    INTO v_pontos
    FROM (
      SELECT v_ponto0 AS p
      UNION ALL
      SELECT jsonb_build_object(
               'd', r.valido_de, 'campos', public.hr_retribuicao_campos_da_versao(r),
               'motivo', r.motivo, 'pessoal', true, 'preservar', true,
               'created_by', r.created_by, 'created_at', r.created_at)
        FROM public.pessoas_retribuicoes r
       WHERE r.pessoa_id = p_pessoa_id
         AND r.deleted_at IS NULL
         AND r.valido_de > v_inicio
         AND r.origem = 'pessoa'
    ) x;

  -- 6. Os cortes: v_inicio, os pontos pessoais, os inicios de linhas de cargo da
  --    pessoa e de periodos dos cargos que ela tem a partir de v_inicio, e as
  --    fronteiras da cobertura que existe (inicios e fins de versao).
  SELECT array_agg(DISTINCT t.d ORDER BY t.d) INTO v_cortes
    FROM (
      SELECT v_inicio AS d
      UNION
      SELECT (e.value ->> 'd')::date
        FROM jsonb_array_elements(v_pontos) AS e(value)
      UNION
      SELECT pc.valido_de
        FROM public.pessoas_cargos pc
       WHERE pc.pessoa_id = p_pessoa_id
      UNION
      SELECT cp.valido_de
        FROM public.hr_cargos_periodos cp
       WHERE cp.cargo_id IN (
         SELECT pc2.cargo_id
           FROM public.pessoas_cargos pc2
          WHERE pc2.pessoa_id = p_pessoa_id
            AND (pc2.valido_ate IS NULL OR pc2.valido_ate > v_inicio)
       )
      UNION
      SELECT (x.value ->> 'de')::date
        FROM jsonb_array_elements(v_cobertura) AS x(value)
      UNION
      SELECT (x.value ->> 'ate')::date
        FROM jsonb_array_elements(v_cobertura) AS x(value)
       WHERE x.value ->> 'ate' IS NOT NULL
    ) t
   WHERE t.d >= v_inicio;

  v_n := coalesce(array_length(v_cortes, 1), 0);
  IF v_n > c_max_cortes THEN
    RAISE EXCEPTION
      'retribuicao_demasiados_cortes: refazer a retribuicao desta pessoa exigia % cortes (limite de seguranca: %). Nada foi alterado.',
      v_n, c_max_cortes
      USING ERRCODE = 'HRC13';
  END IF;

  -- 7. Apaga (soft delete) as versoes que comecam em p_desde ou depois e fecha c
  --    em p_desde. A GUC deixa passar estas escritas pelo trigger que recusa o
  --    UPDATE directo de authenticated.
  PERFORM set_config('hr.retribuicao_via_rpc', 'on', true);

  UPDATE public.pessoas_retribuicoes
     SET deleted_at = now(), deleted_by = p_actor, updated_by = p_actor
   WHERE pessoa_id = p_pessoa_id
     AND deleted_at IS NULL
     AND valido_de >= p_desde;

  IF v_tem_c THEN
    UPDATE public.pessoas_retribuicoes
       SET valido_ate = p_desde, updated_by = p_actor
     WHERE id = v_c.id;
  END IF;

  -- 8. Percorre os cortes. Um corte sem cobertura anterior nem extra e um
  --    intervalo SEM retribuicao: nao se escreve nada, e interrompe o troco em
  --    curso. Um troco igual ao anterior (cargo, salario, periodicidade e
  --    campos) junta-se a ele, EXCEPTO onde ha uma razao para cortar: uma
  --    escolha pessoal, uma mudanca de cargo, o inicio de um periodo do cargo
  --    (o trigger de igualdade recusa uma versao que o atravesse, mesmo que o
  --    valor seja o mesmo). v_i = v_n + 1 e o sentinela que grava o ultimo troco
  --    pendente (em aberto: a cobertura que ainda la esta nao acaba).
  FOR v_i IN 1 .. v_n + 1 LOOP
    v_cobre  := false;
    v_neutro := false;

    IF v_i <= v_n THEN
      v_d := v_cortes[v_i];

      v_cobre := EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_cobertura) AS x(value)
           WHERE (x.value ->> 'de')::date <= v_d
             AND ((x.value ->> 'ate') IS NULL OR (x.value ->> 'ate')::date > v_d)
        )
        OR (v_extra_ate IS NOT NULL AND v_d < v_extra_ate);

      IF v_cobre THEN
        v_cargo := public.hr_pessoa_cargo_em(p_pessoa_id, v_d);
        IF v_cargo IS NULL THEN
          RAISE EXCEPTION 'retribuicao_sem_cargo: a pessoa nao tem cargo em %. Sem cargo nao ha salario base: atribuir primeiro um cargo.',
            v_d
            USING ERRCODE = 'HRC11';
        END IF;

        SELECT s.salario_base, s.periodicidade INTO v_sal, v_per
          FROM public.hr_cargo_salario_em(v_cargo, v_d) s;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'cargo_nao_encontrado: o cargo da pessoa nao tem nenhum periodo de salario definido.'
            USING ERRCODE = 'HRC02';
        END IF;

        SELECT e.value -> 'campos' INTO v_campos
          FROM jsonb_array_elements(v_pontos) AS e(value)
         WHERE (e.value ->> 'd')::date <= v_d
         ORDER BY (e.value ->> 'd')::date DESC
         LIMIT 1;

        SELECT e.value INTO v_pt
          FROM jsonb_array_elements(v_pontos) AS e(value)
         WHERE (e.value ->> 'd')::date = v_d
         LIMIT 1;

        v_neutro := v_tem_p
                    AND v_p_cargo IS NOT DISTINCT FROM v_cargo
                    AND v_p_sal   IS NOT DISTINCT FROM v_sal
                    AND v_p_per   IS NOT DISTINCT FROM v_per
                    AND v_p_campos IS NOT DISTINCT FROM v_campos
                    AND v_pt IS NULL
                    AND NOT EXISTS (
                      SELECT 1 FROM public.pessoas_cargos pc
                       WHERE pc.pessoa_id = p_pessoa_id AND pc.valido_de = v_d)
                    AND NOT EXISTS (
                      SELECT 1 FROM public.hr_cargos_periodos cp
                       WHERE cp.cargo_id = v_cargo AND cp.valido_de = v_d
                         AND cp.valido_de > (SELECT min(q.valido_de) FROM public.hr_cargos_periodos q WHERE q.cargo_id = v_cargo));
      END IF;
    END IF;

    IF v_cobre AND v_neutro THEN
      CONTINUE;
    END IF;

    -- Grava o troco pendente, que acaba onde comeca este corte (ou fica em
    -- aberto, no sentinela).
    IF v_tem_p THEN
      INSERT INTO public.pessoas_retribuicoes
        (pessoa_id, organization_id, vinculo_id, valor_base, moeda, periodicidade,
         subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct,
         valido_de, valido_ate, motivo, origem, created_by, created_at, updated_by)
      VALUES
        (p_pessoa_id, v_org,
         NULLIF(v_p_campos ->> 'vinculo_id', '')::uuid,
         v_p_sal,
         coalesce(NULLIF(v_p_campos ->> 'moeda', ''), 'EUR'),
         v_p_per,
         (v_p_campos ->> 'subsidio_alimentacao')::numeric,
         NULLIF(v_p_campos ->> 'subsidio_alimentacao_modo', ''),
         (v_p_campos ->> 'duodecimos_pct')::smallint,
         v_p_de,
         CASE WHEN v_i <= v_n THEN v_d ELSE NULL END,
         v_p_motivo, v_p_origem,
         CASE WHEN v_p_pres THEN v_p_by ELSE p_actor END,
         CASE WHEN v_p_pres THEN coalesce(v_p_at, now()) ELSE now() END,
         p_actor);
      v_criadas := v_criadas + 1;
      v_tem_p := false;
    END IF;

    -- Abre o troco novo.
    IF v_i <= v_n AND v_cobre THEN
      v_pres := false;
      v_by   := NULL;
      v_at   := NULL;

      IF v_i = 1 THEN
        IF coalesce((v_pt ->> 'pessoal')::boolean, false) THEN
          v_origem := 'pessoa';
          v_motivo := v_pt ->> 'motivo';
        ELSE
          v_origem := p_origem;
          v_motivo := p_motivo;
        END IF;
      ELSIF v_pt IS NOT NULL THEN
        v_origem := 'pessoa';
        v_motivo := v_pt ->> 'motivo';
      ELSIF EXISTS (
        SELECT 1 FROM public.pessoas_cargos pc
         WHERE pc.pessoa_id = p_pessoa_id AND pc.valido_de = v_d
      ) THEN
        v_origem := 'cargo';
        v_motivo := 'Mudanca de cargo';
      ELSIF EXISTS (
        SELECT 1 FROM public.hr_cargos_periodos cp
         WHERE cp.cargo_id = v_cargo AND cp.valido_de = v_d
      ) THEN
        v_origem := 'subida_cargo';
        v_motivo := 'Subida do cargo';
      ELSE
        -- Inicio de uma cobertura depois de uma lacuna: mantem o que a versao
        -- antiga tinha, se havia uma a comecar neste dia.
        SELECT x.value INTO v_antiga
          FROM jsonb_array_elements(v_cobertura) AS x(value)
         WHERE (x.value ->> 'de')::date = v_d
         LIMIT 1;
        v_origem := coalesce(v_antiga ->> 'origem', 'subida_cargo');
        v_motivo := coalesce(v_antiga ->> 'motivo', 'Subida do cargo');
      END IF;

      IF v_pt IS NOT NULL AND coalesce((v_pt ->> 'preservar')::boolean, false) THEN
        v_pres := true;
        v_by   := NULLIF(v_pt ->> 'created_by', '')::uuid;
        v_at   := NULLIF(v_pt ->> 'created_at', '')::timestamptz;
      END IF;

      v_tem_p    := true;
      v_p_de     := v_d;
      v_p_cargo  := v_cargo;
      v_p_sal    := v_sal;
      v_p_per    := v_per;
      v_p_campos := v_campos;
      v_p_origem := v_origem;
      v_p_motivo := v_motivo;
      v_p_pres   := v_pres;
      v_p_by     := v_by;
      v_p_at     := v_at;
    END IF;
  END LOOP;

  PERFORM set_config('hr.retribuicao_via_rpc', 'off', true);

  RETURN v_criadas;
END;
$$;

REVOKE ALL ON FUNCTION public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid) FROM service_role;

COMMENT ON FUNCTION public.hr_retribuicao_refazer_desde(uuid, date, jsonb, text, text, uuid) IS
'INTERNA (sem EXECUTE para ninguem excepto o dono; chamada so pelas funcoes definer do modulo, que fazem o gate de permissao). O UNICO sitio que escreve versoes de retribuicao. Refaz as versoes de uma pessoa a partir de p_desde: fecha em p_desde a versao que a cobre, apaga (soft delete) as que comecam em p_desde ou depois, e recria-as cortando onde muda o cargo da pessoa, o salario do cargo ou uma escolha da pessoa. So ha retribuicao onde ja havia: um intervalo sem versao continua sem versao (sem c e sem campos comeca na primeira versao posterior, nao em p_desde; nunca se reabre uma versao fechada). Versoes posteriores de origem pessoa sao preservadas como pontos pessoais; uma versao pessoa que comeca exactamente no inicio mantem os campos, a origem, o created_by e o created_at. p_campos (opcional) define vinculo, moeda, subsidio, modo e duodecimos do primeiro troco; sem ele copia os da versao anterior. Recusa (HRC06) refazer versoes que ja estao em vigor antes de hoje, e (HRC13) mais de 200 cortes. Devolve o numero de versoes criadas (0 se a pessoa nao tem retribuicao a partir da data e nao ha campos). Corre na transaccao de quem chama; o trigger de igualdade salarial valida cada INSERT. Lock da pessoa FOR NO KEY UPDATE; ordem de locks do modulo: cargo antes de pessoa.';

-- ==============================================================================
-- 6. rpc_hr_pessoa_mudar_cargo
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_pessoa_mudar_cargo(
  p_pessoa_id uuid,
  p_cargo_id  uuid,
  p_desde     date,
  p_motivo    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_motivo_max     constant integer := 500;
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_org            uuid;
  v_admissao       date;
  v_hoje           date := current_date;
  v_limite_passado date := (current_date - interval '10 years')::date;
  v_cargo_nome     text;
  v_cargo_activo   boolean;
  v_cargo_apagado  timestamptz;
  v_l              public.pessoas_cargos%ROWTYPE;
  v_tem_l          boolean;
  v_substituir     boolean := false;
  v_tem_retrib     boolean;
  v_cargo_antes    uuid;
  v_ve_salario     boolean;
  v_sal_antes      numeric;
  v_per_antes      text;
  v_sal_depois     numeric;
  v_per_depois     text;
  v_motivo_limpo   text;
  v_versoes        integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: e preciso uma sessao autenticada.'
      USING ERRCODE = '42501';
  END IF;

  -- Pessoa que nao existe e falta de permissao dao A MESMA resposta: quem nao
  -- tem acesso nao descobre se um uuid pertence a uma pessoa de outra organizacao.
  SELECT p.organization_id, p.data_admissao INTO v_org, v_admissao
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para mudar o cargo desta pessoa (hr.pessoas.laborais.edit).'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.laborais.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para mudar o cargo desta pessoa (hr.pessoas.laborais.edit).'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data a partir da qual o cargo muda e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_desde < v_limite_passado THEN
    RAISE EXCEPTION 'data_invalida: o cargo nao pode mudar com data anterior a % (maximo 10 anos para tras).', v_limite_passado
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_motivo IS NOT NULL AND char_length(p_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo nao pode ter mais de % caracteres.', c_motivo_max
      USING ERRCODE = 'HRC03';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  -- ORDEM DE LOCKS: o cargo ANTES da pessoa (rpc_hr_cargo_definir_salario faz o
  -- mesmo: cargo e depois cada pessoa), e os dois FOR NO KEY UPDATE, para nao
  -- bloquear as verificacoes de chave estrangeira de quem escreve em pessoas_cargos
  -- (o impasse entre mudar o cargo de uma pessoa e subir o salario desse cargo).
  SELECT c.nome, c.activo, c.deleted_at INTO v_cargo_nome, v_cargo_activo, v_cargo_apagado
    FROM public.hr_cargos c
   WHERE c.id = p_cargo_id AND c.organization_id = v_org
     FOR NO KEY UPDATE;
  IF NOT FOUND OR v_cargo_apagado IS NOT NULL THEN
    RAISE EXCEPTION 'cargo_nao_encontrado: o cargo nao existe nesta organizacao ou foi apagado.'
      USING ERRCODE = 'HRC02';
  END IF;
  IF v_cargo_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'cargo_desactivado: o cargo escolhido esta desactivado. Escolher um cargo activo.'
      USING ERRCODE = 'HRC09';
  END IF;

  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para mudar o cargo desta pessoa (hr.pessoas.laborais.edit).'
      USING ERRCODE = '42501';
  END IF;

  -- D2 (DEPOIS do lock da pessoa: uma retribuicao criada entretanto por outra
  -- transaccao ja conta): mudar o cargo de quem ja tem retribuicao muda-lhe o
  -- salario.
  SELECT EXISTS (
    SELECT 1 FROM public.pessoas_retribuicoes r
     WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
  ) INTO v_tem_retrib;
  IF v_tem_retrib
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: mudar o cargo de quem ja tem retribuicao muda-lhe o salario e exige tambem hr.pessoas.retribuicao.edit.'
      USING ERRCODE = '42501';
  END IF;

  -- Uma data passada que reescreve uma versao ja em vigor e uma CORRECCAO
  -- (exige tambem hr.pessoas.retribuicao.corrigir), como em
  -- rpc_hr_retribuicao_definir_pessoal.
  IF p_desde < v_hoje
     AND EXISTS (
       SELECT 1 FROM public.pessoas_retribuicoes r
        WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
          AND r.valido_de < p_desde
          AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
     )
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.corrigir', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: mudar o cargo com data passada reescreve uma versao de retribuicao ja em vigor e exige tambem hr.pessoas.retribuicao.corrigir.'
      USING ERRCODE = '42501';
  END IF;

  -- Datas (D3). Com linha aberta L: cargo igual -> HRC07; modo normal exige
  -- L.valido_de < p_desde <= hoje; modo substituir (corrigir o cargo de uma
  -- admissao futura) exige p_desde = L.valido_de >= hoje. Sem linha aberta
  -- (ficha antiga sem cargo): de hoje para tras, e nunca antes da admissao.
  SELECT * INTO v_l
    FROM public.pessoas_cargos c
   WHERE c.pessoa_id = p_pessoa_id AND c.valido_ate IS NULL;
  v_tem_l := FOUND;

  IF v_tem_l THEN
    IF v_l.cargo_id = p_cargo_id THEN
      RAISE EXCEPTION 'sem_alteracao: a pessoa ja tem este cargo.'
        USING ERRCODE = 'HRC07';
    END IF;

    IF p_desde = v_l.valido_de AND v_l.valido_de >= v_hoje THEN
      v_substituir := true;
    ELSIF p_desde > v_l.valido_de AND p_desde <= v_hoje THEN
      v_substituir := false;
    ELSE
      RAISE EXCEPTION
        'data_invalida: o cargo so pode mudar a partir do dia a seguir ao inicio do cargo actual (%) e ate hoje (%). Numa admissao futura so se corrige o cargo no proprio dia de inicio.',
        v_l.valido_de, v_hoje
        USING ERRCODE = 'HRC04';
    END IF;
  ELSE
    IF p_desde > v_hoje THEN
      RAISE EXCEPTION 'data_invalida: o cargo so pode comecar ate hoje (%).', v_hoje
        USING ERRCODE = 'HRC04';
    END IF;
    IF v_admissao IS NOT NULL AND p_desde < v_admissao THEN
      RAISE EXCEPTION 'data_invalida: o cargo nao pode comecar antes da data de admissao (%).', v_admissao
        USING ERRCODE = 'HRC04';
    END IF;
  END IF;

  -- Salario antes e depois, calculados ANTES de mexer em nada, e SO para quem
  -- tem hr.pessoas.retribuicao.view (senao ficam NULL: o salario nao se revela
  -- a quem so tem laborais.edit).
  v_ve_salario := public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', v_org);
  v_cargo_antes := public.hr_pessoa_cargo_em(p_pessoa_id, p_desde);

  IF v_ve_salario THEN
    IF v_cargo_antes IS NOT NULL THEN
      SELECT s.salario_base, s.periodicidade INTO v_sal_antes, v_per_antes
        FROM public.hr_cargo_salario_em(v_cargo_antes, p_desde) s;
    ELSE
      -- Ficha sem cargo nessa data: o "antes" e a retribuicao antiga, se tem
      -- (a que cobre a data, senao a primeira que comeca depois).
      SELECT r.valor_base, r.periodicidade INTO v_sal_antes, v_per_antes
        FROM public.pessoas_retribuicoes r
       WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
         AND r.valido_de <= p_desde
         AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
       ORDER BY r.valido_de DESC
       LIMIT 1;
      IF NOT FOUND THEN
        SELECT r.valor_base, r.periodicidade INTO v_sal_antes, v_per_antes
          FROM public.pessoas_retribuicoes r
         WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
           AND r.valido_de > p_desde
         ORDER BY r.valido_de ASC
         LIMIT 1;
      END IF;
    END IF;

    SELECT s.salario_base, s.periodicidade INTO v_sal_depois, v_per_depois
      FROM public.hr_cargo_salario_em(p_cargo_id, p_desde) s;
  END IF;

  v_motivo_limpo := NULLIF(btrim(coalesce(p_motivo, '')), '');

  -- Escreve o historico de cargos; o trigger sincroniza pessoas.cargo_id.
  -- No modo substituir o cargo antigo fica em hr_cargos_correcoes (trigger de
  -- pessoas_cargos), com quem corrigiu (updated_by).
  IF v_substituir THEN
    UPDATE public.pessoas_cargos
       SET cargo_id   = p_cargo_id,
           motivo     = coalesce(v_motivo_limpo, 'Correccao do cargo da admissao'),
           updated_by = v_actor
     WHERE id = v_l.id;
  ELSE
    IF v_tem_l THEN
      UPDATE public.pessoas_cargos
         SET valido_ate = p_desde, updated_by = v_actor
       WHERE id = v_l.id;
    END IF;
    INSERT INTO public.pessoas_cargos
      (organization_id, pessoa_id, cargo_id, valido_de, motivo, created_by)
    VALUES
      (v_org, p_pessoa_id, p_cargo_id, p_desde,
       coalesce(v_motivo_limpo, 'Mudanca de cargo'), v_actor);
  END IF;

  -- Refaz as retribuicoes a partir da data. Nao cria a primeira retribuicao de
  -- quem nao tem nenhuma (isso e o gesto do subsidio e duodecimos).
  v_versoes := public.hr_retribuicao_refazer_desde(
    p_pessoa_id, p_desde, NULL, 'cargo',
    'Mudanca de cargo: ' || v_cargo_nome
      || CASE WHEN v_motivo_limpo IS NOT NULL THEN ' - ' || v_motivo_limpo ELSE '' END,
    v_actor);

  RETURN jsonb_build_object(
    'cargo_anterior_id',     v_cargo_antes,
    'cargo_id',              p_cargo_id,
    'desde',                 p_desde,
    'salario_antes',         v_sal_antes,
    'periodicidade_antes',   v_per_antes,
    'salario_depois',        v_sal_depois,
    'periodicidade_depois',  v_per_depois,
    'versoes_criadas',       v_versoes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_pessoa_mudar_cargo(uuid, uuid, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_pessoa_mudar_cargo(uuid, uuid, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_pessoa_mudar_cargo(uuid, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_pessoa_mudar_cargo(uuid, uuid, date, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_pessoa_mudar_cargo(uuid, uuid, date, text) IS
'Muda o cargo de uma pessoa a partir de p_desde: fecha o cargo em aberto de pessoas_cargos nesse dia e abre o novo (ou, numa admissao futura, corrige o cargo no proprio dia de inicio, e o cargo antigo fica em hr_cargos_correcoes), e refaz as retribuicoes dessa data em diante com o salario do cargo novo. Gate: hr.pessoas.laborais.edit na organizacao da pessoa; pessoa inexistente e falta de permissao dao a mesma resposta (42501). Se a pessoa ja tem retribuicao, tambem hr.pessoas.retribuicao.edit; se a data e passada e reescreve uma versao em vigor, tambem hr.pessoas.retribuicao.corrigir (ambas verificadas depois do lock da pessoa). Datas: so de hoje para tras (o dia seguinte ao inicio do cargo actual; numa ficha sem cargo, entre a admissao e hoje), nunca mais de 10 anos para tras; motivo ate 500 caracteres. Locks: cargo e depois pessoa, FOR NO KEY UPDATE. Erros HRC02, HRC03, HRC04, HRC06, HRC07, HRC09, HRC11, HRC13 e 42501. Devolve jsonb: cargo_anterior_id, cargo_id, desde, salario_antes, periodicidade_antes, salario_depois, periodicidade_depois (estes quatro SO se o chamador tem hr.pessoas.retribuicao.view; senao NULL; sem cargo anterior, o antes e a retribuicao antiga da ficha) e versoes_criadas. Nao cria a primeira retribuicao de quem nao tem nenhuma.';

-- ==============================================================================
-- 7. rpc_hr_retribuicao_definir_pessoal
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_retribuicao_definir_pessoal(
  p_pessoa_id        uuid,
  p_desde            date,
  p_subsidio         numeric,
  p_subsidio_modo    text,
  p_duodecimos_pct   smallint,
  p_motivo           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  c_motivo_max     constant integer := 500;
  v_uid            uuid := auth.uid();
  v_actor          uuid;
  v_org            uuid;
  v_hoje           date := current_date;
  v_limite_passado date := (current_date - interval '10 years')::date;
  v_limite_futuro  date := (current_date + interval '5 years')::date;
  v_cargo          uuid;
  v_vinculo        uuid;
  v_moeda          text;
  v_campos         jsonb;
  v_ve_salario     boolean;
  v_sal            numeric;
  v_per            text;
  v_versoes        integer;
  v_motivo         text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege: e preciso uma sessao autenticada.'
      USING ERRCODE = '42501';
  END IF;

  -- Pessoa inexistente e falta de permissao dao a MESMA resposta.
  SELECT p.organization_id INTO v_org
    FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.edit', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito e obrigatoria.'
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_desde < v_limite_passado OR p_desde > v_limite_futuro THEN
    RAISE EXCEPTION 'data_invalida: a data de efeito tem de estar entre % (10 anos para tras) e % (5 anos para a frente).',
      v_limite_passado, v_limite_futuro
      USING ERRCODE = 'HRC04';
  END IF;
  IF p_motivo IS NOT NULL AND char_length(p_motivo) > c_motivo_max THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o motivo nao pode ter mais de % caracteres.', c_motivo_max
      USING ERRCODE = 'HRC03';
  END IF;

  IF p_subsidio IS NOT NULL AND p_subsidio < 0 THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o subsidio de alimentacao nao pode ser negativo.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_subsidio_modo IS NOT NULL AND p_subsidio_modo NOT IN ('dinheiro', 'cartao') THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: o modo do subsidio de alimentacao tem de ser dinheiro ou cartao.'
      USING ERRCODE = 'HRC03';
  END IF;
  IF p_duodecimos_pct IS NOT NULL AND p_duodecimos_pct NOT IN (0, 50, 100) THEN
    RAISE EXCEPTION 'cargo_dados_invalidos: os duodecimos tem de ser 0, 50 ou 100 por cento.'
      USING ERRCODE = 'HRC03';
  END IF;

  SELECT au.id INTO v_actor FROM public.anew_users au WHERE au.auth_user_id = v_uid LIMIT 1;

  -- Serializa quem mexe na mesma pessoa. FOR NO KEY UPDATE (nao bloqueia as
  -- verificacoes de chave estrangeira). Esta funcao nao bloqueia cargos: so le o
  -- salario do cargo, e nunca espera por um cargo enquanto tem a pessoa (a ordem
  -- de locks do modulo e cargo antes de pessoa).
  PERFORM 1 FROM public.pessoas p
   WHERE p.id = p_pessoa_id AND p.deleted_at IS NULL
     FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege: a pessoa nao existe, ou nao tem permissao para definir o subsidio e os duodecimos desta pessoa (hr.pessoas.retribuicao.edit).'
      USING ERRCODE = '42501';
  END IF;

  -- Sem cargo nessa data nao ha salario base.
  v_cargo := public.hr_pessoa_cargo_em(p_pessoa_id, p_desde);
  IF v_cargo IS NULL THEN
    RAISE EXCEPTION 'retribuicao_sem_cargo: a pessoa nao tem cargo em %. Atribua primeiro um cargo (separador Laborais da ficha).',
      p_desde
      USING ERRCODE = 'HRC11';
  END IF;

  -- Uma data passada que reescreve uma versao ja em vigor e uma CORRECCAO
  -- (exige tambem hr.pessoas.retribuicao.corrigir). Quem ainda nao tem
  -- nenhuma versao (a criacao da ficha) nao e afectado.
  IF p_desde < v_hoje
     AND EXISTS (
       SELECT 1 FROM public.pessoas_retribuicoes r
        WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
          AND r.valido_de < p_desde
          AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
     )
     AND NOT public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.corrigir', v_org) THEN
    RAISE EXCEPTION 'insufficient_privilege: alterar o subsidio e os duodecimos com data passada reescreve uma versao ja em vigor e exige tambem hr.pessoas.retribuicao.corrigir.'
      USING ERRCODE = '42501';
  END IF;

  -- Vinculo e moeda: os da versao que cobre a data; senao o vinculo mais
  -- recente que nao terminou e EUR.
  SELECT r.vinculo_id, r.moeda INTO v_vinculo, v_moeda
    FROM public.pessoas_retribuicoes r
   WHERE r.pessoa_id = p_pessoa_id AND r.deleted_at IS NULL
     AND r.valido_de <= p_desde
     AND (r.valido_ate IS NULL OR r.valido_ate > p_desde)
   ORDER BY r.valido_de DESC
   LIMIT 1;
  IF NOT FOUND THEN
    v_moeda := 'EUR';
    SELECT v.id INTO v_vinculo
      FROM public.pessoas_vinculos v
     WHERE v.pessoa_id = p_pessoa_id AND v.organization_id = v_org
       AND v.deleted_at IS NULL AND v.estado <> 'terminado'
     ORDER BY v.data_inicio DESC
     LIMIT 1;
  END IF;

  v_campos := jsonb_build_object(
    'vinculo_id',                 v_vinculo,
    'moeda',                      coalesce(v_moeda, 'EUR'),
    'subsidio_alimentacao',       p_subsidio,
    'subsidio_alimentacao_modo',  p_subsidio_modo,
    'duodecimos_pct',             p_duodecimos_pct
  );

  v_motivo := coalesce(NULLIF(btrim(coalesce(p_motivo, '')), ''), 'Subsidio e duodecimos');

  v_versoes := public.hr_retribuicao_refazer_desde(
    p_pessoa_id, p_desde, v_campos, 'pessoa', v_motivo, v_actor);

  -- O salario base aplicado so se devolve a quem tem hr.pessoas.retribuicao.view.
  IF public.has_anew_permission_in_org(v_uid, 'hr.pessoas.retribuicao.view', v_org) THEN
    SELECT s.salario_base, s.periodicidade INTO v_sal, v_per
      FROM public.hr_cargo_salario_em(v_cargo, p_desde) s;
  END IF;

  RETURN jsonb_build_object(
    'versoes_criadas', v_versoes,
    'desde',           p_desde,
    'salario_base',    v_sal,
    'periodicidade',   v_per
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_retribuicao_definir_pessoal(uuid, date, numeric, text, smallint, text) IS
'Define o subsidio de alimentacao (valor e modo) e os duodecimos de uma pessoa a partir de p_desde: cria uma versao nova de pessoas_retribuicoes (origem pessoa) com o salario base do cargo NESSA data, fecha a anterior nessa data, e preserva o resto (uma versao pessoa ainda nao em vigor a comecar exactamente em p_desde e substituida). NUNCA reabre uma retribuicao ja fechada: a versao nova acaba onde acabava a que cobria a data. E tambem a funcao que cria a PRIMEIRA versao de quem tem cargo e ainda nao tem retribuicao (essa fica em aberto). Gate: hr.pessoas.retribuicao.edit; pessoa inexistente e falta de permissao dao a mesma resposta (42501); uma data passada que reescreve uma versao ja em vigor exige tambem hr.pessoas.retribuicao.corrigir. Datas: entre 10 anos para tras e 5 anos para a frente; motivo ate 500 caracteres. Valida: subsidio >= 0 ou NULL; modo NULL, dinheiro ou cartao; duodecimos NULL, 0, 50 ou 100 (HRC03); pessoa com cargo na data (HRC11). Devolve jsonb: versoes_criadas, desde, salario_base e periodicidade (estes dois SO se o chamador tem hr.pessoas.retribuicao.view; senao NULL).';

-- ==============================================================================
-- Conferir. Estrutura + teste fabricado (organizacao, cargos e pessoas proprios;
-- as RPCs publicas tem gate e auth.uid() e nulo numa migration: testam-se as
-- funcoes internas, o gate testa-se ao vivo). Bloco aninhado que TERMINA sempre
-- em HR900. WHEN OTHERS nunca engole SQLSTATE/SQLERRM reais.
-- ==============================================================================
DO $conferir$
DECLARE
  v_total      integer;
  v_restr      integer;
  v_corpo      text;
BEGIN
  -- 1. Estrutura
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_retribuicoes' AND column_name = 'origem'
  ) THEN
    RAISE EXCEPTION 'pessoas_retribuicoes.origem nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_retribuicoes_origem_valida'
       AND conrelid = to_regclass('public.pessoas_retribuicoes')
  ) THEN
    RAISE EXCEPTION 'O CHECK pessoas_retribuicoes_origem_valida nao ficou criado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_retribuicoes_igualdade_salarial'
       AND tgrelid = to_regclass('public.pessoas_retribuicoes')
  ) THEN
    RAISE EXCEPTION 'O trigger de igualdade salarial deixou de estar ligado a pessoas_retribuicoes.';
  END IF;

  v_corpo := pg_get_functiondef(to_regprocedure('public.hr_retribuicao_valor_conforme_cargo()'));
  IF position('hr_pessoa_cargo_em' IN v_corpo) = 0
     OR position('hr_cargo_salario_em' IN v_corpo) = 0
     OR position('SECURITY DEFINER' IN v_corpo) = 0 THEN
    RAISE EXCEPTION 'hr_retribuicao_valor_conforme_cargo nao e a versao nova (devia usar hr_pessoa_cargo_em e hr_cargo_salario_em e ser SECURITY DEFINER).';
  END IF;

  SELECT count(*) INTO v_restr
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_retribuicoes'
     AND policyname = 'pessoas_retribuicoes_insert_so_por_rpc'
     AND permissive = 'RESTRICTIVE' AND cmd = 'INSERT';
  IF v_restr <> 1 THEN
    RAISE EXCEPTION 'A politica RESTRICTIVE pessoas_retribuicoes_insert_so_por_rpc nao ficou criada.';
  END IF;

  SELECT count(*) INTO v_total
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_retribuicoes'
     AND policyname IN ('pessoas_retribuicoes_select', 'pessoas_retribuicoes_insert',
                        'pessoas_retribuicoes_update', 'pessoas_retribuicoes_block_delete');
  IF v_total <> 4 THEN
    RAISE EXCEPTION 'As 4 politicas antigas de pessoas_retribuicoes deviam continuar la (nenhuma foi apagada); encontraram-se %.', v_total;
  END IF;

  SELECT count(*) INTO v_restr
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'pessoas_retribuicoes'
     AND policyname = 'pessoas_retribuicoes_update_sem_apagar'
     AND permissive = 'RESTRICTIVE' AND cmd = 'UPDATE';
  IF v_restr <> 1 THEN
    RAISE EXCEPTION 'A politica RESTRICTIVE pessoas_retribuicoes_update_sem_apagar nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_retribuicoes_0_escrita_so_por_rpc'
       AND tgrelid = to_regclass('public.pessoas_retribuicoes')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_pessoas_retribuicoes_0_escrita_so_por_rpc nao ficou criado.';
  END IF;

  -- 2. Privilegios: RPCs publicas so para authenticated e service_role; internas para ninguem.
  IF has_function_privilege('anon', 'public.rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_hr_retribuicao_definir_pessoal(uuid,date,numeric,text,smallint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'As RPCs de cargo e retribuicao nao deviam ser executaveis por anon.';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.rpc_hr_pessoa_mudar_cargo(uuid,uuid,date,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_hr_retribuicao_definir_pessoal(uuid,date,numeric,text,smallint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'As RPCs de cargo e retribuicao deviam ser executaveis por authenticated.';
  END IF;
  IF has_function_privilege('anon', 'public.hr_retribuicao_refazer_desde(uuid,date,jsonb,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.hr_retribuicao_refazer_desde(uuid,date,jsonb,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.hr_retribuicao_refazer_desde(uuid,date,jsonb,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hr_retribuicao_refazer_desde e interna: ninguem alem do dono devia poder executa-la.';
  END IF;

  -- 3. Teste fabricado
  DECLARE
    v_org      uuid;
    v_cargo1   uuid;
    v_cargo2   uuid;
    v_cargo3   uuid;
    v_ana      uuid;
    v_bruno    uuid;
    v_diana    uuid;
    v_eva      uuid;
    v_fred     uuid;
    v_gil      uuid;
    v_ivo      uuid;
    v_hugo     uuid;
    v_cargo4   uuid;
    v_hoje     date := current_date;
    v_stamp    timestamptz;
    v_msg1     text;
    v_msg2     text;
    v_i        integer;
    v_n        integer;
    v_linhas   integer;
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('Teste migracao 20261210120000 (descartavel)')
    RETURNING id INTO v_org;

    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 1 20261210120000', 1000, 'mensal') RETURNING id INTO v_cargo1;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 2 20261210120000', 1100, 'mensal') RETURNING id INTO v_cargo2;
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 3 20261210120000', 2000, 'mensal') RETURNING id INTO v_cargo3;

    -- Ana (0 por cento, subsidio 6,00) e Bruno (50 por cento, 7,50) no cargo 1,
    -- com versoes abertas desde ha 60 dias. Diana e Eva no cargo 3.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Ana', 'Teste 20261210120000', v_cargo1, v_hoje - 60) RETURNING id INTO v_ana;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Bruno', 'Teste 20261210120000', v_cargo1, v_hoje - 60) RETURNING id INTO v_bruno;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Diana', 'Teste 20261210120000', v_cargo3, v_hoje - 60) RETURNING id INTO v_diana;
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Eva', 'Teste 20261210120000', v_cargo3, v_hoje - 60) RETURNING id INTO v_eva;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade,
       subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct, valido_de, valido_ate, motivo)
    VALUES
      (v_ana,   v_org, 1000, 'EUR', 'mensal', 6.00, 'dinheiro', 0,  v_hoje - 60, NULL, 'teste'),
      (v_bruno, v_org, 1000, 'EUR', 'mensal', 7.50, 'cartao',   50, v_hoje - 60, NULL, 'teste'),
      (v_diana, v_org, 2000, 'EUR', 'mensal', NULL, NULL,       50, v_hoje - 60, NULL, 'teste');

    -- A. INSERT directo, como dono, com valor errado -> 23514 igualdade_salarial
    BEGIN
      INSERT INTO public.pessoas_retribuicoes
        (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
      VALUES (v_ana, v_org, 999, 'EUR', 'mensal', v_hoje - 59, v_hoje - 58);
      RAISE EXCEPTION 'Uma versao com valor diferente do cargo devia ter sido recusada.' USING ERRCODE = 'HR901';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN
        IF position('igualdade_salarial:' IN SQLERRM) <> 1 THEN
          RAISE EXCEPTION 'Mensagem inesperada (devia comecar por igualdade_salarial:): %', SQLERRM USING ERRCODE = 'HR902';
        END IF;
    END;

    -- B. Versao numa data em que a pessoa ainda nao tinha cargo -> HRC11
    BEGIN
      INSERT INTO public.pessoas_retribuicoes
        (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
      VALUES (v_ana, v_org, 1000, 'EUR', 'mensal', v_hoje - 100, v_hoje - 70);
      RAISE EXCEPTION 'Uma versao antes de a pessoa ter cargo devia ter sido recusada.' USING ERRCODE = 'HR903';
    EXCEPTION
      WHEN SQLSTATE 'HRC11' THEN NULL;
    END;

    -- C. A origem de uma versao nao se altera
    BEGIN
      UPDATE public.pessoas_retribuicoes SET origem = 'cargo' WHERE pessoa_id = v_ana;
      RAISE EXCEPTION 'Mudar a origem de uma versao devia ter sido recusado.' USING ERRCODE = 'HR904';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN
        IF position('origem' IN SQLERRM) = 0 THEN
          RAISE EXCEPTION 'Mensagem inesperada ao mudar a origem: %', SQLERRM USING ERRCODE = 'HR905';
        END IF;
    END;

    -- D. refazer: mudar a Ana para o cargo 2 (1100) desde hoje
    UPDATE public.pessoas_cargos SET valido_ate = v_hoje
     WHERE pessoa_id = v_ana AND valido_ate IS NULL;
    INSERT INTO public.pessoas_cargos (organization_id, pessoa_id, cargo_id, valido_de, motivo)
    VALUES (v_org, v_ana, v_cargo2, v_hoje, 'teste');

    v_n := public.hr_retribuicao_refazer_desde(v_ana, v_hoje, NULL, 'cargo', 'teste', NULL);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'refazer_desde da Ana devia criar 1 versao, criou %.', v_n USING ERRCODE = 'HR906';
    END IF;

    SELECT count(*) INTO v_linhas
      FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ana AND deleted_at IS NULL AND valor_base = 1000
       AND valido_de = v_hoje - 60 AND valido_ate = v_hoje AND duodecimos_pct = 0 AND subsidio_alimentacao = 6.00;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A versao antiga da Ana devia ter ficado fechada hoje com 1000, 0 por cento e 6,00 (encontradas %).', v_linhas
        USING ERRCODE = 'HR907';
    END IF;

    SELECT count(*) INTO v_linhas
      FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ana AND deleted_at IS NULL AND valor_base = 1100 AND valido_de = v_hoje
       AND valido_ate IS NULL AND duodecimos_pct = 0 AND subsidio_alimentacao = 6.00
       AND subsidio_alimentacao_modo = 'dinheiro' AND origem = 'cargo';
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A Ana devia ter uma versao aberta desde hoje com 1100, 0 por cento, 6,00 e origem cargo (encontradas %).', v_linhas
        USING ERRCODE = 'HR908';
    END IF;

    -- E. definir pessoal no futuro (+30 dias) para o Bruno, com 100 por cento:
    --    cria a versao futura e mantem a de hoje (fechada nessa data).
    v_n := public.hr_retribuicao_refazer_desde(
      v_bruno, v_hoje + 30,
      jsonb_build_object('vinculo_id', NULL, 'moeda', 'EUR', 'subsidio_alimentacao', 7.50,
                         'subsidio_alimentacao_modo', 'cartao', 'duodecimos_pct', 100),
      'pessoa', 'teste', NULL);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'definir pessoal futuro do Bruno devia criar 1 versao, criou %.', v_n USING ERRCODE = 'HR909';
    END IF;

    SELECT count(*) INTO v_linhas
      FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_bruno AND deleted_at IS NULL AND valor_base = 1000
       AND valido_de = v_hoje - 60 AND valido_ate = v_hoje + 30 AND duodecimos_pct = 50;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A versao de hoje do Bruno devia ter ficado fechada em hoje + 30 com 50 por cento (encontradas %).', v_linhas
        USING ERRCODE = 'HR910';
    END IF;

    SELECT count(*) INTO v_linhas
      FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_bruno AND deleted_at IS NULL AND valor_base = 1000
       AND valido_de = v_hoje + 30 AND valido_ate IS NULL AND duodecimos_pct = 100 AND origem = 'pessoa';
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'O Bruno devia ter uma versao aberta desde hoje + 30 com 100 por cento e origem pessoa (encontradas %).', v_linhas
        USING ERRCODE = 'HR911';
    END IF;

    -- F. Versao em vigor depois da data -> HRC06 (a versao da Ana de ha 60 dias)
    BEGIN
      PERFORM public.hr_retribuicao_refazer_desde(v_ana, v_hoje - 61, NULL, 'cargo', 'teste', NULL);
      RAISE EXCEPTION 'Refazer por cima de uma versao ja em vigor devia ter sido recusado.' USING ERRCODE = 'HR912';
    EXCEPTION
      WHEN SQLSTATE 'HRC06' THEN NULL;
    END;

    -- G. Pessoa inexistente -> HRC12
    BEGIN
      PERFORM public.hr_retribuicao_refazer_desde(gen_random_uuid(), v_hoje, NULL, 'cargo', 'teste', NULL);
      RAISE EXCEPTION 'Refazer uma pessoa inexistente devia ter sido recusado.' USING ERRCODE = 'HR913';
    EXCEPTION
      WHEN SQLSTATE 'HRC12' THEN NULL;
    END;

    -- H. O defeito antigo: o cargo 3 muda de salario (2100 desde hoje + 30), e
    --    FECHAR a versao aberta da Diana nao e recusado. A versao fecha para la do
    --    corte (hoje + 40, depois da mudanca em hoje + 30): sem o ramo de salto do
    --    trigger, este UPDATE seria uma versao que atravessa a mudanca e era
    --    recusado (23514) -- por isso o teste PODE falhar. (Fechar exactamente em
    --    hoje + 30 passava mesmo sem o ramo de salto.)
    UPDATE public.hr_cargos_periodos SET valido_ate = v_hoje + 30
     WHERE cargo_id = v_cargo3 AND valido_ate IS NULL;
    INSERT INTO public.hr_cargos_periodos
      (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo)
    VALUES (v_org, v_cargo3, 2100, 'mensal', v_hoje + 30, 'teste');

    UPDATE public.pessoas_retribuicoes SET valido_ate = v_hoje + 40
     WHERE pessoa_id = v_diana AND valido_ate IS NULL AND deleted_at IS NULL;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'Fechar (para la do corte) a versao aberta da Diana devia afectar 1 linha, afectou %.', v_linhas USING ERRCODE = 'HR914';
    END IF;

    -- I. Versao que atravessa a mudanca do cargo (Eva, aberta desde hoje - 10) -> 23514
    BEGIN
      INSERT INTO public.pessoas_retribuicoes
        (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
      VALUES (v_eva, v_org, 2000, 'EUR', 'mensal', v_hoje - 10, NULL);
      RAISE EXCEPTION 'Uma versao que atravessa uma mudanca do cargo devia ter sido recusada.' USING ERRCODE = 'HR915';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN
        IF position('atravessa' IN SQLERRM) = 0 THEN
          RAISE EXCEPTION 'Mensagem inesperada (devia dizer que atravessa uma mudanca): %', SQLERRM USING ERRCODE = 'HR916';
        END IF;
    END;

    -- J. A mesma versao, terminada na data da mudanca, passa; e a seguinte
    --    tem de ter o valor novo (2000 em hoje + 30 e recusado, 2100 passa).
    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
    VALUES (v_eva, v_org, 2000, 'EUR', 'mensal', v_hoje - 10, v_hoje + 30);

    BEGIN
      INSERT INTO public.pessoas_retribuicoes
        (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
      VALUES (v_eva, v_org, 2000, 'EUR', 'mensal', v_hoje + 30, NULL);
      RAISE EXCEPTION 'Uma versao com o valor antigo depois da subida devia ter sido recusada.' USING ERRCODE = 'HR917';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN
        IF position('igualdade_salarial:' IN SQLERRM) <> 1 THEN
          RAISE EXCEPTION 'Mensagem inesperada (devia comecar por igualdade_salarial:): %', SQLERRM USING ERRCODE = 'HR918';
        END IF;
    END;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
    VALUES (v_eva, v_org, 2100, 'EUR', 'mensal', v_hoje + 30, NULL);

    -- K. Todas as versoes vivas do teste batem com o cargo na sua data
    --    (a igualdade ficou garantida em cada INSERT; contagem de rede de seguranca).
    SELECT count(*) INTO v_linhas
      FROM public.pessoas_retribuicoes r
      JOIN public.pessoas p ON p.id = r.pessoa_id
     WHERE p.organization_id = v_org AND r.deleted_at IS NULL
       AND (SELECT s.salario_base FROM public.hr_cargo_salario_em(public.hr_pessoa_cargo_em(r.pessoa_id, r.valido_de), r.valido_de) s)
           IS DISTINCT FROM r.valor_base;
    IF v_linhas <> 0 THEN
      RAISE EXCEPTION '% versao(oes) de teste com valor diferente do cargo na sua data.', v_linhas USING ERRCODE = 'HR919';
    END IF;

    -- L. LACUNA: o Fred tem uma versao fechada (acabou ha 30 dias) e uma escolha
    --    pessoal agendada para hoje + 10. Muda para o cargo 2 desde hoje: a versao
    --    nova comeca em hoje + 10 (na primeira versao a seguir, nunca em hoje),
    --    com o salario do cargo 2, e mantem os campos e a origem da escolha.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Fred', 'Teste 20261210120000', v_cargo1, v_hoje - 60) RETURNING id INTO v_fred;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade,
       subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct, valido_de, valido_ate, motivo)
    VALUES
      (v_fred, v_org, 1000, 'EUR', 'mensal', 5.00, 'dinheiro', 0,   v_hoje - 60, v_hoje - 30, 'teste'),
      (v_fred, v_org, 1000, 'EUR', 'mensal', 5.00, 'cartao',   100, v_hoje + 10, NULL,        'escolha futura');

    UPDATE public.pessoas_cargos SET valido_ate = v_hoje
     WHERE pessoa_id = v_fred AND valido_ate IS NULL;
    INSERT INTO public.pessoas_cargos (organization_id, pessoa_id, cargo_id, valido_de, motivo)
    VALUES (v_org, v_fred, v_cargo2, v_hoje, 'teste');

    v_n := public.hr_retribuicao_refazer_desde(v_fred, v_hoje, NULL, 'cargo', 'teste', NULL);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Refazer o Fred devia criar 1 versao (a que comeca em hoje + 10), criou %.', v_n USING ERRCODE = 'HR920';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_fred AND deleted_at IS NULL AND valor_base = 1100
       AND valido_de = v_hoje + 10 AND valido_ate IS NULL AND duodecimos_pct = 100
       AND subsidio_alimentacao = 5.00 AND origem = 'pessoa';
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'O Fred devia ter uma versao aberta desde hoje + 10 com 1100, 100 por cento, 5,00 e origem pessoa (encontradas %).', v_linhas
        USING ERRCODE = 'HR921';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_fred AND deleted_at IS NULL
       AND (valido_de = v_hoje OR (valido_de = v_hoje - 60 AND valido_ate IS DISTINCT FROM v_hoje - 30));
    IF v_linhas <> 0 THEN
      RAISE EXCEPTION 'A lacuna do Fred foi tapada ou a versao antiga alterada (% linha(s) a mais).', v_linhas USING ERRCODE = 'HR922';
    END IF;

    -- M. ESCOLHA PESSOAL AGENDADA NO PROPRIO DIA: o Gil tem uma escolha pessoal
    --    (100 por cento, 9,00 cartao) a comecar em hoje + 5 e muda de cargo nesse
    --    dia. A versao nova leva o salario do cargo novo e MANTEM os campos
    --    pessoais, a origem pessoa e o created_at original.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Gil', 'Teste 20261210120000', v_cargo1, v_hoje - 60) RETURNING id INTO v_gil;

    v_stamp := now() - interval '3 days';
    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade,
       subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct, valido_de, valido_ate, motivo, created_at)
    VALUES
      (v_gil, v_org, 1000, 'EUR', 'mensal', 4.00, 'dinheiro', 0,   v_hoje - 60, v_hoje + 5, 'teste', now()),
      (v_gil, v_org, 1000, 'EUR', 'mensal', 9.00, 'cartao',   100, v_hoje + 5,  NULL,       'escolha futura', v_stamp);

    UPDATE public.pessoas_cargos SET valido_ate = v_hoje + 5
     WHERE pessoa_id = v_gil AND valido_ate IS NULL;
    INSERT INTO public.pessoas_cargos (organization_id, pessoa_id, cargo_id, valido_de, motivo)
    VALUES (v_org, v_gil, v_cargo2, v_hoje + 5, 'teste');

    v_n := public.hr_retribuicao_refazer_desde(v_gil, v_hoje + 5, NULL, 'cargo', 'teste', NULL);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Refazer o Gil devia criar 1 versao, criou %.', v_n USING ERRCODE = 'HR923';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_gil AND deleted_at IS NULL AND valor_base = 1100
       AND valido_de = v_hoje + 5 AND valido_ate IS NULL AND duodecimos_pct = 100
       AND subsidio_alimentacao = 9.00 AND subsidio_alimentacao_modo = 'cartao'
       AND origem = 'pessoa' AND created_at = v_stamp;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'O Gil devia manter a escolha pessoal (100 por cento, 9,00 cartao, origem pessoa, created_at original) com 1100 (encontradas %).', v_linhas
        USING ERRCODE = 'HR924';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_gil AND deleted_at IS NULL AND valido_de = v_hoje - 60
       AND valido_ate = v_hoje + 5 AND valor_base = 1000;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A versao anterior do Gil devia ter ficado intacta (encontradas %).', v_linhas USING ERRCODE = 'HR925';
    END IF;

    -- N. DEFINIR SUBSIDIO NAO REABRE o que esta fechado: o Ivo tem uma versao que
    --    acaba em hoje + 20. Definir o subsidio desde hoje fecha a antiga hoje e
    --    cria uma versao de hoje a hoje + 20 -- nenhuma fica em aberto.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Ivo', 'Teste 20261210120000', v_cargo1, v_hoje - 60) RETURNING id INTO v_ivo;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade,
       subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct, valido_de, valido_ate, motivo)
    VALUES
      (v_ivo, v_org, 1000, 'EUR', 'mensal', 4.00, 'dinheiro', 0, v_hoje - 60, v_hoje + 20, 'teste');

    v_n := public.hr_retribuicao_refazer_desde(
      v_ivo, v_hoje,
      jsonb_build_object('vinculo_id', NULL, 'moeda', 'EUR', 'subsidio_alimentacao', 6.50,
                         'subsidio_alimentacao_modo', 'cartao', 'duodecimos_pct', 50),
      'pessoa', 'teste', NULL);
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'Definir o subsidio do Ivo devia criar 1 versao, criou %.', v_n USING ERRCODE = 'HR926';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ivo AND deleted_at IS NULL AND valido_de = v_hoje AND valido_ate = v_hoje + 20
       AND duodecimos_pct = 50 AND subsidio_alimentacao = 6.50;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'O Ivo devia ter uma versao de hoje a hoje + 20 (encontradas %).', v_linhas USING ERRCODE = 'HR927';
    END IF;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_ivo AND deleted_at IS NULL AND valido_ate IS NULL;
    IF v_linhas <> 0 THEN
      RAISE EXCEPTION 'Definir o subsidio reabriu uma retribuicao fechada do Ivo (% em aberto).', v_linhas USING ERRCODE = 'HR928';
    END IF;

    -- O. Limite de cortes: um cargo com 201 periodos futuros e uma pessoa com
    --    retribuicao em aberto -> HRC13, e nada e alterado.
    INSERT INTO public.hr_cargos (organization_id, nome, salario_base, periodicidade)
    VALUES (v_org, 'Cargo 4 20261210120000', 1000, 'mensal') RETURNING id INTO v_cargo4;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, cargo_id, data_admissao)
    VALUES (v_org, 'Hugo', 'Teste 20261210120000', v_cargo4, v_hoje - 60) RETURNING id INTO v_hugo;

    INSERT INTO public.pessoas_retribuicoes
      (pessoa_id, organization_id, valor_base, moeda, periodicidade, duodecimos_pct, valido_de, valido_ate, motivo)
    VALUES (v_hugo, v_org, 1000, 'EUR', 'mensal', 50, v_hoje - 60, NULL, 'teste');

    FOR v_i IN 1 .. 201 LOOP
      UPDATE public.hr_cargos_periodos SET valido_ate = v_hoje + v_i
       WHERE cargo_id = v_cargo4 AND valido_ate IS NULL;
      INSERT INTO public.hr_cargos_periodos
        (organization_id, cargo_id, salario_base, periodicidade, valido_de, motivo)
      VALUES (v_org, v_cargo4, 1000 + v_i, 'mensal', v_hoje + v_i, 'teste');
    END LOOP;

    BEGIN
      PERFORM public.hr_retribuicao_refazer_desde(v_hugo, v_hoje, NULL, 'subida_cargo', 'teste', NULL);
      RAISE EXCEPTION 'Mais de 200 cortes devia ter sido recusado.' USING ERRCODE = 'HR929';
    EXCEPTION
      WHEN SQLSTATE 'HRC13' THEN NULL;
    END;

    SELECT count(*) INTO v_linhas FROM public.pessoas_retribuicoes
     WHERE pessoa_id = v_hugo AND deleted_at IS NULL AND valido_de = v_hoje - 60 AND valido_ate IS NULL;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'A recusa por limite de cortes nao devia ter alterado a retribuicao do Hugo (encontradas %).', v_linhas
        USING ERRCODE = 'HR930';
    END IF;

    -- P. Com uma sessao de utilizador FABRICADA (request.jwt.claim.sub = um uuid
    --    qualquer, sem papeis nem permissoes): o trigger recusa o UPDATE directo
    --    que apaga, que muda uma versao em vigor, e que reabre uma ja decorrida;
    --    deixa passar o que e legitimo (corrigir o motivo; corrigir o subsidio de
    --    uma versao ja decorrida). Depois, as duas RPCs dao a MESMA resposta a uma
    --    pessoa que existe e a uma que nao existe (42501).
    PERFORM set_config('request.jwt.claim.sub', x.u::text, true),
                  set_config('request.jwt.claims', json_build_object('sub', x.u, 'role', 'authenticated')::text, true)
      FROM (SELECT gen_random_uuid() AS u) x;

    -- INSERT directo: recusado (42501) sem revelar o salario do cargo (a
    -- mensagem do trigger de igualdade diria "o cargo ... paga ...").
    v_msg1 := NULL;
    BEGIN
      INSERT INTO public.pessoas_retribuicoes
        (pessoa_id, organization_id, valor_base, moeda, periodicidade, valido_de, valido_ate)
      VALUES (v_eva, v_org, 1, 'EUR', 'mensal', v_hoje + 100, NULL);
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg1 := SQLERRM;
    END;
    IF v_msg1 IS NULL THEN
      RAISE EXCEPTION 'Um INSERT directo de retribuicao por um utilizador devia ter sido recusado (42501).' USING ERRCODE = 'HR939';
    END IF;
    IF position('paga' IN v_msg1) > 0 OR position('igualdade_salarial' IN v_msg1) > 0 THEN
      RAISE EXCEPTION 'A recusa do INSERT directo nao devia revelar o salario do cargo: %', v_msg1 USING ERRCODE = 'HR940';
    END IF;

    BEGIN
      UPDATE public.pessoas_retribuicoes SET deleted_at = now()
       WHERE pessoa_id = v_eva AND valido_ate IS NULL AND deleted_at IS NULL;
      RAISE EXCEPTION 'Apagar uma versao por acesso directo devia ter sido recusado.' USING ERRCODE = 'HR931';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN NULL;
    END;

    BEGIN
      UPDATE public.pessoas_retribuicoes SET valido_ate = v_hoje + 90
       WHERE pessoa_id = v_eva AND valido_ate IS NULL AND deleted_at IS NULL;
      RAISE EXCEPTION 'Mudar valido_ate de uma versao em vigor por acesso directo devia ter sido recusado.' USING ERRCODE = 'HR932';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN NULL;
    END;

    BEGIN
      UPDATE public.pessoas_retribuicoes SET subsidio_alimentacao = 3.00
       WHERE pessoa_id = v_eva AND valido_ate IS NULL AND deleted_at IS NULL;
      RAISE EXCEPTION 'Mudar o subsidio de uma versao em vigor por acesso directo devia ter sido recusado.' USING ERRCODE = 'HR933';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN NULL;
    END;

    UPDATE public.pessoas_retribuicoes SET motivo = 'nota corrigida'
     WHERE pessoa_id = v_eva AND valido_ate IS NULL AND deleted_at IS NULL;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'Corrigir o motivo de uma versao em vigor devia passar (afectou % linhas).', v_linhas USING ERRCODE = 'HR934';
    END IF;

    BEGIN
      UPDATE public.pessoas_retribuicoes SET valido_ate = NULL
       WHERE pessoa_id = v_fred AND valido_de = v_hoje - 60 AND deleted_at IS NULL;
      RAISE EXCEPTION 'Reabrir uma versao ja decorrida por acesso directo devia ter sido recusado.' USING ERRCODE = 'HR935';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN NULL;
    END;

    UPDATE public.pessoas_retribuicoes SET subsidio_alimentacao = 5.50
     WHERE pessoa_id = v_fred AND valido_de = v_hoje - 60 AND deleted_at IS NULL;
    GET DIAGNOSTICS v_linhas = ROW_COUNT;
    IF v_linhas <> 1 THEN
      RAISE EXCEPTION 'Corrigir o subsidio de uma versao ja decorrida devia passar (afectou % linhas).', v_linhas USING ERRCODE = 'HR936';
    END IF;

    v_msg1 := NULL;
    v_msg2 := NULL;
    BEGIN
      PERFORM public.rpc_hr_pessoa_mudar_cargo(v_eva, v_cargo1, v_hoje, 'x');
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg1 := SQLERRM;
    END;
    BEGIN
      PERFORM public.rpc_hr_pessoa_mudar_cargo(gen_random_uuid(), v_cargo1, v_hoje, 'x');
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg2 := SQLERRM;
    END;
    IF v_msg1 IS NULL OR v_msg1 IS DISTINCT FROM v_msg2 THEN
      RAISE EXCEPTION 'rpc_hr_pessoa_mudar_cargo devia dar a mesma resposta 42501 a uma pessoa que existe e a uma que nao existe (% / %).', v_msg1, v_msg2
        USING ERRCODE = 'HR937';
    END IF;

    v_msg1 := NULL;
    v_msg2 := NULL;
    BEGIN
      PERFORM public.rpc_hr_retribuicao_definir_pessoal(v_eva, v_hoje, 5, 'dinheiro', 0::smallint, 'x');
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg1 := SQLERRM;
    END;
    BEGIN
      PERFORM public.rpc_hr_retribuicao_definir_pessoal(gen_random_uuid(), v_hoje, 5, 'dinheiro', 0::smallint, 'x');
    EXCEPTION
      WHEN SQLSTATE '42501' THEN v_msg2 := SQLERRM;
    END;
    IF v_msg1 IS NULL OR v_msg1 IS DISTINCT FROM v_msg2 THEN
      RAISE EXCEPTION 'rpc_hr_retribuicao_definir_pessoal devia dar a mesma resposta 42501 a uma pessoa que existe e a uma que nao existe (% / %).', v_msg1, v_msg2
        USING ERRCODE = 'HR938';
    END IF;

    PERFORM set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{}', true);

    RAISE EXCEPTION 'teste_retribuicao_vem_do_cargo_20261210120000_ok' USING ERRCODE = 'HR900';
  EXCEPTION
    WHEN SQLSTATE 'HR900' THEN
      NULL; -- sucesso: tudo o que o teste criou e desfeito pela subtransaccao
    WHEN OTHERS THEN
      RAISE EXCEPTION
        'Um dos testes ao vivo desta migration (retribuicao vem do cargo) falhou -- SQLSTATE %: %',
        SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE
    'OK: pessoas_retribuicoes.origem criada, trigger de igualdade substituido (cargo e salario do cargo NA DATA; fechar uma versao, ate para la de uma mudanca, ja nao e recusado), INSERT directo fechado por politica RESTRICTIVE, INSERT e UPDATE directos guardados por trigger, RPCs publicas so para authenticated e service_role, refazer_desde interna -- confirmado com dados fabricados (valor errado, sem cargo, mudar de cargo, definir pessoal futuro, versao em vigor, atravessar uma mudanca, lacuna preservada, escolha pessoal no proprio dia, subsidio sem reabrir, limite de cortes, INSERT e UPDATE directos recusados sem revelar o salario, mesma resposta para pessoa inexistente).';
END;
$conferir$;

-- ==============================================================================
-- ANTES DO db push
--
-- 1. "supabase migration list --linked" imediatamente antes: so podem estar
--    pendentes os cinco ficheiros do fluxo 2.
-- 2. Esta migration PARTE o botao Alterar do cartao Retribuicao e a gravacao da
--    retribuicao no assistente de nova pessoa ate o codigo novo estar publicado
--    (ver o cabecalho). Migration e codigo entram juntos.
-- 3. Quando for para a base partilhada: o INSERT directo em retribuicoes fecha
--    na Mudelar tambem, e fichas sem cargo nao ganham versoes novas de
--    retribuicao ate terem cargo. Dizer ao Miguel e esperar autorizacao.
-- ==============================================================================
