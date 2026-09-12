# Engineering Judgment

A Software Engineering Flight Simulator for practicing incident response under incomplete information. Scenarios are defined in YAML and run through a shared interface and deterministic simulation engine.

The prototype focuses on a decision loop:

**Observe → Hypothesize → Investigate → Intervene → Observe consequences → Revise → After Action Review**

The aim is to examine how players use evidence and revise their decisions. Finding the hidden root cause is only part of the exercise.

## Run locally

Requires Node.js 20 or later.

```sh
npm ci
npm start
```

Open [the local prototype](http://127.0.0.1:4173). To use another port, run `PORT=4174 npm start`. The server listens on the loopback interface only.

## Available scenarios

| Scenario | Focus | Status |
| --- | --- | --- |
| #001 | A checkout performance incident that appears to need more resources | Initial scenario, designed for a 20–30 minute session including reflection; timing is unvalidated |
| #002 | A contrasting checkout incident where adding application capacity helps | Short comparison demo for exercising the shared engine; not a validated training scenario |

## Play

The current interface and scenario content are in Japanese. English/Japanese support is planned for a later iteration.

1. Select a scenario and enter the incident.
2. Choose an observation, conversation, or intervention. Optionally record your hypothesis, prediction, supporting evidence, and conditions for reviewing or stopping the action.
3. Execute the action to advance simulation time. Read the updated metrics and evidence before deciding what to do next. Time does not advance while you think.
4. Confirm sustained recovery, end the run early, or reach the time limit to open the After Action Review.
5. Write a reflection and export the run as JSON. If downloads are unavailable in your browser, display the JSON and copy it manually.

Run data lives in page memory and is lost on reload or reset. Save any records you want to keep. The prototype uses no authentication, external services, LLM, cloud infrastructure, or real database.

## Add a scenario

Add a `.yaml` file to `scenarios/` and give it a unique `id`. It will appear in the scenario selector automatically, without a JavaScript registration step. Reload the page after editing a definition; a run already in progress keeps the definition it loaded at the start.

Start by copying `scenarios/002.yaml`. See the [scenario authoring guide](docs/scenario-authoring.md) for the supported fields, expressions, action effects, and execution order. The guide is currently in Japanese.

YAML defines the initial state, hypotheses, metric cards, observations, actions, delayed consequences, costs, recovery conditions, scoring parameters, and review content. The interface layout and the basic five-axis scoring procedure are shared. New behavior outside the supported rule vocabulary requires an engine change and tests; YAML does not execute arbitrary code.

## Project structure

| Location | Responsibility |
| --- | --- |
| `scenarios/001.yaml`, `scenarios/002.yaml` | Scenario definitions |
| `src/engine.js` | Time advancement, state transitions, evidence snapshots, scoring, and export |
| `src/rules.js` | Interpretation of the supported expressions |
| `src/schema.js` | Definition and reference validation |
| `scripts/scenarios.mjs` | YAML loading, discovery, and content hashing |
| `src/app.js` | Scenario selection, interface rendering, and player input |
| `server.mjs` | Local static files and scenario endpoints |
| `tests/` | Engine, definition, and request-handler tests |

Exports include the scenario ID, revision, YAML content hash, loaded definition, decisions, and reflection so the conditions of a run remain inspectable after a scenario is edited. Importing previous runs into the interface is not implemented.

## Validate

```sh
npm run scenarios:check
npm test
```

Definition checks catch malformed YAML, duplicate IDs, invalid durations, unsupported fields, and unknown references. Tests cover representative player paths, delayed degradation, sustained recovery, evidence availability at decision time, costs, interrupted actions, scenario isolation, automatic discovery, and JSON export.

Passing these checks does not establish that a scenario is realistic or educationally effective. Each new scenario still needs a causal review and playtesting.

## Design notes

These documents are currently in Japanese:

- [Scenario #001 design](docs/scenario-001.md): hidden state, causal model, actions, evidence, scoring rubric, terminal conditions, representative paths, and review.
- [Critical review and playtest plan](docs/critique.md): design revisions, remaining limitations, and hypotheses to test.
- [Validation record](docs/validation.md): completed checks and unverified behavior.

## Limitations

The simulation uses deterministic educational rules, not a production performance model. Costs are relative units. Customer impact is approximated by failed attempts rather than unique customers or lost revenue.

The five scores are provisional proxies for recorded behavior. They do not evaluate the meaning of free-text reasoning. Assessing the relevance of a hypothesis, the information value of an observation, or the quality of a revised mental model requires human review. Session duration, differences between experience levels, and transfer to unfamiliar incidents remain unvalidated.

Root causes are hidden from the play screen but remain accessible in the scenario API response, source, and exported definition. This local prototype is not an anti-cheating system or a tool for hiring or ability certification.
