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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  const [playerDeck, setPlayerDeck] = useState<Card[]>([])
  const [playerDeckName, setPlayerDeckName] = useState("")
  const [deckText, setDeckText] = useState("")
  const [isLoadingDeck, setIsLoadingDeck] = useState(false)
  const [selectedAIDeckId, setSelectedAIDeckId] = useState<string>("")
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
    const decks = getSavedDecks()
    setSavedDecks(decks)
    // Preseleccionar el primer deck guardado si existe
    if (decks.length > 0 && !selectedAIDeckId) {
      setSelectedAIDeckId(decks[0].id)
    }
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

  const loadSavedDeck = (deck: SavedDeck) => {
    setPlayerDeck(deck.cards)
    setPlayerDeckName(deck.name)
  }

  const handleSaveDeck = () => {
    if (!newDeckName.trim()) return
    
    saveDeck(newDeckName, playerDeck)
    const newDecks = getSavedDecks()
    setSavedDecks(newDecks)
    // Seleccionar automáticamente el último deck guardado (el recién creado)
    if (newDecks.length > 0) {
      setSelectedAIDeckId(newDecks[newDecks.length - 1].id)
    }
    setNewDeckName("")
    setShowSaveDialog(false)
  }

  const handleDeleteDeck = (id: string) => {
    if (confirm("¿Estás seguro de que quieres eliminar este mazo?")) {
      deleteDeck(id)
      const newDecks = getSavedDecks()
      setSavedDecks(newDecks)
      // Si se eliminó el deck seleccionado, seleccionar otro si existe
      if (selectedAIDeckId === id && newDecks.length > 0) {
        setSelectedAIDeckId(newDecks[0].id)
      } else if (newDecks.length === 0) {
        setSelectedAIDeckId("")
      }
    }
  }

  const handleStart = () => {
    // Validar que se haya seleccionado un mazo
    if (playerDeck.length === 0) {
      alert("Por favor selecciona o carga un mazo antes de iniciar la partida")
      return
    }

    // Obtener el deck de la IA seleccionada
    const selectedAIDeckObj = savedDecks.find(deck => deck.id === selectedAIDeckId)
    const aiDeck = selectedAIDeckObj?.cards || blightCurseDeck

    onStartGame({
      playerCount,
      startingLife,
      playerName,
      playerDeck,
      aiDeck,
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
            {playerDeck.length > 0 ? (
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
            ) : (
              <div className="rounded-xl border-2 border-dashed border-border bg-secondary/30 p-6">
                <div className="flex flex-col items-center justify-center text-center gap-2">
                  <Swords className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No hay mazo seleccionado
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Selecciona un mazo guardado o carga uno nuevo
                  </p>
                </div>
              </div>
            )}

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
                      setPlayerDeck([])
                      setPlayerDeckName("")
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
                <div className="grid grid-cols-2 gap-2">
                  {savedDecks.map((deck) => {
                    // Encontrar la carta del comandante
                    const commander = deck.cards.find(card => card.isCommander)
                    
                    return (
                      <TooltipProvider key={deck.id}>
                        <Tooltip delayDuration={200}>
                          <TooltipTrigger asChild>
                            <div className="relative group">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => loadSavedDeck(deck)}
                                className="w-full h-32 p-0 overflow-hidden relative flex flex-col justify-end"
                              >
                                {/* Background image of commander */}
                                {commander?.imageUrl ? (
                                  <img
                                    src={commander.imageUrl}
                                    alt={commander.name}
                                    className="absolute inset-0 w-full h-full object-cover opacity-60"
                                  />
                                ) : (
                                  <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 opacity-60" />
                                )}
                                
                                {/* Overlay with deck info */}
                                <div className="relative z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 w-full">
                                  <p className="font-medium text-sm text-white truncate">{deck.name}</p>
                                  <p className="text-xs text-gray-200">
                                    {commander ? `⭐ ${commander.name}` : "Sin comandante"}
                                  </p>
                                  <p className="text-xs text-gray-300">{deck.cardCount} cartas</p>
                                </div>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute -top-2 -right-2 h-6 w-6 text-destructive hover:text-destructive bg-background border border-destructive/30 hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDeleteDeck(deck.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="w-96 p-4">
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">{deck.name}</h4>
                              <div className="grid grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                                {(() => {
                                  // Agrupar cartas por nombre
                                  const cardMap = new Map<string, { card: typeof deck.cards[0], count: number }>()
                                  deck.cards.forEach(card => {
                                    const existing = cardMap.get(card.name)
                                    if (existing) {
                                      existing.count++
                                    } else {
                                      cardMap.set(card.name, { card, count: 1 })
                                    }
                                  })
                                  
                                  return Array.from(cardMap.values()).map((item, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-1 relative">
                                      {/* Stack visual - cartas apiladas */}
                                      {item.count > 1 && (
                                        <>
                                          {/* Carta 3 (atrás) */}
                                          <div className="absolute w-16 h-24 bg-gray-700 rounded border border-border/50 -translate-x-1 -translate-y-1">
                                            {item.card.imageUrl && (
                                              <img
                                                src={item.card.imageUrl}
                                                alt={item.card.name}
                                                className="w-full h-full object-cover rounded"
                                              />
                                            )}
                                          </div>
                                          {/* Carta 2 (medio) */}
                                          {item.count > 2 && (
                                            <div className="absolute w-16 h-24 bg-gray-700 rounded border border-border/50 translate-x-0.5 -translate-y-0.5">
                                              {item.card.imageUrl && (
                                                <img
                                                  src={item.card.imageUrl}
                                                  alt={item.card.name}
                                                  className="w-full h-full object-cover rounded"
                                                />
                                              )}
                                            </div>
                                          )}
                                        </>
                                      )}
                                      
                                      {/* Carta principal (frente) */}
                                      <div className="relative z-10">
                                        {item.card.imageUrl ? (
                                          <div className="relative">
                                            <img
                                              src={item.card.imageUrl}
                                              alt={item.card.name}
                                              className="w-16 h-24 object-cover rounded border border-border/50"
                                            />
                                            {/* Cantidad si hay duplicados - dentro de la carta */}
                                            {item.count > 1 && (
                                              <div className="absolute bottom-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold border border-red-700 shadow-lg">
                                                {item.count}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="relative w-16 h-24 bg-gray-700 rounded border border-border/50 flex items-center justify-center text-[8px] text-center px-1">
                                            {item.card.name}
                                            {/* Cantidad si hay duplicados - dentro de la carta */}
                                            {item.count > 1 && (
                                              <div className="absolute bottom-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold border border-red-700 shadow-lg">
                                                {item.count}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      
                                      <span className="text-[10px] text-muted-foreground text-center line-clamp-2 relative z-10">
                                        {item.card.name}
                                      </span>
                                    </div>
                                  ))
                                })()}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Deck Loading Options */}
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Pega tu mazo en formato MTG Arena:</Label>
              
              {/* Manual Deck Input */}
              <div className="space-y-2">
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
            {savedDecks.length > 0 ? (
              <Select value={selectedAIDeckId} onValueChange={setSelectedAIDeckId}>
                <SelectTrigger id="ai-deck" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {savedDecks.map((deck) => (
                    <SelectItem key={deck.id} value={deck.id}>
                      {deck.name} ({deck.cardCount} cartas)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-secondary/50 p-3 text-sm text-muted-foreground">
                📝 Carga un mazo primero para poder seleccionarlo para la IA
              </div>
            )}
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
            disabled={playerDeck.length === 0}
          >
            <Swords className="h-5 w-5" />
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
