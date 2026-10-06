# Campos configuráveis por empresa

> Trabalho de 06/10/2026, no ramo `feat/campos-configuraveis`. Migração
> `20261209100000_campos_configuraveis.sql`.

## Para que serve

A plataforma tem de servir mais do que a remodelação de casas. Cada empresa
adapta ao seu negócio quatro fichas e os nomes das coisas:

| Ficha | Onde aparece | Onde ficam os valores dos campos da empresa |
|---|---|---|
| Ficha do local | morada de entrega (cliente, orçamento, encomendas), Operações | `anew_address_extra` (morada + empresa) |
| Diagnóstico | necessidade do negócio, separador Diagnóstico | `deal_needs.diag_extra` |
| Cliente | ficha do cliente | `anew_clients.custom_fields` (o `vip` mantém-se) |
| Lead | edição da lead | `anew_leads.field_values` (os campos dos formulários mantêm-se) |

Os **nomes** (Cliente, Local, Obra, Negócio, Lead) mudam-se em
`cfg_empresa.termos`. Uma empresa de condomínios passa a ver "Condomínios" e
"Intervenções".

Configura-se em **Configurações → Fichas e campos** (`/configuracoes/campos`).
Só pode quem tem `settings.update` na empresa. Há modelos de partida por
setor em `modelosSetor.ts`: Remodelação residencial (a ficha de sempre), Lojas
e escritórios, Condomínios e Manutenção de equipamentos.

## Dois tipos de campo

**Campos de sistema.** São colunas: as 22 da ficha do local e os 15 `diag_*`
do planeamento. O motor de planeamento (`operacao-app/db/obras.sql`) e as
sugestões de proteções e logística leem-nos pelo nome da coluna, e esse nome é
o **papel** do campo. A empresa pode mudar-lhes:
- o rótulo;
- a ajuda;
- os rótulos das opções;
- a ordem;
- se são obrigatórios;
- se aparecem ou ficam escondidos.

Não pode mudar os valores, o tipo nem os limites, e por isso **o motor não
muda**. Esconder um campo não apaga o que já está gravado.

**Campos da empresa.** São livres:
- tipo: sim/não, escolha, número (com mínimo, máximo, casas decimais e unidade), texto curto, texto longo ou data;
- secção;
- condição "só aparece se `<campo>` for `<valores>`", sobre outro campo da empresa ou de sistema;
- obrigatório.

Por agora não entram no motor. Se um dia um campo de uma empresa tiver de
pesar no planeamento, a Olyvia transforma-o em campo de sistema por migração.
É isso que significa "ligar a papéis do motor fica com a Olyvia".

## Regras

- **Sem configuração, fica tudo como sempre.** Não há dados a migrar.
- **Validação num só sítio por lado.** `fn_cfg_validar_valores` na base e `validarValores` em `definicoes.ts` leem a definição e não têm regras por campo.
  - Os casos de teste são os mesmos: `src/lib/campos/__tests__/campos.test.ts` e `operacao-app/tools/validar-campos-configuraveis.mjs`.
- **"Obrigatório" não bloqueia a gravação.** O ecrã avisa; foi a decisão da reunião de 02/10.
- **Apagar ou esconder um campo da empresa não apaga valores.** A gravação junta os valores: substitui as chaves dos campos ativos e mantém o resto. Se o campo voltar com a mesma chave, os valores reaparecem.
- **As chaves de sistema estão em dois sítios**, `fn_cfg_chaves_sistema` e `catalogo.ts`. O teste lê a migração e compara os dois.
- **Chaves reservadas** (`fn_cfg_chaves_reservadas`): `piso`, `vip`, os `diag_*` antigos e outros nomes que já têm dono.

## Base de dados

- **`cfg_campos`** guarda uma linha por campo (`organization_id`, `ficha`, `chave`). Quando `sistema` é true, a linha é só um ajuste.
  - Leitura por RLS para os membros da empresa; escrita só por `rpc_cfg_gravar_ficha`, que substitui a ficha inteira numa transação.
- **`cfg_empresa`** guarda os termos e o `modelo_setor`. Grava-se por `rpc_cfg_gravar_empresa`.
- **Os valores gravam-se por RPC**, com as mesmas verificações de permissão que as gravações de sempre:
  - `rpc_local_extra_ler` e `rpc_local_extra_gravar`, com o acesso às moradas da entidade;
  - `rpc_diag_extra_gravar` (`fn_deal_org_in_scope`);
  - `rpc_cliente_extra_gravar` (`clients.edit`);
  - `rpc_lead_extra_gravar` (`leads.edit`).
- **Porque é que `anew_address_extra` é uma tabela à parte:**
  - a ficha é da morada física, partilhada entre clientes e empresas, por isso a chave inclui a empresa;
  - `fn_gravar_ficha_edificio` apaga a linha de `anew_address_building` quando as colunas ficam vazias, e uma coluna nova lá dentro seria apagada com ela.

## Testar

```
node operacao-app/tools/validar-campos-configuraveis.mjs   # SQL num Postgres local (PGlite)
npx vitest run src/lib/campos
```
