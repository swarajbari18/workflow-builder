/**
 * FieldControl renders one editable control per NodeSpec field kind. Each kind is
 * tested for what it renders and how it reports changes, before the inspector wires
 * them together.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { FieldControl } from './field-control';

const renderField = (field, value, onChange = () => {}) =>
  render(<FieldControl field={field} value={value} onChange={onChange} />);

describe('FieldControl', () => {
  test('text field renders an input and reports typed value', () => {
    const onChange = jest.fn();
    renderField({ name: 'inputName', kind: 'text', label: 'Name' }, 'hi', onChange);
    const input = screen.getByLabelText('Name');
    expect(input.value).toBe('hi');
    fireEvent.change(input, { target: { value: 'world' } });
    expect(onChange).toHaveBeenCalledWith('world');
  });

  test('number field reports a numeric value', () => {
    const onChange = jest.fn();
    renderField({ name: 'temperature', kind: 'number', label: 'Temp' }, 0.7, onChange);
    const input = screen.getByLabelText('Temp');
    fireEvent.change(input, { target: { value: '0.9' } });
    expect(onChange).toHaveBeenCalledWith(0.9);
  });

  test('textarea field renders a textarea', () => {
    renderField({ name: 'content', kind: 'textarea', label: 'Template' }, 'text');
    expect(screen.getByLabelText('Template').tagName).toBe('TEXTAREA');
  });

  test('select field renders its options and reports selection', () => {
    const onChange = jest.fn();
    renderField(
      { name: 'model', kind: 'select', label: 'Model', options: ['a', 'b'] },
      'a',
      onChange,
    );
    const select = screen.getByLabelText('Model');
    fireEvent.change(select, { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  test('checkbox field reports a boolean', () => {
    const onChange = jest.fn();
    renderField(
      { name: 'includeHistory', kind: 'checkbox', label: 'History' },
      false,
      onChange,
    );
    fireEvent.click(screen.getByLabelText('History'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test('code field is read-only and shows the value', () => {
    renderField({ name: 'generatedCode', kind: 'code', label: 'Code' }, 'print(1)');
    expect(screen.getByText('print(1)')).toBeInTheDocument();
    expect(document.querySelector('input')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });

  test('code field shows a placeholder when empty', () => {
    renderField({ name: 'generatedCode', kind: 'code', label: 'Code' }, '');
    expect(screen.getByText(/no code generated yet/i)).toBeInTheDocument();
  });

  test('info field renders its value as read-only text', () => {
    renderField({ name: 'aiExplanation', kind: 'info', label: 'Why' }, 'It parses JSON.');
    expect(screen.getByText('It parses JSON.')).toBeInTheDocument();
    expect(document.querySelector('input')).toBeNull();
  });

  test('params field adds a row when the add button is clicked', () => {
    const onChange = jest.fn();
    renderField({ name: 'parameters', kind: 'params', label: 'Parameters' }, [], onChange);
    fireEvent.click(screen.getByText(/add parameter/i));
    expect(onChange).toHaveBeenCalledWith([{ name: '', type: 'string', description: '' }]);
  });

  test('params field removes a row', () => {
    const onChange = jest.fn();
    const rows = [{ name: 'id', type: 'string', description: 'the id' }];
    renderField({ name: 'parameters', kind: 'params', label: 'Parameters' }, rows, onChange);
    fireEvent.click(screen.getByLabelText('Remove parameter id'));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
