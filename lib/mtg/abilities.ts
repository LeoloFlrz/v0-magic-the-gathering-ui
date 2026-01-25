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
  sacrificeType?: string           // What to sacrifice: "goblin", "creature", etc.
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
  | "add_mana_any"       // Add mana of any color
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
  | "proliferate"        // Proliferate counters
  | "return_to_hand"     // Bounce permanent to hand
  | "counter_spell"      // Counter target spell
  | "scry"               // Scry X
  | "give_counter"       // Give poison counter to player
  | "buff_until_eot"     // Give +X/+X until end of turn
  | "debuff_until_eot"   // Give -X/-X until end of turn
  | "sacrifice_search_land" // Sacrifice self and search for a land (Overlook lands)

// Trigger conditions for triggered abilities
export type TriggerCondition =
  | "etb"                     // Enters the battlefield
  | "dies"                    // When this creature dies
  | "deals_combat_damage"     // Deals combat damage to player
  | "deals_damage"            // Deals any damage
  | "attacks"                 // When this attacks
  | "landfall"                // When a land enters
  | "cast_spell"              // When you cast a spell
  | "put_counter"             // When counters are put on creatures
  | "creature_dies"           // When any creature dies
  | "upkeep"                  // At beginning of upkeep

export interface AbilityEffect {
  type: EffectType
  // For add_mana
  mana?: ManaColor
  manaAmount?: number
  // For deal_damage/gain_life/lose_life
  amount?: number
  // For variable effects (X)
  variableAmount?: "converge" | "x_cost" | "goblins_count" | "lands_count" | number
  // For put_counter
  counterType?: "+1/+1" | "-1/-1"
  counterAmount?: number
  // For create_token
  tokenName?: string
  tokenPower?: number
  tokenToughness?: number
  tokenColors?: ManaColor[]
  tokenType?: string
  tokenAbilities?: string[]
  tokenCount?: number | "variable"
  // Target requirements
  target?: "self" | "any_creature" | "opponent_creature" | "any_player" | "opponent" | "any_target" | "all_creatures" | "your_creatures" | "opponent_creatures" | "your_permanents" | "any_artifact"
  // For search_library / sacrifice_search_land
  searchFor?: "basic_land" | "creature" | "any" | "basic_swamp_mountain_forest" | "basic_plains_island_swamp" | "basic_island_swamp_mountain" | "basic_plains_mountain_forest"
  putTapped?: boolean
  putToHand?: boolean          // Also put one to hand (Cultivate)
  searchCount?: number         // How many cards to search for
  sacrificeSelf?: boolean      // For cards that sacrifice themselves as part of effect
  gainLife?: number            // Additional life gain (Overlook lands)
  // For scry
  scryAmount?: number
  // For counter
  counterCondition?: string    // "unless pays {3}"
  // For buff/debuff until end of turn
  powerMod?: number
  toughnessMod?: number
  keywords?: string[]          // For granting keywords like hexproof, indestructible
}

export interface ParsedAbility {
  type: AbilityType
  cost?: AbilityCost
  effect?: AbilityEffect
  effects?: AbilityEffect[]      // Multiple effects (e.g., draw AND lose life)
  triggerCondition?: TriggerCondition
  triggerText?: string           // Raw trigger text for complex conditions
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
    // Check what to sacrifice
    const sacrificeMatch = costText.toLowerCase().match(/sacrifice\s+(?:a\s+)?(\w+)/)
    if (sacrificeMatch) {
      const sacrificeType = sacrificeMatch[1]
      if (sacrificeType !== "this" && sacrificeType !== "~") {
        cost.sacrificeType = sacrificeType
      }
    }
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
  
  // ETB with sacrifice and search (Overlook lands from Streets of New Capenna)
  // "When this land enters, sacrifice it. When you do, search your library for a basic X, Y, or Z card"
  if (lowerText.includes("enters") && lowerText.includes("sacrifice it") && lowerText.includes("search")) {
    // Riveteers Overlook: Swamp, Mountain, or Forest
    if (lowerText.includes("swamp") && lowerText.includes("mountain") && lowerText.includes("forest")) {
      return {
        type: "sacrifice_search_land",
        searchFor: "basic_swamp_mountain_forest",
        putTapped: true,
        sacrificeSelf: true,
        gainLife: lowerText.includes("gain 1 life") ? 1 : 0,
      }
    }
    // Obscura Storefront: Plains, Island, or Swamp
    if (lowerText.includes("plains") && lowerText.includes("island") && lowerText.includes("swamp")) {
      return {
        type: "sacrifice_search_land",
        searchFor: "basic_plains_island_swamp",
        putTapped: true,
        sacrificeSelf: true,
        gainLife: lowerText.includes("gain 1 life") ? 1 : 0,
      }
    }
    // Maestros Theater: Island, Swamp, or Mountain
    if (lowerText.includes("island") && lowerText.includes("swamp") && lowerText.includes("mountain") && !lowerText.includes("forest")) {
      return {
        type: "sacrifice_search_land",
        searchFor: "basic_island_swamp_mountain",
        putTapped: true,
        sacrificeSelf: true,
        gainLife: lowerText.includes("gain 1 life") ? 1 : 0,
      }
    }
    // Cabaretti Courtyard: Plains, Mountain, or Forest
    if (lowerText.includes("plains") && lowerText.includes("mountain") && lowerText.includes("forest")) {
      return {
        type: "sacrifice_search_land",
        searchFor: "basic_plains_mountain_forest",
        putTapped: true,
        sacrificeSelf: true,
        gainLife: lowerText.includes("gain 1 life") ? 1 : 0,
      }
    }
    // Generic version - any basic land with sacrifice
    if (lowerText.includes("basic land") || lowerText.includes("basic")) {
      return {
        type: "sacrifice_search_land",
        searchFor: "basic_land",
        putTapped: true,
        sacrificeSelf: true,
        gainLife: lowerText.includes("gain 1 life") ? 1 : 0,
      }
    }
  }
  
  // Search library for basic land effect - check this FIRST
  if (lowerText.includes("search") && lowerText.includes("library")) {
    // Cultivate/Kodama's Reach - up to two basic lands
    if (lowerText.includes("up to two basic land")) {
      return {
        type: "search_library",
        searchFor: "basic_land",
        putTapped: true,
        putToHand: true,  // One goes to hand
        searchCount: 2,
      }
    }
    // Explosive Vegetation - two lands to battlefield
    if (lowerText.includes("two basic land") && !lowerText.includes("up to")) {
      return {
        type: "search_library",
        searchFor: "basic_land",
        putTapped: true,
        searchCount: 2,
      }
    }
    // Standard fetch land
    if (lowerText.includes("basic land")) {
      return {
        type: "search_library",
        searchFor: "basic_land",
        putTapped: lowerText.includes("tapped"),
      }
    }
  }
  
  // Create token effect
  if (lowerText.includes("create")) {
    // Krenko - Create X goblin tokens where X is goblins you control
    if (lowerText.includes("x") && lowerText.includes("goblin") && lowerText.includes("token")) {
      return {
        type: "create_token",
        tokenName: "Goblin",
        tokenPower: 1,
        tokenToughness: 1,
        tokenColors: ["R"],
        tokenType: "creature",
        tokenCount: "variable",
        variableAmount: "goblins_count",
      }
    }
    // Snake token with deathtouch (Hapatra)
    if (lowerText.includes("snake") && lowerText.includes("deathtouch")) {
      return {
        type: "create_token",
        tokenName: "Snake",
        tokenPower: 1,
        tokenToughness: 1,
        tokenColors: ["G"],
        tokenType: "creature",
        tokenAbilities: ["deathtouch"],
        tokenCount: 1,
      }
    }
    // Generic goblin tokens
    if (lowerText.includes("goblin") && lowerText.includes("token")) {
      const countMatch = lowerText.match(/(\d+|three)\s+\d+\/\d+/)
      let count = 1
      if (countMatch) {
        count = countMatch[1] === "three" ? 3 : parseInt(countMatch[1])
      }
      return {
        type: "create_token",
        tokenName: "Goblin",
        tokenPower: 1,
        tokenToughness: 1,
        tokenColors: ["R"],
        tokenType: "creature",
        tokenCount: count,
      }
    }
    // Insect tokens (Nest of Scarabs)
    if (lowerText.includes("insect") && lowerText.includes("token")) {
      return {
        type: "create_token",
        tokenName: "Insect",
        tokenPower: 1,
        tokenToughness: 1,
        tokenColors: ["B"],
        tokenType: "creature",
        tokenCount: "variable",
      }
    }
    // Vampire tokens
    if (lowerText.includes("vampire") && lowerText.includes("token")) {
      return {
        type: "create_token",
        tokenName: "Vampire",
        tokenPower: 1,
        tokenToughness: 1,
        tokenColors: ["B"],
        tokenType: "creature",
        tokenCount: 1,
      }
    }
    // Drake tokens (Talrand)
    if (lowerText.includes("drake") && lowerText.includes("token")) {
      return {
        type: "create_token",
        tokenName: "Drake",
        tokenPower: 2,
        tokenToughness: 2,
        tokenColors: ["U"],
        tokenType: "creature",
        tokenAbilities: ["flying"],
        tokenCount: 1,
      }
    }
    // Elemental tokens (Omnath)
    if (lowerText.includes("elemental") && lowerText.includes("token")) {
      return {
        type: "create_token",
        tokenName: "Elemental",
        tokenPower: 5,
        tokenToughness: 5,
        tokenColors: ["R", "G"],
        tokenType: "creature",
        tokenCount: 1,
      }
    }
    // Plant tokens (Avenger of Zendikar)
    if (lowerText.includes("plant") && lowerText.includes("token")) {
      return {
        type: "create_token",
        tokenName: "Plant",
        tokenPower: 0,
        tokenToughness: 1,
        tokenColors: ["G"],
        tokenType: "creature",
        tokenCount: "variable",
        variableAmount: "lands_count",  // Number of lands you control
      }
    }
  }
  
  // Add mana effect: "Add {G}" or "Add {G}{G}" or "Add {C}{C}"
  if (lowerText.includes("add")) {
    // Add colorless mana
    if (effectText.includes("{C}{C}")) {
      return {
        type: "add_mana",
        mana: "C",
        manaAmount: 2,
      }
    }
    // Add two colored mana (like Golgari Signet)
    if (effectText.match(/add\s+\{[WUBRG]\}\{[WUBRG]\}/i)) {
      const symbols = effectText.match(/\{([WUBRG])\}/gi) || []
      // For signet-style, we'll just add the first color for simplicity
      // In a full implementation, player would choose
      if (symbols.length >= 2 && symbols[0]) {
        const color1 = symbols[0].replace(/[{}]/g, "") as ManaColor
        return {
          type: "add_mana",
          mana: color1,
          manaAmount: 2, // Simplified - actually adds 2 different colors
        }
      }
    }
    // Standard add mana
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
    // Add one mana of any color
    if (lowerText.includes("any color")) {
      return {
        type: "add_mana_any",
        manaAmount: 1,
      }
    }
  }
  
  // Deal damage effect
  if (lowerText.includes("deal") && lowerText.includes("damage")) {
    const damageMatch = lowerText.match(/deals?\s+(\d+)\s+damage/)
    const amount = damageMatch ? parseInt(damageMatch[1]) : 1
    return {
      type: "deal_damage",
      amount,
      target: lowerText.includes("any target") ? "any_target" :
              lowerText.includes("target player") ? "any_player" : 
              lowerText.includes("opponent") ? "opponent" : 
              lowerText.includes("target creature") ? "any_creature" : "any_target",
    }
  }
  
  // Destroy effect
  if (lowerText.includes("destroy target")) {
    return {
      type: "destroy",
      target: lowerText.includes("creature") ? "any_creature" : "any_target",
    }
  }
  
  // Counter spell effect
  if (lowerText.includes("counter target spell")) {
    const conditionMatch = lowerText.match(/unless.+pays?\s+\{(\d+)\}/)
    return {
      type: "counter_spell",
      counterCondition: conditionMatch ? `unless pays {${conditionMatch[1]}}` : undefined,
    }
  }
  
  // Return to hand (bounce)
  if (lowerText.includes("return") && lowerText.includes("hand")) {
    return {
      type: "return_to_hand",
      target: lowerText.includes("all attacking") ? "all_creatures" :
              lowerText.includes("target") ? "any_creature" : "any_creature",
    }
  }
  
  // Scry effect
  if (lowerText.includes("scry")) {
    const scryMatch = lowerText.match(/scry\s+(\d+)/)
    return {
      type: "scry",
      scryAmount: scryMatch ? parseInt(scryMatch[1]) : 1,
    }
  }
  
  // Proliferate
  if (lowerText.includes("proliferate")) {
    return {
      type: "proliferate",
    }
  }
  
  // Give poison counter
  if (lowerText.includes("poison counter")) {
    return {
      type: "give_counter",
      counterType: "-1/-1", // Represented as poison
      target: lowerText.includes("each player") ? "any_player" : "opponent",
    }
  }
  
  // -X/-X until end of turn (Tragic Slip, Golgari Charm)
  if (lowerText.includes("gets") && lowerText.includes("until end of turn")) {
    const buffMatch = lowerText.match(/gets?\s+(-?\d+)\/(-?\d+)/)
    if (buffMatch) {
      const power = parseInt(buffMatch[1])
      const toughness = parseInt(buffMatch[2])
      if (power < 0 || toughness < 0) {
        return {
          type: "debuff_until_eot",
          amount: Math.abs(power),
          target: lowerText.includes("all creatures") ? "all_creatures" :
                  lowerText.includes("target creature") ? "any_creature" : "any_creature",
        }
      }
    }
  }
  
  // Regenerate effect
  if (lowerText.includes("regenerate")) {
    return {
      type: "regenerate",
      target: lowerText.includes("each creature you control") ? "your_creatures" : "self",
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
  
  // Lose life effect
  if (lowerText.includes("lose") && lowerText.includes("life")) {
    const lifeMatch = lowerText.match(/loses?\s+(\d+)\s+life/)
    const amount = lifeMatch ? parseInt(lifeMatch[1]) : 1
    return {
      type: "lose_life",
      amount,
    }
  }
  
  // Put counter effect
  if (lowerText.includes("put") && lowerText.includes("counter")) {
    const counterMatch = lowerText.match(/put\s+(?:a\s+)?(-?\d+\/[+-]?\d+|\+1\/\+1|-1\/-1)\s+counter/)
    if (counterMatch) {
      const counterType = counterMatch[1].includes("-1/-1") ? "-1/-1" : "+1/+1"
      return {
        type: "put_counter",
        counterType: counterType as "+1/+1" | "-1/-1",
        counterAmount: 1,
        target: lowerText.includes("each") ? "all_creatures" :
                lowerText.includes("target creature") ? "any_creature" : "self",
      }
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
    
    // Check for triggered abilities (start with "When", "Whenever", "At", "Landfall")
    if (/^(when|whenever|at\s+the|landfall|eminence)/i.test(trimmed)) {
      const triggeredAbility = parseTriggeredAbility(trimmed)
      if (triggeredAbility) {
        abilities.push(triggeredAbility)
      }
    }
  }
  
  // Also check the full text for ETB + sacrifice + search pattern (Overlook lands)
  // These might span multiple sentences
  const fullLowerText = card.text.toLowerCase()
  
  if (fullLowerText.includes("enters") && 
      fullLowerText.includes("sacrifice it") && 
      fullLowerText.includes("search")) {
    // This is an Overlook-style land - parse the full text as one ability
    const overlookEffect = parseOverlookLandEffect(card.text)
    if (overlookEffect) {
      // Remove any ETB abilities without proper effects (they were incomplete parses)
      // and add the complete overlook ability
      const filteredAbilities = abilities.filter(a => 
        !(a.type === "triggered" && a.triggerCondition === "etb" && !a.effect?.type)
      )
      abilities.length = 0
      abilities.push(...filteredAbilities)
      
      // Check if we already have a sacrifice_search_land ability
      const hasOverlookAbility = abilities.some(a => 
        a.effect?.type === "sacrifice_search_land"
      )
      if (!hasOverlookAbility) {
        abilities.push(overlookEffect)
      }
    }
  }
  
  return abilities
}

// Parse Overlook-style lands (ETB sacrifice + search)
// These cards have text like: "When X enters, sacrifice it. When you do, search your library for a basic A, B, or C card..."
function parseOverlookLandEffect(text: string): ParsedAbility | null {
  const lowerText = text.toLowerCase()
  
  // Determine which land types can be searched
  let searchFor: "basic_land" | "basic_swamp_mountain_forest" | "basic_plains_island_swamp" | "basic_island_swamp_mountain" | "basic_plains_mountain_forest" = "basic_land"
  
  // Check for specific tri-color combinations
  const hasSwamp = lowerText.includes("swamp")
  const hasMountain = lowerText.includes("mountain")
  const hasForest = lowerText.includes("forest")
  const hasPlains = lowerText.includes("plains")
  const hasIsland = lowerText.includes("island")
  
  // Riveteers: Swamp, Mountain, Forest (Jund colors)
  if (hasSwamp && hasMountain && hasForest && !hasPlains && !hasIsland) {
    searchFor = "basic_swamp_mountain_forest"
  }
  // Obscura: Plains, Island, Swamp (Esper colors)
  else if (hasPlains && hasIsland && hasSwamp && !hasMountain && !hasForest) {
    searchFor = "basic_plains_island_swamp"
  }
  // Maestros: Island, Swamp, Mountain (Grixis colors)
  else if (hasIsland && hasSwamp && hasMountain && !hasPlains && !hasForest) {
    searchFor = "basic_island_swamp_mountain"
  }
  // Cabaretti: Plains, Mountain, Forest (Naya colors)
  else if (hasPlains && hasMountain && hasForest && !hasSwamp && !hasIsland) {
    searchFor = "basic_plains_mountain_forest"
  }
  // Brokers: Green, White, Blue - Plains, Island, Forest
  else if (hasPlains && hasIsland && hasForest && !hasSwamp && !hasMountain) {
    searchFor = "basic_land" // Use basic_land as fallback for now
  }
  
  // Check for life gain
  const gainLife = lowerText.includes("gain 1 life") ? 1 : 
                   lowerText.includes("gain 2 life") ? 2 : 0
  
  return {
    type: "triggered",
    triggerCondition: "etb",
    effect: {
      type: "sacrifice_search_land",
      searchFor,
      putTapped: lowerText.includes("tapped"),
      sacrificeSelf: true,
      gainLife,
    },
    rawText: text,
  }
}

// Parse triggered ability text
function parseTriggeredAbility(text: string): ParsedAbility | null {
  const lowerText = text.toLowerCase()
  
  // Determine trigger condition
  let triggerCondition: TriggerCondition | undefined
  
  // ETB triggers - "enters the battlefield" (old) or just "enters" (modern wording)
  // Pattern: "When X enters" or "When X enters the battlefield"
  if (lowerText.includes("enters the battlefield") || 
      /when\s+[\w\s]+\s+enters[,.]/.test(lowerText) ||
      lowerText.includes(" enters,")) {
    triggerCondition = "etb"
  }
  // Dies triggers
  else if (lowerText.includes("dies")) {
    if (lowerText.includes("another creature") || lowerText.includes("or another creature")) {
      triggerCondition = "creature_dies"
    } else {
      triggerCondition = "dies"
    }
  }
  // Combat damage to player
  else if (lowerText.includes("deals combat damage to a player")) {
    triggerCondition = "deals_combat_damage"
  }
  // Deals damage
  else if (lowerText.includes("deals damage")) {
    triggerCondition = "deals_damage"
  }
  // Attacks
  else if (lowerText.includes("attacks")) {
    triggerCondition = "attacks"
  }
  // Landfall
  else if (lowerText.includes("landfall") || (lowerText.includes("land enters the battlefield"))) {
    triggerCondition = "landfall"
  }
  // Cast spell
  else if (lowerText.includes("cast") && lowerText.includes("spell")) {
    triggerCondition = "cast_spell"
  }
  // Put counters
  else if (lowerText.includes("put") && lowerText.includes("counter")) {
    triggerCondition = "put_counter"
  }
  // Upkeep
  else if (lowerText.includes("beginning of") && lowerText.includes("upkeep")) {
    triggerCondition = "upkeep"
  }
  
  // Parse the effect part (after the comma or trigger condition)
  const effect = parseEffect(text)
  
  return {
    type: "triggered",
    triggerCondition,
    triggerText: text,
    effect,
    rawText: text,
  }
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
  
  // Tragic Slip: -1/-1 or -13/-13 (morbid)
  if (lowerText.includes("gets -1/-1") || lowerText.includes("gets -13/-13")) {
    return {
      type: "spell",
      effect: { 
        type: "debuff_until_eot", 
        powerMod: -1,  // Default to -1/-1, morbid check would be separate
        toughnessMod: -1,
        target: "any_creature",
      },
      rawText: card.text,
    }
  }
  
  // All creatures get -1/-1 (Golgari Charm)
  if (lowerText.includes("all creatures get -1/-1")) {
    return {
      type: "spell",
      effect: { 
        type: "debuff_until_eot", 
        powerMod: -1,
        toughnessMod: -1,
        target: "all_creatures",
      },
      rawText: card.text,
    }
  }
  
  // Counter target spell (Counterspell, Negate, Mana Leak)
  if (lowerText.includes("counter target spell")) {
    return {
      type: "spell",
      effect: { type: "counter_spell" },
      rawText: card.text,
    }
  }
  
  // Return to hand (Cyclonic Rift, Aetherize)
  if (lowerText.includes("return") && lowerText.includes("to") && 
      (lowerText.includes("hand") || lowerText.includes("owner"))) {
    return {
      type: "spell",
      effect: { type: "return_to_hand", target: "any_creature" },
      rawText: card.text,
    }
  }
  
  // Scry effects (Preordain, Ponder)
  const scryMatch = lowerText.match(/scry\s+(\d+)/)
  if (scryMatch) {
    const scryAmount = parseInt(scryMatch[1])
    // Check if there's also a draw
    const drawMatch = lowerText.match(/draw\s+(?:a|an|\d+)\s+cards?/)
    if (drawMatch) {
      return {
        type: "spell",
        effects: [
          { type: "scry", amount: scryAmount },
          { type: "draw_card", amount: 1 },
        ],
        rawText: card.text,
      }
    }
    return {
      type: "spell",
      effect: { type: "scry", amount: scryAmount },
      rawText: card.text,
    }
  }
  
  // Ponder-style: look at top cards, draw
  if (lowerText.includes("look at the top") && lowerText.includes("draw")) {
    return {
      type: "spell",
      effects: [
        { type: "scry", amount: 3 },
        { type: "draw_card", amount: 1 },
      ],
      rawText: card.text,
    }
  }
  
  // Destroy then proliferate (Spread the Sickness)
  if (lowerText.includes("destroy") && lowerText.includes("proliferate")) {
    return {
      type: "spell",
      effects: [
        { type: "destroy", target: "any_creature" },
        { type: "proliferate" },
      ],
      rawText: card.text,
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
  
  // Deal damage effect (Lightning Bolt)
  const damageMatch = lowerText.match(/deals?\s+(\d+)\s+damage/)
  if (damageMatch) {
    return {
      type: "spell",
      effect: { 
        type: "deal_damage", 
        amount: parseInt(damageMatch[1]),
        target: lowerText.includes("target creature") ? "any_creature" : 
                lowerText.includes("target player") ? "any_player" : "any_target",
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
        target: lowerText.includes("target creature") ? "any_creature" : 
                lowerText.includes("target artifact") ? "any_artifact" : "any_creature",
      },
      rawText: card.text,
    }
  }
  
  // Hexproof/Indestructible (Heroic Intervention)
  if (lowerText.includes("hexproof") && lowerText.includes("indestructible")) {
    return {
      type: "spell",
      effect: { 
        type: "buff_until_eot", 
        keywords: ["hexproof", "indestructible"],
        target: "your_permanents",
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
  
  let newPlayer = { ...player, zones: { ...player.zones } }
  let newOpponent = { ...opponent, zones: { ...opponent.zones } }
  
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
        // For now, default to opponent (would need targeting UI)
        newOpponent.life -= amount
        logs.push(`Haces ${amount} daño al oponente`)
        break
        
      case "destroy": {
        // Destroy target creature - target first opponent creature
        const targetCreature = newOpponent.zones.battlefield.find(c => 
          c.type?.toLowerCase().includes("creature")
        )
        if (targetCreature) {
          newOpponent.zones.battlefield = newOpponent.zones.battlefield.filter(c => c.id !== targetCreature.id)
          if (!targetCreature.isToken) {
            newOpponent.zones.graveyard = [...newOpponent.zones.graveyard, targetCreature]
          }
          logs.push(`Destruyes ${targetCreature.name}`)
        }
        break
      }
      
      case "debuff_until_eot": {
        // Target creature gets -X/-X until end of turn
        const targetCreature = newOpponent.zones.battlefield.find(c => 
          c.type?.toLowerCase().includes("creature")
        )
        if (targetCreature) {
          const debuffAmount = effect.powerMod || 0
          const targetIdx = newOpponent.zones.battlefield.findIndex(c => c.id === targetCreature.id)
          if (targetIdx !== -1) {
            newOpponent.zones.battlefield = [...newOpponent.zones.battlefield]
            const target = newOpponent.zones.battlefield[targetIdx]
            newOpponent.zones.battlefield[targetIdx] = {
              ...target,
              temporaryEffects: {
                powerMod: (target.temporaryEffects?.powerMod || 0) + debuffAmount,
                toughnessMod: (target.temporaryEffects?.toughnessMod || 0) + debuffAmount,
              }
            }
            logs.push(`${targetCreature.name} recibe ${debuffAmount}/${debuffAmount} hasta el final del turno`)
          }
        }
        break
      }
      
      case "return_to_hand": {
        // Return target nonland permanent to hand
        const targetPermanent = newOpponent.zones.battlefield.find(c => 
          c.type !== "land"
        )
        if (targetPermanent) {
          newOpponent.zones.battlefield = newOpponent.zones.battlefield.filter(c => c.id !== targetPermanent.id)
          if (!targetPermanent.isToken) {
            newOpponent.zones.hand = [...newOpponent.zones.hand, targetPermanent]
          }
          logs.push(`Devuelves ${targetPermanent.name} a la mano de su propietario`)
        }
        break
      }
      
      case "scry": {
        // Look at top cards (simplified - just log them)
        const scryAmount = effect.amount || 1
        const topCards = newPlayer.zones.library.slice(0, scryAmount)
        if (topCards.length > 0) {
          logs.push(`Scry ${scryAmount}: Ves ${topCards.map(c => c.name).join(", ")}`)
        }
        break
      }
      
      case "proliferate": {
        // Add one counter to each permanent with counters
        newPlayer.zones.battlefield = newPlayer.zones.battlefield.map(c => {
          if (c.positiveCounters && c.positiveCounters > 0) {
            return { ...c, positiveCounters: c.positiveCounters + 1 }
          }
          if (c.negativeCounters && c.negativeCounters > 0) {
            return { ...c, negativeCounters: c.negativeCounters + 1 }
          }
          return c
        })
        newOpponent.zones.battlefield = newOpponent.zones.battlefield.map(c => {
          if (c.positiveCounters && c.positiveCounters > 0) {
            return { ...c, positiveCounters: c.positiveCounters + 1 }
          }
          if (c.negativeCounters && c.negativeCounters > 0) {
            return { ...c, negativeCounters: c.negativeCounters + 1 }
          }
          return c
        })
        if (newPlayer.poisonCounters > 0) {
          newPlayer.poisonCounters += 1
        }
        if (newOpponent.poisonCounters > 0) {
          newOpponent.poisonCounters += 1
        }
        logs.push("Proliferas (añades contadores)")
        break
      }
      
      case "counter_spell": {
        // Counter spell effect - in full implementation would target a spell on stack
        logs.push("Contrarrestas el hechizo objetivo")
        break
      }
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

// Process a triggered ability effect
export interface TriggeredEffectResult {
  player: Player
  opponent: Player
  logs: string[]
}

export function processTriggeredEffect(
  effect: AbilityEffect,
  sourceCard: Card,
  player: Player,
  opponent: Player
): TriggeredEffectResult {
  const logs: string[] = []
  let newPlayer = { ...player, zones: { ...player.zones } }
  let newOpponent = { ...opponent, zones: { ...opponent.zones } }
  
  switch (effect.type) {
    case "create_token": {
      let tokenCount: number
      if (effect.tokenCount === "variable") {
        if (effect.variableAmount === "goblins_count") {
          tokenCount = newPlayer.zones.battlefield.filter(c => c.subtype?.toLowerCase().includes("goblin")).length
        } else if (effect.variableAmount === "lands_count") {
          tokenCount = newPlayer.zones.battlefield.filter(c => c.type === "land").length
        } else {
          tokenCount = 1
        }
      } else {
        tokenCount = typeof effect.tokenCount === "number" ? effect.tokenCount : 1
      }
      
      const newTokens: Card[] = []
      for (let i = 0; i < tokenCount; i++) {
        const token: Card = {
          id: `token-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`,
          name: effect.tokenName || "Token",
          manaCost: "",
          cmc: 0,
          type: "creature",
          subtype: effect.tokenName,
          text: effect.tokenAbilities?.join(", ") || "",
          power: effect.tokenPower || 1,
          toughness: effect.tokenToughness || 1,
          colors: effect.tokenColors || ["C"],
          isToken: true,
        }
        newTokens.push(token)
      }
      newPlayer.zones.battlefield = [...newPlayer.zones.battlefield, ...newTokens]
      logs.push(`${sourceCard.name} crea ${tokenCount} token(s) de ${effect.tokenName}`)
      break
    }
    
    case "put_counter": {
      if (effect.target === "any_creature" || effect.target === "opponent_creature") {
        // For simplicity, target first opponent creature (in full impl, player would choose)
        if (newOpponent.zones.battlefield.length > 0) {
          const targetIndex = newOpponent.zones.battlefield.findIndex(c => c.type === "creature")
          if (targetIndex !== -1) {
            newOpponent.zones.battlefield = [...newOpponent.zones.battlefield]
            const target = newOpponent.zones.battlefield[targetIndex]
            if (effect.counterType === "-1/-1") {
              newOpponent.zones.battlefield[targetIndex] = {
                ...target,
                negativeCounters: (target.negativeCounters || 0) + (effect.counterAmount || 1),
              }
              logs.push(`Pones un contador -1/-1 en ${target.name}`)
            } else {
              newOpponent.zones.battlefield[targetIndex] = {
                ...target,
                positiveCounters: (target.positiveCounters || 0) + (effect.counterAmount || 1),
              }
              logs.push(`Pones un contador +1/+1 en ${target.name}`)
            }
          }
        }
      }
      break
    }
    
    case "give_counter": {
      // Give poison counter
      if (effect.target === "any_player" || effect.target === "opponent") {
        newOpponent.poisonCounters = (newOpponent.poisonCounters || 0) + 1
        newPlayer.poisonCounters = (newPlayer.poisonCounters || 0) + 1
        logs.push(`Cada jugador recibe un contador de veneno`)
      }
      break
    }
    
    case "draw_card": {
      const amount = effect.amount || 1
      for (let i = 0; i < amount; i++) {
        if (newPlayer.zones.library.length > 0) {
          const drawnCard = newPlayer.zones.library[0]
          newPlayer.zones.library = newPlayer.zones.library.slice(1)
          newPlayer.zones.hand = [...newPlayer.zones.hand, drawnCard]
        }
      }
      logs.push(`${sourceCard.name}: Robas ${amount} carta(s)`)
      break
    }
    
    case "gain_life": {
      const amount = effect.amount || 1
      newPlayer.life += amount
      logs.push(`${sourceCard.name}: Ganas ${amount} vida`)
      break
    }
    
    case "lose_life": {
      const amount = effect.amount || 1
      newPlayer.life -= amount
      logs.push(`${sourceCard.name}: Pierdes ${amount} vida`)
      break
    }
    
    case "deal_damage": {
      const amount = effect.amount || 1
      if (effect.target === "opponent" || effect.target === "any_player") {
        newOpponent.life -= amount
        logs.push(`${sourceCard.name} hace ${amount} daño al oponente`)
      }
      break
    }
    
    case "add_mana": {
      if (effect.mana && effect.manaAmount) {
        newPlayer.mana = { ...newPlayer.mana }
        newPlayer.mana[effect.mana] = (newPlayer.mana[effect.mana] || 0) + effect.manaAmount
        logs.push(`${sourceCard.name}: Añades {${effect.mana}}`)
      }
      break
    }
    
    case "add_mana_any": {
      // Default to green for simplicity
      if (effect.manaAmount) {
        newPlayer.mana = { ...newPlayer.mana }
        newPlayer.mana["G"] = (newPlayer.mana["G"] || 0) + effect.manaAmount
        logs.push(`${sourceCard.name}: Añades {G}`)
      }
      break
    }
  }
  
  return { player: newPlayer, opponent: newOpponent, logs }
}

// Calculate effective power and toughness for a creature considering lords and counters
export function getEffectiveStats(card: Card, allCards: Card[]): { power: number; toughness: number } {
  if (card.type !== "creature" || card.power === undefined || card.toughness === undefined) {
    return { power: card.power || 0, toughness: card.toughness || 0 }
  }
  
  let power = card.power
  let toughness = card.toughness
  
  // Apply +1/+1 counters
  if (card.positiveCounters) {
    power += card.positiveCounters
    toughness += card.positiveCounters
  }
  
  // Apply -1/-1 counters
  if (card.negativeCounters) {
    power -= card.negativeCounters
    toughness -= card.negativeCounters
  }
  
  // Apply temporary effects
  if (card.temporaryEffects) {
    power += card.temporaryEffects.powerMod || 0
    toughness += card.temporaryEffects.toughnessMod || 0
  }
  
  // Check for lord effects from other creatures
  for (const other of allCards) {
    if (other.id === card.id) continue
    if (!other.text) continue
    
    const lowerText = other.text.toLowerCase()
    
    // "Other [type] creatures get +1/+1"
    if (lowerText.includes("other") && lowerText.includes("get +1/+1")) {
      // Check if it applies to this creature
      if (lowerText.includes("goblin") && card.subtype?.toLowerCase().includes("goblin")) {
        power += 1
        toughness += 1
      }
      if (lowerText.includes("vampire") && card.subtype?.toLowerCase().includes("vampire")) {
        power += 1
        toughness += 1
      }
      if (lowerText.includes("creatures you control") || lowerText.includes("other creatures")) {
        power += 1
        toughness += 1
      }
    }
    
    // Goblin King: "Other Goblin creatures get +1/+1"
    if (other.name === "Goblin King" && card.subtype?.toLowerCase().includes("goblin")) {
      power += 1
      toughness += 1
    }
    
    // Legion Lieutenant: "Other Vampires you control get +1/+1"
    if (other.name === "Legion Lieutenant" && card.subtype?.toLowerCase().includes("vampire")) {
      power += 1
      toughness += 1
    }
  }
  
  // Check for debuff effects (Curse of Death's Hold)
  for (const other of allCards) {
    if (!other.text) continue
    const lowerText = other.text.toLowerCase()
    
    // "Creatures enchanted player controls get -1/-1"
    if (lowerText.includes("get -1/-1") && other.type === "enchantment") {
      power -= 1
      toughness -= 1
    }
  }
  
  return { power: Math.max(0, power), toughness: Math.max(0, toughness) }
}

// Process triggers when a -1/-1 counter is put on a creature
export function processCounterTriggers(
  counterType: "+1/+1" | "-1/-1",
  targetCard: Card,
  triggeringPlayer: Player,
  opponent: Player
): TriggeredEffectResult {
  const logs: string[] = []
  let newPlayer = { ...triggeringPlayer, zones: { ...triggeringPlayer.zones } }
  let newOpponent = { ...opponent, zones: { ...opponent.zones } }
  
  // Check for triggers on all permanents
  for (const permanent of newPlayer.zones.battlefield) {
    const abilities = parseCardAbilities(permanent)
    
    for (const ability of abilities) {
      if (ability.type === "triggered" && ability.triggerCondition === "put_counter") {
        // Hapatra - create snake tokens when -1/-1 counters are put on creatures
        if (permanent.name === "Hapatra, Vizier of Poisons" && counterType === "-1/-1") {
          const token: Card = {
            id: `token-snake-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: "Snake",
            manaCost: "",
            cmc: 0,
            type: "creature",
            subtype: "Snake",
            text: "Deathtouch",
            power: 1,
            toughness: 1,
            colors: ["G"],
            isToken: true,
          }
          newPlayer.zones.battlefield = [...newPlayer.zones.battlefield, token]
          logs.push(`Hapatra crea un token de Serpiente 1/1 con toque mortal`)
        }
        
        // Nest of Scarabs - create insect tokens when -1/-1 counters are put on creatures
        if (permanent.name === "Nest of Scarabs" && counterType === "-1/-1") {
          const token: Card = {
            id: `token-insect-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: "Insect",
            manaCost: "",
            cmc: 0,
            type: "creature",
            subtype: "Insect",
            text: "",
            power: 1,
            toughness: 1,
            colors: ["B"],
            isToken: true,
          }
          newPlayer.zones.battlefield = [...newPlayer.zones.battlefield, token]
          logs.push(`Nest of Scarabs crea un token de Insecto 1/1`)
        }
      }
    }
  }
  
  return { player: newPlayer, opponent: newOpponent, logs }
}

// Process combat damage triggers
export function processCombatDamageTriggers(
  attacker: Card,
  damageDealt: number,
  toPlayer: boolean,
  attackingPlayer: Player,
  defendingPlayer: Player
): TriggeredEffectResult {
  const logs: string[] = []
  let newAttacker = { ...attackingPlayer, zones: { ...attackingPlayer.zones } }
  let newDefender = { ...defendingPlayer, zones: { ...defendingPlayer.zones } }
  
  if (!toPlayer) return { player: newAttacker, opponent: newDefender, logs }
  
  const abilities = parseCardAbilities(attacker)
  
  for (const ability of abilities) {
    if (ability.type === "triggered" && ability.triggerCondition === "deals_combat_damage") {
      // Hapatra - put -1/-1 counter on target creature when dealing combat damage
      if (attacker.name === "Hapatra, Vizier of Poisons") {
        // For simplicity, put counter on first opposing creature
        if (newDefender.zones.battlefield.length > 0) {
          const targetIndex = newDefender.zones.battlefield.findIndex(c => c.type === "creature")
          if (targetIndex !== -1) {
            newDefender.zones.battlefield = [...newDefender.zones.battlefield]
            const target = newDefender.zones.battlefield[targetIndex]
            newDefender.zones.battlefield[targetIndex] = {
              ...target,
              negativeCounters: (target.negativeCounters || 0) + 1,
            }
            logs.push(`Hapatra pone un contador -1/-1 en ${target.name}`)
            
            // Also trigger Hapatra's second ability (create snake)
            const counterResult = processCounterTriggers("-1/-1", target, newAttacker, newDefender)
            newAttacker = counterResult.player
            newDefender = counterResult.opponent
            counterResult.logs.forEach(log => logs.push(log))
          }
        }
      }
      
      // Goblin Lackey - put a goblin from hand to battlefield
      if (attacker.name === "Goblin Lackey") {
        const goblinInHand = newAttacker.zones.hand.find(c => c.subtype?.toLowerCase().includes("goblin"))
        if (goblinInHand) {
          newAttacker.zones.hand = newAttacker.zones.hand.filter(c => c.id !== goblinInHand.id)
          newAttacker.zones.battlefield = [...newAttacker.zones.battlefield, goblinInHand]
          logs.push(`Goblin Lackey pone ${goblinInHand.name} en el campo de batalla`)
        }
      }
    }
  }
  
  // Process infect damage
  if (hasKeyword(attacker, "infect") && toPlayer) {
    newDefender.poisonCounters = (newDefender.poisonCounters || 0) + damageDealt
    logs.push(`${attacker.name} da ${damageDealt} contador(es) de veneno`)
  }
  
  return { player: newAttacker, opponent: newDefender, logs }
}

// Process triggers when a creature dies
export function processCreatureDeathTriggers(
  dyingCreature: Card,
  controller: Player,   // The player whose creature died
  opponent: Player,
  allPermanents: Card[] // All permanents that might have triggers
): TriggeredEffectResult {
  const logs: string[] = []
  let newController = { ...controller, zones: { ...controller.zones } }
  let newOpponent = { ...opponent, zones: { ...opponent.zones } }
  
  // Check all permanents for "when a creature dies" triggers
  for (const permanent of allPermanents) {
    if (!permanent.text) continue
    const lowerText = permanent.text.toLowerCase()
    
    // Blood Artist: "Whenever Blood Artist or another creature dies, target opponent loses 1 life and you gain 1 life"
    if (permanent.name === "Blood Artist" || 
        lowerText.includes("whenever") && lowerText.includes("creature dies") && 
        lowerText.includes("loses 1 life") && lowerText.includes("gain 1 life")) {
      
      // Determine who controls Blood Artist
      const playerHasIt = newController.zones.battlefield.some(c => c.id === permanent.id)
      const opponentHasIt = newOpponent.zones.battlefield.some(c => c.id === permanent.id)
      
      if (playerHasIt) {
        newOpponent.life -= 1
        newController.life += 1
        logs.push(`${permanent.name}: El oponente pierde 1 vida, ganas 1 vida`)
      } else if (opponentHasIt) {
        newController.life -= 1
        newOpponent.life += 1
        logs.push(`${permanent.name}: Pierdes 1 vida, el oponente gana 1 vida`)
      }
    }
    
    // Zulaport Cutthroat: "Whenever Zulaport Cutthroat or another creature you control dies..."
    if (permanent.name === "Zulaport Cutthroat" && 
        newController.zones.battlefield.some(c => c.id === permanent.id)) {
      newOpponent.life -= 1
      newController.life += 1
      logs.push(`Zulaport Cutthroat: El oponente pierde 1 vida, ganas 1 vida`)
    }
  }
  
  return { player: newController, opponent: newOpponent, logs }
}