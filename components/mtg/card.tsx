"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"
import type { Card } from "@/lib/mtg/types"
import { getCardColorClass, getCardTextColorClass } from "@/lib/mtg/game-utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface CardComponentProps {
  card: Card
  size?: "sm" | "md" | "lg"
  faceDown?: boolean
  onClick?: () => void
  onRightClick?: (e: React.MouseEvent) => void
  selected?: boolean
  className?: string
  showTooltip?: boolean
  draggable?: boolean
  onDragStart?: (e: React.DragEvent, card: Card) => void
  onDragEnd?: (e: React.DragEvent) => void
  isDrawing?: boolean
}

const sizeClasses = {
  sm: "w-12 h-16 text-[6px]",
  md: "w-20 h-28 text-[8px]",
  lg: "w-32 h-44 text-xs",
}

// Componente para renderizar símbolos de mana
function ManaSymbol({ symbol }: { symbol: string }) {
  const manaColorMap: Record<string, { bg: string; text: string; label: string }> = {
    "W": { bg: "bg-yellow-300", text: "text-yellow-800", label: "W" },
    "U": { bg: "bg-blue-400", text: "text-blue-900", label: "U" },
    "B": { bg: "bg-gray-800", text: "text-gray-300", label: "B" },
    "R": { bg: "bg-red-500", text: "text-red-900", label: "R" },
    "G": { bg: "bg-green-500", text: "text-green-900", label: "G" },
    "C": { bg: "bg-gray-400", text: "text-gray-700", label: "C" },
  }

  if (manaColorMap[symbol]) {
    const { bg, text, label } = manaColorMap[symbol]
    return (
      <div className={cn(
        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border border-black/20",
        bg,
        text
      )}>
        {label}
      </div>
    )
  }

  // Para números (mana genérico)
  if (!isNaN(Number(symbol))) {
    return (
      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-gray-600 text-white border border-gray-700">
        {symbol}
      </div>
    )
  }

  return null
}

// Parsear manaCost y devolver array de símbolos
function parseManaCost(manaCost: string): string[] {
  const symbols: string[] = []
  let i = 0
  while (i < manaCost.length) {
    if (manaCost[i] === "{") {
      const closeIdx = manaCost.indexOf("}", i)
      if (closeIdx !== -1) {
        const symbol = manaCost.substring(i + 1, closeIdx)
        symbols.push(symbol)
        i = closeIdx + 1
      } else {
        i++
      }
    } else {
      i++
    }
  }
  return symbols
}

export function CardComponent({
  card,
  size = "md",
  faceDown = false,
  onClick,
  onRightClick,
  selected = false,
  className,
  showTooltip = true,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDrawing = false,
}: CardComponentProps) {
  const [isDragging, setIsDragging] = useState(false)
  const colorClass = getCardColorClass(card)
  const textColorClass = getCardTextColorClass(card)

  // Calculate modified P/T with -1/-1 counters
  const modifiedPower =
    card.power !== undefined && card.negativeCounters
      ? card.power - card.negativeCounters
      : card.power
  const modifiedToughness =
    card.toughness !== undefined && card.negativeCounters
      ? card.toughness - card.negativeCounters
      : card.toughness

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.setData("cardId", card.id)
    e.dataTransfer.effectAllowed = "move"
    onDragStart?.(e, card)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    setIsDragging(false)
    onDragEnd?.(e)
  }

  const cardElement = (
    <div
      className={cn(
        "relative flex cursor-pointer flex-col overflow-hidden rounded-lg border-2 shadow-md transition-all",
        sizeClasses[size],
        faceDown
          ? "border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900"
          : "border-black/30",
        card.isTapped && "rotate-90",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isDragging && "scale-105 opacity-50",
        !isDragging && "hover:scale-110 hover:shadow-xl",
        isDrawing && "animate-draw-card",
        className
      )}
      onClick={onClick}
      onContextMenu={onRightClick}
      draggable={draggable && !faceDown}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {faceDown ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-purple-400/50 bg-purple-700/50" />
        </div>
      ) : (
        <>
          {/* Full Card Image */}
          <div className="relative h-full w-full overflow-hidden rounded-lg">
            {card.imageUrl ? (
              <img
                src={card.imageUrl}
                alt={card.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className={cn(
                "flex h-full w-full flex-col items-center justify-center font-bold text-white/70 text-center p-2",
                getCardColorClass(card)
              )}>
                <span className="text-[0.7em] line-clamp-3 mb-1">{card.name}</span>
                {card.manaCost && (
                  <span className="text-[0.6em] opacity-60">{card.manaCost}</span>
                )}
              </div>
            )}
            
            {/* -1/-1 counter effect overlay */}
            {card.negativeCounters && card.negativeCounters > 0 && (
              <div className="absolute inset-0 animate-pulse rounded-lg bg-gradient-to-t from-purple-900/60 via-transparent to-transparent" />
            )}
          </div>

          {/* Positive Counters (+1/+1) */}
          {card.counters && card.counters > 0 && (
            <div className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 text-[11px] font-bold text-white shadow-lg ring-2 ring-green-300 animate-pulse">
              +{card.counters}
            </div>
          )}

          {/* Negative Counters (-1/-1) */}
          {card.negativeCounters && card.negativeCounters > 0 && (
            <div className="counter-minus-effect absolute bottom-2 right-2 flex h-5 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-700 text-[8px] font-bold text-white shadow-lg ring-1 ring-purple-300 animate-pulse">
              -{card.negativeCounters}/{card.negativeCounters}
            </div>
          )}



          {/* Commander indicator */}
          {card.isCommander && (
            <div className="absolute right-1 top-6 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[8px] font-bold text-black shadow">
              C
            </div>
          )}
        </>
      )}
    </div>
  )

  if (!showTooltip || faceDown) {
    return cardElement
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{cardElement}</TooltipTrigger>
        <TooltipContent side="right" className="w-[520px] p-0 border-0">
          <div className="overflow-hidden rounded-lg bg-background border border-border shadow-2xl">
            <div className="grid grid-cols-2 gap-4 p-4">
              {/* Left: Full Card Image */}
              <div className="flex flex-col gap-3">
                <div className="rounded-lg overflow-hidden border border-border">
                  {card.imageUrl ? (
                    <img
                      src={card.imageUrl}
                      alt={card.name}
                      className="w-full h-auto object-cover"
                    />
                  ) : (
                    <div className={cn(
                      "flex h-80 w-full flex-col items-center justify-center font-bold text-white/70 text-center p-4",
                      getCardColorClass(card)
                    )}>
                      <span className="text-lg line-clamp-3 mb-2">{card.name}</span>
                      {card.manaCost && (
                        <span className="text-sm opacity-60">{card.manaCost}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Card Details */}
              <div className="flex flex-col gap-3 text-foreground max-h-96 overflow-y-auto pr-2">
                {/* Name and Mana Cost */}
                <div className="border-b border-border pb-2">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-base leading-tight">{card.name}</h3>
                    {card.manaCost && (
                      <div className="flex gap-1">
                        {parseManaCost(card.manaCost).map((symbol, idx) => (
                          <ManaSymbol key={idx} symbol={symbol} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Type Line */}
                <div className="border-b border-border pb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {card.subtype ? `${card.type.toUpperCase()} — ${card.subtype}` : card.type.toUpperCase()}
                  </p>
                </div>

                {/* Oracle Text */}
                <div className="border-b border-border pb-2">
                  <p className="text-sm leading-tight whitespace-pre-wrap font-serif">
                    {card.text || "No text."}
                  </p>
                </div>

                {/* Power/Toughness or Other Info */}
                <div className="space-y-1">
                  {card.power !== undefined && card.toughness !== undefined && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">Power/Toughness:</span>
                      <span className="font-bold text-base">
                        {modifiedPower}/{modifiedToughness}
                      </span>
                    </div>
                  )}
                  
                  {card.isLegendary && (
                    <div className="flex items-center gap-2 text-xs bg-amber-500/20 px-2 py-1 rounded border border-amber-500/30">
                      <span>⭐ Legendary</span>
                    </div>
                  )}

                  {card.isCommander && (
                    <div className="flex items-center gap-2 text-xs bg-blue-500/20 px-2 py-1 rounded border border-blue-500/30">
                      <span>👑 Commander</span>
                    </div>
                  )}

                  {card.negativeCounters && card.negativeCounters > 0 && (
                    <div className="flex items-center gap-2 text-xs bg-purple-500/20 px-2 py-1 rounded border border-purple-500/30">
                      <span>-1/-1 Counters: {card.negativeCounters}</span>
                    </div>
                  )}

                  {card.counters && card.counters > 0 && (
                    <div className="flex items-center gap-2 text-xs bg-green-500/20 px-2 py-1 rounded border border-green-500/30">
                      <span>+1/+1 Counters: {card.counters}</span>
                    </div>
                  )}
                </div>

                {/* Colors */}
                {card.colors && card.colors.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">COLORS:</p>
                    <div className="flex gap-1">
                      {card.colors.map((color) => (
                        <div
                          key={color}
                          className="w-5 h-5 rounded-full border border-foreground/30 flex items-center justify-center text-[10px] font-bold"
                          title={color}
                        >
                          {color}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* CMC */}
                {card.cmc > 0 && (
                  <div className="border-t border-border pt-2 flex items-center justify-between text-sm">
                    <span className="text-xs font-semibold text-muted-foreground">CMC:</span>
                    <span className="font-bold">{card.cmc}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Card back for library/facedown
export function CardBack({
  size = "md",
  count,
  onClick,
  className,
}: {
  size?: "sm" | "md" | "lg"
  count?: number
  onClick?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900 shadow-md transition-all hover:scale-105",
        sizeClasses[size],
        className
      )}
      onClick={onClick}
    >
      <div className="h-8 w-8 rounded-full border-2 border-purple-400/50 bg-purple-700/50" />
      {count !== undefined && (
        <span className="mt-1 font-mono text-sm font-bold text-purple-200">{count}</span>
      )}
    </div>
  )
}

// Animated drawing card
export function DrawingCard({ onAnimationEnd }: { onAnimationEnd?: () => void }) {
  return (
    <div
      className="absolute left-0 top-0 z-50 h-28 w-20 animate-draw-card rounded-lg border-2 border-purple-900 bg-gradient-to-br from-purple-800 to-purple-900 shadow-xl"
      onAnimationEnd={onAnimationEnd}
    >
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-purple-400/50 bg-purple-700/50" />
      </div>
    </div>
  )
}
