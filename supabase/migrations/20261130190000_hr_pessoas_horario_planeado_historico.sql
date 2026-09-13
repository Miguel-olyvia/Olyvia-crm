-- ==============================================================================
-- pessoas_horario_planeado ganha HISTORICO verdadeiro.
--
-- POR APLICAR -- E A APLICAR ANTES DO CODIGO QUE A ACOMPANHA, NUNCA DEPOIS.
--
-- src/hooks/usePessoa.ts (COLUNAS_HORARIO_PLANEADO) e
-- src/hooks/useAssiduidadeDaPessoa.ts (COLUNAS_PLANEADO) ja pedem as quatro
-- colunas novas (corrige_horario_id, correccao_motivo,
-- corrigido_por_anew_user_id, corrigido_por_pessoa_id) no SELECT. O
-- PostgREST recusa um SELECT inteiro quando uma coluna pedida nao existe --
-- publicar esse codigo com esta migracao ainda por aplicar derruba a ficha de
-- pessoa e o mapa de assiduidade para toda a gente, nao so o ecra do
-- historico. Aplicar esta migracao (`supabase db push --linked`, depois de
-- confirmar por leitura que nada disto existe ainda) faz sempre parte do
-- MESMO deploy do codigo, e antes dele.
--
--
-- -- O DEFEITO, MEDIDO -----------------------------------------------------------
--
-- src/hooks/usePessoa.ts, savePlaneado (~linha 524): ao gravar o horario, marca
-- TODAS as linhas anteriores como apagadas (UPDATE deleted_at) e insere as
-- novas. A tabela TEM valido_de/valido_ate -- de quando a quando aquela regra
-- esteve em vigor -- e o ecra nunca os usa. Consequencia: fica registado
-- QUANDO alguem editou, nao DE QUANDO A QUANDO o horario vigorou. Editar hoje
-- faz o passado da pessoa parecer ter sido sempre o horario novo -- e como as
-- horas por centro se CALCULAM do horario (nao se guardam), um horario sem
-- historico verdadeiro apaga tambem o historico de horas por centro.
--
--
-- -- A REGRA NOVA (decisao 31 do documento de decisoes) ------------------------
--
-- ALTERAR ("daqui para a frente passa a ser assim") FECHA a janela em vigor
-- (poe valido_ate) e ABRE outra. Nao toca nas janelas que ja passaram --
-- isso continua a ser trabalho de src/hooks/usePessoa.ts, nao desta migracao.
--
-- Numa janela JA DECORRIDA ficam bloqueadas TRES coisas, no MESMO trigger:
-- alterar, apagar, e encolher o inicio (encurtar o valido_de de uma regra ja
-- em curso apaga cobertura passada tao bem como apagar a linha). Isto e
-- imposto na BASE, nao so no ecra -- um INSERT ou UPDATE directo via
-- PostgREST cai no mesmo guarda.
--
-- Mas imutavel a 100% esta errado: um valor pode ter sido registado errado.
-- Corrigir-se-a EXACTAMENTE como o modulo ja corrige o realizado
-- (rpc_hr_realizado_corrigir, 20261121190000; o ecra em
-- src/components/hr/assiduidade/CorrigirRealizadoSheet.tsx e
-- HistoricoCorreccoes.tsx): a correccao e um LANCAMENTO NOVO que aponta para o
-- errado (corrige_horario_id), com motivo obrigatorio e autor. A linha antiga
-- NUNCA se apaga nem se reescreve -- fica visivel, esbatida, no historico.
-- Nao se inventa mecanismo novo.
--
-- ALTERAR (hr.pessoas.horario.edit, ja existe) e CORRIGIR
-- (hr.pessoas.horario.corrigir, nova, perigosa) sao permissoes DIFERENTES,
-- de proposito: sem a separacao, quem so devia poder mudar "a partir de
-- hoje" passaria a poder reescrever o passado, porque e menos cliques.
--
--
-- -- O QUE ESTA MIGRACAO FAZ, EM ORDEM ------------------------------------------
--
-- 1. Cataloga hr.pessoas.horario.corrigir (perigosa), so ao super_admin.
-- 2. Acrescenta 4 colunas (corrige_horario_id, correccao_motivo,
--    corrigido_por_anew_user_id, corrigido_por_pessoa_id), FKs, CHECK
--    (correccao exige motivo) e um indice (no maximo um corrector vivo por
--    linha) -- SO ADITIVO, no molde de 20261121180000 (o mesmo para o
--    realizado).
-- 3. Substitui o trigger de nao-sobreposicao para isentar uma linha corrigida
--    (uma correccao cobre deliberadamente o MESMO periodo que a linha
--    errada -- sem isentar, a base recusaria a propria correccao).
-- 4. Um trigger novo, hr_horario_planeado_janela_imutavel: bloqueia INSERT
--    directo numa janela ja decorrida (so nasce por correccao,
--    corrige_horario_id preenchido); e quando corrige_horario_id VEM
--    preenchido, valida que nao e so uma declaracao -- confirma que a linha
--    apontada existe, esta viva, e da MESMA pessoa, que JA DECORREU, que a
--    janela (data/valido_de/valido_ate) da linha nova e IDENTICA a dela, e
--    que o autor (auth.uid(), quando presente -- NULO e a propria RPC) tem
--    mesmo hr.pessoas.horario.corrigir. No UPDATE: corrige_horario_id fica
--    IMUTAVEL desde o INSERT -- nunca se preenche nem se muda por UPDATE,
--    precisamente para que a validacao acima nao se contorne em dois passos
--    (INSERT normal, depois UPDATE a declarar correccao). Bloqueia tambem
--    QUALQUER OUTRO UPDATE de uma linha cuja janela ja decorreu; bloqueia
--    fechar uma janela ainda aberta com um valido_ate a mais de um dia no
--    passado; e, numa regra recorrente ja em curso, bloqueia encolher o
--    valido_de e bloqueia mudar horas/local/folga/dia ou apaga-la
--    directamente -- so o fecho (valido_ate) e permitido, o resto e ALTERAR.
-- 5. rpc_hr_planeado_corrigir: a RPC que faz o lancamento novo, SECURITY
--    DEFINER, exigindo hr.pessoas.horario.corrigir e motivo escrito -- o
--    mesmo desenho de rpc_hr_realizado_corrigir.
--
--
-- -- O QUE NAO SE FAZ AQUI -------------------------------------------------------
--
-- - Nao se altera a mecanica de ALTERAR (fechar valido_ate e abrir nova linha
--   a partir de hoje): isso e src/hooks/usePessoa.ts, que esta migracao nao
--   toca. Esta migracao so torna esse caminho SEGURO na base, e torna a
--   correccao POSSIVEL onde antes nao havia.
-- - Nao se toca no invariante horario<->afectacao (20261130060000,
--   20261130100000): a correccao herda pessoa_id/organization_id/local_id/
--   vinculo_id/dia_semana/data/valido_de/valido_ate da linha que corrige, e
--   portanto a mesma afectacao que ja cobria a linha antiga continua a
--   cobrir a nova. Nao muda o local nem o periodo -- so a hora, o
--   nao_trabalha, e o motivo.
-- - Nao se cria vista "em vigor": a UI le a tabela em bruto (como ja faz) e
--   decide o que mostrar por lado do ecra, no mesmo padrao de
--   `emVigor`/`cadeiaDeCorreccoes` que src/lib/hr/assiduidade.ts ja usa.
--
--
-- -- COMO SE REVERTE -------------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DROP FUNCTION IF EXISTS public.rpc_hr_planeado_corrigir(uuid, time, time, uuid, boolean, text);
--   DROP TRIGGER IF EXISTS trg_pessoas_horario_planeado_janela_imutavel ON public.pessoas_horario_planeado;
--   DROP FUNCTION IF EXISTS public.hr_horario_planeado_janela_imutavel();
--   DROP FUNCTION IF EXISTS public.hr_horario_planeado_decorrido(date, date);
--   -- repor o corpo antigo de hr_horario_planeado_sem_sobreposicao (ver 20261120150000).
--   -- as colunas novas podem ficar: sao aditivas e nao estorvam.
--
--
-- Prerequisitos:
--   20261120150000  pessoas_horario_planeado (valido_de/valido_ate, trigger de sobreposicao)
--   20261120090000  hr_pessoa_do_utilizador(uuid, uuid)
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120120000  hr.pessoas.horario.view / .edit no catalogo
--   20261130060000  hr_periodo_decorrido(date) -- hr_horario_planeado_decorrido reusa-a
-- ==============================================================================

-- ---- Guardas ----------------------------------------------------------------
DO $guardas$
DECLARE
  v_papeis integer;
BEGIN
  IF to_regclass('public.pessoas_horario_planeado') IS NULL THEN
    RAISE EXCEPTION 'public.pessoas_horario_planeado nao existe. Aplicar 20261120150000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_horario_planeado'
       AND column_name = 'valido_de'
  ) THEN
    RAISE EXCEPTION 'pessoas_horario_planeado nao tem valido_de. Nao e a tabela esperada -- investigar antes de a alterar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_id_pessoa_org_key'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION
      'A unique (id, pessoa_id, organization_id) nao existe; a FK composta da cadeia de correccao depende dela.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_horario_planeado_sem_sobreposicao'
       AND tgrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_horario_planeado_sem_sobreposicao nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_pessoa_do_utilizador' AND p.pronargs = 2
  ) THEN
    RAISE EXCEPTION 'hr_pessoa_do_utilizador(uuid,uuid) nao existe. Aplicar 20261120090000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid,text,uuid) nao existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'hr_periodo_decorrido' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'hr_periodo_decorrido(date) nao existe. Aplicar 20261130060000 primeiro -- hr_horario_planeado_decorrido reusa-a.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario.view') THEN
    RAISE EXCEPTION 'hr.pessoas.horario.view nao esta no catalogo. Aplicar 20261120120000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario.edit') THEN
    RAISE EXCEPTION 'hr.pessoas.horario.edit nao esta no catalogo. Aplicar 20261120120000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_protect_system_role_perms nao existe. Estado da base inesperado.';
  END IF;

  SELECT count(*) INTO v_papeis FROM public.anew_roles WHERE code = 'super_admin';
  IF v_papeis = 0 THEN
    RAISE EXCEPTION 'Nao existe papel nenhum com code = ''super_admin''. Investigar antes de aplicar.';
  END IF;
END;
$guardas$;

-- ==============================================================================
-- 1. Catalogo: hr.pessoas.horario.corrigir, ao super_admin
-- ==============================================================================
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.horario.corrigir', 'Corrigir horario planeado ja decorrido',
   'PERIGOSA. CORRECCAO: corrigir um intervalo de horario planeado cuja janela ja decorreu -- "o que ficou registado para Marco estava errado". Insere um lancamento novo com rasto (quem, quando, o que la estava); nunca reescreve nem apaga a linha antiga. Separada de hr.pessoas.horario.edit porque alterar "daqui para a frente" e reescrever o passado sao autoridades diferentes -- sem a separacao, quem so devia poder mudar o futuro passaria a corrigir o passado por serem menos cliques.',
   'hr', 'hr.pessoas.horario.edit', 330, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, 'hr.pessoas.horario.corrigir'
  FROM public.anew_roles r
 WHERE r.code = 'super_admin'
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ==============================================================================
-- 2. Colunas da cadeia de correccao (SO ADD, molde de 20261121180000)
-- ==============================================================================
ALTER TABLE public.pessoas_horario_planeado
  ADD COLUMN IF NOT EXISTS corrige_horario_id uuid,
  ADD COLUMN IF NOT EXISTS correccao_motivo text,
  ADD COLUMN IF NOT EXISTS corrigido_por_anew_user_id uuid,
  ADD COLUMN IF NOT EXISTS corrigido_por_pessoa_id uuid;

DO $fks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_corrige_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    ALTER TABLE public.pessoas_horario_planeado
      ADD CONSTRAINT pessoas_horario_planeado_corrige_fkey
      FOREIGN KEY (corrige_horario_id, pessoa_id, organization_id)
      REFERENCES public.pessoas_horario_planeado (id, pessoa_id, organization_id)
      ON DELETE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_corrigido_por_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    ALTER TABLE public.pessoas_horario_planeado
      ADD CONSTRAINT pessoas_horario_planeado_corrigido_por_fkey
      FOREIGN KEY (corrigido_por_anew_user_id)
      REFERENCES public.anew_users (id) ON DELETE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_corrigido_por_pessoa_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    ALTER TABLE public.pessoas_horario_planeado
      ADD CONSTRAINT pessoas_horario_planeado_corrigido_por_pessoa_fkey
      FOREIGN KEY (corrigido_por_pessoa_id, organization_id)
      REFERENCES public.pessoas (id, organization_id)
      ON DELETE SET NULL (corrigido_por_pessoa_id);
  END IF;

  -- Corrigir sem dizer porque nao e corrigir. NOT VALID nao se usa: todas as
  -- linhas existentes tem as colunas novas a NULL, e o CHECK passa nelas.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_correccao_com_motivo'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
  ) THEN
    ALTER TABLE public.pessoas_horario_planeado
      ADD CONSTRAINT pessoas_horario_planeado_correccao_com_motivo
      CHECK (corrige_horario_id IS NULL
             OR (correccao_motivo IS NOT NULL AND btrim(correccao_motivo) <> ''));
  END IF;
END;
$fks$;

COMMENT ON COLUMN public.pessoas_horario_planeado.corrige_horario_id IS
'O intervalo errado que esta linha substitui. Corrigir e INSERIR (rpc_hr_planeado_corrigir): a linha antiga NUNCA se apaga nem se reescreve -- fica visivel no historico, esbatida, e o trigger de nao-sobreposicao passa a isenta-la em favor desta.';

COMMENT ON COLUMN public.pessoas_horario_planeado.corrigido_por_pessoa_id IS
'A ficha de quem corrigiu, ao lado do anew_user_id -- e a ficha que se le daqui a cinco anos, quando a conta ja nao existir.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_planeado_um_corrector_vivo
  ON public.pessoas_horario_planeado (corrige_horario_id)
  WHERE corrige_horario_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_planeado_um_corrector_vivo IS
'No maximo UM corrector vivo por linha -- a mesma cadeia linear do realizado (uq_realizado_um_corrector_vivo).';

-- ==============================================================================
-- 3. A janela decorrida, como funcao partilhada pelo trigger e pela RPC
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_horario_planeado_decorrido(_data date, _valido_ate date)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  -- Excepcao por data: decorrida quando a propria data ja passou. Regra
  -- recorrente: decorrida quando FECHADA (valido_ate preenchido) e no
  -- passado -- reaproveita hr_periodo_decorrido, o mesmo vocabulario que
  -- pessoas_afectacoes e pessoas_vinculos_horas ja usam. Uma regra aberta
  -- (valido_ate NULL) nunca e "decorrida": esta em vigor ou preve o futuro.
  SELECT (_data IS NOT NULL AND _data < CURRENT_DATE)
      OR public.hr_periodo_decorrido(_valido_ate)
$$;

COMMENT ON FUNCTION public.hr_horario_planeado_decorrido(date, date) IS
'true quando a janela de uma linha de pessoas_horario_planeado ja decorreu por inteiro: uma excepcao cuja data ja passou, ou uma regra recorrente FECHADA (valido_ate preenchido) cujo fim ja passou. Usada por hr_horario_planeado_janela_imutavel() e por rpc_hr_planeado_corrigir para decidir ALTERACAO vs CORRECCAO.';

-- ==============================================================================
-- 4. Nao-sobreposicao: isentar uma linha corrigida (CREATE OR REPLACE, mesma
-- assinatura, mesmo trigger -- so o corpo ganha a isencao).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_horario_planeado_sem_sobreposicao()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_conflito record;
BEGIN
  -- Uma linha marcada como apagada nao ocupa tempo nenhum.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.hora_inicio, h.hora_fim, h.nao_trabalha
    INTO v_conflito
    FROM public.pessoas_horario_planeado h
   WHERE h.pessoa_id = NEW.pessoa_id
     AND h.deleted_at IS NULL
     AND h.id <> NEW.id
     -- Isencao 1: a propria linha que esta linha corrige -- uma correccao
     -- cobre DE PROPOSITO o mesmo periodo que a linha errada; sem isto a
     -- base recusaria a propria correccao por "sobreposicao" com o erro que
     -- ela substitui.
     AND (NEW.corrige_horario_id IS NULL OR h.id <> NEW.corrige_horario_id)
     -- Isencao 2: qualquer linha que JA TEM um corrector vivo -- ja esta
     -- substituida, e nao deve continuar a ocupar tempo para efeitos de
     -- colisao com uma correccao mais recente ou com outra linha nova.
     AND NOT EXISTS (
       SELECT 1 FROM public.pessoas_horario_planeado c
        WHERE c.corrige_horario_id = h.id AND c.deleted_at IS NULL
     )
     -- Mesma chave temporal. Numa regra recorrente exige-se tambem que as
     -- janelas de validade se cruzem: duas regras para a mesma segunda-feira,
     -- uma valida em Janeiro e outra em Marco, nao colidem.
     AND (
       (NEW.data IS NOT NULL AND h.data = NEW.data)
       OR (
         NEW.dia_semana IS NOT NULL
         AND h.dia_semana = NEW.dia_semana
         AND daterange(h.valido_de, h.valido_ate, '[]')
             && daterange(NEW.valido_de, NEW.valido_ate, '[]')
       )
     )
     AND (
       -- Uma folga e EXCLUSIVA no dia: um dia tem linhas de trabalho ou uma
       -- linha de folga, nunca as duas. Dizer "nao trabalha" e ao mesmo tempo
       -- "trabalha das 9 as 14" e uma contradicao, nao um dado.
       NEW.nao_trabalha
       OR h.nao_trabalha
       -- Sobreposicao de horas, por comparacao explicita.
       OR (NEW.hora_inicio < h.hora_fim AND h.hora_inicio < NEW.hora_fim)
     )
   LIMIT 1;

  IF v_conflito.id IS NOT NULL THEN
    IF NEW.nao_trabalha OR v_conflito.nao_trabalha THEN
      RAISE EXCEPTION
        'horario_folga_e_trabalho: a linha % ja define este dia para esta pessoa. Um dia tem intervalos de trabalho OU uma linha de folga (nao_trabalha), nunca as duas.',
        v_conflito.id;
    ELSE
      RAISE EXCEPTION
        'horario_sobreposto: o intervalo % a % cruza-se com o intervalo % (% a %) da mesma pessoa no mesmo dia. Dois locais no mesmo dia sao possiveis, mas nao a mesma hora -- ninguem esta em dois sitios ao mesmo tempo.',
        NEW.hora_inicio, NEW.hora_fim,
        v_conflito.id, v_conflito.hora_inicio, v_conflito.hora_fim;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_horario_planeado_sem_sobreposicao() IS
'Impede dois intervalos planeados vivos da mesma pessoa a sobreporem-se no mesmo dia, e impede uma folga coexistir com trabalho no mesmo dia. Desde 20261130190000: isenta a linha que uma correccao aponta (corrige_horario_id) e qualquer linha ja substituida por um corrector vivo -- sem isso a base recusaria a propria correccao por colidir com o erro que ela substitui. SECURITY DEFINER: sob RLS de invocador, quem tem horario.edit sem horario.view nao veria as linhas existentes e a verificacao seria vazia.';

-- ==============================================================================
-- 5. A imutabilidade da janela decorrida -- ALTERAR, APAGAR e ENCOLHER
-- bloqueados na BASE, nao so no ecra.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hr_horario_planeado_janela_imutavel()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Uma linha nova cuja janela ja decorreu so pode nascer como CORRECCAO
    -- (corrige_horario_id preenchido, exigido pela rpc_hr_planeado_corrigir)
    -- -- nunca por insercao directa. E o que preserva o historico verdadeiro:
    -- editar hoje nao pode fabricar o que vigorou no passado.
    --
    -- hr_horario_planeado_decorrido() sozinha nao chega aqui: numa regra
    -- recorrente ABERTA (valido_ate NULL) ela devolve sempre false, por
    -- construcao -- "aberta" quer dizer precisamente "ainda nao decorreu por
    -- inteiro". Mas uma regra recorrente aberta cujo valido_de fica no
    -- passado (ou omisso) COBRE, so por nascer, todos os dias desse dia da
    -- semana desde o valido_de ate hoje -- exactamente o mesmo historico
    -- fabricado que o guarda de excepcao-no-passado ja recusa para uma
    -- `data`. Por isso o guarda de INSERT tem de olhar tambem para essa
    -- cobertura, nao so para "a janela inteira ja decorreu".
    IF NEW.corrige_horario_id IS NULL THEN
      IF (
         public.hr_horario_planeado_decorrido(NEW.data, NEW.valido_ate)
         OR (NEW.dia_semana IS NOT NULL AND (NEW.valido_de IS NULL OR NEW.valido_de < CURRENT_DATE))
       ) THEN
        RAISE EXCEPTION
          'horario_planeado_insercao_no_passado: uma linha nova que cobre dias ja decorridos (excepcao com data no passado, ou regra recorrente cujo valido_de e omisso ou anterior a hoje) so pode nascer como correccao (rpc_hr_planeado_corrigir, hr.pessoas.horario.corrigir), nunca por insercao directa. Uma regra recorrente nasce sempre com valido_de = hoje.'
          USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;

    -- corrige_horario_id preenchido: isto DECLARA ser uma correccao, mas
    -- declarar nao e ser -- sem mais nada a validar aqui, quem tem apenas
    -- hr.pessoas.horario.edit faria POST directo ao PostgREST com
    -- corrige_horario_id a apontar para qualquer linha viva da mesma pessoa
    -- e fabricava passado sem a permissao perigosa (hr.pessoas.horario.corrigir).
    -- Confirma-se aqui, na base, exactamente o que rpc_hr_planeado_corrigir ja
    -- impoe -- para que o guarda nao dependa de ninguem passar pela RPC.
    DECLARE
      v_corrigida public.pessoas_horario_planeado;
    BEGIN
      SELECT h.* INTO v_corrigida
        FROM public.pessoas_horario_planeado h
       WHERE h.id = NEW.corrige_horario_id;

      IF v_corrigida.id IS NULL
         OR v_corrigida.deleted_at IS NOT NULL
         OR v_corrigida.pessoa_id IS DISTINCT FROM NEW.pessoa_id THEN
        RAISE EXCEPTION
          'horario_planeado_correccao_alvo_invalido: corrige_horario_id (%) tem de apontar para uma linha viva da MESMA pessoa.', NEW.corrige_horario_id
          USING ERRCODE = '42501';
      END IF;

      IF NOT public.hr_horario_planeado_decorrido(v_corrigida.data, v_corrigida.valido_ate) THEN
        RAISE EXCEPTION
          'horario_planeado_correccao_ainda_em_vigor: a linha % ainda esta em vigor ou no futuro -- so se corrige o que ja decorreu; isto e ALTERAR (hr.pessoas.horario.edit), nunca correccao.', v_corrigida.id
          USING ERRCODE = '42501';
      END IF;

      IF NEW.data IS DISTINCT FROM v_corrigida.data
         OR NEW.valido_de IS DISTINCT FROM v_corrigida.valido_de
         OR NEW.valido_ate IS DISTINCT FROM v_corrigida.valido_ate THEN
        RAISE EXCEPTION
          'horario_planeado_correccao_janela_diferente: a correccao tem de cobrir exactamente a mesma janela (data/valido_de/valido_ate) que a linha % -- so o valor errado (horas, local, folga) pode mudar.', v_corrigida.id
          USING ERRCODE = '42501';
      END IF;

      -- auth.uid() NULO e a propria RPC/service_role -- ja verificou a
      -- permissao antes de chamar este INSERT, e nao tem sessao para
      -- re-verificar aqui. Um auth.uid() presente (POST directo ao
      -- PostgREST) tem de ter mesmo a permissao perigosa.
      IF auth.uid() IS NOT NULL
         AND NOT public.has_anew_permission_in_org(auth.uid(), 'hr.pessoas.horario.corrigir', NEW.organization_id) THEN
        RAISE EXCEPTION
          'horario_planeado_correccao_sem_permissao: preencher corrige_horario_id exige hr.pessoas.horario.corrigir nesta organizacao.'
          USING ERRCODE = '42501';
      END IF;
    END;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'. corrige_horario_id e imutavel A PARTIR do INSERT --
  -- so se declara correccao ao NASCER a linha, nunca depois. Sem isto, a
  -- validacao inteira do ramo INSERT (linha apontada viva e da mesma pessoa,
  -- ja decorrida, janela identica, permissao perigosa) e um guarda de
  -- entrada que se contorna por dois passos: (1) INSERT de uma linha NORMAL
  -- com data futura (corrige_horario_id NULL, guarda de INSERT passa,
  -- porque nao ha nada de errado em inserir uma linha futura); (2) UPDATE
  -- dessa MESMA linha a preencher corrige_horario_id com o id de uma linha
  -- ja decorrida da mesma pessoa (mais um correccao_motivo qualquer, para
  -- satisfazer o CHECK). Nesse UPDATE, OLD (a linha nova, futura) nao esta
  -- decorrida -- salta a regra 1 abaixo; NEW.valido_ate continua NULL --
  -- salta o guarda de fecho-no-passado; e OLD.dia_semana e NULL numa
  -- excepcao com data -- salta o bloco de regra-em-curso. RETURN NEW sem
  -- mais nenhum guarda a olhar para a coluna. Resultado: uma linha marcada
  -- como correccao sem NUNCA ter passado pela validacao do ramo INSERT, e
  -- sem a permissao perigosa -- e emVigor() (src/lib/hr/planeadoDoDia.ts,
  -- a PRIMEIRA coisa que a leitura do planeado faz) deixa cair a linha
  -- antiga do mapa de assiduidade e da ficha da pessoa, para qualquer dia
  -- ja decorrido, sem a apagar e sem hr.pessoas.horario.corrigir. Por isso
  -- bloqueia-se aqui, incondicionalmente, ANTES de qualquer outro guarda de
  -- UPDATE -- nao interessa se a linha esta ou nao decorrida, nem se a
  -- mudanca e so esta coluna: corrige_horario_id so se preenche no
  -- nascimento da linha (rpc_hr_planeado_corrigir, no INSERT).
  IF NEW.corrige_horario_id IS DISTINCT FROM OLD.corrige_horario_id THEN
    RAISE EXCEPTION
      'horario_planeado_correccao_imutavel: corrige_horario_id nao pode ser alterado depois de a linha existir -- so se declara correccao ao nascer a linha (rpc_hr_planeado_corrigir), nunca por UPDATE. Preenche-la agora, por fora do INSERT, contornaria toda a validacao de correccao (linha decorrida, janela identica, permissao) e apagaria o planeado antigo do historico sem rasto.'
      USING ERRCODE = '42501';
  END IF;

  -- Uma janela ja decorrida e imutavel: nao se altera, nao
  -- se apaga (deleted_at) e nao se encolhe -- as tres coisas que a decisao
  -- pede bloqueadas pelo MESMO guarda, porque as tres tem o mesmo efeito:
  -- reescrever o que ficou registado sobre um periodo que ja aconteceu.
  IF public.hr_horario_planeado_decorrido(OLD.data, OLD.valido_ate) THEN
    IF NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION
        'horario_planeado_janela_decorrida: a janela da linha % ja decorreu. E imutavel -- nao se altera, nao se apaga e nao se encolhe. Para corrigir um valor errado, usar rpc_hr_planeado_corrigir (hr.pessoas.horario.corrigir): insere uma linha nova com rasto, nunca reescreve a antiga.',
        OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- A janela ainda nao decorreu por inteiro (rule 1 nao apanhou), mas fechar
  -- AGORA com um valido_ate mais de um dia no passado fabricaria, so agora,
  -- que a regra tinha parado ha varios dias -- os dias entre esse fecho e
  -- ontem ja aconteceram sob a regra aberta e ficariam silenciosamente sem
  -- cobertura. Fechar "a partir de hoje" (valido_ate = ontem, o maximo
  -- legitimo) continua livre -- e exactamente o que ALTERAR faz.
  IF NEW.valido_ate IS NOT NULL AND NEW.valido_ate < CURRENT_DATE - 1 THEN
    RAISE EXCEPTION
      'horario_planeado_fecha_no_passado: fechar esta regra com valido_ate=% reescreveria dias ja decorridos sob ela (so se fecha, no maximo, a partir de ontem). Para corrigir um valor ja decorrido, usar rpc_hr_planeado_corrigir.',
      NEW.valido_ate
      USING ERRCODE = '42501';
  END IF;

  -- A janela pode ja ter COMECADO: uma regra recorrente ainda em vigor
  -- (valido_ate NULL ou futuro) cujo valido_de e NULO (sem inicio declarado
  -- -- o formato de TODO o horario legado, escrito antes desta migracao: "em
  -- vigor desde sempre" e tao "ja comecada" como um valido_de concreto no
  -- passado) ou esta no passado. Duas coisas ficam fechadas nesse caso, ambas
  -- porque reescreveriam dias ja decorridos sob a regra tal como ela era:
  IF OLD.dia_semana IS NOT NULL AND (OLD.valido_de IS NULL OR OLD.valido_de < CURRENT_DATE) THEN
    -- 1. Mexer no INICIO de uma regra ja em curso, em QUALQUER direccao,
    --    reescreve dias ja decorridos: encolhe-lo (dar-lhe um inicio
    --    concreto quando antes nao tinha, ou move-lo para a frente) apaga
    --    cobertura de dias que decorreram sob a regra tal como ela era; e
    --    RECUA-LO (move-lo para tras, ou apaga-lo por completo) fabrica
    --    cobertura de dias que decorreram ANTES de a regra sequer existir --
    --    o mesmo passado fabricado que o guarda de INSERT recusa a uma linha
    --    nova. Por isso o guarda nao escolhe direccao: qualquer mudanca a
    --    valido_de aqui e um UPDATE directo a reescrever o passado.
    IF NEW.valido_de IS DISTINCT FROM OLD.valido_de THEN
      RAISE EXCEPTION
        'horario_planeado_encolhe_inicio: mudar o inicio de uma regra ja em curso (de % para %), em qualquer direccao, reescreve o passado -- para a frente apaga cobertura de dias ja decorridos, para tras fabrica cobertura de dias anteriores a propria regra. Fechar com valido_ate e abrir uma regra nova a partir de hoje -- nunca mudar o inicio desta.',
        coalesce(OLD.valido_de::text, 'sem inicio declarado'), coalesce(NEW.valido_de::text, 'sem inicio declarado')
        USING ERRCODE = '42501';
    END IF;

    -- 2. Mudar as HORAS, o LOCAL, a folga ou apagar a linha directamente
    --    reescreveria em silencio o que vigorou nos dias ja decorridos sob
    --    ela -- ALTERAR e FECHAR (valido_ate) e ABRIR outra a partir de
    --    hoje, nunca editar esta no lugar. So valido_ate (o fecho) e campos
    --    de apresentacao (notas) podem mudar numa regra ja em curso.
    IF NEW.hora_inicio IS DISTINCT FROM OLD.hora_inicio
       OR NEW.hora_fim IS DISTINCT FROM OLD.hora_fim
       OR NEW.local_id IS DISTINCT FROM OLD.local_id
       OR NEW.nao_trabalha IS DISTINCT FROM OLD.nao_trabalha
       OR NEW.dia_semana IS DISTINCT FROM OLD.dia_semana
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION
        'horario_planeado_altera_regra_em_curso: a linha % e uma regra recorrente ja em curso (valido_de: %). Mudar horas, local, folga ou apaga-la reescreveria em silencio o que vigorou nos dias ja decorridos. Fechar com valido_ate (ALTERAR) e abrir uma regra nova a partir de hoje.',
        OLD.id, coalesce(OLD.valido_de::text, 'sem inicio declarado')
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_horario_planeado_janela_imutavel() IS
'ALTERAR fecha a janela em vigor (valido_ate = no maximo ontem) e abre outra -- nunca toca no que ja passou. Este guarda impoe isso na base: bloqueia INSERT directo de uma linha que cobre dias ja decorridos (excepcao com data no passado, OU regra recorrente cujo valido_de e omisso ou anterior a hoje -- so nasce por correccao, corrige_horario_id preenchido, ou com valido_de = hoje). Preencher corrige_horario_id nao desliga o guarda por si so: valida-se que a linha apontada existe, esta viva, e da mesma pessoa, que ja decorreu, que a janela (data/valido_de/valido_ate) da linha nova e identica a dela, e que o autor tem hr.pessoas.horario.corrigir (isento so quando auth.uid() e nulo -- a propria RPC/service_role) -- sem isto, quem so tivesse hr.pessoas.horario.edit fabricava passado por POST directo ao PostgREST so por preencher a coluna. Bloqueia INCONDICIONALMENTE, no UPDATE, qualquer mudanca a corrige_horario_id -- a coluna so se preenche ao nascer a linha (INSERT via rpc_hr_planeado_corrigir), nunca depois; sem isto, um INSERT normal (corrige_horario_id NULL) seguido de UPDATE a preenche-la contornava toda a validacao do ramo INSERT (linha decorrida, janela identica, permissao perigosa) sem nunca a exercitar. Bloqueia QUALQUER OUTRO UPDATE de uma linha cuja janela ja decorreu; bloqueia fechar uma janela ainda aberta com um valido_ate a mais de um dia no passado; e, numa regra recorrente ja em curso (valido_de no passado ou omisso, ainda aberta), bloqueia QUALQUER mudanca a valido_de -- para a frente apaga cobertura de dias decorridos, para tras fabrica cobertura anterior a propria regra -- e bloqueia mudar horas/local/folga/dia ou apaga-la por UPDATE directo -- so o fecho (valido_ate) e permitido, o resto e ALTERAR (fechar e abrir outra). ERRCODE 42501 em todos os ramos -- falta de autoridade sobre o passado, nao um dado invalido.';

DROP TRIGGER IF EXISTS trg_pessoas_horario_planeado_janela_imutavel ON public.pessoas_horario_planeado;
CREATE TRIGGER trg_pessoas_horario_planeado_janela_imutavel
  BEFORE INSERT OR UPDATE ON public.pessoas_horario_planeado
  FOR EACH ROW EXECUTE FUNCTION public.hr_horario_planeado_janela_imutavel();

-- ==============================================================================
-- 6. rpc_hr_planeado_corrigir -- o lancamento novo, no molde exacto de
-- rpc_hr_realizado_corrigir (20261121190000).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_hr_planeado_corrigir(
  _horario_id uuid,
  _hora_inicio time,
  _hora_fim time,
  _local_id uuid,
  _nao_trabalha boolean,
  _motivo text
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_auth      uuid := auth.uid();
  v_anew      uuid;
  v_eu        uuid;
  v_old       public.pessoas_horario_planeado;
  v_new       uuid;
  v_decorrida boolean;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'assiduidade_sem_sessao: nao ha utilizador autenticado.' USING ERRCODE = '42501';
  END IF;

  IF _motivo IS NULL OR btrim(_motivo) = '' THEN
    RAISE EXCEPTION
      'planeado_correccao_sem_motivo: corrigir um horario planeado ja decorrido exige motivo escrito. E o rasto que fica.'
      USING ERRCODE = '23514';
  END IF;

  SELECT h.* INTO v_old FROM public.pessoas_horario_planeado h WHERE h.id = _horario_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'planeado_inexistente: o intervalo % nao existe.', _horario_id USING ERRCODE = '23503';
  END IF;

  IF NOT public.has_anew_permission_in_org(v_auth, 'hr.pessoas.horario.corrigir', v_old.organization_id) THEN
    RAISE EXCEPTION
      'planeado_sem_permissao: corrigir horario ja decorrido exige hr.pessoas.horario.corrigir nesta organizacao.'
      USING ERRCODE = '42501';
  END IF;

  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'planeado_nao_corrigivel: o intervalo % esta apagado.', _horario_id USING ERRCODE = '23514';
  END IF;

  v_decorrida := public.hr_horario_planeado_decorrido(v_old.data, v_old.valido_ate);
  IF NOT v_decorrida THEN
    RAISE EXCEPTION
      'planeado_nao_decorrido: o intervalo % ainda esta em vigor ou no futuro -- altera-se pelo editor normal (hr.pessoas.horario.edit), nao por correccao.', _horario_id
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pessoas_horario_planeado c
     WHERE c.corrige_horario_id = v_old.id AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'planeado_ja_corrigido: o intervalo % ja tem uma correccao viva.', _horario_id USING ERRCODE = '23514';
  END IF;

  IF NOT _nao_trabalha AND (_hora_inicio IS NULL OR _hora_fim IS NULL OR _hora_fim <= _hora_inicio) THEN
    RAISE EXCEPTION
      'planeado_horas_invalidas: a hora de fim tem de ser posterior a de inicio. Um turno que atravessa a meia-noite sao DUAS linhas, em duas datas -- a mesma convencao do realizado.'
      USING ERRCODE = '23514';
  END IF;

  SELECT au.id INTO v_anew FROM public.anew_users au WHERE au.auth_user_id = v_auth LIMIT 1;
  v_eu := public.hr_pessoa_do_utilizador(v_auth, v_old.organization_id);

  INSERT INTO public.pessoas_horario_planeado (
    pessoa_id, organization_id, vinculo_id, local_id,
    dia_semana, data, hora_inicio, hora_fim, nao_trabalha, ordem,
    valido_de, valido_ate,
    corrige_horario_id, correccao_motivo,
    corrigido_por_anew_user_id, corrigido_por_pessoa_id,
    created_by, updated_by
  ) VALUES (
    v_old.pessoa_id, v_old.organization_id, v_old.vinculo_id,
    CASE WHEN _nao_trabalha THEN NULL ELSE coalesce(_local_id, v_old.local_id) END,
    v_old.dia_semana, v_old.data,
    CASE WHEN _nao_trabalha THEN NULL ELSE _hora_inicio END,
    CASE WHEN _nao_trabalha THEN NULL ELSE _hora_fim END,
    _nao_trabalha, v_old.ordem,
    v_old.valido_de, v_old.valido_ate,
    v_old.id, btrim(_motivo),
    v_anew, v_eu,
    v_anew, v_anew
  )
  RETURNING id INTO v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_hr_planeado_corrigir(uuid, time, time, uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hr_planeado_corrigir(uuid, time, time, uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hr_planeado_corrigir(uuid, time, time, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_hr_planeado_corrigir(uuid, time, time, uuid, boolean, text) TO service_role;

COMMENT ON FUNCTION public.rpc_hr_planeado_corrigir(uuid, time, time, uuid, boolean, text) IS
'Corrige um intervalo de horario PLANEADO cuja janela ja decorreu: insere a linha nova com corrige_horario_id e motivo, na MESMA transaccao -- a linha antiga NUNCA se apaga nem se reescreve. Exige hr.pessoas.horario.corrigir e motivo escrito. Recusa corrigir uma linha que ainda esta em vigor ou no futuro (isso e hr.pessoas.horario.edit) e uma linha que ja tem corrector vivo. Mesmo desenho de rpc_hr_realizado_corrigir (20261121190000).';

-- ---- Conferir -----------------------------------------------------------------
DO $conferir$
DECLARE
  v_org_id       uuid;
  v_pessoa_id    uuid;
  v_horario_id   uuid;
  v_horario_vivo uuid;
  v_novo_id      uuid;
  v_bloqueado    boolean;
BEGIN
  -- Catalogo.
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario.corrigir' AND is_dangerous) THEN
    RAISE EXCEPTION 'hr.pessoas.horario.corrigir nao ficou no catalogo, ou nao ficou marcada perigosa.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.anew_roles r
      JOIN public.anew_role_permissions rp ON rp.role_id = r.id
     WHERE r.code = 'super_admin' AND rp.permission_code = 'hr.pessoas.horario.corrigir'
  ) THEN
    RAISE EXCEPTION 'hr.pessoas.horario.corrigir nao ficou atribuida a super_admin.';
  END IF;

  -- Colunas, FKs, indice.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'pessoas_horario_planeado'
       AND column_name = 'corrige_horario_id'
  ) THEN
    RAISE EXCEPTION 'corrige_horario_id nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pessoas_horario_planeado_corrige_fkey'
       AND conrelid = to_regclass('public.pessoas_horario_planeado')
       AND cardinality(conkey) = 3
  ) THEN
    RAISE EXCEPTION 'A FK composta da cadeia de correccao do planeado nao ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'uq_planeado_um_corrector_vivo'
  ) THEN
    RAISE EXCEPTION 'uq_planeado_um_corrector_vivo nao ficou criado.';
  END IF;

  -- A RPC, como SECURITY DEFINER com 6 argumentos, fechada a anon.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'rpc_hr_planeado_corrigir' AND p.pronargs = 6
       AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'rpc_hr_planeado_corrigir nao ficou criada como SECURITY DEFINER com 6 argumentos.';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_hr_planeado_corrigir(uuid, time, time, uuid, boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon consegue executar rpc_hr_planeado_corrigir. O REVOKE nao pegou.';
  END IF;

  -- ---- Exercicio vivo do trigger de imutabilidade, com dados descartaveis,
  -- revertidos por ROLLBACK da subtransaccao (nao por DELETE manual). local_id
  -- fica NULL de proposito: sem local explicito o invariante horario<->
  -- afectacao (20261130100000) nao exige afectacao nenhuma, e o fixture nao
  -- precisa de hr_locais_trabalho nem de pessoas_afectacoes.
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261130190000__')
    RETURNING id INTO v_org_id;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Conferir', 'Migracao')
    RETURNING id INTO v_pessoa_id;

    -- Caso 1: INSERT directo de uma EXCEPCAO no passado tem de FALHAR --
    -- ninguem fabrica hoje o que vigorou ontem.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, data, hora_inicio, hora_fim)
      VALUES
        (v_pessoa_id, v_org_id, current_date - 10, '09:00'::time, '17:00'::time);

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou um INSERT directo com data no passado -- o historico deixaria de ser fiavel.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de INSERT no passado nao disparou como esperado (caso 1).';
    END IF;

    -- Caso 1b: INSERT directo de uma REGRA RECORRENTE ABERTA (valido_ate
    -- NULL) cujo valido_de fica no passado tem de FALHAR tambem --
    -- hr_horario_planeado_decorrido(data, valido_ate) sozinha devolve false
    -- para uma janela aberta, mas a regra ja cobre, so por nascer, todos os
    -- dias desse dia da semana desde o valido_de ate hoje. E o cenario que
    -- este guarda tinha deixado passar antes desta correccao.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de)
      VALUES
        (v_pessoa_id, v_org_id, 1, '09:00'::time, '13:00'::time, current_date - 30);

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou um INSERT directo de regra recorrente aberta com valido_de no passado -- fabrica cobertura de dias ja decorridos.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de INSERT de regra recorrente aberta no passado nao disparou como esperado (caso 1b).';
    END IF;

    -- Caso 2: uma regra recorrente ABERTA hoje, depois FECHADA no passado por
    -- UPDATE directo, tem de FALHAR assim que o fecho a torna decorrida --
    -- fechar no passado e reescrever quantos dias ela vigorou. O fixture
    -- entra com o trigger desligado -- o caso 1b acima ja prova que a
    -- insercao normal, com o trigger activo, recusa exactamente esta linha;
    -- aqui representa-se uma regra que ja existia ANTES desta migracao.
    ALTER TABLE public.pessoas_horario_planeado
      DISABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de)
    VALUES
      (v_pessoa_id, v_org_id, 1, '09:00'::time, '13:00'::time, current_date - 30)
    RETURNING id INTO v_horario_id;

    ALTER TABLE public.pessoas_horario_planeado
      ENABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_horario_planeado
         SET valido_ate = current_date - 5
       WHERE id = v_horario_id;

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou fechar uma regra com valido_ate no passado -- isto reescreve quantos dias ela vigorou.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de fecho-no-passado nao disparou como esperado (caso 2).';
    END IF;

    -- Caso 3: a MESMA regra, ainda aberta, nao pode ter o INICIO encolhido
    -- (valido_de empurrado para a frente) -- apagaria cobertura de dias ja
    -- decorridos tao bem como apagar a linha.
    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_horario_planeado
         SET valido_de = current_date - 5
       WHERE id = v_horario_id;

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou encolher o valido_de de uma regra ja em curso.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de encolher-o-inicio nao disparou como esperado (caso 3).';
    END IF;

    -- Caso 3-recuo: a MESMA regra, ainda aberta, tambem nao pode ter o
    -- INICIO recuado (valido_de empurrado para tras) -- isto fabrica
    -- cobertura de dias anteriores a propria regra, o espelho exacto do
    -- caso 3. E o buraco que a correccao anterior tinha deixado: o guarda so
    -- verificava NEW.valido_de > OLD.valido_de.
    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_horario_planeado
         SET valido_de = current_date - 60
       WHERE id = v_horario_id;

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou recuar o valido_de de uma regra ja em curso -- fabrica cobertura de dias anteriores a propria regra.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de recuar-o-inicio nao disparou como esperado (caso 3-recuo).';
    END IF;

    -- Caso 3b: a MESMA regra, ainda aberta, nao pode ter a HORA DE FIM mudada
    -- por UPDATE directo -- isto reescreveria o que vigorou nos dias ja
    -- decorridos sob ela. O caminho certo e fechar (valido_ate) e abrir outra.
    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_horario_planeado SET hora_fim = '14:00'::time WHERE id = v_horario_id;
      RAISE EXCEPTION 'pessoas_horario_planeado aceitou mudar a hora_fim de uma regra recorrente ja em curso por UPDATE directo.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de altera-regra-em-curso nao disparou como esperado (caso 3b).';
    END IF;

    -- Caso 3c: uma regra recorrente SEM valido_de (o formato de TODO o
    -- horario legado, escrito antes desta migracao -- "em vigor desde
    -- sempre") e tao "ja em curso" como uma com valido_de concreto no
    -- passado, e tem de ficar protegida do mesmo modo.
    -- Como no caso 3b: o fixture entra com o trigger DESLIGADO, porque
    -- representa uma regra que ja existia ANTES desta migracao. O guarda de
    -- INSERT desta migracao recusa uma regra recorrente sem valido_de -- e
    -- recusa-a bem, para o formato legado nao continuar a nascer. Sem este
    -- par, era o proprio bloco de conferir a fazer a migracao falhar.
    ALTER TABLE public.pessoas_horario_planeado
      DISABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim)
    VALUES
      (v_pessoa_id, v_org_id, 2, '09:00'::time, '13:00'::time)
    RETURNING id INTO v_horario_id;

    ALTER TABLE public.pessoas_horario_planeado
      ENABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_horario_planeado SET hora_fim = '14:00'::time WHERE id = v_horario_id;
      RAISE EXCEPTION 'pessoas_horario_planeado aceitou mudar a hora_fim de uma regra legada sem valido_de -- o formato legado ficaria desprotegido.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de altera-regra-em-curso nao disparou para uma regra sem valido_de (caso 3c).';
    END IF;

    -- Caso 4: uma linha JA DECORRIDA (excepcao no passado) tem de FALHAR num
    -- UPDATE directo, mesmo sem tocar em datas -- e imutavel por inteiro. A
    -- semente entra com o trigger desligado, exactamente para representar
    -- dados de ANTES desta migracao (a insercao normal, com o trigger activo,
    -- e o que o caso 1 ja prova que falha).
    ALTER TABLE public.pessoas_horario_planeado
      DISABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES
      (v_pessoa_id, v_org_id, current_date - 20, '08:00'::time, '12:00'::time)
    RETURNING id INTO v_horario_id;

    ALTER TABLE public.pessoas_horario_planeado
      ENABLE TRIGGER trg_pessoas_horario_planeado_janela_imutavel;

    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_horario_planeado SET hora_fim = '12:30'::time WHERE id = v_horario_id;
      RAISE EXCEPTION 'pessoas_horario_planeado aceitou um UPDATE directo numa linha ja decorrida.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de janela-decorrida nao disparou como esperado (caso 4).';
    END IF;

    -- Caso 5: uma insercao SEM corrige_horario_id, para o MESMO dia (ja
    -- decorrido) que a linha do caso 4, tem de continuar recusada -- aqui e
    -- ainda o guarda de imutabilidade (42501, insercao_no_passado) que
    -- dispara primeiro, antes de a sobreposicao sequer ser avaliada; e por
    -- isso mesmo que a isencao do caso 6, feita com corrige_horario_id, prova
    -- ser especifica e nao uma suspensao geral de nenhum dos dois guardas.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, data, hora_inicio, hora_fim,
         corrige_horario_id, correccao_motivo)
      VALUES
        (v_pessoa_id, v_org_id, current_date - 20, '08:00'::time, '12:30'::time,
         NULL, NULL);

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou uma insercao sem correccao no mesmo dia ja decorrido da linha do caso 4.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'Nenhum guarda recusou uma insercao sem correccao no mesmo dia ja decorrido (caso 5).';
    END IF;

    -- Caso 6: a MESMA insercao, agora com corrige_horario_id a apontar para
    -- a linha do caso 4, tem de SUCEDER apesar de cobrir deliberadamente o
    -- MESMO dia e horas cruzadas -- e a prova viva de que a isencao do
    -- trigger de sobreposicao funciona.
    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, data, hora_inicio, hora_fim,
       corrige_horario_id, correccao_motivo)
    VALUES
      (v_pessoa_id, v_org_id, current_date - 20, '08:00'::time, '12:30'::time,
       v_horario_id, 'motivo do conferir')
    RETURNING id INTO v_novo_id;

    IF v_novo_id IS NULL THEN
      RAISE EXCEPTION 'A insercao da correccao (caso 6) nao produziu id -- a isencao de sobreposicao falhou silenciosamente.';
    END IF;

    -- Caso 7: corrige_horario_id a apontar para uma linha AINDA EM VIGOR (nao
    -- decorrida) tem de FALHAR -- e o bloqueante corrigido nesta ronda. Sem
    -- esta verificacao, quem so tem hr.pessoas.horario.edit preenchia
    -- corrige_horario_id com qualquer linha viva da pessoa e desligava por
    -- completo o guarda de insercao-no-passado, fabricando passado sem a
    -- permissao perigosa.
    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de)
    VALUES
      (v_pessoa_id, v_org_id, 3, '09:00'::time, '17:00'::time, current_date)
    RETURNING id INTO v_horario_vivo;

    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, dia_semana, hora_inicio, hora_fim, valido_de,
         corrige_horario_id, correccao_motivo)
      VALUES
        (v_pessoa_id, v_org_id, 3, '10:00'::time, '18:00'::time, current_date,
         v_horario_vivo, 'tentativa de corrigir o que ainda esta em vigor');

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou corrige_horario_id a apontar para uma linha AINDA EM VIGOR -- o guarda de correccao nao verificou se o alvo ja decorreu.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de correccao-ainda-em-vigor nao disparou como esperado (caso 7).';
    END IF;

    -- Caso 7b: corrige_horario_id a apontar para uma linha viva da MESMA
    -- pessoa, ja decorrida, mas com uma janela (data/valido_de/valido_ate)
    -- DIFERENTE da que a linha nova declara, tem de FALHAR -- uma correccao
    -- so pode substituir o valor errado, nunca alargar ou mudar o periodo
    -- coberto.
    v_bloqueado := false;
    BEGIN
      INSERT INTO public.pessoas_horario_planeado
        (pessoa_id, organization_id, data, hora_inicio, hora_fim,
         corrige_horario_id, correccao_motivo)
      VALUES
        (v_pessoa_id, v_org_id, current_date - 21, '08:00'::time, '12:30'::time,
         v_horario_id, 'janela diferente da linha corrigida');

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou uma correccao cuja janela nao coincide com a da linha corrigida.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de correccao-janela-diferente nao disparou como esperado (caso 7b).';
    END IF;

    -- Caso 8: o bypass reportado pelo revisor na ronda 2 -- corrige_horario_id
    -- preenchido por UPDATE, NUNCA por INSERT. (1) INSERT de uma linha NORMAL
    -- com data futura, corrige_horario_id NULL: nao ha nada de errado em
    -- inserir uma excepcao futura, o guarda de INSERT deixa passar. (2) UPDATE
    -- dessa MESMA linha a preencher corrige_horario_id com o id de v_horario_id
    -- (a linha JA DECORRIDA do caso 4), mais um correccao_motivo qualquer para
    -- satisfazer o CHECK -- isto tem de FALHAR incondicionalmente, mesmo
    -- apontando para uma linha decorrida da mesma pessoa com o CHECK
    -- satisfeito, porque OLD (a linha nova, futura) nao esta decorrida (nao
    -- apanha a regra 1), NEW.valido_ate continua NULL (nao apanha o fecho-no-
    -- passado) e OLD.dia_semana e NULL (nao apanha a regra-em-curso) -- sem
    -- este guarda dedicado, o UPDATE passava sem mais nenhuma verificacao a
    -- olhar para a coluna, contornando toda a validacao do ramo INSERT.
    INSERT INTO public.pessoas_horario_planeado
      (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES
      (v_pessoa_id, v_org_id, current_date + 10, '09:00'::time, '17:00'::time)
    RETURNING id INTO v_novo_id;

    v_bloqueado := false;
    BEGIN
      UPDATE public.pessoas_horario_planeado
         SET corrige_horario_id = v_horario_id,
             correccao_motivo = 'tentativa de declarar correccao por UPDATE'
       WHERE id = v_novo_id;

      RAISE EXCEPTION 'pessoas_horario_planeado aceitou preencher corrige_horario_id por UPDATE -- o bypass da ronda 2 continua possivel.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;
    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de correccao-imutavel nao disparou como esperado (caso 8).';
    END IF;

    -- Sucesso: levanta sempre, com ERRCODE proprio -- nunca P0001 (o SQLSTATE
    -- de qualquer RAISE EXCEPTION simples, incluindo os dos guardas acima). O
    -- ROLLBACK desta subtransaccao desfaz tudo -- organizacao, pessoa e
    -- linhas de horario, e tudo o que os triggers de criacao de organizacao
    -- lhe penduraram -- nao um DELETE manual.
    RAISE EXCEPTION 'conferir_20261130190000_ok' USING ERRCODE = 'CF003';
  EXCEPTION
    WHEN SQLSTATE 'CF003' THEN
      RAISE NOTICE 'OK: pessoas_horario_planeado agora recusa insercao/alteracao/encolhimento de uma janela decorrida, isenta a linha corrigida do trigger de sobreposicao, e tem a RPC de correccao com rasto -- exercitado com organizacao, pessoa e linhas descartaveis, revertidas por ROLLBACK da subtransaccao.';
    WHEN OTHERS THEN
      RAISE;
  END;

  RAISE NOTICE 'Conferido: catalogo, colunas/FKs/indice da cadeia de correccao, sobreposicao isentando correccoes, e o guarda de imutabilidade exercitado ao vivo.';
END;
$conferir$;
