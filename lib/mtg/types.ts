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
  isLegendary?: boolean
  isTapped?: boolean
  counters?: number
  positiveCounters?: number // +1/+1 counters
  negativeCounters?: number // -1/-1 counters
  attachedTo?: string
  isAnimating?: boolean
  isToken?: boolean // For token creatures
  temporaryEffects?: {    // Effects that last until end of turn
    powerMod?: number
    toughnessMod?: number
  }
}

export type AIDeckType = "krenko_goblins" | "talrand_control" | "omnath_landfall" | "edgar_vampires" | "hapatra_counters"

export interface GameConfig {
  playerCount: 2 | 3 | 4
  startingLife: 20 | 30 | 40
  playerName: string
  playerDeck?: Card[] // Deck del jugador (si no se especifica, usa deck por defecto)
  aiDeck?: Card[] // Deck de la IA (si no se especifica, usa deck por defecto)
  deckType?: "blight_curse"
  aiDeckType?: AIDeckType
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
