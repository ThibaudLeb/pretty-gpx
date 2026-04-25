import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, ImageIcon, X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseGpx, GpxTrack } from '@/utils/gpxParser';
import { renderPoster, POSTER_W, POSTER_H } from '@/utils/posterRenderer';
import { PALETTES, DEFAULT_PALETTE, Palette } from '@/utils/palettes';

export default function Index() {
  const [tracks, setTracks] = useState<GpxTrack[]>([]);
  const [title, setTitle] = useState('');
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [isDragging, setIsDragging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // prevents stale renders from overwriting a newer one
  const renderIdRef = useRef(0);

  // ── Render on any change ──────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || tracks.length === 0) return;

    const id = ++renderIdRef.current;
    setIsRendering(true);
    setRenderProgress(0);

    renderPoster(
      canvasRef.current,
      tracks,
      title || tracks[0].name,
      palette,
      (pct) => {
        if (renderIdRef.current === id) setRenderProgress(pct);
      }
    ).then(() => {
      if (renderIdRef.current === id) {
        setIsRendering(false);
        setRenderProgress(100);
      }
    });
  }, [tracks, title, palette]);

  // ── File handling ─────────────────────────────────────────────────────────
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const gpxFiles = Array.from(files).filter((f) => /\.(gpx|xml)$/i.test(f.name));
      if (gpxFiles.length === 0) {
        toast.error('Veuillez uploader des fichiers .gpx ou .xml');
        return;
      }
      const newTracks: GpxTrack[] = [];
      for (const file of gpxFiles) {
        try {
          newTracks.push(parseGpx(await file.text(), file.name));
        } catch (err) {
          toast.error(
            `Erreur dans ${file.name} : ${err instanceof Error ? err.message : 'Fichier invalide'}`
          );
        }
      }
      if (newTracks.length > 0) {
        setTracks((prev) => [...prev, ...newTracks]);
        if (!title && newTracks[0]) setTitle(newTracks[0].name);
        toast.success(
          newTracks.length === 1
            ? `Trace chargée : ${newTracks[0].name}`
            : `${newTracks.length} traces chargées`
        );
      }
    },
    [title]
  );

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files);
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = '';
  };

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!canvasRef.current || tracks.length === 0 || isRendering) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) { toast.error('Erreur lors de la génération du PNG'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (title || tracks[0]?.name || 'poster').toLowerCase().replace(/\s+/g, '-') + '.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const totalDistKm = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">Route Art Poster Forge</span>
          <span className="text-sm text-muted-foreground hidden sm:block">
            — Poster A4 depuis vos traces GPX
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {tracks.length === 0 ? (
          /* ── Upload screen ─────────────────────────────────────────────── */
          <div className="flex flex-col items-center justify-center min-h-[72vh]">
            <div
              className={[
                'w-full max-w-lg border-2 border-dashed rounded-2xl p-14 text-center',
                'transition-all cursor-pointer select-none',
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.01]'
                  : 'border-border bg-white hover:border-primary/50 hover:bg-primary/[0.02]',
              ].join(' ')}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">Glissez vos fichiers GPX ici</p>
              <p className="text-sm text-muted-foreground mb-6">ou cliquez pour parcourir</p>
              <Button variant="outline" type="button">Choisir des fichiers</Button>
              <p className="text-xs text-muted-foreground mt-5">
                Formats acceptés : .gpx, .xml — plusieurs traces possibles
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,.xml"
              multiple
              className="hidden"
              onChange={onFileChange}
            />
          </div>
        ) : (
          /* ── Editor screen ─────────────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">

            {/* Poster preview */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Aperçu — export PNG 2480 × 3508 px (A4 @ 300 dpi)
              </p>
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  width={POSTER_W}
                  height={POSTER_H}
                  style={{
                    width: '100%',
                    maxWidth: '400px',
                    height: 'auto',
                    borderRadius: 4,
                    boxShadow: '0 12px 48px -8px rgba(0,0,0,0.22), 0 4px 12px -4px rgba(0,0,0,0.12)',
                    display: 'block',
                  }}
                />
                {/* Loading overlay */}
                {isRendering && (
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(0,0,0,0.35)',
                      borderRadius: 4,
                    }}
                  >
                    <Loader2 className="h-8 w-8 text-white animate-spin mb-3" />
                    <span className="text-white text-sm font-medium">
                      Rendu… {Math.round(renderProgress)} %
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-4">

              {/* Title */}
              <Card>
                <CardContent className="pt-5 pb-5 space-y-2">
                  <Label htmlFor="title">Titre du poster</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Nom de votre trace…"
                  />
                </CardContent>
              </Card>

              {/* Palette */}
              <Card>
                <CardContent className="pt-5 pb-5 space-y-3">
                  <Label>Palette de couleurs</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {PALETTES.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        title={p.name}
                        onClick={() => setPalette(p)}
                        style={{ background: p.bg }}
                        className={[
                          'h-10 rounded-lg border-2 transition-all',
                          palette.id === p.id
                            ? 'border-foreground scale-110 shadow-md'
                            : 'border-transparent hover:border-muted-foreground',
                        ].join(' ')}
                      >
                        <span
                          className="block w-4 h-1 mx-auto rounded-full"
                          style={{ background: p.track }}
                        />
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    {palette.name}
                  </p>
                </CardContent>
              </Card>

              {/* Tracks */}
              <Card>
                <CardContent className="pt-5 pb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Traces ({tracks.length})</Label>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus className="h-3 w-3" /> Ajouter
                    </button>
                  </div>
                  <ul className="space-y-1.5">
                    {tracks.map((t, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 text-sm bg-muted rounded-md px-3 py-2"
                      >
                        <span className="truncate font-medium">{t.name}</span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() =>
                            setTracks((prev) => prev.filter((_, idx) => idx !== i))
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".gpx,.xml"
                    multiple
                    className="hidden"
                    onChange={onFileChange}
                  />
                </CardContent>
              </Card>

              {/* Stats */}
              <Card>
                <CardContent className="pt-5 pb-5">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-muted rounded-md p-3">
                      <p className="text-muted-foreground text-xs mb-0.5">Distance</p>
                      <p className="font-semibold">{totalDistKm.toFixed(2)} km</p>
                    </div>
                    <div className="bg-muted rounded-md p-3">
                      <p className="text-muted-foreground text-xs mb-0.5">Dénivelé +</p>
                      <p className="font-semibold">{Math.round(totalEleGain)} m</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <Button
                size="lg"
                className="w-full gap-2"
                disabled={isRendering || tracks.length === 0}
                onClick={handleDownload}
              >
                <Download className="h-5 w-5" />
                Télécharger le poster PNG
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setTracks([]); setTitle(''); }}
              >
                Recommencer
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
