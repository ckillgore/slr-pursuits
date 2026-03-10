import { AppShell } from '@/components/layout/AppShell';
import { TasksClient } from './TasksClient';

export const metadata = {
    title: 'My Tasks - SLR Pursuits',
    description: 'Manage tasks assigned to you across all pursuits',
};

export default function TasksPage() {
    return (
        <AppShell>
            <TasksClient />
        </AppShell>
    );
}
