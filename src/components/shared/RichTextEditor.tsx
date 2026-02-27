'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { useCallback, useRef, useEffect } from 'react';
import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    List,
    ListOrdered,
    Heading2,
    Undo2,
    Redo2,
    Quote,
    Minus,
} from 'lucide-react';

interface RichTextEditorProps {
    content: Record<string, unknown> | null;
    onChange: (json: Record<string, unknown>) => void;
    placeholder?: string;
    /** Debounce delay in ms before calling onChange. Default 500. */
    debounceMs?: number;
}

/**
 * Tiptap-based rich text editor with minimal toolbar.
 * Stores content as JSON (ProseMirror doc) for Supabase JSONB columns.
 */
export function RichTextEditor({
    content,
    onChange,
    placeholder = 'Start typing...',
    debounceMs = 500,
}: RichTextEditorProps) {
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
                underline: false,
            }),
            Underline,
            Placeholder.configure({ placeholder }),
        ],
        content: content ?? undefined,
        editorProps: {
            attributes: {
                class: 'rich-text-editor-content',
            },
        },
        onUpdate: ({ editor }) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                const json = editor.getJSON();
                onChangeRef.current(json as Record<string, unknown>);
            }, debounceMs);
        },
    });

    // Sync external content changes (e.g., from Realtime refetch)
    useEffect(() => {
        if (!editor || !content) return;
        const currentJson = JSON.stringify(editor.getJSON());
        const incomingJson = JSON.stringify(content);
        if (currentJson !== incomingJson) {
            editor.commands.setContent(content);
        }
    }, [content, editor]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    if (!editor) return null;

    return (
        <div className="rich-text-editor border border-[#E2E5EA] rounded-lg overflow-hidden focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#EBF1FF] transition-all">
            {/* Toolbar */}
            <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#F0F1F4] bg-[#FAFBFC]">
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive('bold')}
                    title="Bold"
                >
                    <Bold className="w-3.5 h-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive('italic')}
                    title="Italic"
                >
                    <Italic className="w-3.5 h-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    active={editor.isActive('underline')}
                    title="Underline"
                >
                    <UnderlineIcon className="w-3.5 h-3.5" />
                </ToolbarButton>

                <div className="w-px h-4 bg-[#E2E5EA] mx-1" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    active={editor.isActive('heading', { level: 2 })}
                    title="Heading"
                >
                    <Heading2 className="w-3.5 h-3.5" />
                </ToolbarButton>

                <div className="w-px h-4 bg-[#E2E5EA] mx-1" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive('bulletList')}
                    title="Bullet List"
                >
                    <List className="w-3.5 h-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive('orderedList')}
                    title="Numbered List"
                >
                    <ListOrdered className="w-3.5 h-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    active={editor.isActive('blockquote')}
                    title="Quote"
                >
                    <Quote className="w-3.5 h-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="Divider"
                >
                    <Minus className="w-3.5 h-3.5" />
                </ToolbarButton>

                <div className="flex-1" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    title="Undo"
                >
                    <Undo2 className="w-3.5 h-3.5" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    title="Redo"
                >
                    <Redo2 className="w-3.5 h-3.5" />
                </ToolbarButton>
            </div>

            {/* Editor */}
            <EditorContent editor={editor} />
        </div>
    );
}

function ToolbarButton({
    onClick,
    active,
    disabled,
    title,
    children,
}: {
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`p-1.5 rounded-md transition-colors ${active
                ? 'bg-[#EBF1FF] text-[#2563EB]'
                : 'text-[#7A8599] hover:text-[#4A5568] hover:bg-[#F4F5F7]'
                } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
            {children}
        </button>
    );
}
