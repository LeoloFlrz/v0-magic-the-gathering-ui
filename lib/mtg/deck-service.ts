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
  const lines = deckText.split("\n").filter(line => line.trim())
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
    if (!match) continue

    const quantity = parseInt(match[1])
    let cardName = match[2].trim()

    // La primera criatura podría ser el comandante
    if (
      mainboard.length === 0 &&
      !isInSideboard &&
      (cardName.includes("Hapatra") ||
        cardName.includes("Edgar") ||
        cardName.includes("Krenko") ||
        cardName.includes("Talrand"))
    ) {
      commander = cardName
    }

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
export async function deckFormatToCards(deckFormat: DeckFormat): Promise<Card[]> {
  const cards: Card[] = []
  const allCardLines = [...deckFormat.mainboard]

  for (const { quantity, cardName } of allCardLines) {
    try {
      const card = await getCardByName(cardName)
      if (card) {
        for (let i = 0; i < quantity; i++) {
          cards.push({
            ...card,
            id: `${card.id}-${i}`, // Hacer ID único para cada copia
          })
        }
      }
    } catch (error) {
      console.error(`Error loading card: ${cardName}`)
    }
  }

  return cards
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
