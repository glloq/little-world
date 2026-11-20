import {defineConfig,type Plugin} from 'vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** Serve the editable sources for the published Studio examples. */
function officialStudioExamples():Plugin {
  const sources=new Map([
    ['maps/island.project.json',new URL('./maps/island.project.json',import.meta.url)],
    ['archipelago/worlds/forest-valley/project.json',new URL('./tests/fixtures/legacy-maps/authoring/production-reference.project.json',import.meta.url)],
  ]);
  const generatedSources=new Map([
    ['/little-world/archipelago/worlds/surf-island/project.json','/src/studio-core/surf-island.ts'],
    ['/little-world/archipelago/worlds/alpine-island/project.json','/src/studio-core/alpine-island.ts'],
  ]);
  const generated=new Map<string,Promise<string>>();
  return {
    name:'official-studio-examples',
    configureServer(server){
      server.middlewares.use((req,res,next)=>{
        const path=req.url?.split('?')[0];
        const generator=path===undefined?undefined:generatedSources.get(path);
        if(generator){
          let pending=generated.get(generator);
          if(!pending){
            pending=server.ssrLoadModule(generator).then(module=>JSON.stringify(
              generator.endsWith('/surf-island.ts')?module.buildSurfIsland().project:module.buildAlpineIsland(),
            ));
            generated.set(generator,pending);
          }
          void pending.then(source=>{
            res.setHeader('Content-Type','application/json; charset=utf-8');res.end(source);
          },error=>{generated.delete(generator);next(error);});
          return;
        }
        const source=path?.startsWith('/little-world/')?sources.get(path.slice('/little-world/'.length)):undefined;
        if(!source)return next();
        try{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(readFileSync(source));}
        catch(e){next(e);}
      });
    },
    generateBundle(){
      for(const [fileName,source] of sources)this.emitFile({type:'asset',fileName,source:readFileSync(source)});
    },
  };
}
export default defineConfig({
  base: '/little-world/',
  plugins:[officialStudioExamples()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        game: fileURLToPath(new URL('./index.html', import.meta.url)),
        studio: fileURLToPath(new URL('./studio/index.html', import.meta.url)),
      },
    },
  },
});
