import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * As 24 ordens do pipeline de aquisição, configuradas pelo ecrã.
 *
 * O ecrã "Pipeline Comercial — Automações" (`/deals` → Workflow) deixa arrastar
 * os cinco módulos para qualquer ordem. Com o Cliente fixo em último, isso dá
 * 24 arranjos. Até 2026-08-31 **só um** funcionava de ponta a ponta: o motor
 * implementava 5 dos 16 elos possíveis.
 *
 * O que este teste verifica, e porquê assim
 * -----------------------------------------
 * A prova está na **frase que o ecrã anuncia** — "Pedido — Fechado Ganho cria
 * Orçamento. Orçamento — Aceite cria Proposta. …" — porque essa é construída só
 * a partir das regras ACTIVAS.
 *
 * Não verifica "a acção certa aparece no separador do módulo": as regras
 * substituídas ficam listadas mesmo depois de desactivadas, portanto essa
 * verificação passa sempre e não prova nada. Foi assim que uma versão anterior
 * chegou a 144 verificações das quais metade não podia falhar.
 */

const MODULOS = ['Pedido', 'Orçamento', 'Proposta', 'Contrato'] as const
const PASSO = '[class*="min-w-\\[70px\\]"]'

/** Todas as permutações — 24, com o Cliente de fora porque é terminal. */
function permutacoes<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]]
  return xs.flatMap((x, i) =>
    permutacoes([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]),
  )
}

async function abrirPainel(page: Page): Promise<Locator> {
  await page.goto('/deals', { waitUntil: 'domcontentloaded' })
  const botao = page.getByRole('button', { name: 'Workflow' }).first()
  await botao.waitFor({ timeout: 40_000 })
  await botao.click()
  const painel = page.locator('[role="dialog"]').filter({ hasText: 'Fluxo Automático' }).first()
  await painel.waitFor({ timeout: 20_000 })
  return painel
}

async function ordemNoEcra(passos: Locator): Promise<string[]> {
  const n = await passos.count()
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(((await passos.nth(i).innerText()).split('\n')[0] ?? '').trim())
  }
  return out
}

async function fraseAnunciada(painel: Locator): Promise<string> {
  const texto = await painel.innerText()
  return texto.split('\n').find((l) => l.includes(' cria ')) ?? ''
}

/**
 * Arrasta o passo `de` para a posição de `para`.
 *
 * A pega só aparece ao passar o rato, e o sensor do dnd-kit exige movimento
 * real: um `dragTo` directo não activa o gesto.
 */
async function arrastar(page: Page, passos: Locator, de: number, para: number) {
  const origem = passos.nth(de)
  const destino = passos.nth(para)
  await origem.hover()
  await page.waitForTimeout(350)
  const pega = origem.locator('[class*="cursor-grab"]').first()
  const alvo = (await pega.count()) > 0 ? pega : origem
  const a = await alvo.boundingBox()
  const z = await destino.boundingBox()
  if (!a || !z) throw new Error('sem coordenadas para arrastar')

  const sx = a.x + a.width / 2
  const sy = a.y + a.height / 2
  const zx = z.x + z.width / 2
  const zy = z.y + z.height / 2

  await page.mouse.move(sx, sy)
  await page.waitForTimeout(180)
  await page.mouse.down()
  await page.waitForTimeout(260)
  for (let k = 1; k <= 18; k++) {
    await page.mouse.move(sx + ((zx - sx) * k) / 18, sy + ((zy - sy) * k) / 18)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(420)
  await page.mouse.up()
  await page.waitForTimeout(1800)
}

/**
 * Confirma a alteração, se o diálogo aparecer, e espera que FECHE.
 *
 * Uma espera fixa aqui foi a causa de falsos vermelhos: ler os separadores com
 * o modal ainda aberto devolve vazio, e o erro cascateia para tudo o que vem
 * depois.
 */
async function confirmarSePreciso(page: Page) {
  await page.waitForTimeout(700)
  const botao = page.getByRole('button', { name: 'Confirmar' })
  if ((await botao.count()) === 0) return
  const modal = page
    .locator('[role="dialog"]')
    .filter({ hasText: 'Reordenar altera a automação' })
    .first()
  await botao.first().click()
  await modal.waitFor({ state: 'hidden', timeout: 30_000 })
  await page.waitForTimeout(800)
}

async function voltarAoFluxo(painel: Locator, page: Page) {
  const aba = painel.getByRole('tab', { name: 'Configurar' })
  if ((await aba.count()) > 0) {
    await aba.first().click()
    await page.waitForTimeout(900)
  }
}

test.describe('Pipeline de aquisição — as 24 ordens', () => {
  // Cada ordem exige vários arrastos, cada um com a sua confirmação.
  test.setTimeout(180_000)

  const ordens = permutacoes(MODULOS)

  test('há exactamente 24 ordens possíveis', () => {
    expect(ordens).toHaveLength(24)
  })

  for (const [i, alvo] of ordens.entries()) {
    test(`${i + 1}/24 — ${alvo.join(' → ')} → Cliente`, async ({ page }) => {
      // Painel novo por ordem: 24 reordenações seguidas no mesmo painel montado
      // não é como uma pessoa usa isto, e encravava o botão "A aplicar…".
      const painel = await abrirPainel(page)
      const passos = painel.locator(PASSO)

      for (let pos = 0; pos < alvo.length; pos++) {
        const actual = await ordemNoEcra(passos)
        if (actual[pos] === alvo[pos]) continue
        const origem = actual.indexOf(alvo[pos])
        expect(origem, `módulo ${alvo[pos]} não está no fluxo`).toBeGreaterThanOrEqual(0)
        await arrastar(page, passos, origem, pos)
        await confirmarSePreciso(page)
        await voltarAoFluxo(painel, page)
      }

      const obtida = await ordemNoEcra(passos)

      // O Cliente é terminal: nada pode vir depois dele, em ordem nenhuma.
      expect(obtida[obtida.length - 1]).toBe('Cliente')

      // A prova: a frase anunciada descreve a cadeia, e só conta regras activas.
      const frase = await fraseAnunciada(painel)
      for (let k = 0; k < obtida.length - 1; k++) {
        const de = obtida[k]
        const para = obtida[k + 1]
        expect(
          frase,
          `o ecrã devia anunciar que ${de} cria ${para}. Anuncia: "${frase}"`,
        ).toMatch(new RegExp(`${de} — [^.]*cria ${para}`))
      }
    })
  }
})
