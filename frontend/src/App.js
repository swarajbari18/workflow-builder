/**
 * App — the pipeline builder. The Dock (inside PipelineUI) is the single
 * orchestration surface — node discovery, Run, Submit (DAG check), State,
 * and Search all live there.
 */
import { PipelineUI } from './ui';

function App() {
  return <PipelineUI />;
}

export default App;
