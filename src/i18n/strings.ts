/**
 * Localised strings for generated content (doc 104 §C7): activity hosts,
 * their dialogues and generated quests. Keys are stable; generated data keeps
 * the key next to the resolved text so a catalog can be re-localised without
 * regenerating the world. French is the reference language.
 */
export const LOCALES=['fr','en'] as const;
export type Locale=typeof LOCALES[number];
type Table=Record<string,string>;
const fr:Table={
 'host.instructor.ski':'Monitrice des pistes','host.instructor.race':'Starter des courses','host.instructor.flight':'Guide de vol',
 'host.sailor.surf':'Maître-nageur des vagues','host.fisher':'Pêcheur du coin','host.miner':'Contremaître de la mine','host.farmer':'Fermière','host.guide.dive':'Guide de plongée',
 'dlg.hello':'Bonjour ! Vous venez pour {activity} ?',
 'dlg.ask.what':'Comment ça marche ?','dlg.ask.where':'Où faut-il aller ?','dlg.ask.gear':'Il me faut du matériel ?','dlg.bye':'À plus tard !','dlg.thanks':'Merci.',
 'dlg.where':'Le départ est par là, à environ {distance} m. Suivez le chemin, il y mène.',
 'dlg.gear.missing':'Il vous faut {gear}. On en trouve au {shop}.','dlg.gear.ok':'Vous avez déjà {gear} : parfait.','dlg.gear.none':'Pas besoin de matériel particulier.',
 'act.ski':'le ski','act.race':'les courses','act.flight':'le vol plané','act.surf':'le surf','act.fishing':'la pêche','act.mine':'la mine','act.farm':'les cultures','act.dive':'la plongée',
 'how.ski':'Équipez vos skis, prenez la remontée, puis descendez en suivant les balises de la piste.',
 'how.race':'Ouvrez Courses près du départ et passez toutes les portes dans l’ordre.',
 'how.flight':'Montez au belvédère, sautez et planez à travers les anneaux jusqu’en bas.',
 'how.surf':'Allez au large avec la planche, attendez une vague et laissez-vous porter vers la plage.',
 'how.fishing':'Lancez la ligne près de l’eau et ferrez quand ça mord. Chaque eau a ses poissons.',
 'how.mine':'Creusez les parois avec la pioche ; les filons brillent davantage.',
 'how.farm':'Semez, arrosez, puis revenez récolter quand les plants sont mûrs.',
 'how.dive':'Plongez près des bouées et surveillez votre souffle ; remontez avant d’en manquer.',
 'gear.tool:skis':'des skis','gear.tool:surfboard':'une planche de surf','gear.tool:fishing-rod':'une canne à pêche','gear.tool:pickaxe':'une pioche',
 'shop.ski':'magasin de la station','shop.port':'comptoir du port','shop.mine':'comptoir de la mine','shop.market':'marché','shop.forest':'comptoir du bûcheron','shop.farm':'comptoir agricole','shop.inn':'l’auberge',
 'q.race.title':'Course : {name}','q.race.text':'Terminez la course « {name} ».',
 'q.flight.title':'Vol : {name}','q.flight.text':'Franchissez tous les anneaux de « {name} ».',
 'q.ski.title':'Descente : {name}','q.ski.text':'Descendez la piste « {name} » de haut en bas.',
 'q.lift.title':'Remontée : {name}','q.lift.text':'Prenez la remontée de « {name} » jusqu’en haut.',
 'q.surf.title':'Vagues de {name}','q.surf.text':'Surfez {count} vagues sur le spot {name}.',
 'q.surftrick.title':'Figure sur {name}','q.surftrick.text':'Réussissez une figure (tremplin, tube…) sur le spot {name}.',
 'q.fish.title':'Pêche du jour','q.fish.text':'Attrapez {count} poissons.',
 'q.mine.title':'Filon du jour','q.mine.text':'Extrayez {count} ressources à la mine.',
 'q.farm.title':'Belle récolte','q.farm.text':'Récoltez {count} fois sur une parcelle.',
 'q.dive.title':'Profondeur : {name}','q.dive.text':'Descendez à {depth} m sur le site « {name} ».',
 'q.discover.title':'Trésor de {name}','q.discover.text':'Trouvez « {item} » au fond, sur le site « {name} ».',
};
const en:Table={
 'host.instructor.ski':'Ski instructor','host.instructor.race':'Race starter','host.instructor.flight':'Gliding guide',
 'host.sailor.surf':'Surf lifeguard','host.fisher':'Local fisher','host.miner':'Mine foreman','host.farmer':'Farmer','host.guide.dive':'Dive guide',
 'dlg.hello':'Hello! Are you here for {activity}?',
 'dlg.ask.what':'How does it work?','dlg.ask.where':'Where should I go?','dlg.ask.gear':'Do I need equipment?','dlg.bye':'See you later!','dlg.thanks':'Thanks.',
 'dlg.where':'The start is that way, about {distance} m. Follow the path, it leads there.',
 'dlg.gear.missing':'You need {gear}. You can find it at the {shop}.','dlg.gear.ok':'You already have {gear}: perfect.','dlg.gear.none':'No special equipment needed.',
 'act.ski':'skiing','act.race':'the races','act.flight':'gliding','act.surf':'surfing','act.fishing':'fishing','act.mine':'the mine','act.farm':'farming','act.dive':'diving',
 'how.ski':'Equip your skis, take the lift, then follow the piste markers down.',
 'how.race':'Open Races near the start and pass every gate in order.',
 'how.flight':'Climb to the lookout, jump and glide through the rings down to the finish.',
 'how.surf':'Paddle out with the board, wait for a wave and let it carry you to the beach.',
 'how.fishing':'Cast near the water and strike when it bites. Each water has its own fish.',
 'how.mine':'Dig the walls with the pickaxe; veins shine brighter.',
 'how.farm':'Sow, water, then come back to harvest when the crops are ripe.',
 'how.dive':'Dive near the buoys and watch your breath; surface before it runs out.',
 'gear.tool:skis':'skis','gear.tool:surfboard':'a surfboard','gear.tool:fishing-rod':'a fishing rod','gear.tool:pickaxe':'a pickaxe',
 'shop.ski':'resort shop','shop.port':'harbour counter','shop.mine':'mine counter','shop.market':'market','shop.forest':'woodcutter counter','shop.farm':'farm counter','shop.inn':'inn',
 'q.race.title':'Race: {name}','q.race.text':'Finish the race “{name}”.',
 'q.flight.title':'Flight: {name}','q.flight.text':'Pass every ring of “{name}”.',
 'q.ski.title':'Run: {name}','q.ski.text':'Ski the piste “{name}” from top to bottom.',
 'q.lift.title':'Lift: {name}','q.lift.text':'Ride the lift of “{name}” to the top.',
 'q.surf.title':'Waves of {name}','q.surf.text':'Ride {count} waves at the {name} spot.',
 'q.surftrick.title':'Trick at {name}','q.surftrick.text':'Land a trick (ramp, barrel…) at the {name} spot.',
 'q.fish.title':'Catch of the day','q.fish.text':'Catch {count} fish.',
 'q.mine.title':'Vein of the day','q.mine.text':'Extract {count} resources in the mine.',
 'q.farm.title':'Good harvest','q.farm.text':'Harvest {count} times on a plot.',
 'q.dive.title':'Depth: {name}','q.dive.text':'Dive to {depth} m at the “{name}” site.',
 'q.discover.title':'Treasure of {name}','q.discover.text':'Find “{item}” on the seabed at the “{name}” site.',
};
const TABLES:Record<Locale,Table>={fr,en};
/** Resolve a key with {param} substitution; falls back to French, then to the key itself. */
export function t(key:string,params:Record<string,string|number>={},locale:Locale='fr'):string{
 const raw=TABLES[locale][key]??TABLES.fr[key]??key;
 return raw.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!==undefined?String(params[k]):'{'+k+'}');
}
export function hasString(key:string,locale:Locale='fr'):boolean{return key in TABLES[locale];}
/** Keys present in French but missing in another locale (CI check). */
export function missingKeys(locale:Locale):string[]{return Object.keys(fr).filter(k=>!(k in TABLES[locale]));}
