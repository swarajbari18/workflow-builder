/**
 * App — the pipeline builder. The Dock (inside PipelineUI) replaces the old
 * PipelineToolbar; SubmitButton remains for pipeline execution.
 */
import { PipelineUI } from './ui';
import { SubmitButton } from './submit';

function App() {
  return (
    <div style={{ position: 'relative' }}>
      <PipelineUI />
      <SubmitButton />
    </div>
  );
}

export default App;
