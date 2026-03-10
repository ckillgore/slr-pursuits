'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Send, X, AtSign } from 'lucide-react';
import { useEntityComments, useCreateComment, useUsers } from '@/hooks/useSupabaseQueries';
import { useAuth } from '@/components/AuthProvider';
import type { CommentEntityType, EntityComment, UserProfile } from '@/types';

interface CommentPanelProps {
    entityType: CommentEntityType;
    entityId: string;
    onClose: () => void;
}

export default function CommentPanel({ entityType, entityId, onClose }: CommentPanelProps) {
    const { profile } = useAuth();
    const { data: comments = [], isLoading } = useEntityComments(entityType, entityId);
    const { data: users = [] } = useUsers();
    const createComment = useCreateComment();

    const [draft, setDraft] = useState('');
    const [showMentionMenu, setShowMentionMenu] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [mentionIndex, setMentionIndex] = useState(0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when comments change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [comments.length]);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        // Delay listener to avoid triggering on the same click that opened the panel
        const timer = setTimeout(() => document.addEventListener('mousedown', handleClick), 50);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClick);
        };
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // Build a map of user IDs to names
    const userMap = useMemo(() => {
        const m: Record<string, UserProfile> = {};
        users.forEach((u) => { m[u.id] = u; });
        return m;
    }, [users]);

    // Filtered users for @mention autocomplete
    const filteredUsers = useMemo(
        () => users.filter((u) =>
            u.id !== profile?.id &&
            u.full_name?.toLowerCase().includes(mentionFilter.toLowerCase())
        ).slice(0, 6),
        [users, mentionFilter, profile?.id]
    );

    // Extract @mentions from content: @[userId] format
    const extractMentions = useCallback((text: string): string[] => {
        const matches = text.match(/@\[([a-f0-9-]+)\]/g);
        if (!matches) return [];
        return [...new Set(matches.map((m) => m.slice(2, -1)))];
    }, []);

    // Handle textarea input changes
    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setDraft(val);

        // Check for @ trigger
        const cursor = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, cursor);
        const atMatch = textBeforeCursor.match(/@(\w*)$/);
        if (atMatch) {
            setShowMentionMenu(true);
            setMentionFilter(atMatch[1]);
            setMentionIndex(0);
        } else {
            setShowMentionMenu(false);
        }
    }, []);

    // Insert @mention
    const insertMention = useCallback((user: UserProfile) => {
        const cursor = textareaRef.current?.selectionStart ?? draft.length;
        const textBeforeCursor = draft.slice(0, cursor);
        const atMatch = textBeforeCursor.match(/@(\w*)$/);
        if (!atMatch) return;

        const before = textBeforeCursor.slice(0, atMatch.index);
        const after = draft.slice(cursor);
        const mention = `@[${user.id}](${user.full_name}) `;
        const newDraft = before + mention + after;
        setDraft(newDraft);
        setShowMentionMenu(false);

        // Restore focus
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                const newCursor = (before + mention).length;
                textareaRef.current.focus();
                textareaRef.current.setSelectionRange(newCursor, newCursor);
            }
        });
    }, [draft]);

    // Handle keyboard in mention menu
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showMentionMenu && filteredUsers.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionIndex((i) => Math.min(i + 1, filteredUsers.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionIndex((i) => Math.max(i - 1, 0));
                return;
            }
            if (e.key === 'Tab' || e.key === 'Enter') {
                e.preventDefault();
                insertMention(filteredUsers[mentionIndex]);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowMentionMenu(false);
                return;
            }
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
        }
    }, [showMentionMenu, filteredUsers, mentionIndex, insertMention]);

    const handleSubmit = useCallback(() => {
        if (!draft.trim() || !profile?.id) return;

        // Extract mention user IDs from @[userId](Name) format
        const mentionMatches = draft.match(/@\[([a-f0-9-]+)\]\([^)]+\)/g);
        const mentions = mentionMatches
            ? [...new Set(mentionMatches.map((m) => m.match(/@\[([a-f0-9-]+)\]/)![1]))]
            : [];

        // Store clean content with mention tokens (@[userId])
        const content = draft.replace(/@\[([a-f0-9-]+)\]\(([^)]+)\)/g, '@[$1]');

        createComment.mutate({
            entityType, entityId,
            authorId: profile.id,
            content,
            mentions,
        });
        setDraft('');
    }, [draft, profile?.id, entityType, entityId, createComment]);

    // Render comment content with mentions highlighted
    const renderContent = useCallback((text: string) => {
        const parts = text.split(/(@\[[a-f0-9-]+\])/g);
        return parts.map((part, i) => {
            const match = part.match(/^@\[([a-f0-9-]+)\]$/);
            if (match) {
                const user = userMap[match[1]];
                return (
                    <span key={i} className="bg-[var(--accent-subtle)] text-[var(--accent)] px-1 rounded font-medium">
                        @{user?.full_name || 'Unknown'}
                    </span>
                );
            }
            return <span key={i}>{part}</span>;
        });
    }, [userMap]);

    const getInitials = (name?: string) =>
        name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay < 7) return `${diffDay}d ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div
            ref={panelRef}
            className="absolute right-0 top-full mt-2 z-50 w-96 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl animate-fade-in flex flex-col"
            style={{ maxHeight: '520px' }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--table-row-border)]">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Comments</h3>
                    {comments.length > 0 && (
                        <span className="text-[10px] bg-[var(--bg-elevated)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full font-medium">
                            {comments.length}
                        </span>
                    )}
                </div>
                <button onClick={onClose} className="p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ maxHeight: '340px', minHeight: '120px' }}>
                {isLoading ? (
                    <div className="text-center py-8 text-xs text-[var(--text-faint)]">Loading comments...</div>
                ) : comments.length === 0 ? (
                    <div className="text-center py-8">
                        <div className="text-sm text-[var(--text-faint)]">No comments yet</div>
                        <div className="text-[10px] text-[var(--border-strong)] mt-1">Start the conversation below</div>
                    </div>
                ) : (
                    comments.map((c) => (
                        <div key={c.id} className="flex gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white">
                                {getInitials(userMap[c.author_id]?.full_name)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xs font-semibold text-[var(--text-primary)]">{userMap[c.author_id]?.full_name || 'Unknown'}</span>
                                    <span className="text-[10px] text-[var(--text-faint)]">{formatTime(c.created_at)}</span>
                                </div>
                                <div className="text-xs text-[var(--text-secondary)] leading-relaxed mt-0.5 break-words">
                                    {renderContent(c.content)}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Input Area */}
            <div className="relative border-t border-[var(--table-row-border)] px-4 py-3">
                {/* Mention Autocomplete */}
                {showMentionMenu && filteredUsers.length > 0 && (
                    <div className="absolute bottom-full left-4 right-4 mb-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden z-10">
                        {filteredUsers.map((u, i) => (
                            <button
                                key={u.id}
                                onClick={() => insertMention(u)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${i === mentionIndex ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                                    }`}
                            >
                                <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0">
                                    {getInitials(u.full_name)}
                                </div>
                                <span className="font-medium">{u.full_name}</span>
                                <span className="text-[var(--text-faint)] truncate">{u.email}</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a comment... Use @ to mention"
                            className="w-full px-3 py-2 pr-8 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-subtle)] focus:outline-none resize-none"
                            rows={2}
                        />
                        <button
                            onClick={() => {
                                const ta = textareaRef.current;
                                if (ta) {
                                    const cursor = ta.selectionStart;
                                    const before = draft.slice(0, cursor);
                                    const after = draft.slice(cursor);
                                    setDraft(before + '@' + after);
                                    setShowMentionMenu(true);
                                    setMentionFilter('');
                                    requestAnimationFrame(() => {
                                        ta.focus();
                                        ta.setSelectionRange(cursor + 1, cursor + 1);
                                    });
                                }
                            }}
                            className="absolute right-2 bottom-2 p-1 text-[var(--text-faint)] hover:text-[var(--accent)] transition-colors"
                            title="Mention someone"
                            type="button"
                        >
                            <AtSign className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={!draft.trim() || createComment.isPending}
                        className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white transition-colors flex-shrink-0"
                        title="Send (Ctrl+Enter)"
                    >
                        <Send className="w-3.5 h-3.5" />
                    </button>
                </div>
                <div className="text-[9px] text-[var(--border-strong)] mt-1.5">Ctrl+Enter to send · @ to mention</div>
            </div>
        </div>
    );
}
