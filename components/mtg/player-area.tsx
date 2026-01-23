"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"
import type { Player, Card, GameZone } from "@/lib/mtg/types"
import { Zone, Battlefield } from "./zone"
import { CardComponent } from "./card"
import { Button } from "@/components/ui/button"
import { Minus, Plus, Skull, Droplets, Crown } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface PlayerAreaProps {
  player: Player
  isOpponent?: boolean
  isActive?: boolean
  onLifeChange?: (amount: number) => void
  onCardClick?: (card: Card, zone: keyof GameZone) => void
  onCardRightClick?: (card: Card, zone: keyof GameZone) => void
  onCardAction?: (card: Card, zone: keyof GameZone, action: string) => void
  onDrawCard?: () => void
  onCastCommander?: () => void
  onPlayCard?: (cardId: string) => void
  selectedCardId?: string | null
  className?: string
  drawingCardId?: string | null
  canPlayCard?: (card: Card) => boolean
  attackingCreatureIds?: string[]
  blockingCreatureIds?: string[]
  selectedForCombatIds?: string[]
}

export function PlayerArea({
  player,
  isOpponent = false,
  isActive = false,
  onLifeChange,
  onCardClick,
  onCardRightClick,
  onCardAction,
  onDrawCard,
  onCastCommander,
  onPlayCard,
  selectedCardId,
  className,
  drawingCardId,
  canPlayCard,
  attackingCreatureIds = [],
  blockingCreatureIds = [],
  selectedForCombatIds = [],
}: PlayerAreaProps) {
  const [draggedCard, setDraggedCard] = useState<Card | null>(null)

  const isLethal =
    player.life <= 0 ||
    player.commanderDamageReceived >= 21 ||
    player.poisonCounters >= 10

  const handleCardRightClick = (card: Card, zone: keyof GameZone, e: React.MouseEvent) => {
    // Don't preventDefault - let the ContextMenu from Radix handle the event
    onCardRightClick?.(card, zone)
  }

  const handleCardDragStart = (e: React.DragEvent, card: Card) => {
    setDraggedCard(card)
  }

  const handleCardDragEnd = () => {
    setDraggedCard(null)
  }

  const handleBattlefieldDrop = (cardId: string) => {
    if (onPlayCard) {
      onPlayCard(cardId)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border-2 p-2 transition-all min-h-0",
        isActive ? "border-primary bg-primary/5" : "border-border bg-card/50",
        isLethal && "opacity-60",
        className
      )}
    >
      {/* Player Info Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-foreground">{player.name}</span>
          {isActive && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
              Turno Activo
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          {/* Poison */}
          {player.poisonCounters > 0 && (
            <div className="flex items-center gap-1 text-green-400">
              <Droplets className="h-4 w-4" />
              <span className="font-mono text-sm">{player.poisonCounters}</span>
            </div>
          )}

          {/* Commander Damage */}
          {player.commanderDamageReceived > 0 && (
            <div className="flex items-center gap-1 text-amber-400">
              <Skull className="h-4 w-4" />
              <span className="font-mono text-sm">{player.commanderDamageReceived}/21</span>
            </div>
          )}

          {/* Life Counter */}
          <div className="flex items-center gap-2">
            {!isOpponent && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onLifeChange?.(-1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
            )}
            <span
              className={cn(
                "min-w-[3ch] text-center font-mono text-2xl font-bold tabular-nums",
                player.life <= 10 && player.life > 0 && "text-yellow-500",
                player.life <= 0 && "text-destructive"
              )}
            >
              {player.life}
            </span>
            {!isOpponent && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onLifeChange?.(1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Mana Pool */}
          {!isOpponent && (
            <div className="flex items-center gap-1 rounded-lg bg-secondary/50 px-2 py-1">
              {Object.entries(player.mana).map(([color, amount]) => {
                const colorMap: { [key: string]: { bg: string; text: string } } = {
                  "W": { bg: "bg-yellow-300", text: "text-yellow-800" },
                  "U": { bg: "bg-blue-400", text: "text-blue-900" },
                  "B": { bg: "bg-gray-800", text: "text-gray-300" },
                  "R": { bg: "bg-red-500", text: "text-red-900" },
                  "G": { bg: "bg-green-500", text: "text-green-900" },
                  "C": { bg: "bg-gray-400", text: "text-gray-700" },
                }
                
                const colorInfo = colorMap[color]
                if (!colorInfo) return null
                
                return (
                  <div key={color} className="flex items-center gap-0.5">
                    {amount > 0 && (
                      <div
                        className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold border border-black/20",
                          colorInfo.bg,
                          colorInfo.text
                        )}
                      >
                        {color}
                      </div>
                    )}
                    {amount > 1 && (
                      <span className="text-[10px] font-bold text-foreground">x{amount}</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Game Area - Horizontal layout with side zones on the right */}
      <div className="flex gap-2 flex-1 min-h-0">
        {/* Left side: Battlefield + Hand */}
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOpponent ? "flex-col-reverse" : "flex-col")}>
          {/* Battlefield */}
          <Battlefield
            cards={player.zones.battlefield}
            onCardClick={(card) => onCardClick?.(card, "battlefield")}
            onCardRightClick={(card, e) => handleCardRightClick(card, "battlefield", e)}
            onDrop={!isOpponent ? handleBattlefieldDrop : undefined}
            selectedCardId={selectedCardId}
            isOpponent={isOpponent}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
            attackingCreatureIds={attackingCreatureIds}
            blockingCreatureIds={blockingCreatureIds}
            selectedForCombatIds={selectedForCombatIds}
          />

          {/* Hand - only visible for player */}
          {!isOpponent && (
            <Zone
              title="Mano"
              cards={player.zones.hand}
              cardSize="md"
              onCardClick={(card) => onCardClick?.(card, "hand")}
              selectedCardId={selectedCardId}
              emptyText="Sin cartas en mano"
              className="bg-secondary/40 shrink-0"
              draggableCards
              onCardDragStart={handleCardDragStart}
              onCardDragEnd={handleCardDragEnd}
              drawingCardId={drawingCardId}
              canPlayCard={canPlayCard}
            />
          )}

          {/* Opponent's hand (face down) */}
          {isOpponent && (
            <div className="flex items-center gap-1 rounded-lg border border-border/50 bg-secondary/30 p-1 shrink-0">
              <span className="mr-2 text-xs font-medium text-muted-foreground">
                Mano ({player.zones.hand.length})
              </span>
              <div className="flex gap-0.5">
                {player.zones.hand.slice(0, 7).map((card) => (
                  <div
                    key={card.id}
                    className="h-8 w-6 rounded border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900"
                  />
                ))}
                {player.zones.hand.length > 7 && (
                  <span className="flex items-center text-xs text-muted-foreground">
                    +{player.zones.hand.length - 7}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right side: Library, Graveyard, Exile, Command Zone */}
        <div className="flex flex-col gap-1 shrink-0">
          {/* Library */}
          <Zone
            title="Biblioteca"
            cards={player.zones.library}
            faceDown
            stacked
            cardSize="sm"
            onZoneClick={!isOpponent ? onDrawCard : undefined}
            emptyText="Sin cartas"
          />

          {/* Graveyard */}
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div>
                <Zone
                  title="Cementerio"
                  cards={player.zones.graveyard}
                  stacked
                  cardSize="sm"
                  onCardClick={(card) => onCardClick?.(card, "graveyard")}
                  selectedCardId={selectedCardId}
                  emptyText="Vacio"
                />
              </div>
            </ContextMenuTrigger>
            {player.zones.graveyard.length > 0 && (
              <ContextMenuContent>
                <div className="max-h-64 overflow-y-auto p-2">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">
                    Cementerio ({player.zones.graveyard.length})
                  </span>
                  {player.zones.graveyard.map((card) => (
                    <ContextMenuItem
                      key={card.id}
                      onClick={() => onCardClick?.(card, "graveyard")}
                    >
                      {card.name}
                    </ContextMenuItem>
                  ))}
                </div>
              </ContextMenuContent>
            )}
          </ContextMenu>

          {/* Exile */}
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div>
                <Zone
                  title="Exilio"
                  cards={player.zones.exile}
                  stacked
                  cardSize="sm"
                  onCardClick={(card) => onCardClick?.(card, "exile")}
                  selectedCardId={selectedCardId}
                  emptyText="Vacio"
                />
              </div>
            </ContextMenuTrigger>
            {player.zones.exile.length > 0 && (
              <ContextMenuContent>
                <div className="max-h-64 overflow-y-auto p-2">
                  <span className="mb-2 block text-xs font-semibold text-muted-foreground">
                    Exilio ({player.zones.exile.length})
                  </span>
                  {player.zones.exile.map((card) => (
                    <ContextMenuItem
                      key={card.id}
                      onClick={() => onCardClick?.(card, "exile")}
                    >
                      {card.name}
                    </ContextMenuItem>
                  ))}
                </div>
              </ContextMenuContent>
            )}
          </ContextMenu>

          {/* Command Zone */}
          <div className="flex flex-col items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-1">
            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400">
              <Crown className="h-3 w-3" />
              Cmdr
            </span>
            {player.zones.commandZone.length > 0 ? (
              <div
                className="cursor-pointer transition-transform hover:scale-105"
                onClick={!isOpponent ? onCastCommander : undefined}
              >
                <CardComponent
                  card={player.zones.commandZone[0]}
                  size="sm"
                  faceDown={isOpponent}
                />
              </div>
            ) : (
              <div className="flex h-[50px] w-10 items-center justify-center rounded-lg border-2 border-dashed border-amber-500/30">
                <span className="text-[7px] text-amber-400/50">En juego</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
