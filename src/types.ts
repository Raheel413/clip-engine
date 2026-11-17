export type Shot = {
  kind: 'clip' | 'image' | 'receipt';
  q?: string;              // search query for the hunter
  from?: string[];         // where to look: youtube, tiktok, instagram, pinterest, web, commons
  at?: number;             // word index in the line where this shot starts
  url?: string;            // receipts: page or PDF to screenshot; or a direct link to use as-is
  find?: string;           // receipts: the words to highlight
  page?: number;           // receipts: PDF page
  // filled by the hunter / receipts script
  src?: string;            // file inside the film folder, e.g. assets/b03-0.mp4
  credit?: string;         // shown bottom-left at 50 %
  source?: string;         // page the asset came from (goes in the credits file)
  w?: number;
  h?: number;
  dur?: number;            // clip length in seconds
  highlight?: {x: number; y: number; w: number; h: number};
};

export type Beat = {
  seg: 'hook' | 'title' | 'stats' | 'action' | 'tier' | 'wheel' | 'outro';
  text?: string;
  title?: string;
  shots?: Shot[];
  note?: string;           // italic caveat footnote
  note_at?: number;
  tier?: {item: string; row: string};
  wheel?: {names: string[]; pick: string};
  vo?: string;
  vo_dur?: number;
};

export type Film = {
  id?: string;
  title: string;
  fps?: number;
  voice?: string;
  hero?: string;
  tier_title?: string;
  tiers?: {label: string; color: string}[];
  opponents?: {name: string; thumb?: Shot}[];
  beats: Beat[];
};
