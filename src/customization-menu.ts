import {
  loadAppearance, storeAppearance, toggleAccessory, setEmotion,
  type Accessory, type Appearance, type Emotion
} from './character-style.ts';

const accessories: readonly {id:Accessory; icon:string; title:string; description:string}[]=[
  {id:'hat', icon:'▱',title:'Chapeau',description:'Petit chapeau de voyage'},
  {id:'backpack',icon:'▣',title:'Sac à dos',description:'Sac d’explorateur'},
  {id:'pendant',icon:'◇',title:'Pendentif',description:'Gland doré'},
  {id:'scarf',icon:'≈',title:'Écharpe',description:'Écharpe douce'}
];
const emotions: readonly {id:Emotion;icon:string;title:string}[]=[
  {id:'happy',icon:'☺',title:'Joyeux'},
  {id:'joyful',icon:'◡',title:'Ravi'},
  {id:'surprised',icon:'○',title:'Surpris'},
  {id:'sleepy',icon:'ᴗ',title:'Apaisé'},
  {id:'determined',icon:'⌁',title:'Déterminé'}
];
export interface CustomizationMenu {
  open():void;
  close():void;
  readonly isOpen:boolean;
  readonly appearance:Appearance;
}
export function createCustomizationMenu(
  root:HTMLElement, onChange:(appearance:Appearance)=>void
):CustomizationMenu {
  let appearance=loadAppearance();
  let opened=false;
  const accessoryList=root.querySelector<HTMLElement>('#appearance-accessories');
  const emotionList=root.querySelector<HTMLElement>('#appearance-emotions');
  if(!accessoryList||!emotionList)throw new Error('Appearance menu containers missing');
  function update(value:Appearance):void {
    appearance=value;
    storeAppearance(value);
    onChange(value);
    for(const button of root.querySelectorAll<HTMLButtonElement>('button[data-accessory]')){
      const id=button.dataset.accessory as Accessory;
      const active=id==='hat'?value.hat:id==='backpack'?value.backpack:value.neckwear===id;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    }
    for(const button of root.querySelectorAll<HTMLButtonElement>('button[data-emotion]')){
      const active=button.dataset.emotion===value.emotion;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    }
  }
  for(const opt of accessories){
    const b=document.createElement('button');
    b.type='button';b.className='appearance-choice';b.dataset.accessory=opt.id;
    const symbol=document.createElement('span');symbol.className='appearance-symbol';symbol.textContent=opt.icon;
    const words=document.createElement('span');words.className='appearance-words';
    const strong=document.createElement('strong');strong.textContent=opt.title;
    const small=document.createElement('small');small.textContent=opt.description;
    words.append(strong,small);b.append(symbol,words);
    b.addEventListener('click',()=>update(toggleAccessory(appearance,opt.id)));
    accessoryList.append(b);
  }
  for(const opt of emotions){
    const b=document.createElement('button');
    b.type='button';b.className='appearance-choice';b.dataset.emotion=opt.id;
    const symbol=document.createElement('span');symbol.className='appearance-symbol';symbol.textContent=opt.icon;
    const words=document.createElement('span');words.className='appearance-words';
    const strong=document.createElement('strong');strong.textContent=opt.title;
    words.append(strong);b.append(symbol,words);
    b.addEventListener('click',()=>update(setEmotion(appearance,opt.id)));
    emotionList.append(b);
  }
  update(appearance);
  return {
    open(){
      if(opened)return;
      opened=true;
      root.classList.remove('hide');
      root.setAttribute('aria-hidden','false');
      document.body.classList.add('appearance-open');
    },
    close(){
      if(!opened)return;
      opened=false;
      root.classList.add('hide');
      root.setAttribute('aria-hidden','true');
      document.body.classList.remove('appearance-open');
    },
    get isOpen(){return opened;},
    get appearance(){return appearance;}
  };
}
