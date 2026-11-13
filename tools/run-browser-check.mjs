/** Keep CI failures diagnosable from check annotations when detailed logs require sign-in. */
import {spawn} from 'node:child_process';
const scripts={water:'tools/test-water-browser.mjs','water-engine':'tests/water-engine.browser.mjs',published:'tools/test-published-browser.mjs','audio-engine':'tests/audio-engine.browser.mjs',audio:'tools/test-audio-browser.mjs',legacy:'tools/test-browser.mjs',studio:'tools/test-studio-browser.mjs',gameplay:'tools/test-gameplay-browser.mjs',environment:'tools/test-environment-browser.mjs',local:'tools/test-local-browser.mjs',characters:'tools/test-characters-browser.mjs',storage:'tests/studio-storage.browser.mjs'};
const name=process.argv[2],file=scripts[name];if(!file)throw Error('Unknown browser check');
const child=spawn(process.execPath,[file,...process.argv.slice(3)],{stdio:['inherit','pipe','pipe'],env:process.env});let tail='';
for(const [stream,target]of [[child.stdout,process.stdout],[child.stderr,process.stderr]])stream.on('data',chunk=>{target.write(chunk);tail=(tail+chunk.toString()).slice(-12000);});
child.on('error',e=>{console.error(e);process.exitCode=1;});
child.on('close',code=>{if(code!==0){if(process.env.GITHUB_ACTIONS){const detail=tail.slice(-5000).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');console.error(`::error title=${name} browser check::${detail}`);}process.exitCode=code??1;}});
