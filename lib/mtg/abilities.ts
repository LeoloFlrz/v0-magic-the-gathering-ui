import type { Card, Player, GameState, ManaColor } from "./types"

// Types of abilities
export type AbilityType = 
  | "activated"    // {cost}: effect (e.g., "{T}: Add {G}")
  | "triggered"    // When/Whenever/At... (e.g., "Whenever this creature deals damage...")
  | "static"       // Always active (e.g., "Flying", "Creatures you control get +1/+1")
  | "keyword"      // Simple keywords (Flying, Trample, Infect, etc.)
  | "spell"        // Spell effect when cast (instants, sorceries)

// Spell keywords that modify how effects work
export type SpellKeyword = 
  | "converge"     // X = number of colors of mana spent
  | "kicker"       // Optional additional cost for enhanced effect
  | "overload"     // Replace "target" with "each"

// Cost types for activated abilities
export interface AbilityCost {
  tap?: boolean                    // {T} - tap this permanent
  untap?: boolean                  // {Q} - untap this permanent
  mana?: string                    // e.g., "{1}{G}" or "{B}{B}"
  sacrifice?: boolean              // Sacrifice this permanent
  life?: number                    // Pay X life
  discard?: number                 // Discard X cards
  putCounter?: {                   // Put counter on this permanent
    type: "+1/+1" | "-1/-1"
    count: number
  }
}

// Effect types
export type EffectType = 
  | "add_mana"           // Add mana to pool
  | "deal_damage"        // Deal damage
  | "gain_life"          // Gain life
  | "lose_life"          // Lose life
  | "draw_card"          // Draw cards
  | "put_counter"        // Put +1/+1 or -1/-1 counter
  | "create_token"       // Create a token creature
  | "destroy"            // Destroy target
  | "untap"              // Untap permanent
  | "tap"                // Tap permanent
  | "regenerate"         // Regenerate creature
  | "search_library"     // Search library for card
  | "converge_draw_lose" // Converge: draw X, lose X life

export interface AbilityEffect {
  type: EffectType
  // For add_mana
  mana?: ManaColor
  manaAmount?: number
  // For deal_damage/gain_life/lose_life
  amount?: number
  // For variable effects (X)
  variableAmount?: "converge" | "x_cost" | number
  // For put_counter
  counterType?: "+1/+1" | "-1/-1"
  counterAmount?: number
  // For create_token
  tokenName?: string
  tokenPower?: number
  tokenToughness?: number
  tokenAbilities?: string[]
  // Target requirements
  target?: "self" | "any_creature" | "opponent_creature" | "any_player" | "opponent"
  // For search_library
  searchFor?: "basic_land" | "creature" | "any"
  putTapped?: boolean
}

export interface ParsedAbility {
  type: AbilityType
  cost?: AbilityCost
  effect?: AbilityEffect
  effects?: AbilityEffect[]      // Multiple effects (e.g., draw AND lose life)
  triggerCondition?: string
  rawText: string
  keyword?: string
  spellKeyword?: SpellKeyword    // For spell effects like Converge
}

// Common keywords and their effects
const KEYWORDS: Record<string, { type: "keyword"; description: string }> = {
  "flying": { type: "keyword", description: "Can only be blocked by creatures with flying or reach" },
  "trample": { type: "keyword", description: "Excess combat damage is dealt to defending player" },
  "deathtouch": { type: "keyword", description: "Any damage dealt by this creature is lethal" },
  "lifelink": { type: "keyword", description: "Damage dealt by this creature also gains you life" },
  "haste": { type: "keyword", description: "Can attack and tap the turn it enters" },
  "vigilance": { type: "keyword", description: "Doesn't tap when attacking" },
  "first strike": { type: "keyword", description: "Deals combat damage before creatures without first strike" },
  "double strike": { type: "keyword", description: "Deals both first strike and regular combat damage" },
  "reach": { type: "keyword", description: "Can block creatures with flying" },
  "menace": { type: "keyword", description: "Can only be blocked by two or more creatures" },
  "infect": { type: "keyword", description: "Deals damage as -1/-1 counters to creatures and poison to players" },
  "wither": { type: "keyword", description: "Deals damage to creatures as -1/-1 counters" },
  "shadow": { type: "keyword", description: "Can only block or be blocked by creatures with shadow" },
}

// Parse mana cost string like "{1}{G}" into structured cost
export function parseManaCost(manaCost: string): { total: number; colors: Record<ManaColor, number> } {
  const colors: Record<ManaColor, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  let genericMana = 0
  
  const matches = manaCost.matchAll(/\{([^}]+)\}/g)
  for (const match of matches) {
    const symbol = match[1]
    if (symbol in colors) {
      colors[symbol as ManaColor]++
    } else if (!isNaN(Number(symbol))) {
      genericMana += Number(symbol)
    } else if (symbol === "X") {
      // X costs handled separately
    }
  }
  
  const colorTotal = Object.values(colors).reduce((a, b) => a + b, 0)
  return { total: genericMana + colorTotal, colors }
}

// Parse activated ability text like "{T}: Add {G}." or "{1}{G}: Regenerate Blight Mamba."
export function parseActivatedAbility(text: string): ParsedAbility | null {
  // Pattern: {cost}: effect
  const activatedPattern = /^([^:]+):\s*(.+)$/
  const match = text.match(activatedPattern)
  
  if (!match) return null
  
  const [, costPart, effectPart] = match
  const cost = parseCost(costPart)
  const effect = parseEffect(effectPart)
  
  if (!cost && !effect) return null
  
  return {
    type: "activated",
    cost,
    effect,
    rawText: text,
  }
}

// Parse cost portion of ability
function parseCost(costText: string): AbilityCost | undefined {
  const cost: AbilityCost = {}
  
  // Check for tap symbol
  if (costText.includes("{T}")) {
    cost.tap = true
  }
  
  // Check for untap symbol
  if (costText.includes("{Q}")) {
    cost.untap = true
  }
  
  // Check for mana cost
  const manaPattern = /(\{[WUBRGC0-9X]+\})+/g
  const manaMatches = costText.match(manaPattern)
  if (manaMatches) {
    const manaCost = manaMatches.filter(m => m !== "{T}" && m !== "{Q}").join("")
    if (manaCost) {
      cost.mana = manaCost
    }
  }
  
  // Check for sacrifice
  if (costText.toLowerCase().includes("sacrifice")) {
    cost.sacrifice = true
  }
  
  // Check for putting -1/-1 counter on self
  if (costText.toLowerCase().includes("put a -1/-1 counter on")) {
    cost.putCounter = { type: "-1/-1", count: 1 }
  }
  
  return Object.keys(cost).length > 0 ? cost : undefined
}

// Parse effect portion of ability
function parseEffect(effectText: string): AbilityEffect | undefined {
  const lowerText = effectText.toLowerCase()
  
  // Search library for basic land effect - check this FIRST
  if (lowerText.includes("search") && lowerText.includes("library") && lowerText.includes("basic land")) {
    return {
      type: "search_library",
      searchFor: "basic_land",
      putTapped: lowerText.includes("tapped"),
    }
  }
  
  // Add mana effect: "Add {G}" or "Add {G}{G}"
  if (lowerText.includes("add")) {
    const manaMatch = effectText.match(/add\s+(\{[WUBRGC]\})+/i)
    if (manaMatch) {
      const manaSymbols = effectText.match(/\{([WUBRGC])\}/gi) || []
      const firstSymbol = manaSymbols[0]
      if (firstSymbol && manaSymbols.length > 0) {
        const color = firstSymbol.replace(/[{}]/g, "") as ManaColor
        return {
          type: "add_mana",
          mana: color,
          manaAmount: manaSymbols.length,
        }
      }
    }
  }
  
  // Regenerate effect
  if (lowerText.includes("regenerate")) {
    return {
      type: "regenerate",
      target: "self",
    }
  }
  
  // Untap effect
  if (lowerText.includes("untap")) {
    return {
      type: "untap",
      target: "self",
    }
  }
  
  // Draw card effect
  if (lowerText.includes("draw")) {
    const cardMatch = lowerText.match(/draw\s+(\d+|a)\s+cards?/)
    const amount = cardMatch ? (cardMatch[1] === "a" ? 1 : parseInt(cardMatch[1])) : 1
    return {
      type: "draw_card",
      amount,
    }
  }
  
  // Gain life effect
  if (lowerText.includes("gain") && lowerText.includes("life")) {
    const lifeMatch = lowerText.match(/gain\s+(\d+)\s+life/)
    const amount = lifeMatch ? parseInt(lifeMatch[1]) : 1
    return {
      type: "gain_life",
      amount,
    }
  }
  
  // Deal damage effect
  if (lowerText.includes("deal") && lowerText.includes("damage")) {
    const damageMatch = lowerText.match(/deals?\s+(\d+)\s+damage/)
    const amount = damageMatch ? parseInt(damageMatch[1]) : 1
    return {
      type: "deal_damage",
      amount,
      target: lowerText.includes("target player") ? "any_player" : 
              lowerText.includes("opponent") ? "opponent" : "any_creature",
    }
  }
  
  // Put counter effect
  if (lowerText.includes("put") && lowerText.includes("counter")) {
    const counterMatch = lowerText.match(/put\s+(?:a\s+)?(-?\d+\/[+-]?\d+)\s+counter/)
    if (counterMatch) {
      const counterType = counterMatch[1].includes("-1/-1") ? "-1/-1" : "+1/+1"
      return {
        type: "put_counter",
        counterType: counterType as "+1/+1" | "-1/-1",
        counterAmount: 1,
        target: lowerText.includes("target creature") ? "any_creature" : "self",
      }
    }
  }
  
  // Search library for basic land effect
  if (lowerText.includes("search") && lowerText.includes("library") && lowerText.includes("basic land")) {
    return {
      type: "search_library",
      searchFor: "basic_land",
      putTapped: lowerText.includes("tapped"),
    }
  }
  
  return undefined
}

// Parse all abilities from a card's text
export function parseCardAbilities(card: Card): ParsedAbility[] {
  if (!card.text) return []
  
  const abilities: ParsedAbility[] = []
  
  // Split by periods and process each sentence
  const sentences = card.text.split(/[.]\s*/).filter(s => s.trim())
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    
    // Check for keywords first
    const lowerSentence = trimmed.toLowerCase()
    for (const [keyword, info] of Object.entries(KEYWORDS)) {
      if (lowerSentence.includes(keyword)) {
        abilities.push({
          type: "keyword",
          keyword,
          rawText: keyword,
        })
      }
    }
    
    // Check for activated abilities (contain ":" with cost before it)
    const activatedAbility = parseActivatedAbility(trimmed)
    if (activatedAbility) {
      abilities.push(activatedAbility)
    }
    
    // Check for triggered abilities (start with "When", "Whenever", "At")
    if (/^(when|whenever|at\s+the)/i.test(trimmed)) {
      abilities.push({
        type: "triggered",
        triggerCondition: trimmed,
        rawText: trimmed,
      })
    }
  }
  
  return abilities
}

// Check if a player can pay the cost of an ability
export function canPayAbilityCost(player: Player, card: Card, cost: AbilityCost): boolean {
  // Check tap cost
  if (cost.tap && card.isTapped) {
    return false
  }
  
  // Check mana cost
  if (cost.mana) {
    const { colors } = parseManaCost(cost.mana)
    for (const [color, amount] of Object.entries(colors)) {
      if ((player.mana[color as ManaColor] || 0) < amount) {
        return false
      }
    }
  }
  
  // Check sacrifice cost
  if (cost.sacrifice) {
    // Card must be on battlefield
    if (!player.zones.battlefield.find(c => c.id === card.id)) {
      return false
    }
  }
  
  return true
}

// Get all activated abilities that can currently be activated for a card
export function getActivatableAbilities(player: Player, card: Card): ParsedAbility[] {
  const abilities = parseCardAbilities(card)
  
  return abilities.filter(ability => {
    if (ability.type !== "activated") return false
    if (!ability.cost) return true
    return canPayAbilityCost(player, card, ability.cost)
  })
}

// Check if a card has a specific keyword
export function hasKeyword(card: Card, keyword: string): boolean {
  if (!card.text) return false
  return card.text.toLowerCase().includes(keyword.toLowerCase())
}

// Count the number of different colors of mana spent
export function countManaColors(manaSpent: { [key in ManaColor]: number }): number {
  let colorCount = 0
  const coloredMana: ManaColor[] = ["W", "U", "B", "R", "G"]
  
  for (const color of coloredMana) {
    if (manaSpent[color] > 0) {
      colorCount++
    }
  }
  
  return colorCount
}

// Parse spell effects (for instants/sorceries)
export function parseSpellEffect(card: Card): ParsedAbility | null {
  if (!card.text) return null
  if (card.type !== "instant" && card.type !== "sorcery") return null
  
  const lowerText = card.text.toLowerCase()
  
  // Converge effects
  if (lowerText.includes("converge")) {
    // "Converge — You draw X cards and lose X life"
    if (lowerText.includes("draw") && lowerText.includes("lose") && lowerText.includes("life")) {
      return {
        type: "spell",
        spellKeyword: "converge",
        effects: [
          { type: "draw_card", variableAmount: "converge" },
          { type: "lose_life", variableAmount: "converge" },
        ],
        rawText: card.text,
      }
    }
    
    // Generic converge - just draw
    if (lowerText.includes("draw")) {
      return {
        type: "spell",
        spellKeyword: "converge",
        effect: { type: "draw_card", variableAmount: "converge" },
        rawText: card.text,
      }
    }
  }
  
  // Simple draw effect
  const drawMatch = lowerText.match(/draw\s+(\d+|a|an)\s+cards?/)
  if (drawMatch) {
    const amount = drawMatch[1] === "a" || drawMatch[1] === "an" ? 1 : parseInt(drawMatch[1])
    return {
      type: "spell",
      effect: { type: "draw_card", amount },
      rawText: card.text,
    }
  }
  
  // Deal damage effect
  const damageMatch = lowerText.match(/deals?\s+(\d+)\s+damage/)
  if (damageMatch) {
    return {
      type: "spell",
      effect: { 
        type: "deal_damage", 
        amount: parseInt(damageMatch[1]),
        target: lowerText.includes("target creature") ? "any_creature" : 
                lowerText.includes("target player") ? "any_player" : "any_creature",
      },
      rawText: card.text,
    }
  }
  
  // Gain life effect
  const lifeMatch = lowerText.match(/gain\s+(\d+)\s+life/)
  if (lifeMatch) {
    return {
      type: "spell",
      effect: { type: "gain_life", amount: parseInt(lifeMatch[1]) },
      rawText: card.text,
    }
  }
  
  // Destroy effect
  if (lowerText.includes("destroy")) {
    return {
      type: "spell",
      effect: { 
        type: "destroy",
        target: lowerText.includes("target creature") ? "any_creature" : "any_creature",
      },
      rawText: card.text,
    }
  }
  
  return null
}

// Execute spell effect and return modified player state
export interface SpellResult {
  player: Player
  opponent?: Player
  log: string[]
}

export function executeSpellEffect(
  card: Card, 
  player: Player, 
  opponent: Player,
  manaSpent: { [key in ManaColor]: number }
): SpellResult {
  const spellAbility = parseSpellEffect(card)
  const logs: string[] = []
  
  let newPlayer = { ...player }
  let newOpponent = { ...opponent }
  
  if (!spellAbility) {
    return { player: newPlayer, opponent: newOpponent, log: logs }
  }
  
  // Calculate converge value
  const convergeValue = countManaColors(manaSpent)
  
  // Process multiple effects
  const effectsToProcess = spellAbility.effects || (spellAbility.effect ? [spellAbility.effect] : [])
  
  for (const effect of effectsToProcess) {
    // Determine amount (fixed or variable)
    let amount = effect.amount || 0
    if (effect.variableAmount === "converge") {
      amount = convergeValue
    }
    
    switch (effect.type) {
      case "draw_card":
        for (let i = 0; i < amount; i++) {
          if (newPlayer.zones.library.length > 0) {
            const drawnCard = newPlayer.zones.library[0]
            newPlayer.zones.library = newPlayer.zones.library.slice(1)
            newPlayer.zones.hand = [...newPlayer.zones.hand, drawnCard]
          }
        }
        logs.push(`Robas ${amount} carta(s)`)
        break
        
      case "lose_life":
        newPlayer.life -= amount
        logs.push(`Pierdes ${amount} vida`)
        break
        
      case "gain_life":
        newPlayer.life += amount
        logs.push(`Ganas ${amount} vida`)
        break
        
      case "deal_damage":
        // For now, default to opponent
        newOpponent.life -= amount
        logs.push(`Haces ${amount} daño al oponente`)
        break
    }
  }
  
  if (spellAbility.spellKeyword === "converge" && convergeValue > 0) {
    logs.unshift(`Converge: X = ${convergeValue} (colores de mana usados)`)
  }
  
  return { player: newPlayer, opponent: newOpponent, log: logs }
}

// Get the mana that was actually spent to cast a card
export function getManaSpentForCard(player: Player, card: Card): { [key in ManaColor]: number } {
  // This tracks what mana the player has that matches the card's requirements
  // For simplicity, we'll use the card's color requirements from manaCost
  const spent: { [key in ManaColor]: number } = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  const { colors } = parseManaCost(card.manaCost)
  
  // Copy the required colored mana
  for (const [color, amount] of Object.entries(colors)) {
    spent[color as ManaColor] = amount
  }
  
  return spent
}
