import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface MultiSelectOption {
  id: string;
  name: string;
  color?: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  placeholder: string;
  className?: string;
}

export function MultiSelectDropdown({ options, selectedIds, onChange, placeholder, className = 'w-48' }: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(v => v !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const getLabel = () => {
    if (!selectedIds || selectedIds.length === 0) return placeholder;
    if (selectedIds.length === 1) return options.find(o => o.id === selectedIds[0])?.name || placeholder;
    return `${selectedIds.length} Selected`;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-full min-h-[38px] flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus:border-[var(--accent)]"
      >
        <span className="truncate pr-2">{getLabel()}</span>
        <ChevronDown className={`w-4 h-4 opacity-50 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 w-full mt-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="py-1">
             <button
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors border-b border-[var(--border)]"
             >
                Clear Selections
             </button>
            {options.map(option => {
              const isSelected = selectedIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  onClick={(e) => toggleOption(option.id, e)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    {option.color && (
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: option.color }} />
                    )}
                    <span className={`truncate ${isSelected ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
                      {option.name}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[var(--accent)] shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
