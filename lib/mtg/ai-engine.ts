import type { GameState, Player, Card, GamePhase } from "./types"
import { playCard, tapCard, moveCard, castCommander } from "./game-utils"

export interface AIDecision {
  type: "play_land" | "play_creature" | "play_spell" | "attack" | "block" | "cast_commander" | "pass"
  cardId?: string
  targetId?: string
  message: string
}

// Calculate available mana from untapped lands
function getAvailableMana(player: Player): number {
  return player.zones.battlefield.filter(
    (c) => c.type === "land" && !c.isTapped
  ).length
}

// Get creatures that can attack (not tapped, not summoning sick - simplified)
function getAttackableCreatures(player: Player): Card[] {
  return player.zones.battlefield.filter(
    (c) => c.type === "creature" && !c.isTapped
  )
}

// Get creatures that can block
function getBlockableCreatures(player: Player): Card[] {
  return player.zones.battlefield.filter(
    (c) => c.type === "creature" && !c.isTapped
  )
}

// Calculate effective power/toughness with -1/-1 counters
function getEffectiveStats(card: Card): { power: number; toughness: number } {
  const counters = card.negativeCounters || 0
  return {
    power: Math.max(0, (card.power || 0) - counters),
    toughness: Math.max(0, (card.toughness || 0) - counters),
  }
}

// Simple threat assessment
function assessThreat(card: Card): number {
  const stats = getEffectiveStats(card)
  let threat = stats.power + stats.toughness
  
  // Keywords increase threat
  if (card.text?.toLowerCase().includes("flying")) threat += 2
  if (card.text?.toLowerCase().includes("deathtouch")) threat += 3
  if (card.text?.toLowerCase().includes("lifelink")) threat += 2
  if (card.text?.toLowerCase().includes("haste")) threat += 1
  if (card.text?.toLowerCase().includes("infect")) threat += 4
  if (card.isCommander) threat += 3
  
  return threat
}

// AI decision making for main phase
export function makeMainPhaseDecision(
  gameState: GameState,
  aiPlayer: Player,
  humanPlayer: Player
): AIDecision {
  const availableMana = getAvailableMana(aiPlayer)
  
  // Priority 1: Play a land if we haven't this turn
  if (!aiPlayer.hasPlayedLandThisTurn) {
    const landInHand = aiPlayer.zones.hand.find((c) => c.type === "land")
    if (landInHand) {
      return {
        type: "play_land",
        cardId: landInHand.id,
        message: `IA juega ${landInHand.name}`,
      }
    }
  }
  
  // Priority 2: Cast commander if in command zone and have mana
  if (
    aiPlayer.zones.commandZone.length > 0 &&
    availableMana >= aiPlayer.zones.commandZone[0].cmc
  ) {
    const commander = aiPlayer.zones.commandZone[0]
    return {
      type: "cast_commander",
      cardId: commander.id,
      message: `IA lanza a ${commander.name}`,
    }
  }
  
  // Priority 3: Play creatures (prioritize by mana efficiency)
  const playableCreatures = aiPlayer.zones.hand
    .filter((c) => c.type === "creature" && c.cmc <= availableMana)
    .sort((a, b) => {
      // Prefer to spend as much mana as possible
      const aValue = assessThreat(a) + (a.cmc / Math.max(1, availableMana)) * 2
      const bValue = assessThreat(b) + (b.cmc / Math.max(1, availableMana)) * 2
      return bValue - aValue
    })
  
  if (playableCreatures.length > 0) {
    const bestCreature = playableCreatures[0]
    return {
      type: "play_creature",
      cardId: bestCreature.id,
      message: `IA juega ${bestCreature.name}`,
    }
  }
  
  // Priority 4: Play artifacts
  const playableArtifacts = aiPlayer.zones.hand
    .filter((c) => c.type === "artifact" && c.cmc <= availableMana)
    .sort((a, b) => a.cmc - b.cmc)
  
  if (playableArtifacts.length > 0) {
    const artifact = playableArtifacts[0]
    return {
      type: "play_spell",
      cardId: artifact.id,
      message: `IA juega ${artifact.name}`,
    }
  }
  
  // Priority 5: Play enchantments
  const playableEnchantments = aiPlayer.zones.hand
    .filter((c) => c.type === "enchantment" && c.cmc <= availableMana)
    .sort((a, b) => a.cmc - b.cmc)
  
  if (playableEnchantments.length > 0) {
    const enchantment = playableEnchantments[0]
    return {
      type: "play_spell",
      cardId: enchantment.id,
      message: `IA juega ${enchantment.name}`,
    }
  }
  
  return { type: "pass", message: "IA pasa" }
}

// AI decision for combat
export function makeCombatDecision(
  gameState: GameState,
  aiPlayer: Player,
  humanPlayer: Player
): { attackers: Card[]; message: string } {
  const availableAttackers = getAttackableCreatures(aiPlayer)
  const enemyBlockers = getBlockableCreatures(humanPlayer)
  
  // Calculate total enemy blocking power
  const totalBlockPower = enemyBlockers.reduce((sum, c) => {
    const stats = getEffectiveStats(c)
    return sum + stats.power
  }, 0)
  
  // Decide which creatures to attack with
  const attackers: Card[] = []
  
  for (const attacker of availableAttackers) {
    const attackerStats = getEffectiveStats(attacker)
    
    // Don't attack with 0 power creatures
    if (attackerStats.power === 0) continue
    
    // Flying creatures can usually attack safely
    const hasFlying = attacker.text?.toLowerCase().includes("flying")
    const hasInfect = attacker.text?.toLowerCase().includes("infect")
    
    if (hasFlying || hasInfect) {
      attackers.push(attacker)
      continue
    }
    
    // Attack if we have no blockers to worry about
    if (enemyBlockers.length === 0) {
      attackers.push(attacker)
      continue
    }
    
    // Attack if our creature would survive most blocks
    const wouldSurvive = enemyBlockers.every((blocker) => {
      const blockerStats = getEffectiveStats(blocker)
      return attackerStats.toughness > blockerStats.power
    })
    
    // Be more aggressive - attack even if we might trade
    const isBigger = enemyBlockers.every((blocker) => {
      const blockerStats = getEffectiveStats(blocker)
      return attackerStats.power >= blockerStats.toughness && attackerStats.toughness >= blockerStats.power
    })
    
    // Aggressive strategy: attack with most creatures
    if (wouldSurvive || isBigger || availableAttackers.length > enemyBlockers.length) {
      attackers.push(attacker)
    }
  }
  
  const totalDamage = attackers.reduce((sum, c) => sum + getEffectiveStats(c).power, 0)
  const message = attackers.length > 0
    ? `IA ataca con ${attackers.map(a => a.name).join(", ")} (${totalDamage} dano potencial)`
    : "IA no ataca"
  
  return { attackers, message }
}

// AI blocking decision
export function makeBlockDecision(
  attackers: Card[],
  aiPlayer: Player,
  humanPlayer: Player
): { blocks: Array<{ blocker: Card; attacker: Card }>; message: string } {
  const availableBlockers = getBlockableCreatures(aiPlayer)
  const blocks: Array<{ blocker: Card; attacker: Card }> = []
  const usedBlockers = new Set<string>()
  
  // Sort attackers by threat level
  const sortedAttackers = [...attackers].sort((a, b) => assessThreat(b) - assessThreat(a))
  
  for (const attacker of sortedAttackers) {
    const attackerStats = getEffectiveStats(attacker)
    const hasFlying = attacker.text?.toLowerCase().includes("flying")
    
    // Find best blocker
    const eligibleBlockers = availableBlockers.filter((b) => {
      if (usedBlockers.has(b.id)) return false
      // Flying can only be blocked by flying/reach
      if (hasFlying) {
        return b.text?.toLowerCase().includes("flying") || b.text?.toLowerCase().includes("reach")
      }
      return true
    })
    
    // Find a blocker that can kill the attacker without dying, or at least trade
    const bestBlocker = eligibleBlockers.find((blocker) => {
      const blockerStats = getEffectiveStats(blocker)
      // Can kill attacker and survive
      return blockerStats.power >= attackerStats.toughness && blockerStats.toughness > attackerStats.power
    }) || eligibleBlockers.find((blocker) => {
      const blockerStats = getEffectiveStats(blocker)
      // Can at least trade
      return blockerStats.power >= attackerStats.toughness
    })
    
    // Block high-threat attackers even if we have to chump block
    if (bestBlocker) {
      blocks.push({ blocker: bestBlocker, attacker })
      usedBlockers.add(bestBlocker.id)
    } else if (assessThreat(attacker) >= 5 && eligibleBlockers.length > 0) {
      // Chump block very threatening creatures
      const chumpBlocker = eligibleBlockers[0]
      blocks.push({ blocker: chumpBlocker, attacker })
      usedBlockers.add(chumpBlocker.id)
    }
  }
  
  const message = blocks.length > 0
    ? `IA bloquea: ${blocks.map(b => `${b.blocker.name} bloquea a ${b.attacker.name}`).join(", ")}`
    : "IA no bloquea"
  
  return { blocks, message }
}

// Execute AI play card
export function executeAIPlay(
  gameState: GameState,
  decision: AIDecision
): { newState: GameState; tappedLands: string[] } {
  let newOpponent = gameState.opponent
  const tappedLands: string[] = []
  
  if (decision.type === "play_land" && decision.cardId) {
    newOpponent = playCard(newOpponent, decision.cardId)
    newOpponent = { ...newOpponent, hasPlayedLandThisTurn: true }
  } else if (decision.type === "cast_commander") {
    newOpponent = castCommander(newOpponent)
    // Tap lands for mana
    const commander = gameState.opponent.zones.commandZone[0]
    if (commander) {
      const landsToTap = newOpponent.zones.battlefield
        .filter((c) => c.type === "land" && !c.isTapped)
        .slice(0, commander.cmc)
      for (const land of landsToTap) {
        newOpponent = tapCard(newOpponent, land.id)
        tappedLands.push(land.id)
      }
    }
  } else if ((decision.type === "play_creature" || decision.type === "play_spell") && decision.cardId) {
    const card = newOpponent.zones.hand.find((c) => c.id === decision.cardId)
    if (card) {
      newOpponent = playCard(newOpponent, decision.cardId)
      // Tap lands for mana
      const landsToTap = newOpponent.zones.battlefield
        .filter((c) => c.type === "land" && !c.isTapped)
        .slice(0, card.cmc)
      for (const land of landsToTap) {
        newOpponent = tapCard(newOpponent, land.id)
        tappedLands.push(land.id)
      }
    }
  }
  
  return {
    newState: { ...gameState, opponent: newOpponent },
    tappedLands,
  }
}

// Check for creature death (0 or less toughness)
export function checkCreatureDeath(player: Player): { player: Player; deadCreatures: Card[] } {
  const deadCreatures: Card[] = []
  const survivingCreatures: Card[] = []
  
  for (const card of player.zones.battlefield) {
    if (card.type === "creature") {
      const stats = getEffectiveStats(card)
      if (stats.toughness <= 0) {
        deadCreatures.push(card)
      } else {
        survivingCreatures.push(card)
      }
    } else {
      survivingCreatures.push(card)
    }
  }
  
  if (deadCreatures.length === 0) {
    return { player, deadCreatures: [] }
  }
  
  // Move dead creatures to graveyard (or command zone if commander)
  const newGraveyard = [...player.zones.graveyard]
  const newCommandZone = [...player.zones.commandZone]
  
  for (const dead of deadCreatures) {
    if (dead.isCommander) {
      newCommandZone.push({ ...dead, isTapped: false, negativeCounters: 0 })
    } else {
      newGraveyard.push({ ...dead, isTapped: false })
    }
  }
  
  return {
    player: {
      ...player,
      zones: {
        ...player.zones,
        battlefield: survivingCreatures,
        graveyard: newGraveyard,
        commandZone: newCommandZone,
      },
    },
    deadCreatures,
  }
}

// Resolve combat damage
export function resolveCombatDamage(
  attackers: Card[],
  blocks: Array<{ blocker: Card; attacker: Card }>,
  attackingPlayer: Player,
  defendingPlayer: Player
): { attackingPlayer: Player; defendingPlayer: Player; damageToDefender: number; log: string[] } {
  const log: string[] = []
  let damageToDefender = 0
  const deadAttackers: Set<string> = new Set()
  const deadBlockers: Set<string> = new Set()
  
  // Process blocked attackers
  for (const { blocker, attacker } of blocks) {
    const attackerStats = getEffectiveStats(attacker)
    const blockerStats = getEffectiveStats(blocker)
    
    // Attacker deals damage to blocker
    if (attackerStats.power >= blockerStats.toughness) {
      deadBlockers.add(blocker.id)
      log.push(`${attacker.name} mata a ${blocker.name}`)
    }
    
    // Blocker deals damage to attacker
    if (blockerStats.power >= attackerStats.toughness) {
      deadAttackers.add(attacker.id)
      log.push(`${blocker.name} mata a ${attacker.name}`)
    }
  }
  
  // Unblocked attackers deal damage to defending player
  const blockedAttackerIds = new Set(blocks.map((b) => b.attacker.id))
  for (const attacker of attackers) {
    if (!blockedAttackerIds.has(attacker.id)) {
      const stats = getEffectiveStats(attacker)
      const hasInfect = attacker.text?.toLowerCase().includes("infect")
      
      if (hasInfect) {
        defendingPlayer = {
          ...defendingPlayer,
          poisonCounters: defendingPlayer.poisonCounters + stats.power,
        }
        log.push(`${attacker.name} inflige ${stats.power} contadores de veneno`)
      } else {
        damageToDefender += stats.power
        log.push(`${attacker.name} inflige ${stats.power} dano`)
      }
    }
  }
  
  // Remove dead creatures
  const newAttackerBattlefield = attackingPlayer.zones.battlefield.filter(
    (c) => !deadAttackers.has(c.id)
  )
  const deadAttackerCards = attackingPlayer.zones.battlefield.filter(
    (c) => deadAttackers.has(c.id)
  )
  
  const newDefenderBattlefield = defendingPlayer.zones.battlefield.filter(
    (c) => !deadBlockers.has(c.id)
  )
  const deadDefenderCards = defendingPlayer.zones.battlefield.filter(
    (c) => deadBlockers.has(c.id)
  )
  
  // Move dead to graveyard (or command zone)
  const attackerGraveyard = [...attackingPlayer.zones.graveyard]
  const attackerCommandZone = [...attackingPlayer.zones.commandZone]
  for (const dead of deadAttackerCards) {
    if (dead.isCommander) {
      attackerCommandZone.push({ ...dead, isTapped: false, negativeCounters: 0 })
    } else {
      attackerGraveyard.push(dead)
    }
  }
  
  const defenderGraveyard = [...defendingPlayer.zones.graveyard]
  const defenderCommandZone = [...defendingPlayer.zones.commandZone]
  for (const dead of deadDefenderCards) {
    if (dead.isCommander) {
      defenderCommandZone.push({ ...dead, isTapped: false, negativeCounters: 0 })
    } else {
      defenderGraveyard.push(dead)
    }
  }
  
  return {
    attackingPlayer: {
      ...attackingPlayer,
      zones: {
        ...attackingPlayer.zones,
        battlefield: newAttackerBattlefield,
        graveyard: attackerGraveyard,
        commandZone: attackerCommandZone,
      },
    },
    defendingPlayer: {
      ...defendingPlayer,
      life: defendingPlayer.life - damageToDefender,
      zones: {
        ...defendingPlayer.zones,
        battlefield: newDefenderBattlefield,
        graveyard: defenderGraveyard,
        commandZone: defenderCommandZone,
      },
    },
    damageToDefender,
    log,
  }
}
