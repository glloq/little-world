// The Actions token can deploy Pages but cannot change the repository's Pages source.
export async function ensureWorkflowPages({github, context, core}) {
  const repository = {owner: context.repo.owner, repo: context.repo.repo};
  const {data: site} = await github.request('GET /repos/{owner}/{repo}/pages', repository);
  if (site.build_type !== 'workflow') {
    core.warning(`Pages utilise « ${site.build_type} ». Le build Vite sera publié après le workflow Pages automatique. Pour supprimer ce double build : Settings → Pages → Source → GitHub Actions.`);
  }
  return site.build_type;
}

export function isLegacyPagesRun(run) {
  return run.path === 'dynamic/pages/pages-build-deployment' ||
    ['pages build and deployment', 'pages-build-deployment'].includes(run.name);
}

// Never let an in-flight source deployment overwrite the compiled artifact.
export async function waitForLegacyPages({github, context, core, attempts = 30, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  if (await ensureWorkflowPages({github, context, core}) === 'workflow') return;
  const repository = {owner: context.repo.owner, repo: context.repo.repo};
  let idle = 0;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const {data} = await github.request('GET /repos/{owner}/{repo}/actions/runs', {...repository, branch: 'main', per_page: 100});
    const pending = data.workflow_runs.filter(run => isLegacyPagesRun(run) && run.status !== 'completed');
    idle = pending.length ? 0 : idle + 1;
    if (idle >= 2) return;
    core.info(pending.length ? `Attente des publications source : ${pending.map(run => run.id).join(', ')}` : 'Vérification de la fin des publications source…');
    if (attempt + 1 < attempts) await sleep(10000);
  }
  throw new Error('Le workflow Pages automatique est encore actif. Publication Vite différée pour éviter un écrasement ; relancer après sa fin.');
}
