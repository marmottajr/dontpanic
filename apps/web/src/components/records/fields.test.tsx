import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field, FieldSet, MaskedInput, SelectInput, TextareaInput } from './fields';

describe('Field', () => {
  it('ties the label to the control and marks it required', () => {
    render(
      <Field id="name" label="Name" required>
        <input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the hint while there is no error', () => {
    render(
      <Field id="tax" label="Tax id" hint="Digits only" className="sm:col-span-2">
        <input id="tax" />
      </Field>,
    );
    expect(screen.getByText('Digits only')).toBeInTheDocument();
  });

  it('replaces the hint with the error, under a predictable id', () => {
    render(
      <Field id="tax" label="Tax id" hint="Digits only" error="Must have 9 digits">
        <input id="tax" />
      </Field>,
    );
    expect(screen.queryByText('Digits only')).not.toBeInTheDocument();
    expect(screen.getByText('Must have 9 digits')).toHaveAttribute('id', 'tax-error');
  });

  it('shows neither marker nor message when the field is plain and valid', () => {
    render(
      <Field id="plain" label="Plain">
        <input id="plain" />
      </Field>,
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });
});

describe('MaskedInput', () => {
  it('masks every keystroke before handing the value over', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const mask = (value: string) => value.replace(/\D/g, '').toUpperCase();

    render(<MaskedInput aria-label="Code" mask={mask} onChange={onChange} />);
    const input = screen.getByLabelText('Code');
    await user.type(input, 'a1b2');

    expect(input).toHaveValue('12');
    expect(onChange).toHaveBeenCalled();
  });

  it('works with no onChange of its own', async () => {
    const user = userEvent.setup();
    render(<MaskedInput aria-label="Code" mask={(value) => value.slice(0, 3)} />);
    await user.type(screen.getByLabelText('Code'), 'abcdef');
    expect(screen.getByLabelText('Code')).toHaveValue('abc');
  });
});

describe('SelectInput', () => {
  it('is a native select carrying the system tokens', async () => {
    const user = userEvent.setup();
    render(
      <SelectInput aria-label="Status" className="w-40" defaultValue="open">
        <option value="open">Open</option>
        <option value="done">Done</option>
      </SelectInput>,
    );
    const select = screen.getByLabelText('Status');
    expect(select).toHaveClass('w-40');
    await user.selectOptions(select, 'done');
    expect(select).toHaveValue('done');
  });
});

describe('TextareaInput', () => {
  it('takes text like any textarea', async () => {
    const user = userEvent.setup();
    render(<TextareaInput aria-label="Notes" className="min-h-40" />);
    await user.type(screen.getByLabelText('Notes'), 'hello');
    expect(screen.getByLabelText('Notes')).toHaveValue('hello');
    expect(screen.getByLabelText('Notes')).toHaveClass('min-h-40');
  });
});

describe('FieldSet', () => {
  it('groups fields under a legend', () => {
    render(
      <FieldSet legend="Address" className="pt-2">
        <input aria-label="Street" />
      </FieldSet>,
    );
    expect(screen.getByRole('group', { name: 'Address' })).toBeInTheDocument();
    expect(screen.getByLabelText('Street')).toBeInTheDocument();
  });
});
