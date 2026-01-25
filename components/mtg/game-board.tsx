"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  RotateCcw,
  SkipForward,
  Swords,
  Dices,
  ScrollText,
  ChevronRight,
  Target,
  Sparkles,
  RefreshCw,
  Check,
  Trophy,
  Skull,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PlayerArea } from "./player-area"
import { GameLobby } from "./game-lobby"
import type { GameState, Card, GameZone, GamePhase, GameConfig } from "@/lib/mtg/types"
import { PHASE_NAMES } from "@/lib/mtg/types"
import {
  createInitialGameState,
  drawCard,
  playCard,
  tapCard,
  untapAll,
  moveCard,
  castCommander,
  returnCommanderToZone,
  getNextPhase,
  PHASE_ORDER,
  addNegativeCounter,
  tapLandForMana,
  canPlayCard,
  spendManaForCard,
  performMulligan,
} from "@/lib/mtg/game-utils"
import {
  makeMainPhaseDecision,
  makeCombatDecision,
  makeBlockDecision,
  executeAIPlay,
  resolveCombatDamage,
} from "@/lib/mtg/ai-engine"
import {
  parseCardAbilities,
  getActivatableAbilities,
  canPayAbilityCost,
  parseManaCost,
  executeSpellEffect,
  getManaSpentForCard,
  parseSpellEffect,
  processTriggeredEffect,
  type ParsedAbility,
  type AbilityCost,
  type AbilityEffect,
} from "@/lib/mtg/abilities"

export function GameBoard() {
  const [gameStarted, setGameStarted] = useState(false)
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [selectedCard, setSelectedCard] = useState<{
    card: Card
    zone: keyof GameZone
    owner: "player" | "opponent"
  } | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [diceResult, setDiceResult] = useState<number | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const [drawingCardId, setDrawingCardId] = useState<string | null>(null)
  const [counterTargetMode, setCounterTargetMode] = useState(false)
  
  // Dev mode - starts with specific test cards
  const [devMode, setDevMode] = useState(false)
  const [combatMode, setCombatMode] = useState<"none" | "declaring_attackers" | "declaring_blockers">("none")
  const [selectedAttackers, setSelectedAttackers] = useState<string[]>([])
  const [selectedBlockers, setSelectedBlockers] = useState<{ blockerId: string; attackerId: string }[]>([])
  const [pendingBlocker, setPendingBlocker] = useState<string | null>(null)
  const [mulliganPhase, setMulliganPhase] = useState(true)
  const [mulliganCount, setMulliganCount] = useState(0)
  const [mulliganAnimating, setMulliganAnimating] = useState(false)
  const [cardsReturning, setCardsReturning] = useState<string[]>([])
  const [cardsDrawing, setCardsDrawing] = useState<string[]>([])

  const [pendingAdvancePhase, setPendingAdvancePhase] = useState(false)
  const [gameResult, setGameResult] = useState<"victory" | "defeat" | null>(null)
  
  // Library search state
  const [searchLibraryMode, setSearchLibraryMode] = useState<{
    active: boolean
    searchFor: "basic_land" | "creature" | "any" | "basic_swamp_mountain_forest" | "basic_plains_island_swamp" | "basic_island_swamp_mountain" | "basic_plains_mountain_forest"
    putTapped: boolean
    sourceCardId: string | null
  }>({ active: false, searchFor: "basic_land", putTapped: false, sourceCardId: null })
  
  // Dev mode - add card from deck to hand
  const [devCardPickerOpen, setDevCardPickerOpen] = useState(false)
  
  // Use ref to avoid stale closure issues with combatMode in callbacks
  const combatModeRef = useRef(combatMode)
  combatModeRef.current = combatMode
  
  const selectedAttackersRef = useRef(selectedAttackers)
  selectedAttackersRef.current = selectedAttackers

  // Ref to handlePlayCard to avoid circular dependency
  const handlePlayCardRef = useRef<(cardId: string) => void>(() => {})

  const handleStartGame = (config: GameConfig) => {
    setGameConfig(config)
    let initialState = createInitialGameState(config)
    
    // In dev mode, just add a log message (the dev card picker button will be available)
    if (devMode) {
      initialState = {
        ...initialState,
        log: [...initialState.log, "[DEV] Modo desarrollo activado - usa el botón para añadir cartas"],
      }
    }
    
    setGameState(initialState)
    setGameStarted(true)
  }

  const addLog = useCallback((message: string) => {
    setGameState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        log: [...prev.log, `[T${prev.turn}] ${message}`],
      }
    })
  }, [gameState])

  // Handle card click
  const handleCardClick = useCallback(
    (card: Card, zone: keyof GameZone, owner: "player" | "opponent") => {
      if (!gameState) return
      
      // Use ref to get current combatMode value (avoids stale closure)
      const currentCombatMode = combatModeRef.current
      
      // Debug logging
      console.log("=== CARD CLICK ===")
      console.log("Card:", card.name, "Type:", card.type)
      console.log("Zone:", zone, "Owner:", owner)
      console.log("CombatMode:", currentCombatMode)
      console.log("Is creature?", card.type === "creature")
      console.log("Conditions met?", currentCombatMode === "declaring_attackers" && zone === "battlefield" && owner === "player" && card.type === "creature")

      // Counter target mode - add -1/-1 counter
      if (counterTargetMode && zone === "battlefield") {
        setGameState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            player: owner === "player" ? addNegativeCounter(prev.player, card.id) : prev.player,
            opponent: owner === "opponent" ? addNegativeCounter(prev.opponent, card.id) : prev.opponent,
          }
        })
        addLog(`Pones un contador -1/-1 en ${card.name}`)
        setCounterTargetMode(false)
        return
      }

      // Combat: Declaring attackers
      if (currentCombatMode === "declaring_attackers" && zone === "battlefield" && owner === "player" && card.type === "creature") {
        if (card.isTapped) {
          addLog(`${card.name} está girada y no puede atacar`)
          return
        }
        // Toggle attacker selection
        setSelectedAttackers((prev) => {
          if (prev.includes(card.id)) {
            return prev.filter((id) => id !== card.id)
          }
          return [...prev, card.id]
        })
        return
      }

      // Combat: Declaring blockers - select blocker
      if (currentCombatMode === "declaring_blockers" && zone === "battlefield" && owner === "player" && card.type === "creature") {
        if (card.isTapped) {
          addLog(`${card.name} está girada y no puede bloquear`)
          return
        }
        // Check if already blocking
        const alreadyBlocking = selectedBlockers.find((b) => b.blockerId === card.id)
        if (alreadyBlocking) {
          // Remove from blockers
          setSelectedBlockers((prev) => prev.filter((b) => b.blockerId !== card.id))
          addLog(`${card.name} ya no bloqueará`)
          return
        }
        setPendingBlocker(card.id)
        addLog(`Selecciona qué atacante bloqueará ${card.name}`)
        return
      }

      // Combat: Declaring blockers - select attacker to block
      if (currentCombatMode === "declaring_blockers" && pendingBlocker && zone === "battlefield" && owner === "opponent") {
        const isAttacking = gameState.opponent.attackingCreatures.some((a) => a.cardId === card.id)
        if (!isAttacking) {
          addLog(`${card.name} no está atacando`)
          return
        }
        setSelectedBlockers((prev) => [...prev, { blockerId: pendingBlocker, attackerId: card.id }])
        const blockerCard = gameState.player.zones.battlefield.find((c) => c.id === pendingBlocker)
        addLog(`${blockerCard?.name} bloqueará a ${card.name}`)
        setPendingBlocker(null)
        return
      }

      if (owner === "opponent" && zone === "hand") return

      // If clicking on battlefield card, toggle tap
      if (zone === "battlefield" && owner === "player") {
        setGameState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            player: tapCard(prev.player, card.id),
          }
        })
        addLog(`${card.isTapped ? "Enderezas" : "Giras"} ${card.name}`)
        return
      }

      // If clicking card in hand during main phase, play it
      if (
        zone === "hand" &&
        owner === "player" &&
        (gameState.phase === "main1" || gameState.phase === "main2") &&
        gameState.activePlayer === "player"
      ) {
        // Use handlePlayCard ref to properly handle ETB effects
        handlePlayCardRef.current(card.id)
        return
      }

      setSelectedCard({ card, zone, owner })
    },
    [gameState, addLog, counterTargetMode, selectedBlockers, pendingBlocker]
  )

  // Handle play card from drag and drop
  const handlePlayCard = useCallback(
    (cardId: string) => {
      console.log('🔥 handlePlayCard INICIO - cardId:', cardId)
      if (!gameState) {
        console.log('❌ No hay gameState!')
        return
      }

      const card = gameState.player.zones.hand.find((c) => c.id === cardId)
      if (!card) {
        console.log('❌ Carta no encontrada en mano! IDs disponibles:', gameState.player.zones.hand.map(c => c.id))
        return
      }
      
      // DEBUG: Log visible cuando se intenta jugar cualquier carta
      console.log('🎴 handlePlayCard llamado para:', card.name, 'tipo:', card.type)

      // Check if trying to play a land and already played one this turn
      if (card.type === "land" && gameState.player.hasPlayedLandThisTurn) {
        addLog("Ya has jugado una tierra este turno")
        return
      }

      // Check if has enough mana
      if (!canPlayCard(gameState.player, card)) {
        addLog(`No tienes suficiente mana para jugar ${card.name}`)
        return
      }

      if (
        (gameState.phase === "main1" || gameState.phase === "main2") &&
        gameState.activePlayer === "player"
      ) {
        // Check if it's a spell with effects
        const isSpell = card.type === "instant" || card.type === "sorcery"
        const spellAbility = isSpell ? parseSpellEffect(card) : null
        const isLand = card.type === "land"
        
        setGameState((prev) => {
          if (!prev) return prev
          
          let newPlayer = playCard(prev.player, cardId)
          let newOpponent = prev.opponent
          const logs: string[] = []
          
          // Execute spell effects
          if (spellAbility) {
            const manaSpent = getManaSpentForCard(prev.player, card)
            const spellResult = executeSpellEffect(card, newPlayer, newOpponent, manaSpent)
            newPlayer = spellResult.player
            newOpponent = spellResult.opponent || newOpponent
            spellResult.log.forEach(log => logs.push(log))
          }
          
          // Process ETB triggers for the played card
          const abilities = parseCardAbilities(card)
          let hasSacrificeSearchETB = false
          let sacrificeSearchEffect: typeof abilities[0]["effect"] = undefined
          
          // FALLBACK: Detección directa por nombre para tierras Overlook
          const overlookLands: Record<string, "basic_swamp_mountain_forest" | "basic_plains_island_swamp" | "basic_island_swamp_mountain" | "basic_plains_mountain_forest"> = {
            "Riveteers Overlook": "basic_swamp_mountain_forest",
            "Obscura Storefront": "basic_plains_island_swamp",
            "Maestros Theater": "basic_island_swamp_mountain",
            "Cabaretti Courtyard": "basic_plains_mountain_forest",
          }
          
          console.log('🃏 Verificando Overlook fallback para:', card.name, 'match:', overlookLands[card.name])
          if (overlookLands[card.name]) {
            console.log('✅ Overlook detectada por nombre!')
            hasSacrificeSearchETB = true
            sacrificeSearchEffect = {
              type: "sacrifice_search_land",
              searchFor: overlookLands[card.name],
              putTapped: true,
              sacrificeSelf: true,
              gainLife: 1,
            }
          } else {
            // Try parsing from abilities
            for (const ability of abilities) {
              if (ability.type === "triggered" && ability.triggerCondition === "etb") {
                if (ability.effect) {
                  // eslint-disable-next-line no-console
                  console.log('[DEBUG game-board.tsx] Ejecutando ETB effect:', ability.effect)
                  if (ability.effect.type === "sacrifice_search_land") {
                    hasSacrificeSearchETB = true
                    sacrificeSearchEffect = ability.effect
                    // Don't process it here - we'll handle it after state update
                  } else {
                    // Ejecutar cualquier otro efecto ETB (incluyendo etb_tapped_unless)
                    const etbResult = processTriggeredEffect(ability.effect, card, newPlayer, newOpponent)
                    newPlayer = etbResult.player
                    newOpponent = etbResult.opponent
                    etbResult.logs.forEach(log => logs.push(log))
                  }
                }
              }
            }
          }
          
          // If this land has a sacrifice+search ETB, set up the search modal
          console.log('🔍 Checking sacrifice+search:', { hasSacrificeSearchETB, sacrificeSearchEffect })
          if (hasSacrificeSearchETB && sacrificeSearchEffect) {
            console.log('✅ Entrando al bloque de sacrificio!')
            // Sacrifice the land immediately
            newPlayer = {
              ...newPlayer,
              zones: {
                ...newPlayer.zones,
                battlefield: newPlayer.zones.battlefield.filter(c => c.id !== card.id),
                graveyard: [...newPlayer.zones.graveyard, card],
              },
            }
            
            // Gain life if applicable
            if (sacrificeSearchEffect.gainLife) {
              newPlayer.life += sacrificeSearchEffect.gainLife
              logs.push(`Ganas ${sacrificeSearchEffect.gainLife} vida`)
            }
            
            logs.push(`Sacrificas ${card.name}`)
            logs.forEach(log => addLog(log))
            
            // Open search modal after state update
            setTimeout(() => {
              setSearchLibraryMode({
                active: true,
                searchFor: sacrificeSearchEffect!.searchFor || "basic_land",
                putTapped: sacrificeSearchEffect!.putTapped || true,
                sourceCardId: card.id,
              })
              addLog(`Buscas en tu biblioteca...`)
            }, 100)
            
            return {
              ...prev,
              player: newPlayer,
              opponent: newOpponent,
            }
          }
          
          // Process Landfall triggers on all permanents when a land enters
          if (isLand) {
            for (const permanent of newPlayer.zones.battlefield) {
              const permAbilities = parseCardAbilities(permanent)
              for (const ability of permAbilities) {
                if (ability.type === "triggered" && ability.triggerCondition === "landfall") {
                  if (ability.effect) {
                    const landfallResult = processTriggeredEffect(ability.effect, permanent, newPlayer, newOpponent)
                    newPlayer = landfallResult.player
                    newOpponent = landfallResult.opponent
                    landfallResult.logs.forEach(log => logs.push(log))
                  }
                }
              }
            }
          }
          
          // Process "cast spell" triggers (Talrand, Edgar Markov)
          if (card.type === "instant" || card.type === "sorcery" || card.type === "creature") {
            const isInstantOrSorcery = card.type === "instant" || card.type === "sorcery"
            const isVampire = card.subtype?.toLowerCase().includes("vampire")
            
            for (const permanent of newPlayer.zones.battlefield) {
              const permAbilities = parseCardAbilities(permanent)
              for (const ability of permAbilities) {
                if (ability.type === "triggered" && ability.triggerCondition === "cast_spell") {
                  // Talrand: Create Drake when casting instant or sorcery
                  if (permanent.name === "Talrand, Sky Summoner" && isInstantOrSorcery) {
                    const drakeToken: Card = {
                      id: `token-drake-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      name: "Drake",
                      manaCost: "",
                      cmc: 0,
                      type: "creature",
                      subtype: "Drake",
                      text: "Flying",
                      power: 2,
                      toughness: 2,
                      colors: ["U"],
                      isToken: true,
                    }
                    newPlayer = {
                      ...newPlayer,
                      zones: {
                        ...newPlayer.zones,
                        battlefield: [...newPlayer.zones.battlefield, drakeToken]
                      }
                    }
                    logs.push(`Talrand crea un token de Drake 2/2 con volar`)
                  }
                  
                  // Edgar Markov: Create Vampire when casting Vampire spell
                  if (permanent.name === "Edgar Markov" && isVampire) {
                    const vampToken: Card = {
                      id: `token-vamp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                      name: "Vampire",
                      manaCost: "",
                      cmc: 0,
                      type: "creature",
                      subtype: "Vampire",
                      text: "",
                      power: 1,
                      toughness: 1,
                      colors: ["B"],
                      isToken: true,
                    }
                    newPlayer = {
                      ...newPlayer,
                      zones: {
                        ...newPlayer.zones,
                        battlefield: [...newPlayer.zones.battlefield, vampToken]
                      }
                    }
                    logs.push(`Edgar Markov crea un token de Vampiro 1/1`)
                  }
                }
              }
            }
          }
          
          // Log all effects
          logs.forEach(log => addLog(log))
          
          return {
            ...prev,
            player: newPlayer,
            opponent: newOpponent,
          }
        })
        addLog(`Juegas ${card.name}`)
      }
    },
    [gameState, addLog]
  )

  // Update ref after handlePlayCard is defined
  handlePlayCardRef.current = handlePlayCard

  // Handle card action from context menu
  const handleCardAction = useCallback(
    (card: Card, zone: keyof GameZone, action: string) => {
      switch (action) {
        case "tap":
          setGameState((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              player: tapCard(prev.player, card.id),
            }
          })
          break
        case "tap_land_for_mana":
          if (card.type === "land") {
            setGameState((prev) => {
              if (!prev) return prev
              return {
                ...prev,
                player: tapLandForMana(prev.player, card.id),
              }
            })
            addLog(`Giras ${card.name} para generar mana`)
          }
          break
        case "to_graveyard":
          setGameState((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              player: card.isCommander
                ? returnCommanderToZone(prev.player, card.id)
                : moveCard(prev.player, card.id, zone, "graveyard"),
            }
          })
          addLog(`${card.name} va al ${card.isCommander ? "zona de mando" : "cementerio"}`)
          break
        case "to_exile":
          setGameState((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              player: card.isCommander
                ? returnCommanderToZone(prev.player, card.id)
                : moveCard(prev.player, card.id, zone, "exile"),
            }
          })
          addLog(`${card.name} es exiliado`)
          break
        case "to_hand":
          setGameState((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              player: moveCard(prev.player, card.id, zone, "hand"),
            }
          })
          addLog(`${card.name} vuelve a tu mano`)
          break
        case "add_counter":
          setCounterTargetMode(true)
          addLog("Selecciona una criatura para poner un contador -1/-1")
          break
      }
      setSelectedCard(null)
    },
    [addLog]
  )

  // Execute activated ability on a card
  const executeAbility = useCallback(
    (card: Card, zone: keyof GameZone, ability: ParsedAbility) => {
      if (!gameState || ability.type !== "activated") return
      
      const cost = ability.cost
      const effect = ability.effect
      
      // Check if can pay cost
      if (cost && !canPayAbilityCost(gameState.player, card, cost)) {
        addLog(`No puedes pagar el coste de la habilidad de ${card.name}`)
        return
      }
      
      // If effect requires library search, open the search modal first
      if (effect?.type === "search_library") {
        // Pay costs first
        setGameState((prev) => {
          if (!prev) return prev
          let newPlayer = { ...prev.player }
          
          if (cost) {
            // Pay tap cost
            if (cost.tap) {
              const cardIndex = newPlayer.zones.battlefield.findIndex((c) => c.id === card.id)
              if (cardIndex !== -1) {
                newPlayer.zones.battlefield = [...newPlayer.zones.battlefield]
                newPlayer.zones.battlefield[cardIndex] = {
                  ...newPlayer.zones.battlefield[cardIndex],
                  isTapped: true,
                }
              }
            }
            
            // Pay sacrifice cost
            if (cost.sacrifice) {
              newPlayer.zones.battlefield = newPlayer.zones.battlefield.filter((c) => c.id !== card.id)
              newPlayer.zones.graveyard = [...newPlayer.zones.graveyard, card]
            }
          }
          
          return { ...prev, player: newPlayer }
        })
        
        // Open search modal
        setSearchLibraryMode({
          active: true,
          searchFor: effect.searchFor || "basic_land",
          putTapped: effect.putTapped || false,
          sourceCardId: card.id,
        })
        addLog(`Buscas en tu biblioteca...`)
        setSelectedCard(null)
        return
      }
      
      setGameState((prev) => {
        if (!prev) return prev
        
        let newPlayer = { ...prev.player }
        
        // Pay costs
        if (cost) {
          // Pay tap cost
          if (cost.tap) {
            const cardIndex = newPlayer.zones.battlefield.findIndex((c) => c.id === card.id)
            if (cardIndex !== -1) {
              newPlayer.zones.battlefield = [...newPlayer.zones.battlefield]
              newPlayer.zones.battlefield[cardIndex] = {
                ...newPlayer.zones.battlefield[cardIndex],
                isTapped: true,
              }
            }
          }
          
          // Pay mana cost
          if (cost.mana) {
            const { colors } = parseManaCost(cost.mana)
            newPlayer.mana = { ...newPlayer.mana }
            for (const [color, amount] of Object.entries(colors)) {
              newPlayer.mana[color as keyof typeof newPlayer.mana] -= amount
            }
          }
          
          // Pay sacrifice cost
          if (cost.sacrifice) {
            newPlayer.zones.battlefield = newPlayer.zones.battlefield.filter((c) => c.id !== card.id)
            newPlayer.zones.graveyard = [...newPlayer.zones.graveyard, card]
          }
          
          // Pay put -1/-1 counter cost
          if (cost.putCounter) {
            const cardIndex = newPlayer.zones.battlefield.findIndex((c) => c.id === card.id)
            if (cardIndex !== -1) {
              newPlayer.zones.battlefield = [...newPlayer.zones.battlefield]
              const currentCard = newPlayer.zones.battlefield[cardIndex]
              newPlayer.zones.battlefield[cardIndex] = {
                ...currentCard,
                negativeCounters: (currentCard.negativeCounters || 0) + cost.putCounter.count,
              }
            }
          }
        }
        
        // Apply effects
        if (effect) {
          switch (effect.type) {
            case "add_mana":
              if (effect.mana && effect.manaAmount) {
                newPlayer.mana = { ...newPlayer.mana }
                newPlayer.mana[effect.mana] = (newPlayer.mana[effect.mana] || 0) + effect.manaAmount
              }
              break
            
            case "add_mana_any":
              // For now, add green mana by default (in full impl, player would choose)
              if (effect.manaAmount) {
                newPlayer.mana = { ...newPlayer.mana }
                newPlayer.mana["G"] = (newPlayer.mana["G"] || 0) + effect.manaAmount
              }
              break
              
            case "gain_life":
              if (effect.amount) {
                newPlayer.life += effect.amount
              }
              break
            
            case "lose_life":
              if (effect.amount) {
                newPlayer.life -= effect.amount
              }
              break
              
            case "draw_card":
              if (effect.amount) {
                for (let i = 0; i < effect.amount; i++) {
                  if (newPlayer.zones.library.length > 0) {
                    const drawnCard = newPlayer.zones.library[0]
                    newPlayer.zones.library = newPlayer.zones.library.slice(1)
                    newPlayer.zones.hand = [...newPlayer.zones.hand, drawnCard]
                  }
                }
              }
              break
              
            case "untap":
              if (effect.target === "self") {
                const cardIndex = newPlayer.zones.battlefield.findIndex((c) => c.id === card.id)
                if (cardIndex !== -1) {
                  newPlayer.zones.battlefield = [...newPlayer.zones.battlefield]
                  newPlayer.zones.battlefield[cardIndex] = {
                    ...newPlayer.zones.battlefield[cardIndex],
                    isTapped: false,
                  }
                }
              }
              break
            
            case "create_token": {
              const tokenCount = effect.tokenCount === "variable" 
                ? (effect.variableAmount === "goblins_count" 
                    ? newPlayer.zones.battlefield.filter(c => c.subtype?.toLowerCase().includes("goblin")).length
                    : 1)
                : (effect.tokenCount || 1)
              
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
                newPlayer.zones.battlefield = [...newPlayer.zones.battlefield, token]
              }
              break
            }
            
            case "deal_damage": {
              // For now, deal damage to opponent (would need targeting UI for full implementation)
              const damageAmount = effect.amount || 0
              return { 
                ...prev, 
                player: newPlayer,
                opponent: {
                  ...prev.opponent,
                  life: prev.opponent.life - damageAmount
                }
              }
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
              // Also proliferate poison counters on player if any
              if (newPlayer.poisonCounters > 0) {
                newPlayer.poisonCounters += 1
              }
              // Proliferate on opponent's creatures and poison
              const newOpponent = { ...prev.opponent }
              newOpponent.zones = { ...newOpponent.zones }
              newOpponent.zones.battlefield = newOpponent.zones.battlefield.map(c => {
                if (c.positiveCounters && c.positiveCounters > 0) {
                  return { ...c, positiveCounters: c.positiveCounters + 1 }
                }
                if (c.negativeCounters && c.negativeCounters > 0) {
                  return { ...c, negativeCounters: c.negativeCounters + 1 }
                }
                return c
              })
              if (newOpponent.poisonCounters > 0) {
                newOpponent.poisonCounters += 1
              }
              return { ...prev, player: newPlayer, opponent: newOpponent }
            }
              
            case "regenerate":
              // Regenerate effect - for now just log it (prevents next destruction)
              break
              
            case "give_counter": {
              // Need targeting for this - for now apply to first valid target
              // In full implementation, player would choose target creature
              const targetCreatures = newPlayer.zones.battlefield.filter(c => 
                c.type?.toLowerCase().includes("creature") && c.id !== card.id
              )
              if (targetCreatures.length > 0 && effect.counterType && effect.counterAmount) {
                const targetIdx = newPlayer.zones.battlefield.findIndex(c => c.id === targetCreatures[0].id)
                if (targetIdx !== -1) {
                  newPlayer.zones.battlefield = [...newPlayer.zones.battlefield]
                  const targetCard = newPlayer.zones.battlefield[targetIdx]
                  if (effect.counterType === "+1/+1") {
                    newPlayer.zones.battlefield[targetIdx] = {
                      ...targetCard,
                      positiveCounters: (targetCard.positiveCounters || 0) + effect.counterAmount
                    }
                  } else if (effect.counterType === "-1/-1") {
                    newPlayer.zones.battlefield[targetIdx] = {
                      ...targetCard,
                      negativeCounters: (targetCard.negativeCounters || 0) + effect.counterAmount
                    }
                  }
                }
              }
              break
            }
            
            case "return_to_hand": {
              // Return target creature to hand - for now target opponent's first creature
              const opponentCreatures = prev.opponent.zones.battlefield.filter(c => 
                c.type?.toLowerCase().includes("creature")
              )
              if (opponentCreatures.length > 0) {
                const targetCreature = opponentCreatures[0]
                const newOpponent = { ...prev.opponent }
                newOpponent.zones = { ...newOpponent.zones }
                newOpponent.zones.battlefield = newOpponent.zones.battlefield.filter(c => c.id !== targetCreature.id)
                newOpponent.zones.hand = [...newOpponent.zones.hand, targetCreature]
                return { ...prev, player: newPlayer, opponent: newOpponent }
              }
              break
            }
            
            case "destroy": {
              // Destroy target - for now target opponent's first creature
              const opponentCreatures = prev.opponent.zones.battlefield.filter(c => 
                c.type?.toLowerCase().includes("creature")
              )
              if (opponentCreatures.length > 0) {
                const targetCreature = opponentCreatures[0]
                const newOpponent = { ...prev.opponent }
                newOpponent.zones = { ...newOpponent.zones }
                newOpponent.zones.battlefield = newOpponent.zones.battlefield.filter(c => c.id !== targetCreature.id)
                if (!targetCreature.isToken) {
                  newOpponent.zones.graveyard = [...newOpponent.zones.graveyard, targetCreature]
                }
                return { ...prev, player: newPlayer, opponent: newOpponent }
              }
              break
            }
            
            case "scry": {
              // Look at top N cards and put them back in any order (simplified: just show them in log)
              const scryCount = effect.amount || 1
              const topCards = newPlayer.zones.library.slice(0, scryCount)
              if (topCards.length > 0) {
                addLog(`Scry ${scryCount}: Ves ${topCards.map(c => c.name).join(", ")}`)
                // In full implementation, player would reorder cards
              }
              break
            }
          }
        }
        
        return { ...prev, player: newPlayer }
      })
      
      // Log the ability activation
      const costText = []
      if (ability.cost?.tap) costText.push("girar")
      if (ability.cost?.mana) costText.push(ability.cost.mana)
      if (ability.cost?.sacrifice) costText.push("sacrificar")
      if (ability.cost?.putCounter) costText.push(`poner ${ability.cost.putCounter.count} contador(es) ${ability.cost.putCounter.type}`)
      
      const effectText = []
      if (effect?.type === "add_mana" && effect.mana) effectText.push(`añadir {${effect.mana}}`)
      if (effect?.type === "gain_life") effectText.push(`ganar ${effect.amount} vida`)
      if (effect?.type === "draw_card") effectText.push(`robar ${effect.amount} carta(s)`)
      if (effect?.type === "untap") effectText.push("enderezar")
      
      addLog(`Activas habilidad de ${card.name}: ${effectText.join(", ") || ability.rawText}`)
      
      setSelectedCard(null)
    },
    [gameState, addLog]
  )

  // Draw card for player with animation
  const handleDrawCard = useCallback(() => {
    if (!gameState) return

    // Solo se puede robar una carta por turno (salvo efectos de cartas)
    if (gameState.player.hasDrawnThisTurn) {
      addLog("Ya has robado una carta este turno")
      return
    }

    const { player: newPlayer, drawnCard } = drawCard(gameState.player)
    if (drawnCard) {
      setDrawingCardId(drawnCard.id)
      setGameState((prev) => {
        if (!prev) return prev
        return { ...prev, player: newPlayer }
      })
      addLog(`Robas ${drawnCard.name}`)

      // Clear animation after it completes
      setTimeout(() => {
        setDrawingCardId(null)
      }, 500)
    } else {
      addLog("No quedan cartas en la biblioteca!")
    }
  }, [gameState, addLog])

  // Cast commander
  const handleCastCommander = useCallback(() => {
    if (!gameState) return

    if (
      gameState.player.zones.commandZone.length > 0 &&
      (gameState.phase === "main1" || gameState.phase === "main2")
    ) {
      const commander = gameState.player.zones.commandZone[0]
      
      // Check if has enough mana to cast commander
      if (!canPlayCard(gameState.player, commander)) {
        addLog(`No tienes suficiente mana para invocar a ${commander.name}`)
        return
      }

      setGameState((prev) => {
        if (!prev) return prev
        const updatedPlayer = spendManaForCard(prev.player, commander)
        return {
          ...prev,
          player: castCommander(updatedPlayer),
        }
      })
      addLog(`Lanzas a tu comandante ${commander.name}`)
    }
  }, [gameState, addLog])

  // Change life total
  const handleLifeChange = useCallback(
    (who: "player" | "opponent", amount: number) => {
      setGameState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          [who]: { ...prev[who], life: prev[who].life + amount },
        }
      })
    },
    []
  )

  // Start declaring attackers
  const startDeclareAttackers = useCallback(() => {
    if (!gameState || gameState.phase !== "combat_attackers" || gameState.activePlayer !== "player") return
    setCombatMode("declaring_attackers")
    setSelectedAttackers([])
    addLog("Selecciona las criaturas que atacarán")
  }, [gameState, addLog])

  // Confirm attackers
  const confirmAttackers = useCallback(() => {
    if (!gameState) return
    
    // Use ref to get current selectedAttackers
    const currentAttackers = selectedAttackersRef.current
    console.log("confirmAttackers called", { currentAttackers })

    // First, advance the phase BEFORE resetting combat mode
    // This prevents the useEffect from re-entering attack mode
    setGameState((prev) => {
      if (!prev) return prev
      
      const attackingCreatures = currentAttackers.map((id) => ({
        cardId: id,
        targetPlayerId: "opponent" as const,
      }))

      // Tap attacking creatures
      const newBattlefield = prev.player.zones.battlefield.map((c) =>
        currentAttackers.includes(c.id) ? { ...c, isTapped: true } : c
      )

      // Advance to combat_blockers phase directly
      return {
        ...prev,
        phase: "combat_blockers" as GamePhase,
        player: {
          ...prev.player,
          attackingCreatures,
          zones: {
            ...prev.player.zones,
            battlefield: newBattlefield,
          },
        },
      }
    })

    if (currentAttackers.length > 0) {
      const attackerNames = currentAttackers
        .map((id) => gameState.player.zones.battlefield.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ")
      addLog(`Atacas con: ${attackerNames}`)
    } else {
      addLog("No declaras atacantes")
    }

    setCombatMode("none")
    setSelectedAttackers([])
  }, [gameState, addLog])

  // Start declaring blockers
  const startDeclareBlockers = useCallback(() => {
    if (!gameState || gameState.phase !== "combat_blockers") return
    
    // Check if opponent has attackers (opponent is attacking us)
    if (gameState.opponent.attackingCreatures.length === 0) {
      addLog("El oponente no tiene atacantes")
      return
    }

    setCombatMode("declaring_blockers")
    setSelectedBlockers([])
    setPendingBlocker(null)
    addLog("Selecciona bloqueadores para las criaturas atacantes")
  }, [gameState, addLog])

  // Confirm blockers
  const confirmBlockers = useCallback(() => {
    if (!gameState) return

    setGameState((prev) => {
      if (!prev) return prev

      return {
        ...prev,
        player: {
          ...prev.player,
          blockingCreatures: selectedBlockers,
        },
      }
    })

    if (selectedBlockers.length > 0) {
      const blockDescriptions = selectedBlockers.map((b) => {
        const blocker = gameState.player.zones.battlefield.find((c) => c.id === b.blockerId)
        const attacker = gameState.opponent.zones.battlefield.find((c) => c.id === b.attackerId)
        return `${blocker?.name} bloquea a ${attacker?.name}`
      })
      addLog(blockDescriptions.join(", "))
    } else {
      addLog("No declaras bloqueadores")
    }

    setCombatMode("none")
    setSelectedBlockers([])
    setPendingBlocker(null)
    
    // Auto-advance to combat damage phase
    setTimeout(() => {
      setPendingAdvancePhase(true)
    }, 100)
  }, [gameState, selectedBlockers, addLog])

  // Cancel combat selection
  const cancelCombatSelection = useCallback(() => {
    const wasDefending = gameState?.activePlayer === "opponent" && gameState?.phase === "combat_blockers"
    
    setCombatMode("none")
    setSelectedAttackers([])
    setSelectedBlockers([])
    setPendingBlocker(null)
    
    // If AI was attacking and we cancel, signal to advance to damage phase (no blockers)
    if (wasDefending) {
      setPendingAdvancePhase(true)
    }
  }, [gameState])

  // Advance to next phase
  const advancePhase = useCallback(() => {
    setGameState((prev) => {
      if (!prev) return prev

      const nextPhase = getNextPhase(prev.phase)
      let newState = { ...prev, phase: nextPhase }

      // Handle phase transitions
      if (nextPhase === "untap" && prev.phase === "cleanup") {
        // New turn
        const newActivePlayer = prev.activePlayer === "player" ? "opponent" : "player"
        const newTurn = newActivePlayer === "player" ? prev.turn + 1 : prev.turn
        newState = {
          ...newState,
          turn: newTurn,
          activePlayer: newActivePlayer,
          priorityPlayer: newActivePlayer,
          player: newActivePlayer === "player" ? untapAll(prev.player) : prev.player,
          opponent: newActivePlayer === "opponent" ? untapAll(prev.opponent) : prev.opponent,
        }
        addLog(`--- Turno ${newState.turn}: ${newActivePlayer === "player" ? "Tu turno" : "Turno de IA"} ---`)
      }

      if (nextPhase === "draw" && prev.phase === "upkeep") {
        // Draw phase - draw card for active player
        if (newState.activePlayer === "player") {
          const { player: updatedPlayer, drawnCard } = drawCard(newState.player)
          if (drawnCard) {
            setDrawingCardId(drawnCard.id)
            setTimeout(() => setDrawingCardId(null), 500)
            newState = {
              ...newState,
              player: updatedPlayer,
            }
            addLog(`Robas ${drawnCard.name}`)
          }
        } else {
          const { player: updatedOpponent, drawnCard } = drawCard(newState.opponent)
          if (drawnCard) {
            newState = {
              ...newState,
              opponent: updatedOpponent,
            }
            addLog("IA roba una carta")
          }
        }
      }

      // Combat damage resolution
      if (nextPhase === "combat_damage" && prev.phase === "combat_blockers") {
        const activePlayer = prev.activePlayer
        const attackingPlayer = activePlayer === "player" ? prev.player : prev.opponent
        const defendingPlayer = activePlayer === "player" ? prev.opponent : prev.player
        
        // Get attacker cards
        const attackerCards = attackingPlayer.zones.battlefield.filter((c) =>
          attackingPlayer.attackingCreatures.some((a) => a.cardId === c.id)
        )

        if (attackerCards.length > 0) {
          // Get blocks
          const blocks = defendingPlayer.blockingCreatures.map((b) => ({
            blocker: defendingPlayer.zones.battlefield.find((c) => c.id === b.blockerId)!,
            attacker: attackingPlayer.zones.battlefield.find((c) => c.id === b.attackerId)!,
          })).filter((b) => b.blocker && b.attacker)

          const {
            attackingPlayer: updatedAttacker,
            defendingPlayer: updatedDefender,
            damageToDefender,
            log: combatLog,
          } = resolveCombatDamage(attackerCards, blocks, attackingPlayer, defendingPlayer)

          for (const msg of combatLog) {
            addLog(msg)
          }

          if (activePlayer === "player") {
            newState = {
              ...newState,
              player: updatedAttacker,
              opponent: updatedDefender,
            }
          } else {
            newState = {
              ...newState,
              opponent: updatedAttacker,
              player: updatedDefender,
            }
          }
        }
      }

      // Clear combat state at end of combat
      if (nextPhase === "combat_end" && prev.phase === "combat_damage") {
        newState = {
          ...newState,
          player: {
            ...newState.player,
            attackingCreatures: [],
            blockingCreatures: [],
          },
          opponent: {
            ...newState.opponent,
            attackingCreatures: [],
            blockingCreatures: [],
          },
        }
      }

      return newState
    })
  }, [addLog])

  // Effect to handle pending phase advance (to avoid circular dependency)
  useEffect(() => {
    if (pendingAdvancePhase) {
      setPendingAdvancePhase(false)
      console.log("=== PENDING ADVANCE PHASE ===")
      console.log("Current phase:", gameState?.phase)
      console.log("Player attacking creatures:", gameState?.player.attackingCreatures.length)
      const timeout = setTimeout(() => {
        advancePhase()
      }, 300)
      return () => clearTimeout(timeout)
    }
  }, [pendingAdvancePhase, advancePhase, gameState?.phase, gameState?.player.attackingCreatures.length])

  // Effect to detect victory/defeat conditions
  useEffect(() => {
    if (!gameState || gameResult || mulliganPhase) return

    // Check if player lost (life <= 0)
    if (gameState.player.life <= 0) {
      setGameResult("defeat")
      addLog("¡Has perdido! Tu vida llegó a 0.")
    }
    // Check if opponent lost (life <= 0)
    else if (gameState.opponent.life <= 0) {
      setGameResult("victory")
      addLog("¡Victoria! La vida del oponente llegó a 0.")
    }
  }, [gameState?.player.life, gameState?.opponent.life, gameResult, mulliganPhase, addLog])

  // Pass turn (skip to cleanup)
  const passTurn = useCallback(() => {
    setGameState((prev) => {
      if (!prev) return prev

      const newActivePlayer = prev.activePlayer === "player" ? "opponent" : "player"
      const newTurn = newActivePlayer === "player" ? prev.turn + 1 : prev.turn
      
      const newState: GameState = {
        ...prev,
        phase: "untap" as GamePhase,
        turn: newTurn,
        activePlayer: newActivePlayer,
        priorityPlayer: newActivePlayer,
        player: newActivePlayer === "player" ? untapAll(prev.player) : prev.player,
        opponent: newActivePlayer === "opponent" ? untapAll(prev.opponent) : prev.opponent,
      }
      
      const playerLabel = newActivePlayer === "player" ? "Tu turno" : "Turno de IA"
      addLog(`--- Turno ${newTurn}: ${playerLabel} ---`)
      
      return newState
    })
  }, [addLog])

  // Auto-advance through initial phases (untap, upkeep, draw) for both players
  useEffect(() => {
    if (!gameState) return
    
    // Only auto-advance from untap, upkeep, and draw phases
    if (gameState.phase !== "untap" && gameState.phase !== "upkeep" && gameState.phase !== "draw") return
    
    const timeout = setTimeout(() => {
      setGameState((prev) => {
        if (!prev) return prev

        const nextPhase = getNextPhase(prev.phase)
        let newState = { ...prev, phase: nextPhase }

        // Handle phase transitions
        if (nextPhase === "untap" && prev.phase === "cleanup") {
          const newActivePlayer = prev.activePlayer === "player" ? "opponent" : "player"
          const newTurn = newActivePlayer === "player" ? prev.turn + 1 : prev.turn
          newState = {
            ...newState,
            turn: newTurn,
            activePlayer: newActivePlayer,
            priorityPlayer: newActivePlayer,
            player: newActivePlayer === "player" ? untapAll(prev.player) : prev.player,
            opponent: newActivePlayer === "opponent" ? untapAll(prev.opponent) : prev.opponent,
          }
          addLog(`--- Turno ${newState.turn}: ${newActivePlayer === "player" ? "Tu turno" : "Turno de IA"} ---`)
        }

        if (nextPhase === "draw" && prev.phase === "upkeep") {
          // Draw phase - draw card for active player (both player and AI)
          if (newState.activePlayer === "player") {
            const { player: updatedPlayer, drawnCard } = drawCard(newState.player)
            if (drawnCard) {
              setDrawingCardId(drawnCard.id)
              setTimeout(() => setDrawingCardId(null), 500)
              newState = {
                ...newState,
                player: updatedPlayer,
              }
              addLog(`Robas ${drawnCard.name}`)
            }
          } else {
            const { player: updatedOpponent, drawnCard } = drawCard(newState.opponent)
            if (drawnCard) {
              newState = {
                ...newState,
                opponent: updatedOpponent,
              }
              addLog("IA roba una carta")
            }
          }
        }

        return newState
      })
    }, 500)
    
    return () => clearTimeout(timeout)
  }, [gameState?.phase])

  // Auto-advance combat phases when player is attacking
  useEffect(() => {
    if (!gameState || gameState.activePlayer !== "player") return
    
    // Auto-enter attack mode when reaching combat_attackers phase (only if no attackers yet)
    if (gameState.phase === "combat_attackers" && combatMode === "none" && gameState.player.attackingCreatures.length === 0) {
      // Use timeout to ensure state is properly synchronized
      const timeout = setTimeout(() => {
        setCombatMode("declaring_attackers")
        setSelectedAttackers([])
        addLog("Selecciona las criaturas que atacarán (o confirma sin seleccionar para no atacar)")
      }, 50)
      return () => clearTimeout(timeout)
    }
    
    // Player is attacking - AI decides blockers automatically
    if (gameState.phase === "combat_blockers" && gameState.player.attackingCreatures.length > 0) {
      console.log("=== AI BLOCKING PHASE ===")
      console.log("Player attackers:", gameState.player.attackingCreatures)
      setAiThinking(true)
      const timeout = setTimeout(() => {
        // AI decides blockers
        const attackerCards = gameState.player.zones.battlefield.filter((c) =>
          gameState.player.attackingCreatures.some((a) => a.cardId === c.id)
        )
        
        const aiBlockDecision = makeBlockDecision(attackerCards, gameState.opponent, gameState.player)
        
        if (aiBlockDecision.blocks.length > 0) {
          setGameState((prev) => {
            if (!prev) return prev
            return {
              ...prev,
              opponent: {
                ...prev.opponent,
                blockingCreatures: aiBlockDecision.blocks.map((b) => ({
                  blockerId: b.blocker.id,
                  attackerId: b.attacker.id,
                })),
              },
            }
          })
          addLog(aiBlockDecision.message)
        } else {
          addLog("La IA decide no bloquear")
        }
        
        setAiThinking(false)
        
        // Auto-advance to combat damage
        setTimeout(() => {
          advancePhase()
        }, 500)
      }, 800)
      
      return () => clearTimeout(timeout)
    }
    
    // No attackers in combat_blockers - skip to damage
    if (gameState.phase === "combat_blockers" && gameState.player.attackingCreatures.length === 0) {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 300)
      return () => clearTimeout(timeout)
    }
    
    // Auto-advance combat_damage after damage is resolved
    if (gameState.phase === "combat_damage") {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 800)
      return () => clearTimeout(timeout)
    }
    
    // Auto-advance combat_end to main2
    if (gameState.phase === "combat_end") {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [gameState?.phase, gameState?.activePlayer, gameState?.player.attackingCreatures.length, advancePhase, combatMode, addLog])

  // Advanced AI logic
  useEffect(() => {
    if (!gameState || gameState.activePlayer !== "opponent") return

    // Combat begin - just advance to attackers phase
    if (gameState.phase === "combat_begin") {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 500)
      return () => clearTimeout(timeout)
    }

    // AI declares attackers
    if (gameState.phase === "combat_attackers") {
      setAiThinking(true)
      const timeout = setTimeout(() => {
        setGameState((prev) => {
          if (!prev) return prev

          const { attackers, message } = makeCombatDecision(prev, prev.opponent, prev.player)
          let newOpponent = prev.opponent

          if (attackers.length > 0) {
            // Tap attacking creatures and set them as attackers
            const newBattlefield = prev.opponent.zones.battlefield.map((c) =>
              attackers.some((a) => a.id === c.id) ? { ...c, isTapped: true } : c
            )
            
            newOpponent = {
              ...newOpponent,
              attackingCreatures: attackers.map((a) => ({
                cardId: a.id,
                targetPlayerId: "player" as const,
              })),
              zones: {
                ...prev.opponent.zones,
                battlefield: newBattlefield,
              },
            }
          }
          addLog(message)

          return { ...prev, opponent: newOpponent }
        })

        // Advance to next phase after combat decision
        setTimeout(() => {
          advancePhase()
          setAiThinking(false)
        }, 500)
      }, 1000)

      return () => clearTimeout(timeout)
    }

    // AI is the attacker - only auto advance combat_damage phase, not blockers
    // During combat_blockers, player needs to declare blockers first
    if (gameState.phase === "combat_damage") {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 800)
      return () => clearTimeout(timeout)
    }
    
    // AI is the attacker during combat_blockers - let player declare blockers
    if (gameState.phase === "combat_blockers") {
      // Check if AI has attacking creatures
      if (gameState.opponent.attackingCreatures.length > 0) {
        // Check if player has any untapped creatures that can block
        const playerCanBlock = gameState.player.zones.battlefield.some(
          (c) => c.type === "creature" && !c.isTapped
        )
        
        if (!playerCanBlock) {
          // Player has no creatures to block - auto advance
          const timeout = setTimeout(() => {
            addLog("No tienes criaturas para bloquear")
            advancePhase()
          }, 500)
          return () => clearTimeout(timeout)
        }
        
        // Player can block - enable blocking mode
        if (combatMode !== "declaring_blockers") {
          setCombatMode("declaring_blockers")
          setSelectedBlockers([])
          setPendingBlocker(null)
          // Note: addLog is called via setTimeout to avoid infinite re-renders
          setTimeout(() => {
            addLog("Declara bloqueadores contra los atacantes de la IA")
          }, 0)
        }
        // Don't auto-advance - wait for player to confirm blockers
        return
      } else {
        // No attackers, auto-advance
        const timeout = setTimeout(() => {
          advancePhase()
        }, 500)
        return () => clearTimeout(timeout)
      }
    }

    // Main phases - play cards then advance
    if (gameState.phase === "main1" || gameState.phase === "main2") {
      setAiThinking(true)
      const timeout = setTimeout(() => {
        setGameState((prev) => {
          if (!prev) return prev

          let newOpponent = prev.opponent
          let madeAction = true
          
          while (madeAction) {
            madeAction = false
            const decision = makeMainPhaseDecision(prev, newOpponent, prev.player)
            
            if (decision.type === "pass") {
              addLog(decision.message)
              break
            }

            // Execute the decision
            const { newState, tappedLands, logs } = executeAIPlay({ ...prev, opponent: newOpponent }, decision)
            newOpponent = newState.opponent
            addLog(decision.message)
            if (logs) {
              logs.forEach(log => addLog(log))
            }
            madeAction = true
          }

          return { ...prev, opponent: newOpponent }
        })

        // Advance to next phase
        setTimeout(() => {
          advancePhase()
          setAiThinking(false)
        }, 500)
      }, 1500)

      return () => clearTimeout(timeout)
    }

    // For combat_end, advance to main2
    if (gameState.phase === "combat_end") {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 500)
      return () => clearTimeout(timeout)
    }

    // End step phases - pass turn
    if (gameState.phase === "end" || gameState.phase === "cleanup") {
      const timeout = setTimeout(() => {
        passTurn()
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [gameState, addLog, passTurn, advancePhase, combatMode])

  // AI blocking logic - when player attacks, AI blocks
  useEffect(() => {
    if (!gameState || gameState.activePlayer !== "player" || gameState.phase !== "combat_blockers") return
    
    // Check if player has attacking creatures
    const attackingCreatures = gameState.player.attackingCreatures
    if (attackingCreatures.length === 0) {
      // No attackers, auto-advance through combat phases
      const timeout = setTimeout(() => {
        advancePhase()
      }, 500)
      return () => clearTimeout(timeout)
    }

    const attackerCards = gameState.player.zones.battlefield.filter((c) =>
      attackingCreatures.some((a) => a.cardId === c.id)
    )

    if (attackerCards.length === 0) {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 500)
      return () => clearTimeout(timeout)
    }

    // Check if AI has any untapped creatures that can block
    const aiCanBlock = gameState.opponent.zones.battlefield.some(
      (c) => c.type === "creature" && !c.isTapped
    )
    
    if (!aiCanBlock) {
      // AI has no creatures to block - auto advance quickly
      const timeout = setTimeout(() => {
        addLog("IA no tiene criaturas para bloquear")
        advancePhase()
      }, 500)
      return () => clearTimeout(timeout)
    }

    setAiThinking(true)
    const timeout = setTimeout(() => {
      setGameState((prev) => {
        if (!prev) return prev

        const { blocks, message } = makeBlockDecision(
          attackerCards,
          prev.opponent,  // AI is the defender
          prev.player     // Player is the attacker
        )

        // Update AI's blocking creatures
        let newOpponent = { ...prev.opponent }
        for (const { blocker, attacker } of blocks) {
          newOpponent = {
            ...newOpponent,
            blockingCreatures: [
              ...newOpponent.blockingCreatures,
              {
                blockerId: blocker.id,
                attackerId: attacker.id,
              },
            ],
          }
        }

        addLog(message)
        return { ...prev, opponent: newOpponent }
      })

      // Auto-advance to combat damage after AI blocks
      setTimeout(() => {
        advancePhase()
        setAiThinking(false)
      }, 500)
    }, 1000)

    return () => clearTimeout(timeout)
  }, [gameState, addLog, advancePhase])

  // Dice roller
  const rollDice = (sides: number = 20) => {
    setIsRolling(true)
    let rolls = 0
    const maxRolls = 10
    const interval = setInterval(() => {
      setDiceResult(Math.floor(Math.random() * sides) + 1)
      rolls++
      if (rolls >= maxRolls) {
        clearInterval(interval)
        setIsRolling(false)
      }
    }, 80)
  }

  // Reset game
  const resetGame = () => {
    setGameStarted(false)
    setGameState(null)
    setGameConfig(null)
    setSelectedCard(null)
    setDiceResult(null)
    setCounterTargetMode(false)
    setMulliganPhase(true)
    setMulliganCount(0)
    setMulliganAnimating(false)
    setCardsReturning([])
    setCardsDrawing([])
    setGameResult(null)
  }

  // Handle mulligan
  const handleMulligan = useCallback(() => {
    if (!gameState || mulliganAnimating) return
    
    const newMulliganCount = mulliganCount + 1
    const currentHandIds = gameState.player.zones.hand.map(c => c.id)
    setCardsReturning(currentHandIds)
    setMulliganAnimating(true)
    
    setTimeout(() => {
      setCardsReturning([])
      
      setGameState((prev) => {
        if (!prev) return prev
        const newPlayer = performMulligan(prev.player, newMulliganCount)
        return { ...prev, player: newPlayer }
      })
      
      setTimeout(() => {
        setGameState((prev) => {
          if (!prev) return prev
          const cardsToDraw = Math.max(1, 7 - newMulliganCount)
          const newHandIds = prev.player.zones.hand.slice(0, cardsToDraw).map(c => c.id)
          setCardsDrawing(newHandIds)
          return prev
        })
        
        // Wait for animation to complete: 900ms base + (numCards-1)*100ms delay
        setTimeout(() => {
          setCardsDrawing([])
          setMulliganAnimating(false)
          setMulliganCount(newMulliganCount)
        }, 1400)
      }, 400)
    }, 700)
  }, [gameState, mulliganCount, mulliganAnimating])

  // Keep hand (end mulligan phase)
  const handleKeepHand = useCallback(() => {
    setMulliganPhase(false)
    addLog(`Mano inicial con ${gameState?.player.zones.hand.length || 7} cartas`)
  }, [gameState, addLog])

  // Show lobby if game hasn't started
  if (!gameStarted || !gameState) {
    return <GameLobby onStartGame={handleStartGame} devMode={devMode} onDevModeChange={setDevMode} />
  }

  // Show mulligan phase
  if (mulliganPhase) {
    return (
      <div className="flex h-screen flex-col bg-background">
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                <span className="text-lg font-bold text-primary-foreground">M</span>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Fase de Mulligan</h1>
                <p className="text-sm text-muted-foreground">
                  {mulliganCount === 0 
                    ? "Mano inicial de 7 cartas" 
                    : `Mulligan ${mulliganCount} - ${7 - mulliganCount} cartas`}
                </p>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="default"
                onClick={handleMulligan}
                disabled={mulliganAnimating || mulliganCount >= 6}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${mulliganAnimating ? "animate-spin" : ""}`} />
                {mulliganCount >= 6 ? "Máximo" : `Mulligan (${7 - mulliganCount - 1})`}
              </Button>
              <Button
                variant="default"
                size="default"
                onClick={handleKeepHand}
                disabled={mulliganAnimating}
                className="gap-2"
              >
                <Check className="h-4 w-4" />
                Quedarse ({gameState.player.zones.hand.length})
              </Button>
            </div>
          </div>
        </header>

        {/* Mulligan Game Area */}
        <main className="flex flex-1 flex-col p-4 relative overflow-hidden">
          {/* Library zone */}
          <div className="flex justify-center mb-4">
            <div className="flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-secondary/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">
                Biblioteca ({gameState.player.zones.library.length})
              </span>
              <div className="relative h-24 w-16">
                {gameState.player.zones.library.length > 0 && (
                  <>
                    <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900" />
                    <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900" />
                    <div className="absolute inset-0 rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900 flex items-center justify-center">
                      <span className="text-lg font-bold text-purple-300">{gameState.player.zones.library.length}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Animated cards traveling */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Cards going TO library */}
            {cardsReturning.map((cardId, index) => {
              const handSize = cardsReturning.length
              // Calculate card's starting position (center of screen, spread horizontally)
              const cardSpacing = Math.min(100, 600 / handSize)
              const startX = (index - (handSize - 1) / 2) * cardSpacing
              // Library is at top center - calculate relative movement
              const targetX = -startX // Move toward center
              const targetY = -350 // Move up to library
              
              return (
                <div
                  key={cardId}
                  className="absolute animate-card-to-library"
                  style={{
                    left: `calc(50% + ${startX}px)`,
                    top: '55%',
                    '--target-x': `${targetX}px`,
                    '--target-y': `${targetY}px`,
                    animationDelay: `${index * 50}ms`,
                    zIndex: 100 + index,
                  } as React.CSSProperties}
                >
                  <div className="h-52 w-36 rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900 shadow-2xl -translate-x-1/2 -translate-y-1/2" />
                </div>
              )
            })}
          </div>

          {/* Hand Display */}
          <div className="flex-1 flex items-center justify-center" id="mulligan-hand-container">
            <div className="flex justify-center gap-3 p-4 rounded-xl border-2 border-primary/30 bg-primary/5 relative">
              {/* Static hand cards (shown when not animating) */}
              {!mulliganAnimating && gameState.player.zones.hand.map((card, index) => (
                <div
                  key={card.id}
                  className="relative transition-all duration-300 hover:scale-105 hover:-translate-y-2"
                >
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="h-52 w-auto rounded-lg shadow-lg"
                    />
                  ) : (
                    <div className="h-52 w-36 rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 p-3 flex flex-col justify-between shadow-lg border border-gray-600">
                      <div>
                        <span className="text-sm font-semibold text-white block">{card.name}</span>
                        <span className="text-xs text-gray-400">{card.manaCost}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400">{card.type}</span>
                        {card.power !== undefined && (
                          <span className="text-xs text-white block">{card.power}/{card.toughness}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* Animated drawing cards - positioned to end exactly where static cards will be */}
              {cardsDrawing.length > 0 && gameState.player.zones.hand.map((card, index) => {
                const isDrawing = cardsDrawing.includes(card.id)
                if (!isDrawing) return null
                const drawIndex = cardsDrawing.indexOf(card.id)
                
                return (
                  <div
                    key={`drawing-${card.id}`}
                    className="relative animate-card-from-library-inplace"
                    style={{
                      animationDelay: `${drawIndex * 100}ms`,
                      perspective: '1000px',
                    } as React.CSSProperties}
                  >
                    <div className="relative h-52 w-36" style={{ transformStyle: 'preserve-3d' }}>
                      {/* Card back (visible during travel) */}
                      <div 
                        className="absolute inset-0 rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900 shadow-2xl"
                        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                      >
                        <div className="h-full w-full flex items-center justify-center p-2">
                          <div className="h-full w-full rounded border-2 border-purple-700/50 bg-purple-900/30 flex items-center justify-center">
                            <div className="text-4xl font-bold text-purple-400/80">✦</div>
                          </div>
                        </div>
                      </div>
                      {/* Card front (revealed on flip) */}
                      <div 
                        className="absolute inset-0 rounded-lg shadow-2xl overflow-hidden"
                        style={{ backfaceVisibility: 'hidden' }}
                      >
                        {card?.imageUrl ? (
                          <img
                            src={card.imageUrl}
                            alt={card?.name || ''}
                            className="h-full w-full object-cover rounded-lg"
                          />
                        ) : (
                          <div className="h-full w-full rounded-lg bg-gradient-to-br from-gray-700 to-gray-800 p-2 flex flex-col justify-between border border-gray-600">
                            <div>
                              <span className="text-xs font-semibold text-white block truncate">{card?.name}</span>
                              <span className="text-[10px] text-gray-400">{card?.manaCost}</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-gray-400 truncate block">{card?.type}</span>
                              {card?.power !== undefined && (
                                <span className="text-[10px] text-white block">{card?.power}/{card?.toughness}</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              
              {mulliganAnimating && cardsDrawing.length === 0 && cardsReturning.length === 0 && (
                <div className="flex items-center justify-center h-52 w-full">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Barajando...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Info Footer */}
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">
              Puedes hacer mulligan para barajar tu mano y robar una carta menos.
              {mulliganCount > 0 && " Después de quedarte, podrás hacer Scry 1."}
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-3 py-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-lg font-bold text-primary-foreground">M</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">MTG Commander</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Turno {gameState.turn}</span>
                <ChevronRight className="h-3 w-3" />
                <span className="font-medium text-foreground">
                  {PHASE_NAMES[gameState.phase]}
                </span>
                {aiThinking && (
                  <span className="ml-2 animate-pulse text-amber-400">IA pensando...</span>
                )}
                {counterTargetMode && (
                  <span className="ml-2 flex items-center gap-1 text-purple-400">
                    <Target className="h-3 w-3" />
                    Selecciona objetivo para -1/-1
                  </span>
                )}
                {combatMode === "declaring_attackers" && (
                  <span className="ml-2 flex items-center gap-1 text-red-400">
                    <Swords className="h-3 w-3" />
                    Selecciona atacantes ({selectedAttackers.length})
                  </span>
                )}
                {combatMode === "declaring_blockers" && (
                  <span className="ml-2 flex items-center gap-1 text-blue-400">
                    <Target className="h-3 w-3" />
                    {pendingBlocker ? "Selecciona atacante a bloquear" : `Selecciona bloqueadores (${selectedBlockers.length})`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Phase indicator */}
            <div className="mr-2 hidden items-center gap-1 md:flex">
              {PHASE_ORDER.slice(0, 6).map((phase) => (
                <div
                  key={phase}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    gameState.phase === phase
                      ? "bg-primary"
                      : PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(gameState.phase)
                        ? "bg-primary/30"
                        : "bg-muted"
                  }`}
                  title={PHASE_NAMES[phase]}
                />
              ))}
            </div>

            {/* Add -1/-1 Counter Button */}
            <Button
              variant={counterTargetMode ? "default" : "secondary"}
              size="sm"
              onClick={() => setCounterTargetMode(!counterTargetMode)}
              className="gap-1"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">-1/-1</span>
            </Button>

            {/* Dev Mode Controls */}
            {devMode && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDevCardPickerOpen(true)}
                  className="gap-1 border-amber-400/50 text-amber-400 hover:bg-amber-400/10"
                >
                  <Sparkles className="h-3 w-3" />
                  <span className="hidden sm:inline">Añadir Carta</span>
                </Button>
                <span className="text-xs text-amber-400 font-medium px-2 py-1 bg-amber-400/10 rounded">
                  DEV
                </span>
              </div>
            )}

            {/* Combat Buttons - Attackers */}
            {combatMode === "declaring_attackers" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmAttackers}
                className="gap-1"
              >
                <Swords className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {selectedAttackers.length > 0 
                    ? `Atacar (${selectedAttackers.length})` 
                    : "No Atacar"}
                </span>
              </Button>
            )}

            {/* Combat Buttons - Blockers */}
            {combatMode === "declaring_blockers" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={confirmBlockers}
                className="gap-1"
              >
                <Target className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {selectedBlockers.length > 0 
                    ? `Bloquear (${selectedBlockers.length})` 
                    : "No Bloquear"}
                </span>
              </Button>
            )}

            {/* Next Phase */}
            <Button
              variant="secondary"
              size="sm"
              onClick={advancePhase}
              disabled={gameState.activePlayer !== "player" || combatMode !== "none"}
              className="gap-1"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="hidden sm:inline">Fase</span>
            </Button>

            {/* Pass Turn */}
            <Button
              variant="default"
              size="sm"
              onClick={passTurn}
              disabled={gameState.activePlayer !== "player" || combatMode !== "none"}
              className="gap-1"
            >
              <SkipForward className="h-4 w-4" />
              <span className="hidden sm:inline">Pasar Turno</span>
            </Button>

            {/* Dice Roller */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary" size="icon" className="relative">
                  <Dices className="h-4 w-4" />
                  {diceResult !== null && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {diceResult}
                    </span>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tirar Dados</DialogTitle>
                  <DialogDescription>Selecciona el tipo de dado</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col items-center gap-4 py-4">
                  {diceResult !== null && (
                    <div
                      className={`flex h-20 w-20 items-center justify-center rounded-xl bg-primary text-3xl font-bold text-primary-foreground ${
                        isRolling ? "animate-pulse" : ""
                      }`}
                    >
                      {diceResult}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {[4, 6, 8, 10, 12, 20].map((sides) => (
                      <Button
                        key={sides}
                        variant="secondary"
                        className="h-12 w-12"
                        onClick={() => rollDice(sides)}
                        disabled={isRolling}
                      >
                        d{sides}
                      </Button>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {/* Game Log */}
            <Dialog open={showLog} onOpenChange={setShowLog}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="icon">
                  <ScrollText className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Historial de Partida</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-1">
                    {gameState.log.map((entry, i) => (
                      <p
                        key={`${entry}-${i}`}
                        className={`text-sm ${
                          entry.startsWith("---") ? "mt-2 font-semibold text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {entry}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>

            {/* Reset */}
            <Button variant="destructive" size="icon" onClick={resetGame}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Game Area */}
      <main className="flex flex-1 flex-col gap-1 p-1 overflow-auto min-h-0">
        {/* Opponent Area */}
        <PlayerArea
          player={gameState.opponent}
          isOpponent
          isActive={gameState.activePlayer === "opponent"}
          onCardClick={(card, zone) => handleCardClick(card, zone, "opponent")}
          selectedCardId={selectedCard?.card.id}
          className="shrink-0"
          attackingCreatureIds={gameState.opponent.attackingCreatures.map(a => a.cardId)}
          blockingCreatureIds={gameState.opponent.blockingCreatures.map(b => b.blockerId)}
        />

        {/* Divider / Stack */}
        <div className="flex items-center justify-center gap-4 py-1">
          <div className="h-px flex-1 bg-border" />
          <Swords className="h-5 w-5 text-muted-foreground" />
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Player Area */}
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="flex-1">
              <PlayerArea
                player={gameState.player}
                isActive={gameState.activePlayer === "player"}
                onLifeChange={(amount) => handleLifeChange("player", amount)}
                onCardClick={(card, zone) => handleCardClick(card, zone, "player")}
                onCardRightClick={(card, zone) => setSelectedCard({ card, zone, owner: "player" })}
                onDrawCard={handleDrawCard}
                onCastCommander={handleCastCommander}
                onPlayCard={handlePlayCard}
                selectedCardId={selectedCard?.card.id}
                className="h-full"
                drawingCardId={drawingCardId}
                canPlayCard={(card) => canPlayCard(gameState.player, card)}
                attackingCreatureIds={gameState.player.attackingCreatures.map(a => a.cardId)}
                selectedForCombatIds={combatMode === "declaring_attackers" ? selectedAttackers : (combatMode === "declaring_blockers" ? selectedBlockers.map(b => b.blockerId) : [])}
                blockingCreatureIds={gameState.player.blockingCreatures.map(b => b.blockerId)}
              />
            </div>
          </ContextMenuTrigger>
          {selectedCard && selectedCard.owner === "player" && (
            <ContextMenuContent>
              <ContextMenuItem
                onClick={() =>
                  handleCardAction(selectedCard.card, selectedCard.zone, "tap")
                }
              >
                {selectedCard.card.isTapped ? "Enderezar" : "Girar"}
              </ContextMenuItem>
              {selectedCard.card.type === "land" && !selectedCard.card.isTapped && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() =>
                      handleCardAction(selectedCard.card, selectedCard.zone, "tap_land_for_mana")
                    }
                  >
                    Girar por mana
                  </ContextMenuItem>
                </>
              )}
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() =>
                  handleCardAction(selectedCard.card, selectedCard.zone, "add_counter")
                }
              >
                Poner contador -1/-1
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() =>
                  handleCardAction(selectedCard.card, selectedCard.zone, "to_graveyard")
                }
              >
                Enviar al Cementerio
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() =>
                  handleCardAction(selectedCard.card, selectedCard.zone, "to_exile")
                }
              >
                Exiliar
              </ContextMenuItem>
              {selectedCard.zone !== "hand" && (
                <ContextMenuItem
                  onClick={() =>
                    handleCardAction(selectedCard.card, selectedCard.zone, "to_hand")
                  }
                >
                  Devolver a la Mano
                </ContextMenuItem>
              )}
              {/* Activated Abilities */}
              {selectedCard.zone === "battlefield" && (() => {
                const abilities = getActivatableAbilities(gameState.player, selectedCard.card)
                if (abilities.length === 0) return null
                return (
                  <>
                    <ContextMenuSeparator />
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Habilidades Activadas
                    </div>
                    {abilities.map((ability, index) => (
                      <ContextMenuItem
                        key={index}
                        onClick={() => executeAbility(selectedCard.card, selectedCard.zone, ability)}
                        disabled={!canPayAbilityCost(gameState.player, selectedCard.card, ability.cost || {})}
                      >
                        <span className="max-w-[200px] truncate">{ability.rawText}</span>
                      </ContextMenuItem>
                    ))}
                  </>
                )
              })()}
            </ContextMenuContent>
          )}
        </ContextMenu>
      </main>

      {/* Library Search Modal */}
      <Dialog open={searchLibraryMode.active} onOpenChange={(open) => {
        if (!open) {
          // Cancel search - shuffle library
          setSearchLibraryMode({ active: false, searchFor: "basic_land", putTapped: false, sourceCardId: null })
          addLog("Cancelas la búsqueda y barajas tu biblioteca")
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              Buscar en Biblioteca
            </DialogTitle>
            <DialogDescription>
              {searchLibraryMode.searchFor === "basic_land" 
                ? "Selecciona una tierra básica para ponerla en el campo de batalla" 
                : "Selecciona una carta"}
              {searchLibraryMode.putTapped && " (entrará girada)"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[50vh]">
            <div className="grid grid-cols-3 gap-2 p-2">
              {gameState?.player.zones.library
                .filter(card => {
                  if (card.type !== "land") return false
                  
                  const basicLandNames = ["Forest", "Swamp", "Plains", "Island", "Mountain"]
                  const cardIsBasic = basicLandNames.includes(card.name)
                  
                  switch (searchLibraryMode.searchFor) {
                    case "basic_land":
                      return cardIsBasic
                    case "basic_swamp_mountain_forest":
                      return card.name === "Swamp" || card.name === "Mountain" || card.name === "Forest"
                    case "basic_plains_island_swamp":
                      return card.name === "Plains" || card.name === "Island" || card.name === "Swamp"
                    case "basic_island_swamp_mountain":
                      return card.name === "Island" || card.name === "Swamp" || card.name === "Mountain"
                    case "basic_plains_mountain_forest":
                      return card.name === "Plains" || card.name === "Mountain" || card.name === "Forest"
                    default:
                      return cardIsBasic
                  }
                })
                .map((card) => (
                  <div
                    key={card.id}
                    className="p-2 border rounded cursor-pointer hover:bg-accent hover:border-primary transition-colors"
                    onClick={() => {
                      // Put the selected land onto the battlefield
                      setGameState((prev) => {
                        if (!prev) return prev
                        
                        const newLibrary = prev.player.zones.library.filter(c => c.id !== card.id)
                        // Shuffle the library
                        const shuffledLibrary = [...newLibrary].sort(() => Math.random() - 0.5)
                        
                        return {
                          ...prev,
                          player: {
                            ...prev.player,
                            zones: {
                              ...prev.player.zones,
                              library: shuffledLibrary,
                              battlefield: [
                                ...prev.player.zones.battlefield,
                                { ...card, isTapped: searchLibraryMode.putTapped },
                              ],
                            },
                          },
                        }
                      })
                      
                      addLog(`Pones ${card.name} en el campo de batalla${searchLibraryMode.putTapped ? " girada" : ""} y barajas tu biblioteca`)
                      setSearchLibraryMode({ active: false, searchFor: "basic_land", putTapped: false, sourceCardId: null })
                    }}
                  >
                    <div className="text-sm font-medium">{card.name}</div>
                    <div className="text-xs text-muted-foreground capitalize">{card.type}</div>
                    {card.text && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.text}</div>
                    )}
                  </div>
                ))}
            </div>
            {gameState?.player.zones.library.filter(card => {
              if (card.type !== "land") return false
              const basicLandNames = ["Forest", "Swamp", "Plains", "Island", "Mountain"]
              const cardIsBasic = basicLandNames.includes(card.name)
              
              switch (searchLibraryMode.searchFor) {
                case "basic_land":
                  return cardIsBasic
                case "basic_swamp_mountain_forest":
                  return card.name === "Swamp" || card.name === "Mountain" || card.name === "Forest"
                case "basic_plains_island_swamp":
                  return card.name === "Plains" || card.name === "Island" || card.name === "Swamp"
                case "basic_island_swamp_mountain":
                  return card.name === "Island" || card.name === "Swamp" || card.name === "Mountain"
                case "basic_plains_mountain_forest":
                  return card.name === "Plains" || card.name === "Mountain" || card.name === "Forest"
                default:
                  return cardIsBasic
              }
            }).length === 0 && (
              <div className="text-center text-muted-foreground p-4">
                No hay tierras básicas válidas en tu biblioteca
              </div>
            )}
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                // Just shuffle and close
                setGameState((prev) => {
                  if (!prev) return prev
                  const shuffledLibrary = [...prev.player.zones.library].sort(() => Math.random() - 0.5)
                  return {
                    ...prev,
                    player: {
                      ...prev.player,
                      zones: {
                        ...prev.player.zones,
                        library: shuffledLibrary,
                      },
                    },
                  }
                })
                addLog("No encuentras ninguna tierra y barajas tu biblioteca")
                setSearchLibraryMode({ active: false, searchFor: "basic_land", putTapped: false, sourceCardId: null })
              }}
            >
              No buscar (barajar)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dev Mode - Add Card to Hand Modal */}
      <Dialog open={devCardPickerOpen} onOpenChange={setDevCardPickerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Sparkles className="h-5 w-5" />
              Dev Mode - Añadir Carta a la Mano
            </DialogTitle>
            <DialogDescription>
              Selecciona una carta de tu biblioteca para añadirla a tu mano
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto max-h-[55vh] border rounded-md">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2">
              {/* Show unique cards from library, grouped by name */}
              {gameState?.player.zones.library
                .reduce((acc, card) => {
                  if (!acc.find(c => c.name === card.name)) {
                    acc.push(card)
                  }
                  return acc
                }, [] as Card[])
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((card) => {
                  const count = gameState?.player.zones.library.filter(c => c.name === card.name).length || 0
                  return (
                    <div
                      key={card.id}
                      className="p-2 border rounded cursor-pointer hover:bg-amber-400/10 hover:border-amber-400 transition-colors"
                      onClick={() => {
                        // Find the actual card in library and move it to hand
                        const cardInLibrary = gameState?.player.zones.library.find(c => c.name === card.name)
                        if (!cardInLibrary) return
                        
                        setGameState((prev) => {
                          if (!prev) return prev
                          
                          // Remove one instance from library
                          let removed = false
                          const newLibrary = prev.player.zones.library.filter(c => {
                            if (!removed && c.name === card.name) {
                              removed = true
                              return false
                            }
                            return true
                          })
                          
                          return {
                            ...prev,
                            player: {
                              ...prev.player,
                              zones: {
                                ...prev.player.zones,
                                library: newLibrary,
                                hand: [...prev.player.zones.hand, cardInLibrary],
                              },
                            },
                          }
                        })
                        
                        addLog(`[DEV] Añades ${card.name} a tu mano`)
                        setDevCardPickerOpen(false)
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="text-sm font-medium">{card.name}</div>
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">x{count}</span>
                      </div>
                      <div className="text-xs text-muted-foreground capitalize">{card.type}</div>
                      {card.manaCost && (
                        <div className="text-xs text-muted-foreground">{card.manaCost}</div>
                      )}
                      {card.power !== undefined && card.toughness !== undefined && (
                        <div className="text-xs font-medium mt-1">{card.power}/{card.toughness}</div>
                      )}
                      {card.text && (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.text}</div>
                      )}
                    </div>
                  )
                })}
            </div>
            {(!gameState?.player.zones.library || gameState.player.zones.library.length === 0) && (
              <div className="text-center text-muted-foreground p-4">
                No hay cartas en tu biblioteca
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Victory/Defeat Modal */}
      <Dialog open={gameResult !== null} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-3 text-2xl">
              {gameResult === "victory" ? (
                <>
                  <Trophy className="h-8 w-8 text-yellow-500" />
                  <span className="text-yellow-500">¡Victoria!</span>
                  <Trophy className="h-8 w-8 text-yellow-500" />
                </>
              ) : (
                <>
                  <Skull className="h-8 w-8 text-red-500" />
                  <span className="text-red-500">Derrota</span>
                  <Skull className="h-8 w-8 text-red-500" />
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-center pt-4">
              {gameResult === "victory" ? (
                <span className="text-lg">¡Has derrotado a tu oponente! La vida del oponente llegó a 0.</span>
              ) : (
                <span className="text-lg">Tu vida ha llegado a 0. Mejor suerte la próxima vez.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-4 pt-6">
            <Button
              variant="outline"
              onClick={resetGame}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Volver al Lobby
            </Button>
            <Button
              onClick={() => {
                if (gameConfig) {
                  setGameResult(null)
                  setGameState(createInitialGameState(gameConfig))
                  setMulliganPhase(true)
                  setMulliganCount(0)
                }
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Jugar de Nuevo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border bg-card px-3 py-1">
        <p className="text-center text-xs text-muted-foreground">
          Arrastra cartas de la mano al campo | Clic en permanente para girar | Clic en biblioteca para robar
        </p>
      </footer>
    </div>
  )
}
