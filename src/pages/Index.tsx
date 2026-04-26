import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, ImageIcon, X, Plus, Loader2, ChevronDown, Mountain, Tent, Building2, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseGpx, GpxTrack } from '@/utils/gpxParser';
import { renderPoster, computeMapTransform, POSTER_W, POSTER_H } from '@/utils/posterRenderer';
import { PALETTES, DEFAULT_PALETTE, Palette, FONTS, DEFAULT_FONT, FontDef } from '@/utils/palettes';
import { Poi, PoiType, fetchPoisAlongTrack } from '@/utils/overpass';
import { normToLat, normToLon } from '@/utils/hillshading';

// ── Colour helpers ──────────────────────────────────────────────────────────

function hexLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0,2),16)/255;
  const g = parseInt(h.slice(2,4),16)/255;
  const b = parseInt(h.slice(4,6),16)/255;
  return 0.299*r + 0.587*g + 0.114*b;
}

// ── Export helpers ──────────────────────────────────────────────────────────

function blobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function safeFilename(title: string, ext: string) {
  return (title || 'poster').toLowerCase().replace(/\s+/g, '-') + '.' + ext;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, q = 0.92): Promise<Blob> {
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('Export failed')), type, q)
  );
}

async function canvasToPdf(canvas: HTMLCanvasElement): Promise<Blob> {
  const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
  const W = canvas.width, H = canvas.height;
  const pw = 595.28, ph = 841.89;
  const enc = new TextEncoder();
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`;
  const s4 = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const obj4 = `4 0 obj\n<< /Length ${s4.length} >>\nstream\n${s4}\nendstream\nendobj\n`;
  const h5 = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`;
  const f5 = `\nendstream\nendobj\n`;
  const header = `%PDF-1.4\n`;
  const parts: Uint8Array[] = [enc.encode(header)];
  const offsets = [0,0,0,0,0,0];
  let pos = header.length;
  const addStr = (s: string, i: number) => { offsets[i]=pos; const b=enc.encode(s); parts.push(b); pos+=b.length; };
  addStr(obj1,1); addStr(obj2,2); addStr(obj3,3); addStr(obj4,4);
  offsets[5]=pos;
  const h5b=enc.encode(h5); const f5b=enc.encode(f5);
  parts.push(h5b, jpegBytes, f5b); pos+=h5b.length+jpegBytes.length+f5b.length;
  const xrefOff=pos;
  const xref=[`xref\n0 6\n`,`0000000000 65535 f\r\n`,...offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n\r\n`),`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF`].join('');
  parts.push(enc.encode(xref));
  const total=parts.reduce((s,p)=>s+p.length,0); const out=new Uint8Array(total); let off=0;
  for (const p of parts) { out.set(p,off); off+=p.length; }
  return new Blob([out], { type: 'application/pdf' });
}

// ── POI type metadata ───────────────────────────────────────────────────────

const POI_META: Record<PoiType, { label: string; icon: React.ReactNode; color: string }> = {
  col:    { label: 'Col',    icon: <Mountain  className="h-3.5 w-3.5" />, color: 'text-sky-600' },
  summit: { label: 'Sommet',icon: <Mountain  className="h-3.5 w-3.5" />, color: 'text-indigo-600' },
  tipi:   { label: 'Refuge',icon: <Tent      className="h-3.5 w-3.5" />, color: 'text-amber-600' },
  city:   { label: 'Ville', icon: <Building2 className="h-3.5 w-3.5" />, color: 'text-emerald-600' },
};

// Priority for keeping the best 10 POIs (lower = higher priority)
const POI_PRIORITY: Record<PoiType, number> = { col: 1, summit: 2, tipi: 3, city: 4 };

function topPois(all: Poi[], max = 10): Poi[] {
  const sorted = [...all].sort((a, b) => POI_PRIORITY[a.type] - POI_PRIORITY[b.type]);
  return sorted.slice(0, max);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Index() {
  const [tracks,   setTracks]   = useState<GpxTrack[]>([]);
  const [title,    setTitle]    = useState('');
  const [palette,  setPalette]  = useState<Palette>(DEFAULT_PALETTE);
  const [font,     setFont]     = useState<FontDef>(DEFAULT_FONT);

  // Custom colour overrides (null = use palette default)
  const [bgColor,    setBgColor]    = useState<string | null>(null);
  const [trackColor, setTrackColor] = useState<string | null>(null);
  const [titleColor, setTitleColor] = useState<string | null>(null);

  // POIs
  const [pois,           setPois]           = useState<Poi[]>([]);
  const [isFetchingPois, setIsFetchingPois] = useState(false);
  // T3: toggle to show/hide POIs on the poster
  const [showPois,       setShowPois]       = useState(true);

  // Editing POI name inline
  const [editingPoiId, setEditingPoiId] = useState<string | null>(null);
  const [editingName,  setEditingName]  = useState('');

  // Adding new POI by clicking on canvas
  const [addingType,   setAddingType]   = useState<PoiType | null>(null);
  const [pendingClick, setPendingClick] = useState<{ lat: number; lon: number } | null>(null);
  const [newPoiName,   setNewPoiName]   = useState('');
  // T7: controlled type in the "Nouveau point d'intérêt" modal
  const [newPoiType,   setNewPoiType]   = useState<PoiType>('col');

  // Font size multipliers (1.0 = default)
  const [titleSizeMult, setTitleSizeMult] = useState(1.0);
  const [statsSizeMult, setStatsSizeMult] = useState(1.0);

  // Zoom level for canvas preview
  const [canvasZoom, setCanvasZoom] = useState(1.0);

  // T5: Regista custom font upload
  const [registaLoaded, setRegistaLoaded] = useState(false);
  const fontUploadRef = useRef<HTMLInputElement>(null);

  // T8: download menu (header + sidebar share state)
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Render state
  const [isRendering,    setIsRendering]    = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renderIdRef  = useRef(0);

  // ── Effective palette ───────────────────────────────────────────────────
  const effectivePalette = useMemo((): Palette => {
    const bg    = bgColor    ?? palette.bg;
    const track = trackColor ?? palette.track;
    const ttl   = titleColor ?? palette.title;
    return { ...palette, bg, track, title: ttl, profileFill: track, statsText: ttl, isLight: hexLuminance(bg) > 0.5 };
  }, [palette, bgColor, trackColor, titleColor]);

  const selectPalette = (p: Palette) => {
    setPalette(p); setBgColor(null); setTrackColor(null); setTitleColor(null);
  };

  // ── Re-render poster ────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || tracks.length === 0) return;
    const id = ++renderIdRef.current;
    setIsRendering(true); setRenderProgress(0);
    const poisToRender = showPois ? topPois(pois) : [];
    renderPoster(canvasRef.current, tracks, title || tracks[0].name,
      effectivePalette, font, poisToRender, titleSizeMult, statsSizeMult,
      pct => { if (renderIdRef.current === id) setRenderProgress(pct); }
    ).then(() => {
      if (renderIdRef.current === id) { setIsRendering(false); setRenderProgress(100); }
    });
  }, [tracks, title, effectivePalette, font, pois, showPois, titleSizeMult, statsSizeMult]);

  // ── Auto-fetch POIs when tracks change ──────────────────────────────────
  useEffect(() => {
    if (tracks.length === 0) { setPois([]); return; }
    const allPts = tracks.flatMap(t => t.points);
    const lats = allPts.map(p => p.lat);
    const lons = allPts.map(p => p.lon);
    setIsFetchingPois(true);
    fetchPoisAlongTrack(Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons), allPts)
      .then(detected => {
        setPois(prev => [...topPois(detected), ...prev.filter(p => p.userAdded)]);
        setIsFetchingPois(false);
      })
      .catch(() => setIsFetchingPois(false));
  }, [tracks]);

  // ── File handling ───────────────────────────────────────────────────────
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

  const onDragOver  = (e: React.DragEvent) => e.preventDefault();
  const onDrop      = (e: React.DragEvent) => { e.preventDefault(); processFiles(e.dataTransfer.files); };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files); e.target.value = '';
  };

  // ── Canvas click → add POI ──────────────────────────────────────────────
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!addingType || tracks.length === 0) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (POSTER_W / rect.width);
    const cy = (e.clientY - rect.top)  * (POSTER_H / rect.height);
    const mt = computeMapTransform(tracks);
    if (!mt) return;
    const lon = normToLon(cx / mt.scale + mt.xOrigin);
    const lat = normToLat(cy / mt.scale + mt.yOrigin);
    // T7: capture the current addingType as the modal default
    setNewPoiType(addingType);
    setPendingClick({ lat, lon });
    setNewPoiName('');
    setAddingType(null);
  };

  const confirmNewPoi = () => {
    if (!pendingClick || !newPoiName.trim()) return;
    setPois(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: newPoiType,
      name: newPoiName.trim(),
      lat: pendingClick.lat,
      lon: pendingClick.lon,
      visible: true,
      userAdded: true,
    }]);
    setPendingClick(null);
    setNewPoiName('');
  };

  // ── T5: Load Regista font from uploaded file ────────────────────────────
  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const face = new FontFace('Regista', buf);
      await face.load();
      document.fonts.add(face);
      setRegistaLoaded(true);
      toast.success('Police Regista chargée !');
    } catch {
      toast.error('Impossible de charger ce fichier de police.');
    }
    e.target.value = '';
  };

  // ── Download ────────────────────────────────────────────────────────────
  const handleDownload = async (format: 'png' | 'jpeg' | 'pdf') => {
    if (!canvasRef.current || tracks.length === 0 || isRendering) return;
    setShowDownloadMenu(false);
    try {
      const slug = safeFilename(title || tracks[0]?.name || 'poster', format);
      if (format === 'png')  blobDownload(await canvasToBlob(canvasRef.current, 'image/png'), slug);
      else if (format === 'jpeg') blobDownload(await canvasToBlob(canvasRef.current, 'image/jpeg', 0.92), slug);
      else { toast.info('Génération du PDF…'); blobDownload(await canvasToPdf(canvasRef.current), safeFilename(title || tracks[0]?.name || 'poster', 'pdf')); }
    } catch { toast.error("Erreur lors de l'export"); }
  };

  const totalDistKm  = tracks.reduce((s, t) => s + t.distanceKm, 0);
  const totalEleGain = tracks.reduce((s, t) => s + t.elevationGainM, 0);
  const hasTrack = tracks.length > 0;

  // ── Download button (reused in header + sidebar) ────────────────────────
  const DownloadButton = () => (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <div className="flex gap-1">
        <Button size="sm" className="gap-1.5" disabled={isRendering || !hasTrack}
          onClick={() => handleDownload('png')}>
          <Download className="h-4 w-4" /> PNG
        </Button>
        <Button size="sm" variant="outline" disabled={isRendering || !hasTrack}
          className="px-2" onClick={() => setShowDownloadMenu(v => !v)}>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      {showDownloadMenu && (
        <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 overflow-hidden w-44">
          {(['png','jpeg','pdf'] as const).map(fmt => (
            <button key={fmt} type="button"
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors font-medium"
              onClick={() => handleDownload(fmt)}>
              {fmt === 'png' ? '🖼  PNG haute-res' : fmt === 'jpeg' ? '📷  JPEG' : '📄  PDF A4'}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50" onClick={() => setShowDownloadMenu(false)}>
      {/* T8 + T4: Sticky header with download button on right */}
      <header className="bg-white border-b px-6 py-3 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold tracking-tight">Pretty GPX</span>
          <span className="text-sm text-muted-foreground hidden sm:block">— Poster A4 depuis vos traces GPX</span>
          <div className="ml-auto">
            <DownloadButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!hasTrack ? (
          /* ── Upload screen ── */
          <div className="flex flex-col items-center justify-center min-h-[72vh]">
            <div
              className="w-full max-w-lg border-2 border-dashed rounded-2xl p-14 text-center transition-all cursor-pointer select-none border-border bg-white hover:border-primary/50"
              onDragOver={onDragOver} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">Glissez vos fichiers GPX ici</p>
              <p className="text-sm text-muted-foreground mb-6">ou cliquez pour parcourir</p>
              <Button variant="outline" type="button">Choisir des fichiers</Button>
              <p className="text-xs text-muted-foreground mt-5">Formats .gpx, .xml — plusieurs traces possibles</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".gpx,.xml" multiple className="hidden" onChange={onFileChange} />
          </div>
        ) : (
          /* ── Editor screen ── */
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-8 items-start">

            {/* T4: Canvas column — sticky on large screens */}
            <div className="flex flex-col items-center gap-3 lg:sticky lg:top-[4.5rem] lg:self-start">
              {/* Zoom + info bar */}
              <div className="flex items-center gap-3 w-full max-w-[640px]">
                <p className="text-xs text-muted-foreground flex-1">
                  {addingType
                    ? <span className="font-medium text-primary">Cliquez sur la carte — {POI_META[addingType].label}</span>
                    : 'Aperçu — 2480 × 3508 px (A4 @ 300 dpi)'}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setCanvasZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                    className="w-7 h-7 rounded border border-border text-sm font-bold hover:bg-muted leading-none">−</button>
                  <span className="text-xs w-10 text-center text-muted-foreground">{Math.round(canvasZoom * 100)} %</span>
                  <button type="button" onClick={() => setCanvasZoom(z => Math.min(3, +(z + 0.25).toFixed(2)))}
                    className="w-7 h-7 rounded border border-border text-sm font-bold hover:bg-muted leading-none">+</button>
                  {canvasZoom !== 1 && (
                    <button type="button" onClick={() => setCanvasZoom(1)}
                      className="text-xs text-muted-foreground hover:text-foreground underline ml-1">reset</button>
                  )}
                </div>
              </div>

              {/* T2: Canvas scroll container — inner canvas centred with mx-auto */}
              <div style={{
                width: '100%', maxWidth: 640,
                maxHeight: '80vh',
                overflowX: canvasZoom > 1 ? 'auto' : 'hidden',
                overflowY: canvasZoom > 1 ? 'auto' : 'hidden',
                borderRadius: 4,
                boxShadow: '0 12px 48px -8px rgba(0,0,0,0.22)',
                outline: addingType ? '3px solid hsl(var(--primary))' : 'none',
                position: 'relative',
              }}>
                {/* mx-auto centres the inner div when zoom ≤ 1 (no overflow) */}
                <div style={{
                  width: `${Math.round(420 * canvasZoom)}px`,
                  margin: canvasZoom <= 1 ? '0 auto' : undefined,
                }}>
                  <canvas
                    ref={canvasRef} width={POSTER_W} height={POSTER_H}
                    onClick={handleCanvasClick}
                    style={{ width: '100%', height: 'auto', display: 'block',
                      borderRadius: canvasZoom <= 1 ? 4 : 0,
                      cursor: addingType ? 'crosshair' : 'default' }}
                  />
                </div>
                {isRendering && (
                  <div style={{ position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.35)',borderRadius:4 }}>
                    <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                    <span className="text-white text-sm font-medium">Rendu… {Math.round(renderProgress)} %</span>
                  </div>
                )}
              </div>

              {/* Pending POI name entry */}
              {pendingClick && (
                <div className="w-full max-w-[420px] bg-white border rounded-xl p-4 shadow-lg space-y-3">
                  <p className="text-sm font-medium">Nouveau point d'intérêt</p>
                  <div className="flex gap-2">
                    {/* T7: controlled select pre-filled with the type the user clicked */}
                    <select
                      value={newPoiType}
                      onChange={e => setNewPoiType(e.target.value as PoiType)}
                      className="border rounded-md px-2 py-1.5 text-sm">
                      {(Object.keys(POI_META) as PoiType[]).map(t => (
                        <option key={t} value={t}>{POI_META[t].label}</option>
                      ))}
                    </select>
                    <Input value={newPoiName} onChange={e => setNewPoiName(e.target.value)}
                      placeholder="Nom du point…" className="flex-1"
                      onKeyDown={e => { if (e.key === 'Enter') confirmNewPoi(); if (e.key === 'Escape') setPendingClick(null); }}
                      autoFocus />
                    <Button size="sm" onClick={confirmNewPoi} disabled={!newPoiName.trim()}>Ajouter</Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingClick(null)}>✕</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-4">

              {/* Title */}
              <Card><CardContent className="pt-5 pb-5 space-y-2">
                <Label htmlFor="title">Titre du poster</Label>
                <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Nom de votre trace…" />
              </CardContent></Card>

              {/* Colours */}
              <Card><CardContent className="pt-5 pb-5 space-y-4">
                <Label>Palette & couleurs</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PALETTES.map(p => (
                    <button key={p.id} type="button" title={p.name}
                      onClick={() => selectPalette(p)}
                      style={{ background: p.bg }}
                      className={['h-9 rounded-lg border-2 transition-all flex items-center justify-center',
                        palette.id === p.id && !bgColor ? 'border-foreground scale-110 shadow-md' : 'border-transparent hover:border-muted-foreground'].join(' ')}>
                      <span className="block w-4 h-1 rounded-full" style={{ background: p.track }} />
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Fond',          val: bgColor    ?? effectivePalette.bg,    set: setBgColor },
                    { label: 'Trace',         val: trackColor ?? effectivePalette.track, set: setTrackColor },
                    { label: 'Texte / Profil',val: titleColor ?? effectivePalette.title, set: setTitleColor },
                  ].map(({ label, val, set }) => (
                    <div key={label} className="flex items-center gap-3">
                      <input type="color" value={val} onChange={e => set(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 bg-white" />
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <code className="text-xs ml-auto text-muted-foreground">{val.toUpperCase()}</code>
                    </div>
                  ))}
                </div>
              </CardContent></Card>

              {/* Font + size */}
              <Card><CardContent className="pt-5 pb-5 space-y-3">
                <Label>Police</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map(f => (
                    <div key={f.id} className="flex flex-col gap-1">
                      <button type="button" onClick={() => setFont(f)}
                        className={['px-3 py-2 rounded-lg border text-sm font-medium transition-all text-left',
                          font.id === f.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-muted-foreground'].join(' ')}>
                        {f.name}
                        {f.requiresUpload && !registaLoaded && (
                          <span className="text-xs ml-1 text-muted-foreground">(upload requis)</span>
                        )}
                        {f.requiresUpload && registaLoaded && (
                          <span className="text-xs ml-1 text-emerald-600">✓</span>
                        )}
                      </button>
                      {/* T5: Show upload button when Regista is selected and not yet loaded */}
                      {f.requiresUpload && font.id === f.id && !registaLoaded && (
                        <div className="flex items-center gap-2">
                          <input ref={fontUploadRef} type="file" accept=".ttf,.otf,.woff,.woff2"
                            className="hidden" onChange={handleFontUpload} />
                          <button type="button"
                            onClick={() => fontUploadRef.current?.click()}
                            className="text-xs px-2 py-1 border rounded hover:bg-muted transition-colors w-full">
                            Uploader Regista (.ttf / .woff)
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="space-y-2 pt-1">
                  {[
                    { label: 'Titre',       val: titleSizeMult, set: setTitleSizeMult },
                    { label: 'Stats km/D+', val: statsSizeMult, set: setStatsSizeMult },
                  ].map(({ label, val, set }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
                      <input type="range" min={0.5} max={1.8} step={0.05} value={val}
                        onChange={e => set(parseFloat(e.target.value))}
                        className="flex-1 accent-primary h-1.5" />
                      <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(val * 100)} %</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>

              {/* Traces */}
              <Card><CardContent className="pt-5 pb-5 space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Traces ({tracks.length})</Label>
                  <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={() => fileInputRef.current?.click()}>
                    <Plus className="h-3 w-3" /> Ajouter
                  </button>
                </div>
                <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {tracks.map((t, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm bg-muted rounded-md px-3 py-1.5">
                      <span className="truncate font-medium flex-1">{t.name}</span>
                      <button type="button" className="text-muted-foreground hover:text-destructive"
                        onClick={() => setTracks(prev => prev.filter((_,idx) => idx !== i))}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <input ref={fileInputRef} type="file" accept=".gpx,.xml" multiple className="hidden" onChange={onFileChange} />
                <div className="grid grid-cols-2 gap-2 text-sm pt-1">
                  <div className="bg-muted rounded-md p-2.5">
                    <p className="text-muted-foreground text-xs">Distance</p>
                    <p className="font-semibold">{totalDistKm.toFixed(2)} km</p>
                  </div>
                  <div className="bg-muted rounded-md p-2.5">
                    <p className="text-muted-foreground text-xs">Dénivelé +</p>
                    <p className="font-semibold">{Math.round(totalEleGain)} m</p>
                  </div>
                </div>
              </CardContent></Card>

              {/* Points d'intérêt */}
              <Card><CardContent className="pt-5 pb-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* T3: toggle to show/hide POIs */}
                    <input type="checkbox" id="show-pois" checked={showPois}
                      onChange={e => setShowPois(e.target.checked)}
                      className="rounded" />
                    <Label htmlFor="show-pois" className="flex items-center gap-1.5 cursor-pointer">
                      Sommets, villes, cols
                      {isFetchingPois && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </Label>
                  </div>
                  <button type="button" className="text-xs text-muted-foreground hover:text-primary underline"
                    onClick={() => {
                      const allPts = tracks.flatMap(t => t.points);
                      const lats = allPts.map(p => p.lat); const lons = allPts.map(p => p.lon);
                      setIsFetchingPois(true);
                      fetchPoisAlongTrack(Math.min(...lats),Math.max(...lats),Math.min(...lons),Math.max(...lons),allPts)
                        .then(d => { setPois([...topPois(d), ...pois.filter(p => p.userAdded)]); setIsFetchingPois(false); })
                        .catch(() => setIsFetchingPois(false));
                    }}>
                    Rafraîchir
                  </button>
                </div>

                {/* Add marker buttons */}
                <div className="flex gap-1 flex-wrap">
                  {(Object.keys(POI_META) as PoiType[]).map(t => (
                    <button key={t} type="button"
                      onClick={() => setAddingType(prev => prev === t ? null : t)}
                      className={['flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                        addingType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary'].join(' ')}>
                      {POI_META[t].icon} {POI_META[t].label}
                    </button>
                  ))}
                </div>

                {/* POI list */}
                <ul className="space-y-1 max-h-52 overflow-y-auto pr-1">
                  {pois.length === 0 && !isFetchingPois && (
                    <li className="text-xs text-muted-foreground py-2 text-center">
                      {/* T6: updated empty state message */}
                      Cliquez sur la carte pour ajouter un nouveau point d'intérêt
                    </li>
                  )}
                  {pois.map(poi => (
                    <li key={poi.id} className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5">
                      <input type="checkbox" checked={poi.visible}
                        onChange={e => setPois(prev => prev.map(p => p.id === poi.id ? {...p, visible: e.target.checked} : p))}
                        className="shrink-0" />
                      <span className={POI_META[poi.type].color}>{POI_META[poi.type].icon}</span>
                      {editingPoiId === poi.id ? (
                        <input autoFocus value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { setPois(prev => prev.map(p => p.id === poi.id ? {...p, name: editingName} : p)); setEditingPoiId(null); }
                            if (e.key === 'Escape') setEditingPoiId(null);
                          }}
                          className="flex-1 bg-white border rounded px-1 py-0.5 text-xs" />
                      ) : (
                        <span className="flex-1 truncate">{poi.name}</span>
                      )}
                      {editingPoiId === poi.id ? (
                        <button type="button" className="text-primary"
                          onClick={() => { setPois(prev => prev.map(p => p.id === poi.id ? {...p, name: editingName} : p)); setEditingPoiId(null); }}>
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button type="button" className="text-muted-foreground hover:text-foreground"
                          onClick={() => { setEditingPoiId(poi.id); setEditingName(poi.name); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button type="button" className="text-muted-foreground hover:text-destructive"
                        onClick={() => setPois(prev => prev.filter(p => p.id !== poi.id))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent></Card>

              {/* Sidebar download (secondary, full-format picker) */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <div className="flex gap-1">
                  <Button size="lg" className="flex-1 gap-2" disabled={isRendering || !hasTrack}
                    onClick={() => handleDownload('png')}>
                    <Download className="h-5 w-5" /> Télécharger PNG
                  </Button>
                  <Button size="lg" variant="outline" disabled={isRendering || !hasTrack}
                    className="px-3" onClick={() => setShowDownloadMenu(v => !v)}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>
                {showDownloadMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-10 overflow-hidden w-44">
                    {(['png','jpeg','pdf'] as const).map(fmt => (
                      <button key={fmt} type="button"
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition-colors font-medium"
                        onClick={() => handleDownload(fmt)}>
                        {fmt === 'png' ? '🖼  PNG haute-res' : fmt === 'jpeg' ? '📷  JPEG' : '📄  PDF A4'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button variant="outline" className="w-full"
                onClick={() => { setTracks([]); setTitle(''); setPois([]); }}>
                Recommencer
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
