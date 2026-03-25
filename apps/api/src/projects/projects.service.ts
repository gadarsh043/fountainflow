import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/clerk.guard';
import type {
  CreateProjectDto,
  FountainConfig,
  ProjectResponse,
} from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateProjectDto,
    user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    this.logger.log(`Creating project "${dto.name}" for user ${user.userId}`);

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        user_id: user.userId,
        org_id: user.orgId,
        fountain_config: dto.fountain_config as unknown as Prisma.JsonObject,
        status: 'draft',
      },
    });

    this.logger.log(`Project created: ${project.id}`);
    return this.mapToResponse(project);
  }

  async findAll(user: AuthenticatedUser): Promise<ProjectResponse[]> {
    this.logger.log(`Listing projects for user ${user.userId}`);

    // Build query: user's own projects OR org-level projects if user has org
    const whereClause: Prisma.ProjectWhereInput = user.orgId
      ? {
          OR: [{ user_id: user.userId }, { org_id: user.orgId }],
        }
      : { user_id: user.userId };

    const projects = await this.prisma.project.findMany({
      where: whereClause,
      orderBy: { updated_at: 'desc' },
    });

    return projects.map((p) => this.mapToResponse(p));
  }

  async findOne(id: string, user: AuthenticatedUser): Promise<ProjectResponse> {
    this.logger.log(`Fetching project ${id} for user ${user.userId}`);

    const project = await this.prisma.project.findUnique({ where: { id } });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    this.assertAccess(project, user);

    return this.mapToResponse(project);
  }

  async update(
    id: string,
    dto: UpdateProjectDto,
    user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    this.logger.log(`Updating project ${id} for user ${user.userId}`);

    const project = await this.prisma.project.findUnique({ where: { id } });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    // Only the project owner can update
    if (project.user_id !== user.userId) {
      throw new ForbiddenException('Only the project owner can update it');
    }

    // Prevent editing archived or processing projects
    if (project.status === 'archived') {
      throw new BadRequestException('Cannot update an archived project');
    }

    const updateData: Prisma.ProjectUpdateInput = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.fountain_config !== undefined) {
      updateData.fountain_config =
        dto.fountain_config as unknown as Prisma.JsonObject;
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Project ${id} updated`);
    return this.mapToResponse(updated);
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    this.logger.log(`Deleting project ${id} for user ${user.userId}`);

    const project = await this.prisma.project.findUnique({ where: { id } });

    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    // Only the project owner can delete
    if (project.user_id !== user.userId) {
      throw new ForbiddenException('Only the project owner can delete it');
    }

    // Delete will cascade-delete related jobs due to schema relationship
    await this.prisma.project.delete({ where: { id } });

    this.logger.log(`Project ${id} deleted`);
  }

  private assertAccess(
    project: { user_id: string; org_id: string | null },
    user: AuthenticatedUser,
  ): void {
    const isOwner = project.user_id === user.userId;
    const isOrgMember =
      user.orgId !== null &&
      project.org_id !== null &&
      project.org_id === user.orgId;

    if (!isOwner && !isOrgMember) {
      throw new ForbiddenException('Access denied to this project');
    }
  }

  private mapToResponse(project: {
    id: string;
    name: string;
    user_id: string;
    org_id: string | null;
    status: string;
    fountain_config: Prisma.JsonValue;
    created_at: Date;
    updated_at: Date;
  }): ProjectResponse {
    return {
      id: project.id,
      name: project.name,
      user_id: project.user_id,
      org_id: project.org_id,
      status: project.status,
      fountain_config: project.fountain_config as unknown as FountainConfig,
      created_at: project.created_at,
      updated_at: project.updated_at,
    };
  }
}
