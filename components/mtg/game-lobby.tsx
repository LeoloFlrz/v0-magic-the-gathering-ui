"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Users, Heart, Sparkles, Skull, Swords } from "lucide-react"
import type { GameConfig } from "@/lib/mtg/types"

interface GameLobbyProps {
  onStartGame: (config: GameConfig) => void
}

export function GameLobby({ onStartGame }: GameLobbyProps) {
  const [playerName, setPlayerName] = useState("Jugador")
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
  const [startingLife, setStartingLife] = useState<20 | 30 | 40>(40)

  const handleStart = () => {
    onStartGame({
      playerCount,
      startingLife,
      playerName,
      deckType: "blight_curse",
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/25">
            <Swords className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            MTG Commander
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configura tu partida contra la IA
          </p>
        </div>

        {/* Config Form */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
          {/* Player Name */}
          <div className="space-y-2">
            <Label htmlFor="player-name">Tu nombre</Label>
            <Input
              id="player-name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Introduce tu nombre"
              className="bg-background"
            />
          </div>

          {/* Deck Selection */}
          <div className="mt-6 space-y-2">
            <Label>Tu mazo</Label>
            <div className="rounded-xl border-2 border-primary bg-primary/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-gray-800 to-green-900">
                  <Skull className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Blight Curse</p>
                  <p className="text-sm text-muted-foreground">
                    Hapatra - Contadores -1/-1 e Infect
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Player Count */}
          <div className="mt-6 space-y-3">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Numero de jugadores
            </Label>
            <RadioGroup
              value={playerCount.toString()}
              onValueChange={(v) => setPlayerCount(Number(v) as 2 | 3 | 4)}
              className="grid grid-cols-3 gap-3"
            >
              {[2, 3, 4].map((count) => (
                <Label
                  key={count}
                  htmlFor={`players-${count}`}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    playerCount === count
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem
                    value={count.toString()}
                    id={`players-${count}`}
                    className="sr-only"
                  />
                  <span className="text-2xl font-bold">{count}</span>
                  <span className="text-xs text-muted-foreground">
                    {count === 2 ? "1v1" : count === 3 ? "Free for all" : "Commander"}
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {/* Starting Life */}
          <div className="mt-6 space-y-3">
            <Label className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Vida inicial
            </Label>
            <RadioGroup
              value={startingLife.toString()}
              onValueChange={(v) => setStartingLife(Number(v) as 20 | 30 | 40)}
              className="grid grid-cols-3 gap-3"
            >
              {[
                { value: 20, label: "Standard" },
                { value: 30, label: "Brawl" },
                { value: 40, label: "Commander" },
              ].map((option) => (
                <Label
                  key={option.value}
                  htmlFor={`life-${option.value}`}
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    startingLife === option.value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <RadioGroupItem
                    value={option.value.toString()}
                    id={`life-${option.value}`}
                    className="sr-only"
                  />
                  <span className="text-2xl font-bold">{option.value}</span>
                  <span className="text-xs text-muted-foreground">{option.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          {/* AI Opponents Info */}
          <div className="mt-6 rounded-xl border border-border/50 bg-secondary/30 p-4">
            <p className="mb-2 text-sm font-medium text-foreground">Oponentes IA:</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span>Krenko Goblins (Aggro)</span>
              </div>
              {playerCount >= 3 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <span>Talrand Control (Counterspells)</span>
                </div>
              )}
              {playerCount >= 4 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span>Atraxa Counters (Proliferate)</span>
                </div>
              )}
            </div>
          </div>

          {/* Start Button */}
          <Button
            onClick={handleStart}
            className="mt-6 h-14 w-full gap-2 text-lg"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            Comenzar Partida
          </Button>
        </div>

        {/* Instructions */}
        <p className="text-center text-sm text-muted-foreground">
          Arrastra cartas de tu mano al campo de batalla para jugarlas
        </p>
      </div>
    </div>
  )
}
