'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import {
  Plus,
  Waves,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Music,
  ArrowRight,
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: Clock, color: 'text-muted-foreground' },
  processing: { label: 'Processing', icon: Loader2, color: 'text-fountain-400 animate-spin' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-400' },
  failed: { label: 'Failed', icon: AlertCircle, color: 'text-red-400' },
} as const;

export default function DashboardPage() {
  const { user } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = (await res.json()) as { projects: Project[] };
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {user?.firstName ?? 'there'}
          </h1>
          <p className="text-muted-foreground mt-1">
            Your fountain choreography projects
          </p>
        </div>
        <Link
          href="/project/new"
          className="flex items-center gap-2 rounded-lg bg-fountain-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-fountain-400 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Link>
      </div>

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-fountain-400" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => { void fetchProjects(); }}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Try again
          </button>
        </div>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const status = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.draft;
  const StatusIcon = status.icon;

  return (
    <Link
      href={`/project/${project.id}`}
      className="group glass rounded-xl p-5 hover:border-fountain-500/40 transition-all hover:glow-blue-sm block"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="h-10 w-10 rounded-lg bg-fountain-500/15 flex items-center justify-center">
          <Waves className="h-5 w-5 text-fountain-400" />
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <StatusIcon className={`h-3.5 w-3.5 ${status.color}`} />
          <span className={status.color}>{status.label}</span>
        </div>
      </div>

      <h3 className="font-semibold mb-1 group-hover:text-fountain-400 transition-colors">
        {project.name}
      </h3>
      <p className="text-xs text-muted-foreground">
        Updated {new Date(project.updated_at).toLocaleDateString()}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {new Date(project.created_at).toLocaleDateString()}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-fountain-400 group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 h-20 w-20 rounded-full bg-fountain-500/10 flex items-center justify-center">
        <Music className="h-10 w-10 text-fountain-400" />
      </div>
      <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
      <p className="text-muted-foreground max-w-sm mb-8">
        Create your first fountain choreography project. Upload a song, configure your hardware,
        and get downloadable control code.
      </p>
      <Link
        href="/project/new"
        className="flex items-center gap-2 rounded-lg bg-fountain-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-fountain-400 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Create First Project
      </Link>
    </div>
  );
}
