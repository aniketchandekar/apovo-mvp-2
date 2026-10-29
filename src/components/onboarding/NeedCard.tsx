'use client';

import React from 'react';
import { Check } from 'lucide-react';

export interface NeedItem {
  id: string;
  title: string;
  subtitle?: string;
}

interface NeedCardProps {
  item: NeedItem;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function NeedCard({ item, selected, onToggle }: NeedCardProps) {
  return (
    <button
      type="button"
      className={`choice-option ${selected ? 'selected' : ''}`}
      onClick={() => onToggle(item.id)}
      role="checkbox"
      aria-checked={selected}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1.02rem', fontWeight: 500, color: 'var(--ink)' }}>{item.title}</div>
        {item.subtitle && (
          <div style={{ fontSize: '0.88rem', color: 'var(--ink-muted)', fontWeight: 400, marginTop: '2px' }}>
            {item.subtitle}
          </div>
        )}
      </div>
      <span className="choice-indicator" aria-hidden="true">
        {selected && <Check size={13} strokeWidth={2.5} />}
      </span>
    </button>
  );
}
