import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HoneypotField } from '../HoneypotField';
import { buildCreateLeadBody } from '@/pages/publicLeadFormRequests';

describe('HoneypotField', () => {
  it('e um campo "website" escondido do ecra e dos leitores de ecra, fora da ordem do teclado', () => {
    const { container } = render(<HoneypotField value="" onChange={() => {}} />);
    const input = container.querySelector('input[name="website"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('aria-hidden', 'true');
    const wrapper = input.parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute('aria-hidden', 'true');
    expect(wrapper).not.toBeNull();
    // escondido por CSS sem display:none (alguns bots ignoram esses campos)
    expect(wrapper.style.position).toBe('absolute');
    expect(wrapper.style.left).toBe('-10000px');
    expect(wrapper.style.height).toBe('1px');
    expect(wrapper.style.overflow).toBe('hidden');
  });

  it('nao aparece como campo acessivel nem tem rotulo visivel', () => {
    render(<HoneypotField value="" onChange={() => {}} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('propaga o que um bot escrever', () => {
    const onChange = vi.fn();
    const { container } = render(<HoneypotField value="" onChange={onChange} />);
    const input = container.querySelector('input[name="website"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http://spam.example' } });
    expect(onChange).toHaveBeenCalledWith('http://spam.example');
  });
});

describe('buildCreateLeadBody: honeypot', () => {
  const base = {
    stepNumber: 1, stepFieldValues: { email: 'a@b.pt' }, sourceId: null, needsManualScheduling: false,
    locale: null, formId: 'ffffffff-0000-4000-8000-000000000003',
  };
  it('vazio ou ausente: a chave website nao vai (um humano nunca a preenche)', () => {
    expect(buildCreateLeadBody(base)).not.toHaveProperty('website');
    expect(buildCreateLeadBody({ ...base, honeypot: '' })).not.toHaveProperty('website');
  });
  it('preenchido: vai como website', () => {
    expect(buildCreateLeadBody({ ...base, honeypot: 'x.com' }).website).toBe('x.com');
  });
});
