import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Backlog, Item, Snapshot } from '../types'

const PANE = 'looping'
const ARQUIVO = '.loop/backlog.json'
const snap = atom({ plugin: 'looping-painel', key: 'snap' } as const, { backlog: null, lidoEm: 0 } as Snapshot, {
  shape: 'snap-1',
})

const ROTULO: Record<string, string> = {
  fazendo: '▶ fazendo',
  pendente: '○ pendente',
  feito: '✓ feito',
  travado: '✕ travado',
  conflito: '⇄ conflito',
}
const ORDEM = ['fazendo', 'pendente', 'travado', 'conflito', 'feito']

export const register: Register = on => {
  let texto = ''

  const ler = async ($: EngineInterface) => {
    let atual = ''
    try {
      atual = (await $.fs.exists(ARQUIVO)) ? String(await $.fs.read(ARQUIVO)) : ''
    } catch {
      atual = ''
    }
    if (atual === texto) return
    texto = atual
    let backlog: Backlog | null = null
    try {
      backlog = atual ? (JSON.parse(atual) as Backlog) : null
    } catch {
      backlog = null
    }
    await update($, snap, () => ({ backlog, lidoEm: Date.now() }))
    const abertos = backlog?.itens.filter(i => i.status === 'pendente' || i.status === 'fazendo').length ?? 0
    await $.ui.status(backlog?.ativo ? `loop: ${abertos} aberto(s)` : undefined)
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'looping-painel', description: 'Abre o painel do backlog do looping' })
    await ler($)
    $.clock.every(2000, () => ler($))
    const s = await read($, snap)
    if (s.backlog?.ativo) void $.ui.open({ id: PANE, title: 'Looping' })

    return next(e)
  })

  on('command.run', { command: 'looping-painel' }, async $ => {
    await ler($)
    await $.ui.open({ id: PANE, title: 'Looping' })

    return { text: 'Painel do looping aberto.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { backlog: b } = await read($, snap)

    if (!b) {
      return (
        <Box flexDirection="column">
          <Text bold>Looping</Text>
          <Text dimColor>Nenhum loop nesta pasta.</Text>
          <Text dimColor>Comece com /looping "objetivo".</Text>
        </Box>
      )
    }

    const conta = (s: string) => b.itens.filter(i => i.status === s).length
    const feitos = conta('feito')
    const total = b.itens.length
    const largura = 20
    const cheio = total ? Math.round((feitos / total) * largura) : 0
    const doAgente = b.itens.filter(i => i.origem === 'agente').length
    const v = b.ultima_varredura
    const espaco = Math.max(3, (e.viewport?.rows ?? 30) - 14)
    const lista: Item[] = [...b.itens].sort(
      (x, y) => ORDEM.indexOf(x.status) - ORDEM.indexOf(y.status) || y.id - x.id,
    )

    return (
      <Box flexDirection="column">
        <Text bold>{b.ativo ? '● Loop ativo' : `■ Encerrado${b.motivo_fim ? `: ${b.motivo_fim}` : ''}`}</Text>
        <Text>{b.objetivo}</Text>
        <Text> </Text>
        <Text>
          {'█'.repeat(cheio)}
          <Text dimColor>{'░'.repeat(largura - cheio)}</Text> {feitos}/{total}
        </Text>
        <Text dimColor>
          pendente {conta('pendente')} · fazendo {conta('fazendo')} · travado {conta('travado')} · conflito{' '}
          {conta('conflito')}
        </Text>
        <Text dimColor={doAgente < b.limite}>
          criadas pelo agente: {doAgente}/{b.limite}
          {doAgente >= b.limite ? ' (limite atingido)' : ''}
        </Text>
        <Text dimColor>
          varredura: {v ? `${v.quando.slice(11, 16)} · ${v.novos} novo(s)` : 'ainda não feita'}
        </Text>
        <Text> </Text>
        {lista.slice(0, espaco).map(i => (
          <Text dimColor={i.status === 'feito'} bold={i.status === 'fazendo'}>
            {ROTULO[i.status] ?? i.status} #{i.id} {i.titulo}
            {i.origem === 'usuario' ? ' (você)' : ''}
            {i.conflito_com ? ` ⇄ #${i.conflito_com}` : ''}
          </Text>
        ))}
        {lista.length > espaco && <Text dimColor>+{lista.length - espaco} item(ns)</Text>}
        {(b.sugestoes?.length ?? 0) > 0 && <Text dimColor>{b.sugestoes!.length} sugestão(ões) além do limite</Text>}
      </Box>
    )
  })
}
