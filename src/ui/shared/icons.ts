/** Tiny, consistent HUD vector icons: no font, texture or third-party runtime. */
export type HudIcon='menu'|'backpack'|'journal'|'volume'|'mute'|'pin'|'map'|'flag';
const PATHS:Record<HudIcon,string[]>={
  menu:['M4 6h16','M4 12h16','M4 18h16'],
  backpack:['M7 8V6a5 5 0 0 1 10 0v2','M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z','M9 8v2','M15 8v2','M9 15h6v3H9z'],
  journal:['M12 7c-2-1.6-5-2-9-1v14c4-1 7-.6 9 1 2-1.6 5-2 9-1V6c-4-1-7-.6-9 1Z','M12 7v14','M6 10h3','M15 10h3'],
  volume:['M4 10v4h4l5 4V6l-5 4H4Z','M16 9a5 5 0 0 1 0 6','M18.5 6.5a9 9 0 0 1 0 11'],
  mute:['M4 10v4h4l5 4V6l-5 4H4Z','M17 9l5 6','M22 9l-5 6'],
  pin:['M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z','M12 10a2.5 2.5 0 1 0 .001 0Z'],
  map:['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z','M9 3v15','M15 6v15'],
  flag:['M5 22V3','M5 4h14l-3 5 3 5H5'],
};
export function hudIcon(name:HudIcon):SVGSVGElement{
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','20');svg.setAttribute('height','20');
  svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');
  svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');
  svg.classList.add('ui-hud-icon');
  for(const d of PATHS[name]){const p=document.createElementNS(ns,'path');p.setAttribute('d',d);svg.append(p);}
  return svg;
}
