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
} from "@/lib/mtg/game-utils"
import {
  makeMainPhaseDecision,
  makeCombatDecision,
  makeBlockDecision,
  executeAIPlay,
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

  // Advance to next phase
  const advancePhase = useCallback(() => {
    if (!gameState) return

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

      return newState
    })
  }, [gameState, addLog])

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

  // Advanced AI logic
  useEffect(() => {
    if (!gameState || gameState.activePlayer !== "opponent") return

    setAiThinking(true)
    const timeout = setTimeout(() => {
      setGameState((prev) => {
        if (!prev) return prev

        let newOpponent = prev.opponent
        let gameLog: string[] = []

        // Main phase - play cards
        if (prev.phase === "main1" || prev.phase === "main2") {
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
        }

        // Combat phase - attack
        if (prev.phase === "combat_attackers") {
          const { attackers, message } = makeCombatDecision(prev, newOpponent, prev.player)
          if (attackers.length > 0) {
            // Set attacking creatures
            newOpponent = {
              ...newOpponent,
              attackingCreatures: attackers.map((a) => ({
                cardId: a.id,
                targetPlayerId: "player" as const,
              })),
            }
            addLog(message)
          } else {
            addLog(message)
          }
        }

        return { ...prev, opponent: newOpponent }
      })

      // AI passes after action
      setTimeout(() => {
        passTurn()
        setAiThinking(false)
      }, 1500)
    }, 1500)

    return () => clearTimeout(timeout)
  }, [gameState, addLog, passTurn])

  // AI blocking logic
  useEffect(() => {
    if (!gameState || gameState.activePlayer !== "player" || gameState.phase !== "combat_blockers") return
    
    // Check if opponent has attacking creatures
    const attackingCreatures = gameState.opponent.attackingCreatures
    if (attackingCreatures.length === 0) return

    const attackerCards = gameState.opponent.zones.battlefield.filter((c) =>
      attackingCreatures.some((a) => a.cardId === c.id)
    )

    if (attackerCards.length === 0) return

    setAiThinking(true)
    const timeout = setTimeout(() => {
      setGameState((prev) => {
        if (!prev) return prev

        const { blocks, message } = makeBlockDecision(
          attackerCards,
          prev.player,
          prev.opponent
        )

        // Update blocking creatures
        let newPlayer = { ...prev.player }
        for (const { blocker, attacker } of blocks) {
          newPlayer = {
            ...newPlayer,
            blockingCreatures: [
              ...newPlayer.blockingCreatures,
              {
                blockerId: blocker.id,
                attackerId: attacker.id,
              },
            ],
          }
        }

        addLog(message)
        return { ...prev, player: newPlayer }
      })

      setAiThinking(false)
    }, 1000)

    return () => clearTimeout(timeout)
  }, [gameState, addLog])

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
  }

  // Show lobby if game hasn't started
  if (!gameStarted || !gameState) {
    return <GameLobby onStartGame={handleStartGame} />
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
