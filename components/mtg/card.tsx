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
          : `border-black/30 bg-gradient-to-b ${colorClass}`,
        card.isTapped && "rotate-90",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isDragging && "scale-105 opacity-50",
        !isDragging && "hover:scale-105 hover:shadow-lg",
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
          {/* Card Header */}
          <div className={cn("flex items-start justify-between p-1", textColorClass)}>
            <span className="truncate font-semibold leading-tight">{card.name}</span>
            {card.manaCost && (
              <span className="ml-1 shrink-0 font-mono text-[0.6em] opacity-80">
                {card.manaCost}
              </span>
            )}
          </div>

          {/* Card Art Area */}
          <div className="relative mx-1 flex-1 rounded-sm bg-black/20">
            {/* -1/-1 counter effect overlay */}
            {card.negativeCounters && card.negativeCounters > 0 && (
              <div className="absolute inset-0 animate-pulse rounded-sm bg-gradient-to-t from-purple-900/60 via-transparent to-transparent" />
            )}
          </div>

          {/* Card Type */}
          <div className={cn("px-1 py-0.5 text-center opacity-80", textColorClass)}>
            <span className="truncate capitalize">
              {card.subtype ? `${card.type} - ${card.subtype}` : card.type}
            </span>
          </div>

          {/* Card Text */}
          {size !== "sm" && (
            <div
              className={cn(
                "mx-1 mb-1 max-h-12 overflow-hidden rounded-sm bg-black/10 p-1 leading-tight",
                textColorClass
              )}
            >
              <p className="line-clamp-3 opacity-90">{card.text}</p>
            </div>
          )}

          {/* Power/Toughness */}
          {card.power !== undefined && card.toughness !== undefined && (
            <div
              className={cn(
                "absolute bottom-1 right-1 rounded-sm px-1.5 py-0.5 font-bold",
                textColorClass,
                card.negativeCounters && card.negativeCounters > 0
                  ? "bg-purple-600/80 text-white"
                  : "bg-black/30"
              )}
            >
              {modifiedPower}/{modifiedToughness}
            </div>
          )}

          {/* Positive Counters (+1/+1) */}
          {card.counters && card.counters > 0 && (
            <div className="absolute left-1 top-6 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white shadow">
              +{card.counters}
            </div>
          )}

          {/* Negative Counters (-1/-1) */}
          {card.negativeCounters && card.negativeCounters > 0 && (
            <div className="counter-minus-effect absolute left-1 top-6 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-purple-800 text-[10px] font-bold text-white shadow-lg ring-2 ring-purple-400/50">
              -{card.negativeCounters}
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
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{cardElement}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold">{card.name}</span>
              {card.manaCost && (
                <span className="font-mono text-muted-foreground">{card.manaCost}</span>
              )}
            </div>
            <p className="text-xs capitalize text-muted-foreground">
              {card.subtype ? `${card.type} - ${card.subtype}` : card.type}
            </p>
            <p className="text-sm">{card.text}</p>
            {card.power !== undefined && card.toughness !== undefined && (
              <p className="text-right font-bold">
                {modifiedPower}/{modifiedToughness}
                {card.negativeCounters && card.negativeCounters > 0 && (
                  <span className="ml-2 text-purple-400">
                    ({card.negativeCounters} contador{card.negativeCounters > 1 ? "es" : ""} -1/-1)
                  </span>
                )}
              </p>
            )}
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
