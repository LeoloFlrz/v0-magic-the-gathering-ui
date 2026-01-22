"use client"

import { useState, useCallback, useEffect } from "react"
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
  const [combatMode, setCombatMode] = useState<"none" | "declaring_attackers" | "declaring_blockers">("none")
  const [selectedAttackers, setSelectedAttackers] = useState<string[]>([])
  const [selectedBlockers, setSelectedBlockers] = useState<{ blockerId: string; attackerId: string }[]>([])
  const [pendingBlocker, setPendingBlocker] = useState<string | null>(null)
  const [mulliganPhase, setMulliganPhase] = useState(true)
  const [mulliganCount, setMulliganCount] = useState(0)
  const [mulliganAnimating, setMulliganAnimating] = useState(false)
  const [cardsReturning, setCardsReturning] = useState<string[]>([])
  const [cardsDrawing, setCardsDrawing] = useState<string[]>([])

  const handleStartGame = (config: GameConfig) => {
    setGameConfig(config)
    setGameState(createInitialGameState(config))
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
      if (combatMode === "declaring_attackers" && zone === "battlefield" && owner === "player" && card.type === "creature") {
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
      if (combatMode === "declaring_blockers" && zone === "battlefield" && owner === "player" && card.type === "creature") {
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
      if (combatMode === "declaring_blockers" && pendingBlocker && zone === "battlefield" && owner === "opponent") {
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

        setGameState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            player: playCard(prev.player, card.id),
          }
        })
        addLog(`Juegas ${card.name}`)
        return
      }

      setSelectedCard({ card, zone, owner })
    },
    [gameState, addLog, counterTargetMode]
  )

  // Handle play card from drag and drop
  const handlePlayCard = useCallback(
    (cardId: string) => {
      if (!gameState) return

      const card = gameState.player.zones.hand.find((c) => c.id === cardId)
      if (!card) return

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
        setGameState((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            player: playCard(prev.player, cardId),
          }
        })
        addLog(`Juegas ${card.name}`)
      }
    },
    [gameState, addLog]
  )

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

    // Tap attacking creatures and set them as attackers
    setGameState((prev) => {
      if (!prev) return prev
      
      const attackingCreatures = selectedAttackers.map((id) => ({
        cardId: id,
        targetPlayerId: "opponent" as const,
      }))

      // Tap attacking creatures
      const newBattlefield = prev.player.zones.battlefield.map((c) =>
        selectedAttackers.includes(c.id) ? { ...c, isTapped: true } : c
      )

      return {
        ...prev,
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

    if (selectedAttackers.length > 0) {
      const attackerNames = selectedAttackers
        .map((id) => gameState.player.zones.battlefield.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ")
      addLog(`Atacas con: ${attackerNames}`)
    } else {
      addLog("No declaras atacantes")
    }

    setCombatMode("none")
    setSelectedAttackers([])
  }, [gameState, selectedAttackers, addLog])

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
  }, [gameState, selectedBlockers, addLog])

  // Cancel combat selection
  const cancelCombatSelection = useCallback(() => {
    setCombatMode("none")
    setSelectedAttackers([])
    setSelectedBlockers([])
    setPendingBlocker(null)
  }, [])

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

  // Pass turn (skip to cleanup)
  const passTurn = useCallback(() => {
    setGameState((prev) => {
      if (!prev) return prev

      const newActivePlayer = prev.activePlayer === "player" ? "opponent" : "player"
      const newTurn = newActivePlayer === "player" ? prev.turn + 1 : prev.turn
      
      const newState = {
        ...prev,
        phase: "untap",
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
  }, [gameState?.phase, gameState?.activePlayer, advancePhase])

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

    // AI is the attacker - auto advance through blockers and damage phases
    if (gameState.phase === "combat_blockers" || gameState.phase === "combat_damage") {
      const timeout = setTimeout(() => {
        advancePhase()
      }, 800)
      return () => clearTimeout(timeout)
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
            const { newState, tappedLands } = executeAIPlay({ ...prev, opponent: newOpponent }, decision)
            newOpponent = newState.opponent
            addLog(decision.message)
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
  }, [gameState, addLog, passTurn, advancePhase])

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
        
        setTimeout(() => {
          setCardsDrawing([])
          setMulliganAnimating(false)
          setMulliganCount(newMulliganCount)
        }, 800)
      }, 500)
    }, 700)
  }, [gameState, mulliganCount, mulliganAnimating])

  // Keep hand (end mulligan phase)
  const handleKeepHand = useCallback(() => {
    setMulliganPhase(false)
    addLog(`Mano inicial con ${gameState?.player.zones.hand.length || 7} cartas`)
  }, [gameState, addLog])

  // Show lobby if game hasn't started
  if (!gameStarted || !gameState) {
    return <GameLobby onStartGame={handleStartGame} />
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
            
            {/* Cards coming FROM library */}
            {cardsDrawing.map((cardId, index) => {
              const handSize = cardsDrawing.length
              // Calculate card's target position in hand
              const cardSpacing = Math.min(100, 600 / handSize)
              const targetX = (index - (handSize - 1) / 2) * cardSpacing
              const targetY = 300 // Move down to hand area
              
              return (
                <div
                  key={cardId}
                  className="absolute animate-card-from-library"
                  style={{
                    left: '50%',
                    top: '120px',
                    '--target-x': `${targetX}px`,
                    '--target-y': `${targetY}px`,
                    animationDelay: `${index * 80}ms`,
                    zIndex: 100 + index,
                  } as React.CSSProperties}
                >
                  <div className="h-52 w-36 rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900 shadow-2xl -translate-x-1/2 -translate-y-1/2" />
                </div>
              )
            })}
          </div>

          {/* Hand Display */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-wrap justify-center gap-3 p-4 rounded-xl border-2 border-primary/30 bg-primary/5">
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
              
              {mulliganAnimating && (
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
      <header className="shrink-0 border-b border-border bg-card px-4 py-2">
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

            {/* Combat Buttons */}
            {gameState.phase === "combat_attackers" && gameState.activePlayer === "player" && combatMode === "none" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={startDeclareAttackers}
                className="gap-1"
              >
                <Swords className="h-4 w-4" />
                <span className="hidden sm:inline">Atacar</span>
              </Button>
            )}

            {combatMode === "declaring_attackers" && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={confirmAttackers}
                  className="gap-1"
                >
                  <Swords className="h-4 w-4" />
                  <span className="hidden sm:inline">Confirmar ({selectedAttackers.length})</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={cancelCombatSelection}
                >
                  Cancelar
                </Button>
              </>
            )}

            {gameState.phase === "combat_blockers" && 
             gameState.opponent.attackingCreatures.length > 0 && combatMode === "none" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={startDeclareBlockers}
                className="gap-1"
              >
                <Target className="h-4 w-4" />
                <span className="hidden sm:inline">Bloquear</span>
              </Button>
            )}

            {combatMode === "declaring_blockers" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={confirmBlockers}
                  className="gap-1"
                >
                  <Target className="h-4 w-4" />
                  <span className="hidden sm:inline">Confirmar ({selectedBlockers.length})</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={cancelCombatSelection}
                >
                  Cancelar
                </Button>
              </>
            )}

            {/* Next Phase */}
            <Button
              variant="secondary"
              size="sm"
              onClick={advancePhase}
              disabled={gameState.activePlayer !== "player"}
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
              disabled={gameState.activePlayer !== "player"}
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
      <main className="flex flex-1 flex-col gap-2 p-2">
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
            </ContextMenuContent>
          )}
        </ContextMenu>
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-border bg-card px-4 py-2">
        <p className="text-center text-xs text-muted-foreground">
          Arrastra cartas de la mano al campo | Clic en permanente para girar | Clic en biblioteca para robar
        </p>
      </footer>
    </div>
  )
}
