import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Backlog, Item, Snapshot } from '../types'

const PANE = 'looping'
const ARQUIVO = '.loop/backlog.json'
const snap = atom({ plugin: 'looping-painel', key: 'snap' } as const, { backlog: null, lidoEm: 0 } as Snapshot, {
  shape: 'snap-1',
})

const ESTILO: Record<string, { icone: string; cor: string; nome: string }> = {
  fazendo: { icone: '◆', cor: 'claude', nome: 'fazendo' },
  pendente: { icone: '○', cor: 'text', nome: 'pendente' },
  feito: { icone: '✓', cor: 'success', nome: 'feito' },
  travado: { icone: '✕', cor: 'error', nome: 'travado' },
  conflito: { icone: '⇄', cor: 'warning', nome: 'conflito' },
}
const TIPO: Record<string, string> = { bug: 'bug', melhoria: 'melhoria', tarefa: 'tarefa' }
const ORDEM = ['fazendo', 'pendente', 'travado', 'conflito', 'feito']

let texto = ''

async function ler($: EngineInterface) {
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

export const register: Register = on => {
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
        <Box flexDirection="column" padding={1} gap={1}>
          <Text bold color="claude">⟳ Looping</Text>
          <Box borderStyle="round" borderColor="subtle" paddingX={1} flexDirection="column">
            <Text dimColor>Nenhum loop nesta pasta.</Text>
            <Text dimColor>Comece com <Text color="suggestion">/looping "seu objetivo"</Text></Text>
          </Box>
        </Box>
      )
    }

    const conta = (s: string) => b.itens.filter(i => i.status === s).length
    const feitos = conta('feito')
    const total = b.itens.length
    const pct = total ? Math.round((feitos / total) * 100) : 0
    const largura = 24
    const cheio = total ? Math.round((feitos / total) * largura) : 0
    const doAgente = b.itens.filter(i => i.origem === 'agente').length
    const noLimite = doAgente >= b.limite
    const v = b.ultima_varredura
    const espaco = Math.max(3, (e.viewport?.rows ?? 30) - 18)
    const lista: Item[] = [...b.itens].sort(
      (x, y) => ORDEM.indexOf(x.status) - ORDEM.indexOf(y.status) || y.id - x.id,
    )
    const atual = b.itens.find(i => i.status === 'fazendo')

    const chip = (s: string) => {
      const st = ESTILO[s]!
      const n = conta(s)
      return (
        <Text color={n ? st.cor : 'subtle'}>
          {st.icone} {n} {st.nome}
        </Text>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        <Box justifyContent="space-between">
          <Text bold color="claude">⟳ Looping</Text>
          <Text color={b.ativo ? 'success' : 'subtle'}>{b.ativo ? '● ativo' : '■ encerrado'}</Text>
        </Box>

        <Box borderStyle="round" borderColor={b.ativo ? 'claude' : 'subtle'} paddingX={1} flexDirection="column">
          <Text bold wrap="wrap">{b.objetivo}</Text>
          <Box marginTop={1}>
            <Text color="success">{'━'.repeat(cheio)}</Text>
            <Text color="subtle">{'━'.repeat(largura - cheio)}</Text>
            <Text bold> {pct}%</Text>
            <Text dimColor>  {feitos}/{total}</Text>
          </Box>
          {!b.ativo && b.motivo_fim && <Text dimColor wrap="wrap">{b.motivo_fim}</Text>}
        </Box>

        <Box flexWrap="wrap" columnGap={2}>
          {chip('pendente')}
          {chip('fazendo')}
          {chip('feito')}
          {chip('travado')}
          {chip('conflito')}
        </Box>

        <Box flexDirection="column">
          <Box justifyContent="space-between">
            <Text dimColor>descobertas do agente</Text>
            <Text color={noLimite ? 'warning' : 'text'}>
              {doAgente}/{b.limite}{noLimite ? ' · limite' : ''}
            </Text>
          </Box>
          <Box justifyContent="space-between">
            <Text dimColor>última varredura</Text>
            <Text color={v && v.novos === 0 ? 'success' : 'text'}>
              {v ? `${v.quando.slice(11, 16)} · ${v.novos === 0 ? 'limpa' : `${v.novos} novo(s)`}` : 'pendente'}
            </Text>
          </Box>
        </Box>

        {atual && (
          <Box borderStyle="round" borderColor="claude" paddingX={1} flexDirection="column">
            <Text color="claude" bold>◆ Agora</Text>
            <Text wrap="wrap">#{atual.id} {atual.titulo}</Text>
          </Box>
        )}

        <Box flexDirection="column">
          {lista.filter(i => i !== atual).slice(0, espaco).map(i => {
            const st = ESTILO[i.status] ?? { icone: '·', cor: 'text', nome: i.status }
            const feito = i.status === 'feito'
            return (
              <Box key={String(i.id)} gap={1}>
                <Text color={st.cor}>{st.icone}</Text>
                <Text dimColor={feito} strikethrough={feito} wrap="truncate-end">
                  {i.titulo}
                </Text>
                <Text dimColor>
                  {TIPO[i.tipo] ?? i.tipo}{i.origem === 'usuario' ? ' · você' : ''}{i.conflito_com ? ` · ⇄ #${i.conflito_com}` : ''}
                </Text>
              </Box>
            )
          })}
          {lista.length - (atual ? 1 : 0) > espaco && (
            <Text dimColor>+ {lista.length - (atual ? 1 : 0) - espaco} item(ns)</Text>
          )}
        </Box>

        {(b.sugestoes?.length ?? 0) > 0 && (
          <Text color="warning">✦ {b.sugestoes!.length} sugestão(ões) além do limite</Text>
        )}
      </Box>
    )
  })
}
