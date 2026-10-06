# Equipa, clientes e menu por empresa (06/10/2026)

## Porquê

Na Mudelar, os 8 "técnicos" e o supervisor de 16 obras eram **clientes reais**
do CRM (`anew_memberships.role_is_client`). Tinham perfil ativo em Operações,
receberam avisos das obras no sino e podiam ser escolhidos pela distribuição
automática. A lista da Equipa mostrava as ~690 pessoas com acesso à
organização — clientes incluídos — e qualquer uma podia receber uma função.

## O que mudou

**Na base (`db/equipa.sql`, depois de `obras.sql` e `pessoas-crm.sql`):**

- `ops_e_cliente_so(org, utilizador)`: só cliente nesta organização (tem
  membership de cliente e nenhuma de colaborador).
- Trigger `ops_utilizador_perfil_sem_clientes`: recusa perfil **ativo** para
  quem é só cliente — vale para o ecrã, as RPCs e SQL à mão. Quem é cliente E
  colaborador continua a poder.
- Ao instalar: perfis ativos de clientes ficam inativos (sem apagar) e perdem
  as especialidades. A distribuição e as "pessoas livres" só olham para perfis
  ativos — ficam limpas.
- `rpc_ops_equipa_crm` (`db/pessoas-crm.sql`) deixa de listar clientes, exceto
  os que já têm perfil (coluna nova `e_cliente`, para se ver e desativar).
- `ops_org_modulos` + `rpc_ops_modulos` / `rpc_ops_gravar_modulos`: que áreas
  a empresa usa (Manutenção, Obras). Sem escolha, decide-se pelo que existe;
  nunca as duas desligadas; só admin/gestor grava.
- `ops_entrar_como_fechar_antigos()`: fecha entradas "entrar como" sem fim há
  mais de 2 h (pg_cron `ops-entrar-como-fechar`, de hora a hora).

**Na app:**

- Definições → **Equipa**: "Quem faz o quê" (cada ofício com as pessoas; os
  sem ninguém a vermelho), **Adicionar pessoa** (pesquisa, só colaboradores),
  **Convidar pessoa nova** (manda para Utilizadores do CRM — as contas nascem
  lá, não em Operações), e os clientes com perfil antigo marcados "Cliente no
  CRM", sem editar.
- Definições → **O que a empresa usa**: Manutenção / Obras em Automático,
  Sempre no menu ou Esconder. O menu esconde Ordens, Planos e Locais
  (Manutenção) ou Obras, Modelos, Orçamentos e Validar (Obras). As páginas
  continuam a abrir pelo endereço. Se a base não responder, o menu mostra tudo.
- **Entrar como**: o ecrã "Sem acesso" diz em nome de quem se está e tem
  "Voltar à minha conta"; ao fim de 1 h volta sozinho, também nesse ecrã.

## Aplicar

1. `db/pessoas-crm.sql` (versão nova, sem clientes na lista)
2. `db/equipa.sql`

Validar localmente: `npm run validar-equipa` (e `validar-pessoas-crm`).
