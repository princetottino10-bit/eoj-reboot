import { runFullSimulation } from './engine/simulation';
const start = Date.now();
const r = runFullSimulation(1);
console.log(`1戦/組 (${r.results.length}試合) = ${((Date.now()-start)/1000).toFixed(1)}秒`);
