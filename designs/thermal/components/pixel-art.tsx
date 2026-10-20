import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';

import {
  ACTIVE_MARKER_XML,
  CAYENNE_XML,
  CORNER_XML,
  CROSSHAIR_XML,
  FLAME_LARGE_XML,
  FLAME_SMALL_XML,
  JALAPENO_XML,
  LEADER_XML,
  PEPPER_SMALL_XML,
  PEPPER_VIVID_XML,
  SCROLL_XML,
} from '../assets/pixel-art-xml';
import type { HeatLevel } from '../lib/heat-levels';

const ART = {
  activeMarker: { xml: ACTIVE_MARKER_XML, width: 15, height: 9 },
  corner: { xml: CORNER_XML, width: 24, height: 24 },
  pepperSmall: { xml: PEPPER_SMALL_XML, width: 18, height: 24 },
  pepperVivid: { xml: PEPPER_VIVID_XML, width: 19, height: 28.5 },
  jalapeno: { xml: JALAPENO_XML, width: 18, height: 24 },
  flameSmall: { xml: FLAME_SMALL_XML, width: 15, height: 18 },
  flameLarge: { xml: FLAME_LARGE_XML, width: 30, height: 36 },
  scroll: { xml: SCROLL_XML, width: 18, height: 18 },
  crosshair: { xml: CROSSHAIR_XML, width: 28, height: 28 },
  leader: { xml: LEADER_XML, width: 44, height: 24 },
} as const;

export type PixelArtName = keyof typeof ART;

interface PixelArtProps {
  name: PixelArtName;
  /** Scales the artwork; defaults to the Figma size */
  width?: number;
}

export function PixelArt({ name, width }: PixelArtProps) {
  const art = ART[name];
  const renderWidth = width ?? art.width;
  const renderHeight = (renderWidth / art.width) * art.height;

  return <SvgXml xml={art.xml} width={renderWidth} height={renderHeight} />;
}

interface HeatPepperProps {
  level: HeatLevel;
  width?: number;
  /** Renders a solid single-color silhouette (used for the hard drop shadow) */
  silhouette?: string;
}

/** The big Cayenne pixel pepper, re-tinted per heat level */
export function HeatPepper({ level, width = 108, silhouette }: HeatPepperProps) {
  const xml = useMemo(() => {
    if (silhouette) return CAYENNE_XML.replace(/fill="(?!none)[^"]*"/g, `fill="${silhouette}"`);
    return CAYENNE_XML.replace('#E54545', level.color).replace('#2E8B45', level.stemColor);
  }, [level.color, level.stemColor, silhouette]);

  return <SvgXml xml={xml} width={width} height={(width / 108) * 144} />;
}
