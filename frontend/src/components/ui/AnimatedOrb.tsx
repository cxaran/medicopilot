/*
 * AnimatedOrb — el orbe gradiente animado, elemento de marca de MediCopilot.
 * Portado de la funcion `orb(size, variant)` de MediCopilot.dc.html:
 * un contenedor circular con rotacion de matiz (hue-rotate), cinco circulos
 * de colores en orbita bajo una capa de desenfoque, y un brillo superior.
 *
 * Difiere del handoff SOLO en la composicion de capas (misma apariencia):
 * la sombra vive en un wrapper SIN filter y el desenfoque es un blur ESTATICO
 * en su propia capa, con el hue-rotate animado por encima. Animar
 * `filter: blur() hue-rotate()` en un mismo elemento (y la sombra dentro del
 * elemento filtrado) obliga a Chrome a re-rasterizar blur y box-shadow en cada
 * frame, y en Windows la sombra se pinta de forma inestable o desaparece.
 *
 * Es marcado puro (sin estado ni hooks), valido tanto en arboles server como
 * client. Las animaciones viven en globals.css (orb-hue-rotate y orb-orbit-1..5).
 */
import type { CSSProperties } from "react";

type OrbVariant = "default" | "red";

const PALETTES: Record<OrbVariant, { bg: string; cols: [string, string, string, string, string] }> = {
  default: { bg: "#cff1f4", cols: ["#9e9fef", "#c471ec", "#9bc761", "#ccd4f2", "#f472b6"] },
  red: { bg: "#fef2f2", cols: ["#ef4444", "#f87171", "#dc2626", "#fca5a5", "#fb7185"] },
};

const CIRCLE_SCALE = [0.45, 0.35, 0.5, 0.25, 0.3] as const;
const CIRCLE_OPACITY = [0.9, 0.85, 0.9, 0.8, 0.85] as const;

export type AnimatedOrbProps = {
  /** Diametro del orbe en px (116 hero, 84 login, 40 enviar, 30 marca/chat). */
  size?: number;
  variant?: OrbVariant;
  className?: string;
  style?: CSSProperties;
};

export function AnimatedOrb({ size = 30, variant = "default", className, style }: AnimatedOrbProps) {
  const palette = PALETTES[variant];
  const blur = Math.max(5, size * 0.15);

  return (
    // La sombra vive aqui, FUERA de todo elemento con filter: un filter animado en el
    // mismo elemento re-rasteriza su box-shadow cada frame y Chrome/Windows la pinta mal.
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "0 0 auto",
        boxShadow: "rgba(17,12,46,.12) 0px 12px 26px 0px",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          overflow: "hidden",
          backgroundColor: palette.bg,
          animation: "orb-hue-rotate 8s linear infinite",
          willChange: "filter",
        }}
      >
        {/* Matiz animado (reverse, como el handoff) sobre una capa de blur ESTATICO:
            equivale a blur(N) hue-rotate(x) pero sin re-rasterizar el blur cada frame. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            animation: "orb-hue-rotate 6s linear infinite reverse",
            willChange: "filter",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              filter: `blur(${blur}px)`,
            }}
          >
            {palette.cols.map((color, i) => (
              <div
                key={color}
                className={`orb-c${i + 1}`}
                style={{
                  position: "absolute",
                  borderRadius: "50%",
                  width: size * CIRCLE_SCALE[i],
                  height: size * CIRCLE_SCALE[i],
                  opacity: CIRCLE_OPACITY[i],
                  backgroundColor: color,
                }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            pointerEvents: "none",
            background: "linear-gradient(to bottom, rgba(255,255,255,.4) 0%, transparent 100%)",
          }}
        />
      </div>
    </div>
  );
}
