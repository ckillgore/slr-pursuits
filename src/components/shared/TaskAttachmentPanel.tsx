import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTaskAttachments, useCreateTaskAttachment, useDeleteTaskAttachment } from '@/hooks/useSupabaseQueries';
import { createClient } from '@/lib/supabase/client';
import {
    listExternalAttachments,
    createExternalUploadUrl,
    finalizeExternalUpload,
    getExternalDownloadUrl,
} from '@/app/portal/task/[token]/actions';
import { Paperclip, Download, Trash2, File as FileIcon, Loader2, Image as ImageIcon, FileText, Plus } from 'lucide-react';
import type { TaskAttachment } from '@/types';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // matches the "up to 50MB" hint below

/** Row shape shared by the internal (RLS) and external (portal action) sources. */
type AttachmentRow = {
    id: string;
    file_name: string;
    content_type: string | null;
    size_bytes: number | null;
    uploaderName: string | null;
    storage_path?: string; // internal only — portal users never see storage paths
};

/**
 * Internal users read/write attachments directly under RLS. External portal
 * users have no Supabase session, so when `externalToken` is set every
 * operation goes through the token-checked portal server actions instead.
 */
export default function TaskAttachmentPanel({ taskId, externalToken }: { taskId: string; externalToken?: string }) {
    const isExternal = !!externalToken;
    const queryClient = useQueryClient();
    const internalQuery = useTaskAttachments(isExternal ? '' : taskId);
    const externalQueryKey = ['portal-attachments', externalToken] as const;
    const externalQuery = useQuery({
        queryKey: externalQueryKey,
        queryFn: async () => {
            const res = await listExternalAttachments(externalToken!);
            if (res.error) throw new Error(res.error);
            return res.attachments ?? [];
        },
        enabled: isExternal,
    });
    const isLoading = isExternal ? externalQuery.isLoading : internalQuery.isLoading;
    const attachments: AttachmentRow[] = isExternal
        ? (externalQuery.data ?? []).map(a => ({ ...a, uploaderName: a.uploader_name }))
        : (internalQuery.data ?? []).map((a: TaskAttachment) => ({
            id: a.id,
            file_name: a.file_name,
            content_type: a.content_type,
            size_bytes: a.size_bytes,
            storage_path: a.storage_path,
            uploaderName: a.uploader?.full_name || a.uploader_external?.name || null,
        }));
    const createAttachment = useCreateTaskAttachment();
    const deleteAttachment = useDeleteTaskAttachment();

    const [isDragging, setIsDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await handleUpload(e.target.files[0]);
        }
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            await handleUpload(e.dataTransfer.files[0]);
        }
    };

    const handleUpload = async (file: File) => {
        if (!file) return;
        if (file.size > MAX_UPLOAD_BYTES) {
            alert(`"${file.name}" is ${formatBytes(file.size)} — the limit is 50 MB.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        if (file.size === 0) {
            alert(`"${file.name}" is empty.`);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        setUploading(true);
        if (externalToken) {
            try {
                const prep = await createExternalUploadUrl(externalToken, file.name, file.size);
                if (prep.error || !prep.path || !prep.uploadToken) throw new Error(prep.error || 'Failed to prepare upload');
                const { error: uploadError } = await supabase.storage
                    .from('task-files')
                    .uploadToSignedUrl(prep.path, prep.uploadToken, file, { contentType: file.type || undefined });
                if (uploadError) throw uploadError;
                const done = await finalizeExternalUpload(externalToken, prep.path, file.name);
                if (done.error) throw new Error(done.error);
                await queryClient.invalidateQueries({ queryKey: externalQueryKey });
            } catch (err) {
                console.error('Failed to upload file:', err);
                const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
                alert(`Failed to upload file${msg ? `: ${msg}` : ''}. Please try again.`);
            } finally {
                setUploading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
            return;
        }
        let uploadedPath: string | null = null;
        try {
            // Generate unique path. Only a sanitized extension from the user's file name is
            // used (a name without a dot used to put the whole raw name in the path).
            const dot = file.name.lastIndexOf('.');
            const rawExt = dot > 0 ? file.name.slice(dot + 1) : '';
            const ext = rawExt.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toLowerCase();
            const fileName = `${crypto.randomUUID()}${ext ? `.${ext}` : ''}`;
            const storagePath = `${taskId}/${fileName}`;

            // 1. Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('task-files')
                .upload(storagePath, file, { contentType: file.type || undefined });

            if (uploadError) throw uploadError;
            uploadedPath = storagePath;

            // 2. Create the Database Record
            const payload: Partial<TaskAttachment> = {
                task_id: taskId,
                file_name: file.name,
                storage_path: storagePath,
                content_type: file.type,
                size_bytes: file.size,
            };

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                payload.uploaded_by = user.id;
            }

            await createAttachment.mutateAsync(payload);
            uploadedPath = null;
        } catch (err) {
            console.error('Failed to upload file:', err);
            // Don't leave an orphaned object in storage if the DB record failed
            if (uploadedPath) {
                await supabase.storage.from('task-files').remove([uploadedPath]).catch(() => {});
            }
            const msg = err instanceof Error ? err.message : (err as { message?: string })?.message;
            alert(`Failed to upload file${msg ? `: ${msg}` : ''}. Please try again.`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDownload = async (attachment: AttachmentRow) => {
        if (externalToken) {
            const res = await getExternalDownloadUrl(externalToken, attachment.id);
            if (res.error || !res.url) {
                alert(res.error || 'Could not download file.');
                return;
            }
            window.open(res.url, '_blank');
            return;
        }
        if (!attachment.storage_path) return;
        const { data, error } = await supabase.storage.from('task-files').createSignedUrl(attachment.storage_path, 3600); // 1 hour link
        if (error || !data) {
            alert('Could not download file.');
            return;
        }
        window.open(data.signedUrl, '_blank');
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getIcon = (type: string | null) => {
        if (!type) return <FileIcon className="w-5 h-5 text-[var(--text-muted)]" />;
        if (type.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-500" />;
        if (type.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
        return <FileIcon className="w-5 h-5 text-[var(--text-muted)]" />;
    };

    return (
        <div className="space-y-4">
            {/* File List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-4 bg-[var(--bg-elevated)] rounded-lg animate-pulse">
                    <span className="text-sm tracking-widest uppercase font-semibold text-[var(--text-muted)]">Loading...</span>
                </div>
            ) : attachments.length > 0 ? (
                <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--table-row-border)] bg-[var(--bg-card)]">
                    {attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between p-3 hover:bg-[var(--bg-elevated)] transition-colors group">
                            <div className="flex items-center gap-3 min-w-0">
                                {getIcon(att.content_type)}
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{att.file_name}</p>
                                    <p className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                                        <span>{formatBytes(att.size_bytes || 0)}</span>
                                        <span>•</span>
                                        <span className="truncate">
                                            {att.uploaderName || 'System Generated'}
                                        </span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button onClick={() => handleDownload(att)} title="Download" className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] rounded transition-colors">
                                    <Download className="w-4 h-4" />
                                </button>
                                {!externalToken && (
                                    <button 
                                        onClick={async () => {
                                            if (window.confirm(`Are you sure you want to delete "${att.file_name}"?`)) {
                                                try {
                                                    // Delete the record first: if that fails, the file is still
                                                    // downloadable instead of leaving a record pointing at nothing.
                                                    await deleteAttachment.mutateAsync({ id: att.id, taskId });
                                                    if (att.storage_path) {
                                                        const { error: storageError } = await supabase.storage.from('task-files').remove([att.storage_path]);
                                                        if (storageError) console.error("Storage delete failed", storageError);
                                                    }
                                                } catch (e) {
                                                    console.error(e);
                                                    alert('Failed to delete file. Please try again.');
                                                }
                                            }
                                        }} 
                                        title="Delete" 
                                        className="p-1.5 text-[var(--text-muted)] hover:text-[#EF4444] hover:bg-[var(--danger-bg)] rounded transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-6 bg-[var(--bg-elevated)] border border-dashed border-[var(--border)] rounded-lg">
                    <Paperclip className="w-6 h-6 text-[var(--text-faint)] mx-auto mb-2" />
                    <p className="text-sm text-[var(--text-secondary)]">No files attached yet.</p>
                </div>
            )}

            {/* Upload Zone */}
            <div 
                className={`relative border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-colors ${isDragging ? 'border-[var(--accent)] bg-[var(--accent-subtle)]' : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]'} ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                {uploading ? (
                    <>
                        <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin mb-2" />
                        <p className="text-sm font-medium text-[var(--accent)]">Uploading file...</p>
                    </>
                ) : (
                    <>
                        <Plus className="w-6 h-6 text-[var(--text-muted)] mb-2" />
                        <p className="text-sm font-medium text-[var(--text-primary)]">Click to upload or drag and drop</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">PDF, Excel, Word, or Images up to 50MB</p>
                    </>
                )}
            </div>

        </div>
    );
}
