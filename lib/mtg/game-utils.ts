import type { Card, GameState, Player, GameZone, GamePhase, GameConfig, ManaColor } from "./types"
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
  const opponentDeck = config?.aiDeck || aiOpponentDeck
  
  const player = initializePlayer("player", playerName, playerDeck, startingLife)
  const opponent = initializePlayer("opponent", "IA Oponente", opponentDeck, startingLife)

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

// Parsear manaCost de formato {X}{Y}{Z} a dos valores:
// 1) conteos por color específico (W,U,B,R,G,C) y 2) coste genérico total (números)
function parseManaCost(manaCost: string): {
  colored: { [key in keyof Player["mana"]]?: number }
  generic: number
} {
  const colored: { [key in keyof Player["mana"]]?: number } = {}
  let generic = 0

  let i = 0
  while (i < manaCost.length) {
    if (manaCost[i] === "{") {
      const closeIdx = manaCost.indexOf("}", i)
      if (closeIdx !== -1) {
        const symbol = manaCost.substring(i + 1, closeIdx)
        // Símbolos de color específicos
        if (["W", "U", "B", "R", "G", "C"].includes(symbol)) {
          const key = symbol as keyof Player["mana"]
          colored[key] = (colored[key] || 0) + 1
        } else if (!isNaN(Number(symbol))) {
          // Símbolos numéricos representan coste genérico
          generic += Number(symbol)
        } else {
          // Otros símbolos (híbridos, X, etc.) se ignoran por simplicidad por ahora
          // y no bloquean el juego en este modelo simplificado
        }
        i = closeIdx + 1
      } else {
        i++
      }
    } else {
      i++
    }
  }

  return { colored, generic }
}

// Verificar si el jugador tiene suficiente mana para jugar una carta
export function canPlayCard(player: Player, card: Card): boolean {
  if (card.type === "land") {
    // Las tierras no tienen coste de mana
    return true
  }

  if (!card.manaCost || card.manaCost === "") {
    return true
  }

  // Parsear coste requerido
  const { colored: requiredColored, generic: requiredGeneric } = parseManaCost(card.manaCost)

  // Construir mana potencial disponible: pool actual + tierras enderezadas que producen ese color
  const available: { [key in keyof Player["mana"]]: number } = { ...player.mana }

  // Contar tierras enderezadas por color
  for (const land of player.zones.battlefield) {
    if (land.type === "land" && !land.isTapped) {
      const color = getLandManaColor(land.name)
      available[color] = (available[color] || 0) + 1
    }
  }

  // Satisfacer requisitos de colores específicos
  if (requiredColored) {
    for (const color of ["W", "U", "B", "R", "G", "C"] as Array<keyof Player["mana"]>) {
      const need = requiredColored[color] || 0
      if (need > 0) {
        if ((available[color] || 0) < need) {
          return false
        }
        // Reservar ese mana reduciéndolo del disponible
        available[color] = (available[color] || 0) - need
      }
    }
  }

  // Calcular mana genérico restante disponible (cualquier color sirve)
  const totalRemaining = (available.W || 0) + (available.U || 0) + (available.B || 0) + (available.R || 0) + (available.G || 0) + (available.C || 0)

  return totalRemaining >= requiredGeneric
}

// Restar el mana de la carta del mana del jugador y tapear las tierras correspondientes
export function spendManaForCard(player: Player, card: Card): Player {
  if (card.type === "land" || !card.manaCost || card.manaCost === "") {
    // Las tierras no consumen mana
    return player
  }

  let p: Player = { ...player }
  const { colored: requiredColored, generic: requiredGeneric } = parseManaCost(card.manaCost)

  // Helper: tapear una tierra de un color y sumar 1 al pool
  const tapOneLandOfColor = (pl: Player, color: keyof Player["mana"]): Player => {
    const land = pl.zones.battlefield.find(
      (c) => c.type === "land" && !c.isTapped && getLandManaColor(c.name) === color
    )
    if (!land) return pl
    return {
      ...pl,
      mana: { ...pl.mana, [color]: pl.mana[color] + 1 },
      zones: {
        ...pl.zones,
        battlefield: pl.zones.battlefield.map((c) =>
          c.id === land.id ? { ...c, isTapped: true } : c
        ),
      },
    }
  }

  // 1) Pagar colores específicos: garantizar pool suficiente auto-tapeando tierras del color
  for (const color of ["W", "U", "B", "R", "G", "C"] as Array<keyof Player["mana"]>) {
    const need = (requiredColored?.[color] || 0)
    if (need > 0) {
      // Auto-tap hasta alcanzar el pool requerido
      while (p.mana[color] < need) {
        const before = p
        p = tapOneLandOfColor(p, color)
        if (before === p) break // no había tierras disponibles
      }
      // Reducir del pool
      const canPay = Math.min(p.mana[color], need)
      p = { ...p, mana: { ...p.mana, [color]: p.mana[color] - canPay } }
    }
  }

  // 2) Pagar coste genérico usando cualquier color; auto-tap si falta pool
  let remainingGeneric = requiredGeneric
  const colorsOrder: Array<keyof Player["mana"]> = ["W", "U", "B", "R", "G", "C"]
  const totalPool = () => colorsOrder.reduce((sum, c) => sum + p.mana[c], 0)

  while (remainingGeneric > 0) {
    if (totalPool() === 0) {
      // Tapear cualquier tierra disponible para agregar mana al pool
      const anyUntapped = p.zones.battlefield.find((c) => c.type === "land" && !c.isTapped)
      if (!anyUntapped) break
      const color = getLandManaColor(anyUntapped.name)
      p = tapOneLandOfColor(p, color)
    }

    // Gastar 1 del color con mayor cantidad disponible
    const richest = colorsOrder.sort((a, b) => p.mana[b] - p.mana[a])[0]
    if (p.mana[richest] > 0) {
      p = { ...p, mana: { ...p.mana, [richest]: p.mana[richest] - 1 } }
      remainingGeneric--
    } else {
      // No queda pool a pesar de intentar tapear
      break
    }
  }

  return p
}

// Función auxiliar para obtener el color de mana de una tierra
function getLandManaColor(landName: string): keyof Player["mana"] {
  const manaMap: { [key: string]: keyof Player["mana"] } = {
    "white": "W",
    "blue": "U",
    "black": "B",
    "red": "R",
    "green": "G",
    "island": "U",
    "mountain": "R",
    "forest": "G",
    "swamp": "B",
    "plains": "W",
  }

  const landNameLower = landName.toLowerCase()
  for (const [landType, color] of Object.entries(manaMap)) {
    if (landNameLower.includes(landType)) {
      return color
    }
  }
  
  return "C"
}

export function drawCard(player: Player): { player: Player; drawnCard: Card | null } {
  if (player.zones.library.length === 0) {
    return { player, drawnCard: null }
  }
  
  const [drawnCard, ...rest] = player.zones.library
  return {
    player: {
      ...player,
      hasDrawnThisTurn: true,
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

  // Verificar si hay suficiente mana (considerando tierras enderezadas)
  if (!canPlayCard(player, card)) {
    return player
  }

  const newHand = [...player.zones.hand]
  newHand.splice(cardIndex, 1)

  // Lands and permanents go to battlefield, instants/sorceries to graveyard
  const isPermanent = ["creature", "artifact", "enchantment", "land", "planeswalker"].includes(card.type)

  // Mark that a land has been played if this is a land
  const hasPlayedLand = card.type === "land" ? true : player.hasPlayedLandThisTurn

  // Restar el mana (auto-tapea si hace falta y descuenta del pool)
  const updatedPlayer = spendManaForCard(player, card)

  // Conservar el estado de las tierras tapadas tras el pago
  const battlefieldAfterPayment = updatedPlayer.zones.battlefield

  return {
    ...updatedPlayer,
    hasPlayedLandThisTurn: hasPlayedLand,
    zones: {
      ...updatedPlayer.zones,
      hand: newHand,
      battlefield: isPermanent
        ? [...battlefieldAfterPayment, { ...card, isTapped: false }]
        : battlefieldAfterPayment,
      graveyard: isPermanent ? updatedPlayer.zones.graveyard : [...updatedPlayer.zones.graveyard, card],
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

// Interpretar el texto de la carta para extraer qué tipo de maná produce cuando se gira
function parseManaFromText(text: string): { colors: ManaColor[]; amount: number } {
  const colors: ManaColor[] = []
  
  // Buscar el patrón {T}: Add ... que indica qué mana produce al girarse
  // Patrones soportados:
  // "{T}: Add {B}."
  // "{T}: Add {B} or {G}."
  // "{T}: Add {B}{G}."
  // "({T}: Add {B} or {G}.)"
  
  const tapAddRegex = /\{T\}:\s*Add\s+([^.]+)\./gi
  const matches = [...text.matchAll(tapAddRegex)]
  
  for (const match of matches) {
    const manaText = match[1]
    
    // Extraer todos los símbolos de maná {X}
    const manaSymbols = manaText.match(/\{([WUBRGC])\}/gi)
    if (manaSymbols) {
      for (const symbol of manaSymbols) {
        const color = symbol.replace(/[{}]/g, '').toUpperCase() as ManaColor
        // Agregar cada símbolo encontrado (permite duplicados para tierras que dan 2 del mismo)
        colors.push(color)
      }
    }
  }
  
  // También buscar patrones sin {T}: como "Add {B}{G}" directamente
  if (colors.length === 0) {
    const addManaRegex = /Add\s+([^.]+)\./gi
    const addMatches = [...text.matchAll(addManaRegex)]
    
    for (const match of addMatches) {
      const manaText = match[1]
      const manaSymbols = manaText.match(/\{([WUBRGC])\}/gi)
      if (manaSymbols) {
        for (const symbol of manaSymbols) {
          const color = symbol.replace(/[{}]/g, '').toUpperCase() as ManaColor
          colors.push(color)
        }
      }
    }
  }
  
  // Buscar patrones con texto como "one mana of any color"
  if (colors.length === 0 && text.toLowerCase().includes("mana of any color")) {
    colors.push("C") // Tratamos como colorless por simplicidad
  }
  
  return { colors, amount: colors.length || 1 }
}

// Tapear una tierra para generar mana según su nombre o texto
export function tapLandForMana(player: Player, cardId: string): Player {
  const land = player.zones.battlefield.find((c) => c.id === cardId && c.type === "land")
  if (!land || land.isTapped) return player

  // Primero intentar parsear el texto de la carta
  const cardText = land.text || ""
  const parsedMana = parseManaFromText(cardText)
  
  // Si encontramos maná en el texto, usarlo
  if (parsedMana.colors.length > 0) {
    let newMana = { ...player.mana }
    for (const color of parsedMana.colors) {
      newMana[color] = newMana[color] + 1
    }
    
    return {
      ...player,
      mana: newMana,
      zones: {
        ...player.zones,
        battlefield: player.zones.battlefield.map((c) =>
          c.id === cardId ? { ...c, isTapped: true } : c
        ),
      },
    }
  }

  // Fallback: Generar mana según el tipo de tierra por nombre
  const manaMap: { [key: string]: keyof typeof player.mana } = {
    "white": "W",
    "blue": "U",
    "black": "B",
    "red": "R",
    "green": "G",
    "island": "U",
    "mountain": "R",
    "forest": "G",
    "swamp": "B",
    "plains": "W",
  }

  let manaColor: keyof typeof player.mana = "C"
  const landNameLower = land.name.toLowerCase()

  for (const [landType, color] of Object.entries(manaMap)) {
    if (landNameLower.includes(landType)) {
      manaColor = color
      break
    }
  }

  return {
    ...player,
    mana: {
      ...player.mana,
      [manaColor]: player.mana[manaColor] + 1,
    },
    zones: {
      ...player.zones,
      battlefield: player.zones.battlefield.map((c) =>
        c.id === cardId ? { ...c, isTapped: true } : c
      ),
    },
  }
}

export function untapAll(player: Player): Player {
  return {
    ...player,
    hasDrawnThisTurn: false,
    hasPlayedLandThisTurn: false,
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, // Reset mana pool
    zones: {
      ...player.zones,
      battlefield: player.zones.battlefield.map((c) => ({ 
        ...c, 
        isTapped: false,
        // Clear temporary effects (until end of turn effects)
        temporaryEffects: undefined,
      })),
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

// Perform mulligan - return hand to library, shuffle, draw new hand (one less card)
export function performMulligan(player: Player, mulliganCount: number): Player {
  const cardsToDraw = Math.max(1, 7 - mulliganCount)
  const allCards = [...player.zones.library, ...player.zones.hand]
  const shuffledLibrary = shuffleArray(allCards)
  const newHand = shuffledLibrary.slice(0, cardsToDraw)
  const newLibrary = shuffledLibrary.slice(cardsToDraw)
  
  return {
    ...player,
    zones: {
      ...player.zones,
      hand: newHand,
      library: newLibrary,
    },
  }
}
