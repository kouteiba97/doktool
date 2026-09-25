// The calculator engine: definition format, static checks, evaluation, test runs (ADR-012).
export * from './definition.js';
export { checkDefinition, type CheckResult, type DefinitionProblem } from './check-definition.js';
export {
  ENGINE_VERSION,
  evaluate,
  roundHalfAwayFromZero,
  type Conversion,
  type Evaluation,
  type EvaluationInputs,
  type InputValue,
  type Issue,
  type IssueCode,
  type PlausibilityNote,
} from './evaluate.js';
export { canonicalJson, definitionSha256 } from './canonical-json.js';
export {
  runTestCases,
  type ExpectedOutcome,
  type TestCaseResult,
  type TestCaseSpec,
  type TestRun,
} from './run-test-cases.js';
