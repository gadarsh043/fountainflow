import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UsePipes,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/clerk.guard';
import {
  CreateProjectSchema,
  type CreateProjectDto,
  type ProjectResponse,
} from './dto/create-project.dto';
import {
  UpdateProjectSchema,
  type UpdateProjectDto,
} from './dto/update-project.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('projects')
export class ProjectsController {
  private readonly logger = new Logger(ProjectsController.name);

  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * POST /projects
   * Create a new fountain choreography project
   */
  @Post()
  @UsePipes(new ZodValidationPipe(CreateProjectSchema))
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    this.logger.log(`POST /projects by user ${user.userId}`);
    return this.projectsService.create(dto, user);
  }

  /**
   * GET /projects
   * List all projects for the authenticated user (or org)
   */
  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse[]> {
    this.logger.log(`GET /projects by user ${user.userId}`);
    return this.projectsService.findAll(user);
  }

  /**
   * GET /projects/:id
   * Get a specific project by ID
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    this.logger.log(`GET /projects/${id} by user ${user.userId}`);
    return this.projectsService.findOne(id, user);
  }

  /**
   * PUT /projects/:id
   * Update a project's configuration or metadata
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema)) dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponse> {
    this.logger.log(`PUT /projects/${id} by user ${user.userId}`);
    return this.projectsService.update(id, dto, user);
  }

  /**
   * DELETE /projects/:id
   * Delete a project (and cascade-delete its jobs)
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    this.logger.log(`DELETE /projects/${id} by user ${user.userId}`);
    return this.projectsService.remove(id, user);
  }
}
