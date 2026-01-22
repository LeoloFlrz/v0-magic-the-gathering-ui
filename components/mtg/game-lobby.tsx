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
import { Users, Heart, Sparkles, Skull, Swords, Upload, Loader2 } from "lucide-react"
import type { GameConfig, Card } from "@/lib/mtg/types"
import { parseDeckText, deckFormatToCards, PRESET_DECKS } from "@/lib/mtg/deck-service"
import { blightCurseDeck } from "@/lib/mtg/sample-deck"

interface GameLobbyProps {
  onStartGame: (config: GameConfig) => void
}

export function GameLobby({ onStartGame }: GameLobbyProps) {
  const [playerName, setPlayerName] = useState("Jugador")
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
  const [startingLife, setStartingLife] = useState<20 | 30 | 40>(40)
  const [playerDeck, setPlayerDeck] = useState<Card[]>(blightCurseDeck)
  const [playerDeckName, setPlayerDeckName] = useState("Blight Curse")
  const [deckText, setDeckText] = useState("")
  const [isLoadingDeck, setIsLoadingDeck] = useState(false)
  const [selectedAIDeck, setSelectedAIDeck] = useState<"krenko_goblins" | "hapatra_counters">("krenko_goblins")

  const handleDeckTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDeckText(e.target.value)
  }

  const loadDeckFromText = async () => {
    if (!deckText.trim()) return
    
    setIsLoadingDeck(true)
    try {
      const deckFormat = parseDeckText(deckText)
      const cards = await deckFormatToCards(deckFormat)
      
      if (cards.length > 0) {
        setPlayerDeck(cards)
        setPlayerDeckName(deckFormat.name)
        setDeckText("") // Limpiar textarea
      } else {
        alert("No se pudieron cargar las cartas del mazo. Verifica los nombres.")
      }
    } catch (error) {
      console.error("Error loading deck:", error)
      alert("Error al cargar el mazo")
    } finally {
      setIsLoadingDeck(false)
    }
  }

  const loadPresetDeck = (deckKey: keyof typeof PRESET_DECKS) => {
    setIsLoadingDeck(true)
    const deckFormat = PRESET_DECKS[deckKey]
    deckFormatToCards(deckFormat).then((cards) => {
      setPlayerDeck(cards)
      setPlayerDeckName(deckFormat.name)
      setIsLoadingDeck(false)
    })
  }

  const handleStart = () => {
    onStartGame({
      playerCount,
      startingLife,
      playerName,
      playerDeck,
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl space-y-8">
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
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xl space-y-6">
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
          <div className="space-y-3">
            <Label>Tu mazo ({playerDeck.length} cartas)</Label>
            
            {/* Current Deck Display */}
            <div className="rounded-xl border-2 border-primary bg-primary/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-gray-800 to-green-900">
                  <Skull className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{playerDeckName}</p>
                  <p className="text-sm text-muted-foreground">
                    {playerDeck.length} cartas cargadas
                  </p>
                </div>
              </div>
            </div>

            {/* Deck Loading Options */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Cargar otro mazo:</Label>
              
              {/* Preset Decks */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadPresetDeck("krenko_goblins")}
                  disabled={isLoadingDeck}
                >
                  {isLoadingDeck ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Krenko Goblins
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadPresetDeck("hapatra_counters")}
                  disabled={isLoadingDeck}
                >
                  {isLoadingDeck ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Hapatra Counters
                </Button>
              </div>

              {/* Manual Deck Input */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  O pega tu mazo en formato MTG Arena:
                </Label>
                <textarea
                  value={deckText}
                  onChange={handleDeckTextChange}
                  placeholder="1 Command Tower&#10;2 Swamp&#10;2 Forest&#10;1 Hapatra, Vizier of Poisons&#10;..."
                  className="h-24 w-full rounded-lg border border-input bg-background p-2 text-sm resize-none"
                />
                <Button
                  onClick={loadDeckFromText}
                  disabled={isLoadingDeck || !deckText.trim()}
                  className="w-full"
                  variant="secondary"
                  size="sm"
                >
                  {isLoadingDeck ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Cargando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Cargar Mazo
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* AI Deck Selection */}
          <div className="space-y-2">
            <Label htmlFor="ai-deck">Mazo de IA oponente</Label>
            <Select value={selectedAIDeck} onValueChange={(v: any) => setSelectedAIDeck(v)}>
              <SelectTrigger id="ai-deck" className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="krenko_goblins">Krenko Goblins (Aggro)</SelectItem>
                <SelectItem value="hapatra_counters">Hapatra Counters (-1/-1)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Player Count */}
          <div className="space-y-3">
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
          <div className="space-y-3">
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

          {/* Start Button */}
          <Button
            onClick={handleStart}
            className="h-14 w-full gap-2 text-lg"
            size="lg"
          >
            <Sparkles className="h-5 w-5" />
            Comenzar Partida
          </Button>
        </div>

        {/* Instructions */}
        <p className="text-center text-xs text-muted-foreground">
          💡 Puedes cargar mazos desde MTG Arena exportando y pegando el texto aquí
        </p>
      </div>
    </div>
  )
}
