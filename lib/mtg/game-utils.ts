import type { Card, GameState, Player, GameZone, GamePhase, GameConfig } from "./types"
import { blightCurseDeck } from "./sample-deck"
import { getAIDeck } from "./ai-decks"

const aiOpponentDeck = getAIDeck(); // Declare aiOpponentDeck variable

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

export function createEmptyZones(): GameZone {
  return {
    library: [],
    hand: [],
    battlefield: [],
    graveyard: [],
    exile: [],
    commandZone: [],
  }
}

export function initializePlayer(
  id: "player" | "opponent",
  name: string,
  deck: Card[],
  startingLife: number = 40
): Player {
  const zones = createEmptyZones()
  
  // Find commander and put in command zone
  const commander = deck.find((c) => c.isCommander)
  const mainDeck = deck.filter((c) => !c.isCommander)
  
  if (commander) {
    zones.commandZone = [{ ...commander, id: `${id}-${commander.id}` }]
  }
  
  // Shuffle main deck and assign unique IDs
  zones.library = shuffleArray(
    mainDeck.map((card, index) => ({
      ...card,
      id: `${id}-${card.id}-${index}`,
      isTapped: false,
      negativeCounters: 0,
    }))
  )

  return {
    id,
    name,
    life: startingLife,
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    zones,
    commanderDamageDealt: 0,
    commanderDamageReceived: 0,
    poisonCounters: 0,
    hasDrawnThisTurn: false,
    hasPlayedLandThisTurn: false,
    attackingCreatures: [],
    blockingCreatures: [],
  }
}

export function createInitialGameState(config?: GameConfig): GameState {
  const startingLife = config?.startingLife || 40
  const playerName = config?.playerName || "Jugador"
  
  // Usar el deck del config si existe, sino usar el deck por defecto
  const playerDeck = config?.playerDeck || blightCurseDeck
  
  const player = initializePlayer("player", playerName, playerDeck, startingLife)
  const opponent = initializePlayer("opponent", "IA Goblin", aiOpponentDeck, startingLife)

  // Draw initial hands (7 cards)
  for (let i = 0; i < 7; i++) {
    if (player.zones.library.length > 0) {
      player.zones.hand.push(player.zones.library.shift()!)
    }
    if (opponent.zones.library.length > 0) {
      opponent.zones.hand.push(opponent.zones.library.shift()!)
    }
  }

  return {
    turn: 1,
    phase: "main1",
    activePlayer: "player",
    priorityPlayer: "player",
    player,
    opponent,
    stack: [],
    log: [`Partida iniciada. ${playerName} vs IA Goblin. Vida inicial: ${startingLife}. Tu turno.`],
  }
}

// Add -1/-1 counter to a card
export function addNegativeCounter(player: Player, cardId: string): Player {
  return {
    ...player,
    zones: {
      ...player.zones,
      battlefield: player.zones.battlefield.map((c) =>
        c.id === cardId
          ? { ...c, negativeCounters: (c.negativeCounters || 0) + 1 }
          : c
      ),
    },
  }
}

// Remove -1/-1 counter from a card
export function removeNegativeCounter(player: Player, cardId: string): Player {
  return {
    ...player,
    zones: {
      ...player.zones,
      battlefield: player.zones.battlefield.map((c) =>
        c.id === cardId && c.negativeCounters && c.negativeCounters > 0
          ? { ...c, negativeCounters: c.negativeCounters - 1 }
          : c
      ),
    },
  }
}

export function drawCard(player: Player): { player: Player; drawnCard: Card | null } {
  if (player.zones.library.length === 0) {
    return { player, drawnCard: null }
  }
  
  const [drawnCard, ...rest] = player.zones.library
  return {
    player: {
      ...player,
      zones: {
        ...player.zones,
        library: rest,
        hand: [...player.zones.hand, drawnCard],
      },
    },
    drawnCard,
  }
}

export function playCard(player: Player, cardId: string): Player {
  const cardIndex = player.zones.hand.findIndex((c) => c.id === cardId)
  if (cardIndex === -1) return player

  const card = player.zones.hand[cardIndex]
  const newHand = [...player.zones.hand]
  newHand.splice(cardIndex, 1)

  // Lands and permanents go to battlefield, instants/sorceries to graveyard
  const isPermanent = ["creature", "artifact", "enchantment", "land", "planeswalker"].includes(card.type)

  // Mark that a land has been played if this is a land
  const hasPlayedLand = card.type === "land" ? true : player.hasPlayedLandThisTurn

  return {
    ...player,
    hasPlayedLandThisTurn: hasPlayedLand,
    zones: {
      ...player.zones,
      hand: newHand,
      battlefield: isPermanent
        ? [...player.zones.battlefield, { ...card, isTapped: card.type === "land" ? false : false }]
        : player.zones.battlefield,
      graveyard: isPermanent ? player.zones.graveyard : [...player.zones.graveyard, card],
    },
  }
}

export function tapCard(player: Player, cardId: string): Player {
  return {
    ...player,
    zones: {
      ...player.zones,
      battlefield: player.zones.battlefield.map((c) =>
        c.id === cardId ? { ...c, isTapped: !c.isTapped } : c
      ),
    },
  }
}

export function untapAll(player: Player): Player {
  return {
    ...player,
    hasDrawnThisTurn: false,
    hasPlayedLandThisTurn: false,
    zones: {
      ...player.zones,
      battlefield: player.zones.battlefield.map((c) => ({ ...c, isTapped: false })),
    },
  }
}

export function moveCard(
  player: Player,
  cardId: string,
  from: keyof GameZone,
  to: keyof GameZone
): Player {
  const fromZone = [...player.zones[from]]
  const cardIndex = fromZone.findIndex((c) => c.id === cardId)
  if (cardIndex === -1) return player

  const [card] = fromZone.splice(cardIndex, 1)
  const toZone = [...player.zones[to], card]

  return {
    ...player,
    zones: {
      ...player.zones,
      [from]: fromZone,
      [to]: toZone,
    },
  }
}

export function castCommander(player: Player): Player {
  if (player.zones.commandZone.length === 0) return player
  
  const commander = player.zones.commandZone[0]
  return {
    ...player,
    zones: {
      ...player.zones,
      commandZone: [],
      battlefield: [...player.zones.battlefield, { ...commander, isTapped: false }],
    },
  }
}

export function returnCommanderToZone(player: Player, cardId: string): Player {
  const cardIndex = player.zones.battlefield.findIndex((c) => c.id === cardId)
  if (cardIndex === -1) return player
  
  const card = player.zones.battlefield[cardIndex]
  if (!card.isCommander) return player
  
  const newBattlefield = [...player.zones.battlefield]
  newBattlefield.splice(cardIndex, 1)
  
  return {
    ...player,
    zones: {
      ...player.zones,
      battlefield: newBattlefield,
      commandZone: [card],
    },
  }
}

export const PHASE_ORDER: GamePhase[] = [
  "untap",
  "upkeep",
  "draw",
  "main1",
  "combat_begin",
  "combat_attackers",
  "combat_blockers",
  "combat_damage",
  "combat_end",
  "main2",
  "end",
  "cleanup",
]

export function getNextPhase(currentPhase: GamePhase): GamePhase {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase)
  return PHASE_ORDER[(currentIndex + 1) % PHASE_ORDER.length]
}

export function getCardColorClass(card: Card): string {
  if (card.colors.length === 0 || (card.colors.length === 1 && card.colors[0] === "C")) {
    return "from-gray-600 to-gray-700" // Colorless
  }
  if (card.colors.length > 1) {
    return "from-amber-600 to-amber-700" // Multicolor (gold)
  }
  
  switch (card.colors[0]) {
    case "W": return "from-amber-100 to-amber-200" // White
    case "U": return "from-blue-500 to-blue-600" // Blue
    case "B": return "from-gray-800 to-gray-900" // Black
    case "R": return "from-red-500 to-red-600" // Red
    case "G": return "from-green-500 to-green-600" // Green
    default: return "from-gray-600 to-gray-700"
  }
}

export function getCardTextColorClass(card: Card): string {
  if (card.colors.length === 0 || (card.colors.length === 1 && card.colors[0] === "C")) {
    return "text-gray-200"
  }
  if (card.colors.length > 1) {
    return "text-gray-900"
  }
  
  switch (card.colors[0]) {
    case "W": return "text-gray-900"
    case "U": return "text-white"
    case "B": return "text-gray-200"
    case "R": return "text-white"
    case "G": return "text-white"
    default: return "text-gray-200"
  }
}
