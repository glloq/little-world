/** Reused glyph catalog for the bag V3, commerce and harbour imports. */
export const ITEM_ICONS:Readonly<Record<string,string>>={
  'food:apple':'🍎','food:pear':'🍐','food:plum':'●','food:cherry':'🍒',
  'food:berry':'🫐','food:hazelnut':'🌰','food:walnut':'🌰','farm:carrot':'🥕',
  'farm:pumpkin':'🎃','food:potato':'🥔','food:chanterelle':'🍄',
  'food:cepe':'🍄','food:cheese':'🧀','food:bread':'🍞','food:jam':'🍯','food:soup':'🥣',
  'tool:pickaxe':'⛏','tool:pickaxe-steel':'⛏','tool:axe':'🪓',
  'tool:miners-helmet':'⛑','tool:fishing-rod':'🎣','tool:surfboard':'🏄',
  'instrument:flute':'♫','instrument:ocarina':'♫','instrument:ukulele':'♫',
  'coin':'🪙','wood:log':'🪵','mine:earth':'▧','mine:stone':'🪨','mine:iron':'◆','mine:crystal':'💎',
  'farm:wheat':'🌾','seed:wheat':'🌾','seed:carrot':'🥕','seed:pumpkin':'🎃',
  'forage:mushroom':'🍄','forage:flower':'🌸','forage:reed':'🌿',
  'fish:trout':'🐟','fish:perch':'🐟','fish:carp':'🐟','fish:mackerel':'🐟',
  'fish:sardine':'🐟','fish:seabass':'🐟','fish:golden':'🐠',
  'material:flour':'🌾','material:plank':'🪵','material:stone-block':'🧱',
  'material:iron-ingot':'▰','material:reed-fibre':'🌿','item:reed-basket':'🧺',
  'item:wooden-crate':'📦',
};
export const CATEGORY_ICONS:Readonly<Record<string,string>>={mine:'◆',nature:'❀',farm:'❧',graines:'✿',argent:'●',bois:'▤',cueillette:'❀',poisson:'♓',quest:'✦',mission:'✦',outil:'⚒',instrument:'♫'};
export function itemIcon(item:{id:string;category:string}):string{return ITEM_ICONS[item.id]??CATEGORY_ICONS[item.category]??'⬡';}
