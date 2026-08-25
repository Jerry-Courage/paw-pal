import { useMemo } from 'react';
import { useLearningPaths } from './useLearningPaths';
import { useResources } from './useResources';
import api from '@/services/api';
import { useQuery } from '@tanstack/react-query';
import { Resource, Assignment, StudySession } from '@/types';

export interface NextMove {
  type: 'path_continue' | 'resource_study' | 'concept_review' | 'assignment_due' | 'session_upcoming' | 'resource_upload' | 'path_create';
  title: string;
  subtitle: string;
  resourceId?: number;
  pathId?: string;
  conceptId?: string;
  activityType?: string;
  progress?: number;
  destination: string;
  reason: string;
  icon: string;
  color: string;
}

function useTodayItems() {
  return useQuery({
    queryKey: ['todayItems'],
    queryFn: async () => {
      const [assignRes, sessionRes] = await Promise.all([
        api.get('/assignments/').catch(() => ({ data: [] })),
        api.get('/planner/sessions/').catch(() => ({ data: [] })),
      ]);
      const assignments: Assignment[] = Array.isArray(assignRes.data) ? assignRes.data : assignRes.data?.results || [];
      const sessions: StudySession[] = Array.isArray(sessionRes.data) ? sessionRes.data : sessionRes.data?.results || [];
      return { assignments, sessions };
    },
    staleTime: 60_000,
  });
}

export function useNextMove(): NextMove | null {
  const pathsQuery = useLearningPaths();
  const resourcesQuery = useResources();
  const todayQuery = useTodayItems();

  return useMemo(() => {
    const paths = pathsQuery.data || [];
    const resources = Array.isArray(resourcesQuery.data) ? resourcesQuery.data : [];
    const readyResources = resources.filter((r: Resource) => r.status === 'ready');
    const { assignments, sessions } = todayQuery.data || { assignments: [], sessions: [] };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);

    // Priority 1: Active learning path with current concept
    const activePaths = paths.filter((p) => p.status === 'active');
    for (const path of activePaths) {
      // The path has concepts — check if there's a current one
      // We need to fetch path detail to find current concept, but for list-level data:
      if (path.concepts_completed < path.total_concepts && path.total_concepts > 0) {
        return {
          type: 'path_continue' as const,
          title: path.title,
          subtitle: path.subject || `${path.concepts_completed}/${path.total_concepts} concepts`,
          pathId: path.id,
          progress: path.mastery_percent,
          destination: `/(tabs)/learn/${path.id}`,
          reason: `Continue your ${path.title} journey`,
          icon: 'compass',
          color: '#FF7A1A',
        };
      }
    }

    // Priority 2: Concept due for review
    for (const path of activePaths) {
      if (path.due_reviews > 0) {
        return {
          type: 'concept_review' as const,
          title: `${path.due_reviews} concept${path.due_reviews !== 1 ? 's' : ''} due for review`,
          subtitle: path.title,
          pathId: path.id,
          destination: `/(tabs)/learn/${path.id}`,
          reason: 'Spaced repetition keeps knowledge fresh',
          icon: 'refresh-circle',
          color: '#eab308',
        };
      }
    }

    // Priority 3: Assignment due soon
    const pendingAssignments = assignments.filter(
      (a: Assignment) => a.status !== 'completed' && a.due_date
    );
    const dueAssignments = pendingAssignments.filter((a: Assignment) => {
      const due = new Date(a.due_date!);
      return due >= today && due < tomorrow;
    });
    if (dueAssignments.length > 0) {
      const a = dueAssignments[0];
      return {
        type: 'assignment_due' as const,
        title: a.title,
        subtitle: a.subject || 'Assignment due today',
        resourceId: a.resources?.[0],
        destination: '/(tabs)/more/assignments',
        reason: 'Due today',
        icon: 'document-text',
        color: '#8b5cf6',
      };
    }

    // Priority 4: Scheduled session today
    const todaySessions = sessions.filter((s: StudySession) => {
      if (s.status === 'completed' || s.status === 'skipped') return false;
      const start = new Date(s.start_time);
      return start >= today && start < tomorrow;
    });
    if (todaySessions.length > 0) {
      const s = todaySessions[0];
      return {
        type: 'session_upcoming' as const,
        title: s.title,
        subtitle: s.subject || 'Study session',
        destination: '/(tabs)/more/planner',
        reason: 'Scheduled for today',
        icon: 'calendar',
        color: '#f97316',
      };
    }

    // Priority 5: Recently studied unfinished resource
    const studiedResources = readyResources.filter((r: Resource) => r.has_study_kit);
    if (studiedResources.length > 0) {
      const r = studiedResources[0];
      return {
        type: 'resource_study' as const,
        title: r.title,
        subtitle: r.subject || r.resource_type.toUpperCase(),
        resourceId: r.id,
        destination: `/(tabs)/learn/${r.id}`,
        reason: 'Pick up where you left off',
        icon: 'book',
        color: '#22c55e',
      };
    }

    // Priority 6: Unstudied ready resource
    if (readyResources.length > 0) {
      const r = readyResources[0];
      return {
        type: 'resource_study' as const,
        title: r.title,
        subtitle: r.subject || r.resource_type.toUpperCase(),
        resourceId: r.id,
        destination: `/(tabs)/learn/${r.id}`,
        reason: 'Start studying this resource',
        icon: 'play-circle',
        color: '#06b6d4',
      };
    }

    // Priority 7: No resources → upload CTA
    if (resources.length === 0) {
      return {
        type: 'resource_upload' as const,
        title: 'Give Flow something to teach you',
        subtitle: 'Upload PDFs, videos, slides & more',
        destination: '/(tabs)/library',
        reason: 'Add your first study material',
        icon: 'rocket',
        color: '#FF7A1A',
      };
    }

    // Priority 8: Resources but no learning path
    if (paths.length === 0 && readyResources.length > 0) {
      return {
        type: 'path_create' as const,
        title: 'Build a Journey from your material',
        subtitle: 'Let Flow organize what to learn next',
        destination: '/(tabs)/learn',
        reason: 'Create a learning path',
        icon: 'map',
        color: '#8b5cf6',
      };
    }

    return null;
  }, [pathsQuery.data, resourcesQuery.data, todayQuery.data]);
}

export function useTodayTasks() {
  const todayQuery = useTodayItems();
  const pathsQuery = useLearningPaths();

  return useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      type: 'review' | 'study' | 'assignment' | 'session';
      status: 'done' | 'active' | 'upcoming';
      destination: string;
    }> = [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 86400000);

    // Path reviews due
    const paths = pathsQuery.data || [];
    for (const path of paths) {
      if (path.due_reviews > 0) {
        items.push({
          id: `review-${path.id}`,
          title: `Review ${path.title}`,
          type: 'review',
          status: 'active',
          destination: `/(tabs)/learn/${path.id}`,
        });
      }
    }

    // Assignments due today
    const { assignments, sessions } = todayQuery.data || { assignments: [], sessions: [] };
    for (const a of assignments) {
      if (a.status === 'completed') continue;
      if (!a.due_date) continue;
      const due = new Date(a.due_date);
      if (due >= today && due < tomorrow) {
        items.push({
          id: `assignment-${a.id}`,
          title: a.title,
          type: 'assignment',
          status: 'active',
          destination: '/(tabs)/more/assignments',
        });
      }
    }

    // Sessions today
    for (const s of sessions) {
      if (s.status === 'completed' || s.status === 'skipped') continue;
      const start = new Date(s.start_time);
      if (start >= today && start < tomorrow) {
        items.push({
          id: `session-${s.id}`,
          title: s.title,
          type: 'session',
          status: 'upcoming',
          destination: '/(tabs)/more/planner',
        });
      }
    }

    return items.slice(0, 4);
  }, [todayQuery.data, pathsQuery.data]);
}
