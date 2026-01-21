export type CardType = 
  | "creature" 
  | "instant" 
  | "sorcery" 
  | "enchantment" 
  | "artifact" 
  | "land" 
  | "planeswalker"

export type ManaColor = "W" | "U" | "B" | "R" | "G" | "C" // White, Blue, Black, Red, Green, Colorless

export interface Card {
  id: string
  name: string
  manaCost: string
  cmc: number // converted mana cost
  type: CardType
  subtype?: string
  text: string
  power?: number
  toughness?: number
  colors: ManaColor[]
  imageUrl?: string
  isCommander?: boolean
  isTapped?: boolean
  counters?: number
  negativeCounters?: number // -1/-1 counters
  attachedTo?: string
  isAnimating?: boolean
}

export type AIDeckType = "krenko_goblins" | "talrand_control" | "omnath_landfall" | "edgar_vampires"

export interface GameConfig {
  playerCount: 2 | 3 | 4
  startingLife: 20 | 30 | 40
  playerName: string
  deckType: "blight_curse"
  aiDeckType: AIDeckType
}

export interface AttackingCreature {
  cardId: string
  targetPlayerId: "player" | "opponent"
}

export interface BlockingCreature {
  blockerId: string
  attackerId: string
}

export interface GameZone {
  library: Card[]
  hand: Card[]
  battlefield: Card[]
  graveyard: Card[]
  exile: Card[]
  commandZone: Card[]
}

export interface Player {
  id: "player" | "opponent"
  name: string
  life: number
  mana: { [key in ManaColor]: number }
  zones: GameZone
  commanderDamageDealt: number
  commanderDamageReceived: number
  poisonCounters: number
  hasDrawnThisTurn: boolean
  hasPlayedLandThisTurn: boolean
  attackingCreatures: AttackingCreature[]
  blockingCreatures: BlockingCreature[]
}

export interface GameState {
  turn: number
  phase: GamePhase
  activePlayer: "player" | "opponent"
  priorityPlayer: "player" | "opponent"
  player: Player
  opponent: Player
  stack: Card[]
  log: string[]
}

export type GamePhase = 
  | "untap"
  | "upkeep" 
  | "draw"
  | "main1"
  | "combat_begin"
  | "combat_attackers"
  | "combat_blockers"
  | "combat_damage"
  | "combat_end"
  | "main2"
  | "end"
  | "cleanup"

export const PHASE_NAMES: Record<GamePhase, string> = {
  untap: "Enderezar",
  upkeep: "Mantenimiento",
  draw: "Robar",
  main1: "Fase Principal 1",
  combat_begin: "Inicio Combate",
  combat_attackers: "Declarar Atacantes",
  combat_blockers: "Declarar Bloqueadores",
  combat_damage: "Daño de Combate",
  combat_end: "Fin Combate",
  main2: "Fase Principal 2",
  end: "Fase Final",
  cleanup: "Limpieza"
}
