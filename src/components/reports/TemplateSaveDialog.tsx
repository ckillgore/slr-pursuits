'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface TemplateSaveDialogProps {
    initialName?: string;
    initialDescription?: string;
    mode: 'save' | 'save_as';
    onSave: (name: string, description: string) => void;
    onClose: () => void;
    isPending?: boolean;
}

export function TemplateSaveDialog({
    initialName = '',
    initialDescription = '',
    mode,
    onSave,
    onClose,
    isPending,
}: TemplateSaveDialogProps) {
    const [name, setName] = useState(initialName);
    const [description, setDescription] = useState(initialDescription);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <div className="bg-white border border-[#E2E5EA] rounded-xl p-6 w-full max-w-md shadow-xl animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[#1A1F2B]">
                        {mode === 'save' ? 'Save Report Template' : 'Save As New Template'}
                    </h2>
                    <button onClick={onClose} className="p-1 rounded hover:bg-[#F4F5F7] text-[#7A8599]">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                            Template Name <span className="text-[#DC2626]">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder='e.g., "Pipeline Report"'
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[#4A5568] mb-1.5 uppercase tracking-wider">
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Optional description..."
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-[#E2E5EA] text-sm text-[#1A1F2B] placeholder:text-[#A0AABB] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EBF1FF] focus:outline-none resize-none"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm text-[#4A5568] hover:text-[#1A1F2B] hover:bg-[#F4F5F7] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave(name.trim(), description.trim())}
                        disabled={!name.trim() || isPending}
                        className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4FD7] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors shadow-sm"
                    >
                        {isPending ? 'Saving...' : mode === 'save' ? 'Save' : 'Save As'}
                    </button>
                </div>
            </div>
        </div>
    );
}
