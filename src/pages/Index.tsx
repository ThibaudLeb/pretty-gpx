import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, ImageIcon, X, Plus, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseGpx, GpxTrack } from '@/utils/gpxParser';
import { renderPoster, POSTER_W, POSTER_H } from '@/utils/posterRenderer';
import { PALETTES, DEFAULT_PALETTE, Palette, FONTS, DEFAULT_FONT, FontDef } from '@/utils/palettes';

// ── Export helpers ────────────────────────────────────────────────────────────

function blobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilename(title: string, ext: string) {
  return (title || 'poster').toLowerCase().replace(/\s+/g, '-') + '.' + ext;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, q = 0.92): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('Export failed')), type, q)
  );
}

/** Minimal single-image PDF (JPEG embedded, A4 in points) */
async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const W = canvas.width, H = canvas.height;
  // A4 in points: 595.28 × 841.89
  const pw = 595.28, ph = 841.89;
  const enc = new TextEncoder();

  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`;
  const stream4 = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const obj4 = `4 0 obj\n<< /Length ${stream4.length} >>\nstream\n${stream4}\nendstream\nendobj\n`;
  const img5Header = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
  const img5Footer = `\nendstream\nendobj\n`;

  const header = `%PDF-1.4\n`;
  const parts: Uint8Array[] = [enc.encode(header)];
  const offsets = [0, 0, 0, 0, 0, 0];
  let pos = header.length;

  const addStr = (s: string, idx: number) => {
    offsets[idx] = pos;
    const b = enc.encode(s);
    parts.push(b); pos += b.length;
  };
  addStr(obj1, 1); addStr(obj2, 2); addStr(obj3, 3); addStr(obj4, 4);

  // Image object (binary)
  offsets[5] = pos;
  const h5b = enc.encode(img5Header);
  const f5b = enc.encode(img5Footer);
  parts.push(h5b, jpegBytes, f5b);
  pos += h5b.length + jpegBytes.length + f5b.length;

  const xrefOff = pos;
  const xref = [
    `xref\n0 6\n`,
    `0000000000 65535 f\r\n`,
    ...offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n\r\n`),
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF`,
  ].join('');
  parts.push(enc.encode(xref));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return new Blob([out], { type: 'application/pdf' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Index() {
  const [tracks, setTracks] = useState<GpxTrack[]>([]);
  const [title, setTitle] = useState('');
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  const [font, setFont] = useState<FontDef>(DEFAULT_FONT);
  const [isDragging, setIsDragging] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderIdRef = useRef(0);

  // ── Re-render on any change ──
  useEffect(() => {
    if (!canvasRef.current || tracks.length === 0) return;
    const id = ++renderIdRef.current;
    setIsRendering(true);
    setRenderProgress(0);

    renderPoster(
      canvasRef.current,
      tracks,
      title || (tracks[0]?.name ?? 'Pretty GPX'),
      palette,
      font,
      pct => { if (renderIdRef.current === id) setRenderProgress(pct); }
    ).then(() => {
      if (renderIdRef.current === id) { setIsRendering(false); setRenderProgress(100); }
    });
  }, [tracks, title, palette, font]);

  // ── File handling ──
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const gpxFiles = Array.from(files).filter(f => /\.(gpx|xml)$/i.test(f.name));
    if (gpxFiles.length === 0) { toast.error('Veuillez uploader des fichiers .gpx ou .xml'); return; }
    const newTracks: GpxTrack[] = [];
    for (const f of gpxFiles) {
      try { newTracks.push(parseGpx(await f.text(), f.name)); }
      catch (err) { toast.error(`Erreur dans ${f.name} : ${err instanceof Error ? err.message : 'Invalide'}`); }
    }
    if (newTracks.length > 0) {
      setTracks(prev => [...prev, ...newTracks]);
      if (!title && newTracks[0]) setTitle(newTracks[0].name);
      toast.success(newTracks.length === 1 ? `Trace chargée : ${newTracks[0].name}` : `${newTracks.length} traces chargées`);
    }
  }, [title]);

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; };

  // ── Download ──
  const handleDownload = async (format: 'png' | 'jpeg' | 'pdf') => {
    if (!canvasRef.current || tracks.length === 0 || isRendering) return;
    setShowDownloadMenu(false);
    try {
      const slug = safeFilename(title || tracks[0]?.name || 'poster', format);
      if (format === 'png') {
        const blob = await canvasToBlob(canvasRef.current, 'image/png');
        blobDownload(blob, slug);
      } else if (format === 'jpeg') {
        const blob = await canvasToBlob(canvasRef.current, 'image/jpeg', 0.92);
        blobDownload(blob, slug);
      } else {
        toast.info('Génération du PDF…');
        const blob = await canvasToPdf(canvasRef.current);
        blobDownload(blob, safeFilename(title || tracks[0]?.name || 'poster', 'pdf'));
      }
    } catch {
      toast.error('Erreur lors de l\'export');
    }
  };

  const totalDistKm  = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => setShowDownloadMenu(false)}>
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">Pretty GPX</span>
          <span className="text-sm text-muted-foreground hidden sm:block">
            — Poster A4 depuis vos traces GPX
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {tracks.length === 0 ? (
          /* ── Upload screen ── */
          <div className="flex flex-col items-center justify-center min-h-[72vh]">
            <div
              className={['w-full max-w-lg border-2 border-dashed rounded-2xl p-14 text-center transition-all cursor-pointer select-none',
                isDragging ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'border-border bg-white hover:border-primary/50 hover:bg-primary/[0.02]'].join(' ')}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">Glissez vos fichiers GPX ici</p>
              <p className="text-sm text-muted-foreground mb-6">ou cliquez pour parcourir</p>
              <Button variant="outline" type="button">Choisir des fichiers</Button>
              <p className="text-xs text-muted-foreground mt-5">Formats acceptés : .gpx, .xml — plusieurs traces possibles</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".gpx,.xml" multiple className="hidden" onChange={onFileChange} />
          </div>
        ) : (
          /* ── Editor screen ── */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">

            {/* Poster preview */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-muted-foreground">Aperçu — export 2480 × 3508 px (A4 @ 300 dpi)</p>
              <div className="relative">
                <canvas
                  ref={canvasRef} width={POSTER_W} height={POSTER_H}
                  style={{ width: '100%', maxWidth: 400, height: 'auto', borderRadius: 4,
                    boxShadow: '0 12px 48px -8px rgba(0,0,0,0.22), 0 4px 12px -4px rgba(0,0,0,0.12)', display: 'block' }}
                />
                {isRendering && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)', borderRadius: 4 }}>
                    <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                    <span className="text-white text-sm font-medium">Rendu… {Math.round(renderProgress)} %</span>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-4">

              {/* Title */}
              <Card><CardContent className="pt-5 pb-5 space-y-2">
                <Label htmlFor="title">Titre du poster</Label>
                <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Nom de votre trace…" />
              </CardContent></Card>

              {/* Palette */}
              <Card><CardContent className="pt-5 pb-5 space-y-3">
                <Label>Palette de couleurs</Label>
                <div className="grid grid-cols-4 gap-2">
                  {PALETTES.map(p => (
                    <button key={p.id} type="button" title={p.name}
                      onClick={() => setPalette(p)}
                      style={{ background: p.bg }}
                      className={['h-10 rounded-lg border-2 transition-all flex items-center justify-center',
                        palette.id === p.id ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:border-muted-foreground'].join(' ')}>
                      <span className="block w-4 h-1 rounded-full" style={{ background: p.track }} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground text-center">{palette.name}</p>
              </CardContent></Card>

              {/* Font */}
              <Card><CardContent className="pt-5 pb-5 space-y-2">
                <Label>Police</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FONTS.map(f => (
                    <button key={f.id} type="button"
                      onClick={() => setFont(f)}
                      className={['px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                        font.id === f.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-muted-foreground'].join(' ')}>
                      {f.name}
                    </button>
                  ))}
                </div>
              </CardContent></Card>

              {/* Tracks */}
              <Card><CardContent className="pt-5 pb-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Traces ({tracks.length})</Label>
                  <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={() => fileInputRef.current?.click()}>
                    <Plus className="h-3 w-3" /> Ajouter
                  </button>
                </div>
                <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {tracks.map((t, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-sm bg-muted rounded-md px-3 py-2">
                      <span className="truncate font-medium">{t.name}</span>
                      <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => setTracks(prev => prev.filter((_, idx) => idx !== i))}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <input ref={fileInputRef} type="file" accept=".gpx,.xml" multiple className="hidden" onChange={onFileChange} />
              </CardContent></Card>

              {/* Stats */}
              <Card><CardContent className="pt-5 pb-5">
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
              </CardContent></Card>

              {/* Download button + dropdown */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <div className="flex gap-1">
                  <Button size="lg" className="flex-1 gap-2" disabled={isRendering || tracks.length === 0}
                    onClick={() => handleDownload('png')}>
                    <Download className="h-5 w-5" />
                    Télécharger PNG
                  </Button>
                  <Button size="lg" variant="outline" disabled={isRendering || tracks.length === 0}
                    className="px-3"
                    onClick={() => setShowDownloadMenu(v => !v)}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                {showDownloadMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-lg shadow-lg z-10 overflow-hidden w-44">
                    {(['png', 'jpeg', 'pdf'] as const).map(fmt => (
                      <button key={fmt} type="button"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors uppercase tracking-wide font-medium"
                        onClick={() => handleDownload(fmt)}>
                        {fmt === 'png' ? '🖼  PNG haute-res' : fmt === 'jpeg' ? '📷  JPEG' : '📄  PDF A4'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button variant="outline" className="w-full" onClick={() => { setTracks([]); setTitle(''); }}>
                Recommencer
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
