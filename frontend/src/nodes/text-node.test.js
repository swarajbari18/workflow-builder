import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { TextNode } from './text-node';
import textSpec from './specs/text-spec';

const renderText = (data) =>
  render(
    <ReactFlowProvider>
      <TextNode id="text-1" data={data} spec={textSpec} />
    </ReactFlowProvider>,
  );

describe('TextNode dynamic handles', () => {
  test('renders no variable handles when content has no variables', () => {
    const { container } = renderText({ content: 'plain text' });
    expect(container.textContent).not.toContain('username');
  });

  test('renders one labeled handle per variable in the content', () => {
    renderText({ content: 'helping {{username}} with {{task}}' });
    expect(screen.getByText(/username/)).toBeInTheDocument();
    expect(screen.getByText(/task/)).toBeInTheDocument();
  });

  test('deduplicates repeated variables', () => {
    renderText({ content: '{{a}} and {{a}} again' });
    expect(screen.getAllByText(/◁ a/).length).toBe(1);
  });
});
