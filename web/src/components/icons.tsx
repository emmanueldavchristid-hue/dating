import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number; title?: string };

function make(name: string, paths: ReactNode, opts: { fill?: boolean } = {}) {
  function Icon({ size = 20, title, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={opts.fill ? "currentColor" : "none"}
        stroke={opts.fill ? "none" : "currentColor"}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden={title ? undefined : true}
        role={title ? "img" : undefined}
        focusable="false"
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {paths}
      </svg>
    );
  }
  Icon.displayName = `Icon${name}`;
  return Icon;
}

export const IconCompass = make("Compass", <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>);
export const IconMap = make("Map", <><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z" /><path d="M9 4v14M15 6v14" /></>);
export const IconGem = make("Gem", <><path d="M6 3h12l3 6-9 12L3 9z" /><path d="M3 9h18M9.5 3 8 9l4 12 4-12-1.5-6" /></>);
export const IconConcierge = make("Concierge", <><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" /><path d="M12 8.2v.01M12 8.5l.9 2 2.1.4-1.6 1.4.4 2.1L12 13.4l-1.8 1 .4-2.1L9 10.9l2.1-.4z" /></>);
export const IconUser = make("User", <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.2-4 4.2-6 8-6s6.8 2 8 6" /></>);
export const IconSearch = make("Search", <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></>);
export const IconSliders = make("Sliders", <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>);
export const IconX = make("X", <path d="M6 6l12 12M18 6 6 18" />);
export const IconCheck = make("Check", <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconChevronLeft = make("ChevronLeft", <path d="m15 5-7 7 7 7" />);
export const IconChevronRight = make("ChevronRight", <path d="m9 5 7 7-7 7" />);
export const IconChevronDown = make("ChevronDown", <path d="m5 9 7 7 7-7" />);
export const IconChevronUp = make("ChevronUp", <path d="m5 15 7-7 7 7" />);
export const IconArrowRight = make("ArrowRight", <path d="M5 12h14M13 6l6 6-6 6" />);
export const IconArrowLeft = make("ArrowLeft", <path d="M19 12H5M11 6l-6 6 6 6" />);
export const IconLocate = make("Locate", <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="8" /></>);
export const IconPin = make("Pin", <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>);
export const IconStar = make("Star", <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />);
export const IconStarFilled = make("StarFilled", <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />, { fill: true });
export const IconHeart = make("Heart", <path d="M12 20s-7.5-4.6-9-9.5C2 6.9 4.4 4 7.5 4c2 0 3.5 1.1 4.5 2.6C13 5.1 14.5 4 16.5 4 19.6 4 22 6.9 21 10.5 19.5 15.4 12 20 12 20z" />);
export const IconHeartFilled = make("HeartFilled", <path d="M12 20s-7.5-4.6-9-9.5C2 6.9 4.4 4 7.5 4c2 0 3.5 1.1 4.5 2.6C13 5.1 14.5 4 16.5 4 19.6 4 22 6.9 21 10.5 19.5 15.4 12 20 12 20z" />, { fill: true });
export const IconShare = make("Share", <><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></>);
export const IconRoute = make("Route", <><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5" /></>);
export const IconFlag = make("Flag", <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>);
export const IconClock = make("Clock", <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconLock = make("Lock", <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>);
export const IconCrown = make("Crown", <><path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5z" /></>);
export const IconPlus = make("Plus", <path d="M12 5v14M5 12h14" />);
export const IconMinus = make("Minus", <path d="M5 12h14" />);
export const IconTrash = make("Trash", <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>);
export const IconBookmark = make("Bookmark", <path d="M6 3h12v18l-6-4-6 4z" />);
export const IconFolder = make("Folder", <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />);
export const IconExternal = make("External", <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>);
export const IconSend = make("Send", <path d="M4 12 20 4l-4 16-4-6.5zM12 13.5 20 4" />);
export const IconInfo = make("Info", <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>);
export const IconAlert = make("Alert", <><path d="M12 3 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.01" /></>);
export const IconWifi = make("Wifi", <><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" /><path d="M12 19.5v.01" /></>);
export const IconParking = make("Parking", <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M9.5 17V7.5h3.2a2.8 2.8 0 0 1 0 5.6H9.5" /></>);
export const IconWheelchair = make("Wheelchair", <><circle cx="12" cy="4.5" r="1.5" /><path d="M12 7.5v6h5l2 5" /><path d="M8.5 10.5a5.5 5.5 0 1 0 7.2 7" /></>);
export const IconCard = make("Card", <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></>);
export const IconPhone = make("Phone", <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></>);
export const IconTree = make("Tree", <><path d="M12 21v-6" /><path d="M12 3c3.5 0 6 2.7 6 6 0 3.6-2.7 6-6 6s-6-2.4-6-6c0-3.3 2.5-6 6-6z" /></>);
export const IconGlobe = make("Globe", <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" /></>);
export const IconLogout = make("Logout", <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>);
export const IconDownload = make("Download", <><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" /><path d="M5 19h14" /></>);
export const IconShield = make("Shield", <><path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></>);
export const IconCalendar = make("Calendar", <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>);
export const IconSettings = make("Settings", <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconRefresh = make("Refresh", <><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></>);
export const IconSparkle = make("Sparkle", <><path d="M12 3c.8 4.2 2.8 6.2 7 7-4.2.8-6.2 2.8-7 7-.8-4.2-2.8-6.2-7-7 4.2-.8 6.2-2.8 7-7z" /><path d="M19 16.5c.3 1.4.9 2 2.2 2.3-1.3.3-1.9.9-2.2 2.2-.3-1.3-.9-1.9-2.2-2.2 1.3-.3 1.9-.9 2.2-2.3z" /></>);
export const IconMenu = make("Menu", <path d="M4 7h16M4 12h16M4 17h16" />);
export const IconGrip = make("Grip", <><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></>);
export const IconCopy = make("Copy", <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>);
export const IconWallet = make("Wallet", <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="17" height="11" rx="2.5" /><path d="M16.5 13.5h.01" /></>);
export const IconEdit = make("Edit", <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>);
export const IconUsers = make("Users", <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.9-3.4 3.4-5 6.5-5s5.6 1.6 6.5 5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15.3c1.7.6 3 2.1 3.5 4.7" /></>);
export const IconList = make("List", <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />);
export const IconHistory = make("History", <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" /><path d="M3.5 4v4.5H8M12 8v4l3 2" /></>);
export const IconChart = make("Chart", <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />);

// --- Glyphes de catégories ---
export const IconFork = make("Fork", <><path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5a2 2 0 0 0 2 2M9 3v5a2 2 0 0 1-2 2" /><path d="M17 21V3c-2 1-3.5 3.5-3.5 7.5 0 1.4.9 2.5 2.2 2.5H17" /></>);
export const IconFlame = make("Flame", <path d="M12 21c-3.9 0-7-2.8-7-6.6 0-2.9 1.8-5 3.4-6.6.3 1.8 1.2 3 2.3 3.5C10.5 7.6 12 4.6 14.5 3c-.3 3.3 4.5 5.8 4.5 11.4 0 3.8-3.1 6.6-7 6.6z" />);
export const IconSofa = make("Sofa", <><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" /><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" /><path d="M5 18v2M19 18v2" /></>);
export const IconRooftop = make("Rooftop", <><path d="M4 21V10l5-3v14M9 21V5l7-2v18M16 21v-9l4 2v7" /><path d="M2 21h20" /><path d="M19.5 3.5a2 2 0 0 0 1.5 3 2.5 2.5 0 1 1-1.5-3z" /></>);
export const IconBeach = make("Beach", <><path d="M2 20c2 0 2-1.2 4-1.2s2 1.2 4 1.2 2-1.2 4-1.2 2 1.2 4 1.2 2-1.2 4-1.2" /><path d="M13 17 9.5 7" /><path d="M3.5 9.5C5 4.7 10.8 2.6 15.5 4.7c1.4.6 2.6 1.6 3.5 2.8z" /></>);
export const IconLeaf = make("Leaf", <><path d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15z" /><path d="M5 19 13 11" /></>);
export const IconCocktail = make("Cocktail", <><path d="M4 4h16l-8 9z" /><path d="M12 13v7M8 20h8M7 7.5h10" /></>);
export const IconCup = make("Cup", <><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" /><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3.5c-.5.8-.5 1.7 0 2.5M12 3.5c-.5.8-.5 1.7 0 2.5" /></>);
export const IconTicket = make("Ticket", <><path d="M3 8.5V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v2a2.5 2.5 0 0 0 0 5v2a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-2a2.5 2.5 0 0 0 0-5z" /><path d="M14 5v2M14 11v2M14 17v2" /></>);
export const IconMasks = make("Masks", <><path d="M3 4.5c3 1.5 6 1.5 9 0v6a4.5 4.5 0 0 1-9 0z" /><path d="M12 9c3 1.5 6 1.5 9 0v6a4.5 4.5 0 0 1-9 0" /><path d="M5.5 8.5h.01M9.5 8.5h.01M14.5 13h.01M18.5 13h.01M15 17c1 .7 2 .7 3 0M6 12c.8-.6 1.7-.6 2.5 0" /></>);
export const IconMusic = make("Music", <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>);
export const IconSpa = make("Spa", <><path d="M12 20c-4.4 0-8-2.7-8-7 2.5 0 5 1.2 8 4.5 3-3.3 5.5-4.5 8-4.5 0 4.3-3.6 7-8 7z" /><path d="M12 17.5c-2-2.5-2.5-6-0-11 2.5 5 2 8.5 0 11z" /></>);
export const IconLandmark = make("Landmark", <><path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>);

type GlyphComponent = (p: IconProps) => React.JSX.Element;

const GLYPH_RULES: [RegExp, GlyphComponent][] = [
  [/maquis|grill|braise|garba|alloco/, IconFlame],
  [/resto|restaurant|food|cuisine|fork|utensil|gastro/, IconFork],
  [/lounge|sofa|chill|cosy/, IconSofa],
  [/roof|terrasse|skyline|vue/, IconRooftop],
  [/plage|beach|mer|wave|umbrella|bord/, IconBeach],
  [/nature|parc|park|leaf|tree|jardin|foret|forêt|eco/, IconLeaf],
  [/bar|cocktail|wine|glass|club|nuit|night/, IconCocktail],
  [/caf|coffee|cup|brunch|^th[eé]$|patiss/, IconCup],
  [/spa|bien|wellness|detente|détente|relax/, IconSpa],
  [/musique|music|concert|live|jazz/, IconMusic],
  [/event|evenement|événement|agenda|calendar|festival/, IconCalendar],
  [/culture|musee|musée|museum|art|galerie|theatre|théâtre|landmark|masks/, IconLandmark],
  [/activ|loisir|sport|jeu|game|ticket|fun|kart|bowling/, IconTicket],
];

/** Glyphe d'une catégorie (slug ou nom d'icône fourni par l'API), avec repli. */
export function categoryGlyph(key: string | null | undefined): GlyphComponent {
  const k = (key ?? "").toLowerCase();
  for (const [re, Comp] of GLYPH_RULES) if (re.test(k)) return Comp;
  return IconSparkle;
}

export function CategoryIcon({ slug, icon, ...rest }: IconProps & { slug?: string; icon?: string | null }) {
  const Glyph = categoryGlyph(icon && categoryGlyph(icon) !== IconSparkle ? icon : slug);
  return <Glyph {...rest} />;
}
