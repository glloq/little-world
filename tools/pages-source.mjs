// Shared by the deployment workflow and its API-contract tests.
export async function ensureWorkflowPages({github, context, core}) {
  const repository = {owner: context.repo.owner, repo: context.repo.repo};
  const settings = 'Settings → Pages → Build and deployment → Source → GitHub Actions';
  const {data: site} = await github.request('GET /repos/{owner}/{repo}/pages', repository);
  if (site.build_type === 'workflow') return;
  core.warning(`Pages utilise « ${site.build_type} » : les sources peuvent remplacer le build Vite. Passage à GitHub Actions.`);
  try {
    await github.request('PUT /repos/{owner}/{repo}/pages', {...repository, build_type: 'workflow'});
    const {data: updated} = await github.request('GET /repos/{owner}/{repo}/pages', repository);
    if (updated.build_type !== 'workflow') throw new Error('La source Pages est encore différente de workflow.');
  } catch (error) {
    throw new Error(`Impossible de sélectionner le build Vite pour Pages. Dans le dépôt, choisir ${settings}, puis relancer ce workflow. ${error.message}`);
  }
}
