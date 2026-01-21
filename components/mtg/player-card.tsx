"use client"

import { useState } from "react"
import { Minus, Plus, Skull, RotateCcw, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface CommanderDamage {
  [playerId: number]: number
}

interface PlayerCardProps {
  playerId: number
  playerName: string
  initialLife?: number
  totalPlayers: number
  onLifeChange?: (life: number) => void
  onCommanderDamageChange?: (fromPlayer: number, damage: number) => void
  commanderDamageReceived?: CommanderDamage
  isEliminated?: boolean
  className?: string
}

const playerColors = {
  1: "border-player-1 bg-player-1/10",
  2: "border-player-2 bg-player-2/10",
  3: "border-player-3 bg-player-3/10",
  4: "border-player-4 bg-player-4/10",
} as const

const playerAccentColors = {
  1: "bg-player-1 text-background",
  2: "bg-player-2 text-background",
  3: "bg-player-3 text-background",
  4: "bg-player-4 text-background",
} as const

export function PlayerCard({
  playerId,
  playerName,
  initialLife = 40,
  totalPlayers,
  onLifeChange,
  onCommanderDamageChange,
  commanderDamageReceived = {},
  isEliminated = false,
  className,
}: PlayerCardProps) {
  const [life, setLife] = useState(initialLife)
  const [showCommanderDamage, setShowCommanderDamage] = useState(false)
  const [localCommanderDamage, setLocalCommanderDamage] = useState<CommanderDamage>(
    commanderDamageReceived
  )

  const handleLifeChange = (amount: number) => {
    const newLife = life + amount
    setLife(newLife)
    onLifeChange?.(newLife)
  }

  const handleCommanderDamage = (fromPlayer: number, amount: number) => {
    const currentDamage = localCommanderDamage[fromPlayer] || 0
    const newDamage = Math.max(0, currentDamage + amount)
    setLocalCommanderDamage((prev) => ({ ...prev, [fromPlayer]: newDamage }))
    onCommanderDamageChange?.(fromPlayer, newDamage)

    // Commander damage also reduces life
    if (amount > 0) {
      handleLifeChange(-amount)
    }
  }

  const resetPlayer = () => {
    setLife(initialLife)
    setLocalCommanderDamage({})
    onLifeChange?.(initialLife)
  }

  const totalCommanderDamage = Object.values(localCommanderDamage).reduce(
    (sum, dmg) => sum + dmg,
    0
  )

  const isLethal = life <= 0 || Object.values(localCommanderDamage).some((dmg) => dmg >= 21)

  const colorIndex = playerId as 1 | 2 | 3 | 4

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border-2 p-4 transition-all",
        playerColors[colorIndex],
        isLethal && "opacity-60",
        isEliminated && "grayscale",
        className
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
              playerAccentColors[colorIndex]
            )}
          >
            {playerId}
          </div>
          <span className="font-semibold text-foreground">{playerName}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={resetPlayer}
        >
          <RotateCcw className="h-4 w-4" />
          <span className="sr-only">Reiniciar jugador</span>
        </Button>
      </div>

      {/* Life Counter */}
      <div className="mb-4 flex flex-1 items-center justify-center gap-4">
        <Button
          variant="secondary"
          size="icon"
          className="h-14 w-14 rounded-full text-xl"
          onClick={() => handleLifeChange(-1)}
          onContextMenu={(e) => {
            e.preventDefault()
            handleLifeChange(-5)
          }}
        >
          <Minus className="h-6 w-6" />
          <span className="sr-only">Restar vida</span>
        </Button>

        <div className="flex flex-col items-center">
          <span
            className={cn(
              "font-mono text-6xl font-bold tabular-nums transition-colors",
              life <= 10 && life > 0 && "text-yellow-500",
              life <= 0 && "text-destructive"
            )}
          >
            {life}
          </span>
          <span className="text-xs text-muted-foreground">Vida</span>
        </div>

        <Button
          variant="secondary"
          size="icon"
          className="h-14 w-14 rounded-full text-xl"
          onClick={() => handleLifeChange(1)}
          onContextMenu={(e) => {
            e.preventDefault()
            handleLifeChange(5)
          }}
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">Sumar vida</span>
        </Button>
      </div>

      {/* Lethal indicator */}
      {isLethal && (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-destructive/20 py-2 text-destructive">
          <Skull className="h-4 w-4" />
          <span className="text-sm font-medium">Daño letal</span>
        </div>
      )}

      {/* Commander Damage Toggle */}
      <button
        type="button"
        className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        onClick={() => setShowCommanderDamage(!showCommanderDamage)}
      >
        <span className="flex items-center gap-2">
          <Skull className="h-4 w-4" />
          Daño de Comandante
          {totalCommanderDamage > 0 && (
            <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
              {totalCommanderDamage}
            </span>
          )}
        </span>
        {showCommanderDamage ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {/* Commander Damage Trackers */}
      {showCommanderDamage && (
        <div className="mt-3 grid gap-2">
          {Array.from({ length: totalPlayers }, (_, i) => i + 1)
            .filter((id) => id !== playerId)
            .map((fromPlayerId) => {
              const damage = localCommanderDamage[fromPlayerId] || 0
              const isLethalCommander = damage >= 21

              return (
                <div
                  key={fromPlayerId}
                  className={cn(
                    "flex items-center justify-between rounded-lg bg-background/50 px-3 py-2",
                    isLethalCommander && "bg-destructive/20"
                  )}
                >
                  <span className="text-sm text-muted-foreground">
                    Cmdr. J{fromPlayerId}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleCommanderDamage(fromPlayerId, -1)}
                    >
                      <Minus className="h-3 w-3" />
                      <span className="sr-only">Restar daño comandante</span>
                    </Button>
                    <span
                      className={cn(
                        "w-8 text-center font-mono text-lg font-semibold tabular-nums",
                        isLethalCommander && "text-destructive"
                      )}
                    >
                      {damage}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleCommanderDamage(fromPlayerId, 1)}
                    >
                      <Plus className="h-3 w-3" />
                      <span className="sr-only">Sumar daño comandante</span>
                    </Button>
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}
