/**
 * ValueDisplay renders any runtime value in a way a non-technical user can read —
 * never a raw JSON string. Tested per data shape.
 */
import { render, screen } from '@testing-library/react';
import { ValueDisplay } from './value-display';

describe('ValueDisplay', () => {
  test('renders a placeholder for null / undefined', () => {
    render(<ValueDisplay value={null} />);
    expect(screen.getByText(/no value yet/i)).toBeInTheDocument();
  });

  test('renders a string as readable text', () => {
    render(<ValueDisplay value="hello world" />);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  test('renders a number', () => {
    render(<ValueDisplay value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('renders a boolean as Yes / No', () => {
    render(<ValueDisplay value={true} />);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  test('renders an object as key/value rows, not a JSON string', () => {
    render(<ValueDisplay value={{ name: 'alice', score: 0.84 }} />);
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
    expect(screen.getByText('0.84')).toBeInTheDocument();
    expect(screen.queryByText('{"name":"alice","score":0.84}')).not.toBeInTheDocument();
  });

  test('renders an array with an item count', () => {
    render(<ValueDisplay value={['a', 'b', 'c']} />);
    expect(screen.getByText(/3 items/i)).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('c')).toBeInTheDocument();
  });

  test('renders a message[] as a chat-style view with roles', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello there' },
    ];
    render(<ValueDisplay value={messages} />);
    expect(screen.getByText('user')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('assistant')).toBeInTheDocument();
    expect(screen.getByText('hello there')).toBeInTheDocument();
  });

  test('renders file info for a file-shaped value', () => {
    render(<ValueDisplay value={{ __file: true, name: 'report.pdf', size: 2048 }} dataType="file" />);
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });
});
