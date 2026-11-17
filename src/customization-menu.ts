import {
  loadAppearance,
  storeAppearance,
  toggleAccessory,
  setEmotion,
  type Accessory,
  type Appearance,
  type Emotion,
} from './character-style.ts';

import {FLIGHT_SKINS,type FlightSkin,type FlightProgress} from './gameplay/flight-progress.ts';

export interface BoostCustomization {
 status():Readonly<FlightProgress>;
 selectSkin(id:FlightSkin):void;
 selectSound(id:FlightSkin):void;
 previewSound?(id:FlightSkin):void;
}
const BOOST_TITLES:Readonly<Record<FlightSkin,string>>={classic:'Classique',cheese:'Fromage',potato:'Patate',hazelnut:'Noisette',magic:'Magique',rainbow:'Arc-en-ciel'};

const accessories: readonly {
  id: Accessory;
  icon: string;
  title: string;
  description: string;
}[] = [
  {
    id: 'hat',
    icon: '▱',
    title: 'Chapeau',
    description: 'Petit chapeau de voyage',
  },
  {
    id: 'backpack',
    icon: '▣',
    title: 'Sac à dos',
    description: 'Sac d’explorateur',
  },
  { id: 'pendant', icon: '◇', title: 'Pendentif', description: 'Gland doré' },
  { id: 'scarf', icon: '≈', title: 'Écharpe', description: 'Écharpe douce' },
  { id: 'goggles', icon: '◎', title: 'Lunettes', description: 'Lunettes d’aviateur' },
];
const emotions: readonly { id: Emotion; icon: string; title: string }[] = [
  { id: 'happy', icon: '☺', title: 'Joyeux' },
  { id: 'joyful', icon: '◡', title: 'Ravi' },
  { id: 'surprised', icon: '○', title: 'Surpris' },
  { id: 'sleepy', icon: 'ᴗ', title: 'Apaisé' },
  { id: 'determined', icon: '⌁', title: 'Déterminé' },
  { id: 'curious', icon: '⌕', title: 'Curieux' },
  { id: 'sad', icon: '⌢', title: 'Triste' },
  { id: 'tired', icon: '−', title: 'Fatigué' },
  { id: 'confused', icon: '?', title: 'Confus' },
];
export interface CustomizationMenu {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  readonly appearance: Appearance;
}
export function createCustomizationMenu(
  root: HTMLElement,
  onChange: (appearance: Appearance) => void,
  boost?:BoostCustomization,
): CustomizationMenu {
  let appearance = loadAppearance();
  let opened = false;
  const accessoryList = root.querySelector<HTMLElement>(
    '#appearance-accessories',
  );
  const emotionList = root.querySelector<HTMLElement>('#appearance-emotions');
  if (!accessoryList || !emotionList)
    throw new Error('Appearance menu containers missing');
  // The existing A-held hamster panel also owns propulsion skins and sounds.
  // Options are created once and only refreshed when the panel opens.
  const select=(name:string,action:(id:FlightSkin)=>void)=>{
    const label=document.createElement('label');label.className='appearance-boost-select';
    const title=document.createElement('span');title.textContent=name;
    const input=document.createElement('select');input.setAttribute('aria-label',name);
    for(const id of FLIGHT_SKINS){const option=document.createElement('option');option.value=id;option.textContent=BOOST_TITLES[id];input.append(option);}
    input.addEventListener('change',()=>action(input.value as FlightSkin));
    label.append(title,input);return {label,input};
  };
  let refreshBoost=()=>{};
  if(boost){
    const section=document.createElement('section');section.className='appearance-boost';
    const heading=document.createElement('h3');heading.textContent='Propulsion';
    const levels=document.createElement('small');levels.className='appearance-boost-levels';
    const skin=select('Effet visuel',id=>{if(boost.status().unlockedSkins.includes(id))boost.selectSkin(id);refreshBoost();});
    const sound=select('Son du pet',id=>{if(boost.status().unlockedSounds.includes(id)){boost.selectSound(id);boost.previewSound?.(id);}refreshBoost();});
    const line=document.createElement('div');line.className='appearance-boost-controls';line.append(skin.label,sound.label);
    section.append(heading,levels,line);
    root.querySelector('.appearance-footer')?.before(section);
    refreshBoost=()=>{
      const p=boost.status();skin.input.value=p.selectedSkin;sound.input.value=p.selectedSound;
      levels.textContent='Réserve niveau '+(p.capacityLevel+1)+' · Puissance '+(p.powerLevel+1)+' · Maîtrise '+(p.controlLevel+1);
      for(const option of Array.from(skin.input.options)){const id=option.value as FlightSkin,available=p.unlockedSkins.includes(id);option.disabled=!available;option.textContent=BOOST_TITLES[id]+(available?'':' (à débloquer)');}
      for(const option of Array.from(sound.input.options)){const id=option.value as FlightSkin,available=p.unlockedSounds.includes(id);option.disabled=!available;option.textContent=BOOST_TITLES[id]+(available?'':' (à débloquer)');}
    };
  }
  function update(value: Appearance): void {
    appearance = value;
    storeAppearance(value);
    onChange(value);
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      'button[data-accessory]',
    )) {
      const id = button.dataset.accessory as Accessory;
      const active =
        id === 'hat'
          ? value.hat
          : id === 'backpack'
            ? value.backpack
            : id === 'goggles'
              ? !!value.goggles
              : value.neckwear === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      'button[data-emotion]',
    )) {
      const active = button.dataset.emotion === value.emotion;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  for (const opt of accessories) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'appearance-choice';
    b.dataset.accessory = opt.id;
    const symbol = document.createElement('span');
    symbol.className = 'appearance-symbol';
    symbol.textContent = opt.icon;
    const words = document.createElement('span');
    words.className = 'appearance-words';
    const strong = document.createElement('strong');
    strong.textContent = opt.title;
    const small = document.createElement('small');
    small.textContent = opt.description;
    words.append(strong, small);
    b.append(symbol, words);
    b.addEventListener('click', () =>
      update(toggleAccessory(appearance, opt.id)),
    );
    accessoryList.append(b);
  }
  for (const opt of emotions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'appearance-choice';
    b.dataset.emotion = opt.id;
    const symbol = document.createElement('span');
    symbol.className = 'appearance-symbol';
    symbol.textContent = opt.icon;
    const words = document.createElement('span');
    words.className = 'appearance-words';
    const strong = document.createElement('strong');
    strong.textContent = opt.title;
    words.append(strong);
    b.append(symbol, words);
    b.addEventListener('click', () => update(setEmotion(appearance, opt.id)));
    emotionList.append(b);
  }
  update(appearance);
  return {
    open() {
      if (opened) return;
      opened = true;
      refreshBoost();
      root.classList.remove('hide');
      root.setAttribute('aria-hidden', 'false');
      document.body.classList.add('appearance-open');
    },
    close() {
      if (!opened) return;
      opened = false;
      root.classList.add('hide');
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('appearance-open');
    },
    get isOpen() {
      return opened;
    },
    get appearance() {
      return appearance;
    },
  };
}
