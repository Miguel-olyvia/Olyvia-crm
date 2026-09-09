import { test, expect } from '@playwright/test'

// Os oito ecras novos de ausencias e de assiduidade. Este ficheiro responde a
// uma pergunta so, e e a que nenhuma revisao consegue responder: abrem?
//
// A razao de existir e concreta -- duas vezes nesta obra os ecras foram
// escritos, revistos e aprovados, e estavam inalcancaveis porque as permissoes
// existiam no catalogo e nao estavam atribuidas a papel nenhum. Ninguem deu por
// isso ate alguem tentar abrir.
//
// Nao escreve nada na base: so navega e observa.

const ECRAS = [
  { rota: '/rh/ausencias', nome: 'as minhas ausencias' },
  { rota: '/rh/ausencias/aprovacoes', nome: 'aprovacoes' },
  { rota: '/rh/ausencias/organizacao', nome: 'ausencias da organizacao' },
  { rota: '/rh/definicoes/ausencias-tipos', nome: 'tipos de ausencia' },
  { rota: '/rh/assiduidade', nome: 'o meu ponto' },
  { rota: '/rh/assiduidade/equipa', nome: 'ponto da equipa' },
  { rota: '/rh/assiduidade/organizacao', nome: 'mapa de assiduidade' },
  { rota: '/rh/definicoes/assiduidade-dispositivos', nome: 'dispositivos de picagem' },
] as const

test.describe('RH — ausencias e assiduidade', () => {
  for (const { rota, nome } of ECRAS) {
    test(`${nome} abre e nao e negado`, async ({ page }) => {
      const errosEmExecucao: string[] = []
      page.on('pageerror', e => errosEmExecucao.push(e.message))

      await page.goto(rota, { waitUntil: 'domcontentloaded' })

      // O ecra tem de sair do estado de carregamento antes de se afirmar seja
      // o que for sobre ele.
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Access Denied'), `${nome}: negado por permissoes`).toHaveCount(0)
      await expect(page.getByText('Perfil não encontrado'), `${nome}: sem ficha`).toHaveCount(0)
      expect(page.url(), `${nome}: foi redireccionado para fora`).toContain(rota)

      // Uma chave de traducao por resolver aparece no ecra como o proprio
      // caminho da chave. E o defeito que a revisao encontrou em quinze sitios
      // do fluxo de pedir ausencia, e nao ha teste unitario que o veja.
      await expect(
        page.getByText(/\bhr\.[a-z]+\.[a-zA-Z.]+\b/),
        `${nome}: ha chaves de traducao por resolver a aparecer no ecra`,
      ).toHaveCount(0)

      expect(errosEmExecucao, `${nome}: rebentou em execucao`).toEqual([])
    })
  }

  test('o menu leva as ausencias e a assiduidade', async ({ page }) => {
    await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // As entradas so aparecem a quem tem a permissao. Se nao aparecerem, ou a
    // permissao nao esta atribuida ou o menu nao foi ligado -- e em qualquer
    // dos casos ninguem chega la sem escrever o endereco a mao.
    //
    // Procura-se por BOTAO e pelo nome acessivel. O menu deste projecto nao usa
    // ligacoes: AppSidebar.tsx renderiza cada entrada como <button> com onClick
    // a chamar navigate(), e ha um comentario no ficheiro a explicar porque.
    // Procurar por a[href] nunca encontraria nada, e prender a busca ao primeiro
    // elemento de navegacao apanhava a barra estreita de icones em vez do painel
    // do modulo.
    for (const entrada of [
      /minhas ausências|my absences/i,
      /aprovações|approvals/i,
      /ausências de todos|everyone's absences/i,
      /meu relógio|my time clock/i,
      /assiduidade da equipa|team attendance/i,
    ]) {
      await expect(
        page.getByRole('button', { name: entrada }).first(),
        `nao ha entrada de menu para ${entrada}`,
      ).toBeVisible()
    }
  })
})
