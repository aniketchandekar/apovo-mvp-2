'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface ChipOption {
  label: string;
  value: string;
  description?: string;
}

interface ChipGroupProps {
  options: (string | ChipOption)[];
  value: string | string[];
  onChange: (val: string | string[]) => void;
  multi?: boolean;
  name?: string;
}

export function ChipGroup({ options, value, onChange, multi = false, name }: ChipGroupProps) {
  const normalizedOptions: ChipOption[] = options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );

  const isSelected = (val: string) => {
    if (multi && Array.isArray(value)) {
      return value.includes(val);
    }
    return value === val;
  };

  const handleToggle = (val: string) => {
    if (multi && Array.isArray(value)) {
      if (value.includes(val)) {
        onChange(value.filter((v) => v !== val));
      } else {
        onChange([...value, val]);
      }
    } else {
      onChange(val);
    }
  };

  return (
    <div className="choice-list" role={multi ? 'group' : 'radiogroup'} aria-label={name}>
      {normalizedOptions.map((opt) => {
        const selected = isSelected(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            className={`choice-option ${selected ? 'selected' : ''}`}
            onClick={() => handleToggle(opt.value)}
            aria-pressed={multi ? selected : undefined}
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={selected}
          >
            <div>
              <div>{opt.label}</div>
              {opt.description && (
                <div style={{ fontSize: '0.88rem', color: 'var(--ink-muted)', fontWeight: 400, marginTop: '2px' }}>
                  {opt.description}
                </div>
              )}
            </div>
            <span className="choice-indicator" aria-hidden="true">
              {selected && <Check size={13} strokeWidth={2.5} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
