/** Await asynchronous browser predicates in Node, rather than treating a Promise as truthy. */
export async function waitForBrowserCondition(page,predicate,arg,timeoutMs=30000){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){if(await page.evaluate(predicate,arg))return;await page.waitForTimeout(100);}
 throw Error('Timed out waiting for the saved browser state');
}
