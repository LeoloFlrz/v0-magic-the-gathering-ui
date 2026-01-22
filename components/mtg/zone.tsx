"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"
import type { Card } from "@/lib/mtg/types"
import { CardComponent, CardBack } from "./card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

interface ZoneProps {
  title: string
  cards: Card[]
  faceDown?: boolean
  stacked?: boolean
  onCardClick?: (card: Card) => void
  onCardRightClick?: (card: Card, e: React.MouseEvent) => void
  onZoneClick?: () => void
  onDrop?: (cardId: string) => void
  selectedCardId?: string | null
  className?: string
  cardSize?: "sm" | "md" | "lg"
  emptyText?: string
  showCount?: boolean
  horizontal?: boolean
  draggableCards?: boolean
  onCardDragStart?: (e: React.DragEvent, card: Card) => void
  onCardDragEnd?: (e: React.DragEvent) => void
  drawingCardId?: string | null
  canPlayCard?: (card: Card) => boolean
}

export function Zone({
  title,
  cards,
  faceDown = false,
  stacked = false,
  onCardClick,
  onCardRightClick,
  onZoneClick,
  onDrop,
  selectedCardId,
  className,
  cardSize = "md",
  emptyText = "Vacio",
  showCount = true,
  horizontal = true,
  draggableCards = false,
  onCardDragStart,
  onCardDragEnd,
  drawingCardId,
  canPlayCard,
}: ZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const isEmpty = cards.length === 0

  const handleDragOver = (e: React.DragEvent) => {
    if (onDrop) {
      e.preventDefault()
      setIsDragOver(true)
    }
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const cardId = e.dataTransfer.getData("cardId")
    if (cardId && onDrop) {
      onDrop(cardId)
    }
  }

  if (stacked) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg border border-border/50 bg-secondary/30 p-2 transition-all",
          isDragOver && "border-primary bg-primary/20",
          className
        )}
        onClick={onZoneClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="text-xs font-medium text-muted-foreground">
          {title} {showCount && `(${cards.length})`}
        </span>
        {isEmpty ? (
          <div
            className={cn(
              "flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 transition-colors",
              cardSize === "sm" ? "h-16 w-12" : cardSize === "md" ? "h-28 w-20" : "h-44 w-32",
              isDragOver && "border-primary bg-primary/10"
            )}
          >
            <span className="text-[10px] text-muted-foreground">{emptyText}</span>
          </div>
        ) : faceDown ? (
          <CardBack size={cardSize} count={cards.length} onClick={onZoneClick} />
        ) : (
          <CardComponent
            card={cards[cards.length - 1]}
            size={cardSize}
            onClick={() => onCardClick?.(cards[cards.length - 1])}
            onRightClick={(e) => onCardRightClick?.(cards[cards.length - 1], e)}
            selected={selectedCardId === cards[cards.length - 1].id}
            draggable={draggableCards}
            onDragStart={onCardDragStart}
            onDragEnd={onCardDragEnd}
          />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border border-border/50 bg-secondary/30 p-2 transition-all",
        isDragOver && "border-primary bg-primary/20",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <span className="text-xs font-medium text-muted-foreground">
        {title} {showCount && `(${cards.length})`}
      </span>
      {isEmpty ? (
        <div
          className={cn(
            "flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 transition-colors",
            isDragOver && "border-primary bg-primary/10"
          )}
        >
          <span className="text-xs text-muted-foreground">
            {isDragOver ? "Soltar aqui" : emptyText}
          </span>
        </div>
      ) : horizontal ? (
        <ScrollArea className="w-full">
          <div className="flex gap-2 pt-2 pb-2">
            {cards.map((card) => (
              <CardComponent
                key={card.id}
                card={card}
                size={cardSize}
                faceDown={faceDown}
                onClick={() => onCardClick?.(card)}
                onRightClick={(e) => onCardRightClick?.(card, e)}
                selected={selectedCardId === card.id}
                draggable={draggableCards && !faceDown}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
                isDrawing={drawingCardId === card.id}
                canPlay={canPlayCard?.(card)}
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : (
        <div className="flex flex-wrap gap-1">
          {cards.map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              size={cardSize}
              faceDown={faceDown}
              onClick={() => onCardClick?.(card)}
              onRightClick={(e) => onCardRightClick?.(card, e)}
              selected={selectedCardId === card.id}
              draggable={draggableCards && !faceDown}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              isDrawing={drawingCardId === card.id}
              canPlay={canPlayCard?.(card)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Specialized battlefield zone with land/non-land separation
interface BattlefieldProps {
  cards: Card[]
  onCardClick?: (card: Card) => void
  onCardRightClick?: (card: Card, e: React.MouseEvent) => void
  onDrop?: (cardId: string, isLandArea?: boolean) => void
  selectedCardId?: string | null
  className?: string
  isOpponent?: boolean
  onCardDragStart?: (e: React.DragEvent, card: Card) => void
  onCardDragEnd?: (e: React.DragEvent) => void
}

export function Battlefield({
  cards,
  onCardClick,
  onCardRightClick,
  onDrop,
  selectedCardId,
  className,
  isOpponent = false,
  onCardDragStart,
  onCardDragEnd,
}: BattlefieldProps) {
  const [isDragOverLands, setIsDragOverLands] = useState(false)
  const [isDragOverCreatures, setIsDragOverCreatures] = useState(false)

  const lands = cards.filter((c) => c.type === "land")
  const creatures = cards.filter((c) => c.type === "creature")
  const otherPermanents = cards.filter((c) => c.type !== "land" && c.type !== "creature")

  const handleDragOver = (e: React.DragEvent, isLandArea: boolean) => {
    if (onDrop && !isOpponent) {
      e.preventDefault()
      if (isLandArea) {
        setIsDragOverLands(true)
      } else {
        setIsDragOverCreatures(true)
      }
    }
  }

  const handleDragLeave = (isLandArea: boolean) => {
    if (isLandArea) {
      setIsDragOverLands(false)
    } else {
      setIsDragOverCreatures(false)
    }
  }

  const handleDrop = (e: React.DragEvent, isLandArea: boolean) => {
    e.preventDefault()
    setIsDragOverLands(false)
    setIsDragOverCreatures(false)
    const cardId = e.dataTransfer.getData("cardId")
    if (cardId && onDrop) {
      onDrop(cardId, isLandArea)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-2 rounded-lg border border-border/50 bg-secondary/20 p-2",
        isOpponent && "flex-col-reverse",
        className
      )}
    >
      {/* Lands row */}
      <div
        className={cn(
          "flex min-h-[4.5rem] flex-wrap items-start gap-1 rounded-lg p-1 transition-all",
          isDragOverLands && "bg-primary/20 ring-2 ring-primary"
        )}
        onDragOver={(e) => handleDragOver(e, true)}
        onDragLeave={() => handleDragLeave(true)}
        onDrop={(e) => handleDrop(e, true)}
      >
        {lands.length === 0 ? (
          <span className={cn(
            "text-xs transition-colors",
            isDragOverLands ? "text-primary" : "text-muted-foreground/50"
          )}>
            {isDragOverLands ? "Soltar tierra aqui" : "Tierras"}
          </span>
        ) : (
          lands.map((card) => (
            <CardComponent
              key={card.id}
              card={card}
              size="sm"
              onClick={() => onCardClick?.(card)}
              onRightClick={(e) => onCardRightClick?.(card, e)}
              selected={selectedCardId === card.id}
              draggable={!isOpponent}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-border/30" />

      {/* Creatures and other permanents */}
      <div
        className={cn(
          "flex min-h-[6rem] flex-wrap items-start gap-2 rounded-lg p-1 transition-all",
          isDragOverCreatures && "bg-primary/20 ring-2 ring-primary"
        )}
        onDragOver={(e) => handleDragOver(e, false)}
        onDragLeave={() => handleDragLeave(false)}
        onDrop={(e) => handleDrop(e, false)}
      >
        {creatures.length === 0 && otherPermanents.length === 0 ? (
          <span className={cn(
            "text-xs transition-colors",
            isDragOverCreatures ? "text-primary" : "text-muted-foreground/50"
          )}>
            {isDragOverCreatures ? "Soltar permanente aqui" : "Campo de batalla"}
          </span>
        ) : (
          <>
            {creatures.map((card) => (
              <CardComponent
                key={card.id}
                card={card}
                size="md"
                onClick={() => onCardClick?.(card)}
                onRightClick={(e) => onCardRightClick?.(card, e)}
                selected={selectedCardId === card.id}
                draggable={!isOpponent}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
              />
            ))}
            {otherPermanents.map((card) => (
              <CardComponent
                key={card.id}
                card={card}
                size="md"
                onClick={() => onCardClick?.(card)}
                onRightClick={(e) => onCardRightClick?.(card, e)}
                selected={selectedCardId === card.id}
                draggable={!isOpponent}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
