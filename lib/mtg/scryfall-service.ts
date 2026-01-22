import type { Card } from "./types"

// Cache para evitar llamadas repetidas a la API
const cardCache = new Map<string, Card>()

interface ScryfallCard {
  id: string
  name: string
  mana_cost: string
  cmc: number
  type_line: string
  card_faces?: Array<{ name: string; mana_cost: string; power?: string; toughness?: string }>
  text?: string
  oracle_text?: string
  power?: string
  toughness?: string
  colors?: string[]
  image_uris?: { normal: string }
  set?: string
  collector_number?: string
}

/**
 * Obtiene una carta de Scryfall por nombre
 */
export async function getCardByName(cardName: string): Promise<Card | null> {
  try {
    // Limpiar el nombre (remover números de cantidad si existen)
    const cleanName = cardName.trim()
    
    // Verificar cache primero
    if (cardCache.has(cleanName)) {
      return cardCache.get(cleanName)!
    }

    const response = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cleanName)}`
    )

    if (!response.ok) {
      console.warn(`Card not found: ${cleanName}`)
      return null
    }

    const scryfallCard: ScryfallCard = await response.json()
    const card = parseScryfallCard(scryfallCard)
    
    // Guardar en cache
    cardCache.set(cleanName, card)
    
    return card
  } catch (error) {
    console.error(`Error fetching card ${cardName}:`, error)
    return null
  }
}

/**
 * Obtiene cartas de Scryfall por query
 */
export async function searchCards(query: string, limit: number = 10): Promise<Card[]> {
  try {
    const response = await fetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&limit=${limit}`
    )

    if (!response.ok) {
      console.warn(`Search failed for: ${query}`)
      return []
    }

    const data = await response.json()
    return data.data.map((scryfallCard: ScryfallCard) => parseScryfallCard(scryfallCard))
  } catch (error) {
    console.error(`Error searching cards:`, error)
    return []
  }
}

/**
 * Convierte una carta de Scryfall a nuestro formato Card
 */
function parseScryfallCard(scryfallCard: ScryfallCard): Card {
  const [typeLine, ...rest] = scryfallCard.type_line.split(" — ")
  const subtype = rest.join(" — ") || undefined

  // Determinar tipo de carta
  let cardType: "creature" | "instant" | "sorcery" | "enchantment" | "artifact" | "land" | "planeswalker" = "artifact"
  if (typeLine.includes("Creature")) cardType = "creature"
  else if (typeLine.includes("Instant")) cardType = "instant"
  else if (typeLine.includes("Sorcery")) cardType = "sorcery"
  else if (typeLine.includes("Enchantment")) cardType = "enchantment"
  else if (typeLine.includes("Land")) cardType = "land"
  else if (typeLine.includes("Planeswalker")) cardType = "planeswalker"

  // Obtener colores
  const colors = scryfallCard.colors || []

  // Obtener poder/resistencia
  let power: number | undefined
  let toughness: number | undefined
  if (scryfallCard.power && scryfallCard.toughness) {
    power = parseInt(scryfallCard.power) || undefined
    toughness = parseInt(scryfallCard.toughness) || undefined
  }

  // Obtener imagen
  const imageUrl = scryfallCard.image_uris?.normal

  // Detectar si es legendaria (potencial comandante)
  const isLegendary = typeLine.includes("Legendary")

  const card: Card = {
    id: scryfallCard.id,
    name: scryfallCard.name,
    manaCost: scryfallCard.mana_cost || "",
    cmc: scryfallCard.cmc || 0,
    type: cardType,
    subtype,
    text: scryfallCard.oracle_text || "",
    power,
    toughness,
    colors: colors as any,
    imageUrl,
    isLegendary, // Marcar si es legendaria
  }

  return card
}

/**
 * Limpia el cache de cartas
 */
export function clearCardCache() {
  cardCache.clear()
}
