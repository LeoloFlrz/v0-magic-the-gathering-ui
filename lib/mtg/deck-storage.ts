import type { Card } from "./types"

export interface SavedDeck {
  id: string
  name: string
  description?: string
  cards: Card[]
  createdAt: number
  cardCount: number
}

const STORAGE_KEY = "mtg_saved_decks"

/**
 * Obtiene todos los decks guardados del localStorage
 */
export function getSavedDecks(): SavedDeck[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    return JSON.parse(data)
  } catch (error) {
    console.error("Error reading saved decks:", error)
    return []
  }
}

/**
 * Obtiene un deck guardado por ID
 */
export function getSavedDeck(id: string): SavedDeck | null {
  const decks = getSavedDecks()
  return decks.find(d => d.id === id) || null
}

/**
 * Guarda un nuevo deck en localStorage
 */
export function saveDeck(name: string, cards: Card[], description?: string): SavedDeck {
  const decks = getSavedDecks()
  
  const newDeck: SavedDeck = {
    id: `deck_${Date.now()}`,
    name,
    description,
    cards,
    createdAt: Date.now(),
    cardCount: cards.length,
  }
  
  decks.push(newDeck)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
  
  return newDeck
}

/**
 * Actualiza un deck guardado
 */
export function updateDeck(id: string, name: string, description?: string): SavedDeck | null {
  const decks = getSavedDecks()
  const deckIndex = decks.findIndex(d => d.id === id)
  
  if (deckIndex === -1) return null
  
  decks[deckIndex] = {
    ...decks[deckIndex],
    name,
    description,
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(decks))
  return decks[deckIndex]
}

/**
 * Elimina un deck guardado
 */
export function deleteDeck(id: string): boolean {
  const decks = getSavedDecks()
  const filteredDecks = decks.filter(d => d.id !== id)
  
  if (filteredDecks.length === decks.length) {
    return false // No se encontró el deck
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredDecks))
  return true
}

/**
 * Exporta un deck como JSON
 */
export function exportDeck(deck: SavedDeck): string {
  return JSON.stringify(deck, null, 2)
}

/**
 * Importa un deck desde JSON
 */
export function importDeckFromJSON(jsonStr: string): SavedDeck | null {
  try {
    const deck = JSON.parse(jsonStr)
    if (!deck.name || !Array.isArray(deck.cards)) {
      return null
    }
    
    // Generar nuevo ID y timestamp
    const importedDeck: SavedDeck = {
      id: `deck_${Date.now()}`,
      name: deck.name,
      description: deck.description,
      cards: deck.cards,
      createdAt: Date.now(),
      cardCount: deck.cards.length,
    }
    
    return importedDeck
  } catch (error) {
    console.error("Error importing deck:", error)
    return null
  }
}

/**
 * Formatea la fecha de creación
 */
export function formatDeckDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
