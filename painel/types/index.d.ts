export type Item = { id: number; titulo: string; tipo: string; impacto: string; origem: string; status: string; tentativas: number; evidencia: string | null; conflito_com?: number }
export type Backlog = {
  objetivo: string; limite: number; ativo: boolean; motivo_fim?: string; itens: Item[]
  ultima_varredura: { quando: string; novos: number } | null; sugestoes?: string[]
}
export type Snapshot = { backlog: Backlog | null; lidoEm: number }

declare module 'claude-code' {
  interface PluginState {
    'looping-painel': { snap: Shaped<Snapshot> }
  }
}
