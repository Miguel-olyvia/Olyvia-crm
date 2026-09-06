-- A permissao das submissoes pendentes deixa de ter selector de ambito.
--
-- A 20261117120000 fez duas coisas de uma vez: mudou a categoria de 'platform'
-- para 'leads' (o que resolveu o problema de origem -- o ecra de Cargos nao
-- mostra a categoria 'platform', por isso a permissao era invisivel) e ligou
-- supports_scope, o que lhe deu um selector de ambito proprio.
--
-- Esse selector nao controla nada. Quem filtra as linhas e a politica de
-- leitura form_submissions_select_org, que resolve o ambito por leads.view e
-- clients.view atraves de can_access_contact_row -- nunca olha para
-- platform.pending_submissions.view. Podia-se por esta permissao em
-- 'organizacao' e continuar a ver so as proprias.
--
-- Isto e deliberado e nao vai mudar: uma submissao pendente nao e um objecto
-- independente, e um reenvio de formulario agarrado a uma ficha que ja existe.
-- Nao tem dono proprio -- herda o dono da ficha. "Quem pode ver isto" ja tem
-- resposta, que e a mesma de "quem pode ver a ficha". Um ambito proprio seria
-- uma segunda resposta a mesma pergunta, e a que o ecra mostrava era a errada.
--
-- O que esta permissao decide e outra coisa: se a pessoa participa ou nao
-- nesta fila de trabalho. Isso e sim ou nao. Volta a ser binaria.
--
-- Medido na nike antes desta alteracao: quem tem ambito proprio nas leads ve 3
-- das 16 submissoes pendentes; quem tem ambito de organizacao ve as 16; quem
-- nao tem leads nem clientes ve 0 -- independentemente do que esta permissao
-- dissesse.
--
-- A categoria FICA em 'leads': e o que a mantem visivel no ecra de Cargos,
-- dentro do grupo CRM, ao lado das leads de que depende.
--
-- Idempotente e nao destrutiva: altera uma coluna de uma linha de catalogo.
-- Nao mexe em atribuicoes de cargo, nem em politicas, nem em dados.

UPDATE "public"."anew_permissions"
SET "supports_scope" = false
WHERE "code" = 'platform.pending_submissions.view';
