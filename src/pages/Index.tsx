import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Download, ImageIcon, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseGpx, GpxTrack } from "@/utils/gpxParser";
import { renderPoster, POSTER_W, POSTER_H } from "@/utils/posterRenderer";

export default function Index() {
  const [tracks, setTracks] = useState<GpxTrack[]>([]);
  const [title, setTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-render the poster whenever tracks or title changes
  useEffect(() => {
    if (!canvasRef.current || tracks.length === 0) return;
    const raf = requestAnimationFrame(() => {
      renderPoster(canvasRef.current!, tracks, title || tracks[0].name);
    });
    return () => cancelAnimationFrame(raf);
  }, [tracks, title]);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const gpxFiles = Array.from(files).filter((f) =>
      /\.(gpx|xml)$/i.test(f.name)
    );
    if (gpxFiles.length === 0) {
      toast.error("Veuillez uploader des fichiers .gpx ou .xml");
      return;
    }

    const newTracks: GpxTrack[] = [];
    for (const file of gpxFiles) {
      try {
        const content = await file.text();
        const track = parseGpx(content, file.name);
        newTracks.push(track);
      } catch (err) {
        toast.error(
          `Erreur dans ${file.name} : ${err instanceof Error ? err.message : "Fichier invalide"}`
        );
      }
    }

    if (newTracks.length > 0) {
      setTracks((prev) => {
        const combined = [...prev, ...newTracks];
        return combined;
      });
      if (!title && newTracks[0]) {
        setTitle(newTracks[0].name);
      }
      toast.success(
        newTracks.length === 1
          ? `Trace chargée : ${newTracks[0].name}`
          : `${newTracks.length} traces chargées`
      );
    }
  }, [title]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  };

  const removeTrack = (index: number) => {
    setTracks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownload = () => {
    if (!canvasRef.current || tracks.length === 0) return;
    canvasRef.current.toBlob((blob) => {
      if (!blob) {
        toast.error("Erreur lors de la génération du PNG");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        (title || tracks[0]?.name || "poster")
          .toLowerCase()
          .replace(/\s+/g, "-") + ".png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const totalDistKm = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <ImageIcon className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">
            Route Art Poster Forge
          </h1>
          <span className="text-sm text-muted-foreground ml-1">
            — Générez un poster A4 depuis vos traces GPX
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {tracks.length === 0 ? (
          /* ── Upload screen ── */
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div
              className={[
                "w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border bg-white hover:border-primary/60 hover:bg-primary/3",
              ].join(" ")}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">
                Glissez vos fichiers GPX ici
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                ou cliquez pour parcourir
              </p>
              <Button variant="outline" type="button">
                Choisir des fichiers
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
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
          /* ── Editor screen ── */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
            {/* Left: poster preview */}
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground text-center">
                Aperçu — export PNG 2480 × 3508 px (A4 @ 300 dpi)
              </p>
              <div className="flex justify-center">
                <canvas
                  ref={canvasRef}
                  width={POSTER_W}
                  height={POSTER_H}
                  style={{
                    width: "100%",
                    maxWidth: "420px",
                    height: "auto",
                    boxShadow:
                      "0 10px 40px -8px rgba(0,0,0,0.18), 0 4px 12px -4px rgba(0,0,0,0.10)",
                    borderRadius: "4px",
                  }}
                />
              </div>
            </div>

            {/* Right: controls */}
            <div className="flex flex-col gap-5">
              {/* Title input */}
              <Card>
                <CardContent className="pt-5 pb-5 space-y-3">
                  <Label htmlFor="title">Titre du poster</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Nom de votre trace..."
                  />
                </CardContent>
              </Card>

              {/* Track list */}
              <Card>
                <CardContent className="pt-5 pb-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Traces chargées</Label>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter
                    </button>
                  </div>

                  <ul className="space-y-2">
                    {tracks.map((t, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 text-sm bg-muted rounded-md px-3 py-2"
                      >
                        <span className="truncate font-medium">{t.name}</span>
                        <button
                          type="button"
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => removeTrack(i)}
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
                  <Label className="mb-3 block">Statistiques</Label>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-muted rounded-md p-3">
                      <p className="text-muted-foreground text-xs mb-1">Distance</p>
                      <p className="font-semibold text-base">
                        {totalDistKm.toFixed(2)} km
                      </p>
                    </div>
                    <div className="bg-muted rounded-md p-3">
                      <p className="text-muted-foreground text-xs mb-1">Dénivelé +</p>
                      <p className="font-semibold text-base">
                        {Math.round(totalEleGain)} m
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={handleDownload}
              >
                <Download className="h-5 w-5" />
                Télécharger le poster PNG
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setTracks([]);
                  setTitle("");
                }}
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
