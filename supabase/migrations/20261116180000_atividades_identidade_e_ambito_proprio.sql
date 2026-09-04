-- Modulo de Atividades: por a tabela `activities` em condicoes de ser usada.
--
-- A tabela existe desde a base inicial (20260615130000) e esta praticamente
-- parada: 4 linhas ao todo, de 24/12/2025 a 26/03/2026 -- uma reuniao de
-- departamento e tres notas de WhatsApp para clientes. Nenhum codigo do
-- repositorio actual escreve nela; estas linhas vieram de alguma outra via.
-- Tres das quatro nem organizacao tem.
--
-- Nao e limpeza: e o modulo de Atividades a arrancar. As Atividades sao a
-- lista de tarefas do comercial -- o que ele vai fazer hoje -- e sao coisa
-- diferente dos agendamentos (schedule_items), que sao o calendario. O ecra
-- "O Meu Dia" mostra as duas: as tarefas e as reunioes do dia.
--
-- Tres correccoes. Sao baratas porque so ha 4 linhas, e todas convertiveis:
--
-- 1. IDENTIDADE. `created_by` e `assigned_to` apontavam para auth.users(id) --
--    a identidade de AUTENTICACAO. A aplicacao inteira usa a identidade de
--    NEGOCIO (anew_users.id) nestas colunas; ha um ficheiro dedicado a explicar
--    que as duas nunca se misturam (src/lib/identity/resolveBusinessUserId.ts)
--    e current_business_user_id() e usada 551 vezes nas migracoes. As duas sao
--    mesmo diferentes: para o mesmo utilizador, 08bb24a2-... na autenticacao e
--    ba0b0ebf-... no negocio. Como estava, era impossivel gravar uma tarefa
--    ligada a uma pessoa da forma que o resto do sistema usa -- a chave
--    estrangeira recusava. E provavelmente por isto que o modulo nunca
--    chegou a arrancar.
--
-- 2. AMBITO PROPRIO. As politicas deixavam ver e apagar as tarefas de TODA a
--    organizacao. Uma lista de tarefas pessoais nao e isso: numa organizacao
--    com mais de mil itens de trabalho em aberto, uma vista da organizacao
--    inteira e uma parede que ninguem le -- deixa de ser "o meu dia". Passa a
--    OWNED: cada pessoa ve, altera e apaga as suas, e mais nada.
--
-- 3. `assigned_to` SAI. Com ambito proprio, quem cria e sempre o dono -- a
--    coluna nunca poderia diferir de `created_by`. Fica uma coluna so.
--    Se um dia for preciso um gestor distribuir trabalho, volta a acrescentar-se
--    com a decisao ja tomada, em vez de se adivinhar de quem eram as tarefas
--    ja escritas.

-- ============================================================
-- 1. Politicas antigas saem (referenciam assigned_to e auth.uid())
-- ============================================================
DROP POLICY IF EXISTS "Users can view their activities" ON public.activities;
DROP POLICY IF EXISTS "Users can create activities"     ON public.activities;
DROP POLICY IF EXISTS "Users can update activities"     ON public.activities;
DROP POLICY IF EXISTS "Users can delete activities"     ON public.activities;

-- ============================================================
-- 2. `assigned_to` sai
-- ============================================================
-- Uma das 4 linhas tem `assigned_to` preenchido e perde-o. E aceitavel: a
-- coluna sai por decisao de desenho, o modulo nunca esteve utilizavel, e o
-- autor da linha continua a ser quem era.
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_assigned_to_fkey;
ALTER TABLE public.activities DROP COLUMN IF EXISTS assigned_to;

-- ============================================================
-- 3. `created_by` passa a apontar para a identidade de negocio
-- ============================================================
-- As 4 linhas existentes tem `created_by` em identidade de AUTENTICACAO.
-- Convertem-se todas -- confirmado no remoto que os dois autores (Ricardo
-- Paiagua e Zelia Fitas) continuam a existir em anew_users.
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_created_by_fkey;

UPDATE public.activities a
SET created_by = u.id
FROM public.anew_users u
WHERE u.auth_user_id = a.created_by;

-- Rede de seguranca: se sobrar alguma linha por converter, a migracao para
-- aqui em vez de a deixar sem dono ou de rebentar so na chave estrangeira,
-- com uma mensagem que nao diz o que se passou.
DO $guarda$
DECLARE
  v_orfas integer;
BEGIN
  SELECT count(*) INTO v_orfas
  FROM public.activities a
  WHERE a.created_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.anew_users u WHERE u.id = a.created_by);

  IF v_orfas > 0 THEN
    RAISE EXCEPTION
      'Ha % atividades cujo autor nao existe em anew_users. Decidir o que lhes fazer antes de continuar.', v_orfas;
  END IF;
END;
$guarda$;

ALTER TABLE public.activities
  ADD CONSTRAINT activities_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.anew_users(id);

COMMENT ON COLUMN public.activities.created_by IS
  'anew_users.id -- identidade de NEGOCIO, como no resto da aplicacao. Nunca '
  'auth.users.id. E tambem o dono da tarefa: o ambito deste modulo e proprio, '
  'nao ha atribuicao a terceiros.';

-- ============================================================
-- 4. Politicas novas: so as proprias
-- ============================================================
CREATE POLICY "Cada um ve as suas atividades"
  ON public.activities FOR SELECT TO authenticated
  USING (created_by = public.current_business_user_id());

CREATE POLICY "Cada um cria atividades suas"
  ON public.activities FOR INSERT TO authenticated
  WITH CHECK (created_by = public.current_business_user_id());

CREATE POLICY "Cada um altera as suas atividades"
  ON public.activities FOR UPDATE TO authenticated
  USING (created_by = public.current_business_user_id())
  WITH CHECK (created_by = public.current_business_user_id());

CREATE POLICY "Cada um apaga as suas atividades"
  ON public.activities FOR DELETE TO authenticated
  USING (created_by = public.current_business_user_id());

-- ============================================================
-- 5. Indice para a leitura que o ecra vai fazer todos os dias
-- ============================================================
-- "as minhas tarefas por fazer, deste dia" -- dono, por fechar, por prazo.
CREATE INDEX IF NOT EXISTS idx_activities_dono_por_fazer
  ON public.activities (created_by, due_date)
  WHERE completed IS NOT TRUE;

COMMENT ON TABLE public.activities IS
  'Atividades: a lista de tarefas de cada pessoa -- o que ela vai fazer. Coisa '
  'diferente de schedule_items, que e o calendario (reunioes, marcacoes). O '
  'ecra "O Meu Dia" mostra as duas lado a lado. Ambito proprio: cada um so ve '
  'as suas.';
