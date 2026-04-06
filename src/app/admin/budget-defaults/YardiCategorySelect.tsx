import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import type categoryMapping from '../../../../category-mapping.json';

type CategoryMapping = Record<string, string>;

interface YardiCategorySelectProps {
  mapping: CategoryMapping;
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  className?: string;
}

export function YardiCategorySelect({ mapping, selectedCodes, onChange, className = '' }: YardiCategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const standardOptions = useMemo(() => {
    return Object.entries(mapping).map(([code, name]) => ({
      id: code,
      name: `${code} - ${name}`,
    }));
  }, [mapping]);

  const filteredOptions = useMemo(() => {
    if (!inputValue.trim()) return standardOptions;
    const lower = inputValue.toLowerCase();
    return standardOptions.filter(o => o.name.toLowerCase().includes(lower));
  }, [inputValue, standardOptions]);

  const handleToggle = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (selectedCodes.includes(id)) {
      onChange(selectedCodes.filter(c => c !== id));
    } else {
      onChange([...selectedCodes, id]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const code = inputValue.trim();
      // If it exactly matches an option, select it; otherwise add as custom
      const match = filteredOptions.find(o => o.id === code || o.name === code);
      if (match) {
        if (!selectedCodes.includes(match.id)) handleToggle(match.id);
      } else {
        if (!selectedCodes.includes(code)) handleToggle(code);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && selectedCodes.length > 0) {
      // Remove last tag on backspace empty
      onChange(selectedCodes.slice(0, -1));
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div 
        className={`w-full min-h-[38px] flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border transition-colors cursor-text ${isOpen ? 'border-[var(--accent)] ring-1 ring-[var(--accent-subtle)]' : 'border-[var(--border)] hover:border-[var(--accent)]'}`}
        onClick={() => {
            setIsOpen(true);
            inputRef.current?.focus();
        }}
      >
        {selectedCodes.map(code => {
          const isStandard = mapping[code] !== undefined;
          return (
            <span 
              key={code} 
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${isStandard ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border)]'}`}
            >
              {code}
              <button
                onClick={(e) => { e.stopPropagation(); handleToggle(code); }}
                className="hover:text-[var(--danger)] transition-colors focus:outline-none"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={selectedCodes.length === 0 ? "Select or enter code..." : ""}
          className="flex-1 min-w-[100px] bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)]"
        />
        <ChevronDown className={`w-4 h-4 text-[var(--text-faint)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="py-1">
            {filteredOptions.length > 0 ? (
                filteredOptions.map(option => {
                  const isSelected = selectedCodes.includes(option.id);
                  return (
                    <button
                      key={option.id}
                      onClick={(e) => handleToggle(option.id, e)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[var(--bg-elevated)] transition-colors text-left"
                    >
                      <span className={`truncate ${isSelected ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                        {option.name}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-[var(--accent)] shrink-0 ml-2" />}
                    </button>
                  );
                })
            ) : (
                <div className="px-3 py-2 text-sm text-[var(--text-muted)] italic">
                   Press Enter to add custom code "{inputValue}"
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
