import {defineConfig,type Plugin} from 'vite';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** Publish the canonical editable island without committing a second 3 MB copy. */
function officialStudioExample():Plugin {
  const source=fileURLToPath(new URL('./maps/island.project.json',import.meta.url));
  return {
    name:'official-island-studio-example',
    configureServer(server){
      server.middlewares.use((req,res,next)=>{
        if(req.url?.split('?')[0]!=='/little-world/maps/island.project.json')return next();
        try{res.setHeader('Content-Type','application/json; charset=utf-8');res.end(readFileSync(source));}
        catch(e){next(e);}
      });
    },
    generateBundle(){
      this.emitFile({type:'asset',fileName:'maps/island.project.json',source:readFileSync(source)});
    },
  };
}
export default defineConfig({
  base: '/little-world/',
  plugins:[officialStudioExample()],
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
