import {loadScenarios} from './scenarios.mjs';
try{for(const c of await loadScenarios())console.log(`OK ${c.id}: ${c.title} (${c.actions.length} actions)`);}catch(e){console.error(e.message);process.exitCode=1;}
