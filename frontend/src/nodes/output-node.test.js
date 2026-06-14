import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { OutputNode } from './output-node';
import outputSpec from './specs/output-spec';

const renderOutput = (data) =>
  render(
    <ReactFlowProvider>
      <OutputNode id="customOutput-1" data={data} spec={outputSpec} />
    </ReactFlowProvider>,
  );

describe('OutputNode', () => {
  test('shows a placeholder when no value has been received', () => {
    renderOutput({});
    expect(screen.getByText(/no value yet/i)).toBeInTheDocument();
  });

  test('renders a received string value inline', () => {
    renderOutput({ value: 'the final answer' });
    expect(screen.getByText('the final answer')).toBeInTheDocument();
  });

  test('renders a received object value as readable rows, not JSON', () => {
    renderOutput({ value: { sentiment: 'positive', score: 0.9 } });
    expect(screen.getByText('sentiment')).toBeInTheDocument();
    expect(screen.getByText('positive')).toBeInTheDocument();
  });
});
