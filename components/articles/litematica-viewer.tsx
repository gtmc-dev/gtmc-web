'use client';

import { useEffect, useRef } from 'react';
import { CornerBrackets } from '@/components/ui/corner-brackets';

interface LitematicaViewerProps {
  url: string;
  height?: string | number;
}

export default function LitematicaViewer({ url, height = 400 }: LitematicaViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<any>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cleanUrl = url.replace(/\r?\n/g, '');
    let renderer: any = null;

    const proxyUrl = "/api/litematica-download?url=" + encodeURIComponent(cleanUrl);

    const initRenderer = async () => {
      try {
        const mod = await import('schematic-renderer');
        const SR = mod.SchematicRenderer || (mod as any).default?.SchematicRenderer || (mod as any).default;
        
        renderer = new SR(
          canvasRef.current!,
          {},
          {
            "default": async () => {
              const res = await fetch("/pack.zip");
              return await res.blob();
            }
          },
          {
            showGrid: true,
            backgroundColor: 0xf8f9fc,
            cameraOptions: { position: [10, 10, 10] },
            callbacks: {
              onRendererInitialized: async (r: any) => {
                try {
                  // Fetch the file buffer ourselves
                  const res = await fetch(proxyUrl);
                  if (!res.ok) throw new Error("Failed to fetch proxy: " + res.status);
                  const arrayBuffer = await res.arrayBuffer();

                  // Pass the ArrayBuffer to loadSchematic (fixes extension parsing issues on query str URLs)
                  const fileName = cleanUrl.split('/').pop() || 'schem.litematic';
                  // loadSchematic(name, buffer)
                  await r.schematicManager.loadSchematic(fileName, arrayBuffer);
                  
                  r.cameraManager.focusOnSchematics();
                } catch (err) {
                  console.error("Error loading schematic:", err);
                }
              },
              onSchematicFileLoadFailure: (err: any) => {
                 console.error("Failed to load schematic file:", err);
              }
            }
          }
        );
        
        rendererRef.current = renderer;
      } catch (e) {
        console.error("Error setting up schematic-renderer:", e);
      }
    };

    initRenderer();

    return () => {
      if (rendererRef.current && typeof rendererRef.current.dispose === 'function') {
        rendererRef.current.dispose();
      }
    };
  }, [url]);

  return (
    <div className="w-full relative rounded-sm border-2 border-tech-main/20 bg-tech-bg font-mono group my-8">
      <CornerBrackets size="size-4" color="border-tech-main/40" />
      
      <canvas
        ref={canvasRef}
        className="cursor-pointer active:cursor-move w-full block"
        style={{ height: typeof height === 'number' ? height + 'px' : height }}
      />

      {/* Top Header / Badge */}
      <div className="absolute top-4 left-4 flex items-center gap-3 pointer-events-none">
        <span className="shrink-0 border border-tech-main/40 bg-white/70 text-tech-main px-2 py-0.5 text-xs font-bold tracking-wider shadow-sm backdrop-blur">
          [LITEMATICA]
        </span>
        <span className="text-[10px] text-tech-main/80 tracking-widest uppercase hidden md:inline-block">
          INTERACTIVE BLUEPRINT
        </span>
      </div>

      {/* Controls Guide Overlay */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none transition-opacity duration-300 opacity-80 group-hover:opacity-100">
        <div className="bg-white/80 backdrop-blur-md border border-tech-main/20 text-tech-main/80 text-xs px-3 py-1.5 shadow-sm flex items-center gap-4 rounded-sm whitespace-nowrap">
          <span className="flex items-center gap-1.5">
            <kbd className="border border-tech-main/30 bg-white px-1.5 py-0.5 rounded-[2px] text-[10px] font-sans shadow-sm text-tech-main font-semibold">左键</kbd> 旋转
          </span>
          <span className="flex items-center gap-1.5 opacity-60">|</span>
          <span className="flex items-center gap-1.5">
            <kbd className="border border-tech-main/30 bg-white px-1.5 py-0.5 rounded-[2px] text-[10px] font-sans shadow-sm text-tech-main font-semibold">右键</kbd> 平移
          </span>
          <span className="flex items-center gap-1.5 opacity-60">|</span>
          <span className="flex items-center gap-1.5">
            <kbd className="border border-tech-main/30 bg-white px-1.5 py-0.5 rounded-[2px] text-[10px] font-sans shadow-sm text-tech-main font-semibold">滚轮</kbd> 缩放
          </span>
        </div>
      </div>
    </div>
  );
}
