"use client"

import { useState, useEffect } from "react"
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
import { Users, Heart, Sparkles, Skull, Swords, Upload, Loader2, Trash2, Save } from "lucide-react"
import type { GameConfig, Card } from "@/lib/mtg/types"
import { parseDeckText, deckFormatToCards, getLegendariesFromDeck, PRESET_DECKS } from "@/lib/mtg/deck-service"
import { blightCurseDeck } from "@/lib/mtg/sample-deck"
import { getSavedDecks, saveDeck, deleteDeck, type SavedDeck } from "@/lib/mtg/deck-storage"

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
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [newDeckName, setNewDeckName] = useState("")
  const [showCommanderDialog, setShowCommanderDialog] = useState(false)
  const [pendingDeckFormat, setPendingDeckFormat] = useState<any>(null)
  const [legendaries, setLegendaries] = useState<string[]>([])
  const [selectedCommander, setSelectedCommander] = useState<string>("")
  const [notFoundCards, setNotFoundCards] = useState<Array<{ cardName: string; quantity: number }>>([])
  const [showNotFoundDialog, setShowNotFoundDialog] = useState(false)

  // Cargar decks guardados al montar el componente
  useEffect(() => {
    setSavedDecks(getSavedDecks())
  }, [])

  const handleDeckTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDeckText(e.target.value)
  }

  const loadDeckFromText = async () => {
    if (!deckText.trim()) return
    
    setIsLoadingDeck(true)
    try {
      const deckFormat = parseDeckText(deckText)
      
      // Buscar legendarias en el deck
      const foundLegendaries = await getLegendariesFromDeck(deckFormat)
      
      if (foundLegendaries.length > 0) {
        // Si hay legendarias, mostrar diálogo para seleccionar el comandante
        setPendingDeckFormat(deckFormat)
        setLegendaries(foundLegendaries)
        setSelectedCommander(foundLegendaries[foundLegendaries.length - 1]) // Preseleccionar la última
        setShowCommanderDialog(true)
        setDeckText("") // Limpiar textarea
      } else {
        // Si no hay legendarias, cargar normalmente
        const result = await deckFormatToCards(deckFormat)
        const { cards, notFound } = result
        if (cards.length > 0) {
          setPlayerDeck(cards)
          setPlayerDeckName(deckFormat.name)
          setNotFoundCards(notFound)
          if (notFound.length > 0) {
            setShowNotFoundDialog(true)
          } else {
            alert(`✅ Mazo cargado: ${cards.length} cartas`)
          }
          setShowSaveDialog(true)
        } else {
          alert("No se pudieron cargar las cartas del mazo. Verifica los nombres.")
        }
      }
    } catch (error) {
      console.error("Error loading deck:", error)
      alert("Error al cargar el mazo")
    } finally {
      setIsLoadingDeck(false)
    }
  }

  const handleCommanderSelected = async () => {
    if (!pendingDeckFormat || !selectedCommander) return

    setIsLoadingDeck(true)
    try {
      const result = await deckFormatToCards(pendingDeckFormat, selectedCommander)
      const { cards, notFound } = result
      if (cards.length > 0) {
        setPlayerDeck(cards)
        setPlayerDeckName(pendingDeckFormat.name)
        setNotFoundCards(notFound)
        setShowCommanderDialog(false)
        if (notFound.length > 0) {
          setShowNotFoundDialog(true)
        } else {
          alert(`✅ Mazo cargado: ${cards.length} cartas`)
        }
        setShowSaveDialog(true)
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

  const loadSavedDeck = (deck: SavedDeck) => {
    setPlayerDeck(deck.cards)
    setPlayerDeckName(deck.name)
  }

  const handleSaveDeck = () => {
    if (!newDeckName.trim()) return
    
    saveDeck(newDeckName, playerDeck)
    setSavedDecks(getSavedDecks())
    setNewDeckName("")
    setShowSaveDialog(false)
  }

  const handleDeleteDeck = (id: string) => {
    if (confirm("¿Estás seguro de que quieres eliminar este mazo?")) {
      deleteDeck(id)
      setSavedDecks(getSavedDecks())
    }
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-gray-800 to-green-900">
                    <Skull className="h-6 w-6 text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{playerDeckName}</p>
                    <p className="text-sm text-muted-foreground">
                      {playerDeck.length} cartas cargadas
                      {notFoundCards.length > 0 && (
                        <span className="ml-1 text-destructive">
                          ({notFoundCards.length} no encontradas)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowSaveDialog(true)}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    Guardar
                  </Button>
                  {notFoundCards.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNotFoundDialog(true)}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      Ver no encontradas ({notFoundCards.length})
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Not Found Cards Dialog */}
            {showNotFoundDialog && notFoundCards.length > 0 && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-3">
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    ⚠️ {notFoundCards.length} cartas no encontradas en Scryfall
                  </Label>
                  <p className="text-xs text-muted-foreground mt-2">
                    Estas cartas se omitieron del mazo:
                  </p>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto bg-background rounded p-2 border border-border">
                  {notFoundCards.map((card, idx) => (
                    <div key={idx} className="text-sm text-muted-foreground flex justify-between">
                      <span>{card.quantity}x {card.cardName}</span>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded">
                  💡 Verifica que los nombres sean exactos. Algunos nombres pueden tener caracteres especiales o acentos.
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setShowNotFoundDialog(false)
                    }}
                  >
                    Continuar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowNotFoundDialog(false)
                      setPlayerDeck(blightCurseDeck)
                      setPlayerDeckName("Blight Curse")
                      setNotFoundCards([])
                      setShowSaveDialog(false)
                    }}
                  >
                    Cargar otro mazo
                  </Button>
                </div>
              </div>
            )}

            {/* Commander Selection Dialog */}
            {showCommanderDialog && legendaries.length > 0 && (
              <div className="rounded-lg border border-primary bg-primary/10 p-4 space-y-3">
                <div>
                  <Label className="text-sm font-semibold">
                    Se encontraron cartas legendarias. ¿Cuál es tu comandante?
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Se detectaron {legendaries.length} legendaria(s) en el mazo
                  </p>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {legendaries.map((legendary) => (
                    <button
                      key={legendary}
                      onClick={() => setSelectedCommander(legendary)}
                      className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                        selectedCommander === legendary
                          ? "border-primary bg-primary/20"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <p className="font-medium text-sm">{legendary}</p>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCommanderSelected}
                    disabled={!selectedCommander || isLoadingDeck}
                  >
                    {isLoadingDeck ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cargando...
                      </>
                    ) : (
                      "Confirmar"
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowCommanderDialog(false)
                      setLegendaries([])
                      setPendingDeckFormat(null)
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Save Dialog */}
            {showSaveDialog && (
              <div className="rounded-lg border border-primary bg-primary/10 p-4 space-y-3">
                <div>
                  <Label htmlFor="deck-name" className="text-sm">
                    Nombre del mazo
                  </Label>
                  <Input
                    id="deck-name"
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    placeholder="Ej: Mi Hapatra Custom"
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveDeck}
                    disabled={!newDeckName.trim()}
                  >
                    Guardar Mazo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSaveDialog(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {/* Saved Decks */}
            {savedDecks.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Mis mazos guardados:</Label>
                <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                  {savedDecks.map((deck) => (
                    <div
                      key={deck.id}
                      className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3 hover:bg-secondary transition-colors"
                    >
                      <button
                        onClick={() => loadSavedDeck(deck)}
                        className="flex-1 text-left"
                      >
                        <p className="font-medium text-foreground text-sm">{deck.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {deck.cardCount} cartas
                        </p>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteDeck(deck.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
