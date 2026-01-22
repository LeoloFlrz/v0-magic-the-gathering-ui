import type { Card } from "./types"
import { getCardByName } from "./scryfall-service"

export interface DeckFormat {
  name: string
  commander?: string
  mainboard: Array<{ quantity: number; cardName: string }>
  sideboard?: Array<{ quantity: number; cardName: string }>
}

/**
 * Parsea un deck en formato de texto estándar (MTG Arena export)
 * Formato:
 * 1 Command Tower
 * 2 Swamp
 * 3 Forest
 * etc.
 */
export function parseDeckText(deckText: string): DeckFormat {
  const lines = deckText.split("\n")
  const mainboard: Array<{ quantity: number; cardName: string }> = []
  const sideboard: Array<{ quantity: number; cardName: string }> = []
  let isInSideboard = false
  let commander: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    
    if (!trimmed) continue
    
    if (trimmed.toLowerCase() === "sideboard") {
      isInSideboard = true
      continue
    }

    // Parsear línea: "1 Card Name" o "4 Card Name (SET) 123"
    const match = trimmed.match(/^(\d+)\s+(.+?)(?:\s+\(|$)/)
    
    if (!match) {
      // Si no coincide con el patrón "cantidad + nombre", podría ser el comandante sin cantidad
      // o un nombre separado en su propia línea
      if (!isInSideboard && !commander && trimmed.length > 0) {
        // Extraer solo el nombre sin el código del set (si está entre paréntesis)
        const cleanName = trimmed.replace(/\s*\([^)]*\)\s*/g, "").trim()
        if (cleanName.length > 0) {
          commander = cleanName
        }
      }
      continue
    }

    const quantity = parseInt(match[1])
    let cardName = match[2].trim()

    if (isInSideboard) {
      sideboard.push({ quantity, cardName })
    } else {
      mainboard.push({ quantity, cardName })
    }
  }

  return {
    name: "Imported Deck",
    commander,
    mainboard,
    sideboard,
  }
}

/**
 * Convierte un DeckFormat a un array de cartas de juego
 */
export async function deckFormatToCards(
  deckFormat: DeckFormat,
  selectedCommanderName?: string
): Promise<Card[]> {
  const cards: Card[] = []
  const allCardLines = [...deckFormat.mainboard]

  // Primera pasada: cargar todas las cartas e identificar legendarias
  const cardDataWithLegendary: Array<{
    quantity: number
    cardName: string
    card: Card | null
    isLegendary: boolean
  }> = []

  for (const { quantity, cardName } of allCardLines) {
    try {
      const card = await getCardByName(cardName)
      if (card) {
        cardDataWithLegendary.push({
          quantity,
          cardName,
          card,
          isLegendary: card.isLegendary || false,
        })
      }
    } catch (error) {
      console.error(`Error loading card: ${cardName}`)
    }
  }

  // Encontrar el índice del comandante
  let commanderIndex = -1
  
  if (selectedCommanderName) {
    // Si el usuario seleccionó un comandante específico, usarlo
    commanderIndex = cardDataWithLegendary.findIndex(
      (card) => card.cardName === selectedCommanderName
    )
  } else {
    // Si no, buscar la última legendaria con cantidad 1
    for (let i = cardDataWithLegendary.length - 1; i >= 0; i--) {
      if (cardDataWithLegendary[i].isLegendary && cardDataWithLegendary[i].quantity === 1) {
        commanderIndex = i
        break
      }
    }
  }

  // Segunda pasada: agregar las cartas y marcar el comandante
  for (let idx = 0; idx < cardDataWithLegendary.length; idx++) {
    const { quantity, card, cardName } = cardDataWithLegendary[idx]
    
    for (let i = 0; i < quantity; i++) {
      const cardCopy = {
        ...card!,
        id: `${card!.id}-${i}`,
      }
      
      // Marcar solo la primera copia del comandante detectado
      if (idx === commanderIndex && i === 0) {
        cardCopy.isCommander = true
      }
      
      cards.push(cardCopy)
    }
  }

  return cards
}

/**
 * Obtiene todas las legendarias de un deck
 */
export async function getLegendariesFromDeck(deckFormat: DeckFormat): Promise<string[]> {
  const legendaries: string[] = []

  for (const { cardName } of deckFormat.mainboard) {
    try {
      const card = await getCardByName(cardName)
      if (card && card.isLegendary) {
        legendaries.push(cardName)
      }
    } catch (error) {
      console.error(`Error loading card: ${cardName}`)
    }
  }

  return legendaries
}

/**
 * Decks predefinidos de ejemplo
 */
export const PRESET_DECKS = {
  krenko_goblins: {
    name: "Krenko Goblins",
    commander: "Krenko, Mob Boss",
    mainboard: [
      { quantity: 1, cardName: "Krenko, Mob Boss" },
      { quantity: 2, cardName: "Goblin Warchief" },
      { quantity: 2, cardName: "Goblin Matron" },
      { quantity: 2, cardName: "Warren Instigator" },
      { quantity: 2, cardName: "Goblin King" },
      { quantity: 3, cardName: "Mountain" },
      { quantity: 2, cardName: "Goblin Lackey" },
      { quantity: 2, cardName: "Goblin Recruiter" },
      { quantity: 2, cardName: "Goblin Sharpshooter" },
      { quantity: 2, cardName: "Tarfire" },
      { quantity: 2, cardName: "Foundry Street Denizen" },
      { quantity: 2, cardName: "Goblin Piledriver" },
    ],
  },
  hapatra_counters: {
    name: "Hapatra Counters",
    commander: "Hapatra, Vizier of Poisons",
    mainboard: [
      { quantity: 1, cardName: "Hapatra, Vizier of Poisons" },
      { quantity: 2, cardName: "Plague Stinger" },
      { quantity: 2, cardName: "Blight Mamba" },
      { quantity: 2, cardName: "Ichorclaw Myr" },
      { quantity: 2, cardName: "Swamp" },
      { quantity: 2, cardName: "Forest" },
      { quantity: 2, cardName: "Proliferate" },
      { quantity: 2, cardName: "Blighted Agent" },
    ],
  },
} as const

export type PresetDeckKey = keyof typeof PRESET_DECKS
