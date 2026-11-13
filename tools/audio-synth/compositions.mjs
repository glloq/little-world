/** Original Little World themes — melodies written note by note for this project (no borrowed tune).
 * Each entry: catalogue asset id → piece. A/B sections, loops end on a chord leading back to bar 1. */
const soft=['k...t...','k.t.....'],walk=['k..tk.t.','k..t.kt.'];
export const PIECES={
 'music-menu':{title:'Little World — Accueil',bpm:76,seed:11,loop:true,scale:['F','G','A','Bb','C','D','E'],
  chords:['F','C','Dm','Bb','F','C','Bb','C','Dm','Bb','F','C','Gm','Bb','C','C'],
  melodies:{flute:{notes:`C5:q A4:e C5:e F5:h | E5:q D5:e C5:e G4:h | A4:q D5:q F5:q E5:q | D5:h. C5:q | A4:q C5:e D5:e C5:q A4:q | G4:h. r:q | F4:q A4:q D5:q C5:q | C5:w |
   F5:q E5:e D5:e A4:h | Bb4:q D5:q F5:h | A5:q G5:e F5:e C5:h | E5:q F5:q G5:h | Bb5:q A5:e G5:e D5:h | D5:q F5:q Bb5:q A5:q | G5:h E5:h | G5:q E5:q C5:h`,vel:74}},
  harp:{step:.5,octave:3,pattern:[0,2,4,2,1,3,4,3],vel:44},bass:{beats:[0],octave:2,vel:50,len:1.8},bells:{every:4,octave:5,vel:40,len:3}},
 'music-day-a':{title:'Matin dans la vallée',bpm:92,seed:12,loop:false,scale:['G','A','B','C','D','E','F#'],
  chords:['G','D','Em','C','G','C','D','D','Em','C','G','D','C','Am','D','D'],
  melodies:{flute:{notes:`D5:q B4:e G4:e B4:q D5:q | A4:h F#4:q A4:q | B4:q E5:e D5:e B4:q G4:q | E5:h. r:q | D5:e E5:e D5:e B4:e G4:q B4:q | C5:q E5:q G5:q E5:q | F#5:q E5:e D5:e A4:q F#4:q | A4:h. r:q |
   G5:q F#5:e E5:e B4:h | C5:q E5:e G5:e E5:h | D5:q G5:q B5:q A5:e G5:e | F#5:h A5:h | G5:q E5:q C5:q E5:q | A5:q G5:e E5:e C5:h | D5:q E5:e F#5:e A5:q F#5:q | D5:h. r:q`,vel:76}},
  comp:{beats:[.5,1.5,2.5,3.5],octave:4,vel:30,len:.25},bass:{beats:[0,2],octave:2,vel:56,len:.8},drums:{patterns:soft,kick:46,tick:20},bells:{every:8,octave:5,vel:36,len:2}},
 'music-day-b':{title:'Sentier ensoleillé',bpm:104,seed:13,loop:false,beatsPerBar:3,scale:['D','E','F#','G','A','B','C#'],
  chords:['D','G','A','D','Bm','G','E','A','G','D','A','D','G','D','Em','A'],
  melodies:{pluck:{notes:`F#5:q A5:q F#5:q | G5:h B5:q | A5:q E5:q C#5:q | D5:h. | B4:q D5:q F#5:q | G5:q F#5:q E5:q | E5:q F#5:q G#5:q | A5:h. |
   r:h. | r:h. | r:h. | r:h. | r:h. | r:h. | r:h. | r:h.`,vel:72,legato:.6},
   flute:{notes:`r:h. | r:h. | r:h. | r:h. | r:h. | r:h. | r:h. | r:h. |
   B5:h A5:q | F#5:h D5:q | E5:q F#5:q G5:q | F#5:h. | G5:q A5:q B5:q | A5:q F#5:q D5:q | E5:q G5:q F#5:q | E5:h A4:q`,vel:74}},
  harp:{step:1,octave:3,pattern:[0,1,2],vel:42,hold:1.5},bass:{beats:[0],octave:2,vel:52,len:2.5,fifth:false},drums:{patterns:['k..','k.t'],kick:40,tick:18}},
 'music-night-a':{title:'Nuit étoilée',bpm:66,seed:14,loop:false,scale:['A','B','C','D','E','F','G'],
  chords:['Am','F','C','G','Am','Dm','Em','E','F','G','Em','Am','Dm','F','Em','E'],
  melodies:{flute:{notes:`E5:h. C5:q | A4:w | G4:q C5:q E5:h | D5:w | E5:h A5:h | F5:h. E5:q | D5:q B4:q G4:h | G#4:w |
   C5:h F5:h | D5:h G5:h | B4:q E5:q G5:h | A5:w | F5:q E5:q D5:h | C5:h A4:h | B4:h G4:h | G#4:h B4:h`,vel:64,legato:.97}},
  harp:{step:.5,octave:3,pattern:[0,1,2,4,2,1,2,1],vel:38,hold:3},bells:{every:2,offset:1,octave:6,beat:2,vel:30,len:2},bass:{beats:[0],octave:2,vel:40,len:3.5}},
 'music-night-b':{title:'Lucioles',bpm:72,seed:15,loop:false,beatsPerBar:3,scale:['E','F#','G','A','B','C','D'],
  chords:['Em','C','G','D','Em','Am','B','B','C','D','G','Em','Am','C','B','B'],
  melodies:{harp:{notes:`B4:q E5:q G5:q | E5:h. | D5:q G5:q B5:q | A5:h. | G5:q F#5:q E5:q | C5:h E5:q | D#5:q F#5:q B5:q | F#5:h. |
   E5:q G5:q C6:q | A5:h F#5:q | B5:q A5:q G5:q | E5:h. | A5:q G5:q E5:q | G5:h E5:q | F#5:q D#5:q B4:q | B4:h.`,vel:62,legato:1.4},
   bell:{notes:`r:h. | r:q B5:h | r:h. | r:q F#5:h | r:h. | r:q E6:h | r:h. | r:q B5:h | r:h. | r:q A5:h | r:h. | r:q G5:h | r:h. | r:q E6:h | r:h. | r:h.`,vel:30}},
  bass:{beats:[0],octave:2,vel:40,len:2.6,fifth:false}},
 'music-forest':{title:'Sous les feuillages',bpm:84,seed:16,loop:false,scale:['D','E','F','G','A','B','C'],
  chords:['Dm','C','Dm','G','Dm','F','C','G','F','C','G','Am','F','G','Dm','Dm'],
  melodies:{flute:{notes:`D5:q F5:e G5:e A5:h | G5:q E5:q C5:h | F5:e E5:e D5:q A4:h | B4:q D5:q G5:h | A5:q G5:e F5:e D5:h | C5:q F5:q A5:h | G5:q E5:e D5:e C5:h | B4:h D5:h |
   A5:h C6:q A5:q | G5:h E5:h | B5:q A5:q G5:q D5:q | E5:w | F5:q A5:q G5:q F5:q | E5:q D5:q B4:q G4:q | A4:q D5:q F5:q E5:q | D5:w`,vel:72}},
  harp:{step:.5,octave:3,pattern:[0,2,1,3],vel:40,every:1},bass:{beats:[0,1.5,2,3.5],octave:2,vel:48,len:.4},bells:{every:4,offset:3,octave:5,beat:2,vel:32,len:2}},
 'music-village':{title:'Place du marché',bpm:100,seed:17,loop:false,scale:['C','D','E','F','G','A','B'],
  chords:['C','F','G','C','Am','F','G','G','F','C','Dm','G','Em','Am','Dm','G'],
  melodies:{pluck:{notes:`E5:e G5:e E5:e C5:e D5:q E5:q | F5:e A5:e F5:e C5:e A4:h | B4:e D5:e G5:e D5:e B4:q G4:q | C5:q E5:q G5:h | A5:e G5:e E5:e C5:e A4:q C5:q | F5:q E5:q D5:q C5:q | D5:e E5:e F5:e G5:e A5:q G5:q | G5:h. r:q |
   r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w`,vel:74,legato:.55},
   flute:{notes:`r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |
   A5:q. G5:e F5:q C5:q | E5:h G5:h | F5:q E5:q D5:q A4:q | B4:h D5:h | G5:q. F5:e E5:q B4:q | C5:h E5:h | D5:q F5:q A5:q F5:q | G5:h B4:h`,vel:74}},
  bass:{beats:[0,2],octave:2,vel:58,len:.7},drums:{patterns:walk,kick:52,tick:24},bells:{every:8,octave:5,vel:34,len:1}},
 'music-farm':{title:'Sillons',bpm:92,seed:18,loop:false,scale:['F','G','A','Bb','C','D','E'],
  chords:['F','Bb','F','C','Dm','Bb','C','F','Bb','F','Gm','C','Am','Dm','Bb','C'],
  melodies:{flute:{notes:`C5:q F5:q A5:q G5:q | F5:h D5:h | C5:q A4:e C5:e F5:q A5:q | G5:w | A5:q G5:q F5:q D5:q | D5:h F5:h | E5:q G5:q C6:q Bb5:q | A5:w |
   D6:h Bb5:h | A5:q F5:q C5:h | Bb5:q A5:q G5:q D5:q | E5:h G5:h | C6:q A5:q E5:q A5:q | F5:h D5:h | D5:q F5:q Bb5:q A5:q | G5:h E5:h`,vel:72}},
  harp:{step:.5,octave:3,pattern:[0,1,2,1],vel:40},bass:{beats:[0,1,2,3],octave:2,vel:46,len:.45,fifth:true}},
 'music-mine':{title:'Galeries',bpm:66,seed:19,loop:false,scale:['E','F','G','A','B','C','D'],
  chords:['Em','F','Em','D','C','D','Em','Em','Am','C','Em','D','F','Em','D','Em'],
  melodies:{bell:{notes:`B4:h. G4:q | A4:w | B4:q E5:q G5:h | F#5:w | E5:h. D5:q | C5:h A4:h | B4:w | r:w |
   r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w`,vel:52,legato:1},
   flute:{notes:`r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |
   A4:h C5:h | E5:h G5:h | B4:h. A4:q | F#4:w | A4:h C5:h | B4:h G4:h | A4:q F#4:q D4:h | E4:w`,vel:58,legato:.97}},
  bass:{beats:[0,1.5,3],octave:2,vel:44,len:.5,fifth:true},harp:{step:1,octave:3,pattern:[0,2,1,2],vel:32,every:2},drums:{patterns:['k.......','........'],kick:34}},
 'music-coast':{title:'Houle',bpm:84,seed:20,loop:false,beatsPerBar:3,scale:['Bb','C','D','Eb','F','G','A'],
  chords:['Bb','Gm','Eb','F','Bb','Gm','Cm','F','Eb','F','Dm','Gm','Eb','Bb','Cm','F'],
  melodies:{flute:{notes:`D5:q. F5:q. | G5:h. | G5:q. Bb5:q. | A5:h. | F5:q. D5:q. | Bb4:h. | C5:q. Eb5:q. | F5:h. |
   Bb5:q. G5:q. | A5:q. F5:q. | F5:q. A5:q. | G5:h. | Eb5:q. G5:q. | D5:q. F5:q. | Eb5:q. D5:q C5:e | C5:h.`,vel:72}},
  harp:{step:.5,octave:3,pattern:[0,1,2,4,2,1],vel:42},bass:{beats:[0,1.5],octave:2,vel:48,len:1.3}},
 'music-swamp':{title:'Brume',bpm:70,seed:21,loop:false,scale:['D','E','F','G','A','Bb','C'],
  chords:['Dm','Gm','Dm','A','Bb','Gm','A','Dm','Gm','Dm','Bb','A','Gm','Bb','A','Dm'],
  melodies:{flute:{notes:`A4:w | Bb4:h. G4:q | F4:h A4:h | E4:w | F4:h D5:h | C5:q Bb4:q G4:h | C#5:w | D5:w |
   D5:h Bb4:h | A4:h. F4:q | F4:h Bb4:h | A4:q G4:q E4:h | G4:h. A4:q | Bb4:h D5:h | C#5:h E5:h | D5:w`,vel:60,legato:.97}},
  harp:{step:1,octave:3,pattern:[0,2,1,2],vel:34},bells:{every:4,offset:2,octave:5,beat:1,vel:26,len:2.5},bass:{beats:[0],octave:2,vel:40,len:3.5}},
 'music-desert':{title:'Dunes',bpm:76,seed:22,loop:false,scale:['E','F','G#','A','B','C','D'],
  chords:['E','F','E','Dm','E','F','G','E','Am','G','F','E','Am','Dm','F','E'],
  melodies:{flute:{notes:`B4:q C5:q B4:h | A4:q G#4:q A4:h | G#4:q B4:q E5:h | D5:q C5:q A4:h | E5:q F5:q E5:q D5:q | C5:h A4:h | B4:q D5:q C5:q B4:q | G#4:w |
   C5:q E5:q A5:h | G5:q F5:q D5:h | F5:q E5:q C5:h | B4:w | A4:q C5:q E5:q D5:q | F5:h D5:h | C5:q B4:q A4:q F4:q | G#4:h E4:h`,vel:68}},
  bass:{beats:[0,.5,2],octave:2,vel:46,len:.4,fifth:false},drums:{patterns:['k..t.t..','k..t..t.'],kick:40,tick:22}},
 'music-mountain':{title:'Crêtes',bpm:68,seed:23,loop:false,scale:['A','B','C#','D','E','F#','G#'],
  chords:['A','E','F#m','D','A','Bm','E','E','D','A','Bm','F#m','D','E','A','E'],
  melodies:{flute:{notes:`E5:h C#6:h | B5:h. G#5:q | A5:h F#5:h | F#5:w | E5:q A5:q C#6:q B5:q | A5:h F#5:h | G#5:h B5:h | E5:w |
   F#5:h A5:h | E5:h C#5:h | D5:q F#5:q B5:h | C#6:w | B5:q A5:q F#5:q D5:q | E5:h G#5:h | A5:w | B5:w`,vel:66,legato:.97}},
  harp:{step:.5,octave:3,pattern:[0,1,2,3,4,5,4,2],vel:40},bass:{beats:[0],octave:2,vel:42,len:3.6}},
 'music-ruins':{title:'Pierres anciennes',bpm:64,seed:24,loop:false,scale:['D','E','F','G','A','Bb','C'],
  chords:['Dm','C','Bb','A','Dm','F','Gm','A','Bb','F','C','Dm','Bb','Gm','A','A'],
  melodies:{bell:{notes:`A4:h D5:h | G4:h C5:h | F4:h Bb4:h | E4:w | D5:q A4:q G4:q A4:q | C5:h F5:h | D5:h G4:h | A4:w |
   r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w`,vel:50,legato:1},
   flute:{notes:`r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |
   F5:h. D5:q | C5:w | E5:h G5:h | F5:h. D5:q | D5:h F5:h | G5:h. Bb4:q | C#5:h E5:h | A4:w`,vel:60}},
  bass:{beats:[0],octave:2,vel:40,len:3.5},drums:{patterns:['k.......','....k...'],kick:30}},
 'music-mission':{title:'Réflexion',bpm:104,seed:25,loop:true,scale:['E','F#','G','A','B','C','D'],
  chords:['Em','Em','C','D','Am','Em','B','B','Em','Em','C','D','Am','Em','B','B'],
  melodies:{pluck:{notes:`E5:e G5:e B5:e G5:e E5:e r:e B4:q | E5:e F#5:e G5:e A5:e B5:q r:q | C6:e B5:e G5:e E5:e C5:q E5:q | D5:e F#5:e A5:e F#5:e D5:h | A4:e C5:e E5:e A5:e G5:q E5:q | G5:e F#5:e E5:e B4:e E5:h | F#5:e D#5:e B4:e D#5:e F#5:q B5:q | A5:q F#5:q D#5:h |
   r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w`,vel:70,legato:.5},
   flute:{notes:`r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |
   B5:h G5:h | E5:h B4:h | C5:q E5:q G5:h | F#5:h A5:h | C6:h A5:h | G5:q E5:q B4:h | D#5:h F#5:h | B5:w`,vel:70}},
  bass:{beats:[0,1,2,3],octave:2,vel:44,len:.35,fifth:true},drums:{patterns:['k.t.k.t.'],kick:38,tick:20}},
 'music-magic':{title:'Sortilège',bpm:72,seed:26,loop:false,scale:['C','D','E','F#','G','A','B'],
  chords:['C','D','C','D','Em','D','C','D','Am','Bm','C','D','Am','Bm','Em','D'],
  melodies:{flute:{notes:`G5:h E5:h | F#5:w | E5:q G5:q C6:h | A5:w | B5:h G5:h | A5:q F#5:q D5:h | E5:h G5:h | F#5:w |
   r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w`,vel:62,legato:.97},
   bell:{notes:`r:w | r:w | r:w | r:w | r:w | r:w | r:w | r:w |
   C6:h A5:h | B5:h F#5:h | G5:h E5:h | D5:w | E5:q A5:q C6:h | D6:h B5:h | G5:h E5:h | F#5:w`,vel:46,legato:1}},
  harp:{step:.25,octave:4,pattern:[0,1,2,3,4,3,2,1],vel:30,hold:2}},
 // ── Stingers (jingles)
 'music-discovery':{title:'Découverte',bpm:84,seed:27,loop:false,scale:['C','D','E','F','G','A','B'],chords:['C','G','C'],
  melodies:{harp:{notes:`C4:s E4:s G4:s C5:s E5:s G5:s C6:s E6:s D5:q G5:q | B5:h G5:h | r:w`,vel:58,legato:1.2},bell:{notes:`r:w | r:h D6:h | C6:w`,vel:52,legato:.95},flute:{notes:`r:w | r:h. B5:q | C6:h. r:q`,vel:60}}},
 'music-success':{title:'Réussite',bpm:96,seed:28,loop:false,scale:['F','G','A','Bb','C','D','E'],chords:['C7','F','F'],
  melodies:{flute:{notes:`C5:e D5:e E5:e G5:e Bb5:q A5:e G5:e | A5:h F5:h | r:w`,vel:72},pluck:{notes:`E4:e G4:e Bb4:e C5:e G4:q E4:q | F4:q A4:q C5:h | r:w`,vel:62,legato:.6},bell:{notes:`r:w | r:q C6:q F6:h | r:w`,vel:46}},
  bass:{beats:[0],octave:2,vel:50,len:1.5,fifth:false}},
 'music-rare':{title:'Phénomène rare',bpm:60,seed:29,loop:false,scale:['C','D','E','F#','G#','A#'],chords:['C','C','C'],
  melodies:{bell:{notes:`C6:e D6:e E6:e F#6:e G#6:e A#6:e C7:q | A#6:e G#6:e F#6:e E6:e D6:h | C6:w`,vel:44,legato:1.1},flute:{notes:`r:w | F#5:w | E5:h. r:q`,vel:56},harp:{notes:`C4:q E4:q G#4:q C5:q | D4:q F#4:q A#4:q D5:q | C4:w`,vel:40,legato:1.2}}},
};
