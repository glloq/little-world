/** Monotone logical world seconds. Called by fixed simulation, never by RAF or wall time. */
export class WorldClock {
 private value=0;
 private compensation=0;
 private speed=1;
 get time(){return this.value;}
 get rate(){return this.speed;}
 setRate(rate:number){if(!Number.isFinite(rate)||rate<0||rate>240)throw Error('Vitesse du temps entre 0 et 240');this.speed=rate;}
 advance(seconds:number){
  if(!Number.isFinite(seconds)||seconds<0||seconds>60)throw Error('Pas du monde invalide');
  const increment=seconds*this.speed-this.compensation,next=this.value+increment;this.compensation=(next-this.value)-increment;
  if(next>1e9)throw Error('Temps du monde hors limites');this.value=next;return this.value;
 }
 restore(seconds:number){if(!Number.isFinite(seconds)||seconds<0||seconds>1e9)throw Error('Temps de partie invalide');this.value=seconds;this.compensation=0;this.speed=1;}
}
